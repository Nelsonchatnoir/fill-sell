-- Point A — identité : une ressemblance reste une question.
-- GO Nico du 28/09 : correction A à I, sans réparation manuelle de données.
-- Définitions reprises de la production. Idempotent. Aucun balayage ni reprise de jobs.
-- Retour arrière : supabase/rollbacks/20260928085110_point_a_identite_prouvee.sql
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

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
    v_ja := titre_jetons(p_titre); -- MODIF 2026-09-25 : les mots qui comptent (racinisés, hors mots vides)
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
            titre_jetons(i.titre) AS jt, -- MODIF 2026-09-25
            titre_marque_utile(COALESCE(NULLIF(trim(i.marque), ''), -- MODIF 2026-09-25 : « Vintage » n'est pas une marque
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
        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL -- MODIF 2026-09-25 : une fiche « disparue » de Vinted est toujours en stock, elle reste candidate
          AND NOT titres_variantes_exclusives(p_titre, i.titre) -- MODIF 2026-09-25 : la couleur exclut ; le nombre seulement si aucun côté ne contient l'autre
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
        AND ((0.50 * q.recouvrement
             + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
             + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
             OR q.recouvrement >= 0.6) -- MODIF 2026-09-25 : le prix change d'une plateforme à l'autre ; un titre qui recouvre à 60 % suffit à PROPOSER
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
    RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
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

CREATE OR REPLACE FUNCTION public.meme_objet_niveau(s jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v text := COALESCE(s -> 'photo' ->> 'verdict', 'inconnue');
  ov numeric := COALESCE((s ->> 'ov')::numeric, 0);
  exact boolean := COALESCE((s ->> 'exact')::boolean, false);
  certain_photo boolean; certain_texte boolean;
BEGIN
  IF s ->> 'couleur' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'couleur'); END IF;
  IF s ->> 'nombre' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'nombre'); END IF;
  IF s ->> 'marque' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'marque'); END IF;
  certain_photo := v = 'identique' AND ov >= 0.75;
  certain_texte := v = 'inconnue' AND exact AND s ->> 'prix' = 'egal';
  IF (certain_photo OR certain_texte) AND s ->> 'nombre' = 'ok' AND s ->> 'lot' = 'ok' THEN
    RETURN jsonb_build_object('niveau', 'probable', 'motif', CASE WHEN certain_photo THEN 'photo_identique' ELSE 'titre_exact_prix_egal' END);
  END IF;
  IF (v = 'identique' AND ov >= 0.4) OR (v = 'proche' AND ov >= 0.6) OR (exact AND v <> 'differente')
     OR (v = 'inconnue' AND ov >= 0.75 AND s ->> 'prix' IN ('egal', 'proche'))
     -- Un titre PRÉCIS (≥ 5 mots qui comptent, ≥ 80 % en commun) reste une
     -- question même quand les photos diffèrent : le vendeur a re-photographié
     -- ou détouré (pichet de Jocabroc : même objet, fond changé, dHash 22).
     OR (v IN ('differente', 'inconnue') AND ov >= 0.8 AND COALESCE((s ->> 'communs')::integer, 0) >= 5) THEN
    RETURN jsonb_build_object('niveau', 'probable', 'motif',
      CASE WHEN s ->> 'lot' <> 'ok' THEN 'lot_contre_unite'
           WHEN s ->> 'nombre' = 'partiel' THEN 'nombres_partiels'
           WHEN v = 'identique' THEN 'photo_identique'
           WHEN exact THEN 'titre_exact'
           WHEN v = 'proche' THEN 'photo_proche'
           WHEN v IN ('differente', 'inconnue') AND ov >= 0.8 AND COALESCE((s ->> 'communs')::integer, 0) >= 5 THEN 'titre_precis'
           ELSE 'titre_proche' END);
  END IF;
  RETURN jsonb_build_object('niveau', 'ecarte', 'motif', CASE WHEN v = 'differente' THEN 'photos_differentes' ELSE 'preuves_insuffisantes' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-25 : l'appelant dit pour qui (inventaire_fusionner passe auth.uid())
  g inventaire%ROWTYPE;
  a inventaire%ROWTYPE;
  v_dep jsonb := '{}'::jsonb;
  v_champs jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_attr jsonb;
  v_cle text;
  v_id uuid;
BEGIN
  -- Point A : une ressemblance ne permet jamais une fusion automatique.
  IF COALESCE(p_par, '') NOT LIKE 'utilisateur%' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'confirmation_utilisateur_requise');
  END IF;
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF p_garde IS NULL OR p_absorbe IS NULL OR p_garde = p_absorbe THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'articles_identiques');
  END IF;
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = v_user FOR UPDATE;
  SELECT * INTO a FROM inventaire WHERE id = p_absorbe AND user_id = v_user FOR UPDATE;
  IF g.id IS NULL OR a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;
  IF g.fusionne_dans IS NOT NULL OR a.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_fusionne');
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('ventes', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM cross_post_jobs WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('cross_post_jobs', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM annonces_plateforme WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE annonces_plateforme SET inventaire_id = p_garde, source_rapprochement = 'manuel', proposition = NULL, updated_at = now()
     WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('annonces_plateforme', v_ids);
  END IF;

  SELECT jsonb_agg(id) INTO v_ids FROM vinted_listing_snapshots WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_listing_snapshots SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_listing_snapshots', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM vinted_republish_captures WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_republish_captures SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_republish_captures', v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_absorbe AND user_id = v_user)
     AND NOT EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_garde AND user_id = v_user) THEN
    UPDATE fiches_annonce SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('fiches_annonce', jsonb_build_array(p_absorbe));
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE rapprochements SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('rapprochements', v_ids);
  END IF;

  IF g.prix_achat IS NULL AND COALESCE(g.prix_achat_inconnu, false) = false
     AND (a.prix_achat IS NOT NULL OR COALESCE(a.prix_achat_inconnu, false) = true) THEN
    UPDATE inventaire SET prix_achat = a.prix_achat, prix_achat_inconnu = a.prix_achat_inconnu WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object(
      'prix_achat', jsonb_build_object('avant', NULL, 'apres', a.prix_achat),
      'prix_achat_inconnu', jsonb_build_object('avant', g.prix_achat_inconnu, 'apres', a.prix_achat_inconnu));
  END IF;

  IF NULLIF(trim(COALESCE(g.description, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.description, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET description = a.description WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('description', jsonb_build_object('avant', g.description, 'apres', a.description));
  END IF;
  IF NULLIF(trim(COALESCE(g.marque, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.marque, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET marque = a.marque WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('marque', jsonb_build_object('avant', g.marque, 'apres', a.marque));
  END IF;
  IF (g.photos IS NULL OR jsonb_typeof(g.photos) <> 'array' OR jsonb_array_length(g.photos) = 0)
     AND jsonb_typeof(a.photos) = 'array' AND jsonb_array_length(a.photos) > 0 THEN
    UPDATE inventaire SET photos = a.photos WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('photos', jsonb_build_object('avant', g.photos, 'apres', a.photos));
  END IF;
  IF jsonb_typeof(a.attributs) = 'object' THEN
    v_attr := COALESCE(g.attributs, '{}'::jsonb);
    FOR v_cle IN SELECT k FROM jsonb_object_keys(a.attributs) k LOOP
      IF NOT (v_attr ? v_cle) THEN v_attr := v_attr || jsonb_build_object(v_cle, a.attributs -> v_cle); END IF;
    END LOOP;
    IF v_attr <> COALESCE(g.attributs, '{}'::jsonb) THEN
      UPDATE inventaire SET attributs = v_attr WHERE id = p_garde;
      v_champs := v_champs || jsonb_build_object('attributs', jsonb_build_object('avant', g.attributs, 'apres', v_attr));
    END IF;
  END IF;

  -- ── AJOUT 2026-09-25 : L'IDENTITÉ VINTED SUIT L'OBJET ─────────────────────
  -- L'absorbé porte l'annonce Vinted VIVANTE et le gardé n'en a pas : elle
  -- passe au gardé. Sans ça, la fiche gardée se croit hors de Vinted et rouvre
  -- une publication Vinted (le doublon qu'on vient d'éviter — Romain, 21/09).
  -- Journalisée dans champs_repris : inventaire_defusionner la rend.
  -- (Index unique (user_id, vinted_item_id) : l'absorbé la lâche d'abord.)
  IF g.vinted_item_id IS NULL AND a.vinted_item_id IS NOT NULL AND a.disparu_le IS NULL THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(g.vinted_catalog_id, a.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess)
     WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess)));
  -- ── AJOUT 2026-09-25 après-midi : LA REMISE EN LIGNE — ÉCHANGE ─────────
  -- Le gardé porte l'annonce RETIRÉE, l'absorbé la VIVANTE qui l'a remplacée :
  -- le gardé prend la vivante (il redevient en ligne), l'absorbé GARDE la
  -- retirée — jamais effacée : la synchro retrouve les fiches par
  -- vinted_item_id, une retirée sans fiche serait réimportée. Ordre imposé par
  -- l'index unique (user_id, vinted_item_id) : libérer, poser, reposer.
  -- (migration 20260925163000) et deux annonces RETIRÉES successives : le gardé
  -- prend la plus récente, pour que le maillon suivant d'une chaîne se compare à elle.
  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL
        AND (vinted_remise_en_ligne(g.id, a.id) OR vinted_retraits_successifs(g.id, a.id)) THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(a.vinted_catalog_id, g.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess),
           disparu_le = a.disparu_le, last_synced_at = COALESCE(a.last_synced_at, g.last_synced_at)
     WHERE id = p_garde;
    UPDATE inventaire
       SET vinted_item_id = g.vinted_item_id, vinted_status = g.vinted_status, vinted_account_id = g.vinted_account_id,
           disparu_le = g.disparu_le
     WHERE id = p_absorbe;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'echange', true,
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess, 'disparu_le', g.disparu_le, 'last_synced_at', g.last_synced_at),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess, 'disparu_le', a.disparu_le, 'last_synced_at', a.last_synced_at)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;

  INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, COALESCE(NULLIF(p_par, ''), 'utilisateur')) -- MODIF 2026-09-25
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id, 'garde', p_garde, 'absorbe', p_absorbe,
                            'deplacements', v_dep, 'champs_repris', v_champs);
