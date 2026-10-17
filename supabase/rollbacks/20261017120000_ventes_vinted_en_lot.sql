-- INVERSE de supabase/migrations/20261017120000_ventes_vinted_en_lot.sql :
-- les deux définitions EN PROD le 17/10, AVANT la migration (pg_get_functiondef, mot pour
-- mot ; md5 d'avant : enregistrer_ventes_relevees 5d1980a5c3eda3f772c48d23803a7dbe,
-- push_ventes_a_envoyer 369018f6704cb31ddb348183b333b368), puis le retrait des objets neufs.
-- ⚠️ Les DONNÉES ne bougent pas ici : une commande déjà éclatée garde ses lignes
-- '<ref>:<item_id>'. La table de composition n'est jamais jetée si elle porte des lignes :
-- elle est RENOMMÉE (_rollback_20261017120000_vinted_commandes_articles), pour que
-- l'inverse du script de réparation (scripts/reparations/20261017_ventes_vinted_en_lot_INVERSE.sql)
-- reste possible. À passer AVANT cet inverse si les deux sont voulus : l'inverse du
-- script, puis celui-ci.
-- Application : npx supabase db query --linked -f supabase/rollbacks/20261017120000_ventes_vinted_en_lot.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ── 1. Les deux définitions d'AVANT, mot pour mot (prod du 17/10) ──
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
  c_supprimees int := 0;
  v_rel record; v_q_fiche int; v_autres_cmd boolean;
  v_nb_ventes_fiche int; v_autre_pf boolean;
  v_vente_id bigint; v_ex jsonb; c_ex_vendues int := 0; c_ex_stock int := 0; c_ex_relire int := 0;
  c_annulees_retirees int := 0; c_annulees_signalees int := 0;
  v_inconnus jsonb := '{}'::jsonb;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla','depop') THEN
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

    -- (04/10) UNE VENTE SUPPRIMÉE PAR LA PERSONNE NE REVIENT JAMAIS : même
    -- commande sur la même plateforme, ou — pour une vente supprimée qui
    -- n'avait pas de commande — même annonce.
    IF EXISTS (SELECT 1 FROM ventes_supprimees s
                WHERE s.user_id = v_user AND s.plateforme_code = p_platform
                  AND (s.commande_ref = v_ref
                       OR (s.commande_ref IS NULL AND v_listing IS NOT NULL AND s.annonce_id = v_listing))) THEN
      c_supprimees := c_supprimees + 1;
      CONTINUE;
    END IF;

    v_classe := ventes_statut_classe(p_platform, v_statut);
    IF v_classe = 'annulee' THEN
      c_annulees := c_annulees + 1;
      -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY REMBOURSÉE OU ANNULÉE APRÈS COUP :
      -- la vente née du relevé est retirée, une vente saisie seulement signalée
      -- (vente_commande_annulee) — jamais une remise en ligne, 0 mail.
      IF p_platform = 'ebay' THEN
        SELECT v.id INTO v_vente_id FROM ventes v
         WHERE v.user_id = v_user AND v.plateforme_code = 'ebay' AND v.commande_ref = v_ref LIMIT 1;
        IF v_vente_id IS NOT NULL THEN
          BEGIN
            v_ex := vente_commande_annulee(v_vente_id, v_statut);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END IF;
      END IF;
      -- (15/10, P1 — Louis) UNE COMMANDE VINTED ANNULÉE : la vente née d'une preuve
      -- est retirée, la fiche revient au stock (vente_commande_annulee_vinted).
      -- La commande se reconnaît par son numéro, ou par les numéros d'annonce
      -- qu'elle porte (lot : item_ids, extension 0.6.111) — jamais par le titre.
      IF p_platform = 'vinted' THEN
        FOR v_vente_id IN
          SELECT v.id FROM ventes v
           WHERE v.user_id = v_user AND v.plateforme_code = 'vinted'
             AND (v.commande_ref = v_ref
                  OR (v.commande_ref IS NULL AND v.annonce_id IS NOT NULL
                      AND v.annonce_id = ANY (ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(
                            CASE WHEN v_lot THEN CASE WHEN jsonb_typeof(v_row -> 'item_ids') = 'array' THEN v_row -> 'item_ids' ELSE '[]'::jsonb END
                                 ELSE jsonb_build_array(v_listing) END) x WHERE x IS NOT NULL AND btrim(x) <> ''))
                      AND (v_vendu IS NULL OR v.created_at >= v_vendu - interval '3 days')))
           ORDER BY v.id
        LOOP
          BEGIN
            v_ex := vente_commande_annulee_vinted(v_vente_id, v_statut, v_ref, v_vendu);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee_vinted (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;
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
        -- (09/10, Jocabroc) IDENTIFIANT SEULEMENT, TITRE VIDE. Seules les bandes
        -- « job » et « job_clos » sont retenues ci-dessous, et rapprocher_classer
        -- ne les rend que par l'identifiant, AVANT de lire le titre. Le titre
        -- n'ajoutait qu'une comparaison à toute la boutique dont le verdict était
        -- JETÉ : sur un gros compte, 8 s dépassées, l'appel entier annulé, aucune
        -- commande jamais écrite. Avec un titre vide la fonction s'arrête juste
        -- après ses deux recherches par identifiant : même résultat, sans le coût.
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), '', v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','job_clos') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN
      -- Même verrou que la confirmation manuelle : le relevé ne peut pas
      -- insérer une deuxième vente pendant la confirmation de la première.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_inv::text,0));
      PERFORM 1 FROM inventaire WHERE id=v_inv AND user_id=v_user FOR UPDATE;
      c_rattachees := c_rattachees + 1;
    END IF;

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

    v_adopte := NULL; v_autre_pf := false; v_vente_id := NULL;
    IF v_inv IS NOT NULL AND v_listing IS NOT NULL AND NOT v_lot THEN
      -- Un reçu lie cette vente à CET identifiant d'annonce, y compris une
      -- copie dont la confirmation est arrivée par une autre plateforme.
      SELECT v.id INTO v_adopte FROM ventes_operations o
      JOIN ventes v ON v.id=(o.resultat#>>'{ventes_ids,0}')::bigint AND v.user_id=v_user
      WHERE o.user_id=v_user AND o.inventaire_id=v_inv
        AND jsonb_array_length(o.resultat->'ventes_ids')=1
        AND (v.commande_ref IS NULL OR v.commande_ref=v_ref)
        AND (o.cle='annonce:'||p_platform||':'||v_listing OR EXISTS(
          SELECT 1 FROM cross_post_jobs j WHERE j.user_id=v_user AND j.inventaire_id=v_inv
            AND j.platform=p_platform AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
            AND j.platform_fields->>'vente_operation_cle'=o.cle))
      ORDER BY o.cree_le DESC LIMIT 1;
    END IF;
    -- (02/10 soir, point 9) La ligne que le relevé a DÉJÀ posée pour cette
    -- commande (premier temps Vinted : liste sans numéro d'annonce).
    v_rel := NULL;
    SELECT v.* INTO v_rel FROM ventes v
     WHERE v.user_id = v_user AND v.plateforme_code = p_platform AND v.commande_ref = v_ref;
    -- LA VENTE SAISIE DE LA MÊME CESSION (02/10 soir, point 9 — règle de Nico :
    -- « le relevé ne crée jamais une deuxième vente pour un article qui a déjà
    -- une vente enregistrée pour cette même cession ; il complète l'existante »).
    -- Preuve : la fiche, désignée par le NUMÉRO d'annonce (v_inv ci-dessus),
    -- porte UNE seule vente sans commande, de cette plateforme ou sans
    -- plateforme ; aucune autre commande n'y est déjà relevée ; et la fiche est
    -- à pièce unique (quantité ≤ 1, jamais une revente en plusieurs exemplaires).
    -- Jamais le titre. Sans preuve, deux lignes restent (la vente reste
    -- « à compléter », visible).
    IF v_adopte IS NULL AND v_inv IS NOT NULL AND NOT v_lot THEN
      SELECT coalesce(i.quantite, 1) INTO v_q_fiche FROM inventaire i WHERE i.id = v_inv;
      SELECT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv
                       AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref) INTO v_autres_cmd;
      SELECT count(*) INTO v_nb_adoptables FROM ventes v
       WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
         AND v.id IS DISTINCT FROM v_rel.id
         AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform;
      IF v_nb_adoptables = 1 AND NOT v_autres_cmd AND coalesce(v_q_fiche, 1) <= 1 THEN
        SELECT v.id INTO v_adopte FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
           AND v.id IS DISTINCT FROM v_rel.id
           AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform
         LIMIT 1;
      END IF;
      -- (09/10, audit eBay — XEWER, GO de Nico) LA MÊME CESSION, DÉCLARÉE SUR UNE AUTRE
      -- PLATEFORME : la commande désigne la fiche par le NUMÉRO de son annonce (v_inv),
      -- la fiche est ÉPUISÉE (quantité 0 : jamais une revente en plusieurs exemplaires,
      -- une vente partielle laisse une quantité) et porte UNE SEULE vente, sans
      -- commande, d'une autre plateforme → la commande s'y fond (sa plateforme, sa date
      -- réelle) ; la saisie de la personne prime pour le reste.
      IF v_adopte IS NULL AND coalesce(v_q_fiche, 1) <= 0 AND NOT v_autres_cmd AND v_rel.id IS NULL THEN
        SELECT count(*) INTO v_nb_ventes_fiche FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv;
        IF v_nb_ventes_fiche = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
             AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), '') <> p_platform;
          IF v_adopte IS NOT NULL THEN
            v_autre_pf := true;
            INSERT INTO usage_logs (user_id, feature, metadata)
            VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
              'gardee', v_adopte, 'motif', 'meme_cession_autre_plateforme', 'plateforme', p_platform,
              'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
              'avant', (SELECT to_jsonb(v) FROM ventes v WHERE v.id = v_adopte), 'par', 'enregistrer_ventes_relevees'));
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- (02/10 soir, point 9) CE QUE LA PERSONNE A SAISI PRIME : prix de vente,
      -- prix d'achat, date et bénéfice saisis ne bougent pas ; le relevé ne
      -- remplit que ce qui est vide (date réelle vendu_le, plateforme, commande,
      -- numéro d'annonce, frais). La ligne que le relevé avait posée pour cette
      -- commande est FUSIONNÉE dans la vente gardée (trace complète dans
      -- usage_logs 'vente_fusionnee'), puis supprimée — AVANT de poser la
      -- commande sur la vente gardée : plus jamais la collision 23505 qui
      -- faisait échouer tout le relevé.
      IF v_rel.id IS NOT NULL AND v_rel.id <> v_adopte THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
          'gardee', v_adopte, 'fusionnee', to_jsonb(v_rel), 'motif', 'releve_dans_vente_saisie',
          'plateforme', p_platform, 'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
          'par', 'enregistrer_ventes_relevees'));
        DELETE FROM ventes WHERE id = v_rel.id AND user_id = v_user;
        c_fusionnees := c_fusionnees + 1;
      END IF;
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = CASE WHEN v_autre_pf THEN p_platform ELSE coalesce(v.plateforme, p_platform) END,
        vendu_le           = coalesce(v.vendu_le, v_vendu, v_rel.vendu_le),
        date               = coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_rel.date),
        prix_vente         = coalesce(v.prix_vente, v_prix, v_rel.prix_vente),
        prix_achat         = coalesce(v.prix_achat, v_pa),
        benefice           = coalesce(v.benefice,
                               CASE WHEN coalesce(v.prix_vente, v_prix) IS NOT NULL AND coalesce(v.prix_achat, v_pa) IS NOT NULL
                                    THEN coalesce(v.prix_vente, v_prix) - coalesce(v.prix_achat, v_pa) - v_pc
                                         - coalesce(v.frais_plateforme, v_frais, 0) END),
        devise             = coalesce(v.devise, v_devise, v_rel.devise),
        frais_plateforme   = coalesce(v.frais_plateforme, v_frais, v_rel.frais_plateforme),
        titre              = coalesce(nullif(btrim(v.titre),''), v_titre),
        inventaire_id      = coalesce(v.inventaire_id, v_inv),
        annonce_id         = coalesce(v.annonce_id, v_listing),
        releve_le          = now()
      WHERE v.id = v_adopte;
      c_adoptees := c_adoptees + 1;
      v_vente_id := v_adopte;
    ELSE
      INSERT INTO ventes (
        user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le,
        plateforme, plateforme_code, plateforme_origine, commande_ref,
        source, releve_le, devise, frais_plateforme, selling_fees,
        inventaire_id, quantite, statut, annonce_id
      ) VALUES (
        v_user, v_titre, v_prix, v_pa, v_benef,
        (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_vendu,
        p_platform, p_platform, NULL, v_ref,
        'releve', now(), v_devise, v_frais, coalesce(v_frais, 0),
        v_inv, 1, 'vendu', CASE WHEN v_lot THEN NULL ELSE v_listing END
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
        -- (02/10 soir) la fiche arrive au second temps : son prix d'achat et
        -- le bénéfice viennent avec (jamais un écrasement d'une valeur posée).
        prix_achat       = coalesce(ventes.prix_achat, EXCLUDED.prix_achat),
        benefice         = coalesce(ventes.benefice, EXCLUDED.benefice),
        annonce_id       = coalesce(ventes.annonce_id, EXCLUDED.annonce_id),
        releve_le        = now()
      RETURNING (xmax = 0), id INTO v_insere, v_vente_id;
      IF v_insere THEN c_creees := c_creees + 1; ELSE c_deja := c_deja + 1; END IF;

      -- (02/10 soir, point 9) L'ancien « passage détail » SUPPRIMAIT la vente
      -- saisie par la personne et gardait les valeurs du relevé : retiré. La
      -- même cession est désormais fusionnée DANS la vente saisie (plus haut).
    END IF;

    -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY = LA VENTE D'UN EXEMPLAIRE,
    -- PAS DE LA FICHE : la quantité eBay lue APRÈS la commande décide
    -- (ebay_commande_appliquer) — épuisée/terminée : fiche vendue + retrait des
    -- copies prouvées ; disponible : fiche en stock à la quantité eBay, aucun
    -- retrait ; inconnue : rien d'irréversible, relue au passage suivant.
    IF p_platform = 'ebay' AND v_inv IS NOT NULL AND NOT v_lot AND v_vente_id IS NOT NULL THEN
      BEGIN
        v_ex := ebay_commande_appliquer(v_vente_id);
        IF v_ex ->> 'decision' = 'vendue' THEN c_ex_vendues := c_ex_vendues + 1;
        ELSIF v_ex ->> 'decision' = 'en_stock' THEN c_ex_stock := c_ex_stock + 1;
        ELSIF v_ex ->> 'decision' = 'a_relire' THEN c_ex_relire := c_ex_relire + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'ebay_commande_appliquer (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
      END;
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
    'articles_completes', c_inv_completes, 'saisies_fusionnees', c_fusionnees,
    'supprimees_par_la_personne', c_supprimees,
    'exemplaires_vendus', c_ex_vendues, 'exemplaires_en_stock', c_ex_stock, 'exemplaires_a_relire', c_ex_relire,
    'annulees_retirees', c_annulees_retirees, 'annulees_signalees', c_annulees_signalees);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.push_ventes_a_envoyer(p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_prof     record;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
  v_motif    text;
  v_prix     numeric;
  v_j        record;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus — par canal.
  -- Une note déjà décidée (part_le) ne repasse jamais par la décision : elle
  -- repart par la boucle des relances, plus bas, canal par canal.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  update public.push_ventes
     set mail_statut = case when mail_essais >= 3 then 'echec' else 'a_envoyer' end,
         mail_motif  = case when mail_essais >= 3 then 'envoi_interrompu' else mail_motif end
   where mail_statut = 'en_envoi' and mail_traite_le < now() - interval '3 minutes';
  -- (09/10, Bebertdeals) Une note de JOB attend que sa vente soit ENREGISTRÉE
  -- (push_vente_enregistree, plus bas) : 24 h au plus, puis elle se clôt SANS
  -- mail ni push.
  update public.push_ventes set statut = 'ignoree', motif = 'vente_non_enregistree', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and origine = 'job' and cree_le < now() - interval '24 hours';
  -- Une note jamais décidée en 2 h n'apprend plus rien à personne (hors notes
  -- de job : elles attendent leur vente, ci-dessus).
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and cree_le < now() - interval '2 hours'
     and origine is distinct from 'job';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select x.user_id from (
      select p.user_id, min(p.cree_le) as d from public.push_ventes p
       where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le < now() - interval '15 seconds'
         -- (09/10) une note de job qui attend sa vente ne prend pas la place
         -- des autres comptes : elle revient dès que la vente est enregistrée.
         and (p.origine is distinct from 'job' or p.job_id is null
              or p.cree_le > now() - interval '5 minutes' or public.push_vente_enregistree(p.job_id))
       group by p.user_id
      union all
      select p.user_id, min(coalesce(p.mail_traite_le, p.traite_le, p.cree_le)) from public.push_ventes p
       where p.part_le is not null and (p.statut = 'a_envoyer' or p.mail_statut = 'a_envoyer')
       group by p.user_id
    ) x group by x.user_id order by min(x.d) limit 20
  loop
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    if not pg_try_advisory_xact_lock(hashtextextended('push_ventes:' || v_user::text, 0)) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    select p.email, coalesce(p.lang, 'fr') as lang into v_prof from public.profiles p where p.id = v_user;

    -- Relances d'une vente déjà décidée « part » : chaque canal en attente
    -- repart seul ; la décision n'est jamais refaite.
    for r in
      select * from public.push_ventes
       where user_id = v_user and part_le is not null
         and (statut = 'a_envoyer' or mail_statut = 'a_envoyer')
       order by id
       for update skip locked
    loop
      update public.push_ventes set
        statut = case when statut = 'a_envoyer'
                      then case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end
                      else statut end,
        essais = essais + case when statut = 'a_envoyer' and jsonb_array_length(v_app) > 0 then 1 else 0 end,
        traite_le = case when statut = 'a_envoyer' then now() else traite_le end,
        mail_statut = case when mail_statut = 'a_envoyer' then 'en_envoi' else mail_statut end,
        mail_essais = mail_essais + case when mail_statut = 'a_envoyer' then 1 else 0 end,
        mail_traite_le = case when mail_statut = 'a_envoyer' then now() else mail_traite_le end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang,
        -- (11/10) Vente détectée, pas encore enregistrée : le mail mène à la liste « à confirmer ».
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds'
       order by id
       for update skip locked
    loop
      v_cles := r.cles;
      -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
      if r.vente_id is not null then
        select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
        if found then
          if v_v.annonce_id is not null and r.plateforme is not null then
            v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
          end if;
          if v_v.inventaire_id is not null then
            select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
            if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
          end if;
        end if;
      end if;
      -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
      if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
         and r.cree_le > now() - interval '3 minutes' then
        continue;
      end if;
      v_cles := array(select distinct k from unnest(v_cles) k);
      -- (08/10, Louis) Le signal de vente d'un JOB doit tenir au moment de
      -- décider : la synchro du dressing dément en quelques secondes une vente
      -- collée au mauvais job (vinted_dressing_dement_signaux). Vinted attend
      -- donc 2 minutes ; un signal retiré n'annonce rien (ni push, ni mail).
      if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then
        continue;
      end if;
      if r.origine = 'job' and r.job_id is not null and not exists (
           select 1 from public.cross_post_jobs jj where jj.id = r.job_id
              and (jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')) then
        update public.push_ventes set statut = 'ignoree', motif = 'signal_dementi', traite_le = now() where id = r.id;
        continue;
      end if;
      -- (11/10, Louis) UNE ANNONCE VENDUE NE SE SIGNALE QU'UNE FOIS. Jusqu'ici,
      -- « même vente déjà annoncée » ne regardait que les notes des 3 DERNIERS
      -- JOURS et jamais le reçu de la vente (ventes_operations) : une fiche à
      -- quantité qui revoit une ancienne annonce Vinted « vendue » au relevé
      -- remailait une vente traitée 3 à 5 jours plus tôt. Désormais, sans limite
      -- de temps (push_vente_deja_signalee) : vente déjà enregistrée AVANT ce
      -- signal, ou même annonce / même commande déjà annoncée ou déclarée →
      -- doublon. eBay : la commande seule, jamais l'annonce (une annonce eBay en
      -- quantité se vend plusieurs fois).
      v_motif := public.push_vente_deja_signalee(v_user, r.plateforme, v_cles, r.cree_le, r.id, false);
      -- Même vente vue par son job ou par sa fiche (pièce unique) : fenêtre de
      -- 3 jours, inchangée (une fiche peut revenir en stock après une annulation).
      if v_motif is null and exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')) then
        v_motif := 'meme_job_ou_fiche';
      end if;
      if v_motif is not null then
        update public.push_ventes set statut = 'doublon', motif = v_motif, cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      -- (09/10, Bebertdeals) LE MAIL APRÈS LA VENTE, JAMAIS AVANT NI SANS. Un
      -- signal « vendue » posé sur un job (veilleur, synchro du dressing, API)
      -- n'annonce rien tant que la vente n'est pas ENREGISTRÉE. Une preuve
      -- exacte s'enregistre seule en quelques minutes (ventes_prouvees_tick,
      -- veilleur eBay) : la note part alors, après la vente et ses retraits. Un
      -- signal sans preuve reste une question (bandeau « Vendue ? ») : la note
      -- attend 24 h puis se clôt sans rien envoyer (en tête) ; si la personne
      -- confirme elle-même, sa note « declaree » rend celle-ci doublon (ci-dessus).
      if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then
        continue;
      end if;
      -- (16/10, C1) Le prix ANNONCÉ d'une note de JOB : celui de la vente
      -- ENREGISTRÉE (son reçu : le prix confirmé par la personne, ou la
      -- transaction relevée), à défaut celui de la note, à défaut
      -- prix_vente_du_job. Inconnu = NULL : le mail n'écrit alors aucun
      -- montant (push-ventes). Une panne de ce calcul garde le prix de la note.
      v_prix := r.prix;
      if r.origine = 'job' and r.job_id is not null then
        begin
          select jj.user_id, jj.platform, jj.platform_listing_id, jj.price, jj.platform_fields, jj.inventaire_id
            into v_j from public.cross_post_jobs jj where jj.id = r.job_id;
          if found then
            v_prix := coalesce(public.prix_vente_enregistree(v_j.user_id, v_j.platform, v_j.platform_listing_id, v_j.platform_fields),
                               r.prix,
                               public.prix_vente_du_job(v_j.user_id, v_j.platform, v_j.platform_listing_id,
                                                        v_j.price, v_j.platform_fields, v_j.inventaire_id));
          end if;
        exception when others then
          v_prix := r.prix;
        end;
      end if;
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(), prix = v_prix,
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', v_prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang,
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer' and part_le is null;
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$
;

-- ── 2. Les objets neufs ──
DROP FUNCTION IF EXISTS public.commandes_vinted_noter(jsonb);
DROP FUNCTION IF EXISTS public.vente_vinted_lot_noter(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.vente_vinted_lot_eclater(uuid, text, text);
DROP FUNCTION IF EXISTS public.push_noter_commande_vinted(uuid, text, bigint, jsonb, numeric, text, timestamptz);
DROP FUNCTION IF EXISTS public.vinted_lot_parts(uuid, text);
DROP FUNCTION IF EXISTS public.vinted_lot_composer(uuid, text, jsonb, text, boolean, numeric, text, timestamptz, jsonb, text);
DROP FUNCTION IF EXISTS public.vinted_commande_lue_tracer(uuid, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.vinted_commande_annulee(text);
DO $table$
BEGIN
  IF to_regclass('public.vinted_commandes_articles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.vinted_commandes_articles) THEN
      ALTER TABLE public.vinted_commandes_articles RENAME TO _rollback_20261017120000_vinted_commandes_articles;
    ELSE
      DROP TABLE public.vinted_commandes_articles;
    END IF;
  END IF;
END
$table$;
-- La note d'une commande redevient une note d'un article (push-ventes v12 le sait déjà).
ALTER TABLE public.push_ventes DROP COLUMN IF EXISTS articles;
DELETE FROM public.coin_config WHERE key = 'ventes_vinted_lot_depuis';
NOTIFY pgrst, 'reload schema';

COMMIT;
