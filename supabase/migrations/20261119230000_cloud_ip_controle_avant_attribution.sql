-- 20261119230000_cloud_ip_controle_avant_attribution — AUCUNE IP DONNÉE À UN COMPTE SANS UN CONTRÔLE RÉUSSI JUSTE AVANT,
-- ET AUCUNE IP D'UN CLIENT RENOUVELÉE SANS SON CONTRÔLE DE SORTIE (19/11/2026 soir, décision de Nico, puis « contrôle
-- PRAGMATIQUE » du même soir : « Refuser seulement : hébergeur / proxy signalé / pays ≠ FR / plateforme qui ne s'ouvre pas.
-- Accepter le reste, quel que soit l'opérateur. Le contrôle s'applique avant TOUTE attribution, au retour du repos ET avant
-- chaque renouvellement (une IP qui échoue n'est ni attribuée ni renouvelée : elle expire ; le client passe à l'IP saine
-- suivante). Rien d'acheté pour ça. »).
-- PRÉPARÉE, NON APPLIQUÉE. ⛔ APRÈS 20261119190000 ET 20261119200000 (la garde l'exige). Puis
-- `npx supabase db query --linked -f` et `migration repair`, par le coordinateur, sur feu vert de Nico. Jamais `db push`.
--
-- Constat (prod, lecture seule, 19/11 soir) : cloud_ip_attribuer donne n'importe quelle IP « disponible » attribuable (ou la
-- sienne au repos) sans regarder quand elle a été contrôlée : la 90 (Liberty Global, saine) n'avait pas été recontrôlée
-- depuis 12:39 ; la 39 n'a JAMAIS eu de contrôle de santé ; une IP qui revient du repos repart sur son contrôle d'avant son
-- titulaire. Les 80, 81, 82, 88, 89 (hébergeur / proxy, grillées) ne sortaient du lot que par la santé « grillée » — une IP
-- seulement « suspecte » (un échec pas encore relu, la 43 le 12/11) restait attribuable.
--
-- LE CONTRÔLE = le contrôle de santé de l'orchestrateur (serveur-cloud/src/sante.js : la sortie lue à travers l'IP — ip-api :
-- hébergeur, proxy, pays, adresse — puis la page d'accueil de Vinted, Leboncoin, Beebs et Depop ; eBay n'y passe plus depuis
-- le 14/11, son trafic ne passe pas par l'IP), écrit par cloud_ip_sante_noter (inchangée). RÉUSSI = verdict « saine » :
-- aucun échec et rien d'inconnu (sortie lue, toutes les pages ouvertes). L'opérateur n'est plus jugé (rangOperateur ne fait
-- que l'ordre, comme avant).
--
-- RÈGLES :
--  1. cloud_ip_controlee_avant_attribution(ip) (neuve, pure STABLE) : santé « saine » dont le contrôle réussi (saine_le)
--     date de moins de coin_config cloud_controle_attribution_min minutes (absent = 60), et POSTÉRIEUR à la dernière
--     libération (retour du repos : liberee_le) et à la dernière livraison (achat neuf, adresse remplacée par IPRoyal :
--     livree_le, posé par cloud_ip_remplacee qui efface aussi la santé).
--  2. cloud_ip_attribuer (corps de PROD relu le 19/11 soir, md5 b09eaf83…) : la sienne au repos ET les disponibles ne sont
--     prises que contrôlées juste avant (règle 1) ; sinon NULL — le compte attend « une place se prépare » (sans_place) et
--     l'orchestrateur contrôle l'IP suivante dans les 5 min. Une IP qui échoue (suspecte, grillée) n'est jamais prise : le
--     compte passe à la saine suivante. Le journal d'attribution garde la date du contrôle (controle_le). Ordre inchangé.
--     cloud_ip_signaler (rebut à la main → une autre IP au titulaire) passe par elle : couvert.
--  3. cloud_ip_reserver (corps de PROD, md5 b6bddb50…) : la réservation (30 min, avant le paiement) prend d'abord une IP
--     contrôlée juste avant — rien d'autre ne change (une réservation ne donne rien : l'attribution recontrôle).
--  4. Déclencheur cloud_ips_zz_servir_actif_sans_ip (corps de 20261119200000) : il part aussi quand la SANTÉ d'une IP libre
--     change (le contrôle vient d'être écrit) et pour une IP au repos (son dernier titulaire revient) ; il ne sert un compte
--     que si l'IP est contrôlée juste avant ; un compte qui a réservé CETTE IP passe d'abord (avant : un compte avec une
--     réservation qui court n'était jamais servi par le déclencheur).
--  5. cloud_ip_attendus() (neuve, service_role) : les comptes au Cloud actif sans IP (même prédicat que cloud_actifs_sans_ip)
--     avec leur nature et leur réservation — l'orchestrateur contrôle pour eux d'abord (leur IP au repos, leur réservation,
--     puis la meilleure libre).
--  6. AVANT CHAQUE RENOUVELLEMENT d'une IP TENUE par un compte : colonne cloud_ips.controle_renouvellement (neuve) et
--     cloud_ip_controle_renouvellement_noter (neuve, service_role) — le contrôle de SORTIE seul (ip-api à travers l'IP, AUCUNE
--     page de plateforme : jamais une visite de robot sur l'IP d'un client), fait par l'orchestrateur dans les 4 jours avant
--     l'échéance ; un échec (hébergeur, proxy, pays, autre sortie) → l'IP n'est pas renouvelée (cloud-pool.js planDuJour),
--     elle expire et cloud_pool_entretien (incident) donne au client l'IP saine suivante, contrôlée juste avant (règle 2).
--     Une IP LIBRE n'est renouvelée que « saine » (règle « saines d'abord » en prod, cloud_ip_renouveler_saines_seulement = 1).
-- Inchangés : cloud_ip_attribuable (la vente, les places, la garde du nombre et l'état du pool comptent les mêmes IP : une IP
-- saine pas encore recontrôlée reste une place, elle sera contrôlée avant d'être donnée — jamais un achat pour ça),
-- cloud_ip_sante_noter, cloud_compte_synchroniser_pool, repos, purge, réservation de 30 min, droits des fonctions réécrites.
-- CPU : cloud_ip_controlee_avant_attribution lit la ligne (aucune requête) ; cloud_ip_attendus = le prédicat de
-- cloud_actifs_sans_ip (2,3 ms sur 3 957 profils, mesuré le 19/11), appelé toutes les 5 min par l'orchestrateur.
-- Gardes : cloud_ip_attribuer et cloud_ip_reserver = corps de prod du 19/11 soir ; cloud_ips_servir_actif_sans_ip = corps
-- posé par 20261119200000 (md5 ci-dessous) ; cloud_ip_remplacee présente (20261119190000). Sinon : arrêt, rien n'est écrit.
-- Banc jetable : PREUVE_PG=embarque node scripts/essais/20261119230000_banc.mjs (corps de prod, 20261119190000,
-- 20261119200000, puis celle-ci, puis l'inverse).
-- Inverse : supabase/rollbacks/20261119230000_cloud_ip_controle_avant_attribution_INVERSE.sql.

SET lock_timeout = '5s';
-- (20/11/2026 nuit) Gardes INSENSIBLES aux retours chariot : les corps de prod portent des CR (créés depuis des fichiers
-- CRLF), le dépôt n'en garde pas — md5 sans les CR (prod relue : b09eaf83… / b6bddb50… avec, 6c56aac9… / 46db9ef1… sans).

DO $garde$
BEGIN
  IF md5(replace(pg_get_functiondef('public.cloud_ip_attribuer(uuid,text)'::regprocedure), E'\r', '')) <> '6c56aac90065aa2366c3d717315af904'
     AND pg_get_functiondef('public.cloud_ip_attribuer(uuid,text)'::regprocedure) NOT LIKE '%20261119230000%' THEN
    RAISE EXCEPTION 'cloud_ip_attribuer a changé en prod depuis sa lecture du 19/11 soir : relire, jamais forcer';
  END IF;
  IF md5(replace(pg_get_functiondef('public.cloud_ip_reserver(uuid)'::regprocedure), E'\r', '')) <> '46db9ef1c9861d713a4574b684e8244d'
     AND pg_get_functiondef('public.cloud_ip_reserver(uuid)'::regprocedure) NOT LIKE '%20261119230000%' THEN
    RAISE EXCEPTION 'cloud_ip_reserver a changé en prod depuis sa lecture du 19/11 soir : relire, jamais forcer';
  END IF;
  IF to_regprocedure('public.cloud_ips_servir_actif_sans_ip()') IS NULL THEN
    RAISE EXCEPTION 'cloud_ips_servir_actif_sans_ip absente : appliquer 20261119200000 d''abord — jamais forcer';
  END IF;
  IF md5(replace(pg_get_functiondef('public.cloud_ips_servir_actif_sans_ip()'::regprocedure), E'\r', '')) <> '728be827b220de95eae40f144839e095'
     AND pg_get_functiondef('public.cloud_ips_servir_actif_sans_ip()'::regprocedure) NOT LIKE '%20261119230000%' THEN
    RAISE EXCEPTION 'cloud_ips_servir_actif_sans_ip absente ou différente du corps de 20261119200000 : appliquer 20261119200000 d''abord, ou relire — jamais forcer';
  END IF;
  IF to_regprocedure('public.cloud_ip_remplacee(bigint,inet,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'cloud_ip_remplacee absente : appliquer 20261119190000 d''abord — jamais forcer';
  END IF;
END
$garde$;

-- 1. Contrôlée juste avant ? (neuve)
CREATE OR REPLACE FUNCTION public.cloud_ip_controlee_avant_attribution(p cloud_ips)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (19/11/2026 soir, 20261119230000, décision de Nico) Le contrôle de santé RÉUSSI (verdict « saine » : sortie lue, ni
  -- hébergeur ni proxy, en France, l'IP elle-même, les pages des plateformes ouvertes) depuis moins de
  -- cloud_controle_attribution_min minutes (60), après la dernière libération (retour du repos) et la dernière livraison
  -- (achat, adresse remplacée). Miroir : cloud-pool.js controleeAvantAttribution.
  SELECT COALESCE(p.sante ->> 'verdict', '') = 'saine'
     AND public.cloud_ts(p.sante ->> 'saine_le') IS NOT NULL
     AND public.cloud_ts(p.sante ->> 'saine_le') <= now() + interval '5 minutes'
     AND public.cloud_ts(p.sante ->> 'saine_le') >= now() - make_interval(mins => public.cloud_param('controle_attribution_min', 60))
     AND public.cloud_ts(p.sante ->> 'saine_le') > COALESCE(GREATEST(p.liberee_le, p.livree_le), '-infinity'::timestamptz);
$function$;

-- 2. L'attribution : jamais une IP qui n'a pas passé ce contrôle juste avant.
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026 soir, 20261119230000, décision de Nico) Seulement une IP contrôlée juste avant
-- (cloud_ip_controlee_avant_attribution) — la sienne au repos comme une disponible ; sinon NULL : l'orchestrateur contrôle
-- l'IP suivante, le compte attend « une place se prépare ».
DECLARE
  v_ip bigint;
  v_retour boolean := false;
  v_controle_le text;
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
     AND public.cloud_ip_controlee_avant_attribution(i)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
       AND public.cloud_ip_controlee_avant_attribution(i)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, public.cloud_ip_refus_prouve(i.refus),
              public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
              i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  SELECT sante ->> 'saine_le' INTO v_controle_le FROM public.cloud_ips WHERE id = v_ip;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET etat = 'attribuee_' || p_nature, user_id = p_user,
         attributions = attributions + CASE WHEN dernier_user_id IS DISTINCT FROM p_user THEN 1 ELSE 0 END,
         dernier_user_id = p_user, derniere_origine = p_nature,
         reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, CASE WHEN v_retour THEN 'retour_meme_compte' ELSE 'attribution' END, p_user,
          jsonb_build_object('nature', p_nature, 'controle_le', v_controle_le));
  RETURN v_ip;
END;
$function$;

-- 3. La réservation : d'abord une IP contrôlée juste avant.
CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026 soir, 20261119230000) D'abord une IP contrôlée juste avant (cloud_ip_controlee_avant_attribution) : au
-- paiement, l'attribution la prend sans attendre un contrôle. Rien d'autre ne change.
DECLARE v_ip bigint;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, public.cloud_ip_controlee_avant_attribution(i) DESC,
            public.cloud_ip_refus_prouve(i.refus),
            public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
            i.expire_le, i.attributions, i.id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET reserve_pour = p_user, reserve_jusqu_au = now() + make_interval(mins => public.cloud_param('reservation_min', 30)), maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'reservation', p_user, '{}'::jsonb);
  RETURN v_ip;
END;
$function$;

-- 4. Le déclencheur : une IP qui vient d'être contrôlée (santé écrite) sert tout de suite un compte qui attend.
CREATE OR REPLACE FUNCTION public.cloud_ips_servir_actif_sans_ip()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026, 20261119200000, décision de Nico, point 5) L'IP NEW vient de devenir « disponible » : UN compte au Cloud actif
-- sans IP (payés et offerts d'abord, puis essais ; le plus ancien compte d'abord) la reçoit par cloud_compte_synchroniser_pool
-- (cloud_ip_attribuer, sous son verrou de compte). Jamais bloquant : une erreur est dite, l'IP reste disponible.
-- (19/11/2026 soir, 20261119230000) Seulement une IP contrôlée juste avant (cloud_ip_controlee_avant_attribution) ; le
-- déclencheur part aussi quand sa santé change (contrôle écrit) et pour une IP au repos (son dernier titulaire) ; un compte
-- qui a réservé CETTE IP passe d'abord.
DECLARE
  v_user uuid;
  v_r jsonb;
