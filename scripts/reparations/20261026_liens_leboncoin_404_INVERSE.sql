-- INVERSE de 20261026_liens_leboncoin_404.sql : remet le lien d'avant (et retire la trace lien_reecrit) sur les
-- lignes sauvegardées, seulement si elles portent encore le lien posé par le script (rien d'écrit depuis n'est écrasé).
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs c
   SET listing_url = b.listing_url,
       platform_fields = c.platform_fields - 'lien_reecrit'
  FROM public._backup_2610_liens_lbc_jobs b
 WHERE b.id = c.id
   AND c.listing_url = 'https://www.leboncoin.fr/ad/vetements/'
         || COALESCE(NULLIF(substring(b.platform_listing_id from '^[0-9]{6,}$'), ''), substring(b.listing_url from 'leboncoin\.fr/ad/(?:[^/?#]+/)?([0-9]{6,})'));
UPDATE public.annonces_plateforme a
   SET url = b.url
  FROM public._backup_2610_liens_lbc_annonces b
 WHERE b.id = a.id AND a.url = 'https://www.leboncoin.fr/ad/vetements/' || a.listing_id;
COMMIT;
