-- 20261114_relance_ebay_25007_13e274de_INVERSE.sql — remet le job 7b2c5d53 tel qu'il était AVANT la relance (sauvegarde
-- public._backup_1411_relance_ebay_25007), SEULEMENT s'il n'a pas été publié entre-temps (une annonce en ligne ne se
-- défait pas par la base : rien fait, et on le dit).
BEGIN;
DO $$
DECLARE
  v_id uuid := '7b2c5d53-d2c5-4143-a9fb-16595536c06f';
  b record;
  s text;
BEGIN
  SELECT * INTO b FROM public._backup_1411_relance_ebay_25007 WHERE id = v_id ORDER BY sauve_le LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'aucune sauvegarde : rien fait'; END IF;
  SELECT status INTO s FROM public.cross_post_jobs WHERE id = v_id FOR UPDATE;
  IF s IN ('published', 'processing') THEN RAISE EXCEPTION 'job % (%) : rien fait', v_id, s; END IF;
  UPDATE public.cross_post_jobs SET status = b.status, error = b.error, platform_fields = b.platform_fields WHERE id = v_id;
  RAISE NOTICE 'job % remis à % (sauvegarde du %)', v_id, b.status, b.sauve_le;
END $$;
COMMIT;
