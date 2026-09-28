-- Point A : questions lors du remplacement externe d'une annonce.
-- GO Nico, passe A à I + cas Opla du 28/09. Idempotent ; aucune réparation de fiches.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.listing_designe(p_listing text,p_url text,p_pid text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  -- Un identifiant explicite contradictoire interdit le repli sur l'URL.
  -- On lit le segment d'annonce, jamais un nombre dans le titre ou la requête.
  SELECT length(btrim(coalesce(p_listing,''))) >= 4 AND
    CASE WHEN nullif(btrim(p_pid),'') IS NOT NULL THEN btrim(p_listing)=btrim(p_pid)
    ELSE btrim(p_listing)=coalesce(
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/items/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/ad/[^/]+/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/itm/(?:[^/]+/)?([0-9]+)(?:/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/p/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/(?:product|article)/(art_[A-Za-z0-9_-]+)(?:/|$)'), '') END;
$function$;

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
      AND listing_designe(v_id,j.listing_url,j.platform_listing_id)
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
       AND listing_designe(v_id,j.listing_url,j.platform_listing_id)
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

CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : jamais d'article créé depuis
  --    une annonce que rien ne prouve être au vendeur — geste manuel compris
  --    (Louis, 19/09 : une balance Wii d'un autre vendeur importée à la main).
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le relevé du 19/09 a créé trois lignes d'inventaire neuves pour trois
  -- articles déjà présents : le faisceau compare les titres MOT À MOT, et un
  -- préfixe de référence (« FIG001 - Jeux/Jouets - ») fait tomber le
  -- recouvrement sous la barre. L'annonce finit dans la bande « aucune »,
  -- seule bande où l'import automatique crée sans demander.
  -- On ajoute l'inclusion d'un titre dans l'autre, aux frontières de mots,
  -- les deux normalisés à plus de 12 caractères. Mesuré sur 200 annonces non
  -- rattachées tirées au hasard : 3 gagnent un candidat, et les trois sont
  -- justes ; 108 avaient déjà un titre exact (inchangées) ; 89 ne bougent pas.
  -- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS : au lieu de créer, on POSE la
  --    proposition sur l'annonce (motif `titre_inclus`) — l'écran de
  --    rattachement affiche « C'est peut-être… » avec son bouton.
  -- ⛔ Le geste MANUEL n'est pas touché ici (p_par = 'utilisateur').
  -- ⛔ Le refus est tracé UNE FOIS (decision 'refus_jumeau') : sans trace,
  --    « pourquoi celle-ci n'est pas entrée ? » redevient une reconstitution.
  -- ⛔ Le titre de SECOURS (« Annonce vinted ») ne reconnaît rien : on part du
  --    titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- ── L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26) ──
  -- labouquinerie85, relevé Opla du 24/09 : 9 fiches créées sous le titre exact
  -- d'un article VENDU, 1 sous celui d'un article en stock déjà publié. Le
  -- premier tour du moteur ne voit que le stock sans annonce sur la
  -- plateforme ; ces fiches existantes lui étaient invisibles.
  -- ⛔ ON NE CRÉE PAS, ON DEMANDE : même titre (titre_norm, ou mêmes mots qui
  --    comptent) qu'une fiche en stock OU vendue → proposition posée sur
  --    l'annonce ; la personne tranche. Jamais de rattachement automatique à
  --    une fiche vendue ou déjà publiée : un titre ne prouve pas l'exemplaire.
  -- ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur').
  IF p_par IS DISTINCT FROM 'utilisateur' AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27, audit synchro) ON CRÉE, ET ON DEMANDE : l'annonce entre
    -- dans le stock ; la fiche de même titre (en stock ou VENDUE) devient la
    -- question « Est-ce le même article ? » posée sur la fiche créée. Retenir
    -- l'annonce hors du stock laissait des articles en ligne invisibles (784
    -- mesurées le 27/09) et, quand la fiche de même titre était vendue, une
    -- annonce en vente d'un objet déjà vendu que rien ne reliait à la vente.
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;

  -- (2026-09-27) La proposition du moteur (bande « propose » du relevé en
  -- cours, ou annonce retenue par un relevé passé) désigne la fiche à qui
  -- poser la question, faute d'homonyme exact.
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre) -- AJOUT 2026-09-24 : une autre couleur n'est pas un jumeau
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27) le titre inclus ne retient plus l'annonce : il se demande.
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

  -- Deux annonces sur une plateforme peuvent être deux exemplaires OU un
  -- remplacement externe. Ni leur titre ni leur photo ne tranchent : la
  -- question reste posée, même si l'ancien job est encore « published ».

  -- (2026-09-27, décision de Nico) UNE FICHE VENDUE EST COMPARÉE AU RELEVÉ :
  -- l'annonce d'une AUTRE plateforme qui porte EXACTEMENT le titre d'une fiche
  -- VENDUE, seule de ce titre sur le compte, est cet objet déjà vendu
  -- (labouquinerie85 : La présidente, Triominos, Solaris). Elle est rattachée à
  -- la fiche vendue et son RETRAIT est armé (vente prouvée) — jamais une
  -- nouvelle fiche « en stock » d'un objet déjà parti.
  -- (27/09 soir) RETIRÉ : le rattachement d'une annonce à une fiche VENDUE sur
  -- son seul titre (releve_fiche_vendue) — il a retiré deux annonces Beebs de
  -- Louis encore à vendre (mêmes titres, articles différents). L'annonce est
  -- importée comme sa propre fiche ; la question « Déjà vendu ? »
  -- (homonyme_vendu) est posée plus bas : la personne tranche.


  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  -- (2026-09-27) la question « Est-ce le même article ? », posée sur la fiche
  -- créée (jamais un rattachement : la personne tranche, « oui » fusionne).
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job)
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
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
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
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

  IF v_bande = 'certain' THEN v_bande := 'propose'; END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
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
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    END IF;
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
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;

