-- ═══════════════════════════════════════════════════════════════════════════
-- LE RELEVÉ DES VENTES N'ÉCRIT PLUS UNE LIGNE À CÔTÉ D'UNE AUTRE (BLOC 6)
-- 2026-09-20
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI A ÉTÉ VU. Sur le compte de Romain (voirememe@gmail.com), le compteur
-- de ventes et la liste ne disent pas la même chose. En base : 11 lignes dans
-- `ventes` pour ~6 ventes réelles, et 8 articles au statut « vendu ».
--
-- LA CAUSE, MESURÉE. Le relevé se dédoublonne par (user, plateforme,
-- commande_ref). Toutes les lignes écrites AVANT lui — le bandeau « vendue ? »,
-- la saisie manuelle — ont `commande_ref` à NULL : la clé ne peut pas les voir.
-- Une adoption existait justement pour ça, mais elle ne savait chercher QUE par
-- article (`inventaire_id`). Or 4 785 des 5 076 lignes écrites par le relevé
-- n'ont pas d'article : l'adoption n'était donc même pas TENTÉE pour elles.
--
-- AMPLEUR : 108 doublons dans tout le parc, sur 9 comptes — dont 59 écrits le
-- 20/09. Le défaut est vivant, et il gonfle le chiffre d'affaires affiché.
--
-- MESURE DU CHANGEMENT, sur les 5 076 lignes déjà écrites :
--     98 auraient adopté au lieu de doubler (8 comptes)
--      6 avaient plusieurs candidates → abstention, on ne devine pas
--  4 681 ne trouvent rien → comportement inchangé
-- Vérifié sur un cas réel : deux « Robe M » à 3 € pointant sur la même
-- ancienne ligne restent bien DEUX ventes (la 2e ne trouve plus rien de libre).
--
-- ⛔ AUCUNE LIGNE EXISTANTE N'EST SUPPRIMÉE NI MODIFIÉE PAR CETTE MIGRATION.
--    Les 108 doublons déjà écrits restent tels quels : on ne répare pas à la
--    main en base ce que l'app doit faire seule. Ils sont listés dans le
--    rapport.
-- ⛔ L'adoption reste un ENRICHISSEMENT PUR : chaque champ n'est posé que s'il
--    était vide. `inventaire_id` rejoint la liste — même geste que la branche
--    ON CONFLICT juste en dessous, qui le faisait déjà.
--
-- RÉVERSIBLE : réappliquer 20260919161000_ventes_releve_rpc.sql.
CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees(
  p_platform text,
  p_rows     jsonb,
  p_user     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
  c_recues int := 0; c_sans_ref int := 0; c_annulees int := 0; c_en_cours int := 0;
  c_creees int := 0; c_adoptees int := 0; c_deja int := 0;
  c_rattachees int := 0; c_lots int := 0; c_inv_completes int := 0;
  v_inconnus jsonb := '{}'::jsonb;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla') THEN
    RAISE EXCEPTION 'plateforme non relevable: %', coalesce(p_platform,'(null)');
  END IF;
  -- Deux appelants : l'app/extension (JWT utilisateur) et le worker serveur
  -- (service_role, auth.uid() NULL). Jamais l'un pour le compte d'un autre.
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
      -- Statut JAMAIS OBSERVÉ : on le NOMME et on n'écrit rien. On décidera
      -- quand on l'aura vu passer, au lieu de deviner aujourd'hui.
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
    END IF;

    -- ── RATTACHEMENT ────────────────────────────────────────────────────────
    v_inv := NULL; v_bande := NULL;
    IF v_lot THEN
      -- Vente GROUPÉE (bundle Leboncoin, order.item_ids Vinted > 1) : un seul
      -- montant pour plusieurs articles. On ne rattache RIEN — la ligne existe,
      -- l'utilisateur tranchera. Ne jamais imputer un lot à un article.
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
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          -- Tous statuts de job, pas seulement 'published' : au moment où la
          -- vente est relevée, le job est souvent déjà 'sold'.
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
             AND (j.platform_listing_id = v_listing
                  OR (v_listing ~ '^[0-9]+$'
                      AND coalesce(j.listing_url,'') ~ ('(^|[^0-9])' || v_listing || '([^0-9]|$)')))
           ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
        END IF;
        IF v_inv IS NOT NULL THEN v_bande := 'identifiant'; END IF;
      END IF;

      -- Pas d'identifiant exploitable (Leboncoin n'en rend AUCUN) : le MOTEUR
      -- existant tranche, avec ses bandes. On ne le réécrit pas, on l'appelle.
      -- ⛔ SAUF si l'appelant a annoncé qu'un identifiant VA venir (`id_attendu`).
      --    Vinted rend ses ventes en deux temps : la liste (sans item_id) puis
      --    le détail (avec). Laisser le moteur trancher sur le titre au premier
      --    temps, c'est risquer un rattachement approximatif que le second
      --    temps ne pourrait plus corriger — `inventaire_id` ne s'écrase pas.
      --    On préfère une ligne non rattachée, rattachée juste au tour suivant.
      IF v_inv IS NULL AND v_titre IS NOT NULL
         AND NOT coalesce((v_row ->> 'id_attendu')::boolean, false) THEN
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), v_titre, v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','certain') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;  -- 'propose' et 'aucune' ne rattachent JAMAIS seuls
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN c_rattachees := c_rattachees + 1; END IF;

    -- ── PRIX D'ACHAT : VIDE ≠ ZÉRO (règle du 03/08) ────────────────────────
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

    -- ── ADOPTION D'UNE LIGNE EXISTANTE ─────────────────────────────────────
    -- Le bandeau (orchestrateSale) ou l'utilisateur a peut-être DÉJÀ enregistré
    -- cette vente, sans référence de commande. Créer une seconde ligne
    -- doublerait le chiffre d'affaires. On adopte la ligne existante — et
    -- SEULEMENT s'il n'y en a qu'UNE : deux candidates, on ne devine pas.
    -- ⛔ Et JAMAIS d'adoption quand cette commande a déjà sa ligne : au second
    --    passage (Vinted : le détail après la liste), adopter une AUTRE ligne
    --    de l'article créerait un doublon au lieu d'enrichir la sienne.
    v_adopte := NULL;
    IF NOT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user
                    AND v.plateforme_code = p_platform AND v.commande_ref = v_ref) THEN
      IF v_inv IS NOT NULL THEN
        SELECT count(*) INTO v_nb_adoptables FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL;
        IF v_nb_adoptables = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL LIMIT 1;
        END IF;
      ELSIF v_titre IS NOT NULL AND v_prix IS NOT NULL THEN
        -- ── LA LIGNE QUI N'A PAS D'ARTICLE (2026-09-20) ──────────────────────
        -- L'adoption ne savait chercher QUE par article. Or 4 785 des 5 076
        -- lignes écrites par le relevé n'en ont pas : sur Vinted l'identifiant
        -- n'arrive qu'au second temps, et on refuse (à raison) de rattacher au
        -- titre seul. Pour ces lignes-là, l'adoption n'était même pas TENTÉE —
        -- le relevé insérait à côté de la ligne que le bandeau avait déjà posée.
        -- On cherche donc aussi SANS article : même compte, même plateforme,
        -- titre normalisé identique, prix identique au centime.
        -- ⛔ EXACTEMENT UNE CANDIDATE, sinon on ne devine pas. Et comme les
        --    lignes sont traitées l'une après l'autre, deux ventes réellement
        --    identiques restent deux lignes : la première adopte, la seconde ne
        --    trouve plus rien de libre et crée la sienne.
        SELECT count(*) INTO v_nb_adoptables FROM ventes v
         WHERE v.user_id = v_user AND v.commande_ref IS NULL
           AND lower(coalesce(v.plateforme_code, v.plateforme)) = p_platform
           AND titre_norm(v.titre) = titre_norm(v_titre)
           AND v.prix_vente IS NOT NULL AND abs(v.prix_vente - v_prix) < 0.01;
        IF v_nb_adoptables = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.commande_ref IS NULL
             AND lower(coalesce(v.plateforme_code, v.plateforme)) = p_platform
             AND titre_norm(v.titre) = titre_norm(v_titre)
             AND v.prix_vente IS NOT NULL AND abs(v.prix_vente - v_prix) < 0.01
           LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- ENRICHISSEMENT PUR : chaque champ n'est posé que s'il était VIDE.
      -- prix_achat, benefice, emplacement, description, marque, type : JAMAIS.
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = coalesce(v.plateforme, p_platform),
        vendu_le           = coalesce(v.vendu_le, v_vendu),
        date               = coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date),
        prix_vente         = coalesce(v.prix_vente, v_prix),
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
    END IF;

    -- ── LE TROU DES VENTES SANS MONTANT ────────────────────────────────────
    -- 16 700 articles sont `statut='vendu'` avec `prix_vente` VIDE (la sync du
    -- dressing les marque vendus et n'écrit délibérément aucun prix). On le
    -- comble — et RIEN d'autre : aucun changement de statut, aucune unité
    -- consommée, aucun article encore en stock n'est touché.
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
    'articles_completes', c_inv_completes);
END;
$fn$;

REVOKE ALL ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) TO authenticated, service_role;
