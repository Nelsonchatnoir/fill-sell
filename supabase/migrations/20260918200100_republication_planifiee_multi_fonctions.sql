-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE MULTIPLATEFORME — 2/5 : les fonctions
-- 2026-09-18.
-- ═════════════════════════════════════════════════════════════════════════════
-- ⛔ IL N'Y A AUCUNE DONNÉE À MIGRER, ET C'EST MESURÉ. La forme cible
--    platform_settings.<plateforme>.republish_planifiee EST DÉJÀ l'emplacement
--    d'aujourd'hui : le réglage Vinted vit à {vinted,republish_planifiee}.
--    Les 5 réglages en base (josephinecerni, meminiandmove, ornellaracano,
--    xxewwer actifs + nicolas.svobodny arrêté) ne sont pas touchés d'un octet :
--    ni créneau, ni jours, ni plafond, ni ancienneté, ni ordre, ni historique.
--    Les trois autres plateformes : clé ABSENTE = module inactif. Aucun défaut
--    n'est posé, aucun réglage n'est inventé, personne n'est basculé.
--    Le « repli sur l'ancien emplacement » demandé est donc STRUCTUREL, pas un
--    filet : pour 'vinted', la lecture ci-dessous est mot pour mot celle du
--    12/09. AUCUNE ÉCRITURE dans profiles dans cette migration.
--
-- ── LES SIGNATURES ──────────────────────────────────────────────────────────
-- Chaque fonction gagne `p_platform text DEFAULT 'vinted'`. L'ancienne
-- signature est SUPPRIMÉE (une surcharge rendrait l'appel sans argument
-- ambigu) ; tous les appels existants — app, sweep, RPC de débit,
-- get-pending-jobs — résolvent sur le défaut, sans changement de comportement.
--   republish_planifiee_regler(p jsonb) est la SEULE à garder sa signature :
--   la plateforme voyage DANS le patch (p->>'platform'). PostgREST ne voit
--   rien changer, l'app d'aujourd'hui continue de viser Vinted.
--
-- ── L'ENVELOPPE DE PLAFOND (décision Nico du 18/09) ─────────────────────────
-- Chaque plateforme a SON plafond du jour ; leur SOMME est bornée par le
-- plafond du palier (170/jour en Pro). Ce n'est pas un choix esthétique :
--   · 170 × 30 = 5 100 ≈ quota_republication_pro = 5 000. Le plafond du palier
--     a été calibré comme une enveloppe de COMPTE. Quatre plафonds pleins
--     (680/jour) brûleraient le quota mensuel en 8 jours, et le module
--     passerait trois semaines à refuser — il aurait l'air cassé en obéissant ;
--   · l'extension est UN worker sérialisé. Mesuré le 18/09 : 600 à 1 400 s par
--     republication Leboncoin/Beebs. 680/jour est hors de portée physique :
--     l'annoncer serait une promesse creuse.
--
-- ── LA CAPACITÉ EST UN BUDGET DE TEMPS PARTAGÉ ──────────────────────────────
-- Quatre plateformes dans la même fenêtre tirent sur le MÊME Chrome. La
-- capacité annoncée pour une plateforme est donc calculée sur le temps qui
-- RESTE une fois déduit ce que les créneaux encore en cours des autres
-- plateformes ont déjà réservé. Sans ça, 4 × « jusqu'à 12 » = 48 annoncées
-- pour 12 possibles.
--
-- Idempotente. Retour arrière : rejouer 20260912130200 (fonctions du 12/09)
-- puis 20260917221000 (etat du 17/09) — en supprimant d'abord les signatures
-- à p_platform.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── LES PLATEFORMES DU MODULE, EN UN SEUL ENDROIT ───────────────────────────
-- eBay n'y est pas et n'y sera pas : voie API, on ne republie pas.
CREATE OR REPLACE FUNCTION public.republish_planifiee_plateformes()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY['vinted', 'leboncoin', 'beebs', 'opla']::text[] $$;

