-- LOT F, finition (31/10) — preuve de la garde du numéro, étape 3 : la fiche de test remise en ligne sur Leboncoin
-- SOUS UN AUTRE NUMÉRO (publication ordinaire de l'app, spend_coins_and_publish, sous les claims de Nico — même
-- contenu que le dépôt de 11:48). Ensuite un relevé Leboncoin la voit (…_2) → attendu : la republication ff153150
-- (retenue, numéro 3299028197 absent) se CLÔT « déjà remise en ligne », rien retiré ni recréé, jamais de doublon.
begin;
create temp table _src on commit drop as
  select j.title, j.description, j.price, j.photos, j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste',
           'processing_since','warnings','work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','lbcPhotosCapped'] as pf
    from cross_post_jobs j
   where j.id::text like '5493a7fd%' and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object('inventaire_id', '1793438700001', 'platform', 'leboncoin', 'title', s.title,
    'description', s.description, 'price', '999', 'photos', s.photos, 'platform_fields', s.pf))
  from _src s)) as publication;
reset role;
select left(id::text, 8) job, action, status, platform_listing_id, left(coalesce(error, ''), 100) err
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700001 and platform = 'leboncoin'
 order by created_at;
commit;
