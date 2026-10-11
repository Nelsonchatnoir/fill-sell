-- ═══════════════════════════════════════════════════════════════════════════
-- Inverse de 20261012_articles_test_lot_depop.sql : retire les fiches de TEST
-- du lot Depop (B4, 12/10), compte de Nico.
-- ═══════════════════════════════════════════════════════════════════════════
-- Garde (dans la requête, pas à la main) : une fiche n'est retirée que si
--   · aucun de ses jobs n'est en file (pending / processing / needs_user) ;
--   · aucune de ses publications (publish / republish) n'est à 'published' —
--     c'est-à-dire que chaque annonce a été retirée (delete 'deleted', publish
--     clos 'cancelled'). Les n°2 et n°3 (T-shirts Leboncoin 3286784431 et
--     3286784845, encore « désactivés » chez Leboncoin = en modération le
--     12/10 vers 23:25) sont donc ÉCARTÉES d'office ; relancer ce script
--     après leur retrait les retirera à leur tour.
-- Relu avant (12/10 ~23:25) : 0 vente, 0 rapprochement, 0 remise en vente,
-- 0 note de vente, 0 journal, 0 capture Vinted sur les 21 ; 1 ligne
-- fiches_annonce chacune (CASCADE) ; jobs gardés (inventaire_id → NULL par la
-- clé étrangère, l'id est sauvé ci-dessous). Le déclencheur
-- inventaire_arme_retraits_avant_suppression n'arme rien : aucune
-- publication à 'published'.
--
-- Lancer : npx supabase db query --linked -f scripts/reparations/20261012_articles_test_lot_depop_INVERSE.sql
--
-- RESTAURATION (prête) :
--   begin;
--   insert into public.inventaire
--     select (jsonb_populate_record(null::public.inventaire, b.ligne)).*
--     from public._backup_1210_articles_test_lot_depop b where b.source = 'inventaire'
--     on conflict (id) do nothing;
--   insert into public.fiches_annonce
--     select (jsonb_populate_record(null::public.fiches_annonce, b.ligne)).*
--     from public._backup_1210_articles_test_lot_depop b where b.source = 'fiches_annonce'
--     on conflict do nothing;
--   update public.cross_post_jobs j set inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
--     from public._backup_1210_articles_test_lot_depop b
--     where b.source = 'cross_post_jobs' and j.id = b.cle::uuid and j.inventaire_id is null;
--   commit;
begin;

create table if not exists public._backup_1210_articles_test_lot_depop (
  source   text not null,
  cle      text not null,
  ligne    jsonb not null,
  sauve_le timestamptz not null default now(),
  primary key (source, cle)
);
-- Comme les autres _backup_ : fermée aux clients (RLS sans règle, aucun droit).
alter table public._backup_1210_articles_test_lot_depop enable row level security;
revoke all on public._backup_1210_articles_test_lot_depop from anon, authenticated;

create temp table _a_retirer on commit drop as
select i.id
from public.inventaire i
where i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  and i.id between 1791800000001 and 1791800000021
  and i.titre like 'TEST FillSell ne pas acheter - T-shirt homme blanc taille M n°%'
  and not exists (select 1 from public.cross_post_jobs j
                  where j.inventaire_id = i.id and j.status in ('pending', 'processing', 'needs_user'))
  and not exists (select 1 from public.cross_post_jobs j
                  where j.inventaire_id = i.id and coalesce(j.action, 'publish') in ('publish', 'republish')
                    and j.status = 'published')
  and not exists (select 1 from public.ventes v where v.inventaire_id = i.id);

insert into public._backup_1210_articles_test_lot_depop (source, cle, ligne)
select 'inventaire', i.id::text, to_jsonb(i)
from public.inventaire i where i.id in (select id from _a_retirer)
on conflict do nothing;

insert into public._backup_1210_articles_test_lot_depop (source, cle, ligne)
select 'fiches_annonce', f.ctid::text || ':' || f.inventaire_id::text, to_jsonb(f)
from public.fiches_annonce f where f.inventaire_id in (select id from _a_retirer)
on conflict do nothing;

insert into public._backup_1210_articles_test_lot_depop (source, cle, ligne)
select 'cross_post_jobs', j.id::text, jsonb_build_object('inventaire_id', j.inventaire_id)
from public.cross_post_jobs j where j.inventaire_id in (select id from _a_retirer)
on conflict do nothing;

delete from public.inventaire i
where i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  and i.id in (select id from _a_retirer);

select (select count(*) from _a_retirer) as fiches_retirees,
       (select count(*) from public.inventaire
         where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
           and id between 1791800000001 and 1791800000021) as fiches_restantes,
       (select count(*) from public._backup_1210_articles_test_lot_depop) as lignes_sauvees,
       (select count(*) from public.cross_post_jobs
         where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and action = 'delete'
           and created_at > now() - interval '1 minute') as retraits_armes;

commit;
