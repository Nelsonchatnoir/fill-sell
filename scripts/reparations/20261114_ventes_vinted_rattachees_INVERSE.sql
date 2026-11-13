-- INVERSE de 20261114_ventes_vinted_rattachees.sql : chaque vente rattachée retrouve inventaire_id NULL (seulement si elle
-- pointe encore la fiche posée par la réparation).
--   npx supabase db query --linked --yes -f scripts/reparations/20261114_ventes_vinted_rattachees_INVERSE.sql
update public.ventes v set inventaire_id = null
  from public._backup_1411_ventes_vinted_rattachees b
 where v.id = b.vente_id and v.inventaire_id = b.fiche;
select count(*) as remises_sans_fiche from public._backup_1411_ventes_vinted_rattachees;
