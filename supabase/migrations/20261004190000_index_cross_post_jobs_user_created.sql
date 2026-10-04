-- ═══════════════════════════════════════════════════════════════════════════
-- cross_post_jobs : un index (user_id, created_at DESC, id DESC) — 04/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Incident du 04/10 (CPU 99 %, app bloquée sur le chargement) : la requête la
-- plus chère de la base était la lecture des jobs du Stock — par compte, triée
-- (created_at DESC, id DESC), paginée par 1 000. Seul `(user_id, status)`
-- existait : chaque page relisait et retriait tout l'historique du compte
-- (≈ 2 800 blocs par appel). Le même tri sert la sonde des jobs d'App.jsx
-- (limit 80), les retraits récents (syncPlateformes) et la lecture légère du
-- Stock (stock/jobsIncrementaux.js).
-- CONCURRENTLY : aucun verrou d'écriture pendant la construction. À lancer
-- SEUL (hors transaction) : `db query --linked -f` puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_user_created_idx;
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_user_created_idx
  ON public.cross_post_jobs (user_id, created_at DESC, id DESC);
