-- Inverse de 20261003_livre_hawking_ornella_rayon.sql — UNIQUEMENT tant que la
-- republication n'a pas commencé (status 'pending', republish_step 'a_capturer') :
-- au-delà, l'annonce a été retirée chez eBay et c'est le worker qui la recrée.
delete from public.cross_post_jobs
where user_id = 'f8aa02a5-23cb-4325-bba8-127f61a75741'
  and platform = 'ebay' and action = 'republish'
  and platform_fields->>'republish_source_job_id' = '41f00503-2ab4-41f9-a712-de655d6d1b03'
  and status = 'pending'
  and coalesce(platform_fields->>'republish_step', 'a_capturer') = 'a_capturer'
returning id;
