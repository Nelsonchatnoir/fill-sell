-- ═══════════════════════════════════════════════════════════════════════════
-- Les premiers relevés ne se replanifient plus à CHAQUE sonde — 04/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Incident du 04/10 (CPU 99 %) : `UPDATE profiles SET extension_sessions` —
-- l'écriture de la sonde de l'extension, toutes les quelques minutes par poste
-- — coûtait 313 ms en moyenne. Le déclencheur profiles_premiers_releves_trg
-- appelait planifier_premiers_releves (plateformes_verite, purge de file,
-- quatre plateformes de requêtes) à CHAQUE écriture, puisque l'horodatage de
-- la sonde change à chaque fois.
-- Ce qu'il doit voir, et seulement ça :
--   · la première visite de l'extension (extension_last_seen_at était vide) ;
--   · un changement des Réglages (platform_settings) ;
--   · un changement d'ÉTAT d'une plateforme dans la sonde (connectée ou non) ;
--   · et, pour la retentative bornée (« 3 essais, 6 h d'écart, seulement si la
--     plateforme a été re-sondée »), la première sonde de chaque heure — la
--     règle des 6 h reste tenue par planifier_premiers_releves elle-même.
-- Partie de la définition EN PROD (pg_get_functiondef, 04/10 18:55) ; seul
-- l'aiguillage d'entrée est ajouté. Le déclencheur lui-même ne change pas.
-- Inverse : la définition d'origine, en fin de fichier (commentée).
CREATE OR REPLACE FUNCTION public.profiles_premiers_releves_trg_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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

-- INVERSE (définition en prod avant ce fichier) :
-- CREATE OR REPLACE FUNCTION public.profiles_premiers_releves_trg_fn()
--  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   BEGIN
--     PERFORM planifier_premiers_releves(NEW.id);
--   EXCEPTION WHEN OTHERS THEN
--     RAISE WARNING 'planifier_premiers_releves(%) : %', NEW.id, SQLERRM;
--   END;
--   RETURN NEW;
-- END;
-- $function$;
