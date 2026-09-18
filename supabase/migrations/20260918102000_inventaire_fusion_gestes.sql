-- ═══════════════════════════════════════════════════════════════════════════
-- « CES DEUX ARTICLES SONT LE MÊME » — LE GESTE, ET SON RETOUR (point B)
-- ═══════════════════════════════════════════════════════════════════════════
-- Préalable au point F : sans fusion, une erreur d'import ne se répare pas.
--
-- CE QUI BOUGE — les SEPT tables qui référencent inventaire.id, relevées au
-- catalogue des clés étrangères, pas devinées :
--   ventes · cross_post_jobs · annonces_plateforme · vinted_listing_snapshots
--   · vinted_republish_captures · fiches_annonce · rapprochements
-- Chaque ligne déplacée est journalisée par son id dans inventaire_fusions.
-- deplacements, et c'est ELLE qui permet de rendre exactement ce qui a bougé.
--
-- ⛔ AUCUNE PERTE D'HISTORIQUE DE VENTE. `ventes` est la seule FK en NO ACTION
--    du lot : on la re-pointe, on ne la supprime jamais. Une vente sans
--    inventaire_id (lignes historiques) n'est pas touchée — on ne devine pas
--    à qui elle appartient.
-- ⛔ PRIX D'ACHAT : règle du 03/08, VIDE ≠ ZÉRO. On ne reprend le prix d'achat
--    de l'absorbé que si le gardé n'en a AUCUN (NULL et pas marqué
--    `prix_achat_inconnu`). Un 0 assumé de l'absorbé est repris tel quel — 0
--    est un prix, pas une absence. On ne remplace jamais un prix existant.
-- ⛔ LES AUTRES CHAMPS ne sont repris que s'ils sont VIDES chez le gardé
--    (description, marque, photos, attributs clé par clé). Jamais d'écrasement.
--    La valeur AVANT est journalisée, pour que défaire la rende.
-- ⛔ UNE DÉCISION HUMAINE ÉCRASE TOUTE PASSE AUTOMATIQUE ULTÉRIEURE : les
--    annonces déplacées repartent en source_rapprochement = 'manuel', et
--    rapprocher_releve ne repasse jamais sur une annonce dont inventaire_id
--    est posé. L'article absorbé, lui, porte `fusionne_dans` et sort du
--    périmètre de rapprocher_classer : il ne peut plus être re-proposé.

