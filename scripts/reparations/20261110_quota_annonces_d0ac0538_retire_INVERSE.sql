-- INVERSE de 20261110_quota_annonces_d0ac0538_retire.sql : la surcharge (quota_annonces 10) revient telle quelle.
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  INSERT INTO public.quotas_par_compte SELECT (jsonb_populate_record(NULL::public.quotas_par_compte, to_jsonb(b) - 'le')).*
    FROM public._backup_1011_quota_d0ac0538 b ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 ligne, % écrites : rien n''est écrit', n; END IF;
END $ecrit$;
DROP TABLE public._backup_1011_quota_d0ac0538;
COMMIT;
