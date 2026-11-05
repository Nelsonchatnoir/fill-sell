-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261105240000_vendu_retire_partout — les définitions de PROD du 05/11 soir, mot pour mot
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- poser_questions_copies_non_prouvees  c045dd68dcf39340dfb65249ca0b969f
-- inventaire_doublon_decider           5ada387c781c2767cc0019c9845811c3
-- + DROP de armer_retrait_annonce_pour et de l'index inventaire_doublons_copie_annonce. Les questions posées entre-temps
-- (motif copie_non_prouvee, preuves.portee_par = 'annonce') restent en base ; ouvertes, leur « Oui » rend alors
-- « sans_objet » (aucun dépôt) — à classer « caduque » par un script de réparation si l'inverse est joué.
BEGIN;

CREATE OR REPLACE FUNCTION public.poser_questions_copies_non_prouvees(p_inventaire_id bigint, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_source text DEFAULT 'vente'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv inventaire%ROWTYPE;
  v_vendu_sur text;
  n integer := 0;
BEGIN
  SELECT * INTO v_inv FROM inventaire WHERE id = p_inventaire_id;
  IF NOT FOUND OR v_inv.fusionne_dans IS NOT NULL OR v_inv.statut IS DISTINCT FROM 'vendu' THEN
    RETURN 0;
  END IF;
  -- La plateforme de la vente, pour le texte : la vente enregistrée, sinon la fiche.
  SELECT lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) INTO v_vendu_sur
    FROM ventes v
   WHERE v.user_id = v_inv.user_id AND v.inventaire_id = v_inv.id
     AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
   ORDER BY v.created_at DESC LIMIT 1;
  v_vendu_sur := COALESCE(v_vendu_sur, lower(NULLIF(btrim(COALESCE(v_inv.plateforme, '')), '')));

  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  SELECT v_inv.user_id, v_inv.id, v_inv.id, 'probable', 'proposee', 'copie_non_prouvee',
         jsonb_build_object(
           'job', j.id, 'annonce_id', ap.id, 'platform', j.platform,
           'url', COALESCE(NULLIF(btrim(COALESCE(ap.url, '')), ''), NULLIF(btrim(COALESCE(j.listing_url, '')), '')),
           'titre', COALESCE(NULLIF(btrim(COALESCE(ap.titre, '')), ''), NULLIF(btrim(COALESCE(j.title, '')), ''), v_inv.titre),
           'vendu_sur', v_vendu_sur,
           'rattachement', j.platform_fields -> 'rattachement',
           'rattachement_automatique', NOT public.rattachement_confirme(j.id)),
         left(COALESCE(p_source, 'vente'), 80)
    FROM cross_post_jobs j
    JOIN LATERAL (
      SELECT a.id, a.url, a.titre FROM annonces_plateforme a
       WHERE a.job_id = j.id AND a.user_id = j.user_id AND a.disparu_le IS NULL AND a.retiree_le IS NULL
       ORDER BY a.vu_le DESC NULLS LAST LIMIT 1) ap ON true
   WHERE j.user_id = v_inv.user_id AND j.inventaire_id = v_inv.id
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published'
     AND (p_sauf_job IS NULL OR j.id <> p_sauf_job)
     AND (p_sauf_plateforme IS NULL OR j.platform <> p_sauf_plateforme)
     AND lower(COALESCE(NULLIF(v_inv.plateforme, ''), '')) <> lower(j.platform)
     AND (v_vendu_sur IS NULL OR v_vendu_sur <> lower(j.platform))
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'
     -- (11/10, Nico) Sortie d'Opla : aucune question sur une copie Opla (elle ne se retire plus d'ici).
     AND NOT (j.platform = 'opla' AND public.opla_sortie_passee())
     -- (15/10, P16) une plateforme où la fiche porte DEUX annonces vivantes (deux
     -- exemplaires, ou la même annonce publiée deux fois) : aucune n'est retirée
     -- d'office (armer_retraits_copies) — chacune devient la question « Déjà
     -- vendu ? », jamais le silence (les deux restaient en vente après la vente).
     AND (public.fiche_annonces_vivantes(v_inv.id, j.platform) >= 2
          OR (NOT public.retrait_job_prouve(j.id) AND public.fiche_annonces_vivantes(v_inv.id, j.platform) < 2)
          -- (05/11, Nico) une copie rattachée AUTOMATIQUEMENT sans photo identique et jamais confirmée : la question,
          -- jamais le retrait (05/11 soir, décision a : la photo identique reste une preuve)
          OR NOT public.rattachement_confirme(j.id))
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d
                      WHERE d.user_id = j.user_id AND d.inventaire_id = j.inventaire_id AND d.platform = j.platform
                        AND d.action = 'delete' AND d.status IN ('pending', 'processing', 'needs_user'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text, p_annonce_montree uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
  v_job uuid; v_del uuid; v_retraits jsonb; v_sans int; v_geste boolean; v_pf_sans jsonb; v_detail text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  -- (06/10, Nico) « Déjà vendu ? » sur une COPIE de la fiche vendue, liée par
  -- le seul titre : « Oui, la retirer » = le geste de la personne prouve que
  -- c'est le même article (rattachement 'utilisateur') ET vaut preuve de vente
  -- pour CE retrait (p_preuve_geste, règle Louis du 30/09) ; le retrait passe
  -- par armer_retrait_job_pour, toutes ses gardes comprises (deux annonces
  -- vivantes sur la plateforme = deux exemplaires = rien). Sans retrait armé,
  -- rien n'est écrit. « Non, c'est un autre exemplaire » : on n'y touche plus,
  -- la question n'est jamais reposée (index unique par dépôt).
  IF d.motif = 'copie_non_prouvee' THEN
    v_job := NULLIF(d.preuves ->> 'job', '')::uuid;
    IF p_decision = 'non' THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'non');
    ELSIF p_decision IS DISTINCT FROM 'oui' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
    END IF;
    -- jamais un retrait sur une annonce que l'écran n'a pas montrée
    IF p_annonce_montree IS NULL OR p_annonce_montree::text IS DISTINCT FROM (d.preuves ->> 'annonce_id') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_non_montree');
    END IF;
    IF v_job IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.user_id = v_user AND i.fusionne_dans IS NULL AND i.statut = 'vendu')
       OR NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = d.garde
                       AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
    END IF;
    BEGIN
      UPDATE cross_post_jobs
         SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('rattachement',
               COALESCE(platform_fields -> 'rattachement', '{}'::jsonb) || jsonb_build_object(
                 'par', 'utilisateur', 'motif', 'meme_article_confirme',
                 'confirme', jsonb_build_object('question', d.id, 'le', now(),
                   'avant', jsonb_build_object('par', platform_fields #> '{rattachement,par}',
                                               'motif', platform_fields #> '{rattachement,motif}'))))
       WHERE id = v_job;
      v_del := armer_retrait_job_pour(v_job, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà armé par un autre chemin : armer_retrait_job ne double jamais
        SELECT dj.id INTO v_del
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id = v_job AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
      END IF;
      IF v_del IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = jsonb_build_array(d.preuves ->> 'platform')::text;
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del)
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
    EXCEPTION WHEN SQLSTATE 'P0R01' THEN
      -- rattachement et retrait annulés ; la question reste ouverte
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
    END;
  END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    -- (2026-09-30, règle Louis partie 2) La fiche gardée est VENDUE : on
    -- regroupe, puis SEULS les dépôts venus de la fiche en ligne reçoivent un
    -- retrait. Si une annonce vivante venue de la fiche en ligne reste sans
    -- retrait, tout est annulé (jamais une annonce vivante cachée sous une
    -- fiche vendue).
    -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT 16:19, Dylan Fontaine 16:28) UNE ANNONCE EN LIGNE QUI RESSEMBLE À UN ARTICLE
    -- DÉJÀ VENDU N'EST JAMAIS RETIRÉE, ni réunie à la fiche vendue : elle entre dans le stock comme un article à part
    -- (des exemplaires de plus d'un vendeur de neuf ; une carte mise en ligne trois mois après la vente de l'autre).
    -- Le « oui » d'avant (30/09, règle Louis partie 2) réunissait les fiches et retirait l'annonce : 8 retraits à tort le
    -- 03/11. Une fiche sans annonce en ligne se réunit comme avant (rien à retirer). La copie interrogée à la vente du
    -- jour (copie_non_prouvee, plus haut) garde son « Oui, la retirer ».
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu')
       AND (EXISTS (SELECT 1 FROM annonces_plateforme ap
                     WHERE ap.user_id = v_user AND ap.inventaire_id = d.absorbe
                       AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL)
            OR EXISTS (SELECT 1 FROM cross_post_jobs j
                        WHERE j.user_id = v_user AND j.inventaire_id = d.absorbe AND j.status = 'published'
                          AND COALESCE(j.action, 'publish') IN ('publish', 'republish'))) THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur',
             preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object(
               'reponse', p_decision, 'issue', 'article_a_part_annonce_en_ligne', 'le', now())
       WHERE id = d.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (v_user, 'doublon_vendu_article_a_part', jsonb_build_object(
        'doublon', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'motif', d.motif, 'reponse', p_decision));
      RETURN jsonb_build_object('ok', true, 'decision', p_decision, 'retraits', 0, 'article_a_part', true);
    END IF;
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN
        r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
        IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
          -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
          IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
            UPDATE inventaire_doublons
               SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
                     'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
             WHERE id = d.id AND statut = 'proposee';
          END IF;
          RETURN r || jsonb_build_object('decision', 'oui');
        END IF;
        FOR v_job IN
          SELECT j.id FROM cross_post_jobs j
           WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
             AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
        LOOP
          -- (2026-09-30, décision Nico) le « oui » vaut preuve de vente pour le
          -- seul retrait de l'annonce que l'app a montrée (p_annonce_montree),
          -- et seulement si elle vient bien de la fiche en ligne.
          v_geste := p_annonce_montree IS NOT NULL AND EXISTS (
            SELECT 1 FROM annonces_plateforme ap
             WHERE ap.id = p_annonce_montree AND ap.user_id = v_user AND ap.job_id = v_job AND ap.disparu_le IS NULL
               AND ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x));
          v_del := armer_retrait_job_pour(v_job, 'doublon_vendu_confirme', interval '0', v_geste);
        END LOOP;
        -- Les retraits en cours des dépôts venus de la fiche en ligne (armés
        -- ici, ou déjà par un autre chemin : armer_retrait_job ne double jamais).
        SELECT COALESCE(jsonb_agg(DISTINCT dj.id::text), '[]'::jsonb) INTO v_retraits
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
           AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
        -- Une annonce vivante venue de la fiche en ligne sans retrait en cours ?
        SELECT count(*) INTO v_sans
          FROM annonces_plateforme ap
         WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
           AND ap.disparu_le IS NULL
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                            WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
        IF v_sans > 0 THEN
          -- les plateformes où la personne devra retirer elle-même
          SELECT COALESCE(jsonb_agg(DISTINCT ap.platform), '[]'::jsonb) INTO v_pf_sans
            FROM annonces_plateforme ap
           WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
             AND ap.disparu_le IS NULL
             AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                              WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = v_pf_sans::text;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                       fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid,
                                       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retraits_oui', v_retraits)
         WHERE id = d.id;
        RETURN r || jsonb_build_object('decision', 'oui', 'retraits', jsonb_array_length(v_retraits));
      EXCEPTION WHEN SQLSTATE 'P0R01' THEN
        -- regroupement et retraits annulés ; la question reste ouverte
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;   -- (texte jsonb des plateformes)
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
      END;
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
    -- (05/11 soir, décision c) « Annonce en double ? » → « Oui » passe ici : refusé sur une fiche unitaire, sauf
    -- republication prouvée ; l'écran Doublons montre r.message (sinon preuves.fusion_refusee.message).
    IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
      UPDATE inventaire_doublons
         SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
               'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
       WHERE id = d.id AND statut = 'proposee';
    END IF;
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

DROP FUNCTION IF EXISTS public.armer_retrait_annonce_pour(uuid, text, interval, boolean);
DROP INDEX IF EXISTS public.inventaire_doublons_copie_annonce;

DO $verif$
BEGIN
  IF md5(replace(pg_get_functiondef('public.poser_questions_copies_non_prouvees(bigint,uuid,text,text)'::regprocedure), chr(13), '')) <> 'c045dd68dcf39340dfb65249ca0b969f'
     OR md5(replace(pg_get_functiondef('public.inventaire_doublon_decider(uuid,text,uuid)'::regprocedure), chr(13), '')) <> '5ada387c781c2767cc0019c9845811c3' THEN
    RAISE EXCEPTION 'inverse de 20261105240000 : les définitions rejouées ne sont pas celles de la prod du 05/11';
  END IF;
END
$verif$;

COMMIT;
