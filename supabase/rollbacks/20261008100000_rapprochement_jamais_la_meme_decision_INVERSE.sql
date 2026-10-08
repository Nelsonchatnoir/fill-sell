-- INVERSE de 20261008100000_rapprochement_jamais_la_meme_decision.sql
-- Définitions EN PROD lues le 08/10/2026 (pg_get_functiondef) avant application.
BEGIN;
DROP TRIGGER IF EXISTS rapprochements_jamais_repete ON public.rapprochements;
DROP FUNCTION IF EXISTS public.rapprochements_jamais_repete();
-- rapprochements_repetes est gardée (journal des répétitions refusées) ; à
-- supprimer à la main si besoin : DROP TABLE public.rapprochements_repetes;

CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  IF a.proposition ->> 'motif' IN ('depot_beebs_photo_proche', 'depot_beebs_a_confirmer') THEN RETURN 'question_depot'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer_identifiant(v_user, v_pf, a.listing_id);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- (07/10, règle de Nico) Rien de sûr par l'identifiant : l'annonce attend
  -- le moteur du compte, qui la compare à TOUT le stock avant toute création.
  IF COALESCE(current_setting('fillsell.rapprochement_moteur', true), '') <> 'on' THEN
    PERFORM rapprochement_demander(v_user, 'annonce:' || v_pf);
  END IF;
  RETURN 'differe';
END;
$function$;


