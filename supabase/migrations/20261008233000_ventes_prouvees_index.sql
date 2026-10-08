-- ═══════════════════════════════════════════════════════════════════════════
-- VENTES PROUVÉES : l'index des annonces « vendues » en attente (08/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- NON APPLIQUÉE — feu vert de Nico. À appliquer AVANT 20261008233100.
-- Le 28/09, `enregistrer_ventes_prouvees` relisait à chaque poll toutes les
-- fiches en stock (ou toutes les annonces publiées) du compte pour en trouver
-- au plus cinq : 11 à 35 ms par appel sur les trois plus gros comptes (mesuré
-- le 08/10, EXPLAIN ANALYZE, 968 à 2 062 lignes lues). Avec cet index partiel,
-- l'ensemble des annonces publiées qui portent le signal « sold » tient en
-- quelques centaines de lignes POUR TOUT LE PARC (118 le 08/10) : le passage
-- du cron (ventes_prouvees_tick) les lit sans parcourir un seul compte.
-- CONCURRENTLY : aucun verrou d'écriture pendant la construction. À lancer
-- SEUL (hors transaction) : `db query --linked -f` puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_signal_vendu_idx;
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_signal_vendu_idx
  ON public.cross_post_jobs (user_id)
  WHERE status = 'published' AND (platform_fields ->> 'sale_signal') = 'sold';
