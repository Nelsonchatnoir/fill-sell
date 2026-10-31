-- LOT F, finition (31/10) — preuve de la garde du numéro, étape 4 : le cas exact de Johan (fiche en double, fusionnée
-- APRÈS que la republication a été mise en file). Une seconde fiche de TEST (copie de la Veste, 999 €) publiée sur
-- Leboncoin par l'app (spend_coins_and_publish, sous les claims de Nico). Ensuite (…_5) : relevé Leboncoin, puis le
-- geste « Fusionner » de l'app (inventaire_fusionner : la fiche 1793438700002 dans 1793438700001) → attendu : la
-- republication retenue ff153150 se CLÔT « déjà remise en ligne » (une annonce Leboncoin de la fiche vue au relevé).
begin;
create temp table _src on commit drop as
  select j.title, j.description, j.photos, j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste',
           'processing_since','warnings','work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','lbcPhotosCapped'] as pf
    from cross_post_jobs j
   where j.id::text like '5493a7fd%' and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;
create temp table _fiche on commit drop as
  select i.* from inventaire i where i.id = 1793438700001 and i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _fiche to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos, attributs)
select 1793438700002, f.user_id, f.titre || ' (double)', null, true, null, 'stock', now(), f.marque, f.description, f.type, 0, 0, 1, f.photos, f.attributs
  from _fiche f;
select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object('inventaire_id', '1793438700002', 'platform', 'leboncoin', 'title', s.title,
    'description', s.description, 'price', '999', 'photos', s.photos, 'platform_fields', s.pf || jsonb_build_object('test_nico', 'lot F 31/10 : fiche en double')))
  from _src s)) as publication;
reset role;
select left(id::text, 8) job, inventaire_id, action, status, left(title, 70) titre
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700002;
commit;
