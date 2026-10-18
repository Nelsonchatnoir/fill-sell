-- Les listes exigées des plateformes (relevées au dépôt), lecture seule.
select platform, category_key, field_key, field_label, input_type, allowed_values from platform_category_aspects where required and platform in ('beebs','leboncoin','vinted');
