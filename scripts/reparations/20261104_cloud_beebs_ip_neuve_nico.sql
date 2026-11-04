-- ⛔ (04/11 soir) NE JAMAIS RELANCER : ce script appelle cloud_ip_liberer (chemin d'un compte qui PART) — l'entretien a purgé
-- le compte de Nico à 12:25 (rapport docs/enquetes/beebs-cloud-0411 § 8). Gardé comme trace ; la ligne suivante l'arrête net.
DO $$ BEGIN RAISE EXCEPTION 'script désactivé : appelle cloud_ip_liberer (incident du 04/11 12:25)'; END $$;
-- (04/11, décision de Nico : « déblocage du compte de Nico : nouvelle IP via le pool, avec les cookies Beebs remis à
-- zéro ; changer l'IP de tout le Cloud ») Beebs « restreint » sur 176.103.182.215 (id 39) depuis le « Résoudre » du
-- 04/11 08:14 (rapport docs/enquetes/beebs-cloud-0411). IP neuve achetée par le pool (outils/acheter-une-ip.mjs,
-- IPRoyal 87481742, 4 $, id 40, 81.181.237.207, contrôle d'entrée passé). Ce script :
--   1. sauvegarde les lignes touchées (_backup_0411_cloud_beebs_ip : IP 39 et 40, ligne Beebs du coffre, état
--      « vérification » de Beebs lu par l'app) — RLS, aucun droit client ;
--   2. Beebs repart de zéro : sa ligne du coffre part (session et témoins DataDome chiffrés), son état « vérification »
--      aussi (l'app propose « Me connecter ») — le navigateur a été vidé de Beebs juste avant
--      (serveur-cloud/outils/effacer-plateforme.mjs) ;
--   3. l'IP du compte change : 39 libérée (au repos, comme toute IP rendue ; refus Beebs non prouvé gardé), 40 attribuée
--      au compte (même mise à jour que cloud_ip_attribuer, qui reprendrait sinon l'IP au repos du même compte).
-- L'orchestrateur voit l'IP changer et rouvre le navigateur sur la neuve (empreinte figée : le proxy n'en est pas) ;
-- Vinted, Leboncoin, Depop gardent leur session (coffre). Inverse : 20261104_cloud_beebs_ip_neuve_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_cloud_beebs_ip AS
  SELECT now() AS le, 'cloud_ips'::text AS quoi, to_jsonb(i.*) AS ligne FROM public.cloud_ips i WHERE i.id IN (39, 40)
  UNION ALL
  SELECT now(), 'cloud_coffre', to_jsonb(c.*) FROM public.cloud_coffre c
   WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.plateforme = 'beebs'
  UNION ALL
  SELECT now(), 'cloud_verification', p.platform_settings -> 'beebs' -> 'cloud_verification' FROM public.profiles p
   WHERE p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_0411_cloud_beebs_ip ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_cloud_beebs_ip FROM PUBLIC, anon, authenticated;

DELETE FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme = 'beebs';
SELECT public.platform_settings_fusionner(ARRAY['beebs'], NULL, ARRAY['cloud_verification'], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) IS NOT NULL AS etat_retire;

DO $$
DECLARE v_ancienne bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 40 AND etat = 'disponible' AND user_id IS NULL) THEN
    RAISE EXCEPTION 'IP 40 pas disponible : contrôle d''entrée pas encore passé';
  END IF;
  v_ancienne := public.cloud_ip_liberer('f44b5917-bccc-4431-ba41-f40571a2ed18', 'beebs_ip_neuve_0411 (decision Nico)');
  IF v_ancienne IS DISTINCT FROM 39 THEN RAISE EXCEPTION 'IP libérée inattendue : %', v_ancienne; END IF;
  UPDATE public.cloud_ips
     SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18',
         attributions = attributions + 1, dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client',
         reserve_pour = NULL, reserve_jusqu_au = NULL, attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = 40;
  PERFORM public.cloud_journal(40, 'attribution', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('nature', 'client', 'raison', 'beebs_ip_neuve_0411', 'decision', 'Nico, 04/11'));
END $$;

SELECT (SELECT count(*) FROM public._backup_0411_cloud_beebs_ip) AS sauvegardees,
       (SELECT count(*) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme = 'beebs') AS beebs_restantes,
       (SELECT string_agg(plateforme || '=' || connecte, ',' ORDER BY plateforme) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre,
       (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (39, 40)) AS ips;
COMMIT;
