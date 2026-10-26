-- INVERSE de 20261026_releve_ebay_inactifs.sql : les relevés encore en file sont retirés ; les fiches NÉES du
-- rattrapage (origine « releve_ebay », créées après la sauvegarde, chez un compte sauvegardé — le relevé neuf peut
-- aussi importer une annonce mise en ligne depuis) sont retirées et leurs annonces redeviennent orphelines. Une fiche
-- modifiée depuis par la personne (vendue, publiée ailleurs) n'est jamais touchée : vérifier la liste AVANT (SELECT).
BEGIN;
SET LOCAL statement_timeout = '60s';
DELETE FROM vinted_sync_runs v USING (SELECT DISTINCT user_id, sauvegarde_le FROM _backup_2610_import_ebay_inactifs) b
WHERE v.user_id = b.user_id AND v.platform = 'ebay' AND v.kind = 'annonces' AND v.status = 'queued'
  AND v.declencheur = 'serveur:quotidien_api' AND v.queued_at BETWEEN b.sauvegarde_le AND b.sauvegarde_le + interval '1 minute';
CREATE TEMP TABLE nees ON COMMIT DROP AS
  SELECT i.id AS inventaire_id
  FROM inventaire i JOIN (SELECT DISTINCT user_id, sauvegarde_le FROM _backup_2610_import_ebay_inactifs) b ON b.user_id = i.user_id
  WHERE i.origine = 'releve_ebay' AND i.created_at >= b.sauvegarde_le AND i.statut = 'stock'
    AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform <> 'ebay');
UPDATE annonces_plateforme a SET inventaire_id = NULL FROM nees n WHERE a.inventaire_id = n.inventaire_id;
DELETE FROM inventaire i USING nees n WHERE i.id = n.inventaire_id;
COMMIT;
