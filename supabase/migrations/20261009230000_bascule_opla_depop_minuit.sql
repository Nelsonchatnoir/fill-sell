-- ═══════════════════════════════════════════════════════════════════════════
-- BASCULE OPLA → DEPOP, TOUTE SEULE À MINUIT (09/10/2026 soir, ordre de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Un seul interrupteur, celui qui existe : coin_config `opla_sortie_le`
-- (1791583200 = 10/10/2026 00:00 Paris ; 0 = sortie désactivée ; absente = la
-- même date par défaut — _shared/opla-sortie.js). Aucun geste à minuit.
--
-- CE QU'ELLE FAIT
--  1. depop_autorise(p_user) devient vraie pour TOUT compte à l'instant de la
--     sortie d'Opla (avant : depop_ouvert = 1, resté à 0, ou bêta du compte —
--     inchangé). La garde en base (depop_non_ouvert) s'ouvre avec elle. L'app ne
--     montre Depop qu'à une extension ≥ 0.6.106 ; get-pending-jobs ne sert un job
--     Depop qu'au poste qui déclare `depop_acces` (inchangé).
--  2. Republication automatique Depop OUVERTE, aux mêmes règles que Vinted,
--     Leboncoin et Beebs : 'depop' entre dans republish_planifiee_plateformes(),
--     coin_config republish_planifiee_pf_depop = 1 et
--     republish_espacement_min_depop_sec = 900 (comme Leboncoin et Beebs),
--     journalisés. Même palier (Pro / Business), mêmes plafonds, même balayage.
--  3. Garde : un réglage Depop n'existe (republish_planifiee_reglage) et ne
--     s'écrit (republish_planifiee_regler) que pour un compte où Depop est
--     ouverte — le balayage ne peut donc jamais tenter un créneau Depop que la
--     garde refuserait (l'exception annulerait le passage de tous les comptes).
--
-- CE QU'ELLE NE FAIT PAS (exprès)
--  · rien sur Opla : la sortie (clôture des publications/republications en
--    attente, republish_planifiee_pf_opla à 0) est déjà faite par
--    get-pending-jobs / handler-watch à la bascule ; les RETRAITS Opla ne sont
--    jamais concernés (double vente) ; aucune annonce Opla n'est retirée ;
--  · aucun mail, aucune notification ;
--  · depop_ouvert n'est pas touché (reste 0).
--
-- Chaque fonction est la définition LUE EN PROD (pg_get_functiondef, md5
-- vérifié ci-dessous) plus une insertion pure : pour une ligne qui n'est pas
-- Depop, chacune rend exactement ce qu'elle rendait. Idempotente.
-- Application (règle du 01/10) :
--   npx supabase db query --linked -f supabase/migrations/20261009230000_bascule_opla_depop_minuit.sql
--   npx supabase migration repair --linked --status applied 20261009230000
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ── 0. Les définitions de prod n'ont pas bougé depuis leur lecture (09/10 ~19:00 Paris) ──
DO $garde$
DECLARE
  v_attendu jsonb := '[["depop_autorise(uuid)","7b781606596c560387a729448f85fbea"],["republish_planifiee_plateformes()","7677061397b0b0d28808e338f8a5224d"],["republish_planifiee_reglage(uuid,text)","29f34d7551c43e9b96a356c10fb674ee"],["republish_planifiee_regler(jsonb)","36ccfa7eb9c541997a55711918b8771d"]]'::jsonb;
  v_e jsonb;
BEGIN
  FOR v_e IN SELECT value FROM jsonb_array_elements(v_attendu) LOOP
    IF md5(pg_get_functiondef((v_e ->> 0)::regprocedure)) IS DISTINCT FROM (v_e ->> 1) THEN
      RAISE EXCEPTION 'bascule_opla_depop : % a changé en prod depuis sa lecture — migration arrêtée, rien n''est écrit', v_e ->> 0;
    END IF;
  END LOOP;
END
$garde$;

-- ── 1. depop_autorise : ouverte à tous à l'instant de la sortie d'Opla ──────
CREATE OR REPLACE FUNCTION public.depop_autorise(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- Un client ne s'informe que de SON compte.
    WHEN auth.uid() IS NOT NULL AND p_user IS DISTINCT FROM auth.uid() THEN false
    ELSE COALESCE((SELECT value FROM public.coin_config WHERE key = 'depop_ouvert'), 0) = 1
      OR COALESCE((SELECT p.beta_flags -> 'depop' = 'true'::jsonb FROM public.profiles p WHERE p.id = p_user), false)
      -- (09/10 soir, Nico) BASCULE OPLA → DEPOP : à l'instant de la sortie d'Opla
      -- (coin_config opla_sortie_le, secondes epoch ; 0 = désactivée ; absente =
      -- le 10/10/2026 00:00 Paris, même règle que _shared/opla-sortie.js), Depop
      -- est ouverte à TOUS les comptes. L'app ne la montre qu'à une extension
      -- ≥ 0.6.106 ; le serveur ne sert un job Depop qu'au poste `depop_acces`.
      OR COALESCE((SELECT CASE WHEN c.value = 0 THEN false ELSE now() >= to_timestamp(c.value) END
                     FROM public.coin_config c WHERE c.key = 'opla_sortie_le'),
                  now() >= to_timestamp(1791583200))
  END;
$function$
;

-- ── 2. republication planifiée : Depop dans la liste ────────────────────────
CREATE OR REPLACE FUNCTION public.republish_planifiee_plateformes()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT ARRAY['vinted', 'leboncoin', 'beebs', 'opla', 'depop']::text[] $function$
;

-- ── 3. réglage / réglage écrit : Depop seulement là où elle est ouverte ─────
CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(p_user uuid, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_brut jsonb; v_palier text; v_plafond_palier integer;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_invalide text := NULL; v_actif boolean;
BEGIN
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN RETURN NULL; END IF;
  -- (09/10 soir) Depop : aucun réglage pour un compte où Depop n'est pas
  -- ouverte (depop_autorise) — le balayage ne crée donc jamais de créneau
  -- Depop refusé par la garde en base (depop_non_ouvert annulerait le passage).
  IF v_pf = 'depop' AND NOT public.depop_autorise(p_user) THEN RETURN NULL; END IF;

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
$function$
;

CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- (09/10 soir) Depop : réglable seulement là où elle est ouverte.
  IF v_pf = 'depop' AND NOT public.depop_autorise(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'depop_non_ouvert', 'platform', v_pf);
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
$function$
;

-- ── 4. les interrupteurs Depop de la republication planifiée (journalisés) ──
-- Mêmes règles que Leboncoin et Beebs : plateforme ouverte, espacement minimal
-- de 900 s entre deux republications automatiques d'un même compte. Une ligne
-- déjà présente n'est jamais réécrite.
WITH ins AS (
  INSERT INTO public.coin_config (key, value, updated_at)
  VALUES ('republish_planifiee_pf_depop', 1, now()),
         ('republish_espacement_min_depop_sec', 900, now())
  ON CONFLICT (key) DO NOTHING RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, NULL, value, 'migration 20261009230000' FROM ins;

COMMIT;
