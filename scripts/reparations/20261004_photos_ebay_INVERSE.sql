-- INVERSE de 20261004_photos_ebay_lot.sql : chaque fiche reprend ses photos
-- d'avant le rattrapage (sauvegarde_photos_ebay_20261004).
UPDATE public.inventaire i SET photos = s.photos
  FROM public.sauvegarde_photos_ebay_20261004 s
 WHERE i.id = s.inventaire_id;
