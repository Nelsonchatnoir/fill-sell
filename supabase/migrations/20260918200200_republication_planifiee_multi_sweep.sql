-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE MULTIPLATEFORME — 3/5 : le sweep
-- 2026-09-18.
-- ═════════════════════════════════════════════════════════════════════════════
-- Le sweep boucle désormais sur COMPTE × PLATEFORME. Tout ce qui existait est
-- conservé à l'identique pour Vinted (clôture, hors créneau → rien, extension
-- vue à 10 min, garde anti-rafale qui distingue les jobs PARQUÉS, plafond,
-- espacement déterministe, borne `prevues`, plafond de boutique, ordre des
-- candidats, notes d'historique). Ce qui s'y ajoute :
--
--   · UN JOB PAR COMPTE ET PAR PASSAGE, TOUTES PLATEFORMES CONFONDUES.
--     C'était déjà la règle ; elle devient le plafond dur du module : quatre
--     plateformes ne peuvent pas quadrupler la cadence, parce qu'il n'y a
--     qu'UN Chrome. Au plus 20 créations par heure et par compte.
--
--   · LE DISJONCTEUR (garde-fou exigé). N échecs de retrait CONSÉCUTIFS, sans
--     réussite intercalée, sur une plateforme dans le même créneau → cette
--     plateforme s'arrête POUR LA JOURNÉE, motif `_disjoncteur` écrit dans
--     l'historique. N = coin_config.republish_disjoncteur_echecs = 2.
--     Pourquoi 2, sur les données (suppressions Leboncoin, 30 jours) :
--       17 jours sans aucun échec · 12/09 : 1 réussie / 1 échouée
--       17/09 : 0 RÉUSSIE, 5 ÉCHOUÉES  ← la modale « Valider » (corr. 6bafafa)
--       18/09 : 7 réussies, 0 échouée   ← après correctif
--     Une vraie panne Leboncoin, ce n'est pas un taux, c'est une SÉRIE SANS
--     AUCUNE RÉUSSITE. Hors 17/09 : 1 échec sur 57 (1,8 %) ; deux consécutifs
--     par hasard = 0,03 %. N = 2 se serait déclenché UNE fois en 30 jours — le
--     17/09, le seul jour cassé — et jamais le 12/09. Le compteur est PAR
--     PLATEFORME : une panne Leboncoin n'arrête pas Vinted.
--
--   · JAMAIS DEUX EN VOL SUR LA MÊME PLATEFORME. La garde anti-rafale du 17/09
--     filtrait `platform = 'vinted'` en dur : elle devient PAR PLATEFORME.
--     L'étape 'deleted' reste TOUJOURS bloquante — une annonce déjà retirée
--     passe avant tout le reste, c'est là qu'on perd des annonces.
--
--   · PRO PERDU PUIS RETROUVÉ. Aujourd'hui `actif:true` survit à la perte du
--     Pro et le module repart tout seul au retour. Le sweep pose désormais une
--     DATE (`palier_perdu_le`) au premier passage sans droit — pas un arrêt —
--     et n'écrit `actif:false, arret_motif:'palier_perdu'` qu'au-delà de
--     coin_config.republish_palier_perdu_grace_h (48 h). Un aller-retour
--     Stripe d'une heure n'éteint donc pas quatre modules ; une vraie
--     résiliation, elle, dure. Le retour au Pro demande une réactivation
--     explicite. ⛔ Aucun réglage ACTIF n'est jamais réécrit pour être
--     « normalisé » : la seule écriture possible est un ARRÊT horodaté et motivé.
--
--   · LA CLÉ DE L'HISTORIQUE. Sur Vinted elle reste le vinted_item_id (rien ne
--     change dans `sautes`) ; ailleurs il n'y a pas toujours d'identifiant
--     d'annonce (Beebs n'en pose pas), la clé est donc `inv:<inventaire_id>`.
--     L'écran d'historique ne lit que la VALEUR (motif, titre) et ignore les
--     clés préfixées '_' : sa forme lui est indifférente.
--
-- Idempotente. Retour arrière : rejouer 20260917221000.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_pf         text;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_faits_cpt  integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_cle        text;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
  -- 18/09 : multiplateforme
  v_palier     text;
  v_plafond_cpt integer;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;
  SELECT value INTO v_disj_max FROM coin_config WHERE key = 'republish_disjoncteur_echecs';
  v_disj_max := GREATEST(1, COALESCE(v_disj_max, 2));
  SELECT value INTO v_grace FROM coin_config WHERE key = 'republish_palier_perdu_grace_h';
  v_grace := GREATEST(1, COALESCE(v_grace, 48));

  -- Les comptes qui ont AU MOINS UNE plateforme active.
  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM unnest(republish_planifiee_plateformes()) pf
      WHERE COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false)
    )
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_cree := false;

    -- 0. LE DROIT. Un compte actif sans palier Pro : on pose la date, puis on
    -- arrête au-delà de la grâce — une seule fois, pour les quatre.
    v_palier := republish_palier(v_compte.id);
    IF v_palier NOT IN ('pro', 'business') THEN
      SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_compte.id FOR UPDATE;
      FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
        v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
        CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object'
                   OR NOT COALESCE((v_cur ->> 'actif')::boolean, false);
        v_perdu := NULLIF(v_cur ->> 'palier_perdu_le', '')::timestamptz;
        IF v_perdu IS NULL THEN
          v_cur := v_cur || jsonb_build_object('palier_perdu_le', now());
        ELSIF v_perdu < now() - make_interval(hours => v_grace) THEN
          v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                               'arret_motif', 'palier_perdu');
        ELSE
          CONTINUE;
        END IF;
        v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
      END LOOP;
      UPDATE profiles SET platform_settings = v_ps WHERE id = v_compte.id;
      CONTINUE;
    END IF;

    v_plafond_cpt := republish_plafond_palier(v_palier);

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.

      v_regl := republish_planifiee_reglage(v_compte.id, v_pf);
      CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
      -- Interrupteur de la plateforme (fail-closed).
      CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
      -- La date de palier perdu n'a plus lieu d'être : le droit est là.
      IF v_regl ->> 'palier_perdu_le' IS NOT NULL THEN
        UPDATE profiles
           SET platform_settings = jsonb_set(platform_settings, ARRAY[v_pf, 'republish_planifiee'],
                 (platform_settings #> ARRAY[v_pf, 'republish_planifiee']) - 'palier_perdu_le', true)
         WHERE id = v_compte.id;
      END IF;

      -- 2. Hors créneau → rien. Un créneau manqué n'est jamais rattrapé.
      v_fen := republish_planifiee_fenetre(v_regl, now());
      CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

      v_minuit := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));

      -- 2bis. DISJONCTEUR DU JOUR : cette plateforme s'est-elle déjà arrêtée
      -- aujourd'hui ? (note posée sur un créneau de la journée locale)
      IF EXISTS (
        SELECT 1 FROM republish_creneaux r
        WHERE r.user_id = v_compte.id AND r.platform = v_pf
          AND r.debut >= v_minuit AND r.sautes ? '_disjoncteur'
      ) THEN
        CONTINUE;
      END IF;

      IF v_pf = 'vinted' THEN
        v_ident    := republish_boutique_connectee(v_compte.id);
        v_boutique := v_ident ->> 'user_id';
        v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
      ELSE
        v_ident := NULL; v_boutique := NULL; v_multi := false;
      END IF;

      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      -- Deux compteurs : CETTE plateforme, et le COMPTE (l'enveloppe).
      SELECT count(*) FILTER (WHERE j.platform = v_pf), count(*)
      INTO v_faits, v_faits_cpt
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
          NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
          AND j.platform_fields ->> 'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
      END IF;

      -- La ligne du créneau courant, créée au premier passage avec ce que le
      -- serveur ATTEND à cet instant (c'est ce que l'app annonce). La capacité
      -- est PARTAGÉE : le temps déjà réservé par les autres plateformes est
      -- déduit — un seul Chrome pour quatre files.
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz;
      IF NOT FOUND THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite_partagee(v_compte.id, v_pf,
          extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(GREATEST(0, v_plafond - v_faits),
                           GREATEST(0, v_plafond_cpt - v_faits_cpt),
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        INSERT INTO republish_creneaux
          (user_id, platform, jour, de, a, fuseau, debut, fin, statut, boutique,
           eligibles_debut, prevues, espacement_sec, extension_vue)
        VALUES
          (v_compte.id, v_pf, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
           COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
           (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
           v_elig, v_prevues, (v_esp ->> 'sec')::integer,
           v_compte.extension_last_seen_at > now() - interval '10 minutes')
        ON CONFLICT (user_id, platform, debut) DO NOTHING;
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz;
      END IF;

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      CONTINUE WHEN v_compte.extension_last_seen_at IS NULL
                 OR v_compte.extension_last_seen_at <= now() - interval '10 minutes';
      IF NOT v_row.extension_vue OR (v_row.boutique IS NULL AND v_boutique IS NOT NULL) THEN
        UPDATE republish_creneaux
           SET extension_vue = true, boutique = COALESCE(boutique, v_boutique), updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs CONSÉCUTIFS de ce créneau, sur cette
      -- plateforme, sans réussite intercalée. Un 'failed'/'needs_user' à
      -- l'étape a_capturer/captured = un RETRAIT qui n'a pas abouti (l'annonce
      -- est restée en ligne) ; à l'étape 'deleted' = un redépôt manqué, plus
      -- grave encore. Les deux comptent.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') AS step
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        IF v_j.status IN ('failed', 'needs_user') THEN v_disj_n := v_disj_n + 1;
        ELSE EXIT;  -- pending / processing : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME : une republication en vol → rien
      -- de neuf. Seules comptent celles qui PEUVENT bouger sous la boutique
      -- connectée (Vinted) ; un job parqué pour une autre boutique n'est pas
      -- « en vol ». L'étape 'deleted' bloque TOUJOURS.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                                AND trim(i.vinted_account_id) <> v_boutique)
      INTO v_hors_ligne, v_mobiles, v_parques
      FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.status IN ('pending', 'processing');
      IF v_hors_ligne + v_mobiles > 0 THEN
        v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
        v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
          'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
          'platform', v_pf,
          'en_vol', v_hors_ligne + v_mobiles,
          'hors_ligne', v_hors_ligne,
          'parques_autre_boutique', v_parques,
          'boutique', v_boutique,
          'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
          'at', now());
        UPDATE republish_creneaux
           SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id;
      END IF;
      IF v_parques > 0 THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_parques_autre_boutique',
            jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
      END IF;

      -- 5. Plafonds du jour : celui de la plateforme, puis l'ENVELOPPE de
      -- compte (la somme des quatre ne dépasse pas le palier).
      IF v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;
      IF v_faits_cpt >= v_plafond_cpt THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_compte', jsonb_build_object('motif', 'plafond_compte',
            'plafond', v_plafond_cpt, 'faits', v_faits_cpt, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe : durée / prevues, mesuré depuis le dernier
      -- job auto créé dans CE créneau — et depuis le dernier geste TOUTES
      -- PLATEFORMES (un seul Chrome : deux files qui se croisent se gênent).
      v_intervalle := extract(epoch FROM (v_row.fin - v_row.debut)) / GREATEST(1, COALESCE(v_row.prevues, 1));
      SELECT max(j.created_at) INTO v_dernier FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut;
      CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ.
      SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
        CONTINUE;
      END IF;

      -- 7. Plafond de la boutique connectée (Vinted, calculé plus haut).
      IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;

      -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
      -- autres boutiques jamais pendant ce créneau (Vinted seul).
      v_notes := '{}'::jsonb; v_examines := 0;
      FOR v_cand IN
        SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END,
                 c.rang
        LIMIT 50
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80),
                                 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                                 'titre', left(COALESCE(v_cand.titre, ''), 80), 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;

        -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
        BEGIN
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
          v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL, v_pf);
          PERFORM set_config('request.jwt.claims', '', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('request.jwt.claims', '', true);
          v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                      'message', left(SQLERRM, 200));
        END;
        v_reason := v_rpc ->> 'reason';

        v_ligne := jsonb_build_object(
          'compte', v_compte.email, 'platform', v_pf, 'inventaire_id', v_cand.inv_id,
          'vinted_item_id', v_cand.item_id, 'examines', v_examines,
          'creneau_id', v_row.id, 'boutique', v_boutique,
          'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
          'reason', v_reason);

        IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
          v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
          UPDATE cross_post_jobs
             SET platform_fields = platform_fields || jsonb_build_object(
                   'republish_moteur', 'serveur',
                   'republish_planifie', true,
                   'republish_creneau_id', v_row.id::text,
                   'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
           WHERE id = v_job;
          v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
          v_rapport := v_rapport || v_ligne;
          v_cree := true;
          EXIT;
        END IF;

        IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
          v_notes := v_notes || jsonb_build_object(v_cle,
            jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                               'titre', left(COALESCE(v_cand.titre, ''), 80),
                               'platform', v_pf, 'at', now()));
        END IF;
        v_rapport := v_rapport || v_ligne;
        -- Portée ARTICLE → candidat suivant ; portée COMPTE → on sort.
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        EXIT;
      END LOOP;

      IF v_notes <> '{}'::jsonb THEN
        PERFORM republish_creneau_noter(v_row.id, v_notes);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$$;

REVOKE ALL ON FUNCTION public.republish_planifiee_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_planifiee_sweep() TO service_role;

-- Contrôle (à blanc, sans rien créer : le sweep ne crée que DANS un créneau) :
--   SELECT jsonb_pretty(public.republish_planifiee_sweep());
--   SELECT platform, statut, count(*) FROM republish_creneaux
--   WHERE debut > now() - interval '1 day' GROUP BY 1,2;
