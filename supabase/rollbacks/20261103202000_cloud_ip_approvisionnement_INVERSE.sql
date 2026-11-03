-- Inverse de 20261103202000_cloud_ip_approvisionnement (03/11/2026).
-- Rend l'état d'AVANT la migration (appliquée en prod le 03/11 vers 16:37, heure de Paris) :
--   · les 4 fonctions réécrites, copiées MOT POUR MOT de pg_get_functiondef lu en prod le 03/11 AVANT la migration
--     (lecture seule du chantier B, gardée dans son dossier de travail) — source de chacune :
--       cloud_ip_signaler   : pg_get_functiondef prod 03/11 avant migration ;
--       cloud_ip_attribuer  : pg_get_functiondef prod 03/11 avant migration ;
--       cloud_ip_reserver   : pg_get_functiondef prod 03/11 avant migration ;
--       cloud_pool_etat     : pg_get_functiondef prod 03/11 avant migration.
--     Droits remis comme avant : postgres + service_role (aucun client).
--   · les fonctions neuves retirées : cloud_ip_refus_noter, cloud_ip_refus_noter_compte, cloud_ip_refus_visite,
--     cloud_ip_a_visiter, cloud_ip_depenses_mois, cloud_ip_depense_ouvrir, cloud_ip_depense_fermer, cloud_ip_refus_prouve ;
--   · les colonnes neuves retirées : cloud_ips.refus (+ contrainte cloud_ips_refus_objet), cloud_ip_commandes.nature
--     (+ contrainte cloud_ip_commandes_nature) et .ip_id, index cloud_ip_commandes_demandee — les lignes de dépense
--     éventuelles RESTENT (trace d'argent réel), seules les deux colonnes partent ;
--   · le journal : les événements des natures neuves (refus, refus_leve, refus_prouve, visite_controle, depense) sont
--     retirés, puis la contrainte de nature d'avant est remise (15 natures) ;
--   · les clés coin_config neuves retirées (aucune n'existait avant : seule cloud_ip_rotation existait) ;
--   · les données des ids 1 à 4 telles qu'avant (relues au journal cloud_ip_evenements) :
--       1 (94.194.94.233)   disponible, sans refus ; maj_le 2026-11-03 14:58:44.574203 UTC (renouvellement, évén. 79) ;
--       2 (185.134.194.88)  disponible, réservée à f44b5917… jusqu'au 29/11 11:37 (réservation non touchée par la
--                           migration), sans refus ; maj_le 2026-11-02 12:17:14.117312 UTC (réparation retour_81, même
--                           transaction que l'évén. 38 — DÉDUIT : aucune sauvegarde de cette valeur n'existe) ;
--       3 (81.181.239.136)  rebut blocage_anti_robot, rebut_le = maj_le = 2026-11-02 15:26:31.891826 UTC (évén. 75) ;
--       4 (185.134.192.253) rebut blocage_anti_robot, rebut_le = maj_le = 2026-11-02 11:58:43.045158 UTC (évén. 35).
--     Gardes : 3 et 4 ne retournent au rebut que si personne ne les tient ni ne les a réservées depuis (sinon : NOTICE,
--     rien touché) ; maj_le de 1 et 2 n'est remis que s'il vaut encore l'instant de la migration (15:37:37.796145 UTC).
-- Idempotent (rejouable) ; lock_timeout 5 s. Après : redéployer l'orchestrateur d'avant (il lit cloud_ips.refus et
-- appelle les fonctions retirées).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Les données des ids 1 à 4 ──────────────────────────────────────────────
DO $do$
DECLARE n integer;
BEGIN
  UPDATE public.cloud_ips SET etat = 'rebut', rebut_critere = 'blocage_anti_robot',
         rebut_le = '2026-11-02 15:26:31.891826+00', maj_le = '2026-11-02 15:26:31.891826+00'
   WHERE id = 3 AND host(ip) = '81.181.239.136' AND etat = 'disponible' AND user_id IS NULL AND reserve_pour IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 3 AND etat <> 'rebut') THEN
    RAISE NOTICE 'id 3 : tenue ou réservée depuis la migration — laissée telle quelle';
  END IF;
  UPDATE public.cloud_ips SET etat = 'rebut', rebut_critere = 'blocage_anti_robot',
         rebut_le = '2026-11-02 11:58:43.045158+00', maj_le = '2026-11-02 11:58:43.045158+00'
   WHERE id = 4 AND host(ip) = '185.134.192.253' AND etat = 'disponible' AND user_id IS NULL AND reserve_pour IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 4 AND etat <> 'rebut') THEN
    RAISE NOTICE 'id 4 : tenue ou réservée depuis la migration — laissée telle quelle';
  END IF;
  UPDATE public.cloud_ips SET maj_le = '2026-11-03 14:58:44.574203+00'
   WHERE id = 1 AND host(ip) = '94.194.94.233' AND maj_le = '2026-11-03 15:37:37.796145+00';
  UPDATE public.cloud_ips SET maj_le = '2026-11-02 12:17:14.117312+00'
   WHERE id = 2 AND host(ip) = '185.134.194.88' AND maj_le = '2026-11-03 15:37:37.796145+00';
END
$do$;

-- ── 2. Les 4 fonctions d'avant (pg_get_functiondef, prod du 03/11 avant migration) ──