BEGIN
  IF public.cloud_param('ip_rotation', 0) = 1 THEN RETURN NULL; END IF;
  BEGIN
    IF NOT public.cloud_ip_controlee_avant_attribution(NEW) THEN RETURN NULL; END IF;
    SELECT p.id INTO v_user FROM public.profiles p
     WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE))
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips r WHERE r.reserve_pour = p.id AND r.reserve_jusqu_au > now() AND r.id <> NEW.id)
       AND public.cloud_ip_attribuable(NEW, p.id, CASE WHEN p.is_cloud IS TRUE THEN 'client' ELSE 'essai' END)
     ORDER BY (NEW.reserve_pour IS NOT DISTINCT FROM p.id) DESC, (p.is_cloud IS TRUE) DESC, p.created_at NULLS LAST, p.id
     LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_r := public.cloud_compte_synchroniser_pool(v_user);
      RAISE LOG 'cloud_ips_servir_actif_sans_ip : IP % contrôlée → compte % : %', NEW.id, v_user, v_r;
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
  AFTER UPDATE OF etat, sante ON public.cloud_ips
  FOR EACH ROW WHEN (NEW.etat IN ('disponible', 'repos') AND NEW.user_id IS NULL
                     AND (OLD.etat IS DISTINCT FROM NEW.etat OR OLD.sante IS DISTINCT FROM NEW.sante))
  EXECUTE FUNCTION public.cloud_ips_servir_actif_sans_ip();

