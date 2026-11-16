-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261116200000_comptes_plateforme_remplacer (16/11/2026) — remet TOUT comme avant :
--   1. l'état des annonces et des tâches touchées par remplacer_compte_plateforme, relu dans la trace
--      (comptes_plateforme_remplacements.avant), sans déclencher aucun effet (session_replication_role = replica, comme la
--      restauration du 27/09) — seulement les lignes encore dans l'état où le remplacement les a mises ; une tâche dont la
--      clôture a rendu des quotas (republication) ou libéré une réservation n'est PAS remise en file (elle repartirait sans
--      être payée) : nommée dans un avis, à relancer par la personne ;
--   2. les quatre corps de PROD du 16/11, à l'octet (md5 vérifiés à la fin) ;
--   3. les fonctions neuves retirées, la colonne annonces_plateforme.compte_quitte_le retirée, les deux tables retirées
--      (copiées d'abord dans _backup_inv_1611_cps_suivi et _backup_inv_1611_cps_remplacements, sans droit client).
-- Les traces usage_logs 'compte_plateforme_remplace' restent (historique). Compteurs de tâches des comptes touchés :
-- remis à « inconnu » (compte_signal.jobs = NULL : le poll relit tout — la règle du déclencheur en cas d'erreur).
-- Jouer : npx supabase db query --linked -f supabase/rollbacks/20261116200000_comptes_plateforme_remplacer_INVERSE.sql
--         npx supabase migration repair --linked --status reverted 20261116200000
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.annonce_non_prouvee_vivante(uuid,boolean)', '4ed8966c42915e390e9c282fbab7a258', 'bf79cd09cd13f5c024aff81e369c9c59'),
    ('public.constater_absences_releve(uuid)', '5fde069f0af7824eeb5936a06637d288', '16abc7aaede5d89486066737f5f1fff3'),
    ('public.veille_recentes_ouvrir(text,text[],text,text)', 'eaa5af6b6c82d7103dfd9b40d4a20d60', 'e9202262ae9b158177efd65b1c8f96c8'),
    ('public.cross_post_jobs_alerte_tenue()', '140a08f1b40d9278d1dc03f6df20a70e', '94f419b666e098b8e5dd25655d65efe6')) AS t(f, m_avant, m_apres)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m_avant
       AND md5(replace(pg_get_functiondef(r.f::regprocedure), chr(13), '')) <> r.m_apres THEN
      RAISE EXCEPTION '% a changé depuis la migration (md5 ni % ni %) : relire, jamais forcer', r.f, r.m_apres, r.m_avant;
    END IF;
  END LOOP;
END $verif$;

-- ── 1. Les données, depuis la trace (dernier remplacement d'abord), sans aucun déclencheur ──────────────────────────
SET LOCAL session_replication_role = replica;
DO $restaure$
DECLARE r record; x jsonb; v int; n_a int := 0; n_t int := 0; n_saut int := 0; n_paye int := 0; v_users uuid[] := '{}';
BEGIN
  IF to_regclass('public.comptes_plateforme_remplacements') IS NULL THEN RAISE NOTICE 'inverse : aucune trace'; RETURN; END IF;
  FOR r IN SELECT * FROM public.comptes_plateforme_remplacements ORDER BY le DESC LOOP
    v_users := v_users || r.user_id;
    FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(r.avant -> 'taches', '[]'::jsonb)) LOOP
      IF EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.id = (x ->> 'id')::uuid
                   AND (((j.platform_fields ->> 'pepite_remboursee') = 'true'
                         AND (x #>> '{platform_fields,pepite_remboursee}') IS DISTINCT FROM 'true')
                        OR (j.reservation_settled_at IS NOT NULL AND (x ->> 'reservation_settled_at') IS NULL))) THEN
        n_paye := n_paye + 1;
        RAISE NOTICE 'inverse : tâche % non remise en file (sa clôture a rendu des quotas ou libéré une réservation)', x ->> 'id';
        CONTINUE;
      END IF;
      UPDATE public.cross_post_jobs j
         SET status = x ->> 'status', error = x ->> 'error', platform_fields = x -> 'platform_fields'
       WHERE j.id = (x ->> 'id')::uuid AND j.status = 'cancelled'
         AND (j.platform_fields #>> '{compte_quitte,remplacement}') = r.id::text;
      GET DIAGNOSTICS v = ROW_COUNT;
      IF v = 0 THEN n_saut := n_saut + 1; RAISE NOTICE 'inverse : tâche % changée depuis, laissée', x ->> 'id'; END IF;
      n_t := n_t + v;
    END LOOP;
    FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(r.avant -> 'annonces', '[]'::jsonb)) LOOP
      UPDATE public.annonces_plateforme a
         SET disparu_le = NULLIF(x ->> 'disparu_le', '')::timestamptz, compte_quitte_le = NULLIF(x ->> 'compte_quitte_le', '')::timestamptz,
             updated_at = (x ->> 'updated_at')::timestamptz
       WHERE a.id = (x ->> 'id')::uuid AND a.compte_quitte_le IS NOT NULL AND a.disparu_le IS NOT DISTINCT FROM a.compte_quitte_le;
      GET DIAGNOSTICS v = ROW_COUNT; n_a := n_a + v;
      -- Revue depuis par un relevé (l'extension remet disparu_le à NULL) : seule la date de clôture part.
      UPDATE public.annonces_plateforme a SET compte_quitte_le = NULL
       WHERE a.id = (x ->> 'id')::uuid AND a.compte_quitte_le IS NOT NULL;
    END LOOP;
  END LOOP;
  UPDATE public.compte_signal s SET jobs = NULL, maj_le = now() WHERE s.user_id = ANY (v_users);
  RAISE NOTICE 'inverse : % annonce(s) et % tâche(s) remises ; % laissée(s) ; % non remise(s) en file (quotas rendus)', n_a, n_t, n_saut, n_paye;
END $restaure$;
SET LOCAL session_replication_role = origin;

-- ── 2. Les quatre corps de PROD du 16/11, à l'octet ─────────────────────────────────────────────────────────────────────────
DO $restaure_corps$
BEGIN
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.annonce_non_prouvee_vivante(p_annonce uuid, p_auto boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$⟦CR⟧
DECLARE a annonces_plateforme%ROWTYPE;⟦CR⟧
BEGIN⟦CR⟧
  -- (14/11/2026, demande 2 de Nico — 13e274de, fantômes de l'index Beebs) Une annonce n'est « prouvée vivante » que si⟦CR⟧
  -- sa dernière vue vient d'un relevé qui a LU la liste de la personne, et que FillSell ne l'a pas retirée depuis.⟦CR⟧
  -- Pour toutes les voies (p_auto = false : le geste de la personne) :⟦CR⟧
  --   disparue · relevé hors de la liste (releve_run_hors_liste) · vue seulement dans l'index (releve_run_index_seul) ·⟦CR⟧
  --   retrait demandé, en cours ou abouti DEPUIS la dernière vue (la règle de rapprochement_decider, 26/09) ;⟦CR⟧
  -- et pour la voie automatique (p_auto = true : le moteur) :⟦CR⟧
  --   déjà retirée par FillSell (retiree_le : retrait abouti, ou « déjà hors ligne » prouvé) — un numéro retiré qui⟦CR⟧
  --   « revient » est un fantôme d'index ou un retrait raté, jamais un article neuf ; la personne en décide.⟦CR⟧
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;⟦CR⟧
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;⟦CR⟧
  IF a.disparu_le IS NOT NULL THEN RETURN 'disparue'; END IF;⟦CR⟧
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;⟦CR⟧
  IF releve_run_index_seul(a.run_id) THEN RETURN 'vue_seulement_dans_l_index'; END IF;⟦CR⟧
  IF EXISTS (SELECT 1 FROM cross_post_jobs d⟦CR⟧
              WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'⟦CR⟧
                AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')⟦CR⟧
                AND d.created_at >= COALESCE(a.vu_le, a.created_at)⟦CR⟧
                AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN⟦CR⟧
    RETURN 'retrait_demande';⟦CR⟧
  END IF;⟦CR⟧
  IF p_auto AND a.retiree_le IS NOT NULL THEN RETURN 'retiree_par_fillsell'; END IF;⟦CR⟧
  RETURN NULL;⟦CR⟧
END;⟦CR⟧
$function$$corps$, chr(13), ''), '⟦CR⟧', chr(13));
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
 v_cand integer:=0; v_derniere timestamptz;
 v_compte text; v_autres integer:=0;  -- (08/11 soir, point 3 de Nico) le compte de la plateforme relevé
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- (08/11 soir, point 3 de Nico — ayadi007) LE COMPTE RELEVÉ EST CONNU (vinted_sync_runs.compte_plateforme, écrit par
 -- l'extension ≥ 0.6.182 : Leboncoin = le compte du jeton de la page). Deux relevés de comptes DIFFÉRENTS ne forment
 -- jamais une paire ; une annonce d'un AUTRE compte connu n'est jamais datée disparue par ce relevé (jamais « Vendue ? ») :
 -- elle n'est pas absente, elle est ailleurs. Compte inconnu (ancien poste, relevé par la page) : la règle d'avant, à l'octet.
 v_compte := NULLIF(btrim(r.compte_plateforme), '');
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND (v_compte IS NULL OR NULLIF(btrim(s.compte_plateforme), '') IS NULL OR s.compte_plateforme = v_compte)
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 -- (08/11 soir) Les annonces d'un AUTRE compte connu, non datées : comptées, tracées une fois par relevé, jamais datées.
 IF v_compte IS NOT NULL THEN
   SELECT count(*) INTO v_autres FROM annonces_plateforme ap
    WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
      AND NULLIF(btrim(ap.compte_plateforme), '') IS NOT NULL AND ap.compte_plateforme <> v_compte;
   IF v_autres > 0 AND NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_autre_compte'
                                     AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_autre_compte',
       jsonb_build_object('run',r.id,'platform',r.platform,'compte',v_compte,'annonces_autre_compte',v_autres));
   END IF;
 END IF;
 -- (08/11, ayadi007) UN COMPTE QUI A CHANGÉ (ou s'est vidé d'un coup) NE FAIT PAS UNE QUESTION PAR ANNONCE : au moins 5
 -- annonces que ni ce relevé ni le précédent n'ont revues, et AUCUNE annonce vue par eux n'était connue avant la dernière
 -- vue de celles-là (aucune continuité : les deux relevés lisent un autre ensemble — autre compte connecté dans Chrome,
 -- compte bloqué dont les annonces sont désactivées, tout republié d'un coup) → rien n'est daté disparu, aucun « Vendue ? »
 -- (le « Oui » d'une personne pressée retirerait ses copies ailleurs) ; une trace par relevé (usage_logs
 -- releve_compte_change), lue par l'exploitation. Une annonce revue plus tard lève tout ; sous 5, la règle d'avant.
 SELECT count(*), max(ap.vu_le) INTO v_cand, v_derniere FROM annonces_plateforme ap
  WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
    AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
    AND ap.vu_le<precedent.started_at
    AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte);
 IF v_cand>=5 AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x
      WHERE x.user_id=r.user_id AND x.platform=r.platform AND x.run_id IN (r.id, precedent.id) AND x.created_at<v_derniere) THEN
   IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_compte_change'
                    AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_compte_change',
       jsonb_build_object('run',r.id,'premier',precedent.id,'platform',r.platform,'annonces_non_revues',v_cand,'derniere_vue',v_derniere));
   END IF;
   RETURN jsonb_build_object('disparues',0,'motif','compte_change_ou_vide','annonces_non_revues',v_cand,
     'derniere_vue',v_derniere,'premier',precedent.id,'second',r.id);
 END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     -- (08/11 soir) jamais une annonce d'un AUTRE compte connu que celui relevé
     AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte)
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
     -- (22/10 soir, point 5) Un article en cours de republication n'est jamais compté disparu.
     AND public.republication_engagee(r.user_id, ap.inventaire_id, r.platform) IS NULL
     -- (31/10, décision 7a de Nico) …ni une annonce VISÉE par une republication engagée, quelle que soit sa fiche.
     AND public.republication_engagee_numero(r.user_id, r.platform, ap.listing_id) IS NULL
     -- (31/10, lot I point 6) …ni pendant qu'une remise en ligne « recréée » n'a pas encore été revue en ligne (72 h au plus).
     AND public.republication_recreee_non_confirmee(r.user_id, r.platform, ap.inventaire_id, ap.listing_id, ap.job_id) IS NULL
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id)
   || CASE WHEN v_autres > 0 THEN jsonb_build_object('annonces_autre_compte',v_autres,'compte',v_compte) ELSE '{}'::jsonb END;
