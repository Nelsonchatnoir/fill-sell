-- INVERSE de 20261116_joshua_prevol_borne_relance.sql : remet les 2 jobs dans l'état sauvegardé (statut, erreur,
-- platform_fields), seulement s'ils sont encore « pending » et pas engagés (étape « captured », rien retiré). Un job déjà
-- parti (retiré, recréé) ne se remet jamais en arrière : le script le dit et ne le touche pas.
BEGIN;
DO $$
DECLARE b record; n int := 0;
BEGIN
  FOR b IN SELECT * FROM public._backup_1611_joshua_prevol LOOP
    UPDATE public.cross_post_jobs j
       SET status = b.status, error = b.error, platform_fields = b.platform_fields
     WHERE j.id = b.id AND j.status = 'pending' AND coalesce(j.platform_fields ->> 'republish_step', '') = 'captured';
    IF FOUND THEN n := n + 1; ELSE RAISE NOTICE 'job % déjà engagé ou parti : laissé tel quel', b.id; END IF;
  END LOOP;
  RAISE NOTICE '% job(s) remis dans leur état d''avant', n;
END $$;
COMMIT;
