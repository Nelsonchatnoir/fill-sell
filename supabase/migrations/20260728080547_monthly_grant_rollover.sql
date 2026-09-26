-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260728080547 « monthly_grant_rollover » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Le grant mensuel s'ADDITIONNE au solde inclus restant au lieu de l'ecraser.
-- Les pepites incluses non consommees sont donc reportees d'un mois sur l'autre.
create or replace function public.grant_monthly_coins(p_user_id uuid, p_tier text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
