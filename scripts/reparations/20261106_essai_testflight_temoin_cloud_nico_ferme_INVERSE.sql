-- INVERSE de 20261106_essai_testflight_temoin_cloud_nico_ferme.sql = PHASE B de l'essai TestFlight 2.9.163 « OUVERT
-- POUR LE SEUL COMPTE TÉMOIN DE NICO » : son drapeau beta_flags.cloud revient (l'interrupteur global reste fermé : il
-- est le seul à revoir le Cloud). Seule la clé « cloud » est remise : les autres drapeaux, s'ils ont bougé entre-temps,
-- ne sont pas écrasés par la sauvegarde.
-- Gardes : sauvegarde présente et drapeau vrai dans la sauvegarde.
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261106_essai_testflight_temoin_cloud_nico_ferme_INVERSE.sql
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0611_temoin_cloud_nico') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public._backup_0611_temoin_cloud_nico WHERE avant->>'cloud' = 'true') THEN
    RAISE EXCEPTION 'sauvegarde _backup_0611_temoin_cloud_nico absente ou sans drapeau : rien n''est écrit';
  END IF;
END $$;

UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || jsonb_build_object('cloud', true)
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND COALESCE(beta_flags->>'cloud', '') <> 'true';

SELECT p.beta_flags->>'cloud' AS temoin, (SELECT value FROM public.coin_config WHERE key = 'cloud_offre_ouverte') AS interrupteur_global
  FROM public.profiles p WHERE p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
