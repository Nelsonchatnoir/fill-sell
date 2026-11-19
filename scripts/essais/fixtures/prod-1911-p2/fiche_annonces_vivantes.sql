-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef fiche_annonces_vivantes(bigint,text), md5 d79b823d20bb3bf4688c84d5ae144a1f), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inventaire bigint, p_platform text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(DISTINCT ap.listing_id)::int FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inventaire AND ap.platform = p_platform
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
     AND NOT (ap.platform = 'leboncoin'
              AND COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending', 'sold')
              AND EXISTS (SELECT 1 FROM public.ventes_operations o
                           WHERE o.user_id = ap.user_id AND o.cle = 'annonce:leboncoin:' || btrim(ap.listing_id)))
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$
;
