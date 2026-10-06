-- ESSAI RÉEL (06/10 soir, compte de Nico) — suite de 20261006_essai_colis_vinted_nico.sql :
-- republication Vinted de l'annonce de TEST publiée par la 0.6.102 (10271582838),
-- exactement comme spend_coins_and_republish la pose (étape a_capturer), sans
-- débit (pepites_debitees 0). La grille de colis est présente sur ce rayon :
-- le format de l'annonce d'origine doit partir (source annonce_origine).
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_fields)
SELECT j.user_id, j.inventaire_id, 'vinted', 'republish', 'pending', 'original', j.title, 999,
       'https://www.vinted.fr/items/' || j.platform_listing_id,
       jsonb_build_object('republish_step', 'a_capturer', 'vinted_item_id', j.platform_listing_id,
                          'pepites_debitees', 0, 'republish_source', 'manuel', 'prix_republication', 999,
                          'essai_0610', 'colis_0_6_102_republication')
  FROM public.cross_post_jobs j
 WHERE j.id = '60f17876-e46e-44cc-9627-d88958eab76b' AND j.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = j.inventaire_id
                    AND x.platform = 'vinted' AND x.action = 'republish' AND x.status IN ('pending', 'processing'))
RETURNING id, status, listing_url;