-- Interrupteur PAR PLATEFORME. Fail-closed : clé absente = fermée.
-- (Les quatre sont posées à 1 par la migration 1/5.)
CREATE OR REPLACE FUNCTION public.republish_planifiee_pf_ouverte(p_platform text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE((SELECT value FROM coin_config
                   WHERE key = 'republish_planifiee_pf_' || lower(COALESCE(p_platform, ''))), 0) = 1
$$;

-- ── LE RÉGLAGE, PAR PLATEFORME ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.republish_planifiee_reglage(uuid);
CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(p_user uuid, p_platform text DEFAULT 'vinted')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_brut jsonb; v_palier text; v_plafond_palier integer;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_invalide text := NULL; v_actif boolean;
BEGIN
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN RETURN NULL; END IF;

  SELECT p.platform_settings #> ARRAY[v_pf, 'republish_planifiee'] INTO v_brut
  FROM profiles p WHERE p.id = p_user;
  IF v_brut IS NULL OR jsonb_typeof(v_brut) <> 'object' THEN RETURN NULL; END IF;

  v_palier := republish_palier(p_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  -- Module = fonctionnalité PRO (correction Nico 12/09 15h30, 3bis) ; business
  -- porte is_pro (flags cumulatifs). Un non-Pro a un réglage INVALIDE.
  IF v_palier NOT IN ('pro', 'business') THEN v_invalide := 'palier'; END IF;

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
      IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de THEN v_invalide := COALESCE(v_invalide, 'creneau'); END IF;
    ELSE v_invalide := COALESCE(v_invalide, 'creneau');
  END CASE;

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
  -- (L'enveloppe de compte — la somme des quatre — est appliquée à la
  --  CONSOMMATION, dans republish_planifiee_etat et dans le sweep : un réglage
  --  n'est jamais amputé à cause d'une autre plateforme.)
  BEGIN v_plafond := NULLIF(v_brut ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  v_plafond := LEAST(v_plafond_palier, GREATEST(1, COALESCE(v_plafond, v_plafond_palier)));

  -- Ancienneté : PLANCHER 7 (anti-ban, 09/08, jamais rebaissé), plafond 365, défaut 30.
  BEGIN v_age := NULLIF(v_brut ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));

  v_ordre := COALESCE(v_brut ->> 'ordre', 'anciennes');
  -- 'vues' n'a de sens que là où l'on relève des vues. Hors Vinted, le tri
  -- retombe sur 'anciennes' plutôt que de trier sur du vide.
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;
  IF v_ordre = 'vues' AND v_pf <> 'vinted' THEN v_ordre := 'anciennes'; END IF;

  -- Plafond par boutique : notion VINTED (vinted_account_id). Les autres
  -- plateformes n'ont pas de boutique relevée : objet vide, jamais inventé.
  IF v_pf = 'vinted' AND jsonb_typeof(v_brut -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_brut -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_brut -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN
        v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n)));
      END IF;
    END LOOP;
  END IF;

  v_actif := COALESCE((v_brut ->> 'actif')::boolean, false) AND v_invalide IS NULL;

  RETURN jsonb_build_object(
    'platform', v_pf,
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
    'arret_motif', v_brut ->> 'arret_motif',
    'palier_perdu_le', v_brut ->> 'palier_perdu_le',
    'pause_generale', COALESCE((v_brut ->> 'pause_generale')::boolean, false)
  );
END;
$$;

