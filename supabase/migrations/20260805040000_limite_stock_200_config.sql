-- ── Limite d'inventaire Free : 20 → 200, pilotée par coin_config (2026-08-05)
-- Décision Nico : on garde une limite au plan Free, mais qui ne gêne personne
-- (record prod : 183 articles manuels ; 2 comptes seulement atteignent 20).
--
-- Source unique : coin_config.free_stock_limit — le prochain changement est un
-- UPDATE de config, plus une migration. La fonction retombe sur 200 si la clé
-- manque (échec OUVERT : une config illisible ne doit pas bloquer un insert
-- d'inventaire). Les exemptions sont inchangées : statut 'vendu',
-- origine='vinted_sync' (hors insert ET hors comptage), et l'expression
-- premium canonique is_premium OR is_pro OR is_comped (cf. CLAUDE.md).
-- Idempotent : upsert + CREATE OR REPLACE.

INSERT INTO public.coin_config (key, value) VALUES ('free_stock_limit', 200)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.check_inventory_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_profile  record;
  v_count    int;
  v_limit    int;
BEGIN
  IF NEW.statut = 'vendu' THEN
    RETURN NEW;
  END IF;

  -- Miroir du dressing Vinted : hors quota, à l'insert comme au comptage.
  IF NEW.origine = 'vinted_sync' THEN
    RETURN NEW;
  END IF;

  SELECT is_premium, is_pro, is_comped
  INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  IF v_profile.is_pro IS TRUE THEN
    RETURN NEW;
  END IF;

  IF v_profile.is_premium IS TRUE OR v_profile.is_comped IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Limite lue en config (source unique) ; 200 en repli si la clé manque.
  SELECT value INTO v_limit FROM coin_config WHERE key = 'free_stock_limit';
  v_limit := COALESCE(v_limit, 200);

  SELECT COUNT(*) INTO v_count
  FROM inventaire
  WHERE user_id = NEW.user_id
    AND statut != 'vendu'
    AND (origine IS DISTINCT FROM 'vinted_sync');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$function$;
