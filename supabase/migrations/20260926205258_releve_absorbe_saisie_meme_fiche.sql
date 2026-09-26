-- ══════════════════════════════════════════════════════════════════════════════
-- LE RELEVÉ ABSORBE LA VENTE SAISIE À LA MAIN DE LA MÊME FICHE (2026-09-26, GO Nico)
-- ══════════════════════════════════════════════════════════════════════════════
-- LE CONSTAT (Joséphine, puis le parc) : 99 paires « vente relevée + vente saisie
-- à la main » du même article sur 20 comptes (≈ 1 028 € comptés deux fois).
-- enregistrer_ventes_relevees n'absorbait une saisie que :
--   · par FICHE, et seulement au PREMIER passage — or sur Vinted l'identifiant
--     de l'article n'arrive qu'au passage « détail » : la ligne relevée existe
--     déjà (ON CONFLICT), la fiche lui est rattachée… et la saisie reste à côté ;
--   · ou par titre, au prix IDENTIQUE au centime — une offre acceptée (7,50 €
--     relevés contre 8 € saisis) suffisait à doubler la vente.
-- Et quand elle absorbait, elle gardait le prix SAISI (« enrichissement pur »).
--
-- LA RÈGLE (Nico, 26/09) : le relevé reconnaît la saisie de la MÊME fiche même
-- si le prix diffère, et c'est le PRIX RELEVÉ qui fait foi.
--   · même fiche (inventaire_id) ET même plateforme — jamais deux fiches
--     différentes, même homonymes ;
--   · une saisie « Ailleurs (main propre…) » — ou toute plateforme qui n'en est
--     pas une — n'est jamais absorbée ;
--   · un LOT relevé n'absorbe rien (ses articles ne sont pas connus ici) ;
--   · seulement quand la saisie est la SEULE autre vente de la fiche (une fiche
--     à plusieurs unités vendues ne se devine pas).
--
-- CE QUI CHANGE, exactement :
--   1. plateforme_normalisee(texte) : 'Vinted', 'vinted', 'LBC'… → code ;
--      'Ailleurs', 'main propre' → 'ailleurs' ; texte libre inconnu → 'autre' ;
--      vide → NULL.
--   2. Adoption par FICHE (premier passage) : les saisies d'une AUTRE plateforme,
--      « ailleurs » ou « autre » ne sont plus candidates. Une saisie SANS
--      plateforme reste candidate comme avant, enrichie comme avant (prix saisi
--      gardé). Une saisie de la MÊME plateforme, seule vente de la fiche, prend
--      le prix, la date et le bénéfice RELEVÉS.
--   3. Passage « détail » (la ligne relevée existe, la fiche vient d'être
--      connue) : la saisie de la même fiche, même plateforme, sans référence,
--      seule autre vente de la fiche, est SUPPRIMÉE — la ligne relevée,
--      reliée à la fiche, est la vente.
--   4. L'adoption par titre (lignes sans article) ne s'applique plus aux LOTS.
--   Tout le reste est recopié À L'IDENTIQUE de la version EN PROD du 26/09
--   (prosrc md5 dbd42afa964b24a18bc3956be525da57 — le fichier
--   20260920170000 du dépôt n'est pas la version en prod).

create or replace function public.plateforme_normalisee(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p is null or btrim(p) = '' then null
    when lower(p) like '%vinted%' then 'vinted'
    when lower(p) like '%leboncoin%' or lower(btrim(p)) in ('lbc', 'le bon coin') then 'leboncoin'
    when lower(p) like '%beebs%' then 'beebs'
    when lower(p) like '%ebay%' then 'ebay'
    when lower(p) like '%opla%' then 'opla'
    when lower(p) like '%ailleurs%' or lower(p) like '%main propre%' then 'ailleurs'
    else 'autre'
  end;
$$;
revoke execute on function public.plateforme_normalisee(text) from public, anon;
grant execute on function public.plateforme_normalisee(text) to authenticated, service_role;

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
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
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
        IF v_bande IN ('job','certain') THEN
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
      ELSIF v_titre IS NOT NULL AND v_prix IS NOT NULL AND NOT v_lot THEN
        -- ── LA LIGNE QUI N'A PAS D'ARTICLE (2026-09-20, BLOC 6) ─────────────
        -- Même compte, même plateforme, titre normalisé identique, prix
        -- identique au centime ; EXACTEMENT UNE CANDIDATE, sinon on ne devine
        -- pas. ⛔ Jamais pour un LOT (26/09) : ses articles ne sont pas connus.
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
      -- La ligne relevée est maintenant reliée à la fiche ; si la SEULE autre
      -- vente de cette fiche est une saisie à la main de la MÊME plateforme,
      -- sans référence, c'est la même vente comptée deux fois : la saisie
      -- part, la ligne relevée (prix de la plateforme) reste.
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

REVOKE ALL ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_ventes_relevees(text, jsonb, uuid) TO authenticated, service_role;
