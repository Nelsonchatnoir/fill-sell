-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- TEST RÉEL LEBONCOIN « MARQUE PAR RECHERCHE » SUR LE COMPTE DE NICO (29/10/2026 soir, lot B 4.4 — boncoin59300)
--   npx supabase db query --linked -f scripts/essais/20261029_test_lbc_marque_nico.sql
-- Avec l'extension 0.6.156 posée sur le poste de Nico. Cas de l'Air Jordan de boncoin59300 : le titre dit « Nike »,
-- Leboncoin pré-remplit « Nike », la marque de l'article est « Jordan » (présente dans la liste Leboncoin). Attendu :
-- « Jordan » TAPÉ et posé (decisionMarqueRechercheLbc), jamais « hors liste » sans recherche relue. Mode > Vêtements,
-- 999 €, gestes de l'app sous les claims de Nico ; sa file est reprise le temps du test. Retrait : …_RETRAIT.sql
-- (job « delete » de l'app), puis la file remise en pause (…_texte_vendeur_vinted_nico_FIN.sql). Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos)
values (1793300200000, 'f44b5917-bccc-4431-ba41-f40571a2ed18',
  'TEST FillSell 999 ne pas acheter - sweat Nike Jordan taille M', null, true, null, 'stock', now(), 'Jordan',
  'Annonce de test FillSell (la marque Jordan posée par la recherche, pas le pré-rempli Nike de Leboncoin). Ne pas acheter : elle est retirée dans l''heure.',
  'Mode', 0, 0, 1,
  '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb);

select public.file_pause_basculer(false) as file_reprise;

select public.spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object(
  'inventaire_id', '1793300200000', 'platform', 'leboncoin',
  'title', 'TEST FillSell 999 ne pas acheter - sweat Nike Jordan taille M',
  'description', 'Annonce de test FillSell (la marque Jordan posée par la recherche, pas le pré-rempli Nike de Leboncoin). Ne pas acheter : elle est retirée dans l''heure.',
  'price', '999',
  'photos', '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
  'platform_fields', jsonb_build_object(
    'etat', 'Bon état', 'marque', 'Jordan', 'taille', '38 - M', 'couleur', 'Bleu / Ciel', 'colors', jsonb_build_array('Bleu / Ciel'),
    'matiere', 'Coton', 'univers', 'Femme',
    'adresse', (select p.platform_settings->'leboncoin'->>'adresse' from public.profiles p where p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
    'lbcAspects', jsonb_build_object('condition', 'Bon état', 'estimated_parcel_weight', 'De 500 g à 1 kg'),
    'lbcCategoryPath', jsonb_build_array('Mode', 'Vêtements'), 'lbcPoidsGrammes', 700,
    'format_colis', 'Petit', 'format_colis_source', 'manuel',
    'lbcTransporteurs', jsonb_build_array('Shop2Shop by Chronopost', 'Mondial Relay', 'Colissimo'),
    'categorie_source', 'choix_humain',
    'categorie_choisie', jsonb_build_object('id', null, 'le', now(), 'chemin', jsonb_build_array('Mode', 'Vêtements')),
    'test_nico', 'lot B 29/10 : marque par recherche (cas boncoin59300, Air Jordan)'
  )
))) as publication;

select left(id::text, 8) as job, platform, status, created_at at time zone 'Europe/Paris' as cree
from public.cross_post_jobs where inventaire_id = 1793300200000;
commit;