-- ── ESPACEMENT RÉEL, PAR PLATEFORME ─────────────────────────────────────────
-- Vinted : inchangé (médiane du compte sur 30 j, ≥ 10 intervalles, repli parc).
-- Les autres : la médiane du COMPTE SUR CETTE PLATEFORME dès qu'il y a
-- 10 intervalles ; sinon le PLANCHER de parc (coin_config
-- republish_espacement_min_<pf>_sec, 900 s posés sur mesure de durée de cycle,
-- cf. 1/5). Jamais une constante optimiste, jamais la cadence Vinted
-- transposée : Vinted republie en 355 s, Leboncoin en 2 311 s mesurés.
-- Le plancher s'applique AUSSI à une médiane mesurée : une série de trois
-- republications rapides ne doit pas faire promettre une cadence qu'on ne
-- tiendra pas.
DROP FUNCTION IF EXISTS public.republish_planifiee_espacement(uuid);
CREATE OR REPLACE FUNCTION public.republish_planifiee_espacement(p_user uuid, p_platform text DEFAULT 'vinted')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_med numeric; v_n integer; v_parc integer; v_min integer; v_sec integer; v_source text;
BEGIN
  WITH s AS (
    SELECT extract(epoch FROM (j.published_at - lag(j.published_at) OVER (ORDER BY j.published_at))) AS ecart
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform = v_pf
      AND j.published_at > now() - interval '30 days'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ecart), count(*)
  INTO v_med, v_n
  FROM s WHERE ecart IS NOT NULL AND ecart > 0 AND ecart < 7200;

  SELECT value INTO v_parc FROM coin_config WHERE key = 'republish_espacement_parc_sec';
  IF v_parc IS NULL OR v_parc <= 0 THEN v_parc := 354; END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'republish_espacement_min_' || v_pf || '_sec';
  v_min := GREATEST(0, COALESCE(v_min, 0));

  IF COALESCE(v_n, 0) >= 10 AND v_med IS NOT NULL AND v_med > 0 THEN
    v_sec := round(v_med)::integer; v_source := 'compte';
  ELSE
    v_sec := v_parc; v_source := 'parc';
  END IF;
  IF v_min > 0 AND v_sec < v_min THEN
    v_sec := v_min; v_source := v_source || '_plancher';
  END IF;
  RETURN jsonb_build_object('sec', v_sec, 'source', v_source,
                            'intervalles', COALESCE(v_n, 0), 'plancher', v_min, 'platform', v_pf);
END;
$$;

-- ── CAPACITÉ PARTAGÉE : un seul Chrome pour quatre plateformes ──────────────
-- Le temps déjà réservé par les créneaux ENCORE EN COURS des AUTRES
-- plateformes (ce qu'elles ont annoncé et pas encore fait × leur espacement)
-- est retiré de la durée avant le calcul. Aucune plateforme ne promet le
-- temps d'une autre.
CREATE OR REPLACE FUNCTION public.republish_planifiee_capacite_partagee(
  p_user uuid, p_platform text, p_duree_sec integer, p_espacement_sec integer)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reserve numeric := 0;
BEGIN
  IF p_duree_sec IS NULL OR p_duree_sec <= 0 THEN RETURN 0; END IF;
  SELECT COALESCE(sum(GREATEST(0, COALESCE(r.prevues, 0) - COALESCE(f.n, 0))
                      * GREATEST(60, COALESCE(r.espacement_sec, 900))), 0)
  INTO v_reserve
  FROM republish_creneaux r
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish'
      AND j.platform_fields ->> 'republish_creneau_id' = r.id::text
  ) f ON true
  WHERE r.user_id = p_user AND r.statut = 'en_cours'
    AND r.platform <> lower(COALESCE(p_platform, '')) AND r.fin > now();

  RETURN republish_planifiee_capacite(
    GREATEST(0, p_duree_sec - LEAST(p_duree_sec, v_reserve))::integer, p_espacement_sec);
END;
$$;

