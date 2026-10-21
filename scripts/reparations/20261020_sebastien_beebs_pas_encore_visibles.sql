-- 20/10 soir — Sébastien (Pro) : 13 dépôts Beebs du 20/10 (09:10 → 11:13) jamais vus en ligne — ni par un relevé
-- Beebs (ni « en ligne », ni « en vérification »), ni par la veille — portaient la question « Annonces plus en
-- ligne — Vendue ? » (9 posées, 4 en attente de la 2e lecture). Leur page publique répond 404 ; Beebs les a vues
-- naître (preuve du dépôt « avant/après » dans « En cours de vérification », 09:10 → 11:13) puis ne les a jamais
-- montrées. Un « Oui » écrivait une fausse vente et retirait ses vraies annonces ailleurs.
-- La RÈGLE (migration 20261020220000, appliquée AVANT ce script) : un dépôt jamais vu en ligne ne pose jamais la
-- question ; il reste « pas encore visible » (marqueur pas_encore_visible, « Beebs vérifie ton annonce ») et devient
-- un échec de publication 72 h après le dépôt s'il n'est toujours ni en ligne ni en vérification. Ce script rend
-- aux 13 l'état que la règle leur aurait donné : drapeaux « plus en ligne » retirés, marqueur posé. AUCUNE vente,
-- aucun retrait, aucun mail, aucun push ; le stock ne bouge pas.
-- Ordre de Nico (20/10 soir) : « nettoie les alertes actuelles de Sébastien, sans enregistrer de vente ni lancer de
-- retrait ». Sauvegarde _backup_2010_sebastien_beebs_jobs ; inverse : 20261020_sebastien_beebs_pas_encore_visibles_INVERSE.sql.
begin;
create temp table _j as
  select j.id, j.platform_fields
    from cross_post_jobs j
   where j.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and j.platform = 'beebs'
     and j.status = 'published' and j.action = 'publish'
     and (j.platform_fields ? 'unavailable_since' or j.platform_fields ? 'unavailable_pending_since')
     and coalesce(j.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable'
     and public.job_jamais_vu_en_ligne(j.id, j.user_id, j.platform, j.vu_en_ligne_le, j.platform_listing_id, j.listing_url, j.platform_fields);
do $g$ begin
  -- 13 au 20/10 soir ; le 21/10, 6 dépôts de plus (07:17 → 09:02) jamais vus, en 1re lecture : mêmes alertes, même règle.
  if (select count(*) from _j) < 13 then raise exception 'attendu au moins 13 dépôts Beebs jamais vus en alerte, trouvé % — réparation arrêtée', (select count(*) from _j); end if;
  if to_regprocedure('public.cross_post_jobs_vue_ou_pas_encore_visible()') is null then raise exception 'la règle 20261020220000 n''est pas appliquée — réparation arrêtée'; end if;
end $g$;
create table public._backup_2010_sebastien_beebs_jobs as
  select j.id, j.platform_fields, now() as sauve_le from cross_post_jobs j where j.id in (select id from _j);
update cross_post_jobs j set
  platform_fields = (j.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since'])
    || jsonb_build_object('pas_encore_visible', jsonb_build_object(
         'depuis', to_jsonb(coalesce(j.published_at, j.created_at)),
         'lectures', 1, 'derniere', now(), 'regle', 'jamais_vue_en_ligne_2010', 'par', 'reparation_2010_sebastien'))
 where j.id in (select id from _j);
select (select count(*) from _backup_2010_sebastien_beebs_jobs) sauvegardes,
       (select count(*) from cross_post_jobs where id in (select id from _j) and platform_fields ? 'pas_encore_visible'
          and not (platform_fields ? 'unavailable_since') and not (platform_fields ? 'unavailable_pending_since')
          and platform_fields ->> 'sale_signal' is null and status = 'published') reparees,
       (select count(*) from ventes where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and created_at >= now()) ventes_creees,
       (select count(*) from cross_post_jobs where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and action = 'delete' and created_at >= now()) retraits_crees,
       (select count(*) from push_ventes where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and cree_le >= now()) push_crees,
       (select count(*) from cross_post_jobs where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'beebs'
          and status = 'published' and platform_fields ? 'unavailable_since') alertes_beebs_restantes;
commit;
