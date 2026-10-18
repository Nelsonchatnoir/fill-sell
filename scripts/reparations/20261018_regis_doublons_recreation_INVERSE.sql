-- Inverse de 20261018_regis_doublons_recreation.sql.
-- ⚠️ Un retrait déjà exécuté chez Vinted ne se défait pas : seuls les retraits encore en file sont annulés.
begin;
update public.cross_post_jobs
   set status = 'cancelled', error = 'Retrait annulé (inverse de la réparation du 18/10)'
 where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and action = 'delete' and status in ('pending', 'needs_user')
   and platform_fields -> 'arme_par' ->> 'pose_par' like 'Claude 18/10%';

update public.inventaire i
   set vinted_item_id = b.vinted_item_id, disparu_le = b.disparu_le, listed_at_guess = b.listed_at_guess, vinted_status = b.vinted_status
  from public._backup_1810_regis_doublons_inventaire b
 where i.id = b.id;

-- Les jobs reviennent à leur état d'avant la retenue de 16:45 (platform_fields, statut) — puis relancer
-- 20261018_regis_recreations_arretees.sql si la retenue doit être reposée.
update public.cross_post_jobs j
   set status = b.status, platform_fields = b.platform_fields, listing_url = null, platform_listing_id = null, published_at = null
  from public._backup_1810_regis_recreations b
 where j.id = b.id;
commit;
