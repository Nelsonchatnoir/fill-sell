-- ESSAI RÉEL (06/10 soir, compte de Nico f44b5917…) — non-régression de la
-- 0.6.102 (format de colis Vinted) sur un rayon où la grille EST présente :
-- publication Vinted de la fiche de TEST à 999 € « Call of Duty » (règle de
-- Nico), champs = copie du dépôt de test de cet après-midi (0cc1220f, via
-- remise_en_vente_champs). La republication puis le retrait suivent par
-- 20261006_essai_colis_vinted_nico_REPUBLICATION.sql / _RETRAIT.sql.
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('essai_0610', 'colis_0_6_102')
  FROM public.cross_post_jobs c
 WHERE c.id = '0cc1220f-bfac-424d-ad66-d03bc3771901'
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = c.inventaire_id
                    AND x.platform = 'vinted' AND x.action IN ('publish', 'republish') AND x.status IN ('pending', 'processing', 'published'))
RETURNING id, platform, status, (platform_fields ? 'packageSizeId') colis_choisi, platform_fields -> 'vinted_ids' ids;
