-- ═══════════════════════════════════════════════════════════════════════════
-- 05/10 — eBay : les annonces IMPORTÉES reprennent la voie de leur création
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle : migration 20261005140000 (la voie d'une annonce = la façon dont elle
-- a été créée). Ici, les jobs déjà en base :
--   1. tout job « publish » d'IMPORT (relevé, rattachement) étiqueté 'api'
--      alors que notre API n'a jamais créé l'annonce → 'extension'.
--      Sauvegarde : 20261005_ebay_imports_voie_extension_SAUVEGARDE.json
--      (774 jobs, 44 comptes, 772 annonces, lue le 05/10 avant écriture).
--      Ne touche ni au statut, ni aux champs : la voie seule.
--   2. le retrait eBay de Batman (xxewwer, 377494897809, job 4665368a, failed
--      « aucune publication API cohérente ») est clos : l'annonce s'est VENDUE
--      sur eBay le 05/10 à 10:06 (page de l'annonce lue dans Chrome le 05/10
--      à 13:5x : « Vendu — Vente réussie le lun. 5 oct. à 10:06 », aucun
--      bouton d'achat). Rien à retirer, rien n'a été touché.
-- Aucun autre retrait n'est relancé : les 12 retraits eBay d'imports passés par
-- l'API ont été relus un par un le 05/10 (pages eBay dans Chrome) — tous hors
-- ligne, sauf « Doudou Nala » 377453677328 (nicolas.menar), dont le retrait a
-- été REMPLACÉ le 03/10 par la question « Déjà vendu ? » (toujours ouverte,
-- rien ne prouve que c'est l'article vendu) : il attend la réponse.
-- Inverse : 20261005_ebay_imports_voie_extension_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL fillsell.voie_reetiquetage = 'on';

WITH cibles AS (
  SELECT c.id
    FROM cross_post_jobs c
   WHERE c.platform = 'ebay' AND c.voie = 'api' AND COALESCE(c.action, 'publish') = 'publish'
     AND COALESCE(c.handler_build, '') NOT ILIKE 'ebay-api-worker%'
     AND (COALESCE(c.handler_build, '') ~* 'sync-dressing|releve-annonces'
          OR COALESCE(c.platform_fields ->> 'source', '') = 'releve'
          OR COALESCE(c.platform_fields #>> '{rattachement,import}', '') = 'true')
     AND NOT public.ebay_annonce_creee_par_api(c.user_id,
           COALESCE(substring(btrim(COALESCE(c.platform_listing_id, '')) from '^(\d{9,})$'),
                    substring(COALESCE(c.listing_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')))
)
UPDATE cross_post_jobs c SET voie = 'extension'
  FROM cibles WHERE c.id = cibles.id AND c.voie = 'api';

UPDATE cross_post_jobs
   SET status = 'cancelled',
       error = 'Rien à retirer : l''annonce eBay 377494897809 est terminée — l''article s''est vendu sur eBay le 5 octobre à 10:06. Rien n''a été touché.',
       platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('clos_sans_retrait', jsonb_build_object(
         'le', now(), 'motif', 'annonce_vendue_sur_ebay',
         'preuve', 'page eBay lue dans Chrome le 2026-10-05 : « Vendu — Vente réussie le lun. 5 oct. à 10:06 », sans bouton d''achat ; vente 86185 (eBay, annonce 377494897809)',
         'statut_avant', 'failed',
         'pose_par', 'scripts/reparations/20261005_ebay_imports_voie_extension.sql'))
 WHERE id = '4665368a-0527-4aa0-80bd-381829acdb2d' AND status = 'failed' AND action = 'delete' AND platform = 'ebay';

-- Relecture (dans la transaction)
SELECT
  (SELECT count(*) FROM cross_post_jobs c
    WHERE c.platform = 'ebay' AND c.voie = 'api' AND COALESCE(c.action, 'publish') = 'publish'
      AND COALESCE(c.handler_build, '') NOT ILIKE 'ebay-api-worker%'
      AND (COALESCE(c.handler_build, '') ~* 'sync-dressing|releve-annonces'
           OR COALESCE(c.platform_fields ->> 'source', '') = 'releve'
           OR COALESCE(c.platform_fields #>> '{rattachement,import}', '') = 'true')) AS imports_encore_api,
  (SELECT status FROM cross_post_jobs WHERE id = '4665368a-0527-4aa0-80bd-381829acdb2d') AS batman_retrait;
COMMIT;
