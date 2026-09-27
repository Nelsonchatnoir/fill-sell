-- ═══════════════════════════════════════════════════════════════════════════
-- relancer_jobs_connexion_echus : 3, PUIS 6, PUIS 10 MIN (27/09, correctif)
-- APPLIQUÉE le 27/09 à 13:17 après rejeu annulé (droits identiques, 0 job à convertir à cet instant).
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré dans le quart d'heure qui a suivi 20260927113000 (thomas.vinted590002,
-- Opla 840b67ec) : chaque conversion repartait à « parcage + 3 min », soit trois
-- essais en huit minutes au lieu du barème court annoncé. Recopiée de la prod
-- (pg_get_functiondef) ; seule l'échéance change : 3, 6, puis 10 min.

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
        -- (27/09) 3, puis 6, puis 10 min : le barème court, conversion après conversion.
        'next_action_after', (v_at + (CASE v_k WHEN 0 THEN interval '3 minutes' WHEN 1 THEN interval '6 minutes' ELSE interval '10 minutes' END))::text,
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
