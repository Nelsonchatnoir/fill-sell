-- INVERSE de 20261025_vincent_champavert_doublon.sql : remet le job 9138772c et la fiche 1792842213155002 tels que
-- sauvegardés, et annule le retrait de 10514978864 s'il n'est pas encore parti (un retrait déjà exécuté chez Vinted ne
-- se défait pas : l'annonce retirée ne revient pas).
begin;
set local lock_timeout = '5s';

update public.cross_post_jobs d
   set status = 'cancelled', error = 'Annulé par l''inverse de la réparation du 25/10 (doublon Champavert).'
 where d.user_id = '67a8b907-29dd-4454-9d40-db8dd9107236' and d.action = 'delete'
   and d.platform_listing_id = '10514978864' and d.status = 'pending';

update public.cross_post_jobs j
   set status = b.ligne ->> 'status', error = b.ligne ->> 'error',
       listing_url = b.ligne ->> 'listing_url', platform_listing_id = b.ligne ->> 'platform_listing_id',
       published_at = (b.ligne ->> 'published_at')::timestamptz,
       platform_fields = b.ligne -> 'platform_fields'
  from public._backup_2510_vincent_champavert b
 where b.quoi = 'job_9138772c' and j.id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8';

update public.inventaire i
   set vinted_item_id = b.ligne ->> 'vinted_item_id',
       disparu_le = (b.ligne ->> 'disparu_le')::timestamptz,
       listed_at_guess = (b.ligne ->> 'listed_at_guess')::timestamptz,
       last_synced_at = (b.ligne ->> 'last_synced_at')::timestamptz
  from public._backup_2510_vincent_champavert b
 where b.quoi = 'fiche_1792842213155002' and i.id = 1792842213155002 and i.vinted_item_id = '10514173498';

select j.status, j.platform_listing_id, i.vinted_item_id
  from public.cross_post_jobs j join public.inventaire i on i.id = j.inventaire_id
 where j.id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8';
commit;
