-- INVERSE de 20261029_thecloset_bordereau_auto_coupe.sql (lot A point 6 c) : la clé « auto » est retirée (absent =
-- activé, comme avant) ; le reste du réglage Bordereaux n'est pas touché.
BEGIN;
SELECT public.platform_settings_fusionner(ARRAY['bordereaux'], NULL, ARRAY['auto'], '8ac5bbda-0947-4612-82fd-effdaa3ca84a'::uuid);
SELECT platform_settings->'bordereaux' AS bordereaux FROM public.profiles WHERE id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a';
COMMIT;
