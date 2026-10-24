-- INVERSE de 20261024_sos_cuisine_vtech_lbc_rayon.sql : retire le job de republication ajouté — SEULEMENT s'il n'a pas
-- commencé (étape « a_capturer », jamais pris par le poste) : une annonce déjà retirée ou recréée ne se défait pas par
-- un script (on le dirait, on ne le ferait pas).
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  DELETE FROM public.cross_post_jobs c
   WHERE c.inventaire_id = 1792837464698008 AND c.platform = 'leboncoin' AND c.action = 'republish' AND c.status = 'pending'
     AND c.platform_fields ->> 'categorie_source' = 'reparation_switch_and_go'
     AND coalesce(c.platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer'
     AND NOT (c.platform_fields ? 'processing_since');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'inverse : % job(s) retiré(s)', n;
END $$;
COMMIT;
