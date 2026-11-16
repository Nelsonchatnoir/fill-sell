-- 20261116170000_ventes_beebs_historique — L'HISTORIQUE COMPLET DES VENTES BEEBS (16/11/2026, point 8 de Nico, FEU VERT
-- de Nico pour la migration ; rapport docs/enquetes/lot-1611-2-midi/annexe-p7.md § 4).
--
-- Aujourd'hui aucune vente Beebs n'entre dans `ventes` par une lecture : `commandes_beebs_noter` (circuit VIVANT) ne fait
-- que PROUVER la vente d'une tâche FillSell publiée (interrupteur ventes_beebs_commandes, 0 = fantôme) ; une commande
-- dont le produit n'a pas de tâche est « sans_job » = rien. L'extension 0.6.192 rend désormais TOUTES les commandes de la
-- page « Ventes » (`historique`) et les envoie ici.
--
-- RÈGLE (une fonction dédiée : enregistrer_ventes_relevees, partagée par 5 plateformes, n'est PAS réécrite) :
--   · deux domaines qui ne se croisent jamais : une commande dont le produit porte une tâche Beebs FillSell (ce compte ou
--     un compte relié, numéro EXACT) dont le suivi a commencé AVANT la commande appartient au circuit vivant
--     (« suivie », jamais écrite ici) ; toute autre commande TERMINÉE (SELLER_PAID…, APPROVED_BY_BUYER) de plus de 48 h
--     devient une vente `source = 'releve'`, `plateforme_code = 'beebs'` ;
--   · une vente par produit (règle des lots) : commande_ref = n° de commande (1 produit) ou « n°:produit » ;
--   · jamais deux fois : ON CONFLICT … DO NOTHING (aucune ligne inchangée réécrite), une vente Beebs de ce numéro chez ce
--     compte ou un compte relié, ou le reçu « annonce:beebs:<numéro> » du point final (enregistrer_vente_atomique,
--     ventes_operations) = « deja » ; une commande déjà chez le compte relié = « autre_compte » ;
--   · une vente SUPPRIMÉE par la personne ne revient jamais (ventes_supprimees : commande, ou annonce sans commande) ;
--   · compte au Cloud actif : rien d'un autre poste (ecriture_poste_hors_cloud, comme enregistrer_ventes_relevees) ;
--   · fiche : par NUMÉRO EXACT seulement (annonces_plateforme, cross_post_jobs ; jamais un titre) ; liée seulement si UNE
--     fiche, déjà « vendu », sans vente Beebs ni retrait en attente ; une seule vente saisie Beebs sans commande sur une
--     fiche à pièce unique = la même cession, COMPLÉTÉE (cases vides seulement), jamais doublée ; une fiche « stock »
--     n'est jamais liée ni changée (compteur fiche_en_stock) ;
--   · prix : jamais deviné. Montant de la commande et prix des produits lus (répartis par beebs_commande_prix) gardés
--     SEULEMENT si leur unité est prouvée par le total de la commande (`total`, en euros) : ≤ 1,5 × total ; sinon NULL
--     (« inconnu », compteur prix_inconnus) — le piège ×100 de Leboncoin ne peut pas passer. Frais : NULL (inconnus) ;
--   · SILENCE : ni job, ni retrait, ni fiche changée (hors prix_vente vide d'une fiche DÉJÀ vendue), ni push_ventes, ni
--     mail. Le déclencheur ventes_push_releve sort à sa 1re ligne pour une vente de plus de 24 h (push_trg_ventes) : la
--     garde des 48 h la tient toujours au-delà ;
--   · interrupteur coin_config.ventes_beebs_historique (1 = écrit, posé à 1 ici : « sortir les ventes du fantôme », feu
--     vert de Nico du 16/11 ; 0 = fantôme, bilan seul ; absent = fantôme). Bilan usage_logs `ventes_beebs_historique`.
--
-- Garde : la migration refuse d'écraser une fonction du même nom qui existerait déjà en prod (aucune n'existe le 16/11).
-- Essai sur base JETABLE : scripts/essais/20261116170000_banc.mjs. Inverse : supabase/rollbacks/20261116170000_ventes_beebs_historique_INVERSE.sql.

DO $garde$
BEGIN
  IF to_regprocedure('public.ventes_beebs_historique_noter(jsonb,jsonb)') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.ventes_beebs_historique_noter(jsonb,jsonb)')
                       AND pg_get_functiondef(p.oid) LIKE '%20261116170000%') THEN
    RAISE EXCEPTION 'ventes_beebs_historique_noter existe déjà en prod sous une autre forme : migration refusée';
  END IF;
