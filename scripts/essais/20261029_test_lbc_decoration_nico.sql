-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- TEST RÉEL LEBONCOIN « DÉCORATION » SUR LE COMPTE DE NICO (29/10/2026 soir, point 8 — paugues.contact, « Valider et payer »)
--   npx supabase db query --linked -f scripts/essais/20261029_test_lbc_decoration_nico.sql
-- Même rayon (Maison & Jardin > Décoration) et mêmes critères que ses dépôts réussis (Tableau et toile, Décoration murale, Très
-- bon état, 500 g à 1 kg) : un compte PARTICULIER doit y trouver « Déposer sans booster ». 999 €, gestes de l'app sous les claims
-- de Nico. Retrait : …_decoration_nico_RETRAIT.sql ; la file remise en pause ensuite. Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos)
values (1793287500000, 'f44b5917-bccc-4431-ba41-f40571a2ed18',
  'TEST FillSell 999 ne pas acheter - tableau acrylique sur toile', null, true, null, 'stock', now(), 'Sans marque',
  'Annonce de test FillSell (dépôt Leboncoin en Maison & Jardin › Décoration, cas paugues.contact). Ne pas acheter : elle est retirée dans l''heure.',
  'Maison', 0, 0, 1,
  '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb);

select public.file_pause_basculer(false) as file_reprise;

select public.spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object(
  'inventaire_id', '1793287500000', 'platform', 'leboncoin',
  'title', 'TEST FillSell 999 ne pas acheter - tableau acrylique sur toile',
  'description', 'Annonce de test FillSell (dépôt Leboncoin en Maison & Jardin › Décoration, cas paugues.contact). Ne pas acheter : elle est retirée dans l''heure.',
  'price', '999',
  'photos', '[{"type":"original","url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/rapatrie-fiche/1793009594578/1793009703834_0.jpg"}]'::jsonb,
  'platform_fields', jsonb_build_object(
    'etat', 'Très bon état', 'marque', 'Sans marque', 'couleur', 'Multicolore', 'matiere', 'Acrylique',
    'adresse', (select p.platform_settings->'leboncoin'->>'adresse' from public.profiles p where p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
    'lbcAspects', jsonb_build_object('condition', 'Très bon état', 'decoration_type', 'Tableau et toile', 'house_and_garden_type', 'Décoration murale',
      'estimated_parcel_weight', 'De 500 g à 1 kg'),
    'lbcCategoryPath', jsonb_build_array('Maison & Jardin', 'Décoration'), 'lbcPoidsGrammes', 600,
    'categorie_source', 'choix_humain',
    'categorie_choisie', jsonb_build_object('id', null, 'le', now(), 'chemin', jsonb_build_array('Maison & Jardin', 'Décoration')),
    'test_nico', 'lot A 29/10 point 8 : même rayon et mêmes critères que les tableaux de paugues.contact (Acrylique B. Dufour, 25/10)'
  )
))) as publication;

select left(id::text, 8) as job, platform, status, created_at at time zone 'Europe/Paris' as cree
from public.cross_post_jobs where inventaire_id = 1793287500000;
commit;