-- 5. Les comptes qui attendent une IP (neuve, service_role seulement).
CREATE OR REPLACE FUNCTION public.cloud_ip_attendus()
 RETURNS TABLE(user_id uuid, nature text, reserve_ip bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (19/11/2026 soir, 20261119230000) Les comptes au Cloud ACTIF (payé, offert, essai en cours) sans IP, avec leur nature
  -- et leur réservation qui court : l'orchestrateur contrôle pour eux d'abord. Même prédicat que cloud_actifs_sans_ip ;
  -- rotation : aucun. Au plus 20, payés et offerts d'abord, le plus ancien compte d'abord.
  SELECT p.id, CASE WHEN p.is_cloud IS TRUE THEN 'client' ELSE 'essai' END,
         (SELECT r.id FROM public.cloud_ips r WHERE r.reserve_pour = p.id AND r.reserve_jusqu_au > now() ORDER BY r.id LIMIT 1)
    FROM public.profiles p
   WHERE public.cloud_param('ip_rotation', 0) <> 1
     AND (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE))
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)
   ORDER BY (p.is_cloud IS TRUE) DESC, p.created_at NULLS LAST, p.id
   LIMIT 20;
$function$;

REVOKE ALL ON FUNCTION public.cloud_ip_attendus() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_attendus() TO service_role;
REVOKE ALL ON FUNCTION public.cloud_ip_controlee_avant_attribution(cloud_ips) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_controlee_avant_attribution(cloud_ips) TO service_role;

