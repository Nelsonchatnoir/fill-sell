-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113140000_ventes_beebs_cinq_gardes — VENTES BEEBS LUES SUR LA PAGE DES VENTES : LES MANQUES DE LA RÈGLE (13/11)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Point 3b de Nico (12/11) : « interrupteur ventes_beebs_commandes LAISSÉ À 0. Tu construis les 5 manques (garde d'âge de la
-- commande, annulation défaite, prix lu, comptes reliés, lecture sans 403 via la 0.6.187) ; on rallume ensemble quand c'est
-- prouvé. » Les quatre premiers sont ici (base) ; le cinquième est dans l'extension (chrome-extension/messagerie.js,
-- background.js — 0.6.187). ⛔ L'interrupteur n'est PAS touché : il reste à 0 (fantôme, bilan seul).
--
-- CAUSES PROUVÉES (définition de PROD de commandes_beebs_noter, pg_get_functiondef lu le 13/11 vers 01:20, md5
-- aa1ff957b15a5eff43f49a54d39e66b3 ; audit du 12/11, bloc 3b) :
--   1. AUCUNE GARDE D'ÂGE : une commande « vente » est rattachée à la tâche publiée du même numéro sans comparer sa date au
--      début du suivi de cette tâche. Une commande de 2023-2025 (relue à chaque lecture : la page porte les 10 dernières)
--      sur une annonce importée par un relevé en 2026 deviendrait une vente (fiche vendue, copies retirées).
--   2. UNE ANNULATION APRÈS L'ENREGISTREMENT N'EST JAMAIS DÉFAITE (« Déjà enregistrée comme vente : rien n'est défait ici
--      (comptée, à décider) ») alors que Vinted et Leboncoin défont la vente.
--   3. LE PRIX DE LA COMMANDE N'EST PAS LU : la vente prend le prix affiché de la tâche ; une offre acceptée ou un lot
--      remisé serait enregistré au prix d'annonce, chaque produit.
--   4. COMPTES RELIÉS : le rattachement se fait par le compte qui LIT seul. Deux comptes reliés (comptes_lies, même
--      personne) qui suivent la même annonce Beebs d'une boutique partagée auraient chacun la preuve (deux ventes d'une
--      commande) ; une annonce suivie par le seul compte relié n'aurait jamais la sienne.
--   + (vérifié, gardé) mail et notification de vente seulement pour une commande de moins de 24 h (push_trg_job lit
--     unavailable_since) : la date écrite était coalesce(date déjà posée, date de la commande) — une disparition vue
--     aujourd'hui sur une commande de trois jours faisait partir un mail. C'est désormais la date de la COMMANDE.
--
-- CE QUI CHANGE (rien d'autre) :
--   · commandes_beebs_noter (réécrite DEPUIS la définition de prod, mêmes gardes, mêmes compteurs, même interrupteur
--     fail-closed, même détail du bilan) :
--       1. le suivi d'une annonce commence à la création de SA tâche (dépôt FillSell, ou import par un relevé :
--          least(created_at, published_at)) ; une commande antérieure → verdict « avant_suivi », rien écrit ; une date de
--          commande illisible → « date_inconnue », rien écrit (jamais une date inventée) ;
--       2. CANCELLED sur une commande déjà enregistrée comme vente (tâche « sold », preuve commande_beebs de CE numéro de
--          commande) → vente_commande_annulee_beebs (neuve, ci-dessous) pour chaque vente de son reçu ;
--       3. le prix lu sur la commande (montant de la commande, prix de chaque produit, devise : extension 0.6.187) →
--          beebs_commande_prix (neuve) → `detected_price` (que ventes_prouvees_a_enregistrer et prix_vente_du_job lisent
--          déjà en premier) et sale_evidence.prix / prix_source ; aucun prix lu → le prix de la tâche, comme avant ;
--       4. les tâches de ce compte ET de ses comptes reliés : une commande, un compte — celui qui porte le numéro exact ;
--          deux comptes qui le portent → celui qui l'a DÉPOSÉE (jamais un import, annonce_importee) ; sinon « doute »,
--          rien écrit ; une preuve déjà posée chez l'un → « deja_prouvee » pour tous ;
--       + unavailable_since = la date de la commande ; p_lecture accepte « forme » (document | rsc) et « voie »
--         (disparition | entretien | messagerie), rangées dans le bilan ; bilan : avant_suivi, date_inconnue,
--         compte_relie, ventes_defaites (en plus des compteurs d'avant, inchangés).
--   · vente_commande_annulee_beebs (NEUVE) : le modèle exact de vente_transaction_annulee_leboncoin (prod, md5 1fc2fd38…) :
--     interrupteur ventes_annulees_retrait_pause et liste d'attente respectés ; vente SAISIE jamais retirée (signalée une
--     fois) ; vente retirée et tracée (ventes_supprimees, usage_logs vente_retiree avec les reçus) ; fiche rendue au stock
--     (pièce unique) ou exemplaire rendu (plusieurs) ; retraits armés par CETTE vente : en file → arrêtés, faits →
--     remise en vente PROPOSÉE (jamais automatique) ; la tâche Beebs redevient « publiée », preuve rangée dans
--     vente_annulee, l'annonce à relire par la veille (Beebs remet-il le produit en vente ? non prouvé : la veille tranche,
--     une disparition seule ne vaut jamais vente). Aucun mail. Droits : postgres et service_role seulement.
--   · beebs_commande_prix (NEUVE, pure) : un produit → le montant de la commande (sinon son prix) ; plusieurs → le prix de
--     chacun quand leur somme EST le montant (ou sans montant), sinon le montant au prorata de leurs prix, à parts égales
--     si un prix manque, centimes au plus grand reste (somme = montant : règle des lots Vinted du 01/11) ; une devise
--     autre que l'euro → aucun prix (prépare le terrain : la monnaie du compte Beebs n'est pas encore stockée).
-- INCHANGÉS : beebs_commande_classe, signal_vente_lever, ventes_prouvees_a_enregistrer, ventes_prouvees_tick,
--   enregistrer_vente_prouvee, enregistrer_vente_atomique, push_trg_job, l'interrupteur ventes_beebs_commandes (0).
-- Fonction réécrite depuis pg_get_functiondef EN PROD (lu le 13/11/2026 vers 01:20, lecture seule) ; SECURITY DEFINER,
-- search_path, statement_timeout, propriétaire et droits EXECUTE de commandes_beebs_noter inchangés (CREATE OR REPLACE).
-- Banc sur base jetable : scripts/essais/20261113140000_banc.mjs (fixture prod-1311-ventes-beebs). Verrou :
-- scripts/ventes-beebs-cinq-gardes-selftest.mjs. Sauvegarde : scripts/reparations/20261113_ventes_beebs_cinq_gardes_SAUVEGARDE.sql
-- (à jouer AVANT). Inverse : supabase/rollbacks/20261113140000_ventes_beebs_cinq_gardes_INVERSE.sql.
-- ⛔ NON APPLIQUÉE : feu vert explicite de Nico, puis
--    npx supabase db query --linked -f supabase/migrations/20261113140000_ventes_beebs_cinq_gardes.sql
--    npx supabase migration repair --linked --status applied 20261113140000
BEGIN;

