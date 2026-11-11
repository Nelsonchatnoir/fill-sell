-- ═══════════════════════════════════════════════════════════════════════════
-- P1 (11/11/2026) — la preuve « marque par identifiant » du parc ne balaie plus cross_post_jobs (2/3)
-- ═══════════════════════════════════════════════════════════════════════════
-- NON APPLIQUÉE — feu vert de Nico, nommé, pour CETTE migration. À appliquer APRÈS 20261111170000.
-- BUT : get-pending-jobs (`envoiMarqueProuveParc`) lit, pour tout le parc et sur 30 jours, les
--   tâches Vinted qui portent `platform_fields -> 'marque_pose_envoi'` (clé « jamais
--   posée nulle part » à ce jour). Même défaut que le colis : `cross_post_jobs_created` parcourt
--   toute la fenêtre de 30 jours (≈ 95 000 lignes, ≈ 197 600 pages par appel). L'index partiel ne
--   contient que les lignes qui portent la clé. Aucune ligne de code changée : prédicat = filtre
--   envoyé par PostgREST, ordre created_at DESC = celui d'aujourd'hui (selftest:taches-sans-balayage).
-- COÛT ESTIMÉ : construction = deux passes sur la table (≈ 1 s, ≈ 195 000 pages chacune) ;
--   taille ≈ 16 kB ; écriture : un prédicat jsonb de plus par insertion ou mise à jour non-HOT,
--   aucune mise à jour HOT perdue, une entrée seulement pour une ligne qui porte la clé.
-- CONCURRENTLY, UNE instruction, sans transaction (voir 20261111170000). À lancer SEUL :
--   `db query --linked --yes -f`, relire `pg_index.indisvalid` (INVALID : DROP INDEX
--   CONCURRENTLY puis recommencer), puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_preuve_marque_idx;
--   (supabase/rollbacks/20261111170100_index_preuve_marque_vinted_INVERSE.sql)
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_preuve_marque_idx
  ON public.cross_post_jobs (created_at DESC)
  WHERE (platform_fields -> 'marque_pose_envoi') IS NOT NULL;