-- cloud_ip_signaler — source : pg_get_functiondef, prod du 03/11 avant la migration (copie telle quelle)
CREATE OR REPLACE FUNCTION public.cloud_ip_signaler(p_ip bigint, p_critere text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_nouvelle bigint;
BEGIN
  IF p_critere NOT IN ('blocage_anti_robot','captcha_repete','compte_restreint','liste_noire',
                       'sortie_non_conforme','controle_entree','manuel') THEN
    RAISE EXCEPTION 'cloud_ip_signaler : critère inconnu %', p_critere;
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  PERFORM public.cloud_journal(p_ip, 'signalement', v.user_id, jsonb_build_object('critere', p_critere, 'details', p_details, 'etat_avant', v.etat));
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', true, 'deja', v.etat); END IF;
  UPDATE public.cloud_ips
     SET etat = 'rebut', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL,
         rebut_critere = p_critere, rebut_le = now(), liberee_le = COALESCE(liberee_le, now()), maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'rebut', v.user_id, jsonb_build_object('critere', p_critere));
  IF v.user_id IS NOT NULL THEN
    v_nouvelle := public.cloud_ip_attribuer(v.user_id, CASE WHEN v.etat = 'attribuee_client' THEN 'client' ELSE 'essai' END);
  END IF;
  RETURN jsonb_build_object('ok', true, 'rebut', true, 'titulaire', v.user_id, 'nouvelle_ip', v_nouvelle);
END;
$function$;


-- cloud_ip_attribuer — source : pg_get_functiondef, prod du 03/11 avant la migration (copie telle quelle)
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint;
  v_retour boolean := false;
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
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
          jsonb_build_object('nature', p_nature));
  RETURN v_ip;
END;
$function$;


-- cloud_ip_reserver — source : pg_get_functiondef, prod du 03/11 avant la migration (copie telle quelle)
CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, i.expire_le, i.attributions, i.id
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


-- cloud_pool_etat — source : pg_get_functiondef, prod du 03/11 avant la migration (copie telle quelle)
CREATE OR REPLACE FUNCTION public.cloud_pool_etat()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'par_etat', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_ips GROUP BY etat) s), '{}'::jsonb),
    'attribuables_essai', (SELECT count(*) FROM public.cloud_ips i
                            WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai')),
    'reservees', (SELECT count(*) FROM public.cloud_ips WHERE reserve_pour IS NOT NULL AND reserve_jusqu_au > now()),
    'repos_prets_48h', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND repos_fin <= now() + interval '48 hours'),
    'purges_en_retard', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND purge_prouvee_le IS NULL
                           AND liberee_le < now() - interval '1 hour'),
    'en_attente', (SELECT count(*) FROM public.cloud_attente),
    'attente_max_h', (SELECT round(EXTRACT(EPOCH FROM now() - min(demande_le)) / 3600, 1) FROM public.cloud_attente),
    'comptes_sans_place', (SELECT count(*) FROM public.profiles p
                            WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now()
                                                          AND p.cloud_essai_arrete IS NOT TRUE))
                              AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)),
    'postes', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_postes GROUP BY etat) s), '{}'::jsonb),
    'commandes_en_cours', (SELECT COALESCE(sum(quantite), 0) FROM public.cloud_ip_commandes WHERE statut IN ('demandee', 'en_cours')),
    'echeances_3j', (SELECT count(*) FROM public.cloud_ips
                      WHERE etat IN ('attribuee_essai', 'attribuee_client')
                        AND expire_le <= now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3))),
    'rebuts_24h', (SELECT count(*) FROM public.cloud_ips WHERE rebut_le > now() - interval '24 hours'),
    'essais_7j', (SELECT count(*) FROM public.profiles WHERE cloud_essai_debut > now() - interval '7 days')
  );
$function$;

REVOKE ALL ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_attribuer(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_reserver(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_pool_etat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_attribuer(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_reserver(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_pool_etat() TO service_role;

-- ── 3. Les fonctions neuves ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cloud_ip_refus_noter_compte(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_refus_noter(bigint, text, text, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_refus_visite(bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_a_visiter(timestamptz);
DROP FUNCTION IF EXISTS public.cloud_ip_depense_ouvrir(text, integer, numeric, bigint, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_depense_fermer(bigint, text, text, numeric, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_depenses_mois(timestamptz);
DROP FUNCTION IF EXISTS public.cloud_ip_refus_prouve(jsonb);

-- ── 4. Le journal : natures neuves retirées, contrainte d'avant ──────────────
DELETE FROM public.cloud_ip_evenements WHERE nature IN ('refus', 'refus_leve', 'refus_prouve', 'visite_controle', 'depense');
ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT IF EXISTS cloud_ip_evenements_nature_check;
ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check CHECK (nature IN (
  'achat','controle_entree','reservation','attribution','retour_meme_compte','conversion','liberation','purge',
  'sortie_repos','signalement','rebut','renouvellement','identifiants_changes','expiration','incident'));

-- ── 5. Le registre des dépenses : colonnes neuves retirées (les lignes restent) ──
ALTER TABLE public.cloud_ip_commandes DROP CONSTRAINT IF EXISTS cloud_ip_commandes_nature;
DROP INDEX IF EXISTS public.cloud_ip_commandes_demandee;
ALTER TABLE public.cloud_ip_commandes DROP COLUMN IF EXISTS ip_id;
ALTER TABLE public.cloud_ip_commandes DROP COLUMN IF EXISTS nature;

-- ── 6. Le refus par plateforme ───────────────────────────────────────────────
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_refus_objet;
ALTER TABLE public.cloud_ips DROP COLUMN IF EXISTS refus;

-- ── 7. Les réglages neufs ────────────────────────────────────────────────────
DELETE FROM public.coin_config WHERE key IN ('cloud_ip_stock_min', 'cloud_ip_budget_mensuel_usd', 'cloud_ip_achats_auto',
  'cloud_ip_renouvellement_auto', 'cloud_ip_achat_max', 'cloud_ip_refus_revisite_jours');
COMMIT;
