-- (08/11/2026 nuit, URGENT de Nico — jade60890) LE POSTE CLOUD N'EST PAS UNE EXTENSION.
-- Cause prouvée : get-pending-jobs horodatait profiles.extension_last_seen_at à CHAQUE appel, y compris ceux de la copie
-- Cloud de l'extension (capacité « poste_cloud » ; build « …-cloud » dans extension_postes). Jade (Cloud arrêté à 22:18:09)
-- avait extension_last_seen_at = 22:18:35, posé par son poste Cloud qui s'éteignait ; le parcours d'entrée a lu
-- « extension vue » à 22:18:58 et l'a envoyée vers la voie extension : ses relevés Vinted, Leboncoin, Beebs attendent
-- une extension qui n'existe pas. Même signature : virginie.coste81, wtk8jnmnnf.
-- LA RÈGLE : « extension présente » = la VRAIE extension, ou le Cloud quand l'essai ou l'abonnement est actif.
--   1. profiles.extension_ordinateur_vu_le : le signe de vie de la VRAIE extension seule (jamais le poste Cloud) ;
--      rempli ici à partir de ce qu'on sait (compte sans poste Cloud : son signe de vie ; compte qui a eu un poste Cloud :
--      le dernier passage d'un poste NON Cloud lu dans extension_postes), puis par get-pending-jobs à chaque appel d'une
--      vraie extension.
--   2. extension_last_seen_at garde son sens pour tous ses lecteurs (« quelqu'un fait les tâches de ce compte ») :
--      la vraie extension, OU le poste Cloud tant que le Cloud est actif (get-pending-jobs n'horodate plus un poste Cloud
--      dont le compte n'a plus cloud_voie). Les comptes au Cloud ARRÊTÉ sont remis d'aplomb ici, par la règle, sans
--      toucher un compte à la main : leur signe de vie redevient celui de leur vraie extension (aucune = NULL).
--   3. Déclencheur : quand cloud_voie passe de vrai à faux, extension_last_seen_at redevient celui de la vraie extension
--      (le jour où un Cloud s'arrête, ses signes de vie cessent de compter).
-- Essai sur base JETABLE : scripts/essais/20261108230000_banc.mjs. Inverse : supabase/rollbacks/20261108230000_*_INVERSE.sql.
-- (Pas de transaction dans la migration : leçon du 03/11.)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extension_ordinateur_vu_le timestamptz;
COMMENT ON COLUMN public.profiles.extension_ordinateur_vu_le IS
  'Dernier appel de la VRAIE extension (ordinateur) — jamais le poste FillSell Cloud (08/11/2026, jade60890).';

-- Sauvegarde AVANT toute écriture (les signes de vie existants), pour l'inverse.
CREATE TABLE IF NOT EXISTS public._backup_20261108230000_extension_vu AS
  SELECT id, extension_last_seen_at, now() AS sauvegarde_le FROM public.profiles WHERE extension_last_seen_at IS NOT NULL;
REVOKE ALL ON public._backup_20261108230000_extension_vu FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_20261108230000_extension_vu ENABLE ROW LEVEL SECURITY;

-- 1a. Compte qui n'a JAMAIS eu de poste Cloud : son signe de vie est celui de son ordinateur.
UPDATE public.profiles p
   SET extension_ordinateur_vu_le = p.extension_last_seen_at
 WHERE p.extension_last_seen_at IS NOT NULL
   AND p.extension_ordinateur_vu_le IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.cloud_postes c WHERE c.user_id = p.id)
   AND coalesce(p.extension_postes::text, '') NOT LIKE '%-cloud"%';

-- 1b. Compte qui a eu un poste Cloud : le dernier passage d'un poste NON Cloud (extension_postes), s'il y en a un.
UPDATE public.profiles p
   SET extension_ordinateur_vu_le = s.vu
  FROM (SELECT p2.id, max((e.value ->> 'le')::timestamptz) AS vu
          FROM public.profiles p2,
               jsonb_each(CASE WHEN jsonb_typeof(p2.extension_postes) = 'object' THEN p2.extension_postes ELSE '{}'::jsonb END) e
         WHERE coalesce(e.value ->> 'build', '') NOT LIKE '%-cloud'
           AND (e.value ->> 'le') IS NOT NULL
         GROUP BY p2.id) s
 WHERE s.id = p.id
   AND p.extension_ordinateur_vu_le IS NULL
   AND (EXISTS (SELECT 1 FROM public.cloud_postes c WHERE c.user_id = p.id)
        OR coalesce(p.extension_postes::text, '') LIKE '%-cloud"%');

-- 2. Cloud NON actif et un poste Cloud dans l'histoire du compte : le signe de vie redevient celui de la vraie extension.
UPDATE public.profiles p
   SET extension_last_seen_at = p.extension_ordinateur_vu_le
 WHERE p.cloud_voie IS NOT TRUE
   AND (EXISTS (SELECT 1 FROM public.cloud_postes c WHERE c.user_id = p.id)
        OR coalesce(p.extension_postes::text, '') LIKE '%-cloud"%')
   AND p.extension_last_seen_at IS DISTINCT FROM p.extension_ordinateur_vu_le;

-- 3. À l'arrêt d'un Cloud (cloud_voie vrai → faux), ses signes de vie cessent de compter.
CREATE OR REPLACE FUNCTION public.profiles_extension_cloud_fin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.cloud_voie IS TRUE AND NEW.cloud_voie IS NOT TRUE THEN
    NEW.extension_last_seen_at := NEW.extension_ordinateur_vu_le;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS profiles_zz_extension_cloud_fin ON public.profiles;
CREATE TRIGGER profiles_zz_extension_cloud_fin
  BEFORE UPDATE OF cloud_voie ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_extension_cloud_fin();
