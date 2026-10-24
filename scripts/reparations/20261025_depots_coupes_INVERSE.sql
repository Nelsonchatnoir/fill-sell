-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE 25/10 nuit — remet les questions « peut-être déjà partie » sauvegardées (_backup_2510_depots_coupes) dans
-- leur état d'avant la règle « dépôt coupé tranché au relevé », SEULEMENT pour les jobs que l'extension n'a pas encore
-- repris (statut encore « pending » posé par la relance, sans essai depuis) ou rattachés par la règle (published par
-- handler-watch, preuve tracée). Un job déjà repris par l'extension n'est jamais touché (le geste a eu lieu).
-- À lancer seulement si la règle s'est trompée ; essai à blanc : remplacer COMMIT par ROLLBACK. Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
WITH cibles AS (
  SELECT b.* FROM public._backup_2510_depots_coupes b
  JOIN public.cross_post_jobs c ON c.id = b.id
  WHERE (c.status = 'pending' AND c.platform_fields ? 'relance_depot_coupe'
         AND NOT (COALESCE(c.platform_fields->'work_window_state'->'at_start'->>'at', '') >
                  COALESCE(c.platform_fields->'relance_depot_coupe'->>'le', '')))
     OR (c.status = 'published' AND (c.platform_fields ? 'rattachement_recreation' OR c.platform_fields ? 'lien_par_photos')
         AND COALESCE(c.platform_fields->'rattachement_recreation'->>'pose_par', c.platform_fields->'lien_par_photos'->>'at', '') <> ''
         AND c.published_at > '2026-10-25 00:00+02')
)
UPDATE public.cross_post_jobs c
   SET status = t.status, error = t.error, platform_fields = t.platform_fields,
       platform_listing_id = t.platform_listing_id, listing_url = t.listing_url, published_at = t.published_at
  FROM cibles t
 WHERE c.id = t.id;
SELECT c.id, c.status, left(c.error, 80) AS erreur FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM public._backup_2510_depots_coupes);
COMMIT;
