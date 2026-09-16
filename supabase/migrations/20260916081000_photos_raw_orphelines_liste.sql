-- ═══════════════════════════════════════════════════════════════════════════
-- MÉNAGE listing-photos/<uid>/raw/ — LA LISTE, FIGÉE AVANT LA SUPPRESSION
-- (2026-09-16, GO Nico)
--
-- Le bucket porte 3 738 objets sous `<uid>/raw/` (1 278 Mo). Ce sont les
-- ORIGINAUX téléversés par le stepper et par le viseur (ListingPreviewScreen
-- 4724/4851, LensTab 685) : `<uid>/raw/<lot>_<i>.jpg`, où `<lot>` est le
-- Date.now() de la fournée. Ce que la base référence, ce sont les copies
-- (enhanced/rehosted/republish) ET, parfois, ces originaux-là.
--
-- ⛔ ON NE SUPPRIME PAS DEPUIS UN BALAYAGE À LA VOLÉE. La liste est figée ICI,
--    dans une table tracée, et c'est d'ELLE que part la suppression. Ce qui
--    n'est pas dans cette table ne peut pas être supprimé par erreur.
--
-- ── CE QUI COMPTE COMME « RÉFÉRENCÉE » ─────────────────────────────────────
-- inventaire.photos, cross_post_jobs.photos et fiches_annonce.fiche->'photos'.
-- DEUX pièges, tous les deux vécus :
--   · l'URL porte `?v=<ts>` (parade au 404 mis en cache, incident Delavier du
--     02/09) — comparer l'URL telle quelle ne matche RIEN, il faut couper la
--     query. Sans ça la première mesure rendait « 0 photo référencée sur
--     3 738 », c'est-à-dire « supprimez tout » ;
--   · une entrée photo est TANTÔT une chaîne TANTÔT un objet {type,url}
--     (src/utils/photos.js, règle du 05/09). `jsonb_array_elements_text` sur
--     un objet rend le JSON, pas l'URL.
--
-- ── LES CINQ VERROUS, TOUS EXIGÉS ──────────────────────────────────────────
-- Une photo n'entre dans cette liste QUE si :
--   1. son URL n'est référencée nulle part (ci-dessus) ;
--   2. AUCUNE de ses sœurs de fournée ne l'est non plus — une fournée dont une
--      photo sert appartient à un article, on n'y touche pas ;
--   3. le compte n'a AUCUNE génération facturée (usage_logs.feature =
--      'generate_listing') dans les ±24 h autour du téléversement. ⛔ C'est le
--      verrou des « 2 001 rattachables » : une photo dont la génération a été
--      PAYÉE n'est pas orpheline, elle est orpheline DE TEXTE — elle reste la
--      matière première d'un rattrapage (cf. 20260916080000). Mesuré sur les
--      2 828 orphelines de référence : 2 019 protégées par ce seul verrou
--      (1 988 à ±2 h), ce qui encadre exactement les 2 001 relevées le 15/09 ;
--   4. le compte n'a créé AUCUN article dans les ±24 h autour du
--      téléversement ;
--   5. elle a PLUS DE 7 JOURS. Rien de récent ne part, quoi qu'il arrive.
--
-- C'est l'INTERSECTION de toutes les définitions plausibles de « rattachable »,
-- donc un sous-ensemble STRICT des 824 que Nico autorise à supprimer :
-- 508 objets, 211 Mo, 113 comptes (du 28/06 au 08/09). Le reste des 2 828 est
-- laissé en place — quand on ne sait pas, on ne supprime pas.
--
-- IDEMPOTENT : la liste n'est CONSTRUITE qu'à la première passe (INSERT ...
-- WHERE NOT EXISTS sur la table entière). Rejouée, elle ne bouge plus — c'est
-- une photographie d'avant, pas une vue.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.photos_raw_orphelines_20260916 (
  name        text PRIMARY KEY,
  compte      uuid NOT NULL,
  lot         text,
  taille      bigint NOT NULL,
  televersee_le timestamptz NOT NULL,
  listee_le   timestamptz NOT NULL DEFAULT now(),
  supprimee_le timestamptz
);

ALTER TABLE public.photos_raw_orphelines_20260916 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.photos_raw_orphelines_20260916 FROM anon, authenticated;

INSERT INTO public.photos_raw_orphelines_20260916 (name, compte, lot, taille, televersee_le)
WITH brut AS (
  SELECT e AS el FROM public.inventaire i, LATERAL jsonb_array_elements(i.photos) e
    WHERE jsonb_typeof(i.photos) = 'array'
  UNION ALL
  SELECT e FROM public.cross_post_jobs j, LATERAL jsonb_array_elements(j.photos) e
    WHERE jsonb_typeof(j.photos) = 'array'
  UNION ALL
  SELECT e FROM public.fiches_annonce f, LATERAL jsonb_array_elements(f.fiche->'photos') e
    WHERE jsonb_typeof(f.fiche->'photos') = 'array'
), urls AS (
  SELECT CASE WHEN jsonb_typeof(el) = 'string' THEN el #>> '{}'
              WHEN jsonb_typeof(el) = 'object'
                THEN COALESCE(el->>'url', el->>'original', el->>'enhanced', el->>'bg_removed')
         END AS u
  FROM brut
), refs AS (
  SELECT DISTINCT split_part(split_part(u, '/storage/v1/object/public/listing-photos/', 2), '?', 1) AS nom
  FROM urls WHERE u LIKE '%/storage/v1/object/public/listing-photos/%'
), raw AS (
  SELECT o.name,
         split_part(o.name, '/', 1) AS compte,
         split_part(split_part(o.name, '/', 3), '_', 1) AS lot,
         o.created_at,
         COALESCE((o.metadata->>'size')::bigint, 0) AS taille,
         EXISTS (SELECT 1 FROM refs WHERE refs.nom = o.name) AS ref
  FROM storage.objects o
  WHERE o.bucket_id = 'listing-photos' AND o.name LIKE '%/raw/%'
), lots AS (
  SELECT compte, lot, bool_or(ref) AS lot_ref FROM raw GROUP BY 1, 2
)
SELECT r.name, r.compte::uuid, r.lot, r.taille, r.created_at
FROM raw r
JOIN lots l ON l.compte = r.compte AND l.lot = r.lot
WHERE NOT r.ref                                      -- verrou 1
  AND NOT l.lot_ref                                  -- verrou 2
  AND r.created_at < now() - interval '7 days'       -- verrou 5
  AND NOT EXISTS (                                   -- verrou 3
    SELECT 1 FROM public.usage_logs ul
    WHERE ul.user_id = r.compte::uuid
      AND ul.feature = 'generate_listing'
      AND ul.created_at BETWEEN r.created_at - interval '24 hours'
                            AND r.created_at + interval '24 hours')
  AND NOT EXISTS (                                   -- verrou 4
    SELECT 1 FROM public.inventaire i
    WHERE i.user_id = r.compte::uuid
      AND i.created_at BETWEEN r.created_at - interval '24 hours'
                           AND r.created_at + interval '24 hours')
  AND NOT EXISTS (SELECT 1 FROM public.photos_raw_orphelines_20260916)
ON CONFLICT (name) DO NOTHING;
