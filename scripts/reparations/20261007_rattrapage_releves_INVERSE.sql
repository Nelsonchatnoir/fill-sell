-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE du rattrapage du parc (20261007_rattrapage_releves.sql), 07/10/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Pour UN compte (décommenter les filtres) ou pour tous :
--   1. les fusions sûres sont DÉFAITES par la voie normale
--      (inventaire_defusionner_pour : chaque déplacement rendu, journalisé) ;
--   2. les articles « à vérifier » posés par le rattrapage reviennent au stock
--      affiché (le marqueur est retiré ; rien d'autre n'avait bougé) ;
--   3. les questions posées par le rattrapage sont closes « caduque » (jamais
--      supprimées), celles qu'il avait closes reprennent leur état d'avant
--      (_backup_0710_rattachement_doublons).
--   npx supabase db query --linked -f scripts/reparations/20261007_rattrapage_releves_INVERSE.sql
BEGIN;

-- 1. Les fusions du rattrapage, défaites (la plus récente d'abord).
SELECT f.id, inventaire_defusionner_pour(f.user_id, f.id, 'rattrapage_0710_inverse')
  FROM inventaire_fusions f
 WHERE f.par = 'utilisateur:photo_rattrapage_0710' AND f.defait_le IS NULL
   -- AND f.user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03'
 ORDER BY f.created_at DESC;

-- 2. Les articles « à vérifier » du rattrapage, rendus au stock affiché.
UPDATE inventaire SET a_verifier = NULL
 WHERE a_verifier ->> 'source' = 'rattrapage_0710'
   -- AND user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03'
;

-- 3. Les questions : celles posées par le rattrapage, closes ; celles qu'il a
--    closes, rendues.
UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rattrapage_0710_inverse'
 WHERE statut = 'proposee' AND preuves ->> 'rattrapage' = '0710'
   -- AND user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03'
;
UPDATE inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, fusion_id = b.fusion_id
  FROM (SELECT DISTINCT ON (id) * FROM _backup_0710_rattachement_doublons ORDER BY id) b
 WHERE d.id = b.id AND d.decide_par IN ('photo_rattrapage_0710', 'rattrapage_0710');

COMMIT;
