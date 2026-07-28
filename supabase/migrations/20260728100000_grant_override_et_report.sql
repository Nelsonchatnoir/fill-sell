-- Migration DÉJÀ APPLIQUÉE en prod à la main le 2026-07-28 au matin (Nico) —
-- commitée a posteriori le même jour, définitions RÉCUPÉRÉES DEPUIS LA PROD
-- (pg_get_functiondef) et non réécrites de mémoire. Trois changements :
--   1. profiles.monthly_grant_override : montant de grant mensuel fixé à la
--      main pour un compte (prime sur la grille coin_config du tier).
--   2. grant_monthly_coins : REPORT — le grant s'ADDITIONNE au reliquat
--      included_balance au lieu de l'écraser (metadata.reporte trace l'ancien
--      solde), et applique monthly_grant_override s'il est posé.
--   3. upgrade_monthly_grant : si un override existe, pas de top-up de
--      changement de tier (montant fixe) → reason 'override_fixed_amount'.

alter table public.profiles
  add column if not exists monthly_grant_override integer;

CREATE OR REPLACE FUNCTION public.grant_monthly_coins(p_user_id uuid, p_tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount   integer;
  v_override integer;
  v_month    date := date_trunc('month', now())::date;
  v_wallet   coin_wallets%ROWTYPE;
begin
  if p_tier not in ('free','premium','pro') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  select value into v_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  select monthly_grant_override into v_override from profiles where id = p_user_id;
  if v_override is not null and v_override > 0 then
    v_amount := v_override;
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  if v_wallet.included_granted_month = v_month then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'month', v_month);
  end if;

  -- REPORT : on ajoute au reliquat au lieu de le remplacer.
  update coin_wallets set
    included_balance       = included_balance + v_amount,
    included_granted_month = v_month,
    updated_at             = now()
  where user_id = p_user_id;

  insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
  values (
    p_user_id, v_amount, v_wallet.included_balance + v_amount, v_wallet.purchased_balance,
    'grant_monthly',
    'grant_monthly:' || p_user_id || ':' || to_char(v_month, 'YYYY-MM'),
    jsonb_build_object('tier', p_tier, 'override', v_override,
                       'reporte', v_wallet.included_balance)
  );

  return jsonb_build_object('granted', true, 'amount', v_amount, 'month', v_month,
                            'reporte', v_wallet.included_balance,
                            'included_after', v_wallet.included_balance + v_amount);
end;
$function$;

CREATE OR REPLACE FUNCTION public.upgrade_monthly_grant(p_user_id uuid, p_tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month      date := date_trunc('month', now())::date;
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_old_amount integer;
  v_new_amount integer;
  v_override   integer;
  v_delta      integer;
  v_ref        text;
begin
  if p_tier not in ('free','premium','pro') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  -- Pas encore credite ce mois-ci : grant plein classique (qui gere l'override).
  if v_wallet.included_granted_month is distinct from v_month then
    return grant_monthly_coins(p_user_id, p_tier);
  end if;

  -- Montant fixe par override : pas de top-up de changement de tier.
  select monthly_grant_override into v_override from profiles where id = p_user_id;
  if v_override is not null and v_override > 0 then
    return jsonb_build_object('granted', false, 'reason', 'override_fixed_amount',
                              'amount', v_override, 'tier', p_tier);
  end if;

  select l.metadata->>'tier' into v_old_tier
  from coin_ledger l
  where l.user_id = p_user_id
    and l.kind in ('grant_monthly','grant_upgrade')
    and l.created_at >= v_month
  order by l.created_at desc, l.id desc
  limit 1;
  v_old_tier := coalesce(v_old_tier, 'free');

  select value into v_new_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_new_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;
  select value into v_old_amount from coin_config where key = 'monthly_grant_' || v_old_tier;
  v_old_amount := coalesce(v_old_amount, 0);

  v_delta := v_new_amount - v_old_amount;
  if v_delta <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  update coin_wallets set
    included_balance = included_balance + v_delta,
    updated_at       = now()
  where user_id = p_user_id;

  v_ref := 'grant_upgrade:' || p_user_id || ':' || to_char(v_month, 'YYYY-MM') || ':' || p_tier;
  insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
  values (
    p_user_id, v_delta,
    v_wallet.included_balance + v_delta, v_wallet.purchased_balance,
    'grant_upgrade', v_ref,
    jsonb_build_object('tier', p_tier, 'from_tier', v_old_tier)
  );

  return jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier, 'month', v_month);
end;
$function$;
