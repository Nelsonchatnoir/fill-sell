-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- JOUÉ le 28/10 ~22:15 (mission de Nico « débloquer tous les utilisateurs »). Point 9 (sebastien64310, 48dd94f7) : 15 republications Beebs dont la SUPPRESSION EST PARTIE
-- (republish_suppression_envoyee : 9 le 26/10 de 08:27 à 12:27, 6 le 28/10 de 10:51 à 14:25, heure de Paris) mais
-- jamais prouvée (page de l'annonce sans bouton, « Mes annonces » illisible) : annonces hors ligne, aucune remise en ligne.
--
-- ⛔ PRÉ-REQUIS, dans cet ordre :
--   1. FAIT le 28/10 ~22:02 (terminal principal) : les 15 pages rendent 404, aucune achetable. Constat au navigateur, numéro par numéro : https://www.beebs.app/fr/p/<numéro> rend « 404 - Oups, page perdue ! »
--      ou une page « Vendu » sans « Ajouter au panier ». UNE page achetable (200, panier) = retirer sa ligne de _constat.
--   2. Feu vert nommé de Nico (correction de données = script dans scripts/reparations/, sauvegarde, inverse).
--   3. De préférence APRÈS le déploiement des correctifs (point9.patch serveur + point10.patch extension) : sans eux,
--      l'extension ne prouve toujours rien ; avec eux, ce script n'est même plus nécessaire (le circuit prouve seul).
-- CE QUE ÇA FAIT (même état que l'extension après une suppression prouvée, background.js « RETIRÉE : étape actée ») :
--   republish_step = 'deleted' (la recréation part au passage suivant, depuis la copie republish_snapshot) ; ancienne
--   URL gardée (old_listing_url) ; preuve écrite = le constat au navigateur ; la publication d'origine close comme
--   cancelPublishAfterDelete (« Annonce en cours de republication … — pas une vente », republished_pending).
--   Aucune annonce touchée chez Beebs par ce script ; aucun mail ; erreurs_archivees conservées (+1 entrée).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2810_sebastien_republications_beebs AS
  SELECT now() AS sauvegarde_le, NULL::text AS role, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2810_sebastien_republications_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2810_sebastien_republications_beebs FROM PUBLIC, anon, authenticated;

-- Le constat au navigateur (à amender) : job de republication → numéro constaté hors ligne.
CREATE TEMPORARY TABLE _constat (job uuid PRIMARY KEY, numero text NOT NULL) ON COMMIT DROP;
INSERT INTO _constat (job, numero) VALUES
  ('5421b23f-5c93-45b6-926d-aa6afc858a2e', '34207184'),
  ('7486879a-5a60-4767-b3cc-9be4495b6c3e', '34207198'),
  ('04d9a5ce-e5d7-40f8-9ccc-8d138cc13cde', '34207215'),
  ('3c41256e-612f-4a1a-935c-70e4cb15299c', '34207221'),
  ('1d0a0237-ad74-4bc6-a250-0af59af8751b', '34201174'),
  ('a125d157-ef32-4114-a929-0fd589b6ab3b', '34207241'),
  ('2c45ff9c-cb9f-4a39-b7e4-65fa3e6f2823', '34207249'),
  ('e39f4f57-128e-42dd-be57-f1b7b0ff13bb', '34207271'),
  ('c11e452a-6700-41a7-a0db-e41ffa0a2c74', '34201182'),
  ('83841fe6-4ecd-464c-8ddb-6c9b34f49afe', '34220081'),
  ('7c4d28e5-4938-4521-9d7e-d9af075ac8bf', '34201205'),
  ('b9935705-5ede-4de1-a8a6-565fbb52133c', '34207317'),
  ('26f62eca-0f72-4f78-b309-528ab7f58b8f', '34220093'),
  ('6f630346-13ca-4e6d-a6c4-bcc60cb7cb8d', '34220117'),
  ('d25c3a8f-6a2b-4bc9-9584-317cec65dc5d', '34220129');

-- Les jobs exacts, relus juste avant (même compte, même numéro, toujours « suppression envoyée, non prouvée »).
CREATE TEMPORARY TABLE _cibles ON COMMIT DROP AS
SELECT c.id, k.numero, c.listing_url, c.platform_fields->>'republish_source_job_id' AS source_id
  FROM public.cross_post_jobs c JOIN _constat k ON k.job = c.id
 WHERE c.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' AND c.platform = 'beebs' AND c.action = 'republish'
   AND c.status = 'pending' AND c.platform_fields->>'republish_step' = 'captured'
   AND c.platform_fields ? 'republish_suppression_envoyee'
   AND btrim(c.platform_listing_id) = k.numero
   AND c.platform_fields->'republish_snapshot' IS NOT NULL
   -- (garde ajoutée) jamais une recréation d'un article qui n'est plus à vendre
   AND EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = c.inventaire_id AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL);

INSERT INTO public._backup_2810_sebastien_republications_beebs
SELECT now(), 'republication', c.* FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _cibles);
INSERT INTO public._backup_2810_sebastien_republications_beebs
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
          'trace', jsonb_build_array('réparation 28/10 : page Beebs ' || t.numero || ' constatée hors ligne au navigateur (28/10 ~22:02, 404) ; suppression envoyée le '
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
       (SELECT count(*) FROM public._backup_2810_sebastien_republications_beebs WHERE role = 'publication_d_origine') AS origines_closes;
COMMIT;

