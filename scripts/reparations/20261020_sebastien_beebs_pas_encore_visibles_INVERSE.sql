-- INVERSE de 20261020_sebastien_beebs_pas_encore_visibles.sql : rend aux 13 dépôts leurs platform_fields d'avant
-- (sauvegarde _backup_2010_sebastien_beebs_jobs), pour les seuls jobs encore 'published'.
-- La règle (déclencheur cross_post_jobs_vue_ou_pas_encore_visible) remplacerait aussitôt les drapeaux rendus : la
-- restauration passe par sa porte (fillsell.restauration, cette transaction seulement).
begin;
set local fillsell.restauration = 'on';
update cross_post_jobs j set platform_fields = b.platform_fields
  from public._backup_2010_sebastien_beebs_jobs b
 where j.id = b.id and j.status = 'published';
select count(*) restaures from cross_post_jobs j join public._backup_2010_sebastien_beebs_jobs b on b.id = j.id
 where j.platform_fields = b.platform_fields;
commit;
