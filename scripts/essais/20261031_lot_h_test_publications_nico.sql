-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT F (finition) + LOT H (31/10) — ESSAIS RÉELS SUR LE COMPTE DE NICO : annonces de test à 999 € « ne pas acheter »
--   npx supabase db query --linked -f scripts/essais/20261031_lot_h_test_publications_nico.sql
-- Les gestes de l'app, sous les claims de Nico (jamais une écriture directe dans une table de jobs) : deux fiches de
-- TEST (copies des fiches d'essai du 30/10, mêmes photos et mêmes champs que leurs publications réussies) publiées par
-- spend_coins_and_publish : T-shirt → Vinted ; Veste → Leboncoin + Beebs. Sa file RESTE EN PAUSE (posée par lui) :
-- la reprise est un geste séparé (…_REPRISE.sql). Elles servent : la garde du numéro avant retrait en production,
-- le parcours complet de republication Beebs, la clôture d'une republication par un retrait, les dates par
-- plateforme du Stock, la non-régression. Aucun mail. Retrait des annonces : …_FIN.sql.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
create temp table _src on commit drop as
  select j.platform, j.title, j.description, j.photos,
         j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste','processing_since','republished_pending','warnings',
           'work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','preuve_identifiant_beebs',
           'preuve_identifiant_beebs_acceptee','unavailable_pending_since','depop_product_id','depop_statut_au_depot','removed_by_user',
           'colis_bilan','vinted_account_proof','lbcPhotosCapped','test_nico'] as pf,
         case when j.platform = 'vinted' then 1793438700000 else 1793438700001 end as fiche
    from cross_post_jobs j
   where j.id in ('c46760f9-c062-4bbc-be5d-a308eb7cec82','75f621a5-4e59-416a-bc02-381b11d3816f',
                  '2849b13c-f6c2-4ce7-b83c-61670ecc2249','5e6e11c6-4c5c-46b8-8194-247e8211b15d')
     and j.platform in ('vinted', 'leboncoin', 'beebs')
     and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;
create temp table _fiches on commit drop as
  select i.* from inventaire i where i.id in (1793387931852, 1793392146840) and i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _fiches to authenticated;

select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

insert into public.inventaire (id, user_id, titre, prix_achat, prix_achat_inconnu, prix_vente, statut, date, marque, description, type,
  purchase_costs, selling_fees, quantite, photos, attributs)
select case when f.id = 1793387931852 then 1793438700000 else 1793438700001 end, f.user_id,
       'TEST FillSell 31/10 lot H — ' || regexp_replace(f.titre, '^TEST FillSell 30/10 — ', ''),
       null, true, null, 'stock', now(), f.marque,
       'Annonce de test FillSell (31/10 : garde du numéro, republication Beebs, dates par plateforme). Ne pas acheter : elle est retirée après le test.',
       f.type, 0, 0, 1, f.photos, f.attributs
  from _fiches f;

select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object(
    'inventaire_id', s.fiche::text, 'platform', s.platform,
    'title', 'TEST FillSell 31/10 lot H — ' || regexp_replace(regexp_replace(s.title, '^TEST FillSell 3[01]/10( lot F)? — ', ''), ' — ne pas a.*$', '') || ' — ne pas acheter',
    'description', 'Annonce de test FillSell (31/10 : garde du numéro, republication Beebs, dates par plateforme). Ne pas acheter : elle est retirée après le test.',
    'price', '999', 'photos', s.photos,
    'platform_fields', s.pf || jsonb_build_object('test_nico', 'lot H 31/10')))
  from _src s)) as publication;

reset role;
select left(id::text, 8) job, platform, inventaire_id, status, left(title, 80) titre, price
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001) order by platform;
select platform_settings -> 'file_pause' file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
