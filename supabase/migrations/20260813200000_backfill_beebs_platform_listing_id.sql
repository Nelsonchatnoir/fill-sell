-- Backfill platform_listing_id des jobs Beebs depuis listing_url (2026-08-13).
-- Le format d'URL produit Beebs est OBSERVÉ en base (20 lignes, toutes en
-- https://www.beebs.app/fr/p/<id numérique>-<slug>) : l'exclusion « format
-- jamais observé » d'update-job-status est levée le même jour (le motif
-- /\/p\/(\d+)/ y couvre le flux futur ; cette migration rattrape l'existant).
-- IDEMPOTENTE : ne touche que les lignes où platform_listing_id est NULL et
-- où l'URL porte le segment /p/<id> — un second passage ne modifie rien.
-- ⚠️ À appliquer UNE PAR UNE après validation explicite de Nico — jamais de
-- `supabase db push` sur ce projet (historiques de migrations divergents).

UPDATE public.cross_post_jobs
SET platform_listing_id = substring(listing_url FROM '/p/(\d+)')
WHERE platform = 'beebs'
  AND platform_listing_id IS NULL
  AND listing_url ~ '/p/\d+';
