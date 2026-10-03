-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS (BUSINESS) — 5 REPUBLICATIONS BEEBS BLOQUÉES SUR « ÂGE » (03/10, 20:40)
-- ═══════════════════════════════════════════════════════════════════════════
-- Depuis 19:00, la republication automatique de ses cinq inserts Zombicide
-- (rayon « Jeux de société ») passait en needs_user, une toutes les 18 min :
-- « Beebs exige l'âge de l'enfant… ». Chaque annonce EN LIGNE affiche
-- pourtant son âge — « 16 ans et + », lu le 03/10 vers 20:35 sur les cinq
-- pages publiques (ligne « Âge » ET ld+json `size`, identiques).
-- Cause : le relevé Beebs (≤ 0.6.91) ne lisait pas la ligne « Âge » ; le
-- serveur, sans âge, posait la question. Corrigé : get-pending-jobs v201
-- reprend l'âge du relevé de l'annonce (_shared/beebs-age-releve.js),
-- l'extension 0.6.92 relève la ligne « Âge ».
-- Ici, pour les cinq annonces DÉJÀ relevées sans âge :
--   1. le relevé reçoit l'âge que la page affiche (aucune annonce Beebs
--      touchée, aucune valeur changée : c'est la valeur en ligne) ;
--   2. les cinq tâches repartent en file (needs_user → pending), sans geste
--      de Louis ; get-pending-jobs pose l'âge au service.
-- Sauvegarde AVANT : _backup_0310_louis_age. Inverse :
-- 20261003_louis_beebs_age_republication_INVERSE.sql.

begin;

create table if not exists public._backup_0310_louis_age (
  sauvegarde_le timestamptz not null default now(),
  quoi text not null, id text not null, ligne jsonb not null
);

insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'annonce', a.id::text, to_jsonb(a) from public.annonces_plateforme a
where a.platform = 'beebs' and a.listing_id in ('32745578','32745570','32745178','32745584','32745559')
  and a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'job', j.id::text, to_jsonb(j) from public.cross_post_jobs j
where j.id in ('e97e9f8a-f658-4b4d-8fdd-0d8334e2b6e6','ce621046-5600-4695-b6e5-36f923a956ae',
               'af1e96be-7d1e-405c-b64c-5c6b4657ca68','ee7039df-6455-4fa4-b0fd-c10e5530fdb6',
               'b023c9f3-0cb0-4c75-87a0-038235473915')
  and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

-- 1. L'âge affiché par Beebs entre dans le relevé de chaque annonce.
update public.annonces_plateforme a
set capture = coalesce(a.capture, '{}'::jsonb) || jsonb_build_object(
      'age', '16 ans et +',
      'age_releve', jsonb_build_object(
        'source', 'page publique Beebs : ligne « Âge » et ld+json size (identiques)',
        'le', '2026-10-03T18:35:00Z',
        'pose_par', 'scripts/reparations/20261003_louis_beebs_age_republication.sql')),
    updated_at = now()
where a.platform = 'beebs' and a.listing_id in ('32745578','32745570','32745178','32745584','32745559')
  and a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
  and coalesce(a.capture->>'age', '') = '';

-- 2. Les cinq tâches repartent seules (la question n'avait pas lieu d'être).
update public.cross_post_jobs j
set status = 'pending', error = null,
    platform_fields = (j.platform_fields - 'needsUserField' - 'classement_age_exige')
      || jsonb_build_object('relance_serveur', jsonb_build_object(
           'le', now(), 'motif', 'âge repris de l''annonce Beebs en ligne (question posée à tort)'))
where j.id in ('e97e9f8a-f658-4b4d-8fdd-0d8334e2b6e6','ce621046-5600-4695-b6e5-36f923a956ae',
               'af1e96be-7d1e-405c-b64c-5c6b4657ca68','ee7039df-6455-4fa4-b0fd-c10e5530fdb6',
               'b023c9f3-0cb0-4c75-87a0-038235473915')
  and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
  and j.status = 'needs_user';

select 'annonces' quoi, count(*) from public.annonces_plateforme
 where platform = 'beebs' and listing_id in ('32745578','32745570','32745178','32745584','32745559') and capture->>'age' = '16 ans et +'
union all
select 'jobs en file', count(*) from public.cross_post_jobs
 where id in ('e97e9f8a-f658-4b4d-8fdd-0d8334e2b6e6','ce621046-5600-4695-b6e5-36f923a956ae',
              'af1e96be-7d1e-405c-b64c-5c6b4657ca68','ee7039df-6455-4fa4-b0fd-c10e5530fdb6',
              'b023c9f3-0cb0-4c75-87a0-038235473915') and status = 'pending';

commit;
