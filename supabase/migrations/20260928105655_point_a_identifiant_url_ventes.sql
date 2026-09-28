-- Point A : un identifiant dans le titre d'une URL n'est pas son identifiant d'annonce.
-- GO Nico passe A à I ; idempotent, définitions seulement. Inverse préparé avant application.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
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
             AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
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
            listing_designe(v,j.listing_url,j.platform_listing_id)))
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
                        listing_designe(v,j.listing_url,j.platform_listing_id)))
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
