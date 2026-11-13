-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION (14/11/2026, lot « zéro friction », bloc C4) — une vente Vinted relevée SANS fiche se rattache à la fiche du
-- MÊME numéro née ensuite du relevé du dressing (le défaut qui faisait compter une commande deux fois).
-- Jamais sur un titre : numéro Vinted exact (ventes.annonce_id = inventaire.vinted_item_id), même compte, une seule vente
-- Vinted pour ce numéro, une seule fiche pour ce numéro, fiche « vendu » à un exemplaire, sans aucune vente liée, non
-- fusionnée. Mesuré le 13/11 (lecture seule) : 283 ventes, 33 comptes. Les 66 paires DÉJÀ doublées ne sont PAS touchées
-- (une seule commande, deux lignes : quelle ligne garder = décision de Nico).
-- Effet : ventes.inventaire_id seulement (aucun déclencheur ON UPDATE sur ventes : rien n'est envoyé, aucun mail, aucun
-- push, aucun stock touché). Inverse : 20261114_ventes_vinted_rattachees_INVERSE.sql.
--   npx supabase db query --linked --yes -f scripts/reparations/20261114_ventes_vinted_rattachees.sql
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public._backup_1411_ventes_vinted_rattachees (vente_id bigint primary key, user_id uuid, inventaire_avant bigint, fiche bigint, le timestamptz default now());
alter table public._backup_1411_ventes_vinted_rattachees enable row level security;
revoke all on public._backup_1411_ventes_vinted_rattachees from public, anon, authenticated;

with c as (
  select v.id vente_id, v.user_id, i.id fiche_id
    from public.ventes v
    join public.inventaire i on i.user_id = v.user_id and i.vinted_item_id::text = v.annonce_id::text
   where lower(v.plateforme) = 'vinted' and v.inventaire_id is null and v.annonce_id is not null
     and i.statut = 'vendu' and coalesce(i.quantite, 1) <= 1 and i.fusionne_dans is null
     and not exists (select 1 from public.ventes v2 where v2.inventaire_id = i.id)
     and (select count(*) from public.ventes v3 where v3.user_id = v.user_id and lower(v3.plateforme) = 'vinted' and v3.annonce_id = v.annonce_id) = 1
     and (select count(*) from public.inventaire i2 where i2.user_id = v.user_id and i2.vinted_item_id = i.vinted_item_id) = 1
), sauve as (
  insert into public._backup_1411_ventes_vinted_rattachees (vente_id, user_id, inventaire_avant, fiche)
  select vente_id, user_id, null, fiche_id from c
  on conflict (vente_id) do nothing
  returning vente_id, fiche
)
update public.ventes v set inventaire_id = s.fiche
  from sauve s
 where v.id = s.vente_id and v.inventaire_id is null;

select count(*) as rattachees, count(distinct user_id) as comptes from public._backup_1411_ventes_vinted_rattachees;
