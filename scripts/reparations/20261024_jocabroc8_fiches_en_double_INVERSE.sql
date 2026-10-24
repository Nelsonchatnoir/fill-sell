-- INVERSE de scripts/reparations/20261024_jocabroc8_fiches_en_double.sql (jocabroc8, estampe et tableau).
-- 1. Défait les 4 fusions par le circuit de l'app (inventaire_defusionner_pour : chaque ligne déplacée revient à sa
--    fiche, les champs repris sont rendus), de la plus récente à la plus ancienne.
-- 2. Rend aux 5 annonces mortes leur état d'avant (published + question « vendue ? ») depuis la sauvegarde
--    _backup_2410_jocabroc8_doubles_jobs, déclencheurs de veille au repos (fillsell.restauration).
-- Aucun mail, aucune vente, aucun retrait.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);

DO $$
DECLARE
  v_user constant uuid := '53efea05-dc2d-4467-a8cd-c6fa52a47a61';
  f record;
  v jsonb;
  n integer;
BEGIN
  FOR f IN SELECT id FROM public.inventaire_fusions
            WHERE user_id = v_user AND par = 'utilisateur:photo_go_nico_2410' AND defait_le IS NULL
              AND absorbe IN (1791040801501, 1790174159221, 1790781836119004, 1791087674193002)
            ORDER BY created_at DESC
  LOOP
    v := public.inventaire_defusionner_pour(v_user, f.id, 'support (inverse 20261024_jocabroc8_fiches_en_double)');
    IF coalesce((v ->> 'ok')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'défusion % refusée : %', f.id, v; END IF;
  END LOOP;

  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2410_jocabroc8_doubles_jobs b
   WHERE c.id = b.id
     AND c.platform_fields #>> '{remplacee_par_remise_en_ligne,pose_par}' = 'scripts/reparations/20261024_jocabroc8_fiches_en_double.sql';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'annonces rendues : % au lieu de 5', n; END IF;
END $$;

SELECT i.id, i.statut, i.fusionne_dans FROM public.inventaire i
 WHERE i.id IN (1790174159221, 1791040801501, 1791818408222, 1790781836119004, 1791087674193002, 1791983641199002) ORDER BY 1;
COMMIT;
