-- INVERSE de 20261020_louis_seller_lbc_doublons_relie.sql : rend aux 54 dépôts leur statut, motif et platform_fields
-- d'avant (sauvegarde _backup_2010_louis_seller_lbc_echecs), pour les seuls jobs encore 'cancelled' par ce script.
begin;
update cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
  from public._backup_2010_louis_seller_lbc_echecs b
 where j.id = b.id and j.status = 'cancelled'
   and j.platform_fields #>> '{depot_jamais_en_ligne,reclasse,par}' = 'reparation_2010_louis';
select count(*) restaures from cross_post_jobs j join public._backup_2010_louis_seller_lbc_echecs b on b.id = j.id
 where j.status = b.status and j.error is not distinct from b.error and j.platform_fields = b.platform_fields;
commit;
