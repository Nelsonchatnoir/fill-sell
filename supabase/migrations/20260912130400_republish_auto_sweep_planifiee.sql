-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE (créneaux) — 5/5 : le sweep serveur
-- 2026-09-12, décisions Nico.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le sweep (republish_auto_sweep_serveur, cron 'republish-auto-sweep-3min',
-- interrupteur republish_auto_serveur_actif = 1 en prod) gagne une SECONDE
-- BRANCHE, republish_planifiee_sweep(), appelée après la boucle témoin.
--
-- LA BOUCLE TÉMOIN (republish_auto_serveur_comptes × republish_auto.actif)
-- est recopiée depuis la définition EN PROD du 12/09 (avec le bloc
-- « PLATEFORME EN PAUSE » patché le 09/09), sans autre changement qu'une
-- garde : un compte dont le module planifié est actif n'y passe plus (sa
-- clé republish_auto.actif est déjà false par la bascule — ceinture et
-- bretelles).
--
-- LA BRANCHE PLANIFIÉE, pour chaque compte dont republish_planifiee.actif :
--   0. interrupteur global coin_config.republish_planifiee_actif = 1 (posé à
--      0 par 1/5) ; sinon elle ne fait rien et le dit ;
--   1. CLÔTURE des créneaux passés encore 'en_cours' (historique) ;
--   2. hors créneau → rien. Dans le créneau → la ligne d'historique existe
--      (créée au premier passage, Chrome ou pas, avec éligibles / attendu /
--      espacement du moment) ;
--   3. extension vue < 10 min (même règle que la voie témoin), sinon rien —
--      la ligne garde extension_vue = false, c'est le « créneau manqué » ;
--   4. GARDE ANTI-RAFALE : une republication du compte en vol → rien
--      (invariant une-passe, il ne bouge pas) ;
--   5. plafond GLOBAL du jour (le global prime) ;
--   6. ESPACEMENT DÉTERMINISTE (point 10) : intervalle = durée du créneau /
--      prevues (= min(plafond restant, éligibles, capacité) figé au premier
--      passage). Le dernier job auto créé dans ce créneau doit dater de plus
--      d'un intervalle. Jamais SOUS l'espacement naturel : la garde 4 et le
--      pas de 3 min du cron le garantissent, aucun aléa ajouté, rien ne
--      change dans l'extension ;
--   7. plafond PAR BOUTIQUE de la boutique connectée (identité serveur,
--      30 min) ;
--   8. CANDIDATS (republish_planifiee_candidats, ordre choisi), boutique
--      connectée d'abord, sans boutique ensuite, autres boutiques jamais
--      pendant ce créneau (elles attendent le suivant — pas d'attente_
--      boutique de 15 min en boucle) ; les exclus sont NOTÉS dans
--      l'historique avec leur motif, une fois chacun ;
--   9. L'APPEL : spend_coins_and_republish TELLE QUELLE, identité posée par
--      request.jwt.claims et remise à vide — aucune garde recopiée ici. Un
--      refus de PORTÉE ARTICLE passe au candidat suivant (ce n'est pas une
--      rafale : aucun job n'a été créé) ; un refus de PORTÉE COMPTE arrête
--      le passage ; un succès arrête le passage (UN job par compte et par
--      passage, jamais plus).
-- Le job créé porte republish_source = 'auto' (le plafond du RPC compte
-- cette valeur), republish_moteur = 'serveur', republish_planifie = true et
-- republish_creneau_id — c'est cette dernière clé qui rattache le job à sa
-- ligne d'historique et permet de compter `faites` à la clôture.
--
-- CE QUE LA BRANCHE NE FAIT PAS : rien sur les articles réservés (point 8,
-- lot séparé) ; aucune republication MANUELLE n'est touchée (point 7 : un
-- clic « Republier » part comme aujourd'hui) ; l'étape 'deleted' d'un job
-- déjà créé reste recréée hors créneau par l'extension (exemption existante
-- de get-pending-jobs).
-- Dépend de 2/5, 3/5, 4/5. Idempotente. Retour arrière : rejouer la
-- définition en prod du 12/09 de republish_auto_sweep_serveur (sans l'appel
-- à republish_planifiee_sweep) — ou simplement republish_planifiee_actif = 0.

