-- INVERSE de 20261114_quotas_13e274de.sql : le portefeuille d'avant (sauvegarde _backup_1411_quotas_13e274de), la ligne de
-- correction retirée du journal. Garde : rien si la sauvegarde manque.
BEGIN;
DO $$
DECLARE
  u uuid := '13e274de-7af1-4368-8c31-afe214252ca2';
  b record;
BEGIN
  SELECT * INTO b FROM public._backup_1411_quotas_13e274de WHERE user_id = u ORDER BY sauve_le LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'sauvegarde absente : rien fait'; END IF;
  UPDATE public.coin_wallets SET included_balance = b.included_balance, next_grant_at = b.next_grant_at, updated_at = now()
   WHERE user_id = u;
  DELETE FROM public.coin_ledger WHERE user_id = u AND kind = 'admin' AND metadata ->> 'correction' = 'bloc_f_1411_credit_business_essai';
END $$;
SELECT included_balance, next_grant_at FROM public.coin_wallets WHERE user_id = '13e274de-7af1-4368-8c31-afe214252ca2';
COMMIT;
