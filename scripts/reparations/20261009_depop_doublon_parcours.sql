-- RÉPARATION 09/10 — la fiche en double née du parcours Depop de Nico.
-- GO de Nico (09/10, « DEPOP — reprise complète en une passe », § 1 d).
--
-- 09/10 07:09 : FillSell publie sur Depop la fiche de TEST 1791300075263 (job
-- 49217123, annonce 946325187, slug nelsonchatpoir-annonce-de-test-fillsell-5d59).
-- 07:11:08 : relevé Depop (geste « Synchroniser »). 07:11:21 : le moteur v3
-- tranche AVANT le filet d'identifiant de handler-watch (le seul chemin
-- « identifiant → job » depuis la v3) et IMPORTE l'annonce en fiche neuve
-- 1791529881380 (job de suivi b569c5ed, question « à vérifier » 5b5370c9 contre
-- 1790963950815). Correctif : rapprochement v17 (identifiant avant le moteur,
-- commit 70a1bfe, déployé le 09/10 10:44 Paris).
--
-- Ici : la fiche en double et TOUT ce qui la nomme sont sauvegardés, puis
-- retirés ; l'annonce redevient orpheline, et la passe de production (ou le
-- filet de handler-watch) la rattache au dépôt 49217123 par son identifiant.
-- `fillsell.sans_retrait` : la suppression n'arme AUCUN retrait Depop et
-- n'annule aucun job (inventaire_arme_retraits_avant_suppression).
--
-- CE QUE LA SUPPRESSION TOUCHE (relu en prod le 09/10, clés étrangères et
-- déclencheurs), et donc ce que la sauvegarde garde :
--   inventaire            la fiche (supprimée)
--   inventaire_lie        a_verifier des fiches nommées par une question supprimée
--                         (déclencheur inventaire_doublons_a_verifier) et
--                         fusionne_dans des fiches fondues dans la fiche (SET NULL)
--   cross_post_jobs       TOUS les jobs de la fiche (supprimés)
--   job_relaunch_log      lignes de ces jobs (CASCADE)
--   jobs_reservations_extension  lignes de ces jobs (déclencheur liberer_reservation)
--   annonces_plateforme   toute annonce qui nomme la fiche ou l'un de ses jobs
--                         (mise à jour ici, SET NULL sinon)
--   rapprochements        toute décision qui nomme la fiche ou l'annonce
--                         (l'import est supprimé, les autres : SET NULL)
--   inventaire_doublons   toute question qui nomme la fiche (supprimée)
--   fiches_annonce        (CASCADE)  ·  vinted_listing_snapshots,
--   vinted_republish_captures (SET NULL)
-- Inverse : 20261009_depop_doublon_parcours_inverse.sql (restaure TOUT, à
-- l'identique, sans qu'aucun déclencheur ne réécrive les lignes remises).
begin;
set local fillsell.sans_retrait = '1';
set local statement_timeout = '60s';
set local lock_timeout = '5s';

-- 0. Garde : l'état est celui relu le 09/10, le compte est celui de Nico, rien d'autre.
do $garde$
declare
  v_nico constant uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
begin
  if not exists (select 1 from inventaire where id = 1791529881380 and user_id = v_nico and origine = 'releve_depop') then
    raise exception 'réparation refusée : la fiche 1791529881380 n''est pas l''import Depop de Nico attendu';
  end if;
  if exists (select 1 from ventes where inventaire_id = 1791529881380) then
    raise exception 'réparation refusée : une vente nomme la fiche 1791529881380';
  end if;
  if exists (select 1 from cross_post_jobs where inventaire_id = 1791529881380
              and (user_id <> v_nico or coalesce(handler_build, '') <> 'releve-annonces')) then
    raise exception 'réparation refusée : un job de la fiche n''est pas un suivi de relevé du compte de Nico';
  end if;
  if exists (select 1 from annonces_plateforme a
              where (a.inventaire_id = 1791529881380
                     or a.job_id in (select j.id from cross_post_jobs j where j.inventaire_id = 1791529881380))
                and (a.user_id <> v_nico or a.id <> '851b11bc-6f06-4abf-aa54-f638d085901e')) then
    raise exception 'réparation refusée : une autre annonce que 851b11bc nomme la fiche';
  end if;
  if exists (select 1 from inventaire_doublons d where 1791529881380 in (d.garde, d.absorbe) and d.user_id <> v_nico)
     or exists (select 1 from rapprochements r where r.inventaire_id = 1791529881380 and r.user_id <> v_nico) then
    raise exception 'réparation refusée : une ligne d''un autre compte nomme la fiche';
  end if;
  if not exists (select 1 from cross_post_jobs where id = '49217123-f659-4988-922f-4dbc2ea5b244' and user_id = v_nico
                    and inventaire_id = 1791300075263 and platform = 'depop' and status = 'published'
                    and platform_listing_id = 'nelsonchatpoir-annonce-de-test-fillsell-5d59') then
    raise exception 'réparation refusée : le dépôt 49217123 n''est plus celui attendu';
  end if;
  if to_regclass('public._backup_0910_depop_doublon') is not null then
    if exists (select 1 from public._backup_0910_depop_doublon) then
      raise exception 'réparation refusée : une sauvegarde existe déjà (réparation déjà jouée ?)';
    end if;
  end if;
end
$garde$;

create table if not exists public._backup_0910_depop_doublon (
  t text not null, id text not null, ligne jsonb not null, le timestamptz not null default now());
revoke all on public._backup_0910_depop_doublon from anon, authenticated;

-- 1. Sauvegarde, AVANT toute écriture.
with jobs as (select id from cross_post_jobs where inventaire_id = 1791529881380),
     questions as (select * from inventaire_doublons where 1791529881380 in (garde, absorbe))
insert into public._backup_0910_depop_doublon (t, id, ligne)
select 'inventaire', i.id::text, to_jsonb(i) from inventaire i where i.id = 1791529881380
union all
select 'inventaire_lie', i.id::text, jsonb_build_object('a_verifier', i.a_verifier, 'fusionne_dans', i.fusionne_dans)
  from inventaire i
 where i.id <> 1791529881380
   and (i.fusionne_dans = 1791529881380
        or i.id in (select q.garde from questions q union select q.absorbe from questions q))
union all
select 'cross_post_jobs', j.id::text, to_jsonb(j) from cross_post_jobs j where j.id in (select id from jobs)
union all
select 'job_relaunch_log', l.id::text, to_jsonb(l) from job_relaunch_log l where l.job_id in (select id from jobs)
union all
select 'jobs_reservations_extension', r.job_id::text, to_jsonb(r) from jobs_reservations_extension r where r.job_id in (select id from jobs)
union all
select 'annonces_plateforme', a.id::text, to_jsonb(a) from annonces_plateforme a
 where a.inventaire_id = 1791529881380 or a.job_id in (select id from jobs)
union all
select 'rapprochements', r.id::text, to_jsonb(r) from rapprochements r
 where r.inventaire_id = 1791529881380
    or (r.annonce_id = '851b11bc-6f06-4abf-aa54-f638d085901e' and r.decision = 'import')
union all
select 'inventaire_doublons', q.id::text, to_jsonb(q) from questions q
union all
select 'fiches_annonce', f.inventaire_id::text, to_jsonb(f) from fiches_annonce f where f.inventaire_id = 1791529881380
union all
select 'vinted_listing_snapshots', s.id::text, to_jsonb(s) from vinted_listing_snapshots s where s.inventaire_id = 1791529881380
union all
select 'vinted_republish_captures', c.id::text, to_jsonb(c) from vinted_republish_captures c where c.inventaire_id = 1791529881380;

-- 2. Retrait de la fiche en double et de ce qui la nomme.
delete from inventaire_doublons where 1791529881380 in (garde, absorbe);
update annonces_plateforme
   set inventaire_id = null, job_id = null, source_rapprochement = null, proposition = null, updated_at = now()
 where id = '851b11bc-6f06-4abf-aa54-f638d085901e' and user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   and inventaire_id = 1791529881380;
delete from rapprochements
 where annonce_id = '851b11bc-6f06-4abf-aa54-f638d085901e' and inventaire_id = 1791529881380 and decision = 'import';
delete from cross_post_jobs
 where inventaire_id = 1791529881380 and user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
delete from inventaire
 where id = 1791529881380 and user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and origine = 'releve_depop';

-- 3. Relecture : la fiche n'existe plus, rien ne la nomme, aucun retrait armé.
select jsonb_build_object(
  'sauvegarde', (select jsonb_object_agg(t, n) from (select t, count(*) n from public._backup_0910_depop_doublon group by t) z),
  'fiche', (select count(*) from inventaire where id = 1791529881380),
  'jobs_fiche', (select count(*) from cross_post_jobs where inventaire_id = 1791529881380),
  'questions_fiche', (select count(*) from inventaire_doublons where 1791529881380 in (garde, absorbe)),
  'retraits_depop_armes', (select count(*) from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
                             and platform = 'depop' and action = 'delete'),
  'annonce', (select jsonb_build_object('inv', inventaire_id, 'job', job_id, 'source', source_rapprochement)
                from annonces_plateforme where id = '851b11bc-6f06-4abf-aa54-f638d085901e')) as resultat;
commit;
