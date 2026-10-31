-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT F (31/10) — ESSAI RÉEL SUR LE COMPTE DE NICO : une file qui attend pendant la mise à jour de l'extension
--   npx supabase db query --linked -f scripts/essais/20261031_lot_f_test_maj_file_nico.sql
-- Les gestes de l'app, sous les claims de Nico (jamais une écriture directe dans une table de jobs) :
--   deux fiches de TEST à 999 € « ne pas acheter » (copies des fiches d'essai du 30/10, mêmes photos et mêmes champs
--   que leurs publications réussies : T-shirt → Vinted + Depop ; Veste → Leboncoin + Beebs), publiées par
--   spend_coins_and_publish. Sa file RESTE EN PAUSE (posée par lui le 29/10) : les 4 publications attendent pendant
--   la mise à jour de l'extension ; la reprise est un second script (…_REPRISE.sql). Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
create temp table _src on commit drop as
  select j.platform, j.title, j.description, j.photos,
         j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste','processing_since','republished_pending','warnings',
           'work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','preuve_identifiant_beebs',
           'preuve_identifiant_beebs_acceptee','unavailable_pending_since','depop_product_id','depop_statut_au_depot','removed_by_user',
           'colis_bilan','vinted_account_proof','lbcPhotosCapped'] as pf,
         case when j.platform in ('vinted','depop') then 1793438600000 else 1793438600001 end as fiche
    from cross_post_jobs j
   where j.id in ('c46760f9-c062-4bbc-be5d-a308eb7cec82','75f621a5-4e59-416a-bc02-381b11d3816f',
                  '2849b13c-f6c2-4ce7-b83c-61670ecc2249','5e6e11c6-4c5c-46b8-8194-247e8211b15d')
     and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;
create temp table _fiches on commit drop as
  select i.* from inventaire i where i.id in (1793387931852, 1793392146840) and i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _fiches to authenticated;

select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos, attributs)
select case when f.id = 1793387931852 then 1793438600000 else 1793438600001 end, f.user_id,
       'TEST FillSell 31/10 lot F — ' || regexp_replace(f.titre, '^TEST FillSell 30/10 — ', '') ,
       null, true, null, 'stock', now(), f.marque,
       'Annonce de test FillSell (lot F : mise à jour de l''extension pendant que la file attend, republications). Ne pas acheter : elle est retirée après le test.',
       f.type, 0, 0, 1, f.photos, f.attributs
  from _fiches f;

select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object(
    'inventaire_id', s.fiche::text, 'platform', s.platform,
    'title', 'TEST FillSell 31/10 lot F — ' || regexp_replace(regexp_replace(s.title, '^TEST FillSell 30/10 — ', ''), ' — ne pas a.*$', '') || ' — ne pas acheter',
    'description', 'Annonce de test FillSell (lot F : mise à jour de l''extension pendant que la file attend, republications). Ne pas acheter : elle est retirée après le test.',
    'price', '999', 'photos', s.photos,
    'platform_fields', s.pf || jsonb_build_object('test_nico', 'lot F 31/10 : file en attente pendant la mise à jour 0.6.162')))
  from _src s)) as publication;

reset role;
select left(id::text, 8) job, platform, inventaire_id, status, left(title, 70) titre, price
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438600000, 1793438600001) order by platform;
select platform_settings -> 'file_pause' file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
