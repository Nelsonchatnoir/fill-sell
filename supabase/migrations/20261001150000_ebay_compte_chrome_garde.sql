-- ═══════════════════════════════════════════════════════════════════════════
-- COMPTE eBAY RELIÉ ≠ COMPTE eBAY OUVERT DANS CHROME (01/10, complément)
-- ═══════════════════════════════════════════════════════════════════════════
-- Toute action eBay qui passe par l'extension (retrait d'une annonce importée
-- par son numéro, publication restée en voie navigateur) agit sur le compte
-- ouvert dans CHROME, pas sur celui relié à FillSell par l'API. Le relevé
-- eBay sait déjà qui est connecté dans Chrome (releve_ebay_compte, depuis le
-- 26/09 : vendeur des annonces lues au Hub, prouvé par eBay) et n'importe
-- rien d'un autre compte. Il manquait la même garde sur les ACTIONS.
--   1. ebay_compte_chrome(user) : le compte relié, et ce que le DERNIER relevé
--      tranché dit du compte de Chrome (même compte / autre compte + pseudo).
--   2. get-pending-jobs ne sert plus un job eBay à l'extension quand le
--      dernier relevé dit « autre compte » : needs_user (source
--      ebay_compte_chrome), message qui nomme le bon compte.
--   3. Dès qu'un relevé prouve le même compte, ces jobs repartent seuls
--      (trigger ci-dessous).
-- Comptes sans API eBay : rien ne change.
-- Retour arrière : supabase/rollbacks/20261001150000_ebay_compte_chrome_garde.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.ebay_compte_chrome(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT jsonb_build_object(
    'relie', public.compte_ebay_api(p_user),
    'verdict', d.verdict, 'chrome', d.vendeur_lu, 'le', d.le, 'run', d.run_id)
  FROM (SELECT 1) x
  LEFT JOIN LATERAL (
    SELECT c.verdict, c.vendeur_lu, c.run_id, coalesce(r.finished_at, r.started_at) AS le
      FROM public.releve_ebay_compte c JOIN public.vinted_sync_runs r ON r.id = c.run_id
     WHERE c.user_id = p_user AND c.verdict IN ('meme_compte', 'autre_compte')
     ORDER BY coalesce(r.finished_at, r.started_at) DESC NULLS LAST
     LIMIT 1) d ON true;
$f$;
REVOKE ALL ON FUNCTION public.ebay_compte_chrome(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ebay_compte_chrome(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ebay_compte_chrome_releve_libere()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  BEGIN
    UPDATE public.cross_post_jobs j
       SET status = 'pending', error = NULL,
           platform_fields = (coalesce(j.platform_fields, '{}'::jsonb) - 'needs_user_source')
             || jsonb_build_object('ebay_compte_chrome_leve', jsonb_build_object('le', now(), 'run', NEW.run_id))
     WHERE j.user_id = NEW.user_id AND j.platform = 'ebay' AND j.status = 'needs_user'
       AND j.platform_fields ->> 'needs_user_source' = 'ebay_compte_chrome';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ebay_compte_chrome_releve_libere (run %) : %', NEW.run_id, SQLERRM;
  END;
  RETURN NULL;
END $f$;

DROP TRIGGER IF EXISTS releve_ebay_compte_libere_jobs ON public.releve_ebay_compte;
CREATE TRIGGER releve_ebay_compte_libere_jobs
  AFTER INSERT OR UPDATE OF verdict ON public.releve_ebay_compte
  FOR EACH ROW WHEN (NEW.verdict = 'meme_compte')
  EXECUTE FUNCTION public.ebay_compte_chrome_releve_libere();
