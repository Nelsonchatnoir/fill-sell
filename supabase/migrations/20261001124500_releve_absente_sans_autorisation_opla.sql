-- ═══════════════════════════════════════════════════════════════════════════
-- REPRISE DES RELEVÉS « ABSENTE » : PAS L'AUTORISATION OPLA (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de 20261001110000 (mesuré en service le 01/10 matin) : un relevé Opla
-- « accès Opla non accordé » reposé reste en file sur un poste sans
-- l'autorisation (get-pending-jobs le garde pour un poste qui l'a) ou revient
-- identique. Ce n'est pas un « pas connecté » : l'autorisation est un geste
-- dans l'extension, et handler-watch reprend le relevé quand elle est donnée.
-- Seul changement : ce motif est sauté. Recensement du 01/10 : 7 des 17 Opla.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.reprendre_releves_absents(p_user uuid, p_simulation boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ext timestamptz; v_ver text; v_ps jsonb; v_decl jsonb;
  v_min integer; v_code integer;
  v_out jsonb := '{}'::jsonb;
  r record; v_n integer; v_id uuid;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  SELECT extension_last_seen_at, extension_version, COALESCE(platform_settings, '{}'::jsonb)
    INTO v_ext, v_ver, v_ps FROM profiles WHERE id = p_user;
  IF v_ext IS NULL OR v_ext < now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_pas_vivante');
  END IF;
  IF NOT sync_multi_ouverte_pour(p_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'releve_ferme');
  END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  IF v_min > 0 AND v_code < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne');
  END IF;
  v_decl := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur') = 'array' THEN v_ps -> 'plateformes_vendeur' ELSE '[]'::jsonb END;

  -- Le DERNIER relevé de chaque plateforme fait foi (tous statuts sauf
  -- annulé) : un relevé réussi, en file ou en cours après le mur sort la
  -- plateforme des candidats.
  FOR r IN
    SELECT DISTINCT ON (s.platform) s.platform, s.status, s.erreur,
           COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) AS fin
      FROM vinted_sync_runs s
     WHERE s.user_id = p_user AND s.kind = 'annonces'
       AND s.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND s.status <> 'cancelled'
     ORDER BY s.platform, COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) DESC NULLS LAST
  LOOP
    IF r.status <> 'absente' THEN CONTINUE; END IF;
    -- (01/10, après mise en service) « accès Opla non accordé » n'est pas un
    -- « pas connecté » : c'est l'autorisation à donner dans l'extension, un
    -- geste ; un relevé reposé ne peut rien y changer (et reste en file quand
    -- le poste n'a pas l'accès). handler-watch le reprend à l'autorisation.
    IF COALESCE(r.erreur, '') ~* 'opla non accord' THEN
      v_out := v_out || jsonb_build_object(r.platform, 'autorisation_opla'); CONTINUE;
    END IF;
    IF plateforme_ecartee_pour(p_user, r.platform) THEN
      v_out := v_out || jsonb_build_object(r.platform, 'ecartee'); CONTINUE;
    END IF;
    IF NOT ((v_decl ? r.platform) OR releve_compte_avait_annonces(p_user, r.platform)) THEN
      v_out := v_out || jsonb_build_object(r.platform, 'non_declaree_sans_annonce'); CONTINUE;
    END IF;
    IF r.fin IS NOT NULL AND r.fin > now() - interval '8 hours' THEN
      v_out := v_out || jsonb_build_object(r.platform, 'attente_8h'); CONTINUE;
    END IF;
    SELECT count(*) INTO v_n FROM vinted_sync_runs s
     WHERE s.user_id = p_user AND s.kind = 'annonces' AND s.platform = r.platform
       AND s.declencheur LIKE 'serveur:reprise_absente%' AND s.queued_at > now() - interval '24 hours';
    IF v_n >= 3 THEN
      v_out := v_out || jsonb_build_object(r.platform, 'plafond_24h'); CONTINUE;
    END IF;
    IF p_simulation THEN
      v_out := v_out || jsonb_build_object(r.platform, 'a_reprendre'); CONTINUE;
    END IF;
    BEGIN
      INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
      VALUES (p_user, 'annonces', r.platform, 'queued', 'serveur:reprise_absente', now())
      RETURNING id INTO v_id;
      v_out := v_out || jsonb_build_object(r.platform, 'queued');
    EXCEPTION
      WHEN unique_violation THEN v_out := v_out || jsonb_build_object(r.platform, 'deja_en_file');
      WHEN raise_exception THEN v_out := v_out || jsonb_build_object(r.platform, 'refuse_par_garde');
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'plateformes', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.reprendre_releves_absents(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprendre_releves_absents(uuid, boolean) TO service_role;
