-- ═══════════════════════════════════════════════════════════════════════════
-- QUANTITÉS : 4 FICHES ALIGNÉES SUR eBAY (01/10 suite, point 4, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sur les 22 fiches « eBay > fiche » du relevé Browse du 01/10, seules celles
-- dont le titre ET la description ne parlent ni de lot, ni de pièces, ni
-- d'ensemble sont corrigées ; au moindre doute, on ne touche pas.
-- Relu chez eBay juste avant (01/10, Browse) : en vente, quantité exacte,
-- 0 vendu.
--   camille.lemeneah      227456790092  Carte Bella Sara Foil Bellissimo      1 → 2
--   camille.lemeneah      227461944085  Carte Bella Sara Pub camp d'été       1 → 5
--   camille.lemeneah      227456777471  Carte promo Rimfaxe & Aurora          1 → 5
--   lesmillesetunepepite  198580615004  Plaque de porte laiton Stylecor       1 → 3
-- Laissées de côté (18) : la liste et la raison sont dans le rapport du 01/10
-- (lots, « service », pièces, titres au pluriel, annonces eBay en double).
-- Inverse : 20261001_quantites_ebay_sans_lot_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public._backup_0110_quantites (
  inventaire_id bigint PRIMARY KEY, quantite_avant int, statut_avant text, le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0110_quantites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_quantites FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _q (inv bigint, lid text, cible int) ON COMMIT DROP;
INSERT INTO _q VALUES
  (1790533701395, '227456790092', 2),
  (1790533701366, '227461944085', 5),
  (1790277822971, '227456777471', 5),
  (1790533654653, '198580615004', 3);

INSERT INTO public._backup_0110_quantites (inventaire_id, quantite_avant, statut_avant)
SELECT i.id, i.quantite, i.statut FROM inventaire i JOIN _q ON _q.inv = i.id
ON CONFLICT (inventaire_id) DO NOTHING;

-- Seulement si la fiche est toujours en stock à 1, sans fusion, et porte bien
-- cette annonce eBay (job publié, numéro exact).
UPDATE inventaire i SET quantite = q.cible
  FROM _q q
 WHERE i.id = q.inv AND i.statut = 'stock' AND i.quantite = 1 AND i.fusionne_dans IS NULL
   AND EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = 'ebay'
                AND j.status = 'published' AND j.platform_listing_id = q.lid);

SELECT q.inv, q.lid, i.quantite FROM _q q JOIN inventaire i ON i.id = q.inv ORDER BY q.inv;
COMMIT;
