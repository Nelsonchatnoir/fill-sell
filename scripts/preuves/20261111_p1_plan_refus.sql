-- P1 (11/11/2026) — PLAN des champs exigés par rayon (get-pending-jobs), SANS exécution (EXPLAIN simple, lecture seule).
-- Le texte de PostgREST, paramètres remplacés par leurs valeurs (plan « custom », celui que la prod retient) ; rayon 1806,
-- celui de l'enquête :
--   npx supabase db query --linked --read-only -f scripts/preuves/20261111_p1_plan_refus.sql
-- Avant P1 : « Seq Scan on cross_post_jobs » (toute la table).
-- Après P1 : « Index Scan using cross_post_jobs_refus_par_rayon_idx » (ou « Bitmap Index Scan on … »), aucun Seq Scan.
EXPLAIN SELECT "public"."cross_post_jobs"."platform_fields"->'server_required_fields' AS "server_required_fields"
  FROM "public"."cross_post_jobs"
  WHERE "public"."cross_post_jobs"."platform" = 'vinted'
    AND "public"."cross_post_jobs"."platform_fields"->'republish_snapshot'->>'catalog_id' = '1806'
    AND NOT "public"."cross_post_jobs"."platform_fields"->'server_required_fields' IS NULL
  LIMIT 40 OFFSET 0;
