-- ══════════════════════════════════════════════════════════════════════════
-- UN RELEVÉ TOMBÉ SUR « PAS CONNECTÉ » SE REFAIT TOUT SEUL (01/10/2026)
-- ══════════════════════════════════════════════════════════════════════════
-- Cas fondateur : mariecreativedigital. Son premier relevé Leboncoin (30/09
-- 14:41) tombe sur la page de connexion → statut « absente ». Plus AUCUN
-- relevé Leboncoin ensuite, alors que son extension tournait et qu'elle était
-- connectée : l'app l'affichait « non reliée ».
--
-- Pourquoi personne ne le refaisait :
--   · l'alarme quotidienne de l'extension (releverQuotidien) ne relève qu'une
--     plateforme où le compte a un dépôt en ligne ou une annonce relevée en
--     attente — un premier relevé raté n'en laisse aucune ;
--   · la reprise de handler-watch (« reprise_connexion ») attend que la SONDE
--     dise « connecté » ; or Leboncoin répond 403 à la sonde chez 59 comptes
--     actifs sur 62 : la sonde ne dit jamais oui ;
--   · planifier_premiers_releves ne repose que les PREMIERS relevés (3 essais),
--     et seulement si la sonde a bougé.
-- Mesuré le 01/10 (comptes vus à 7 jours, dernier relevé « absente », jamais
-- refait) : Leboncoin 28, eBay 37, Beebs 29, Opla 17.
--
-- LA RÈGLE : le relevé EST la sonde. Quand le dernier relevé d'une plateforme
-- s'est arrêté sur « absente », il est reposé tel quel, sans attendre une
-- sonde, aux conditions suivantes — toutes à la fois :
--   · l'extension est VIVANTE : appel depuis get-pending-jobs (le poll même),
--     extension vue dans les 15 dernières minutes, version capable ;
--   · la plateforme est DÉCLARÉE par la personne (platform_settings.
--     plateformes_vendeur) ou elle y a DÉJÀ des annonces
--     (releve_compte_avait_annonces) ; jamais une plateforme écartée ;
--   · rien en file ni en cours pour cette plateforme (l'index un_seul_actif
--     reste juge) ;
--   · QUELQUES FOIS PAR JOUR AU PLUS : 8 h depuis la fin du dernier relevé de
--     la plateforme, et au plus 3 reprises de ce type sur 24 h glissantes.
-- Aucune conclusion n'est tirée de ces relevés au-delà de ce que fait déjà un
-- relevé normal : un relevé « absente » reste incomplet (« [incomplet] »),
-- jamais un verdict.
--
-- p_simulation = true : rien n'est écrit, on lit le verdict par plateforme
-- (recensement du parc, rejeu à blanc).
-- ══════════════════════════════════════════════════════════════════════════

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
    SELECT DISTINCT ON (s.platform) s.platform, s.status,
           COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) AS fin
      FROM vinted_sync_runs s
     WHERE s.user_id = p_user AND s.kind = 'annonces'
       AND s.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND s.status <> 'cancelled'
     ORDER BY s.platform, COALESCE(s.finished_at, s.updated_at, s.queued_at, s.started_at) DESC NULLS LAST
  LOOP
    IF r.status <> 'absente' THEN CONTINUE; END IF;
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

COMMENT ON FUNCTION public.reprendre_releves_absents(uuid, boolean) IS
  '01/10 — relevé « absente » reposé au poll d''une extension vivante (plateforme déclarée ou avec annonces), 8 h d''écart, 3 par 24 h. p_simulation = verdict sans écriture.';
