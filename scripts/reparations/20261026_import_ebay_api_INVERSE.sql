-- INVERSE de 20261026_import_ebay_api.sql : les fiches NÉES du rattrapage (import du moteur v3 sur une annonce
-- sauvegardée, après la sauvegarde) sont retirées et l'annonce redevient orpheline. Une fiche modifiée depuis par la
-- personne (vendue, publiée ailleurs) n'est jamais touchée : vérifier la liste AVANT (SELECT) puis lancer.
BEGIN;
SET LOCAL statement_timeout = '60s';
WITH nees AS (
  SELECT a.id AS annonce_id, a.inventaire_id
  FROM annonces_plateforme a JOIN _backup_2610_import_ebay_api b ON b.annonce_id = a.id
  JOIN inventaire i ON i.id = a.inventaire_id
  WHERE b.inventaire_id IS NULL AND i.created_at >= b.sauvegarde_le AND i.statut = 'stock'
    AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform <> 'ebay')
)
, detache AS (UPDATE annonces_plateforme a SET inventaire_id = NULL FROM nees n WHERE a.id = n.annonce_id RETURNING n.inventaire_id)
DELETE FROM inventaire i USING detache d WHERE i.id = d.inventaire_id;
COMMIT;
