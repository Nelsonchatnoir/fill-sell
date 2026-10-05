-- Inverse de 20261004_transporteurs_test_nico.sql : remet la valeur d'avant.
SELECT public.platform_settings_fusionner(ARRAY['leboncoin'], '{"transporteurs":["Mondial Relay","Colissimo"]}'::jsonb, '{}', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) -> 'leboncoin' -> 'transporteurs' AS apres;
