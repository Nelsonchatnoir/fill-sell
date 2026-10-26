-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE (26/10, Julian Boissel — règle de Nico) — À LANCER APRÈS la migration 20261026171000 (feu vert)
-- ═══════════════════════════════════════════════════════════════════════════
-- Les comptes eBay reliés par l'API dont des annonces en ligne attendent une fiche (relevé « serveur:quotidien_api »,
-- refusé par l'ancienne règle) : leur rapprochement est relancé — LE MÊME moteur que « Synchroniser » décide (jamais un
-- titre seul, une annonce = une fiche). Comptes ACTIFS seulement (relevé de moins de 20 h) ; les comptes inactifs
-- (relevés du 14 au 25/10) restent une question pour Nico (relire d'abord, ou ne pas rattraper).
-- Sauvegarde : _backup_2610_import_ebay_api (ids des annonces orphelines au moment du rattrapage).
-- Inverse : scripts/reparations/20261026_import_ebay_api_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS _backup_2610_import_ebay_api AS
  SELECT a.id AS annonce_id, a.user_id, a.inventaire_id, a.run_id, now() AS sauvegarde_le
  FROM annonces_plateforme a JOIN vinted_sync_runs r ON r.id = a.run_id
  WHERE a.platform = 'ebay' AND a.inventaire_id IS NULL AND a.statut_plateforme = 'en_ligne'
    AND a.ignoree_le IS NULL AND a.disparu_le IS NULL AND a.fiche_supprimee_le IS NULL
    AND r.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine')
    AND a.vu_le > now() - interval '20 hours';
ALTER TABLE public._backup_2610_import_ebay_api ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_import_ebay_api FROM PUBLIC, anon, authenticated;
SELECT jsonb_build_object('comptes', count(DISTINCT user_id), 'annonces', count(*)) FROM _backup_2610_import_ebay_api;
SELECT public.rapprochement_demander(u.user_id, 'reparation:ebay_api'), public.rapprochement_relancer(u.user_id)
FROM (SELECT DISTINCT user_id FROM _backup_2610_import_ebay_api) u;
COMMIT;
