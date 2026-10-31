-- LOT H (31/10) — LECTURE SEULE : la date de mise en ligne par plateforme calculée par la règle SQL de l'éligibilité à
-- la republication automatique (republish_planifiee_candidats, expression « mise_en_ligne » recopiée de
-- pg_get_functiondef en production le 31/10, filtres d'âge et de photos ôtés), sur le stock de XEWER (de63ca45), avec
-- les données brutes dont le Stock se sert. Comparée hors base au module _shared/mise-en-ligne.js
-- (scripts/lot-h-equivalence.mjs) : chaque (fiche, plateforme) doit donner la MÊME date. Aucune écriture.
with u as (select 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e'::uuid as id),
sql_dates as (
  select i.id as inv, pf.platform, d.mise_en_ligne
    from inventaire i
    cross join (values ('leboncoin'), ('beebs'), ('ebay'), ('depop'), ('opla')) pf(platform)
    join lateral (
      select coalesce(
               case when j.handler_build ~* '^releve-annonces' then (
                 select a.publiee_le from annonces_plateforme a
                  where a.user_id = i.user_id and a.platform = pf.platform
                    and a.listing_id = nullif(trim(j.platform_listing_id), '')
                    and a.publiee_le is not null
                    and a.publiee_le <= coalesce(j.published_at, j.created_at)
                  order by a.publiee_le asc limit 1) end,
               coalesce(j.published_at, j.created_at)) as mise_en_ligne
        from cross_post_jobs j
       where j.user_id = i.user_id and j.inventaire_id = i.id and j.platform = pf.platform
         and j.action in ('publish', 'republish') and j.status = 'published'
         and nullif(trim(j.listing_url), '') is not null
       order by coalesce(j.published_at, j.created_at) desc
       limit 1) d on true
   where i.user_id = (select id from u) and i.statut = 'stock' and i.disparu_le is null
)
select json_build_object(
  'sql', (select json_agg(json_build_object('inv', inv::text, 'platform', platform, 'date', mise_en_ligne)) from sql_dates),
  'items', (select json_agg(json_build_object('id', i.id::text, 'listed_at_guess', i.listed_at_guess, 'vinted_item_id', i.vinted_item_id))
              from inventaire i where i.user_id = (select id from u) and i.statut = 'stock' and i.disparu_le is null),
  'jobs', (select json_agg(json_build_object('inventaire_id', j.inventaire_id::text, 'platform', j.platform, 'action', j.action,
              'status', j.status, 'published_at', j.published_at, 'created_at', j.created_at, 'listing_url', j.listing_url,
              'platform_listing_id', j.platform_listing_id, 'handler_build', j.handler_build))
             from cross_post_jobs j where j.user_id = (select id from u) and j.inventaire_id in
               (select i.id from inventaire i where i.user_id = (select id from u) and i.statut = 'stock' and i.disparu_le is null)),
  'releves', (select json_agg(json_build_object('platform', a.platform, 'listing_id', a.listing_id, 'publiee_le', a.publiee_le))
                from annonces_plateforme a where a.user_id = (select id from u) and a.publiee_le is not null)
) as donnees;
