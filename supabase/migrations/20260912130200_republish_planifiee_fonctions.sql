-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE (créneaux) — 3/5 : les fonctions
-- 2026-09-12.
-- ═══════════════════════════════════════════════════════════════════════════
-- UNE SEULE DÉFINITION de chaque règle, en SQL, lue par les trois lecteurs :
-- le sweep serveur (5/5, crée les jobs), le RPC spend_coins_and_republish
-- (4/5, plafonds à la création) et get-pending-jobs (retenue à l'exécution)
-- — plus l'app, qui AFFICHE ce que republish_planifiee_etat() lui rend et ne
-- recalcule rien (doctrine du 04/09 : « le serveur fait autorité »).
--
-- LE RÉGLAGE : profiles.platform_settings.vinted.republish_planifiee
--   { actif, active_le, arrete_le, arret_motif,
--     creneau: 'matin'|'midi'|'soir'|'perso', de: 'HH:MM', a: 'HH:MM',
--     fuseau: 'Europe/Paris', jours: [1..7] (ISO, 1 = lundi),
--     plafond_jour, plafond_boutique: {<vinted_user_id>: n},
--     age_jours (≥ 7), ordre: 'anciennes'|'prix'|'vues' }
-- Clé NEUVE, à côté de l'ancienne republish_auto (moteur client + sweep
-- témoin) : personne n'est basculé sans avoir activé le module lui-même ; à
-- l'activation, republish_planifiee_regler() coupe l'ancien réglage
-- (arret_motif 'bascule_planifiee'), ce qui éteint le moteur des extensions
-- 0.6.x sans paquet — elles ne lisent que republish_auto.actif.
--
-- CE QUE LE MODULE NE PROMET PAS (décision Nico 12/09, point 8) : rien sur
-- les articles réservés. vinted_status = 'reserved' n'est PAS exclu ici —
-- il ne l'est nulle part aujourd'hui, et on ne code pas une règle qu'on ne
-- peut pas tenir (le statut a l'âge de la dernière sync). Lot séparé.
--
-- SÉCURITÉ : les fonctions à paramètre p_user sont SECURITY DEFINER (elles
-- lisent profiles, inventaire, cross_post_jobs pour le compte du sweep) →
-- EXECUTE RETIRÉ à PUBLIC/anon/authenticated. Seules les trois fonctions
-- sans paramètre d'identité (auth.uid()) sont ouvertes à `authenticated` :
-- republish_planifiee_etat(), republish_planifiee_regler(jsonb),
-- republish_planifiee_fenetre_courante().
-- Idempotente (CREATE OR REPLACE). Retour arrière : DROP FUNCTION de chacune,
-- rien d'autre ne dépend d'elles avant 4/5 et 5/5.

-- ── Palier : expression canonique du 25/07, cumulatif, is_founder ignoré ──
CREATE OR REPLACE FUNCTION public.republish_palier(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.is_business IS TRUE THEN 'business'
    WHEN p.is_pro IS TRUE THEN 'pro'
    WHEN p.is_premium IS TRUE OR p.is_comped IS TRUE THEN 'premium'
    ELSE 'free' END
  FROM public.profiles p WHERE p.id = p_user;
$$;

-- ── Plafond journalier du palier : MÊME lecture que etatPlafondRepublish ──
-- (get-pending-jobs) : clé du palier si > 0, sinon republish_plafond_jour,
-- sinon 45 en tout dernier recours. Free n'a pas de clé : repli.
CREATE OR REPLACE FUNCTION public.republish_plafond_palier(p_palier text)
RETURNS integer
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v integer; v_repli integer;
BEGIN
  SELECT value INTO v_repli FROM coin_config WHERE key = 'republish_plafond_jour';
  IF v_repli IS NULL OR v_repli <= 0 THEN v_repli := 45; END IF;
  IF p_palier IN ('premium', 'pro', 'business') THEN
    SELECT value INTO v FROM coin_config WHERE key = 'republish_plafond_jour_' || p_palier;
    IF v IS NOT NULL AND v > 0 THEN RETURN v; END IF;
  END IF;
  RETURN v_repli;
END;
$$;

-- ── Minuit LOCAL du fuseau du réglage (jamais date_trunc('day', now()), qui
-- est le minuit UTC du serveur — le piège de l'ancien plafond auto) ────────
CREATE OR REPLACE FUNCTION public.republish_minuit_local(p_fuseau text, p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
  SELECT (((p_at AT TIME ZONE p_fuseau)::date)::timestamp) AT TIME ZONE p_fuseau;
$$;

-- ── Boutiques connues du compte : PIN de sync (login) ∪ origines des
-- articles (inventaire.vinted_account_id). [{user_id, login}] ─────────────
CREATE OR REPLACE FUNCTION public.republish_boutiques(p_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pin AS (
    SELECT b ->> 'user_id' AS user_id, NULLIF(b ->> 'login', '') AS login
    FROM public.profiles p,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p.vinted_sync_pin -> 'boutiques') = 'array'
                                   THEN p.vinted_sync_pin -> 'boutiques' ELSE '[]'::jsonb END) b
    WHERE p.id = p_user
  ),
  inv AS (
    SELECT DISTINCT i.vinted_account_id AS user_id
    FROM public.inventaire i
    WHERE i.user_id = p_user AND i.vinted_account_id IS NOT NULL
  ),
  tous AS (
    SELECT user_id FROM pin WHERE user_id IS NOT NULL AND user_id <> ''
    UNION
    SELECT user_id FROM inv
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', t.user_id,
                                               'login', (SELECT pin.login FROM pin WHERE pin.user_id = t.user_id LIMIT 1))
                            ORDER BY t.user_id), '[]'::jsonb)
  FROM tous t;
$$;

-- ── Boutique CONNECTÉE dans Chrome : la plus fraîche des deux sources déjà
-- lues par get-pending-jobs (sonde d'identité extension_sessions.vinted_
-- identite, dernier run de sync), valable 30 min (BOUTIQUE_SONDE_FRAICHEUR_
-- MS). Au-delà, on ne devine pas : NULL. ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.republish_boutique_connectee(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_es jsonb; v_sonde_id text; v_sonde_login text; v_sonde_at timestamptz;
  v_run record; v_id text; v_login text; v_at timestamptz; v_source text;
BEGIN
  SELECT p.extension_sessions INTO v_es FROM profiles p WHERE p.id = p_user;
  v_sonde_id := NULLIF(trim(COALESCE(v_es #>> '{vinted_identite,user_id}', '')), '');
  v_sonde_login := NULLIF(v_es #>> '{vinted_identite,login}', '');
  BEGIN
    v_sonde_at := (v_es ->> 'checked_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_sonde_at := NULL;
  END;
  SELECT r.vinted_user_id, r.vinted_login, r.started_at INTO v_run
  FROM vinted_sync_runs r
  WHERE r.user_id = p_user AND r.kind = 'dressing'
    AND r.vinted_user_id IS NOT NULL AND r.started_at IS NOT NULL
  ORDER BY r.started_at DESC LIMIT 1;

  IF v_sonde_id IS NOT NULL AND v_sonde_at IS NOT NULL THEN
    v_id := v_sonde_id; v_login := v_sonde_login; v_at := v_sonde_at; v_source := 'sonde';
  END IF;
  IF v_run.vinted_user_id IS NOT NULL AND (v_at IS NULL OR v_run.started_at > v_at) THEN
    v_id := trim(v_run.vinted_user_id); v_login := v_run.vinted_login; v_at := v_run.started_at; v_source := 'sync_dressing';
  END IF;
  IF v_id IS NULL OR v_id = '' OR v_at < now() - interval '30 minutes' THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('user_id', v_id, 'login', v_login, 'source', v_source, 'at', v_at);
END;
$$;

-- ── Le RÉGLAGE, NORMALISÉ : bornes appliquées, créneau résolu, palier joint.
-- NULL = pas de réglage. `actif` est FAUX si le réglage est invalide (fenêtre
-- incohérente, aucun jour) ou si le palier n'y a pas droit : on ne republie
-- jamais à un horaire que l'utilisateur n'a pas choisi, et on ne retombe pas
-- silencieusement sur un défaut. `invalide` dit pourquoi. ─────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brut jsonb; v_palier text; v_plafond_palier integer;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_invalide text := NULL; v_actif boolean;
BEGIN
  SELECT p.platform_settings #> '{vinted,republish_planifiee}' INTO v_brut
  FROM profiles p WHERE p.id = p_user;
  IF v_brut IS NULL OR jsonb_typeof(v_brut) <> 'object' THEN RETURN NULL; END IF;

  v_palier := republish_palier(p_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  IF v_palier NOT IN ('premium', 'pro', 'business') THEN v_invalide := 'palier'; END IF;

  -- Fuseau : validé par usage ; illisible → Europe/Paris (tout le parc).
  v_fuseau := COALESCE(NULLIF(v_brut ->> 'fuseau', ''), 'Europe/Paris');
  BEGIN
    PERFORM now() AT TIME ZONE v_fuseau;
  EXCEPTION WHEN OTHERS THEN v_fuseau := 'Europe/Paris';
  END;

  -- Créneau : les trois presets sont FIXES (la maquette) ; 'perso' lit de/a.
  v_type := COALESCE(v_brut ->> 'creneau', 'matin');
  CASE v_type
    WHEN 'matin' THEN v_de := '08:00'; v_a := '10:00';
    WHEN 'midi'  THEN v_de := '12:00'; v_a := '14:00';
    WHEN 'soir'  THEN v_de := '19:00'; v_a := '22:00';
    WHEN 'perso' THEN
      BEGIN
        v_de := (v_brut ->> 'de')::time; v_a := (v_brut ->> 'a')::time;
      EXCEPTION WHEN OTHERS THEN v_de := NULL; v_a := NULL;
      END;
      -- Pas de créneau à cheval sur minuit (règle du point 4).
      IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de THEN v_invalide := COALESCE(v_invalide, 'creneau'); END IF;
    ELSE v_invalide := COALESCE(v_invalide, 'creneau');
  END CASE;

  -- Jours actifs : absent = les 7 ; présent = sous-ensemble de 1..7, non vide.
  IF v_brut ? 'jours' THEN
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::integer[]) INTO v_jours
    FROM (
      SELECT (e)::integer AS x
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_brut -> 'jours') = 'array' THEN v_brut -> 'jours' ELSE '[]'::jsonb END) e
      WHERE e ~ '^[1-7]$'
    ) s;
    IF cardinality(v_jours) = 0 THEN v_invalide := COALESCE(v_invalide, 'jours'); END IF;
  ELSE
    v_jours := ARRAY[1,2,3,4,5,6,7];
  END IF;

  -- Plafond du jour : ≤ palier, ≥ 1, défaut = palier. Le palier PRIME.
  BEGIN v_plafond := NULLIF(v_brut ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  v_plafond := LEAST(v_plafond_palier, GREATEST(1, COALESCE(v_plafond, v_plafond_palier)));

  -- Ancienneté : PLANCHER 7 (anti-ban, décision du 09/08, jamais rebaissé), plafond 365, défaut 30.
  BEGIN v_age := NULLIF(v_brut ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));

  v_ordre := COALESCE(v_brut ->> 'ordre', 'anciennes');
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;

  -- Plafond par boutique : chaque valeur bornée 1..plafond_jour.
  IF jsonb_typeof(v_brut -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_brut -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_brut -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN
        v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n)));
      END IF;
    END LOOP;
  END IF;

  v_actif := COALESCE((v_brut ->> 'actif')::boolean, false) AND v_invalide IS NULL;

  RETURN jsonb_build_object(
    'actif', v_actif,
    'invalide', v_invalide,
    'palier', v_palier,
    'plafond_palier', v_plafond_palier,
    'creneau', v_type,
    'de', to_char(v_de, 'HH24:MI'),
    'a', to_char(v_a, 'HH24:MI'),
    'fuseau', v_fuseau,
    'jours', to_jsonb(v_jours),
    'plafond_jour', v_plafond,
    'plafond_boutique', v_pb,
    'age_jours', v_age,
    'ordre', v_ordre,
    'active_le', v_brut ->> 'active_le',
    'arrete_le', v_brut ->> 'arrete_le',
    'arret_motif', v_brut ->> 'arret_motif'
  );
END;
$$;

-- ── LA FENÊTRE : la règle du point 4, telle quelle. ─────────────────────────
-- Créneau = [de, a[ dans le fuseau du réglage, sur les jours actifs.
-- Prochaine tentative = premier instant t ≥ p_at tel que le jour de t est
-- actif et de ≤ heure(t) < a :
--   · p_at DANS le créneau d'un jour actif → p_at (au prochain poll) ;
--   · avant `de` un jour actif → aujourd'hui à `de` ;
--   · après `a`, ou jour inactif → prochain jour actif à `de` (≤ 7 j).
-- Jamais de rattrapage : la fenêtre précédente ne s'additionne à rien.
-- (jour + heure) AT TIME ZONE fuseau : heure murale → instant, changements
-- d'heure compris. Aucun offset en dur.
CREATE OR REPLACE FUNCTION public.republish_planifiee_fenetre(p_reglage jsonb, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_fuseau text := COALESCE(p_reglage ->> 'fuseau', 'Europe/Paris');
  v_de time; v_a time; v_jours integer[];
  v_jour date; v_d integer; v_jd date; v_debut timestamptz; v_fin timestamptz;
  v_dans boolean := false;
  v_cour_debut timestamptz; v_cour_fin timestamptz;
  v_proch_debut timestamptz; v_proch_fin timestamptz;
  v_prec_debut timestamptz; v_prec_fin timestamptz;
BEGIN
  BEGIN
    v_de := (p_reglage ->> 'de')::time; v_a := (p_reglage ->> 'a')::time;
  EXCEPTION WHEN OTHERS THEN v_de := NULL; v_a := NULL;
  END;
  SELECT COALESCE(array_agg((e)::integer), '{}'::integer[]) INTO v_jours
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_reglage -> 'jours') = 'array' THEN p_reglage -> 'jours' ELSE '[]'::jsonb END) e
  WHERE e ~ '^[1-7]$';
  IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de OR cardinality(v_jours) = 0 THEN
    RETURN jsonb_build_object('dans_creneau', false, 'invalide', true);
  END IF;

  v_jour := (p_at AT TIME ZONE v_fuseau)::date;

  -- Aujourd'hui et les 7 jours suivants : la fenêtre courante si p_at y est,
  -- puis la première dont le début est encore à venir.
  FOR v_d IN 0..7 LOOP
    v_jd := v_jour + v_d;
    CONTINUE WHEN NOT (EXTRACT(ISODOW FROM v_jd)::integer = ANY (v_jours));
    v_debut := ((v_jd + v_de)::timestamp) AT TIME ZONE v_fuseau;
    v_fin   := ((v_jd + v_a)::timestamp)  AT TIME ZONE v_fuseau;
    IF v_d = 0 AND v_debut <= p_at AND p_at < v_fin THEN
      v_dans := true; v_cour_debut := v_debut; v_cour_fin := v_fin;
      CONTINUE;
    END IF;
    IF v_debut > p_at THEN
      v_proch_debut := v_debut; v_proch_fin := v_fin;
      EXIT;
    END IF;
  END LOOP;

  -- La dernière fenêtre TERMINÉE (jusqu'à 8 jours en arrière) : sert à la
  -- clôture de l'historique et à l'affichage « créneau manqué ».
  FOR v_d IN 0..8 LOOP
    v_jd := v_jour - v_d;
    CONTINUE WHEN NOT (EXTRACT(ISODOW FROM v_jd)::integer = ANY (v_jours));
    v_debut := ((v_jd + v_de)::timestamp) AT TIME ZONE v_fuseau;
    v_fin   := ((v_jd + v_a)::timestamp)  AT TIME ZONE v_fuseau;
    IF v_fin <= p_at THEN
      v_prec_debut := v_debut; v_prec_fin := v_fin;
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dans_creneau', v_dans,
    'courant_debut', v_cour_debut, 'courant_fin', v_cour_fin,
    'prochain_debut', v_proch_debut, 'prochain_fin', v_proch_fin,
    'prochaine_tentative', CASE WHEN v_dans THEN p_at ELSE v_proch_debut END,
    'precedent_debut', v_prec_debut, 'precedent_fin', v_prec_fin,
    'jour_local', v_jour,
    'fuseau', v_fuseau
  );
END;
$$;

-- ── ESPACEMENT RÉEL : médiane des intervalles entre deux republications
-- abouties CONSÉCUTIVES du compte, 30 derniers jours, intervalles < 2 h (au-
-- delà c'est une pause ou une nuit, pas une cadence). Au moins 10 intervalles
-- pour que le chiffre soit le sien ; sinon la médiane du PARC (coin_config
-- republish_espacement_parc_sec, mesure du 12/09 = 354 s, dernier recours
-- si la clé manque). Jamais une constante optimiste. ───────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_espacement(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_med numeric; v_n integer; v_parc integer;
BEGIN
  WITH s AS (
    SELECT extract(epoch FROM (j.published_at - lag(j.published_at) OVER (ORDER BY j.published_at))) AS ecart
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish' AND j.status = 'published'
      AND j.published_at > now() - interval '30 days'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ecart), count(*)
  INTO v_med, v_n
  FROM s WHERE ecart IS NOT NULL AND ecart > 0 AND ecart < 7200;

  SELECT value INTO v_parc FROM coin_config WHERE key = 'republish_espacement_parc_sec';
  IF v_parc IS NULL OR v_parc <= 0 THEN v_parc := 354; END IF;

  IF COALESCE(v_n, 0) >= 10 AND v_med IS NOT NULL AND v_med > 0 THEN
    RETURN jsonb_build_object('sec', round(v_med)::integer, 'source', 'compte', 'intervalles', v_n);
  END IF;
  RETURN jsonb_build_object('sec', v_parc, 'source', 'parc', 'intervalles', COALESCE(v_n, 0));
END;
$$;

-- ── CAPACITÉ d'une durée à un espacement, PAUSE DE RESPIRATION COMPRISE
-- (republish_pause_apres / republish_pause_duree_min : après N d'affilée,
-- la file souffle P minutes — dans un créneau les intervalles sont courts,
-- la pause s'applique donc). Clés absentes = pas de pause.
--   cycle = N × espacement + P × 60
--   capacité = floor(durée / cycle) × N + min(N, floor(reste / espacement))
CREATE OR REPLACE FUNCTION public.republish_planifiee_capacite(p_duree_sec integer, p_espacement_sec integer)
RETURNS integer
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v_apres integer; v_pause integer; v_cycle integer; v_pleins integer; v_reste integer;
BEGIN
  IF p_duree_sec IS NULL OR p_duree_sec <= 0 OR p_espacement_sec IS NULL OR p_espacement_sec <= 0 THEN
    RETURN 0;
  END IF;
  SELECT value INTO v_apres FROM coin_config WHERE key = 'republish_pause_apres';
  SELECT value INTO v_pause FROM coin_config WHERE key = 'republish_pause_duree_min';
  IF v_apres IS NULL OR v_apres <= 0 OR v_pause IS NULL OR v_pause <= 0 THEN
    RETURN floor(p_duree_sec::numeric / p_espacement_sec)::integer;
  END IF;
  v_cycle  := v_apres * p_espacement_sec + v_pause * 60;
  v_pleins := floor(p_duree_sec::numeric / v_cycle)::integer;
  v_reste  := p_duree_sec - v_pleins * v_cycle;
  RETURN v_pleins * v_apres + LEAST(v_apres, floor(v_reste::numeric / p_espacement_sec)::integer);
END;
$$;

-- ── LES CANDIDATS, dans l'ordre choisi, avec le MOTIF d'exclusion (NULL =
-- éligible). Une seule sélection pour le sweep (qui prend le premier NULL et
-- note les autres dans l'historique) et pour l'app (qui compte les NULL et
-- peut dire « N republiées récemment, M en attente d'une décision »).
-- Filtres = ceux du sweep témoin et de maybeAutoRepublish, à l'identique :
-- stock, vinted_item_id, photos non vides, ni hidden ni draft (NULL passe),
-- pas disparu, listed_at_guess connu et < seuil (donnée manquante = jamais),
-- garde « historique probant » sur les relevés (23/08).
-- Ordres : anciennes = listed_at_guess ASC ; prix = prix_vente DESC ;
-- vues = vues PAR JOUR EN LIGNE ASC (le brut croît avec l'âge, décision Nico
-- point 4 : normalisé). NULL toujours en fin, départage listed_at_guess.
CREATE OR REPLACE FUNCTION public.republish_planifiee_candidats(p_user uuid, p_reglage jsonb)
RETURNS TABLE (inv_id bigint, item_id text, boutique text, titre text, motif text, rang integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_age integer := LEAST(365, GREATEST(7, COALESCE(NULLIF(p_reglage ->> 'age_jours', '')::integer, 30)));
  v_seuil timestamptz;
  v_ordre text := COALESCE(p_reglage ->> 'ordre', 'anciennes');
  v_premier date; v_probant boolean;
BEGIN
  v_seuil := now() - make_interval(days => v_age);
  SELECT min(s.captured_on) INTO v_premier FROM vinted_listing_snapshots s WHERE s.user_id = p_user;
  v_probant := v_premier IS NOT NULL AND v_premier <= v_seuil::date;

  RETURN QUERY
  WITH base AS (
    SELECT i.id, i.vinted_item_id, i.vinted_account_id, i.titre, i.prix_vente, i.vinted_view_count, i.listed_at_guess
    FROM inventaire i
    WHERE i.user_id = p_user
      AND i.statut = 'stock'
      AND i.vinted_item_id IS NOT NULL
      AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
      AND (i.vinted_status IS NULL OR i.vinted_status NOT IN ('hidden', 'draft'))
      AND i.disparu_le IS NULL
      AND i.listed_at_guess IS NOT NULL
      AND i.listed_at_guess < v_seuil
  ),
  dernier AS (
    SELECT DISTINCT ON (j.platform_fields ->> 'vinted_item_id')
      j.platform_fields ->> 'vinted_item_id' AS item, j.status, j.published_at, j.created_at
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish'
      AND j.platform_fields ->> 'vinted_item_id' IN (SELECT b.vinted_item_id FROM base b)
    ORDER BY j.platform_fields ->> 'vinted_item_id', j.created_at DESC
  ),
  snap AS (
    SELECT s.vinted_item_id AS item, min(s.captured_on) AS premier
    FROM vinted_listing_snapshots s
    WHERE v_probant AND s.user_id = p_user
      AND s.vinted_item_id IN (SELECT b.vinted_item_id FROM base b)
    GROUP BY s.vinted_item_id
  )
  SELECT b.id, b.vinted_item_id, b.vinted_account_id, b.titre,
    CASE
      WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
      WHEN d.status = 'needs_user' THEN 'attente_decision'
      WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
      WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
      WHEN v_probant AND sn.premier IS NOT NULL AND sn.premier > v_seuil::date THEN 'observee_trop_recente'
      ELSE NULL
    END,
    (row_number() OVER (ORDER BY
       CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
       CASE WHEN v_ordre = 'vues'
            THEN b.vinted_view_count::numeric / GREATEST(1, extract(epoch FROM (now() - b.listed_at_guess)) / 86400)
       END ASC NULLS LAST,
       b.listed_at_guess ASC, b.id ASC))::integer
  FROM base b
  LEFT JOIN dernier d ON d.item = b.vinted_item_id
  LEFT JOIN snap sn ON sn.item = b.vinted_item_id
  ORDER BY 6;
END;
$$;

-- ── L'ÉTAT, pour l'app (auth.uid()). Tout ce que le bloc compact et l'écran
-- complet affichent vient d'ici ; l'app formate, ne recalcule rien. ────────
-- `attendu` = ce qui va RÉELLEMENT partir (décision Nico, point 2) :
--   min(restants du plafond, éligibles, capacité du créneau) — et `borne`
--   dit lequel des trois a tranché. Le plafond du palier est rendu à part,
--   comme la borne du palier, jamais comme ce qui va se passer aujourd'hui.
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
      'autorise', v_palier IN ('premium', 'pro', 'business'),
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
    'legacy', v_legacy,
    'moteur', 'planifie'
  );
END;
$$;

-- ── LA FENÊTRE COURANTE de l'appelant : ce que lit get-pending-jobs pour
-- retenir hors créneau, et ce que peut lire le popup. ─────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_fenetre_courante()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_regl jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('actif', false); END IF;
  v_regl := republish_planifiee_reglage(auth.uid());
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object('actif', false);
  END IF;
  RETURN jsonb_build_object('actif', true) || republish_planifiee_fenetre(v_regl, now());
END;
$$;

-- ── LE RÉGLAGE, ÉCRIT PAR L'APP : validation SERVEUR (le plancher de 7 jours
-- ne peut pas être descendu, le plafond ne dépasse pas le palier, un créneau
-- incohérent est REFUSÉ, pas corrigé) et BASCULE atomique : à l'activation,
-- l'ancien republish_auto est coupé (arret_motif 'bascule_planifiee'), ce qui
-- éteint le moteur client des extensions 0.6.x sans paquet. `p` est un PATCH
-- (fusionné sur le réglage existant) : {actif:true} suffit à activer avec
-- les défauts, {ordre:'prix'} ne touche que l'ordre. ──────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_palier text; v_plafond_palier integer;
  v_ps jsonb; v_cur jsonb; v_new jsonb; v_legacy jsonb;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_actif_avant boolean; v_actif boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_palier := republish_palier(v_user);
  -- Même code que le RPC : le parc d'extensions le classe « portée compte ».
  IF v_palier NOT IN ('premium', 'pro', 'business') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auto_reserve_pro');
  END IF;
  v_plafond_palier := republish_plafond_palier(v_palier);

  SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_user FOR UPDATE;
  v_cur := COALESCE(v_ps #> '{vinted,republish_planifiee}', '{}'::jsonb);
  IF jsonb_typeof(v_cur) <> 'object' THEN v_cur := '{}'::jsonb; END IF;
  v_new := v_cur || COALESCE(p, '{}'::jsonb);
  v_actif_avant := COALESCE((v_cur ->> 'actif')::boolean, false);

  -- Créneau : presets fixes, perso validé, jamais à cheval sur minuit.
  v_type := COALESCE(v_new ->> 'creneau', 'matin');
  IF v_type NOT IN ('matin', 'midi', 'soir', 'perso') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
  END IF;
  IF v_type = 'perso' THEN
    BEGIN
      v_de := (v_new ->> 'de')::time; v_a := (v_new ->> 'a')::time;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
    END;
    IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
    END IF;
  ELSE
    v_de := CASE v_type WHEN 'matin' THEN '08:00'::time WHEN 'midi' THEN '12:00'::time ELSE '19:00'::time END;
    v_a  := CASE v_type WHEN 'matin' THEN '10:00'::time WHEN 'midi' THEN '14:00'::time ELSE '22:00'::time END;
  END IF;
  v_new := v_new || jsonb_build_object('creneau', v_type, 'de', to_char(v_de, 'HH24:MI'), 'a', to_char(v_a, 'HH24:MI'));

  v_fuseau := COALESCE(NULLIF(v_new ->> 'fuseau', ''), 'Europe/Paris');
  BEGIN
    PERFORM now() AT TIME ZONE v_fuseau;
  EXCEPTION WHEN OTHERS THEN v_fuseau := 'Europe/Paris';
  END;
  v_new := v_new || jsonb_build_object('fuseau', v_fuseau);

  -- Jours : absent = les 7 ; vide ou hors 1..7 = refusé (jamais « aucun jour » en silence).
  IF v_new ? 'jours' THEN
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::integer[]) INTO v_jours
    FROM (
      SELECT (e)::integer AS x
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_new -> 'jours') = 'array' THEN v_new -> 'jours' ELSE '[]'::jsonb END) e
      WHERE e ~ '^[1-7]$'
    ) s;
    IF cardinality(v_jours) = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'jours_invalides'); END IF;
  ELSE
    v_jours := ARRAY[1,2,3,4,5,6,7];
  END IF;
  v_new := v_new || jsonb_build_object('jours', to_jsonb(v_jours));

  -- Plafond du jour ≤ palier ; ancienneté ≥ 7 ; ordre connu.
  BEGIN v_plafond := NULLIF(v_new ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  v_plafond := LEAST(v_plafond_palier, GREATEST(1, COALESCE(v_plafond, v_plafond_palier)));
  BEGIN v_age := NULLIF(v_new ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));
  v_ordre := COALESCE(v_new ->> 'ordre', 'anciennes');
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;
  IF jsonb_typeof(v_new -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_new -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_new -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n))); END IF;
    END LOOP;
  END IF;
  v_new := v_new || jsonb_build_object('plafond_jour', v_plafond, 'age_jours', v_age, 'ordre', v_ordre, 'plafond_boutique', v_pb);

  -- Activation / arrêt : horodatés, motif écrit.
  v_actif := COALESCE((v_new ->> 'actif')::boolean, false);
  IF v_actif AND NOT v_actif_avant THEN
    v_new := v_new || jsonb_build_object('active_le', now(), 'arrete_le', NULL, 'arret_motif', NULL);
  ELSIF NOT v_actif AND v_actif_avant THEN
    v_new := v_new || jsonb_build_object('arrete_le', now(), 'arret_motif', COALESCE(p ->> 'arret_motif', 'utilisateur'));
  END IF;
  v_new := v_new || jsonb_build_object('actif', v_actif);

  -- BASCULE : le module actif coupe l'ancien moteur (client + sweep témoin).
  -- Lecture-fusion-écriture : platform_settings porte aussi l'adresse
  -- Leboncoin et les autres réglages, jamais d'écrasement global.
  v_ps := jsonb_set(v_ps, '{vinted}', COALESCE(v_ps -> 'vinted', '{}'::jsonb), true);
  v_ps := jsonb_set(v_ps, '{vinted,republish_planifiee}', v_new, true);
  IF v_actif THEN
    v_legacy := v_ps #> '{vinted,republish_auto}';
    IF v_legacy IS NOT NULL AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN
      v_ps := jsonb_set(v_ps, '{vinted,republish_auto}',
        v_legacy || jsonb_build_object('actif', false, 'arrete_le', now(), 'arret_motif', 'bascule_planifiee'), true);
    END IF;
  END IF;
  UPDATE profiles SET platform_settings = v_ps WHERE id = v_user;

  RETURN jsonb_build_object('ok', true) || republish_planifiee_etat();
END;
$$;

-- ── DROITS ─────────────────────────────────────────────────────────────────
-- Helpers à paramètre d'identité : fermés à tout le monde sauf service_role.
REVOKE ALL ON FUNCTION public.republish_palier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_plafond_palier(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_minuit_local(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_boutiques(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_boutique_connectee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_reglage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_fenetre(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_espacement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_capacite(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_candidats(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_palier(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_plafond_palier(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_minuit_local(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_boutiques(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_boutique_connectee(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_reglage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_fenetre(jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_espacement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_capacite(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_candidats(uuid, jsonb) TO service_role;

-- Les trois portes de l'app et de get-pending-jobs (auth.uid() seul).
REVOKE ALL ON FUNCTION public.republish_planifiee_etat() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_regler(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_fenetre_courante() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_etat() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_regler(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_fenetre_courante() TO authenticated, service_role;

-- Contrôle (en tant que postgres, sans effet) :
--   SELECT public.republish_planifiee_fenetre(
--     '{"de":"08:00","a":"10:00","fuseau":"Europe/Paris","jours":[1,2,3,4,5,6,7]}'::jsonb, now());
--   SELECT public.republish_planifiee_capacite(7200, 354);   -- 20
--   SELECT public.republish_planifiee_capacite(39600, 354);  -- 11 h avec pause 50/120 min
