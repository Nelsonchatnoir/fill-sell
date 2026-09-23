-- ═══════════════════════════════════════════════════════════════════════════
-- L'IMPORT AUTOMATIQUE ÉTAIT MORT DEPUIS LE 19/09 AU SOIR — RÉTABLI, ET UN
-- SEUL CORPS POUR LE RELEVÉ ET LE RATTRAPAGE (2026-09-23)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT (pironneau.vincent@gmail.com, inscrit le 23/09 à 08:13 Paris, sans
-- compte Vinted) : 598 annonces relevées (Leboncoin 528, eBay 53, Beebs 8,
-- Opla 9), 14 relevés, 1 688 lignes `rapprochements.decision = 'aucune'` sur
-- 8 runs, ZÉRO import, 1 article dans son stock. Son inventaire est vide :
-- aucune de ses annonces n'a de candidat, elles dépendent donc TOUTES de
-- l'import automatique des sans-candidat (point F du 18/09, 20260918106000).
--
-- LA CAUSE, LUE EN PROD (pg_get_functiondef, pas supposée) : la fonction
-- `rapprocher_releve` qui tournait ne contenait plus AUCUN appel à
-- `rapprocher_importer` (position = 0), ni les clés de proposition
-- `candidats_total` / `signaux` / `choix_arbitraire`. La migration
-- 20260919190000 (« une notification n'est pas une annonce ») a réécrit la
-- fonction en repartant du corps du 18/09 09:00 (journal « aucune »), qui
-- PRÉCÈDE le point F : le bloc d'import et les clés nées le même jour sont
-- partis avec. Mesuré : dernier import automatique le 19/09 à 14:53 Paris ;
-- depuis, 818 → 1 313 → 1 962 → 2 034 lignes « aucune » par jour et 0 import.
-- L'interrupteur `import_auto_ouvert` est resté à 1 tout du long, et rien ne
-- pouvait le montrer : la ligne « [rattachement] … » du run ne disait pas
-- « importées ».
--
-- L'ABSENCE DE VINTED N'EST PAS LA CAUSE, C'EST L'EXPOSITION. Un vendeur
-- Vinted a un inventaire (sync du dressing) contre lequel ses annonces
-- Leboncoin/eBay trouvent un candidat (bandes job / certain / propose). Un
-- vendeur sans Vinted, ou tout vendeur dont les annonces ne ressemblent à
-- rien de son stock, n'a que la bande « aucune » — la seule qui était morte.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. `rapprocher_traiter_annonce` : le traitement d'UNE annonce
--      (notification → job → certain → propose → aucune → import) vit dans UNE
--      fonction. Deux copies du même corps ont dérivé une fois ; il n'y en a
--      plus qu'une, et le relevé comme le rattrapage l'appellent.
--   2. `rapprocher_releve` : même préambule, même boucle, mêmes disparitions ;
--      délègue à (1). Le bilan dit désormais `importees`, `import_refusees`
--      (garde du jumeau), `restantes`, `budget_epuise`.
--      BUDGET DE TEMPS : le rôle `authenticated` (l'extension) porte
--      statement_timeout = 8 s. Un appel qui dépasse est ANNULÉ EN ENTIER :
--      c'est ce qui arrive aux relevés Opla de 44310spgl (1 004 annonces,
--      2 755 articles) et de nadegemarcelin78 (541 annonces) — aucune ligne
--      « aucune », aucun « [rattachement] » dans le run, rien n'entre jamais.
--      La boucle s'arrête donc à 70 % du timeout du rôle et rend `restantes` ;
--      ce qui est fait est COMMITÉ. L'extension (prochaine version) rappelle
--      tant que restantes > 0 ; les anciennes reprennent au relevé suivant,
--      les annonces les moins évaluées d'abord (pas de famine). Un compte qui
--      tenait dans le budget ne voit strictement aucune différence.
--   3. `rapprocher_rattraper(user, plateforme, simulation, second_releve_requis,
--      budget)` : rejoue le MÊME traitement sur les annonces vivantes, non
--      rattachées, non ignorées déjà en base — sans nouveau relevé, sans
--      republication, sans quota. service_role seulement. `p_simulation =
--      true` (défaut) exécute tout puis ANNULE (RAISE interne) et rend les
--      compteurs. Idempotent : une annonce rattachée ou ignorée n'est plus
--      examinée ; une proposition inchangée n'est ni réécrite ni rejournalisée.
--
-- CE QUI NE CHANGE PAS : `rapprocher_classer` (non touchée), les trois
-- conditions de l'import (interrupteur · en ligne · déjà sans candidat à un
-- run précédent), la garde du jumeau (`rapprocher_importer`, 20/09), les
-- bandes job / certain / propose au caractère près, `rapprochement_decider`,
-- les policies et les grants existants. Aucune valeur passée n'est réécrite
-- par cette migration : le rattrapage est un appel séparé, compte par compte.
--
-- ⛔ LE CONTRÔLE QUI L'EMPÊCHE DE REVENIR : le DO final vérifie EN PROD que
--    `rapprocher_releve` appelle `rapprocher_traiter_annonce` et que celle-ci
--    appelle `rapprocher_importer` ; `npm run selftest:moteur-rattachement`
--    vérifie la même chose sur la DERNIÈRE définition locale de chacune. Une
--    future migration qui repartirait d'un vieux corps échoue au lieu de
--    tuer l'import en silence.

