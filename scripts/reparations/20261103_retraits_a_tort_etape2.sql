-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — REMETTRE EN LIGNE les annonces retirées à tort le 03/11 (feu vert de Nico, 03/11 soir, point 4).
-- Rapport docs/enquetes/retraits-a-tort-0311/RAPPORT.md. Après l'étape 1 (fiches rétablies, au stock).
-- Hors quota (`hors_quota`, exclu de tous les comptes ; une tâche créée ici n'écrit aucun usage_logs « publish »),
-- au rythme de la file : une tâche à la fois par plateforme, 20 min d'écart (next_action_after), jamais une rafale.
--   · Leboncoin (JEAN-LUC, 4) — republication à l'étape « deleted » : get-pending-jobs complète catégorie, critères,
--     localisation, livraison, colis et poids depuis la CAPTURE du relevé du 03/11 10:56 (annonces_plateforme.capture
--     de la fiche) ; titre, description, prix, photos = la fiche (même contenu que la capture). Éponge EXCLUE (Nico).
--   · Beebs (Dylan, 2) — publication depuis la FICHE ; rayon = celui de la capture Beebs (rayon_fil).
--   · Vinted (JEAN-LUC, 1) — serviette LEUS : republication « deleted » depuis la capture Vinted VALIDE 21959 (sa fiche).
--   · NON remises ici : balance Terraillon, boîte à café, boîte à café marron (Vinted) — aucune catégorie Vinted en
--     base (annonces créées hors FillSell) : à choisir, jamais devinée. Ni Polly Pocket, ni Dracaufeu V (retraits justes).
-- Gardes par annonce : fiche au stock, quantité ≥ 1, non fusionnée ; aucune tâche active ni retrait vivant sur
-- (fiche, plateforme) ; aucune annonce de la fiche en ligne sur la plateforme. Rien n'est retiré. Aucun mail.
-- Inverse : …_etape2_INVERSE.sql (annule les tâches encore en attente).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMPORARY TABLE _remises (
  rang int PRIMARY KEY, user_id uuid NOT NULL, fiche bigint NOT NULL, platform text NOT NULL, forme text NOT NULL,
  ancien_numero text NOT NULL, ancienne_url text, ancien_depot uuid, delai_min int NOT NULL) ON COMMIT DROP;
INSERT INTO _remises VALUES
  (1, '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 1793700047526, 'leboncoin', 'republish', '3224766875', 'https://www.leboncoin.fr/ad/bricolage/3224766875', '58277ad6-1501-4dbe-b521-07f334cdb47e', 2),
  (2, '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 1793700047599, 'leboncoin', 'republish', '3233436490', 'https://www.leboncoin.fr/ad/decoration/3233436490', 'e8051b29-2fa7-4566-8f62-c0643c182354', 22),
  (3, '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 1793700047481, 'leboncoin', 'republish', '3224902464', 'https://www.leboncoin.fr/ad/bricolage/3224902464', '048da100-4597-4f0a-b4ed-d5bcecdc588c', 42),
  (4, '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 1793700047580, 'leboncoin', 'republish', '3243205231', 'https://www.leboncoin.fr/ad/arts_de_la_table/3243205231', 'a70a7d4c-9100-4996-b063-04e21d090ffa', 62),
  (5, '379aa8a7-0c37-4134-b1fd-de5e0fb7c1e4', 1793652317205, 'beebs', 'publish', '34285076', NULL, '324a6bbf-5492-4c0d-80bc-d697a7e49d99', 2),
  (6, '379aa8a7-0c37-4134-b1fd-de5e0fb7c1e4', 1793652316898, 'beebs', 'publish', '34284932', NULL, 'e4b6e618-f66a-40be-b219-c299eb124003', 22),
  (7, '9256e3ae-48e4-4a3a-be66-65fd2e28b418', 1793643690203014, 'vinted', 'republish', '10641989604', NULL, 'e3f7fcc9-acc2-4d72-8ad5-b34b0da8d284', 2);

DO $$
DECLARE r record; i public.inventaire%ROWTYPE; v_ph jsonb; v_pf jsonb; v_le timestamptz; v_id uuid; v_cap record;
        v_rayon jsonb; v_capture_le timestamptz; v_titre text; n int := 0;
BEGIN
  FOR r IN SELECT * FROM _remises ORDER BY rang LOOP
    SELECT * INTO i FROM public.inventaire WHERE id = r.fiche AND user_id = r.user_id FOR UPDATE;
    IF i.id IS NULL OR i.statut IS DISTINCT FROM 'stock' OR COALESCE(i.quantite, 1) < 1 OR i.fusionne_dans IS NOT NULL THEN
      RAISE EXCEPTION 'remise % : fiche % pas au stock (étape 1 jouée ?)', r.rang, r.fiche;
    END IF;
    IF EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.inventaire_id = r.fiche AND c.platform = r.platform
                AND c.status IN ('pending', 'processing', 'needs_user')) THEN
      RAISE EXCEPTION 'remise % : une tâche % est déjà active sur la fiche %', r.rang, r.platform, r.fiche;
    END IF;
    IF EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.inventaire_id = r.fiche AND c.platform = r.platform
                AND c.status = 'published' AND COALESCE(c.action, 'publish') IN ('publish', 'republish')) THEN
      RAISE EXCEPTION 'remise % : la fiche % a déjà une annonce % publiée', r.rang, r.fiche, r.platform;
    END IF;
    IF EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.inventaire_id = r.fiche AND a.platform = r.platform
                AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.statut_plateforme IN ('en_ligne', 'en_verification')) THEN
      RAISE EXCEPTION 'remise % : une annonce % de la fiche % est en ligne', r.rang, r.platform, r.fiche;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d WHERE d.platform_fields #>> '{arme_par,depot}' = r.ancien_depot::text
                    AND d.action = 'delete' AND d.status = 'deleted') THEN
      RAISE EXCEPTION 'remise % : retrait fait du dépôt % introuvable', r.rang, r.ancien_depot;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'original', 'url', p) ORDER BY o), '[]'::jsonb) INTO v_ph
      FROM jsonb_array_elements_text(COALESCE(i.photos, '[]'::jsonb)) WITH ORDINALITY t(p, o) WHERE p ~ '^https?://';
    IF jsonb_array_length(v_ph) = 0 THEN RAISE EXCEPTION 'remise % : fiche % sans photo', r.rang, r.fiche; END IF;
    v_le := now() + make_interval(mins => r.delai_min);
    v_titre := i.titre;
    v_pf := jsonb_build_object('hors_quota', true, 'next_action_after', v_le,
      'remise_en_ligne_0311', jsonb_build_object('le', now(), 'ancien_numero', r.ancien_numero, 'ancien_depot', r.ancien_depot,
        'motif', 'retrait à tort du 03/11 (rattachement sur une ressemblance) — feu vert de Nico', 'par', 'scripts/reparations/20261103_retraits_a_tort_etape2.sql'));

    IF r.platform = 'leboncoin' THEN
      SELECT a.capture_le INTO v_capture_le FROM public.annonces_plateforme a
       WHERE a.user_id = r.user_id AND a.platform = 'leboncoin' AND a.listing_id = r.ancien_numero AND a.inventaire_id = r.fiche
         AND (a.capture ->> 'capture_complete') = 'true';
      IF v_capture_le IS NULL THEN RAISE EXCEPTION 'remise % : capture Leboncoin du 03/11 absente sur la fiche %', r.rang, r.fiche; END IF;
      v_pf := v_pf || jsonb_build_object('republish_step', 'deleted', 'deleted_at', v_le, 'republish_source', 'reparation',
        'republish_platform', 'leboncoin', 'old_listing_url', r.ancienne_url, 'old_platform_listing_id', r.ancien_numero,
        'republish_snapshot', jsonb_build_object('version', 2, 'plateforme', 'leboncoin', 'titre', i.titre, 'prix', i.prix_vente,
          'listing_url', r.ancienne_url, 'platform_listing_id', r.ancien_numero, 'photos', jsonb_array_length(v_ph),
          'captured_at', v_capture_le, 'source', 'capture_releve_0311'));
    ELSIF r.platform = 'beebs' THEN
      SELECT a.capture -> 'rayon_fil' INTO v_rayon FROM public.annonces_plateforme a
       WHERE a.user_id = r.user_id AND a.platform = 'beebs' AND a.listing_id = r.ancien_numero;
      IF jsonb_typeof(v_rayon) IS DISTINCT FROM 'array' OR jsonb_array_length(v_rayon) < 2 THEN
        RAISE EXCEPTION 'remise % : rayon Beebs illisible pour %', r.rang, r.ancien_numero;
      END IF;
      v_pf := v_pf || jsonb_build_object('beebsCategoryPath', v_rayon)
        || CASE WHEN i.attributs #>> '{etat,v}' IS NOT NULL THEN jsonb_build_object('etat', i.attributs #>> '{etat,v}') ELSE '{}'::jsonb END
        || CASE WHEN COALESCE(i.marque, i.attributs #>> '{marque,v}') IS NOT NULL THEN jsonb_build_object('marque', COALESCE(i.marque, i.attributs #>> '{marque,v}')) ELSE '{}'::jsonb END
        || CASE WHEN i.attributs #>> '{couleur,v}' IS NOT NULL THEN jsonb_build_object('couleur', i.attributs #>> '{couleur,v}') ELSE '{}'::jsonb END;
    ELSE   -- vinted : la capture valide de la fiche
      SELECT c.id, c.vinted_item_id, c.payload INTO v_cap FROM public.vinted_republish_captures c
       WHERE c.id = 21959 AND c.user_id = r.user_id AND c.inventaire_id = r.fiche AND c.verdict = 'valide';
      IF v_cap.id IS NULL THEN RAISE EXCEPTION 'remise % : capture Vinted 21959 absente ou non valide', r.rang; END IF;
      v_titre := COALESCE(NULLIF(btrim(v_cap.payload ->> 'titre'), ''), i.titre);
      v_pf := v_pf || jsonb_build_object('republish_step', 'deleted', 'deleted_at', v_le, 'republish_source', 'reparation',
        'republish_platform', 'vinted', 'capture_id', v_cap.id, 'vinted_item_id', v_cap.vinted_item_id,
        'old_vinted_item_id', r.ancien_numero, 'vinted_account_id', i.vinted_account_id,
        'prix_recreation', COALESCE(NULLIF(v_cap.payload ->> 'prix', '')::numeric, i.prix_vente));
    END IF;

    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, description,
                                        price, photos, platform_fields)
    VALUES (r.user_id, r.fiche, r.platform, r.forme, 'pending', 'original',
            v_titre,
            i.description, i.prix_vente, v_ph, v_pf)
    RETURNING id INTO v_id;
    INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES (r.user_id, 'remise_en_ligne_retrait_a_tort',
      jsonb_build_object('job', v_id, 'platform', r.platform, 'forme', r.forme, 'inventaire_id', r.fiche::text,
                         'ancien_numero', r.ancien_numero, 'a_partir_de', v_le));
    n := n + 1;
  END LOOP;
  IF n <> 7 THEN RAISE EXCEPTION '7 remises attendues, % créée(s)', n; END IF;
END $$;

SELECT c.platform, c.action, c.inventaire_id, left(c.title, 40) AS titre, c.platform_fields #>> '{remise_en_ligne_0311,ancien_numero}' AS ancien,
       to_char((c.platform_fields ->> 'next_action_after')::timestamptz AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS a_partir_de
  FROM public.cross_post_jobs c WHERE c.platform_fields ? 'remise_en_ligne_0311' ORDER BY c.platform, a_partir_de;
COMMIT;
