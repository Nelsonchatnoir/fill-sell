-- 26/10 (urgence lenteur, étape 3 — preuve de vitesse) : 10 COPIES DE TEST sur le compte de Nico, pour chronométrer
-- « 10 articles Vinted → publier identique vers Leboncoin » dans le lot. Le compte de Nico n'a que 2 articles Vinted
-- qui ne sont pas déjà sur Leboncoin : on copie 10 de ses fiches Vinted (texte, photos, rayon Vinted, attributs dont
-- le marqueur du texte du vendeur), titre préfixé « TEST FillSell ne pas acheter - », prix 999 €, SANS fiches_annonce
-- (une préparation neuve, comme après un import) et SANS vinted_item_id (index unique user_id × vinted_item_id).
-- Rien n'est publié par ce script ; le lot est arrêté à « prêts », avant tout envoi.
-- Inverse : scripts/essais/20261026_lot_vitesse_10_copies_test_INVERSE.sql (supprime les 10 copies et leurs
-- fiches_annonce ; refuse si une publication en est partie).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010) THEN
    RAISE EXCEPTION 'des copies de test existent déjà (1793100000001..010) : relire avant de toucher';
  END IF;
END $$;
WITH sources(n, src) AS (VALUES
  (1, 1791722670101), (2, 1790864707143000), (3, 1790420994622), (4, 1789676224963), (5, 1785871917724005),
  (6, 1785871917724000), (7, 1785871917724003), (8, 1785871917724004), (9, 1785871917724001), (10, 1785444834689))
INSERT INTO public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, marque, description, type,
  purchase_costs, selling_fees, emplacement, plateforme, photos, vinted_catalog_id, photos_a_rapatrier,
  statut, quantite, date, attributs)
SELECT 1793100000000 + s.n, i.user_id, left('TEST FillSell ne pas acheter - ' || i.titre, 100), i.prix_achat, i.prix_achat_inconnu,
       999, i.marque, i.description, i.type, i.purchase_costs, 0, i.emplacement, i.plateforme, i.photos, i.vinted_catalog_id,
       coalesce(i.photos_a_rapatrier, false), 'stock', 1, now(),
       (i.attributs - 'contenu_divergent') || jsonb_build_object(
         'duplique_de', jsonb_build_object('v', i.id, 'at', now(), 'source', 'duplication'),
         'essai_vitesse_2610', jsonb_build_object('v', true, 'at', now(), 'source', 'scripts/essais/20261026_lot_vitesse_10_copies_test.sql'),
         'description_source', coalesce(i.attributs->'description_source', jsonb_build_object('v', 'vinted', 'source', 'vinted_detail', 'at', now())))
  FROM sources s JOIN public.inventaire i ON i.id = s.src AND i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, titre, prix_vente, vinted_catalog_id, attributs->'description_source'->>'v' AS texte_du_vendeur
  FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010 ORDER BY id;
COMMIT;
