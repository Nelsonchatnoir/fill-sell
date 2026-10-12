-- ═══════════════════════════════════════════════════════════════════════════
-- FERREIRASAB (18e461c1) : LE MOTEUR RÉPARÉ (rapprochement en tranches) REPREND LE COMPTE
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 12/10 09:31 UTC, le disjoncteur a arrêté le compte (trois passes de suite
-- tuées par la limite de CPU : passages = -3, bilan.arret « passes_inachevees »).
-- La fonction découpe désormais sa passe en tranches ; la règle du disjoncteur
-- dit « plus rien avant notre correctif (remettre passages à 0) ». Après le
-- rejugement des rattachements de Nico (20261012_ferreira_rattachements_nico_rejuges.sql)
-- et les deux simulations du serveur (même plan que le moteur local), on :
--   1. sauvegarde la ligne rapprochement_comptes ;
--   2. remet le compteur à 0 (seulement s'il vaut encore -3) ;
--   3. redemande une passe (rapprochement_demander) et la lance (rapprochement_relancer).
-- Rien n'est retiré, vendu ni notifié par ce script ; la passe écrit ses décisions
-- par rapprochement_v3_appliquer (gardes de la base).
-- Inverse (la ligne d'état seulement ; les décisions écrites par la passe ne
-- se défont pas ici) :
--   UPDATE rapprochement_comptes c SET etat = b.etat, passages = b.passages, bilan = b.bilan, demande_le = b.demande_le,
--          debut_le = b.debut_le, fin_le = b.fin_le, relance_le = b.relance_le, maj_le = now()
--     FROM _backup_1210_ferreira_rapprochement_compte b WHERE b.user_id = c.user_id;

BEGIN;
CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_rapprochement_compte AS
  SELECT now() sauve_le, c.* FROM rapprochement_comptes c WHERE c.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948';
ALTER TABLE _backup_1210_ferreira_rapprochement_compte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _backup_1210_ferreira_rapprochement_compte FROM anon, authenticated;

UPDATE rapprochement_comptes SET passages = 0, maj_le = now()
 WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND passages = -3;
DO $$
BEGIN
  IF (SELECT passages FROM rapprochement_comptes WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948') <> 0 THEN
    RAISE EXCEPTION 'compteur de passes inattendu';
  END IF;
END $$;
SELECT rapprochement_demander('18e461c1-7107-4f40-b07f-6de8fb5c2948', 'rejuge_1210_moteur_en_tranches');
SELECT rapprochement_relancer('18e461c1-7107-4f40-b07f-6de8fb5c2948');
COMMIT;
