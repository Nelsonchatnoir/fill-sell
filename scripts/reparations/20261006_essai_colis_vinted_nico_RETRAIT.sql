-- ESSAI RÉEL (06/10 soir, compte de Nico) — nettoyage : retrait de l'annonce
-- de TEST recréée par la republication 0.6.102 (1d31375b → 10271718636).
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT j.user_id, j.inventaire_id, 'vinted', 'delete', 'pending', j.title, j.listing_url, j.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'vinted_account_id', j.platform_fields ->> 'vinted_account_id', 'essai_0610', 'colis_0_6_102_nettoyage')
  FROM public.cross_post_jobs j
 WHERE j.id = '1d31375b-0611-4e9c-9c13-ee723beacccc' AND j.status = 'published' AND j.platform_listing_id = '10271718636'
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.action = 'delete' AND x.platform = 'vinted'
                    AND x.platform_listing_id = '10271718636' AND x.status IN ('pending', 'processing'))
RETURNING id, status;
