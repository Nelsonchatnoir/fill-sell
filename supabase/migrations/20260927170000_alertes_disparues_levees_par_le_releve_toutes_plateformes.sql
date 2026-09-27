-- ═══════════════════════════════════════════════════════════════════════════
-- ALERTES « PLUS EN LIGNE » DÉMENTIES PAR LE RELEVÉ : LEVÉES, SUR LES QUATRE
-- PLATEFORMES RELEVÉES (27/09, GO Nico) — la règle Vinted, étendue
-- ═══════════════════════════════════════════════════════════════════════════
-- 44310spgl : 232 annonces Opla portaient `unavailable_since` (posé par le
-- veilleur de l'extension le 23/09 entre 18 h et 21 h, sur UNE lecture) alors
-- que 34 relevés Opla du même soir — et ceux du 27/09, 1 005 annonces — les
-- voyaient EN LIGNE. Rien ne levait ces drapeaux : la levée « revue en ligne »
-- n'existait que pour Vinted (20260918110000, sur inventaire.last_synced_at),
-- aucune fonction SQL ne touchait unavailable_since, et le veilleur ne relit
-- jamais un job déjà marqué. Il a répondu « je ne sais pas » 221 fois.
--
-- LA RÈGLE, même esprit que Vinted (au moindre doute, on ne lève pas) :
--   1. sale_signal différent de 'sold' — aucun soupçon de vente ;
--   2. le relevé du compte porte cette annonce EN LIGNE (statut_plateforme) ;
--   3. non disparue (disparu_le IS NULL) ;
--   4. vue APRÈS l'alerte (vu_le > unavailable_since) ;
--   5. c'est LA MÊME annonce (listing_id = platform_listing_id du job).
-- Levée = unavailable_since, unavailable_pending_since, sale_signal,
-- detected_price et le masquage retirés ; trace revue_en_ligne_par_releve.
-- Vinted n'est pas concernée (son relevé est le dressing, sa règle vit dans
-- alerte_vinted_lever_revues, interrupteur inchangé).
--
-- QUAND : à la clôture de chaque relevé (trigger sur vinted_sync_runs → done,
-- kind 'annonces', plateformes leboncoin/ebay/beebs/opla), pour ce compte et
-- cette plateforme ; et une fois maintenant, pour tout le parc (mesuré avant :
-- opla 232, leboncoin 1, ebay 0, beebs 0 éligibles).
-- Droits : SECURITY DEFINER, réservée à service_role (comme la règle Vinted).

BEGIN;

CREATE OR REPLACE FUNCTION public.alerte_lever_revues_plateformes(p_user uuid DEFAULT NULL, p_platform text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids    uuid[];
  n_levees integer := 0;
BEGIN
  SELECT COALESCE(array_agg(j.id), ARRAY[]::uuid[]) INTO v_ids
    FROM cross_post_jobs j
   WHERE j.status = 'published'
     AND j.platform IN ('leboncoin', 'ebay', 'beebs', 'opla')
     AND (p_user IS NULL OR j.user_id = p_user)
     AND (p_platform IS NULL OR j.platform = p_platform)
     AND j.platform_fields ? 'unavailable_since'
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'                  -- 1
     AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM annonces_plateforme a
        WHERE a.user_id = j.user_id AND a.platform = j.platform
          AND a.listing_id = btrim(j.platform_listing_id)                             -- 5
          AND a.statut_plateforme = 'en_ligne'                                        -- 2
          AND a.disparu_le IS NULL                                                    -- 3
          AND a.vu_le > (j.platform_fields ->> 'unavailable_since')::timestamptz);    -- 4
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'levees', 0);
  END IF;
  UPDATE cross_post_jobs SET
    platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price',
                                              'alerte_masquee_pour', 'alerte_masquee_le'])
      || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('at', now(), 'par', 'alerte_lever_revues_plateformes'))
   WHERE id = ANY (v_ids) AND status = 'published';
  GET DIAGNOSTICS n_levees = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'levees', n_levees);
END
$function$;
REVOKE ALL ON FUNCTION public.alerte_lever_revues_plateformes(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alerte_lever_revues_plateformes(uuid, text) TO service_role;

-- À la clôture d'un relevé : ce compte, cette plateforme. Jamais bloquant.
CREATE OR REPLACE FUNCTION public.releve_clos_leve_alertes_disparues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb;
BEGIN
  BEGIN
    v := alerte_lever_revues_plateformes(NEW.user_id, NEW.platform);
    IF COALESCE((v ->> 'levees')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % alerte(s) « plus en ligne » levée(s), annonces revues en ligne', NEW.id, NEW.platform, v ->> 'levees';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues : run % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS vinted_sync_runs_leve_alertes_disparues ON public.vinted_sync_runs;
CREATE TRIGGER vinted_sync_runs_leve_alertes_disparues
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NEW.kind = 'annonces'
        AND NEW.platform IN ('leboncoin', 'ebay', 'beebs', 'opla'))
  EXECUTE FUNCTION public.releve_clos_leve_alertes_disparues();

-- Une fois maintenant, pour tout le parc.
SELECT public.alerte_lever_revues_plateformes(NULL, NULL) AS levees_initiales;

COMMIT;
