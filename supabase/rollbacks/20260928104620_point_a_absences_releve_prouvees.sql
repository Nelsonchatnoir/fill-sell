-- Retour arrière du point A : définitions lues en production avant application.
SET statement_timeout='5s';
SET lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_questions jsonb;
  v_vide_non_probant boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : la page lue n'était pas la
  --    liste du compte. Rien n'est traité, rien n'est daté, rien n'est tranché.
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- ── UN RELEVÉ VIDE N'EST JAMAIS UNE PREUVE (2026-09-24) ──────────────────
  -- Il n'a RIEN vu, sur un compte qui avait des annonces ici : ce n'est ni une
  -- preuve de disparition ni une preuve de vente. Pas de disparu_le, pas de
  -- verdict « refusée ». bertin.dr (24/09) : 238 annonces EN LIGNE datées
  -- disparues par un relevé à « 0 vue(s) sur 0 annoncée(s) ».
  -- ⛔ eBAY RELIÉ PAR L'API (2026-09-26) : le relevé ne traite QUE le compte
  --    relié. Chrome connecté à un autre compte, ou identité non prouvée :
  --    ni rattachement, ni import, ni disparition — et le run le dit.
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- Identité prouvée, mais des annonces encore inconnues ont été laissées de
  -- côté : ce relevé n'a pas tout écrit, il ne date aucune disparition.
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;
  -- L'interrupteur, FAIL-CLOSED : absent, illisible ou différent de 1 => aucun import.
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;

  v_questions := revoir_questions_releve(v_user,v_pf,1);
  n_prop := COALESCE((v_questions->>'questions_posees')::integer,0);

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
    -- p_second_releve_requis := false (2026-09-24) : on importe TOUT ce qui est
    -- en ligne et sans candidat dès ce relevé, on rattache ensuite. La règle
    -- du « deuxième relevé » (18/09) laissait un inscrit sans stock jusqu'au
    -- prochain passage — 20 h, ou un clic (laura.rml38, labouquinerie85).
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, false);
    CASE v_res
      WHEN 'job'           THEN n_job := n_job + 1;
      WHEN 'certain'       THEN n_auto := n_auto + 1;
      WHEN 'propose'       THEN n_prop := n_prop + 1;
      WHEN 'notification'  THEN n_notif := n_notif + 1;
      WHEN 'aucune'        THEN n_aucune := n_aucune + 1;
      WHEN 'import_propose' THEN n_prop := n_prop + 1; n_import := n_import + 1;
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
                            'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant);
END;
$function$;

CREATE OR REPLACE FUNCTION public.releve_clos_tranche_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vus      integer;
  v_verdicts jsonb;
