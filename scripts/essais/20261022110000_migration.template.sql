-- ═══════════════════════════════════════════════════════════════════════════
-- 20261022110000_leboncoin_achat_en_cours_vente — LEBONCOIN : UN ACHAT EN COURS VAUT VENTE
-- (22/10, Sébastien ; rapport docs/enquetes/cinq-points-2210/RAPPORT.md § 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat : le relevé Leboncoin (API du tableau de bord) lit pour CHAQUE annonce l'attribut
-- `transaction_status` (« pending » = « Achat en cours », paiement sécurisé fait ; « sold » = « Vendu ») ;
-- l'extension ne décidait que sur `status = active` → « en ligne », et l'attribut ne survivait que dans un
-- échantillon de captures que personne ne lisait. CD « Mission: Impossible » (21/10, capture 16:34 « pending »)
-- et VHS Spice Girls (22/10, capture 08:05 « pending ») : aucune vente, copies Vinted restées en ligne jusqu'à
-- la déclaration à la main. 30 jours : 63 annonces lues « pending », 89 « sold », 25 et 33 comptes.
--
-- Règle (tout le parc) : la lecture « pending » ou « sold » d'une annonce Leboncoin est la PREUVE de sa vente,
-- sur son numéro exact. Elle pose sale_signal « sold » + sale_evidence exacte sur LE job Leboncoin publié de CE
-- compte à CE numéro (jamais un titre) ; ventes_prouvees_tick (cron 2 min) enregistre la vente « Leboncoin » par
-- enregistrer_vente_atomique et ses gardes (fiche en stock, un exemplaire, une annonce vivante, reçu unique),
-- et les retraits des autres plateformes partent (inventaire_vendu_retire_ses_copies). L'annonce Leboncoin
-- elle-même n'est jamais retirée (elle est la vente).
--   · seule une TRANSITION compte (lecture d'avant ≠ lecture de maintenant) : un relevé qui relit la même
--     transaction ne refait rien ; les annonces déjà « Vendu » avant la règle ne sortent pas d'un coup ;
--   · déjà déclarée (fiche vendue, vente saisie) : rien — jamais deux ventes ;
--   · plusieurs exemplaires, deux jobs au même numéro, pas de job, pas de fiche : rien d'écrit, une trace ;
--   · ACHAT ANNULÉ : l'annonce relue EN LIGNE sans transaction après une lecture « pending » → la preuve est
--     levée (vente pas encore enregistrée) ou la vente née de CETTE preuve est retirée (jamais une saisie) :
--     fiche remise au stock, retraits encore en file arrêtés, copies déjà retirées remises en vente par la file
--     remises_en_vente (mécanisme du 18/10, ses gardes), job Leboncoin rouvert (« published »). « sold » →
--     sans transaction : on ne conclut rien (trace seule) ;
--   · toute autre valeur de transaction_status : aucune vente, une trace (valeur_inconnue).
-- Sources de la lecture (la plus précise d'abord) : la colonne transaction_plateforme, écrite par l'extension
-- ≥ 0.6.129 à CHAQUE relevé pour CHAQUE annonce ('pending' | 'sold' | 'aucune' | autre valeur) ; sinon
-- l'attribut transaction_status de la capture (extensions d'avant : échantillon de 10 à 20 captures par
-- relevé, jamais capturées et périmées d'abord). Une capture sans attributs bruts ne dit rien (NULL).
-- Interrupteur : coin_config ventes_leboncoin_transaction (1 = écrit ; 0 = fantôme : la trace seule).
-- Aucun mail ni push n'est envoyé par cette migration (la note de vente suit la règle du 06/10 au fil des ventes).
-- Généré par scripts/essais/20261022110000_generer.mjs (push_trg_job lu en prod). Inverse :
-- supabase/rollbacks/20261022110000_leboncoin_achat_en_cours_vente.sql. Essai : scripts/essais/20261022110000_essai.sql.
-- ═══ CORPS DE LA MIGRATION
BEGIN;

ALTER TABLE public.annonces_plateforme
  ADD COLUMN IF NOT EXISTS transaction_plateforme text,
  ADD COLUMN IF NOT EXISTS transaction_lue_le timestamptz;
COMMENT ON COLUMN public.annonces_plateforme.transaction_plateforme IS
  '(22/10) Leboncoin : transaction_status lu par le relevé (pending = achat en cours, sold = vendu, aucune). Écrit par l''extension ≥ 0.6.129.';
-- Mêmes droits que les autres colonnes écrites par le relevé (authenticated seulement, jamais anon).
GRANT SELECT (transaction_plateforme, transaction_lue_le), INSERT (transaction_plateforme, transaction_lue_le),
      UPDATE (transaction_plateforme, transaction_lue_le) ON public.annonces_plateforme TO authenticated;

INSERT INTO public.coin_config (key, value) VALUES ('ventes_leboncoin_transaction', 1) ON CONFLICT (key) DO NOTHING;

-- La transaction lue d'une annonce : la colonne d'abord, sinon la capture ; NULL = rien de lu.
CREATE OR REPLACE FUNCTION public.leboncoin_transaction_lue(p_colonne text, p_capture jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_colonne), '') IS NOT NULL THEN left(lower(btrim(p_colonne)), 40)
    WHEN jsonb_typeof(p_capture -> 'attributs_bruts') = 'array' THEN coalesce(
      (SELECT left(lower(btrim(e ->> 'value')), 40) FROM jsonb_array_elements(p_capture -> 'attributs_bruts') e
        WHERE e ->> 'key' = 'transaction_status' AND nullif(btrim(e ->> 'value'), '') IS NOT NULL LIMIT 1),
      'aucune')
    ELSE NULL END;
$function$;

-- L'achat annulé : la vente née de la preuve Leboncoin est retirée, la fiche revient, les copies reviennent.
CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(p_vente bigint, p_motif text DEFAULT 'transaction_annulee')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_rendue text := NULL; v_recus jsonb := NULL; v_q integer;
  v_copie record; v_copies integer := 0; v_arretes integer := 0; v_en_cours integer := 0;
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
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now() + interval '2 minutes')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'a_faire', motif = NULL, prochain_essai = now() + interval '2 minutes', traite_le = NULL
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
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours);
END;
$function$;
REVOKE ALL ON FUNCTION public.vente_transaction_annulee_leboncoin(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vente_transaction_annulee_leboncoin(bigint, text) TO service_role;

-- La règle, pour UNE annonce dont la transaction lue vient de changer.
CREATE OR REPLACE FUNCTION public.leboncoin_transaction_noter(p_annonce uuid, p_tx text, p_tx_avant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_ecrit boolean; v_jobs uuid[]; v_issue text; v_detail jsonb := '{}'::jsonb; v_vente bigint; v_r jsonb;
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
                      'lu_le', now(), 'par', 'releve_leboncoin', 'annonce', a.id))
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
$function$;
REVOKE ALL ON FUNCTION public.leboncoin_transaction_noter(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leboncoin_transaction_noter(uuid, text, text) TO service_role;

-- La note de vente (mail, notification) : une transaction TERMINÉE (« Vendu ») lue par le relevé date d'avant la
-- lecture — jamais une vente du moment, aucune note ; « Achat en cours » suit la règle commune du 06/10.
-- push_trg_job repris de pg_get_functiondef (prod, 22/10) + une insertion ancrée.
-- @@PUSH_TRG_JOB@@

-- Le déclencheur : chaque écriture d'une annonce Leboncoin (relevé, capture) ; seule une TRANSITION agit.
CREATE OR REPLACE FUNCTION public.annonces_plateforme_transaction_leboncoin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new text; v_old text;
BEGIN
  BEGIN
    v_new := public.leboncoin_transaction_lue(NEW.transaction_plateforme, NEW.capture);
    IF v_new IS NULL THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' THEN
      v_old := public.leboncoin_transaction_lue(OLD.transaction_plateforme, OLD.capture);
      IF v_new IS NOT DISTINCT FROM v_old THEN RETURN NULL; END IF;
    END IF;
    -- Une annonce lue pour la première fois sans transaction n'a rien à dire.
    IF v_old IS NULL AND v_new = 'aucune' THEN RETURN NULL; END IF;
    PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un relevé perdu à cause de la règle : la panne est dite, l'écriture passe.
    RAISE WARNING 'annonces_plateforme_transaction_leboncoin (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.annonces_plateforme_transaction_leboncoin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS annonces_plateforme_transaction_leboncoin ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_transaction_leboncoin
  AFTER INSERT OR UPDATE OF transaction_plateforme, capture ON public.annonces_plateforme
  FOR EACH ROW WHEN (NEW.platform = 'leboncoin')
  EXECUTE FUNCTION public.annonces_plateforme_transaction_leboncoin();

COMMIT;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════
