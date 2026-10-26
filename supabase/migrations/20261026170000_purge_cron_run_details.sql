-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION (26/10, panne 15:12 → 15:47) — APPLIQUÉE sur le feu vert nommé de Nico (« purge du journal des crons
-- avec purge quotidienne »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le journal de pg_cron (cron.job_run_details) n'est jamais purgé : 269 096 lignes au 26/10 17:10 (204 Mo), dont
-- 240 076 de plus de 3 jours — la 3e table de la base, écrite à chaque passage des 29 crons (≈ 6 900 lignes par jour).
-- 1. Purge initiale : faite HORS de cette migration, par lots de 20 000 (une requête chacun, jamais une table
--    verrouillée longtemps sur une base qui sort d'une panne) — trace dans le rapport session-2610.
-- 2. Ici : un cron quotidien (03:40 UTC = 04:40 Paris en hiver) garde 3 jours (assez pour toute enquête : les journaux
--    Supabase gardent 24 h), 20 000 lignes au plus par passage, 60 s au plus.
-- Inverse : SELECT cron.unschedule('purge-cron-journal'); (rien à restaurer : journal d'exécution).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT cron.schedule(
  'purge-cron-journal',
  '40 3 * * *',
  $$SET statement_timeout = '60s'; DELETE FROM cron.job_run_details WHERE runid IN (SELECT runid FROM cron.job_run_details WHERE start_time < now() - interval '3 days' ORDER BY runid LIMIT 20000);$$
);
COMMIT;
