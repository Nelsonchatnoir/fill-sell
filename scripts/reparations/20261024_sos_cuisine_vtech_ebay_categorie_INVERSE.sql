-- INVERSE de 20261024_sos_cuisine_vtech_ebay_categorie.sql : rend au job eBay a5d7f0c9 son error et ses
-- platform_fields d'avant (sauvegarde _backup_2410_sos_vtech_ebay) — seulement s'il n'est ni en cours ni publié
-- (une annonce en ligne ne se « dé-publie » pas par un script : on le dirait, on ne le ferait pas).
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET error = b.error, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (id) * FROM public._backup_2410_sos_vtech_ebay ORDER BY id, sauvegarde_le) b
   WHERE c.id = b.id AND c.id = 'a5d7f0c9-0f03-40a6-a308-13222390247f' AND c.status IN ('pending', 'failed', 'needs_user');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'inverse : % job(s) rendu(s) à leur état d''avant', n;
END $$;
COMMIT;
