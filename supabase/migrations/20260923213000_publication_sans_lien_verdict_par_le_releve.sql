-- ═══════════════════════════════════════════════════════════════════════════
-- UN DÉPÔT SANS LIEN N'EST PLUS UN SABLIER INFINI (2026-09-23 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ. Louis (Business) : deux dépôts Leboncoin du 21/09,
-- refusés à la vérification. Chez nous : 'published', listing_url NULL,
-- platform_listing_id posé (3274251003, 3274252224). L'app disait
-- « Récupération du lien en cours… » pendant 48 h, puis « Lien d'annonce
-- introuvable — retire-la sur Leboncoin » — SANS AUCUNE action possible. Et le
-- balayage de nuit (20260923113000) ne clôt JAMAIS un job qui porte son
-- identifiant. Bloqués à vie. Même état chez jocabroc8 ×2, meminiandmove ×1,
-- arribat.lucie ×1, tomcarter13700 ×1 (relevé du 23/09 à 19:00).
--
-- LA PREUVE EXISTAIT DÉJÀ EN BASE. Le relevé « Mes annonces » de Louis passe
-- par l'adresse (dashboard/v1/search, include_inactive:true), il est COMPLET
-- (102/102, trois fois depuis la publication) — et ses deux identifiants n'y
-- sont NULLE PART (annonces_plateforme, tout statut confondu). Une annonce
-- absente d'un relevé complet du compte, deux heures ou plus après son dépôt,
-- n'est pas en ligne : la plateforme l'a refusée (ou elle a été retirée).
--
-- CE QUE FAIT CE LOT, ET RIEN D'AUTRE :
--   1. trancher_publications_sans_lien(user, plateforme, run) : pour chaque
--      dépôt 'published' sans lien de cette plateforme —
--        · identifiant certain (platform_listing_id, ou l'id du dépôt
--          lbc_depot.adsubmit / sans_adsubmit, ≥ 6 chiffres) ; sans lui, rien ;
--        · l'identifiant est dans le relevé du compte AVEC un lien, en ligne
--          → EN LIGNE : listing_url posé (lien_retrouve_par_identifiant) ;
--        · l'identifiant est dans un relevé (autre statut) → on attend ;
--        · absent de TOUT relevé, et CE relevé est done, complet (pas
--          « [incomplet] »), a lu quelque chose (ou dit « [vide] »), et a
--          commencé ≥ 2 h après la publication → REFUSÉE : status 'failed',
--          message qui dit la preuve, publication rendue par
--          refund_publish_unconfirmed (idempotent — c'est la fonction du
--          balayage de nuit, même ordre : rembourser puis passer 'failed').
--      L'app rend alors ses deux gestes habituels sur un échec : « Relancer »
--      (le même job repart, zéro débit) et « Abandonner cette plateforme ».
--   2. rapprocher_releve l'appelle en fin de relevé COMPLET, dans un bloc
--      EXCEPTION : un verdict qui échoue ne fait jamais échouer le relevé.
--
-- ⛔ AUCUNE republication ici, jamais. ⛔ Rien sur les jobs sans identifiant :
--    ils restent au balayage de nuit, qui les connaît. ⛔ Aucune table, aucune
--    policy touchée. SECURITY DEFINER comme le balayage et le rapprochement
--    (elle écrit sur des lignes que le relevé, sous RLS, ne verrait pas
--    toutes ; le garde auth.uid() est celui de rapprocher_releve, l'appelant).
--    Advisors relevés avant/après : 257 sécurité / 211 perf, identiques.

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- La preuve exigée : un relevé DONE, COMPLET, qui a lu quelque chose (ou
  -- qui dit « vide » — un compte sans annonce est un relevé réussi à 0).
  IF v_run.status <> 'done'
     OR COALESCE(v_run.erreur, '') LIKE '[incomplet]%'
     OR NOT (COALESCE(v_run.items_vus, 0) > 0 OR COALESCE(v_run.erreur, '') LIKE '[vide]%') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'releve_non_probant', 'refusees', 0, 'en_ligne', 0, 'en_attente', 0);
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Le relevé doit avoir commencé ≥ 2 h après la publication : la
    -- vérification de la plateforme a eu le temps de rendre son verdict.
    IF COALESCE(v_run.started_at, v_run.finished_at) < j.publie + interval '2 hours' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- REFUSÉE. Rembourser d'abord (idempotent), passer 'failed' ensuite —
    -- l'ordre du balayage de nuit, et le trigger de réservation fait le reste.
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a pas mis cette annonce en ligne — refusée à la vérification (ou retirée depuis) : '
      || 'elle n''apparaît pas dans tes annonces ' || v_nom || ' (relevé complet du ' || v_releve_txt
      || ', ' || COALESCE(v_run.items_vus, 0)::text || ' annonce' || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || ' lue'
      || CASE WHEN COALESCE(v_run.items_vus, 0) > 1 THEN 's' ELSE '' END || '). Rien n''est en ligne'
      || CASE WHEN COALESCE((v_refund ->> 'rembourse')::int, 0) > 0 THEN ', la publication t''est rendue' ELSE '' END
      || '. Tu peux la relancer d''ici, ou abandonner ' || v_nom || ' pour cet article.';
    UPDATE cross_post_jobs SET
      status = 'failed',
      error = v_msg,
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'verdict_moderation', jsonb_build_object(
          'verdict', 'refusee', 'preuve', 'absente_du_releve_complet',
          'run_id', p_run_id, 'releve_le', COALESCE(v_run.finished_at, v_run.started_at),
          'annonces_lues', COALESCE(v_run.items_vus, 0),
          'publie_le', j.publie, 'identifiants', to_jsonb(v_ids),
          'refund', v_refund, 'le', now()))
     WHERE id = j.id;
    n_refusees := n_refusees + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$$;
