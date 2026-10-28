-- JOUÉ le 28/10 ~23:08 (demande de Nico, même trou que Sébastien) : 2 republications Beebs dont la SUPPRESSION EST
-- PARTIE mais jamais prouvée, restées à l'étape « captured » :
--   recrutementgroupezk704 1a323b66 « Jean Levi's vintage 514 W34 L32 FR44 … J150 », annonce 34165538, suppression 26/10 09:12 ;
--   boncoin59300 ccbe94e3 « Vtech réveil Kidi Magic Color Show », annonce 17700749, suppression 28/10 20:46.
-- CONSTAT au navigateur (28/10 ~23:05) : les deux pages publiques en 404, aucune achetable. GARDE-FOU DOUBLON : dressings
--   publics relus en entier (285 et 1 096 annonces) — aucune copie (seul « Levi's 514 W34 L32 » en ligne : 34078467,
--   référence J157, autre fiche 1789120439844005 = autre exemplaire) ; aucun « Kidi Magic Color Show ».
-- Même geste que 20261028_sebastien_republications_beebs.sql : étape deleted (la recréation part au prochain passage du
-- poste, contrôle « recréation déjà partie » compris), publication d'origine close. Articles en stock (garde).
-- Inverse : 20261028_beebs_suppression_envoyee_2_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2810_beebs_supp_envoyee_2 AS
  SELECT now() AS sauvegarde_le, NULL::text AS role, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2810_beebs_supp_envoyee_2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2810_beebs_supp_envoyee_2 FROM PUBLIC, anon, authenticated;

-- Le constat au navigateur (à amender) : job de republication → numéro constaté hors ligne.
CREATE TEMPORARY TABLE _constat (job uuid PRIMARY KEY, numero text NOT NULL) ON COMMIT DROP;
INSERT INTO _constat (job, numero) VALUES
  ('1a323b66-a2a2-4070-b4b6-261ce7bb3ce5', '34165538'),
  ('ccbe94e3-89c0-4815-8267-62367a49a055', '17700749');

-- Les jobs exacts, relus juste avant (même compte, même numéro, toujours « suppression envoyée, non prouvée »).
CREATE TEMPORARY TABLE _cibles ON COMMIT DROP AS
SELECT c.id, k.numero, c.listing_url, c.platform_fields->>'republish_source_job_id' AS source_id
  FROM public.cross_post_jobs c JOIN _constat k ON k.job = c.id
 WHERE c.user_id IN ('7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28', '3f91c02e-3abc-4e08-8c46-b2232005b10e') AND c.platform = 'beebs' AND c.action = 'republish'
   AND c.status = 'pending' AND c.platform_fields->>'republish_step' = 'captured'
   AND c.platform_fields ? 'republish_suppression_envoyee'
   AND btrim(c.platform_listing_id) = k.numero
   AND c.platform_fields->'republish_snapshot' IS NOT NULL
   -- (garde ajoutée) jamais une recréation d'un article qui n'est plus à vendre
   AND EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = c.inventaire_id AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL);

INSERT INTO public._backup_2810_beebs_supp_envoyee_2
SELECT now(), 'republication', c.* FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _cibles);
INSERT INTO public._backup_2810_beebs_supp_envoyee_2
SELECT now(), 'publication_d_origine', s.* FROM public.cross_post_jobs s JOIN _cibles t ON s.id::text = t.source_id
 WHERE s.status = 'published' AND btrim(s.platform_listing_id) = t.numero;

UPDATE public.cross_post_jobs c SET
  error = NULL, listing_url = NULL, platform_listing_id = NULL,
  platform_fields = (c.platform_fields - ARRAY['processing_since','needsUserAttempts','next_action_after','error_technique',
                                               'needs_user_source','retenue_hors_ligne'])
    || jsonb_build_object(
      'republish_step', 'deleted',
      'deleted_at', now(),
      'old_listing_url', t.listing_url,
      'old_platform_listing_id', t.numero,
      'republish_retrait', jsonb_build_object('at', now(), 'confirme_par', 'constat_navigateur',
          'trace', jsonb_build_array('réparation 28/10 : page Beebs ' || t.numero || ' constatée hors ligne au navigateur (28/10 ~23:05, 404) ; suppression envoyée le '
                                     || coalesce(c.platform_fields#>>'{republish_suppression_envoyee,at}', '?'))),
      'preuve_retrait', jsonb_build_object('source', 'constat_navigateur', 'numero', t.numero, 'moment', 'deja_absente',
          'lu_le', now(), 'par', 'réparation 28/10 sur ordre de Nico (scripts/reparations)'),
      'erreurs_archivees', (
        SELECT coalesce(jsonb_agg(e ORDER BY o), '[]'::jsonb) FROM (
          SELECT e, o FROM jsonb_array_elements(
              coalesce(c.platform_fields->'erreurs_archivees', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'pending', 'erreur', left(coalesce(c.error, ''), 600),
                                                      'par', 'réparation 28/10 (suppression constatée au navigateur)'))
            ) WITH ORDINALITY x(e, o)
          ORDER BY o DESC LIMIT 20) d))
  FROM _cibles t
 WHERE c.id = t.id AND c.status = 'pending' AND c.platform_fields->>'republish_step' = 'captured';

UPDATE public.cross_post_jobs s SET
  status = 'cancelled',
  error = 'Annonce en cours de republication sur Beebs (retirée puis redéposée pour remonter dans le fil) — pas une vente',
  platform_fields = (s.platform_fields - ARRAY['unavailable_since','sale_signal','detected_price','unavailable_pending_since'])
    || jsonb_build_object('republished_pending', true)
  FROM _cibles t
 WHERE s.id::text = t.source_id AND s.status = 'published' AND btrim(s.platform_listing_id) = t.numero;

-- Contrôle avant COMMIT : 15 republications « deleted », 15 publications d'origine closes (moins les lignes retirées).
SELECT (SELECT count(*) FROM public.cross_post_jobs WHERE id IN (SELECT id FROM _cibles) AND platform_fields->>'republish_step' = 'deleted') AS republications_deleted,
       (SELECT count(*) FROM public._backup_2810_beebs_supp_envoyee_2 WHERE role = 'publication_d_origine') AS origines_closes;
COMMIT;

