-- ═══════════════════════════════════════════════════════════════════════════
-- L'ÉCRAN PLATEFORMES NE MENT PLUS, ET LE PREMIER RELEVÉ PART TOUT SEUL
-- (2026-09-23 — le cas Marine Rocher, graph.studio25@gmail.com)
-- ═══════════════════════════════════════════════════════════════════════════
-- LES FAITS, LUS EN BASE LE 23/09 :
--   · eBay affiché « Connectée » chez QUELQU'UN QUI N'A PAS DE COMPTE eBay.
--     La sonde de session eBay teste /sl/prelist/suggest : une page PUBLIQUE,
--     200 sur ebay.fr avec ou sans compte. Sur les 16 inscrits des 22-23/09,
--     `extension_sessions.ebay = true` pour les 16 — y compris ceux dont le
--     relevé dit « session ebay : page de connexion [mur:reauth] ».
--   · Opla affiché « Session fermée » + « Se connecter » sur une sonde 401 :
--     ce n'est pas une session à ouvrir, c'est FillSell à AUTORISER.
--   · 5 inscrits avec l'extension et une plateforme connectée n'ont JAMAIS eu
--     de relevé : le premier relevé n'était lancé que par l'écran du parcours,
--     s'il était encore ouvert quand l'extension apparaissait.
--
-- CE QUE POSE CETTE MIGRATION (aucune table, aucune colonne, aucune policy) :
--   1. plateforme_ecarter(pf, bool) — « Je ne vends pas sur X ». Rangé dans
--      profiles.platform_settings.plateformes_ecartees (le sac de préférences
--      qui existe déjà). Annule les demandes de relevé EN FILE de la
--      plateforme, ne supprime rien, réversible.
--   2. plateformes_verite(user) — UN état par plateforme, UNE action. Le fait
--      le plus RÉCENT et le plus PRÉCIS gagne : relevé > dépôt réussi > sonde,
--      à égalité de date. eBay n'est JAMAIS « connectée » sur une simple page
--      200 : il faut le Hub vendeur ouvert, un relevé réussi, un dépôt, ou le
--      compte relié par l'API. Opla 401 = « à autoriser », pas « à connecter ».
--      États : connectee · a_connecter · a_autoriser · ecartee · inconnue.
--   3. planifier_premiers_releves(user) — dès que l'extension est vue et
--      qu'une plateforme est déclarée ou connectée, le PREMIER relevé de
--      chaque plateforme part tout seul (file vinted_sync_runs, servie par
--      get-pending-jobs). Jamais deux fois : un run existant, en file ou
--      terminé, suffit à ne rien refaire. Une plateforme PROUVÉE déconnectée
--      n'est pas relevée pour rien ; une plateforme incertaine l'est, parce
--      que le relevé est la sonde la plus précise qu'on ait.
--   4. Le déclencheur : profiles, après mise à jour de extension_sessions,
--      extension_last_seen_at ou platform_settings. Il ne fait JAMAIS échouer
--      l'écriture de l'extension (bloc EXCEPTION).
--   5. entonnoir_inscrits — la vue de l'entonnoir, un inscrit par ligne :
--      inscrit → extension → plateformes déclarées / connectées → 1er relevé
--      demandé / réussi → stock → 1re action. service_role seulement.
--
-- SÉCURITÉ, ET POURQUOI AUCUNE FONCTION N'EST SECURITY DEFINER ICI : tout ce
-- que ces fonctions lisent ou écrivent appartient déjà à la personne connectée
-- (RLS propriétaire sur profiles, vinted_sync_runs, cross_post_jobs, inventaire,
-- ebay_accounts ; coin_config lisible). SECURITY INVOKER suffit, et les
-- advisors restent identiques avant et après (aucune nouvelle fonction
-- DEFINER exposée). search_path posé partout.

