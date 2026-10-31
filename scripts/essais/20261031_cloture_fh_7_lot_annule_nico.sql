-- CLÔTURE DES LOTS F ET H (31/10) — non-régression, compte de Nico : « Republier en lot » puis « Tout annuler », sur
-- ses annonces de test remises en ligne par …_5 (Vinted, Leboncoin), file EN PAUSE (rien ne part sur les plateformes).
-- Les écritures de l'app, sous ses claims (même script que …_lot_h_test_lot_annule_nico.sql) :
--   · le lot : lancerRepublicationLot (StockTab) = spend_coins_and_republish par (article, plateforme), puis le même
--     bulk_batch_id posé sur chaque job créé ;
--   · « Tout annuler » de Ta file : annulerJobs (src/utils/annulerFile.js) — cancelled + arret_utilisateur +
--     annulee_dans_la_file + hors_quota, compare-and-swap (statut lu, étape a_capturer, rien retiré).
-- Attendu : 2 republications créées dans un lot, puis annulées toutes les deux ; aucune annonce touchée. Aucun mail.
begin;
create temp table _lot on commit drop as select gen_random_uuid() as batch;
create temp table _crees (platform text, r jsonb) on commit drop;
create temp table _vinted on commit drop as
  select j.platform_listing_id from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id = 1793438700000 and j.platform = 'vinted'
     and j.action in ('publish', 'republish') and j.status = 'published' and j.platform_listing_id is not null
     and j.created_at >= '2026-10-31 13:35:00+00'
   order by j.created_at desc limit 1;
grant all on _lot, _crees, _vinted to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_en_pause;
insert into _crees select 'vinted', public.spend_coins_and_republish(1793438700000, (select platform_listing_id from _vinted), 'manuel', null, null);
insert into _crees select 'leboncoin', public.spend_coins_and_republish(1793438700001, null, 'manuel', null, 'leboncoin');
update public.cross_post_jobs j set bulk_batch_id = (select batch from _lot)
  from _crees c where j.id = (c.r ->> 'job_id')::uuid and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
select c.platform, c.r ->> 'allowed' autorise, c.r ->> 'reason' motif, left(c.r ->> 'job_id', 8) job, j.status, j.platform_fields ->> 'republish_step' etape, j.bulk_batch_id is not null dans_le_lot
  from _crees c left join public.cross_post_jobs j on j.id = (c.r ->> 'job_id')::uuid order by 1;
-- « Tout annuler » (annulerJobs) : même écriture, mêmes gardes.
update public.cross_post_jobs j
   set status = 'cancelled', error = 'Annulée à ta demande — ton annonce est restée en ligne.',
       platform_fields = j.platform_fields || jsonb_build_object(
         'arret_utilisateur', to_jsonb(now()),
         'annulee_dans_la_file', jsonb_build_object('le', to_jsonb(now()), 'par', 'app (Ta file)'),
         'hors_quota', true,
         'needsUserAttempts', greatest(99, coalesce((j.platform_fields ->> 'needsUserAttempts')::int, 0)))
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.bulk_batch_id = (select batch from _lot)
   and j.action = 'republish' and j.status in ('pending', 'needs_user')
   and (j.platform_fields ->> 'republish_step' is null or j.platform_fields ->> 'republish_step' = 'a_capturer')
   and j.platform_fields -> 'deleted_at' is null and j.platform_fields -> 'republish_suppression_envoyee' is null;
reset role;
select left(id::text, 8) job, platform, action, status, platform_fields ? 'arret_utilisateur' arret, platform_fields ->> 'hors_quota' hors_quota, error
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   and bulk_batch_id = (select batch from _lot) order by platform;
commit;
