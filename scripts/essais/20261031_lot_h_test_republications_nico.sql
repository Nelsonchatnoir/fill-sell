-- LOT H (31/10) — non-régression, compte de Nico : reprise de la file (bouton de l'app) puis republication MANUELLE de
-- ses annonces de test Vinted 10605269960 et Leboncoin 3299049683 (spend_coins_and_republish, le geste « Remonter »
-- de l'app, sous ses claims) — avec get-pending-jobs v312 et les gardes du lot F en production. Attendu : chaque
-- annonce retirée puis recréée sous un nouveau numéro, aucune annonce en double. Beebs : quand 34270410 sort de la
-- vérification de Beebs. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(false) as file_reprise;
select public.spend_coins_and_republish(1793438700000, '10605269960', 'manuel', null, null) as republication_vinted;
select public.spend_coins_and_republish(1793438700001, null, 'manuel', null, 'leboncoin') as republication_leboncoin;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001)
   and action = 'republish' and status not in ('cancelled') order by platform;
commit;
