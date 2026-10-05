-- ESSAI RÉEL (05/10 soir, compte de Nico f44b5917…) — non-régression après
-- 0.6.99 + migration 20261005200000 : publication Vinted et Leboncoin, vente
-- enregistrée sur Vinted, retrait AUTOMATIQUE de la copie Leboncoin.
-- Fiche de TEST à 999 € (règle de Nico), titre « ne pas acheter » ; champs des
-- annonces = copie des dépôts de test de ce matin (jobs c940bc5b Vinted et
-- 09a360aa Leboncoin, champs du formulaire seulement via remise_en_vente_champs).
-- Inverse / nettoyage : 20261005_essai_soir_publication_vente_retrait_nico_INVERSE.sql

-- 1) La fiche de test.
INSERT INTO public.inventaire (id, user_id, titre, marque, type, description, prix_vente, prix_achat,
                               prix_achat_inconnu, statut, date, purchase_costs, selling_fees, quantite, photos)
SELECT 1791300000510, j.user_id, 'TEST FILLSELL bobines film Super 8 - ne pas acheter', NULL, 'Autre',
       'Annonce de TEST FillSell (essai du 05/10 soir), retirée aussitôt — ne pas acheter.', 999, NULL,
       true, 'stock', now(), 0, 0, 1, j.photos
  FROM public.cross_post_jobs j
 WHERE j.id = 'c940bc5b-f63a-483d-b688-727cc39b34a4'
   AND NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1791300000510);

-- 2) Les deux dépôts, comme le stepper les poserait.
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, 1791300000510, c.platform, 'pending', 'publish', c.photo_option,
       'TEST FILLSELL bobines film Super 8 - ne pas acheter',
       'Annonce de TEST FillSell (essai du 05/10 soir), retirée aussitôt — ne pas acheter.',
       999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('essai_0510', 'soir_non_regression')
  FROM public.cross_post_jobs c
 WHERE c.id IN ('c940bc5b-f63a-483d-b688-727cc39b34a4', '09a360aa-dec3-4f9f-b853-1c5974fb8237')
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = 1791300000510
                    AND x.platform = c.platform AND x.action = 'publish')
RETURNING id, platform, status;
