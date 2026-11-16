-- 20261116_lizzaa_aspects_ebay_relance_INVERSE.sql — remet les 8 jobs eBay de lizzaa tels qu'ils étaient AVANT la
-- réparation (sauvegarde public._backup_1611_lizzaa_aspects_ebay), SEULEMENT ceux qui ne sont ni publiés ni en cours
-- (une annonce en ligne ne se défait pas par la base : rien fait pour eux, et on le dit).
BEGIN;
DO $$
DECLARE
  b record;
  s text;
BEGIN
  FOR b IN SELECT DISTINCT ON (id) * FROM public._backup_1611_lizzaa_aspects_ebay ORDER BY id, sauve_le LOOP
    SELECT status INTO s FROM public.cross_post_jobs WHERE id = b.id FOR UPDATE;
    IF s IN ('published', 'processing') THEN
      RAISE NOTICE 'job % (%) : rien fait', b.id, s;
      CONTINUE;
    END IF;
    UPDATE public.cross_post_jobs SET status = b.status, error = b.error, platform_fields = b.platform_fields WHERE id = b.id;
    RAISE NOTICE 'job % remis à % (sauvegarde du %)', b.id, b.status, b.sauve_le;
  END LOOP;
END $$;
COMMIT;
