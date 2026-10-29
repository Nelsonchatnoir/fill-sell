-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- TEST RÉEL « LE TEXTE DU VENDEUR ARRIVE MOT POUR MOT » — VINTED, COMPTE DE NICO (29/10/2026 soir, lot B partie 2)
--   npx supabase db query --linked -f scripts/essais/20261029_test_texte_vendeur_vinted_nico.sql
-- La fiche naît comme l'ajout manuel du Stock la crée désormais (App.jsx addItem : titre et description marqués
-- « manuel » par marqueursDeNaissance) ; la publication part avec le texte que l'écran de publication envoie pour un
-- texte du vendeur (le sien, sans réécriture). 999 €, rayon 5564 (boutons de manchette, accepté en réel au lot A).
-- Lecture de contrôle : la page publique de l'annonce (description), comparée octet pour octet. Retrait :
-- …_RETRAIT.sql (job « delete » de l'app), puis la file de Nico remise en pause. Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos, attributs)
values (1793300100000, 'f44b5917-bccc-4431-ba41-f40571a2ed18',
  'TEST FillSell 999 ne pas acheter - Jazz man boutons', null, true, null, 'stock', now(), null,
  E'Texte tapé par Nico, à garder mot pour mot.\nBoutons de manchette « Jazz man », 2 cm, en bon état avec une petite trace.\n\nNe pas acheter : annonce de test retirée dans l''heure.',
  'Accessoires', 0, 0, 1,
  '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
  jsonb_build_object(
    'titre_source', jsonb_build_object('v', 'manuel', 'source', 'manuel', 'at', now()),
    'description_source', jsonb_build_object('v', 'manuel', 'source', 'manuel', 'at', now())));

select public.file_pause_basculer(false) as file_reprise;

select public.spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object(
  'inventaire_id', '1793300100000', 'platform', 'vinted',
  'title', 'TEST FillSell 999 ne pas acheter - Jazz man boutons',
  'description', E'Texte tapé par Nico, à garder mot pour mot.\nBoutons de manchette « Jazz man », 2 cm, en bon état avec une petite trace.\n\nNe pas acheter : annonce de test retirée dans l''heure.',
  'price', '999',
  'photos', '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
  'platform_fields', jsonb_build_object(
    'etat', 'Très bon état', 'marque', 'Sans marque', 'couleur', 'Argenté', 'colors', jsonb_build_array('Argenté'),
    'categoryPath', jsonb_build_array('Accessoires de mode', 'Bijoux', 'Boutons de manchette'),
    'vinted_ids', jsonb_build_object('catalog_id', 5564, 'status_id', 2),
    'categorie_source', 'choix_humain',
    'categorie_choisie', jsonb_build_object('id', '5564', 'le', now(), 'chemin', jsonb_build_array('Accessoires de mode', 'Bijoux', 'Boutons de manchette')),
    'packageSize', 'Petit', 'packageSizeId', 1, 'colis_source', 'manuel',
    'test_nico', 'lot B 29/10 : le texte du vendeur arrive mot pour mot'
  )
))) as publication;

select left(id::text, 8) as job, platform, status, created_at at time zone 'Europe/Paris' as cree
from public.cross_post_jobs where inventaire_id = 1793300100000;
commit;
