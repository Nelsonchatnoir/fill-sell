-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE de la réparation v3 (20261008_reparation_rapprochement_v3.mjs), 08/10/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Pour UN compte : remplacer __USER__ ; relit la sauvegarde la plus récente
-- (_backup_0810_v3_*). Dans l'ordre :
--   1. les fusions faites par la passe (par = 'utilisateur:photo_rapprochement_v3')
--      sont DÉFAITES par la voie normale (inventaire_defusionner_pour : chaque
--      déplacement rendu, journalisé) ;
--   2. les annonces rattachées ou importées par la passe reprennent leur état
--      d'avant (inventaire_id, job_id, proposition, source, ignoree_le) ; les
--      jobs de suivi qu'elle a créés sont ANNULÉS (jamais supprimés) ;
--   3. les articles créés par la passe sont retirés du stock (statut 'supprime',
--      jamais DELETE) ; les marqueurs « à vérifier » et les questions reprennent
--      leur état sauvegardé.
--   npx supabase db query --linked -f scripts/reparations/20261008_reparation_rapprochement_v3_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '120s';

-- 1. Les fusions de la passe, défaites (la plus récente d'abord).
SELECT f.id, inventaire_defusionner_pour(f.user_id, f.id, 'rapprochement_v3_inverse')
  FROM inventaire_fusions f
 WHERE f.par = 'utilisateur:photo_rapprochement_v3' AND f.defait_le IS NULL AND f.user_id = '__USER__'
 ORDER BY f.created_at DESC;

-- 2. Les annonces : état sauvegardé ; les jobs de suivi créés depuis : annulés.
WITH b AS (SELECT DISTINCT ON (id) * FROM _backup_0810_v3_annonces WHERE user_id = '__USER__' ORDER BY id, sauvegarde_le DESC)
UPDATE annonces_plateforme a
   SET inventaire_id = b.inventaire_id, job_id = b.job_id, proposition = b.proposition, source_rapprochement = b.source_rapprochement,
       ignoree_le = b.ignoree_le, updated_at = now()
  FROM b WHERE a.id = b.id
   AND (a.inventaire_id IS DISTINCT FROM b.inventaire_id OR a.job_id IS DISTINCT FROM b.job_id OR a.ignoree_le IS DISTINCT FROM b.ignoree_le);
UPDATE cross_post_jobs j SET status = 'cancelled', error = COALESCE(error, '') || ' [inverse réparation v3 du 08/10]'
 WHERE j.user_id = '__USER__' AND j.platform_fields ->> 'source' = 'releve'
   AND j.id NOT IN (SELECT id FROM _backup_0810_v3_jobs_ids WHERE user_id = '__USER__')
   AND j.status IN ('published', 'cancelled');

-- 3. Les articles créés par la passe, sortis du stock ; marqueurs et questions rendus.
UPDATE inventaire i SET statut = 'supprime', a_verifier = NULL
 WHERE i.user_id = '__USER__' AND i.origine LIKE 'releve\_%'
   AND i.id NOT IN (SELECT id FROM _backup_0810_v3_inventaire WHERE user_id = '__USER__')
   AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.inventaire_id = i.id AND r.decision = 'import' AND r.detail ->> 'voie' = 'rapprochement');
WITH b AS (SELECT DISTINCT ON (id) * FROM _backup_0810_v3_inventaire WHERE user_id = '__USER__' ORDER BY id, sauvegarde_le DESC)
UPDATE inventaire i SET a_verifier = b.a_verifier FROM b WHERE i.id = b.id AND i.a_verifier IS DISTINCT FROM b.a_verifier;
WITH b AS (SELECT DISTINCT ON (id) * FROM _backup_0810_v3_doublons WHERE user_id = '__USER__' ORDER BY id, sauvegarde_le DESC)
UPDATE inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, fusion_id = b.fusion_id
  FROM b WHERE d.id = b.id AND d.statut IS DISTINCT FROM b.statut;
UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3_inverse'
 WHERE user_id = '__USER__' AND statut = 'proposee' AND preuves ->> 'regle' = 'rapprochement_v3'
   AND id NOT IN (SELECT id FROM _backup_0810_v3_doublons WHERE user_id = '__USER__');

COMMIT;
