-- ═══════════════════════════════════════════════════════════════════════════
-- LE 401 D'OPLA NE PROUVE RIEN — NI « À AUTORISER », NI « SESSION FERMÉE »
-- (2026-09-24, règle de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat, relu en base le 24/09 à 11:15 : la sonde du service worker de
-- l'extension répond 401 sur /api/public/me chez QUINZE comptes dont les
-- relevés et les dépôts, dans l'onglet, aboutissent — Nico (poste autorisé,
-- relevé de 8 annonces réussi la veille, 3 jobs retenus), xxewwer (relevé
-- réussi à 21:21, 401 à 21:39, même build), nadegemarcelin78 (524 dépôts
-- Opla), van-breugel.sandra, meminiandmove, laforge.vinted, lesforcesdelaudela…
-- La règle du 23/09 (« sonde_401 → a_autoriser ») affichait donc « Autoriser
-- Opla » (popup, écran Plateformes) à des postes qui avaient déjà l'accès, et
-- planifier_premiers_releves les tenait pour « pas_connectee ». Le service
-- worker ne porte pas la session de l'onglet : son 401 ne prouve rien.
--
-- Désormais, pour Opla :
--   · sonde `true`                                       → connectee (inchangé) ;
--   · sonde `false` + http = 'login_redirect_observee'   → a_connecter : la PAGE
--     de connexion a été vue par l'onglet (noterSessionDeconnectee) ;
--   · sonde `false` + code numérique (401…)              → AUCUN fait ;
--   · relevé « accès Opla non accordé »                  → a_autoriser (inchangé :
--     la permission manquait vraiment sur le poste qui relevait) ;
--   · relevé « session Opla refusée (HTTP 401) »         → a_connecter : l'API a
--     répondu 401 DANS L'ONGLET pendant le relevé (avant : a_autoriser) ;
--   · profiles.extension_postes (48 h, même fenêtre que postesVivants) : un
--     poste vu AVEC l'accès efface tout « a_autoriser » plus ancien que lui ;
--     aucun poste avec accès et un poste vu SANS → a_autoriser (motif
--     poste_sans_acces). C'est la seule source qui sait ce que Chrome a
--     accordé, poste par poste.
-- Corps repris de la prod (pg_get_functiondef, 24/09 11:40) et modifié aux
-- endroits marqués « (2026-09-24) ». planifier_premiers_releves ne change pas :
-- elle lit ce verdict. Les grants existants sont conservés par le REPLACE.
-- Côté serveur, le même 401 ne retient plus aucun job (get-pending-jobs) et ne
-- classe plus aucun échec (pas-de-rouge) ; la 0.6.65 ne l'écrit plus en `false`.

CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
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
  -- Postes de l'extension (2026-09-24) : la permission d'hôte opla.co se juge
  -- PAR POSTE (profiles.extension_postes), jamais par la sonde.
  v_postes jsonb; v_poste_ok_le timestamptz; v_poste_ko_le timestamptz;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT extension_sessions, COALESCE(platform_settings, '{}'::jsonb), extension_last_seen_at, extension_version, COALESCE(extension_postes, '{}'::jsonb)
    INTO v_s, v_ps, v_ext, v_ver, v_postes FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'profil_introuvable'); END IF;
  v_decl  := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur')  = 'array' THEN v_ps -> 'plateformes_vendeur'  ELSE '[]'::jsonb END;
  v_ecart := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  -- ebay_accounts est REVOKE pour authenticated (jetons OAuth) : lue par une
  -- fonction DEFINER qui ne rend QUE la date (2026-09-24). Avant, ce SELECT
  -- direct échouait « permission denied » sous l'app et sous le trigger du
  -- premier relevé : 2 128 échecs en 24 h, aucun relevé planifié à l'inscription.
  v_ebay_api := ebay_compte_relie_le(p_user);
  -- Le dernier poste vu AVEC l'accès Opla, et le dernier vu SANS (2026-09-24).
  -- 48 h : la fenêtre de postesVivants (_shared/poste-extension.ts). Une entrée
  -- illisible ne fait jamais tomber le verdict : on ne sait rien, c'est tout.
  BEGIN
    SELECT max((v ->> 'le')::timestamptz) FILTER (WHERE v ->> 'opla_acces' = 'true'),
           max((v ->> 'le')::timestamptz) FILTER (WHERE v ->> 'opla_acces' = 'false')
      INTO v_poste_ok_le, v_poste_ko_le
      FROM jsonb_each(CASE WHEN jsonb_typeof(v_postes) = 'object' THEN v_postes ELSE '{}'::jsonb END) AS e(k, v)
     WHERE jsonb_typeof(v) = 'object' AND NULLIF(v ->> 'le', '') IS NOT NULL
       AND (v ->> 'le')::timestamptz > now() - interval '48 hours';
  EXCEPTION WHEN OTHERS THEN v_poste_ok_le := NULL; v_poste_ko_le := NULL; END;
  FOREACH pf IN ARRAY ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'opla'] LOOP
    v_facts := '[]'::jsonb; v_best := NULL;
    v_declaree := v_decl ? pf; v_ecartee := v_ecart ? pf;
    v_etat := NULL; v_source := NULL; v_depuis := NULL; v_motif := NULL; v_action := NULL; v_action2 := NULL;
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
        ELSIF pf = 'opla' AND COALESCE(r.erreur, '') ~* 'acc[èe]s opla non accord' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_autoriser', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_opla_non_autorise');
        ELSIF pf = 'opla' AND COALESCE(r.erreur, '') ~* 'session opla refus[ée]+ \(HTTP 401\)' THEN
          -- (2026-09-24) L'API d'Opla a répondu 401 DANS L'ONGLET pendant le
          -- relevé : la permission était là (l'onglet s'est ouvert), c'est la
          -- session qui est fermée → « Me connecter », jamais « à autoriser ».
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_session_refusee');
        ELSIF r.status = 'absente' OR (COALESCE(r.items_vus, 0) = 0 AND COALESCE(r.erreur, '') ~* 'page de connexion') THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_mur_connexion',
                                                   'mur', CASE WHEN r.erreur ~* '\[mur:upgrade\]' THEN 'upgrade' WHEN r.erreur ~* '\[mur:reauth\]' THEN 'reauth' ELSE NULL END);
        END IF;
      END IF;
    END IF;
    SELECT COALESCE(published_at, created_at) INTO v_dep FROM cross_post_jobs
     WHERE user_id = p_user AND platform = pf AND status = 'published' AND action IN ('publish', 'republish')
       AND handler_build IS DISTINCT FROM 'releve-annonces'
       AND COALESCE(published_at, created_at) > now() - interval '72 hours'
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1;
    IF FOUND THEN
      v_facts := v_facts || jsonb_build_object('src', 'depot', 'etat', 'connectee', 'at', v_dep, 'motif', 'depot_reussi');
    END IF;
    v_sonde_v := v_s ->> pf; v_http := v_s -> 'http' ->> pf; v_hub := v_s ->> 'ebay_hub'; v_mur := v_s ->> 'ebay_hub_mur';
    BEGIN
      v_sonde_ts := NULLIF(COALESCE(v_s -> 'checked_at_par_plateforme' ->> pf, v_s ->> 'checked_at'), '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN v_sonde_ts := NULL; END;
    IF v_sonde_ts IS NOT NULL THEN
      IF pf = 'ebay' THEN
        IF v_hub = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'hub_vendeur_ouvert');
        ELSIF v_sonde_v = 'false' OR v_hub = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee', 'mur', v_mur);
        END IF;
      ELSIF pf = 'opla' THEN
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' AND v_http = 'login_redirect_observee' THEN
          -- (2026-09-24) Seule la PAGE prouve une session fermée : ce code est
          -- posé par noterSessionDeconnectee quand l'onglet a VU la page de
          -- connexion. Un `false` avec un code numérique (le 401 de la sonde du
          -- service worker, écrit par les extensions ≤ 0.6.64) ne produit
          -- AUCUN fait : il ne prouve ni « à autoriser », ni « fermée ».
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'page_connexion_vue');
        END IF;
      ELSE
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee');
        END IF;
      END IF;
    END IF;
    -- (2026-09-24) OPLA : LA PERMISSION SE JUGE PAR POSTE. Un poste vu AVEC
    -- l'accès (48 h) efface tout « a_autoriser » plus ancien que cette preuve
    -- — « Autoriser Opla » ne s'affiche jamais à un compte dont un poste a
    -- l'accès. Aucun poste avec accès, et un poste vu SANS → « à autoriser »,
    -- daté de cette observation.
    IF pf = 'opla' THEN
      BEGIN
        IF v_poste_ok_le IS NOT NULL THEN
          SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_facts FROM jsonb_array_elements(v_facts) f
           WHERE NOT (f ->> 'etat' = 'a_autoriser' AND (f ->> 'at')::timestamptz <= v_poste_ok_le);
        ELSIF v_poste_ko_le IS NOT NULL THEN
          v_facts := v_facts || jsonb_build_object('src', 'poste', 'etat', 'a_autoriser', 'at', v_poste_ko_le, 'motif', 'poste_sans_acces');
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
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
    v_action := CASE v_etat
      WHEN 'a_connecter' THEN CASE WHEN pf = 'ebay' THEN 'relier_ebay' ELSE 'connexion' END
      WHEN 'a_autoriser' THEN CASE WHEN pf = 'opla' THEN 'autoriser_opla' ELSE 'connexion' END
      ELSE NULL END;
    -- Compte eBay relié par l'API mais session eBay FERMÉE dans Chrome
    -- (sonde false) : l'état reste « connectée », et « Me connecter » est
    -- proposé en action secondaire — le relevé passe par le navigateur (2026-09-24).
    v_action2 := CASE WHEN v_etat = 'a_connecter' AND pf = 'ebay' THEN 'connexion'
                      WHEN pf = 'ebay' AND v_source = 'api' AND v_sonde_v = 'false' THEN 'connexion'
                      ELSE NULL END;
    v_out := v_out || jsonb_build_object(pf, jsonb_strip_nulls(jsonb_build_object(
      'etat', v_etat, 'action', v_action, 'action_secondaire', v_action2,
      'source', v_source, 'depuis', v_depuis, 'motif', v_motif,
      'mur', v_best ->> 'mur',
      'declaree', v_declaree, 'ecartee', v_ecartee,
      'sonde', v_sonde_v, 'http', v_http, 'sonde_le', v_sonde_ts,
      'postes', CASE WHEN pf = 'opla' THEN NULLIF(jsonb_strip_nulls(jsonb_build_object('acces_vu_le', v_poste_ok_le, 'sans_acces_vu_le', v_poste_ko_le)), '{}'::jsonb) ELSE NULL END,
      'faits', v_facts)));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'calcule_le', now(), 'extension_vue_le', v_ext, 'extension_version', v_ver,
                            'plateformes', v_out);
END;
$$;

COMMENT ON FUNCTION public.plateformes_verite(uuid) IS
  'Un état et une action par plateforme, tranchés une fois pour tous les écrans (relevé > dépôt > sonde). Opla (2026-09-24) : le 401 de la sonde du service worker ne prouve rien — seule la page vue (login_redirect_observee, relevé 401 dans l''onglet) dit « à connecter », seul profiles.extension_postes dit « à autoriser ».';
