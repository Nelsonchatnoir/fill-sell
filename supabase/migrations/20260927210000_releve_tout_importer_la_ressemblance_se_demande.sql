-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT SYNCHRO (27/09/2026) — TOUTE ANNONCE EN LIGNE ENTRE DANS LE STOCK ;
-- UNE RESSEMBLANCE SE DEMANDE, ELLE NE RETIENT RIEN
-- ═══════════════════════════════════════════════════════════════════════════
-- MESURÉ le 27/09 au soir (129 comptes actifs, dernier relevé complet de
-- chaque compte) : 784 annonces EN LIGNE hors du stock, en attente d'une
-- réponse — Opla 535, Leboncoin 90, eBay 83, Beebs 76. Deux chemins :
--   · la bande « propose » du moteur (faisceau 304, plusieurs candidats 174,
--     homonymes 161, prix différent 49) : la proposition vivait sur
--     l'annonce, rien n'entrait dans le stock ;
--   · les deux gardes de rapprocher_importer (titre inclus 20/09 : 59 ;
--     homonyme en stock/vendu 26/09 : 37) : l'import était REFUSÉ, « jumeau(x)
--     proposé(s) » dans le bilan des relevés de Louis.
-- Et labouquinerie85 : La présidente, Triominos, Solaris déjà VENDUS sur
-- Vinted quand le relevé Opla les a vus ; rien ne reliait l'annonce Opla à la
-- vente, qui n'a jamais pu se propager.
--
-- CE QUI CHANGE :
-- 1. rapprocher_traiter_annonce : bande « propose » → la proposition est
--    posée comme avant, PUIS l'annonce est importée (mêmes conditions que
--    l'import d'une annonce sans candidat : interrupteur import_auto_ouvert,
--    annonce en_ligne, fiche jamais supprimée exprès par la personne).
-- 2. rapprocher_importer : plus aucun refus pour ressemblance. La fiche est
--    créée, et la ressemblance devient la question « Est-ce le même
--    article ? » (inventaire_doublons, source 'releve') : homonyme exact (en
--    stock OU VENDU) d'abord, sinon la proposition du moteur, sinon le titre
--    inclus. Le geste manuel (p_par = 'utilisateur') ne change pas.
-- 3. releve_poser_question (nouvelle) : pose la question, jamais deux fois la
--    même paire (index unique de la paire).
-- 4. armer_retraits_copies : TOUTES les annonces vivantes de la fiche sur une
--    plateforme partent après une vente (avant : une seule par plateforme ;
--    Louis, Beebs, 27/09 : la seconde est restée en vente).
-- 5. rapprochement_photos_decider (c) : une question « déjà vendu ? »
--    (homonyme_vendu) n'est pas déclarée caduque parce que la fiche gardée
--    est vendue — c'est sa nature.
-- 6. inventaire_doublon_decider : « oui » à une paire dont la fiche gardée
--    est VENDUE → fusion comme avant, PUIS ses annonces encore en ligne
--    partent (armer_retraits_copies, chemin 'doublon_vendu_confirme') : geste
--    explicite de la personne + vente prouvée.
-- DÉCISIONS DE NICO (27/09 soir, intégrées avant application) :
-- 7. « titre identique + même prix + un seul candidat » ne rattache
--    qu'ENTRE PLATEFORMES DIFFÉRENTES : un candidat de la même plateforme est
--    un autre exemplaire → import, sans question (rangements de Louis).
-- 8. jamais de question entre deux fiches dont la candidate porte déjà une
--    annonce sur la même plateforme ; le balayage (inventaire_doublon_evaluer)
--    écarte deux fiches qui portent chacune une annonce vivante sur la même
--    plateforme (ni fusion, ni question).
-- 9. une fiche VENDUE est comparée au relevé : annonce d'une autre plateforme
--    au titre EXACT d'une fiche vendue, seule de ce titre → rattachée à la
--    fiche vendue, retrait armé (chemin releve_fiche_vendue).
--
-- CE QUI NE CHANGE PAS (décision à confirmer par Nico) : le rattachement
-- automatique sur IDENTIFIANT (bandes job / job_clos) et la bande « certain »
-- (titre EXACT + prix ÉGAL + un seul candidat + aucun homonyme : 2 461
-- rattachements en 14 jours sur 30 comptes) ; le balayage des doublons
-- (fusion automatique « certain », dont la remise en ligne Vinted validée le
-- 25/09). Les annonces Vinted (dressing écrit par l'extension) ne passent pas
-- par ce moteur.
--
-- Garde : chaque fonction réécrite doit avoir en prod le md5 relevé le 27/09
-- au soir ; sinon rien n'est changé. Idempotent (CREATE OR REPLACE). Droits
-- inchangés ; la nouvelle fonction : service_role seul.
-- ═══════════════════════════════════════════════════════════════════════════


DO $garde$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('inventaire_doublon_evaluer', '8c9fcccf5d347ffccaea41df2944bbba'),
      ('rapprocher_traiter_annonce', '1166fd095d2284b624c75fdd9408111b'),
      ('rapprocher_importer', '7724f5bda1d81c783db19be6f1530a9b'),
      ('armer_retraits_copies', 'baafac7f5d30e8c6567c13d9eca5974f'),
      ('rapprochement_photos_decider', '9a306a732dfeba70eadf2ac80a1f9fae'),
      ('inventaire_doublon_decider', '80423727e2c33c961734e970921c3960')) AS t(nom, md5_attendu)
  LOOP
    IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = r.nom) IS DISTINCT FROM r.md5_attendu THEN
      RAISE EXCEPTION 'garde md5 : % a changé en prod depuis le relevé du 27/09 soir, migration arrêtée', r.nom;
    END IF;
  END LOOP;
