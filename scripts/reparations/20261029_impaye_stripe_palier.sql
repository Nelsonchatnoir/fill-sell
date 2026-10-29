-- (29/10, lot A point 11) Réparation du seul impayé encore payant : Romain Colson (voirememe). À jouer APRÈS stripe-webhook corrigé.
-- ── B. RÉPARATION (proposée) — scripts/reparations/20261029_impaye_stripe_palier.sql ─────────────────────
-- Ce qu'écrirait recomputeStripeFlags corrigé pour cus_VHwkU2CZpkTULk : un seul abonnement (« live subs: 1 »,
-- journal du 19/10 13:55), past_due depuis le 19/10 14:56 → aucun abonnement payé → les trois drapeaux à false.
-- Aucune ligne déjà gratuite réécrite ; garde sur le customer Stripe et l'absence d'offre (is_comped).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_2910_impaye_stripe (
  user_id            uuid PRIMARY KEY,
  stripe_customer_id text NOT NULL,
  is_premium         boolean,
  is_pro             boolean,
  is_business        boolean,
  motif              text NOT NULL,
  le                 timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_2910_impaye_stripe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2910_impaye_stripe FROM anon, authenticated;

WITH cibles AS (
  SELECT p.id, p.stripe_customer_id, p.is_premium, p.is_pro, p.is_business
    FROM public.profiles p
   WHERE p.id = 'f66531a7-9fd8-45d3-90ed-f6e02692cc7d'
     AND p.stripe_customer_id = 'cus_VHwkU2CZpkTULk'
     AND p.is_comped IS NOT TRUE
     AND (p.is_premium OR p.is_pro OR p.is_business)
), sauve AS (
  INSERT INTO public._backup_2910_impaye_stripe (user_id, stripe_customer_id, is_premium, is_pro, is_business, motif)
  SELECT id, stripe_customer_id, is_premium, is_pro, is_business,
         'Stripe past_due depuis le 19/10 14:56 (facture in_1USF9mQZRA77vrWJ67Eu1LvZ, 5 refus) : impayé = gratuit (29/10)'
    FROM cibles
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
UPDATE public.profiles p
   SET is_premium = false, is_pro = false, is_business = false
  FROM sauve s
 WHERE p.id = s.user_id;

-- Relecture (attendu : 1 ligne, avant pro, après free)
SELECT left(b.user_id::text, 8) AS uid, b.is_premium AS avant_premium, b.is_pro AS avant_pro,
       public.palier_de(b.user_id) AS palier_apres
  FROM public._backup_2910_impaye_stripe b;
COMMIT;

