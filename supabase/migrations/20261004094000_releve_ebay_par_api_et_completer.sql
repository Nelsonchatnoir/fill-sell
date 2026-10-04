SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- eBAY RELIÉ OFFICIELLEMENT : LE RELEVÉ PASSE PAR L'API (04/10, Louis — point 4)
-- + LA FILE DES ANNONCES À LIRE SANS OUVRIR DE PAGE (point 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business) : compte pro « lamiral » relié à FillSell par la connexion
-- officielle eBay (OAuth), Chrome connecté à son compte perso. Le relevé eBay
-- lisait le Hub vendeur DANS CHROME ; la garde du 26/09 bloquait donc tout
-- (« on n'a pas encore pu vérifier que ton ordinateur est connecté au compte
-- lamiral. Rien n'est importé en attendant »), relevé de 0 annonce.
--
-- RÈGLE (Nico, 04/10) : pour un compte eBay relié officiellement, le relevé
-- (annonces en ligne, ventes, retraits constatés) passe par l'API eBay, sur
-- le compte relié, sans dépendre du compte ouvert dans Chrome. La garde
-- « mauvais compte dans Chrome » ne vaut plus que pour les relevés par
-- Chrome, c'est-à-dire les comptes NON reliés.
--   1. Un relevé fait par le serveur (`extension_build` « serveur:ebay-api… »)
--      lit le compte relié lui-même : il n'est jamais « hors compte ».
--   2. Un compte relié ne fait plus de relevé eBay par Chrome : l'extension
--      ne peut plus en créer ni en prendre (refus explicite, l'extension le
--      journalise et passe) ; la demande de l'app part à l'API
--      (fonction ebay-releve-api, toutes les 5 min).
--   3. demander_sync_plateforme : pour eBay relié, plus besoin d'une
--      extension vue — le serveur lit le compte.
--   4. ebay_vendeurs_annonces accepte la source « api_releve » (le vendeur
--      d'une annonce lue par l'API EST le compte relié).
--   5. Deux crons : ebay-releve-api (*/5) et releve-completer (*/10).
-- ⛔ Le secret de cron n'est écrit nulle part : public.cron_secret().
-- Idempotente.

-- ── 1. Le relevé du serveur n'est jamais « hors compte » ──────────────────
CREATE OR REPLACE FUNCTION public.releve_ebay_par_api(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.vinted_sync_runs r
                  where r.id = p_run_id and r.platform = 'ebay'
                    and coalesce(r.extension_build, '') like 'serveur:ebay-api%');
$function$;

CREATE OR REPLACE FUNCTION public.releve_ebay_run_bloque(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.vinted_sync_runs r
     where r.id = p_run_id and r.platform = 'ebay' and r.kind = 'annonces'
       and coalesce(r.extension_build, '') not like 'serveur:ebay-api%'
       and public.compte_ebay_api(r.user_id) is not null
       and not exists (select 1 from public.releve_ebay_compte c
                        where c.run_id = r.id and c.verdict = 'meme_compte'));
$function$;

-- ── 2. Un compte relié ne relève plus eBay par Chrome ──────────────────────
CREATE OR REPLACE FUNCTION public.garde_releve_ebay_par_api()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_h jsonb;
  v_ext boolean := false;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'ebay' OR NEW.kind IS DISTINCT FROM 'annonces' THEN RETURN NEW; END IF;
  IF public.compte_ebay_api(NEW.user_id) IS NULL THEN RETURN NEW; END IF;
  BEGIN
    v_h := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_ext := COALESCE(v_h ->> 'origin', '') LIKE 'chrome-extension://%';
  EXCEPTION WHEN OTHERS THEN v_ext := false;
  END;
  IF NOT v_ext THEN RETURN NEW; END IF;
  -- L'extension crée un relevé (quotidien, veilleur) ou prend une demande.
  IF (TG_OP = 'INSERT' AND NEW.status IN ('queued', 'running'))
     OR (TG_OP = 'UPDATE' AND NEW.status = 'running' AND OLD.status IS DISTINCT FROM 'running') THEN
    RAISE EXCEPTION 'RELEVE_EBAY_PAR_API: le compte eBay « % » est relié officiellement — son relevé passe par l''API eBay, pas par Chrome',
      public.compte_ebay_api(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS garde_releve_ebay_par_api ON public.vinted_sync_runs;
CREATE TRIGGER garde_releve_ebay_par_api
  BEFORE INSERT OR UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_ebay_par_api();

-- ── 3. La demande de l'app, pour eBay relié, n'attend aucune extension ────
-- (définition de prod du 04/10, pg_get_functiondef, + le seul aiguillage eBay)
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ext  timestamptz;
  v_ver  text;
  v_min  integer;
  v_code integer;
  v_actif record;
  v_fini timestamptz;
  v_id   uuid;
  v_api  boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  -- (27/09) « Je ne vends pas sur X » : aucun relevé, même demandé à la main.
  IF plateforme_ecartee_pour(v_user, v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_ecartee');
  END IF;
  -- (04/10) eBay relié officiellement : le serveur lit le compte par l'API.
  v_api := v_pf = 'ebay' AND compte_ebay_api(v_user) IS NOT NULL;
  IF NOT v_api THEN
    SELECT extension_last_seen_at, extension_version INTO v_ext, v_ver FROM profiles WHERE id = v_user;
    IF v_ext IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne', 'version', v_ver, 'minimum', v_min);
    END IF;
  END IF;
  PERFORM purger_sync_queue_perimee(v_user);
  SELECT id, status INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  SELECT max(finished_at) INTO v_fini FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status = 'done';
  IF v_fini IS NOT NULL AND v_fini > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cadence', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id, 'par_api', v_api);
END;
$function$;

-- ── 4. Le vendeur d'une annonce lue par l'API ─────────────────────────────
ALTER TABLE public.ebay_vendeurs_annonces DROP CONSTRAINT IF EXISTS ebay_vendeurs_annonces_source_check;
ALTER TABLE public.ebay_vendeurs_annonces
  ADD CONSTRAINT ebay_vendeurs_annonces_source_check CHECK (source IN ('browse', 'publication_api', 'api_releve'));

-- ── 5. Les annonces à lire sans ouvrir de page (releve-completer) ─────────
-- Beebs : un compte par ligne, ses annonces rattachées en ligne dont l'index
-- n'a pas été lu depuis le dernier relevé (ou jamais, ou depuis 20 h).
CREATE OR REPLACE FUNCTION public.releve_index_comptes_a_lire(p_platform text, p_limite integer)
 RETURNS TABLE(user_id uuid, listing_ids text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.user_id, array_agg(a.listing_id ORDER BY a.listing_id)
    FROM annonces_plateforme a
   WHERE a.platform = p_platform AND a.disparu_le IS NULL AND a.inventaire_id IS NOT NULL
     AND a.user_id IN (
       SELECT b.user_id FROM annonces_plateforme b
        WHERE b.platform = p_platform AND b.disparu_le IS NULL AND b.inventaire_id IS NOT NULL
          AND (b.donnees_index_le IS NULL OR b.donnees_index_le < now() - interval '20 hours' OR b.updated_at > b.donnees_index_le + interval '1 minute')
        GROUP BY b.user_id
        ORDER BY min(COALESCE(b.donnees_index_le, '1970-01-01'::timestamptz))
        LIMIT p_limite)
   GROUP BY a.user_id;
$function$;
REVOKE ALL ON FUNCTION public.releve_index_comptes_a_lire(text, integer) FROM PUBLIC, anon, authenticated;

-- ── 6. Les crons (secret lu dans le vault) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ebay-releve-api-5min') THEN
    PERFORM cron.schedule('ebay-releve-api-5min', '*/5 * * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-releve-api',
        headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
        body    := '{"trigger":"ebay_releve_api_cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'releve-completer-10min') THEN
    PERFORM cron.schedule('releve-completer-10min', '3-59/10 * * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/releve-completer',
        headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
        body    := '{"trigger":"releve_completer_cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$);
  END IF;
END $$;