BEGIN
  IF COALESCE(NEW.erreur, '') LIKE '[incomplet]%' THEN RETURN NULL; END IF;
  IF releve_hors_liste(NEW.erreur) THEN RETURN NULL; END IF;
  IF NEW.platform = 'ebay' AND releve_ebay_run_incomplet(NEW.id) THEN RETURN NULL; END IF;
  -- (27/09) Ceinture : le run a lu MOINS que ce que la plateforme annonce
  -- (total_entries, écrit par l'extension 0.6.75) → aucun verdict.
  IF NEW.total_entries IS NOT NULL AND COALESCE(NEW.items_vus, 0) < NEW.total_entries THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_vus FROM annonces_plateforme WHERE run_id = NEW.id;
  IF v_vus = 0 AND releve_compte_avait_annonces(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
  BEGIN
    v_verdicts := trancher_publications_sans_lien(NEW.user_id, NEW.platform, NEW.id);
    IF COALESCE((v_verdicts->>'refusees')::int, 0) + COALESCE((v_verdicts->>'en_ligne')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_tranche_publications : run % (%) → %', NEW.id, NEW.platform, v_verdicts;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_tranche_publications : run % : %', NEW.id, SQLERRM;
  END;
  -- ── UN RETRAIT LEBONCOIN SANS LIEN N'ATTEND PAS UNE ANNONCE QUI N'EXISTE PLUS
  --    (27/09, louis « Rangement Blanc », 3275434644) ─────────────────────────
  -- L'identifiant du dépôt est connu (adsubmit) mais le lien, lui, ne vient
  -- jamais : l'annonce n'est plus en ligne (page « Cette annonce est
  -- désactivée »). Un relevé COMPLET de ce compte (gardes ci-dessus), commencé
  -- après la création du retrait, qui ne contient PAS cet identifiant le
  -- prouve : il n'y a rien en ligne à retirer. Le retrait est clos, sans rien
  -- toucher. Beebs n'est pas concerné (ses dépôts n'ont pas d'identifiant, et
  -- la modération ne se juge pas).
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs d SET
        status = 'cancelled',
        error = 'Rien à retirer : cette annonce Leboncoin n''est plus en ligne (absente du relevé complet de tes annonces du '
          || to_char(COALESCE(NEW.finished_at, NEW.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI') || '). Aucune autre annonce n''a été touchée.',
        platform_fields = COALESCE(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
          'retrait_sans_objet', jsonb_build_object('le', now(), 'releve', NEW.id, 'preuve', 'identifiant_absent_du_releve_complet'))
       WHERE d.user_id = NEW.user_id AND d.platform = 'leboncoin' AND d.action = 'delete'
         AND d.status IN ('pending', 'needs_user') AND d.listing_url IS NULL
         AND d.created_at < NEW.started_at
         AND EXISTS (
           SELECT 1 FROM cross_post_jobs p
            WHERE p.user_id = d.user_id AND p.inventaire_id = d.inventaire_id AND p.platform = 'leboncoin'
              AND p.action IN ('publish', 'republish') AND p.platform_listing_id ~ '^[0-9]{6,}$')
         AND NOT EXISTS (
           SELECT 1 FROM cross_post_jobs p
             JOIN annonces_plateforme ap ON ap.user_id = p.user_id AND ap.platform = 'leboncoin' AND ap.listing_id = p.platform_listing_id
            WHERE p.user_id = d.user_id AND p.inventaire_id = d.inventaire_id AND p.platform = 'leboncoin'
              AND p.action IN ('publish', 'republish')
              AND (ap.run_id = NEW.id OR ap.disparu_le IS NULL));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (retraits sans objet) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  -- ── REDÉPÔT INTERROMPU : LA PREUVE EST ARRIVÉE (2026-09-27, famouus-x3) ──
  -- Une republication Leboncoin retirée puis recréée en vain, arrêtée
  -- « annonce peut-être déjà partie — relevé introuvable » (get-pending-jobs),
  -- ne repartait JAMAIS toute seule : la garde ne relit que les jobs pending.
  -- Un relevé COMPLET de ce compte (gardes ci-dessus), COMMENCÉ après le
  -- retrait et après l'essai suspect, la remet en file : get-pending-jobs juge
  -- alors avec CE relevé — aucune annonce apparue → redépôt depuis la copie du
  -- job ; la même annonce, certaine → rattachée, rien redéposé ; un doute →
  -- la question revient. Jamais un redépôt sans cette preuve.
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs j SET
        status = 'pending', error = NULL,
        platform_fields = (j.platform_fields - 'needs_user_source')
          || jsonb_build_object('recreation_relancee_par_releve', jsonb_build_object('le', now(), 'releve', NEW.id))
       WHERE j.user_id = NEW.user_id AND j.platform = 'leboncoin' AND j.action = 'republish' AND j.status = 'needs_user'
         AND j.platform_fields->>'needs_user_source' = 'recreation_deja_partie'
         AND j.platform_fields#>>'{recreation_deja_partie,verdict}' = 'releve_introuvable'
         AND j.platform_fields->>'republish_step' = 'deleted'
         AND NEW.started_at > GREATEST(
               COALESCE((j.platform_fields->>'deleted_at')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_depot_parti,at}')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_deja_partie,le}')::timestamptz, '-infinity'::timestamptz));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (redépôts) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$;

DROP FUNCTION IF EXISTS public.constater_absences_releve(uuid);
DROP FUNCTION IF EXISTS public.releve_preuve_absence(uuid);