CREATE OR REPLACE FUNCTION public.rapprochement_avancer(p_user uuid, p_budget_ms integer DEFAULT 6000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  c rapprochement_comptes%ROWTYPE;
  t0 timestamptz := clock_timestamp();
  v_budget interval := make_interval(secs => greatest(1000, least(p_budget_ms, 20000)) / 1000.0);
  v_cpu numeric; v_urls text[]; v_n integer; v_reste integer;
  v_import boolean; v_dette boolean; v_doute jsonb; v_q_inv bigint; v_posee boolean; n_aver integer := 0;
  an annonces_plateforme%ROWTYPE; v_res text; v_cand jsonb; v_inv bigint; v_job uuid; v_imp jsonb;
  v_geste boolean; n_dec integer := 0; n_att integer := 0; n_prop integer := 0; n_nouv integer := 0; n_job integer := 0;
  n_crees integer := 0; n_groupes integer := 0; n_err integer := 0; n_ret integer := 0;
  v_fus jsonb := NULL; v_ms bigint;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('etat', 'rien'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('etat', 'occupe');
  END IF;
  SELECT * INTO c FROM rapprochement_comptes WHERE user_id = p_user FOR UPDATE;
  IF c.user_id IS NULL THEN
    PERFORM rapprochement_demander(p_user, 'moteur');
    SELECT * INTO c FROM rapprochement_comptes WHERE user_id = p_user FOR UPDATE;
  END IF;
  IF c.etat = 'termine' THEN RETURN jsonb_build_object('etat', 'termine'); END IF;

  -- La base qui peine passe avant tout (règle du 04/10).
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 70 THEN
    UPDATE rapprochement_comptes SET maj_le = now() WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'cpu', 'cpu', v_cpu);
  END IF;

  -- ── A. LES RELEVÉS D'ABORD : rien ne se tranche tant qu'un relevé du compte
  --    (la base Vinted comprise) est en file ou en cours, et vivant.
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s
              WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                AND ((s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '30 minutes')
                  OR (s.status = 'running' AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes'))) THEN
    UPDATE rapprochement_comptes SET etat = 'attente_releves', maj_le = now(), passages = passages + 1,
           debut_le = COALESCE(debut_le, now())
     WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'attente_releves');
  END IF;
  UPDATE rapprochement_comptes SET debut_le = COALESCE(debut_le, now()), passages = passages + 1 WHERE user_id = p_user;

  -- ── B. LES EMPREINTES MANQUANTES (annonces à classer, nouvelles, couvertures
  --    du stock), 200 par passage, TOUTES avant de classer — quelle que soit
  --    la taille du compte. Seuls comptent les passages SANS PROGRÈS (le nombre
  --    manquant n'a pas baissé : fonction d'empreintes en panne, temps épuisé).
  --    Au huitième, les photos encore sans empreinte sont notées illisibles
  --    (photo_empreintes_echecs) : comparées, et sans preuve. Jamais un
  --    classement pendant que des photos se calculent.
  SELECT count(*)::integer, (array_agg(z.u))[1:200] INTO v_n, v_urls FROM (
    SELECT DISTINCT y.u FROM (
      SELECT a.photo_url u FROM annonces_plateforme a
       WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
         AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
      UNION ALL
      SELECT fiche_couverture(i.photos) FROM inventaire i
       WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL
    ) y
     WHERE y.u ~ '^https://'
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u)) z;
  IF v_urls IS NOT NULL THEN
    IF c.passages_photos < 8 THEN
      UPDATE rapprochement_comptes
         SET etat = 'empreintes', maj_le = now(),
             passages_photos = CASE WHEN c.etat = 'empreintes' AND v_n >= COALESCE(c.photos_manquantes, 0)
                                    THEN passages_photos + 1 ELSE 0 END,
             photos_manquantes = v_n
       WHERE user_id = p_user;
      RETURN jsonb_build_object('etat', 'empreintes', 'urls', to_jsonb(v_urls));
    END IF;
    -- Huit passages sans progrès : ces photos ne se lisent pas (notées, puis
    -- les 200 suivantes au prochain passage s'il en reste).
    INSERT INTO photo_empreintes_echecs (url, motif, essais, echec_le)
    SELECT u, 'rapprochement_sans_progres', 1, now() FROM unnest(v_urls) u
    ON CONFLICT (url) DO NOTHING;
    IF v_n > 200 THEN
      UPDATE rapprochement_comptes SET etat = 'empreintes', maj_le = now(), photos_manquantes = v_n - 200 WHERE user_id = p_user;
      RETURN jsonb_build_object('etat', 'empreintes', 'urls', '[]'::jsonb, 'illisibles', 200);
    END IF;
  END IF;

  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);
  v_import := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
  v_dette := releve_dette_beebs(p_user);
  PERFORM rapprochement_lire_fiches(p_user);

  -- ── C. CLASSER chaque annonce en attente ──────────────────────────────────
  UPDATE rapprochement_comptes SET etat = 'decision', photos_manquantes = 0, maj_le = now() WHERE user_id = p_user;
  FOR an IN
    SELECT a.* FROM annonces_plateforme a
     WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL
       AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND NOT EXISTS (SELECT 1 FROM rapprochement_nouvelles n WHERE n.annonce_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'aucune' AND r.detail ->> 'motif' = 'erreur_moteur'
                          AND r.created_at > now() - interval '1 day')
     ORDER BY a.vu_le, a.id
  LOOP
    IF clock_timestamp() - t0 > v_budget THEN EXIT; END IF;
    BEGIN
      -- Relevé hors « Mes annonces », eBay hors compte relié : jamais rien.
      IF releve_run_hors_liste(an.run_id) OR (an.platform = 'ebay' AND an.run_id IS NOT NULL AND releve_ebay_run_bloque(an.run_id)) THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now() WHERE id = an.id AND inventaire_id IS NULL;
        INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
        VALUES (p_user, an.id, 'ignore', 'auto', 0, jsonb_build_object('run_id', an.run_id, 'motif', 'releve_non_probant', 'regle', 'rattachement_avant_stock'));
        n_dec := n_dec + 1; CONTINUE;
      END IF;
      -- L'identifiant (et la notification) : la voie d'avant, à l'identique.
      v_res := rapprocher_traiter_annonce(an.id, ARRAY[]::text[], false, false, false);
      IF v_res IN ('job', 'notification', 'deja_traitee', 'introuvable', 'hors_liste', 'question_depot') THEN
        IF v_res = 'job' THEN n_job := n_job + 1; END IF;
        n_dec := n_dec + 1; CONTINUE;
      END IF;
      v_cand := rapprochement_candidats(an.id, NULL);
      IF v_cand ? 'sur' THEN
        v_job := rapprochement_attacher(an.id, (v_cand ->> 'sur')::bigint, 'photo_identique');
        n_att := n_att + 1;
      ELSIF v_cand ? 'candidats' THEN
        IF v_dette AND an.platform = 'beebs' THEN
          -- Retenue silencieuse Beebs (29/09 soir) : ni question ni import.
          UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now() WHERE id = an.id AND inventaire_id IS NULL;
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, an.id, 'ignore', 'auto', 0, jsonb_build_object('run_id', an.run_id, 'motif', 'retenue_silencieuse_beebs', 'resultat', 'propose',
                  'regle', 'dépôt Beebs sans identifiant : ni import ni question avant preuve exacte'));
          n_ret := n_ret + 1;
        ELSE
          -- Un doute : l'annonce attend la phase de création, avec ses
          -- candidats ; elle y deviendra un article « à vérifier » (ou
          -- rejoindra, par la photo, celui d'une autre plateforme).
          INSERT INTO rapprochement_nouvelles (annonce_id, user_id, platform, doute)
          VALUES (an.id, p_user, an.platform, v_cand - 'sur')
          ON CONFLICT (annonce_id) DO UPDATE SET doute = EXCLUDED.doute;
          INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
          VALUES (p_user, an.id, (v_cand ->> 'inventaire_id')::bigint, 'propose', 'auto', (v_cand ->> 'score')::numeric,
                  jsonb_build_object('run_id', an.run_id, 'motif', v_cand ->> 'motif', 'candidats_total', v_cand -> 'candidats_total',
                                     'regle', 'rattachement_avant_stock', 'suite', 'a_verifier'));
          n_prop := n_prop + 1;
        END IF;
      ELSE
        INSERT INTO rapprochement_nouvelles (annonce_id, user_id, platform) VALUES (an.id, p_user, an.platform)
        ON CONFLICT (annonce_id) DO NOTHING;
        n_nouv := n_nouv + 1;
      END IF;
      n_dec := n_dec + 1;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
      VALUES (p_user, an.id, 'aucune', 'auto', 0, jsonb_build_object('motif', 'erreur_moteur', 'erreur', left(SQLERRM, 300), 'regle', 'rattachement_avant_stock'));
    END;
  END LOOP;

  SELECT count(*) INTO v_reste FROM annonces_plateforme a
   WHERE a.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT EXISTS (SELECT 1 FROM rapprochement_nouvelles n WHERE n.annonce_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'aucune' AND r.detail ->> 'motif' = 'erreur_moteur'
                        AND r.created_at > now() - interval '1 day');
  v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000);
  IF v_reste > 0 THEN
    UPDATE rapprochement_comptes
       SET etat = 'decision', maj_le = now(), a_traiter = v_reste, traitees = traitees + n_dec, ms_decision = ms_decision + v_ms,
           bilan = bilan || jsonb_build_object(
             'job', COALESCE((bilan ->> 'job')::int, 0) + n_job, 'photo', COALESCE((bilan ->> 'photo')::int, 0) + n_att,
             'propositions', COALESCE((bilan ->> 'propositions')::int, 0) + n_prop, 'nouvelles', COALESCE((bilan ->> 'nouvelles')::int, 0) + n_nouv,
             'retenues_beebs', COALESCE((bilan ->> 'retenues_beebs')::int, 0) + n_ret, 'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err)
     WHERE user_id = p_user;
    RETURN jsonb_build_object('etat', 'decision', 'traitees', n_dec, 'restantes', v_reste, 'ms', v_ms);
  END IF;

  -- ── D. CRÉER ce qui n'a aucun candidat — toutes les annonces classées ─────
  UPDATE rapprochement_comptes
     SET etat = 'creation', creation_le = COALESCE(creation_le, now()), a_traiter = 0,
         traitees = traitees + n_dec, ms_decision = ms_decision + v_ms,
         bilan = bilan || jsonb_build_object(
           'job', COALESCE((bilan ->> 'job')::int, 0) + n_job, 'photo', COALESCE((bilan ->> 'photo')::int, 0) + n_att,
           'propositions', COALESCE((bilan ->> 'propositions')::int, 0) + n_prop, 'nouvelles', COALESCE((bilan ->> 'nouvelles')::int, 0) + n_nouv,
           'retenues_beebs', COALESCE((bilan ->> 'retenues_beebs')::int, 0) + n_ret, 'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err),
         maj_le = now()
   WHERE user_id = p_user
  RETURNING * INTO c;
  n_att := 0; n_prop := 0;
  FOR an IN
    SELECT a.* FROM rapprochement_nouvelles n JOIN annonces_plateforme a ON a.id = n.annonce_id
     WHERE n.user_id = p_user
     ORDER BY CASE a.platform WHEN 'leboncoin' THEN 1 WHEN 'beebs' THEN 2 WHEN 'ebay' THEN 3 ELSE 4 END, a.vu_le, a.id
  LOOP
    IF clock_timestamp() - t0 > v_budget THEN EXIT; END IF;
    -- Plus en attente (rattachée ou tranchée entre-temps) : elle sort.
    IF an.inventaire_id IS NOT NULL OR an.ignoree_le IS NOT NULL OR an.disparu_le IS NOT NULL OR an.proposition IS NOT NULL THEN
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id; CONTINUE;
    END IF;
    SELECT releve_est_geste(s.declencheur) INTO v_geste FROM vinted_sync_runs s WHERE s.id = an.run_id;
    -- Pas de création sans geste (relevé automatique), annonce pas en ligne,
    -- interrupteur fermé, fiche supprimée exprès, dette Beebs : elle attend.
    IF NOT (v_import AND COALESCE(v_geste, false) AND an.statut_plateforme = 'en_ligne' AND an.fiche_supprimee_le IS NULL
            AND NOT (v_dette AND an.platform = 'beebs')) THEN
      CONTINUE;
    END IF;
    BEGIN
      SELECT n.doute INTO v_doute FROM rapprochement_nouvelles n WHERE n.annonce_id = an.id;
      -- Contre les articles créés DANS CETTE PHASE (la même robe relevée sur
      -- Leboncoin puis sur Beebs) : même photo → rattachée à cet article ;
      -- sinon l'article est créé — « à vérifier » s'il y a un doute (avec le
      -- stock, classé plus haut, ou avec un article créé dans cette phase).
      v_cand := rapprochement_candidats(an.id, c.creation_le);
      IF v_cand ? 'sur' THEN
        -- Motif « photo_identique » EXACT : c'est lui que lit retrait_job_prouve
        -- (une vente retire cette copie).
        PERFORM rapprochement_attacher(an.id, (v_cand ->> 'sur')::bigint, 'photo_identique', jsonb_build_object('groupe_creation', true));
        n_groupes := n_groupes + 1;
      ELSE
        IF v_doute IS NULL AND v_cand ? 'candidats' THEN v_doute := v_cand; END IF;
        v_imp := rapprocher_importer(p_user, an.id, 'rapprochement');
        IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
          v_inv := (v_imp ->> 'inventaire_id')::bigint;
          -- « À vérifier » : la question « Est-ce le même article ? » avec le
          -- meilleur candidat ; l'article ne vit hors du stock affiché que si
          -- elle est posée (une paire déjà tranchée ne l'est jamais : c'est un
          -- autre article, il entre au stock).
          IF v_doute IS NOT NULL AND NULLIF(v_doute ->> 'inventaire_id', '') IS NOT NULL THEN
            v_q_inv := (v_doute ->> 'inventaire_id')::bigint;
            v_posee := releve_poser_question(p_user, v_q_inv, v_inv, COALESCE(NULLIF(v_doute ->> 'motif', ''), 'rapprochement'),
                         jsonb_build_object('avant_stock', true, 'annonce_id', an.id, 'platform', an.platform, 'listing_id', an.listing_id,
                                            'url', an.url, 'prix', an.prix, 'titre_annonce', an.titre,
                                            'candidats_total', v_doute -> 'candidats_total', 'signaux', v_doute -> 'signaux'));
            IF v_posee THEN
              UPDATE inventaire
                 SET a_verifier = jsonb_build_object('depuis', now(), 'source', 'moteur', 'motif', COALESCE(NULLIF(v_doute ->> 'motif', ''), 'rapprochement'),
                                                     'candidat', v_q_inv, 'annonce_id', an.id, 'platform', an.platform)
               WHERE id = v_inv;
              n_aver := n_aver + 1;
            END IF;
          END IF;
          -- L'article créé entre dans la lecture du passage : les annonces
          -- suivantes se comparent à lui.
          INSERT INTO _rf
          SELECT i.id, i.statut, i.titre, titre_norm(i.titre), titre_jetons(i.titre), titre_types_objet(i.titre),
                 COALESCE(titre_marque_utile(NULLIF(trim(COALESCE(i.marque, '')), '')), ''), '', i.prix_vente, ARRAY[an.platform], i.created_at, i.origine
            FROM inventaire i WHERE i.id = v_inv
          ON CONFLICT (id) DO NOTHING;
          INSERT INTO _rfp SELECT v_inv, e.dhash::bit(64), e.phash::bit(64) FROM photo_empreintes e WHERE e.url = an.photo_url;
          n_crees := n_crees + 1;
        END IF;
      END IF;
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      DELETE FROM rapprochement_nouvelles WHERE annonce_id = an.id;
      INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
      VALUES (p_user, an.id, 'aucune', 'auto', 0, jsonb_build_object('motif', 'erreur_moteur', 'erreur', left(SQLERRM, 300), 'phase', 'creation', 'regle', 'rattachement_avant_stock'));
    END;
  END LOOP;

  UPDATE rapprochement_comptes
     SET bilan = bilan || jsonb_build_object(
           'crees', COALESCE((bilan ->> 'crees')::int, 0) + n_crees,
           'groupees', COALESCE((bilan ->> 'groupees')::int, 0) + n_groupes,
           'a_verifier', COALESCE((bilan ->> 'a_verifier')::int, 0) + n_aver,
           'erreurs', COALESCE((bilan ->> 'erreurs')::int, 0) + n_err),
         maj_le = now()
   WHERE user_id = p_user;

  -- Reste-t-il des nouvelles CRÉABLES ? (celles qui attendent un geste ne
  -- retiennent pas le compte : elles partiront au prochain « Synchroniser ».)
  SELECT count(*) INTO v_reste
    FROM rapprochement_nouvelles n JOIN annonces_plateforme a ON a.id = n.annonce_id
    LEFT JOIN vinted_sync_runs s ON s.id = a.run_id
   WHERE n.user_id = p_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL AND a.proposition IS NULL
     AND v_import AND releve_est_geste(s.declencheur) AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL
     AND NOT (v_dette AND a.platform = 'beebs');
  IF v_reste > 0 THEN
    RETURN jsonb_build_object('etat', 'creation', 'crees', n_crees, 'restantes', v_reste,
                              'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
  END IF;

  -- ── E. FIN. Le dressing Vinted relevé pendant la vague a pu créer l'article
  --    d'une annonce déjà importée d'une autre plateforme : la fusion photo
  --    SÛRE existante (fusion_photo_compte : même photo, isolée, plateformes
  --    différentes, aucun frein) passe sur les articles de la vague.
  IF c.debut_le IS NOT NULL AND EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind = 'dressing'
                                          AND s.finished_at >= c.debut_le - interval '30 minutes')
     AND clock_timestamp() - t0 < v_budget THEN
    BEGIN
      v_fus := fusion_photo_compte(p_user, c.debut_le - interval '30 minutes', 20, 'utilisateur:photo_auto', 2000);
    EXCEPTION WHEN OTHERS THEN
      v_fus := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
    END;
  END IF;
  UPDATE rapprochement_comptes
     SET etat = 'termine', fin_le = now(), maj_le = now(), a_traiter = 0, photos_manquantes = 0,
         bilan = bilan || CASE WHEN v_fus IS NOT NULL THEN jsonb_build_object('fusion_photo', v_fus) ELSE '{}'::jsonb END
   WHERE user_id = p_user;
  RETURN jsonb_build_object('etat', 'termine', 'crees', n_crees, 'fusion_photo', v_fus,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;

REVOKE ALL ON FUNCTION public.rapprochement_avancer(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_avancer(uuid, integer) TO service_role;
COMMIT;