-- 6. Le contrôle de sortie avant le renouvellement d'une IP tenue par un compte.
ALTER TABLE public.cloud_ips ADD COLUMN IF NOT EXISTS controle_renouvellement jsonb;
DO $contrainte$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cloud_ips_controle_renouvellement_lisible'
                  AND conrelid = 'public.cloud_ips'::regclass) THEN
    ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_controle_renouvellement_lisible
      CHECK (controle_renouvellement IS NULL OR (jsonb_typeof(controle_renouvellement) = 'object'
             AND octet_length(controle_renouvellement::text) <= 8192));
  END IF;
END
$contrainte$;

CREATE OR REPLACE FUNCTION public.cloud_ip_controle_renouvellement_noter(p_ip bigint, p_controle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026 soir, 20261119230000) Le contrôle de SORTIE (ip-api à travers l'IP, aucune page de plateforme) fait avant le
-- renouvellement d'une IP : { fait_le, echecs: [codes « sortie:… »], inconnus: [« sortie »] ou [], resume }. Le verdict est
-- dans l'orchestrateur (cloud-pool.js renouvellementControle : un échec = pas de renouvellement) ; ici, on l'écrit et on le
-- journalise.
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_fait timestamptz := public.cloud_ts(p_controle ->> 'fait_le');
BEGIN
  IF p_controle IS NULL OR jsonb_typeof(p_controle) <> 'object' OR v_fait IS NULL OR v_fait > now() + interval '5 minutes'
     OR jsonb_typeof(p_controle -> 'echecs') IS DISTINCT FROM 'array' OR jsonb_typeof(p_controle -> 'inconnus') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'controle_illisible');
  END IF;
  IF octet_length(p_controle::text) > 8192 THEN RETURN jsonb_build_object('ok', false, 'raison', 'controle_trop_gros'); END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_hors_pool'); END IF;
  UPDATE public.cloud_ips SET controle_renouvellement = p_controle, maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'visite_controle', v.user_id, jsonb_build_object('renouvellement', jsonb_build_object(
    'le', p_controle -> 'fait_le', 'echecs', p_controle -> 'echecs', 'inconnus', p_controle -> 'inconnus', 'etat', v.etat)));
  RETURN jsonb_build_object('ok', true, 'echecs', p_controle -> 'echecs');
END;
$function$;

REVOKE ALL ON FUNCTION public.cloud_ip_controle_renouvellement_noter(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_controle_renouvellement_noter(bigint, jsonb) TO service_role;
