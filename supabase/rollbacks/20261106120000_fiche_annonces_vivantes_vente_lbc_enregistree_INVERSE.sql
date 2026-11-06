-- INVERSE de 20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree : fiche_annonces_vivantes(bigint, text) remise à sa
-- définition de PROD du 06/11 (pg_get_functiondef), mot pour mot. La migration n'écrit aucune ligne.
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
