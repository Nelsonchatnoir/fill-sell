-- Inverse de 20261003_louis_lbc_prix_7_adaptateurs.sql : annule la tâche de
-- correction TANT QU'ELLE N'A RIEN RETIRÉ (a_capturer ou captured).
begin;
update public.cross_post_jobs
set status = 'cancelled', error = 'Correction de prix annulée (inverse) — rien n''a été retiré.'
where platform_fields->'correction_prix'->>'pose_par' = 'scripts/reparations/20261003_louis_lbc_prix_7_adaptateurs.sql'
  and status in ('pending', 'needs_user')
  and coalesce(platform_fields->>'republish_step', 'a_capturer') in ('a_capturer', 'captured');
commit;