REVOKE ALL ON FUNCTION public.trancher_publications_sans_lien(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trancher_publications_sans_lien(uuid, text, uuid) TO service_role;

-- ── rapprocher_releve : corps du 20260923180000, plus l'appel en fin de relevé complet ──
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text; v_vus text[];
  v_id uuid; v_res text;
  n_job integer := 0; n_auto integer := 0; n_prop integer := 0; n_disp integer := 0; n_aucune integer := 0;
  n_notif integer := 0; n_import integer := 0; n_refus integer := 0; n_restantes integer := 0; n_sautees integer := 0;
  v_complet boolean; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_budget interval := rapprocher_budget(0.7, interval '60 seconds');
  v_budget_epuise boolean := false;
  v_verdicts jsonb := NULL;
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

  FOR v_id IN
    SELECT a.id FROM annonces_plateforme a
    WHERE a.run_id = p_run_id AND a.user_id = v_user AND a.platform = v_pf
      AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL
      -- Déjà traitée pour CE run (appel précédent arrêté au budget, puis
      -- rappel de l'extension) : on ne la rejoue pas, on avance.
      AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.detail ->> 'run_id' = p_run_id::text)
    -- Les annonces les MOINS évaluées d'abord : si un relevé précédent s'est
    -- arrêté au budget, sa queue passe devant. Au premier relevé tout est à 0
    -- et l'ordre est celui de toujours (vu_le).
    ORDER BY (SELECT count(*) FROM rapprochements r WHERE r.annonce_id = a.id), a.vu_le
  LOOP
    IF v_budget_epuise OR clock_timestamp() - v_debut > v_budget THEN
      v_budget_epuise := true; n_restantes := n_restantes + 1; CONTINUE;
    END IF;
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, true);
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import'        THEN n_aucune := n_aucune + 1; n_import := n_import + 1;
      WHEN 'import_refuse' THEN n_aucune := n_aucune + 1; n_refus := n_refus + 1;
      ELSE n_sautees := n_sautees + 1;
    END CASE;
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

  -- ── LE RELEVÉ TRANCHE LES PUBLICATIONS SANS LIEN (2026-09-23 soir) ─────────
  -- Un dépôt 'published' sans lien mais AVEC identifiant ne pouvait plus jamais
  -- être clos (balayage de nuit : « un job qui porte son identifiant n'est
  -- jamais "sans lien" »). Or ce relevé-ci, quand il est COMPLET, est la preuve
  -- qui manquait : l'annonce y est (EN LIGNE, lien posé) ou n'y est pas
  -- (REFUSÉE à la vérification, ou retirée). Jamais bloquant pour le relevé.
  IF v_complet THEN
    BEGIN
      v_verdicts := trancher_publications_sans_lien(v_user, v_pf, p_run_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trancher_publications_sans_lien(%) : %', p_run_id, SQLERRM;
      v_verdicts := jsonb_build_object('ok', false, 'erreur', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'verdicts', v_verdicts,
                            'par_job', n_job, 'auto', n_auto, 'proposees', n_prop, 'sans_candidat', n_aucune,
                            'importees', n_import, 'import_refusees', n_refus,
                            'ecartees_notification', n_notif,
                            'restantes', n_restantes, 'budget_epuise', v_budget_epuise, 'sautees', n_sautees,
                            'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
