-- ═══════════════════════════════════════════════════════════════════════════
-- INDEX cross_post_jobs (inventaire_id) — DÉJÀ POSÉ EN PROD À LA MAIN (08/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce fichier REFLÈTE la prod, il ne la précède pas. Relevé pg_indexes du
-- 08/09/2026 :
--   CREATE INDEX cross_post_jobs_inventaire ON public.cross_post_jobs
--     USING btree (inventaire_id) WHERE (inventaire_id IS NOT NULL)
--
-- POURQUOI. Toute lecture « les jobs de CET article » passait par l'index
-- (user_id, status) et balayait TOUTES les lignes publiées de l'utilisateur
-- pour en garder une (mesuré : 437 buffers, 1 763 lignes écartées chez le
-- compte le plus chargé). Avec cet index : Index Scan, 3-4 buffers, < 0,2 ms.
-- C'est lui qui a rendu « Déjà en ligne » (popup 0.6.22, get-pending-jobs v41)
-- acceptable, et il sert à toute lecture par article (app, sondes).
--
-- ⚠️ CONCURRENTLY ne s'exécute PAS dans une transaction : ce fichier ne passe
-- ni par `apply_migration` (MCP) ni par un rejeu transactionnel — à exécuter
-- tel quel dans l'éditeur SQL si un jour la prod devait être reconstruite.
-- IF NOT EXISTS : un rejeu sur la prod actuelle ne fait rien.
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_inventaire
  ON public.cross_post_jobs USING btree (inventaire_id)
  WHERE inventaire_id IS NOT NULL;
