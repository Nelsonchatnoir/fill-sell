-- TEST RÉEL (03/10 nuit, compte de Nico uniquement) — fiche SANS marque pour
-- le parcours « marque tapée dans le stepper » (test d2 / b / c du chantier
-- « marque Vinted »). Photos réutilisées de sa peinture 1790285884191.
-- Inverse : 20261003_test_marque_libre_nico_INVERSE.sql (supprime la fiche).
insert into public.inventaire (id, user_id, titre, marque, type, description, prix_vente, prix_achat, prix_achat_inconnu, statut, date, purchase_costs, selling_fees, quantite, photos)
select 1791060000000, i.user_id, 'Tableau paysage verger fleuri (test FillSell)', null, 'Maison',
       'Peinture à l''huile sur toile, paysage de verger en fleurs, cadre doré. Annonce de test FillSell, retirée aussitôt.',
       45, null, true, 'stock', now(), 0, 0, 1, i.photos
from public.inventaire i where i.id = 1790285884191
  and not exists (select 1 from public.inventaire where id = 1791060000000);
select id, titre, marque from public.inventaire where id = 1791060000000;
