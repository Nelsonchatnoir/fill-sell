-- ═══════════════════════════════════════════════════════════════════════════
-- eBay par API — LOT 2a (06/09/2026) : voie d'exécution des jobs, emplacement
-- marchand, cron du worker.
--
-- A. cross_post_jobs.voie — 'extension' (défaut, = tout le parc existant) ou
--    'api' (jobs eBay exécutés par le worker serveur). get-pending-jobs ne
--    distribue plus que voie='extension' : l'extension ne voit JAMAIS un job
--    API, le worker ne prend que voie='api'. Aucune nouvelle valeur de
--    platform : libellés, logos, comptages restent 'ebay'.
--    ⚠️ DEFAULT 'extension' NOT NULL : les jobs existants (437 pending, 88
--    needs_user, 2 processing au 06/09 midi) prennent la valeur par défaut
--    — vérifié après pose par la requête en fin de fichier.
--
-- B. ebay_accounts.merchant_location_key — clé de l'emplacement marchand eBay
--    (createInventoryLocation, une fois par vendeur ; createOffer l'exige).
--    Posée par le worker à la première publication ; aucune donnée d'adresse
--    ici (eBay la porte), seulement la clé.
--
-- C. pg_cron 'ebay-api-worker-2min' → fonction ebay-api-worker (verify_jwt
--    false, header x-cron-secret — même mécanique que handler-watch). Un tick
--    sans job voie='api' pending coûte une requête et sort.
--    ⚠️ À N'APPLIQUER QU'APRÈS le déploiement de ebay-api-worker.
--
-- ✅ APPLIQUÉE EN PROD le 06/09/2026 11:00 (Europe/Paris) sur le GO 2a de Nico, via
-- db query --linked --file, APRÈS le déploiement de ebay-api-worker v1 et AVANT
-- celui de get-pending-jobs v26. Vérifié après pose : 36 432 jobs voie='extension'
-- (435 pending, 88 needs_user, 2 processing), 0 'api' ; cron actif ;
-- ebay_accounts.merchant_location_key présente.
-- Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cross_post_jobs
  ADD COLUMN IF NOT EXISTS voie text NOT NULL DEFAULT 'extension';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cross_post_jobs_voie_check') THEN
    ALTER TABLE public.cross_post_jobs
      ADD CONSTRAINT cross_post_jobs_voie_check CHECK (voie IN ('extension', 'api'));
  END IF;
END $$;

COMMENT ON COLUMN public.cross_post_jobs.voie IS
  'Voie d''exécution : extension (Chrome, défaut) ou api (worker serveur eBay). Lot 2a, 06/09/2026.';

CREATE INDEX IF NOT EXISTS cross_post_jobs_api_pending_idx
  ON public.cross_post_jobs (created_at)
  WHERE voie = 'api' AND status = 'pending';

ALTER TABLE public.ebay_accounts
  ADD COLUMN IF NOT EXISTS merchant_location_key text;

COMMENT ON COLUMN public.ebay_accounts.merchant_location_key IS
  'merchantLocationKey de l''emplacement marchand eBay (Inventory API location), créé par le worker à la première publication.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ebay-api-worker-2min') THEN
    PERFORM cron.schedule(
      'ebay-api-worker-2min',
      '*/2 * * * *',
      $cron_body$
      SELECT net.http_post(
        url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
        headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
        body    := '{"trigger":"ebay_api_worker_cron"}'::jsonb
      );
      $cron_body$
    );
  END IF;
END $$;

-- ── Vérification attendue après pose ──────────────────────────────────────
-- SELECT voie, status, count(*) FROM cross_post_jobs
--  WHERE status IN ('pending','processing','needs_user') GROUP BY 1,2;
--   → voie = 'extension' pour TOUTES les lignes, aucune 'api'.
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'ebay-api-worker-2min';
