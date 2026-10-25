-- INVERSE de 20261025_rayon_beebs_8a608034.sql : remet la republication Beebs 8a608034 (chaouidz) telle qu'elle
-- était (statut needs_user, message, platform_fields avec la question « Rayon Beebs »), SEULEMENT si l'extension ne
-- l'a pas encore reprise : encore « pending », toujours à l'étape « captured », rien retiré (pas de deleted_at).
-- Après un retrait, cet inverse ne fait rien (RAISE) : l'annonce serait déjà hors ligne, la republication doit finir.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2510_rayon_beebs_8a608034 b
   WHERE c.id = b.id AND c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3'
     AND c.status = 'pending' AND c.platform_fields->>'republish_step' = 'captured'
     AND NOT (c.platform_fields ? 'deleted_at');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job encore en file à l''étape captured, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.platform_fields->'needsUserField'->>'field_key' AS question, c.platform_fields ? 'beebsCategoryPath' AS a_rayon
  FROM public.cross_post_jobs c WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3';
COMMIT;
