-- Définition de PROD relue le 13/11/2026 (pg_get_functiondef, lecture seule) — décor du banc 20261113180000, jamais appliquée.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_marquer(p_user uuid, p_fiche bigint, p_motif text, p_candidat bigint, p_annonce uuid, p_platform text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_fiche IS NULL THEN RETURN false; END IF;
  IF NOT rapprochement_v3_fiche_intacte(p_fiche) THEN RETURN false; END IF;
  UPDATE inventaire
     SET a_verifier = jsonb_build_object('depuis', now(), 'source', 'rapprochement_v3', 'motif', p_motif,
                                         'candidat', p_candidat, 'annonce_id', p_annonce, 'platform', p_platform)
   WHERE id = p_fiche AND user_id = p_user AND statut = 'stock' AND a_verifier IS NULL;
  RETURN FOUND;
END;
$function$
;
