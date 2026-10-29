-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- TEST RÉEL SUR LE COMPTE DE NICO (29/10/2026 soir, clôture du lot A, points 2 et 7) — annonce de test à 999 €
--   npx supabase db query --linked -f scripts/essais/20261029_test_bijoux_ebay_nico.sql
-- Les gestes de l'app, sous les claims de Nico (jamais une écriture directe dans une table de jobs) :
--   1. une fiche de test « TEST FillSell 999 ne pas acheter » (Boutons de manchette, photo déjà à lui) ;
--   2. sa file, en pause depuis le 28/10 22:47 (bouton de l'app), reprise le temps du test (file_pause_basculer) ;
--   3. spend_coins_and_publish : Vinted et eBay.
--      · Vinted (point 7, Rémi) : le chemin porte le libellé PÉRIMÉ « Jewellery » (celui que l'API Vinted servait le
--        28/10) au niveau « Bijoux », et l'identifiant du rayon 5564 (« Accessoires de mode > Bijoux > Boutons de
--        manchette », relu le 29/10 dans l'arbre du compte de Nico) : la 0.6.153+ doit lire le libellé AFFICHÉ par
--        #catalog-<id> et publier dans 5564 ;
--      · eBay (point 2) : publication de bout en bout après la bascule des modes d'envoi sur l'API Metadata.
-- Retrait : scripts/essais/20261029_test_bijoux_ebay_nico_RETRAIT.sql (jobs « delete » de l'app, puis la fiche, puis
-- la pause remise). Aucune autre ligne touchée ; aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos)
values (1793287300000, 'f44b5917-bccc-4431-ba41-f40571a2ed18',
  'TEST FillSell 999 ne pas acheter - boutons de manchette argentés', null, true, null, 'stock', now(), 'Sans marque',
  'Annonce de test FillSell (vérification du rayon Bijoux et de la publication eBay). Ne pas acheter : elle est retirée dans l''heure.',
  'Mode', 0, 0, 1,
  '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb);

select public.file_pause_basculer(false) as file_reprise;

select public.spend_coins_and_publish('original', jsonb_build_array(
  jsonb_build_object(
    'inventaire_id', '1793287300000', 'platform', 'vinted',
    'title', 'TEST FillSell 999 ne pas acheter - boutons de manchette argentés',
    'description', 'Annonce de test FillSell (vérification du rayon Bijoux). Ne pas acheter : elle est retirée dans l''heure.',
    'price', '999',
    'photos', '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
    'platform_fields', jsonb_build_object(
      'etat', 'Neuf sans étiquette', 'marque', 'Sans marque', 'couleur', 'Argenté', 'colors', jsonb_build_array('Argenté'),
      'categoryPath', jsonb_build_array('Accessoires de mode', 'Jewellery', 'Boutons de manchette'),
      'vinted_ids', jsonb_build_object('catalog_id', 5564, 'status_id', 1),
      'categorie_source', 'choix_humain',
      'categorie_choisie', jsonb_build_object('id', '5564', 'le', now(), 'chemin', jsonb_build_array('Accessoires de mode', 'Jewellery', 'Boutons de manchette')),
      'packageSize', 'Petit', 'packageSizeId', 1, 'colis_source', 'manuel',
      'test_nico', 'lot A 29/10 : libellé périmé « Jewellery », rayon 5564'
    )
  ),
  jsonb_build_object(
    'inventaire_id', '1793287300000', 'platform', 'ebay',
    'title', 'TEST FillSell 999 ne pas acheter - boutons de manchette argentés',
    'description', 'Annonce de test FillSell (publication eBay de bout en bout). Ne pas acheter : elle est retirée dans l''heure.',
    'price', '999',
    'photos', '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
    'platform_fields', jsonb_build_object(
      'etat', 'Neuf sans étiquette', 'marque', 'Sans marque', 'couleur', 'Argenté', 'colors', jsonb_build_array('Argenté'),
      'test_nico', 'lot A 29/10 : publication eBay de bout en bout'
    )
  )
)) as publication;

select left(id::text, 8) as job, platform, status, created_at at time zone 'Europe/Paris' as cree
from public.cross_post_jobs where inventaire_id = 1793287300000 order by platform;
commit;
