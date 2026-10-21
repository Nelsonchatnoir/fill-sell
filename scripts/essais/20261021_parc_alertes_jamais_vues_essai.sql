-- Essai à blanc de 20261021_parc_alertes_jamais_vues_recentes (+ inverse) : ROLLBACK.
begin;
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- 21/10 ≈ 22:40 — Le parc (hors Sébastien, réparé par 20261020_sebastien_beebs_pas_encore_visibles.sql) : les alertes
-- « Annonces plus en ligne — Vendue ? » posées, ou en attente de leur 2e lecture, sur des dépôts des 14 derniers jours
-- JAMAIS vus en ligne (ni la veille, ni un relevé de leur compte). 35 le 20/10 soir, 39 au 21/10 22:40 (Beebs 31 sur 6
-- comptes, eBay 4 sur 1, Leboncoin 4 sur 3). La RÈGLE (migration 20261020220000, appliquée le 21/10 à 22:37) : un dépôt
-- jamais vu en ligne ne pose jamais la question ; il reste « pas encore visible » et devient un échec de publication
-- après la grâce (72 h Beebs, 4 h ailleurs) s'il n'apparaît toujours pas. Ce script leur donne l'état de la règle :
-- drapeaux retirés, marqueur posé. AUCUNE vente, aucun retrait, aucun mail, aucun push ; le stock ne bouge pas.
-- Les alertes de plus de 14 jours (75) restent telles quelles (décision de Nico, 21/10).
-- Ordre de Nico (21/10) : « nettoie les 35 alertes récentes « jamais vues » par le même circuit ».
-- Sauvegarde _backup_2110_parc_jamais_vues_jobs ; inverse : 20261021_parc_alertes_jamais_vues_recentes_INVERSE.sql.
create temp table _j as
  select j.id, j.user_id, j.platform, j.platform_fields
    from cross_post_jobs j
   where j.user_id <> '48dd94f7-3105-49a7-af54-24d9c479a980'
     and j.platform <> 'vinted' and j.status = 'published' and j.action = 'publish' and j.inventaire_id is not null
     and coalesce(j.published_at, j.created_at) > now() - interval '14 days'
     and (j.platform_fields ? 'unavailable_since' or j.platform_fields ? 'unavailable_pending_since')
     and coalesce(j.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable'
     and public.job_jamais_vu_en_ligne(j.id, j.user_id, j.platform, j.vu_en_ligne_le, j.platform_listing_id, j.listing_url, j.platform_fields);
do $g$ begin
  if (select count(*) from _j) not between 30 and 60 then raise exception 'attendu 30 à 60 alertes récentes jamais vues, trouvé % — réparation arrêtée', (select count(*) from _j); end if;
  if to_regprocedure('public.cross_post_jobs_vue_ou_pas_encore_visible()') is null then raise exception 'la règle 20261020220000 n''est pas appliquée — réparation arrêtée'; end if;
end $g$;
create table public._backup_2110_parc_jamais_vues_jobs as
  select j.id, j.user_id, j.platform, j.platform_fields, now() as sauve_le from cross_post_jobs j where j.id in (select id from _j);
update cross_post_jobs j set
  platform_fields = (j.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since'])
    || jsonb_build_object('pas_encore_visible', jsonb_build_object(
         'depuis', to_jsonb(coalesce(j.published_at, j.created_at)),
         'lectures', 1, 'derniere', now(), 'regle', 'jamais_vue_en_ligne_2010', 'par', 'reparation_2110_parc'))
 where j.id in (select id from _j);
insert into _r select 'R3', true, row_to_json(x)::text from (select (select count(*) from _backup_2110_parc_jamais_vues_jobs) sauvegardes,
       (select count(distinct user_id) from _j) comptes,
       (select json_object_agg(platform, n) from (select platform, count(*) n from _j group by 1) x) par_plateforme,
       (select count(*) from cross_post_jobs where id in (select id from _j) and platform_fields ? 'pas_encore_visible'
          and not (platform_fields ? 'unavailable_since') and not (platform_fields ? 'unavailable_pending_since')
          and platform_fields ->> 'sale_signal' is null and status = 'published') reparees,
       (select count(*) from ventes where user_id in (select user_id from _j) and created_at >= now()) ventes_creees,
       (select count(*) from cross_post_jobs where user_id in (select user_id from _j) and action = 'delete' and created_at >= now()) retraits_crees,
       (select count(*) from push_ventes where user_id in (select user_id from _j) and cree_le >= now()) push_crees) x;

-- INVERSE de 20261021_parc_alertes_jamais_vues_recentes.sql : rend aux dépôts leurs platform_fields d'avant (sauvegarde
-- _backup_2110_parc_jamais_vues_jobs), pour les seuls jobs encore 'published'. La règle (déclencheur
-- cross_post_jobs_vue_ou_pas_encore_visible) remplacerait aussitôt les drapeaux rendus : la restauration passe par sa
-- porte (fillsell.restauration, cette transaction seulement).
set local fillsell.restauration = 'on';
update cross_post_jobs j set platform_fields = b.platform_fields
  from public._backup_2110_parc_jamais_vues_jobs b
 where j.id = b.id and j.status = 'published';
insert into _r select 'R3 inverse', true, row_to_json(x)::text from (select count(*) restaures from cross_post_jobs j join public._backup_2110_parc_jamais_vues_jobs b on b.id = j.id
 where j.platform_fields = b.platform_fields) x;

select essai, left(detail, 500) detail from _r order by essai;
rollback;
