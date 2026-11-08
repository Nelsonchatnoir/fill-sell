-- GESTE DE DONNÉES (08/11/2026, ordre de Nico : « Nicotest remis en Free proprement après tes preuves »)
-- Nicotest (profiles.id 5322fa18-c194-458b-a222-7ee4093c4968, compte de TEST de Nico) est devenu Pro à 14:23 par un
-- abonnement Apple BAC À SABLE (TestFlight, app.fillsell.pro2.sub) en essayant « Passer Pro + FillSell Cloud ». Il
-- repasse en Free pour l'essai de l'étape 2 (achat de la formule PUIS du Cloud) sur TestFlight.
-- ⚠️ Un abonnement TestFlight ne s'annule pas chez Apple (constaté le 07/11) : son renouvellement accéléré (vers le
--    09/11 14:23) le refera Pro par apple-iap-webhook. Rejouer ce geste après l'essai si besoin.
-- Garde : seulement CE compte, seulement s'il est Pro par Apple ; jamais un compte de relecture (test@ / googlereview@).
-- Sauvegarde : public._backup_0811_nicotest_free (la ligne d'avant). Inverse : 20261108_nicotest_retour_free_INVERSE.sql
CREATE TABLE IF NOT EXISTS public._backup_0811_nicotest_free AS
  SELECT id, is_premium, is_pro, is_business, subscription_period_end, now() AS sauvegarde_le
    FROM public.profiles WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968' AND is_pro = true AND apple_original_transaction_id IS NOT NULL;
REVOKE ALL ON public._backup_0811_nicotest_free FROM PUBLIC, anon, authenticated;
-- (08/11 soir) Ligne ajoutée pour la règle des sauvegardes (selftest:tables-droits-explicites) : la RLS a été posée à la
-- création par le régime du 24/10 (migration 20261024110000), relue en prod le 08/11 : relrowsecurity = true, aucun droit
-- anon/authenticated. Rejouée, elle ne change rien.
ALTER TABLE public._backup_0811_nicotest_free ENABLE ROW LEVEL SECURITY;
UPDATE public.profiles p
   SET is_premium = false, is_pro = false, is_business = false, subscription_period_end = NULL
 WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968'
   AND p.is_pro = true AND p.apple_original_transaction_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public._backup_0811_nicotest_free b WHERE b.id = p.id)
RETURNING p.id, p.is_premium, p.is_pro, p.is_business, p.subscription_period_end, p.is_cloud;
