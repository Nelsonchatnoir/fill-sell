-- Catégorie Vinted d'origine des articles importés du dressing (2026-08-05).
--
-- POURQUOI : la liste wardrobe ne rend AUCUNE catégorie — mesuré sur le compte
-- bêta, 0 article sur 29 ne porte de catalog_id ; elle ne donne que des
-- libellés (brand, size, status). Un article importé arrive donc SANS type, ce
-- qui le rend impubliable sur les 3 autres plateformes : le mapping de
-- catégories part de là. 27 des 47 articles du compte bêta étaient dans ce cas.
--
-- On stocke l'identifiant BRUT de Vinted, pas un libellé : c'est lui qui se
-- traduit ensuite vers chaque plateforme (et accessoirement vers notre `type`
-- d'affichage, via /api/v2/item_upload/catalogs). Un libellé stocké serait déjà
-- une interprétation ; l'id, non.
--
-- Le catalog_id n'existe que dans /api/v2/item_upload/items/{id} — une lecture
-- de détail PAR ARTICLE. La colonne persiste précisément pour que ce coût ne
-- soit payé qu'UNE fois par article, jamais à chaque sync.
--
-- Idempotent (add column if not exists / create index if not exists) : la
-- migration peut être rejouée sans effet de bord.
-- Droits : les GRANT d'inventaire sont au niveau TABLE, la colonne en hérite —
-- pas de GRANT à ajouter (vérifié avec Nico).

alter table public.inventaire
  add column if not exists vinted_catalog_id integer;

comment on column public.inventaire.vinted_catalog_id is
  'Catalogue Vinted d''origine (item_upload/items/{id}.catalog_id). Point '
  'd''entrée du mapping de catégories des 4 plateformes, pas seulement de '
  'l''affichage du type. NULL = jamais relevé (article saisi à la main, ou '
  'importé avant le 2026-08-05) — jamais une catégorie « inconnue ».';

-- File de rattrapage : les articles Vinted dont la catégorie reste à relever.
-- Index PARTIEL — il ne pèse que le temps du rattrapage et disparaît de fait
-- une fois la colonne remplie.
create index if not exists inventaire_catalog_a_relever
  on public.inventaire (user_id)
  where vinted_catalog_id is null and vinted_item_id is not null;
