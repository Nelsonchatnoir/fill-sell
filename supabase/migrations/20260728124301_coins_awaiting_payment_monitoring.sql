-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260728124301 « coins_awaiting_payment_monitoring » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Expose les abonnés que le filet refuse de créditer faute d'événement de
-- paiement (cycle par utilisateur du 2026-07-28). La condition reproduit
-- EXACTEMENT la garde « awaiting_payment_event » de grant_monthly_coins :
-- compte à canal de paiement, tier non-free, échéance dépassée de plus de
-- 3 jours. Toute divergence entre les deux ferait mentir le monitoring, donc
-- si la fenêtre de grâce change là-bas, elle doit changer ici.
--
-- Lue par ops-digest (alerte quotidienne) : un abonné qui cesse d'être
-- crédité est soit en past_due légitime, soit victime d'un webhook de
-- renouvellement qui ne parvient plus. Les deux méritent un œil humain.
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
  where (p.is_pro or p.is_premium or p.is_comped)
    and (p.stripe_customer_id is not null
         or p.apple_original_transaction_id is not null
         or p.google_purchase_token is not null)
    and w.next_grant_at is not null
    and w.next_grant_at < now() - interval '3 days'
  order by w.next_grant_at;
$$;

revoke all on function public.coins_awaiting_payment() from public, anon, authenticated;
grant execute on function public.coins_awaiting_payment() to service_role;
