-- INVERSE de 20261105210000_fiche_annonces_vivantes_transaction_lbc : fiche_annonces_vivantes(bigint, text) remise à sa
-- définition de prod du 05/11 (pg_get_functiondef), mot pour mot. md5 sans CR : 243f00f332d04056223f20e330c5da8f.
-- La surcharge fiche_annonces_vivantes(bigint) n'a jamais été touchée. La migration n'écrit aucune ligne ; les ventes,
-- retraits ou questions écrits DEPUIS par les appelants sont de vraies écritures du circuit : ils ne se défont pas ici.
BEGIN;

CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inventaire bigint, p_platform text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(DISTINCT ap.listing_id)::int FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inventaire AND ap.platform = p_platform
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$
;

COMMIT;
