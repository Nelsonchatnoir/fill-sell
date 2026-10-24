-- INVERSE de scripts/reparations/20261024_recrutement_lbc_relance_1.sql : rend au job a47bdb31 son état d'avant la
-- relance (failed, « jamais en ligne », numéro mort), depuis _backup_2410_recrutement_lbc_relances — seulement s'il
-- est encore en file (pending / needs_user) : un redépôt fait ne se défait pas ici (l'annonce existe chez Leboncoin).
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_listing_id = b.platform_listing_id, listing_url = b.listing_url,
         published_at = b.published_at, platform_fields = b.platform_fields
    FROM public._backup_2410_recrutement_lbc_relances b
   WHERE c.id = b.id AND c.id = 'a47bdb31-10ec-4060-be20-8103973efd43' AND c.status IN ('pending', 'needs_user');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'job a47bdb31 : % ligne(s) — déjà parti ou déjà rendu, rien n''est fait', n; END IF;
END $$;
SELECT id, status, platform_listing_id FROM public.cross_post_jobs WHERE id = 'a47bdb31-10ec-4060-be20-8103973efd43';
COMMIT;
