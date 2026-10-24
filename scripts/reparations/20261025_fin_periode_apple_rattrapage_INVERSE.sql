-- INVERSE de 20261025_fin_periode_apple_rattrapage.sql — PROPOSITION, NON APPLIQUÉE.
-- Ne remet à NULL que les profils dont la date est ENCORE celle écrite par le rattrapage : une date posée depuis
-- par apple-iap-webhook (renouvellement, résiliation) n'est jamais effacée.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.profiles p
   SET subscription_period_end = b.avant
  FROM public._backup_2510_fin_periode_apple b
 WHERE p.id = b.user_id
   AND p.subscription_period_end IS NOT DISTINCT FROM b.apres;

SELECT left(b.user_id::text, 8) AS uid, b.apres AS ecrit_par_le_rattrapage, p.subscription_period_end AS maintenant
  FROM public._backup_2510_fin_periode_apple b JOIN public.profiles p ON p.id = b.user_id
 ORDER BY b.apres;

COMMIT;
