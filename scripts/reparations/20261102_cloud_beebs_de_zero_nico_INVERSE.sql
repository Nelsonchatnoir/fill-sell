-- INVERSE de 20261102_cloud_beebs_de_zero_nico.sql : la ligne Beebs du coffre revient telle qu'elle était (chiffrée), et
-- l'état « vérification » de l'app avec elle. (Le navigateur, lui, a été vidé : la session reviendra au prochain démarrage
-- par le coffre, cookiesARestaurer.)
BEGIN;
INSERT INTO public.cloud_coffre SELECT (jsonb_populate_record(NULL::public.cloud_coffre, b.ligne)).* FROM public._backup_0211_cloud_beebs b
  ON CONFLICT DO NOTHING;
SELECT public.platform_settings_fusionner(ARRAY['beebs', 'cloud_verification'], b.verification, ARRAY[]::text[], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid)
  FROM public._backup_0211_cloud_beebs b WHERE b.verification IS NOT NULL;
COMMIT;
