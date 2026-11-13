-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113213000_plateformes_verite_action_reussie — UNE ACTION RÉUSSIE PROUVE LA CONNEXION (13/11/2026, DET)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2e réponse de Nico du 13/11 : « DÉTECTION DE CONNEXION : LE CAS ed4531e2. Il était connecté à Vinted (ventes lues, 2
-- publications réussies), mais la sonde ne le voyait pas, donc jamais de première synchro. C'est le vieux problème du 403,
-- il doit être fermé pour de bon : une action réussie sur une plateforme (vente lue, publication, relevé) prouve la
-- connexion et compte comme session vue ; jamais de « pas connecté » affiché à quelqu'un qui vient de réussir une
-- action. » Et : « Les 52 comptes sans plateforme choisie : oui, les plateformes qu'ils utilisent comptent comme choisies. »
--
-- CAUSE (définition de PROD de plateformes_verite, pg_get_functiondef lu le 13/11, md5 ab921e5456a2f763c77b5b3ff4921506) :
-- la vérité ne compte que le relevé (le dernier), le dépôt de moins de 72 h et la sonde ; la vente lue et le retrait fait
-- n'y sont pas ; une sonde « déconnectée » plus récente l'emporte sur une action réussie d'une heure ; un compte sans
-- plateforme choisie n'a aucune plateforme « déclarée ».
--
-- CE QUI CHANGE (rien d'autre ; réécrite DEPUIS la définition de prod, chaque bloc d'avant à l'octet) :
--   · faits « vente » (vente lue) et « retrait » (retrait fait par FillSell), 30 jours ; le dépôt compte 30 jours (publié
--     ou vendu depuis) au lieu de 72 h (publié) — Opla : inchangée ;
--   · garde de 24 h : une sonde « déconnectée » (hors page de connexion vue pendant une tâche) ne l'emporte pas sur une
--     action réussie de moins de 24 h ;
--   · compte sans plateforme choisie : « declaree » vraie pour une plateforme utilisée (relevé fait, annonce publiée ou
--     vendue, action réussie), avec choisie_par « utilisation » ;
--   · « preuves_action »: true dans la réponse (la règle JS de _shared/preuve-action.js ne relit plus rien).
-- Droits inchangés (CREATE OR REPLACE : postgres, authenticated, service_role). Fonction INVOKER : les lectures neuves
-- passent par la RLS de la personne (usage_logs, cross_post_jobs : ses lignes).
-- Banc : node scripts/essais/20261113213000_banc.mjs (Postgres jetable). Verrou : npm run selftest:action-reussie-session-vue.
-- ⛔ NON APPLIQUÉE : feu vert explicite de Nico, puis
--    npx supabase db query --linked -f supabase/migrations/20261113213000_plateformes_verite_action_reussie.sql
--    npx supabase migration repair --linked --status applied 20261113213000
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE v text;
BEGIN
  SELECT replace(pg_get_functiondef('public.plateformes_verite(uuid)'::regprocedure), chr(13), '') INTO v;
  -- Rejouée : le corps porte déjà la règle du 13/11 (rien ne change). Sinon : la définition de prod lue le 13/11, seule.
  IF v NOT LIKE '%preuves_action%' AND md5(v) <> 'ab921e5456a2f763c77b5b3ff4921506' THEN
    RAISE EXCEPTION 'plateformes_verite a changé en prod depuis sa lecture du 13/11 : régénérer 20261113213000 depuis pg_get_functiondef';
  END IF;
  IF to_regprocedure('public.ebay_compte_relie_le(uuid)') IS NULL OR to_regprocedure('public.depop_autorise(uuid)') IS NULL
     OR to_regclass('public.usage_logs') IS NULL OR to_regclass('public.cross_post_jobs') IS NULL OR to_regclass('public.vinted_sync_runs') IS NULL THEN
    RAISE EXCEPTION 'une fonction ou une table lue par 20261113213000 manque';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
  -- (13/11/2026, 2e réponse de Nico — DET, cas ed4531e2) UNE ACTION RÉUSSIE PROUVE LA CONNEXION.
  v_pfs text[];
  v_ventes jsonb := '{}'::jsonb; v_depots jsonb := '{}'::jsonb; v_retraits jsonb := '{}'::jsonb;
  v_succes jsonb; v_choix_vide boolean; v_utilisee boolean;
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
  v_pfs := ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'opla']
      -- (09/10) Depop : seulement pour un compte autorisé (depop_autorise).
      || CASE WHEN public.depop_autorise(p_user) THEN ARRAY['depop'] ELSE ARRAY[]::text[] END;
  -- ══ (13/11/2026, 2e réponse de Nico — DET, cas ed4531e2) UNE ACTION RÉUSSIE PROUVE LA CONNEXION ══════════════════
  -- « Une action réussie sur une plateforme (vente lue, publication, relevé) prouve la connexion et compte comme session
  -- vue ; jamais de « pas connecté » affiché à quelqu'un qui vient de réussir une action. » ed4531e2 : publications Vinted
  -- réussies le 18/10, ventes lues le 18/10 et le 22/10, sonde 403 → « inconnue » dès le 21/10 (le dépôt ne comptait que
  -- 72 h, la vente lue jamais). Lues UNE fois ici (30 jours, index usage_logs_user_feature_created / user_status) :
  --   · vente lue : usage_logs releve_ventes sans motif, ou au moins une vente lue (une 400, 403, « jeton_absent »… rien) ;
  --   · dépôt : publish / republish publié ou vendu depuis, published_at (jamais une annonce importée par un relevé) ;
  --   · retrait fait PAR FillSell : delete « deleted », retrait_par = fillsell (« déjà hors ligne » ne prouve rien).
  -- Un fait « connectée » daté de plus : < 7 jours connectée, 7 à 30 jours « à vérifier » (la règle du 27/09, inchangée).
  -- La même règle, en JS, complète la vérité tant que cette migration n'est pas appliquée (_shared/preuve-action.js :
  -- app, popup, première synchro) ; la marque preuves_action lui dit de ne plus rien relire. Opla (quittée le 10/10) :
  -- inchangée. Illisible → aucun fait (jamais une erreur).
  BEGIN
    SELECT COALESCE(jsonb_object_agg(x.pf, x.le), '{}'::jsonb) INTO v_ventes FROM (
      SELECT u.metadata ->> 'plateforme' AS pf, max(u.created_at) AS le FROM usage_logs u
       WHERE u.user_id = p_user AND u.feature = 'releve_ventes'
         AND u.created_at > now() - interval '30 days' AND u.created_at <= now() + interval '1 minute'
         AND NULLIF(u.metadata ->> 'plateforme', '') IS NOT NULL
         AND (btrim(COALESCE(u.metadata ->> 'motif', '')) = ''
              OR (CASE WHEN COALESCE(u.metadata ->> 'lues', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN (u.metadata ->> 'lues')::numeric ELSE 0 END) > 0)
       GROUP BY 1) x;
  EXCEPTION WHEN OTHERS THEN v_ventes := '{}'::jsonb; END;
  BEGIN
    SELECT COALESCE(jsonb_object_agg(x.pf, x.le), '{}'::jsonb) INTO v_depots FROM (
      SELECT j.platform AS pf, max(j.published_at) AS le FROM cross_post_jobs j
       WHERE j.user_id = p_user AND j.status IN ('published', 'sold') AND j.action IN ('publish', 'republish')
         AND j.handler_build IS DISTINCT FROM 'releve-annonces'
         AND j.published_at > now() - interval '30 days' AND j.published_at <= now() + interval '1 minute'
       GROUP BY 1) x;
  EXCEPTION WHEN OTHERS THEN v_depots := '{}'::jsonb; END;
  BEGIN
    SELECT COALESCE(jsonb_object_agg(y.pf, y.le), '{}'::jsonb) INTO v_retraits FROM (
      SELECT z.pf, max(z.le) AS le FROM (
        SELECT j.platform AS pf,
               CASE WHEN COALESCE(j.platform_fields ->> 'processing_since', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
                    THEN (j.platform_fields ->> 'processing_since')::timestamptz ELSE j.created_at END AS le
          FROM cross_post_jobs j
         WHERE j.user_id = p_user AND j.status = 'deleted' AND j.action = 'delete'
           AND j.platform_fields ->> 'retrait_par' = 'fillsell' AND j.created_at > now() - interval '30 days') z
       WHERE z.le > now() - interval '30 days' AND z.le <= now() + interval '1 minute'
       GROUP BY 1) y;
  EXCEPTION WHEN OTHERS THEN v_retraits := '{}'::jsonb; END;
  -- (13/11, décision de Nico) Aucune plateforme choisie (plateformes_vendeur absent ou vide) : celles que le compte
  -- UTILISE comptent comme choisies (« declaree », choisie_par « utilisation ») — platform_settings n'est jamais écrit.
  v_choix_vide := NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_decl) d(x) WHERE d.x = ANY (v_pfs));
  FOREACH pf IN ARRAY v_pfs LOOP
    v_facts := '[]'::jsonb; v_best := NULL; v_succes := NULL; v_utilisee := false;
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
    IF pf = 'opla' THEN
      SELECT COALESCE(published_at, created_at) INTO v_dep FROM cross_post_jobs
       WHERE user_id = p_user AND platform = pf AND status = 'published' AND action IN ('publish', 'republish')
         AND handler_build IS DISTINCT FROM 'releve-annonces'
         AND COALESCE(published_at, created_at) > now() - interval '72 hours'
       ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1;
      IF FOUND THEN
        v_facts := v_facts || jsonb_build_object('src', 'depot', 'etat', 'connectee', 'at', v_dep, 'motif', 'depot_reussi');
      END IF;
    ELSE
      -- (13/11) Le dépôt compte 30 jours (publié ou vendu depuis), comme le relevé : < 7 j connectée, puis « à vérifier ».
      v_dep := NULLIF(v_depots ->> pf, '')::timestamptz;
      IF v_dep IS NOT NULL THEN
        v_facts := v_facts || jsonb_build_object('src', 'depot', 'etat', 'connectee', 'at', v_dep, 'motif', 'depot_reussi');
      END IF;
      IF NULLIF(v_ventes ->> pf, '') IS NOT NULL THEN
        v_facts := v_facts || jsonb_build_object('src', 'vente', 'etat', 'connectee', 'at', (v_ventes ->> pf)::timestamptz, 'motif', 'vente_lue');
      END IF;
      IF NULLIF(v_retraits ->> pf, '') IS NOT NULL THEN
        v_facts := v_facts || jsonb_build_object('src', 'retrait', 'etat', 'connectee', 'at', (v_retraits ->> pf)::timestamptz, 'motif', 'retrait_fait');
      END IF;
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
    -- (13/11) LA GARDE DE 24 H : une SONDE « déconnectée » (jamais une page de connexion vue pendant une tâche,
    -- login_redirect_observee, ni un relevé tombé sur un mur — des actions ratées, qui gardent leur verdict) ne contredit
    -- pas une action réussie de moins de 24 h : la lecture des ventes repasse toutes les 20 h, un vendeur dont les actions
    -- réussissent n'entend donc jamais « pas connecté » d'une sonde ; au-delà, le fait le plus récent tranche, comme avant.
    IF pf <> 'opla' AND v_best IS NOT NULL AND v_best ->> 'src' = 'sonde' AND v_best ->> 'etat' = 'a_connecter'
       AND COALESCE(v_http, '') <> 'login_redirect_observee' THEN
      SELECT f INTO v_succes FROM jsonb_array_elements(v_facts) f
       WHERE f ->> 'etat' = 'connectee' AND f ->> 'src' IN ('releve', 'depot', 'vente', 'retrait')
         AND (f ->> 'at')::timestamptz > now() - interval '24 hours'
       ORDER BY (f ->> 'at')::timestamptz DESC LIMIT 1;
      IF v_succes IS NOT NULL THEN v_best := v_succes; END IF;
    END IF;
    IF v_choix_vide AND NOT v_ecartee AND pf <> 'opla' THEN
      v_utilisee := EXISTS (SELECT 1 FROM jsonb_array_elements(v_facts) f
                             WHERE f ->> 'etat' = 'connectee' AND f ->> 'src' IN ('releve', 'depot', 'vente', 'retrait'))
        OR EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.platform = pf AND j.status IN ('published', 'sold'))
        OR EXISTS (SELECT 1 FROM vinted_sync_runs vr WHERE vr.user_id = p_user AND vr.status = 'done'
                    AND ((pf = 'vinted' AND vr.kind = 'dressing') OR (pf <> 'vinted' AND vr.kind = 'annonces' AND vr.platform = pf)));
    END IF;
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
    -- (2026-09-27, GO Nico) UNE PREUVE DE PLUS DE 7 JOURS NE VAUT PLUS « CONNECTÉE ».
    -- ltouze : « connectée » sur un relevé du 13/09 pendant que la sonde
    -- répondait 403 depuis deux jours. Un relevé, un dépôt ou une sonde de plus
    -- de 7 jours dit ce qui ÉTAIT vrai, pas ce qui l'est : l'état devient
    -- « à vérifier » (motif preuve_perimee), la date de la preuve reste lisible.
    -- Ne touche ni « écartée » ni eBay relié par l'API (source api), ni les
    -- murs (« à connecter » / « à autoriser » restent affichés tels quels) ; le
    -- parcage « connexion » et les relances lisent extension_sessions, pas ceci.
    -- (13/11) La vente lue et le retrait fait périment comme le relevé et le dépôt : 7 jours, puis « à vérifier ».
    IF v_etat = 'connectee' AND v_source IN ('releve', 'depot', 'sonde', 'vente', 'retrait')
       AND v_depuis IS NOT NULL AND v_depuis < now() - interval '7 days' THEN
      v_etat := 'a_verifier'; v_motif := 'preuve_perimee';
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
      'declaree', v_declaree OR v_utilisee, 'ecartee', v_ecartee,
      'choisie_par', CASE WHEN v_utilisee AND NOT v_declaree THEN 'utilisation' END,
      'sonde', v_sonde_v, 'http', v_http, 'sonde_le', v_sonde_ts,
      'postes', CASE WHEN pf = 'opla' THEN NULLIF(jsonb_strip_nulls(jsonb_build_object('acces_vu_le', v_poste_ok_le, 'sans_acces_vu_le', v_poste_ko_le)), '{}'::jsonb) ELSE NULL END,
      'faits', v_facts)));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'calcule_le', now(), 'extension_vue_le', v_ext, 'extension_version', v_ver,
                            'preuves_action', true,
                            'plateformes', v_out);
END;
$function$
;

COMMIT;
