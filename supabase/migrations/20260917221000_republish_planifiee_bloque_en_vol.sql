-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE — multi-boutiques : la garde anti-rafale ne compte
-- plus les jobs PARQUÉS, et elle DIT quand elle bloque.
-- 2026-09-17, diagnostic docs/REPUBLICATION_PLANIFIEE_MULTI_BOUTIQUES.md.
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI SE PASSAIT (Ornella, 4 créneaux « manqués » d'affilée, sautes = {}) :
-- 4 republications pending sur des articles de @ornella-vend pendant que
-- Chrome est sur @luciatrendyshop. get-pending-jobs les RETIENT (cloisonnement
-- boutique, aucune tentative consommée) ; l'étape 4 du sweep planifié
-- (« une republication en vol → rien ») les compte comme en vol et sort en
-- CONTINUE — le seul CONTINUE de la branche qui n'écrit AUCUNE note. Créneau
-- après créneau : 0 création, historique muet, `manque`.
--
-- CE QUI CHANGE (trois choses, rien d'autre) :
--   4. la garde ne compte que les republications Vinted qui PEUVENT bouger :
--      étape 'deleted' (annonce hors ligne — toujours bloquant, c'est
--      l'invariant une-passe) ou étape a_capturer/captured dont l'article n'a
--      pas de boutique / a la boutique connectée. Identité inconnue ou non
--      fraîche (republish_boutique_connectee → NULL) = tout compte, comme
--      avant : le mono-boutique ne change pas d'un iota. Quand elle bloque,
--      elle ÉCRIT `_bloque_en_vol` sur le créneau (mis à jour à chaque
--      passage, `leve_le` posé quand le blocage tombe) — l'app et l'historique
--      le lisent, le relevé le porte ;
--   6bis. le passage s'arrête à `prevues` (ce que l'app annonce) : sans cette
--      borne, 10 intervalles sur la fenêtre laissaient passer 11 créations
--      (Joe0410, 15/09 : 11 faites pour 10 prévues, 11e créée à 21:57) ;
--   etat. republish_planifiee_etat rend `faites_live` (jobs du créneau courant
--      déjà publiés) et `blocage` (la note courante), l'app FORMATE.
-- Les corps remplacés (sweep, etat) sont ceux des migrations du 12/09, dont
-- le md5 en prod a été vérifié IDENTIQUE au fichier le 17/09 : on repart du
-- texte réel. noter / cloturer / candidats : inchangés.
-- Idempotente. Retour arrière : rejouer 20260912130400 (sweep) et
-- 20260912130200 (etat).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  -- 17/09 : garde anti-rafale qui distingue, et qui parle.
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;

  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE COALESCE((p.platform_settings #> '{vinted,republish_planifiee}' ->> 'actif')::boolean, false)
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_regl := republish_planifiee_reglage(v_compte.id);
    -- Réglage invalide ou palier sans droit : actif = false ici, rien à faire.
    CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);

    -- 1. Historique : clôturer ce qui est passé.
    PERFORM republish_creneau_cloturer(v_compte.id);

    -- 2. Hors créneau → rien. (Aucune republication planifiée ne part hors du
    -- créneau choisi ; un créneau manqué n'est jamais rattrapé.)
    v_fen := republish_planifiee_fenetre(v_regl, now());
    CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

    v_ident    := republish_boutique_connectee(v_compte.id);
    v_boutique := v_ident ->> 'user_id';
    v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
    v_minuit   := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
    v_plafond  := (v_regl ->> 'plafond_jour')::integer;
    SELECT count(*) INTO v_faits FROM cross_post_jobs j
    WHERE j.user_id = v_compte.id AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit;

    -- Plafond de la boutique connectée (identité connue seulement) : le
    -- global prime, la boutique ne peut que resserrer. Calculé ICI, avant la
    -- ligne d'historique, pour que `prevues` en tienne compte.
    v_plafond_b := NULL; v_faits_b := 0;
    IF v_boutique IS NOT NULL THEN
      v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
        NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
      SELECT count(*) INTO v_faits_b
      FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit
        AND i.vinted_account_id = v_boutique;
    END IF;

    -- La ligne du créneau courant, créée au premier passage avec ce que le
    -- serveur ATTEND à cet instant (c'est ce que l'app annonce).
    SELECT * INTO v_row FROM republish_creneaux
    WHERE user_id = v_compte.id AND debut = (v_fen ->> 'courant_debut')::timestamptz;
    IF NOT FOUND THEN
      v_esp := republish_planifiee_espacement(v_compte.id);
      v_capacite := republish_planifiee_capacite(
        extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
        (v_esp ->> 'sec')::integer);
      SELECT count(*) INTO v_elig
      FROM republish_planifiee_candidats(v_compte.id, v_regl) c
      WHERE c.motif IS NULL
        AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
      v_prevues := LEAST(GREATEST(0, v_plafond - v_faits), v_elig, v_capacite);
      IF v_plafond_b IS NOT NULL THEN
        v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
      END IF;
      INSERT INTO republish_creneaux
        (user_id, jour, de, a, fuseau, debut, fin, statut, boutique,
         eligibles_debut, prevues, espacement_sec, extension_vue)
      VALUES
        (v_compte.id, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
         COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
         (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
         v_elig, v_prevues, (v_esp ->> 'sec')::integer,
         v_compte.extension_last_seen_at > now() - interval '10 minutes')
      ON CONFLICT (user_id, debut) DO NOTHING;
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND debut = (v_fen ->> 'courant_debut')::timestamptz;
    END IF;

    -- 3. Extension vivante ? 10 MINUTES, et non les 7 jours du RPC : sur ce
    -- critère on créerait des jobs pour des Chrome éteints, qui dormiraient
    -- en pending tout en consommant le plafond du jour.
    IF v_compte.extension_last_seen_at IS NULL
       OR v_compte.extension_last_seen_at <= now() - interval '10 minutes' THEN
      CONTINUE;
    END IF;
    IF NOT v_row.extension_vue OR (v_row.boutique IS NULL AND v_boutique IS NOT NULL) THEN
      UPDATE republish_creneaux
         SET extension_vue = true, boutique = COALESCE(boutique, v_boutique), updated_at = now()
       WHERE id = v_row.id;
    END IF;

    -- 4. Garde anti-rafale (17/09) : une republication en vol → rien de neuf,
    -- MAIS seules comptent celles qui PEUVENT bouger sous la boutique
    -- connectée. Un job parqué pour une autre boutique (retenu par
    -- get-pending-jobs, aucune tentative consommée) n'est pas « en vol » :
    -- il attend une connexion qui n'a rien à voir avec ce créneau. L'étape
    -- 'deleted' bloque TOUJOURS (annonce hors ligne : l'extension refuserait
    -- de toute façon un nouveau retrait tant qu'elle n'est pas recréée).
    -- 'needs_user' n'y est pas (panne du 30/08) : écarté article par article.
    SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted'),
           count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                              AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                   OR trim(i.vinted_account_id) = v_boutique)),
           count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                              AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                              AND trim(i.vinted_account_id) <> v_boutique)
    INTO v_hors_ligne, v_mobiles, v_parques
    FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.status IN ('pending', 'processing');
    IF v_hors_ligne + v_mobiles > 0 THEN
      -- La note est MISE À JOUR à chaque passage (pas la fusion « première
      -- note gagne » de republish_creneau_noter : c'est un état, pas un fait).
      v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
      v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
        'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
        'en_vol', v_hors_ligne + v_mobiles,
        'hors_ligne', v_hors_ligne,
        'parques_autre_boutique', v_parques,
        'boutique', v_boutique,
        'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
        'at', now());
      UPDATE republish_creneaux
         SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
       WHERE id = v_row.id;
      CONTINUE;
    END IF;
    IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
      UPDATE republish_creneaux
         SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
       WHERE id = v_row.id;
    END IF;
    IF v_parques > 0 THEN
      -- Information, une fois : N republications attendent une autre boutique
      -- (elles repartiront seules à la connexion) — le créneau, lui, avance.
      PERFORM republish_creneau_noter(v_row.id,
        jsonb_build_object('_parques_autre_boutique',
          jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
    END IF;

    -- 5. Plafond global du jour : le global prime.
    IF v_faits >= v_plafond THEN
      PERFORM republish_creneau_noter(v_row.id,
        jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
      CONTINUE;
    END IF;

    -- 6. Espacement déterministe : durée / prevues, mesuré depuis le dernier
    -- job auto créé dans CE créneau.
    v_intervalle := extract(epoch FROM (v_row.fin - v_row.debut)) / GREATEST(1, COALESCE(v_row.prevues, 1));
    SELECT max(j.created_at), count(*) INTO v_dernier, v_faits_cr FROM cross_post_jobs j
    WHERE j.user_id = v_compte.id AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_row.debut;
    CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);
    -- 6bis (17/09). Le créneau s'arrête à ce qu'il a ANNONCÉ : `prevues` créées
    -- → plus rien, même si un 11e intervalle tient dans la fenêtre.
    IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
      PERFORM republish_creneau_noter(v_row.id,
        jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
      CONTINUE;
    END IF;

    -- 7. Plafond de la boutique connectée (calculé plus haut).
    IF v_plafond_b IS NOT NULL THEN
      IF v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;
    END IF;

    -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
    -- autres boutiques jamais pendant ce créneau.
    v_notes := '{}'::jsonb; v_examines := 0;
    FOR v_cand IN
      SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
      FROM republish_planifiee_candidats(v_compte.id, v_regl) c
      ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                    WHEN c.boutique IS NULL THEN 1
                    ELSE 2 END,
               c.rang
      LIMIT 50
    LOOP
      v_examines := v_examines + 1;
      IF v_cand.motif IS NOT NULL THEN
        -- Un article déjà servi PAR CE CRÉNEAU (job estampillé) n'est pas
        -- « sauté » : il est remonté, l'historique le compte dans `faites`.
        IF NOT (v_row.sautes ? v_cand.item_id) AND NOT (v_notes ? v_cand.item_id)
           AND NOT EXISTS (
             SELECT 1 FROM cross_post_jobs j
             WHERE j.user_id = v_compte.id AND j.action = 'republish'
               AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
               AND j.platform_fields ->> 'vinted_item_id' = v_cand.item_id) THEN
          v_notes := v_notes || jsonb_build_object(v_cand.item_id,
            jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80), 'at', now()));
        END IF;
        CONTINUE;
      END IF;
      IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
        IF NOT (v_row.sautes ? v_cand.item_id) AND NOT (v_notes ? v_cand.item_id) THEN
          v_notes := v_notes || jsonb_build_object(v_cand.item_id,
            jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                               'titre', left(COALESCE(v_cand.titre, ''), 80), 'at', now()));
        END IF;
        CONTINUE;
      END IF;

      -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
      BEGIN
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
        v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL);
        PERFORM set_config('request.jwt.claims', '', true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('request.jwt.claims', '', true);
        v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                    'message', left(SQLERRM, 200));
      END;
      v_reason := v_rpc ->> 'reason';

      v_ligne := jsonb_build_object(
        'compte', v_compte.email, 'inventaire_id', v_cand.inv_id,
        'vinted_item_id', v_cand.item_id, 'examines', v_examines,
        'creneau_id', v_row.id, 'boutique', v_boutique,
        'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
        'reason', v_reason);

      IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
        v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
        UPDATE cross_post_jobs
           SET platform_fields = platform_fields || jsonb_build_object(
                 'republish_moteur', 'serveur',
                 'republish_planifie', true,
                 'republish_creneau_id', v_row.id::text,
                 'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
         WHERE id = v_job;
        v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
        v_rapport := v_rapport || v_ligne;
        EXIT; -- UN job par compte et par passage.
      END IF;

      -- Refus : noté dans l'historique. Portée ARTICLE → candidat suivant
      -- (aucun job créé, ce n'est pas une rafale) ; portée COMPTE → on sort.
      IF NOT (v_row.sautes ? v_cand.item_id) AND NOT (v_notes ? v_cand.item_id) THEN
        v_notes := v_notes || jsonb_build_object(v_cand.item_id,
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                             'titre', left(COALESCE(v_cand.titre, ''), 80), 'at', now()));
      END IF;
      v_rapport := v_rapport || v_ligne;
      IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h', 'article_sans_photo') THEN
        CONTINUE;
      END IF;
      v_notes := v_notes || jsonb_build_object('_refus_compte',
        jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message', 'at', now()));
      EXIT;
    END LOOP;

    IF v_notes <> '{}'::jsonb THEN
      PERFORM republish_creneau_noter(v_row.id, v_notes);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$$;

-- ── L'ÉTAT : faites_live + blocage, tout le reste identique au 12/09 ────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_etat()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text; v_plafond_palier integer;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz; v_crees_auto integer; v_abouties_auto integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;

  v_palier := republish_palier(v_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  v_regl := republish_planifiee_reglage(v_user);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant).
  IF v_palier IN ('premium', 'pro') THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      SELECT COALESCE(max(l.created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger l WHERE l.user_id = v_user AND l.kind IN ('grant_monthly', 'grant_upgrade');
      SELECT count(*) INTO v_faits_mois FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_cycle;
    ELSE
      v_quota := NULL;
    END IF;
  END IF;

  v_fuseau := COALESCE(v_regl ->> 'fuseau', 'Europe/Paris');
  v_minuit := republish_minuit_local(v_fuseau);
  SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*)
  INTO v_crees_auto, v_abouties_auto, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  v_ident := republish_boutique_connectee(v_user);
  v_boutique := v_ident ->> 'user_id';
  v_boutiques := republish_boutiques(v_user);
  v_multi := jsonb_array_length(v_boutiques) >= 2;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'actif', false,
      'reglage', v_regl,
      'palier', v_palier, 'plafond_palier', v_plafond_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', v_legacy,
      'moteur', CASE WHEN COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user);

  -- Éligibles : total, boutique connectée, par boutique, et les exclus par
  -- motif — UNE lecture des candidats (MATERIALIZED), quatre agrégats.
  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  -- Capacité : durée RESTANTE si on est dans le créneau, durée ENTIÈRE du
  -- prochain sinon. Restants : du plafond d'aujourd'hui si le prochain
  -- créneau est aujourd'hui, du plafond entier s'il est un autre jour — et
  -- le plafond de la BOUTIQUE CONNECTÉE, quand elle est connue, borne aussi
  -- (le global prime, la boutique ne peut que resserrer).
  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  v_capacite := republish_planifiee_capacite(v_duree, (v_esp ->> 'sec')::integer);
  v_restants := CASE WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_auto) END;
  IF v_boutique IS NOT NULL THEN
    v_plafond_b := LEAST((v_regl ->> 'plafond_jour')::integer, GREATEST(1, COALESCE(
      NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, (v_regl ->> 'plafond_jour')::integer)));
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;
  -- Multi-boutiques et identité connue : seule la boutique connectée passe
  -- pendant ce créneau, les autres attendent le suivant.
  v_attendu := LEAST(v_restants,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  v_borne := CASE
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.statut = 'en_cours' ORDER BY r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.statut <> 'en_cours' ORDER BY r.debut DESC LIMIT 1;

  -- 17/09 : ce que le créneau COURANT a déjà remonté (faites n'est posé qu'à
  -- la clôture) et la note de blocage en cours (aucun leve_le), sinon null.
  v_faites_live := NULL; v_blocage := NULL;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    IF (v_courant -> 'sautes') ? '_bloque_en_vol'
       AND NOT ((v_courant -> 'sautes' -> '_bloque_en_vol') ? 'leve_le') THEN
      v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'actif', true,
    'reglage', v_regl,
    'palier', v_palier, 'plafond_palier', v_plafond_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_auto, 'abouties_auto', v_abouties_auto,
      'crees_total', v_crees_total, 'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', v_faites_live, 'blocage', v_blocage,
    'legacy', v_legacy,
    'moteur', 'planifie'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.republish_planifiee_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.republish_planifiee_etat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_etat() TO authenticated, service_role;

-- Contrôle (Ornella, ce soir, Chrome sur @luciatrendyshop) :
--   SELECT public.republish_auto_sweep_serveur() -> 'planifiee';
--   → un job créé pour un article de 257364012, OU la note
--     sautes->'_bloque_en_vol' sur le créneau du jour si une annonce est hors
--     ligne ; jamais plus un CONTINUE muet.
--   SELECT sautes -> '_parques_autre_boutique' FROM republish_creneaux
--   WHERE user_id = 'f8aa02a5-23cb-4325-bba8-127f61a75741' ORDER BY debut DESC LIMIT 1;
--   → {"n": 4, "boutique": "257364012", …}