-- Reprendre les questions oubliées par un ancien import, sans fusionner,
-- déplacer, vendre, retirer ou réimporter une fiche. Parcours indexé par compte.
CREATE OR REPLACE FUNCTION public.revoir_questions_releve(p_user uuid,p_platform text,p_limite integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  a record; c jsonb; n integer:=0; q integer:=0; qa integer; debut timestamptz:=clock_timestamp();
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()<>p_user THEN
    RETURN jsonb_build_object('ok',false,'reason','unauthorized');
  END IF;
  FOR a IN
    SELECT ap.id,ap.inventaire_id,ap.run_id FROM annonces_plateforme ap
    JOIN inventaire i ON i.id=ap.inventaire_id AND i.user_id=p_user
    WHERE ap.user_id=p_user AND ap.platform=p_platform AND ap.ignoree_le IS NULL
      AND ap.disparu_le IS NULL AND ap.statut_plateforme='en_ligne'
      AND i.fusionne_dans IS NULL AND i.statut='stock' AND i.origine LIKE 'releve\_%'
      AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id=ap.id AND r.detail->>'revision_questions'='20260928')
    ORDER BY ap.vu_le DESC,ap.id LIMIT least(greatest(p_limite,0),5)
  LOOP
    EXIT WHEN clock_timestamp()-debut>interval '1500 milliseconds';
    qa:=0;
    FOR c IN SELECT value FROM jsonb_array_elements(inventaire_doublons_pour(a.inventaire_id)) LOOP
      IF c->>'niveau' IN ('probable','certain') AND
         releve_poser_question(p_user,(c->>'garde')::bigint,(c->>'absorbe')::bigint,
           c->>'motif',c || jsonb_build_object('annonce_id',a.id,'platform',p_platform,'revision_questions','20260928')) THEN
        qa:=qa+1;
      END IF;
    END LOOP;
    INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
    VALUES(p_user,a.id,a.inventaire_id,CASE WHEN qa>0 THEN 'propose' ELSE 'aucune' END,'auto',0,
      jsonb_build_object('revision_questions','20260928','questions_posees',qa));
    n:=n+1; q:=q+qa;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'examinees',n,'questions_posees',q,
    'duree_ms',round(extract(epoch FROM clock_timestamp()-debut)*1000));
