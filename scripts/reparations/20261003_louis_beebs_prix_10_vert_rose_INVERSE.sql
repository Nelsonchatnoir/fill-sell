-- Inverse de 20261003_louis_beebs_prix_10_vert_rose.sql : annule les deux
-- tâches de correction TANT QU'ELLES N'ONT RIEN RETIRÉ (étape a_capturer ou
-- captured). Une tâche passée à 'deleted' doit aller au bout (recréation).
begin;
update public.cross_post_jobs
set status = 'cancelled', error = 'Correction de prix annulée (inverse) — rien n''a été retiré.'
where platform_fields->'correction_prix'->>'pose_par' = 'scripts/reparations/20261003_louis_beebs_prix_10_vert_rose.sql'
  and status in ('pending', 'needs_user')
  and coalesce(platform_fields->>'republish_step', 'a_capturer') in ('a_capturer', 'captured');
commit;
