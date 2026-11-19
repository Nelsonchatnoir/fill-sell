-- ═══════════════════════════════════════════════════════════════════════════
-- 19/11/2026 — RELANCE du job eBay c1d8a3eb (compte 8fd44622), ordre de Nico : « relance TOI-MÊME le job eBay de 8fd44622
-- (sans attendre le client), et vérifie qu'il est publié ».
-- ═══════════════════════════════════════════════════════════════════════════
-- Le job a échoué « interrompu 3 fois » à cause de la régression CPU de 8f68590 (aspect-du-texte.js), corrigée par 84b3acf
-- (ebay-api-worker v139+) ; les reprises sont comptées depuis la dernière relance (ebay-api-reprises.js, v140).
-- Ce script fait EXACTEMENT ce que fait le bouton « Relancer » de l'app (src/tabs/StockTab.jsx, relance en place) :
-- statut repris, erreur archivée, budget de reprises rouvert, relances_manuelles + 1, derniere_relance_manuelle = maintenant.
-- Garde : le job est encore « failed » avec ce message ; sinon rien. Sauvegarde : public._backup_1911_relance_c1d8a3eb.
-- Inverse : 20261119_relance_c1d8a3eb_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1911_relance_c1d8a3eb AS
  SELECT id, status, error, platform_fields, now() AS sauve_le FROM public.cross_post_jobs
   WHERE id = 'c1d8a3eb-89e5-4415-a106-f866058a6a17';
ALTER TABLE public._backup_1911_relance_c1d8a3eb ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_relance_c1d8a3eb FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs j
   SET status = 'pending',
       error = NULL,
       platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb)
           - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
           - 'attente_session' - 'refus_passager')
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'relances_manuelles', COALESCE((j.platform_fields ->> 'relances_manuelles')::int, 0) + 1,
              'derniere_relance_manuelle', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'erreurs_archivees', COALESCE(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                     'statut', j.status, 'message', left(j.error, 300), 'par', 'relance_manuelle')))
 WHERE j.id = 'c1d8a3eb-89e5-4415-a106-f866058a6a17'
   AND j.status = 'failed'
   AND j.error LIKE 'Le traitement eBay s''est interrompu%';
SELECT id, status, platform_fields ->> 'relances_manuelles' AS relances, platform_fields ->> 'derniere_relance_manuelle' AS relance_le
  FROM public.cross_post_jobs WHERE id = 'c1d8a3eb-89e5-4415-a106-f866058a6a17';
COMMIT;
