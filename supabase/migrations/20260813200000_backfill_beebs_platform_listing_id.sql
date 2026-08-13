-- Backfill platform_listing_id des jobs Beebs depuis listing_url (2026-08-13).
-- Le format d'URL produit Beebs est OBSERVÉ en base — toutes les URLs Beebs
-- sont en https://www.beebs.app/fr/p/<id numérique>-<slug> : l'exclusion
-- « format jamais observé » d'update-job-status est levée le même jour (le
-- motif /\/p\/(\d+)/ y couvre le flux futur ; cette migration rattrape
-- l'existant).
-- PÉRIMÈTRE (recompté par Nico le 13/08, validé sur CE chiffre) : 53 lignes,
-- TOUS statuts et actions confondus — publish/published 20,
-- publish/cancelled 16, delete/deleted 13, publish/sold 3, delete/failed 1.
-- C'est voulu : un id sur un job vendu/supprimé/annulé ne déclenche rien et
-- sert la traçabilité. (Le « 20 » annoncé initialement ne comptait que les
-- published des 30 derniers jours — le WHERE ci-dessous, lui, a toujours
-- couvert les 53.) Extraction vérifiée : 0 échec, tous les ids font
-- 8 chiffres.
-- IDEMPOTENTE : ne touche que les lignes où platform_listing_id est NULL et
-- où l'URL porte le segment /p/<id> — un second passage ne modifie rien.
-- ⚠️ À appliquer UNE PAR UNE après validation explicite de Nico — jamais de
-- `supabase db push` sur ce projet (historiques de migrations divergents).

UPDATE public.cross_post_jobs
SET platform_listing_id = substring(listing_url FROM '/p/(\d+)')
WHERE platform = 'beebs'
  AND platform_listing_id IS NULL
  AND listing_url ~ '/p/\d+';
