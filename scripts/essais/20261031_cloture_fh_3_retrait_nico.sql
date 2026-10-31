-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico, étape 3 : le retrait ciblé « Retirer de Vinted » (geste du logo
-- du Stock : un job 'delete' sur l'annonce publiée, même forme que l'app) de l'annonce de test de l'étape 1, la file
-- TOUJOURS EN PAUSE. Attendu au poll suivant (get-pending-jobs v313, porte AVANT la pause) : la republication en
-- attente de l'étape 2 CLOSE (« Annonce retirée à ta demande… », arret_utilisateur, hors_quota,
-- republication_retrait_demande), rien recréé ; le retrait servi malgré la pause (les retraits continuent), l'annonce
-- retirée. La v312 ne la fermait pas (porte après la pause). Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, null, '{}'::jsonb
  from public.cross_post_jobs j
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id = 1793438700000 and j.platform = 'vinted'
   and j.action = 'publish' and j.status = 'published' and j.platform_fields ->> 'test_nico' = 'clôture F-H 31/10'
   and j.listing_url is not null;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700000
   and status in ('pending', 'processing', 'needs_user') order by created_at;
commit;
