-- (04/11 soir, ordre de Nico) L'ESSAI « RECETTE DE PROD » SUR LA MACHINE À VRAIE PUCE : le compte Cloud de Nico passe
-- ENTIÈREMENT de cloud-1 à cloud-2 (enchère Hetzner 3104939, i9-13900, Intel UHD 770, Google Chrome officiel), sur une IP
-- neuve (:ip_neuve, achetée sur accord écrit, contrôle d'entrée passé), avec un PROFIL NEUF et AUCUN cookie repris :
--   · cloud_coffre : les lignes Vinted / Leboncoin / Depop / Beebs SAUVEGARDÉES puis retirées (le coffre est commun aux
--     serveurs : sinon cloud-2 réinjecterait les cookies de cloud-1 et écraserait le secours) ; la session FillSell
--     (ligne « fillsell ») reste : ce n'est pas un cookie de plateforme, un seul détenteur à la fois ;
--   · cloud_postes : serveur cloud-2, profil neuf p-f44b5917-1443a482c05b (celui de cloud-1, p-f44b5917-60c90d1101a8,
--     reste INTACT sur son disque : c'est le secours) ;
--   · cloud_ips : 39 → disponible (jamais « au repos » : aucune purge ; ⛔ jamais cloud_ip_liberer), :ip_neuve → Nico.
-- PRÉALABLE (vérifié ci-dessous) : cloud-1 ne sert plus Nico (COMPTES_AUTORISES sans lui, navigateur fermé : poste
-- « eteint »), cloud-2 bat. Exécution : remplacer :ip_neuve par l'id, puis npx supabase db query --linked -f <fichier>.
-- Inverse : 20261104_cloud_essai_gpu_bascule_nico_INVERSE.sql (cloud-2 ARRÊTÉ avant ; cloud-1 rouvert APRÈS).
BEGIN;
CREATE TABLE public._backup_0411_essai_gpu AS
  SELECT now() AS le, 'cloud_coffre'::text AS t, to_jsonb(c.*) AS ligne FROM public.cloud_coffre c
   WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  UNION ALL
  SELECT now(), 'cloud_postes', to_jsonb(p.*) FROM public.cloud_postes p WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  UNION ALL
  SELECT now(), 'cloud_ips', to_jsonb(i.*) FROM public.cloud_ips i WHERE i.id IN (39, :ip_neuve);
ALTER TABLE public._backup_0411_essai_gpu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_essai_gpu FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_postes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND serveur = 'cloud-1' AND etat = 'eteint') THEN
    RAISE EXCEPTION 'le poste de Nico n''est pas éteint sur cloud-1 : cloud-1 le sert encore';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-2' AND etat = 'actif' AND vu_le > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'cloud-2 ne bat pas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 39 AND etat = 'attribuee_client' AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP 39 pas attribuée à Nico';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = :ip_neuve AND etat = 'disponible' AND user_id IS NULL AND refus = '{}'::jsonb AND attributions = 0) THEN
    RAISE EXCEPTION 'IP neuve pas disponible, déjà utilisée ou déjà refusée';
  END IF;
  -- Le coffre : les plateformes partent (sauvegardées ci-dessus), la session FillSell reste.
  DELETE FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     AND plateforme IN ('vinted', 'leboncoin', 'depop', 'beebs');
  -- Le poste : cloud-2, profil neuf (l'ancienne erreur de cloud-1 retirée des détails).
  UPDATE public.cloud_postes
     SET serveur = 'cloud-2', etat = 'eteint', conteneur = NULL, derniere_erreur = NULL, maj_le = now(),
         details = (details - 'erreur' - 'raison' - 'conteneur')
                   || jsonb_build_object('serveur', 'cloud-2', 'profil', 'p-f44b5917-1443a482c05b',
                                         'essai_gpu', jsonb_build_object('bascule_le', now(), 'profil_cloud_1', details ->> 'profil'))
   WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  -- Les IP (même mise à jour que 20261104_cloud_ip_essai_beebs_nico.sql, joué et inversé sans incident à 15:15 / 15:48).
  UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), repos_fin = NULL, maj_le = now() WHERE id = 39;
  PERFORM public.cloud_journal(39, 'liberation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'essai GPU sur cloud-2 (ordre de Nico, 04/11 soir)', 'sans_repos', true));
  UPDATE public.cloud_ips
     SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', attributions = attributions + 1,
         dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client', reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL, purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = :ip_neuve;
  PERFORM public.cloud_journal(:ip_neuve, 'attribution', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('nature', 'client', 'raison', 'essai GPU sur cloud-2 (ordre de Nico, 04/11 soir)'));
END $$;
SELECT (SELECT count(*) FROM public._backup_0411_essai_gpu) AS sauvegardees,
       (SELECT string_agg(plateforme, ',' ORDER BY plateforme) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre,
       (SELECT serveur || ' ' || (details ->> 'profil') FROM public.cloud_postes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS poste,
       (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (39, :ip_neuve)) AS ips;
COMMIT;
