-- ═══════════════════════════════════════════════════════════════════════════
-- FAUX « DÉCONNECTÉ » : UNE SESSION REVUE BONNE RELANCE TOUT DE SUITE LES JOBS
-- PARQUÉS POUR « CONNEXION » (2026-09-27, point 19, partie serveur)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constats du 27/09 :
--   · louis (Business, deux profils Chrome sur le même compte) : 3 dépôts Vinted
--     « En attente de ta connexion à Vinted » pendant une heure, repoussés
--     d'environ 1 h à chaque essai, alors que la sonde disait Vinted connecté
--     (11:23, 12:33) — partis seulement après des relances à la main ;
--   · samazer59 : 3 dépôts Opla « Connexion Opla requise » alors que ses relevés
--     Opla réussissaient à 12:09 et 12:11 — partis après relance.
-- Règle de Nico : une preuve de session bonne (sonde de l'extension, ou relevé
-- réussi de la plateforme) remet IMMÉDIATEMENT en file tous les jobs du compte
-- et de la plateforme parqués pour « connexion » — statut, needs_user_source,
-- next_action_after et message nettoyés.
--
-- relancer_jobs_connexion(user, plateforme, preuve, preuve_le) :
--   · parqués pour « connexion » = pending en attente de session (marqueur
--     attente_session + message « En attente de ta connexion à … »), ou
--     needs_user classé « connexion » (pas_de_rouge.motif), « session_vinted »,
--     ou dont le message est un mur « Connexion|Reconnexion X requise » —
--     JAMAIS un blocage anti-robot (message, blocage_antirobot,
--     attente_antirobot_compte) : le relancer re-taperait la porte ;
--     plateformes vinted, leboncoin, beebs, opla (eBay garde son mécanisme :
--     sa sonde ne voit pas le mur de vente) ; créés il y a moins de 30 jours ;
--   · la preuve doit être POSTÉRIEURE au parcage (sinon rien) ;
--   · jamais un job qui attend une réponse à une question (needsUserField),
--     jamais un article vendu ;
--   · ZÉRO DOUBLON : une publication relancée porte
--     verifier_doublon_avant_publication — l'extension regarde « Mes annonces »
--     avant de redéposer (même filet que la reprise serveur d'un job
--     interrompu) ;
--   · PAS DE RAFALE : le premier job repart tout de suite, les suivants
--     s'échelonnent (90 s sur Vinted, 45 s ailleurs) ;
--   · anti-boucle : au plus 6 relances par ce mécanisme et par job en 24 h
--     (reprise_connexion.n) — au-delà le job reste parqué, affiché comme avant.
-- relancer_jobs_connexion_echus() — appelé par handler-watch (toutes les
--   3 min) : un job needs_user parqué « connexion » par la classification
--   rejoint l'ATTENTE DE SESSION — même message « En attente de ta connexion à
--   … » (une vraie déconnexion reste affichée), nouvel essai seul 3 min après le
--   parcage puis au barème court de _shared/attente-session.js (3, 6, 10 min,
--   puis horaire) ; trois conversions au plus par job, ensuite il reste
--   needs_user, affiché comme avant.
-- Déclencheurs : profiles (la sonde écrit true pour une plateforme, horodatage
--   neuf) ; vinted_sync_runs (relevé « annonces » ou « dressing » clos done avec
--   au moins une annonce lue).
-- Balayage : les jobs parqués aujourd'hui alors que la session est prouvée
--   bonne dans les 2 h (sonde ou relevé) repartent par le même mécanisme.