-- ── 1. « JE NE VENDS PAS SUR X » ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plateforme_ecarter(p_platform text, p_ecarter boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ps   jsonb; v_liste jsonb; v_n integer := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  SELECT COALESCE(platform_settings, '{}'::jsonb) INTO v_ps FROM profiles WHERE id = v_user FOR UPDATE;
  v_liste := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  -- Idempotent : on retire, puis on remet si c'est demandé.
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_liste FROM jsonb_array_elements(v_liste) e WHERE (e #>> '{}') <> v_pf;
  IF p_ecarter THEN v_liste := v_liste || to_jsonb(v_pf); END IF;
  UPDATE profiles SET platform_settings = v_ps || jsonb_build_object('plateformes_ecartees', v_liste) WHERE id = v_user;
  IF p_ecarter THEN
    -- Une plateforme écartée cesse d'être relevée : les demandes EN FILE
    -- tombent. Rien d'autre n'est touché — pas une annonce, pas un article.
    UPDATE vinted_sync_runs
       SET status = 'cancelled', finished_at = now(), updated_at = now(),
           erreur = 'plateforme écartée par l''utilisateur (« je ne vends pas sur ' || v_pf || ' »)'
     WHERE user_id = v_user AND status = 'queued'
       AND ((kind = 'annonces' AND platform = v_pf) OR (kind = 'dressing' AND v_pf = 'vinted'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'plateforme', v_pf, 'ecartee', p_ecarter, 'ecartees', v_liste, 'demandes_annulees', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.plateforme_ecarter(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_ecarter(text, boolean) TO authenticated, service_role;

-- ── 2. LA VÉRITÉ D'UNE PLATEFORME — un état, une action ────────────────────
CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_s jsonb; v_ps jsonb; v_ext timestamptz; v_ver text;
  v_decl jsonb; v_ecart jsonb;
  v_ebay_api timestamptz;
  v_out jsonb := '{}'::jsonb;
  pf text;
  v_facts jsonb; v_best jsonb;
  r record; v_dep timestamptz;
  v_sonde_v text; v_sonde_ts timestamptz; v_http text; v_hub text; v_mur text;
  v_etat text; v_source text; v_depuis timestamptz; v_motif text; v_action text; v_action2 text;
  v_declaree boolean; v_ecartee boolean;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT extension_sessions, COALESCE(platform_settings, '{}'::jsonb), extension_last_seen_at, extension_version
    INTO v_s, v_ps, v_ext, v_ver FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'profil_introuvable'); END IF;
  v_decl  := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur')  = 'array' THEN v_ps -> 'plateformes_vendeur'  ELSE '[]'::jsonb END;
  v_ecart := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  SELECT connected_at INTO v_ebay_api FROM ebay_accounts e
   WHERE e.user_id = p_user AND e.revoked_at IS NULL
     AND COALESCE(e.refresh_token_expires_at, now() + interval '1 day') > now()
   ORDER BY connected_at DESC NULLS LAST LIMIT 1;

  FOREACH pf IN ARRAY ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'opla'] LOOP
    v_facts := '[]'::jsonb; v_best := NULL;
    v_declaree := v_decl ? pf; v_ecartee := v_ecart ? pf;
    v_etat := NULL; v_source := NULL; v_depuis := NULL; v_motif := NULL; v_action := NULL; v_action2 := NULL;

    -- (a) LE DERNIER RELEVÉ — le fait le plus précis : c'est la page elle-même.
    IF pf = 'vinted' THEN
      SELECT status, erreur, finished_at, started_at, items_vus INTO r FROM vinted_sync_runs
       WHERE user_id = p_user AND kind = 'dressing' AND status IN ('done', 'failed')
       ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST LIMIT 1;
      IF FOUND THEN
        IF r.status = 'done' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'connectee', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_reussi', 'items', r.items_vus);
        ELSIF COALESCE(r.erreur, '') ~* 'cause403|aucune session vinted|session vinted.{0,40}401|session_absente' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_mur_connexion');
        END IF;
      END IF;
    ELSE
      SELECT status, erreur, finished_at, started_at, items_vus INTO r FROM vinted_sync_runs
       WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND status IN ('done', 'failed', 'absente')
       ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST LIMIT 1;
      IF FOUND THEN
        IF r.status = 'done' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'connectee', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_reussi', 'items', r.items_vus);
        ELSIF pf = 'opla' AND COALESCE(r.erreur, '') ~* 'acc[èe]s opla non accord|session opla refus' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_autoriser', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_opla_non_autorise');
        ELSIF r.status = 'absente' OR (COALESCE(r.items_vus, 0) = 0 AND COALESCE(r.erreur, '') ~* 'page de connexion') THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_mur_connexion',
                                                   'mur', CASE WHEN r.erreur ~* '\[mur:upgrade\]' THEN 'upgrade' WHEN r.erreur ~* '\[mur:reauth\]' THEN 'reauth' ELSE NULL END);
        END IF;
      END IF;
    END IF;

    -- (b) UN DÉPÔT RÉUSSI DE MOINS DE 72 H prouve la session (règle du 15/09).
    SELECT COALESCE(published_at, created_at) INTO v_dep FROM cross_post_jobs
     WHERE user_id = p_user AND platform = pf AND status = 'published' AND action IN ('publish', 'republish')
       AND handler_build IS DISTINCT FROM 'releve-annonces'
       AND COALESCE(published_at, created_at) > now() - interval '72 hours'
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1;
    IF FOUND THEN
      v_facts := v_facts || jsonb_build_object('src', 'depot', 'etat', 'connectee', 'at', v_dep, 'motif', 'depot_reussi');
    END IF;

    -- (c) LA SONDE — ce que l'extension a mesuré, avec sa date PAR plateforme.
    v_sonde_v := v_s ->> pf; v_http := v_s -> 'http' ->> pf; v_hub := v_s ->> 'ebay_hub'; v_mur := v_s ->> 'ebay_hub_mur';
    BEGIN
      v_sonde_ts := NULLIF(COALESCE(v_s -> 'checked_at_par_plateforme' ->> pf, v_s ->> 'checked_at'), '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN v_sonde_ts := NULL; END;
    IF v_sonde_ts IS NOT NULL THEN
      IF pf = 'ebay' THEN
        -- ⛔ `ebay = true` SEUL NE PROUVE RIEN : /sl/prelist/suggest répond 200
        --    sans compte. Seul le Hub vendeur ouvert compte comme connexion.
        IF v_hub = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'hub_vendeur_ouvert');
        ELSIF v_sonde_v = 'false' OR v_hub = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee', 'mur', v_mur);
        END IF;
      ELSIF pf = 'opla' THEN
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' THEN
          -- 401 sur /api/public/me = FillSell n'est pas autorisé sur ce compte
          -- Opla. Ce n'est pas une session à ouvrir, c'est une autorisation.
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', CASE WHEN v_http = '401' THEN 'a_autoriser' ELSE 'a_connecter' END, 'at', v_sonde_ts, 'motif', CASE WHEN v_http = '401' THEN 'sonde_401' ELSE 'sonde_deconnectee' END);
        END IF;
      ELSE
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee');
        END IF;
      END IF;
    END IF;

    -- LE PLUS RÉCENT GAGNE ; à égalité de date, relevé > dépôt > sonde.
    SELECT f INTO v_best FROM jsonb_array_elements(v_facts) f
     ORDER BY (f ->> 'at')::timestamptz DESC NULLS LAST,
              CASE f ->> 'src' WHEN 'releve' THEN 0 WHEN 'depot' THEN 1 ELSE 2 END
     LIMIT 1;

    IF v_ecartee THEN
      v_etat := 'ecartee'; v_source := 'utilisateur'; v_motif := 'je_ne_vends_pas_ici';
    ELSIF pf = 'ebay' AND v_ebay_api IS NOT NULL THEN
      v_etat := 'connectee'; v_source := 'api'; v_depuis := v_ebay_api; v_motif := 'compte_relie_api';
    ELSIF v_best IS NULL THEN
      v_etat := 'inconnue'; v_motif := CASE WHEN v_ext IS NULL THEN 'extension_jamais_vue' ELSE 'pas_encore_verifiee' END;
    ELSE
      v_etat := v_best ->> 'etat'; v_source := v_best ->> 'src'; v_motif := v_best ->> 'motif';
      v_depuis := (v_best ->> 'at')::timestamptz;
    END IF;
    -- L'ACTION : une seule, nommée par ce qui manque — jamais « se connecter »
    -- quand c'est une autorisation.
    v_action := CASE v_etat
      WHEN 'a_connecter' THEN CASE WHEN pf = 'ebay' THEN 'relier_ebay' ELSE 'connexion' END
      WHEN 'a_autoriser' THEN CASE WHEN pf = 'opla' THEN 'autoriser_opla' ELSE 'connexion' END
      ELSE NULL END;
    v_action2 := CASE WHEN v_etat = 'a_connecter' AND pf = 'ebay' THEN 'connexion' ELSE NULL END;

    v_out := v_out || jsonb_build_object(pf, jsonb_strip_nulls(jsonb_build_object(
      'etat', v_etat, 'action', v_action, 'action_secondaire', v_action2,
      'source', v_source, 'depuis', v_depuis, 'motif', v_motif,
      'mur', v_best ->> 'mur',
      'declaree', v_declaree, 'ecartee', v_ecartee,
      'sonde', v_sonde_v, 'http', v_http, 'sonde_le', v_sonde_ts,
      'faits', v_facts)));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'calcule_le', now(), 'extension_vue_le', v_ext, 'extension_version', v_ver,
                            'plateformes', v_out);
