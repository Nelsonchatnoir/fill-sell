-- ═══════════════════════════════════════════════════════════════════════════
-- RÈGLE DE NICO (05/11) : UNE VENTE LEBONCOIN D'UN ARTICLE EN SÉRIE VA AU POINT FINAL, ET LA REMISE EN VENTE SUIT
-- ═══════════════════════════════════════════════════════════════════════════
-- Régression du 22/10 (01c2437, migration 20261022110000:214 ; reprise par 20261024150000:106 et 20261103230000:571,
-- = prod) : dans leboncoin_transaction_noter, « coalesce(i.quantite,1) > 1 → 'plusieurs_exemplaires' » arrêtait TOUTE
-- vente « Achat en cours » d'un article en série — aucune preuve, rien ne passait « vendu », aucune remise en vente
-- (68 traces chez Louis depuis le 31/10, 9 annonces, toutes des dépôts FillSell). La règle « transaction Leboncoin
-- pending = vente payée » est VOULUE et ne change pas. Un seul chemin de fin : la preuve exacte → ventes_prouvees_tick →
-- enregistrer_vente_prouvee → enregistrer_vente_atomique (−1 au stock, job « vendu », reçu avec le restant) → déclencheur
-- cross_post_jobs_vendu_remise_en_vente → remises_en_vente_tick (dépôt « publish » à l'identique, sans IA, marqueur
-- platform_fields.remise_en_vente ; place / plafonds / cadence INCHANGÉS).
-- 1. leboncoin_transaction_noter : un DÉPÔT FILLSELL (une republication — l'extension a recréé l'annonce —, ou une
--    publication jamais importée : NOT annonce_importee) reçoit la MÊME preuve exacte qu'une pièce unique ;
--    « plusieurs_exemplaires » (trace, à la personne) reste pour une VRAIE annonce importée à plusieurs unités.
-- 2. remises_en_vente_tick : (a) une annonce Leboncoin sous transaction (« Achat en cours » / « Vendu ») n'est ni
--    « encore en ligne » (l'annonce vendue, que Leboncoin garde active) ni « déjà en vente » (une autre annonce de la
--    fiche : la vente d'avant, que Leboncoin garde listée des jours) ; (b) Leboncoin : « importée à quantité » se juge
--    sur l'annonce vendue elle-même — une republication (dépôt FillSell) n'hérite jamais de source / rattachement de
--    l'annonce d'origine (3298491503, job 6696ce1f). eBay : inchangé.
-- 3. vente_transaction_annulee_leboncoin : fiche restée au stock (plusieurs exemplaires) → achat annulé = +1 au stock,
--    copie « vendu » de la vente effacée (même règle que vente_commande_annulee_vinted), remise en vente non servie
--    arrêtée (file a_faire, ou dépôt « pending » pas encore pris) ; état d'avant dans inventaire_journal.detail.
-- Définitions de départ lues EN PROD le 05/11 (pg_get_functiondef), md5 sans CR :
--   leboncoin_transaction_noter         dbf4bdd2e8ce0246518a3ffafb2f918d
--   remises_en_vente_tick               d93d5ddd7306743644921495c23434cc
--   vente_transaction_annulee_leboncoin f3a8a336985bed96456f3f1d00d659bf
-- Rien d'autre : aucune autre fonction, aucune cadence, aucun plafond, aucune donnée touchée par la migration.
-- ⚠ LIMITE HORS MIGRATION (décision de Nico) : la vente SUIVANTE d'une même fiche, tant que l'annonce vendue d'avant
-- reste listée « Vendu » chez Leboncoin, est refusée par enregistrer_vente_atomique (fiche_annonces_vivantes = 2,
-- « Plusieurs exemplaires sont possibles », réessai toutes les 6 h) jusqu'à ce que le relevé ne la voie plus.
-- Prouvé sur la base jetable (preuve, étape 4) ; le correctif proposé est d'une ligne dans fiche_annonces_vivantes.
-- Inverse : supabase/rollbacks/20261105170000_remise_en_vente_series_leboncoin_INVERSE.sql (prod mot pour mot).
-- Preuve sur un Postgres jetable : scripts/preuve-remise-en-vente-series.mjs ; selftest :
-- scripts/remise-en-vente-chemins-selftest.mjs.
BEGIN;

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
      -- (05/11, règle de Nico) UN DÉPÔT FILLSELL PORTE UNE PIÈCE (l'extension remplit « Quantité » à 1) : son « Achat en
      -- cours » / « Vendu » est la vente de CET exemplaire, prouvée comme une pièce unique ; la vente part au point final
      -- (enregistrer_vente_prouvee → enregistrer_vente_atomique : −1 au stock, job « vendu », reçu avec le restant) et la
      -- remise en vente suit (remises_en_vente_tick). Dépôt FillSell = une REPUBLICATION (l'extension a recréé l'annonce :
      -- source / rattachement hérités de l'annonce d'origine ne disent rien d'elle — 3298491503, job 6696ce1f), ou une
      -- publication jamais importée (annonce_importee : ni source « releve », ni rattachement.import). Seule une VRAIE
      -- annonce importée à plusieurs unités reste à la personne (régression du 22/10 : 01c2437, toute série s'arrêtait ici).
      ELSIF coalesce(i.quantite, 1) > 1 AND coalesce(j.action, 'publish') <> 'republish' AND public.annonce_importee(j.id) THEN
        v_issue := 'plusieurs_exemplaires';                                                -- importée multi-unités : à la personne
      ELSIF coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold'
            AND j.platform_fields #>> '{sale_evidence,listing_id}' = btrim(a.listing_id) THEN v_issue := 'deja_prouvee';
      -- ⛔ (03/11 soir, JEAN-LUC LASSARAT) « Vendu » dès la PREMIÈRE lecture d'une annonce importée (ou relu ainsi depuis,
      -- sans jamais d'autre état) : une vente d'avant le suivi — Leboncoin garde le badge sur une annonce encore en ligne
      -- (plusieurs exemplaires). FillSell ne la date pas : jamais une vente du jour, jamais un retrait de copie.
      ELSIF p_tx = 'sold' AND public.annonce_importee(j.id)
            AND (p_tx_avant IS NULL OR (p_tx_avant = 'sold' AND public.leboncoin_vendu_avant_suivi(a.user_id, a.listing_id))) THEN
        v_issue := 'vendu_avant_suivi';
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
;

CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_cpu numeric;
  r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_op jsonb; v_place jsonb; v_motif text; v_report timestamptz; v_nouveau uuid;
  v_vu timestamptz; v_api boolean; v_sortie bigint; v_prix integer;
  v_faites integer := 0; v_abandons integer := 0; v_reports integer := 0;
  v_annul boolean; v_restant integer;   -- (18/10) copie retirée à cause d'une vente annulée
  v_trans text; v_conv text; v_rep jsonb;   -- (25/10) « Republier » de Vinted : commande, conversation
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  -- (24/10 nuit, Nico) AVANT l'appui : un article remis en ligne DIRECTEMENT sur la plateforme — par le vendeur ou par la
  -- plateforme elle-même — n'est plus « à remettre en vente » sur cette plateforme : sa proposition se ferme « déjà en
  -- vente » et la carte le dit (jamais de doublon). Même lecture que la garde « déjà en vente » plus bas : le relevé de
  -- l'annonce vendue revue ACTIVE après l'annulation, ou une autre annonce en ligne de CETTE fiche — jamais le titre.
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = 'deja_en_vente', traite_le = now()
    FROM cross_post_jobs jv, inventaire iv
   WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
     AND jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND iv.id = rv.inventaire_id AND iv.user_id = rv.user_id
     AND (
       (rv.platform = 'vinted' AND NULLIF(btrim(jv.platform_listing_id), '') IS NOT NULL AND coalesce((
          SELECT sv.status = 'active' FROM vinted_listing_snapshots sv
           WHERE sv.user_id = rv.user_id AND sv.vinted_item_id = btrim(jv.platform_listing_id)
             AND sv.captured_at > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le)
           ORDER BY sv.captured_at DESC LIMIT 1), false))
       OR EXISTS (
          SELECT 1 FROM annonces_plateforme av
           WHERE av.user_id = rv.user_id AND av.inventaire_id = rv.inventaire_id AND av.platform = rv.platform
             AND av.statut_plateforme IN ('en_ligne', 'en_verification')
             AND av.disparu_le IS NULL AND av.retiree_le IS NULL AND av.ignoree_le IS NULL
             AND COALESCE(av.vu_le, av.created_at) > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le))
       OR (rv.platform = 'vinted' AND iv.vinted_item_id IS NOT NULL
           AND iv.vinted_item_id IS DISTINCT FROM NULLIF(btrim(jv.platform_listing_id), '')
           AND iv.disparu_le IS NULL AND COALESCE(iv.vinted_status, 'active') NOT IN ('sold', 'closed')));

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;
    -- (18/10) Le dépôt `cancelled` d'une copie retirée à cause d'une vente Vinted
    -- annulée (vente_commande_annulee_vinted) : pas de reçu, le restant est la
    -- quantité de la fiche ; toutes les autres gardes s'appliquent.
    v_annul := (j.id IS NOT NULL AND j.status = 'cancelled' AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'));
    v_restant := CASE WHEN v_annul THEN COALESCE(i.quantite, 1) ELSE NULLIF(v_op->>'restant', '')::integer END;

    IF j.id IS NULL OR (j.status <> 'sold' AND NOT v_annul) THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF NOT v_annul AND (v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true') THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF NOT v_annul AND COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    -- (24/10 soir, décision de Nico) Après une vente ANNULÉE, jamais de doublon : le vendeur a pu remettre l'article en
    -- ligne lui-même. La remise attend un relevé COMPLET de la plateforme fait après l'annulation et au plus tôt
    -- 15 min avant l'appui (demandé par l'appui) ; ce relevé rattache l'annonce remise en ligne, et « déjà en vente »
    -- l'écarte plus bas. Un compte sans aucun relevé de cette plateforme garde les gardes d'avant. 3 jours au plus.
    ELSIF v_annul AND public.releve_apres_annulation(r.user_id, r.platform,
            GREATEST(COALESCE(NULLIF(j.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, r.cree_le),
                     COALESCE(r.accepte_le, r.cree_le) - interval '15 minutes')) = 'attendu' THEN
      v_motif := 'releve_attendu';
      v_report := CASE WHEN COALESCE(r.accepte_le, r.cree_le) < now() - interval '3 days' THEN NULL
                       ELSE now() + interval '20 minutes' END;
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay', 'depop') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      -- (05/11, règle de Nico) Leboncoin : « importée » se juge sur l'annonce VENDUE elle-même. Une REPUBLICATION est un
      -- dépôt FillSell (une pièce) qui hérite source / rattachement de l'annonce d'origine (3298491503, job 6696ce1f) :
      -- jamais « importée à quantité ». eBay : inchangé.
      AND NOT (r.platform = 'leboncoin' AND COALESCE(j.action, 'publish') = 'republish')
      -- (06/10 soir) eBay : une annonce importée n'est « vendue » que si eBay
      -- la dit ÉPUISÉE (ebay-api-worker, sale_evidence.exact) — elle n'est plus
      -- en ligne ; la fiche qui garde du stock doit être remise en vente.
      AND NOT (r.platform = 'ebay' AND (
            COALESCE(j.platform_fields #>> '{sale_evidence,exact}', '') = 'true'
         OR (COALESCE(j.platform_fields #>> '{quantite_ebay,exacte}', '') = 'true'
             AND COALESCE(NULLIF(j.platform_fields #>> '{quantite_ebay,disponible}', '')::numeric, 1) <= 0))) THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
    -- (08/10, Louis) L'annonce « vendue » est encore EN LIGNE après la vente
    -- (dressing Vinted, relevé des autres plateformes) : une remise ferait un
    -- doublon. On revient dans 6 h (la vente annulée ou l'annonce partie, elle
    -- repart d'elle-même).
    ELSIF (r.platform = 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND (
             SELECT s.status = 'active' AND s.captured_at > COALESCE(j.sold_at, now())
               FROM vinted_listing_snapshots s
              WHERE s.user_id = r.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
              ORDER BY s.captured_at DESC LIMIT 1))
       OR (r.platform <> 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND EXISTS (
             SELECT 1 FROM annonces_plateforme a
              WHERE a.user_id = r.user_id AND a.platform = r.platform AND a.listing_id = btrim(j.platform_listing_id)
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now())
                -- (05/11, règle de Nico) Leboncoin garde l'annonce « active » pendant la transaction (« Achat en cours »)
                -- et une fois vendue (« Vendu ») : sous transaction, elle n'est pas « encore en vente » — la remise part.
                AND NOT (a.platform = 'leboncoin'
                         AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold')))) THEN
      v_motif := 'annonce_vendue_encore_en_ligne'; v_report := now() + interval '6 hours';
    ELSIF EXISTS (
        SELECT 1 FROM cross_post_jobs c
         WHERE c.user_id = r.user_id AND c.inventaire_id = r.inventaire_id AND c.platform = r.platform
           AND c.id <> j.id AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
           AND (c.status IN ('pending', 'processing', 'needs_user')
                OR (c.status = 'published' AND NOT EXISTS (
                      SELECT 1 FROM cross_post_jobs d
                       WHERE d.user_id = c.user_id AND d.inventaire_id = c.inventaire_id
                         AND d.platform = c.platform AND d.action = 'delete' AND d.status = 'deleted'
                         AND CASE WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                                   AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                                  THEN annonce_id_de_job(d.platform_listing_id, d.listing_url)
                                     = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                                  ELSE d.created_at > COALESCE(c.published_at, c.created_at) END))))
      OR EXISTS (
        SELECT 1 FROM annonces_plateforme a
         WHERE a.user_id = r.user_id AND a.inventaire_id = r.inventaire_id AND a.platform = r.platform
           AND a.statut_plateforme IN ('en_ligne', 'en_verification')
           AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
           AND a.listing_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
           -- (05/11, règle de Nico) Même règle : une AUTRE annonce Leboncoin de la fiche sous transaction (« Achat en
           -- cours » / « Vendu » — la vente d'avant, que Leboncoin garde listée des jours) n'est pas « déjà en vente ».
           AND NOT (a.platform = 'leboncoin'
                    AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold'))
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- (09/10 soir, Louis) Plus de branche « jumeau_en_ligne » : l'annonce
    -- d'une AUTRE fiche ne retient jamais la remise en vente de celle-ci
    -- (migration 20261009233000). « deja_en_vente » (CETTE fiche) reste.
    END IF;

    IF v_motif IS NULL AND EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = r.platform AND h.paused) THEN
      v_motif := 'plateforme_en_pause'; v_report := now() + interval '1 hour';
    END IF;
    IF v_motif IS NULL THEN
      SELECT p.extension_last_seen_at, COALESCE(p.ebay_voie_api, false) INTO v_vu, v_api
        FROM profiles p WHERE p.id = r.user_id;
      IF NOT (v_vu > now() - interval '7 days' OR (r.platform = 'ebay' AND v_api)) THEN
        v_motif := 'poste_absent'; v_report := now() + interval '6 hours';
      END IF;
    END IF;
    -- (24/10 soir) Une remise après une vente ANNULÉE est hors quota : c'est l'état d'avant la vente, pas une publication voulue.
    IF v_motif IS NULL AND NOT v_annul THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    -- (25/10 nuit, décision de Nico du 24/10 23:21) Vinted, vente ANNULÉE : la remise passe par le bouton « Republier »
    -- de Vinted (même annonce, mêmes photos, nouveau numéro) — l'extension ≥ 0.6.142 l'actionne (get-pending-jobs ne
    -- sert ce job qu'à un poste qui déclare « vinted_republier_v1 »). Sans numéro de commande ou d'annonce : rien
    -- n'est créé, jamais une nouvelle annonce en plus du bouton de Vinted.
    v_rep := '{}'::jsonb;
    IF v_motif IS NULL AND r.platform = 'vinted' AND v_annul THEN
      v_trans := NULLIF(btrim(COALESCE(j.platform_fields #>> '{vente_annulee_remise,commande}', '')), '');
      IF v_trans IS NULL OR v_trans !~ '^[0-9]+$' OR NULLIF(btrim(j.platform_listing_id), '') IS NULL THEN
        v_motif := 'republier_commande_inconnue';
      ELSE
        SELECT NULLIF(btrim(pc.conversation_ref), '') INTO v_conv FROM plateforme_commandes pc
         WHERE pc.user_id = r.user_id AND pc.platform = 'vinted' AND pc.commande_ref = v_trans
         ORDER BY pc.maj_le DESC NULLS LAST LIMIT 1;
        v_rep := jsonb_build_object('remise_par_republier', jsonb_build_object(
          'transaction_id', v_trans, 'conversation_id', v_conv, 'item_id', btrim(j.platform_listing_id),
          'vente', j.platform_fields #>> '{vente_annulee_remise,vente}', 'annulee_le', j.platform_fields #>> '{vente_annulee_remise,le}',
          'job_vendu', j.id, 'cree_le', now()));
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                -- (24/10 nuit, le short de Nico) Le contenu de la FICHE quand le job source n'en a pas (annonce importée du
                -- dressing, ancienne republication) : jamais une publication sans titre, sans prix ou sans photo.
                coalesce(nullif(btrim(j.title), ''), i.titre), coalesce(nullif(btrim(j.description), ''), i.description),
                coalesce(j.price, i.prix_vente),
                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0 THEN j.photos
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now()))
                || CASE WHEN v_annul THEN jsonb_build_object('hors_quota', true) ELSE '{}'::jsonb END
                || v_rep)
        RETURNING id INTO v_nouveau;
      EXCEPTION
        WHEN unique_violation THEN v_motif := 'deja_en_vente';
        WHEN OTHERS THEN v_motif := 'refus_creation: ' || left(SQLERRM, 160);
      END;
    END IF;

    IF v_nouveau IS NOT NULL THEN
      UPDATE remises_en_vente SET statut = 'faite', motif = NULL, job_cree = v_nouveau,
             essais = essais + 1, traite_le = now() WHERE id = r.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (r.user_id, 'remise_en_vente', jsonb_build_object('plateforme', r.platform,
        'inventaire_id', r.inventaire_id::text, 'job_vendu', j.id, 'job_cree', v_nouveau,
        'restant', v_restant, 'apres_annulation', v_annul, 'par_republier', v_rep ? 'remise_par_republier'));
      v_faites := v_faites + 1;
    ELSIF v_report IS NOT NULL AND v_report <> 'infinity' THEN
      UPDATE remises_en_vente SET motif = v_motif, essais = essais + 1, prochain_essai = v_report,
             traite_le = now() WHERE id = r.id;
      v_reports := v_reports + 1;
    ELSE
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = v_motif, essais = essais + 1,
             traite_le = now() WHERE id = r.id;
      v_abandons := v_abandons + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('issue', 'tour', 'faites', v_faites, 'reportees', v_reports,
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(p_vente bigint, p_motif text DEFAULT 'transaction_annulee'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_rendue text := NULL; v_recus jsonb := NULL; v_q integer;
  v_copie record; v_copies integer := 0; v_arretes integer := 0; v_en_cours integer := 0;
  -- (05/11) plusieurs exemplaires : la copie « vendu » effacée, la remise en vente non servie arrêtée, l'état d'avant
  v_ms bigint; v_hist bigint; v_hist_ligne jsonb; v_rv remises_en_vente%ROWTYPE; v_remise_avant jsonb;
  v_depot_avant jsonb; v_remise_arretee text := NULL;
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  IF v.plateforme_code IS DISTINCT FROM 'leboncoin' OR v.annonce_id IS NULL THEN RETURN jsonb_build_object('action', 'hors_sujet'); END IF;
  -- Mêmes interrupteur et liste d'attente que les commandes annulées (09/10, 17/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  -- La preuve : l'annonce FillSell close « vendue » sur CE numéro PAR la transaction Leboncoin.
  SELECT * INTO j FROM cross_post_jobs c
   WHERE c.user_id = v.user_id AND c.platform = 'leboncoin' AND c.status = 'sold'
     AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     AND c.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
   ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  -- Une vente SAISIE (ou née d'un autre chemin) n'est jamais retirée : signalée une fois.
  IF j.id IS NULL OR NOT EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = v.user_id
                                   AND o.cle = 'annonce:leboncoin:' || v.annonce_id AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v.id])) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_leboncoin_transaction'
                    AND u.metadata ->> 'vente' = v.id::text AND u.metadata ->> 'issue' = 'annulation_vente_saisie_signalee') THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_leboncoin_transaction',
        jsonb_build_object('vente', v.id::text, 'annonce', v.annonce_id, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'issue', 'annulation_vente_saisie_signalee'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'leboncoin', v.commande_ref, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_leboncoin', left(coalesce(p_motif, 'transaction_annulee'), 60));
  SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o
   WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'source', 'releve_leboncoin', 'motif', coalesce(p_motif, 'transaction_annulee'), 'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;

  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'transaction_annulee', traite_le = now()
       WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
      UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
      v_rendue := 'fiche';
      -- Les retraits armés par CETTE vente (même instant, ± 2 min) :
      --   · encore en file (pending / needs_user) → arrêtés : l'annonce est restée en ligne, rien à remettre ;
      --   · déjà faits (deleted), dépôt clos → remise en vente par la file remises_en_vente (ses gardes) ;
      --   · en cours chez l'extension (processing) → comptés, la remise suivra au prochain achat annulé lu.
      FOR v_copie IN
        SELECT d.id AS retrait, d.status, d.platform, p.id AS depot, p.status AS depot_statut
          FROM cross_post_jobs d
          LEFT JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
         WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete'
           AND d.platform <> 'leboncoin'
           AND d.platform_fields #>> '{arme_par,chemin}' IN ('vente_article_serveur', 'vente_copie_prouvee')
           AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
         ORDER BY d.platform
      LOOP
        IF v_copie.status IN ('pending', 'needs_user') THEN
          UPDATE cross_post_jobs SET status = 'cancelled',
                 error = 'Achat Leboncoin annulé : l''article est revenu dans ton stock, cette annonce reste en ligne.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'source', 'transaction_leboncoin'))
           WHERE id = v_copie.retrait AND status IN ('pending', 'needs_user');
          IF FOUND THEN v_arretes := v_arretes + 1; END IF;
        ELSIF v_copie.status = 'deleted' AND v_copie.depot IS NOT NULL AND v_copie.depot_statut = 'cancelled' THEN
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'source', 'transaction_leboncoin', 'le', now()))
           WHERE id = v_copie.depot;
          -- (24/10 soir, décision de Nico) PROPOSÉE, jamais automatique : le vendeur a pu annuler parce que l'article
          -- n'est plus disponible, ou le remettre en ligne lui-même. La carte « Vente annulée — Remettre en vente ? »
          -- (remettre_en_vente_apres_annulation) la fait partir d'un appui.
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai, statut)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now(), 'proposee')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'proposee', motif = NULL, prochain_essai = now(), traite_le = NULL, accepte_le = NULL
            WHERE remises_en_vente.statut <> 'faite';
          v_copies := v_copies + 1;
        ELSIF v_copie.status = 'processing' THEN
          v_en_cours := v_en_cours + 1;
        END IF;
      END LOOP;
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'statut', i.statut, 'stock', 'releve_leboncoin', 'transaction_annulee',
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'retraits_arretes', v_arretes, 'copies_remises', v_copies,
                            'retraits_en_cours', v_en_cours));
    -- (05/11, règle de Nico) PLUSIEURS EXEMPLAIRES : la fiche est restée au stock (la vente a retiré 1 ; son reçu portait
    -- le restant). L'achat annulé rend l'exemplaire (+1) et efface sa copie « vendu » (créée par enregistrer_vente_atomique
    -- au même instant, sans lien — même règle que vente_commande_annulee_vinted). La remise en vente de CETTE annonce qui
    -- n'est pas encore servie s'arrête : ligne de file encore « a_faire », ou dépôt créé mais pas encore pris par
    -- l'extension (« pending ») — la ligne de file tombe (une nouvelle vente de l'annonce, revenue en ligne, refera sa
    -- remise ; un refus de la personne, « abandonnee », n'est jamais touché). Un dépôt déjà pris (processing, publié)
    -- n'est pas touché : « deja_prise », dit. L'état d'avant (quantité, ligne de file, dépôt, copie effacée) part dans
    -- inventaire_journal.detail.
    ELSIF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'stock' THEN
      v_ms := floor(extract(epoch FROM v.created_at) * 1000)::bigint;
      SELECT h.id, to_jsonb(h) INTO v_hist, v_hist_ligne FROM inventaire h
       WHERE h.user_id = v.user_id AND h.statut = 'vendu' AND h.id BETWEEN v_ms - 2000 AND v_ms + 20000
         AND h.titre IS NOT DISTINCT FROM i.titre AND h.prix_vente IS NOT DISTINCT FROM v.prix_vente
         AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = h.id)
         AND NOT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.inventaire_id = h.id)
       ORDER BY abs(h.id - v_ms) LIMIT 1;
      UPDATE inventaire SET quantite = coalesce(quantite, 0) + v_q WHERE id = i.id;
      IF v_hist IS NOT NULL THEN DELETE FROM inventaire WHERE id = v_hist; END IF;
      v_rendue := 'exemplaire';
      SELECT * INTO v_rv FROM remises_en_vente WHERE job_vendu = j.id FOR UPDATE;
      IF v_rv.id IS NOT NULL THEN
        v_remise_avant := to_jsonb(v_rv);
        IF v_rv.statut = 'a_faire' THEN
          DELETE FROM remises_en_vente WHERE id = v_rv.id;
          v_remise_arretee := 'file';
        ELSIF v_rv.statut = 'faite' AND v_rv.job_cree IS NOT NULL THEN
          SELECT jsonb_build_object('id', c.id, 'status', c.status, 'error', c.error) INTO v_depot_avant
            FROM cross_post_jobs c WHERE c.id = v_rv.job_cree;
          UPDATE cross_post_jobs SET status = 'cancelled',
                 error = 'Achat Leboncoin annulé : l''annonce d''origine est de nouveau en ligne, cette remise en vente est arrêtée.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('remise_arretee', jsonb_build_object('le', now(), 'vente', v.id,
                        'source', 'transaction_leboncoin', 'job_vendu', j.id, 'avant', v_depot_avant))
           WHERE id = v_rv.job_cree AND status = 'pending';
          IF FOUND THEN
            DELETE FROM remises_en_vente WHERE id = v_rv.id;
            v_remise_arretee := 'depot';
          ELSE
            v_remise_arretee := 'deja_prise';
          END IF;
        END IF;
      END IF;
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'quantite', i.quantite::text, (coalesce(i.quantite, 0) + v_q)::text, 'releve_leboncoin', 'transaction_annulee',
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'copie_effacee', v_hist_ligne, 'remise_arretee', v_remise_arretee,
                            'avant', jsonb_build_object('quantite', i.quantite, 'remise', v_remise_avant, 'depot', v_depot_avant)));
    END IF;
  END IF;
  -- L'annonce Leboncoin a été relue EN LIGNE sans transaction : son job redevient « publié ».
  UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
         platform_fields = (coalesce(platform_fields, '{}'::jsonb)
           - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
           || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'annonce', 'en_ligne',
                                 'source', 'transaction_leboncoin', 'preuve', platform_fields -> 'sale_evidence'))
   WHERE id = j.id AND status = 'sold';
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'job', j.id, 'retraits_arretes', v_arretes,
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours,
                            'copie_effacee', v_hist, 'remise_arretee', v_remise_arretee);
END;
$function$
;

COMMIT;