DO $garde$
DECLARE v text;
BEGIN
  SELECT replace(pg_get_functiondef('public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure), chr(13), '') INTO v;
  -- Rejouée : le corps porte déjà la règle du 13/11 (rien ne change). Sinon : la définition de prod lue le 13/11, seule.
  IF v NOT LIKE '%c_avant_suivi%' AND md5(v) <> 'aa1ff957b15a5eff43f49a54d39e66b3' THEN
    RAISE EXCEPTION 'commandes_beebs_noter a changé en prod depuis sa lecture du 13/11 : régénérer 20261113140000 depuis pg_get_functiondef';
  END IF;
  IF to_regprocedure('public.signal_vente_lever(uuid,text,jsonb)') IS NULL OR to_regprocedure('public.annonce_importee(uuid)') IS NULL
     OR to_regprocedure('public._prix_ou_null(text)') IS NULL OR to_regprocedure('public.beebs_commande_classe(text)') IS NULL
     OR to_regclass('public.comptes_lies') IS NULL OR to_regclass('public.ventes_annulees_attente_go') IS NULL
     OR to_regclass('public.inventaire_journal') IS NULL OR to_regclass('public.remises_en_vente') IS NULL THEN
    RAISE EXCEPTION 'une fonction ou une table lue par 20261113140000 manque en prod';
  END IF;
END
$garde$;

SET LOCAL lock_timeout = '5s';

-- ── 3. Le prix lu sur la commande, réparti par produit (pure) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.beebs_commande_prix(p_produits text[], p_montant numeric, p_prix jsonb, p_devise text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n int := coalesce(array_length(p_produits, 1), 0);
  v_montant numeric := p_montant;
  v_p numeric[] := '{}'; v_tous boolean := true; v_somme numeric := 0; i int; k int;
  v_total bigint; v_base bigint[] := '{}'; v_frac numeric[] := '{}'; v_reste bigint; v_exact numeric;
  v_out jsonb := '{}'::jsonb; v_src text;
BEGIN
  IF v_n = 0 THEN RETURN v_out; END IF;
  -- Une autre monnaie que l'euro (celle des prix des tâches aujourd'hui) : aucun prix de la commande n'est pris.
  IF nullif(btrim(coalesce(p_devise, '')), '') IS NOT NULL AND upper(btrim(p_devise)) <> 'EUR' THEN RETURN v_out; END IF;
  IF v_montant IS NOT NULL AND (v_montant <= 0 OR v_montant > 1000000) THEN v_montant := NULL; END IF;
  FOR i IN 1..v_n LOOP
    v_p := v_p || public._prix_ou_null(CASE WHEN jsonb_typeof(p_prix) = 'object' THEN p_prix ->> p_produits[i] END);
    IF v_p[i] IS NULL OR v_p[i] > 1000000 THEN v_p[i] := NULL; v_tous := false; ELSE v_somme := v_somme + v_p[i]; END IF;
  END LOOP;
  IF v_n = 1 THEN
    IF v_montant IS NOT NULL THEN RETURN jsonb_build_object(p_produits[1], jsonb_build_object('prix', v_montant, 'source', 'commande')); END IF;
    IF v_p[1] IS NOT NULL THEN RETURN jsonb_build_object(p_produits[1], jsonb_build_object('prix', v_p[1], 'source', 'produit')); END IF;
    RETURN v_out;
  END IF;
  IF v_montant IS NULL OR (v_tous AND abs(v_somme - v_montant) <= 0.01) THEN
    -- Le prix de chaque produit : sans montant de commande, ou quand leur somme EST le montant.
    FOR i IN 1..v_n LOOP
      IF v_p[i] IS NOT NULL THEN
        v_out := v_out || jsonb_build_object(p_produits[i], jsonb_build_object('prix', v_p[i], 'source', 'produit'));
      END IF;
    END LOOP;
    RETURN v_out;
  END IF;
  -- Le montant de la commande réparti au centime : au prorata des prix des produits (tous lus), sinon à parts égales ;
  -- les centimes restants au plus grand reste (à égalité, dans l'ordre de la commande) : la somme vaut le montant.
  v_total := round(v_montant * 100)::bigint;
  v_src := CASE WHEN v_tous THEN 'prorata' ELSE 'parts_egales' END;
  FOR i IN 1..v_n LOOP
    v_exact := CASE WHEN v_tous THEN v_total * v_p[i] / v_somme ELSE v_total::numeric / v_n END;
    v_base := v_base || floor(v_exact)::bigint;
    v_frac := v_frac || (v_exact - floor(v_exact));
  END LOOP;
  v_reste := v_total - (SELECT sum(x) FROM unnest(v_base) x);
  FOR k IN SELECT t.o FROM unnest(v_frac) WITH ORDINALITY t(f, o) ORDER BY t.f DESC, t.o LIMIT greatest(v_reste, 0) LOOP
    v_base[k] := v_base[k] + 1;
  END LOOP;
  FOR i IN 1..v_n LOOP
    v_out := v_out || jsonb_build_object(p_produits[i], jsonb_build_object('prix', round(v_base[i] / 100.0, 2), 'source', v_src));
  END LOOP;
  RETURN v_out;
END;
$function$;
REVOKE ALL ON FUNCTION public.beebs_commande_prix(text[], numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beebs_commande_prix(text[], numeric, jsonb, text) TO service_role;

-- ── 2. Une commande Beebs annulée APRÈS l'enregistrement de sa vente : la vente est défaite ─────────────────────────
-- Le modèle : vente_transaction_annulee_leboncoin (prod, lu le 13/11), à l'identique hors de la preuve (la page des ventes
-- Beebs : tâche « sold » de CE numéro, preuve commande_beebs de CETTE commande) et du sort de la tâche Beebs (« publiée »,
-- annonce à relire — Leboncoin, elle, avait été relue en ligne).
CREATE OR REPLACE FUNCTION public.vente_commande_annulee_beebs(p_vente bigint, p_commande text, p_statut text DEFAULT 'CANCELLED'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_rendue text := NULL; v_recus jsonb := NULL; v_q integer; v_cle text; v_motif text; v_commande text;
  v_copie record; v_copies integer := 0; v_arretes integer := 0; v_en_cours integer := 0;
  v_ms bigint; v_hist bigint; v_hist_ligne jsonb; v_rv remises_en_vente%ROWTYPE; v_remise_avant jsonb;
  v_depot_avant jsonb; v_remise_arretee text := NULL;
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  v_commande := nullif(btrim(coalesce(p_commande, '')), '');
  IF v.plateforme_code IS DISTINCT FROM 'beebs' OR v.annonce_id IS NULL OR v_commande IS NULL THEN
    RETURN jsonb_build_object('action', 'hors_sujet');
  END IF;
  -- Mêmes interrupteur et liste d'attente que les commandes annulées des autres plateformes (09/10, 17/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  v_motif := left('commande_' || lower(coalesce(nullif(btrim(p_statut), ''), 'cancelled')), 60);
  -- La preuve : l'annonce Beebs close « vendue » sur CE numéro PAR CETTE commande (page des ventes de Beebs).
  SELECT * INTO j FROM cross_post_jobs c
   WHERE c.user_id = v.user_id AND c.platform = 'beebs' AND c.status = 'sold'
     AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     AND c.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
     AND c.platform_fields #>> '{sale_evidence,commande}' = v_commande
   ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  v_cle := coalesce(nullif(j.platform_fields ->> 'vente_operation_cle', ''), 'annonce:beebs:' || v.annonce_id);
  -- Une vente SAISIE (ou née d'un autre chemin) n'est jamais retirée : signalée une fois.
  IF j.id IS NULL OR NOT EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = v.user_id
                                   AND o.cle = v_cle AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v.id])) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_beebs_commande_annulee'
                    AND u.metadata ->> 'vente' = v.id::text AND u.metadata ->> 'issue' = 'annulation_vente_saisie_signalee') THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_beebs_commande_annulee',
        jsonb_build_object('vente', v.id::text, 'annonce', v.annonce_id, 'commande', v_commande, 'statut', p_statut,
          'titre', v.titre, 'prix_vente', v.prix_vente, 'issue', 'annulation_vente_saisie_signalee'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'beebs', coalesce(v.commande_ref, v_commande), v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'commande_beebs', v_motif);
  SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = v_cle;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'statut', p_statut, 'commande', v_commande, 'source', 'commande_beebs',
                       'motif', v_motif, 'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = v_cle;

  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'commande_annulee', traite_le = now()
       WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
      -- La fiche d'abord : son déclencheur (inventaire_vente_annulee_retraits) arrête les retraits encore en file depuis
      -- la date de la vente, lue sur la tâche « vendu ».
      UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
      v_rendue := 'fiche';
      -- Les retraits armés par CETTE vente (même instant, ± 2 min) :
      --   · encore en file (pending / needs_user) → arrêtés : rien n'a été retiré ;
      --   · déjà faits (deleted), dépôt clos → remise en vente PROPOSÉE (carte « Vente annulée — Remettre en vente ? ») ;
      --   · en cours chez l'extension (processing) → comptés, rien d'autre.
      FOR v_copie IN
        SELECT d.id AS retrait, d.status, d.platform, p.id AS depot, p.status AS depot_statut
          FROM cross_post_jobs d
          LEFT JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
         WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete'
           AND d.platform <> 'beebs'
           AND d.platform_fields #>> '{arme_par,chemin}' IN ('vente_article_serveur', 'vente_copie_prouvee')
           AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
         ORDER BY d.platform
      LOOP
        IF v_copie.status IN ('pending', 'needs_user') THEN
          UPDATE cross_post_jobs SET status = 'cancelled',
                 error = 'Commande Beebs annulée : l''article est revenu dans ton stock, cette annonce reste en ligne.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'source', 'commande_beebs',
                                                                             'commande', v_commande))
           WHERE id = v_copie.retrait AND status IN ('pending', 'needs_user');
          IF FOUND THEN v_arretes := v_arretes + 1; END IF;
        ELSIF v_copie.status = 'deleted' AND v_copie.depot IS NOT NULL AND v_copie.depot_statut = 'cancelled' THEN
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'source', 'commande_beebs',
                                                                                  'commande', v_commande, 'le', now()))
           WHERE id = v_copie.depot;
          -- PROPOSÉE, jamais automatique (décision de Nico du 24/10 soir) : la carte la fait partir d'un appui.
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
        (v.user_id, i.id, 'statut', i.statut, 'stock', 'commande_beebs', v_motif,
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'commande', v_commande, 'retraits_arretes', v_arretes,
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours));
    -- PLUSIEURS EXEMPLAIRES (règle de Nico du 05/11) : la fiche est restée au stock. L'annulation rend l'exemplaire (+1)
    -- et efface sa copie « vendu » (créée par enregistrer_vente_atomique au même instant, sans lien) ; la remise en vente
    -- de CETTE annonce pas encore servie s'arrête. L'état d'avant part dans inventaire_journal.detail.
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
                 error = 'Commande Beebs annulée : l''annonce d''origine est revenue, cette remise en vente est arrêtée.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('remise_arretee', jsonb_build_object('le', now(), 'vente', v.id,
                        'source', 'commande_beebs', 'commande', v_commande, 'job_vendu', j.id, 'avant', v_depot_avant))
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
        (v.user_id, i.id, 'quantite', i.quantite::text, (coalesce(i.quantite, 0) + v_q)::text, 'commande_beebs', v_motif,
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'commande', v_commande, 'copie_effacee', v_hist_ligne,
                            'remise_arretee', v_remise_arretee,
                            'avant', jsonb_build_object('quantite', i.quantite, 'remise', v_remise_avant, 'depot', v_depot_avant)));
    END IF;
  END IF;
  -- La tâche Beebs redevient « publiée », à relire : Beebs remet-il le produit en vente après une commande annulée ? Non
  -- prouvé — la veille relit sa page ; une disparition seule ne vaut jamais vente. La preuve part dans vente_annulee.
  UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
         platform_fields = (coalesce(platform_fields, '{}'::jsonb)
           - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle', 'sale_evidence'])
           || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'annonce', 'a_relire',
                                 'source', 'commande_beebs', 'commande', v_commande, 'statut', p_statut,
                                 'preuve', platform_fields -> 'sale_evidence'))
   WHERE id = j.id AND status = 'sold';
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'job', j.id, 'retraits_arretes', v_arretes,
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours,
                            'copie_effacee', v_hist, 'remise_arretee', v_remise_arretee);