END
$garde$;

INSERT INTO public.coin_config (key, value) VALUES ('ventes_beebs_historique', 1) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ventes_beebs_historique_noter(p_rows jsonb, p_lecture jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
-- 20261116170000_ventes_beebs_historique (16/11/2026, point 8 de Nico) : l'historique des ventes Beebs, en silence.
DECLARE
  v_user uuid := auth.uid();
  v_ecrit boolean;
  v_comptes uuid[];
  v_row jsonb; v_ref text; v_statut text; v_date timestamptz; v_devise text;
  v_montant numeric; v_total numeric; v_somme numeric; v_ids text[]; v_prix_p jsonb; v_prix jsonb; v_titres jsonb;
  v_id text; v_n int; v_cle text; v_prix_v numeric; v_titre text; v_unite_ok boolean;
  v_fiches bigint[]; v_inv bigint; v_statut_fiche text; v_quantite numeric;
  v_pa numeric; v_pai boolean; v_pc numeric; v_benef numeric; v_vente bigint; v_adopte bigint; v_verdict text;
  v_lecture jsonb := '{}'::jsonb; v_bilan jsonb; v_build text;
  v_detail jsonb := '[]'::jsonb; v_cmd jsonb; v_a_relire text[] := '{}';
  v_plus_ancienne timestamptz; v_plus_recente timestamptz; v_montant_total numeric := 0;
  c_recues int := 0; c_produits int := 0; c_creees int := 0; c_aurait int := 0; c_completees int := 0; c_deja int := 0;
  c_suivie int := 0; c_supprimee int := 0; c_autre int := 0; c_recente int := 0; c_en_cours int := 0; c_annulees int := 0;
  c_date int := 0; c_forme int := 0; c_sans_fiche int := 0; c_fiche_liee int := 0; c_fiche_stock int := 0;
  c_fiche_doute int := 0; c_prix_lus int := 0; c_prix_inconnus int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- Compte au Cloud actif : seules les lectures du poste Cloud s'enregistrent (règle du 14/11, migration 20261114200000).
  IF public.ecriture_poste_hors_cloud(v_user) THEN
    RETURN jsonb_build_object('mode', 'compte_cloud', 'recues', CASE WHEN jsonb_typeof(p_rows) = 'array' THEN jsonb_array_length(p_rows) ELSE 0 END, 'creees', 0);
  END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme (rien écrit).
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_beebs_historique'), 0) = 1;
  v_comptes := ARRAY[v_user] || coalesce((SELECT array_agg(CASE WHEN l.user_a = v_user THEN l.user_b ELSE l.user_a END)
                                            FROM comptes_lies l WHERE v_user IN (l.user_a, l.user_b)), '{}'::uuid[]);

  -- Ce que dit la lecture (mesure seule) : forme, voie, taille de la liste, marqueurs de pagination trouvés.
  IF jsonb_typeof(p_lecture) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(k, (p_lecture ->> k)::int), '{}'::jsonb) INTO v_lecture
      FROM unnest(ARRAY['requetes', 'liste_total', 'incompletes', 'lignes', 'paquet', 'paquets']) k
     WHERE coalesce(p_lecture ->> k, '') ~ '^[0-9]{1,6}$';
    v_lecture := v_lecture || jsonb_strip_nulls(jsonb_build_object(
      'forme', CASE WHEN p_lecture ->> 'forme' IN ('document', 'rsc') THEN p_lecture ->> 'forme' END,
      'voie', CASE WHEN p_lecture ->> 'voie' IN ('disparition', 'entretien', 'messagerie') THEN p_lecture ->> 'voie' END,
      'marqueurs_pagination', CASE WHEN jsonb_typeof(p_lecture -> 'marqueurs_pagination') = 'array'
        THEN (SELECT jsonb_agg(left(x, 60)) FROM (SELECT x FROM jsonb_array_elements_text(p_lecture -> 'marqueurs_pagination') x LIMIT 20) s) END));
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rows) = 'array' THEN p_rows ELSE '[]'::jsonb END) LIMIT 200 LOOP
    c_recues := c_recues + 1;
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN c_forme := c_forme + 1; CONTINUE; END IF;
    v_ref := btrim(coalesce(v_row ->> 'ref', ''));
    IF v_ref !~ '^[A-Za-z0-9_-]{1,80}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;
    v_statut := upper(left(btrim(coalesce(v_row ->> 'statut', '')), 60));
    v_date := public._ts_ou_null(v_row ->> 'date');
    v_cmd := jsonb_strip_nulls(jsonb_build_object('ref', v_ref, 'statut', v_statut, 'date', v_date));
    -- Une commande annulée n'est jamais une vente ; une commande pas encore TERMINÉE est relue à une lecture suivante.
    IF public.beebs_commande_classe(v_statut) = 'annulee' THEN
      c_annulees := c_annulees + 1;
      IF jsonb_array_length(v_detail) < 20 THEN v_detail := v_detail || jsonb_build_array(v_cmd || '{"verdict":"annulee"}'::jsonb); END IF;
      CONTINUE;
    END IF;
    IF NOT (v_statut LIKE 'SELLER_PAID%' OR v_statut = 'APPROVED_BY_BUYER') THEN
      c_en_cours := c_en_cours + 1; v_a_relire := v_a_relire || v_ref;
      IF jsonb_array_length(v_detail) < 20 THEN v_detail := v_detail || jsonb_build_array(v_cmd || '{"verdict":"en_cours"}'::jsonb); END IF;
      CONTINUE;
    END IF;
    -- La date de la COMMANDE est obligatoire (une vente sans date échapperait à la garde des notes) ; 48 h au moins.
    IF v_date IS NULL THEN c_date := c_date + 1; v_a_relire := v_a_relire || v_ref; CONTINUE; END IF;
    IF v_date > now() - interval '48 hours' THEN
      c_recente := c_recente + 1; v_a_relire := v_a_relire || v_ref;
      IF jsonb_array_length(v_detail) < 20 THEN v_detail := v_detail || jsonb_build_array(v_cmd || '{"verdict":"trop_recente"}'::jsonb); END IF;
      CONTINUE;
    END IF;
    -- Les produits : numéros EXACTS (6 chiffres au moins), 10 au plus, sans doublon, dans l'ordre de la commande.
    SELECT coalesce(array_agg(s.x ORDER BY s.o), '{}'::text[]) INTO v_ids
      FROM (SELECT btrim(e.p ->> 'id') AS x, min(e.o) AS o
              FROM (SELECT p, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_row -> 'produits') = 'array' THEN v_row -> 'produits' ELSE '[]'::jsonb END)
                      WITH ORDINALITY t(p, o) ORDER BY o LIMIT 10) e
             WHERE jsonb_typeof(e.p) = 'object' AND btrim(coalesce(e.p ->> 'id', '')) ~ '^[0-9]{6,}$'
             GROUP BY btrim(e.p ->> 'id')) s;
    v_n := coalesce(array_length(v_ids, 1), 0);
    IF v_n = 0 THEN c_forme := c_forme + 1; CONTINUE; END IF;
    SELECT coalesce(jsonb_object_agg(btrim(p ->> 'id'), p ->> 'prix') FILTER (WHERE p ->> 'prix' IS NOT NULL), '{}'::jsonb),
           coalesce(jsonb_object_agg(btrim(p ->> 'id'), left(btrim(p ->> 'titre'), 200)) FILTER (WHERE nullif(btrim(coalesce(p ->> 'titre', '')), '') IS NOT NULL), '{}'::jsonb)
      INTO v_prix_p, v_titres
      FROM jsonb_array_elements(v_row -> 'produits') p WHERE jsonb_typeof(p) = 'object' AND btrim(coalesce(p ->> 'id', '')) = ANY (v_ids);
    -- Le prix, jamais deviné : l'unité du montant et des prix des produits doit être prouvée par le total (euros).
    v_devise := nullif(left(upper(btrim(coalesce(v_row ->> 'devise', ''))), 8), '');
    v_montant := public._prix_ou_null(v_row ->> 'montant');
    v_total := public._prix_ou_null(v_row ->> 'total');
    SELECT sum(public._prix_ou_null(v)) INTO v_somme FROM jsonb_each_text(v_prix_p) e(k, v);
    v_unite_ok := (v_devise IS NULL OR v_devise = 'EUR') AND v_total IS NOT NULL
                  AND (v_montant IS NULL OR v_montant <= v_total * 1.5) AND (v_somme IS NULL OR v_somme <= v_total * 1.5);
    v_prix := CASE WHEN v_unite_ok THEN public.beebs_commande_prix(v_ids, v_montant, v_prix_p, v_devise) ELSE '{}'::jsonb END;
    v_plus_ancienne := least(v_plus_ancienne, v_date); v_plus_recente := greatest(v_plus_recente, v_date);
    v_cmd := v_cmd || jsonb_build_object('produits', '[]'::jsonb);

    FOREACH v_id IN ARRAY v_ids LOOP
      c_produits := c_produits + 1;
      v_cle := CASE WHEN v_n = 1 THEN v_ref ELSE v_ref || ':' || v_id END;
      v_titre := v_titres ->> v_id;
      v_prix_v := public._prix_ou_null(v_prix #>> ARRAY[v_id, 'prix']);
      v_inv := NULL; v_adopte := NULL; v_verdict := NULL;
      IF EXISTS (SELECT 1 FROM ventes w WHERE w.plateforme_code = 'beebs' AND w.user_id <> v_user AND w.user_id = ANY (v_comptes)
                    AND split_part(w.commande_ref, ':', 1) = v_ref) THEN
        c_autre := c_autre + 1; v_verdict := 'autre_compte';
      ELSIF EXISTS (SELECT 1 FROM ventes_supprimees s WHERE s.user_id = v_user AND s.plateforme_code = 'beebs'
                       AND (s.commande_ref IN (v_ref, v_cle) OR (s.commande_ref IS NULL AND s.annonce_id = v_id))) THEN
        c_supprimee := c_supprimee + 1; v_verdict := 'supprimee';
      ELSIF EXISTS (SELECT 1 FROM ventes w WHERE w.user_id = ANY (v_comptes) AND w.plateforme_code = 'beebs'
                       AND (w.commande_ref IN (v_ref, v_cle) OR w.annonce_id = v_id))
         -- Le reçu du POINT FINAL (enregistrer_vente_atomique) pour ce numéro : la cession est déjà enregistrée, jamais une 2e.
         OR EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = ANY (v_comptes) AND o.cle = 'annonce:beebs:' || v_id) THEN
        c_deja := c_deja + 1; v_verdict := 'deja';
      ELSIF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = ANY (v_comptes) AND j.platform = 'beebs'
                       AND coalesce(j.action, 'publish') IN ('publish', 'republish')
                       AND btrim(coalesce(j.platform_listing_id, '')) = v_id
                       AND least(j.created_at, coalesce(j.published_at, j.created_at)) <= v_date) THEN
        -- Le domaine du circuit vivant (commandes_beebs_noter) : jamais une seconde vente ici.
        c_suivie := c_suivie + 1; v_verdict := 'suivie';
      ELSE
        -- La fiche, par le NUMÉRO EXACT seulement (ce compte) : une seule, déjà vendue, sans vente Beebs, sans retrait en attente.
        SELECT array_agg(DISTINCT x.inv) INTO v_fiches FROM (
          SELECT ap.inventaire_id AS inv FROM annonces_plateforme ap
           WHERE ap.user_id = v_user AND ap.platform = 'beebs' AND ap.listing_id = v_id AND ap.inventaire_id IS NOT NULL
          UNION
          SELECT j.inventaire_id FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = 'beebs' AND btrim(coalesce(j.platform_listing_id, '')) = v_id AND j.inventaire_id IS NOT NULL) x;
        IF coalesce(array_length(v_fiches, 1), 0) > 1 THEN
          c_fiche_doute := c_fiche_doute + 1;
        ELSIF coalesce(array_length(v_fiches, 1), 0) = 1 THEN
          SELECT i.statut, coalesce(i.quantite, 1) INTO v_statut_fiche, v_quantite FROM inventaire i
           WHERE i.id = v_fiches[1] AND i.user_id = v_user AND i.fusionne_dans IS NULL;
          IF v_statut_fiche = 'vendu'
             AND NOT EXISTS (SELECT 1 FROM ventes w WHERE w.user_id = v_user AND w.inventaire_id = v_fiches[1]
                               AND (w.plateforme_code = 'beebs' AND w.commande_ref IS NOT NULL))
             AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d WHERE d.user_id = v_user AND d.inventaire_id = v_fiches[1]
                               AND d.action = 'delete' AND d.status IN ('pending', 'processing', 'needs_user')) THEN
            v_inv := v_fiches[1];
            -- La même cession : UNE vente saisie Beebs (ou sans plateforme) sans commande, fiche à pièce unique.
            IF v_quantite <= 1 AND (SELECT count(*) FROM ventes w WHERE w.user_id = v_user AND w.inventaire_id = v_inv
                                       AND w.commande_ref IS NULL
                                       AND coalesce(plateforme_normalisee(coalesce(w.plateforme_code, w.plateforme)), 'beebs') = 'beebs') = 1
               AND NOT EXISTS (SELECT 1 FROM ventes w WHERE w.user_id = v_user AND w.inventaire_id = v_inv AND w.commande_ref IS NOT NULL) THEN
              SELECT w.id INTO v_adopte FROM ventes w WHERE w.user_id = v_user AND w.inventaire_id = v_inv AND w.commande_ref IS NULL
                 AND coalesce(plateforme_normalisee(coalesce(w.plateforme_code, w.plateforme)), 'beebs') = 'beebs' LIMIT 1;
            END IF;
          ELSIF v_statut_fiche = 'stock' THEN
            c_fiche_stock := c_fiche_stock + 1;
          END IF;
        END IF;
        IF v_inv IS NULL THEN c_sans_fiche := c_sans_fiche + 1; ELSE c_fiche_liee := c_fiche_liee + 1; END IF;
        IF v_prix_v IS NOT NULL THEN c_prix_lus := c_prix_lus + 1; v_montant_total := v_montant_total + v_prix_v;
        ELSE c_prix_inconnus := c_prix_inconnus + 1; END IF;

        v_pa := NULL; v_pai := NULL; v_pc := 0; v_benef := NULL;
        IF v_inv IS NOT NULL THEN
          SELECT i.prix_achat, i.prix_achat_inconnu, coalesce(i.purchase_costs, 0) INTO v_pa, v_pai, v_pc FROM inventaire i WHERE i.id = v_inv;
          IF coalesce(v_pai, false) THEN v_pa := NULL; END IF;
          IF v_pa IS NOT NULL AND v_prix_v IS NOT NULL THEN v_benef := v_prix_v - v_pa - v_pc; END IF;
        END IF;

        IF NOT v_ecrit THEN
          c_aurait := c_aurait + 1; v_verdict := CASE WHEN v_adopte IS NOT NULL THEN 'aurait_complete' ELSE 'aurait_cree' END;
        ELSIF v_adopte IS NOT NULL THEN
          -- Ce que la personne a saisi prime : seules les cases vides sont remplies.
          UPDATE ventes v SET
            commande_ref = v_cle, plateforme_code = 'beebs', plateforme = coalesce(v.plateforme, 'beebs'),
            vendu_le = coalesce(v.vendu_le, v_date), date = coalesce(v.date, (v_date AT TIME ZONE 'Europe/Paris')::date),
            prix_vente = coalesce(v.prix_vente, v_prix_v), prix_achat = coalesce(v.prix_achat, v_pa),
            benefice = coalesce(v.benefice, CASE WHEN coalesce(v.prix_vente, v_prix_v) IS NOT NULL AND coalesce(v.prix_achat, v_pa) IS NOT NULL
                                                 THEN coalesce(v.prix_vente, v_prix_v) - coalesce(v.prix_achat, v_pa) - v_pc END),
            titre = coalesce(nullif(btrim(v.titre), ''), v_titre), annonce_id = coalesce(v.annonce_id, v_id), releve_le = now()
          WHERE v.id = v_adopte AND v.commande_ref IS NULL;
          c_completees := c_completees + 1; v_verdict := 'completee';
        ELSE
          v_vente := NULL;
          INSERT INTO ventes (user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le, plateforme, plateforme_code,
                              plateforme_origine, commande_ref, source, releve_le, devise, frais_plateforme, selling_fees,
                              inventaire_id, quantite, statut, annonce_id)
          VALUES (v_user, v_titre, v_prix_v, v_pa, v_benef, (v_date AT TIME ZONE 'Europe/Paris')::date, v_date, 'beebs', 'beebs',
                  NULL, v_cle, 'releve', now(), coalesce(v_devise, 'EUR'), NULL, 0, v_inv, 1, 'vendu', v_id)
          ON CONFLICT (user_id, plateforme_code, commande_ref) WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
          DO NOTHING
          RETURNING id INTO v_vente;
          IF v_vente IS NOT NULL THEN c_creees := c_creees + 1; v_verdict := 'creee';
          ELSE c_deja := c_deja + 1; v_verdict := 'deja'; END IF;
          -- Le prix d'une fiche DÉJÀ vendue, vide, est complété (comme enregistrer_ventes_relevees) ; rien d'autre.
          IF v_vente IS NOT NULL AND v_inv IS NOT NULL AND v_prix_v IS NOT NULL THEN
            UPDATE inventaire i SET prix_vente = v_prix_v WHERE i.id = v_inv AND i.statut = 'vendu' AND i.prix_vente IS NULL;
          END IF;
        END IF;
      END IF;
      v_cmd := jsonb_set(v_cmd, '{produits}', (v_cmd -> 'produits') || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                 'id', v_id, 'verdict', v_verdict, 'fiche', v_inv::text, 'prix', v_prix_v))));
    END LOOP;
    IF jsonb_array_length(v_detail) < 20 THEN v_detail := v_detail || jsonb_build_array(v_cmd); END IF;
  END LOOP;

  v_bilan := jsonb_build_object('mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
    'recues', c_recues, 'produits', c_produits, 'creees', c_creees, 'aurait_ecrit', c_aurait, 'completees', c_completees,
    'deja', c_deja, 'suivie', c_suivie, 'supprimee', c_supprimee, 'autre_compte', c_autre, 'trop_recente', c_recente,
    'en_cours', c_en_cours, 'annulees', c_annulees, 'date_inconnue', c_date, 'forme_inconnue', c_forme,
    'sans_fiche', c_sans_fiche, 'fiche_liee', c_fiche_liee, 'fiche_en_stock', c_fiche_stock, 'fiche_doute', c_fiche_doute,
    'prix_lus', c_prix_lus, 'prix_inconnus', c_prix_inconnus, 'montant_total', round(v_montant_total, 2),
    'a_relire', to_jsonb(v_a_relire[1:200])) || v_lecture
    || jsonb_strip_nulls(jsonb_build_object('plus_ancienne', v_plus_ancienne, 'plus_recente', v_plus_recente));
  SELECT p.extension_build INTO v_build FROM profiles p WHERE p.id = v_user;
  IF v_build IS NOT NULL THEN v_bilan := v_bilan || jsonb_build_object('build', left(v_build, 60)); END IF;
  IF c_recues > 0 OR NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v_user AND u.feature = 'ventes_beebs_historique'
                                    AND u.created_at > now() - interval '6 hours') THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (v_user, 'ventes_beebs_historique', v_bilan || CASE WHEN jsonb_array_length(v_detail) > 0 THEN jsonb_build_object('commandes', v_detail) ELSE '{}'::jsonb END);
  END IF;
  RETURN v_bilan;
END;
$function$;

REVOKE ALL ON FUNCTION public.ventes_beebs_historique_noter(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventes_beebs_historique_noter(jsonb, jsonb) TO authenticated, service_role;
