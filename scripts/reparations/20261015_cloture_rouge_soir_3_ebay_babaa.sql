-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — CLÔTURE DU ROUGE, point 3 (Babaa) : six retraits eBay d'articles
-- vendus sur Vinted, arrêtés « Connexion eBay requise » depuis le 12/10.
-- ═══════════════════════════════════════════════════════════════════════════
-- Compte NON relié à l'API eBay (aucune ligne ebay_accounts) et session eBay de
-- Chrome fermée depuis le 12/10 ~12:08 : aucune voie serveur (raison prouvée).
-- MAIS les six annonces ne sont plus en vente : page publique ebay.fr/itm/<id>
-- relue le 15/10 ~22:15 (navigateur de Nico, sans connexion à ce compte) :
--   188797143009 Isabel Marant shorts      « Le vendeur a mis fin à cette annonce le Wed 14 Oct à 0:48, car l'objet n'est plus disponible. »
--   188797133249 Café du Cycliste jersey   … le Wed 14 Oct à 0:49 …
--   188852963675 Max Mara coat              … le Wed 14 Oct à 0:48 …
--   188852974004 Steinbock loden            … le Wed 14 Oct à 0:48 …
--   188852918271 Weekend Max Mara jacket    … le Wed 14 Oct à 0:47 …
--   188853031346 Ganni blazer               … le Wed 14 Oct à 0:48 …
-- La personne les a terminées elle-même : rien à retirer, aucun risque de
-- double vente. Les retraits sont clos comme une offre « déjà hors ligne sans
-- vente » (même issue que ebay-api-worker : statut deleted, preuve tracée) —
-- le déclencheur retrait_ferme_annonce ferme le suivi de l'annonce.
-- Sauvegarde : _backup_1510_cloture_rouge_jobs ; inverse :
-- 20261015_cloture_rouge_soir_INVERSE.sql. Aucun mail, aucun geste chez eBay.

begin;

create table if not exists public._backup_1510_cloture_rouge_jobs as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

with cible(id, item) as (values
  ('080d9eab', '188797143009'), ('3120f2b6', '188797133249'), ('c4d88139', '188852963675'),
  ('4746bd72', '188852974004'), ('77fe9a25', '188852918271'), ('db5ddfcd', '188853031346'))
insert into public._backup_1510_cloture_rouge_jobs (id, status, error, platform_fields, sauve_le)
select j.id, j.status, j.error, j.platform_fields, now()
  from public.cross_post_jobs j join cible c on j.id::text like c.id || '%'
 where j.user_id = '0a82eff9-6a65-43d2-a402-5b4b8c52ef7a' and j.platform = 'ebay' and j.action = 'delete'
   and j.status = 'needs_user' and j.platform_listing_id = c.item;

with cible(id, item) as (values
  ('080d9eab', '188797143009'), ('3120f2b6', '188797133249'), ('c4d88139', '188852963675'),
  ('4746bd72', '188852974004'), ('77fe9a25', '188852918271'), ('db5ddfcd', '188853031346'))
update public.cross_post_jobs j
   set status = 'deleted',
       error = null,
       platform_fields = (j.platform_fields - 'needs_user_source' - 'attente_session' - 'ebay_connexion_requise' - 'mur_geste')
         || jsonb_build_object(
              'retrait_conclu', jsonb_build_object('le', now(), 'par', 'page_publique_ebay',
                 'motif', 'annonce déjà terminée par la personne le 14/10 (« l''objet n''est plus disponible »), relue le 15/10 au navigateur',
                 'annonce', c.item, 'reparation', 'cloture_rouge_1510'),
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'needs_user', 'erreur', j.error,
                      'par', 'reparation cloture_rouge_1510 (annonce déjà terminée sur eBay)')))
  from cible c
 where j.id::text like c.id || '%'
   and j.user_id = '0a82eff9-6a65-43d2-a402-5b4b8c52ef7a' and j.platform = 'ebay' and j.action = 'delete'
   and j.status = 'needs_user' and j.platform_listing_id = c.item;

commit;
