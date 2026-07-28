-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS 300 / 800 + un compte offert ne passe plus par la garde de paiement
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision Nico, 2026-07-28.
--
-- 1) monthly_grant_premium 150 → 300, monthly_grant_pro 600 → 800 (free
--    inchangé à 30). Aucun prix, aucun price Stripe, aucun SKU de store ne
--    bouge. Motif : l'abonnement doit toujours revenir moins cher à la pépite
--    que le plus petit pack, sinon le pack cannibalise l'abonnement.
--    Premium était à 9,99/150 = 0,067 €/pépite contre 0,045 pour le pack 220 ;
--    à 300 il passe à 0,033 €/pépite et redevient l'option la moins chère.
--    Les deux fonctions de grant lisent coin_config à chaque appel : rien
--    d'autre à faire, ni ici ni sur les wallets existants.
--
-- 2) is_comped ne doit JAMAIS déclencher la garde « pas de paiement, pas de
--    grant ». Un compte à qui l'abonnement est offert conserve souvent un
--    stripe_customer_id ou un jeton Apple d'une période payée antérieure :
--    v_has_billing restait vrai, son tier valait 'premium', et il tombait donc
--    en awaiting_payment_event dès 3 jours après son échéance — on cessait de
--    créditer quelqu'un à qui on venait précisément d'offrir l'abonnement.
--    La garde et le monitoring sont corrigés ENSEMBLE et doivent le rester :
--    coins_awaiting_payment() ne vaut que s'il est le miroir exact de la garde.

update public.coin_config set value = 300 where key = 'monthly_grant_premium';
update public.coin_config set value = 800 where key = 'monthly_grant_pro';

create or replace function public.grant_monthly_coins(
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
  v_is_comped   boolean;
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

  -- Montant TOUJOURS relu dans coin_config : changer un grant est une simple
  -- mise à jour de configuration, jamais un redéploiement de fonction.
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

  -- Pas de paiement, pas de grant — SAUF compte offert. Un is_comped n'attend
  -- aucun événement de store (personne ne paie pour lui), et il garde souvent
  -- un identifiant de paiement d'une période antérieure : sans cette
  -- exception, on lui coupait ses Pépites 3 jours après son échéance.
  -- ⚠️ coins_awaiting_payment() porte la MÊME condition — les deux se
  -- modifient ensemble, sinon le monitoring ment.
  if p_source <> 'payment' and v_has_billing and not v_is_comped and p_tier <> 'free'
     and v_due is not null and v_due < now() - interval '3 days' then
    return jsonb_build_object('granted', false, 'reason', 'awaiting_payment_event',
                              'next_grant_at', v_due, 'tier', p_tier);
  end if;

  -- Report plafonné à 2× le grant du tier — dérivé de v_amount, donc il suit
  -- automatiquement tout changement de coin_config (300 → plafond 600,
  -- 800 → plafond 1600). GREATEST : un solde déjà au-dessus n'est jamais
  -- amputé, il cesse simplement de croître.
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
$$;

-- Miroir exact de la garde ci-dessus : même exclusion des comptes offerts.
create or replace function public.coins_awaiting_payment()
returns table (
  user_id       uuid,
  email         text,
  tier          text,
  canal         text,
  next_grant_at timestamptz,
  jours_retard  int
)
language sql
security definer
set search_path = public
as $$
  select p.id,
         p.email,
         case when p.is_pro then 'pro' else 'premium' end,
         case when p.stripe_customer_id is not null then 'stripe'
              when p.apple_original_transaction_id is not null then 'apple'
              when p.google_purchase_token is not null then 'google'
              else 'inconnu' end,
         w.next_grant_at,
         extract(day from (now() - w.next_grant_at))::int
  from profiles p
  join coin_wallets w on w.user_id = p.id
  where (p.is_pro or p.is_premium)
    and not coalesce(p.is_comped, false)   -- compte offert : jamais en attente de paiement
    and (p.stripe_customer_id is not null
         or p.apple_original_transaction_id is not null
         or p.google_purchase_token is not null)
    and w.next_grant_at is not null
    and w.next_grant_at < now() - interval '3 days'
  order by w.next_grant_at;
$$;

revoke all on function public.coins_awaiting_payment() from public, anon, authenticated;
grant execute on function public.coins_awaiting_payment() to service_role;
