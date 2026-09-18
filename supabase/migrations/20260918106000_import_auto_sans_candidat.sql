-- ═══════════════════════════════════════════════════════════════════════════
-- IMPORT AUTOMATIQUE DES ANNONCES SANS CANDIDAT (2026-09-18, point F)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico : une annonce dont on est sûr qu'elle est indépendante
-- entre dans le stock toute seule. Au pire on aura mis en place de quoi
-- rattacher après coup — c'est le point B, livré juste avant.
--
-- LES TROIS CONDITIONS, NON NÉGOCIABLES, ET OÙ CHACUNE EST ÉCRITE :
--   1. B EST EN PLACE : inventaire_fusionner / inventaire_defusionner sont
--      livrées (20260918102000). Sans elles, une erreur d'import ne se répare
--      pas. Cette migration ne peut pas s'appliquer avant, elle les suppose.
--   2. `statut_plateforme = 'en_ligne'` UNIQUEMENT. Une annonce en
--      vérification, désactivée, vendue ou de statut inconnu n'entre pas.
--   3. DEUXIÈME relevé au moins. On exige une ligne 'aucune' déjà journalisée
--      pour CETTE annonce, venue d'un AUTRE run (le journal du point 2, posé
--      ce matin, est ce qui rend la règle mesurable). L'annonce a donc survécu
--      à un cycle complet : elle est réelle, et l'utilisateur n'y a pas touché
--      entre-temps — s'il l'avait rattachée ou ignorée, rapprocher_releve ne
--      la reverrait même pas (il saute inventaire_id NOT NULL et ignoree_le).
-- Et ça passe APRÈS le second tour par faisceau, jamais avant : la bande
-- 'aucune' n'est atteinte que lorsque le faisceau n'a rien trouvé. Une annonce
-- qui a un candidat plausible se PROPOSE, elle ne s'importe pas.
--
-- L'INTERRUPTEUR, fail-closed comme les autres (opla_ouvert,
-- sync_multi_ouverte) : `coin_config.import_auto_ouvert`. Clé absente,
-- illisible ou ≠ 1 ⇒ rien ne s'importe. Un seul UPDATE suffit à tout arrêter.
--
-- ⛔ SOUVENIR D'AOÛT (sync multi-comptes Vinted, inventaire gonflé) : le pire
--    scénario acceptable est un inventaire FAUX ET RÉPARABLE, jamais une
--    annonce perdue. D'où : l'article importé garde
--    annonces_plateforme.inventaire_id (un pointeur, pas une copie), il reste
--    détachable ('detache'), fusionnable (point B), et l'annonce n'est jamais
--    retirée ni déclarée vendue par ce chemin.
-- ⛔ AUCUN QUOTA, AUCUNE FILE DE PUBLICATION : l'article entre en statut
--    'stock' avec origine 'releve_<plateforme>'. Le job créé est un job de
--    SUIVI ('published' dès l'insert, handler_build 'releve-annonces',
--    platform_fields.source = 'releve') — l'extension ne tire que les jobs
--    'pending', il n'entrera jamais dans une file de dépôt.

INSERT INTO coin_config (key, value) VALUES ('import_auto_ouvert', 1)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── LE GESTE D'IMPORT, EXTRAIT — une seule écriture pour les deux appelants ──
-- Il vivait en dur dans rapprochement_decider ; l'automatique doit faire
-- EXACTEMENT la même chose, et deux copies dériveraient.
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;
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
                          description, marque, first_seen_at, last_synced_at)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now());
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

-- ── rapprochement_decider : l'import manuel passe par le MÊME geste ─────────
-- Seule la branche 'import' change ; les cinq autres sont mot pour mot celles
-- du 17/09. Deux copies du même insert auraient dérivé au premier correctif.
CREATE OR REPLACE FUNCTION public.rapprochement_decider(p_annonce_id uuid, p_decision text, p_inventaire_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a annonces_plateforme%ROWTYPE;
  v_inv bigint; v_job uuid; v_job_pf jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = v_user;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);
    IF v_inv IS NULL OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable');
    END IF;
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
    RETURN rapprocher_importer(v_user, a.id, 'utilisateur');

  ELSIF p_decision = 'detache' THEN
    IF a.job_id IS NOT NULL THEN
      SELECT platform_fields INTO v_job_pf FROM cross_post_jobs WHERE id = a.job_id AND user_id = v_user;
      IF v_job_pf ->> 'source' = 'releve' THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
               platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now()),
               error = 'Rattachement défait par l''utilisateur — pas une vente'
         WHERE id = a.job_id AND user_id = v_user;
      ELSIF v_job_pf ? 'listing_url_precedente' THEN
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