END;
$function$$corps$, chr(13), ''), '⟦CR⟧', chr(13));
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.veille_recentes_ouvrir(p_platform text, p_ids text[], p_compte text DEFAULT NULL::text, p_build text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_palier text;
  v_lues int := 0;
  v_inconnus text[] := '{}'::text[];
  v_connus jsonb := '{}'::jsonb;
  v_run uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'session'); END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'), 0) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'fermee');
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('vinted', 'leboncoin') THEN RETURN jsonb_build_object('ok', false, 'motif', 'plateforme'); END IF;
  v_palier := palier_de(v_user);
  IF v_palier IS NULL OR v_palier NOT IN ('premium', 'pro', 'business') THEN RETURN jsonb_build_object('ok', false, 'motif', 'palier'); END IF;
  IF plateforme_ecartee_pour(v_user, p_platform) THEN RETURN jsonb_build_object('ok', false, 'motif', 'ecartee'); END IF;
  IF EXISTS (SELECT 1 FROM pause_releves pr WHERE pr.user_id = v_user AND pr.leve_le IS NULL AND p_platform = ANY (pr.platforms)) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'pause_releves');
  END IF;
  IF p_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN RETURN jsonb_build_object('ok', false, 'motif', 'pause_antirobot'); END IF;
  -- Vinted : la boutique lue doit être une boutique CONFIRMÉE du compte (jamais adoptée ici, jamais une question).
  IF p_platform = 'vinted' AND NOT COALESCE(boutique_vinted_confirmee(v_user, p_compte), false) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'boutique');
  END IF;
  -- Leboncoin : le compte lu doit être nommé, et celui du dernier relevé complet quand il est connu (règle du 08/11 : deux
  -- comptes ne se mélangent jamais) — un autre compte ouvert dans Chrome n'est jamais importé d'office.
  IF p_platform = 'leboncoin' AND (p_compte IS NULL OR p_compte !~ '^[A-Za-z0-9-]{3,80}$') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_inconnu');
  END IF;
  IF p_platform = 'leboncoin' AND EXISTS (
       SELECT 1 FROM (SELECT s.compte_plateforme FROM vinted_sync_runs s
                       WHERE s.user_id = v_user AND s.kind = 'annonces' AND s.platform = 'leboncoin' AND s.status = 'done'
                         AND s.compte_plateforme IS NOT NULL
                       ORDER BY s.started_at DESC NULLS LAST LIMIT 1) d
        WHERE d.compte_plateforme IS DISTINCT FROM p_compte) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'compte_change');
  END IF;
  -- Un passage 'recentes' FIGÉ (service worker tué en route) ne retient jamais le suivant : clos, rien conclu.
  UPDATE vinted_sync_runs SET status = 'expired', finished_at = now(), updated_at = now(),
         erreur = '[veille_recentes] passage interrompu (aucune nouvelle de l''extension depuis 10 min) — rien conclu'
   WHERE user_id = v_user AND kind = 'recentes' AND platform = p_platform AND status IN ('queued', 'running')
     AND COALESCE(progres_le, updated_at, started_at) < now() - interval '10 minutes';
  -- Un relevé de la plateforme en cours ou en file : c'est lui qui lira (jamais deux lectures ensemble).
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s
              WHERE s.user_id = v_user AND s.status IN ('queued', 'running')
                AND ((p_platform = 'vinted' AND s.kind = 'dressing') OR (s.kind IN ('annonces', 'recentes') AND s.platform = p_platform))) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END IF;
  -- Une republication engagée (retrait fait, recréation à venir ou en vol) : sa copie ne s'importe jamais à sa place.
  IF republication_entre_retrait_et_recreation(v_user, p_platform) IS NOT NULL
     OR EXISTS (SELECT 1 FROM cross_post_jobs j
                 WHERE j.user_id = v_user AND j.platform = p_platform AND j.action = 'republish'
                   AND j.status IN ('pending', 'processing', 'needs_user')
                   AND j.platform_fields ->> 'republish_step' = 'deleted') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'republication');
  END IF;
  -- Une tâche de la plateforme en cours (dépôt dont le numéro n'est pas encore rendu) : on attend le passage suivant.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = v_user AND j.platform = p_platform AND j.status = 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'tache_en_cours');
  END IF;

  -- Un seul tri (mesuré en prod le 13/11 sur le compte le plus chargé, 100 numéros Leboncoin : 70 ms, lecture seule).
  WITH t AS MATERIALIZED (SELECT * FROM veille_recentes_trier(v_user, p_platform, p_ids))
  SELECT (SELECT count(*)::int FROM t),
         COALESCE((SELECT array_agg(t.listing_id ORDER BY t.listing_id) FROM t WHERE t.connu IS NULL), '{}'::text[]),
         COALESCE((SELECT jsonb_object_agg(x.connu, x.n) FROM (SELECT t.connu, count(*) n FROM t WHERE t.connu IS NOT NULL GROUP BY 1) x), '{}'::jsonb)
    INTO v_lues, v_inconnus, v_connus;

  IF cardinality(v_inconnus) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', '[]'::jsonb, 'connus', v_connus);
  END IF;

  BEGIN
    INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, extension_build, items_vus, total_entries,
                                  compte_plateforme, started_at, claimed_at, updated_at)
    VALUES (v_user, 'recentes', p_platform, 'running', 'veille:recentes', left(p_build, 120), v_lues, cardinality(v_inconnus),
            CASE WHEN p_platform = 'leboncoin' AND p_compte ~ '^[A-Za-z0-9-]{3,80}$' THEN p_compte END, now(), now(), now())
    RETURNING id INTO v_run;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'releve_en_cours');
  END;
  IF v_run IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'garde'); END IF;   -- un déclencheur l'a écarté
  RETURN jsonb_build_object('ok', true, 'lues', v_lues, 'inconnus', to_jsonb(v_inconnus), 'connus', v_connus, 'run_id', v_run);
