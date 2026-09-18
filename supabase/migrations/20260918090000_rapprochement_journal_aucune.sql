-- ═══════════════════════════════════════════════════════════════════════════
-- LA BANDE « AUCUNE » ENTRE AU JOURNAL (2026-09-18, point 5.2, GO de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré ce matin : 81 annonces relevées et capturées portent inventaire_id
-- NULL ET proposition NULL. Elles SONT visibles à l'écran (bloc « Mes annonces
-- en ligne » › « Rattacher N annonces » › écran « Annonces à rattacher », avec
-- ses trois boutons Choisir / Importer / Ignorer) — mais elles ne laissent
-- AUCUNE trace mesurable : dans rapprocher_releve, la bande « aucune » se
-- contentait d'incrémenter un compteur en mémoire (n_aucune), sans INSERT.
-- Conséquence : on ne peut pas répondre a posteriori à « combien d'annonces
-- n'ont trouvé aucun candidat, et pourquoi ».
--
-- ⛔ CETTE MIGRATION PASSE EN PREMIER, AVANT L'ÉLARGISSEMENT DU FAISCEAU
--    (20260918091000). C'est la consigne, et elle est juste : sans le journal
--    posé AVANT, on n'a pas de point de comparaison pour mesurer ce que
--    l'élargissement change réellement.
--
-- UNE LIGNE PAR (ANNONCE, RUN), et c'est voulu : c'est ce qui permet de dire
-- « au run du 18/09 il y avait 81 orphelines, à celui du 19/09 il y en a 12 ».
-- Une seule ligne par annonce perdrait exactement la mesure demandée.
--
-- Rien d'autre ne change : ni le rattachement par identifiant (67 lignes,
-- score 1,00 — il marche, on n'y touche pas), ni la bande « certain » et ses
-- trois filtres (candidat unique + prix égal au centime + aucun homonyme),
-- ni les propositions, ni les disparitions.

-- La colonne `decision` est bornée par un CHECK : « aucune » doit y entrer.
-- Idempotent : on retire puis on repose.
ALTER TABLE public.rapprochements DROP CONSTRAINT IF EXISTS rapprochements_decision_check;
ALTER TABLE public.rapprochements ADD CONSTRAINT rapprochements_decision_check
  CHECK (decision = ANY (ARRAY['attache', 'propose', 'refus_proposition', 'ignore', 'import', 'detache', 'aucune']));

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
  v_complet boolean;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';

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
      -- Vue en ligne dans « Mes annonces » : un drapeau « plus en ligne » posé
      -- entre-temps par le veilleur était une fausse alerte — levé, archivé.
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
      -- Rien sur les jobs : la proposition vit sur l'annonce, c'est SON bouton.
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                              'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb), 'run_id', p_run_id, 'at', now()),
             updated_at = now()
       WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, jsonb_build_object('job_id', v_job, 'run_id', p_run_id, 'motif', v_cl ->> 'motif'));
      n_prop := n_prop + 1;
    ELSE
      -- AUCUN CANDIDAT. L'annonce reste visible à l'écran (elle n'a jamais
      -- cessé de l'être) et, désormais, elle laisse une trace datée : c'est
      -- elle qui dira si l'élargissement du faisceau a servi à quelque chose.
      -- `par` = 'auto' (le moteur), `score` = 0, `motif` = ce que
      -- rapprocher_classer a conclu ('aucun_candidat' ou 'sans_titre').
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
              jsonb_build_object('run_id', p_run_id, 'motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'),
                                 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
      n_aucune := n_aucune + 1;
    END IF;
  END LOOP;

  -- Disparitions : les annonces de cette plateforme non revues par un relevé
  -- COMPLET. Aucun signal de vente ici — c'est le veilleur qui tranche sur les
  -- jobs, avec ses propres règles ; on date seulement l'annonce.
  IF v_complet THEN
    UPDATE annonces_plateforme SET disparu_le = now(), updated_at = now()
     WHERE user_id = v_user AND platform = v_pf AND disparu_le IS NULL
       AND run_id IS DISTINCT FROM p_run_id AND vu_le < COALESCE(v_run.started_at, now());
    GET DIAGNOSTICS n_disp = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
