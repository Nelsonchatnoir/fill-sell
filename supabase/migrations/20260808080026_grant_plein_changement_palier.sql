-- Grant PLEIN sur changement de palier payant (2026-08-08).
--
-- AVANT : la branche « cycle encore ouvert » de upgrade_monthly_grant
-- créditait le DIFFÉRENTIEL entre paliers (v_new_amount - v_old_amount).
-- Un nouveau Premium, déjà porteur du grant free (30), recevait 150-30 = 120 :
-- mail d'encaissement mensonger (l'offre promet 150), et solde final < 150
-- dès qu'une Pépite avait été dépensée avant de payer.
--
-- APRÈS : changer de palier = recevoir le montant PLEIN du nouveau palier
-- (150 premium, 600 pro). Le plafond de report (2× le grant du nouveau
-- palier) continue de s'appliquer. Conséquence assumée : Premium→Pro en
-- cours de cycle reçoit 600 pleins, plus 450 de différence.
--
-- GARDE-FOU : le grant plein ne part QUE si le palier change réellement
-- (v_old_tier IS DISTINCT FROM p_tier). Même palier = comportement
-- historique inchangé : aucun crédit ('no_upgrade_needed'), réalignement de
-- next_grant_at sur la date du store quand elle est fournie. Raison :
-- RESTARTED (type 7 Google) arrive SANS nouveau paiement — sans cette
-- condition, annuler puis réactiver en boucle encaisserait un grant plein à
-- chaque tour.
--
-- NE PAS TOUCHER au calcul de v_ref (lu sur v_wallet.next_grant_at AVANT
-- l'update) ni au kind 'grant_upgrade' : c'est ce qui rend la fonction
-- idempotente face aux rejeux Pub/Sub (2e exécution → même ref →
-- unique_violation → already_granted). Les rejeux sont réels : l'achat du
-- 07/08 a été rejoué une quinzaine de fois.
--
-- Hérité par TOUS les appelants de la RPC : google-play-webhook,
-- apple-iap-webhook, stripe-webhook, create-checkout-session,
-- validate-google-purchase.

create or replace function public.upgrade_monthly_grant(
  p_user_id uuid,
  p_tier text,
  p_period_end timestamp with time zone default null,
  p_source text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
