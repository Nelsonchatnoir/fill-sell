-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (03/11/2026, décision de Nico) UN PAIEMENT DU MÊME PALIER OUVRE TOUJOURS UN CYCLE NEUF — cas nadegemarcelin78
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Le défaut (prouvé en base le 03/11) : upgrade_monthly_grant, sur un paiement du MÊME palier arrivé plus de 2 jours
-- avant l'échéance interne (coin_wallets.next_grant_at), ne créditait rien et reportait l'échéance à la fin de la
-- nouvelle période payée, sans ligne au grand livre. Le cycle des quotas part du dernier grant (debut_cycle_quotas) :
-- il courait donc de l'ancien grant jusqu'à la nouvelle échéance. nadegemarcelin78 (Premium, Stripe) : grant le 29/09,
-- paiement le 16/10 (échéance interne 20/10), échéance reportée au 16/11 : cycle de 48 jours, 1 500 remontées atteintes
-- le 29/10, bloquée jusqu'au 16/11.
--
-- 1. La règle (upgrade_monthly_grant, réécrite depuis pg_get_functiondef en prod) : un paiement du même palier dont la
--    fin de période prolonge l'échéance de plus de 2 jours ouvre un cycle neuf à la date du paiement (grant plein par
--    grant_monthly_coins, compteurs à zéro). Ce qui ne prolonge pas la période (proration, rejeu, RESTARTED Apple sans
--    paiement, second appel du même paiement) ne crédite rien, comme avant. Paiement à l'échéance, retard, changement
--    de palier, balayage, montant fixé à la main : chemins inchangés.
-- 2. Le recalcul, par la même règle, de tout compte déjà dans ce cas : compte payant (canal de paiement, non offert)
--    dont la période payée en cours (échéance − 1 mois) a commencé plus de 2 jours après son dernier grant. Une ligne
--    grant_monthly datée du paiement ouvre son cycle à cette date. Le solde de pépites n'est pas touché (delta 0 : les
--    prix sont à 0 depuis le 02/09). Relevé le 03/11 : nadegemarcelin78 (16/10) et boncoin59300 (29/10, son paiement
--    Stripe ; le cycle partait du paiement Google du 26/10, remboursé). Un cycle plus récent ne fait que retirer des
--    tâches du compte : aucun compte ne perd de quota. Rejouée : ne fait rien (le cycle part déjà du paiement).
-- Aucun mail : rien ne passe par les webhooks. Preuve sur base jetable : scripts/quotas/preuve-cycle-remontees.mjs.

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
  v_res        jsonb;
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

  -- (03/11, décision de Nico) UN PAIEMENT DU MÊME PALIER OUVRE UNE NOUVELLE PÉRIODE PAYÉE = UN CYCLE NEUF.
  -- Arrivé plus de 2 jours avant l'échéance interne, il ne créditait rien et reportait l'échéance à la fin de la
  -- nouvelle période sans ligne au grand livre : le cycle des quotas (debut_cycle_quotas = dernier grant) courait
  -- alors de l'ancien grant jusqu'à la nouvelle échéance (nadegemarcelin78 : 29/09 → 16/11, 48 jours, bloquée à
  -- 1 500 remontées le 29/10). Désormais : grant plein à la date du paiement, compteurs à zéro. Seulement si la
  -- fin de période PROLONGE l'échéance de plus de 2 jours : une proration, un rejeu, un RESTARTED sans paiement ou
  -- le second appel du même paiement ne prolongent rien et ne créditent rien (branche plus bas, inchangée).
  if v_old_tier is not distinct from p_tier and p_source = 'payment'
     and p_period_end is not null and p_period_end > now()
     and p_period_end > v_wallet.next_grant_at + interval '2 days' then
    update coin_wallets set next_grant_at = now() where user_id = p_user_id;
    v_res := grant_monthly_coins(p_user_id, p_tier, p_period_end, p_source);
    if coalesce((v_res ->> 'granted')::boolean, false) then
      return v_res || jsonb_build_object('cycle_neuf', true, 'echeance_avant', v_wallet.next_grant_at);
    end if;
    -- Rien n'a été écrit (grant déjà posé aujourd'hui, montant absent) : l'échéance comme avant ce correctif.
    update coin_wallets set next_grant_at = p_period_end, updated_at = now() where user_id = p_user_id;
    return v_res || jsonb_build_object('cycle_neuf', false);
  end if;

  -- Montant fixé à la main : pas de top-up de changement de tier.
  select monthly_grant_override into v_override from profiles where id = p_user_id;
  if v_override is not null and v_override > 0 then
    return jsonb_build_object('granted', false, 'reason', 'override_fixed_amount',
                              'amount', v_override, 'tier', p_tier);
  end if;


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

  -- (15/10, lot D) Le solde ne bouge QU'AVEC sa ligne : l'UPDATE vient après
  -- l'insertion réussie (avant, un « already_granted » par collision de clé
  -- laissait le solde modifié sans aucune trace au grand livre).
  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = case when p_period_end is not null and p_period_end > now()
                            then p_period_end else next_grant_at end,
    updated_at       = now()
  where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier,
                            'included_after', v_new_inc);
end;
$function$;

WITH cible AS (
  SELECT w.user_id, w.next_grant_at, w.included_balance, w.purchased_balance,
         w.next_grant_at - interval '1 month' AS paye_le,
         public.palier_de(w.user_id) AS palier,
         public.debut_cycle_quotas(w.user_id) AS cycle_avant
    FROM public.coin_wallets w
    JOIN public.profiles p ON p.id = w.user_id
   WHERE w.next_grant_at IS NOT NULL
     AND COALESCE(p.is_comped, false) = false
     AND (p.stripe_customer_id IS NOT NULL OR p.apple_original_transaction_id IS NOT NULL
          OR p.google_purchase_token IS NOT NULL)
     AND public.palier_de(w.user_id) <> 'free'
)
INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata, created_at)
SELECT c.user_id, 0, c.included_balance, c.purchased_balance, 'grant_monthly',
       'grant_monthly:' || c.user_id || ':' || to_char(c.paye_le, 'YYYY-MM-DD'),
       jsonb_build_object('tier', c.palier, 'source', 'payment', 'remplacement', false,
                          'rattrapage', '20261103233000_paiement_meme_palier_cycle_neuf',
                          'paye_le', c.paye_le, 'cycle_avant', c.cycle_avant, 'next_grant_at', c.next_grant_at,
                          'motif', 'paiement du même palier reçu avant l''échéance interne : le cycle part du paiement'),
       c.paye_le
  FROM cible c
 WHERE c.paye_le > c.cycle_avant + interval '2 days'
   AND c.paye_le <= now()
ON CONFLICT (ref) WHERE ref IS NOT NULL DO NOTHING;
