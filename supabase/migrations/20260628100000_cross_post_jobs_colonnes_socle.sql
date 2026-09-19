-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE — LES QUATRE COLONNES DE cross_post_jobs POSÉES AU DASHBOARD
-- (rapatriées le 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : d'un clic, pas d'une migration. `listing_url`,
-- `last_checked_at`, `sold_at` et `platform_fields` existent en prod sur
-- cross_post_jobs et AUCUN des 201 fichiers du dépôt ne les ajoute — vérifié,
-- zéro `add column` les nommant. Elles ont été créées au tableur Supabase.
--
-- CE QUE ÇA CASSAIT, MESURÉ LE 19/09 SUR BASE VIERGE. Après avoir réglé le
-- socle des tables et les extensions, le rejeu des 202 fichiers butait encore
-- SEPT fois, toutes sur ces colonnes :
--     72  republish_job_et_purge ................ column j.platform_fields …
--     99  backfill_beebs_platform_listing_id .... column "listing_url" …
--    133  backfill_inventaire_attributs ......... column j.platform_fields …
--    135  v_categorie_arbitrage_extension ....... column j.platform_fields …
--    136  categorie_journal ..................... column "platform_fields" …
--    137  categorie_par_jour_republications ..... column "platform_fields" …
--    191  republication_planifiee_multi_fonctions  column j.listing_url …
-- `platform_fields` est le canal que tout le projet utilise (marque, taille,
-- univers, warnings, lbcAspects, republish_*) : sans elle, un tiers des
-- fonctions serveur ne se crée même pas.
--
-- LE NUMÉRO N'EST PAS ANODIN — 20260628100000 se glisse entre le CREATE TABLE
-- (20260628000000_cross_post_jobs_and_is_pro) et 20260711900000, qui ajoute
-- `action`. C'est le seul créneau qui reproduit l'ORDRE RÉEL des colonnes en
-- prod :
--     … created_at, listing_url, last_checked_at, sold_at, platform_fields,
--       action, handler_build, reservation_id, reservation_settled_at, voie
-- Posées plus tard, elles se retrouveraient en fin de table et la base
-- reconstruite divergerait de la prod sur l'ordinal des colonnes.
--
-- Types et nullabilité relevés sur information_schema.columns de la prod :
-- les quatre sont nullable, sans valeur par défaut. Recopiés tels quels.
-- Idempotent (`if not exists`), inerte sur la prod — vérifié.

ALTER TABLE public.cross_post_jobs
  ADD COLUMN IF NOT EXISTS listing_url     text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sold_at         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS platform_fields jsonb;
