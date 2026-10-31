-- LOT F (31/10) — fin des essais, compte de Nico, suite de 20261031_lot_f_test_FIN_nico.sql : la republication Beebs
-- de test (ce39e77c, « en attente », étape a_capturer, rien retiré par elle) est restée ouverte après le retrait de
-- son annonce 34269931 (cancelPublishAfterDelete ne clôt que les jobs « published »). Fermée par le geste « Annuler »
-- de « Ta file » (src/utils/annulerFile.js, annulerJobs) : même écriture, mêmes gardes, sous ses claims.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
update public.cross_post_jobs j
   set status = 'cancelled',
       error = 'Annulée à ta demande — ton annonce est restée en ligne.',
       platform_fields = j.platform_fields || jsonb_build_object(
         'arret_utilisateur', to_jsonb(now()),
         'annulee_dans_la_file', jsonb_build_object('le', to_jsonb(now()), 'par', 'app (Ta file)'),
         'hors_quota', true,
         'needsUserAttempts', greatest(99, coalesce((j.platform_fields->>'needsUserAttempts')::int, 0)))
 where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.id::text like 'ce39e77c%'
   and j.action = 'republish' and j.status = 'needs_user'
   and (j.platform_fields->>'republish_step' is null or j.platform_fields->>'republish_step' = 'a_capturer')
   and j.platform_fields->'deleted_at' is null and j.platform_fields->'republish_suppression_envoyee' is null
returning left(j.id::text, 8) job, j.platform, j.action, j.status;
reset role;
commit;
