-- ═══════════════════════════════════════════════════════════════════════════
-- MESURE « QUESTION MARQUE » PAR ARTICLE PUBLIÉ — rejouable, lecture seule
-- (point 10, 11/10/2026). Réglages : CTE « params » (début, maille 'week'|'day').
--
-- Ce que le journal permet (usage_logs, feature champ_requis_bloquant) :
--   · une ligne « affiche » est écrite quand un champ bloquant APPARAÎT dans
--     l'écran Publier du stepper (ListingPreviewScreen.jsx:8717-8782), UNE fois
--     par clé et par montage de l'écran ; la même question « Marque » y laisse
--     PLUSIEURS lignes : une « générique » (rayon Vinted synthétique
--     vinted_marque_exigee, rayon Beebs/LBC, aspect eBay) + une « partage »
--     PAR plateforme nommée. Donc lignes ≠ affichages.
--   · le lot monte le même écran sans l'afficher (pilote) : ses lignes
--     naissent et se complètent dans la même seconde → comptées à part.
--   · avant le 03/10, aucune ligne « partage » ; avant le 10/10 (OTA 2.9.77),
--     les lignes génériques ne portaient pas l'article (rattachées ici à la
--     ligne « partage » du même compte à ±5 s quand elle existe).
-- Définitions :
--   affichage   = lignes « affiche » Marque d'un même compte et d'un même
--                 article à ≤ 5 s d'écart = UNE apparition de la question.
--   humain      = affichage dont la complétion arrive ≥ 1 s après (ou jamais) ;
--   auto        = complétée en < 1 s (remplie par le moteur, jamais vue).
--   serveur     = questions Marque posées en « À régler » (needs_user) : entrées
--                 archivées au « ✋ Compléter » (erreurs_archivees, statut
--                 needs_user, texte « marque ») + needs_user Marque en cours.
--   articles publiés = articles distincts ayant ≥ 1 tâche publish créée par
--                 l'app (platform_fields ? 'categorie_source' — exclut les
--                 relevés/imports « sync-dressing ») ; stepper = sans lot.
--   CIBLE après correction : la question ne reste que pour une marque de la
--                 fiche absente du catalogue ; 1 au plus par article.
-- ═══════════════════════════════════════════════════════════════════════════
with params as (select timestamptz '2026-09-18 00:00 Europe/Paris' as debut, 'week'::text as maille),
excluded as (
  select u.id from auth.users u
  where lower(u.email) in (select unnest(array[
    'hoosslocal@gmail.com','test@fillsell.app','nicotest@mail.fr','fstesteur@proton.me',
    'cwsblrtest@gmail.com','pod1cws@gmail.com','nicolas.svobodny@gmail.com']))
     or u.email ilike '%@fillsell.app'
),
brut as (
  select l.user_id, l.created_at, l.metadata->>'issue' as issue,
         nullif(l.metadata->>'inventaire_id','')::bigint as inv
  from public.usage_logs l, params p
  where l.feature = 'champ_requis_bloquant' and l.created_at >= p.debut
    and l.metadata->>'issue' in ('affiche','complete')
    and (l.metadata->>'partage' = 'marque' or l.metadata->'champs' ?| array['Marque','Brand'])
    and l.user_id not in (select id from excluded)
),
lignes as (
  select a.*, coalesce(a.inv, (select b.inv from brut b where b.user_id = a.user_id and b.inv is not null
                                 and b.issue = a.issue and abs(extract(epoch from b.created_at - a.created_at)) <= 5
                               order by abs(extract(epoch from b.created_at - a.created_at)) limit 1)) as inv2
  from brut a
),
aff as (
  select *, case when lag(created_at) over (partition by user_id, inv2 order by created_at) >= created_at - interval '5 seconds'
                 then 0 else 1 end as nouveau
  from lignes where issue = 'affiche'
),
aff_num as (select *, sum(nouveau) over (partition by user_id, inv2 order by created_at) as num from aff),
episodes0 as (
  select user_id, inv2, num, min(created_at) as debut, count(*) as nb_lignes
  from aff_num group by 1,2,3
),
episodes as (
  select e.*,
         (select min(c.created_at) from lignes c where c.issue = 'complete' and c.user_id = e.user_id
            and c.inv2 is not distinct from e.inv2 and c.created_at >= e.debut) as complete_le,
         exists (select 1 from public.cross_post_jobs j where j.inventaire_id = e.inv2 and j.bulk_batch_id is not null) as en_lot
  from episodes0 e
),
ep as (
  select date_trunc((select maille from params), debut at time zone 'Europe/Paris')::date as periode, *,
         (complete_le is not null and complete_le < debut + interval '1 second') as auto
  from episodes
),
stepper as (
  select periode,
         sum(nb_lignes) as lignes_journal,
         count(*) filter (where not en_lot and not auto) as affichages_humains,
         count(*) filter (where not en_lot and auto) as affichages_auto,
         count(*) filter (where en_lot) as affichages_lot,
         count(distinct (user_id, inv2)) filter (where not en_lot and not auto and inv2 is not null) as articles_questionnes
  from ep group by 1
),
serveur as (
  select date_trunc((select maille from params), coalesce((e->>'le')::timestamptz, j.created_at) at time zone 'Europe/Paris')::date as periode, count(*) as n
  from public.cross_post_jobs j, params p,
       jsonb_array_elements(case when jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array'
                                 then j.platform_fields->'erreurs_archivees' else '[]'::jsonb end) e
  where j.created_at >= p.debut - interval '30 days' and coalesce((e->>'le')::timestamptz, j.created_at) >= p.debut
    and e->>'statut' = 'needs_user' and e->>'erreur' ilike '%marque%'
    and j.user_id not in (select id from excluded)
  group by 1
  union all
  select date_trunc((select maille from params), j.created_at at time zone 'Europe/Paris')::date, count(*)
  from public.cross_post_jobs j, params p
  where j.created_at >= p.debut and j.status = 'needs_user'
    and (lower(j.platform_fields->'needsUserField'->>'field_key') in ('brand','marque')
         or j.platform_fields->'needsUserField'->>'field_label' = 'Marque')
    and j.user_id not in (select id from excluded)
  group by 1
),
serveur_p as (select periode, sum(n) as questions_serveur from serveur group by 1),
publies as (
  select date_trunc((select maille from params), j.created_at at time zone 'Europe/Paris')::date as periode,
         count(distinct j.inventaire_id) filter (where j.bulk_batch_id is null) as articles_stepper,
         count(distinct j.inventaire_id) filter (where j.bulk_batch_id is null and j.platform = 'vinted') as articles_stepper_vinted,
         count(distinct j.inventaire_id) filter (where j.bulk_batch_id is not null) as articles_lot
  from public.cross_post_jobs j, params p
  where j.created_at >= p.debut and j.action = 'publish' and j.platform_fields ? 'categorie_source'
    and j.inventaire_id is not null and j.user_id not in (select id from excluded)
  group by 1
)
select pu.periode, pu.articles_stepper, pu.articles_stepper_vinted, pu.articles_lot,
       coalesce(s.lignes_journal,0) as lignes_journal,
       coalesce(s.affichages_humains,0) as affichages_humains,
       coalesce(s.affichages_auto,0) as affichages_auto_moins_1s,
       coalesce(s.affichages_lot,0) as affichages_lot,
       coalesce(s.articles_questionnes,0) as articles_questionnes,
       coalesce(sv.questions_serveur,0) as questions_serveur,
       round((coalesce(s.affichages_humains,0) + coalesce(sv.questions_serveur,0))::numeric / nullif(pu.articles_stepper,0), 3) as questions_par_article_publie,
       round(coalesce(s.affichages_humains,0)::numeric / nullif(s.articles_questionnes,0), 2) as affichages_par_article_questionne,
       round(100.0 * coalesce(s.articles_questionnes,0) / nullif(pu.articles_stepper,0), 1) as pct_articles_questionnes
from publies pu
left join stepper s using (periode)
left join serveur_p sv using (periode)
order by 1;
