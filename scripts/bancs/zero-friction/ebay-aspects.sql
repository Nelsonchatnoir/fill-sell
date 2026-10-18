-- Les aspects eBay (API officielle) des catégories eBay des questions des 45 derniers jours, lecture seule.
select category_id, aspects from ebay_item_aspects where category_id in (
  select distinct coalesce(j.platform_fields->>'ebayCategoryId', l.metadata->>'categorie') from usage_logs l
  left join cross_post_jobs j on j.inventaire_id::text = l.metadata->>'inventaire_id' and j.platform='ebay'
  where l.feature='champ_requis_bloquant' and l.metadata->>'platform'='ebay' and l.created_at > now()-interval '45 days');
