-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR AUX GRANTS 150 / 600 — annulation du passage à 300 / 800
-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-28, décision Nico. Annule 20260728180000 sur la seule partie
-- montants (la garde comped introduite par cette migration RESTE en place).
--
-- POURQUOI — la logique à ne pas remettre en cause plus tard : un pack de
-- 100 Pépites se vend 5 €, donc une Pépite vaut 5 centimes. À 300 Pépites,
-- un abonnement Premium à 12,99 € offrirait 15 € de Pépites — plus cher que
-- l'abonnement lui-même, et l'inventaire illimité devenait un cadeau. Les
-- Pépites incluses doivent valoir MOINS que le prix de l'abonnement : la
-- différence, c'est le prix de la fonctionnalité. À 300, Pro n'avait par
-- ailleurs plus rien à vendre face à Premium.
--
-- CE QUI NE BOUGE PAS : free reste à 30, aucun prix, aucun price Stripe,
-- aucun SKU. Aucun rattrapage ni grant forcé — les abonnés en cours de cycle
-- gardent leur montant actuel jusqu'à leur échéance.
--
-- PLAFOND DE REPORT : dérivé, jamais stocké. grant_monthly_coins calcule
-- `v_cap := v_amount * 2` à chaque appel, donc il redevient 300 (premium) et
-- 1200 (pro) sans rien d'autre à modifier. Et un solde déjà supérieur au
-- nouveau plafond n'est JAMAIS amputé : le GREATEST de
--   v_new_inc := greatest(included_balance, least(included_balance + v_amount, v_cap))
-- garantit qu'un grant ne peut que laisser le solde inchangé, jamais le
-- réduire (vérifié en réel sur un ex-premium à 150 face à un plafond de 60 :
-- montant 0, solde intact).

UPDATE public.coin_config SET value = 150 WHERE key = 'monthly_grant_premium';
UPDATE public.coin_config SET value = 600 WHERE key = 'monthly_grant_pro';

DO $$
DECLARE v_prem int; v_pro int; v_free int;
BEGIN
  SELECT value INTO v_prem FROM public.coin_config WHERE key = 'monthly_grant_premium';
  SELECT value INTO v_pro  FROM public.coin_config WHERE key = 'monthly_grant_pro';
  SELECT value INTO v_free FROM public.coin_config WHERE key = 'monthly_grant_free';
  IF v_prem <> 150 OR v_pro <> 600 OR v_free <> 30 THEN
    RAISE EXCEPTION 'Grants inattendus apres migration : free=% premium=% pro=%',
      v_free, v_prem, v_pro;
  END IF;
END $$;
