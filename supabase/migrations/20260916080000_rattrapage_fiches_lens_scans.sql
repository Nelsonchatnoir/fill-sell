-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE DES GÉNÉRATIONS PERDUES (2026-09-16, GO Nico)
--
-- Le quota se débite à la GÉNÉRATION, mais jusqu'au 15/09 la ligne inventaire
-- ne naissait qu'au clic Publier : 654 générations facturées sur 1 697 (38,5 %,
-- 405 comptes) n'ont jamais rien laissé à personne. Le lot « la fiche survit à
-- la génération » (df472c5 … 6562418) a fermé la plaie pour la SUITE ; ce
-- fichier-ci rattrape le PASSÉ, pour la seule part qui soit encore récupérable.
--
-- Récupérable = le texte existe encore. `public.lens_scans` ne commence qu'au
-- 13/09 (migration 20260913203000) : tout ce qui a été généré avant n'a AUCUNE
-- trace et ne se rattrape pas. On ne fabrique rien qu'on n'ait pas.
--
-- ⛔ AUCUN APPEL À L'IA, AUCUN REDÉBIT. Le texte est RECOPIÉ depuis
--    lens_scans.resultat. Aucune ligne usage_logs n'est écrite, aucun quota
--    n'est lu ni touché : le décompte est exactement celui d'avant ce fichier.
-- ⛔ AUCUNE NOTIFICATION, aucun mail, aucune pastille poussée. Les gens
--    découvriront leurs brouillons en ouvrant l'app.
-- ⛔ LES FICHES NAISSENT EN BROUILLON (fiches_annonce.brouillon = true), pas en
--    stock rangé : l'utilisateur n'a rien fait dessus, c'est la définition même
--    de l'état brouillon (cf. enregistrerFiche, supabase/functions/_shared/
--    fiche-article.ts, et la section Brouillons de StockTab).
--
-- ── CE QUI EST ÉCARTÉ, ET POURQUOI ─────────────────────────────────────────
--   · statut <> 'termine' ou resultat NULL     → rien à recopier ;
--   · resultat->'annonce' absent ou vide       → le scan a été livré sans
--     rédaction : il n'y a pas de fiche à recréer ;
--   · est_vendu = true                         → même règle que lens-analysis :
--     l'écran propose « Enregistrer la vente », pas « publier ». Lui créer une
--     ligne en stock inventerait un article que l'utilisateur ne possède pas ;
--   · resultat->'inventaire_id' présent        → le serveur a DÉJÀ créé
--     l'article (chemin du 15/09) ;
--   · une fiche existe déjà pour ce scan_id    → IDEMPOTENCE : on ne crée rien ;
--   · ⛔ DOUBLON PROBABLE : le compte a déjà, dans les 48 h qui suivent le scan
--     (et dès 10 min avant, pour absorber l'horloge du client), un article au
--     MÊME titre — avec ou sans la marque, la casse et les espaces mis à plat.
--     C'est la signature d'un utilisateur qui a cliqué « Publier » ou
--     « Modifier & ajouter au stock » à l'époque : l'ancien chemin lui a créé
--     sa ligne. En recréer une seconde lui ferait deux fois le même article
--     dans son stock. Au moindre doute, on ne crée pas.
--
-- Relevé AVANT application (16/09/2026, sur 47 scans mode='annonce' terminés) :
--   1 écarté est_vendu · 4 ont déjà leur fiche · 1 a son article mais pas sa
--   fiche (l'écriture best-effort a échoué le 15/09 à 21:45) · 7 doublons
--   probables écartés · 34 à recréer, sur 21 comptes.
--   Les 31/17 comptes mesurés le 15/09 à 19h40 sont EXACTEMENT ce même calcul
--   arrêté à cette heure-là (31 scans / 19 comptes en rejouant la requête avec
--   la borne de date) : les 3 de plus sont des scans postérieurs à la mesure.
--
-- IDEMPOTENT PAR CONSTRUCTION : rejoué, le `NOT EXISTS` sur fiches_annonce
-- écarte tout ce que la première passe a créé — 0 ligne, 0 article, 0 effet.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Trace permanente du rattrapage ─────────────────────────────────────────
-- Elle sert à DEUX choses : dire plus tard ce que ce fichier a créé (et donc
-- pouvoir le défaire à la main si Nico le décide), et donner une seconde
-- barrière d'idempotence indépendante de fiches_annonce.
CREATE TABLE IF NOT EXISTS public.fiches_rattrapage_20260916 (
  scan_id      uuid PRIMARY KEY,
  user_id      uuid NOT NULL,
  inventaire_id bigint NOT NULL,
  scan_cree_le timestamptz NOT NULL,
  titre        text,
  rattrape_le  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiches_rattrapage_20260916 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiches_rattrapage_20260916 FROM anon, authenticated;

-- ── Le lot à recréer, figé dans une table temporaire ───────────────────────
-- Deux INSERT successifs le lisent : l'article d'abord (la clé étrangère de
-- fiches_annonce l'exige), la fiche ensuite. Le faire en un seul statement à
-- CTE modifiantes ferait dépendre le contrôle de clé étrangère de l'ordre
-- d'exécution des CTE, qui n'est pas garanti.
CREATE TEMPORARY TABLE _rattrapage_lot ON COMMIT DROP AS
WITH eligibles AS (
  SELECT
    ls.scan_id, ls.user_id, ls.created_at, ls.photos, ls.resultat,
    NULLIF(btrim(ls.resultat->>'titre'), '')  AS titre_brut,
    NULLIF(btrim(ls.resultat->>'marque'), '') AS marque
  FROM public.lens_scans ls
  WHERE ls.mode = 'annonce'
    AND ls.statut = 'termine'
    AND ls.resultat IS NOT NULL
    AND jsonb_typeof(ls.resultat->'annonce') = 'object'
    AND ls.resultat->'annonce' <> '{}'::jsonb
    AND COALESCE((ls.resultat->>'est_vendu')::boolean, false) = false
    AND NULLIF(ls.resultat->>'inventaire_id', '') IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.fiches_annonce f WHERE f.scan_id = ls.scan_id)
    AND NOT EXISTS (SELECT 1 FROM public.fiches_rattrapage_20260916 r WHERE r.scan_id = ls.scan_id)
),
-- La marque ne se répète pas dans le titre — MÊME règle que stripMarque
-- (fiche-article.ts) et que l'app (src/App.jsx) : « Nike · Maillot PSG », pas
-- « Nike · Maillot PSG Nike ». Si le retrait vide le titre, on garde l'original.
avec_titre AS (
  SELECT e.*,
    CASE WHEN e.marque IS NULL THEN COALESCE(e.titre_brut, 'Article')
         ELSE COALESCE(
                NULLIF(btrim(regexp_replace(
                  regexp_replace(
                    COALESCE(e.titre_brut, 'Article'),
                    '\m' || regexp_replace(e.marque, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M',
                    '', 'gi'),
                  '\s+', ' ', 'g')), ''),
                COALESCE(e.titre_brut, 'Article'))
    END AS titre_strip
  FROM eligibles e
),
sans_doublon AS (
  SELECT a.* FROM avec_titre a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventaire i
    WHERE i.user_id = a.user_id
      AND i.created_at BETWEEN a.created_at - interval '10 minutes'
                           AND a.created_at + interval '48 hours'
      AND (lower(btrim(COALESCE(i.titre, ''))) = lower(a.titre_strip)
        OR lower(btrim(COALESCE(i.titre, ''))) = lower(COALESCE(a.titre_brut, '')))
  )
)
SELECT
  s.scan_id, s.user_id, s.created_at, s.photos, s.resultat,
  s.titre_brut, s.marque, s.titre_strip,
  -- id : même convention que l'app et que creerArticlePourFiche (epoch ms), la
  -- colonne est un bigint sans DEFAULT. Le plancher à max(id)+1 garantit qu'on
  -- ne retombe pas sur un identifiant déjà pris, le row_number qu'on ne
  -- collisionne pas à l'intérieur du lot.
  (SELECT GREATEST((extract(epoch FROM now()) * 1000)::bigint,
                   (SELECT COALESCE(max(id), 0) + 1 FROM public.inventaire)))
    + row_number() OVER (ORDER BY s.created_at, s.scan_id) AS nouvel_id,
  -- L'horodatage porté par les attributs et par `date` : celui du SCAN, pas
  -- celui du rattrapage. L'article date du geste qui a été facturé.
  to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS iso_scan
FROM sans_doublon s;

-- ── 1. L'article ───────────────────────────────────────────────────────────
-- Copie conforme de creerArticlePourFiche (fiche-article.ts) :
--   · statut 'stock' ;
--   · prix_achat NULL — ⛔ VIDE ≠ ZÉRO (règle du 03/08) : on ne sait pas ce
--     qu'il a payé, et un 0 produirait une marge de 100 % sur du vent ;
--   · origine NULL — surtout pas 'vinted_sync' (le dressing importé) ;
--   · photos du scan (lens-temp) : les seules qui existent. Le stepper les
--     remplace par les copies compressées à l'ouverture (rattacherPhotos).
INSERT INTO public.inventaire (
  id, user_id, titre, marque, type, description,
  prix_achat, prix_vente, margin, margin_pct,
  statut, date, created_at, purchase_costs, selling_fees, quantite,
  photos, attributs, origine
)
SELECT
  l.nouvel_id,
  l.user_id,
  l.titre_strip,
  l.marque,
  NULLIF(btrim(l.resultat->>'categorie'), ''),
  NULLIF(btrim(l.resultat->>'description'), ''),
  NULL,
  CASE WHEN (l.resultat->>'prix_vente_suggere') ~ '^[0-9]+([.,][0-9]+)?$'
        AND replace(l.resultat->>'prix_vente_suggere', ',', '.')::numeric > 0
       THEN replace(l.resultat->>'prix_vente_suggere', ',', '.')::numeric END,
  NULL, NULL,
  'stock',
  l.iso_scan,
  l.created_at,
  0, 0, 1,
  CASE WHEN jsonb_typeof(l.photos) = 'array' AND jsonb_array_length(l.photos) > 0
       THEN l.photos END,
  -- attributsLus() : { clé: { v, source:'lens', at } } pour toute valeur NON
  -- vide. source 'lens' = le plus faible de l'échelle, la base ne laisse jamais
  -- une lecture IA écraser une valeur Vinted ou une saisie.
  COALESCE((
    SELECT jsonb_object_agg(a.k, jsonb_build_object('v', a.v, 'source', 'lens', 'at', l.iso_scan))
    FROM (VALUES
      ('taille',              l.resultat->'taille_estimee'),
      ('couleur',             l.resultat->'couleur'),
      ('matiere',             l.resultat->'matiere'),
      ('etat',                l.resultat->'etat_estime'),
      ('isbn',                l.resultat->'attributs_visibles'->'isbn_ean'),
      ('attributs_visibles',  l.resultat->'attributs_visibles')
    ) AS a(k, v)
    WHERE a.v IS NOT NULL
      AND jsonb_typeof(a.v) <> 'null'
      AND NOT (jsonb_typeof(a.v) = 'string' AND btrim(a.v #>> '{}') = '')
      AND NOT (jsonb_typeof(a.v) = 'object' AND a.v = '{}'::jsonb)
      AND NOT (jsonb_typeof(a.v) = 'array'  AND jsonb_array_length(a.v) = 0)
  ), '{}'::jsonb),
  NULL
FROM _rattrapage_lot l;

-- ── 2. La fiche ────────────────────────────────────────────────────────────
-- MÊME forme que ce qu'écrit lens-analysis (v:1, photos, platformListings,
-- selected, price, lens) : le client la relit par appliquerGeneration, il n'y a
-- qu'un seul contrat et donc qu'un seul chemin d'application.
INSERT INTO public.fiches_annonce (inventaire_id, user_id, fiche, source, scan_id, brouillon, created_at, updated_at)
SELECT
  l.nouvel_id,
  l.user_id,
  jsonb_build_object(
    'v', 1,
    'photos', COALESCE(l.photos, '[]'::jsonb),
    -- { ...annonce, lens_unifie: true }
    'platformListings', (l.resultat->'annonce') || jsonb_build_object('lens_unifie', true),
    -- Object.keys(platformListings).filter(p => platformListings[p])
    'selected', COALESCE((
      SELECT jsonb_agg(p.key)
      FROM jsonb_each(l.resultat->'annonce'->'platforms') AS p(key, val)
      WHERE jsonb_typeof(p.val) <> 'null'
        AND NOT (jsonb_typeof(p.val) = 'boolean' AND p.val = 'false'::jsonb)
        AND NOT (jsonb_typeof(p.val) = 'string'  AND (p.val #>> '{}') = '')
        AND NOT (jsonb_typeof(p.val) = 'number'  AND (p.val #>> '{}')::numeric = 0)
    ), '[]'::jsonb),
    'price', CASE WHEN (l.resultat->>'prix_vente_suggere') ~ '^[0-9]+([.,][0-9]+)?$'
                  THEN to_jsonb(replace(l.resultat->>'prix_vente_suggere', ',', '.')::numeric)
                  ELSE 'null'::jsonb END,
    -- La fiche canonique du scan, RECOPIÉE : lens_scans se purge à 90 jours,
    -- la fiche vit aussi longtemps que l'article.
    'lens', jsonb_build_object(
      'objet',               COALESCE(l.resultat->'annonce'->'objet', 'null'::jsonb),
      'objet_source',        COALESCE(l.resultat->'annonce'->'objet_source', 'null'::jsonb),
      'titre',               COALESCE(l.resultat->'titre', 'null'::jsonb),
      'marque',              COALESCE(l.resultat->'marque', 'null'::jsonb),
      'modele',              COALESCE(l.resultat->'modele', 'null'::jsonb),
      'categorie',           COALESCE(l.resultat->'categorie', 'null'::jsonb),
      'famille',             COALESCE(l.resultat->'famille', 'null'::jsonb),
      'description',         COALESCE(l.resultat->'description', 'null'::jsonb),
      'taille_estimee',      COALESCE(l.resultat->'taille_estimee', 'null'::jsonb),
      'couleur',             COALESCE(l.resultat->'couleur', 'null'::jsonb),
      'matiere',             COALESCE(l.resultat->'matiere', 'null'::jsonb),
      'etat_estime',         COALESCE(l.resultat->'etat_estime', 'null'::jsonb),
      'attributs_visibles',  COALESCE(l.resultat->'attributs_visibles', 'null'::jsonb),
      'prix_vente_suggere',  CASE WHEN (l.resultat->>'prix_vente_suggere') ~ '^[0-9]+([.,][0-9]+)?$'
                                  THEN to_jsonb(replace(l.resultat->>'prix_vente_suggere', ',', '.')::numeric)
                                  ELSE 'null'::jsonb END
    )
  ),
  'lens_unifie_rattrapage',
  l.scan_id,
  true,
  l.created_at,
  now()
FROM _rattrapage_lot l;

-- ── 3. La trace ────────────────────────────────────────────────────────────
INSERT INTO public.fiches_rattrapage_20260916 (scan_id, user_id, inventaire_id, scan_cree_le, titre)
SELECT l.scan_id, l.user_id, l.nouvel_id, l.created_at, l.titre_strip
FROM _rattrapage_lot l
ON CONFLICT (scan_id) DO NOTHING;
