-- (06/10) Rattrapage : les ventes passées dont une copie ENCORE EN LIGNE n'est
-- liée que par le titre reçoivent la question « Déjà vendu ? » (une par copie),
-- par la même fonction que les ventes à venir. Rien n'est retiré ici.
-- Inverse : 20261006_questions_copies_non_prouvees_INVERSE.sql
select count(*) as fiches, sum(public.poser_questions_copies_non_prouvees(f.id, null, null, 'rattrapage_0610')) as questions
  from (select distinct i.id
          from public.inventaire i
          join public.cross_post_jobs j on j.inventaire_id = i.id and j.user_id = i.user_id
         where i.statut = 'vendu' and i.fusionne_dans is null
           and j.status = 'published' and coalesce(j.action, 'publish') in ('publish', 'republish')
           and not public.retrait_job_prouve(j.id)) f;
