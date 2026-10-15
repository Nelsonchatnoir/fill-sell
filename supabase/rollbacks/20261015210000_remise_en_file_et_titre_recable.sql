-- Inverse de 20261015210000_remise_en_file_et_titre_recable.sql :
-- retire le déclencheur remis_en_file_le, rend à rapprocher_recabler_job son
-- corps de prod du 15/10 21:10 (pg_get_functiondef, mot pour mot).
DROP TRIGGER IF EXISTS cross_post_jobs_remis_en_file ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.cross_post_jobs_remis_en_file();

CREATE OR REPLACE FUNCTION public.rapprocher_recabler_job(p_job uuid, p_url text, p_listing_id text, p_par text, p_detail jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pf jsonb; v_ancienne text; v_ancien_id text;
BEGIN
  SELECT platform_fields, listing_url, platform_listing_id INTO v_pf, v_ancienne, v_ancien_id FROM cross_post_jobs WHERE id = p_job;
  -- Point A : aucun changement d'identité sans geste utilisateur.
  IF p_par IS DISTINCT FROM 'utilisateur'
     AND NOT public.listing_designe(p_listing_id, v_ancienne, v_ancien_id) THEN
    RAISE EXCEPTION 'Identité non prouvée : confirme le rattachement dans tes annonces.';
  END IF;
  v_pf := COALESCE(v_pf, '{}'::jsonb);
  v_pf := (v_pf - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
          || jsonb_build_object(
               'rattachement', jsonb_build_object('par', p_par, 'at', now(), 'ancienne_url', v_ancienne, 'ancien_listing_id', v_ancien_id) || COALESCE(p_detail, '{}'::jsonb),
               'listing_url_precedente', v_ancienne);
  UPDATE cross_post_jobs
     SET listing_url = p_url, platform_listing_id = p_listing_id, platform_fields = v_pf, last_checked_at = NULL
   WHERE id = p_job;
END;
$function$;