END;
$function$$corps$, chr(13), ''), '⟦CR⟧', chr(13));
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.cross_post_jobs_alerte_tenue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_constat boolean;
  v_rep uuid;
  v_suiv record;
  v_jum record;
  v_retire text[] := array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'];
  v_nom text;
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if not (coalesce(new.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     or coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'
     or coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') <> 'unavailable'
     or new.status is distinct from 'published'
     or coalesce(new.action, 'publish') not in ('publish', 'republish')
     or new.inventaire_id is null then
    return new;
  end if;
  v_nom := case new.platform when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'ebay' then 'eBay'
                             when 'depop' then 'Depop' when 'vinted' then 'Vinted' when 'opla' then 'Opla' else new.platform end;
  -- Le constat de deux relevés complets (constater_absences_releve) pose absence_releves dans la même écriture.
  v_constat := new.platform_fields ? 'absence_releves'
               and (new.platform_fields -> 'absence_releves') is distinct from (coalesce(old.platform_fields, '{}'::jsonb) -> 'absence_releves');

  -- (1) En cours de republication.
  -- (31/10, décision 7a de Nico) …par sa fiche, ou par le NUMÉRO de l'annonce (rattachée à une autre fiche).
  v_rep := coalesce(public.republication_engagee(new.user_id, new.inventaire_id, new.platform),
                    public.republication_engagee_numero(new.user_id, new.platform, public.annonce_id_de_job(new.platform_listing_id, new.listing_url)));
  if v_rep is not null and v_rep <> new.id then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'republication_en_cours',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1 bis) (31/10, lot I point 6 — Johan, 29/10) Une remise en ligne « recréée » pas encore revue en ligne par un relevé
  -- (72 h au plus) : ni sa NOUVELLE annonce (ce job lui-même), ni une autre annonce de la fiche ne reçoit « Vendue ? ».
  v_rep := public.republication_recreee_non_confirmee(new.user_id, new.platform, new.inventaire_id,
             public.annonce_id_de_job(new.platform_listing_id, new.listing_url), new.id);
  if v_rep is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'recreation_non_confirmee',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1b) Remplacé par sa propre republication.
  select r.id, btrim(r.platform_listing_id) as annonce into v_suiv
    from public.cross_post_jobs r
   where r.user_id = new.user_id and r.inventaire_id = new.inventaire_id and r.platform = new.platform
     and r.action = 'republish' and r.status = 'published' and r.id <> new.id
     and r.platform_fields ->> 'republish_source_job_id' = new.id::text
     and nullif(btrim(coalesce(r.platform_listing_id, '')), '') is not null
     and btrim(r.platform_listing_id) is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
   order by r.created_at desc limit 1;
  if v_suiv.id is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('republished_pending', true,
           'remplacee_par_republication', jsonb_build_object('le', now(), 'job', v_suiv.id, 'annonce', v_suiv.annonce));
    new.status := 'cancelled';
    new.error := 'Annonce remplacée par sa republication (nouvelle annonce ' || v_suiv.annonce || ') — ce n''est pas une vente.';
    return new;
  end if;

  -- (3) Boutique partagée : la fiche jumelle du compte relié est en ligne sur cette plateforme.
  if new.platform <> 'vinted' then
    select o.listing_id, o.compte into v_jum
      from public.jumelle_occupe_plateformes(new.user_id, new.inventaire_id) o
     where o.platform = new.platform and o.statut in ('en_ligne', 'en_verification', 'published')
       and o.listing_id is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
     limit 1;
    if v_jum.listing_id is not null then
      if v_constat then
        new.platform_fields := (new.platform_fields - v_retire)
          || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(),
               'annonce', v_jum.listing_id, 'compte', v_jum.compte));
        new.status := 'cancelled';
        new.error := 'Cette annonce ' || v_nom || ' n''est plus en ligne ; ton article reste en vente sur ' || v_nom
          || ' sous l''annonce ' || v_jum.listing_id || ' de ton compte FillSell relié (même boutique). Rien à refaire.';
      else
        new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
          || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
               'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'jumelle_en_ligne',
                 'annonce', v_jum.listing_id));
      end if;
      return new;
    end if;
  end if;

  -- (2) Alerte de la veille déjà démentie par un relevé sur cette annonce.
  if not v_constat and new.platform <> 'vinted'
     and coalesce(old.platform_fields, '{}'::jsonb) ? 'revue_en_ligne_par_releve' then
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
      || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
           'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'dementie_par_releve',
             'dementie_le', old.platform_fields #>> '{revue_en_ligne_par_releve,at}'));
    return new;
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_alerte_tenue : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $function$$corps$, chr(13), ''), '⟦CR⟧', chr(13));
END $restaure_corps$;

