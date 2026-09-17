-- ── Relevé : CAPTURE COMPLÈTE d'une annonce (2026-09-17 soir, demande Nico) ──
-- Le relevé de « Mes annonces » ne rapatriait qu'UNE photo (la vignette de la
-- liste), sans description ni attribut : un article importé depuis Leboncoin,
-- Beebs, eBay ou Opla naissait amputé, à l'inverse d'un article synchronisé
-- depuis Vinted. L'extension (≥ 0.6.42) ouvre désormais la fiche de chaque
-- annonce pas encore capturée et lit ce qu'elle expose (toutes les photos,
-- description, marque, taille, état, couleur, matière, catégorie) — bornée à
-- 30 fiches par relevé, le reste au suivant. Ici :
--   · annonces_plateforme.capture (jsonb) + capture_le : ce que la fiche a
--     donné, et quand. Un relevé sans la colonne (extension plus récente que
--     la base) échoue sur le PATCH de capture et continue — le relevé ne
--     dépend pas de la capture.
--   · rapprochement_decider('import') s'en sert : photos = capture.photos
--     (sinon la vignette), description, marque, et taille/état/couleur/
--     matière/marque dans inventaire.attributs au format {v, source, at}
--     (source 'releve_<plateforme>', comme 'vinted_liste' / 'vinted_detail').
-- Rien d'autre ne change dans la fonction (attache / propose / refus /
-- ignore / detache identiques au 20260917223000).
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS capture jsonb;
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS capture_le timestamptz;

CREATE OR REPLACE FUNCTION public.rapprochement_decider(p_annonce_id uuid, p_decision text, p_inventaire_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_user uuid := auth.uid();
  a annonces_plateforme%ROWTYPE;
  v_inv bigint; v_job uuid; v_job_pf jsonb; v_new_inv bigint; v_titre text; v_prix numeric;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = v_user;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);
    IF v_inv IS NULL OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable');
    END IF;
    -- Le dépôt FillSell de cet article sur cette plateforme, s'il existe : la
    -- proposition d'abord, sinon le plus récent en ligne.
    v_job := NULLIF(a.proposition ->> 'job_id', '')::uuid;
    IF v_job IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform AND j.status = 'published') THEN
      v_job := NULL;
    END IF;
    IF v_job IS NULL THEN
      SELECT j.id INTO v_job FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform
        AND j.action IN ('publish', 'republish') AND j.status = 'published'
      ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    END IF;
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, a.platform, v_inv, a.titre, a.prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'attache', 'inventaire_id', v_inv, 'job_id', v_job);

  ELSIF p_decision = 'refus_proposition' THEN
    UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint, 'refus_proposition', 'utilisateur', COALESCE(a.proposition, '{}'::jsonb));
    RETURN jsonb_build_object('ok', true, 'decision', 'refus_proposition');

  ELSIF p_decision = 'ignore' THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, decision, par) VALUES (v_user, a.id, 'ignore', 'utilisateur');
    RETURN jsonb_build_object('ok', true, 'decision', 'ignore');

  ELSIF p_decision = 'import' THEN
    IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
    v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
    v_prix := a.prix;
    -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
    v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
    WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
    -- Un relevé n'est ni une publication ni une republication : aucun
    -- compteur, aucun quota, aucune unité — origine 'releve_<plateforme>'.
    -- La CAPTURE (photos, description, marque, attributs) quand le relevé l'a
    -- faite : un article importé ressemble alors à un article synchronisé
    -- depuis Vinted. Sans capture, la vignette du relevé et rien d'autre.
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
                            description, marque, first_seen_at, last_synced_at)
    VALUES (v_new_inv, v_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
            v_photos, v_attr,
            NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now());
    v_job := rapprocher_job_de_suivi(v_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id, 'import', true));
    UPDATE annonces_plateforme SET inventaire_id = v_new_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_new_inv, 'import', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);

  ELSIF p_decision = 'detache' THEN
    IF a.job_id IS NOT NULL THEN
      SELECT platform_fields INTO v_job_pf FROM cross_post_jobs WHERE id = a.job_id AND user_id = v_user;
      IF v_job_pf ->> 'source' = 'releve' THEN
        -- Job de suivi né du rattachement : il n'a plus de raison d'être.
        UPDATE cross_post_jobs SET status = 'cancelled',
               platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now()),
               error = 'Rattachement défait par l''utilisateur — pas une vente'
         WHERE id = a.job_id AND user_id = v_user;
      ELSIF v_job_pf ? 'listing_url_precedente' THEN
        -- Job recâblé : on rend l'ancienne URL (le veilleur reprendra sa lecture).
        UPDATE cross_post_jobs SET listing_url = v_job_pf ->> 'listing_url_precedente',
               platform_listing_id = v_job_pf -> 'rattachement' ->> 'ancien_listing_id',
               platform_fields = (platform_fields - ARRAY['rattachement', 'listing_url_precedente']) || jsonb_build_object('detache_le', now()),
               last_checked_at = NULL
         WHERE id = a.job_id AND user_id = v_user;
      END IF;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, a.inventaire_id, 'detache', 'utilisateur', jsonb_build_object('job_id', a.job_id));
    RETURN jsonb_build_object('ok', true, 'decision', 'detache');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$$;
REVOKE ALL ON FUNCTION public.rapprochement_decider(uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprochement_decider(uuid, text, bigint) TO authenticated, service_role;
