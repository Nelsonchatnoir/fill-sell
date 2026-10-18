-- (18/10, eBay ÷ 5) Les annonces eBay PUBLIÉES par FillSell qui portent « Longueur de la robe » ou
-- « Plateforme » (jeux, 139973) — la valeur partie et acceptée en ligne est la vérité. Lecture seule.
-- Le texte est celui de la FICHE (le vendeur), à défaut celui de la copie eBay.
select j.platform_fields->>'ebayCategoryId' cat,
       case when j.platform_fields->'ebayAspects' ? 'Longueur de la robe' then 'Longueur de la robe' else 'Plateforme' end champ,
       coalesce(j.platform_fields->'ebayAspects'->>'Longueur de la robe', j.platform_fields->'ebayAspects'->>'Plateforme') valeur,
       coalesce(i.titre, j.title) titre, left(coalesce(i.description, j.description), 1500) description,
       i.attributs->'categorie_vinted'->'chemin' chemin_vinted
  from cross_post_jobs j left join inventaire i on i.id = j.inventaire_id
 where j.platform = 'ebay' and j.status in ('published', 'sold') and j.action = 'publish'
   and (j.platform_fields->'ebayAspects' ? 'Longueur de la robe'
        or (j.platform_fields->'ebayAspects' ? 'Plateforme' and j.platform_fields->>'ebayCategoryId' = '139973'));
