-- ═══════════════════════════════════════════════════════════════════════════
-- 25/09/2026 — check de nuit, point 5 (Ornella) : une annonce retrouvée par un
-- relevé, dont l'identifiant est celui d'un dépôt FillSell CLOS ('cancelled' ou
-- 'sold'), se rattache à SA fiche — même marquée « vendu » — au lieu d'être
-- importée en doublon.
-- ✅ APPLIQUÉE le 25/09 vers 09:30 (Paris), GO explicite de Nico, par execute_sql
--    dans UNE transaction. md5 APRÈS (pg_get_functiondef) : rapprocher_classer
--    a20a0db8459ca37ded6c21834bc3b469, rapprocher_traiter_annonce
--    e5c1c5ff9269c19e6e55e18ed3ccc334 = ce fichier + le saut de ligne final.
--    Mesure avant application : sur les 996 annonces en attente du parc, 16 en
--    bande 'job' (inchangée), 0 qui basculerait en 'job_clos' — les imports
--    légitimes continuent exactement comme avant.
-- Générée DEPUIS pg_get_functiondef lu en prod le 25/09 (md5 vérifiés :
-- rapprocher_classer cdbe0ab57423c57d7a7f1f3caaf7623b,
-- rapprocher_traiter_annonce 220d6c000e550fc1bd3df6ba2212201a), par ancres
-- (A1, A2, A3 — une occurrence chacune). À l'application : RELIRE les md5 en
-- prod ; s'ils ont bougé, regénérer (scratch gen-migration-5a.mjs), jamais
-- recopier ce fichier.
-- Ce que ça change : SEULEMENT la bande 'job_clos' (nouvelle), essayée APRÈS la
-- bande 'job' (identifiant d'un dépôt publié, inchangée) et AVANT tout le reste.
-- Mesuré par l'enquête : 5 annonces chez Ornella depuis le 18/09, 0 ailleurs ;
-- simulation sur les annonces en attente du parc : 0 touchée (cf. ci-dessus).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rapprocher_classer(p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_id     text := nullif(btrim(coalesce(p_listing_id, '')), '');
  v_job    record;
  v_job_clos record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_connu boolean;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
  v_ja     text[];
  v_cf     jsonb := '[]'::jsonb;
  v_nf     integer := 0;
  v_identiques boolean := false;
  v_sortie jsonb;
BEGIN
  -- ⛔ UN IDENTIFIANT VIDE N'IDENTIFIE RIEN. Sans cette garde,
  --    `position('' in <url>) > 0` est vrai pour tous les jobs et la fonction
  --    rend « identifiant » sur le dernier job publié du compte (cf. en-tête).
  IF v_id IS NOT NULL THEN
    SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND (j.platform_listing_id = v_id
           OR (v_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v_id || '([^0-9]|$)'))
           OR (v_id !~ '^\d+$' AND position(v_id in COALESCE(j.listing_url, '')) > 0))
    ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_job.id IS NOT NULL THEN
      RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
    END IF;
    -- ⛔ 2026-09-25 (Ornella) : un dépôt FillSell CLOS — 'cancelled' (« je l'ai
    --    retirée », frère d'une vente) ou 'sold' — dont l'identifiant est
    --    RETROUVÉ par un relevé désigne toujours SA fiche, même 'vendu'.
    --    Sans ce bloc : « aucun_candidat » → import → doublon (5 annonces LBC,
    --    rattrapage du 23/09 16:35). Identifiant seulement, jamais le titre.
    SELECT j.id, j.inventaire_id, i.statut INTO v_job_clos
      FROM cross_post_jobs j
      JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = p_user AND i.fusionne_dans IS NULL
     WHERE j.user_id = p_user AND j.platform = p_platform
       AND j.action IN ('publish', 'republish') AND j.status IN ('cancelled', 'sold')
       -- un rattachement DÉFAIT par la personne (detache_le) ne se refait jamais tout seul
       AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
       AND (j.platform_listing_id = v_id
            OR (v_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v_id || '([^0-9]|$)'))
            OR (v_id !~ '^\d+$' AND position(v_id in COALESCE(j.listing_url, '')) > 0))
     ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_job_clos.id IS NOT NULL THEN
      RETURN jsonb_build_object('bande', 'job_clos', 'inventaire_id', v_job_clos.inventaire_id, 'job_id', v_job_clos.id,
                                'statut_fiche', v_job_clos.statut, 'score', 1, 'motif', 'identifiant_depot_clos');
    END IF;
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

  FOR v_c IN
    SELECT j.id AS job_id, j.inventaire_id, j.price AS prix, j.title AS titre,
           (j.platform_fields ? 'unavailable_since') AS deja_disparu
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND titre_norm(j.title) = v_t
      AND NOT (COALESCE(j.platform_listing_id, '') = ANY (p_vus))
      AND NOT EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
            (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
            OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
      AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.job_id = j.id AND ap.disparu_le IS NULL)
    ORDER BY (j.platform_fields ? 'unavailable_since') DESC, COALESCE(j.published_at, j.created_at) DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'job', 'job_id', v_c.job_id, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'deja_disparu', v_c.deja_disparu);
  END LOOP;
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre, i.created_at
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'created_at', v_c.created_at);
  END LOOP;

  IF v_n = 0 THEN
    v_ja := ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(v_t, ' ')) t WHERE length(t) >= 3);
    IF COALESCE(array_length(v_ja, 1), 0) = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    FOR v_c IN
      SELECT q.* FROM (
        SELECT i.id AS inventaire_id, i.titre, i.prix_vente AS prix, jr.id AS job_remplace,
               (k.communs / NULLIF(k.largeur, 0)) AS recouvrement,
               (s.m <> '' AND position(s.m in v_t) > 0) AS marque_ok,
               (s.ta <> '' AND (' ' || v_t || ' ') LIKE ('% ' || s.ta || ' %')) AS taille_ok,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL
                  AND abs(p_prix - i.prix_vente) < 0.01) AS prix_exact,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL AND i.prix_vente > 0
                  AND abs(p_prix - i.prix_vente) / i.prix_vente <= 0.15) AS prix_proche
        FROM inventaire i
        CROSS JOIN LATERAL (
          SELECT
            ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(titre_norm(i.titre), ' ')) t WHERE length(t) >= 3) AS jt,
            titre_norm(COALESCE(NULLIF(trim(i.marque), ''),
                                CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object'
                                     THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END)) AS m,
            titre_norm(CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object'
                            THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END) AS ta
        ) s
        CROSS JOIN LATERAL (
          SELECT (SELECT count(*) FROM unnest(s.jt) x WHERE x = ANY (v_ja))::numeric AS communs,
                 greatest(COALESCE(array_length(s.jt, 1), 0), COALESCE(array_length(v_ja, 1), 0))::numeric AS largeur
        ) k
        LEFT JOIN LATERAL (
          SELECT j.id FROM cross_post_jobs j
          WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
            AND j.action IN ('publish', 'republish') AND j.status = 'published'
          ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1
        ) jr ON true
        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
          AND NOT titres_variantes_incompatibles(p_titre, i.titre) -- AJOUT 2026-09-24 : la couleur et le nombre excluent
          AND NOT EXISTS (
            SELECT 1 FROM cross_post_jobs j
            WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
              AND j.action IN ('publish', 'republish') AND j.status = 'published'
              AND (COALESCE(j.platform_listing_id, '') = ANY (p_vus)
                   OR EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
                        (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
                        OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
                   OR EXISTS (SELECT 1 FROM annonces_plateforme ap2 WHERE ap2.job_id = j.id AND ap2.disparu_le IS NULL)))
          AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.inventaire_id = i.id AND ap.disparu_le IS NULL)
      ) q
      WHERE q.recouvrement >= 0.34
        AND (0.50 * q.recouvrement
             + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
             + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
      ORDER BY (0.50 * q.recouvrement
                + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
                + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
                + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) DESC,
               q.recouvrement DESC, q.inventaire_id DESC
      LIMIT 5
    LOOP
      v_nf := v_nf + 1;
      v_cf := v_cf || jsonb_build_object(
        'type', 'inventaire', 'job_id', v_c.job_remplace, 'inventaire_id', v_c.inventaire_id,
        'prix', v_c.prix, 'titre', v_c.titre,
        'score', round(least(0.85,
            0.50 * v_c.recouvrement
          + CASE WHEN v_c.prix_exact THEN 0.20 WHEN v_c.prix_proche THEN 0.08 ELSE 0 END
          + CASE WHEN v_c.marque_ok THEN 0.15 ELSE 0 END
          + CASE WHEN v_c.taille_ok THEN 0.07 ELSE 0 END), 2),
        'signaux', jsonb_build_object('recouvrement', round(v_c.recouvrement, 2),
                                      'prix', CASE WHEN v_c.prix_exact THEN 'exact' WHEN v_c.prix_proche THEN 'proche' ELSE 'non' END,
                                      'marque', v_c.marque_ok, 'taille', v_c.taille_ok,
                                      'remplace_annonce', v_c.job_remplace IS NOT NULL));
    END LOOP;
    IF v_nf = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    v_best := v_cf -> 0;
    RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                              'score', (v_best ->> 'score')::numeric,
                              'motif', 'faisceau', 'candidats', v_cf,
                              'signaux', v_best -> 'signaux');
  END IF;

  IF v_n > 1 THEN
    SELECT count(*) = 0 INTO v_identiques
      FROM jsonb_array_elements(v_cands) c
     WHERE c ->> 'type' <> 'inventaire'
        OR (c ->> 'prix') IS DISTINCT FROM (v_cands -> 0 ->> 'prix');
    IF v_identiques THEN
      SELECT jsonb_agg(c ORDER BY (c ->> 'created_at')) INTO v_cands
        FROM jsonb_array_elements(v_cands) c;
    END IF;
  END IF;

  v_best := v_cands -> 0;
  v_prix_connu := p_prix IS NOT NULL AND (v_best ->> 'prix') IS NOT NULL;
  v_prix_ok := v_prix_connu AND abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_identiques THEN 'homonymes_tranches'
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_connu THEN 'prix_inconnu'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_sortie
    FROM (SELECT c FROM jsonb_array_elements(v_cands) c LIMIT 8) s;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_sortie, 'candidats_total', v_n,
                            'choix_arbitraire', CASE WHEN v_identiques THEN
                              jsonb_build_object('regle', 'la plus ancienne', 'total', v_n) ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
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
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;
