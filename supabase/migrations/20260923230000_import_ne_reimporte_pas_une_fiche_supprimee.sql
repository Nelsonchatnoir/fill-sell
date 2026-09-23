-- ═══════════════════════════════════════════════════════════════════════════
-- L'IMPORT AUTO NE RESSUSCITE PLUS UNE FICHE QUE LE VENDEUR A SUPPRIMÉE
-- (2026-09-23 soir — régression signalée par Louis THONET, Business)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT, LU EN PROD. Louis avait publié ses « rangements yaourtière » sur
-- Beebs/Leboncoin/Opla. Le relevé Beebs importe l'annonce « Rangement Blanc et
-- Vert Pomme… » (listing 32750602) comme un NOUVEL article ; Louis supprime le
-- doublon en gardant l'annonce en ligne (inventaire_supprimer_sans_retrait,
-- 20260918104000) ; cette suppression ré-écrit l'annonce en ligne SANS
-- inventaire_id et SANS ignoree_le ; le relevé suivant la retrouve « sans
-- candidat » et la RÉ-IMPORTE. Cinq lignes rapprochements.decision='import'
-- sur la MÊME annonce (19/09, 20/09, 21/09, 23/09 ×2), cinq jobs
-- « Fiche supprimée du stock, annonce laissée en ligne » en 'cancelled', et
-- autant de doublons dans le stock. Le cycle recommence à chaque relevé.
--
-- LA CAUSE EXACTE — ET CE QUE CE N'EST PAS. Ce n'est PAS une fonction repartie
-- d'un vieux corps : rapprocher_traiter_annonce, rapprocher_importer et
-- rapprocher_classer en prod portent bien toutes leurs règles (jumeau 20/09,
-- notification 19/09, faisceau 18/09). C'est une INTERACTION que personne
-- n'avait vue : le « supprimer la fiche, garder l'annonce » du 18/09 a été
-- écrit quand l'import automatique était MORT (il l'est resté du 19/09 au
-- 23/09). Sa promesse — « le relevé suivant retrouvera l'annonce dans l'écran
-- à rattacher, il n'en créera pas une deuxième » — supposait que RIEN ne
-- l'importait tout seul. L'import rétabli le 23/09 (20260923180000) fait
-- exactement ça : il ré-importe une annonce que le vendeur venait de retirer
-- de son stock. Les deux règles, chacune juste, se combattent.
--
-- CE QUE FAIT CETTE MIGRATION, ET RIEN D'AUTRE. Une SEULE condition ajoutée au
-- bloc d'import automatique de rapprocher_traiter_annonce : on n'IMPORTE PLUS
-- AUTOMATIQUEMENT une annonce qui porte DÉJÀ une décision 'import' (elle a
-- donc été importée une fois, et si elle est redevenue « sans candidat » c'est
-- que sa fiche a été supprimée — c'est le choix du vendeur, on le respecte).
-- L'annonce reste VISIBLE dans « à rattacher », le vendeur peut la rattacher à
-- son vrai article ou la ré-importer à la MAIN (rapprocher_importer(…,
-- 'utilisateur'), chemin séparé, NON gardé). L'annonce_id est stable d'un
-- relevé à l'autre (upsert sur la clé annonces_plateforme_unique =
-- user_id, platform, listing_id), donc la trace 'import' persiste.
--
-- ⛔ ZÉRO RÉGRESSION, par construction. La condition n'est ÉVALUÉE À true que
--    si une décision 'import' existe déjà pour CETTE annonce. Un premier import
--    n'en a aucune → la condition passe → il s'importe comme avant. Seul le
--    RÉ-import (la boucle) est bloqué. Le corps ci-dessous est COPIÉ MOT POUR
--    MOT de pg_get_functiondef('rapprocher_traiter_annonce') en prod le 23/09
--    (md5 b7a9f5b8d140ef1a01b3e445adc60c36) ; la seule différence est la
--    condition marquée « ⛔ 2026-09-23 » et son commentaire.
-- ⛔ AUCUNE table, AUCUNE policy touchée. Advisors relevés avant/après.
-- ⛔ La réparation du parc (doublons déjà créés, descriptions, dédoublonnage)
--    est faite À PART, en données, jamais dans cette migration.

CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── CERTAIN : un seul candidat, titre exact, prix égal, aucun homonyme ──
  IF v_bande = 'certain' THEN
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'auto',
                                      v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
                                       v_trace || jsonb_build_object('annonce_id', a.id, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score'));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'automatique', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    RETURN 'certain';
  END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-23 — QUATRIÈME CONDITION : jamais deux fois. Une annonce qui
     --    porte déjà une décision 'import' a déjà été importée une fois ; si
     --    elle est redevenue « sans candidat », c'est que le vendeur a supprimé
     --    sa fiche (en gardant l'annonce en ligne) — on ne la ressuscite pas.
     --    Elle reste dans « à rattacher » ; le vendeur la rattache ou la
     --    ré-importe à la main (rapprocher_importer(…, 'utilisateur'), non gardé).
     AND NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'import')
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;
