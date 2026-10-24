-- ═══════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE 25/10 nuit — avant le déploiement de handler-watch (règle « un dépôt ou une remise en ligne coupés se
-- tranchent au relevé », _shared/depot-coupe-tranche.js). Les questions « peut-être déjà partie » ouvertes
-- (recreation_deja_partie, depot_deja_parti) sont sauvegardées telles quelles : essai à blanc du 25/10 00:3x =
-- 6 relances (louis/Amiral : c7526556, 88db7e2e ; Ciddjy : 1819ed99, 23ef4d54, 5871f48a, 39b1a35e).
-- Aucune ligne modifiée ici. Inverse : 20261025_depots_coupes_INVERSE.sql. Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_depots_coupes AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_depots_coupes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_depots_coupes FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_depots_coupes
SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.status = 'needs_user' AND c.platform IN ('leboncoin', 'beebs')
   AND c.platform_fields->>'needs_user_source' IN ('recreation_deja_partie', 'depot_deja_parti')
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_depots_coupes b WHERE b.id = c.id);
SELECT b.id, b.platform, b.action, b.status, b.platform_fields->>'needs_user_source' AS source
  FROM public._backup_2510_depots_coupes b ORDER BY b.platform, b.id;
COMMIT;
