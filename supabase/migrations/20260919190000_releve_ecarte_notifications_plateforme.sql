-- ═══════════════════════════════════════════════════════════════════════════
-- UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT. Le relevé eBay de Lohan du 19/09 à 14h53 a ramassé le PANNEAU DE
-- NOTIFICATIONS d'eBay en même temps que ses annonces, et le moteur a rangé
-- deux de ces lignes dans son stock, en statut `stock` :
--     « AFFAIRE SUIVIE - RAPPEL »  → inventaire 1789822394141
--     « OFFRE REFUSÉE »            → inventaire 1789822394156
-- Ni prix, ni description. Il les voit comme des articles.
--
-- LA SIGNATURE, ET POURQUOI C'EST ELLE ET PAS AUTRE CHOSE.
-- Les liens du panneau portent `_trkparms` avec un `ni_nt=` — le TYPE de
-- notification : WATCHITM_GTC, BEST_OFFER_DECLINED, OFFER_EXPIRED,
-- WATCH_ITEM_ENDING_SOON. Les vraies annonces du même relevé ont une URL nue
-- (`ebay.fr/itm/<id>`).
--   ⛔ PAS sur le TITRE : « OFFRE REFUSÉE » est du texte d'interface, traduit
--      et susceptible de changer demain. L'URL est la preuve.
--   ⛔ PAS sur l'absence de prix ou de photo : une vraie annonce mal relevée
--      en manquerait aussi (on en a 30 par relevé).
--   ⛔ PAS sur `_trkparms` SEUL : c'est un paramètre de tracking générique
--      qu'eBay colle sur quantité de liens légitimes. Le discriminant est
--      `ni_nt` (notification type), qui n'existe QUE dans le panneau.
--      Vérifié sur le parc entier : les 7 lignes qui portent `_trkparms`
--      portent TOUTES `ni_nt`, et aucune ligne ne porte `ni_nt` sans être une
--      notification. Le critère le plus étroit attrape exactement les mêmes.
--
-- OÙ LE FILTRE EST POSÉ, ET POURQUOI ICI. Le relevé se fait en deux temps :
-- l'extension écrit les lignes brutes dans `annonces_plateforme`
-- (background.js, upsert PostgREST), PUIS appelle le moteur serveur
-- `rapprocher_releve(run)`. C'est le moteur qui rattache, propose et fait
-- entrer dans l'inventaire — les trois chemins d'import
-- (rapprocher_importer, annonces_capture, import_auto_sans_candidat) sont du
-- SQL serveur. Le filtre est donc posé DANS le moteur : il part tout de suite,
-- sans paquet CWS, et couvre les trois chemins d'un coup.
-- ⚠️ Réserve assumée : la ligne polluée continuera d'ATTERRIR dans
-- annonces_plateforme tant que l'extension n'est pas mise à jour. Elle n'ira
-- simplement plus jusqu'au stock.
--
-- CE QUE DEVIENT UNE ENTRÉE ÉCARTÉE — comptée et nommée, jamais jetée en
-- silence :
--   · `ignoree_le` est daté : elle sort de la liste « Rattacher N annonces »
--     et des trois chemins d'import, qui filtrent tous `ignoree_le IS NULL` ;
--   · une ligne `rapprochements` la trace, decision='ignore', par='auto',
--     motif='notification_plateforme', avec le type de notification lu dans
--     l'URL — on saura toujours ce qui a été écarté et pourquoi ;
--   · le rapport de run rend `ecartees_notification`.
-- La LIGNE N'EST PAS SUPPRIMÉE : si le filtre se trompe un jour, tout est là.

-- ── Le discriminant, isolé pour être lisible et testable ────────────────────
CREATE OR REPLACE FUNCTION public.annonce_lien_notification(p_url text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(p_url, '') ~ 'ni_nt(%3A|%3a|:|=)';
$$;

COMMENT ON FUNCTION public.annonce_lien_notification(text) IS
  'Vrai si l''URL vient du panneau de notifications d''une plateforme (marqueur ni_nt d''eBay) et non d''une annonce. Sert à écarter ces lignes du rattachement et de l''import.';

-- ── Le moteur, avec le filtre en tête de boucle ─────────────────────────────
-- Corps repris de 20260918090000_rapprochement_journal_aucune.sql. SEULE
-- MODIFICATION : le bloc « notification » ci-dessous et le compteur
-- n_notif / `ecartees_notification` dans le retour. Rien d'autre n'a bougé.
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
  n_notif integer := 0;
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
    -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) ────────────────
    -- Avant toute classification : si le lien vient du panneau de
    -- notifications, la ligne sort du circuit. Écartée, datée, nommée.
    IF annonce_lien_notification(a.url) THEN
      UPDATE annonces_plateforme
         SET ignoree_le = now(), proposition = NULL, updated_at = now()
       WHERE id = a.id;
      INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
      VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
              jsonb_build_object('run_id', p_run_id, 'motif', 'notification_plateforme',
                                 'platform', v_pf, 'titre', a.titre,
                                 'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
      n_notif := n_notif + 1;
      CONTINUE;
    END IF;

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
                            'ecartees_notification', n_notif,
                            'disparues', n_disp, 'complet', v_complet);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_releve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rapprocher_releve(uuid) TO authenticated, service_role;
