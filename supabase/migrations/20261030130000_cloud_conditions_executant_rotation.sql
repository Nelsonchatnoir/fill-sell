-- ═══════════════════════════════════════════════════════════════════════════
-- (30/10, lot D partie 2) FILLSELL CLOUD : CONDITIONS ACCEPTÉES, ÉTAT DE L'EXÉCUTANT, IP EN ROTATION
-- ═══════════════════════════════════════════════════════════════════════════
-- Cadre fixé par Nico le 30/10 :
--   · conditions d'utilisation du Cloud : case obligatoire à l'activation, DATE et VERSION d'acceptation enregistrées ;
--   · l'app montre l'état de l'exécutant (en marche, dernière action) ;
--   · IP françaises EN ROTATION au départ (le 05/10 c'était « une IP dédiée par compte ») : le fournisseur est isolé
--     dans UN module de l'orchestrateur (serveur-cloud/src/fournisseurIp.js) ; un compte actif n'a plus besoin d'une
--     IP attribuée pour être servi. Interrupteur : coin_config.cloud_ip_rotation (1 = rotation, 0 ou absent = le
--     modèle dédié du 05/10, inchangé).
-- Rien ne change pour les comptes sans Cloud (aucune colonne lue ailleurs ; seul Nico a l'option, en test).
-- Fonctions réécrites depuis pg_get_functiondef de la prod (md5 avant dans l'inverse).
-- Inverse : supabase/rollbacks/20261030130000_cloud_conditions_executant_rotation_INVERSE.sql

-- ── 1. Les conditions acceptées : version + date, écrites par le serveur seul ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cloud_cgu_version text,
  ADD COLUMN IF NOT EXISTS cloud_cgu_acceptee_le timestamptz;
COMMENT ON COLUMN public.profiles.cloud_cgu_version IS '(30/10, lot D) Version des conditions d''utilisation de FillSell Cloud acceptée (AAAA-MM-JJ), par la case de l''activation.';
COMMENT ON COLUMN public.profiles.cloud_cgu_acceptee_le IS '(30/10, lot D) Instant de cette acceptation (heure du serveur).';
REVOKE UPDATE (cloud_cgu_version, cloud_cgu_acceptee_le) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cloud_cgu_accepter_moi(p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_le timestamptz;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte'); END IF;
  IF COALESCE(p_version, '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('ok', false, 'raison', 'version_invalide'); END IF;
  UPDATE public.profiles SET cloud_cgu_version = p_version, cloud_cgu_acceptee_le = now()
   WHERE id = v_user
  RETURNING cloud_cgu_acceptee_le INTO v_le;
  IF v_le IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  RETURN jsonb_build_object('ok', true, 'version', p_version, 'le', v_le);
END $function$;
REVOKE ALL ON FUNCTION public.cloud_cgu_accepter_moi(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_cgu_accepter_moi(text) TO authenticated;

-- ── 2. L'état de l'exécutant, pour l'écran (le navigateur, sa dernière action, son dernier relevé) ────────
CREATE OR REPLACE FUNCTION public.cloud_executant_moi()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'poste', (SELECT jsonb_build_object('etat', po.etat, 'demarre_le', po.demarre_le, 'arrete_le', po.arrete_le,
                                        'derniere_activite', po.derniere_activite, 'derniere_erreur', po.derniere_erreur,
                                        'maj_le', po.maj_le)
                FROM public.cloud_postes po WHERE po.user_id = auth.uid()),
    'derniere_action', (SELECT jsonb_build_object('action', j.action, 'plateforme', j.platform, 'statut', j.status,
                                                  'le', COALESCE(j.published_at, j.last_checked_at, j.created_at))
                          FROM public.cross_post_jobs j
                         WHERE j.user_id = auth.uid() AND j.handler_build LIKE '%-cloud%'
                         ORDER BY COALESCE(j.published_at, j.last_checked_at, j.created_at) DESC NULLS LAST LIMIT 1),
    'dernier_releve', (SELECT jsonb_build_object('plateforme', r.platform, 'type', r.kind, 'statut', r.status, 'le', r.finished_at)
                         FROM public.vinted_sync_runs r
                        WHERE r.user_id = auth.uid() AND r.extension_build LIKE '%-cloud%' AND r.finished_at IS NOT NULL
                        ORDER BY r.finished_at DESC LIMIT 1))
   WHERE auth.uid() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.cloud_executant_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_executant_moi() TO authenticated;

-- ── 3. IP en rotation : un compte actif est servi sans IP attribuée (le module fournisseur choisit la sortie) ──
-- (prod md5 f855b5d636fe707bd7edfc660cf96850 avant)
CREATE OR REPLACE FUNCTION public.cloud_comptes_a_servir()
 RETURNS TABLE(user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text, session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH t AS (
    SELECT i.user_id AS u, i.id AS ip_id, host(i.ip) AS ip, i.port, public.cloud_etat(i.user_id) AS e
      FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
    UNION ALL
    -- (30/10, lot D) Rotation : les comptes actifs SANS IP attribuée, sortie choisie par l'orchestrateur.
    SELECT p.id, NULL::bigint, NULL::text, NULL::integer, public.cloud_etat(p.id)
      FROM public.profiles p
     WHERE public.cloud_param('ip_rotation', 0) = 1
       AND (p.is_cloud IS TRUE OR p.cloud_essai_debut IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i2 WHERE i2.user_id = p.id))
  SELECT t.u, t.ip_id, t.ip, t.port, t.e ->> 'etat', po.etat, po.session_fillsell_id,
         COALESCE((SELECT array_agg(c.plateforme ORDER BY c.plateforme) FROM public.cloud_coffre c
                    WHERE c.user_id = t.u AND c.connecte AND c.plateforme <> 'fillsell'), '{}'),
         NULLIF(public.cloud_param('delai_sessions_min', -1), -1)
    FROM t LEFT JOIN public.cloud_postes po ON po.user_id = t.u
   -- actif, ou essai fini pendant sa grâce (le navigateur peut finir ses jobs) ;
   -- un compte inactif hors grâce n'a déjà plus d'IP (cloud_compte_synchroniser).
   WHERE COALESCE((t.e ->> 'actif')::boolean, false) OR t.e ->> 'etat' = 'essai_termine';
$function$;

-- (prod md5 25a15729c1d785976ec23b63cdd240bc avant) — en rotation, la place ne manque jamais.
CREATE OR REPLACE FUNCTION public.cloud_essai_preparer_moi(p_appareil text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_trouve boolean; v_cloud boolean; v_debut timestamptz;
  v_h_app text; v_raison text; v_permis boolean := true; v_ip bigint;
  v_comptes jsonb := '[]'::jsonb; c record; v_h text;
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- La place d'abord : sans IP, rien ne démarre (ni essai, ni paiement) — sauf en rotation (30/10, lot D).
  IF NOT v_rotation THEN
    v_ip := public.cloud_ip_reserver(v_user);
    IF v_ip IS NULL THEN
      INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
      RETURN jsonb_build_object('ok', false, 'raison', 'pool_vide');
    END IF;
  END IF;
  DELETE FROM public.cloud_attente WHERE user_id = v_user;
  -- Les verrous de l'ESSAI (l'option, elle, reste possible).
  IF v_debut IS NOT NULL THEN
    v_permis := false; v_raison := 'essai_deja_pris';
  ELSIF COALESCE(btrim(p_appareil), '') = '' THEN
    v_permis := false; v_raison := 'appareil_inconnu';
  ELSE
    v_h_app := public.cloud_hacher('appareil', p_appareil);
    IF EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'appareil' AND empreinte = v_h_app
                 AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'appareil_deja_vu';
    END IF;
  END IF;
  -- Les comptes Vinted que l'extension de CE compte a déjà relevés (au plus 10).
  FOR c IN SELECT DISTINCT r.vinted_user_id::text AS ident FROM public.vinted_sync_runs r
            WHERE r.user_id = v_user AND r.vinted_user_id IS NOT NULL LIMIT 10 LOOP
    v_h := public.cloud_hacher('vinted', c.ident);
    CONTINUE WHEN v_h IS NULL;
    v_comptes := v_comptes || jsonb_build_object('plateforme', 'vinted', 'h', v_h);
    IF v_permis AND EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'compte_plateforme' AND empreinte = v_h
                              AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'compte_plateforme_deja_vu';
    END IF;
  END LOOP;
  INSERT INTO public.cloud_essai_demandes (user_id, appareil_h, comptes_h, essai_permis, raison)
  VALUES (v_user, v_h_app, v_comptes, v_permis, v_raison)
  ON CONFLICT (user_id) DO UPDATE SET appareil_h = EXCLUDED.appareil_h, comptes_h = EXCLUDED.comptes_h,
    essai_permis = EXCLUDED.essai_permis, raison = EXCLUDED.raison, demande_le = now();
  RETURN jsonb_build_object('ok', true, 'essai', v_permis, 'raison', v_raison,
    'place_jusqu_au', CASE WHEN v_ip IS NULL THEN NULL ELSE (SELECT reserve_jusqu_au FROM public.cloud_ips WHERE id = v_ip) END);
END;
$function$;

-- (prod md5 beed983f3aec22a5f215bfc6696367e3 avant) — en rotation, un compte actif n'attend jamais une IP.
CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e jsonb := public.cloud_etat(p_user);
  v_etat text := v_e ->> 'etat';
  v_actif boolean := COALESCE((v_e ->> 'actif')::boolean, false);
  v_ip public.cloud_ips%ROWTYPE;
  v_id bigint;
BEGIN
  SELECT * INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_actif THEN
    IF v_ip.id IS NULL THEN
      -- (30/10, lot D) Rotation : rien à attribuer, l'orchestrateur choisit la sortie à chaque session.
      IF public.cloud_param('ip_rotation', 0) = 1 THEN
        IF v_etat = 'essai' THEN PERFORM public.cloud_empreintes_engager(p_user); END IF;
        DELETE FROM public.cloud_attente WHERE user_id = p_user;
        RETURN jsonb_build_object('etat', v_etat, 'action', 'rotation');
      END IF;
      v_id := public.cloud_ip_attribuer(p_user, CASE WHEN v_etat = 'paye' THEN 'client' ELSE 'essai' END);
      IF v_etat = 'essai' THEN PERFORM public.cloud_empreintes_engager(p_user); END IF;
      DELETE FROM public.cloud_attente WHERE user_id = p_user AND v_id IS NOT NULL;
      RETURN jsonb_build_object('etat', v_etat, 'action', CASE WHEN v_id IS NULL THEN 'sans_place' ELSE 'attribuee' END, 'ip', v_id);
    END IF;
    IF v_etat = 'paye' AND v_ip.etat = 'attribuee_essai' THEN
      UPDATE public.cloud_ips SET etat = 'attribuee_client', derniere_origine = 'client', maj_le = now() WHERE id = v_ip.id;
      PERFORM public.cloud_journal(v_ip.id, 'conversion', p_user, '{}'::jsonb);
      RETURN jsonb_build_object('etat', v_etat, 'action', 'convertie', 'ip', v_ip.id);
    END IF;
    RETURN jsonb_build_object('etat', v_etat, 'action', 'rien', 'ip', v_ip.id);
  END IF;
  IF v_ip.id IS NULL THEN RETURN jsonb_build_object('etat', v_etat, 'action', 'rien'); END IF;
  IF v_etat = 'essai_termine'
     AND COALESCE((v_e ->> 'essaiArrete')::boolean, false) IS NOT TRUE
     AND public.cloud_ts(v_e ->> 'essaiFin') + make_interval(days => public.cloud_param('grace_jours', 2)) > now() THEN
    RETURN jsonb_build_object('etat', v_etat, 'action', 'grace', 'ip', v_ip.id);
  END IF;
  v_id := public.cloud_ip_liberer(p_user, 'inactif:' || COALESCE(v_etat, '?'));
  RETURN jsonb_build_object('etat', v_etat, 'action', 'repos', 'ip', v_id);
END;
$function$;

-- ── 4. Depop au coffre (30/10, lot D : un bouton « Me connecter » par plateforme) ─────────────────────────
-- Sans lui, la sauvegarde des cookies Depop serait refusée par la contrainte (vinted, leboncoin, beebs, fillsell).
ALTER TABLE public.cloud_coffre DROP CONSTRAINT IF EXISTS cloud_coffre_plateforme_check;
ALTER TABLE public.cloud_coffre ADD CONSTRAINT cloud_coffre_plateforme_check
  CHECK (plateforme = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'depop'::text, 'fillsell'::text]));

-- ── 5. L'interrupteur de la rotation : levé (décision de Nico du 30/10 : « IP en rotation au départ ») ──
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_rotation', 1)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
