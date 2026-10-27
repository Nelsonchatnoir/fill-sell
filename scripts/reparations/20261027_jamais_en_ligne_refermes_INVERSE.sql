-- Inverse de 20261027_jamais_en_ligne_refermes.sql : chaque ligne marquée par la réparation reprend exactement sa
-- ligne sauvegardée (statut, motif, champs, lien, numéro). Une ligne que la règle referme APRÈS la réparation (relevé
-- suivant, déclencheur) ne porte pas la marque : elle n'est pas touchée.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE m integer;
BEGIN
  UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields,
         listing_url = b.listing_url, platform_listing_id = b.platform_listing_id
    FROM public._backup_2710_jamais_en_ligne b
   WHERE c.id = b.id AND c.platform_fields ? 'reparation_2710_jamais_en_ligne';
  GET DIAGNOSTICS m = ROW_COUNT;
  RAISE NOTICE 'inverse : % ligne(s) rendues', m;
END $$;
COMMIT;