-- ── LE VIVIER D'UNE PLATEFORME : les annonces FillSell EN LIGNE ─────────────
-- Sert l'écran (« Rien à republier ici : tes annonces Leboncoin ne sont pas
-- passées par FillSell ») sans lancer le scan complet des candidats.
CREATE OR REPLACE FUNCTION public.republish_planifiee_annonces_en_ligne(p_user uuid, p_platform text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(DISTINCT j.inventaire_id)::integer
  FROM cross_post_jobs j
  JOIN inventaire i ON i.id = j.inventaire_id
  WHERE j.user_id = p_user AND j.platform = lower(COALESCE(p_platform, ''))
    AND j.action IN ('publish', 'republish') AND j.status = 'published'
    AND NULLIF(trim(j.listing_url), '') IS NOT NULL
    AND i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL
$$;

-- ── LES CANDIDATS, PAR PLATEFORME ───────────────────────────────────────────
-- VINTED : la requête du 12/09, mot pour mot (vinted_item_id, snapshots,
--   listed_at_guess, garde « historique probant »). Rien n'y change.
-- LES AUTRES : il n'y a ni vinted_item_id, ni snapshot, ni listed_at_guess —
--   et il n'en faut pas. L'annonce est portée par un JOB FillSell publié qui
--   garde son lien : son `published_at` est la date de mise en ligne EXACTE,
--   pas une estimation. L'ancienneté s'y mesure donc mieux que sur Vinted.
--   Pas de `boutique` : la notion est vinted_account_id, elle n'existe pas
--   ailleurs — NULL, jamais inventée.
--   `item_id` rend l'identifiant d'annonce de la plateforme quand il est connu
--   (Beebs n'en pose pas toujours) ; la clé de déduplication de l'historique,
--   elle, est l'inventaire (cf. 3/5).
DROP FUNCTION IF EXISTS public.republish_planifiee_candidats(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.republish_planifiee_candidats(
  p_user uuid, p_reglage jsonb, p_platform text DEFAULT 'vinted')
RETURNS TABLE (inv_id bigint, item_id text, boutique text, titre text, motif text, rang integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_age integer := LEAST(365, GREATEST(7, COALESCE(NULLIF(p_reglage ->> 'age_jours', '')::integer, 30)));
  v_seuil timestamptz;
  v_ordre text := COALESCE(p_reglage ->> 'ordre', 'anciennes');
  v_premier date; v_probant boolean;
BEGIN
  v_seuil := now() - make_interval(days => v_age);

  IF v_pf <> 'vinted' THEN
    RETURN QUERY
    WITH base AS (
      SELECT i.id, i.titre, i.prix_vente, d.listing_id, d.mise_en_ligne
      FROM inventaire i
      JOIN LATERAL (
        SELECT COALESCE(NULLIF(trim(j.platform_listing_id), ''), NULL) AS listing_id,
               COALESCE(j.published_at, j.created_at) AS mise_en_ligne,
               j.photos
        FROM cross_post_jobs j
        WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = v_pf
          AND j.action IN ('publish', 'republish') AND j.status = 'published'
          AND NULLIF(trim(j.listing_url), '') IS NOT NULL
        ORDER BY COALESCE(j.published_at, j.created_at) DESC
        LIMIT 1
      ) d ON true
      WHERE i.user_id = p_user
        AND i.statut = 'stock'
        AND i.disparu_le IS NULL
        -- Le redépôt copie les photos du JOB source : sans elles, la RPC
        -- refuserait 'article_sans_photo'. On ne les compte pas éligibles.
        AND jsonb_typeof(d.photos) = 'array' AND jsonb_array_length(d.photos) > 0
        AND d.mise_en_ligne < v_seuil
    ),
    dernier AS (
      SELECT DISTINCT ON (j.inventaire_id)
        j.inventaire_id AS inv, j.status, j.published_at, j.created_at
      FROM cross_post_jobs j
      WHERE j.user_id = p_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.inventaire_id IN (SELECT b.id FROM base b)
      ORDER BY j.inventaire_id, j.created_at DESC
    )
    SELECT b.id, b.listing_id, NULL::text, b.titre,
      CASE
        WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
        WHEN d.status = 'needs_user' THEN 'attente_decision'
        WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
        WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
        ELSE NULL
      END,
      (row_number() OVER (ORDER BY
         CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
         b.mise_en_ligne ASC, b.id ASC))::integer
    FROM base b
    LEFT JOIN dernier d ON d.inv = b.id
    ORDER BY 6;
    RETURN;
  END IF;

  -- ── VINTED : inchangé depuis le 12/09 ────────────────────────────────────
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

-- ── L'ÉTAT D'UNE PLATEFORME ─────────────────────────────────────────────────
-- Tout ce que l'écran affiche vient d'ici ; l'app FORMATE, ne recalcule rien.
-- `attendu` = ce qui va RÉELLEMENT partir :
--   min(restants du plafond de la plateforme, restants de l'ENVELOPPE DE
--       COMPTE, éligibles, capacité PARTAGÉE du créneau)
-- et `borne` dit lequel des quatre a tranché. Le plafond du palier est rendu
-- à part, comme la borne du palier, jamais comme ce qui va se passer.
DROP FUNCTION IF EXISTS public.republish_planifiee_etat();
CREATE OR REPLACE FUNCTION public.republish_planifiee_etat(p_platform text DEFAULT 'vinted')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text; v_plafond_palier integer;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz;
  v_crees_pf integer; v_abouties_pf integer; v_crees_compte integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_restants_compte integer;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb; v_disjoncteur jsonb;
  v_ouverte boolean; v_en_ligne integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('error', 'invalid_platform', 'platform', v_pf);
  END IF;

  v_palier := republish_palier(v_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  v_regl := republish_planifiee_reglage(v_user, v_pf);
  v_ouverte := republish_planifiee_pf_ouverte(v_pf);
  v_en_ligne := republish_planifiee_annonces_en_ligne(v_user, v_pf);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant), COMMUN
  -- à toutes les plateformes — une republication est une republication.
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
  -- Trois compteurs du jour : CETTE plateforme, le COMPTE (l'enveloppe), et le
  -- total manuel + auto (affichage).
  SELECT count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*)
  INTO v_crees_pf, v_abouties_pf, v_crees_compte, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  IF v_pf = 'vinted' THEN
    v_ident := republish_boutique_connectee(v_user);
    v_boutique := v_ident ->> 'user_id';
    v_boutiques := republish_boutiques(v_user);
    v_multi := jsonb_array_length(v_boutiques) >= 2;
  ELSE
    v_ident := NULL; v_boutique := NULL; v_boutiques := '[]'::jsonb; v_multi := false;
  END IF;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'platform', v_pf,
      'actif', false,
      'configure', v_regl IS NOT NULL,
      'ouverte', v_ouverte,
      'annonces_en_ligne', v_en_ligne,
      'reglage', v_regl,
      'palier', v_palier, 'plafond_palier', v_plafond_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'aujourdhui', jsonb_build_object(
        'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
        'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
        'plafond_compte', v_plafond_palier,
        'restants_compte', GREATEST(0, v_plafond_palier - v_crees_compte)),
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
      'moteur', CASE WHEN v_pf = 'vinted' AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user, v_pf);

  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl, v_pf) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  v_capacite := republish_planifiee_capacite_partagee(v_user, v_pf, v_duree, (v_esp ->> 'sec')::integer);

  v_restants := CASE WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_pf) END;
  -- L'ENVELOPPE DE COMPTE : la somme de toutes les plateformes ne dépasse pas
  -- le plafond du palier. Un créneau de demain repart d'une enveloppe pleine.
  v_restants_compte := CASE WHEN v_jour_prochain THEN v_plafond_palier
                            ELSE GREATEST(0, v_plafond_palier - v_crees_compte) END;

  IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
    v_plafond_b := LEAST((v_regl ->> 'plafond_jour')::integer, GREATEST(1, COALESCE(
      NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, (v_regl ->> 'plafond_jour')::integer)));
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;

  v_attendu := LEAST(v_restants, v_restants_compte,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  -- L'interrupteur de la plateforme : à 0, rien ne part. On le dit, on
  -- n'affiche pas un nombre qui ne se réalisera pas.
  IF NOT v_ouverte THEN v_attendu := 0; END IF;
  v_borne := CASE
    WHEN NOT v_ouverte THEN 'plateforme_fermee'
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_restants_compte THEN 'plafond_compte'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut = 'en_cours' ORDER BY r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut <> 'en_cours' ORDER BY r.debut DESC LIMIT 1;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    IF v_blocage IS NOT NULL AND (v_blocage ? 'leve_le') THEN v_blocage := NULL; END IF;
    v_disjoncteur := v_courant -> 'sautes' -> '_disjoncteur';
  END IF;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', true,
    'configure', true,
    'ouverte', v_ouverte,
    'annonces_en_ligne', v_en_ligne,
    'reglage', v_regl,
    'palier', v_palier, 'plafond_palier', v_plafond_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
      'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
      'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_compte', v_plafond_palier, 'restants_compte', v_restants_compte,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', COALESCE(v_faites_live, 0), 'blocage', v_blocage, 'disjoncteur', v_disjoncteur,
    'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
    'moteur', 'planifie'
  );
END;
$$;

-- ── LES QUATRE D'UN COUP, POUR L'ÉCRAN ──────────────────────────────────────
-- Une plateforme SANS RÉGLAGE ne déclenche PAS le scan des candidats : elle
-- rend un état léger (vivier, interrupteur, droit). Le coût du poll ne bouge
-- donc pas pour les comptes d'aujourd'hui, qui n'ont que Vinted de réglé.
CREATE OR REPLACE FUNCTION public.republish_planifiee_etat_multi()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf text; v_etat jsonb; v_liste jsonb := '[]'::jsonb;
  v_palier text; v_plafond_palier integer; v_actives integer := 0;
  v_minuit timestamptz; v_crees integer; v_global integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  v_palier := republish_palier(v_user);
  v_plafond_palier := republish_plafond_palier(v_palier);
  SELECT value INTO v_global FROM coin_config WHERE key = 'republish_planifiee_actif';
  v_minuit := republish_minuit_local('Europe/Paris');
  SELECT count(*) INTO v_crees FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish'
    AND j.platform_fields ->> 'republish_source' = 'auto' AND j.created_at >= v_minuit;

  FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
    v_etat := republish_planifiee_etat(v_pf);
    IF COALESCE((v_etat ->> 'actif')::boolean, false) THEN v_actives := v_actives + 1; END IF;
    v_liste := v_liste || v_etat;
  END LOOP;

  RETURN jsonb_build_object(
    'palier', v_palier,
    'plafond_palier', v_plafond_palier,
    'autorise', v_palier IN ('pro', 'business'),
    'interrupteur_global', COALESCE(v_global, 0),
    'actives', v_actives,
    'enveloppe', jsonb_build_object(
      'plafond_compte', v_plafond_palier,
      'crees_compte', v_crees,
      'restants_compte', GREATEST(0, v_plafond_palier - v_crees)),
    'plateformes', v_liste);
END;
$$;

-- ── LES FENÊTRES COURANTES, POUR get-pending-jobs ───────────────────────────
DROP FUNCTION IF EXISTS public.republish_planifiee_fenetre_courante();
CREATE OR REPLACE FUNCTION public.republish_planifiee_fenetre_courante(p_platform text DEFAULT 'vinted')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_regl jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('actif', false); END IF;
  v_regl := republish_planifiee_reglage(auth.uid(), p_platform);
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object('actif', false);
  END IF;
  RETURN jsonb_build_object('actif', true, 'platform', lower(COALESCE(p_platform, 'vinted')))
         || republish_planifiee_fenetre(v_regl, now());
END;
$$;

-- La retenue hors créneau est PAR PLATEFORME : un job Leboncoin ne se juge pas
-- sur la fenêtre Vinted. Un seul aller-retour pour les quatre.
CREATE OR REPLACE FUNCTION public.republish_planifiee_fenetres_courantes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pf text; v_out jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN v_out; END IF;
  FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
    v_out := v_out || jsonb_build_object(v_pf, republish_planifiee_fenetre_courante(v_pf));
  END LOOP;
  RETURN v_out;
END;
$$;

-- ── LE RÉGLAGE, ÉCRIT PAR L'APP ─────────────────────────────────────────────
-- SIGNATURE INCHANGÉE : la plateforme voyage dans le patch (`platform`,
-- défaut 'vinted'). Validation SERVEUR identique au 12/09 : le plancher de
-- 7 jours ne se descend pas, le plafond ne dépasse pas le palier, un créneau
-- incohérent est REFUSÉ, pas corrigé. `p` est un PATCH fusionné sur le réglage
-- existant DE CETTE PLATEFORME.
CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p ->> 'platform'), ''), 'vinted'));
  v_palier text; v_plafond_palier integer;
  v_ps jsonb; v_cur jsonb; v_new jsonb; v_legacy jsonb;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_actif_avant boolean; v_actif boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform', 'platform', v_pf);
  END IF;
  v_palier := republish_palier(v_user);
  IF v_palier NOT IN ('pro', 'business') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auto_reserve_pro');
  END IF;
  v_plafond_palier := republish_plafond_palier(v_palier);

  SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_user FOR UPDATE;
  v_cur := COALESCE(v_ps #> ARRAY[v_pf, 'republish_planifiee'], '{}'::jsonb);
  IF jsonb_typeof(v_cur) <> 'object' THEN v_cur := '{}'::jsonb; END IF;
  v_new := (v_cur || COALESCE(p, '{}'::jsonb)) - 'platform';
  v_actif_avant := COALESCE((v_cur ->> 'actif')::boolean, false);

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

  BEGIN v_plafond := NULLIF(v_new ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  v_plafond := LEAST(v_plafond_palier, GREATEST(1, COALESCE(v_plafond, v_plafond_palier)));
  BEGIN v_age := NULLIF(v_new ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));
  v_ordre := COALESCE(v_new ->> 'ordre', 'anciennes');
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;
  IF v_ordre = 'vues' AND v_pf <> 'vinted' THEN v_ordre := 'anciennes'; END IF;
  IF v_pf = 'vinted' AND jsonb_typeof(v_new -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_new -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_new -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n))); END IF;
    END LOOP;
  END IF;
  v_new := v_new || jsonb_build_object('plafond_jour', v_plafond, 'age_jours', v_age, 'ordre', v_ordre, 'plafond_boutique', v_pb);

  -- Activation / arrêt : horodatés, motif écrit. Un geste de l'utilisateur
  -- efface la mémoire d'une pause générale et d'un palier perdu.
  v_actif := COALESCE((v_new ->> 'actif')::boolean, false);
  IF v_actif AND NOT v_actif_avant THEN
    v_new := v_new || jsonb_build_object('active_le', now(), 'arrete_le', NULL, 'arret_motif', NULL);
    v_new := v_new - 'pause_generale' - 'palier_perdu_le';
  ELSIF NOT v_actif AND v_actif_avant THEN
    v_new := v_new || jsonb_build_object('arrete_le', now(), 'arret_motif', COALESCE(p ->> 'arret_motif', 'utilisateur'));
    IF COALESCE(p ->> 'arret_motif', 'utilisateur') <> 'pause_generale' THEN v_new := v_new - 'pause_generale'; END IF;
  END IF;
  v_new := v_new || jsonb_build_object('actif', v_actif);

  -- BASCULE : le module Vinted actif coupe l'ancien moteur (client + sweep
  -- témoin), qui n'a jamais concerné que Vinted.
  v_ps := jsonb_set(v_ps, ARRAY[v_pf], COALESCE(v_ps -> v_pf, '{}'::jsonb), true);
  v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_new, true);
  IF v_actif AND v_pf = 'vinted' THEN
    v_legacy := v_ps #> '{vinted,republish_auto}';
    IF v_legacy IS NOT NULL AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN
      v_ps := jsonb_set(v_ps, '{vinted,republish_auto}',
        v_legacy || jsonb_build_object('actif', false, 'arrete_le', now(), 'arret_motif', 'bascule_planifiee'), true);
    END IF;
  END IF;
  UPDATE profiles SET platform_settings = v_ps WHERE id = v_user;

  RETURN jsonb_build_object('ok', true) || republish_planifiee_etat(v_pf);
