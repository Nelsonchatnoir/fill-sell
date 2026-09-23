-- ═══════════════════════════════════════════════════════════════════════════
-- FAMINE BEEBS / OPLA DANS LES CRÉNEAUX — PART ÉQUITABLE + TOUR DE RÔLE (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- Joséphine (Pro) : 14 annonces Beebs éligibles, 0 prévue, 0 republication Beebs
-- en 30 jours. Cause établie dans republish_planifiee_sweep :
--   · l'ordre des plateformes était FIXE (Vinted toujours en tête) et un seul job
--     par passage (EXIT WHEN v_cree) ;
--   · republish_planifiee_capacite_partagee réservait à la PREMIÈRE plateforme
--     (Vinted) tout le temps du créneau (somme des prevues×espacement des autres),
--     si bien que Beebs/Opla, en bout de file, recevaient prevues 0 — GELÉ, puis
--     `_prevues_atteintes` à chaque passage : jamais rien.
--
-- CORRECTIF (⛔ ne touche NI les plafonds journaliers, NI les quotas de palier, NI
--  l'espacement entre deux republications d'une même plateforme — seulement
--  l'ORDRE et le PARTAGE de la capacité entre plateformes) :
--   1. republish_planifiee_actives_eligibles(user) — NEUVE : compte les plateformes
--      qui méritent une part MAINTENANT (active + ouverte + dans sa fenêtre + au
--      moins un article éligible). Une plateforme inactive / hors créneau / sans
--      rien à faire ne compte pas → ne réserve aucune capacité à vide.
--   2. republish_planifiee_sweep, DEUX changements ANCRÉS sur le corps prod live :
--      · l'ordre : la plateforme la MOINS servie aujourd'hui passe d'abord (tour
--        de rôle) au lieu de Vinted toujours en tête ;
--      · la capacité : part ÉGALE du créneau = capacite(temps_restant / N_actives,
--        espacement_propre). Un compte MONO-plateforme → N=1 → part pleine →
--        comportement STRICTEMENT INCHANGÉ.
--
-- RÉPARTITION MESURÉE (Joséphine, créneau 4 h, N=3, params du 23/09) :
--   Vinted 13 (part pleine mono = 39 ; avant, actuel ~9-16 → PAS affamé)
--   Beebs   5 (avant 0)   ·   Leboncoin 5 (avant ~1)
--
-- ⛔ NE S'APPLIQUE PAS PAR `db push`. Le sweep est repatché À PARTIR DE SON CORPS
--    PROD LIVE (pg_get_functiondef), ancres vérifiées, refus si une ancre a bougé.
--    Ce fichier EST le SQL exécuté (helper + bloc auto-patch). Il suppose que le
--    correctif « créneau va au bout » (job parqué + disjoncteur) est déjà en place.

-- ── 1. LE COMPTE DES PLATEFORMES QUI MÉRITENT UNE PART ────────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_actives_eligibles(p_user uuid)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE v_pf text; v_regl jsonb; v_fen jsonb; v_n integer := 0; v_elig integer;
BEGIN
  FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
    v_regl := republish_planifiee_reglage(p_user, v_pf);
    CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
    CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
    v_fen := republish_planifiee_fenetre(v_regl, now());
    CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);
    SELECT count(*) INTO v_elig FROM republish_planifiee_candidats(p_user, v_regl, v_pf) c WHERE c.motif IS NULL;
    IF COALESCE(v_elig, 0) > 0 THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN GREATEST(1, v_n);
END;
$function$;

-- ── 2. LE SWEEP : ordre par « moins servi », capacité en part égale ──────────
-- Auto-patch depuis le corps prod live, deux ancres vérifiées une seule fois.
DO $patch$
DECLARE v_src text; v_new text; v_n1 int; v_n2 int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='republish_planifiee_sweep';

  v_n1 := (length(v_src) - length(replace(v_src, $f1$    FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.$f1$, ''))) / length($f1$    FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.$f1$);
  v_n2 := (length(v_src) - length(replace(v_src, $f2$        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite_partagee(v_compte.id, v_pf,
          extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
          (v_esp ->> 'sec')::integer);$f2$, ''))) / length($f2$        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite_partagee(v_compte.id, v_pf,
          extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
          (v_esp ->> 'sec')::integer);$f2$);
  IF v_n1 <> 1 OR v_n2 <> 1 THEN RAISE EXCEPTION 'sweep famine : ancres %/% (attendu 1/1) — ON S ARRETE', v_n1, v_n2; END IF;

  v_new := replace(v_src,
    $f1$    FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.$f1$,
    $g1$    FOR v_pf IN
      SELECT pf FROM unnest(republish_planifiee_plateformes()) AS pf
      ORDER BY (SELECT count(*) FROM cross_post_jobs j
                 WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = pf
                   AND j.platform_fields ->> 'republish_source' = 'auto'
                   AND j.created_at >= date_trunc('day', now())) ASC,  -- MODIF FAMINE 2026-09-24 : la plateforme la MOINS servie aujourd hui passe d abord (tour de role), au lieu de Vinted toujours en tete
               array_position(republish_planifiee_plateformes(), pf)
    LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.$g1$);
  v_new := replace(v_new,
    $f2$        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite_partagee(v_compte.id, v_pf,
          extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
          (v_esp ->> 'sec')::integer);$f2$,
    $g2$        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        -- MODIF FAMINE 2026-09-24 : part EGALE du creneau entre les plateformes actives+eligibles
        -- (republish_planifiee_actives_eligibles), au lieu de reserver tout le temps a la premiere
        -- (Vinted). Un compte mono-plateforme -> N=1 -> part pleine -> INCHANGE. On ne touche NI a
        -- l espacement (v_esp, propre a la plateforme), NI aux plafonds/quotas (LEAST plus bas).
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);$g2$);
  EXECUTE v_new;
END;
$patch$;