CREATE OR REPLACE FUNCTION public._ts_ou_null(p text)
 RETURNS timestamptz
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.relancer_jobs_connexion(p_user uuid, p_platform text, p_preuve text, p_preuve_le timestamptz)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        record;
  v_pf     jsonb;
  v_parque timestamptz;
  v_rc     jsonb;
  v_n      integer;
  v_i      integer := 0;
  v_pas    interval;
  v_fait   integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla') THEN
    RETURN 0;
  END IF;
  v_pas := CASE WHEN p_platform = 'vinted' THEN interval '90 seconds' ELSE interval '45 seconds' END;
  FOR r IN
    SELECT c.id, c.status, c.action, c.inventaire_id, COALESCE(c.platform_fields, '{}'::jsonb) AS pf
      FROM cross_post_jobs c
     WHERE c.user_id = p_user AND c.platform = p_platform
       AND c.created_at > now() - interval '30 days'
       AND (
         (c.status = 'pending' AND c.platform_fields ? 'attente_session'
            AND c.error ~* '^En attente de ta connexion à ')
         OR (c.status = 'needs_user'
            -- Jamais un blocage anti-robot : le relancer, c'est re-taper la porte.
            AND c.error !~* '(anti-?robot|datadome)'
            AND NOT (c.platform_fields ? 'blocage_antirobot')
            AND NOT (c.platform_fields ? 'attente_antirobot_compte')
            AND (c.platform_fields->>'needs_user_source' = 'session_vinted'
                 OR c.platform_fields->'pas_de_rouge'->>'motif' = 'connexion'
                 OR c.error ~* '^(Connexion|Reconnexion) \S+ requise'))
       )
     ORDER BY c.created_at
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_pf := r.pf;
      -- Une question de champ attend une réponse : ce n'est pas un mur de connexion.
      IF v_pf ? 'needsUserField' THEN CONTINUE; END IF;
      -- La preuve doit être POSTÉRIEURE au parcage.
      v_parque := GREATEST(
        _ts_ou_null(v_pf->'attente_session'->>'derniere'),
        _ts_ou_null(v_pf->'attente_session'->>'depuis'),
        _ts_ou_null(v_pf->'pas_de_rouge'->>'at'),
        _ts_ou_null(v_pf->>'needs_user_vu_le'),
        _ts_ou_null(v_pf->'reprise_connexion'->>'le'));
      IF p_preuve_le IS NOT NULL AND v_parque IS NOT NULL AND p_preuve_le <= v_parque THEN CONTINUE; END IF;
      -- Anti-boucle : 6 relances au plus par 24 h.
      v_rc := CASE WHEN jsonb_typeof(v_pf->'reprise_connexion') = 'object' THEN v_pf->'reprise_connexion' ELSE '{}'::jsonb END;
      v_n := CASE WHEN _ts_ou_null(v_rc->>'depuis') > now() - interval '24 hours'
                  THEN COALESCE(NULLIF(v_rc->>'n', '')::integer, 0) ELSE 0 END;
      IF v_n >= 6 THEN CONTINUE; END IF;
      -- Jamais un article vendu.
      IF r.inventaire_id IS NOT NULL AND COALESCE(r.action, 'publish') IN ('publish', 'republish')
         AND article_vendu(r.inventaire_id) THEN
        CONTINUE;
      END IF;

      v_pf := v_pf - 'needs_user_source' - 'next_action_after' - 'attente_session'
                   - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                   - 'needsUserAttempts' - 'needsUserBoucle' - 'needsUserResolved' - 'error_technique'
                   - 'processing_since';
      v_pf := v_pf || jsonb_build_object('reprise_connexion', jsonb_build_object(
        'le', now(), 'preuve', p_preuve, 'preuve_le', p_preuve_le,
        'depuis', CASE WHEN v_n = 0 THEN now()::text ELSE v_rc->>'depuis' END,
        'n', v_n + 1, 'etait', r.status));
      IF COALESCE(r.action, 'publish') = 'publish' THEN
        v_pf := v_pf || jsonb_build_object('verifier_doublon_avant_publication', true);
      END IF;
      IF v_i > 0 THEN
        v_pf := v_pf || jsonb_build_object('next_action_after', (now() + v_pas * v_i)::text);
      END IF;

      UPDATE cross_post_jobs SET status = 'pending', error = NULL, platform_fields = v_pf
       WHERE id = r.id AND status = r.status;
      IF FOUND THEN v_fait := v_fait + 1; v_i := v_i + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'relancer_jobs_connexion (job %) : %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_fait;
END
$function$;

CREATE OR REPLACE FUNCTION public.relancer_jobs_connexion_echus()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r       record;
  v_pf    jsonb;
  v_rc    jsonb;
  v_k     integer;
  v_at    timestamptz;
  v_label text;
  v_quoi  text;
  v_fait  integer := 0;
