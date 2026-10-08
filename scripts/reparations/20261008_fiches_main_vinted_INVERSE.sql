-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de la règle « fiche à la main face à une fiche Vinted » (08/10/2026 soir)
-- ════════════════════════════════════════════════════════════════════════════
-- Pour UN compte (remplacer __USER__), après le rattrapage
-- (20261008_fiches_main_vinted.mjs --appliquer) ou après des passes v14 :
--   1. les fusions de la règle (par = 'utilisateur:photo_rapprochement_v3_main')
--      sont DÉFAITES par la voie normale (inventaire_defusionner_pour : la fiche
--      Vinted revient, son identité Vinted, ses jobs et ses champs repris lui
--      sont rendus, journalisé) ;
--   2. les marqueurs « à vérifier » posés par la règle sont retirés (la fiche
--      Vinted revient au stock), et les questions qu'elle a posées, encore sans
--      réponse, deviennent caduques ; celles d'avant reprennent l'état sauvegardé
--      (_backup_0810_fiches_main_doublons).
-- Une réponse que la personne a donnée depuis n'est JAMAIS défaite.
--   npx supabase db query --linked -f scripts/reparations/20261008_fiches_main_vinted_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '120s';

-- 1. Les fusions de la règle, défaites (la plus récente d'abord).
SELECT f.id, inventaire_defusionner_pour(f.user_id, f.id, 'fiches_main_inverse')
  FROM inventaire_fusions f
 WHERE f.par = 'utilisateur:photo_rapprochement_v3_main' AND f.defait_le IS NULL AND f.user_id = '__USER__'
 ORDER BY f.created_at DESC;

-- 2. Marqueurs et questions de la règle.
UPDATE inventaire i SET a_verifier = NULL
 WHERE i.user_id = '__USER__' AND i.a_verifier ->> 'source' = 'rapprochement_v3' AND i.a_verifier ->> 'platform' = 'vinted'
   AND NULLIF(i.a_verifier ->> 'annonce_id', '') IS NULL;
UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'fiches_main_inverse'
 WHERE user_id = '__USER__' AND statut = 'proposee' AND preuves ->> 'portee' = 'fiche_main';
WITH b AS (SELECT DISTINCT ON (id) * FROM _backup_0810_fiches_main_doublons WHERE user_id = '__USER__' ORDER BY id, sauvegarde_le DESC)
UPDATE inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, fusion_id = b.fusion_id
  FROM b WHERE d.id = b.id AND d.statut IS DISTINCT FROM b.statut AND d.decide_par IN ('rapprochement_v3', 'fiches_main_inverse');

SELECT (SELECT count(*) FROM inventaire_fusions WHERE user_id = '__USER__' AND par = 'utilisateur:photo_rapprochement_v3_main' AND defait_le IS NULL) fusions_restantes,
       (SELECT count(*) FROM inventaire_doublons WHERE user_id = '__USER__' AND statut = 'proposee' AND preuves ->> 'portee' = 'fiche_main') questions_restantes;
COMMIT;
