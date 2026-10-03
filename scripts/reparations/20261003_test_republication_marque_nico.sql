-- TEST RÉEL (03/10 nuit, compte de Nico) — republication : la marque de
-- l'annonce est conservée. Fiche de TEST à 999 € (règle de Nico : toute
-- annonce de test à un prix dissuasif), photos réutilisées du jogging Primark
-- 1791021432548 (sa fiche n'est pas touchée). Inverse : _INVERSE.sql.
insert into public.inventaire (id, user_id, titre, marque, type, description, prix_vente, prix_achat, prix_achat_inconnu, statut, date, purchase_costs, selling_fees, quantite, photos, attributs)
select 1791061000000, i.user_id, 'Jogging Primark Disney vert XS (test FillSell, ne pas acheter)', 'Primark', 'Mode',
       'Annonce de TEST FillSell, retirée aussitôt — ne pas acheter.', 999, null, true, 'stock', now(), 0, 0, 1, i.photos,
       jsonb_build_object('taille', jsonb_build_object('v', 'XS', 'source', 'manuel', 'at', now()))
from public.inventaire i where i.id = 1791021432548
  and not exists (select 1 from public.inventaire where id = 1791061000000);
select id, titre, marque, prix_vente from public.inventaire where id = 1791061000000;

-- (après le test) retrait de l'annonce de test republiée 10232217100 — tâche « delete » du chemin normal :
-- insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
-- select user_id, inventaire_id, 'vinted', 'delete', 'pending', 'original', title, listing_url, '{}'::jsonb
-- from public.cross_post_jobs where id = 'c7bacaed-2114-4a0e-9d6a-0863190672ab' and status = 'published';
