-- (18/10, eBay ÷ 5) Les questions eBay de l'écran Publier sur une semaine, avec tout ce qu'il faut pour les
-- rejouer SANS IA (lecture seule). Une ligne = une ligne « affiche » de champ_requis_bloquant.
-- Bornes remplacées par rejeu-ebay.mjs : {{DEBUT}} et {{FIN}} (heure de Paris).
--   issue      : la suite de la question dans les 2 h (mêmes règles que questions_publication_bilan :
--                personne = complete ≥ 20 s ou par=personne ; moteur = complete < 20 s ou par=moteur ;
--                abandon = abandonne / publie_sans_plateforme / bloque_au_clic / plateforme_decochee).
--   precalc_*  : la catégorie que le PRÉ-CALCUL a choisie (categorie_journal, dernier arbitrage « choisi »
--                avant l'affichage + 60 s, même titre), et son heure ; aucune_seule = la vérification a dit
--                « aucune » sans rien choisir (icône démentie).
--   job_*      : la première publication eBay de l'article après la question (catégorie qui est partie).
--   ia_valeurs : les réponses de l'IA (ebay_aspects_ia) pour cet article AVANT l'affichage (catégorie, valeurs).
with a as (
  select u.created_at, u.user_id, u.metadata->>'inventaire_id' inv, u.metadata->'champs'->>0 champ,
         u.metadata->>'categorie' cat, u.metadata->>'partage' partage, u.metadata->>'issue' issue,
         u.metadata->>'par' par, nullif(u.metadata->>'delai_s', '')::numeric delai_s
    from usage_logs u
   where u.feature = 'champ_requis_bloquant' and u.metadata->>'platform' = 'ebay'
     and u.created_at >= timestamptz '{{DEBUT}}' and u.created_at < timestamptz '{{FIN}}' + interval '2 hours'),
aff as (select * from a where issue = 'affiche' and created_at < timestamptz '{{FIN}}'),
s as (
  select aff.*, (select jsonb_build_object('issue', c.issue, 'par', c.par, 'd', coalesce(c.delai_s, extract(epoch from c.created_at - aff.created_at)))
                   from a c
                  where c.user_id = aff.user_id and c.inv is not distinct from aff.inv and c.champ = aff.champ
                    and c.issue <> 'affiche' and c.created_at >= aff.created_at and c.created_at < aff.created_at + interval '2 hours'
                  order by c.created_at limit 1) x
    from aff)
select (s.created_at at time zone 'Europe/Paris')::text t_paris, extract(epoch from s.created_at)::bigint t_epoch,
       s.user_id::text user_id, s.inv, s.champ, s.cat, s.partage,
       case when x->>'issue' in ('abandonne', 'publie_sans_plateforme', 'bloque_au_clic', 'plateforme_decochee') then 'abandon'
            when x->>'issue' = 'complete' and coalesce(x->>'par', case when (x->>'d')::numeric >= 20 then 'personne' else 'moteur' end) = 'personne' then 'personne'
            when x->>'issue' = 'complete' then 'moteur'
            when x->>'issue' = 'retiree' then 'retiree' else 'sans_suite' end issue,
       i.titre, left(i.description, 1500) description, i.marque, i.attributs->'categorie_vinted'->'chemin' chemin_vinted,
       coalesce(i.attributs->'famille'->>'v', i.attributs->>'famille') famille,
       (select coalesce(j.platform_fields->>'categorie_icone_ia', null) from cross_post_jobs j
         where j.inventaire_id = i.id and j.platform_fields->>'categorie_icone_ia' is not null order by j.created_at desc limit 1) icone_ia,
       pc.choisi_id precalc_id, pc.t precalc_t,
       (pc.choisi_id is null and exists (select 1 from categorie_journal cj
          where cj.user_id = s.user_id and cj.plateforme = 'ebay' and cj.etape = 'arbitrage' and cj.issue = 'aucune'
            and cj.created_at between s.created_at - interval '30 minutes' and s.created_at + interval '60 seconds'
            and left(cj.titre, 30) = left(i.titre, 30))) aucune_seule,
       jb.cat job_cat, jb.src job_source, jb.voie job_voie, jb.status job_status,
       exists (select 1 from cross_post_jobs v where v.user_id = s.user_id and v.platform = 'ebay' and v.voie = 'api'
                 and v.created_at between s.created_at - interval '7 days' and s.created_at + interval '7 days') compte_voie_api,
       (select jsonb_agg(jsonb_build_object('cat', l.metadata->>'categorie', 'valeurs', l.metadata->'valeurs', 'demandes', l.metadata->'demandes'))
          from usage_logs l
         where l.feature = 'ebay_aspects_ia' and l.user_id = s.user_id and l.metadata->>'inventaire_id' = s.inv
           and l.created_at between s.created_at - interval '2 hours' and s.created_at + interval '2 seconds') ia
  from s
  left join inventaire i on s.inv ~ '^[0-9]+$' and i.id = s.inv::bigint
  left join lateral (
    select cj.choisi_id, extract(epoch from cj.created_at)::bigint t from categorie_journal cj
     where cj.user_id = s.user_id and cj.plateforme = 'ebay' and cj.etape = 'arbitrage' and cj.issue = 'choisi' and cj.choisi_id is not null
       and cj.created_at between s.created_at - interval '30 minutes' and s.created_at + interval '60 seconds'
       and left(cj.titre, 30) = left(i.titre, 30)
     order by cj.created_at desc limit 1) pc on true
  left join lateral (
    select j.platform_fields->>'ebayCategoryId' cat, j.platform_fields->>'categorie_source' src, j.voie, j.status from cross_post_jobs j
     where s.inv ~ '^[0-9]+$' and j.inventaire_id = s.inv::bigint and j.platform = 'ebay' and j.action = 'publish'
       and j.created_at > s.created_at - interval '5 minutes'
     order by j.created_at limit 1) jb on true
 order by s.created_at;
