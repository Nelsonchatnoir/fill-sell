-- INVERSE de 20261021_parc_alertes_jamais_vues_recentes.sql : rend aux dépôts leurs platform_fields d'avant (sauvegarde
-- _backup_2110_parc_jamais_vues_jobs), pour les seuls jobs encore 'published'. La règle (déclencheur
-- cross_post_jobs_vue_ou_pas_encore_visible) remplacerait aussitôt les drapeaux rendus : la restauration passe par sa
-- porte (fillsell.restauration, cette transaction seulement).
begin;
set local fillsell.restauration = 'on';
update cross_post_jobs j set platform_fields = b.platform_fields
  from public._backup_2110_parc_jamais_vues_jobs b
 where j.id = b.id and j.status = 'published';
select count(*) restaures from cross_post_jobs j join public._backup_2110_parc_jamais_vues_jobs b on b.id = j.id
 where j.platform_fields = b.platform_fields;
commit;
