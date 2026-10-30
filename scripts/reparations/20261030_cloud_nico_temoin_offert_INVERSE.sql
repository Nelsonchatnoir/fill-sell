-- Inverse de 20261030_cloud_nico_temoin_offert.sql : Nico repasse SANS option et sans drapeau Cloud (colonnes comme
-- avant). L'orchestrateur éteint son navigateur ; en rotation aucune IP n'était attribuée.
-- Ensuite (geste de l'orchestrateur ou à la main) : coffre vidé (cloud_coffre_vider), session FillSell du navigateur
-- révoquée (cloud_session_revoquer) — docs/cloud/test-complet.md § 6.
BEGIN;
UPDATE public.profiles
   SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) - 'cloud',
       is_cloud = NULL, cloud_canal = NULL
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND cloud_canal = 'offert';
SELECT is_cloud, cloud_canal, beta_flags ->> 'cloud' AS temoin FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
