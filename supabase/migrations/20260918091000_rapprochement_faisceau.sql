-- ═══════════════════════════════════════════════════════════════════════════
-- SECOND TOUR : LE FAISCEAU (2026-09-18, point 5.1, GO de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT, mesuré : la recherche de candidats est une ÉGALITÉ STRICTE de
-- titre normalisé (`titre_norm(i.titre) = v_t`). Une annonce saisie à la main
-- avec une autre formulation ne sort JAMAIS — elle tombe en 'aucune' et
-- n'obtient aucune proposition. Relevé le 18/09 : 81 annonces dans ce cas sur
-- 6 comptes. Même une inversion de mots (« Robe noire Zara » / « Zara robe
-- noire ») suffit à faire échouer l'égalité, alors que c'est le même article.
--
-- CE QUI CHANGE, ET RIEN D'AUTRE : quand le premier tour ne rend AUCUN
-- candidat, un second tour note les articles du stock sur un FAISCEAU de
-- signaux, et propose le meilleur s'il dépasse le seuil.
--
-- ⛔ TOUJOURS LA BANDE « propose ». JAMAIS « certain ». C'est non négociable
--    (consigne du 18/09) et c'est structurel ici : le second tour a son propre
--    RETURN, il ne retombe jamais dans le test de la bande « certain ». Un
--    faisceau est un faisceau de présomptions — il propose, l'utilisateur
--    tranche.
-- ⛔ LE PREMIER TOUR N'EST PAS TOUCHÉ. Le rattachement par IDENTIFIANT
--    (bande 'job', 67 lignes, score 1,00) et la bande 'certain' avec ses trois
--    filtres (candidat unique + les deux prix connus et égaux au centime +
--    aucun homonyme) sont mot pour mot ceux d'avant. Le second tour ne
--    s'exécute que si le premier n'a trouvé personne (v_n = 0).
--
-- LE FAISCEAU — quatre signaux, notés :
--   · RECOUVREMENT DU TITRE (poids 0,50) : part des mots de 3 lettres et plus
--     communs aux deux titres normalisés, rapportée au plus large des deux.
--     C'est la tolérance demandée : l'ordre des mots ne compte plus, un mot en
--     trop d'un côté ne disqualifie plus.
--   · PRIX (0,20 exact au centime, 0,08 à 15 % près). Un prix inconnu d'un
--     côté ou de l'autre ne compte NI pour NI contre — il ne prouve rien
--     (même doctrine que le prix_inconnu du 17/09).
--   · MARQUE (0,15) : celle de la fiche (colonne `marque`, sinon
--     attributs.marque) retrouvée dans le titre de l'annonce.
--   · TAILLE (0,07) : attributs.taille retrouvée comme MOT ENTIER du titre.
-- Score plafonné à 0,85 : il ne doit jamais pouvoir se lire comme un 0,95 de
-- la bande « certain ».
--
-- LES DEUX SEUILS, et pourquoi ils sont là :
--   · recouvrement >= 0,34 — au moins un tiers des mots en commun. En dessous,
--     ce n'est pas une hésitation, c'est du bruit : proposer au hasard coûte
--     un geste ET la confiance (leçon Blaf69 du 16/09).
--   · score >= 0,45 — un recouvrement parfait suffit seul (0,50), un
--     recouvrement de moitié a besoin d'un second signal.
-- Conséquence VOULUE sur le dossier qui a motivé ce lot : les annonces
-- Leboncoin de Leo-paul (casque de ski, écran HP, Nikon Coolpix, table basse)
-- n'ont AUCUN mot commun avec son stock Vinted, qui est exclusivement du
-- vêtement. Elles ne recevront donc toujours aucune proposition — et c'est
-- juste : ce ne sont pas des doublons ratés, ce sont des articles réels
-- absents du stock. Le faisceau ne doit pas inventer un rapprochement pour
-- faire baisser un compteur.
--
-- PÉRIMÈTRE DES CANDIDATS : les articles du stock qui n'ont PAS déjà un dépôt
-- FillSell publié sur cette plateforme, et qui ne sont pas déjà rattachés à
-- une annonce vivante de cette plateforme. Les deux autres cas sont couverts
-- par l'identifiant et par le premier tour ; les rouvrir ici créerait des
-- propositions en doublon.
--
-- MOTIF 'faisceau' : il est neuf, donc mesurable. Comparé aux lignes 'aucune'
-- posées par la migration 20260918090000 (appliquée AVANT celle-ci,
-- délibérément), il dira exactement ce que l'élargissement a rattrapé.
CREATE OR REPLACE FUNCTION public.rapprocher_classer(
  p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_job    record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_connu boolean;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
  -- Second tour (faisceau)
  v_ja     text[];
  v_cf     jsonb := '[]'::jsonb;
  v_nf     integer := 0;
BEGIN
  -- A. L'identifiant est celui d'un dépôt FillSell : certain, sans question.
  SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
  WHERE j.user_id = p_user AND j.platform = p_platform
    AND j.action IN ('publish', 'republish') AND j.status = 'published'
    AND (j.platform_listing_id = p_listing_id
         OR (p_listing_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || p_listing_id || '([^0-9]|$)'))
         OR (p_listing_id !~ '^\d+$' AND position(p_listing_id in COALESCE(j.listing_url, '')) > 0))
  ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF v_job.id IS NOT NULL THEN
    RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

  -- B1. Dépôts FillSell au même titre dont l'annonce n'est PLUS dans le relevé
  --     (remplacée) — les plus probables d'abord : ceux que le veilleur a déjà
  --     marqués « plus en ligne ».
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
  -- B2. Articles du stock au même titre, SANS dépôt sur cette plateforme
  --     (même article présent ailleurs, déposé à la main ici).
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre);
  END LOOP;

  -- ═══ C. SECOND TOUR : LE FAISCEAU ═══════════════════════════════════════
  -- Uniquement quand le titre exact n'a rien rendu. Toujours 'propose'.
  IF v_n = 0 THEN
    v_ja := ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(v_t, ' ')) t WHERE length(t) >= 3);
    IF COALESCE(array_length(v_ja, 1), 0) = 0 THEN
      -- Un titre qui ne porte que des mots de 1-2 lettres ne permet aucun
      -- recouvrement mesurable : on ne bricole pas, on le dit.
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    FOR v_c IN
      SELECT q.* FROM (
        SELECT i.id AS inventaire_id, i.titre, i.prix_vente AS prix,
               (k.communs / NULLIF(k.largeur, 0)) AS recouvrement,
               (s.m <> '' AND position(s.m in v_t) > 0) AS marque_ok,
               (s.ta <> '' AND (' ' || v_t || ' ') LIKE ('% ' || s.ta || ' %')) AS taille_ok,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL
                  AND abs(p_prix - i.prix_vente) < 0.01) AS prix_exact,
               -- « proche » n'est lu que si « exact » est faux : le CASE plus
               -- bas met exact en premier, les deux ne s'additionnent jamais.
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
        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL
          AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                            AND j.action IN ('publish', 'republish') AND j.status = 'published')
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
        'type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
        'prix', v_c.prix, 'titre', v_c.titre,
        'score', round(least(0.85,
            0.50 * v_c.recouvrement
          + CASE WHEN v_c.prix_exact THEN 0.20 WHEN v_c.prix_proche THEN 0.08 ELSE 0 END
          + CASE WHEN v_c.marque_ok THEN 0.15 ELSE 0 END
          + CASE WHEN v_c.taille_ok THEN 0.07 ELSE 0 END), 2),
        'signaux', jsonb_build_object('recouvrement', round(v_c.recouvrement, 2),
                                      'prix', CASE WHEN v_c.prix_exact THEN 'exact' WHEN v_c.prix_proche THEN 'proche' ELSE 'non' END,
                                      'marque', v_c.marque_ok, 'taille', v_c.taille_ok));
    END LOOP;
    IF v_nf = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    v_best := v_cf -> 0;
    -- ⛔ 'propose', toujours. Le second tour n'a pas de sortie 'certain'.
    RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULL, 'score', (v_best ->> 'score')::numeric,
                              'motif', 'faisceau', 'candidats', v_cf,
                              'signaux', v_best -> 'signaux');
  END IF;

  v_best := v_cands -> 0;
  -- Les DEUX prix connus, et égaux : c'est la seule égalité qui prouve.
  v_prix_connu := p_prix IS NOT NULL AND (v_best ->> 'prix') IS NOT NULL;
  v_prix_ok := v_prix_connu AND abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_connu THEN 'prix_inconnu'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_cands);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) TO service_role;
