-- La limite Free de 20 articles ne s'applique pas au dressing Vinted synchronisé
-- (2026-08-03, décision Nico).
--
-- Constat qui a motivé la migration : `check_inventory_limit` refusait le 21e
-- article non vendu d'un compte Free. La sync du dressing vise précisément les
-- nouveaux installeurs — majoritairement Free — et un dressing de 32 ou 200
-- articles était donc rejeté par la base dès le 21e. Vérifié en prod le 03/08 :
-- INSERT réel → `ERROR: LIMIT_REACHED`.
--
-- Règle retenue : ce qui est DÉJÀ en vente sur Vinted et que FillSell ne fait
-- que refléter ne consomme pas le quota de « gestion de stock ». Le payant
-- devient le cross-post vers les 3 autres plateformes, pas le miroir du
-- dressing. Un article saisi à la main reste soumis à la limite, y compris
-- quand le compte a par ailleurs un dressing synchronisé.
--
-- Le reste de la fonction est inchangé, y compris l'expression premium
-- canonique (is_premium OR is_pro OR is_comped, cf. CLAUDE.md).

CREATE OR REPLACE FUNCTION public.check_inventory_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_profile  record;
  v_count    int;
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

  -- Les articles importés du dressing sont exclus du COMPTAGE aussi : sans
  -- cela, un dressing de 30 articles saturerait le quota et empêcherait la
  -- personne d'ajouter le moindre article à la main.
  SELECT COUNT(*) INTO v_count
  FROM inventaire
  WHERE user_id = NEW.user_id
    AND statut != 'vendu'
    AND (origine IS DISTINCT FROM 'vinted_sync');

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$function$;
