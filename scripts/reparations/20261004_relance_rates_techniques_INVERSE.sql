-- Inverse de 20261004_relance_rates_techniques.sql : remet statut, erreur et
-- platform_fields tels que sauvegardés (seulement si le job n'a pas bougé
-- depuis : toujours 'pending' et jamais repris).
UPDATE public.cross_post_jobs j SET status = s.status, error = s.error, platform_fields = s.platform_fields
  FROM public.sauvegarde_relance_techniques_20261004 s
 WHERE j.id = s.id AND j.status = 'pending' AND NOT (j.platform_fields ? 'processing_since');