END;
$$;

-- ── « TOUT METTRE EN PAUSE » — l'interrupteur du haut ───────────────────────
-- Avec quatre plateformes, un interrupteur unique ne peut plus ACTIVER
-- (activer quoi ?). Il MET TOUT EN PAUSE, en mémorisant quelles plateformes
-- étaient actives (`pause_generale: true`) ; le remettre relance EXACTEMENT
-- celles-là, pas les autres. Aucun réglage n'est perdu, aucun n'est inventé.
CREATE OR REPLACE FUNCTION public.republish_planifiee_pause_generale(p_reprendre boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pf text; v_ps jsonb; v_cur jsonb; v_touche integer := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF republish_palier(v_user) NOT IN ('pro', 'business') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auto_reserve_pro');
  END IF;

  SELECT COALESCE(p.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p WHERE p.id = v_user FOR UPDATE;
  FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
    v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
    CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object';
    IF p_reprendre THEN
      CONTINUE WHEN NOT COALESCE((v_cur ->> 'pause_generale')::boolean, false);
      v_cur := (v_cur - 'pause_generale')
               || jsonb_build_object('actif', true, 'active_le', now(), 'arrete_le', NULL, 'arret_motif', NULL);
    ELSE
      CONTINUE WHEN NOT COALESCE((v_cur ->> 'actif')::boolean, false);
      v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                           'arret_motif', 'pause_generale', 'pause_generale', true);
    END IF;
    v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
    v_touche := v_touche + 1;
  END LOOP;
  UPDATE profiles SET platform_settings = v_ps WHERE id = v_user;
  RETURN jsonb_build_object('ok', true, 'plateformes', v_touche) || republish_planifiee_etat_multi();
END;
$$;

-- ── DROITS ─────────────────────────────────────────────────────────────────
-- Helpers à paramètre d'identité : fermés à tout le monde sauf service_role.
REVOKE ALL ON FUNCTION public.republish_planifiee_reglage(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_espacement(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_candidats(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_capacite_partagee(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_planifiee_annonces_en_ligne(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_reglage(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_espacement(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_candidats(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_capacite_partagee(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_annonces_en_ligne(uuid, text) TO service_role;

-- Sans paramètre d'identité (auth.uid()) : ouvertes à `authenticated`.
REVOKE ALL ON FUNCTION public.republish_planifiee_etat(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_etat_multi() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_regler(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_pause_generale(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_fenetre_courante(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_fenetres_courantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_etat(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_etat_multi() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_regler(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_pause_generale(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_fenetre_courante(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_fenetres_courantes() TO authenticated, service_role;

-- Sans identité du tout : lisibles par tous les connectés.
REVOKE ALL ON FUNCTION public.republish_planifiee_plateformes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.republish_planifiee_pf_ouverte(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_plateformes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_pf_ouverte(text) TO authenticated, service_role;

-- Contrôle :
--   SELECT p.proname, pg_get_function_arguments(p.oid) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname LIKE 'republish_planifiee%' ORDER BY 1;
--   → une seule ligne par nom, aucune surcharge
--   SELECT jsonb_pretty(republish_planifiee_reglage('<user>'::uuid));  -- vinted, inchangé
--   SELECT jsonb_pretty(republish_planifiee_reglage('<user>'::uuid, 'leboncoin'));  -- NULL
