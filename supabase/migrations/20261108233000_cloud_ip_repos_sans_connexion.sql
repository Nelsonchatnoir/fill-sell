-- (08/11/2026 nuit, décision de Nico) Une IP au repos dont le compte n'a JAMAIS réussi une connexion pendant qu'il la
-- tenait rejoint le pool dès sa purge prouvée (plus de repos de 7 jours pour rien) : jade60890 (IP 4, 3 min d'essai) et
-- wtk8jnmnnf (IP 1) laissaient le pool sous la marge (alerte 22:52:35, 2 libres pour 3). Corps réécrit depuis
-- pg_get_functiondef de la PROD (fixture scripts/essais/fixtures/prod-0811-remettre-en-pool/) : seule la condition
-- « repos_en_cours » change. Banc jetable : scripts/essais/20261108233000_banc.mjs. Inverse : le corps de la prod.
-- (Pas de transaction : leçon du 03/11.)
CREATE OR REPLACE FUNCTION public.cloud_ip_remettre_en_pool(p_ip bigint, p_controle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  m text[] := '{}';
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'manques', '["ip_inconnue"]'::jsonb); END IF;
  IF v.etat IS DISTINCT FROM 'repos' THEN m := array_append(m, 'pas_au_repos'); END IF;
  -- (08/11/2026 nuit, décision de Nico : « on peut les réattribuer, celles où la connexion n'a jamais réussi ») Le repos
  -- de 7 jours ne protège qu'une IP qui a PORTÉ une session de plateforme : si son dernier compte n'a réussi AUCUNE
  -- connexion pendant qu'il la tenait (cloud_connexions « connectee » entre attribuee_le et liberee_le), aucune plateforme
  -- n'a vu de compte derrière elle — elle rejoint le pool dès sa purge prouvée et son contrôle de santé passé.
  IF v.repos_fin IS NULL
     OR (now() < v.repos_fin AND (v.dernier_user_id IS NULL OR v.attribuee_le IS NULL OR v.liberee_le IS NULL OR EXISTS (
           SELECT 1 FROM public.cloud_connexions c
            WHERE c.user_id = v.dernier_user_id AND c.statut = 'connectee'
              AND c.ouverte_le >= v.attribuee_le - interval '1 minute' AND c.ouverte_le <= v.liberee_le))) THEN
    m := array_append(m, 'repos_en_cours');
  END IF;
  IF v.purge_prouvee_le IS NULL OR v.liberee_le IS NULL OR v.purge_prouvee_le < v.liberee_le
     OR cardinality(public.cloud_purge_manques(v.purge_preuve, v.liberee_le)) > 0 THEN
    m := array_append(m, 'purge_non_prouvee');
  END IF;
  IF v.expire_le <= now() THEN m := array_append(m, 'expiree'); END IF;
  m := m || public.cloud_controle_manques(p_controle, v.ip);
  IF cardinality(m) > 0 THEN RETURN jsonb_build_object('ok', false, 'manques', to_jsonb(m)); END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'sortie_repos', NULL, jsonb_build_object('controle', p_controle));
  RETURN jsonb_build_object('ok', true);
END;
$function$;
