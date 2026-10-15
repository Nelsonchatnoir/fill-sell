-- Inverse de 20261015_cloture_rouge_soir.sql : rend aux jobs sauvegardés leur
-- statut, leur erreur et leurs champs d'avant la réparation.
begin;
update public.cross_post_jobs j
   set status = b.status, error = b.error, platform_fields = b.platform_fields
  from public._backup_1510_cloture_rouge_jobs b
 where b.id = j.id;
commit;
