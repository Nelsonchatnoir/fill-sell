-- ✅ APPLIQUÉE EN PROD LE 2026-09-20 ~19:45 (feu vert de Nico), via
--    `supabase db query --linked -f`. VÉRIFIÉ APRÈS, sur la prod :
--      · identifiant VIDE + trois titres sans rapport → bande « aucune »,
--        motif « aucun_candidat », aucun article (avant : « identifiant »
--        sur 1789676224963 pour les trois) ;
--      · identifiant RÉEL 3273586974 + un titre sans rapport → toujours
--        bande « job », motif « identifiant », article 1789925296476 —
--        le chemin par identifiant est intact.

-- ═══════════════════════════════════════════════════════════════════════════
-- UN IDENTIFIANT VIDE N'IDENTIFIE RIEN (2026-09-20)
-- ═══════════════════════════════════════════════════════════════════════════
-- DÉFAUT MESURÉ, ET DÉMONTRÉ EN PROD. `rapprocher_classer` commence par
-- chercher le job qui porte l'identifiant d'annonce :
--
--     AND (j.platform_listing_id = p_listing_id
--          OR (p_listing_id ~ '^\d+$' AND j.listing_url ~ ('(^|[^0-9])'||p_listing_id||'([^0-9]|$)'))
--          OR (p_listing_id !~ '^\d+$' AND position(p_listing_id in coalesce(j.listing_url,'')) > 0))
--     ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
--
-- Avec p_listing_id = '' :
--   · `'' ~ '^\d+$'`  est FAUX ;
--   · `'' !~ '^\d+$'` est VRAI ;
--   · et `position('' in <quoi que ce soit>)` vaut 1 en PostgreSQL.
-- La troisième branche est donc VRAIE POUR TOUS LES JOBS, et la fonction rend
-- « bande = job, motif = identifiant » — sa bande de plus haute confiance —
-- en désignant le dernier job publié du compte. Pour un identifiant VIDE.
--
-- Démontré sur la prod, trois titres sans aucun rapport, même compte :
--     rapprocher_classer(<user>, 'leboncoin', '', '', 'Baskets neuves', 50)   → 1789676224963
--     rapprocher_classer(<user>, 'leboncoin', '', '', 'Polaire RATP', 25)     → 1789676224963
--     rapprocher_classer(<user>, 'leboncoin', '', '', 'STATION DE SOUDAGE', 80) → 1789676224963
--
-- CE QUE ÇA A COÛTÉ : le relevé des ventes Leboncoin envoie `listing_id: null`
-- pour chaque ligne (l'API des transactions ne donne pas l'identifiant de
-- l'annonce — background.js, lireVentesLeboncoin). `enregistrer_ventes_relevees`
-- appelle donc `rapprocher_classer` avec `coalesce(v_listing,'')` = ''. Résultat
-- relevé le 20/09 : 286 ventes de 10 comptes rattachées CHACUNE au même article,
-- qui n'a rien vendu et qui est resté « en stock » —
--   jocabroc8 144 ventes → « Lot de 2 bocaux en verre » ;
--   louis 42 → « Insert Zombicide » ; xxewwer 32 → « NBA Live 06 PSP » ;
--   misscat801 23 ; ornellaracano 13 ; b.halbot 9 ;
--   nicolas.svobodny 7 → « Montre G-Shock noire » (la photo vue partout dans
--   l'onglet Ventes : la vignette lit ventes.inventaire_id, elle disait vrai) ;
--   bilelbourouis45 7 ; pro.aurelie.82 5 ; bertin.dr 2+2.
-- Ce n'est pas qu'une vignette : le bénéfice de chaque vente était calculé
-- contre le prix d'achat de CET article-là.
--
-- LA CORRECTION, EN UNE LIGNE DE SENS : on ne cherche par identifiant que
-- lorsqu'il y en a un. Tout le reste de la fonction est inchangé, à l'octet
-- près — le rapprochement par titre + prix (bandes « certain » / « propose »)
-- reprend son rôle, qui est précisément de traiter les lignes sans identifiant.
--
-- ⛔ IDEMPOTENTE : CREATE OR REPLACE, aucun DDL, aucune donnée touchée ici.
--    La réparation des 286 lignes est une migration SÉPARÉE, montrée à part.
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
