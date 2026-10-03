-- ═══════════════════════════════════════════════════════════════════════════
-- POINT A (03/10, décision de Nico) — le livre d'Ornella rangé hors des livres
-- ═══════════════════════════════════════════════════════════════════════════
-- Annonce eBay 307191964555 « Livre Stephen Hawking » (ornellaracano, compte
-- eBay ornrac_54, voie API, job 41f00503) : partie le 22/09 en
-- « Jouets et jeux > Modélisme ferroviaire > Livres et guides > Livres » (9049).
-- La révision sur place est refusée par eBay (25021 : l'état d'un livre n'est
-- pas valide dans ce rayon, et l'état d'avant ne l'est pas chez les livres).
-- Décision de Nico : retrait + republication dans le bon rayon.
--
-- Vérifié chez eBay AVANT (Browse API, ebay-api-worker mesure_annonces, 03/10
-- 18:3x) : en ligne, 1 en stock, 0 vendu, format FIXED_PRICE seul (ni enchère,
-- ni offre possible), rayon 9049.
-- Mesure à blanc dans le rayon cible (mesure_aspects, categorie_id 171243) :
-- « Livres, BD, revues > Non-fiction », état USED_ACCEPTABLE (6000, « État
-- correct », depuis « Satisfaisant »), aucun aspect requis, passe sans question.
--
-- Le geste : UNE republication eBay par API (ebay-api-worker republier :
-- preuve annonce → publication API → offre/SKU relus, contrôle de vente,
-- withdraw, puis la MÊME offre mise à jour et republiée). Même prix (4 €),
-- mêmes photos, même titre, même texte : copiés du job source. Rien n'est
-- débité (correction de notre erreur de rayon).
-- Inverse (tant que le job est encore « pending ») :
--   20261003_livre_hawking_ornella_rayon_INVERSE.sql

-- 1. Sauvegarde du job source, tel qu'il est avant tout geste.
create table if not exists public._backup_0310_livre_hawking as
  select now() as sauvegarde_le, j.* from public.cross_post_jobs j
  where j.id = '41f00503-2ab4-41f9-a712-de655d6d1b03';

-- 2. La republication, copiée du job source (même forme que
--    spend_coins_and_republish, branche hors Vinted), rayon corrigé.
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, voie, photo_option,
                                    title, description, price, photos, listing_url, platform_listing_id, platform_fields)
select s.user_id, s.inventaire_id, 'ebay', 'republish', 'pending', 'api', coalesce(s.photo_option, 'original'),
       s.title, s.description, s.price, s.photos, s.listing_url, s.platform_listing_id,
       (coalesce(s.platform_fields, '{}'::jsonb)
         - array['ebay_api', 'last_diagnostic', 'veille_ebay_le', 'ebayCategorieAttente', 'ebayRequiredAspects',
                 'categorie_icone', 'categorie_source', 'categorie_par_mot', 'categorie_icone_ia',
                 'categorie_objet_ia', 'categorie_mot_cle_titre', 'erreurs_archivees'])
       || jsonb_build_object(
            'ebayCategoryId', '171243',
            'ebayCategoryPath', jsonb_build_array('Livres, BD, revues', 'Non-fiction'),
            'categorie_source', 'correction (03/10, point A : livre rangé en 9049)',
            'republish_step', 'a_capturer',
            'republish_source', 'correction',
            'republish_platform', 'ebay',
            'republish_source_job_id', s.id,
            'pepites_debitees', 0,
            'correction_rayon', jsonb_build_object(
              'le', now(), 'decision', 'Nico, 03/10 (point A)',
              'de', jsonb_build_object('id', '9049', 'chemin', 'Jouets et jeux > Modélisme ferroviaire > Livres et guides > Livres'),
              'vers', jsonb_build_object('id', '171243', 'chemin', 'Livres, BD, revues > Non-fiction'),
              'verifie_avant', 'en ligne, 0 vendu, FIXED_PRICE seul (ni enchère ni offre), Browse API 03/10'),
            'republish_snapshot', jsonb_build_object(
              'version', 2, 'plateforme', 'ebay', 'source_job_id', s.id,
              'titre', s.title, 'prix', s.price, 'listing_url', s.listing_url,
              'platform_listing_id', s.platform_listing_id,
              'photos', jsonb_array_length(coalesce(s.photos, '[]'::jsonb)), 'captured_at', now()))
from public.cross_post_jobs s
where s.id = '41f00503-2ab4-41f9-a712-de655d6d1b03'
  and s.status = 'published' and s.voie = 'api'
  and s.platform_listing_id = '307191964555'
  and not exists (select 1 from public.cross_post_jobs r
                  where r.user_id = s.user_id and r.platform = 'ebay' and r.action = 'republish'
                    and r.inventaire_id = s.inventaire_id and r.status in ('pending', 'processing'))
returning id, status, voie, platform_fields->>'ebayCategoryId' as rayon;
