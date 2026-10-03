-- TABLEAU DE NICO (fiche 1790285884191) — FICHE COHÉRENTE (03/10 nuit)
-- L'annonce de test 10231930752 (achetée à 45 €, vente annulée par Nico) est
-- hors ligne ; aucune vente, aucune tâche ouverte, JAMAIS republiée. La fiche
-- portait encore vinted_item_id = 10124325302, une annonce du 24/09 RETIRÉE
-- par FillSell (tâche 8c60ae5c « deleted ») : un lien vers une annonce qui
-- n'existe plus. On l'efface — rien d'autre ne change (stock, 45 €, photos).
-- Inverse : update public.inventaire set vinted_item_id = '10124325302' where id = 1790285884191;
update public.inventaire set vinted_item_id = null
where id = 1790285884191 and vinted_item_id = '10124325302'
  and not exists (select 1 from public.cross_post_jobs j where j.inventaire_id = 1790285884191 and j.status in ('pending','processing','needs_user','published'))
returning id, statut, prix_vente, vinted_item_id;
