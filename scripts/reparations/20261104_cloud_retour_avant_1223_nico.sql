-- (04/11, décision de Nico : réparation (2)) LE COMPTE CLOUD DE NICO REMIS COMME AVANT 12:23. L'incident : la réparation
-- 20261104_cloud_beebs_ip_neuve_nico.sql a mis l'IP 39 « au repos » par cloud_ip_liberer — le chemin d'un compte qui
-- PART — et l'entretien de 12:25 a purgé le compte (profil détruit, coffre vidé, réservation de l'IP 2 levée).
-- Ce script (l'orchestrateur ARRÊTÉ ; le profil d'avant remis sous son nom, p-f44b5917-60c90d1101a8, depuis
-- archives/0411-beebs/p-principal-avant.tgz ; le coffre refait par outils/restaurer-coffre-profil.mjs) :
--   1. sauvegarde _backup_0411_cloud_retour (IP 2, 39, 40 ; ligne cloud_postes) — RLS, aucun droit client ;
--   2. IP 39 rendue au compte (même mise à jour que cloud_ip_attribuer, « retour même compte ») ;
--   3. IP 40 rendue au pool, DISPONIBLE (jamais « au repos » : l'entretien purgerait encore le compte) — son refus Beebs
--      de l'essai de 13:40 PAS encore noté (il déclencherait une visite de contrôle de Beebs à l'entretien suivant) ;
--   4. la réservation de l'IP 2 pour Nico rétablie jusqu'à son échéance (29/11) ;
--   5. le poste pointe de nouveau sur le profil d'avant (son empreinte figée 7a1cfa22 y est notée) ; la marque de purge part.
-- ⛔ Aucun appel à cloud_ip_liberer. Inverse : 20261104_cloud_retour_avant_1223_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_cloud_retour AS
  SELECT now() AS le, 'cloud_ips'::text AS quoi, to_jsonb(i.*) AS ligne FROM public.cloud_ips i WHERE i.id IN (2, 39, 40)
  UNION ALL
  SELECT now(), 'cloud_postes', to_jsonb(p.*) FROM public.cloud_postes p WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_0411_cloud_retour ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_cloud_retour FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 39 AND etat = 'repos' AND user_id IS NULL AND dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP 39 pas dans l''état attendu (repos, dernier compte Nico)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 40 AND etat = 'attribuee_client' AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP 40 pas dans l''état attendu (attribuée à Nico)';
  END IF;
  -- 3. 40 au pool (disponible), sans passer par le repos.
  UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), repos_fin = NULL, maj_le = now() WHERE id = 40;
  PERFORM public.cloud_journal(40, 'liberation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'retour_avant_1223 (réparation de Nico, 04/11)', 'etat_avant', 'attribuee_client', 'sans_repos', true));
  -- Le refus Beebs de l'essai de 13:40 n'est PAS noté ici : une IP disponible avec un refus non prouvé est visitée
  -- sur Beebs à l'entretien suivant (cloud_ip_a_visiter) — Nico : « aucune visite ». À noter une fois les visites coupées.
  -- 2. 39 rendue au compte.
  UPDATE public.cloud_ips
     SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18',
         derniere_origine = 'client', reserve_pour = NULL, reserve_jusqu_au = NULL, attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = 39;
  PERFORM public.cloud_journal(39, 'retour_meme_compte', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('nature', 'client', 'raison', 'retour_avant_1223 (réparation de Nico, 04/11)'));
  -- 4. La réservation de l'IP 2 pour Nico, comme avant 12:23.
  UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = expire_le, maj_le = now()
   WHERE id = 2 AND etat = 'disponible' AND user_id IS NULL;
  -- 5. Le poste : le profil d'avant, sans la marque de purge.
  UPDATE public.cloud_postes
     SET details = jsonb_set(details - 'purge', '{profil}', to_jsonb('p-f44b5917-60c90d1101a8'::text))
   WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
END $$;

SELECT (SELECT count(*) FROM public._backup_0411_cloud_retour) AS sauvegardees,
       (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-') || ':' || coalesce(left(reserve_pour::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (2, 39, 40)) AS ips,
       (SELECT details ->> 'profil' FROM public.cloud_postes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS profil;
COMMIT;
