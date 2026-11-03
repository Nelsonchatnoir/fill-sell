-- INVERSE de 20261103201000_cloud_flotte.sql — APRÈS le retour des orchestrateurs à cloud_comptes_a_servir
-- (postes.js et connexion.js retombent seuls sur l'ancien appel quand cloud_comptes_du_serveur n'existe plus) et
-- de l'app à CLOUD_DOMAINE (MeConnecterCloud.jsx retombe seul si cloud_serveur_moi n'existe plus).
-- cloud_postes.serveur n'est pas touché (colonne d'avant, déjà écrite par cloud_poste_noter).
SET lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.cloud_serveur_moi();
DROP FUNCTION IF EXISTS public.cloud_serveur_noter_creation(text, text, bigint, text, inet, jsonb);
DROP FUNCTION IF EXISTS public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.cloud_comptes_du_serveur(text);
DROP FUNCTION IF EXISTS public.cloud_serveur_choisir(uuid, uuid[]);
-- ⚠️ cloud_places_libres est appelée par le chantier C (vente) : retirer C d'abord.
DROP FUNCTION IF EXISTS public.cloud_places_libres();
DROP INDEX IF EXISTS public.cloud_postes_serveur_idx;
DROP TABLE IF EXISTS public.cloud_serveurs;
DELETE FROM public.coin_config WHERE key IN ('cloud_places_seuil', 'cloud_serveurs_auto', 'cloud_serveur_type', 'cloud_serveur_lieu');
-- Le seau « cloud-paquets » : vidé puis retiré à la main par l'API de stockage (un seau non vide ne se supprime pas en SQL).
