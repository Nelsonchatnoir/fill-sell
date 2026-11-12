-- INVERSE de supabase/migrations/20261112100000_essai_formule_aucun_credit_hors_paiement.sql (12/11/2026, question 9 des
-- offres Cloud) : les deux définitions de PROD lues le 12/11/2026 vers 09:45 (pg_get_functiondef, MCP, lecture seule),
-- recopiées à l'octet ci-dessous ; droits inchangés (CREATE OR REPLACE les garde). md5 de prod :
-- grant_monthly_coins 185d1427c213ccb8d2a179adbfebc6ed · coins_awaiting_payment f559b9978471d31e78b1b25794c8f8fe.
-- Aucune ligne à remettre : la migration n'en écrit aucune. Après l'inverse :
-- npx supabase migration repair --linked --status reverted 20261112100000, puis la PREUVE (md5 = ceux-ci).
-- Aucune transaction ici.
SET lock_timeout = '5s';

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

  -- ── REMPLACEMENT (2026-09-02) — les Pépites incluses du mois sont pour le
  -- mois. L'ancien cumul plafonné (greatest/least, cap ×2) est retiré : le
  -- solde inclus devient le grant du palier, ni plus, ni moins. v_delta peut
  -- être négatif (solde de la veille > grant) : la ligne de ledger le porte
  -- tel quel, c'est la trace honnête du remplacement.
  -- purchased_balance n'apparaît nulle part ici — il ne bouge JAMAIS.
  v_new_inc := v_amount;
  v_delta   := v_new_inc - v_wallet.included_balance;

  if p_period_end is not null and p_period_end > now() then
    v_next := p_period_end;
  else
    v_next := grant_next_due(now(), v_anchor);
  end if;

  v_ref := 'grant_monthly:' || p_user_id || ':' || to_char(coalesce(v_due, now()), 'YYYY-MM-DD');
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_monthly', v_ref,
      jsonb_build_object('tier', p_tier, 'override', v_override,
                         'source', p_source,
                         'solde_avant', v_wallet.included_balance,
                         'montant_theorique', v_amount,
                         'remplacement', true,
                         'next_grant_at', v_next)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  -- (15/10, lot D) Le solde et l'échéance ne bougent QU'AVEC leur ligne.
  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = v_next,
    grant_anchor_day = v_anchor,
    updated_at       = now()
  where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'amount', v_delta,
                            'montant_theorique', v_amount,
                            'solde_avant', v_wallet.included_balance,
                            'included_after', v_new_inc,
                            'next_grant_at', v_next,
                            'source', p_source);
end;
$function$;

CREATE OR REPLACE FUNCTION public.coins_awaiting_payment()
 RETURNS TABLE(user_id uuid, email text, tier text, canal text, next_grant_at timestamp with time zone, jours_retard integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id,
         p.email,
         case when p.is_business then 'business' when p.is_pro then 'pro' else 'premium' end,
         case when p.stripe_customer_id is not null then 'stripe'
              when p.apple_original_transaction_id is not null then 'apple'
              when p.google_purchase_token is not null then 'google'
              else 'inconnu' end,
         w.next_grant_at,
         extract(day from (now() - w.next_grant_at))::int
  from profiles p
  join coin_wallets w on w.user_id = p.id
  where (p.is_pro or p.is_premium)
    and not coalesce(p.is_comped, false)
    and (p.stripe_customer_id is not null
         or p.apple_original_transaction_id is not null
         or p.google_purchase_token is not null)
    and w.next_grant_at is not null
    and w.next_grant_at < now() - interval '3 days'
  order by w.next_grant_at;
$function$;

RESET lock_timeout;
