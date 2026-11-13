-- ESSAI RÉEL (13/11, décision de Nico : « essai de la 0.6.187 sur MON poste Cloud ») — la 0.6.187 tourne en PILOTE sur le
-- seul poste Cloud de Nico (f44b5917 ; extension 0.6.186.45582, build 2026-11-13T12:46:52Z+ed7095c-cloud), les autres postes
-- sur la copie commune. Le geste « Republier » de l'app (spend_coins_and_republish, sous ses claims, comme
-- 20261031_cloture_fh_2_republication_nico.sql) sur sa fiche de TEST 1793438600001 (« TEST FillSell 31/10 lot F — Veste …
-- ne pas acheter », 999 €), annonce Vinted 10675129855 relue en ligne à 999 € le 13/11 ~14:07. Attendu : recréation
-- prouvée par le numéro relu dans l'onglet (platform_fields.copie_par_numero.source = "onglet"), photos envoyées
-- (recreation_photos_envoyees.ids non vide), handler_build …+ed7095c-cloud ; puis un relevé du dressing avec photo_ids.
-- Aucun mail. Le numéro Vinted est lu dans le job publié (jamais saisi).
begin;
create temp table _pub on commit drop as
  select j.platform_listing_id from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id = 1793438600001 and j.platform = 'vinted'
     and j.status = 'published' and j.platform_listing_id = '10675129855'
   order by coalesce(j.published_at, j.created_at) desc limit 1;
grant select on _pub to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.spend_coins_and_republish(1793438600001, (select platform_listing_id from _pub), 'manuel', null, null) as republication_vinted;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438600001
   and status in ('pending', 'processing', 'needs_user') order by created_at;
commit;
