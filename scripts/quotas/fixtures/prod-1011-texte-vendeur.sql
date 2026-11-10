-- Définitions de PROD lues le 10/11/2026 (pg_get_functiondef) avant la migration 20261110170000 — base des preuves et de l'inverse.
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH borne AS (
    SELECT GREATEST(
      p_cycle,
      to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_annonces_depuis'), 0))
    ) AS t
  )
  SELECT (
    -- Annonces générées (portes A et B) — dédup régénération 24 h inchangée.
    (SELECT count(*) FROM usage_logs u, borne
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.created_at >= borne.t
        AND NOT (
          u.metadata ? 'inventaire_id' AND EXISTS (
            SELECT 1 FROM usage_logs prev
            WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
              AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
              AND prev.created_at <  u.created_at
              AND prev.created_at >= u.created_at - interval '24 hours'
          )
        ))
    -- + scans NON unifiés depuis la borne : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$function$

;
CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid, p_inventaire_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_cycle     timestamptz;
  v_consommes integer;
  v_regen     boolean := false;
  v_garde     jsonb;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) : l'utilisateur et la fiche doivent être
  -- ceux de auth.uid(). service_role (fonctions edge) et les appels sans jeton
  -- (cron, SQL d'administration) : inchangés.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'utilisateur non autorisé' USING ERRCODE = '42501';
    END IF;
    IF p_inventaire_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'fiche non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- QUOTA D'ANNONCES (bascule 02/09) — AVANT tout le reste. Régénération du
  -- même article sous 24 h : passe sans compter.
  IF p_inventaire_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usage_logs u
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.metadata->>'inventaire_id' = p_inventaire_id::text
        AND u.created_at >= now() - interval '24 hours'
    ) INTO v_regen;
  END IF;

  IF NOT v_regen THEN
    -- (11/10) Le réglage du compte prime sur le quota du palier.
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant)
    v_quota := jauge_annonces_plafond(p_user_id, v_tier);
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      v_cycle := debut_cycle_quotas(p_user_id);
      v_consommes := quota_annonces_consommees(p_user_id, v_cycle);
      IF v_consommes >= v_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                  'plafond', v_quota, 'consommes', v_consommes);
      END IF;
    END IF;
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : le garde-fou du jour, sous le code que generate-listing relaie déjà avec son message.
    v_garde := garde_fou_jour(p_user_id, 'annonces', 1);
    IF v_garde IS NOT NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'pro_daily_cap_reached', 'garde_fou', true, 'jauge', 'annonces',
                                'message', v_garde ->> 'message', 'cap', (v_garde ->> 'garde')::integer,
                                'used', (v_garde ->> 'faites')::integer, 'reprise_le', v_garde -> 'reprise_le');
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'regen', v_regen);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
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
$function$

;
