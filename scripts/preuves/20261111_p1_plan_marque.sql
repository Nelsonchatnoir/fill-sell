-- P1 (11/11/2026) — PLAN de la preuve « marque » du parc (get-pending-jobs), SANS exécution (EXPLAIN simple, lecture seule).
-- Le texte de PostgREST, paramètres remplacés par leurs valeurs (plan « custom », celui que la prod retient) :
--   npx supabase db query --linked --read-only -f scripts/preuves/20261111_p1_plan_marque.sql
-- Avant P1 : « Index Scan using cross_post_jobs_created » (toute la fenêtre de 30 jours parcourue).
-- Après P1 : « Index Scan using cross_post_jobs_preuve_marque_idx », aucun Seq Scan.
EXPLAIN SELECT "public"."cross_post_jobs"."platform_fields"->'marque_pose_envoi' AS "preuve"
  FROM "public"."cross_post_jobs"
  WHERE "public"."cross_post_jobs"."platform" = 'vinted'
    AND "public"."cross_post_jobs"."created_at" >= now() - interval '30 days'
    AND NOT "public"."cross_post_jobs"."platform_fields"->'marque_pose_envoi' IS NULL
  LIMIT 300 OFFSET 0;
