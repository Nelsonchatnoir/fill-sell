-- ════════════════════════════════════════════════════════════════════════════
-- INVERSE du rattrapage du parc (20261007_rattrapage_releves.sql), 07/10/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Pour UN compte (remplacer l'uuid) ou pour tous (retirer le filtre) :
--   1. les fusions sûres sont DÉFAITES par la voie normale
--      (inventaire_defusionner_pour : chaque déplacement rendu, journalisé) ;
--   2. les articles sortis du stock (doutes) sont RÉTABLIS depuis les
--      sauvegardes _backup_0710_rattachement_* : la fiche, ses jobs de suivi,
--      son annonce (rattachement d'avant), ses rapprochements, ses questions.
--   npx supabase db query --linked -f scripts/reparations/20261007_rattrapage_releves_INVERSE.sql
BEGIN;

-- 1. Les fusions du rattrapage, défaites (la plus récente d'abord).
SELECT f.id, inventaire_defusionner_pour(f.user_id, f.id, 'rattrapage_0710_inverse')
  FROM inventaire_fusions f
 WHERE f.par = 'utilisateur:photo_rattrapage_0710' AND f.defait_le IS NULL
   -- AND f.user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03'
 ORDER BY f.created_at DESC;

-- 2. Les articles sortis du stock, rétablis.
INSERT INTO inventaire SELECT b.* FROM _backup_0710_rattachement_fiches b
 WHERE NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = b.id);
INSERT INTO cross_post_jobs SELECT b.* FROM _backup_0710_rattachement_jobs b
 WHERE NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = b.id);
UPDATE annonces_plateforme a
   SET inventaire_id = b.inventaire_id, job_id = b.job_id, source_rapprochement = b.source_rapprochement,
       proposition = b.proposition, updated_at = now()
  FROM _backup_0710_rattachement_annonces b
 WHERE a.id = b.id AND a.inventaire_id IS NULL;
UPDATE rapprochements r SET inventaire_id = b.inventaire_id
  FROM _backup_0710_rattachement_rapprochements b
 WHERE r.id = b.id AND r.inventaire_id IS NULL;
UPDATE inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par
  FROM _backup_0710_rattachement_doublons b
 WHERE d.id = b.id AND d.decide_par IN ('rattrapage_0710', 'photo_rattrapage_0710', 'rattrapage_0710_inverse');

COMMIT;
