-- ═══════════════════════════════════════════════════════════════════════════
-- INDEX cross_post_jobs (inventaire_id) — DÉJÀ POSÉ EN PROD À LA MAIN (08/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce fichier REFLÈTE la prod, il ne la précède pas. Relevé pg_indexes du
-- 08/09/2026 :
--   CREATE INDEX cross_post_jobs_inventaire ON public.cross_post_jobs
--     USING btree (inventaire_id) WHERE (inventaire_id IS NOT NULL)
--   (posé CONCURRENTLY dans l'éditeur SQL, sans verrou sur la table vivante)
--
-- POURQUOI. Toute lecture « les jobs de CET article » passait par l'index
-- (user_id, status) et balayait TOUTES les lignes publiées de l'utilisateur
-- pour en garder une (mesuré : 437 buffers, 1 763 lignes écartées chez le
-- compte le plus chargé). Avec cet index : Index Scan, 3-4 buffers, < 0,2 ms.
-- C'est lui qui a rendu « Déjà en ligne » (popup 0.6.22, get-pending-jobs v41)
-- acceptable, et il sert à toute lecture par article (app, sondes).
--
-- IDEMPOTENT ET REJOUABLE DANS UNE TRANSACTION (règle du 08/09 soir : les
-- fichiers sont rejoués sur une base où c'est déjà appliqué). ⛔ Pas de
-- CONCURRENTLY ici : PostgreSQL refuse CREATE INDEX CONCURRENTLY dans un bloc
-- de transaction AVANT même d'évaluer IF NOT EXISTS — le rejeu échouerait
-- alors que l'index existe. Sur la prod actuelle, IF NOT EXISTS ne fait rien ;
-- sur une base reconstruite, l'index se crée avec le verrou classique (à
-- refaire CONCURRENTLY à la main si la table est vivante à ce moment-là).
CREATE INDEX IF NOT EXISTS cross_post_jobs_inventaire
  ON public.cross_post_jobs USING btree (inventaire_id)
  WHERE inventaire_id IS NOT NULL;
