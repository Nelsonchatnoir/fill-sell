-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE DES COMPTES eBAY INACTIFS (26/10 soir, Julian Boissel — « Oui pour le rattrapage des 10 comptes
-- inactifs » de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de 20261026_import_ebay_api.sql (comptes actifs). Les comptes reliés par l'API que personne n'a ouverts depuis
-- 7 jours n'ont plus de relevé quotidien (bornage du 04/10) : leurs annonces orphelines datent du 13 au 25/10. Les
-- importer telles quelles ferait naître des fiches d'articles peut-être vendus depuis. Ici, un relevé NEUF est posé
-- pour chacun (« serveur:quotidien_api », le même que le cron) : ebay-releve-api relit eBay (lecture seule), le moteur
-- rattache et importe ce qui est EN LIGNE aujourd'hui (règle 20261026171000), un article absent n'est jamais importé.
-- Compte dont la connexion eBay est révoquée : rien (aucun relevé possible, rien d'ancien n'est importé).
-- Sauvegarde : _backup_2610_import_ebay_inactifs (annonces orphelines et relevé posé).
-- Inverse : scripts/reparations/20261026_releve_ebay_inactifs_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS _backup_2610_import_ebay_inactifs AS
  SELECT a.id AS annonce_id, a.user_id, a.inventaire_id, a.run_id, now() AS sauvegarde_le
  FROM annonces_plateforme a JOIN vinted_sync_runs r ON r.id = a.run_id
  WHERE a.platform = 'ebay' AND a.inventaire_id IS NULL AND a.statut_plateforme = 'en_ligne'
    AND a.ignoree_le IS NULL AND a.disparu_le IS NULL AND a.fiche_supprimee_le IS NULL
    AND r.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine')
    AND a.id NOT IN (SELECT annonce_id FROM _backup_2610_import_ebay_api)
    AND EXISTS (SELECT 1 FROM ebay_accounts e WHERE e.user_id = a.user_id AND e.revoked_at IS NULL)
    AND a.user_id NOT IN (SELECT user_id FROM public.comptes_actifs(7));
ALTER TABLE public._backup_2610_import_ebay_inactifs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_import_ebay_inactifs FROM PUBLIC, anon, authenticated;
SELECT jsonb_build_object('comptes', count(DISTINCT user_id), 'annonces', count(*)) FROM _backup_2610_import_ebay_inactifs;
-- Un relevé par compte, jamais deux en file (un relevé déjà en file ou en cours suffit).
INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
SELECT u.user_id, 'annonces', 'ebay', 'queued', 'serveur:quotidien_api', now()
FROM (SELECT DISTINCT user_id FROM _backup_2610_import_ebay_inactifs) u
WHERE NOT EXISTS (SELECT 1 FROM vinted_sync_runs v WHERE v.user_id = u.user_id AND v.platform = 'ebay'
                    AND v.kind = 'annonces' AND v.status IN ('queued', 'running'))
RETURNING user_id, id;
COMMIT;
