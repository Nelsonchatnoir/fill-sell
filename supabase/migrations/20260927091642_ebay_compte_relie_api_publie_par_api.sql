-- ═══════════════════════════════════════════════════════════════════════════
-- eBay : UN COMPTE RELIÉ PAR L'API PUBLIE PAR L'API — ET UN JOB NE CHANGE PAS
-- DE VOIE EN ROUTE (27/09)
-- APPLIQUÉE le 27/09 à 11:20 (GO Nico, CLI db query -f), après rejeu en
-- transaction annulée : relié pas prêt → api ; sans drapeau, révoqué, autre
-- plateforme → extension ; api→extension et publié ext→api refusés ; pending
-- ext→api accepté ; droits identiques. Déployés AVANT : ebay-api-worker v55
-- (voie exigée à la prise, compte pas prêt → needs_user « ebay_compte_a_finir »,
-- reprise des publications restées en voie extension), handler-watch v61.
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. cross_post_jobs_voie_ebay (recopiée de la version EN PROD, pg_get_functiondef
--    du 27/09) : une PUBLICATION d'un compte relié (profiles.ebay_voie_api ET
--    ebay_accounts non révoqué) part en voie 'api', que le compte soit prêt ou
--    non. Avant : pas prêt (politiques non retenues, inscription vendeur) →
--    'extension' EN SILENCE ; l'extension butait sur le mur REAUTH eBay et le
--    worker retravaillait le même job (philippaa ×2 depuis le 18/09, pironneau
--    ×1 depuis le 25/09 ; 32 comptes reliés non prêts dans le parc). La
--    préparation est désormais contrôlée par ebay-api-worker à la prise.
--    Compte sans API reliée, ou révoquée : 'extension', inchangé. Retraits et
--    republications : « voie de la dernière mise en ligne », inchangé.
-- 2. cross_post_jobs_voie_stable (neuf) : la voie d'un job ne change qu'une
--    fois, dans un seul sens — 'extension' → 'api' — et seulement tant que le
--    job n'est pas en cours (pending ou needs_user). Toute autre bascule est
--    ignorée (la voie d'avant est gardée) et tracée en WARNING : un même job
--    n'est JAMAIS traité par les deux voies.

CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_ebay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_flag boolean;
  v_ok boolean;
  v_prev text;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'ebay' THEN RETURN NEW; END IF;
  -- Un choix explicite ('api' posé par l'appelant) est respecté tel quel.
  IF NEW.voie IS DISTINCT FROM 'extension' THEN RETURN NEW; END IF;

  IF NEW.action = 'publish' THEN
    SELECT p.ebay_voie_api INTO v_flag FROM profiles p WHERE p.id = NEW.user_id;
    IF NOT COALESCE(v_flag, false) THEN RETURN NEW; END IF;
    -- (2026-09-27) Relié = API, PRÊT OU NON. La préparation du compte
    -- (politiques retenues, statut vendeur) est contrôlée par ebay-api-worker à
    -- la prise du job : pas prêt → needs_user « ebay_compte_a_finir », ré-armé
    -- tout seul quand le compte le devient. Avant : pas prêt → 'extension' en
    -- silence, et le mur de connexion eBay que l'API évite (philippaa, pironneau).
    SELECT (a.revoked_at IS NULL)
      INTO v_ok
      FROM ebay_accounts a WHERE a.user_id = NEW.user_id;
    IF COALESCE(v_ok, false) THEN NEW.voie := 'api'; END IF;

  ELSIF NEW.action IN ('delete', 'republish') AND NEW.inventaire_id IS NOT NULL THEN
    SELECT j.voie INTO v_prev
      FROM cross_post_jobs j
     WHERE j.user_id = NEW.user_id
       AND j.platform = 'ebay'
       AND j.inventaire_id = NEW.inventaire_id
       AND j.action IN ('publish', 'republish')
       AND j.status IN ('published', 'sold', 'cancelled', 'deleted')
     -- 2026-09-06 : dernière MISE EN LIGNE, pas dernière création (un publish
     -- relancé après un retrait est créé avant le delete de l'annonce
     -- précédente).
     ORDER BY COALESCE(j.published_at, j.created_at) DESC
     LIMIT 1;
    IF v_prev = 'api' THEN NEW.voie := 'api'; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_stable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.voie IS NOT DISTINCT FROM OLD.voie THEN RETURN NEW; END IF;
  IF OLD.voie = 'extension' AND NEW.voie = 'api' AND OLD.status IN ('pending', 'needs_user') THEN
    RETURN NEW;
  END IF;
  RAISE WARNING 'cross_post_jobs_voie_stable : job % — bascule % → % refusée (statut %)', OLD.id, OLD.voie, NEW.voie, OLD.status;
  NEW.voie := OLD.voie;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.cross_post_jobs_voie_stable() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS cross_post_jobs_voie_stable ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_voie_stable
  BEFORE UPDATE OF voie ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_voie_stable();
