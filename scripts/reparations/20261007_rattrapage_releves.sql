-- ════════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE DU PARC — RATTACHEMENT AVANT STOCK (07/10/2026, point 5 de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- Prérequis : migration 20261007140000 (rapprochement_lire_fiches,
-- rapprochement_candidats). En simulation, le lanceur
-- (20261007_rattrapage_releves.mjs) la joue dans la MÊME transaction annulée.
--
-- LA RÈGLE, REJOUÉE : on fait comme si les articles IMPORTÉS par l'ancien
-- moteur (origine releve_*, rapprochements 'import' par 'auto') n'existaient
-- pas, et on classe leur annonce contre le reste du stock, dans l'ordre du
-- moteur :
--   · même photo qu'UN SEUL article (preuve du 06/10)  → FUSION dans cet
--     article (inventaire_fusionner_pour, journalisée, annulable :
--     inventaire_fusions.defait_le) — si l'article importé n'a ni vente, ni
--     dépôt FillSell, ni quantité > 1 ;
--   · un doute (titre, homonyme, photo ambiguë)       → l'article SORT du
--     stock et son annonce redevient une PROPOSITION hors du stock — SEULEMENT
--     s'il est intact (aucune vente, aucun prix d'achat, aucune retouche dans
--     l'app, une seule annonce) ; sauvegarde complète avant, inverse prêt
--     (20261007_rattrapage_releves_INVERSE.sql). Sinon il reste, et la
--     question « Est-ce le même article ? » est posée ;
--   · aucun candidat                                  → il reste (article
--     unique) ; deux articles importés de la même photo sur deux plateformes
--     sont fusionnés en un.
-- Jamais deux boutiques Vinted (on ne touche qu'aux articles importés de
-- Leboncoin, Beebs, eBay, Opla), jamais un article vendu, jamais une quantité
-- écrasée, jamais une fusion sur un titre seul.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_fiches (LIKE public.inventaire);
CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_annonces (LIKE public.annonces_plateforme);
CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_jobs (LIKE public.cross_post_jobs);
CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_rapprochements (LIKE public.rapprochements);
CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_doublons (LIKE public.inventaire_doublons);
CREATE TABLE IF NOT EXISTS public._backup_0710_rattachement_journal (
  le timestamptz NOT NULL DEFAULT now(), user_id uuid, fiche bigint, annonce uuid, action text, cible bigint, detail jsonb);

CREATE OR REPLACE FUNCTION pg_temp.rattrapage_compte(p_user uuid, p_appliquer boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $f$
DECLARE
  t0 timestamptz := clock_timestamp();
  v_t0 timestamptz := now();
  o record; v_cand jsonb; v_cible bigint; v_r jsonb; v_action text;
  n_fus integer := 0; n_hors integer := 0; n_quest integer := 0; n_gardes integer := 0; n_ko integer := 0;
  n_groupees integer := 0;
  v_avant integer; v_apres integer; v_doubles_avant integer; v_doubles_apres integer;
  v_nouvelles jsonb := '[]'::jsonb; x jsonb;
BEGIN
  SELECT count(*) INTO v_avant FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL AND statut = 'stock';
  SELECT count(*) INTO v_doubles_avant FROM (SELECT titre_norm(titre) FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL AND statut = 'stock' GROUP BY 1 HAVING count(*) > 1) d;

  -- Les articles importés par l'ancien moteur, avec l'annonce qui les a créés.
  CREATE TEMP TABLE IF NOT EXISTS _old (
    fiche bigint PRIMARY KEY, annonce uuid, platform text, vu_le timestamptz,
    eligible_fusion boolean, intact boolean, action text, cible bigint, cand jsonb) ON COMMIT DROP;
  TRUNCATE _old;
  INSERT INTO _old (fiche, annonce, platform, vu_le, eligible_fusion, intact)
  SELECT i.id, a.id, a.platform, COALESCE(a.vu_le, a.created_at),
         -- fusion permise : pas de vente, pas de dépôt FillSell, pas de quantité > 1, en stock
         (i.statut = 'stock' AND COALESCE(i.quantite, 1) <= 1
          AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                            AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
                                 OR j.status IN ('pending', 'processing', 'needs_user')))),
         -- intact : rien de la personne dessus, une seule annonce
         (COALESCE(i.quantite, 1) <= 1 AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
          AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
          AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                           WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
          AND (SELECT count(*) FROM annonces_plateforme x WHERE x.inventaire_id = i.id) = 1)
    FROM inventaire i
    JOIN LATERAL (SELECT r.annonce_id FROM rapprochements r
                   WHERE r.inventaire_id = i.id AND r.decision = 'import' AND r.par = 'auto'
                   ORDER BY r.created_at DESC LIMIT 1) ri ON true
    JOIN annonces_plateforme a ON a.id = ri.annonce_id AND a.inventaire_id = i.id
   WHERE i.user_id = p_user AND i.origine LIKE 'releve\_%' AND i.fusionne_dans IS NULL AND i.statut = 'stock';

  IF NOT EXISTS (SELECT 1 FROM _old) THEN
    RETURN jsonb_build_object('user', p_user, 'importes_ancien_moteur', 0);
  END IF;

  -- La lecture du moteur, SANS les articles de l'ancien moteur.
  PERFORM rapprochement_lire_fiches(p_user);
  DELETE FROM _rfp WHERE id IN (SELECT fiche FROM _old);
  DELETE FROM _rf WHERE id IN (SELECT fiche FROM _old);

  -- ── 1. LE CLASSEMENT, comme le moteur (annonce par annonce, vu_le) ────────
  FOR o IN SELECT * FROM _old ORDER BY vu_le, fiche LOOP
    v_cand := rapprochement_candidats(o.annonce, NULL);
    IF v_cand ? 'sur' AND o.eligible_fusion
       AND COALESCE((SELECT quantite FROM inventaire WHERE id = (v_cand ->> 'sur')::bigint), 1) <= 1 THEN
      UPDATE _old SET action = 'fusion', cible = (v_cand ->> 'sur')::bigint, cand = v_cand WHERE fiche = o.fiche;
    ELSIF v_cand ? 'sur' OR v_cand ? 'candidats' THEN
      UPDATE _old SET action = CASE WHEN o.intact AND o.eligible_fusion THEN 'hors_stock' ELSE 'question' END,
                      cible = COALESCE((v_cand ->> 'sur')::bigint, (v_cand ->> 'inventaire_id')::bigint),
                      cand = CASE WHEN v_cand ? 'sur'
                                  THEN jsonb_build_object('inventaire_id', (v_cand ->> 'sur')::bigint, 'motif', 'photo_identique',
                                                          'candidats', jsonb_build_array(jsonb_build_object('type', 'inventaire', 'inventaire_id', (v_cand ->> 'sur')::bigint, 'motif', 'photo_identique')))
                                  ELSE v_cand END
       WHERE fiche = o.fiche;
    ELSE
      UPDATE _old SET action = 'nouvelle' WHERE fiche = o.fiche;
    END IF;
  END LOOP;

  -- ── 2. LES « NOUVELLES » ENTRE ELLES (phase de création du moteur) ───────
  FOR o IN SELECT * FROM _old WHERE action = 'nouvelle'
            ORDER BY CASE platform WHEN 'leboncoin' THEN 1 WHEN 'beebs' THEN 2 WHEN 'ebay' THEN 3 ELSE 4 END, vu_le, fiche LOOP
    v_cand := rapprochement_candidats(o.annonce, v_t0);
    IF v_cand ? 'sur' AND o.eligible_fusion THEN
      UPDATE _old SET action = 'fusion', cible = (v_cand ->> 'sur')::bigint, cand = v_cand WHERE fiche = o.fiche;
      n_groupees := n_groupees + 1;
    ELSIF v_cand ? 'sur' OR v_cand ? 'candidats' THEN
      UPDATE _old SET action = CASE WHEN o.intact AND o.eligible_fusion THEN 'hors_stock' ELSE 'question' END,
                      cible = COALESCE((v_cand ->> 'sur')::bigint, (v_cand ->> 'inventaire_id')::bigint), cand = v_cand
       WHERE fiche = o.fiche;
    ELSE
      UPDATE _old SET action = 'garde' WHERE fiche = o.fiche;
      -- Elle reste : les suivantes se comparent à elle (comme un article créé).
      INSERT INTO _rf
      SELECT i.id, i.statut, i.titre, titre_norm(i.titre), titre_jetons(i.titre), titre_types_objet(i.titre),
             COALESCE(titre_marque_utile(NULLIF(trim(COALESCE(i.marque, '')), '')), ''), '', i.prix_vente, ARRAY[o.platform], v_t0, i.origine
        FROM inventaire i WHERE i.id = o.fiche
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO _rfp SELECT o.fiche, e.dhash::bit(64), e.phash::bit(64) FROM annonces_plateforme a JOIN photo_empreintes e ON e.url = a.photo_url WHERE a.id = o.annonce;
      INSERT INTO _rfp SELECT o.fiche, e.dhash::bit(64), e.phash::bit(64) FROM inventaire i JOIN photo_empreintes e ON e.url = fiche_couverture(i.photos) WHERE i.id = o.fiche;
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE action = 'fusion'), count(*) FILTER (WHERE action = 'hors_stock'),
         count(*) FILTER (WHERE action = 'question'), count(*) FILTER (WHERE action = 'garde')
    INTO n_fus, n_hors, n_quest, n_gardes FROM _old;

  IF p_appliquer THEN
    -- ── 3a. LES FUSIONS SÛRES ──────────────────────────────────────────────
    FOR o IN SELECT * FROM _old WHERE action = 'fusion' ORDER BY vu_le LOOP
      BEGIN
        -- La cible a pu être fusionnée elle-même entre-temps : on suit la chaîne.
        v_cible := o.cible;
        WHILE (SELECT fusionne_dans FROM inventaire WHERE id = v_cible) IS NOT NULL LOOP
          v_cible := (SELECT fusionne_dans FROM inventaire WHERE id = v_cible);
        END LOOP;
        INSERT INTO _backup_0710_rattachement_doublons SELECT * FROM inventaire_doublons WHERE user_id = p_user AND (garde = o.fiche OR absorbe = o.fiche);
        v_r := inventaire_fusionner_pour(p_user, v_cible, o.fiche, 'utilisateur:photo_rattrapage_0710');
        IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
          UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'photo_rattrapage_0710', fusion_id = (v_r ->> 'fusion_id')::uuid
           WHERE user_id = p_user AND statut = 'proposee'
             AND least(garde, absorbe) = least(v_cible, o.fiche) AND greatest(garde, absorbe) = greatest(v_cible, o.fiche);
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'photo_rattrapage_0710'
           WHERE user_id = p_user AND statut = 'proposee' AND (garde = o.fiche OR absorbe = o.fiche);
          INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
          VALUES (p_user, o.fiche, o.annonce, 'fusion', v_cible, jsonb_build_object('fusion_id', v_r ->> 'fusion_id', 'cand', o.cand));
        ELSE
          n_ko := n_ko + 1;
          INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
          VALUES (p_user, o.fiche, o.annonce, 'fusion_refusee', v_cible, v_r);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        n_ko := n_ko + 1;
        INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
        VALUES (p_user, o.fiche, o.annonce, 'erreur', o.cible, jsonb_build_object('erreur', left(SQLERRM, 300)));
      END;
    END LOOP;

    -- ── 3b. LES DOUTES SUR UN ARTICLE INTACT : HORS DU STOCK ────────────────
    FOR o IN SELECT * FROM _old WHERE action = 'hors_stock' ORDER BY vu_le LOOP
      BEGIN
        INSERT INTO _backup_0710_rattachement_fiches SELECT * FROM inventaire WHERE id = o.fiche;
        INSERT INTO _backup_0710_rattachement_annonces SELECT * FROM annonces_plateforme WHERE inventaire_id = o.fiche;
        INSERT INTO _backup_0710_rattachement_jobs SELECT * FROM cross_post_jobs WHERE inventaire_id = o.fiche;
        INSERT INTO _backup_0710_rattachement_rapprochements SELECT * FROM rapprochements WHERE inventaire_id = o.fiche;
        INSERT INTO _backup_0710_rattachement_doublons SELECT * FROM inventaire_doublons WHERE user_id = p_user AND (garde = o.fiche OR absorbe = o.fiche);
        UPDATE annonces_plateforme
           SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL,
               proposition = (o.cand - 'sur') || jsonb_build_object('at', now(), 'avant_stock', true, 'rattrapage', '0710'),
               updated_at = now()
         WHERE id = o.annonce;
        DELETE FROM cross_post_jobs WHERE inventaire_id = o.fiche AND platform_fields ->> 'source' = 'releve';
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rattrapage_0710'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = o.fiche OR absorbe = o.fiche);
        DELETE FROM inventaire WHERE id = o.fiche;
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, o.annonce, o.cible, 'propose', 'auto', COALESCE((o.cand ->> 'score')::numeric, 0),
                jsonb_build_object('motif', o.cand ->> 'motif', 'regle', 'rattachement_avant_stock', 'rattrapage', '0710', 'fiche_retiree', o.fiche));
        INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
        VALUES (p_user, o.fiche, o.annonce, 'hors_stock', o.cible, o.cand);
      EXCEPTION WHEN OTHERS THEN
        n_ko := n_ko + 1;
        INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
        VALUES (p_user, o.fiche, o.annonce, 'erreur', o.cible, jsonb_build_object('erreur', left(SQLERRM, 300)));
      END;
    END LOOP;

    -- ── 3c. LES DOUTES SUR UN ARTICLE TOUCHÉ : il reste, la question est posée
    FOR o IN SELECT * FROM _old WHERE action = 'question' AND cible IS NOT NULL LOOP
      PERFORM releve_poser_question(p_user, o.cible, o.fiche, COALESCE(o.cand ->> 'motif', 'rattrapage'),
                                    jsonb_build_object('rattrapage', '0710', 'annonce_id', o.annonce));
      INSERT INTO _backup_0710_rattachement_journal (user_id, fiche, annonce, action, cible, detail)
      VALUES (p_user, o.fiche, o.annonce, 'question', o.cible, o.cand);
    END LOOP;
  END IF;

  SELECT count(*) INTO v_apres FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL AND statut = 'stock';
  SELECT count(*) INTO v_doubles_apres FROM (SELECT titre_norm(titre) FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL AND statut = 'stock' GROUP BY 1 HAVING count(*) > 1) d;
  RETURN jsonb_build_object('user', p_user, 'importes_ancien_moteur', (SELECT count(*) FROM _old),
    'fusions_sures', n_fus, 'dont_groupees_entre_plateformes', n_groupees, 'hors_stock_propositions', n_hors,
    'questions_articles_touches', n_quest, 'gardes_uniques', n_gardes, 'echecs', n_ko,
    'stock_avant', v_avant, 'stock_apres', CASE WHEN p_appliquer THEN v_apres ELSE v_avant - n_fus - n_hors END,
    'titres_en_double_avant', v_doubles_avant, 'titres_en_double_apres', CASE WHEN p_appliquer THEN v_doubles_apres END,
    'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$f$;
