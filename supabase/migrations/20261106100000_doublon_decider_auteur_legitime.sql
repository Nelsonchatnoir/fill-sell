-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261106100000 — UN « OUI » ARME LE RETRAIT QUEL QUE SOIT L'AUTEUR LÉGITIME DE LA RÉPONSE (06/11, ordre de Nico, point 4)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Le défaut (05/11 soir, Doudou de nicolas.menar) : inventaire_doublon_decider lisait le compte sur la SESSION
-- (auth.uid()) ; sans session — une réponse donnée pour la personne par l'équipe, sur ordre — elle rendait
-- « unauthorized » et n'armait rien. Le retrait a dû être armé à la main par armer_retrait_annonce_pour.
-- LA RÈGLE : la décision et ses gardes sont UNE fonction (inventaire_doublon_decider_corps), qui prend le compte de la
-- QUESTION et ne lit jamais la session ; deux entrées seulement, qui disent qui répond :
--   · inventaire_doublon_decider(p_id, p_decision, p_annonce_montree) — l'app : la personne, sur sa session (inchangé :
--     sans session « unauthorized », la question d'un autre compte « introuvable ») ;
--   · inventaire_doublon_decider_pour(p_id, p_decision, p_annonce_montree, p_auteur) — l'équipe FillSell sur ordre :
--     service seulement (ni anon, ni authenticated), auteur NOMMÉ obligatoire, écrit sur la question
--     (preuves.repondu_par). Mêmes gardes, même retrait (armer_retrait_annonce_pour / armer_retrait_job_pour avec la
--     preuve du geste), même trace decide_par = 'utilisateur' (« réponse humaine à la question de la personne » : les
--     lecteurs — moteur, rapprochement-ia — la traitent comme la sienne).
-- L'IA (inventaire_doublon_decider_ia) n'est PAS un auteur légitime d'un retrait : elle ne touche jamais une fiche vendue
-- ni une « copie non prouvée » (inchangée).
-- Corps : pg_get_functiondef de la PROD du 06/11 (scripts/essais/fixtures/prod-0611-doublon-decider), deux lignes
-- changées (le nom et v_user). Essai : scripts/essais/20261106100000_banc.mjs (Postgres jetable). Inverse :
-- supabase/rollbacks/20261106100000_doublon_decider_auteur_legitime_INVERSE.sql.

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider_corps(p_user uuid, p_id uuid, p_decision text, p_annonce_montree uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;   -- (06/11) le compte de la QUESTION, passé par l'entrée ; jamais lu sur la session ici
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
    -- ⛔ (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) Le « Oui » retire L'ANNONCE MONTRÉE, par SON numéro et
    -- son lien : une question portée par l'annonce (aucun dépôt publié ne la porte sous son numéro), ou un dépôt dont le
    -- numéro désigne une AUTRE annonce que celle montrée (le Doudou de nicolas.menar : le dépôt 13627ae2 porte 3267000921,
    -- « Lot 2 doudous » ; l'annonce montrée est 3274924341) → armer_retrait_annonce_pour, jamais le numéro du dépôt.
    IF v_job IS NULL OR EXISTS (
         SELECT 1 FROM cross_post_jobs j, annonces_plateforme a
          WHERE j.id = v_job AND a.id = p_annonce_montree
            AND (NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(j.listing_url, '')), '') IS NOT NULL)
            AND NOT listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)) THEN
      IF NOT EXISTS (SELECT 1 FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
                      WHERE a.id = p_annonce_montree AND a.user_id = v_user AND a.inventaire_id = d.garde
                        AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu') THEN
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
        RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
      END IF;
      v_del := armer_retrait_annonce_pour(p_annonce_montree, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà en file pour CETTE annonce : jamais deux retraits
        SELECT dj.id INTO v_del
          FROM cross_post_jobs dj, annonces_plateforme a
         WHERE a.id = p_annonce_montree AND dj.user_id = v_user AND dj.platform = a.platform AND dj.action = 'delete'
           AND dj.status IN ('pending', 'processing', 'needs_user') AND listing_designe(a.listing_id, dj.listing_url, dj.platform_listing_id)
         ORDER BY dj.created_at LIMIT 1;
      END IF;
      IF v_del IS NULL THEN   -- rien n'est écrit, la question reste ouverte
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del, 'retrait_par', 'annonce')
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
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

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text, p_annonce_montree uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  -- (06/11) L'entrée de l'app : la personne répond sur sa session. Le corps est partagé avec inventaire_doublon_decider_pour.
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  RETURN public.inventaire_doublon_decider_corps(v_user, p_id, p_decision, p_annonce_montree);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider_pour(p_id uuid, p_decision text, p_annonce_montree uuid, p_auteur text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auteur text := NULLIF(btrim(COALESCE(p_auteur, '')), '');
  v_user   uuid;
  v_avant  text;
  r        jsonb;
BEGIN
  -- (06/11) L'entrée de l'équipe, sur ordre : jamais sans auteur nommé ; le compte est celui de la QUESTION.
  IF v_auteur IS NULL OR v_auteur ~* '^(utilisateur|ia|auto|regle)$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auteur_absent');
  END IF;
  SELECT user_id, statut INTO v_user, v_avant FROM inventaire_doublons WHERE id = p_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  r := public.inventaire_doublon_decider_corps(v_user, p_id, p_decision, p_annonce_montree);
  -- La question tranchée par cette réponse porte son auteur (decide_par reste « utilisateur » : la même règle partout).
  UPDATE inventaire_doublons
     SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('repondu_par', jsonb_build_object(
           'auteur', v_auteur, 'le', now(), 'decision', p_decision, 'voie', 'inventaire_doublon_decider_pour'))
   WHERE id = p_id AND statut IS DISTINCT FROM v_avant AND decide_le >= now();
  RETURN r || jsonb_build_object('repondu_par', v_auteur);
END;
$function$;

REVOKE ALL ON FUNCTION public.inventaire_doublon_decider_corps(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventaire_doublon_decider_pour(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventaire_doublon_decider_corps(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventaire_doublon_decider_pour(uuid, text, uuid, text) TO service_role;