-- ── FUSIONNER ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventaire_fusionner(p_garde bigint, p_absorbe bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  g inventaire%ROWTYPE;
  a inventaire%ROWTYPE;
  v_dep jsonb := '{}'::jsonb;
  v_champs jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_attr jsonb;
  v_cle text;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF p_garde IS NULL OR p_absorbe IS NULL OR p_garde = p_absorbe THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'articles_identiques');
  END IF;
  -- FOR UPDATE : deux fusions lancées en même temps sur le même article ne
  -- doivent pas journaliser deux fois le même déplacement.
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = v_user FOR UPDATE;
  SELECT * INTO a FROM inventaire WHERE id = p_absorbe AND user_id = v_user FOR UPDATE;
  IF g.id IS NULL OR a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;
  IF g.fusionne_dans IS NOT NULL OR a.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_fusionne');
  END IF;

  -- 1. VENTES — re-pointées, jamais supprimées.
  SELECT jsonb_agg(id) INTO v_ids FROM ventes WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE ventes SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('ventes', v_ids);
  END IF;

  -- 2. JOBS — publications, republications, retraits : tout l'historique.
  SELECT jsonb_agg(id) INTO v_ids FROM cross_post_jobs WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('cross_post_jobs', v_ids);
  END IF;

  -- 3. ANNONCES relevées sur les autres plateformes. `source_rapprochement`
  --    passe à 'manuel' : c'est une décision humaine, elle prime sur le moteur.
  SELECT jsonb_agg(id) INTO v_ids FROM annonces_plateforme WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE annonces_plateforme SET inventaire_id = p_garde, source_rapprochement = 'manuel', proposition = NULL, updated_at = now()
     WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('annonces_plateforme', v_ids);
  END IF;

  -- 4..6. Les trois tables de suivi Vinted / fiches.
  SELECT jsonb_agg(id) INTO v_ids FROM vinted_listing_snapshots WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_listing_snapshots SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_listing_snapshots', v_ids);
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM vinted_republish_captures WHERE inventaire_id = p_absorbe;
  IF v_ids IS NOT NULL THEN
    UPDATE vinted_republish_captures SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
    v_dep := v_dep || jsonb_build_object('vinted_republish_captures', v_ids);
  END IF;
  -- ⚠️ fiches_annonce n'a PAS de colonne `id` : elle est CLÉE PAR inventaire_id
  --    (une fiche par article). On ne peut donc pas la déplacer si le gardé en
  --    a déjà une — ce serait une violation de clé primaire. Dans ce cas on
  --    laisse la fiche de l'absorbé où elle est : le gardé a la sienne, qui
  --    fait foi. C'est aussi la SEULE FK en CASCADE du lot, donc la seule dont
  --    la ligne meurt avec l'absorbé si quelqu'un le supprime un jour — d'où
  --    le déplacement dès qu'il est possible.
  IF EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_absorbe AND user_id = v_user)
     AND NOT EXISTS (SELECT 1 FROM fiches_annonce WHERE inventaire_id = p_garde AND user_id = v_user) THEN
    UPDATE fiches_annonce SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('fiches_annonce', jsonb_build_array(p_absorbe));
  END IF;
  SELECT jsonb_agg(id) INTO v_ids FROM rapprochements WHERE inventaire_id = p_absorbe AND user_id = v_user;
  IF v_ids IS NOT NULL THEN
    UPDATE rapprochements SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe AND user_id = v_user;
    v_dep := v_dep || jsonb_build_object('rapprochements', v_ids);
  END IF;

  -- 7. PRIX D'ACHAT — la règle du 03/08, appliquée à la lettre.
  --    « Connu » = prix_achat NON NULL (0 compris : un article offert est un
  --    prix d'achat assumé) OU prix_achat_inconnu = true (« je ne sais plus »
  --    vaut réponse). On ne reprend que si le gardé ne sait rien.
  IF g.prix_achat IS NULL AND COALESCE(g.prix_achat_inconnu, false) = false
     AND (a.prix_achat IS NOT NULL OR COALESCE(a.prix_achat_inconnu, false) = true) THEN
    UPDATE inventaire SET prix_achat = a.prix_achat, prix_achat_inconnu = a.prix_achat_inconnu WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object(
      'prix_achat', jsonb_build_object('avant', NULL, 'apres', a.prix_achat),
      'prix_achat_inconnu', jsonb_build_object('avant', g.prix_achat_inconnu, 'apres', a.prix_achat_inconnu));
  END IF;

  -- 8. Les champs VIDES du gardé, remplis depuis l'absorbé. Jamais d'écrasement.
  IF NULLIF(trim(COALESCE(g.description, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.description, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET description = a.description WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('description', jsonb_build_object('avant', g.description, 'apres', a.description));
  END IF;
  IF NULLIF(trim(COALESCE(g.marque, '')), '') IS NULL AND NULLIF(trim(COALESCE(a.marque, '')), '') IS NOT NULL THEN
    UPDATE inventaire SET marque = a.marque WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('marque', jsonb_build_object('avant', g.marque, 'apres', a.marque));
  END IF;
  IF (g.photos IS NULL OR jsonb_typeof(g.photos) <> 'array' OR jsonb_array_length(g.photos) = 0)
     AND jsonb_typeof(a.photos) = 'array' AND jsonb_array_length(a.photos) > 0 THEN
    UPDATE inventaire SET photos = a.photos WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('photos', jsonb_build_object('avant', g.photos, 'apres', a.photos));
  END IF;
  -- Attributs : CLÉ PAR CLÉ. Un attribut connu du gardé n'est jamais remplacé.
  IF jsonb_typeof(a.attributs) = 'object' THEN
    v_attr := COALESCE(g.attributs, '{}'::jsonb);
    FOR v_cle IN SELECT k FROM jsonb_object_keys(a.attributs) k LOOP
      IF NOT (v_attr ? v_cle) THEN v_attr := v_attr || jsonb_build_object(v_cle, a.attributs -> v_cle); END IF;
    END LOOP;
    IF v_attr <> COALESCE(g.attributs, '{}'::jsonb) THEN
      UPDATE inventaire SET attributs = v_attr WHERE id = p_garde;
      v_champs := v_champs || jsonb_build_object('attributs', jsonb_build_object('avant', g.attributs, 'apres', v_attr));
    END IF;
  END IF;

  -- 9. L'absorbé reçoit son pointeur. Ni supprimé, ni marqué vendu.
  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;

  INSERT INTO inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, 'utilisateur')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id, 'garde', p_garde, 'absorbe', p_absorbe,
                            'deplacements', v_dep, 'champs_repris', v_champs);
END;
$$;
REVOKE ALL ON FUNCTION public.inventaire_fusionner(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventaire_fusionner(bigint, bigint) TO authenticated, service_role;

-- ── DÉFAIRE ─────────────────────────────────────────────────────────────────
-- On ne rend QUE ce que le journal dit avoir bougé — jamais « toutes les
-- lignes qui pointent le gardé », ce qui emporterait celles qui lui
-- appartenaient déjà.
CREATE OR REPLACE FUNCTION public.inventaire_defusionner(p_fusion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  f inventaire_fusions%ROWTYPE;
  v_ids bigint[];
  v_uids uuid[];
  v_cle text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO f FROM inventaire_fusions WHERE id = p_fusion_id AND user_id = v_user FOR UPDATE;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'fusion_introuvable'); END IF;
  IF f.defait_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_defaite'); END IF;

  -- Tables à clé bigint.
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_listing_snapshots SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_republish_captures', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_republish_captures SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  -- fiches_annonce : clée par inventaire_id, pas par id (cf. le geste).
  IF f.deplacements ? 'fiches_annonce' THEN
    UPDATE fiches_annonce SET inventaire_id = f.absorbe WHERE inventaire_id = f.garde AND user_id = v_user;
  END IF;
  -- Tables à clé uuid.
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'cross_post_jobs', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE cross_post_jobs SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE annonces_plateforme SET inventaire_id = f.absorbe, updated_at = now() WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'rapprochements', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE rapprochements SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;

  -- Les champs repris : on remet l'AVANT, y compris quand c'était NULL.
  -- ⚠️ `to_jsonb(NULL)` vaut la valeur JSON null, pas SQL NULL : on relit donc
  --    chaque champ depuis le journal avec ->> et NULLIF, sans raccourci.
  FOR v_cle IN SELECT k FROM jsonb_object_keys(COALESCE(f.champs_repris, '{}'::jsonb)) k LOOP
    IF v_cle = 'prix_achat' THEN
      UPDATE inventaire SET prix_achat = NULLIF(f.champs_repris -> 'prix_achat' ->> 'avant', '')::numeric WHERE id = f.garde;
    ELSIF v_cle = 'prix_achat_inconnu' THEN
      UPDATE inventaire SET prix_achat_inconnu = NULLIF(f.champs_repris -> 'prix_achat_inconnu' ->> 'avant', '')::boolean WHERE id = f.garde;
    ELSIF v_cle = 'description' THEN
      UPDATE inventaire SET description = f.champs_repris -> 'description' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'marque' THEN
      UPDATE inventaire SET marque = f.champs_repris -> 'marque' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'photos' THEN
      UPDATE inventaire SET photos = CASE WHEN jsonb_typeof(f.champs_repris -> 'photos' -> 'avant') = 'null'
                                          THEN NULL ELSE f.champs_repris -> 'photos' -> 'avant' END WHERE id = f.garde;
    ELSIF v_cle = 'attributs' THEN
      UPDATE inventaire SET attributs = CASE WHEN jsonb_typeof(f.champs_repris -> 'attributs' -> 'avant') = 'null'
                                             THEN NULL ELSE f.champs_repris -> 'attributs' -> 'avant' END WHERE id = f.garde;
    END IF;
  END LOOP;

  UPDATE inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe AND user_id = v_user;
  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  RETURN jsonb_build_object('ok', true, 'fusion_id', f.id, 'garde', f.garde, 'absorbe', f.absorbe);
END;
$$;
REVOKE ALL ON FUNCTION public.inventaire_defusionner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventaire_defusionner(uuid) TO authenticated, service_role;
