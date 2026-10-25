-- INVERSE de 20261025_beebs_refus_verification.sql : remet les 4 dépôts Beebs (6a38d0b6, 99571727, 1fc35133,
-- f8054ba8) tels qu'ils étaient (statut « published », erreur, platform_fields), SEULEMENT s'ils sont encore dans
-- l'état posé par la réparation (« failed » avec son marqueur refus_verification_beebs, posé par ce script). Aucun
-- quota n'avait été rendu (rien à reprendre). Essai à blanc : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2510_beebs_refus_verification b
   WHERE c.id = b.id AND c.status = 'failed'
     AND c.platform_fields->'refus_verification_beebs'->>'par' = 'scripts/reparations/20261025_beebs_refus_verification.sql';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> (SELECT count(*) FROM public._backup_2510_beebs_refus_verification) THEN
    RAISE EXCEPTION 'attendu % jobs dans l''état de la réparation, obtenu % — rien n''est fait', (SELECT count(*) FROM public._backup_2510_beebs_refus_verification), n;
  END IF;
END $$;
SELECT c.id, c.status, c.error IS NULL AS sans_message, c.platform_fields ? 'refus_verification_beebs' AS marque
  FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM public._backup_2510_beebs_refus_verification);
COMMIT;