-- ── 0. Le budget de temps d'un appel, lu sur le rôle qui appelle ───────────
-- statement_timeout vaut '8s' pour authenticated (PostgREST le pose à chaque
-- transaction), rien pour service_role. Une valeur sans unité est en
-- millisecondes. Illisible ou nul ⇒ le défaut.
CREATE OR REPLACE FUNCTION public.rapprocher_budget(p_part numeric DEFAULT 0.7, p_defaut interval DEFAULT interval '60 seconds')
RETURNS interval
LANGUAGE plpgsql STABLE
AS $$
DECLARE v_txt text := current_setting('statement_timeout', true); v_b interval;
BEGIN
  IF v_txt IS NULL OR v_txt = '' THEN RETURN p_defaut; END IF;
  BEGIN
    IF v_txt ~ '^\d+$' THEN v_b := make_interval(secs => (v_txt::numeric / 1000.0)::double precision);
    ELSE v_b := v_txt::interval; END IF;
  EXCEPTION WHEN OTHERS THEN RETURN p_defaut; END;
  IF v_b <= interval '0' THEN RETURN p_defaut; END IF;
  RETURN v_b * p_part::double precision;
END;
$$;

-- ── 1. LE TRAITEMENT D'UNE ANNONCE — une seule écriture ────────────────────
-- Rend l'issue : 'notification' | 'job' | 'certain' | 'propose' |
-- 'propose_inchangee' (rattrapage) | 'aucune' | 'import' | 'import_refuse'
-- (jumeau probable, proposition posée) | 'deja_traitee' | 'introuvable'.
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(
  p_annonce_id uuid,
  p_vus text[],
  p_import_ouvert boolean,
  p_rattrapage boolean DEFAULT false,
  p_second_releve_requis boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
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

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    -- Vue en ligne dans « Mes annonces » : un drapeau « plus en ligne » posé
    -- entre-temps par le veilleur était une fausse alerte — levé, archivé.
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── CERTAIN : un seul candidat, titre exact, prix égal, aucun homonyme ──
  IF v_bande = 'certain' THEN
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'auto',
                                      v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
                                       v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'automatique', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    RETURN 'certain';
  END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- Rattrapage : une proposition déjà posée sur le même article pour le
    -- même motif n'a rien de neuf — ni réécrite, ni rejournalisée.
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  -- Le relevé journalise (une ligne par annonce et par run : c'est ce qui rend
  -- la règle du deuxième relevé mesurable). Le rattrapage n'est pas un relevé :
  -- il ne rejournalise pas un état inchangé.
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici :
  -- l'interrupteur ; l'annonce est EN LIGNE ; elle était DÉJÀ sans candidat à
  -- un run AUTRE que le sien (la ligne écrite ci-dessus porte a.run_id, elle
  -- est exclue par le test). Elle a survécu à un cycle complet sans que
  -- l'utilisateur la rattache ni l'ignore — sinon on ne la verrait même pas.
  -- Le geste lui-même (rapprocher_importer) porte la garde du jumeau du 20/09.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_traiter_annonce(uuid, text[], boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_traiter_annonce(uuid, text[], boolean, boolean, boolean) TO service_role;

-- ── 2. LE RELEVÉ : même préambule, même boucle, mêmes disparitions ─────────
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text; v_vus text[];
  v_id uuid; v_res text;
  n_job integer := 0; n_auto integer := 0; n_prop integer := 0; n_disp integer := 0; n_aucune integer := 0;
  n_notif integer := 0; n_import integer := 0; n_refus integer := 0; n_restantes integer := 0; n_sautees integer := 0;
  v_complet boolean; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_budget interval := rapprocher_budget(0.7, interval '60 seconds');
  v_budget_epuise boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
  -- L'interrupteur, FAIL-CLOSED : absent, illisible ou différent de 1 => aucun import.
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;

  FOR v_id IN
    SELECT a.id FROM annonces_plateforme a
    WHERE a.run_id = p_run_id AND a.user_id = v_user AND a.platform = v_pf
      AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL
      -- Déjà traitée pour CE run (appel précédent arrêté au budget, puis
      -- rappel de l'extension) : on ne la rejoue pas, on avance.
      AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.detail ->> 'run_id' = p_run_id::text)
    -- Les annonces les MOINS évaluées d'abord : si un relevé précédent s'est
    -- arrêté au budget, sa queue passe devant. Au premier relevé tout est à 0
    -- et l'ordre est celui de toujours (vu_le).
    ORDER BY (SELECT count(*) FROM rapprochements r WHERE r.annonce_id = a.id), a.vu_le
  LOOP
    IF v_budget_epuise OR clock_timestamp() - v_debut > v_budget THEN
      v_budget_epuise := true; n_restantes := n_restantes + 1; CONTINUE;
    END IF;
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, true);
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import'        THEN n_aucune := n_aucune + 1; n_import := n_import + 1;
      WHEN 'import_refuse' THEN n_aucune := n_aucune + 1; n_refus := n_refus + 1;
      ELSE n_sautees := n_sautees + 1;
    END CASE;
  END LOOP;

  -- Disparitions : les annonces de cette plateforme non revues par un relevé
  -- COMPLET. Aucun signal de vente ici — c'est le veilleur qui tranche sur les
  -- jobs, avec ses propres règles ; on date seulement l'annonce.
  IF v_complet THEN
    UPDATE annonces_plateforme SET disparu_le = now(), updated_at = now()
     WHERE user_id = v_user AND platform = v_pf AND disparu_le IS NULL
       AND run_id IS DISTINCT FROM p_run_id AND vu_le < COALESCE(v_run.started_at, now());
    GET DIAGNOSTICS n_disp = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'importees', n_import, 'import_refusees', n_refus,
                            'ecartees_notification', n_notif,
                            'restantes', n_restantes, 'budget_epuise', v_budget_epuise, 'sautees', n_sautees,
                            'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;

-- ── 3. LE RATTRAPAGE : le même traitement, sur ce qui est déjà en base ─────
CREATE OR REPLACE FUNCTION public.rapprocher_rattraper(
  p_user uuid,
  p_platform text,
  p_simulation boolean DEFAULT true,
  p_second_releve_requis boolean DEFAULT true,
  p_budget_secondes numeric DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vus text[]; v_id uuid; v_res text; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_issues jsonb := '{}'::jsonb;
  n_examinees integer := 0; n_restantes integer := 0;
  v_inv_avant integer; v_inv_apres integer; v_ratt_avant integer; v_ratt_apres integer;
BEGIN
  IF p_platform NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
  -- « Vues » = toutes les annonces vivantes de la plateforme : c'est ce que
  -- voit un relevé complet, et ce qui écarte des candidats les articles dont
  -- l'annonce est déjà là.
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus
    FROM annonces_plateforme WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL;
  SELECT count(*) INTO v_inv_avant FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
  SELECT count(*) INTO v_ratt_avant FROM annonces_plateforme
   WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
  BEGIN
    FOR v_id IN
      SELECT a.id FROM annonces_plateforme a
      WHERE a.user_id = p_user AND a.platform = p_platform
        AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
      -- Les annonces SANS proposition d'abord : une proposition déjà posée n'a
      -- rien à gagner à repasser avant celles qui n'ont encore rien.
      ORDER BY (a.proposition IS NOT NULL), a.vu_le, a.created_at
    LOOP
      n_examinees := n_examinees + 1;
      IF clock_timestamp() - v_debut > make_interval(secs => p_budget_secondes::double precision) THEN
        n_restantes := n_restantes + 1; CONTINUE;
      END IF;
      v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, true, p_second_releve_requis);
      v_issues := jsonb_set(v_issues, ARRAY[v_res], to_jsonb(COALESCE((v_issues ->> v_res)::integer, 0) + 1));
    END LOOP;
    SELECT count(*) INTO v_inv_apres FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
    SELECT count(*) INTO v_ratt_apres FROM annonces_plateforme
     WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
    -- SIMULATION : tout a été exécuté pour de vrai, on annule tout. Les
    -- variables survivent à l'exception, les écritures non.
    IF p_simulation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rapprocher_rattraper:simulation';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rapprocher_rattraper:simulation' THEN RAISE; END IF;
  END;
  RETURN jsonb_build_object('ok', true, 'simulation', p_simulation, 'user_id', p_user, 'platform', p_platform,
                            'import_ouvert', v_import_ouvert, 'second_releve_requis', p_second_releve_requis,
                            'examinees', n_examinees, 'restantes', n_restantes, 'issues', v_issues,
                            'inventaire_avant', v_inv_avant, 'inventaire_apres', v_inv_apres,
                            'rattachees_avant', v_ratt_avant, 'rattachees_apres', v_ratt_apres,
                            'duree_ms', round(extract(epoch FROM (clock_timestamp() - v_debut)) * 1000));
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_rattraper(uuid, text, boolean, boolean, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_rattraper(uuid, text, boolean, boolean, numeric) TO service_role;

-- ── 4. LE CONTRÔLE : l'import ne peut plus disparaître en silence ──────────
DO $$
BEGIN
  IF position('rapprocher_traiter_annonce' IN pg_get_functiondef('public.rapprocher_releve(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rapprocher_releve ne délègue pas à rapprocher_traiter_annonce';
  END IF;
  IF position('rapprocher_importer' IN pg_get_functiondef('public.rapprocher_traiter_annonce(uuid, text[], boolean, boolean, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rapprocher_traiter_annonce n''appelle pas rapprocher_importer : l''import automatique serait de nouveau mort';
  END IF;
END $$;
