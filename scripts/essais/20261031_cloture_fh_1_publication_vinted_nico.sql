-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CLÔTURE DES LOTS F ET H (31/10, après-midi) — COMPTE DE NICO, annonce de test à 999 € « ne pas acheter »
--   npx supabase db query --linked -f scripts/essais/20261031_cloture_fh_1_publication_vinted_nico.sql
-- Preuve en production de get-pending-jobs v313 (porte unique AVANT la pause) : une republication EN ATTENTE alors
-- que la file est EN PAUSE (la v312 ne la fermait pas) se clôt quand son annonce est retirée.
-- Étape 1 : le geste « Publier » de l'app (spend_coins_and_publish, sous les claims de Nico) — la fiche de test
-- T-shirt (1793438700000) sur Vinted, mêmes photos et champs que sa publication réussie du 30/10 (c46760f9).
-- La file de Nico RESTE EN PAUSE (posée par lui) : une publication part quand même (la pause ne retient que les
-- republications). Étapes suivantes : …_2_republication_puis_retrait_nico.sql. Aucun mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
create temp table _src on commit drop as
  select j.platform, j.title, j.photos,
         j.platform_fields - array['lbc_depot','listing_url_recovery','navigateur_poste','processing_since','republished_pending','warnings',
           'work_window_state','last_diagnostic','lien_depuis_numero','pas_encore_visible','preuve_identifiant_beebs',
           'preuve_identifiant_beebs_acceptee','unavailable_pending_since','depop_product_id','depop_statut_au_depot','removed_by_user',
           'colis_bilan','vinted_account_proof','lbcPhotosCapped','test_nico'] as pf
    from cross_post_jobs j
   where j.id = 'c46760f9-c062-4bbc-be5d-a308eb7cec82' and j.platform = 'vinted'
     and j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
grant select on _src to authenticated;

select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;

select public.spend_coins_and_publish('original', (
  select jsonb_agg(jsonb_build_object(
    'inventaire_id', '1793438700000', 'platform', s.platform,
    'title', 'TEST FillSell 31/10 clôture F-H — T-shirt femme Picture blanc taille S — ne pas acheter',
    'description', 'Annonce de test FillSell (31/10 : republication en attente fermée par un retrait). Ne pas acheter : elle est retirée après le test.',
    'price', '999', 'photos', s.photos,
    'platform_fields', s.pf || jsonb_build_object('test_nico', 'clôture F-H 31/10')))
  from _src s)) as publication;

reset role;
select left(id::text, 8) job, platform, inventaire_id, status, left(title, 80) titre, price
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700000 and status in ('pending', 'processing') order by created_at;
select platform_settings -> 'file_pause' file_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
