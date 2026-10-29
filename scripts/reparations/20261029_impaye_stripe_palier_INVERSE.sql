-- INVERSE (29/10, lot A point 11) — scripts/reparations/20261029_impaye_stripe_palier_INVERSE.sql ────────────────
-- Ne défait que ce que B a écrit, et seulement si le profil est encore à false (un recalcul du webhook
-- postérieur — paiement réglé → active — fait foi et n'est jamais écrasé).
BEGIN;
UPDATE public.profiles p
   SET is_premium = b.is_premium, is_pro = b.is_pro, is_business = b.is_business
  FROM public._backup_2910_impaye_stripe b
 WHERE p.id = b.user_id
   AND p.is_premium IS FALSE AND p.is_pro IS FALSE AND p.is_business IS FALSE;
SELECT left(b.user_id::text, 8) AS uid, public.palier_de(b.user_id) AS palier FROM public._backup_2910_impaye_stripe b;
COMMIT;
