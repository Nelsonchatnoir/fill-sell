-- INVERSE de 20261121_retouches_rendues_0c97dc8b.sql : les 22 retouches recomptent (metadata d'avant, à l'identique).
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.usage_logs u SET metadata = b.metadata FROM public._backup_2111_retouches_0c97dc8b b WHERE u.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 22 THEN RAISE EXCEPTION 'attendu 22 lignes, % touchées : rien n''est écrit', n; END IF;
END $ecrit$;
DROP TABLE public._backup_2111_retouches_0c97dc8b;
COMMIT;
