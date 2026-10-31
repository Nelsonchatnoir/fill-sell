-- LOT F, finition (31/10) — PREUVE EN PRODUCTION de la garde « jamais un retrait sur un numéro périmé »
-- (get-pending-jobs v311, _shared/republication-cible.js), compte de Nico, annonce de test Leboncoin 3299028197 (999 €).
-- Le cas de Johan reproduit par les gestes de l'app, sous les claims de Nico :
--   1. sa file en pause (bouton de l'app) ;
--   2. une republication manuelle de l'annonce (spend_coins_and_republish) : elle attend dans la file ;
--   3. l'annonce disparaît de Leboncoin AVANT que la republication parte (ici : retrait ciblé « Retirer de
--      Leboncoin », le geste du logo du Stock ; les retraits passent pendant la pause).
-- Ensuite (…_2) : un relevé Leboncoin qui ne la voit plus, la reprise de la file → attendu : la republication est
-- RETENUE (cible_absente_releve), rien n'est retiré ni recréé. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(true) as file_en_pause;
select public.spend_coins_and_republish(1793438700001, null, 'manuel', null, 'leboncoin') as republication;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, null, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id = 1793438700001 and j.platform = 'leboncoin'
   and j.action = 'publish' and j.status = 'published' and j.platform_listing_id = '3299028197';
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, listing_url, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700001 and platform = 'leboncoin'
 order by created_at;
commit;
