-- TESTS RÉELS (03/10 nuit, compte de Nico) — retrait des annonces de test par
-- le chemin normal (tâche « delete », comme le retrait par logo du Stock).
--   10231930752 : tableau de test, parti en « Sans marque » sous 0.6.91 (test b raté)
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, 'vinted', 'delete', 'pending', 'original', j.title, j.listing_url, '{}'::jsonb
from public.cross_post_jobs j
where j.id = '28e696e6-39f0-4784-844d-0e7b9cdc54fb' and j.status = 'published'
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.action = 'delete' and d.status in ('pending','processing'));
select id, status, listing_url from public.cross_post_jobs where inventaire_id = 1791060000000 and action = 'delete' order by created_at desc limit 1;
