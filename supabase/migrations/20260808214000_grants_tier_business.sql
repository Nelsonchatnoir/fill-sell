-- Le tier 'business' devient valide dans les DEUX fonctions de grant.
-- Corps repris de la PROD (pg_get_functiondef du 2026-08-08 soir), patch
-- MINIMAL : la liste fermée de tiers gagne 'business'. Tout le reste est
-- générique : clé coin_config 'monthly_grant_' || tier (monthly_grant_business
-- = 3000 posée par 20260808213500), grant PLEIN au changement de palier
-- (comportement du fix 20260808080026, hérité tel quel), refs idempotentes
-- datées — celle de grant_upgrade inclut le tier, l'index unique partiel
-- coin_ledger_ref_unique (relu en prod) n'entre pas en collision.
-- Idempotente (create or replace).

CREATE OR REPLACE FUNCTION public.grant_monthly_coins(p_user_id uuid, p_tier text, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount      integer;
  v_override    integer;
  v_wallet      coin_wallets%ROWTYPE;
  v_anchor      int;
  v_created     timestamptz;
  v_has_billing boolean;
  v_is_comped   boolean;
  v_due         timestamptz;
  v_next        timestamptz;
  v_cap         integer;
  v_new_inc     integer;
  v_delta       integer;
  v_ref         text;
begin
  if p_tier not in ('free','premium','pro','business') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  select value into v_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  select monthly_grant_override, created_at,
         (stripe_customer_id is not null
          or apple_original_transaction_id is not null
          or google_purchase_token is not null),
         coalesce(is_comped, false)
    into v_override, v_created, v_has_billing, v_is_comped
  from profiles where id = p_user_id;

  if v_override is not null and v_override > 0 then
    v_amount := v_override;
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  v_anchor := coalesce(v_wallet.grant_anchor_day,
                       extract(day from coalesce(v_created, now()))::int);
  v_due := v_wallet.next_grant_at;

  if v_due is not null then
    if p_source = 'payment' then
      if v_due > now() + interval '2 days' then
        return jsonb_build_object('granted', false, 'reason', 'already_granted',
                                  'next_grant_at', v_due);
      end if;
    elsif v_due > now() then
      return jsonb_build_object('granted', false, 'reason', 'already_granted',
                                'next_grant_at', v_due);
    end if;
  end if;

  -- Pas de paiement, pas de grant — SAUF compte offert (is_comped) : personne
  -- ne paie pour lui, et il garde souvent un identifiant de paiement d'une
  -- periode anterieure. coins_awaiting_payment() porte la MEME condition.
  if p_source <> 'payment' and v_has_billing and not v_is_comped and p_tier <> 'free'
     and v_due is not null and v_due < now() - interval '3 days' then
    return jsonb_build_object('granted', false, 'reason', 'awaiting_payment_event',
                              'next_grant_at', v_due, 'tier', p_tier);
  end if;

  v_cap     := v_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_amount, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  if p_period_end is not null and p_period_end > now() then
    v_next := p_period_end;
  else
    v_next := grant_next_due(now(), v_anchor);
  end if;

  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = v_next,
    grant_anchor_day = v_anchor,
    updated_at       = now()
  where user_id = p_user_id;

  v_ref := 'grant_monthly:' || p_user_id || ':' || to_char(coalesce(v_due, now()), 'YYYY-MM-DD');
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_monthly', v_ref,
      jsonb_build_object('tier', p_tier, 'override', v_override,
                         'source', p_source,
                         'reporte', v_wallet.included_balance,
                         'montant_theorique', v_amount,
                         'plafonne', (v_delta < v_amount),
                         'next_grant_at', v_next)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  return jsonb_build_object('granted', true, 'amount', v_delta,
                            'montant_theorique', v_amount,
                            'plafonne', (v_delta < v_amount),
                            'reporte', v_wallet.included_balance,
                            'included_after', v_new_inc,
                            'next_grant_at', v_next,
                            'source', p_source);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upgrade_monthly_grant(p_user_id uuid, p_tier text, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_new_amount integer;
  v_override   integer;
  v_delta      integer;
  v_cap        integer;
  v_new_inc    integer;
  v_ref        text;
begin
  if p_tier not in ('free','premium','pro','business') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  -- Échéance atteinte (ou compte jamais crédité) : c'est un grant plein.
  if v_wallet.next_grant_at is null or v_wallet.next_grant_at <= now()
     or (p_source = 'payment' and v_wallet.next_grant_at <= now() + interval '2 days') then
    return grant_monthly_coins(p_user_id, p_tier, p_period_end, p_source);
  end if;

  -- Montant fixé à la main : pas de top-up de changement de tier.
  select monthly_grant_override into v_override from profiles where id = p_user_id;
  if v_override is not null and v_override > 0 then
    return jsonb_build_object('granted', false, 'reason', 'override_fixed_amount',
                              'amount', v_override, 'tier', p_tier);
  end if;

  -- Tier du cycle courant = celui du dernier grant enregistré (le cycle étant
  -- désormais propre à l'utilisateur, il n'y a plus de fenêtre calendaire à
  -- interroger : le dernier grant EST le début du cycle en cours).
  select l.metadata->>'tier' into v_old_tier
  from coin_ledger l
  where l.user_id = p_user_id
    and l.kind in ('grant_monthly','grant_upgrade')
  order by l.created_at desc, l.id desc
  limit 1;
  v_old_tier := coalesce(v_old_tier, 'free');

  select value into v_new_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_new_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  -- Même palier : rien à créditer (RESTARTED sans paiement, rejeu, etc.).
  -- Une date de store fournie fait quand même autorité sur l'échéance.
  if v_old_tier is not distinct from p_tier then
    if p_period_end is not null and p_period_end > now() then
      update coin_wallets set next_grant_at = p_period_end, updated_at = now()
      where user_id = p_user_id;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  -- Changement de palier payant : montant PLEIN du nouveau palier (le
  -- différentiel historique est supprimé — cf. en-tête de la migration).
  v_delta := v_new_amount;

  -- Le plafond du report s'apprécie sur le grant du NOUVEAU tier.
  v_cap     := v_new_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_delta, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  if v_delta <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'cap_reached',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = case when p_period_end is not null and p_period_end > now()
                            then p_period_end else next_grant_at end,
    updated_at       = now()
  where user_id = p_user_id;

  v_ref := 'grant_upgrade:' || p_user_id || ':'
           || to_char(coalesce(v_wallet.next_grant_at, now()), 'YYYY-MM-DD') || ':' || p_tier;
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_upgrade', v_ref,
      jsonb_build_object('tier', p_tier, 'from_tier', v_old_tier, 'source', p_source)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  return jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier,
                            'included_after', v_new_inc);
end;
$function$
;
