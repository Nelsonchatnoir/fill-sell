CREATE OR REPLACE FUNCTION public.leboncoin_transaction_noter(p_annonce uuid, p_tx text, p_tx_avant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_ecrit boolean; v_jobs uuid[]; v_issue text; v_detail jsonb := '{}'::jsonb; v_vente bigint; v_r jsonb;
  v_rattrapage jsonb := NULL;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce;
  IF a.id IS NULL OR a.platform IS DISTINCT FROM 'leboncoin' OR nullif(btrim(a.listing_id), '') IS NULL THEN RETURN NULL; END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme.
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_leboncoin_transaction'), 0) = 1;

  IF p_tx IN ('pending', 'sold') THEN
    -- LE job Leboncoin de CE compte qui porte CE numéro, exactement — jamais un titre.
    SELECT array_agg(c.id) INTO v_jobs FROM cross_post_jobs c
     WHERE c.user_id = a.user_id AND c.platform = 'leboncoin' AND c.status = 'published'
       AND coalesce(c.action, 'publish') IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id);
    IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
      v_issue := CASE WHEN EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.user_id = a.user_id AND c.platform = 'leboncoin'
                                     AND c.status = 'sold' AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id))
                      THEN 'deja_vendue' ELSE 'sans_job' END;
    ELSIF array_length(v_jobs, 1) > 1 THEN
      v_issue := 'doute_deux_jobs';
    ELSE
      SELECT * INTO j FROM cross_post_jobs WHERE id = v_jobs[1];
      SELECT * INTO i FROM inventaire WHERE id = j.inventaire_id AND user_id = j.user_id;
      IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN v_issue := 'sans_fiche';
      ELSIF i.statut IS DISTINCT FROM 'stock' THEN v_issue := 'fiche_deja_vendue';         -- déjà déclarée : jamais deux ventes
      ELSIF coalesce(i.quantite, 1) > 1 THEN v_issue := 'plusieurs_exemplaires';           -- pro multi-unités : à la personne
      ELSIF coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold'
            AND j.platform_fields #>> '{sale_evidence,listing_id}' = btrim(a.listing_id) THEN v_issue := 'deja_prouvee';
      ELSE
        v_issue := CASE WHEN v_ecrit THEN 'prouvee' ELSE 'aurait_prouve' END;
        -- (24/10, décision 7) Même état avant et maintenant : un RATTRAPAGE par une lecture fraîche. Sa première
        -- lecture est la plus ancienne trace de la règle pour CETTE annonce et CET état (inconnue = ancienne).
        IF p_tx_avant IS NOT DISTINCT FROM p_tx THEN
          v_rattrapage := jsonb_build_object('regle', 'lecture_fraiche_2410', 'le', now(),
            'premiere_lecture', (SELECT min(u.created_at) FROM usage_logs u
                                  WHERE u.user_id = a.user_id AND u.feature = 'vente_leboncoin_transaction'
                                    AND u.metadata ->> 'annonce' = a.id::text AND u.metadata ->> 'transaction' = p_tx));
          v_detail := v_detail || jsonb_build_object('rattrapage', v_rattrapage);
        END IF;
        IF v_ecrit THEN
          -- Pas d'unavailable_since : la page publique d'un achat en cours reste « active » et la veille de
          -- l'extension lèverait un drapeau « plus en ligne » — la preuve, elle, ne se lève que par la règle.
          UPDATE cross_post_jobs c
             SET platform_fields = coalesce(c.platform_fields, '{}'::jsonb)
               || CASE WHEN a.prix > 0 THEN jsonb_build_object('detected_price', a.prix) ELSE '{}'::jsonb END
               || jsonb_build_object('sale_signal', 'sold',
                    'sale_evidence', jsonb_build_object('platform', 'leboncoin', 'listing_id', btrim(a.listing_id), 'state', 'sold',
                      'exact', true, 'source', 'transaction_leboncoin', 'statut', p_tx,
                      'libelle', CASE p_tx WHEN 'pending' THEN 'Achat en cours' ELSE 'Vendu' END,
                      'lu_le', now(), 'par', 'releve_leboncoin', 'annonce', a.id)
                      || CASE WHEN v_rattrapage IS NOT NULL THEN jsonb_build_object('rattrapage', v_rattrapage) ELSE '{}'::jsonb END)
           WHERE c.id = j.id AND c.status = 'published';
        END IF;
      END IF;
      v_detail := jsonb_build_object('job', j.id, 'inventaire_id', j.inventaire_id::text);
    END IF;

  ELSIF p_tx = 'aucune' AND p_tx_avant = 'pending' AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL THEN
    -- L'achat en cours a disparu, l'annonce est de nouveau en ligne : achat annulé.
    SELECT * INTO j FROM cross_post_jobs c
     WHERE c.user_id = a.user_id AND c.platform = 'leboncoin' AND btrim(coalesce(c.platform_listing_id, '')) = btrim(a.listing_id)
       AND c.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin' AND c.status IN ('published', 'sold')
     ORDER BY (c.status = 'sold') DESC, c.created_at DESC LIMIT 1;
    IF j.id IS NULL THEN
      v_issue := 'annulation_sans_preuve';
    ELSIF NOT v_ecrit THEN
      v_issue := 'aurait_annule';
    ELSIF j.status = 'published' THEN
      PERFORM signal_vente_lever(j.id, 'transaction_leboncoin_annulee', jsonb_build_object('annonce', a.id, 'lu_le', now()));
      v_issue := 'preuve_levee';
    ELSE
      SELECT v.id INTO v_vente FROM ventes v WHERE v.user_id = a.user_id AND v.plateforme_code = 'leboncoin'
         AND v.annonce_id = btrim(a.listing_id) ORDER BY v.created_at DESC LIMIT 1;
      IF v_vente IS NULL THEN v_issue := 'annulation_vente_introuvable';
      ELSE
        v_r := vente_transaction_annulee_leboncoin(v_vente, 'transaction_annulee');
        v_issue := 'annulation_' || coalesce(v_r ->> 'action', 'inconnue');
        v_detail := v_detail || jsonb_build_object('vente', v_vente::text, 'resultat', v_r);
      END IF;
    END IF;
    v_detail := v_detail || CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('job', j.id) ELSE '{}'::jsonb END;
  ELSIF p_tx NOT IN ('pending', 'sold', 'aucune') THEN
    v_issue := 'valeur_inconnue';
  ELSE
    v_issue := 'sans_effet';                                   -- ex. « sold » → sans transaction : on ne conclut rien
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (a.user_id, 'vente_leboncoin_transaction',
    jsonb_build_object('annonce', a.id, 'listing_id', a.listing_id, 'titre', left(coalesce(a.titre, ''), 120),
      'transaction', p_tx, 'avant', p_tx_avant, 'issue', v_issue, 'mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
      'run_id', a.run_id) || v_detail);
  RETURN jsonb_build_object('issue', v_issue) || v_detail;
END;
$function$
