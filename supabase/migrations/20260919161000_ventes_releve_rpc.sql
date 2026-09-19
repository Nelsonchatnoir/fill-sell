-- ═══════════════════════════════════════════════════════════════════════════
-- SYNCHRONISATION DES VENTES — LOT 0b : LE POINT D'ÉCRITURE, UNIQUE
-- 2026-09-19
--
-- UNE seule porte d'écriture pour les quatre plateformes relevées (Vinted,
-- Leboncoin, eBay, Opla). Beebs n'est pas dans la liste et ne le sera pas tant
-- que la structure d'une vente n'y aura pas été observée.
--
-- CE QUE CETTE RPC FAIT :
--   · écrit / enrichit `ventes`, dédoublonnée par (user_id, plateforme, ref) ;
--   · rattache à un article QUAND c'est certain, jamais autrement ;
--   · complète `inventaire.prix_vente` UNIQUEMENT sur un article DÉJÀ vendu
--     dont le prix est vide (le trou des 16 700 ventes sans montant).
--
-- CE QU'ELLE NE FAIT PAS, ET NE FERA JAMAIS :
--   ⛔ aucun job créé, aucun job touché, aucun retrait d'annonce ;
--   ⛔ aucune unité consommée, aucun quota, aucun compteur, aucun e-mail ;
--   ⛔ aucune bascule de `inventaire.statut` — la preuve de vente reste au
--      bandeau ; un relevé remplit des cases, il ne déclenche rien ;
--   ⛔ aucune donnée personnelle d'acheteur : `ref` est l'identifiant de la
--      COMMANDE, jamais celui d'une personne. Rien d'autre n'est reçu.
--
-- VOCABULAIRE DES STATUTS — RELEVÉ, JAMAIS DEVINÉ. Un statut jamais observé ne
-- conclut RIEN : il est compté et NOMMÉ dans la sortie, et la ligne n'est pas
-- écrite. C'est la règle anti-Beebs, appliquée ici aussi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ventes_statut_classe(p_platform text, p_statut text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE p_platform
    -- Vinted : `transaction_user_status` (valeur MACHINE), jamais la phrase
    -- française qui l'accompagne dans `status`.
    WHEN 'vinted' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'completed' THEN 'vente' WHEN 'failed' THEN 'annulee' ELSE 'inconnu' END
    -- Leboncoin : `step` de /pages/transactions. Relevé le 19/09 : done, cancelled.
    WHEN 'leboncoin' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'done' THEN 'vente' WHEN 'cancelled' THEN 'annulee'
      WHEN 'in_progress' THEN 'en_cours' ELSE 'inconnu' END
    -- Opla : statuts lus dans le composant de commande du site (accepted,
    -- waiting_for_shipment, shipped, delivered, completed, cancelled, refused,
    -- failed). ⚠️ AUCUNE vente Opla n'a jamais été observée : `accepted` et
    -- `waiting_for_shipment` restent EN COURS (l'argent n'est pas passé), on
    -- n'écrit qu'à partir de l'expédition.
    WHEN 'opla' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'shipped' THEN 'vente' WHEN 'delivered' THEN 'vente' WHEN 'completed' THEN 'vente'
      WHEN 'accepted' THEN 'en_cours' WHEN 'waiting_for_shipment' THEN 'en_cours'
      WHEN 'cancelled' THEN 'annulee' WHEN 'refused' THEN 'annulee' WHEN 'failed' THEN 'annulee'
      ELSE 'inconnu' END
    -- eBay : `orderPaymentStatus` de la Fulfillment API. VOCABULAIRE RELEVÉ le
    -- 19/09 sur les 41 commandes réelles des 8 comptes qui en ont :
    --   PAID 38 · PARTIALLY_REFUNDED 2 · FULLY_REFUNDED 1
    --   (orderFulfillmentStatus : FULFILLED 41 ; cancelState : NONE_REQUESTED 41)
    -- `cancelled` est posé par la fonction quand cancelState <> NONE_REQUESTED.
    -- ⛔ `pending` et `failed` existent dans la doc et n'ont JAMAIS été vus :
    --    ils ne sont donc PAS mappés — ils sortiront en « statut inconnu »,
    --    nommés, et on décidera à ce moment-là. Anti-Beebs, ici aussi.
    WHEN 'ebay' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'paid' THEN 'vente' WHEN 'partially_refunded' THEN 'vente'
      WHEN 'fully_refunded' THEN 'annulee' WHEN 'cancelled' THEN 'annulee'
      ELSE 'inconnu' END
    ELSE 'inconnu' END;
$fn$;

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
    IF v_inv IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user
                        AND v.plateforme_code = p_platform AND v.commande_ref = v_ref) THEN
      SELECT count(*) INTO v_nb_adoptables FROM ventes v
       WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL;
      IF v_nb_adoptables = 1 THEN
        SELECT v.id INTO v_adopte FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL LIMIT 1;
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
-- ⚠️ Et de `anon` NOMMÉMENT. Supabase accorde EXECUTE à `anon` par défaut sur
-- toute fonction du schéma public, et `REVOKE … FROM public` ne l'enlève PAS
-- (vérifié en prod le 19/09 : anon_peut = true juste après la création). Or
-- cette fonction est SECURITY DEFINER et accepte un `p_user` quand auth.uid()
-- est NULL : un appel anonyme aurait pu écrire pour n'importe quel compte.
REVOKE EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ventes_statut_classe(text, text) TO authenticated, service_role;
