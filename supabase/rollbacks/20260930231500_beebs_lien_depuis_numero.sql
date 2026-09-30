-- Inverse de 20260930231500_beebs_lien_depuis_numero.sql
SET lock_timeout = '3s';
DROP TRIGGER IF EXISTS cross_post_jobs_lien_numero_beebs ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.cross_post_jobs_lien_numero_beebs();
UPDATE public.cross_post_jobs j
   SET listing_url = b.listing_url_avant,
       platform_fields = CASE WHEN b.new_listing_url_avant IS NULL
                              THEN (COALESCE(j.platform_fields, '{}'::jsonb) - 'new_listing_url' - 'lien_depuis_numero')
                              ELSE (COALESCE(j.platform_fields, '{}'::jsonb) - 'lien_depuis_numero') || jsonb_build_object('new_listing_url', b.new_listing_url_avant) END
  FROM public._backup_beebs_lien_numero_3009 b
 WHERE b.job_id = j.id AND b.sens = 'numero_vers_lien';
UPDATE public.cross_post_jobs j
   SET platform_listing_id = b.platform_listing_id_avant,
       platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) - 'numero_depuis_lien'
  FROM public._backup_beebs_lien_numero_3009 b
 WHERE b.job_id = j.id AND b.sens = 'lien_vers_numero';
