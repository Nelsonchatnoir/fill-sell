-- ═══════════════════════════════════════════════════════════════════════════
-- HOMONYMES : NE PAS POSER UNE QUESTION SANS RÉPONSE POSSIBLE (2026-09-18, A3)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré ce matin : 2 069 groupes d'articles en statut 'stock' partagent titre
-- normalisé ET prix à l'identique, sur 168 comptes, 5 947 lignes ; le plus gros
-- groupe fait 75 articles chez une seule personne.
--
-- CE QUE VOYAIT L'UTILISATEUR (A1) : la proposition ne montre JAMAIS la liste
-- `candidats` — l'écran « Annonces à rattacher » affiche UNE carte, avec le
-- PREMIER candidat de la liste (B2 trie par created_at DESC, donc le plus
-- récemment créé) et la mention « plusieurs candidats ». Le seul recours,
-- « Choisir l'article », rend 12 lignes au libellé RIGOUREUSEMENT identique :
-- rien ne permet de les distinguer. La question était donc sans réponse
-- possible, et la valeur affichée était un choix arbitraire NON ASSUMÉ.
--
-- CE QU'ON FAIT : quand tous les candidats sont STRICTEMENT identiques (même
-- titre normalisé, même prix, tous des articles du stock), le choix est
-- arbitraire de toute façon — alors on l'assume, avec une règle explicite :
--   ⇒ LA PLUS ANCIENNE (created_at le plus petit).
-- Pourquoi la plus ancienne : c'est celle qui attend depuis le plus longtemps,
-- et B2 a déjà écarté celles qui portent un dépôt publié sur cette plateforme.
-- Le motif devient 'homonymes_tranches' et la proposition porte
-- `choix_arbitraire` = { regle, total } pour que l'app puisse le DIRE.
--
-- ⛔ LES TROIS CONDITIONS DE LA BANDE « certain » NE SONT PAS TOUCHÉES.
--    `v_n` (nombre de candidats), `v_prix_ok` et `v_homonymes` sont calculés
--    exactement comme avant, et le test `v_n = 1 AND v_prix_ok AND
--    v_homonymes <= 1` est inchangé. Le tri arbitraire ne s'applique que
--    lorsque v_n > 1 : la bande « certain » est alors déjà hors d'atteinte.
--    Rien ne peut devenir un rattachement automatique qui ne l'était pas.
--
-- AU PASSAGE, LE PLAFOND : `candidats` partait dans le jsonb de la proposition
-- SANS AUCUNE BORNE — 75 entrées pour un écran qui n'en affiche aucune. Borné
-- à 8, avec `candidats_total` pour ne pas perdre le compte.
--
-- (A2, pour mémoire, aucun changement : `v_homonymes` se compte sur
--  `statut = 'stock'` UNIQUEMENT. Trois exemplaires identiques dont deux
--  VENDUS ⇒ v_homonymes = 1 ⇒ le rattachement automatique n'est pas bloqué.
--  Il ne compte pas `disparu_le IS NULL`, contrairement à la recherche de
--  candidats : une ligne en stock mais disparue gonfle donc le compte et
--  bloque — dans le sens prudent, on laisse.)
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
  v_ja     text[];
  v_cf     jsonb := '[]'::jsonb;
  v_nf     integer := 0;
  v_identiques boolean := false;
  v_sortie jsonb;
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

  -- B1. Dépôts FillSell au même titre dont l'annonce n'est PLUS dans le relevé.
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
  -- B2. Articles du stock au même titre, SANS dépôt sur cette plateforme.
  --     `created_at` part avec le candidat : c'est la clé de la règle du choix
  --     arbitraire ci-dessous, et elle doit être LUE, pas devinée de l'ordre.
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

  -- C. SECOND TOUR : LE FAISCEAU (20260918091000). Toujours 'propose'.
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

  -- ── LE CHOIX ARBITRAIRE, ASSUMÉ (A3) ───────────────────────────────────────
  -- Tous les candidats sont-ils STRICTEMENT identiques ? Même type (article du
  -- stock), même titre normalisé (garanti par B2), même prix — `IS DISTINCT
  -- FROM` traite deux prix NULL comme identiques, ce qui est le cas voulu.
  IF v_n > 1 THEN
    SELECT count(*) = 0 INTO v_identiques
      FROM jsonb_array_elements(v_cands) c
     WHERE c ->> 'type' <> 'inventaire'
        OR (c ->> 'prix') IS DISTINCT FROM (v_cands -> 0 ->> 'prix');
    IF v_identiques THEN
      -- On remet la PLUS ANCIENNE en tête. `v_n` n'est pas modifié : la bande
      -- « certain » exige v_n = 1, elle reste hors d'atteinte.
      SELECT jsonb_agg(c ORDER BY (c ->> 'created_at')) INTO v_cands
        FROM jsonb_array_elements(v_cands) c;
    END IF;
  END IF;

  v_best := v_cands -> 0;
  -- Les DEUX prix connus, et égaux : c'est la seule égalité qui prouve.
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
  -- ⛔ Les trois conditions, mot pour mot celles d'avant.
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  -- `candidats` BORNÉ à 8 (il partait sans limite : 75 entrées pour un écran
  -- qui n'en affiche aucune). `candidats_total` garde le compte exact.
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_sortie
    FROM (SELECT c FROM jsonb_array_elements(v_cands) c LIMIT 8) s;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_sortie, 'candidats_total', v_n,
                            'choix_arbitraire', CASE WHEN v_identiques THEN
                              jsonb_build_object('regle', 'la plus ancienne', 'total', v_n) ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) TO service_role;
