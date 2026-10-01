-- Inverse de 20261001064500 : remet cross_post_jobs_voie_ebay telle qu'en prod le 01/10 06:40
-- (pg_get_functiondef, identique à 20260927091642). Aucune donnée touchée.
SET lock_timeout = '3s';

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
