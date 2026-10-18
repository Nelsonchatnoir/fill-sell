-- (18/10, eBay ÷ 5) Les aspects EXIGÉS (Taxonomy eBay, ebay_item_aspects) des catégories du rejeu, lecture seule.
-- {{CATEGORIES}} remplacé par rejeu-ebay.mjs (identifiants entre apostrophes, séparés par des virgules).
select e.category_id,
       (select jsonb_agg(jsonb_build_object('name', a->>'name', 'mode', a->>'mode',
                 'allowedValues', (select coalesce(jsonb_agg(v), '[]'::jsonb) from (select v from jsonb_array_elements(coalesce(a->'allowedValues', '[]'::jsonb)) v limit 300) x)))
          from jsonb_array_elements(e.aspects) a where (a->>'required')::boolean) requis
  from ebay_item_aspects e
 where e.category_id in ({{CATEGORIES}});
