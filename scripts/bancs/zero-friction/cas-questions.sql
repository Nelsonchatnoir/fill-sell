-- Set B : questions réellement posées (45 j), levées par la personne (> 20 s après l'affichage), valeur partie dans le job publié
with a as (
  select l.created_at, l.user_id, l.metadata->>'platform' platform, l.metadata->'champs'->>0 champ, l.metadata->>'inventaire_id' inv, l.metadata->>'categorie' cat
  from usage_logs l where l.feature='champ_requis_bloquant' and l.metadata->>'issue'='affiche' and l.created_at > now()-interval '45 days'
    and l.metadata->>'inventaire_id' ~ '^[0-9]+$' and l.metadata->>'partage' is null),
c as (
  select distinct on (a.user_id, a.inv, a.platform, a.champ) a.*,
   (select min(c.created_at) from usage_logs c where c.feature='champ_requis_bloquant' and c.user_id=a.user_id and c.metadata->>'inventaire_id'=a.inv and c.metadata->>'platform'=a.platform and c.metadata->'champs'->>0=a.champ and c.metadata->>'issue'='complete' and c.created_at between a.created_at + interval '20 seconds' and a.created_at + interval '2 hours') t_fin
  from a order by a.user_id, a.inv, a.platform, a.champ, a.created_at)
select c.platform, c.champ, c.cat, c.user_id, c.inv::bigint inventaire_id,
  j.status, j.platform_fields->'lbcAspects' lbc, j.platform_fields->'beebsAspects' bba, j.platform_fields->'ebayAspects' eba, j.platform_fields->'vintedAspects' vta,
  j.platform_fields->>'age' age, j.platform_fields->>'univers' univers, j.platform_fields->>'lbcProduit' lbcproduit, j.platform_fields->>'ebayCategoryId' ebaycat,
  i.titre, left(i.description, 1500) description, i.marque, i.attributs->'genre'->>'v' genre, i.attributs->'taille'->>'v' taille,
  i.attributs->'categorie_vinted'->'chemin' chemin_vinted, i.attributs->'attributs_visibles'->'v' attributs_visibles,
  (select jsonb_agg(x) from (select x from jsonb_array_elements(case when jsonb_typeof(i.photos)='array' then i.photos else '[]' end) x limit 2) s) photos
from c join inventaire i on i.id=c.inv::bigint
join lateral (select * from cross_post_jobs j where j.inventaire_id=c.inv::bigint and j.platform=c.platform and j.status in ('published','sold') and j.created_at > c.created_at order by j.created_at limit 1) j on true
where c.t_fin is not null and c.platform in ('leboncoin','beebs','ebay','vinted');
