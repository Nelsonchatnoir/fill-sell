-- INVERSE de 20261108230000_extension_ordinateur_vu_le.sql : le déclencheur et sa fonction retirés, les signes de vie
-- extension_last_seen_at remis tels que sauvegardés (pour les lignes que la migration a changées), la colonne retirée.
-- (get-pending-jobs doit d'abord être redéployé sans la colonne extension_ordinateur_vu_le.)
DROP TRIGGER IF EXISTS profiles_zz_extension_cloud_fin ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_extension_cloud_fin();
UPDATE public.profiles p
   SET extension_last_seen_at = b.extension_last_seen_at
  FROM public._backup_20261108230000_extension_vu b
 WHERE b.id = p.id AND p.extension_last_seen_at IS DISTINCT FROM b.extension_last_seen_at
   AND (p.extension_last_seen_at IS NULL OR p.extension_last_seen_at < b.extension_last_seen_at);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS extension_ordinateur_vu_le;
