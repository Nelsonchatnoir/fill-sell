-- 20261119200000_cloud_actif_sans_ip_prioritaire — UN CLOUD ACTIF (PAYÉ OU OFFERT) SANS IP PASSE AVANT LA VENTE ET LA LISTE
-- D'ATTENTE, ET SA PLACE S'OUVRE DÈS QU'UNE IP REJOINT LE POOL (19/11/2026, décision de Nico, point 5 : « un compte dont le
-- Cloud est offert ne doit plus jamais voir l'écran de paiement du Cloud (liste d'attente, carte Cloud, offres). La place
-- s'ouvre directement. »).
-- PRÉPARÉE, NON APPLIQUÉE. ⛔ APRÈS 20261119190000 (agent IP : elle réécrit cloud_vente_etat et cloud_essai_preparer_moi) —
-- la garde l'exige. Puis `npx supabase db query --linked -f` et `migration repair`, par le coordinateur, sur feu vert de Nico.
-- Jamais `db push`.
--
-- Constat (prod, lecture seule, 19/11) : un compte dont le Cloud devient actif quand aucune IP n'est libre (Cloud offert posé
-- par un script, paiement validé après la fin de sa réservation) reste « sans_place » (cloud_compte_synchroniser_pool) ; seul
-- l'entretien HORAIRE le ressert (cloud_pool_entretien, b.). Entre-temps, cloud_vente_etat et cloud_attente_places_a_offrir
-- ne le comptent pas : un prospect qui se prépare réserve l'IP neuve 30 min, un inscrit prévenu la prend — la place due part
-- ailleurs. Et cloud_vente_etat rend « deja_client » sans rien dire de l'IP : l'app ne sait pas que la place se prépare
-- (« Me connecter » échoue alors : serveur-cloud fournisseurIp.js, « compte sans IP et rotation coupée »).
--
-- RÈGLES :
--  1. cloud_actifs_sans_ip(p_sauf) (neuve, service_role) : les comptes dont le Cloud est ACTIF (payé, offert, essai en cours)
--     sans IP attribuée ni réservation qui court — même prédicat que cloud_pool_etat.comptes_sans_place. Rotation : aucun.
--  2. cloud_vente_etat (corps posé par 20261119190000) : la file « devant » compte AUSSI ces comptes — la vente et la
--     préparation d'un prospect disent « ip_en_preparation » (serveur avec places, raison de 20261119190000 GARDÉE) ou
--     « complet », jamais une place due vendue ailleurs. Pour un compte DÉJÀ client : « place_prete » (IP attribuée, ou
--     rotation). Rien d'autre ne change (calcul, raisons, nature).
--  3. cloud_attente_places_a_offrir : moins ces comptes — personne n'est prévenu pour une place déjà due.
--  4. Déclencheur cloud_ips_zz_servir_actif_sans_ip (AFTER UPDATE OF etat, quand l'IP DEVIENT « disponible » : contrôle
--     d'entrée, sortie de repos, sortie de quarantaine) : UN compte actif sans IP la reçoit tout de suite (payés et offerts
--     d'abord, puis essais ; le plus ancien compte d'abord), par cloud_compte_synchroniser_pool (cloud_ip_attribuer, sous son
--     verrou). Une erreur est dite (WARNING) et n'empêche jamais l'IP de rejoindre le pool : l'entretien horaire reprend.
-- Inchangés : cloud_essai_preparer_moi (elle lit cloud_vente_etat : raison IN ('complet', 'ip_en_preparation') → liste
-- d'attente), attribution (ordre, nature), réservation de 30 min, repos, purge, grâce, droits des fonctions réécrites.
-- CPU (prod, 19/11, EXPLAIN ANALYZE du prédicat) : 2,3 ms, 363 blocs lus en cache, sur 3 957 profils ; le déclencheur ne part
-- qu'au passage d'une IP à « disponible » (quelques fois par jour).
-- Gardes : cloud_vente_etat = corps posé par 20261119190000 (md5 77c880490edda8df4e8ddadc12e925a2, il porte la marque
-- « 20261119190000 ») ; cloud_attente_places_a_offrir = corps de prod du 19/11 (md5 047c92fb19ed1817b56fcc25033dbac3) ;
-- cloud_compte_synchroniser_pool présente. Sinon : arrêt, rien n'est écrit.
-- Banc jetable : PREUVE_PG=embarque node scripts/essais/20261119200000_banc.mjs (corps de prod, 20261119190000, puis
-- 20261119200000, puis l'inverse).
-- Inverse : supabase/rollbacks/20261119200000_cloud_actif_sans_ip_prioritaire_INVERSE.sql (remet le corps de 20261119190000).

SET lock_timeout = '5s';

DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure)) <> '77c880490edda8df4e8ddadc12e925a2'
     AND pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure) NOT LIKE '%20261119200000%' THEN
    RAISE EXCEPTION 'cloud_vente_etat n''est pas le corps posé par 20261119190000 : appliquer 20261119190000 d''abord, ou relire — jamais forcer';
  END IF;
  IF md5(pg_get_functiondef('public.cloud_attente_places_a_offrir()'::regprocedure)) <> '047c92fb19ed1817b56fcc25033dbac3'
     AND pg_get_functiondef('public.cloud_attente_places_a_offrir()'::regprocedure) NOT LIKE '%20261119200000%' THEN
    RAISE EXCEPTION 'cloud_attente_places_a_offrir a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
  IF to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') IS NULL THEN
    RAISE EXCEPTION 'cloud_compte_synchroniser_pool absente : relire, jamais forcer';
  END IF;