-- ── 3. Les fonctions neuves, la colonne, les tables (copiées d'abord) ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.compte_plateforme_a_confirmer();
DROP FUNCTION IF EXISTS public.compte_plateforme_a_confirmer_pour(uuid);
DROP FUNCTION IF EXISTS public.remplacer_compte_plateforme(text, text, boolean);
DROP FUNCTION IF EXISTS public.remplacer_compte_plateforme_pour(uuid, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.compte_plateforme_dernier_releve(uuid, text);
DROP FUNCTION IF EXISTS public.compte_plateforme_juger(uuid, text, text);
DO $copie$
BEGIN
  IF to_regclass('public.comptes_plateforme_suivi') IS NOT NULL AND to_regclass('public._backup_inv_1611_cps_suivi') IS NULL THEN
    CREATE TABLE public._backup_inv_1611_cps_suivi AS SELECT * FROM public.comptes_plateforme_suivi;
    ALTER TABLE public._backup_inv_1611_cps_suivi ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._backup_inv_1611_cps_suivi FROM anon, authenticated;
  END IF;
  IF to_regclass('public.comptes_plateforme_remplacements') IS NOT NULL AND to_regclass('public._backup_inv_1611_cps_remplacements') IS NULL THEN
    CREATE TABLE public._backup_inv_1611_cps_remplacements AS SELECT * FROM public.comptes_plateforme_remplacements;
    ALTER TABLE public._backup_inv_1611_cps_remplacements ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._backup_inv_1611_cps_remplacements FROM anon, authenticated;
  END IF;
END $copie$;
ALTER TABLE public.annonces_plateforme DROP COLUMN IF EXISTS compte_quitte_le;
DROP TABLE IF EXISTS public.comptes_plateforme_remplacements;
DROP TABLE IF EXISTS public.comptes_plateforme_suivi;

DO $verif_apres$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.annonce_non_prouvee_vivante(uuid,boolean)', '4ed8966c42915e390e9c282fbab7a258'),
    ('public.constater_absences_releve(uuid)', '5fde069f0af7824eeb5936a06637d288'),
    ('public.veille_recentes_ouvrir(text,text[],text,text)', 'eaa5af6b6c82d7103dfd9b40d4a20d60'),
    ('public.cross_post_jobs_alerte_tenue()', '140a08f1b40d9278d1dc03f6df20a70e')) AS t(f, m)
  LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m THEN
      RAISE EXCEPTION '% : le corps remis n''est pas celui de prod (md5 attendu %)', r.f, r.m;
    END IF;
  END LOOP;
END $verif_apres$;

COMMIT;
