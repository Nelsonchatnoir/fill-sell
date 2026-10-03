-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS — L'ÂGE DE SES AUTRES ANNONCES BEEBS, LU SUR LEURS PAGES (03/10, ~23:00)
-- ═══════════════════════════════════════════════════════════════════════════
-- Après le premier correctif, 4 AUTRES articles (Vert « Black Plague »,
-- Blanc, Noir « Black Plague », Rouge) sont tombés sur la même question :
-- leur relevé non plus ne portait pas l'âge. Lu dans Chrome sur les pages
-- publiques (ligne « Âge ») pour ses 120 annonces Beebs sans âge au relevé :
-- 28 l'affichent (ci-dessous) ; les autres n'ont pas de ligne « Âge »
-- (yaourtières…) ou n'ont pas pu être lues (8 introuvables, 18 refusées par
-- l'anti-robot de Beebs — relues plus tard ou par l'extension 0.6.94).
-- Puis ses 4 tâches en attente repartent seules.
-- Sauvegarde : _backup_0310_louis_age (quoi = 'annonce2' / 'job2'). Inverse : _INVERSE.sql.
begin;
create temp table _ages(listing_id text primary key, age text) on commit drop;
insert into _ages values
 ('32745045','16 ans et +'),('32745154','16 ans et +'),('32745163','16 ans et +'),('32745187','16 ans et +'),
 ('32745193','16 ans et +'),('32745200','16 ans et +'),('32745204','16 ans et +'),('32745206','16 ans et +'),
 ('32745215','16 ans et +'),('32745428','16 ans et +'),('32745437','16 ans et +'),('32745444','16 ans et +'),
 ('32745554','16 ans et +'),('32745565','16 ans et +'),('32745571','16 ans et +'),('34006176','6 ans - 8 ans'),
 ('34006218','4 ans - 6 ans'),('34055454','2 ans - 3 ans'),('34055462','2 ans - 3 ans'),('34055466','4 ans - 6 ans'),
 ('34055479','4 ans - 6 ans'),('34055491','4 ans - 6 ans'),('34055648','4 ans - 6 ans'),('34055653','4 ans - 6 ans'),
 ('34055807','4 ans - 6 ans'),('34055808','4 ans - 6 ans'),('34055834','4 ans - 6 ans'),('34055839','4 ans - 6 ans');

insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'annonce2', a.id::text, to_jsonb(a) from public.annonces_plateforme a join _ages g on g.listing_id = a.listing_id
where a.platform = 'beebs' and a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

update public.annonces_plateforme a
set capture = coalesce(a.capture, '{}'::jsonb) || jsonb_build_object('age', g.age, 'age_releve', jsonb_build_object(
      'source', 'page publique Beebs : ligne « Âge »', 'le', '2026-10-03T21:00:00Z',
      'pose_par', 'scripts/reparations/20261003_louis_beebs_age_releves_suite.sql')),
    updated_at = now()
from _ages g
where a.platform = 'beebs' and a.listing_id = g.listing_id and a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
  and coalesce(a.capture->>'age', '') = '';

insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'job2', j.id::text, to_jsonb(j) from public.cross_post_jobs j
where j.id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
               'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd');

update public.cross_post_jobs j
set status = 'pending', error = null,
    platform_fields = (j.platform_fields - 'needsUserField' - 'classement_age_exige')
      || jsonb_build_object('relance_serveur', jsonb_build_object('le', now(), 'motif', 'âge lu sur l''annonce Beebs en ligne'))
where j.id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
               'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd')
  and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and j.status = 'needs_user';

select (select count(*) from public.annonces_plateforme a join _ages g on g.listing_id = a.listing_id where a.platform='beebs' and a.capture->>'age' = g.age) releves,
       (select count(*) from public.cross_post_jobs where id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0','d64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd') and status='pending') jobs;
commit;
