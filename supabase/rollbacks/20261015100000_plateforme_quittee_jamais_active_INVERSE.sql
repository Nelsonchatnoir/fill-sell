-- INVERSE de 20261015100000_plateforme_quittee_jamais_active.sql : définitions
-- EN PROD le 15/10 ~10:00 (avant la migration), puis restauration des réglages
-- sauvegardés. À lancer par npx supabase db query --linked -f <ce fichier>.
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
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_pause_generale(p_reprendre boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

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
$function$;

UPDATE public.profiles p
   SET platform_settings = jsonb_set(p.platform_settings, ARRAY[b.platform, 'republish_planifiee'], b.avant, true)
  FROM public._backup_1510_plateforme_sortie b
 WHERE b.user_id = p.id AND b.avant IS NOT NULL;

DROP FUNCTION IF EXISTS public.republish_planifiee_pf_sortie(text);
