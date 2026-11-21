-- INVERSE de 20261121_quota_annonces_0c97dc8b_retire.sql : la surcharge (quota_annonces 240) revient telle quelle.
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  INSERT INTO public.quotas_par_compte SELECT (jsonb_populate_record(NULL::public.quotas_par_compte, to_jsonb(b) - 'le')).*
    FROM public._backup_2111_quota_0c97dc8b b ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 ligne, % écrites : rien n''est écrit', n; END IF;
END $ecrit$;
DROP TABLE public._backup_2111_quota_0c97dc8b;
COMMIT;