BEGIN
  -- Un job needs_user parqué « connexion » par la classification (pas-de-rouge)
  -- rejoint l'ATTENTE DE SESSION : même message « En attente de ta connexion
  -- à … » (une vraie déconnexion reste affichée), mais nouvel essai seul après
  -- 3 min, puis au barème court (6, 10 min) puis horaire — et relance immédiate
  -- dès qu'une sonde ou un relevé prouve la session. Trois conversions au plus
  -- par job : au-delà, il reste needs_user, affiché comme avant.
  FOR r IN
    SELECT c.id, c.platform, c.action, c.error, c.inventaire_id, COALESCE(c.platform_fields, '{}'::jsonb) AS pf
      FROM cross_post_jobs c
     WHERE c.status = 'needs_user'
       AND c.platform IN ('vinted', 'leboncoin', 'beebs', 'opla')
       AND c.created_at > now() - interval '30 days'
       AND c.platform_fields->>'needs_user_source' = 'connexion'
       AND c.platform_fields->'pas_de_rouge'->>'motif' = 'connexion'
       AND c.error !~* '(anti-?robot|datadome)'
       AND NOT (c.platform_fields ? 'blocage_antirobot')
       AND NOT (c.platform_fields ? 'attente_antirobot_compte')
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_pf := r.pf;
      IF v_pf ? 'needsUserField' THEN CONTINUE; END IF;
      v_rc := CASE WHEN jsonb_typeof(v_pf->'reprise_differee') = 'object' THEN v_pf->'reprise_differee' ELSE '{}'::jsonb END;
      v_k := COALESCE(NULLIF(v_rc->>'n', '')::integer, 0);
      IF v_k >= 3 THEN CONTINUE; END IF;
      -- Le moment du parcage ; inconnu → on ne devine pas, on ne touche pas.
      v_at := _ts_ou_null(v_pf->'pas_de_rouge'->>'at');
      IF v_at IS NULL OR v_at < now() - interval '2 days' THEN CONTINUE; END IF;
      -- Déjà converti pour CE parcage.
      IF _ts_ou_null(v_rc->>'parcage') IS NOT DISTINCT FROM v_at THEN CONTINUE; END IF;
      IF r.inventaire_id IS NOT NULL AND COALESCE(r.action, 'publish') IN ('publish', 'republish')
         AND article_vendu(r.inventaire_id) THEN
        CONTINUE;
      END IF;
      v_label := CASE r.platform WHEN 'vinted' THEN 'Vinted' WHEN 'leboncoin' THEN 'Leboncoin'
                                 WHEN 'beebs' THEN 'Beebs' ELSE 'Opla' END;
      v_quoi := CASE COALESCE(r.action, 'publish') WHEN 'delete' THEN 'le retrait de l''annonce'
                                                    WHEN 'republish' THEN 'la republication' ELSE 'la publication' END;
      v_pf := v_pf - 'needs_user_source' - 'next_action_after'
                   - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                   - 'needsUserBoucle' - 'needsUserResolved' - 'error_technique' - 'processing_since';
      v_pf := v_pf || jsonb_build_object(
        'attente_session', jsonb_build_object(
          'platform', r.platform, 'depuis', v_at, 'derniere', v_at, 'observations', 1,
          'motif', left(COALESCE(r.error, ''), 300),
          'reconnu_par', 'classification « connexion » (pas-de-rouge)',
          'pose_par', 'relancer_jobs_connexion_echus'),
        'next_action_after', (v_at + interval '3 minutes')::text,
        'reprise_differee', jsonb_build_object('le', now(), 'n', v_k + 1, 'parcage', v_at));
      IF COALESCE(r.action, 'publish') = 'publish' THEN
        v_pf := v_pf || jsonb_build_object('verifier_doublon_avant_publication', true);
      END IF;
      UPDATE cross_post_jobs SET
        status = 'pending',
        error = 'En attente de ta connexion à ' || v_label || ' dans Chrome : ' || v_quoi
                || ' repartira toute seule dès que tu seras reconnecté(e).',
        platform_fields = v_pf
       WHERE id = r.id AND status = 'needs_user';
      IF FOUND THEN v_fait := v_fait + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'relancer_jobs_connexion_echus (job %) : %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_fait;
END
$function$;

-- ── Déclencheur 1 : la sonde de l'extension écrit « true » pour une plateforme ──
CREATE OR REPLACE FUNCTION public.profiles_session_revue_bonne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf text;
  v_le text;
