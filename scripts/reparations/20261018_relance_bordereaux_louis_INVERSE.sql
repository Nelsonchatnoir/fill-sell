-- Inverse de scripts/reparations/20261018_relance_bordereaux_louis.sql : retire les autorisations de relance
-- de Louis qui n'ont PAS encore servi. Une relance déjà déposée (consommee_le renseigné, relance_id) reste :
-- un geste parti chez Vinted ne se défait pas ; la demande de relance garde sa trace.
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_relance_bordereaux_louis_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DELETE FROM public.bordereaux_relances_autorisees
 WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
   AND demande_id IN ('e5e13793-ee9a-43e3-81e3-c584ca206d97', 'd2b070c8-191b-48c5-8d0a-990d4fce510d')
   AND consommee_le IS NULL;
SELECT a.demande_id, a.consommee_le, a.issue, a.relance_id FROM public.bordereaux_relances_autorisees a
 WHERE a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
DROP TABLE IF EXISTS public._backup_1810_relance_louis;
COMMIT;
