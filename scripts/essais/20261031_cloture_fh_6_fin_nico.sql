-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico : fin des essais. Le retrait ciblé « Retirer de … » (geste du logo
-- du Stock : un job 'delete' sur l'annonce en ligne, même forme que l'app) des annonces de test Vinted et Leboncoin
-- remises en ligne par …_5 (le dernier job publié de chaque fiche de test, créé après 14:35), puis le bouton « Mettre
-- en pause » de la file (file_pause_basculer), comme Nico l'avait laissée. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
select distinct on (j.inventaire_id, j.platform) j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, null, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id in (1793438700000, 1793438700001)
   and j.platform in ('vinted', 'leboncoin') and j.action in ('publish', 'republish') and j.status = 'published'
   and j.listing_url is not null and j.created_at >= '2026-10-31 13:35:00+00'
 order by j.inventaire_id, j.platform, j.created_at desc;
select public.file_pause_basculer(true) as file_en_pause;
reset role;
select left(id::text, 8) job, platform, action, status, listing_url
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001)
   and status in ('pending', 'processing', 'needs_user') order by platform;
commit;
