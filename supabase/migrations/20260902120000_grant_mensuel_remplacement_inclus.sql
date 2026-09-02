-- ═══════════════════════════════════════════════════════════════════════════
-- grant_monthly_coins : le grant mensuel REMPLACE le solde inclus (2026-09-02)
--
-- AVANT (cumul plafonné, posé le 28/07) :
--     v_cap     := v_amount * 2;
--     v_new_inc := greatest(included_balance,
--                           least(included_balance + v_amount, v_cap));
-- Le solde inclus CUMULAIT de mois en mois (jusqu'à 2× le grant) et
-- SURVIVAIT à la résiliation : l'abonnement se comportait comme un pack de
-- Pépites achetable une fois (audit du 02/09 — merine partie avec 1 382,
-- Baptiste avec 323 ; consommation réelle du grant : Premium 26 %, Pro 58 %).
--
-- APRÈS (remplacement) :
--     v_new_inc := v_amount;
-- Les Pépites incluses du mois sont pour le mois. Le plafond ×2 n'a plus de
-- raison d'être. `v_delta` peut désormais être NÉGATIF dans coin_ledger
-- (kind='grant_monthly') quand le solde de la veille dépassait le grant —
-- les requêtes d'analytics qui somment les grants doivent le savoir.
--
-- CE QUI NE CHANGE PAS :
--   · purchased_balance : JAMAIS touché ici — le remplacement ne porte QUE
--     included_balance. Les Pépites achetées au comptant restent acquises.
--   · monthly_grant_override : toujours prioritaire sur le montant du palier
--     (v_amount := v_override), le remplacement s'applique à ce montant-là.
--   · Échéances, anchor, garde awaiting_payment_event, ref d'idempotence,
--     upgrade_monthly_grant, refund_coins, expire_publish_reservations.
--
-- DOWNGRADE (payant → gratuit) : aucun chemin dédié — c'est CE code qui le
-- porte. grant_monthly_coins_sweep (cron 04:15) calcule le palier depuis les
-- flags COURANTS de profiles (`else 'free'`) et appelle upgrade_monthly_grant,
-- qui, à échéance atteinte, retombe sur grant_monthly_coins(user, 'free').
-- Au premier renouvellement après rétrogradation : included_balance := 50
-- (grant free). La garde awaiting_payment_event ne bloque pas ce chemin
-- (`p_tier <> 'free'` dans sa condition).
--
-- AUCUNE ÉCRITURE RÉTROACTIVE : cette migration ne touche que le corps de la
-- fonction. Aucun solde existant ne bouge au déploiement ; la règle
-- s'applique au prochain renouvellement de chaque compte, à son échéance.
--
-- ⚠️ Migration NON appliquée automatiquement : à jouer explicitement (cf.
-- CLAUDE.md — historiques divergents, `supabase db push` interdit).
-- Idempotente, rejouable (CREATE OR REPLACE, aucune donnée modifiée).
-- ═══════════════════════════════════════════════════════════════════════════

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
                         'solde_avant', v_wallet.included_balance,
                         'montant_theorique', v_amount,
                         'remplacement', true,
                         'next_grant_at', v_next)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  return jsonb_build_object('granted', true, 'amount', v_delta,
                            'montant_theorique', v_amount,
                            'solde_avant', v_wallet.included_balance,
                            'included_after', v_new_inc,
                            'next_grant_at', v_next,
                            'source', p_source);
end;
$function$;
