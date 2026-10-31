-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico, non-régression : annonces de test à 999 € « ne pas acheter »
-- Le bouton « Reprendre » de la file (file_pause_basculer) puis le geste « Publier » (spend_coins_and_publish, sous ses
-- claims) : fiche T-shirt (1793438700000) → Vinted ; fiche Veste (1793438700001) → Leboncoin — mêmes photos et champs
-- que leurs publications réussies du 30/10 (c46760f9, 2849b13c). Puis : …_5_republications (Vinted et Leboncoin avec
-- get-pending-jobs v313), …_6_fin (retraits, file remise en pause). Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
create temp table _src on commit drop as
  select j.platform, j.photos,
         j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste','processing_since','republished_pending','warnings',
           'work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','preuve_identifiant_beebs',
           'preuve_identifiant_beebs_acceptee','unavailable_pending_since','depop_product_id','depop_statut_au_depot','removed_by_user',
           'colis_bilan','vinted_account_proof','lbcPhotosCapped','test_nico'] as pf,
         case when j.platform = 'vinted' then 1793438700000 else 1793438700001 end as fiche,
         case when j.platform = 'vinted' then 'T-shirt femme Picture blanc taille S' else 'Veste noir et gris taille M' end as objet
    from cross_post_jobs j
   where j.id in ('c46760f9-c062-4bbc-be5d-a308eb7cec82', '2849b13c-f6c2-4ce7-b83c-61670ecc2249')
     and j.platform in ('vinted', 'leboncoin') and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.file_pause_basculer(false) as file_reprise;
select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object(
    'inventaire_id', s.fiche::text, 'platform', s.platform,
    'title', 'TEST FillSell 31/10 clôture F-H — ' || s.objet || ' — ne pas acheter',
    'description', 'Annonce de test FillSell (31/10 : non-régression de la republication). Ne pas acheter : elle est retirée après le test.',
    'price', '999', 'photos', s.photos,
    'platform_fields', s.pf || jsonb_build_object('test_nico', 'clôture F-H 31/10 non-régression')))
  from _src s)) as publication;
reset role;
select left(id::text, 8) job, platform, inventaire_id, status, left(title, 80) titre, price
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001)
   and status in ('pending', 'processing') order by platform;
commit;
