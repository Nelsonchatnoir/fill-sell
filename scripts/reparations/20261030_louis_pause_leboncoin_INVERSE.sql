-- INVERSE de 20261030_louis_pause_leboncoin.sql : retire le blocage Leboncoin posé à la main sur les deux comptes de
-- Louis (les tâches retenues repartent au poll suivant, à la cadence ordinaire). À ne jouer que sur décision de Nico.
select p.id, public.platform_settings_fusionner(array['leboncoin'], null, array['blocage_acces'], p.id) as resultat
from (values ('faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid), ('447d920c-976a-4d8f-aff4-a2998050358c'::uuid)) as p(id);
select id, email, platform_settings->'leboncoin'->'blocage_acces' as blocage_apres
  from profiles where id in ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c');