END
$garde$;

-- 1. Les comptes au Cloud ACTIF sans IP (neuve, service_role seulement).
CREATE OR REPLACE FUNCTION public.cloud_actifs_sans_ip(p_sauf uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (19/11/2026, 20261119200000) Les comptes dont le Cloud est ACTIF (payé, offert, essai en cours) sans IP attribuée ni
  -- réservation qui court : leur place est due, ils passent avant la vente et la liste d'attente. Même prédicat que
  -- cloud_pool_etat.comptes_sans_place. Rotation : aucun (l'IP ne borne rien).
  SELECT CASE WHEN public.cloud_param('ip_rotation', 0) = 1 THEN 0 ELSE (
    SELECT count(*)::int FROM public.profiles p
     WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE))
       AND p.id IS DISTINCT FROM p_sauf
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips r WHERE r.reserve_pour = p.id AND r.reserve_jusqu_au > now())) END;
$function$;

REVOKE ALL ON FUNCTION public.cloud_actifs_sans_ip(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_actifs_sans_ip(uuid) TO service_role;

-- 2. La vente : les comptes actifs sans IP devant ; « place_prete » pour un compte déjà client.
CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
  v_trouve boolean;
  v_debut timestamptz;
  v_nature text;
  v_libres integer := 0;
  v_sa_resa boolean;
  v_inscrit timestamptz;
  v_tenues integer;
  v_devant integer;
  v_places integer;
  v_ip boolean;
  v_serveur integer;
  v_sienne boolean;
  v_ips integer;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  SELECT true, p.cloud_essai_debut INTO v_trouve, v_debut FROM public.profiles p WHERE p.id = p_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  IF public.cloud_voie_attendue(p_user) THEN
    -- (19/11/2026, 20261119200000, décision de Nico, point 5) Un compte DÉJÀ client : sa place est-elle prête (IP attribuée,
    -- ou rotation) ? Sinon l'app dit « ta place se prépare » — jamais une offre.
    RETURN jsonb_build_object('vente_possible', false, 'raison', 'deja_client',
      'place_prete', v_rotation OR EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p_user));
  END IF;
  v_nature := CASE WHEN v_debut IS NULL THEN 'essai' ELSE 'client' END;
  -- 1. La place serveur (chantier A). Fonction absente = capacité inconnue = pas de vente.
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  -- Sa propre réservation d'IP (préparation en cours) est déjà retirée des places libres : elle lui revient.
  v_sa_resa := EXISTS (SELECT 1 FROM public.cloud_ips i
                        WHERE i.reserve_pour = p_user AND i.reserve_jusqu_au > now() AND i.user_id IS NULL);
  SELECT a.inscrit_le INTO v_inscrit FROM public.cloud_attente a WHERE a.user_id = p_user;
  -- Les places gardées 24 h aux inscrits prévenus (sans réservation d'IP : sinon déjà comptées).
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  -- La file : les inscrits pas encore prévenus passent avant (tous, pour un compte qui n'est pas inscrit).
  SELECT count(*)::int INTO v_devant FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL
     AND (v_inscrit IS NULL OR a.inscrit_le < v_inscrit);
  -- (19/11/2026, 20261119200000, décision de Nico, point 5) Les comptes au Cloud ACTIF (payé, offert, essai) sans IP passent
  -- AVANT la file et la vente : leur place est due (cloud_actifs_sans_ip).
  v_devant := v_devant + public.cloud_actifs_sans_ip(p_user);
  v_serveur := v_libres + (CASE WHEN v_sa_resa THEN 1 ELSE 0 END);
  -- (07/11, feu vert de Nico) Les IP attribuables : places = LEAST(serveur, IP). Sa propre IP (attribuée, ou au repos
  -- pour lui) ne prend rien au pool ; en rotation, l'IP ne borne rien.
  v_sienne := EXISTS (SELECT 1 FROM public.cloud_ips i
                       WHERE i.user_id = p_user
                          OR (i.etat = 'repos' AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  IF v_rotation OR v_sienne THEN
    v_ips := v_serveur;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, v_nature);
  END IF;
  v_places := LEAST(v_serveur, v_ips) - v_tenues - v_devant;
  -- 2. L'IP : la sienne, sa réservation, une IP au repos qui lui revient, ou une libre attribuable (rotation : toujours).
  v_ip := v_rotation OR EXISTS (
    SELECT 1 FROM public.cloud_ips i
     WHERE i.user_id = p_user
        OR (i.reserve_pour = p_user AND i.reserve_jusqu_au > now())
        OR (i.etat IN ('disponible', 'repos') AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  RETURN jsonb_build_object(
    'vente_possible', v_places > 0 AND v_ip,
    -- (19/11/2026, 20261119190000, décision 1 de Nico) Le serveur a des places mais aucune IP n'est encore prête : la
    -- place se prépare (achat / contrôle d'entrée en cours) — jamais « complet ».
    'raison', CASE WHEN v_places <= 0 THEN
                     CASE WHEN NOT v_rotation AND NOT v_sienne AND v_serveur - v_tenues - v_devant > 0
                          THEN 'ip_en_preparation' ELSE 'complet' END
                   WHEN NOT v_ip THEN 'pool_vide' ELSE NULL END,
    'places', GREATEST(v_places, 0),
    'ip', v_ip,
    'nature', v_nature);
END;
$function$;

-- 3. La liste d'attente : personne n'est prévenu pour une place déjà due.
CREATE OR REPLACE FUNCTION public.cloud_attente_places_a_offrir()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_libres integer := 0;
  v_tenues integer;
  v_ips integer;
BEGIN
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  IF public.cloud_param('ip_rotation', 0) = 1 THEN
    v_ips := v_libres;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai');
  END IF;
  -- (19/11/2026, 20261119200000, décision de Nico, point 5) Moins les comptes au Cloud ACTIF sans IP : leur place est due,
  -- personne n'est prévenu pour elle.
  RETURN GREATEST(LEAST(v_libres, v_ips) - v_tenues - public.cloud_actifs_sans_ip(NULL), 0);
END;
$function$;

-- 4. Une IP rejoint le pool : un compte actif sans IP la reçoit tout de suite.
CREATE OR REPLACE FUNCTION public.cloud_ips_servir_actif_sans_ip()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026, 20261119200000, décision de Nico, point 5) L'IP NEW vient de devenir « disponible » : UN compte au Cloud actif
-- sans IP (payés et offerts d'abord, puis essais ; le plus ancien compte d'abord) la reçoit par cloud_compte_synchroniser_pool
-- (cloud_ip_attribuer, sous son verrou de compte). Jamais bloquant : une erreur est dite, l'IP reste disponible.
DECLARE
  v_user uuid;
  v_r jsonb;
BEGIN
  IF public.cloud_param('ip_rotation', 0) = 1 THEN RETURN NULL; END IF;
  BEGIN
    SELECT p.id INTO v_user FROM public.profiles p
     WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE))
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips r WHERE r.reserve_pour = p.id AND r.reserve_jusqu_au > now())
       AND public.cloud_ip_attribuable(NEW, p.id, CASE WHEN p.is_cloud IS TRUE THEN 'client' ELSE 'essai' END)
     ORDER BY (p.is_cloud IS TRUE) DESC, p.created_at NULLS LAST, p.id
     LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_r := public.cloud_compte_synchroniser_pool(v_user);
      RAISE LOG 'cloud_ips_servir_actif_sans_ip : IP % disponible → compte % : %', NEW.id, v_user, v_r;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cloud_ips_servir_actif_sans_ip : IP % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.cloud_ips_servir_actif_sans_ip() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cloud_ips_zz_servir_actif_sans_ip ON public.cloud_ips;
CREATE TRIGGER cloud_ips_zz_servir_actif_sans_ip
  AFTER UPDATE OF etat ON public.cloud_ips
  FOR EACH ROW WHEN (NEW.etat = 'disponible' AND OLD.etat IS DISTINCT FROM 'disponible')
  EXECUTE FUNCTION public.cloud_ips_servir_actif_sans_ip();
