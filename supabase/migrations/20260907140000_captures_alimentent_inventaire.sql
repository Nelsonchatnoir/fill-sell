-- ═══════════════════════════════════════════════════════════════════════════
-- LA CAPTURE VINTED ALIMENTE L'INVENTAIRE (2026-09-07, chantier « source de
-- vérité ») — rattrapage des articles déjà capturés
-- ═══════════════════════════════════════════════════════════════════════════
-- vinted_republish_captures relève, à chaque republication, tout ce qu'il faut
-- pour recréer une annonce : catégorie, taille, état, marque, couleurs, colis,
-- ISBN, description. Jusqu'ici ces données ne servaient QU'À la republication
-- Vinted ; publier le même article sur Leboncoin, eBay ou Beebs repartait du
-- titre importé et laissait l'IA deviner.
--
-- MESURES DU 07/09 (2 278 articles ayant une capture valide) :
--   · taille  : 49 articles en portaient une → 1 683 disponibles (+1 634)
--   · état    : 72 → 2 278            · couleur : 27 → 1 952
--   · marque  : 1 814 déjà remplis, 220 vides que la capture comble
--   · description : 2 180 articles n'en ont aucune, la capture en a une (100 %)
--   · catalog_id : 0 gain — il est DÉJÀ écrit par l'extension à chaque capture.
--
-- NON-RÉGRESSION (règle posée par Nico) : on AJOUTE, on ne remplace pas.
--   · la colonne `libelles` porte des libellés DÉJÀ RÉSOLUS par l'extension
--     (« M / 38 / 10 », « Très bon état ») — jamais un id brut ;
--   · source 'capture' = rang 3 : elle écrase le rattrapage backfill_job
--     (rang 0) et la liste du dressing (rang 2), JAMAIS un détail Vinted
--     (rang 4) ni une saisie de l'utilisateur (rang 5). C'est le trigger
--     inventaire_attributs_fusion_trg qui l'applique, pas ce script ;
--   · MARQUE : elle n'est écrite que si l'article n'en a AUCUNE. Sur les 7
--     divergences relevées, la capture était moins bonne 4 fois — Vinted
--     range sous des marques fourre-tout (« Boutique Belgique », « boutique
--     italienne », « Vintage Dressing ») ce que notre fiche nommait mieux
--     (« Flamant Rose », « Sans marque »). On ne remplace donc jamais ;
--   · DESCRIPTION : écrite seulement si l'article n'en a pas. Le texte de la
--     vendeuse ne se réécrit pas.
-- Sauvegarde préalable : inventaire_backup_20260907_captures.
-- Idempotente : rejouer ne change rien (gardes `NOT attributs ? 'clé'`).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inventaire_backup_20260907_captures AS
  SELECT id, attributs, description, vinted_catalog_id, marque
  FROM public.inventaire WHERE false;

INSERT INTO public.inventaire_backup_20260907_captures
SELECT i.id, i.attributs, i.description, i.vinted_catalog_id, i.marque
FROM public.inventaire i
WHERE EXISTS (SELECT 1 FROM public.vinted_republish_captures c
              WHERE c.inventaire_id = i.id AND c.verdict = 'valide')
  AND NOT EXISTS (SELECT 1 FROM public.inventaire_backup_20260907_captures b WHERE b.id = i.id);

-- Dernière capture VALIDE par article — c'est elle qui décrit l'annonce telle
-- qu'elle était en ligne au moment le plus récent.
CREATE TEMP TABLE derniere_capture AS
SELECT DISTINCT ON (c.inventaire_id)
       c.inventaire_id,
       to_char(c.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
       nullif(trim(c.libelles->>'taille'), '')  AS taille,
       nullif(trim(c.libelles->>'etat'), '')    AS etat,
       nullif(trim(c.libelles->>'marque'), '')  AS marque,
       nullif(trim(c.libelles->'couleurs'->>0), '') AS couleur,
       nullif(trim(c.libelles->'couleurs'->>1), '') AS couleur2,
       nullif(trim(c.libelles->>'isbn'), '')    AS isbn,
       nullif(trim(c.libelles->>'colis'), '')   AS colis,
       nullif(trim(c.payload->'natif'->>'description'), '') AS description,
       nullif(c.payload->'natif'->>'catalog_id', '')::bigint AS catalog_id
FROM public.vinted_republish_captures c
WHERE c.inventaire_id IS NOT NULL AND c.verdict = 'valide'
ORDER BY c.inventaire_id, c.captured_at DESC;

-- ── 1. Attributs : uniquement les clés ABSENTES de l'article ────────────────
UPDATE public.inventaire i
   SET attributs = (
     SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('v', v, 'source', 'capture', 'at', d.at)), '{}'::jsonb)
       FROM (VALUES ('taille', d.taille), ('etat', d.etat), ('couleur', d.couleur),
                    ('couleur2', d.couleur2), ('isbn', d.isbn), ('colis', d.colis),
                    -- la marque n'entre QUE si l'article n'en a aucune, nulle part
                    ('marque', CASE WHEN coalesce(trim(i.marque), '') = '' THEN d.marque END))
            AS champs(k, v)
      WHERE v IS NOT NULL AND NOT (i.attributs ? k))
  FROM derniere_capture d
 WHERE d.inventaire_id = i.id
   AND (d.taille IS NOT NULL OR d.etat IS NOT NULL OR d.couleur IS NOT NULL
        OR d.couleur2 IS NOT NULL OR d.isbn IS NOT NULL OR d.colis IS NOT NULL
        OR (d.marque IS NOT NULL AND coalesce(trim(i.marque), '') = ''));

-- ── 2. Catégorie Vinted : ne remplit qu'un trou, n'écrase jamais ────────────
UPDATE public.inventaire i
   SET vinted_catalog_id = d.catalog_id
  FROM derniere_capture d
 WHERE d.inventaire_id = i.id AND d.catalog_id IS NOT NULL AND i.vinted_catalog_id IS NULL;

-- ── 3. Description de la vendeuse : seulement là où l'article n'en a pas ────
UPDATE public.inventaire i
   SET description = d.description
  FROM derniere_capture d
 WHERE d.inventaire_id = i.id AND d.description IS NOT NULL
   AND coalesce(trim(i.description), '') = '';

DROP TABLE derniere_capture;
