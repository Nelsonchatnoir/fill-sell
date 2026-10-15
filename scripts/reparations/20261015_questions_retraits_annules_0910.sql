-- ═══════════════════════════════════════════════════════════════════════════
-- (15/10, point 6 — trou à part) LES RETRAITS ANNULÉS LE 09/10 « RÉPONDS À
-- « DÉJÀ VENDU ? » » REÇOIVENT ENFIN LEUR QUESTION
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause (FAIT PROUVÉ) : le 09/10 à 17:46:47 Paris, la réparation de l'étape 2
-- du chantier « une annonce, une fiche » a annulé 5 retraits armés sur des
-- copies liées par une photo identique (marqueur platform_fields
-- .retrait_annule_photo_seule, même instant pour les 5), avec le message
-- « Réponds à « Déjà vendu ? » dans l'app », et posé les questions. Vers 18:30,
-- sur l'ordre de Nico (« TOUT annuler »), l'inverse a SUPPRIMÉ les questions
-- mais laissé les retraits annulés (choix du 09/10 : « aucune annonce supprimée,
-- rien réarmé »). Résultat : retrait annulé, question absente, copie en ligne
-- d'un article vendu, en silence. Aucune fonction en prod n'annule un retrait
-- de cette façon (lu le 15/10 : pg_proc, rien) : c'était un geste ponctuel,
-- pas une règle — rien à corriger dans le code, la réparation suit.
-- Règle appliquée ici : la question promise est posée (« Déjà vendu ? »,
-- motif copie_non_prouvee, une par copie) ; « Oui » arme le retrait
-- (inventaire_doublon_decider → armer_retrait_job_pour, preuve par le geste),
-- « Non » la laisse en ligne. JAMAIS un retrait d'office ici.
-- Seulement si : la copie est toujours 'published' et son annonce vue « en
-- ligne » (ni disparue, ni retirée) ; la fiche est vendue ; aucune question n'a
-- jamais existé pour ce job ; aucun retrait vivant sur cette plateforme.
-- Attendu au 15/10 : 3 questions (18218224 Beebs 20230775 ; 82e64f14 eBay
-- 237116023942 ; 6f41de45 Leboncoin 3094720044). Écartés : cdf7007c Leboncoin
-- 3282411109 et 6f41de45 Leboncoin 3107028468 (annonces « inconnu » : plus
-- actives chez Leboncoin, P18).
-- 0 mail, 0 notification : une question n'en envoie aucun.
-- Inverse : 20261015_questions_retraits_annules_0910_INVERSE.sql (même dossier).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public._backup_1510_questions_retraits_0910 (
  doublon_id uuid primary key, user_id uuid, job uuid, retrait_annule uuid, pose_le timestamptz default now());

with cibles as (
  select d.id as retrait_annule, d.user_id, d.inventaire_id, j.id as job, j.platform,
         j.title, j.listing_url, j.platform_fields -> 'rattachement' as rattachement,
         ap.id as annonce_id, ap.url, ap.titre, i.titre as titre_fiche, i.plateforme as pf_fiche
    from public.cross_post_jobs d
    join public.cross_post_jobs j on j.id = (d.platform_fields #>> '{retrait_annule_photo_seule,depot}')::uuid
     and j.user_id = d.user_id and j.inventaire_id = d.inventaire_id
     and j.status = 'published' and coalesce(j.action, 'publish') in ('publish', 'republish')
    join public.inventaire i on i.id = d.inventaire_id and i.user_id = d.user_id
     and i.fusionne_dans is null and (i.statut = 'vendu' or coalesce(i.quantite, 1) <= 0)
    join lateral (select a.id, a.url, a.titre from public.annonces_plateforme a
                   where a.job_id = j.id and a.user_id = j.user_id and a.statut_plateforme = 'en_ligne'
                     and a.disparu_le is null and a.retiree_le is null
                   order by a.vu_le desc nulls last limit 1) ap on true
   where d.action = 'delete' and d.status = 'cancelled'
     and d.platform_fields ? 'retrait_annule_photo_seule'
     and not exists (select 1 from public.inventaire_doublons q
                      where q.user_id = d.user_id and q.preuves ->> 'job' = j.id::text)
     and not exists (select 1 from public.cross_post_jobs x
                      where x.user_id = d.user_id and x.inventaire_id = d.inventaire_id and x.platform = j.platform
                        and x.action = 'delete' and x.status in ('pending', 'processing', 'needs_user'))
),
poses as (
  insert into public.inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  select c.user_id, c.inventaire_id, c.inventaire_id, 'probable', 'proposee', 'copie_non_prouvee',
         jsonb_build_object(
           'job', c.job, 'annonce_id', c.annonce_id, 'platform', c.platform,
           'url', coalesce(nullif(btrim(coalesce(c.url, '')), ''), nullif(btrim(coalesce(c.listing_url, '')), '')),
           'titre', coalesce(nullif(btrim(coalesce(c.titre, '')), ''), nullif(btrim(coalesce(c.title, '')), ''), c.titre_fiche),
           'vendu_sur', (select lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''))) from public.ventes v
                          where v.user_id = c.user_id and v.inventaire_id = c.inventaire_id
                          order by v.created_at desc limit 1),
           'rattachement', c.rattachement,
           'retrait_annule_0910', c.retrait_annule),
         'reparation_1510:retrait_annule_0910_sans_question'
    from cibles c
  on conflict do nothing
  returning id, user_id, (preuves ->> 'job')::uuid as job, (preuves ->> 'retrait_annule_0910')::uuid as retrait_annule
)
insert into public._backup_1510_questions_retraits_0910 (doublon_id, user_id, job, retrait_annule)
select id, user_id, job, retrait_annule from poses;

select left(b.user_id::text, 8) as compte, j.platform, j.platform_listing_id, b.doublon_id
  from public._backup_1510_questions_retraits_0910 b join public.cross_post_jobs j on j.id = b.job
 order by 1, 2;
-- Attendu : 3 lignes. Sinon : rollback.
commit;
