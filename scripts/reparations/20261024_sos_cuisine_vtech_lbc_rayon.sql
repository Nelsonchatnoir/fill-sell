-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 nuit (décision 4 de Nico) — sos.cuisine.valenciennes : l'annonce Leboncoin 3294575199 (« VTech Switch
-- & Go Dinos Rotor le Vélociraptor dinosaure transformable », job 0f13432b) est en « Électronique > Jeux vidéo » : même
-- confusion « switch » / console que sur eBay. Règle corrigée pour tous (src/utils/shared.js, jeuxVideo.js : « Switch &
-- Go » = jouet 🦸 → Leboncoin « Loisirs > Jeux & Jouets » ; selftest lot-2410-soir).
-- Leboncoin ne change pas la catégorie d'une annonce en ligne : elle est REPUBLIÉE dans le bon rayon, sans geste de la
-- vendeuse — un job de republication comme celui du bouton de l'app (même copie que spend_coins_and_republish :
-- capture, retrait, recréation), HORS QUOTA (0 pépite débitée). Rayon : celui que la règle donne ; critères du rayon
-- « Jeux vidéo » retirés (console_brand) ; « Type de jouet » laissé au pré-rempli de Leboncoin (jamais deviné).
-- Garde : aucun autre job Leboncoin vivant pour cette fiche, l'annonce source toujours « published ».
-- Sauvegarde : rien n'est modifié (un job AJOUTÉ) ; inverse : 20261024_sos_cuisine_vtech_lbc_rayon_INVERSE.sql (retire le
-- job tant qu'il n'a pas commencé). Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = 1792837464698008 AND x.platform = 'leboncoin'
               AND x.status IN ('pending', 'processing', 'needs_user')) THEN
    RAISE EXCEPTION 'un job Leboncoin vivant existe déjà pour cette fiche — rien n''est fait';
  END IF;
  INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                      title, description, price, photos, listing_url, platform_listing_id, platform_fields)
  SELECT j.user_id, j.inventaire_id, 'leboncoin', 'republish', 'pending', coalesce(j.photo_option, 'original'),
         j.title, j.description, j.price, j.photos, j.listing_url, j.platform_listing_id,
         (j.platform_fields
            - ARRAY['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
                    'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
                    'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
                    'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
                    'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
                    'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
                    'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
                    'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
                    'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
                    'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
                    'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
                    'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
                    'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel',
                    'categorie_par_mot', 'listing_url_recovery', 'unfilled_required_fields', 'warnings'])
         || jsonb_build_object(
              'lbcCategoryPath', jsonb_build_array('Loisirs', 'Jeux & Jouets'),
              'lbcAspects', coalesce(j.platform_fields -> 'lbcAspects', '{}'::jsonb) - 'console_brand',
              'categorie_icone', '🦸',
              'categorie_mot_cle_titre', 'switch & go',
              'categorie_source', 'reparation_switch_and_go',
              'categorie_reparee', jsonb_build_object('le', now(), 'par', 'Claude — 24/10 nuit (décision 4 de Nico)',
                  'pose_par', 'scripts/reparations/20261024_sos_cuisine_vtech_lbc_rayon.sql',
                  'avant', jsonb_build_object('lbcCategoryPath', j.platform_fields -> 'lbcCategoryPath', 'lbcAspects', j.platform_fields -> 'lbcAspects'),
                  'regle', '« Switch & Go » = gamme de jouets VTech, jamais la console (shared.js, jeuxVideo.js)'),
              'republish_step', 'a_capturer',
              'republish_source', 'manuel',
              'republish_platform', 'leboncoin',
              'republish_source_job_id', j.id,
              'pepites_debitees', 0,
              'hors_quota', jsonb_build_object('motif', 'remise dans le bon rayon (support, décision de Nico)', 'le', now()),
              'republish_snapshot', jsonb_build_object('version', 2, 'plateforme', 'leboncoin', 'source_job_id', j.id,
                  'titre', j.title, 'prix', j.price, 'listing_url', j.listing_url, 'platform_listing_id', j.platform_listing_id,
                  'photos', jsonb_array_length(coalesce(j.photos, '[]'::jsonb)), 'captured_at', now()))
    FROM public.cross_post_jobs j
   WHERE j.id = '0f13432b-7650-41fb-8401-ce6d78b6fe1c' AND j.status = 'published' AND j.platform = 'leboncoin'
     AND j.platform_listing_id = '3294575199' AND j.platform_fields -> 'lbcCategoryPath' = '["Électronique", "Jeux vidéo"]'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job de republication, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.action, c.platform_fields -> 'lbcCategoryPath' AS rayon, c.platform_fields ->> 'pepites_debitees' AS pepites,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c
 WHERE c.inventaire_id = 1792837464698008 AND c.platform = 'leboncoin' AND c.action = 'republish' AND c.created_at > now() - interval '1 minute';
COMMIT;