BEGIN
  BEGIN
    FOREACH v_pf IN ARRAY ARRAY['vinted', 'leboncoin', 'beebs', 'opla'] LOOP
      IF (NEW.extension_sessions->>v_pf) = 'true' THEN
        v_le := NEW.extension_sessions->'checked_at_par_plateforme'->>v_pf;
        IF v_le IS NOT NULL AND v_le IS DISTINCT FROM (OLD.extension_sessions->'checked_at_par_plateforme'->>v_pf) THEN
          PERFORM relancer_jobs_connexion(NEW.id, v_pf, 'sonde', _ts_ou_null(v_le));
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un point de panne de l'écriture de la sonde.
    RAISE WARNING 'profiles_session_revue_bonne (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS profiles_session_revue_bonne ON public.profiles;
CREATE TRIGGER profiles_session_revue_bonne
  AFTER UPDATE OF extension_sessions ON public.profiles
  FOR EACH ROW
  WHEN (NEW.extension_sessions IS DISTINCT FROM OLD.extension_sessions)
  EXECUTE FUNCTION public.profiles_session_revue_bonne();

-- ── Déclencheur 2 : un relevé de la plateforme réussit ──────────────────────
CREATE OR REPLACE FUNCTION public.releve_reussi_relance_connexion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF COALESCE(NEW.items_vus, 0) > 0 THEN
      PERFORM relancer_jobs_connexion(NEW.user_id, NEW.platform, 'releve', COALESCE(NEW.finished_at, now()));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_reussi_relance_connexion (run %) : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS releve_reussi_relance_connexion ON public.vinted_sync_runs;
CREATE TRIGGER releve_reussi_relance_connexion
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
        AND NEW.kind IN ('annonces', 'dressing')
        AND NEW.platform IN ('vinted', 'leboncoin', 'beebs', 'opla'))
  EXECUTE FUNCTION public.releve_reussi_relance_connexion();

REVOKE ALL ON FUNCTION public._ts_ou_null(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.relancer_jobs_connexion(uuid, text, text, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.relancer_jobs_connexion_echus() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_session_revue_bonne() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.releve_reussi_relance_connexion() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relancer_jobs_connexion_echus() TO service_role;
GRANT EXECUTE ON FUNCTION public.relancer_jobs_connexion(uuid, text, text, timestamptz) TO service_role;

-- ── Balayage : les jobs parqués alors que la session est prouvée bonne ──────
-- (sonde « connecté » ou relevé réussi dans les 2 h) repartent tout de suite.
DO $balayage$
DECLARE r record; v_n integer; v_total integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT c.user_id, c.platform,
      GREATEST(
        CASE WHEN (p.extension_sessions->>c.platform) = 'true'
             THEN _ts_ou_null(p.extension_sessions->'checked_at_par_plateforme'->>c.platform) END,
        (SELECT max(v.finished_at) FROM vinted_sync_runs v
          WHERE v.user_id = c.user_id AND v.platform = c.platform AND v.kind IN ('annonces', 'dressing')
            AND v.status = 'done' AND COALESCE(v.items_vus, 0) > 0)) AS preuve_le
      FROM cross_post_jobs c JOIN profiles p ON p.id = c.user_id
     WHERE c.platform IN ('vinted', 'leboncoin', 'beebs', 'opla')
       AND c.created_at > now() - interval '30 days'
       AND ((c.status = 'pending' AND c.platform_fields ? 'attente_session' AND c.error ~* '^En attente de ta connexion à ')
         OR (c.status = 'needs_user' AND c.error !~* '(anti-?robot|datadome)'
             AND NOT (c.platform_fields ? 'blocage_antirobot') AND NOT (c.platform_fields ? 'attente_antirobot_compte')
             AND (c.platform_fields->>'needs_user_source' = 'session_vinted'
                  OR c.platform_fields->'pas_de_rouge'->>'motif' = 'connexion'
                  OR c.error ~* '^(Connexion|Reconnexion) \S+ requise')))
  LOOP
    IF r.preuve_le IS NOT NULL AND r.preuve_le > now() - interval '2 hours' THEN
      v_n := relancer_jobs_connexion(r.user_id, r.platform, 'balayage (session prouvée dans les 2 h)', r.preuve_le);
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  RAISE NOTICE 'balayage : % job(s) remis en file', v_total;
END
$balayage$;
