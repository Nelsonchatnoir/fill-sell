-- (04/11, accord de Nico pour CET essai uniquement) L'ESSAI BEEBS SUR UNE IP NEUVE, jamais vue par Beebs. Le compte de Nico
-- passe de l'IP 39 à l'IP neuve :ip_neuve (achetée par le pool, contrôle d'entrée passé) SANS cloud_ip_liberer (⛔ le
-- chemin d'un compte qui part : l'entretien purgerait le compte — incident du 04/11 12:25). L'IP 39 reste DISPONIBLE
-- (offre fermée, visites Beebs coupées), pour y revenir après l'essai. Vinted, Leboncoin, Depop
-- gardent leurs sessions (coffre, cookies DataDome) ; l'orchestrateur rouvre le navigateur sur l'IP neuve.
-- Exécution : psql -v ip_neuve=<id> … (ou remplacer :ip_neuve). Inverse : 20261104_cloud_ip_essai_beebs_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_cloud_ip_essai AS
  SELECT now() AS le, to_jsonb(i.*) AS ligne FROM public.cloud_ips i WHERE i.id IN (39, :ip_neuve);
ALTER TABLE public._backup_0411_cloud_ip_essai ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_cloud_ip_essai FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 39 AND etat = 'attribuee_client' AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP 39 pas attribuée à Nico';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = :ip_neuve AND etat = 'disponible' AND user_id IS NULL AND refus = '{}'::jsonb AND attributions = 0) THEN
    RAISE EXCEPTION 'IP neuve pas disponible, déjà utilisée ou déjà refusée';
  END IF;
  -- 39 : rendue au pool DISPONIBLE (jamais « au repos »). Pas de réservation : une seule IP réservée par compte, et l'IP 2
  -- l'est déjà pour Nico ; personne d'autre ne peut prendre la 39 (offre Cloud fermée, visites Beebs coupées).
  UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), repos_fin = NULL,
         maj_le = now() WHERE id = 39;
  PERFORM public.cloud_journal(39, 'liberation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'essai Beebs sur IP neuve (accord de Nico, 04/11)', 'sans_repos', true));
  -- L'IP neuve : attribuée au compte (même mise à jour que cloud_ip_attribuer).
  UPDATE public.cloud_ips
     SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', attributions = attributions + 1,
         dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client', reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL, purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = :ip_neuve;
  PERFORM public.cloud_journal(:ip_neuve, 'attribution', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('nature', 'client', 'raison', 'essai Beebs sur IP neuve (accord de Nico, 04/11)'));
END $$;
SELECT (SELECT count(*) FROM public._backup_0411_cloud_ip_essai) AS sauvegardees,
       (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-') || ':' || coalesce(left(reserve_pour::text, 8), '-'), ' ' ORDER BY id)
          FROM public.cloud_ips WHERE id IN (39, :ip_neuve)) AS ips;
COMMIT;
