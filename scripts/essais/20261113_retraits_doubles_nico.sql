-- 13/11 (3e réponse de Nico, point 3) — les 7 doubles déjà en ligne : retrait de la copie écartée PAR LE CIRCUIT NORMAL,
-- c'est-à-dire le geste « Retirer » de l'app (StockTab.armRemoveJob : une tâche delete, sous les claims du vendeur, avec
-- le lien de SA tâche publiée), puis l'extension du vendeur / eBay par l'API retirent. Règle de Nico : garder la copie au
-- prix actuel de la fiche (le dernier prix posé pour l'objet), sinon la plus ancienne. Gardées : 53efea05 LBC 3276946640
-- (50 €, aucun historique de prix → la plus ancienne), eBay 407321497159 ; fc37c75e 3305154715, 3305295555, 3305308288
-- (23 € = les deux fiches), 3305238099 (25 € : prix relevé le 08/11 22:27), 3305300248. Aucune donnée réécrite, aucun mail.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where id::text like '53efea05%'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id::text like '53efea05%' and j.status = 'published' and j.listing_url is not null
   and ((left(j.id::text,8) = '0fdcaf16' and j.platform_listing_id = '3290542513')
     or (left(j.id::text,8) = '495b53a2' and j.platform_listing_id = '407330996482'));
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where id::text like 'fc37c75e%'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id::text like 'fc37c75e%' and j.status = 'published' and j.listing_url is not null
   and ((left(j.id::text,8) = '31041480' and j.platform_listing_id = '3305143401')
     or (left(j.id::text,8) = '22f3a99c' and j.platform_listing_id = '3305134349')
     or (left(j.id::text,8) = 'd15010da' and j.platform_listing_id = '3305146607')
     or (left(j.id::text,8) = '817105aa' and j.platform_listing_id = '3305137965')
     or (left(j.id::text,8) = 'f3b54c57' and j.platform_listing_id = '3305131119'));
reset role;
select left(d.user_id::text,8) compte, d.platform, d.inventaire_id, left(d.id::text,8) retrait, d.status, d.listing_url
  from public.cross_post_jobs d
 where d.action = 'delete' and d.created_at > now() - interval '1 minute'
   and (d.user_id::text like '53efea05%' or d.user_id::text like 'fc37c75e%') order by 1, 3;
commit;
