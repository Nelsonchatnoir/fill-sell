-- TESTS RÉELS (03/10 nuit) — nettoyage demandé par Nico : le tableau de test
-- (45 €) a été acheté aussitôt, Nico a annulé la vente ; il ne doit JAMAIS
-- repartir. (1) la tâche needs_user du tableau est annulée ; (2) l'annonce de
-- test Primark à 12 € (10231900708) est retirée par une tâche « delete »
-- (chemin du retrait par logo). Règle : toute annonce de test ≥ 999 €.
begin;
update public.cross_post_jobs
set status = 'cancelled',
    error = 'Annonce de test annulée (03/10) : le tableau de test ne doit plus jamais partir.',
    platform_fields = platform_fields - 'needsUserField'
where id = '0a57129c-bd2a-4095-9334-fb0ca9c08446' and status = 'needs_user';

insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, 'vinted', 'delete', 'pending', 'original', j.title, j.listing_url, '{}'::jsonb
from public.cross_post_jobs j
where j.id = '52f3cd5d-512f-4a41-858b-d91d8723ad32' and j.status = 'published'
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.platform = 'vinted'
                  and d.action = 'delete' and d.status in ('pending','processing'));

select id, action, status, listing_url from public.cross_post_jobs
where id = '0a57129c-bd2a-4095-9334-fb0ca9c08446'
   or (inventaire_id = 1791021432548 and platform = 'vinted' and action = 'delete' and created_at > now() - interval '5 minutes');
commit;