END;
$$;
REVOKE ALL ON FUNCTION public.plateformes_verite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateformes_verite(uuid) TO authenticated, service_role;

-- ── 3. LE PREMIER RELEVÉ PART TOUT SEUL ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.planifier_premiers_releves(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_ext timestamptz; v_ver text; v_ps jsonb; v_s jsonb; v_verite jsonb;
  v_decl jsonb; v_ecart jsonb; v_min integer; v_code integer; v_multi boolean;
  v_out jsonb := '{}'::jsonb; pf text; v_etat text; v_id uuid;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT extension_last_seen_at, extension_version, COALESCE(platform_settings, '{}'::jsonb), extension_sessions
    INTO v_ext, v_ver, v_ps, v_s FROM profiles WHERE id = p_user;
  IF v_ext IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue'); END IF;
  v_decl  := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur')  = 'array' THEN v_ps -> 'plateformes_vendeur'  ELSE '[]'::jsonb END;
  v_ecart := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  v_verite := plateformes_verite(p_user);
  v_multi := sync_multi_ouverte_pour(p_user);
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  PERFORM purger_sync_queue_perimee(p_user);

  -- VINTED : le dressing. Déclarée ou vue connectée, jamais prouvée déconnectée,
  -- extension capable (≥ 0.5.0, cf. demander_sync_dressing), aucun run déjà.
  IF (v_ecart ? 'vinted') THEN
    v_out := v_out || jsonb_build_object('vinted', 'ecartee');
  ELSIF NOT ((v_decl ? 'vinted') OR (v_s ->> 'vinted') = 'true') THEN
    v_out := v_out || jsonb_build_object('vinted', 'non_declaree');
  ELSIF (v_s ->> 'vinted') = 'false' THEN
    v_out := v_out || jsonb_build_object('vinted', 'pas_connectee');
  ELSIF version_cle(v_ver) IS NULL OR version_cle(v_ver) < version_cle('0.5.0') THEN
    v_out := v_out || jsonb_build_object('vinted', 'extension_trop_ancienne');
  ELSIF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = 'dressing' AND status NOT IN ('expired', 'cancelled')) THEN
    v_out := v_out || jsonb_build_object('vinted', 'deja_un_releve');
  ELSE
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
      VALUES (p_user, 'dressing', 'queued', 'serveur:premier_releve', now()) RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object('vinted', 'queued');
    EXCEPTION WHEN unique_violation THEN v_out := v_out || jsonb_build_object('vinted', 'deja_en_file'); END;
  END IF;

  -- LES QUATRE AUTRES : « Mes annonces ». Déclarée ou connectée, pas écartée,
  -- pas PROUVÉE déconnectée ni à autoriser, extension ≥ borne, interrupteur
  -- ouvert, aucun run déjà (un run expiré ou annulé ne compte pas).
  FOREACH pf IN ARRAY ARRAY['leboncoin', 'beebs', 'ebay', 'opla'] LOOP
    v_etat := v_verite -> 'plateformes' -> pf ->> 'etat';
    IF (v_ecart ? pf) THEN v_out := v_out || jsonb_build_object(pf, 'ecartee'); CONTINUE; END IF;
    IF NOT v_multi THEN v_out := v_out || jsonb_build_object(pf, 'releve_ferme'); CONTINUE; END IF;
    IF v_min > 0 AND v_code < v_min THEN v_out := v_out || jsonb_build_object(pf, 'extension_trop_ancienne'); CONTINUE; END IF;
    IF NOT ((v_decl ? pf) OR v_etat = 'connectee') THEN v_out := v_out || jsonb_build_object(pf, 'non_declaree'); CONTINUE; END IF;
    IF v_etat IN ('a_connecter', 'a_autoriser') THEN v_out := v_out || jsonb_build_object(pf, 'pas_connectee'); CONTINUE; END IF;
    IF pf = 'ebay' AND (v_verite -> 'plateformes' -> 'ebay' ->> 'source') = 'api' AND (v_s ->> 'ebay_hub') IS DISTINCT FROM 'true' THEN
      -- Relié par l'API mais Hub vendeur pas prouvé : le relevé « Mes annonces »
      -- passe par le navigateur, on ne l'envoie pas buter sur un mur.
      v_out := v_out || jsonb_build_object(pf, 'api_sans_hub'); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND status NOT IN ('expired', 'cancelled')) THEN
      v_out := v_out || jsonb_build_object(pf, 'deja_un_releve'); CONTINUE;
    END IF;
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
      VALUES (p_user, 'annonces', pf, 'queued', 'serveur:premier_releve', now()) RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object(pf, 'queued');
    EXCEPTION WHEN unique_violation THEN v_out := v_out || jsonb_build_object(pf, 'deja_en_file'); END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'plateformes', v_out);
