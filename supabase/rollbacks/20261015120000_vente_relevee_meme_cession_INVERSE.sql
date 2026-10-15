-- INVERSE de 20261015120000_vente_relevee_meme_cession.sql : définition EN PROD le 15/10 ~12:10.
CREATE OR REPLACE FUNCTION public.signaux_vente_reconcilier(p_max integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
DECLARE c record; v_vu timestamptz; v_vente bigint; v_res jsonb; n_dem integer := 0; n_fus integer := 0; n_vus integer := 0;
        v_ids_dem text[] := ARRAY[]::text[]; v_ids_fus text[] := ARRAY[]::text[];
        v_debut timestamptz := clock_timestamp(); v_budget boolean := false;
BEGIN
  -- Ordre tournant (graine = le créneau de 2 min) : aucune carte n'en affame une
  -- autre quand il y en a plus que le lot ; budget de 1,5 s par passage.
  FOR c IN
    SELECT j.id, j.user_id, j.platform, j.platform_listing_id, j.platform_fields
      FROM public.cross_post_jobs j
     WHERE j.status = 'published' AND (j.platform_fields ->> 'sale_signal') = 'sold'
       AND coalesce(j.action, 'publish') IN ('publish', 'republish')
     ORDER BY hashtextextended(j.id::text, floor(extract(epoch FROM now()) / 120)::bigint)
     LIMIT greatest(1, least(coalesce(p_max, 40), 200))
  LOOP
    IF clock_timestamp() - v_debut > interval '1500 milliseconds' THEN v_budget := true; EXIT; END IF;
    n_vus := n_vus + 1;
    IF c.platform = 'vinted' THEN
      v_vu := public.signal_vente_vu_en_ligne(c.user_id, c.platform_listing_id,
                public._ts_ou_null(c.platform_fields ->> 'unavailable_since'));
      IF v_vu IS NOT NULL THEN
        IF public.signal_vente_lever(c.id, 'signal_dementi_par_releve',
             jsonb_build_object('releve_le', v_vu, 'par', 'signaux_vente_reconcilier')) THEN
          n_dem := n_dem + 1; v_ids_dem := v_ids_dem || left(c.id::text, 8);
        END IF;
        CONTINUE;
      END IF;
    END IF;
    v_vente := public.vente_saisie_meme_cession(c.id);
    IF v_vente IS NOT NULL THEN
      v_res := public.signal_vente_clore_meme_cession(c.id, v_vente, 'signaux_vente_reconcilier');
      IF v_res ->> 'ok' = 'true' THEN n_fus := n_fus + 1; v_ids_fus := v_ids_fus || left(c.id::text, 8); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('vus', n_vus, 'dementis', n_dem, 'fusionnes', n_fus, 'budget_atteint', v_budget)
      || CASE WHEN n_dem > 0 THEN jsonb_build_object('dementis_jobs', to_jsonb(v_ids_dem)) ELSE '{}'::jsonb END
      || CASE WHEN n_fus > 0 THEN jsonb_build_object('fusionnes_jobs', to_jsonb(v_ids_fus)) ELSE '{}'::jsonb END;
END;
$function$;

DROP FUNCTION IF EXISTS public.signal_vente_clore_vente_relevee(uuid, bigint, text);
DROP FUNCTION IF EXISTS public.vente_relevee_meme_cession(uuid);
