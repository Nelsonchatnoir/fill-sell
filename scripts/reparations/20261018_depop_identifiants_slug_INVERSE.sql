-- Inverse de scripts/reparations/20261018_depop_identifiants_slug.sql : les dépôts et retraits Depop
-- reprennent leur platform_listing_id d'avant (NULL), lu dans la sauvegarde _backup_1810_depop_slug —
-- seulement là où la colonne porte encore le slug posé par la réparation (rien d'autre n'est touché).
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_depop_identifiants_slug_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_depop_slug') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas tourné, rien n''est fait';
  END IF;
END
$garde$;
UPDATE public.cross_post_jobs j SET platform_listing_id = b.avant
  FROM public._backup_1810_depop_slug b
 WHERE j.id = b.id AND j.platform_listing_id = b.slug;
SELECT b.quoi, count(*) AS lignes, count(*) FILTER (WHERE j.platform_listing_id IS NOT DISTINCT FROM b.avant) AS rendues
  FROM public._backup_1810_depop_slug b JOIN public.cross_post_jobs j ON j.id = b.id
 GROUP BY b.quoi ORDER BY b.quoi;
DROP TABLE public._backup_1810_depop_slug;
COMMIT;
