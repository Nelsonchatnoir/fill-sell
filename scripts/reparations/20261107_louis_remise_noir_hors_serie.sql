-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS (Amiral) — LA REMISE « RANGEMENT NOIR » SORT DE LA SÉRIE QUI LA BLOQUAIT (07/11 nuit, feu vert de Nico, point 0a)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis, 07/11 21:47 : « Je loupe des ventes, car mes annonces ne repartent pas sur LBC. Le 3e de la liste, je l'ai
-- enlevé moi-même du bon coin. » Tâche cc247496 (fiche 1791020281283, remise de l'annonce vendue 3297440551) : rang 5 de
-- la série louis-remises-lbc-0611. Lu en base le 07/11 à 22:17 :
--   - l'annonce vendue 3297440551 est relevée DISPARUE le 06/11 à 22:01 (relevé serveur:verif_redepot) → la règle A ne la
--     retient pas ;
--   - aucune autre annonce Leboncoin vivante de la fiche, ni sur Amiral ni sur le compte délégué 447d920c (aucun doublon) ;
--   - get-pending-jobs la tient à chaque passage : « série louis-remises-lbc-0611 : tâche cc247496 (rang 5) tenue —
--     attend_rang_1 » (journal de 22:00 à 22:16) — le rang 1 attend lui-même la disparition de SA vendue (règle A).
-- Ce script retire le seul marqueur de série (gardé dans serie_sortie, avec la raison) : rien d'autre ne change (ni
-- texte, ni photos, ni prix, ni statut). La tâche part au prochain passage de son poste (règle A : vendue disparue).
-- Gardes au moment d'écrire : tâche pending de Louis, toujours rang 5 de cette série, vendue relevée disparue, aucune
-- annonce Leboncoin vivante de la fiche.
-- Inverse : 20261107_louis_remise_noir_hors_serie_INVERSE.sql (tant qu'elle est encore pending).

CREATE TABLE IF NOT EXISTS public._backup_0711_louis_remise_hors_serie AS
  SELECT id, status, platform_fields, now() AS sauve_le FROM public.cross_post_jobs WHERE false;
ALTER TABLE public._backup_0711_louis_remise_hors_serie ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0711_louis_remise_hors_serie FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0711_louis_remise_hors_serie (id, status, platform_fields, sauve_le)
SELECT j.id, j.status, j.platform_fields, now()
  FROM public.cross_post_jobs j
 WHERE j.id = 'cc247496-7952-4b5a-b2e9-52c7e4071482'
   AND NOT EXISTS (SELECT 1 FROM public._backup_0711_louis_remise_hors_serie b WHERE b.id = j.id);

UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'serie_un_par_un') || jsonb_build_object('serie_sortie', jsonb_build_object(
         'le', now(), 'marqueur', j.platform_fields -> 'serie_un_par_un',
         'motif', 'annonce vendue 3297440551 relevée disparue le 06/11 22:01 ; la série la tenait derrière le rang 1 (attend_rang_1)',
         'pose_par', 'réparation 07/11 nuit (feu vert de Nico, point 0a : faire partir la remise du 3e de Louis)'))
 WHERE j.id = 'cc247496-7952-4b5a-b2e9-52c7e4071482'
   AND j.user_id = (SELECT id FROM auth.users WHERE email = 'louis@ttfamily.fr')
   AND j.platform = 'leboncoin' AND j.action = 'publish' AND j.status = 'pending'
   AND j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611'
   AND j.platform_fields #>> '{serie_un_par_un,rang}' = '5'
   AND j.platform_fields #>> '{remise_en_vente,annonce_vendue}' = '3297440551'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.platform = 'leboncoin' AND a.listing_id = '3297440551'
                  AND a.disparu_le IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a
                    WHERE a.platform = 'leboncoin' AND a.inventaire_id = 1791020281283
                      AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
                      AND a.statut_plateforme IN ('en_ligne', 'en_verification'));

SELECT j.id, j.status, j.platform_fields ? 'serie_un_par_un' AS encore_en_serie,
       j.platform_fields #>> '{serie_sortie,le}' AS sortie_le, left(j.title, 40) AS titre
  FROM public.cross_post_jobs j WHERE j.id = 'cc247496-7952-4b5a-b2e9-52c7e4071482';
