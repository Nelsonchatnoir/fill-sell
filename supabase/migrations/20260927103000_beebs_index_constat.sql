-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS : L'INDEX PUBLIC DIT SI UN DÉPÔT EST EN LIGNE — ET ON L'ÉCRIT (27/09)
-- APPLIQUÉE le 27/09 (GO Nico, CLI db query -f), après rejeu annulé : absente +
-- clore → cancelled neutre, listing_url_abandon retiré ; ambigue → trace seule,
-- rien clos ; droits : postgres, service_role. beebs-lien v2 déployée ensuite.
-- ═══════════════════════════════════════════════════════════════════════════
-- ornellaracano (« Blazer Mango carreaux gris M », 19/09) et
-- thomas.vinted590002 (« T-shirt Religion imprimé Fleurs », 20/09) : Beebs a
-- accepté le dépôt puis l'a retiré pendant sa vérification, sans rien dire.
-- beebs-lien lisait bien leur dressing toutes les 5 min (« aucun_appariement »)
-- mais n'écrivait rien sur le job : sept jours de « Patiente un peu », puis le
-- balayage de nuit a posé un échec ROUGE avec « Relance indisponible » — une
-- impasse, pour une annonce dont l'absence était mesurable.
--
-- beebs_index_constat(job, trace, clore) — service_role seul, appelée par
-- beebs-lien après une lecture RÉUSSIE du dressing public du vendeur :
--   · pose platform_fields.beebs_index = trace (fusion jsonb, jamais une
--     réécriture d'un objet relu plus tôt) ;
--   · clore = true (dépôt de plus de 7 jours, ou déjà clos « jamais en ligne »)
--     ET verdict 'absente' → le job passe 'cancelled' avec un message neutre
--     et verdict_moderation : ni rouge, ni impasse — « Relancer » redevient
--     possible (plus de listing_url_abandon). Écriture conditionnée : seulement
--     un dépôt 'published' sans lien, ou 'failed' clos « jamais en ligne ».
-- Aucune annonce touchée, rien de redéposé.

CREATE OR REPLACE FUNCTION public.beebs_index_constat(p_job uuid, p_trace jsonb, p_clore boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF p_job IS NULL OR p_trace IS NULL THEN RETURN 'arguments'; END IF;
  IF p_clore AND p_trace->>'verdict' = 'absente' THEN
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = 'Beebs n''a pas mis cette annonce en ligne (refusée à sa vérification, ou retirée) : elle n''apparaît pas sur ton compte Beebs. Rien n''est en ligne — tu peux la republier.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - 'listing_url_abandon')
        || jsonb_build_object('beebs_index', p_trace,
             'verdict_moderation', jsonb_build_object('verdict', 'refusee', 'preuve', 'absente_de_l_index_beebs', 'le', now(), 'trace', p_trace))
     WHERE id = p_job AND platform = 'beebs' AND listing_url IS NULL
       AND ((status = 'published' AND COALESCE(published_at, created_at) < now() - interval '7 days')
            OR (status = 'failed' AND platform_fields ? 'listing_url_abandon'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN RETURN 'clos'; END IF;
  END IF;
  UPDATE cross_post_jobs SET
    platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('beebs_index', p_trace)
   WHERE id = p_job AND platform = 'beebs' AND listing_url IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN CASE WHEN v_n > 0 THEN 'trace' ELSE 'rien' END;
END
$function$;

REVOKE ALL ON FUNCTION public.beebs_index_constat(uuid, jsonb, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beebs_index_constat(uuid, jsonb, boolean) TO service_role;
