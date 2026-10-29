-- RÉPONSE à la question du test du 29/10 soir (scripts/essais/20261029_test_texte_vendeur_vinted_nico.sql), compte de
-- Nico : Vinted demande « Pour qui ? » sur le rayon 5564. Le geste de l'app, à l'identique (StockTab, réponse au
-- needs_user : la valeur posée sur la cible vintedAspects.accessory_department, trace needsUserResolved, statut pending),
-- sous les claims de Nico. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
update public.cross_post_jobs j
set status = 'pending', error = null,
    platform_fields = (j.platform_fields - 'needsUserFields')
      || jsonb_build_object(
           'vintedAspects', coalesce(j.platform_fields->'vintedAspects', '{}'::jsonb) || jsonb_build_object('accessory_department', 'Hommes'),
           'needsUserResolved', coalesce(j.platform_fields->'needsUserResolved', '{}'::jsonb) || jsonb_build_object('vintedAspects.accessory_department', 'Hommes'))
where j.inventaire_id = 1793300100000 and j.platform = 'vinted' and j.action = 'publish' and j.status = 'needs_user';
select left(id::text, 8) as job, status, platform_fields->'vintedAspects' as aspects from public.cross_post_jobs
where inventaire_id = 1793300100000;
commit;
