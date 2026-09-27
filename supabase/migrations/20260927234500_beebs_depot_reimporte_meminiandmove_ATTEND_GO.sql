-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ NON APPLIQUÉE — ATTEND LE GO DE NICO : ELLE DÉCLENCHE LE RETRAIT D'UNE
-- ANNONCE BEEBS EN LIGNE (article vendu)
-- ═══════════════════════════════════════════════════════════════════════════
-- meminiandmove, « Pantalon cigarette Sandro gris anthracite – Taille 36 »
-- (fiche 1789926947674001, VENDUE — vente Leboncoin, cf. 21/09) : son retrait
-- Beebs (eb499d78) attend « le lien » depuis le 20/09.
-- Le lien existe : le dépôt FillSell 3b657a62 (Beebs, publié le 20/09 à
-- 18:19:23 UTC, 24 €, « Pantalon cigarette Sandro gris anthracite 36 ») est
-- l'annonce 34010592 de l'index public Beebs (créée le 20/09 à 18:19:16 UTC,
-- 24 €, même titre) — 7 secondes d'écart, même prix, même titre, même
-- vendeur (TFNaGdl…) : c'est NOTRE dépôt.
-- Pourquoi il n'a jamais été relié : ce soir à 22:03, le relevé Beebs l'a
-- IMPORTÉ comme une fiche neuve (1790539439613, « en stock ») ; beebs-lien voit
-- alors l'identifiant « déjà pris » et s'arrête. Le même article vendu est donc
-- EN VENTE sur Beebs, porté par une fiche « en stock ».
--
-- Ce que fait cette migration :
--  1. la fiche importée (créée par le relevé, sans aucune donnée saisie) est
--     réunie à la fiche d'origine (inventaire_fusionner_pour) ;
--  2. le dépôt 3b657a62 reçoit son lien et son identifiant ;
--  3. le retrait eb499d78 trouve alors le lien au prochain passage
--     (get-pending-jobs le recopie du dépôt) → l'annonce Beebs est RETIRÉE.
-- Rejeu annulé du 27/09 ~23:40 : fiche importée réunie, lien posé, annonce
-- rattachée à la fiche vendue. À rejouer juste avant le GO.

SELECT inventaire_fusionner_pour(
  (SELECT user_id FROM inventaire WHERE id = 1789926947674001),
  1789926947674001, 1790539439613, 'migration 20260927234500 (dépôt FillSell réimporté par le relevé)');

UPDATE cross_post_jobs SET
  listing_url = 'https://www.beebs.app/fr/p/34010592',
  platform_listing_id = '34010592',
  platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_par_index', jsonb_build_object(
    'le', now(), 'annonce', '34010592', 'ecart_s', 7, 'prix', 24,
    'par', 'migration 20260927234500 (index public : même vendeur, même seconde à 7 s, même prix, même titre)'))
 WHERE id = '3b657a62-fe0a-45e1-991f-2081560b3839' AND listing_url IS NULL;
