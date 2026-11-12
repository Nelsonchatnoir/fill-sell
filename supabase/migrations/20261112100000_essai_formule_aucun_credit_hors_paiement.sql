-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PENDANT L'ESSAI D'UNE FORMULE AVEC CLOUD, AUCUN CRÉDIT MENSUEL HORS PAIEMENT (12/11/2026, question 9 des offres Cloud)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Décision de Nico (GO) : « correction à la racine, base jetable d'abord, aucun compte hors essai touché, retour arrière
-- prêt ». Le défaut : l'essai de 7 jours d'une formule (Premium + Cloud, Pro + Cloud) pose les drapeaux du palier
-- (is_premium / is_pro) SANS paiement. Le balayage quotidien grant_monthly_coins_sweep (cron coins-monthly-sweep, 04:15
-- UTC) lit ces drapeaux comme un palier payé : une échéance (coin_wallets.next_grant_at) tombée dans la semaine d'essai
-- recevait un crédit grant_monthly au palier de la formule — une ligne au grand livre = le DÉBUT D'UN CYCLE DE QUOTAS
-- (debut_cycle_quotas : jauges remises à zéro, « remise le » déplacée), pendant un essai. Les fonctions edge ne créditent
-- déjà plus pendant un essai (commit ccb40e0) ; il restait ce chemin SQL, et son jumeau : le crédit paresseux des
-- spend_coins_* (source 'lazy' ; mort aujourd'hui, tous les prix à 0, mais il lirait les mêmes drapeaux).
--
-- La règle, à la racine (grant_monthly_coins : là où vivent déjà « pas de paiement, pas de grant » et toute ligne
-- grant_monthly des deux chemins) : un appel 'sweep' ou 'lazy' pour un compte dont une formule avec Cloud est EN ESSAI
-- (profiles.cloud_formule posée, essai commencé, pas fini, pas arrêté, pas encore payé — le même essai que cloud_etat et
-- palier_de ; jamais le Cloud offert) ne crédite RIEN et n'écrit RIEN : { granted: false, reason: 'essai_formule_en_cours' }
-- (le balayage le compte dans « skipped »). Le premier paiement réel (source 'payment', fonctions edge) crédite comme
-- avant ; à la fin ou à l'arrêt de l'essai, la règle d'avant revient d'elle-même. Rien d'autre ne change : tout autre
-- compte, et tout autre appel ('payment', l'inscription de handle_new_user, un appel à la main), est traité exactement
-- comme avant.
--   · coins_awaiting_payment (ops-digest, section 6) porte « la MÊME condition » que grant_monthly_coins : la même
--     exclusion, sinon un compte en essai dont l'échéance tombe plus de 3 jours avant la fin de son essai serait
--     signalé à tort « abonné à recréditer » (il attend son premier paiement, à la fin de l'essai).
--   · ⚠ L'essai d'un ABONNÉ Stripe (décision 6 : il paie son palier et essaie sa formule + Cloud) est un essai de formule
--     (cloud_formule posée) : pendant ses 7 jours, le balayage ne devance plus son renouvellement ; le paiement de ce
--     renouvellement le crédite (invoice.paid, source 'payment', inchangé).
--
-- Réécrites depuis pg_get_functiondef de PROD (lu le 12/11/2026 vers 09:45, MCP, lecture seule) : seuls les blocs
-- marqués « 12/11/2026, question 9 » sont ajoutés. Droits inchangés (CREATE OR REPLACE les garde ; prod :
-- {postgres=X/postgres,service_role=X/postgres} pour les deux). md5 de prod : grant_monthly_coins
-- 185d1427c213ccb8d2a179adbfebc6ed · coins_awaiting_payment f559b9978471d31e78b1b25794c8f8fe.
-- Non réécrites (lues, inchangées) : grant_monthly_coins_sweep (a0da488f…), upgrade_monthly_grant (2080915e…), les
-- quatre spend_coins_* (crédit paresseux 'lazy', qui passent tous par upgrade_monthly_grant → grant_monthly_coins).
-- Aucune ligne écrite par la migration. Aucune transaction ici.
-- Essayée sur une base JETABLE : scripts/essais/20261112100000_banc.mjs (prod reproduite, défaut prouvé, migration jouée
-- deux fois, tous les autres cas identiques, inverse = état d'avant à l'octet). Verrou : selftest:essai-formule-credit.
-- Inverse : supabase/rollbacks/20261112100000_essai_formule_aucun_credit_hors_paiement_INVERSE.sql.
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

  -- (12/11/2026, question 9 des offres Cloud, décision de Nico) PENDANT L'ESSAI D'UNE FORMULE AVEC CLOUD, AUCUN CRÉDIT
  -- HORS PAIEMENT : l'essai pose les drapeaux du palier sans paiement ; le balayage ('sweep') et le crédit paresseux
  -- ('lazy') ne créditent rien et n'écrivent rien (une ligne grant_monthly ouvrirait un cycle de quotas neuf pendant la
  -- semaine d'essai). Seul un paiement réel ('payment') crédite. Même essai que cloud_etat et palier_de (commencé, pas
  -- fini, pas arrêté, pas payé), d'une formule (profiles.cloud_formule) ; jamais le Cloud offert. Même condition dans
  -- coins_awaiting_payment. Tout autre compte et tout autre appel : exactement comme avant.
  if p_source in ('sweep', 'lazy') then
    if exists (select 1 from profiles p
                where p.id = p_user_id
                  and p.cloud_formule is not null
                  and p.is_cloud is not true
                  and p.cloud_essai_arrete is not true
                  and p.cloud_canal is distinct from 'offert'
                  and p.cloud_essai_debut is not null and p.cloud_essai_fin is not null
                  and p.cloud_essai_debut <= now() and now() < p.cloud_essai_fin) then
      return jsonb_build_object('granted', false, 'reason', 'essai_formule_en_cours', 'tier', p_tier);
    end if;
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
    -- (12/11/2026, question 9 des offres Cloud) La MÊME condition que grant_monthly_coins : un compte dont une formule
    -- avec Cloud est en essai n'attend pas un renouvellement — il attend son premier paiement, à la fin de l'essai.
    and not (p.cloud_formule is not null
             and p.is_cloud is not true
             and p.cloud_essai_arrete is not true
             and p.cloud_canal is distinct from 'offert'
             and p.cloud_essai_debut is not null and p.cloud_essai_fin is not null
             and p.cloud_essai_debut <= now() and now() < p.cloud_essai_fin)
  order by w.next_grant_at;
$function$;

RESET lock_timeout;
