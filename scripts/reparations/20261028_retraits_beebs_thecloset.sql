-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- JOUÉ le 28/10 ~22:20 (mission de Nico ; constat navigateur ~22:02 : les 11 pages en 404, aucune achetable). Point 10 : retraits Beebs « page sans bouton Supprimer, Mes annonces illisible ».
--
-- 0. RELANCE : AUCUNE UTILE. Les 21 retraits sont `pending` et repartent seuls (pas-de-rouge : reprise 10 min → 3 h,
--    jamais arrêtés). Remettre needsUserAttempts / next_action_after à zéro ne change rien : le même essai rate de la
--    même façon tant que l'extension n'a pas le correctif (point10.patch). Aucun n'est un needs_user volontaire.
--
-- 1. CLÔTURE PAR LA RÈGLE DU 25/10 (« un retrait sur une annonce déjà absente est un retrait fait »), POUR LES 11
--    RETRAITS DE thecloset72000 SEULEMENT, où la base porte déjà les trois preuves exigées pour Beebs :
--      · deux constats « page 404 » de l'extension à 6 h d'écart au moins (lecture_etat_retrait http 404 + message
--        « Beebs ne montre plus cette annonce : sa page est introuvable » archivé ; écarts 6,2 à 15,7 h le 28/10) ;
--      · « en vérification » lue EN ENTIER sans elle après le premier constat (lecture par cadre du 28/10 20:38, 0 carte) ;
--      · vue en ligne avant (relevé du compte : 25/10 23:43 pour 7, 26/10 01:36, 27/10 13:33, 28/10 10:14, 28/10 12:32).
--    Écart à la règle écrite : les constats viennent de la lecture du BACKGROUND (fetchListingHtml), pas de celle de
--    beebs.js, et ne sont pas rangés dans beebs_404_constats → décision de Nico. Après constat au navigateur (chaque
--    https://www.beebs.app/fr/p/<numéro> en 404), feu vert nommé, script dans scripts/reparations/ + INVERSE.
--    ⛔ Hors champ : louis-seller (aucune lecture complète de « en vérification » depuis le 26/10 ; ce6bbde3 : 5,6 h),
--    recrutementgroupezk704 53cff028 (le relevé la voit EN VÉRIFICATION le 28/10 12:13 : elle peut encore apparaître),
--    sebastien64310 cfed66ca et les 5 de xxewwer (jamais vues en ligne : la garde de 7 jours les tranche seule).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2810_retraits_beebs_thecloset AS
  SELECT now() AS sauvegarde_le, NULL::text AS role, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2810_retraits_beebs_thecloset ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2810_retraits_beebs_thecloset FROM PUBLIC, anon, authenticated;

CREATE TEMPORARY TABLE _constat (job uuid PRIMARY KEY, numero text NOT NULL) ON COMMIT DROP;
INSERT INTO _constat (job, numero)
SELECT c.id, btrim(c.platform_listing_id) FROM public.cross_post_jobs c
 WHERE c.user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a' AND c.platform = 'beebs' AND c.action = 'delete' AND c.status = 'pending'
   AND left(c.id::text, 8) IN ('d3aaf6da','9606ed1b','98f866ca','4cf5983f','fbed61b5','5687dbad','d7f97725','926fe80e','f25902e1','b9e5fa43','69c2e31c');

-- Gardes, relues juste avant : 404 frais, aucun constat « en ligne » depuis, jamais une preuve de vente Beebs.
CREATE TEMPORARY TABLE _cibles ON COMMIT DROP AS
SELECT c.id, k.numero, c.inventaire_id, c.user_id
  FROM public.cross_post_jobs c JOIN _constat k ON k.job = c.id
 WHERE c.platform_fields#>>'{lecture_etat_retrait,http}' = '404'
   AND (c.platform_fields#>>'{lecture_etat_retrait,lu_le}')::timestamptz > now() - interval '6 hours'
   AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = c.user_id AND a.platform = 'beebs'
                    AND a.listing_id = k.numero AND a.statut_plateforme = 'en_ligne' AND a.vu_le > now() - interval '12 hours');

INSERT INTO public._backup_2810_retraits_beebs_thecloset SELECT now(), 'retrait', c.* FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _cibles);
INSERT INTO public._backup_2810_retraits_beebs_thecloset
SELECT now(), 'copie_publiee', p.* FROM public.cross_post_jobs p JOIN _cibles t
    ON p.user_id = t.user_id AND p.platform = 'beebs' AND p.status = 'published' AND p.action IN ('publish','republish')
   AND p.inventaire_id IS NOT DISTINCT FROM t.inventaire_id AND btrim(p.platform_listing_id) = t.numero
 WHERE coalesce(p.platform_fields->>'sale_signal', '') <> 'sold';

UPDATE public.cross_post_jobs c SET
  status = 'deleted', error = NULL,
  platform_fields = (c.platform_fields - ARRAY['processing_since','needsUserAttempts','next_action_after','error_technique',
                                               'pas_de_rouge','beebs_en_moderation','retrait_attente_second_constat'])
    || jsonb_build_object(
      'deja_absente', jsonb_build_object('le', now(), 'plateforme', 'beebs', 'numero', t.numero, 'vente', NULL,
          'pose_par', 'réparation 28/10 (règle du 25/10, constats du background)',
          'preuve', jsonb_build_object('source', 'deux_constats_404_background', 'regle', 'deux_constats_404',
              'en_verification', 'complete (lecture du 28/10 20:38, 0 carte)', 'vue_en_ligne', true,
              'derniere_lecture', c.platform_fields->'lecture_etat_retrait')),
      'retrait_par', 'annonce_deja_hors_ligne',
      'delete_confirmed_by', 'deux_constats_404',
      'erreurs_archivees', (
        SELECT coalesce(jsonb_agg(e ORDER BY o), '[]'::jsonb) FROM (
          SELECT e, o FROM jsonb_array_elements(
              coalesce(c.platform_fields->'erreurs_archivees', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'pending', 'erreur', left(coalesce(c.error, ''), 600),
                                                      'par', 'réparation 28/10 (retrait déjà absent)'))
            ) WITH ORDINALITY x(e, o)
          ORDER BY o DESC LIMIT 20) d))
  FROM _cibles t WHERE c.id = t.id AND c.status = 'pending';

UPDATE public.cross_post_jobs p SET
  status = 'cancelled', error = 'Annonce retirée par le vendeur (retrait ciblé depuis l''app) — pas une vente',
  platform_fields = (p.platform_fields - ARRAY['unavailable_since','unavailable_pending_since','sale_signal','detected_price'])
    || jsonb_build_object('removed_by_user', true,
         'close_par_retrait_deja_absent', jsonb_build_object('le', now(), 'retrait', t.id, 'annonce', t.numero))
  FROM _cibles t
 WHERE p.user_id = t.user_id AND p.platform = 'beebs' AND p.status = 'published' AND p.action IN ('publish','republish')
   AND p.inventaire_id IS NOT DISTINCT FROM t.inventaire_id AND btrim(p.platform_listing_id) = t.numero
   AND coalesce(p.platform_fields->>'sale_signal', '') <> 'sold';

SELECT role, count(*) FROM public._backup_2810_retraits_beebs_thecloset GROUP BY 1;  -- attendu : retrait 11, copie_publiee ≤ 11
COMMIT;

