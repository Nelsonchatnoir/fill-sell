-- INVERSE de 20261116210000_comptes_plateforme_questions_annonces_disparues (16/11/2026 soir) : le corps de prod de remplacer_compte_plateforme_pour relu le 16/11
-- vers 15:45, à l'octet (md5 1318d9a665de83af53cdffa9119dcf65). Aucune donnée touchée (les tâches closes par un remplacement se défont par
-- l'inverse de ce remplacement : trace comptes_plateforme_remplacements).
-- Jouer : npx supabase db query --linked -f supabase/rollbacks/20261116210000_comptes_plateforme_questions_annonces_disparues_INVERSE.sql
--         npx supabase migration repair --linked --status reverted 20261116210000
BEGIN;
DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)'::regprocedure)) <> '1318d9a665de83af53cdffa9119dcf65'
     AND md5(replace(pg_get_functiondef('public.remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)'::regprocedure), chr(13), '')) <> 'e6e519be378394fc7fa9eba2d38330cc' THEN
    RAISE EXCEPTION 'remplacer_compte_plateforme_pour a changé depuis la migration : relire, jamais forcer';
  END IF;
END $verif$;
DO $restaure$
BEGIN
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.remplacer_compte_plateforme_pour(p_user uuid, p_platform text, p_compte text, p_simuler boolean DEFAULT true, p_par text DEFAULT 'utilisateur'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_compte text := NULLIF(btrim(p_compte), '');
  v_now timestamptz := now();
  v_jour text := to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM');
  d record;
  v_suivi text;
  v_anciens text[];
  v_annonces uuid[]; v_annonces_engagees uuid[];
  v_taches uuid[]; v_ventes uuid[]; v_reps uuid[]; v_reps_engagees uuid[]; v_retraits uuid[]; v_retraits_laisses uuid[];
  v_bilan jsonb; v_avant jsonb; v_id uuid;
  n_annonces int := 0; n_taches int := 0; n_reps int := 0; n_retraits int := 0;
  v_msg_tache text; v_msg_rep text; v_msg_retrait text;
BEGIN
  -- L'identité se vérifie ICI (règle du 20/10) : sous une session, seulement SON compte ; serveur et SQL libres.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'remplacer_compte_plateforme : ce compte n''est pas le tien' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'session', 'message', 'Reconnecte-toi à FillSell, puis réessaie.');
  END IF;
  IF p_platform IS DISTINCT FROM 'leboncoin' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'plateforme',
      'message', 'FillSell ne sait remplacer que ton compte Leboncoin pour l''instant.');
  END IF;
  IF v_compte IS NULL OR v_compte !~ '^[A-Za-z0-9-]{3,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_invalide',
      'message', 'Ce compte Leboncoin n''est pas reconnu : lance « Synchroniser » depuis ton ordinateur, puis réessaie.');
  END IF;
  IF p_par IS NULL OR p_par NOT IN ('utilisateur', 'script') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'par');
  END IF;
  IF NOT p_simuler THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('remplacer_compte_plateforme:' || p_user::text || ':' || p_platform, 0));
  END IF;

  -- Le compte doit être celui du DERNIER relevé complet (jamais un texte saisi, jamais un relevé partiel).
  SELECT * INTO d FROM compte_plateforme_dernier_releve(p_user, p_platform);
  IF d.run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'aucun_releve',
      'message', 'Aucun relevé de tes annonces Leboncoin n''a encore lu de compte : lance « Synchroniser » depuis ton ordinateur, puis réessaie.');
  END IF;
  IF d.compte IS DISTINCT FROM v_compte THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'pas_le_dernier_releve', 'compte_lu', d.compte, 'releve_le', d.fini_le,
      'message', 'Ce n''est pas le compte Leboncoin que ton ordinateur a lu en dernier : FillSell ne peut suivre que le compte connecté. Lance « Synchroniser », puis réessaie.');
  END IF;
  IF NOT COALESCE(d.probant, false) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_incomplet', 'releve', d.run_id,
      'message', 'Le dernier relevé de tes annonces Leboncoin n''a pas tout lu : lance « Synchroniser », puis réessaie.');
  END IF;
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform
               AND s.kind IN ('annonces', 'recentes') AND s.status IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours',
      'message', 'Un relevé de tes annonces Leboncoin est en cours : réessaie quand il sera fini.');
  END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.platform = p_platform AND j.status = 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'tache_en_cours',
      'message', 'FillSell travaille en ce moment sur une tâche Leboncoin : réessaie quand elle sera finie.');
  END IF;

  SELECT c.compte INTO v_suivi FROM comptes_plateforme_suivi c
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.etat = 'suivi';

  -- Une republication ENGAGÉE (retrait fait ou en cours : étape 'deleted' et au-delà, ou retrait engagé) va au bout :
  -- ni elle, ni l'annonce qu'elle vise, ni les tâches de sa fiche ne sont touchées (décision 7a de Nico, 31/10 : « tant
  -- qu'une republication est engagée, l'ancienne annonce n'est jamais datée disparue »). Une republication à l'étape
  -- 'a_capturer' ou 'captured' n'a rien retiré sur la plateforme : elle est close plus bas.
  SELECT COALESCE(array_agg(j.id), '{}') INTO v_reps_engagees
    FROM cross_post_jobs j
   WHERE j.user_id = p_user AND j.platform = p_platform AND j.action = 'republish' AND j.status IN ('pending', 'processing', 'needs_user')
     AND (COALESCE(j.platform_fields ->> 'republish_step', '') NOT IN ('', 'a_capturer', 'captured')
          OR republication_retrait_engage(j.platform_fields));
  -- Les annonces vivantes des AUTRES comptes connus (compte inconnu : jamais touchées ici).
  SELECT COALESCE(array_agg(a.id ORDER BY a.listing_id) FILTER (WHERE NOT x.engagee), '{}'),
         COALESCE(array_agg(a.id ORDER BY a.listing_id) FILTER (WHERE x.engagee), '{}')
    INTO v_annonces, v_annonces_engagees
    FROM annonces_plateforme a
    CROSS JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM cross_post_jobs j WHERE j.id = ANY (v_reps_engagees)
               AND (j.inventaire_id = a.inventaire_id
                    OR a.listing_id IN (NULLIF(btrim(j.platform_listing_id), ''),
                                        NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''),
                                        NULLIF(btrim(j.platform_fields #>> '{republish_snapshot,platform_listing_id}'), ''),
                                        annonce_id_de_job(j.platform_listing_id, j.listing_url)))) AS engagee) x
   WHERE a.user_id = p_user AND a.platform = p_platform AND a.disparu_le IS NULL
     AND NULLIF(btrim(a.compte_plateforme), '') IS NOT NULL AND a.compte_plateforme <> v_compte;
  SELECT COALESCE(array_agg(DISTINCT x.c ORDER BY x.c), '{}') INTO v_anciens
    FROM (SELECT a.compte_plateforme AS c FROM annonces_plateforme a WHERE a.id = ANY (v_annonces || v_annonces_engagees)
          UNION SELECT v_suivi WHERE v_suivi IS NOT NULL AND v_suivi <> v_compte) x;

  IF v_suivi = v_compte AND cardinality(v_annonces) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'deja', true, 'simulation', p_simuler, 'platform', p_platform, 'compte_suivi', v_compte,
      'message', 'FillSell suit déjà ce compte Leboncoin.');
  END IF;

  -- Les tâches qui désignent ces annonces.
  WITH anc AS (SELECT a.listing_id FROM annonces_plateforme a WHERE a.id = ANY (v_annonces)),
  tj AS (SELECT j.id, j.action, j.status, j.platform_fields AS pf,
               EXISTS (SELECT 1 FROM anc WHERE listing_designe(anc.listing_id, j.listing_url, j.platform_listing_id)) AS designe,
               EXISTS (SELECT 1 FROM anc WHERE anc.listing_id IN (
                         NULLIF(btrim(j.platform_listing_id), ''),
                         NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''),
                         NULLIF(btrim(j.platform_fields #>> '{republish_snapshot,platform_listing_id}'), ''),
                         annonce_id_de_job(j.platform_listing_id, j.listing_url))) AS vise
          FROM cross_post_jobs j
         WHERE j.user_id = p_user AND j.platform = p_platform AND j.status IN ('published', 'pending', 'needs_user', 'failed'))
  SELECT COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                                            AND (j.pf ->> 'sale_signal') IS DISTINCT FROM 'sold'), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                                            AND (j.pf ->> 'sale_signal') = 'sold'), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.vise AND j.action = 'republish' AND j.status IN ('pending', 'needs_user')
                                            AND COALESCE(j.pf ->> 'republish_step', '') IN ('', 'a_capturer', 'captured')
                                            AND NOT republication_retrait_engage(j.pf)), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.action = 'delete' AND j.status IN ('pending', 'needs_user', 'failed')
                                            AND NOT EXISTS (SELECT 1 FROM inventaire_doublons q
                                                             WHERE q.user_id = p_user AND q.statut = 'fusionnee' AND q.fusion_id IS NOT NULL
                                                               AND q.preuves ? 'retraits_oui' AND (q.preuves -> 'retraits_oui') ? j.id::text)), '{}'),
         COALESCE(array_agg(j.id) FILTER (WHERE j.designe AND j.action = 'delete' AND j.status IN ('pending', 'needs_user', 'failed')
                                            AND EXISTS (SELECT 1 FROM inventaire_doublons q
                                                         WHERE q.user_id = p_user AND q.statut = 'fusionnee' AND q.fusion_id IS NOT NULL
                                                           AND q.preuves ? 'retraits_oui' AND (q.preuves -> 'retraits_oui') ? j.id::text)), '{}')
    INTO v_taches, v_ventes, v_reps, v_retraits, v_retraits_laisses
    FROM tj j;

  v_bilan := jsonb_build_object(
    'platform', p_platform, 'nouveau', v_compte, 'compte_suivi_avant', v_suivi, 'anciens', to_jsonb(v_anciens),
    'releve', jsonb_build_object('run', d.run_id, 'le', d.fini_le, 'annonces_lues', d.lues),
    'annonces', cardinality(v_annonces),
    'annonces_sur_fiche', (SELECT count(*) FROM annonces_plateforme a WHERE a.id = ANY (v_annonces) AND a.inventaire_id IS NOT NULL),
    'fiches_au_stock', (SELECT count(DISTINCT a.inventaire_id) FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                         WHERE a.id = ANY (v_annonces) AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND NOT article_vendu(i.id)),
    -- Celles dont la place Leboncoin se libère (plus aucune tâche publiée ni en file après la clôture).
    'fiches_liberees', (SELECT count(DISTINCT a.inventaire_id) FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                         WHERE a.id = ANY (v_annonces) AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND NOT article_vendu(i.id)
                           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs c
                                            WHERE c.user_id = p_user AND c.inventaire_id = a.inventaire_id AND c.platform = p_platform
                                              AND COALESCE(c.action, 'publish') <> 'delete'
                                              AND c.status IN ('published', 'pending', 'processing', 'needs_user')
                                              AND NOT (c.id = ANY (v_taches || v_reps)))),
    'objets_vendus_encore_en_ligne', COALESCE((SELECT jsonb_agg(jsonb_build_object('fiche', a.inventaire_id, 'titre', i.titre,
                                                  'numero', a.listing_id, 'lien', a.url, 'compte', a.compte_plateforme, 'vue_le', a.vu_le)
                                                  ORDER BY a.listing_id)
                                                FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id
                                               WHERE a.id = ANY (v_annonces) AND article_vendu(i.id)), '[]'::jsonb),
    'annonces_compte_inconnu_non_touchees', (SELECT count(*) FROM annonces_plateforme a
                                             WHERE a.user_id = p_user AND a.platform = p_platform AND a.disparu_le IS NULL
                                               AND NULLIF(btrim(a.compte_plateforme), '') IS NULL),
    'taches_publiees', cardinality(v_taches),
    -- Les questions « Vendue ? » ouvertes (deux lectures hors ligne) et les premières lectures, closes avec leur tâche.
    'questions_vendue', (SELECT count(*) FROM cross_post_jobs j WHERE j.id = ANY (v_taches) AND j.platform_fields ->> 'sale_signal' = 'unavailable'),
    'premieres_lectures_hors_ligne', (SELECT count(*) FROM cross_post_jobs j WHERE j.id = ANY (v_taches)
                                       AND j.platform_fields ? 'unavailable_pending_since' AND NOT (j.platform_fields ? 'unavailable_since')),
    'taches_vente_en_attente_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'titre', i.titre,
                                                     'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url)))
                                                   FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
                                                  WHERE j.id = ANY (v_ventes)), '[]'::jsonb),
    'republications', cardinality(v_reps),
    'annonces_republication_engagee_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('numero', a.listing_id, 'fiche', a.inventaire_id)
                                                           ORDER BY a.listing_id)
                                                         FROM annonces_plateforme a WHERE a.id = ANY (v_annonces_engagees)), '[]'::jsonb),
    'republications_engagees_laissees', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id,
                                                     'etape', j.platform_fields ->> 'republish_step'))
                                                   FROM cross_post_jobs j WHERE j.id = ANY (v_reps_engagees)
                                                    AND EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.id = ANY (v_annonces_engagees)
                                                                  AND (a.inventaire_id = j.inventaire_id
                                                                       OR a.listing_id IN (NULLIF(btrim(j.platform_listing_id), ''),
                                                                                           NULLIF(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''))))), '[]'::jsonb),
    'retraits', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'titre', i.titre, 'statut', j.status,
                             'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url), 'lien', j.listing_url))
                           FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id WHERE j.id = ANY (v_retraits)), '[]'::jsonb),
    'retraits_laisses', COALESCE((SELECT jsonb_agg(jsonb_build_object('tache', j.id, 'fiche', j.inventaire_id, 'statut', j.status,
                                     'numero', annonce_id_de_job(j.platform_listing_id, j.listing_url), 'motif', 'fusion_deja_vendu'))
                                   FROM cross_post_jobs j WHERE j.id = ANY (v_retraits_laisses)), '[]'::jsonb));

  IF p_simuler THEN
    RETURN jsonb_build_object('ok', true, 'simulation', true) || v_bilan;
  END IF;

  -- ── L'écriture (une transaction ; l'état d'avant d'abord) ──
  v_avant := jsonb_build_object(
    'annonces', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'disparu_le', a.disparu_le,
                            'compte_quitte_le', a.compte_quitte_le, 'updated_at', a.updated_at))
                          FROM annonces_plateforme a WHERE a.id = ANY (v_annonces)), '[]'::jsonb),
    'taches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status, 'error', j.error,
                          'platform_fields', j.platform_fields, 'reservation_settled_at', j.reservation_settled_at))
                        FROM cross_post_jobs j WHERE j.id = ANY (v_taches || v_reps || v_retraits)), '[]'::jsonb),
    'registre', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM comptes_plateforme_suivi c
                          WHERE c.user_id = p_user AND c.platform = p_platform), '[]'::jsonb));
  INSERT INTO comptes_plateforme_remplacements (user_id, platform, anciens, nouveau, le, par, bilan, avant)
  VALUES (p_user, p_platform, v_anciens, v_compte, v_now, p_par, v_bilan, v_avant)
  RETURNING id INTO v_id;

  v_msg_tache := 'Ancien compte Leboncoin quitté le ' || v_jour
              || ', ce n''est pas une vente : FillSell ne suit plus cette annonce et n''a rien retiré.';
  v_msg_rep := 'Republication arrêtée : l''annonce est sur ton ancien compte Leboncoin, que FillSell ne suit plus depuis le '
            || v_jour || '. Ce n''est pas une vente.';
  v_msg_retrait := 'FillSell ne peut plus retirer cette annonce : elle est sur ton ancien compte Leboncoin. '
                || 'Si ce compte est encore ouvert, retire-la toi-même.';

  -- a. Les annonces : closes, jamais « retirées » (retiree_le), jamais déliées de leur fiche.
  UPDATE annonces_plateforme a SET disparu_le = v_now, compte_quitte_le = v_now, updated_at = v_now
   WHERE a.id = ANY (v_annonces) AND a.disparu_le IS NULL AND a.compte_plateforme <> v_compte;
  GET DIAGNOSTICS n_annonces = ROW_COUNT;
  -- b. Les tâches publiées qui les désignent (jamais une tâche vendue ni porteuse d'un signal de vente). Leur question
  --    « Vendue ? » (sale_signal 'unavailable', ou première lecture hors ligne) est close avec elles : le signal part
  --    (gardé dans compte_quitte.signal_avant), jamais une vente, jamais un retrait des copies.
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_tache,
         platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb)
                              - ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
           || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error,
           'signal_avant', CASE WHEN j.platform_fields ?| ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since']
                                THEN jsonb_build_object('sale_signal', j.platform_fields -> 'sale_signal',
                                       'unavailable_since', j.platform_fields -> 'unavailable_since',
                                       'unavailable_pending_since', j.platform_fields -> 'unavailable_pending_since') END))
   WHERE j.id = ANY (v_taches) AND j.status = 'published' AND (j.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold';
  GET DIAGNOSTICS n_taches = ROW_COUNT;
  -- c. Les republications pas encore engagées sur elles (rien n'a été retiré sur la plateforme).
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_rep,
         platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error))
   WHERE j.id = ANY (v_reps) AND j.status IN ('pending', 'needs_user')
     AND COALESCE(j.platform_fields ->> 'republish_step', '') IN ('', 'a_capturer', 'captured')
     AND NOT republication_retrait_engage(j.platform_fields);
  GET DIAGNOSTICS n_reps = ROW_COUNT;
  -- d. Les retraits en attente sur elles : FillSell ne peut plus les faire (listés dans le bilan).
  UPDATE cross_post_jobs j SET status = 'cancelled', error = v_msg_retrait,
         platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('compte_quitte', jsonb_build_object(
           'remplacement', v_id, 'nouveau', v_compte, 'le', v_now, 'statut_avant', j.status, 'erreur_avant', j.error))
   WHERE j.id = ANY (v_retraits) AND j.status IN ('pending', 'needs_user', 'failed');
  GET DIAGNOSTICS n_retraits = ROW_COUNT;

  -- e. Le registre : les anciens comptes quittés, le compte lu suivi.
  UPDATE comptes_plateforme_suivi c SET etat = 'quitte', quitte_le = v_now, remplace_par = v_compte, decide_le = v_now, decide_par = p_par
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.etat = 'suivi' AND c.compte <> v_compte;
  INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_le, decide_par, quitte_le, remplace_par)
  SELECT p_user, p_platform, x.c, 'quitte', v_now, p_par, v_now, v_compte FROM unnest(v_anciens) AS x(c)
   WHERE x.c <> v_compte AND x.c ~ '^[A-Za-z0-9-]{3,80}$'
  ON CONFLICT (user_id, platform, compte) DO UPDATE
     SET etat = 'quitte', quitte_le = v_now, remplace_par = v_compte, decide_le = v_now, decide_par = p_par
   WHERE comptes_plateforme_suivi.etat <> 'quitte';
  INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_le, decide_par)
  VALUES (p_user, p_platform, v_compte, 'suivi', v_now, p_par)
  ON CONFLICT (user_id, platform, compte) DO UPDATE
     SET etat = 'suivi', decide_le = v_now, decide_par = p_par, quitte_le = NULL, remplace_par = NULL
   WHERE comptes_plateforme_suivi.etat <> 'suivi';

  v_bilan := v_bilan || jsonb_build_object('annonces_closes', n_annonces, 'taches_closes', n_taches,
    'republications_closes', n_reps, 'retraits_clos', n_retraits);
  UPDATE comptes_plateforme_remplacements SET bilan = v_bilan WHERE id = v_id;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user, 'compte_plateforme_remplace', jsonb_build_object('platform', p_platform, 'anciens', to_jsonb(v_anciens),
    'nouveau', v_compte, 'remplacement', v_id, 'par', p_par, 'annonces', n_annonces, 'taches', n_taches,
    'republications', n_reps, 'retraits', n_retraits));

  -- f. Le rangement des annonces du compte suivi encore sans fiche (le chemin de synchro_relancer_rangement).
  IF EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id = p_user AND a.platform = p_platform AND a.compte_plateforme = v_compte
               AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL) THEN
    BEGIN
      PERFORM rapprochement_demander(p_user, 'compte_plateforme_remplace');
      PERFORM rapprochement_relancer(p_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remplacer_compte_plateforme (%) : rangement non relancé : %', p_user, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulation', false, 'remplacement', v_id) || v_bilan;
END;
$function$$corps$, chr(13), ''), '⟦CR⟧', chr(13));
END $restaure$;
DO $verif_apres$
BEGIN
  IF md5(pg_get_functiondef('public.remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)'::regprocedure)) <> '1318d9a665de83af53cdffa9119dcf65' THEN
    RAISE EXCEPTION 'remplacer_compte_plateforme_pour : le corps remis n''est pas celui de prod (md5 attendu 1318d9a665de83af53cdffa9119dcf65)';
  END IF;
END $verif_apres$;
COMMIT;
