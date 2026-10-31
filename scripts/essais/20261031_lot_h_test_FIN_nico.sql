-- LOT F (finition) + LOT H (31/10) — fin des essais sur le compte de Nico, ET preuve en production de la règle « un
-- retrait ferme la republication en attente de la même annonce » (get-pending-jobs v312 : porte après la pause, sur les
-- republications servies d'une file active). Gestes de l'app, sous ses claims, dans UNE transaction :
--   1. une republication manuelle de l'annonce de test Vinted 10605948167 (spend_coins_and_republish) ;
--   2. son retrait ciblé « Retirer de Vinted » (geste du logo du Stock) — attendu au poll suivant : la republication
--      CLOSE (« Annonce retirée à ta demande… », rien recréé), le retrait servi, l'annonce retirée ;
--   3. le retrait ciblé de l'annonce de test Leboncoin 3299092610.
-- L'annonce Beebs 34270410 reste en ligne (en vérification chez Beebs : la preuve de la republication Beebs l'attend).
-- La file est remise en pause ensuite (…_FIN2), comme Nico l'avait laissée. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.spend_coins_and_republish(1793438700000, '10605948167', 'manuel', null, null) as republication_vinted;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, null, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.action = 'republish' and j.status = 'published'
   and ((j.inventaire_id = 1793438700000 and j.platform = 'vinted' and j.platform_listing_id = '10605948167')
     or (j.inventaire_id = 1793438700001 and j.platform = 'leboncoin' and j.platform_listing_id = '3299092610'));
reset role;
select left(id::text, 8) job, inventaire_id, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001)
   and status in ('pending', 'processing', 'needs_user') order by platform, action;
commit;
