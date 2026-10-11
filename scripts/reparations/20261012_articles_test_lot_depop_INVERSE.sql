-- Inverse de 20261012_articles_test_lot_depop.sql : retire les 21 fiches de
-- TEST (B4). ⛔ À lancer seulement quand AUCUNE de leurs annonces n'est plus en
-- ligne (retraits Depop aboutis) et qu'aucun de leurs jobs n'est en file.
select i.id, i.titre,
       (select count(*) from public.cross_post_jobs j where j.inventaire_id = i.id and j.status in ('pending','processing','needs_user')) as jobs_en_file,
       (select count(*) from public.cross_post_jobs j where j.inventaire_id = i.id and j.action = 'publish' and j.status = 'published'
          and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = i.id and d.platform = j.platform and d.action = 'delete' and d.status = 'deleted' and d.created_at > j.created_at)) as annonces_encore_en_ligne
from public.inventaire i
where i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and i.id between 1791800000001 and 1791800000021;
-- puis, si tout est à 0 :
-- delete from public.inventaire where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and id between 1791800000001 and 1791800000021 and titre like 'TEST FillSell ne pas acheter - T-shirt homme blanc taille M n°%';