END
$garde$;


CREATE OR REPLACE FUNCTION public.releve_poser_question(p_user uuid, p_existante bigint, p_nouvelle bigint, p_motif text, p_preuves jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- (2026-09-27, audit synchro) La question « Est-ce le même article ? » entre
-- une fiche existante (gardée si « oui ») et la fiche que le relevé vient de
-- créer. Jamais un rattachement : l'écran Doublons la pose, la personne
-- tranche (inventaire_doublon_decider). Une paire déjà tranchée (refusée,
-- défaite, fusionnée) n'est jamais reposée : l'index unique de la paire le
-- garantit (ON CONFLICT DO NOTHING).
BEGIN
  IF p_user IS NULL OR p_existante IS NULL OR p_nouvelle IS NULL OR p_existante = p_nouvelle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_existante AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_nouvelle AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES (p_user, p_existante, p_nouvelle, 'probable', 'proposee', COALESCE(p_motif, 'releve'), COALESCE(p_preuves, '{}'::jsonb), 'releve')
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$function$;


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
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
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

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- ── CERTAIN : un seul candidat, titre exact, prix égal, aucun homonyme ──
  -- (2026-09-27, décision de Nico) « titre identique + même prix + un seul
  -- candidat » ne rattache qu'ENTRE PLATEFORMES DIFFÉRENTES. Un candidat qui
  -- est un dépôt de la MÊME plateforme, c'est un AUTRE exemplaire (les 11
  -- rangements de Louis sur Beebs) : l'annonce est importée comme sa propre
  -- fiche, jamais rattachée, jamais proposée à la fusion.
  IF v_bande = 'certain' AND v_job IS NOT NULL THEN
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    END IF;
    RETURN 'aucune';
  END IF;
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
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
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
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    END IF;
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
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : jamais d'article créé depuis
  --    une annonce que rien ne prouve être au vendeur — geste manuel compris
  --    (Louis, 19/09 : une balance Wii d'un autre vendeur importée à la main).
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le relevé du 19/09 a créé trois lignes d'inventaire neuves pour trois
  -- articles déjà présents : le faisceau compare les titres MOT À MOT, et un
  -- préfixe de référence (« FIG001 - Jeux/Jouets - ») fait tomber le
  -- recouvrement sous la barre. L'annonce finit dans la bande « aucune »,
  -- seule bande où l'import automatique crée sans demander.
  -- On ajoute l'inclusion d'un titre dans l'autre, aux frontières de mots,
  -- les deux normalisés à plus de 12 caractères. Mesuré sur 200 annonces non
  -- rattachées tirées au hasard : 3 gagnent un candidat, et les trois sont
  -- justes ; 108 avaient déjà un titre exact (inchangées) ; 89 ne bougent pas.
  -- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS : au lieu de créer, on POSE la
  --    proposition sur l'annonce (motif `titre_inclus`) — l'écran de
  --    rattachement affiche « C'est peut-être… » avec son bouton.
  -- ⛔ Le geste MANUEL n'est pas touché ici (p_par = 'utilisateur').
  -- ⛔ Le refus est tracé UNE FOIS (decision 'refus_jumeau') : sans trace,
  --    « pourquoi celle-ci n'est pas entrée ? » redevient une reconstitution.
  -- ⛔ Le titre de SECOURS (« Annonce vinted ») ne reconnaît rien : on part du
  --    titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- ── L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26) ──
  -- labouquinerie85, relevé Opla du 24/09 : 9 fiches créées sous le titre exact
  -- d'un article VENDU, 1 sous celui d'un article en stock déjà publié. Le
  -- premier tour du moteur ne voit que le stock sans annonce sur la
  -- plateforme ; ces fiches existantes lui étaient invisibles.
  -- ⛔ ON NE CRÉE PAS, ON DEMANDE : même titre (titre_norm, ou mêmes mots qui
  --    comptent) qu'une fiche en stock OU vendue → proposition posée sur
  --    l'annonce ; la personne tranche. Jamais de rattachement automatique à
  --    une fiche vendue ou déjà publiée : un titre ne prouve pas l'exemplaire.
  -- ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur').
  IF p_par IS DISTINCT FROM 'utilisateur' AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27, audit synchro) ON CRÉE, ET ON DEMANDE : l'annonce entre
    -- dans le stock ; la fiche de même titre (en stock ou VENDUE) devient la
    -- question « Est-ce le même article ? » posée sur la fiche créée. Retenir
    -- l'annonce hors du stock laissait des articles en ligne invisibles (784
    -- mesurées le 27/09) et, quand la fiche de même titre était vendue, une
    -- annonce en vente d'un objet déjà vendu que rien ne reliait à la vente.
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;

  -- (2026-09-27) La proposition du moteur (bande « propose » du relevé en
  -- cours, ou annonce retenue par un relevé passé) désigne la fiche à qui
  -- poser la question, faute d'homonyme exact.
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre) -- AJOUT 2026-09-24 : une autre couleur n'est pas un jumeau
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27) le titre inclus ne retient plus l'annonce : il se demande.
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

  -- (2026-09-27, décision de Nico) DEUX ANNONCES SUR LA MÊME PLATEFORME SONT
  -- DEUX EXEMPLAIRES : la fiche candidate porte déjà une annonce (ou un
  -- dépôt) sur CETTE plateforme → aucune question, aucun rattachement.
  IF v_q_inv IS NOT NULL AND (
       EXISTS (SELECT 1 FROM cross_post_jobs x
                WHERE x.user_id = p_user AND x.inventaire_id = v_q_inv AND x.platform = a.platform
                  AND x.action IN ('publish', 'republish') AND x.status IN ('published', 'sold', 'pending', 'processing', 'needs_user'))
    OR EXISTS (SELECT 1 FROM annonces_plateforme ap2
                WHERE ap2.user_id = p_user AND ap2.inventaire_id = v_q_inv AND ap2.platform = a.platform AND ap2.disparu_le IS NULL)) THEN
    v_q_inv := NULL; v_q_motif := NULL; v_q_preuves := NULL;
  END IF;

  -- (2026-09-27, décision de Nico) UNE FICHE VENDUE EST COMPARÉE AU RELEVÉ :
  -- l'annonce d'une AUTRE plateforme qui porte EXACTEMENT le titre d'une fiche
  -- VENDUE, seule de ce titre sur le compte, est cet objet déjà vendu
  -- (labouquinerie85 : La présidente, Triominos, Solaris). Elle est rattachée à
  -- la fiche vendue et son RETRAIT est armé (vente prouvée) — jamais une
  -- nouvelle fiche « en stock » d'un objet déjà parti.
  IF v_q_motif = 'homonyme_vendu' AND COALESCE(v_homo_n, 0) = 1 AND titre_norm(v_homo_titre) = v_tn THEN
    v_job := rapprocher_job_de_suivi(p_user, a.platform, v_homo, v_titre, v_prix, a.url, a.listing_id, p_par,
                                     jsonb_build_object('annonce_id', a.id, 'motif', 'releve_fiche_vendue'));
    UPDATE annonces_plateforme
       SET inventaire_id = v_homo, job_id = v_job, source_rapprochement = 'automatique',
           proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (p_user, a.id, v_homo, 'attache', p_par, 1,
            jsonb_build_object('job_id', v_job, 'motif', 'releve_fiche_vendue', 'titre_article', v_homo_titre));
    RETURN jsonb_build_object('ok', true, 'decision', 'rattachee_fiche_vendue', 'inventaire_id', v_homo, 'job_id', v_job,
                              'retrait', armer_retrait_job(v_job, 'releve_fiche_vendue', interval '0'));
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
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  -- (2026-09-27) la question « Est-ce le même article ? », posée sur la fiche
  -- créée (jamais un rattachement : la personne tranche, « oui » fusionne).
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job)
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;
  -- (2026-09-27, audit synchro) une fiche peut porter PLUSIEURS annonces
  -- vivantes sur la même plateforme (rattachement de la personne, deux
  -- dépôts) : la plus récente par plateforme ET toute autre dont un relevé
  -- atteste qu'elle vit encore sur cette fiche. Avant : une seule par
  -- plateforme — la seconde restait en vente après la vente (Louis, Beebs,
  -- 27/09). armer_retrait_job ne double jamais un retrait de la même annonce.
  for v_pub in
    select x.id, x.platform from (
      (select distinct on (j.platform) j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
        order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc)
      union
      (select j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
          and exists (select 1 from public.annonces_plateforme ap
                       where ap.job_id = j.id and ap.inventaire_id = p_inventaire_id
                         and ap.disparu_le is null and ap.retiree_le is null and ap.ignoree_le is null))
    ) x
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;
  if v_inv.vinted_item_id ~ '^\d+$'
     and v_inv.disparu_le is null
     and v_inv.vinted_status = 'active'
     and (p_sauf_plateforme is distinct from 'vinted')
     and not ('vinted' = any (v_pl))
     and not public.vinted_annonce_vendue(v_inv.user_id, v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs d
        where d.user_id = v_inv.user_id and d.platform = 'vinted' and d.action = 'delete'
          and d.status in ('pending', 'processing', 'needs_user')
          and coalesce(case when d.platform_listing_id ~ '^\d+$' then d.platform_listing_id end,
                       substring(d.listing_url from '/items/(\d+)')) = v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs p
        where p.user_id = v_inv.user_id and p.inventaire_id = p_inventaire_id
          and p.platform = 'vinted' and p.status = 'published'
          and coalesce(p.action, 'publish') in ('publish', 'republish'))
  then
    select substring(j.listing_url from '^(https://[^/]+)/items/') into v_url
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.platform = 'vinted'
       and j.listing_url ~ '^https://[^/]+/items/'
     order by j.created_at desc limit 1;
    v_pf := jsonb_build_object('arme_par', jsonb_build_object(
              'chemin', p_chemin, 'le', now(), 'depot', null, 'annonce_de_la_fiche', v_inv.vinted_item_id,
              'pose_par', 'armer_retraits_copies (serveur)'));
    if nullif(btrim(v_inv.vinted_account_id::text), '') is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', btrim(v_inv.vinted_account_id::text));
    end if;
    if p_delai is not null and p_delai > interval '0' then
      v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
    end if;
    insert into public.cross_post_jobs
      (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
    values
      (v_inv.user_id, v_inv.id, 'vinted', 'delete', 'pending', 'original', v_inv.titre,
       coalesce(v_url, 'https://www.vinted.fr') || '/items/' || v_inv.vinted_item_id,
       v_inv.vinted_item_id, v_pf);
    v_n := v_n + 1;
    v_pl := v_pl || 'vinted'::text;
  end if;
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;
  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_photos_decider(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a record; v_r text;
  n_attache integer := 0; n_ambigu integer := 0; n_reste integer := 0; n_caduques integer := 0;
  v_debut timestamptz := clock_timestamp();
  v_budget_atteint boolean := false;
BEGIN
  -- (a) annonces proposées dont les photos sont résolues.
  -- (2026-09-27) budget de 4 s depuis le DÉBUT DE L'APPEL, vérifié AVANT
  -- chaque annonce (le statement_timeout de l'appelant est 8 s ; l'ancien
  -- budget de 20 s faisait annuler chaque appel). Les FICHES (ancienne boucle
  -- (b)) passent désormais par doublons_reserver_fiches / doublons_examiner_fiche.
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT greatest(p_limite, 0) * 3
  LOOP
    IF clock_timestamp() - statement_timestamp() > interval '4 seconds' THEN v_budget_atteint := true; EXIT; END IF;
    IF NOT urls_resolues(annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                               THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                              UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[])) THEN
      CONTINUE;
    END IF;
    v_r := rapprocher_confirmer_photo(v_a.id);
    IF v_r = 'attache' THEN n_attache := n_attache + 1;
    ELSE
      IF v_r = 'ambigu' THEN n_ambigu := n_ambigu + 1; ELSE n_reste := n_reste + 1; END IF;
      UPDATE annonces_plateforme
         SET proposition = proposition || jsonb_build_object('photo_evaluee_le', now(), 'photo_verdict', v_r)
       WHERE id = v_a.id AND inventaire_id IS NULL AND proposition IS NOT NULL;
    END IF;
  END LOOP;

  -- (c) propositions devenues sans objet (une des deux fiches fusionnée ailleurs, vendue ou supprimée)
  UPDATE inventaire_doublons d SET statut = 'caduque', decide_le = now(), decide_par = 'auto'
   WHERE d.statut = 'proposee'
     AND (NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.fusionne_dans IS NULL AND i.statut = 'stock')
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.absorbe AND i.fusionne_dans IS NULL AND i.statut = 'stock'))
     -- (2026-09-27) « Déjà vendu ? » : la fiche gardée est VENDUE par nature ;
     -- la question vit tant que la fiche importée est en stock.
     AND NOT (d.motif = 'homonyme_vendu'
              AND EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.fusionne_dans IS NULL)
              AND EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.absorbe AND i.fusionne_dans IS NULL AND i.statut = 'stock'));
  GET DIAGNOSTICS n_caduques = ROW_COUNT;

  RETURN jsonb_build_object('annonces_rattachees', n_attache, 'annonces_ambigues', n_ambigu, 'annonces_restees_proposees', n_reste,
                            'propositions_caduques', n_caduques, 'budget_atteint', v_budget_atteint,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
      -- (2026-09-27) La fiche gardée est VENDUE : la personne vient de dire que
      -- l'annonce importée est cet objet déjà vendu (geste explicite + vente
      -- prouvée). Ses annonces encore en ligne partent, par le chemin commun.
      IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
        r := r || jsonb_build_object('retraits', armer_retraits_copies(d.garde, 'doublon_vendu_confirme', NULL, NULL, interval '0'));
      END IF;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_evaluer(p_a bigint, p_b bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a inventaire%ROWTYPE; b inventaire%ROWTYPE; g inventaire%ROWTYPE; x inventaire%ROWTYPE;
  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;
  v_remise boolean := false;
BEGIN
  SELECT * INTO a FROM inventaire WHERE id = p_a;
  SELECT * INTO b FROM inventaire WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR a.user_id <> b.user_id THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'paire_invalide');
  END IF;
  IF a.fusionne_dans IS NOT NULL OR b.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deja_fusionnee');
  END IF;
  -- ⛔ UNE DÉCISION HUMAINE EST DÉFINITIVE.
  IF EXISTS (SELECT 1 FROM inventaire_doublons d
              WHERE d.user_id = a.user_id AND d.statut IN ('refusee', 'defaite')
                AND least(d.garde, d.absorbe) = least(a.id, b.id) AND greatest(d.garde, d.absorbe) = greatest(a.id, b.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = a.user_id AND f.defait_le IS NOT NULL
                AND ((f.garde = a.id AND f.absorbe = b.id) OR (f.garde = b.id AND f.absorbe = a.id)))
     OR EXISTS (SELECT 1 FROM rapprochements r JOIN annonces_plateforme ap ON ap.id = r.annonce_id
              WHERE r.user_id = a.user_id AND r.par = 'utilisateur' AND r.decision IN ('refus_proposition', 'detache')
                AND ((ap.inventaire_id = b.id AND r.inventaire_id = a.id) OR (ap.inventaire_id = a.id AND r.inventaire_id = b.id))) THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'refuse_par_la_personne');
  END IF;
  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  -- SAUF (2026-09-25 après-midi, migration 20260925160000) la REMISE EN LIGNE :
  -- l'une retirée (closed + disparue), l'autre vivante, apparue après, même
  -- boutique — la fusion échange alors les identités.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id)
             OR vinted_retraits_successifs(a.id, b.id) OR vinted_retraits_successifs(b.id, a.id);
    IF NOT v_remise THEN
      RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
    END IF;
  END IF;

  s := meme_objet_signaux(a.titre, b.titre, fiche_marque(a.marque, a.attributs), fiche_marque(b.marque, b.attributs),
                          a.prix_vente, b.prix_vente, fiche_photos_toutes(a.id), fiche_photos_toutes(b.id));
  nv := meme_objet_niveau(s);
  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';
  -- AJOUT 2026-09-25 (migration 20260925154000) : sans photo qui prouve, une
  -- autre VARIANTE (un mot rare du titre court absent de l'autre) n'est pas
  -- une question — « Hochet hippopotame » / « Hochet Koala ».
  IF v_niveau = 'probable' AND v_motif = 'titre_proche'
     AND titres_variante_substituee(a.user_id, a.titre, b.titre) THEN
    v_niveau := 'ecarte'; v_motif := 'variante_substituee';
  END IF;

  -- AJOUT 2026-09-25 après-midi (migration 20260925162000) : la REMISE EN
  -- LIGNE à l'identique — même titre, retirée puis republiée dans les 24 h —
  -- n'est pas écartée par une photo retouchée (cadre ajouté par un outil de
  -- republication : 13 paires sur 13 vérifiées à l'œil, le même objet).
  IF v_remise
     AND (v_niveau = 'probable' OR (v_niveau = 'ecarte' AND v_motif = 'photos_differentes'))
     AND lower(btrim(a.titre)) = lower(btrim(b.titre))
     AND COALESCE(s ->> 'nombre', 'ok') = 'ok' AND COALESCE(s ->> 'lot', 'ok') = 'ok'
     AND ((a.disparu_le IS NOT NULL AND b.created_at BETWEEN a.disparu_le - interval '1 day' AND a.disparu_le + interval '1 day')
       OR (b.disparu_le IS NOT NULL AND a.created_at BETWEEN b.disparu_le - interval '1 day' AND b.disparu_le + interval '1 day')) THEN
    IF COALESCE(array_length(titre_jetons(a.titre), 1), 0) >= 3 THEN
      v_niveau := 'certain'; v_motif := 'remise_en_ligne_titre_identique';
    ELSE
      v_niveau := 'probable'; v_motif := 'remise_en_ligne_titre_court';
    END IF;
  END IF;

  -- LE CONTEXTE, que ni le titre ni la photo ne savent :
  -- une fiche vendue (autre unité ? vente à rattacher ?) → jamais d'ici ;
  IF v_niveau <> 'ecarte' AND (a.statut IS DISTINCT FROM 'stock' OR b.statut IS DISTINCT FROM 'stock') THEN
    v_niveau := 'ecarte'; v_motif := 'fiche_vendue';
  END IF;
  -- plusieurs exemplaires en stock → la personne tranche ;
  IF v_niveau = 'certain' AND (COALESCE(a.quantite, 1) > 1 OR COALESCE(b.quantite, 1) > 1) THEN
    v_niveau := 'probable'; v_motif := 'quantite';
  END IF;
  -- (2026-09-25 après-midi) remise en ligne, mais PLUSIEURS exemplaires vivants
  -- du même titre sur le compte : lequel est la remise en ligne ? La personne tranche.
  IF v_remise AND v_niveau = 'certain' AND (
       SELECT count(*) FROM inventaire o
        WHERE o.user_id = a.user_id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) >= 2 THEN
    v_niveau := 'probable'; v_motif := 'plusieurs_exemplaires_vivants';
  END IF;
  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.
  IF v_niveau <> 'ecarte' THEN
    SELECT string_agg(DISTINCT va.platform, ',') INTO v_meme_pf
      FROM fiche_annonces_vivantes(a.id) va
      JOIN fiche_annonces_vivantes(b.id) vb ON vb.platform = va.platform AND vb.listing_id <> va.listing_id
     WHERE NOT EXISTS (SELECT 1 FROM fiche_annonces_vivantes(a.id) x2 JOIN fiche_annonces_vivantes(b.id) y2
                          ON y2.platform = x2.platform AND y2.listing_id = x2.listing_id
                        WHERE x2.platform = va.platform);
    -- (2026-09-27, décision de Nico) Deux fiches qui portent CHACUNE une
    -- annonce vivante sur la même plateforme sont deux exemplaires : ni
    -- fusion, ni question (avant : question « à trancher »).
    IF v_meme_pf IS NOT NULL THEN
      v_niveau := 'ecarte'; v_motif := 'deux_annonces_meme_plateforme';
    END IF;
  END IF;

  -- QUI GARDE : la fiche créée par la personne quand l'autre vient d'un relevé
  -- ou du dressing ; sinon la plus ancienne. L'identité Vinted suit (fusion).
  IF (b.origine IS NULL OR b.origine = 'fillsell') AND (a.origine LIKE 'releve\_%' OR a.origine = 'vinted_sync') THEN
    g := b; x := a;
  ELSIF (a.origine IS NULL OR a.origine = 'fillsell') AND (b.origine LIKE 'releve\_%' OR b.origine = 'vinted_sync') THEN
    g := a; x := b;
  ELSIF a.created_at <= b.created_at THEN g := a; x := b;
  ELSE g := b; x := a;
  END IF;
  -- LES FREINS de la fiche qui disparaîtrait : ce que la personne y a mis.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = x.id AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    v_freins := v_freins || 'job_actif'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = x.id) THEN v_freins := v_freins || 'ventes'::text; END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = x.id)
     AND EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = g.id) THEN
    v_freins := v_freins || 'deux_fiches_annonce'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(x.attributs) = 'object' THEN x.attributs ELSE '{}'::jsonb END) e
              WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    v_freins := v_freins || 'saisie_manuelle'::text;
  END IF;
  IF g.prix_achat IS NOT NULL AND x.prix_achat IS NOT NULL AND g.prix_achat <> x.prix_achat THEN
    v_freins := v_freins || 'deux_prix_achat'::text;
  END IF;
  IF v_niveau = 'certain' AND COALESCE(array_length(v_freins, 1), 0) > 0 THEN
    v_niveau := 'probable'; v_motif := 'a_trancher';
  END IF;

  RETURN jsonb_build_object('niveau', v_niveau, 'motif', v_motif, 'garde', g.id, 'absorbe', x.id,
                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf)
         || CASE WHEN v_remise THEN jsonb_build_object('remise_en_ligne_vinted', true) ELSE '{}'::jsonb END;
END;
$function$;

REVOKE ALL ON FUNCTION public.releve_poser_question(uuid, bigint, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releve_poser_question(uuid, bigint, bigint, text, jsonb) TO service_role;
