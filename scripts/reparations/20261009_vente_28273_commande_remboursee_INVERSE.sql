-- INVERSE de 20261009_vente_28273_commande_remboursee.sql : recrée la vente 28273 à
-- l'identique (même identifiant, sans déclencheurs : aucune note de vente) et retire sa
-- trace de ventes_supprimees (sinon le relevé ne la reverrait jamais). La pause de la
-- règle n'est PAS remise (décision distincte).
-- npx supabase db query --linked -f scripts/reparations/20261009_vente_28273_commande_remboursee_INVERSE.sql
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO ventes
SELECT r.* FROM _backup_0910_vente_28273 b, jsonb_populate_record(NULL::ventes, b.ligne) r
 WHERE b.k = 'vente' AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.id = r.id);
DELETE FROM ventes_supprimees WHERE vente_id = 28273 AND source = 'releve_ebay';
SET LOCAL session_replication_role = origin;
COMMIT;