END;
$function$;
REVOKE ALL ON FUNCTION public.vente_commande_annulee_beebs(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vente_commande_annulee_beebs(bigint, text, text) TO service_role;

-- ── 1, 2, 3, 4. La page des ventes Beebs ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commandes_beebs_noter(p_rows jsonb, p_user uuid DEFAULT NULL::uuid, p_lecture jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user uuid;
  v_ecrit boolean;
  v_row jsonb;
  v_ref text;
  v_statut text;
  v_classe text;
  v_date timestamptz;
  v_produits jsonb;
  v_id text;
  v_jobs uuid[];
  v_job uuid;
  v_pf jsonb;
  v_stock boolean;
  v_lecture jsonb := '{}'::jsonb;
  v_bilan jsonb;
  c_recues int := 0; c_prouvees int := 0; c_deja int := 0; c_doute int := 0; c_sans_job int := 0;
  c_forme int := 0; c_annulees int := 0; c_levees int := 0; c_annulee_apres int := 0; c_inconnu int := 0;
  c_fiche_vendue int := 0; c_produits int := 0;
  -- (24/10, feu vert 2 de Nico) Le détail de chaque commande, gardé dans le bilan, en fantôme comme en écrit.
  v_detail jsonb := '[]'::jsonb; v_cmd jsonb; v_verdict text; v_fiche bigint; v_titre text; v_build text;
  -- (13/11, 3b de Nico) Garde d'âge, annulation défaite, prix lu, comptes reliés.
  c_avant_suivi int := 0; c_date_inconnue int := 0; c_compte_relie int := 0; c_defaites int := 0;
  v_comptes uuid[]; v_proprio uuid; v_suivi timestamptz; v_cree timestamptz; v_publie timestamptz;
  v_ids text[]; v_prix jsonb; v_prix_v numeric; v_prix_src text; v_devise text;
  v_sold record; v_vente bigint; v_r jsonb; v_defaites jsonb; v_doute_relie boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme (rien écrit sur les jobs).
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_beebs_commandes'), 0) = 1;
  -- (13/11, comptes reliés) Les tâches de ce compte ET de ses comptes reliés (comptes_lies, même personne) : une boutique
  -- Beebs partagée montre la même commande aux deux ; elle appartient au compte dont la tâche porte le numéro EXACT.
  v_comptes := ARRAY[v_user] || coalesce((SELECT array_agg(CASE WHEN l.user_a = v_user THEN l.user_b ELSE l.user_a END)
                                            FROM comptes_lies l WHERE v_user IN (l.user_a, l.user_b)), '{}'::uuid[]);

  IF jsonb_typeof(p_lecture) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(k, (p_lecture ->> k)::int), '{}'::jsonb) INTO v_lecture
      FROM unnest(ARRAY['liens', 'illisibles', 'requetes']) k
     WHERE coalesce(p_lecture ->> k, '') ~ '^[0-9]{1,6}$';
    -- (13/11) Par où la page a été lue (document, ou flux RSC en filet) et pourquoi (disparition, entretien, messagerie).
    v_lecture := v_lecture || jsonb_strip_nulls(jsonb_build_object(
      'forme', CASE WHEN p_lecture ->> 'forme' IN ('document', 'rsc') THEN p_lecture ->> 'forme' END,
      'voie', CASE WHEN p_lecture ->> 'voie' IN ('disparition', 'entretien', 'messagerie') THEN p_lecture ->> 'voie' END));
  END IF;

  IF jsonb_typeof(p_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
      c_recues := c_recues + 1;
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        c_forme := c_forme + 1;
        v_detail := v_detail || jsonb_build_array(jsonb_build_object('classe', 'forme_inconnue', 'motif', 'pas_un_objet'));
        CONTINUE;
      END IF;
      v_ref := btrim(coalesce(v_row ->> 'ref', ''));
      IF v_ref !~ '^[A-Za-z0-9_-]{1,80}$' THEN
        c_forme := c_forme + 1;
        v_detail := v_detail || jsonb_build_array(jsonb_build_object('ref', left(v_ref, 80), 'classe', 'forme_inconnue', 'motif', 'numero_de_commande'));
        CONTINUE;
      END IF;
      v_statut := left(btrim(coalesce(v_row ->> 'statut', v_row ->> 'etat_plateforme', '')), 60);
      v_classe := public.beebs_commande_classe(v_statut);
      v_date := coalesce(_ts_ou_null(v_row ->> 'date'), _ts_ou_null(v_row ->> 'vendue_le'));
      v_produits := CASE WHEN jsonb_typeof(v_row -> 'produits') = 'array' THEN v_row -> 'produits'
                         WHEN nullif(btrim(coalesce(v_row ->> 'annonce_ref', '')), '') IS NOT NULL
                           THEN jsonb_build_array(v_row ->> 'annonce_ref')
                         ELSE '[]'::jsonb END;
      v_cmd := jsonb_strip_nulls(jsonb_build_object('ref', v_ref, 'statut', v_statut, 'classe', v_classe, 'date', v_date,
                 'produits', '[]'::jsonb));

      IF v_classe = 'annulee' THEN
        c_annulees := c_annulees + 1;
        -- La preuve posée par CETTE source pour CETTE commande est levée (job encore publié).
        FOR v_job IN SELECT j.id FROM cross_post_jobs j
                      WHERE j.user_id = ANY (v_comptes) AND j.platform = 'beebs' AND j.status = 'published'
                        AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
                        AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
          IF NOT v_ecrit THEN c_levees := c_levees + 1;
          ELSIF signal_vente_lever(v_job, 'commande_beebs_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
            c_levees := c_levees + 1;
          END IF;
        END LOOP;
        -- (13/11, 3b de Nico) Déjà enregistrée comme vente : la vente est DÉFAITE, comme Vinted et Leboncoin
        -- (vente_commande_annulee_beebs) — seulement la vente née de CETTE commande (tâche « sold », preuve commande_beebs
        -- de ce numéro, reçu de la vente) ; une vente saisie n'est jamais retirée. En fantôme : comptée, rien écrit.
        v_defaites := '[]'::jsonb;
        FOR v_sold IN SELECT j.id, j.user_id,
                             coalesce(nullif(j.platform_fields ->> 'vente_operation_cle', ''), 'annonce:beebs:' || btrim(coalesce(j.platform_listing_id, ''))) AS cle
                        FROM cross_post_jobs j
                       WHERE j.user_id = ANY (v_comptes) AND j.platform = 'beebs' AND j.status = 'sold'
                         AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
                         AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
          c_annulee_apres := c_annulee_apres + 1;
          FOR v_vente IN SELECT DISTINCT x::bigint FROM ventes_operations o
                                CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.resultat -> 'ventes_ids') = 'array'
                                                                                  THEN o.resultat -> 'ventes_ids' ELSE '[]'::jsonb END) x
                          WHERE o.user_id = v_sold.user_id AND o.cle = v_sold.cle AND x ~ '^[0-9]{1,18}$' LOOP
            IF v_ecrit THEN
              v_r := vente_commande_annulee_beebs(v_vente, v_ref, v_statut);
              IF v_r ->> 'action' = 'retiree' THEN c_defaites := c_defaites + 1; END IF;
            ELSE
              v_r := jsonb_build_object('action', 'aurait_defait');
            END IF;
            v_defaites := v_defaites || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('job', v_sold.id, 'vente', v_vente,
                            'issue', v_r ->> 'action', 'compte_relie', CASE WHEN v_sold.user_id <> v_user THEN true END)));
          END LOOP;
        END LOOP;
        v_detail := v_detail || jsonb_build_array(v_cmd || jsonb_build_object('produits', v_produits)
                      || CASE WHEN jsonb_array_length(v_defaites) > 0 THEN jsonb_build_object('ventes_defaites', v_defaites) ELSE '{}'::jsonb END);
        CONTINUE;
      END IF;
      IF v_classe <> 'vente' THEN
        c_inconnu := c_inconnu + 1;
        v_detail := v_detail || jsonb_build_array(v_cmd || jsonb_build_object('produits', v_produits));
        CONTINUE;
      END IF;

      -- (13/11, 3b de Nico) LE PRIX LU SUR LA COMMANDE (extension 0.6.187 : « montant », « prix_produits », « devise »),
      -- réparti par produit (beebs_commande_prix) ; rien de lu → le prix de la tâche, comme avant.
      SELECT coalesce(array_agg(s.x ORDER BY s.o), '{}'::text[]) INTO v_ids
        FROM (SELECT btrim(t.x) AS x, min(t.o) AS o
                FROM (SELECT x, o FROM jsonb_array_elements_text(v_produits) WITH ORDINALITY e(x, o) ORDER BY o LIMIT 10) t
               WHERE btrim(t.x) ~ '^[0-9]{6,}$' GROUP BY btrim(t.x)) s;
      v_devise := nullif(left(upper(btrim(coalesce(v_row ->> 'devise', ''))), 8), '');
      v_prix := public.beebs_commande_prix(v_ids, _prix_ou_null(v_row ->> 'montant'),
                  CASE WHEN jsonb_typeof(v_row -> 'prix_produits') = 'object' THEN v_row -> 'prix_produits' END, v_devise);

      FOR v_id IN SELECT btrim(x) FROM jsonb_array_elements_text(v_produits) x LIMIT 10 LOOP
        c_produits := c_produits + 1;
        v_verdict := NULL; v_job := NULL; v_fiche := NULL; v_titre := NULL;
        v_proprio := NULL; v_suivi := NULL; v_prix_v := NULL; v_prix_src := NULL; v_jobs := NULL; v_doute_relie := false;
        IF v_id !~ '^[0-9]{6,}$' THEN c_forme := c_forme + 1; v_verdict := 'forme_inconnue';
        ELSE
        v_prix_v := _prix_ou_null(v_prix #>> ARRAY[v_id, 'prix']);
        v_prix_src := CASE WHEN v_prix_v IS NOT NULL THEN v_prix #>> ARRAY[v_id, 'source'] END;
        -- Le job qui porte CE numéro, exactement — jamais un titre. (13/11) Chez ce compte et ses comptes reliés.
        SELECT array_agg(j.id ORDER BY j.id) INTO v_jobs FROM cross_post_jobs j
         WHERE j.user_id = ANY (v_comptes) AND j.platform = 'beebs' AND j.status = 'published'
           AND coalesce(j.action, 'publish') IN ('publish', 'republish')
           AND btrim(coalesce(j.platform_listing_id, '')) = v_id;
        IF coalesce(array_length(v_jobs, 1), 0) > 1
           AND (SELECT count(DISTINCT j.user_id) FROM cross_post_jobs j WHERE j.id = ANY (v_jobs)) > 1 THEN
          IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = ANY (v_jobs)
                      AND coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold'
                      AND j.platform_fields #>> '{sale_evidence,listing_id}' = v_id
                      AND j.platform_fields #>> '{sale_evidence,platform}' = 'beebs') THEN
            -- La preuve est déjà posée chez l'un des deux comptes : la commande est notée, jamais une seconde fois.
            v_jobs := (SELECT array_agg(j.id ORDER BY j.id) FROM cross_post_jobs j WHERE j.id = ANY (v_jobs)
                        AND coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold'
                        AND j.platform_fields #>> '{sale_evidence,listing_id}' = v_id
                        AND j.platform_fields #>> '{sale_evidence,platform}' = 'beebs' LIMIT 1);
          ELSE
            -- Deux comptes reliés suivent la même annonce : elle est au compte qui l'a DÉPOSÉE (jamais un import de
            -- relevé). Aucun dépôt, ou deux : un doute, rien n'est écrit.
            v_jobs := (SELECT array_agg(j.id ORDER BY j.id) FROM cross_post_jobs j WHERE j.id = ANY (v_jobs) AND NOT public.annonce_importee(j.id));
            v_doute_relie := coalesce(array_length(v_jobs, 1), 0) <> 1;
          END IF;
        END IF;
        IF v_doute_relie THEN c_doute := c_doute + 1; v_verdict := 'doute';
        ELSIF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
          -- Déjà vendue par un autre chemin (job « sold » au même numéro) : rien à faire.
          IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = ANY (v_comptes) AND j.platform = 'beebs'
                      AND j.status = 'sold' AND btrim(coalesce(j.platform_listing_id, '')) = v_id) THEN
            c_deja := c_deja + 1; v_verdict := 'deja_vendue';
          ELSE
            c_sans_job := c_sans_job + 1; v_verdict := 'sans_job';
          END IF;
        ELSIF array_length(v_jobs, 1) > 1 THEN c_doute := c_doute + 1; v_verdict := 'doute';
        ELSE
        v_job := v_jobs[1];
        SELECT j.platform_fields, (i.id IS NOT NULL AND i.statut = 'stock' AND i.fusionne_dans IS NULL), j.inventaire_id, left(j.title, 80),
               j.user_id, j.created_at, j.published_at
          INTO v_pf, v_stock, v_fiche, v_titre, v_proprio, v_cree, v_publie
          FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
         WHERE j.id = v_job;
        -- (13/11, garde d'âge) Le suivi de CETTE annonce par FillSell commence à la création de SA tâche (dépôt, ou import
        -- par un relevé) : une commande antérieure est une vente d'AVANT le suivi, jamais enregistrée ici (même principe que
        -- Leboncoin le 09/11). Une date de commande illisible : rien n'est décidé (jamais une date inventée).
        v_suivi := least(v_cree, v_publie);
        IF coalesce(v_pf ->> 'sale_signal', '') = 'sold' AND v_pf #>> '{sale_evidence,listing_id}' = v_id
           AND v_pf #>> '{sale_evidence,platform}' = 'beebs' THEN
          c_deja := c_deja + 1; v_verdict := 'deja_prouvee';   -- preuve déjà là : aucune réécriture
        ELSIF v_date IS NULL THEN c_date_inconnue := c_date_inconnue + 1; v_verdict := 'date_inconnue';
        ELSIF v_suivi IS NULL OR v_date < v_suivi THEN c_avant_suivi := c_avant_suivi + 1; v_verdict := 'avant_suivi';
        ELSIF NOT coalesce(v_stock, false) THEN c_fiche_vendue := c_fiche_vendue + 1; v_verdict := 'fiche_deja_vendue';
        ELSE
        c_prouvees := c_prouvees + 1;
        IF v_proprio <> v_user THEN c_compte_relie := c_compte_relie + 1; END IF;
        v_verdict := CASE WHEN v_ecrit THEN 'prouvee' ELSE 'aurait_prouve' END;
        IF v_ecrit THEN
          UPDATE cross_post_jobs c
             SET platform_fields = coalesce(c.platform_fields, '{}'::jsonb) || jsonb_build_object(
                   'sale_signal', 'sold',
                   -- La date de la COMMANDE (13/11 : toujours, plus la disparition déjà notée) : une vente de plus de 24 h
                   -- n'envoie jamais de mail ni de notification (push_trg_job, 24 h).
                   'unavailable_since', to_char(v_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                   'sale_evidence', jsonb_strip_nulls(jsonb_build_object('platform', 'beebs', 'listing_id', v_id, 'state', 'sold', 'exact', true,
                     'source', 'commande_beebs', 'commande', v_ref, 'statut', v_statut, 'lu_le', now(), 'par', 'page_ventes_beebs',
                     'commande_le', v_date, 'prix', v_prix_v, 'prix_source', v_prix_src, 'devise', v_devise,
                     'disparue_le', c.platform_fields ->> 'unavailable_since',
                     'lue_par_compte_relie', CASE WHEN v_proprio <> v_user THEN v_user END)))
                 || CASE WHEN v_prix_v IS NOT NULL THEN jsonb_build_object('detected_price', v_prix_v) ELSE '{}'::jsonb END
           WHERE c.id = v_job AND c.status = 'published';
        END IF;
        END IF;
        END IF;
        END IF;
        v_cmd := jsonb_set(v_cmd, '{produits}', coalesce(v_cmd -> 'produits', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(
                   jsonb_build_object('id', v_id, 'verdict', v_verdict, 'job', v_job, 'fiche', v_fiche::text, 'titre', v_titre,
                     'prix', v_prix_v, 'prix_source', v_prix_src,
                     'compte_relie', CASE WHEN v_job IS NOT NULL AND v_proprio IS DISTINCT FROM v_user THEN true END,
                     'suivi_le', CASE WHEN v_verdict = 'avant_suivi' THEN v_suivi END))));
      END LOOP;
      v_detail := v_detail || jsonb_build_array(v_cmd);
    END LOOP;
  END IF;

  v_bilan := jsonb_build_object('mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
    'recues', c_recues, 'produits', c_produits, 'prouvees_ou_auraient', c_prouvees, 'deja', c_deja, 'doute', c_doute,
    'sans_job', c_sans_job, 'fiche_deja_vendue', c_fiche_vendue, 'forme_inconnue', c_forme, 'statut_inconnu', c_inconnu,
    'annulees', c_annulees, 'preuves_levees', c_levees, 'annulee_apres_vente', c_annulee_apres,
    'avant_suivi', c_avant_suivi, 'date_inconnue', c_date_inconnue, 'compte_relie', c_compte_relie,
    'ventes_defaites', c_defaites) || v_lecture;
  -- (24/10, feu vert 2) Le détail commande par commande, et l'extension du compte au moment du bilan.
  SELECT p.extension_build INTO v_build FROM profiles p WHERE p.id = v_user;
  IF jsonb_array_length(v_detail) > 0 THEN v_bilan := v_bilan || jsonb_build_object('commandes', v_detail); END IF;
  IF v_build IS NOT NULL THEN v_bilan := v_bilan || jsonb_build_object('build', left(v_build, 60)); END IF;
  IF c_recues > 0 OR NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v_user AND u.feature = 'ventes_beebs_commandes'
                                    AND u.created_at > now() - interval '6 hours') THEN
    INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v_user, 'ventes_beebs_commandes', v_bilan);
  END IF;
  RETURN v_bilan;
END;
$function$;

COMMIT;
