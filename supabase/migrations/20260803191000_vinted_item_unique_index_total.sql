-- Anti-doublon Vinted : index unique TOTAL au lieu de partiel (2026-08-03).
--
-- L'index partiel `WHERE vinted_item_id IS NOT NULL` posé quelques heures plus
-- tôt garantissait bien l'unicité, mais il était INUTILISABLE comme cible d'un
-- upsert :
--   ON CONFLICT (user_id, vinted_item_id) DO UPDATE
--   → ERROR 42P10: there is no unique or exclusion constraint matching the
--     ON CONFLICT specification
-- Il aurait fallu répéter le prédicat après ON CONFLICT — ce que PostgREST ne
-- sait pas faire (`?on_conflict=user_id,vinted_item_id`), or c'est exactement
-- par PostgREST que l'extension écrit (restRequest). La sync « rejouable »
-- aurait donc échoué en écriture à chaque 2e passage.
--
-- Le prédicat était de toute façon superflu : par défaut Postgres traite les
-- NULL comme DISTINCTS dans un index unique (NULLS DISTINCT). Les articles
-- créés dans FillSell, qui n'ont pas d'id Vinted, peuvent donc être des
-- milliers à porter NULL sans jamais entrer en conflit. La garantie
-- anti-doublon est strictement la même, et l'upsert redevient possible.

DROP INDEX IF EXISTS public.inventaire_user_vinted_item_unique;

CREATE UNIQUE INDEX IF NOT EXISTS inventaire_user_vinted_item_unique
  ON public.inventaire (user_id, vinted_item_id);