END;
$function$;
REVOKE ALL ON FUNCTION public.revoir_questions_releve(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoir_questions_releve(uuid,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_verdicts jsonb := NULL;
  v_questions jsonb;
  v_vide_non_probant boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : la page lue n'était pas la
  --    liste du compte. Rien n'est traité, rien n'est daté, rien n'est tranché.
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- ── UN RELEVÉ VIDE N'EST JAMAIS UNE PREUVE (2026-09-24) ──────────────────
  -- Il n'a RIEN vu, sur un compte qui avait des annonces ici : ce n'est ni une
  -- preuve de disparition ni une preuve de vente. Pas de disparu_le, pas de
  -- verdict « refusée ». bertin.dr (24/09) : 238 annonces EN LIGNE datées
  -- disparues par un relevé à « 0 vue(s) sur 0 annoncée(s) ».
  -- ⛔ eBAY RELIÉ PAR L'API (2026-09-26) : le relevé ne traite QUE le compte
  --    relié. Chrome connecté à un autre compte, ou identité non prouvée :
  --    ni rattachement, ni import, ni disparition — et le run le dit.
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- Identité prouvée, mais des annonces encore inconnues ont été laissées de
  -- côté : ce relevé n'a pas tout écrit, il ne date aucune disparition.
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;
  -- L'interrupteur, FAIL-CLOSED : absent, illisible ou différent de 1 => aucun import.
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;

  v_questions := revoir_questions_releve(v_user,v_pf,1);
  n_prop := COALESCE((v_questions->>'questions_posees')::integer,0);

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
    -- p_second_releve_requis := false (2026-09-24) : on importe TOUT ce qui est
    -- en ligne et sans candidat dès ce relevé, on rattache ensuite. La règle
    -- du « deuxième relevé » (18/09) laissait un inscrit sans stock jusqu'au
    -- prochain passage — 20 h, ou un clic (laura.rml38, labouquinerie85).
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, false);
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import_propose' THEN n_prop := n_prop + 1; n_import := n_import + 1;
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

  -- ── LE RELEVÉ TRANCHE LES PUBLICATIONS SANS LIEN (2026-09-23 soir) ─────────
  -- Un dépôt 'published' sans lien mais AVEC identifiant ne pouvait plus jamais
  -- être clos (balayage de nuit : « un job qui porte son identifiant n'est
  -- jamais "sans lien" »). Or ce relevé-ci, quand il est COMPLET, est la preuve
  -- qui manquait : l'annonce y est (EN LIGNE, lien posé) ou n'y est pas
  -- (REFUSÉE à la vérification, ou retirée). Jamais bloquant pour le relevé.
  IF v_complet THEN
    BEGIN
      v_verdicts := trancher_publications_sans_lien(v_user, v_pf, p_run_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trancher_publications_sans_lien(%) : %', p_run_id, SQLERRM;
      v_verdicts := jsonb_build_object('ok', false, 'erreur', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'verdicts', v_verdicts,
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'importees', n_import, 'import_refusees', n_refus,
                            'ecartees_notification', n_notif,
                            'restantes', n_restantes, 'budget_epuise', v_budget_epuise, 'sautees', n_sautees,
                            'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_evaluer(p_a bigint, p_b bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a inventaire%ROWTYPE; b inventaire%ROWTYPE; g inventaire%ROWTYPE; x inventaire%ROWTYPE;
  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;
  v_remise boolean := false;
BEGIN
  SELECT * INTO a FROM inventaire WHERE id = p_a;
  SELECT * INTO b FROM inventaire WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR a.user_id <> b.user_id THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'paire_invalide');
  END IF;
  IF a.fusionne_dans IS NOT NULL OR b.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deja_fusionnee');
  END IF;
  -- ⛔ UNE DÉCISION HUMAINE EST DÉFINITIVE.
  IF EXISTS (SELECT 1 FROM inventaire_doublons d
              WHERE d.user_id = a.user_id AND d.statut IN ('refusee', 'defaite')
                AND least(d.garde, d.absorbe) = least(a.id, b.id) AND greatest(d.garde, d.absorbe) = greatest(a.id, b.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = a.user_id AND f.defait_le IS NOT NULL
                AND ((f.garde = a.id AND f.absorbe = b.id) OR (f.garde = b.id AND f.absorbe = a.id)))
     OR EXISTS (SELECT 1 FROM rapprochements r JOIN annonces_plateforme ap ON ap.id = r.annonce_id
              WHERE r.user_id = a.user_id AND r.par = 'utilisateur' AND r.decision IN ('refus_proposition', 'detache')
                AND ((ap.inventaire_id = b.id AND r.inventaire_id = a.id) OR (ap.inventaire_id = a.id AND r.inventaire_id = b.id))) THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'refuse_par_la_personne');
  END IF;
  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  -- SAUF (2026-09-25 après-midi, migration 20260925160000) la REMISE EN LIGNE :
  -- l'une retirée (closed + disparue), l'autre vivante, apparue après, même
  -- boutique — la fusion échange alors les identités.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id)
             OR vinted_retraits_successifs(a.id, b.id) OR vinted_retraits_successifs(b.id, a.id);
    IF NOT v_remise THEN
      RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
    END IF;
  END IF;

  s := meme_objet_signaux(a.titre, b.titre, fiche_marque(a.marque, a.attributs), fiche_marque(b.marque, b.attributs),
                          a.prix_vente, b.prix_vente, fiche_photos_toutes(a.id), fiche_photos_toutes(b.id));
  nv := meme_objet_niveau(s);
  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';
  -- AJOUT 2026-09-25 (migration 20260925154000) : sans photo qui prouve, une
  -- autre VARIANTE (un mot rare du titre court absent de l'autre) n'est pas
  -- une question — « Hochet hippopotame » / « Hochet Koala ».
  IF v_niveau = 'probable' AND v_motif = 'titre_proche'
     AND titres_variante_substituee(a.user_id, a.titre, b.titre) THEN
    v_niveau := 'ecarte'; v_motif := 'variante_substituee';
  END IF;

  -- AJOUT 2026-09-25 après-midi (migration 20260925162000) : la REMISE EN
  -- LIGNE à l'identique — même titre, retirée puis republiée dans les 24 h —
  -- n'est pas écartée par une photo retouchée (cadre ajouté par un outil de
  -- republication : 13 paires sur 13 vérifiées à l'œil, le même objet).
  IF v_remise
     AND (v_niveau = 'probable' OR (v_niveau = 'ecarte' AND v_motif = 'photos_differentes'))
     AND lower(btrim(a.titre)) = lower(btrim(b.titre))
     AND COALESCE(s ->> 'nombre', 'ok') = 'ok' AND COALESCE(s ->> 'lot', 'ok') = 'ok'
     AND ((a.disparu_le IS NOT NULL AND b.created_at BETWEEN a.disparu_le - interval '1 day' AND a.disparu_le + interval '1 day')
       OR (b.disparu_le IS NOT NULL AND a.created_at BETWEEN b.disparu_le - interval '1 day' AND b.disparu_le + interval '1 day')) THEN
    IF COALESCE(array_length(titre_jetons(a.titre), 1), 0) >= 3 THEN
      v_niveau := 'probable'; v_motif := 'remise_en_ligne_titre_identique';
    ELSE
      v_niveau := 'probable'; v_motif := 'remise_en_ligne_titre_court';
    END IF;
  END IF;

  -- LE CONTEXTE, que ni le titre ni la photo ne savent :
  -- une fiche vendue (autre unité ? vente à rattacher ?) → jamais d'ici ;
  IF v_niveau <> 'ecarte' AND (a.statut IS DISTINCT FROM 'stock' OR b.statut IS DISTINCT FROM 'stock') THEN
    v_niveau := 'ecarte'; v_motif := 'fiche_vendue';
  END IF;
  -- plusieurs exemplaires en stock → la personne tranche ;
  IF v_niveau = 'certain' AND (COALESCE(a.quantite, 1) > 1 OR COALESCE(b.quantite, 1) > 1) THEN
    v_niveau := 'probable'; v_motif := 'quantite';
  END IF;
  -- (2026-09-25 après-midi) remise en ligne, mais PLUSIEURS exemplaires vivants
  -- du même titre sur le compte : lequel est la remise en ligne ? La personne tranche.
  IF v_remise AND v_niveau = 'certain' AND (
       SELECT count(*) FROM inventaire o
        WHERE o.user_id = a.user_id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) >= 2 THEN
    v_niveau := 'probable'; v_motif := 'plusieurs_exemplaires_vivants';
  END IF;
  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.
  IF v_niveau <> 'ecarte' THEN
    SELECT string_agg(DISTINCT va.platform, ',') INTO v_meme_pf
      FROM fiche_annonces_vivantes(a.id) va
      JOIN fiche_annonces_vivantes(b.id) vb ON vb.platform = va.platform AND vb.listing_id <> va.listing_id
     WHERE NOT EXISTS (SELECT 1 FROM fiche_annonces_vivantes(a.id) x2 JOIN fiche_annonces_vivantes(b.id) y2
                          ON y2.platform = x2.platform AND y2.listing_id = x2.listing_id
                        WHERE x2.platform = va.platform);
    -- (2026-09-27, décision de Nico) Deux fiches qui portent CHACUNE une
    -- annonce vivante sur la même plateforme sont deux exemplaires : ni
    -- fusion, ni question (avant : question « à trancher »).
    IF v_meme_pf IS NOT NULL THEN
      v_niveau := 'probable'; v_motif := 'deux_annonces_meme_plateforme';
    END IF;
  END IF;

  -- QUI GARDE : la fiche créée par la personne quand l'autre vient d'un relevé
  -- ou du dressing ; sinon la plus ancienne. L'identité Vinted suit (fusion).
  IF (b.origine IS NULL OR b.origine = 'fillsell') AND (a.origine LIKE 'releve\_%' OR a.origine = 'vinted_sync') THEN
    g := b; x := a;
  ELSIF (a.origine IS NULL OR a.origine = 'fillsell') AND (b.origine LIKE 'releve\_%' OR b.origine = 'vinted_sync') THEN
    g := a; x := b;
  ELSIF a.created_at <= b.created_at THEN g := a; x := b;
  ELSE g := b; x := a;
  END IF;
  -- LES FREINS de la fiche qui disparaîtrait : ce que la personne y a mis.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = x.id AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    v_freins := v_freins || 'job_actif'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = x.id) THEN v_freins := v_freins || 'ventes'::text; END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = x.id)
     AND EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = g.id) THEN
    v_freins := v_freins || 'deux_fiches_annonce'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(x.attributs) = 'object' THEN x.attributs ELSE '{}'::jsonb END) e
              WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    v_freins := v_freins || 'saisie_manuelle'::text;
  END IF;
  IF g.prix_achat IS NOT NULL AND x.prix_achat IS NOT NULL AND g.prix_achat <> x.prix_achat THEN
    v_freins := v_freins || 'deux_prix_achat'::text;
  END IF;
  IF v_niveau = 'certain' AND COALESCE(array_length(v_freins, 1), 0) > 0 THEN
    v_niveau := 'probable'; v_motif := 'a_trancher';
  END IF;

  RETURN jsonb_build_object('niveau', v_niveau, 'motif', v_motif, 'garde', g.id, 'absorbe', x.id,
                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf)
         || CASE WHEN v_remise THEN jsonb_build_object('remise_en_ligne_vinted', true) ELSE '{}'::jsonb END;
END;
$function$;
