-- ═══════════════════════════════════════════════════════════════════════════
-- FERREIRASAB (18e461c1) : LE MOTEUR RÉPARÉ REPREND LE COMPTE — DEUXIÈME RELANCE (lecture rangée)
-- ═══════════════════════════════════════════════════════════════════════════
-- (12/10, 11:30) Deuxième relance, même geste que 20261012_ferreira_relance_moteur.sql :
-- la première a écrit ses deux premières passes (699 rattachements, 532 + 141
-- « à vérifier », 146 « annonce en double », 53 créations, 0 erreur), puis le
-- disjoncteur a de nouveau arrêté le compte à 11:29:26 — la lecture n'avait pas
-- d'ordre garanti, la signature du chantier changeait d'une invocation à l'autre
-- (corrigé : passe.js, ordonner ; fonction v22). Le reste de l'en-tête vaut tel quel.
--
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
--     FROM _backup_1210_ferreira_rapprochement_compte_2 b WHERE b.user_id = c.user_id;

BEGIN;
CREATE TABLE IF NOT EXISTS _backup_1210_ferreira_rapprochement_compte_2 AS
  SELECT now() sauve_le, c.* FROM rapprochement_comptes c WHERE c.user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948';
ALTER TABLE _backup_1210_ferreira_rapprochement_compte_2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _backup_1210_ferreira_rapprochement_compte_2 FROM anon, authenticated;

UPDATE rapprochement_comptes SET passages = 0, maj_le = now()
 WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND passages = -3;
DO $$
BEGIN
  IF (SELECT passages FROM rapprochement_comptes WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948') <> 0 THEN
    RAISE EXCEPTION 'compteur de passes inattendu';
  END IF;
END $$;
SELECT rapprochement_demander('18e461c1-7107-4f40-b07f-6de8fb5c2948', 'rejuge_1210_moteur_lecture_rangee');
SELECT rapprochement_relancer('18e461c1-7107-4f40-b07f-6de8fb5c2948');
COMMIT;
