-- Plafond quotidien de générations IA pour les Pro (2026-08-08).
--
-- POURQUOI : la gratuité Pro (migration 20260808113843) a retiré le débit
-- d'1 Pépite qui remplaçait, depuis le 04/08, le plafond 15/60 par 24 h.
-- Sans lui, un Pro avait un appel LLM facturé SANS AUCUNE limite — une
-- boucle accidentelle (ou un abus) pouvait coûter des centaines d'euros.
--
-- SOURCE DE COMPTAGE — trace dédiée usage_logs feature='generate_pro_free',
-- écrite PAR CETTE FONCTION, avant de retourner allowed=true :
--   · coin_ledger est vide pour les Pro (aucune ligne depuis la gratuité) ;
--   · usage_logs feature='generate_listing' est écrit par generate-listing en
--     BEST-EFFORT, après les appels LLM, et pas sur tous les chemins d'échec
--     — un compteur assis dessus pourrait rester à zéro pendant que le LLM
--     tourne. Ici, autorisation et trace vivent dans la même fonction : pas
--     de génération autorisée sans être comptée.
--   · L'index usage_logs_user_feature_created (user_id, feature, created_at)
--     existe déjà : le count est indexé, rien à ajouter.
--   · Course résiduelle assumée : deux appels simultanés à cap-1 peuvent
--     passer tous les deux (plafond advisory, pas de la facturation).
--
-- PLAFOND : coin_config.pro_generate_daily_cap — ajustable par simple
-- UPDATE, sans redéploiement. Défaut 200/24 h glissantes : un très gros
-- vendeur reste sous ~100 annonces/jour (invisible), et une boucle folle est
-- bornée à ~200 appels Haiku ≈ 1-2 €/jour au lieu d'illimité.
--
-- AU DÉPASSEMENT : allowed=false, reason='pro_daily_cap_reached', message
-- localisé (lang du profil) expliquant la fenêtre 24 h glissantes.
-- generate-listing le transpose en { error:'generation_limit', message } —
-- canal QUE LE FRONT AFFICHE DÉJÀ tel quel (bandeau du step 2, reliquat du
-- plafond du 04/08) : zéro changement client.

insert into coin_config (key, value)
values ('pro_generate_daily_cap', 200)
on conflict (key) do nothing;

create or replace function public.spend_coins_for_generate(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_price    integer;
  v_is_pro   boolean := false;
  v_lang     text;
  v_cap      integer;
  v_used     integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- ── Génération OFFERTE en Pro (2026-08-08) + plafond quotidien ────────────
  SELECT COALESCE(is_pro, false), lang INTO v_is_pro, v_lang
  FROM profiles WHERE id = p_user_id;
  IF v_is_pro THEN
    SELECT value INTO v_cap FROM coin_config WHERE key = 'pro_generate_daily_cap';
    v_cap := COALESCE(v_cap, 200);
    SELECT count(*) INTO v_used FROM usage_logs
    WHERE user_id = p_user_id
      AND feature = 'generate_pro_free'
      AND created_at > now() - interval '24 hours';
    IF v_used >= v_cap THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'pro_daily_cap_reached',
        'cap', v_cap, 'used', v_used,
        'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
          THEN format('Daily limit reached: %s AI generations per rolling 24 hours on Pro. The counter frees up as your oldest generations age past 24 hours — try again later. Nothing was charged.', v_cap)
          ELSE format('Limite quotidienne atteinte : %s générations IA par 24 h glissantes en Pro. Le compteur se libère à mesure que tes générations les plus anciennes dépassent 24 h — réessaie plus tard. Rien n''a été débité.', v_cap)
        END
      );
    END IF;
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (p_user_id, 'generate_pro_free', jsonb_build_object('cap', v_cap, 'used_before', v_used));
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'pro_free_generation', true);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = p_user_id;
    PERFORM upgrade_monthly_grant(p_user_id, COALESCE(v_tier, 'free'), null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_generate',
    NULL
  );

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$function$;
