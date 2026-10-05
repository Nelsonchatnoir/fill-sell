-- ═══════════════════════════════════════════════════════════════════════════
-- Sessions de l'extension refusées depuis le 04/10 19:01 — 05/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- La migration 20261004190100 (premiers relevés sur changement ou une fois
-- l'heure) appelle _ts_ou_null HORS du bloc EXCEPTION, dans un déclencheur
-- exécuté avec les droits de l'appelant. Or EXECUTE sur _ts_ou_null a été
-- retiré à authenticated le 27/09 (20260927113000). Effet : toute écriture de
-- profiles.extension_sessions par l'extension (PATCH profiles, JWT de la
-- personne) tombait en 403 « permission denied for function _ts_ou_null » —
-- 73 à 145 erreurs par heure, 36 extensions, 0 session écrite, sondes de
-- connexion figées (relances après reconnexion, premiers relevés : mhd.zane).
-- Correctif : le déclencheur s'exécute en SECURITY DEFINER (search_path figé),
-- comme les autres déclencheurs de profiles ; corps inchangé.
-- Inverse : ALTER FUNCTION public.profiles_premiers_releves_trg_fn() SECURITY INVOKER;
CREATE OR REPLACE FUNCTION public.profiles_premiers_releves_trg_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_change boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.extension_last_seen_at IS NOT NULL
     AND OLD.platform_settings IS NOT DISTINCT FROM NEW.platform_settings THEN
    SELECT EXISTS (
      SELECT 1 FROM unnest(ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'opla', 'ebay_hub']) k
       WHERE (OLD.extension_sessions ->> k) IS DISTINCT FROM (NEW.extension_sessions ->> k))
      OR date_trunc('hour', _ts_ou_null(NEW.extension_sessions ->> 'checked_at'))
         IS DISTINCT FROM date_trunc('hour', _ts_ou_null(OLD.extension_sessions ->> 'checked_at'))
      INTO v_change;
    IF NOT v_change THEN RETURN NEW; END IF;
  END IF;
  BEGIN
    PERFORM planifier_premiers_releves(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'planifier_premiers_releves(%) : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.profiles_premiers_releves_trg_fn() FROM PUBLIC, anon, authenticated;
