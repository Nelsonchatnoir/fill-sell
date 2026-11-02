-- (02/11 12:55, demande de Nico : « test PROPRE sur Beebs, en partant de zéro — efface TOUT Beebs, dans le navigateur ET
-- dans le coffre ; la session Beebs part aussi : je me reconnecterai ; ne touche à rien d'autre ») La ligne Beebs du coffre
-- de Nico (chiffrée : cookies de session, DataDome) part ; l'état « vérification » de Beebs que lit l'app part aussi
-- (Beebs redevient « à connecter » : « Me connecter » depuis l'app). Le navigateur a été vidé de Beebs à 12:55:24
-- (serveur-cloud/outils/effacer-plateforme.mjs). Sans ligne au coffre, ni le Cloud ni l'extension ne touchent Beebs
-- (get-pending-jobs ne sert que les plateformes connectées au coffre ; le verrou du navigateur la ferme).
-- Inverse : 20261102_cloud_beebs_de_zero_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0211_cloud_beebs AS
  SELECT now() AS le, to_jsonb(c.*) AS ligne,
         (SELECT p.platform_settings -> 'beebs' -> 'cloud_verification' FROM public.profiles p WHERE p.id = c.user_id) AS verification
    FROM public.cloud_coffre c
   WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.plateforme = 'beebs';
ALTER TABLE public._backup_0211_cloud_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_beebs FROM PUBLIC, anon, authenticated;
DELETE FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme = 'beebs';
SELECT public.platform_settings_fusionner(ARRAY['beebs'], NULL, ARRAY['cloud_verification'], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) IS NOT NULL AS etat_retire;
SELECT (SELECT count(*) FROM public._backup_0211_cloud_beebs) AS sauvegardees,
       (SELECT count(*) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme = 'beebs') AS restantes,
       (SELECT string_agg(plateforme || '=' || connecte, ',' ORDER BY plateforme) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre;
COMMIT;
