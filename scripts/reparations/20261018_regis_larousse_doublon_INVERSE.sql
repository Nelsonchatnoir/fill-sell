-- Inverse de 20261018_regis_larousse_doublon.sql (un retrait déjà exécuté chez Vinted ne se défait pas).
begin;
update public.cross_post_jobs set status = 'cancelled', error = 'Retrait annulé (inverse de la réparation du 18/10)'
 where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and action = 'delete' and platform_listing_id = '10432668983' and status in ('pending', 'needs_user');
update public.inventaire i set vinted_item_id = b.vinted_item_id, disparu_le = b.disparu_le, listed_at_guess = b.listed_at_guess
  from public._backup_1810_regis_larousse_fiche b where i.id = b.id;
update public.cross_post_jobs j set status = b.status, platform_fields = b.platform_fields, listing_url = null, platform_listing_id = null, published_at = null
  from public._backup_1810_regis_larousse b where j.id = b.id and j.id = 'ed7729dc-cf2b-4ecf-b26a-492902b5f241';
commit;