END;
$$;
REVOKE ALL ON FUNCTION public.planifier_premiers_releves(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planifier_premiers_releves(uuid) TO authenticated, service_role;

-- ── 4. LE DÉCLENCHEUR — jamais un échec pour l'écriture de l'extension ─────
CREATE OR REPLACE FUNCTION public.profiles_premiers_releves_trg_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM planifier_premiers_releves(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'planifier_premiers_releves(%) : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_premiers_releves_trg ON public.profiles;
CREATE TRIGGER profiles_premiers_releves_trg
AFTER UPDATE OF extension_last_seen_at, extension_sessions, platform_settings ON public.profiles
FOR EACH ROW
WHEN (NEW.extension_last_seen_at IS NOT NULL
      AND (OLD.extension_last_seen_at IS NULL
           OR OLD.extension_sessions IS DISTINCT FROM NEW.extension_sessions
           OR OLD.platform_settings IS DISTINCT FROM NEW.platform_settings))
EXECUTE FUNCTION public.profiles_premiers_releves_trg_fn();

-- ── 5. L'ENTONNOIR — un inscrit par ligne, les étapes datées ───────────────
CREATE OR REPLACE VIEW public.entonnoir_inscrits WITH (security_invoker = true) AS
SELECT p.id AS user_id, p.email, p.created_at AS inscrit_le,
       p.extension_last_seen_at IS NOT NULL AS extension_installee,
       p.extension_last_seen_at AS extension_vue_le, p.extension_version,
       p.onboarded_at AS parcours_termine_le,
       COALESCE(p.platform_settings -> 'plateformes_vendeur', '[]'::jsonb)  AS plateformes_declarees,
       COALESCE(p.platform_settings -> 'plateformes_ecartees', '[]'::jsonb) AS plateformes_ecartees,
       jsonb_build_object(
         'vinted',    (p.extension_sessions ->> 'vinted') = 'true',
         'leboncoin', (p.extension_sessions ->> 'leboncoin') = 'true',
         'ebay',      (p.extension_sessions ->> 'ebay_hub') = 'true'
                      OR EXISTS (SELECT 1 FROM ebay_accounts e WHERE e.user_id = p.id AND e.revoked_at IS NULL),
         'beebs',     (p.extension_sessions ->> 'beebs') = 'true',
         'opla',      (p.extension_sessions ->> 'opla') = 'true') AS plateformes_connectees,
       r.premier_releve_demande_le, r.premier_releve_reussi_le, r.releves_reussis, r.plateformes_relevees,
       i.stock_n, i.stock_premier_article_le,
       a.premiere_action_le, a.premiere_action
FROM profiles p
LEFT JOIN LATERAL (
  SELECT min(COALESCE(queued_at, started_at)) AS premier_releve_demande_le,
         min(finished_at) FILTER (WHERE status = 'done') AS premier_releve_reussi_le,
         count(*) FILTER (WHERE status = 'done') AS releves_reussis,
         jsonb_agg(DISTINCT COALESCE(platform, 'vinted')) FILTER (WHERE status = 'done') AS plateformes_relevees
    FROM vinted_sync_runs r WHERE r.user_id = p.id AND r.kind IN ('dressing', 'annonces')) r ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS stock_n, min(created_at) AS stock_premier_article_le
    FROM inventaire i WHERE i.user_id = p.id AND i.fusionne_dans IS NULL) i ON true
LEFT JOIN LATERAL (
  SELECT min(created_at) AS premiere_action_le,
         (array_agg(action || '/' || platform ORDER BY created_at))[1] AS premiere_action
    FROM cross_post_jobs j WHERE j.user_id = p.id AND j.handler_build IS DISTINCT FROM 'releve-annonces') a ON true
WHERE p.created_at >= '2026-09-01';
REVOKE ALL ON public.entonnoir_inscrits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.entonnoir_inscrits TO service_role;
