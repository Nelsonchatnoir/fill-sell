-- 20261114_retraits_fantomes_beebs.sql — (14/11/2026, point 4c de Nico) LES RETRAITS BEEBS DES FANTÔMES PROUVÉS, CLOS
-- « FAIT · DÉJÀ ABSENTE ». PRÉPARÉ, NON JOUÉ : feu vert NOMMÉ de Nico requis.
-- Cas (lu en base le 14/11 vers 15:15, heure de Paris) : 13e274de a 5 retraits Beebs en file (b66aca2b 27214883, 3b022bea
-- 27214877, 4b18420a 27214891, b96bda6a 27214557, 323e8a1d 27214895) sur des annonces PROUVÉES fantômes par la réparation
-- 20261114_beebs_fantomes (page publique 404 relue le 14/11 ~14:05 avec un témoin vivant ; annonces disparues et
-- détachées, sauvegardées dans _backup_1411_beebs_fantomes_annonces). Leur exécutant (le Cloud) ne peut pas les faire :
-- Beebs y est « à reconnecter » depuis 11:35:50. Sans ce script, ils attendent la reconnexion de Beebs dans l'app (le
-- Cloud y lirait la page 404 et les conclurait de même).
-- RÈGLE appliquée (supabase/functions/_shared/retrait-deja-absent.js, Nico 25/10) : « un retrait sur une annonce déjà
-- absente est un retrait fait » — statut `deleted`, `error` null, l'erreur d'avant archivée, drapeau unique
-- `deja_absente` { le, plateforme, numero, preuve, vente, pose_par }, `retrait_par` « annonce_deja_hors_ligne ».
-- ⚠️ La règle de Beebs demande DEUX constats 404 à 6 h d'écart au moins (l'index public est en retard, une annonce en
-- vérification est invisible). Ici : UN constat (14/11 ~14:05) + la preuve « fantôme de l'index » (annonce que le vendeur
-- avait supprimée, numéros anciens 2721xxxx, aucun dépôt récent). À JOUER SEULEMENT après une SECONDE lecture 404 des 5
-- pages (https://www.beebs.app/fr/p/<numéro>), faite à partir du 14/11 20:05 (heure de Paris), avec un témoin vivant —
-- sinon, attendre la reconnexion de Beebs (le Cloud les conclura).
-- Périmètre : SEULEMENT les retraits Beebs en file (pending) dont l'annonce figure dans _backup_1411_beebs_fantomes_annonces
-- (même compte, même numéro) ET est toujours disparue ; jamais la vraie annonce 34356253 (pas dans la liste).
-- Sauvegarde : _backup_1411_retraits_fantomes_beebs (une fois). Inverse : 20261114_retraits_fantomes_beebs_INVERSE.sql.
--   npx supabase db query --linked -f scripts/reparations/20261114_retraits_fantomes_beebs.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1411_retraits_fantomes_beebs AS SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1411_retraits_fantomes_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_retraits_fantomes_beebs FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE cibles ON COMMIT DROP AS
  SELECT j.* FROM public.cross_post_jobs j
   WHERE j.platform = 'beebs' AND COALESCE(j.action, 'publish') = 'delete' AND j.status = 'pending'
     AND EXISTS (SELECT 1 FROM public._backup_1411_beebs_fantomes_annonces b
                  WHERE b.user_id = j.user_id AND b.platform = 'beebs' AND b.listing_id = btrim(COALESCE(j.platform_listing_id, '')))
     AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                  WHERE a.user_id = j.user_id AND a.platform = 'beebs' AND a.listing_id = btrim(COALESCE(j.platform_listing_id, ''))
                    AND a.disparu_le IS NOT NULL)
     AND btrim(COALESCE(j.platform_listing_id, '')) <> '34356253';
INSERT INTO public._backup_1411_retraits_fantomes_beebs SELECT now(), c.* FROM cibles c
  WHERE NOT EXISTS (SELECT 1 FROM public._backup_1411_retraits_fantomes_beebs b WHERE b.id = c.id);
UPDATE public.cross_post_jobs j SET
    status = 'deleted',
    error = NULL,
    platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb) - 'attente_session' - 'next_action_after' - 'needs_user_source')
      || jsonb_build_object(
        'erreurs_archivees', COALESCE(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
          || CASE WHEN j.error IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status,
               'erreur', left(j.error, 600), 'par', 'scripts/reparations/20261114_retraits_fantomes_beebs')) END,
        'deja_absente', jsonb_build_object('le', now(), 'plateforme', 'beebs', 'numero', btrim(j.platform_listing_id),
          'preuve', jsonb_build_object('source', 'page_publique_404', 'regle', 'fantome_index_beebs',
            'lu_le', '2026-11-14 ~14:05 (Paris) + seconde lecture avant ce script', 'reparation', '20261114_beebs_fantomes'),
          'vente', NULL, 'pose_par', 'scripts/reparations/20261114_retraits_fantomes_beebs'),
        'retrait_par', 'annonce_deja_hors_ligne')
  WHERE j.id IN (SELECT id FROM cibles) AND j.status = 'pending';
SELECT count(*) AS retraits_clos, string_agg(left(user_id::text, 8) || ':' || left(id::text, 8) || ':' || platform_listing_id, ', ' ORDER BY platform_listing_id) AS detail
  FROM cibles;
COMMIT;
