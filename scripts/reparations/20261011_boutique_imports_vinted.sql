-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE : chaque import Vinted rattaché à SA boutique, prouvée par le
-- relevé qui l'a créé (11/10/2026, Nico — cas Louis, règle « un article
-- appartient à la boutique d'où il vient »).
-- ═══════════════════════════════════════════════════════════════════════════
-- Fiche visée : en stock, annonce Vinted (vinted_item_id), boutique VIDE.
-- Preuve exigée, toute à la fois :
--   · la fiche est née PENDANT un relevé du dressing de ce compte
--     (vinted_sync_runs kind 'dressing', fenêtre started_at − 1 min →
--     fin + 2 min) ;
--   · tous les relevés de cette fenêtre portent UN SEUL vinted_user_id, et
--     aucun n'en est dépourvu (jamais un relevé muet) ;
--   · cette boutique est CONFIRMÉE sur le compte (profiles.vinted_sync_pin) —
--     la base refuse de toute façon une boutique non confirmée
--     (déclencheur inventaire_ecarte_import_sync).
-- Jamais un titre, jamais une photo, jamais un défaut. Rien d'autre n'est écrit.
-- Mesuré le 11/10 : 17 878 fiches sans boutique ; 374 nées pendant un relevé
-- qui la nomme ; 47 sur une boutique confirmée (3 comptes) → rattachées ici.
-- Les 327 autres (3 comptes sans boutique confirmée) : NON touchées.
--
-- Lancer : npx supabase db query --linked -f scripts/reparations/20261011_boutique_imports_vinted.sql
-- INVERSE (prêt) :
--   update public.inventaire i set vinted_account_id = null
--   from public._backup_1110_boutique_imports_vinted b
--   where i.id = b.id and i.vinted_account_id = b.rattache_a;
begin;

create table if not exists public._backup_1110_boutique_imports_vinted (
  id bigint primary key,
  user_id uuid not null,
  vinted_account_id_avant text,
  rattache_a text not null,
  sauve_le timestamptz not null default now()
);

with f as (
  select i.id, i.user_id, i.created_at from public.inventaire i
  where i.vinted_item_id is not null and nullif(trim(i.vinted_account_id), '') is null
    and i.statut = 'stock' and i.disparu_le is null
),
m as (
  select f.id, f.user_id,
    count(distinct r.vinted_user_id) ids,
    count(r.id) filter (where r.vinted_user_id is null) runs_sans_id,
    min(r.vinted_user_id) vid
  from f join public.vinted_sync_runs r on r.user_id = f.user_id and r.kind = 'dressing'
    and f.created_at >= r.started_at - interval '1 minute'
    and f.created_at <= coalesce(r.finished_at, r.updated_at, r.started_at) + interval '2 minutes'
  group by f.id, f.user_id
)
insert into public._backup_1110_boutique_imports_vinted (id, user_id, vinted_account_id_avant, rattache_a)
select m.id, m.user_id, null, m.vid
from m
where m.ids = 1 and m.runs_sans_id = 0
  and exists (select 1 from public.profiles p, jsonb_array_elements(coalesce(p.vinted_sync_pin -> 'boutiques', '[]'::jsonb)) b
              where p.id = m.user_id and b ->> 'user_id' = m.vid)
on conflict (id) do nothing;

update public.inventaire i
set vinted_account_id = b.rattache_a
from public._backup_1110_boutique_imports_vinted b
where i.id = b.id and nullif(trim(i.vinted_account_id), '') is null;

select count(*) as rattachees, count(distinct user_id) as comptes from public._backup_1110_boutique_imports_vinted;

commit;