-- ── rapprocher_releve : la bande « aucune » peut désormais IMPORTER ─────────
-- Seule la branche ELSE change. Les bandes 'job', 'certain' et 'propose' sont
-- mot pour mot celles d'avant. La proposition emporte en plus les clés nées
-- aujourd'hui (candidats_total, signaux, choix_arbitraire) : sans elles,
-- l'app ne pourrait pas dire pourquoi le moteur hésite.
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text;
  v_vus text[];
  a record; v_cl jsonb; v_bande text;
  v_job uuid; v_inv bigint;
  n_job integer := 0; n_auto integer := 0; n_prop integer := 0; n_disp integer := 0; n_aucune integer := 0;
  n_import integer := 0;
  v_complet boolean;
  v_import_ouvert boolean;
  v_imp jsonb;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
  -- L'interrupteur, FAIL-CLOSED : absent, illisible ou différent de 1 => aucun import.
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;

  FOR a IN
    SELECT * FROM annonces_plateforme
    WHERE run_id = p_run_id AND user_id = v_user AND platform = v_pf
      AND inventaire_id IS NULL AND ignoree_le IS NULL
    ORDER BY vu_le
  LOOP
    v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, v_vus);
    v_bande := v_cl ->> 'bande';
    v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
    v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;
    IF v_bande = 'job' THEN
      UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, jsonb_build_object('job_id', v_job, 'run_id', p_run_id));
      IF a.statut_plateforme = 'en_ligne' THEN
        UPDATE cross_post_jobs
           SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                                 || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', p_run_id, 'at', now()))
         WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
      END IF;
      n_job := n_job + 1;
    ELSIF v_bande = 'certain' THEN
      IF v_job IS NOT NULL THEN
        PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'auto', jsonb_build_object('run_id', p_run_id, 'annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
      ELSE
        v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
                                         jsonb_build_object('run_id', p_run_id, 'annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
      END IF;
      UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'automatique', proposition = NULL, updated_at = now() WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'attache', 'auto', (v_cl ->> 'score')::numeric, jsonb_build_object('job_id', v_job, 'run_id', p_run_id, 'motif', v_cl ->> 'motif'));
      n_auto := n_auto + 1;
    ELSIF v_bande = 'propose' THEN
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                              'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                              'candidats_total', v_cl -> 'candidats_total',
                                              'signaux', v_cl -> 'signaux',
                                              'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                              'run_id', p_run_id, 'at', now()),
             updated_at = now()
       WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, jsonb_build_object('job_id', v_job, 'run_id', p_run_id, 'motif', v_cl ->> 'motif'));
      n_prop := n_prop + 1;
    ELSE
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
              jsonb_build_object('run_id', p_run_id, 'motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'),
                                 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
      n_aucune := n_aucune + 1;
      -- ── IMPORT AUTOMATIQUE (point F) — les trois conditions, ici ──────────
      -- L'interrupteur ; l'annonce est EN LIGNE ; elle était DÉJÀ sans candidat
      -- à un run PRÉCÉDENT (la ligne qu'on vient d'écrire porte p_run_id, elle
      -- est donc exclue par le test). Elle a survécu à un cycle complet sans
      -- que l'utilisateur la rattache ni l'ignore — sinon la boucle ne la
      -- verrait même pas (elle saute inventaire_id NOT NULL et ignoree_le).
      IF v_import_ouvert
         AND a.statut_plateforme = 'en_ligne'
         AND EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> p_run_id::text)
      THEN
        v_imp := rapprocher_importer(v_user, a.id, 'auto');
        IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN n_import := n_import + 1; END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_complet THEN
    UPDATE annonces_plateforme SET disparu_le = now(), updated_at = now()
     WHERE user_id = v_user AND platform = v_pf AND disparu_le IS NULL
       AND run_id IS DISTINCT FROM p_run_id AND vu_le < COALESCE(v_run.started_at, now());
    GET DIAGNOSTICS n_disp = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'importees', n_import, 'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
