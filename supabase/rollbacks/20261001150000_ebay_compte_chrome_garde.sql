-- Retour arrière de 20261001150000 (redéployer aussi get-pending-jobs sans la garde).
SET lock_timeout = '3s';
DROP TRIGGER IF EXISTS releve_ebay_compte_libere_jobs ON public.releve_ebay_compte;
DROP FUNCTION IF EXISTS public.ebay_compte_chrome_releve_libere();
DROP FUNCTION IF EXISTS public.ebay_compte_chrome(uuid);
