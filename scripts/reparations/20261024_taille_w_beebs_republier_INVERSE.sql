-- INVERSE de scripts/reparations/20261024_taille_w_beebs_republier.sql : la republication Beebs f4e7d1ab est annulée
-- tant qu'elle n'est pas partie (pending) — l'annonce Beebs 34165464 et son job d'origine n'ont alors pas bougé.
-- Une republication déjà faite (annonce recréée) ne se défait pas ici : elle se retire par le circuit normal.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Republication annulée par le support (inverse du 24/10) — l''annonce en ligne n''a pas bougé.'
   WHERE c.id = 'f4e7d1ab-98a1-4d06-8e71-1b04ce60c6c2' AND c.status = 'pending' AND c.action = 'republish';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'republication f4e7d1ab : % ligne(s) — déjà partie ou déjà annulée, rien n''est fait', n; END IF;
END $$;
SELECT id, status FROM public.cross_post_jobs WHERE id = 'f4e7d1ab-98a1-4d06-8e71-1b04ce60c6c2';
COMMIT;
