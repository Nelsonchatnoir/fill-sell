-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE (25/10, point 4 « Revenus ») : L'ÉCHÉANCE DES ABONNÉS APPLE ACTIFS SANS DATE — SANS APPEL APPLE
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSITION — NON APPLIQUÉE. À lancer APRÈS le déploiement d'apple-iap-webhook corrigé (sinon un
-- renouvellement entre-temps laisserait la date d'avant jusqu'au renouvellement suivant).
-- Source : coin_wallets.next_grant_at — posé par upgrade_monthly_grant / grant_monthly_coins avec l'expiresDate
-- de la transaction VÉRIFIÉE par apple-iap-webhook (p_source 'payment'). Seules ces deux fonctions écrivent
-- next_grant_at (relu le 25/10) ; un balayage (source 'auto') écrit toujours sa ligne au grand livre : si la
-- DERNIÈRE dotation du compte est un paiement, l'échéance n'a pas été recalculée depuis. Contrôle croisé sur les
-- 2 comptes dont la ligne porte metadata.next_grant_at : identique au wallet ; les 3 abonnés déjà datés (par une
-- résiliation) ont la même date dans le wallet.
-- Cibles (simulation SELECT du 25/10 00:15) : 8 comptes, échéances du 27/10 au 24/11 (heure de Paris).
-- Format écrit : ISO UTC à la milliseconde, celui des webhooks (`new Date(ms).toISOString()`).
-- Le journal (stores_notifications_journal) n'aide pas ici : il ne gardait que notificationUUID et environnement.
-- Inverse : 20261025_fin_periode_apple_rattrapage_INVERSE.sql (ne défait que ce que ce script a écrit).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_2510_fin_periode_apple (
  user_id uuid PRIMARY KEY,
  avant   text,
  apres   text NOT NULL,
  source  text NOT NULL,
  le      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_2510_fin_periode_apple ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_fin_periode_apple FROM anon, authenticated;

WITH dernier_grant AS (
  SELECT DISTINCT ON (user_id) user_id, metadata->>'source' AS source
    FROM public.coin_ledger
   WHERE kind IN ('grant_monthly', 'grant_upgrade')
   ORDER BY user_id, created_at DESC, id DESC
), cibles AS (
  SELECT p.id AS user_id, p.subscription_period_end AS avant,
         to_char(w.next_grant_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS apres
    FROM public.profiles p
    JOIN public.coin_wallets w ON w.user_id = p.id
    JOIN dernier_grant dg ON dg.user_id = p.id
   WHERE p.apple_original_transaction_id IS NOT NULL
     AND p.google_purchase_token IS NULL
     AND p.stripe_customer_id IS NULL
     AND p.is_premium
     AND p.subscription_period_end IS NULL
     AND dg.source = 'payment'
     AND w.next_grant_at > now()
), sauve AS (
  INSERT INTO public._backup_2510_fin_periode_apple (user_id, avant, apres, source)
  SELECT user_id, avant, apres, 'coin_wallets.next_grant_at (dernière dotation = paiement)' FROM cibles
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id, apres
)
UPDATE public.profiles p
   SET subscription_period_end = s.apres
  FROM sauve s
 WHERE p.id = s.user_id
   AND p.subscription_period_end IS NULL;   -- aucune ligne déjà datée réécrite

-- Relecture (attendu : 8 lignes, chacune avant = NULL, profil = apres)
SELECT left(b.user_id::text, 8) AS uid, b.avant, b.apres, p.subscription_period_end = b.apres AS ecrit
  FROM public._backup_2510_fin_periode_apple b JOIN public.profiles p ON p.id = b.user_id
 ORDER BY b.apres;

COMMIT;
