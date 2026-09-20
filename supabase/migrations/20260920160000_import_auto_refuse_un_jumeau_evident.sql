-- ═══════════════════════════════════════════════════════════════════════════
-- L'IMPORT AUTOMATIQUE NE CRÉE PLUS UN JUMEAU — IL PROPOSE (2026-09-20, 4-e)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT, mesuré sur le compte de Romain (voirememe@gmail.com).
-- Le 19/09 à 09:26, le relevé a créé TROIS lignes d'inventaire neuves pour
-- des articles qu'il avait déjà :
--   « Bop It Édition Disney Stitch »               (releve_beebs)
--       déjà là : « FIG001 - Jeux/Jouets - Jeu Bop It! Édition Disney Stitch »
--   « Puzzle Clementoni Disney Panorama 1000 p »   (releve_ebay)
--       déjà là : « Puzzle Clementoni Disney Panorama »
--   « Cluedo Conspiration Hasbro »                 (releve_beebs)
--       déjà là : « Cluedo Conspiration »
-- Deux lignes pour un même objet, c'est une deuxième annonce qui part, et
-- c'est la plateforme qui signale le doublon au vendeur.
--
-- POURQUOI LE FAISCEAU N'A RIEN VU : il compare les titres MOT À MOT, avec un
-- seuil. « FIG001 - Jeux/Jouets - » ajoute quatre mots de référence qui ne
-- sont nulle part dans l'annonce : le recouvrement tombe sous la barre, aucun
-- candidat n'est proposé, l'annonce finit dans la bande « aucune » — et c'est
-- là, et seulement là, que l'import automatique crée sans demander.
--
-- CE QU'ON AJOUTE : un titre CONTENU DANS L'AUTRE, aux frontières de mots,
-- les deux faisant plus de 12 caractères une fois normalisés. C'est ce qui
-- rattrape les préfixes de référence, les sous-titres et les compléments
-- (« tome 3 » vs « tome 3 l'invité fantôme »).
--
-- MESURE AVANT DE POSER, sur 200 annonces non rattachées tirées au hasard
-- (sur 1 141 dans le parc) :
--   • 108 ont déjà un article au titre EXACTEMENT identique → la règle du
--     titre exact les traite déjà, rien ne change pour elles ;
--   •   3 gagnent un candidat grâce à l'inclusion, et les trois sont justes :
--       « Adidas Stan Smith taille 41 » ← « Baskets Adidas Stan Smith, taille 41 »
--       « Lot de 2 pyjamas hiver bébé fille 12 mois » ← « Lot de 2 pyjamas »
--       « Ancien téléphone ATEA SABENA 81515 Bakélite » ← « Ancien téléphone ATEA »
--   •  89 ne bougent pas.
-- Soit 1,5 % d'annonces en plus qui reçoivent une proposition, zéro faux.
-- Les trois cas de Romain passent tous (recouvrements 0,56 / 0,83 / 0,73).
--
-- AMPLEUR : 158 articles créés par un import de relevé dans tout le parc, 13
-- ont un jumeau évident, sur 2 comptes. 3 viennent de l'import AUTOMATIQUE
-- (Romain, 19/09) — c'est la porte qu'on ferme ici. Les 10 autres viennent
-- d'un clic humain (louis@ttfamily.fr, 20/09 11:56) : on n'y touche pas, une
-- personne qui clique « importer » a vu les deux et a décidé.
--
-- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS. Le refus n'est pas un cul-de-sac : la
--    fonction POSE LA PROPOSITION sur l'annonce (motif `titre_inclus`), donc
--    l'écran de rattachement affiche « C'est peut-être … » avec le bouton qui
--    rattache. Avant, l'annonce disparaissait dans une deuxième ligne sans
--    que personne ne voie rien.
-- ⛔ LE GESTE MANUEL N'EST PAS TOUCHÉ (`p_par = 'utilisateur'`).
-- ⛔ CETTE GARDE NE PEUT QUE S'ABSTENIR : elle ne supprime rien, ne rattache
--    rien, ne fusionne rien. Le pire qu'elle produise est une annonce non
--    importée, avec sa proposition à l'écran — réparable d'un clic.
-- ⛔ LE REFUS EST TRACÉ une seule fois (`rapprochements.decision =
--    'refus_jumeau'`) : sans trace, « pourquoi celle-ci n'est pas entrée ? »
--    redevient une reconstitution à rebours. Le NOT EXISTS évite que le
--    balayage réécrive la même ligne à chaque passage.
-- ⛔ Titres courts écartés : « Lot » dans « Lot de draps » n'est pas un
--    jumeau, c'est un mot. `titre_norm` ne laisse que [a-z0-9 ] — aucun
--    caractère joker ne peut survivre dans le LIKE.
--
-- RÉVERSIBLE : la fonction d'avant est le corps ci-dessous sans le bloc
-- « LA GARDE DU JUMEAU ». La contrainte élargie peut rester en place.

-- ── 1. La trace a besoin de son mot ────────────────────────────────────────
ALTER TABLE public.rapprochements DROP CONSTRAINT IF EXISTS rapprochements_decision_check;
ALTER TABLE public.rapprochements ADD CONSTRAINT rapprochements_decision_check
  CHECK (decision = ANY (ARRAY['attache'::text, 'propose'::text, 'refus_proposition'::text,
                               'ignore'::text, 'import'::text, 'detache'::text,
                               'aucune'::text, 'refus_jumeau'::text]));

-- ── 2. L'import ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le titre de SECOURS (« Annonce vinted ») ne peut pas servir à reconnaître
  -- quoi que ce soit : on part du titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));
  IF p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      -- On la REND VISIBLE au lieu de la faire disparaître dans une 2e ligne.
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_jumeau, 'job_id', NULL,
                                              'motif', 'titre_inclus', 'score', 0.5,
                                              'candidats', '[]'::jsonb, 'candidats_total', 1,
                                              'at', now()),
             updated_at = now()
       WHERE id = a.id;
      IF NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'refus_jumeau') THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, v_jumeau, 'refus_jumeau', p_par, 1,
                jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre));
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'jumeau_probable',
                                'inventaire_id', v_jumeau, 'titre_article', v_jumeau_titre);
    END IF;
  END IF;

  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job));
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);
END;
$$;

REVOKE ALL ON FUNCTION public.rapprocher_importer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_importer(uuid, uuid, text) TO service_role;
