-- Inverse de scripts/reparations/20261018_ventes_beebs_ailleurs.sql : les 6 ventes et les 5 fiches reprennent
-- leur plateforme d'avant, lue dans la sauvegarde _backup_1810_ventes_beebs_ailleurs (rien d'autre n'est touché ;
-- aucun déclencheur sur ces colonnes : aucun mail, aucune note).
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_ventes_beebs_ailleurs_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_ventes_beebs_ailleurs') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas tourné, rien n''est fait';
  END IF;
END
$garde$;
UPDATE public.ventes v SET plateforme = b.ligne ->> 'plateforme', plateforme_code = b.ligne ->> 'plateforme_code'
  FROM public._backup_1810_ventes_beebs_ailleurs b
 WHERE b.quoi = 'vente' AND v.id = b.id AND v.plateforme_code = 'beebs';
UPDATE public.inventaire i SET plateforme = b.ligne ->> 'plateforme'
  FROM public._backup_1810_ventes_beebs_ailleurs b
 WHERE b.quoi = 'fiche' AND i.id = b.id AND i.plateforme = 'beebs';
SELECT v.id, v.plateforme, v.plateforme_code FROM public.ventes v WHERE v.id IN (77407, 87308, 94454, 125115, 142259, 158347) ORDER BY v.id;
DROP TABLE public._backup_1810_ventes_beebs_ailleurs;
COMMIT;
