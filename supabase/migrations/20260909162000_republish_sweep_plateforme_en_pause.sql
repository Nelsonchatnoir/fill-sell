-- ═══════════════════════════════════════════════════════════════════════════
-- republish_auto_sweep_serveur : Vinted EN PAUSE (platform_health) = le sweep
-- ne crée AUCUNE republication — 2026-09-09, GO Nico (maintenance générique).
-- ═══════════════════════════════════════════════════════════════════════════
-- Le sweep serveur (20260908090000) choisit les prochains articles à republier
-- et appelle spend_coins_and_republish. Sans ce bloc, une pause Vinted posée
-- dans platform_health aurait produit, toutes les N minutes, des appels
-- refusés par le trigger republish_maintenance_guard (REPUBLISH_MAINTENANCE)
-- — bruit inutile dans les logs, et un rapport de sweep trompeur.
-- Le sweep rend maintenant la MÊME forme que l'interrupteur
-- coin_config.republish_auto_serveur_actif : {actif:false, comptes:0, crees:0,
-- motif:'platform_health : vinted en pause'}.
--
-- FAIL-SAFE (non négociable) : platform_health illisible → le bloc se tait et
-- le sweep continue exactement comme avant. Jamais une pause par accident.
--
-- ⚠️ Appliquée en prod le 09/09/2026 par ce même auto-patch (DO) — la fonction
-- est longue (~300 lignes) et vit en prod avec des retouches postérieures au
-- fichier 20260908090000 : on patche la DÉFINITION EN BASE plutôt que de
-- recopier un corps qui pourrait diverger. Idempotente (marqueur
-- « PLATEFORME EN PAUSE » ; ancre = la lecture de l'interrupteur). La ligne
-- supabase_migrations.schema_migrations 20260909162000 a été insérée à la main.
DO $do$
DECLARE d text; bloc text; ancre text := 'SELECT value INTO v_actif FROM coin_config WHERE key = ''republish_auto_serveur_actif'';';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = 'republish_auto_sweep_serveur';
  IF d IS NULL THEN RAISE EXCEPTION 'republish_auto_sweep_serveur introuvable'; END IF;
  IF d ILIKE '%PLATEFORME EN PAUSE%' THEN RAISE NOTICE 'republish_auto_sweep_serveur : deja patchee'; RETURN; END IF;
  IF position(ancre in d) = 0 THEN RAISE EXCEPTION 'republish_auto_sweep_serveur : ancre introuvable'; END IF;
  bloc :=
    '  -- ── PLATEFORME EN PAUSE (2026-09-09, maintenance générique) ─────────────' || E'\n' ||
    '  -- Vinted en pause (platform_health) : le sweep ne crée AUCUNE republication,' || E'\n' ||
    '  -- même forme de retour que l''interrupteur. FAIL-SAFE : table illisible →' || E'\n' ||
    '  -- on continue comme avant (jamais une pause par accident).' || E'\n' ||
    '  BEGIN' || E'\n' ||
    '    IF EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = ''vinted'' AND h.paused = true) THEN' || E'\n' ||
    '      RETURN jsonb_build_object(''actif'', false, ''comptes'', 0, ''crees'', 0, ''motif'', ''platform_health : vinted en pause'');' || E'\n' ||
    '    END IF;' || E'\n' ||
    '  EXCEPTION WHEN OTHERS THEN' || E'\n' ||
    '    NULL;' || E'\n' ||
    '  END;' || E'\n';
  d := replace(d, ancre, bloc || ancre);
  EXECUTE d;
END $do$;

-- Contrôle : SELECT pg_get_functiondef(p.oid) ILIKE '%vinted en pause%'
--            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname='public' AND p.proname='republish_auto_sweep_serveur';
