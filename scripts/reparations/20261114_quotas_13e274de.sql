-- 20261114_quotas_13e274de.sql — (14/11/2026, décision de Nico sur le rapport du bloc F, point 1) LE CRÉDIT BUSINESS POSÉ
-- PENDANT L'ESSAI EST RETIRÉ : retour à l'état d'avant 01:27 (portefeuille 50, prochain crédit le 13/12), les quotas suivent
-- le palier (palier_de : Pro + Cloud une fois l'abonnement remis). « Si les quotas Pro la bloquent, tant pis : on ne
-- contourne rien. »
-- Cause : create-checkout-session (montée « in situ » du 14/11 01:27:03, corrigée par bec4b6e) a appelé
-- upgrade_monthly_grant sur un abonnement EN ESSAI → coin_ledger 18423 (grant_upgrade business +3000, included 3050),
-- coin_wallets.next_grant_at avancé au 20/11 23:39:22 UTC.
-- Sauvegarde : public._backup_1411_quotas_13e274de (le portefeuille tel qu'il est, une fois). Inverse :
-- 20261114_quotas_13e274de_INVERSE.sql. Gardes : rien ne bouge si le portefeuille n'est plus celui de l'audit
-- (included 3050, réservé 0, acheté 0, prochain crédit 2026-11-20 23:39:22+00) ou si la correction est déjà passée.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1411_quotas_13e274de AS
  SELECT now() AS sauve_le, w.* FROM public.coin_wallets w WHERE false;
ALTER TABLE public._backup_1411_quotas_13e274de ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_quotas_13e274de FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  u uuid := '13e274de-7af1-4368-8c31-afe214252ca2';
  w public.coin_wallets%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.coin_ledger WHERE user_id = u AND kind = 'admin' AND metadata ->> 'correction' = 'bloc_f_1411_credit_business_essai') THEN
    RAISE NOTICE 'déjà corrigé : rien fait'; RETURN;
  END IF;
  SELECT * INTO w FROM public.coin_wallets WHERE user_id = u FOR UPDATE;
  IF NOT FOUND OR w.included_balance <> 3050 OR w.reserved_balance <> 0 OR w.purchased_balance <> 0
     OR w.next_grant_at <> '2026-11-20 23:39:22+00'::timestamptz THEN
    RAISE EXCEPTION 'portefeuille différent de l''audit (included %, réservé %, acheté %, prochain %) : rien fait',
      w.included_balance, w.reserved_balance, w.purchased_balance, w.next_grant_at;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coin_ledger WHERE id = 18423 AND user_id = u AND kind = 'grant_upgrade' AND delta = 3000) THEN
    RAISE EXCEPTION 'ligne 18423 introuvable ou différente : rien fait';
  END IF;
  INSERT INTO public._backup_1411_quotas_13e274de SELECT now(), w.*;
  UPDATE public.coin_wallets SET included_balance = 50, next_grant_at = '2026-12-13 00:00:00+00'::timestamptz, updated_at = now()
   WHERE user_id = u;
  INSERT INTO public.coin_ledger (user_id, kind, delta, included_after, purchased_after, ref, metadata)
  VALUES (u, 'admin', -3000, 50, w.purchased_balance, 'bloc_f_1411', jsonb_build_object('correction', 'bloc_f_1411_credit_business_essai', 'annule', 18423,
    'raison', 'crédit Business posé pendant un essai Pro + Cloud (montée in situ du 14/11 01:27:03, corrigée par bec4b6e) — retiré, décision de Nico du 14/11',
    'next_grant_at_avant', w.next_grant_at, 'next_grant_at_apres', '2026-12-13T00:00:00+00:00'));
END $$;
SELECT included_balance, next_grant_at FROM public.coin_wallets WHERE user_id = '13e274de-7af1-4368-8c31-afe214252ca2';
COMMIT;
