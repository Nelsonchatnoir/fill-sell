-- ═══════════════════════════════════════════════════════════════════════════
-- eBay par API — LOT 2b (06/09/2026) : bascule de l'app derrière un DRAPEAU
-- PAR COMPTE, décidée dans la base.
--
-- A. profiles.ebay_voie_api boolean NOT NULL DEFAULT false — le drapeau.
--    Personne ne bascule sans un UPDATE explicite de Nico :
--      UPDATE profiles SET ebay_voie_api = true WHERE id = '<user_id>';
--    Lisible par le client (SELECT profiles existant), jamais modifiable par
--    lui (les GRANT UPDATE de profiles sont par colonne — celle-ci n'y est pas).
--
-- B. Trigger BEFORE INSERT cross_post_jobs_voie_ebay : pour un job eBay
--    inséré avec la voie par défaut ('extension'), décide voie='api' quand :
--      · action = 'publish' : drapeau du profil à true ET compte eBay relié
--        (ebay_accounts : revoked_at NULL, 3 politiques choisies,
--        seller_state.bloque_par_etat_ebay = false — la checklist verte) ;
--      · action = 'delete' | 'republish' : la dernière publication eBay de
--        cet article (published/sold/cancelled/deleted) était en voie 'api'
--        → le retrait / la republication suivent la même voie.
--    Tout le reste (drapeau false, compte non relié, checklist rouge, autres
--    plateformes) garde 'extension' : la voie formulaire est intacte pour
--    tout le parc. SECURITY DEFINER : le client n'a aucun droit de lecture
--    sur ebay_accounts, le trigger lit pour lui.
--    La décision vit ICI (et pas dans l'app) : elle s'applique à TOUS les
--    créateurs de jobs — spend_coins_and_publish, armRemovals, StockTab —
--    sans course entre un insert 'extension' et une mise à jour 'api'.
--
-- Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ebay_voie_api boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.ebay_voie_api IS
  'Drapeau par compte (lot 2b, 06/09/2026) : true = les jobs eBay partent par le worker API (voie api) si le compte eBay est relié et la checklist verte. Posé à la main par Nico, jamais par le client.';

CREATE OR REPLACE FUNCTION public.cross_post_jobs_voie_ebay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
    SELECT (a.revoked_at IS NULL
            AND a.fulfillment_policy_id IS NOT NULL
            AND a.payment_policy_id IS NOT NULL
            AND a.return_policy_id IS NOT NULL
            AND (a.seller_state->>'bloque_par_etat_ebay') = 'false')
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
     ORDER BY j.created_at DESC
     LIMIT 1;
    IF v_prev = 'api' THEN NEW.voie := 'api'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cross_post_jobs_voie_ebay ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_voie_ebay
  BEFORE INSERT ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_voie_ebay();

-- ── Vérification attendue après pose ──────────────────────────────────────
-- SELECT count(*) FROM profiles WHERE ebay_voie_api;                → 0 (avant tout UPDATE)
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.cross_post_jobs'::regclass AND tgname='cross_post_jobs_voie_ebay';
-- Actionner pour UN compte : UPDATE profiles SET ebay_voie_api = true WHERE id = '<user_id>';
