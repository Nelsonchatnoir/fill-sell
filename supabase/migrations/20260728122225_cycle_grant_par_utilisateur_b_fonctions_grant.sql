-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260728122225 « cycle_grant_par_utilisateur_b_fonctions_grant » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
drop function if exists public.grant_monthly_coins(uuid, text);

create function public.grant_monthly_coins(
  p_user_id    uuid,
  p_tier       text,
  p_period_end timestamptz default null,
  p_source     text        default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount      integer;
  v_override    integer;
  v_wallet      coin_wallets%ROWTYPE;
  v_anchor      int;
  v_created     timestamptz;
  v_has_billing boolean;
  v_due         timestamptz;
  v_next        timestamptz;
  v_cap         integer;
  v_new_inc     integer;
  v_delta       integer;
  v_ref         text;
begin
  if p_tier not in ('free','premium','pro') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  select value into v_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  select monthly_grant_override, created_at,
         (stripe_customer_id is not null
          or apple_original_transaction_id is not null
          or google_purchase_token is not null)
    into v_override, v_created, v_has_billing
  from profiles where id = p_user_id;

  if v_override is not null and v_override > 0 then
    v_amount := v_override;
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  v_anchor := coalesce(v_wallet.grant_anchor_day,
                       extract(day from coalesce(v_created, now()))::int);
  v_due := v_wallet.next_grant_at;

  -- Idempotence : l'échéance fait foi, plus le mois calendaire. Une tolérance
  -- de 2 jours n'existe que pour les événements de paiement, dont l'horodatage
  -- peut légèrement précéder la fin de période côté store.
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

  -- Pas de paiement, pas de grant : sur un compte à canal de paiement actif, le
  -- renouvellement doit venir du store. Le filet ne rattrape qu'un retard court
  -- (webhook perdu) ; au-delà, l'absence d'événement SIGNIFIE l'absence de
  -- paiement (past_due, abonnement mort) et on cesse de créditer. Le tier est
  -- exigé non-free pour ne pas pénaliser un ex-abonné dont le token store
  -- subsiste après résiliation (cf. bug « premium fantôme » du 25/07).
  if p_source <> 'payment' and v_has_billing and p_tier <> 'free'
     and v_due is not null and v_due < now() - interval '3 days' then
    return jsonb_build_object('granted', false, 'reason', 'awaiting_payment_event',
                              'next_grant_at', v_due, 'tier', p_tier);
  end if;

  -- Report plafonné à 2× le grant du tier. GREATEST : un solde déjà au-dessus
  -- du plafond n'est jamais amputé — il cesse simplement de croître.
  v_cap     := v_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_amount, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  -- Prochaine échéance : la date du store si on en a une, sinon l'ancre.
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

  -- Ref d'idempotence : l'échéance consommée (unique par cycle et par user).
  -- Format YYYY-MM-DD, distinct de l'ancien YYYY-MM — aucune collision avec
  -- l'historique. L'index unique partiel coin_ledger_ref_unique est le second
  -- filet si deux processus concourent malgré le FOR UPDATE.
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
$$;

revoke all on function public.grant_monthly_coins(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.grant_monthly_coins(uuid, text, timestamptz, text) to service_role;

drop function if exists public.upgrade_monthly_grant(uuid, text);

create function public.upgrade_monthly_grant(
  p_user_id    uuid,
  p_tier       text,
  p_period_end timestamptz default null,
  p_source     text        default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_old_amount integer;
  v_new_amount integer;
  v_override   integer;
  v_delta      integer;
  v_cap        integer;
  v_new_inc    integer;
  v_ref        text;
begin
  if p_tier not in ('free','premium','pro') then
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
  select value into v_old_amount from coin_config where key = 'monthly_grant_' || v_old_tier;
  v_old_amount := coalesce(v_old_amount, 0);

  v_delta := v_new_amount - v_old_amount;

  -- Même sans top-up à créditer, une date de store fait autorité : on réaligne
  -- l'échéance sur la nouvelle période de facturation.
  if v_delta <= 0 then
    if p_period_end is not null and p_period_end > now() then
      update coin_wallets set next_grant_at = p_period_end, updated_at = now()
      where user_id = p_user_id;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

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
$$;

revoke all on function public.upgrade_monthly_grant(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.upgrade_monthly_grant(uuid, text, timestamptz, text) to service_role;

create or replace function public.grant_monthly_coins_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted  int := 0;
  v_skipped  int := 0;
  v_awaiting int := 0;
  r   record;
  res jsonb;
begin
  for r in
    select p.id,
           case
             when p.is_pro = true then 'pro'
             when p.is_premium = true or p.is_comped = true then 'premium'
             else 'free'
           end as tier
    from profiles p
    -- LEFT JOIN impératif : un profil sans ligne coin_wallets doit être balayé,
    -- sinon il ne serait jamais crédité. next_grant_at vaut alors NULL.
    left join coin_wallets w on w.user_id = p.id
    where w.next_grant_at is null or w.next_grant_at <= now()
  loop
    res := upgrade_monthly_grant(r.id, r.tier, null, 'sweep');
    if coalesce((res->>'granted')::boolean, false) then
      v_granted := v_granted + 1;
    elsif res->>'reason' = 'awaiting_payment_event' then
      v_awaiting := v_awaiting + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('granted', v_granted, 'skipped', v_skipped,
                            'awaiting_payment', v_awaiting, 'ran_at', now());
end;
$$;

revoke all on function public.grant_monthly_coins_sweep() from public, anon, authenticated;
grant execute on function public.grant_monthly_coins_sweep() to service_role;