-- ── Note d'historique : fusion « qui n'écrase pas » (clé déjà posée = la
-- première note gagne). Clés '_…' = notes de niveau compte.
CREATE OR REPLACE FUNCTION public.republish_creneau_noter(p_id bigint, p_note jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.republish_creneaux
     SET sautes = COALESCE(p_note, '{}'::jsonb) || sautes, updated_at = now()
   WHERE id = p_id;
$$;

-- ── Clôture des créneaux passés d'un compte : faites (jobs de CE créneau
-- aboutis), statut. Un job de ce créneau encore en vol (retenu hors créneau,
-- ou en recréation à l'étape deleted) retarde la clôture de 2 h au plus.
CREATE OR REPLACE FUNCTION public.republish_creneau_cloturer(p_user uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0; v_faites integer; v_en_vol integer; v_statut text;
BEGIN
  FOR r IN
    SELECT * FROM republish_creneaux
    WHERE user_id = p_user AND statut = 'en_cours' AND fin <= now()
  LOOP
    SELECT count(*) FILTER (WHERE j.status = 'published'),
           count(*) FILTER (WHERE j.status IN ('pending', 'processing'))
    INTO v_faites, v_en_vol
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_creneau_id' = r.id::text;
    CONTINUE WHEN v_en_vol > 0 AND r.fin > now() - interval '2 hours';
    v_statut := CASE
      WHEN COALESCE(r.eligibles_debut, 0) = 0 THEN 'vide'
      WHEN v_faites = 0 THEN 'manque'
      WHEN v_faites >= COALESCE(r.prevues, v_faites) THEN 'termine'
      ELSE 'ecourte' END;
    UPDATE republish_creneaux
       SET faites = v_faites, statut = v_statut, updated_at = now()
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ── LA BRANCHE PLANIFIÉE ────────────────────────────────────────────────────
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

    -- 4. Garde anti-rafale : une republication en vol → rien de neuf.
    -- 'needs_user' n'y est pas (panne du 30/08) : écarté article par article.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.status IN ('pending', 'processing'));

    -- 5. Plafond global du jour : le global prime.
    IF v_faits >= v_plafond THEN
      PERFORM republish_creneau_noter(v_row.id,
        jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
      CONTINUE;
    END IF;

    -- 6. Espacement déterministe : durée / prevues, mesuré depuis le dernier
    -- job auto créé dans CE créneau.
    v_intervalle := extract(epoch FROM (v_row.fin - v_row.debut)) / GREATEST(1, COALESCE(v_row.prevues, 1));
    SELECT max(j.created_at) INTO v_dernier FROM cross_post_jobs j
    WHERE j.user_id = v_compte.id AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_row.debut;
    CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);

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

-- ── LE SWEEP PRINCIPAL : définition en prod du 12/09 + garde + appel ───────
CREATE OR REPLACE FUNCTION public.republish_auto_sweep_serveur()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actif     integer;
  v_compte    record;
  v_cfg       jsonb;
  v_age       integer;
  v_seuil     timestamptz;
  v_probant   boolean;
  v_premier   date;
  v_cand      record;
  v_dernier   record;
  v_rpc       jsonb;
  v_job       uuid;
  v_examines  integer;
  v_rapport   jsonb := '[]'::jsonb;
  v_ligne     jsonb;
  v_plan      jsonb;
BEGIN
  -- INTERRUPTEUR : cle absente ou <> 1 -> le sweep ne fait RIEN et le dit.
    -- ── PLATEFORME EN PAUSE (2026-09-09, maintenance générique) ─────────────
  -- Vinted en pause (platform_health) : le sweep ne crée AUCUNE republication,
  -- même forme de retour que l'interrupteur. FAIL-SAFE : table illisible →
  -- on continue comme avant (jamais une pause par accident).
  BEGIN
    IF EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = 'vinted' AND h.paused = true) THEN
      RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0, 'motif', 'platform_health : vinted en pause');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_auto_serveur_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_auto_serveur_actif <> 1');
  END IF;

  FOR v_compte IN
    SELECT p.id, p.email, p.platform_settings
    FROM republish_auto_serveur_comptes c
    JOIN profiles p ON p.id = c.user_id
    -- Le reglage de l'utilisatrice fait foi : couper l'automatisation dans
    -- l'app coupe AUSSI le serveur, sans rien a faire ici.
    WHERE COALESCE((p.platform_settings #> '{vinted,republish_auto}' ->> 'actif')::boolean, false)
    -- Module planifié actif (12/09) : ce compte est servi par la branche
    -- planifiée, jamais par les deux à la fois.
      AND NOT COALESCE((p.platform_settings #> '{vinted,republish_planifiee}' ->> 'actif')::boolean, false)
    -- 10 MINUTES, et non les 7 JOURS du RPC : sur ce critere le sweep creerait
    -- des jobs pour des Chrome eteints, qui dormiraient en 'pending' tout en
    -- consommant le plafond du jour (qui compte les jobs CREES).
      AND p.extension_last_seen_at > now() - interval '10 minutes'
    ORDER BY p.id
  LOOP
    -- GARDE ANTI-RAFALE (reproduite de maybeAutoRepublish ; le RPC ne garde
    -- que le MEME vinted_item_id). 'needs_user' n'y est PAS : il gelait le
    -- cycle entier (panne du 30/08). Il est ecarte plus bas, article par
    -- article, et lui seul.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.status IN ('pending', 'processing'));

    v_cfg   := v_compte.platform_settings #> '{vinted,republish_auto}';
    v_age   := LEAST(365, GREATEST(7, COALESCE(NULLIF(v_cfg ->> 'age_jours', '')::integer, 30)));
    v_seuil := now() - make_interval(days => v_age);

    -- Garde « historique probant » (23/08) : si le premier releve du COMPTE
    -- est plus jeune que v_age, la garde par article est muette et
    -- listed_at_guess fait foi seul.
    SELECT min(captured_on) INTO v_premier
    FROM vinted_listing_snapshots WHERE user_id = v_compte.id;
    v_probant := v_premier IS NOT NULL AND v_premier <= v_seuil::date;

    v_examines := 0;

    FOR v_cand IN
      SELECT i.id, i.vinted_item_id
      FROM inventaire i
      WHERE i.user_id = v_compte.id
        AND i.statut = 'stock'
        AND i.vinted_item_id IS NOT NULL
        -- Coquilles vides exclues en amont (28/08) : sans photo, la
        -- republication ne peut pas aboutir.
        AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
        -- hidden/draft exclus (28/08) : republier une annonce masquee la
        -- remettrait VISIBLE, l'inverse du geste de l'utilisateur.
        AND (i.vinted_status IS NULL OR i.vinted_status NOT IN ('hidden', 'draft'))
        AND i.disparu_le IS NULL
        -- Donnee manquante = PAS de republication auto. Jamais.
        AND i.listed_at_guess IS NOT NULL
        AND i.listed_at_guess < v_seuil
      ORDER BY i.listed_at_guess ASC
      LIMIT 50
    LOOP
      v_examines := v_examines + 1;

      SELECT j.status, j.published_at, j.created_at INTO v_dernier
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'vinted_item_id' = v_cand.vinted_item_id
      ORDER BY j.created_at DESC LIMIT 1;

      IF FOUND THEN
        CONTINUE WHEN v_dernier.status IN ('pending', 'processing', 'needs_user');
        CONTINUE WHEN v_dernier.status = 'failed'
                  AND v_dernier.created_at > now() - interval '24 hours';
        CONTINUE WHEN v_dernier.status = 'published'
                  AND v_dernier.published_at > now() - interval '24 hours';
      END IF;

      IF v_probant THEN
        SELECT min(captured_on) INTO v_premier
        FROM vinted_listing_snapshots
        WHERE user_id = v_compte.id AND vinted_item_id = v_cand.vinted_item_id;
        CONTINUE WHEN v_premier IS NOT NULL AND v_premier > v_seuil::date;
      END IF;

      -- L'APPEL, avec l'identite de l'utilisatrice et rien d'autre.
      -- auth.uid() = current_setting('request.jwt.claims')::jsonb->>'sub'.
      -- La variable est REMISE A VIDE apres : jamais une identite qui traine.
      BEGIN
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
        v_rpc := public.spend_coins_and_republish(
          v_cand.id, v_cand.vinted_item_id, 'auto', NULL);
        PERFORM set_config('request.jwt.claims', '', true);
      EXCEPTION WHEN OTHERS THEN
        -- Le trigger de maintenance leve une exception : sans ce bloc elle
        -- emporterait le sweep entier.
        PERFORM set_config('request.jwt.claims', '', true);
        v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                    'message', left(SQLERRM, 200));
      END;

      v_ligne := jsonb_build_object(
        'compte', v_compte.email, 'inventaire_id', v_cand.id,
        'vinted_item_id', v_cand.vinted_item_id, 'examines', v_examines,
        'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
        'reason', v_rpc ->> 'reason');

      IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
        v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
        -- republish_source RESTE 'auto' : le plafond quotidien du RPC compte
        -- exactement cette valeur. La renommer remettrait le compteur a zero
        -- a chaque passage (480 jobs/jour au lieu de 20). La distinction vit
        -- dans une cle qui ne desarme rien.
        UPDATE cross_post_jobs
           SET platform_fields = platform_fields || jsonb_build_object(
                 'republish_moteur', 'serveur',
                 'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
         WHERE id = v_job;
        v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
      END IF;

      v_rapport := v_rapport || v_ligne;
      -- UN article par compte et par passage, reussi ou pas. Jamais de rafale.
      EXIT;
    END LOOP;
  END LOOP;

  -- ── BRANCHE PLANIFIÉE (12/09) : jamais un point de panne pour la voie
  -- témoin — une exception y est rapportée, pas propagée.
  BEGIN
    v_plan := public.republish_planifiee_sweep();
  EXCEPTION WHEN OTHERS THEN
    v_plan := jsonb_build_object('actif', false, 'motif', 'exception', 'message', left(SQLERRM, 200));
  END;

  RETURN jsonb_build_object(
    'actif', true,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE (e ->> 'allowed')::boolean),
    'detail', v_rapport,
    'planifiee', v_plan);
END;
$function$;

REVOKE ALL ON FUNCTION public.republish_creneau_noter(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_creneau_cloturer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_auto_sweep_serveur() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_creneau_noter(bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_creneau_cloturer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_auto_sweep_serveur() TO service_role;

-- Contrôle : le sweep rend désormais une clé 'planifiee' — éteinte tant que
-- republish_planifiee_actif = 0 :
--   SELECT public.republish_auto_sweep_serveur() -> 'planifiee';
--   → {"actif": false, "motif": "interrupteur coin_config.republish_planifiee_actif <> 1", ...}
