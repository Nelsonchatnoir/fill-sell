-- INVERSE de 20261005_josephine_republications_beebs.sql : remet les jobs dans
-- leur état d'avant (cancelled, erreur et champs d'origine) s'ils n'ont pas
-- encore été pris par l'extension.
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0510_josephine_repub_beebs b
 WHERE c.id = b.id AND c.status = 'pending';