END;
$function$;

CREATE OR REPLACE FUNCTION public.doublons_examiner_fiche(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f inventaire%ROWTYPE; v_res jsonb; v_prec jsonb; v_jb text[]; v_cands jsonb; v_e jsonb; v_fus jsonb;
  n_fusions integer := 0; n_propositions integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  SELECT resultat INTO v_res FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche FOR UPDATE;
  IF v_res IS NULL OR NOT (v_res ? 'en_cours') THEN
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'non_reservee');
  END IF;
  -- Ce que la fiche portait AVANT la réservation (vide pour un premier examen).
  v_prec := v_res - 'en_cours' - 'essais';

  SELECT * INTO v_f FROM inventaire WHERE id = p_fiche;
  IF v_f.id IS NULL OR v_f.fusionne_dans IS NOT NULL OR v_f.statut IS DISTINCT FROM 'stock' THEN
    -- fusionnée, vendue ou retirée du stock depuis : plus rien à examiner
    UPDATE inventaire_doublons_verifies SET verifie_le = now(), resultat = v_prec || jsonb_build_object('sans_objet', now())
     WHERE inventaire_id = p_fiche;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'sans_objet');
  END IF;

  v_jb := titre_jetons(v_f.titre);
  IF NOT urls_resolues(fiche_photos_toutes(v_f.id)
                       || COALESCE((SELECT array_agg(u) FROM (
                            SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                              SELECT i.id FROM inventaire i
                               WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                 AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                 AND titre_jetons(i.titre) && v_jb
                                 AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                               LIMIT 10) j) z), '{}'::text[]))
     AND v_f.created_at > now() - interval '2 hours' THEN
    -- on attend les empreintes (au plus 2 h : au-delà on décide sans elles) :
    -- la réservation est rendue, la fiche reviendra comme avant.
    IF v_prec = '{}'::jsonb THEN
      DELETE FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche;
    ELSE
      UPDATE inventaire_doublons_verifies SET resultat = v_prec WHERE inventaire_id = p_fiche;
    END IF;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'attente_photos');
  END IF;

  v_cands := inventaire_doublons_pour(v_f.id);
  v_fus := NULL;
  FOR v_e IN SELECT e FROM jsonb_array_elements(v_cands) e ORDER BY (e ->> 'niveau' = 'certain') DESC LOOP
    -- Point A : titre, prix et photos proposent une question, jamais une fusion.
    IF v_e ->> 'niveau' IN ('probable', 'certain') THEN
      INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
      VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'probable', 'proposee', v_e ->> 'motif', v_e, 'balayage')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n_propositions := n_propositions + 1; END IF;
    END IF;
  END LOOP;

  -- Enregistré comme avant : premier examen = le résultat ; revue = l'ancien
  -- résultat complété, horodaté revue_le.
  UPDATE inventaire_doublons_verifies
     SET verifie_le = now(),
         resultat = CASE WHEN v_prec = '{}'::jsonb
                         THEN jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                         ELSE v_prec || jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                                     || jsonb_build_object('revue_le', now()) END
   WHERE inventaire_id = p_fiche;

  RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'examinee', 'candidats', jsonb_array_length(v_cands),
                            'fusions', n_fusions, 'propositions', n_propositions,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_confirmer_photo(p_annonce_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Point A : la proposition existante reste visible ; une photo n'identifie pas un exemplaire.
  RETURN 'reste_propose';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_recabler_job(p_job uuid, p_url text, p_listing_id text, p_par text, p_detail jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pf jsonb; v_ancienne text; v_ancien_id text;
BEGIN
  SELECT platform_fields, listing_url, platform_listing_id INTO v_pf, v_ancienne, v_ancien_id FROM cross_post_jobs WHERE id = p_job;
  -- Point A : aucun changement d'identité sans geste utilisateur.
  IF p_par IS DISTINCT FROM 'utilisateur'
     AND NOT public.listing_designe(p_listing_id, v_ancienne, v_ancien_id) THEN
    RAISE EXCEPTION 'Identité non prouvée : confirme le rattachement dans tes annonces.';
  END IF;
  v_pf := COALESCE(v_pf, '{}'::jsonb);
  v_pf := (v_pf - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
          || jsonb_build_object(
               'rattachement', jsonb_build_object('par', p_par, 'at', now(), 'ancienne_url', v_ancienne, 'ancien_listing_id', v_ancien_id) || COALESCE(p_detail, '{}'::jsonb),
               'listing_url_precedente', v_ancienne);
  UPDATE cross_post_jobs
     SET listing_url = p_url, platform_listing_id = p_listing_id, platform_fields = v_pf, last_checked_at = NULL
   WHERE id = p_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees(p_platform text, p_rows jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_row    jsonb;
  v_ref    text; v_titre text; v_prix numeric; v_devise text; v_vendu timestamptz;
  v_statut text; v_classe text; v_listing text; v_url text;
  v_frais  numeric; v_lot boolean;
  v_inv    bigint; v_bande text; v_verdict jsonb;
  v_adopte bigint; v_nb_adoptables int;
  v_insere boolean; v_cle text;
  v_pa numeric; v_pai boolean; v_pc numeric; v_benef numeric; v_pct numeric;
  v_st text; v_pv numeric;
  v_meme boolean; v_rel_id bigint; v_rel_inv bigint; v_manu bigint;
  c_recues int := 0; c_sans_ref int := 0; c_annulees int := 0; c_en_cours int := 0;
  c_creees int := 0; c_adoptees int := 0; c_deja int := 0;
  c_rattachees int := 0; c_lots int := 0; c_inv_completes int := 0;
  c_fusionnees int := 0;
  v_inconnus jsonb := '{}'::jsonb;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla') THEN
    RAISE EXCEPTION 'plateforme non relevable: %', coalesce(p_platform,'(null)');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    c_recues := c_recues + 1;
    v_ref     := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    v_statut  := coalesce(v_row ->> 'statut', '');
    v_titre   := nullif(btrim(coalesce(v_row ->> 'titre', '')), '');
    v_prix    := nullif(v_row ->> 'prix', '')::numeric;
    v_devise  := nullif(btrim(coalesce(v_row ->> 'devise', '')), '');
    v_vendu   := nullif(v_row ->> 'vendu_le', '')::timestamptz;
    v_listing := nullif(btrim(coalesce(v_row ->> 'listing_id', '')), '');
    v_url     := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_frais   := nullif(v_row ->> 'frais', '')::numeric;
    v_lot     := coalesce((v_row ->> 'lot')::boolean, false);

    IF v_ref IS NULL THEN c_sans_ref := c_sans_ref + 1; CONTINUE; END IF;

    v_classe := ventes_statut_classe(p_platform, v_statut);
    IF v_classe = 'annulee' THEN c_annulees := c_annulees + 1; CONTINUE; END IF;
    IF v_classe = 'en_cours' THEN c_en_cours := c_en_cours + 1; CONTINUE; END IF;
    IF v_classe <> 'vente' THEN
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
    END IF;

    v_inv := NULL; v_bande := NULL;
    IF v_lot THEN
      c_lots := c_lots + 1;
      v_bande := 'lot';
    ELSE
      IF v_listing IS NOT NULL THEN
        IF p_platform = 'vinted' THEN
          SELECT i.id INTO v_inv FROM inventaire i
           WHERE i.user_id = v_user AND i.vinted_item_id = v_listing AND i.fusionne_dans IS NULL
           ORDER BY i.id DESC LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT ap.inventaire_id INTO v_inv FROM annonces_plateforme ap
           WHERE ap.user_id = v_user AND ap.platform = p_platform
             AND ap.listing_id = v_listing AND ap.inventaire_id IS NOT NULL
             AND public.retrait_job_prouve(ap.job_id)
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
             AND j.action IN ('publish', 'republish') AND public.retrait_job_prouve(j.id)
             AND (j.platform_listing_id = v_listing
                  OR (v_listing ~ '^[0-9]+$'
                      AND coalesce(j.listing_url,'') ~ ('(^|[^0-9])' || v_listing || '([^0-9]|$)')))
           ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
        END IF;
        IF v_inv IS NOT NULL THEN v_bande := 'identifiant'; END IF;
      END IF;

      IF v_inv IS NULL AND v_titre IS NOT NULL
         AND NOT coalesce((v_row ->> 'id_attendu')::boolean, false) THEN
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), v_titre, v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','job_clos') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN c_rattachees := c_rattachees + 1; END IF;

    v_pa := NULL; v_pai := NULL; v_pc := 0; v_benef := NULL; v_pct := NULL;
    IF v_inv IS NOT NULL THEN
      SELECT i.prix_achat, i.prix_achat_inconnu, coalesce(i.purchase_costs,0)
        INTO v_pa, v_pai, v_pc FROM inventaire i WHERE i.id = v_inv;
      IF coalesce(v_pai,false) THEN v_pa := NULL; END IF;
      IF v_pa IS NOT NULL AND v_prix IS NOT NULL THEN
        v_benef := v_prix - v_pa - v_pc - coalesce(v_frais,0);
        IF v_prix > 0 THEN v_pct := (v_benef / v_prix) * 100; END IF;
      END IF;
    END IF;

    v_adopte := NULL;
    IF NOT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user
                    AND v.plateforme_code = p_platform AND v.commande_ref = v_ref) THEN
      IF v_inv IS NOT NULL THEN
        -- 26/09 : une saisie d'une AUTRE plateforme, « ailleurs » ou « autre »
        -- n'est plus candidate ; sans plateforme, elle le reste (comme avant).
        SELECT count(*) INTO v_nb_adoptables FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
           AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform;
        IF v_nb_adoptables = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
             AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform
           LIMIT 1;
        END IF;
      -- Sans identifiant de fiche prouvé, conserver une vente non rattachée.

      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- LE RELEVÉ FAIT FOI (26/09) quand la saisie est de la MÊME plateforme et
      -- la seule vente de la fiche : prix, date et bénéfice relevés. Sinon,
      -- ENRICHISSEMENT PUR comme avant (chaque champ posé seulement s'il était vide).
      v_meme := false;
      IF v_inv IS NOT NULL THEN
        SELECT plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)) = p_platform
          INTO v_meme FROM ventes v WHERE v.id = v_adopte;
        v_meme := coalesce(v_meme, false)
                  AND (SELECT count(*) FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv) = 1;
      END IF;
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = coalesce(v.plateforme, p_platform),
        vendu_le           = CASE WHEN v_meme THEN coalesce(v_vendu, v.vendu_le) ELSE coalesce(v.vendu_le, v_vendu) END,
        date               = CASE WHEN v_meme THEN coalesce((v_vendu AT TIME ZONE 'Europe/Paris')::date, v.date)
                                  ELSE coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date) END,
        prix_vente         = CASE WHEN v_meme THEN coalesce(v_prix, v.prix_vente) ELSE coalesce(v.prix_vente, v_prix) END,
        benefice           = CASE WHEN v_meme AND v_prix IS NOT NULL THEN
                                    CASE WHEN coalesce(v_pa, v.prix_achat) IS NOT NULL
                                         THEN v_prix - coalesce(v_pa, v.prix_achat) - v_pc - coalesce(v_frais,0) END
                                  ELSE v.benefice END,
        devise             = coalesce(v.devise, v_devise),
        frais_plateforme   = coalesce(v.frais_plateforme, v_frais),
        titre              = coalesce(nullif(btrim(v.titre),''), v_titre),
        inventaire_id      = coalesce(v.inventaire_id, v_inv),
        releve_le          = now()
      WHERE v.id = v_adopte;
      c_adoptees := c_adoptees + 1;
    ELSE
      INSERT INTO ventes (
        user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le,
        plateforme, plateforme_code, plateforme_origine, commande_ref,
        source, releve_le, devise, frais_plateforme, selling_fees,
        inventaire_id, quantite, statut
      ) VALUES (
        v_user, v_titre, v_prix, v_pa, v_benef,
        (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_vendu,
        p_platform, p_platform, NULL, v_ref,
        'releve', now(), v_devise, v_frais, coalesce(v_frais, 0),
        v_inv, 1, 'vendu'
      )
      ON CONFLICT (user_id, plateforme_code, commande_ref)
        WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
      DO UPDATE SET
        vendu_le         = coalesce(ventes.vendu_le, EXCLUDED.vendu_le),
        date             = coalesce(ventes.date, EXCLUDED.date),
        prix_vente       = coalesce(ventes.prix_vente, EXCLUDED.prix_vente),
        devise           = coalesce(ventes.devise, EXCLUDED.devise),
        frais_plateforme = coalesce(ventes.frais_plateforme, EXCLUDED.frais_plateforme),
        titre            = coalesce(nullif(btrim(ventes.titre),''), EXCLUDED.titre),
        inventaire_id    = coalesce(ventes.inventaire_id, EXCLUDED.inventaire_id),
        releve_le        = now()
      RETURNING (xmax = 0) INTO v_insere;
      IF v_insere THEN c_creees := c_creees + 1; ELSE c_deja := c_deja + 1; END IF;

      -- ── PASSAGE « DÉTAIL » : LA SAISIE DE LA MÊME FICHE DISPARAÎT (26/09) ──
      IF v_inv IS NOT NULL AND NOT v_lot THEN
        v_rel_id := NULL; v_rel_inv := NULL; v_manu := NULL;
        SELECT v.id, v.inventaire_id INTO v_rel_id, v_rel_inv FROM ventes v
         WHERE v.user_id = v_user AND v.plateforme_code = p_platform AND v.commande_ref = v_ref;
        IF v_rel_inv = v_inv
           AND (SELECT count(*) FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.id <> v_rel_id) = 1 THEN
          SELECT v.id INTO v_manu FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.id <> v_rel_id
             AND v.commande_ref IS NULL
             AND plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)) = p_platform;
          IF v_manu IS NOT NULL THEN
            DELETE FROM ventes WHERE id = v_manu AND user_id = v_user;
            UPDATE ventes SET prix_achat = coalesce(prix_achat, v_pa), benefice = coalesce(benefice, v_benef)
             WHERE id = v_rel_id;
            c_fusionnees := c_fusionnees + 1;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_inv IS NOT NULL AND v_prix IS NOT NULL THEN
      SELECT i.statut, i.prix_vente INTO v_st, v_pv FROM inventaire i WHERE i.id = v_inv;
      IF v_st = 'vendu' AND v_pv IS NULL THEN
        UPDATE inventaire i SET prix_vente = v_prix,
               margin = coalesce(i.margin, v_benef), margin_pct = coalesce(i.margin_pct, v_pct)
         WHERE i.id = v_inv AND i.statut = 'vendu' AND i.prix_vente IS NULL;
        c_inv_completes := c_inv_completes + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'plateforme', p_platform, 'recues', c_recues, 'creees', c_creees,
    'adoptees', c_adoptees, 'deja_connues', c_deja, 'rattachees', c_rattachees,
    'lots', c_lots, 'annulees', c_annulees, 'en_cours', c_en_cours,
    'sans_ref', c_sans_ref, 'statuts_inconnus', v_inconnus,
    'articles_completes', c_inv_completes, 'saisies_fusionnees', c_fusionnees);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- La preuve exigée : un relevé DONE, COMPLET, qui a lu quelque chose (ou
  -- qui dit « vide » — un compte sans annonce est un relevé réussi à 0).
  IF v_run.status <> 'done'
     OR COALESCE(v_run.erreur, '') LIKE '[incomplet]%'
     OR NOT (COALESCE(v_run.items_vus, 0) > 0 OR COALESCE(v_run.erreur, '') LIKE '[vide]%') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'releve_non_probant', 'refusees', 0, 'en_ligne', 0, 'en_attente', 0);
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Le relevé doit avoir commencé ≥ 2 h après la publication : la
    -- vérification de la plateforme a eu le temps de rendre son verdict.
    IF COALESCE(v_run.started_at, v_run.finished_at) < j.publie + interval '2 hours' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- REFUSÉE. Rembourser d'abord (idempotent), passer 'failed' ensuite —
    -- l'ordre du balayage de nuit, et le trigger de réservation fait le reste.
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a pas mis cette annonce en ligne — refusée à la vérification (ou retirée depuis) : '
      || 'elle n''apparaît pas dans tes annonces ' || v_nom || ' (relevé complet du ' || v_releve_txt
      || ', ' || COALESCE(v_run.items_vus, 0)::text || ' annonce' || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || ' lue'
      || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || '). Rien n''est en ligne'
      || CASE WHEN COALESCE((v_refund ->> 'rembourse')::int, 0) > 0 THEN ', la publication t''est rendue' ELSE '' END
      || '. Tu peux la relancer d''ici, ou abandonner ' || v_nom || ' pour cet article.';
    UPDATE cross_post_jobs SET
      status = 'failed',
      error = v_msg,
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'verdict_moderation', jsonb_build_object(
          'verdict', 'refusee', 'preuve', 'absente_du_releve_complet',
          'run_id', p_run_id, 'releve_le', COALESCE(v_run.finished_at, v_run.started_at),
          'annonces_lues', COALESCE(v_run.items_vus, 0),
          'publie_le', j.publie, 'identifiants', to_jsonb(v_ids),
          'refund', v_refund, 'le', now()))
     WHERE id = j.id;
    n_refusees := n_refusees + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$function$;

CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields #>> '{rattachement,par}', '') IN ('', 'utilisateur')
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'identifiant_depot_clos'
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'identifiant_depot_clos'
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;

CREATE OR REPLACE FUNCTION public.armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;
  -- (2026-09-27, audit synchro) une fiche peut porter PLUSIEURS annonces
  -- vivantes sur la même plateforme (rattachement de la personne, deux
  -- dépôts) : la plus récente par plateforme ET toute autre dont un relevé
  -- atteste qu'elle vit encore sur cette fiche. Avant : une seule par
  -- plateforme — la seconde restait en vente après la vente (Louis, Beebs,
  -- 27/09). armer_retrait_job ne double jamais un retrait de la même annonce.
  for v_pub in
    -- (27/09 soir) UNE annonce par plateforme, la plus récente PROUVÉE ;
    -- jamais la plateforme de la vente ; jamais une plateforme où la fiche
    -- porte deux annonces vivantes (deux exemplaires) — armer_retrait_job
    -- le vérifie aussi, pour tous ses appelants.
    select x.id, x.platform from (
      (select distinct on (j.platform) j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
          and public.retrait_job_prouve(j.id)
          and public.fiche_annonces_vivantes(p_inventaire_id, j.platform) < 2
        order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc)
    ) x
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;
  -- Point A : sans dépôt prouvé, ne pas déduire un retrait de la seule fiche.
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;
  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl));
end;
$function$;
