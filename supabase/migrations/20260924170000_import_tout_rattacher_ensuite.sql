-- ═══════════════════════════════════════════════════════════════════════════
-- ON IMPORTE TOUT, ON RATTACHE ENSUITE (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle de Nico, sans exception : toute annonce EN LIGNE sur une plateforme
-- choisie et ABSENTE du stock devient un article ; le rattachement (identifiant,
-- rapprochement automatique, empreinte photo, propositions à valider) regroupe
-- ensuite les annonces d'un même article. On n'importe PAS seulement ce qu'on
-- arrive à rattacher.
--
-- LE FAIT (laura.rml38, premier relevé du 24/09 03:02 ; labouquinerie85, 09:23) :
--   Opla « sans candidat 26, importées 0 », Leboncoin « sans candidat 11,
--   importées 0 » ; labouquinerie85 Leboncoin « sans candidat 3, importées 0 ».
--   Stock de laura : 12 articles pour ≥ 50 annonces en ligne.
--
-- LA CAUSE, LUE EN PROD (pg_get_functiondef, pas supposée) — ce n'est PAS la
-- migration 20260923230000 : aucune de ces annonces ne porte de décision
-- 'import' (vérifié : deja_importees_avant = 0 chez les deux). C'est la
-- TROISIÈME condition de l'import automatique, posée le 18/09 (point F) et
-- reprise mot pour mot le 23/09 18:00 : « elle était DÉJÀ sans candidat à un
-- run AUTRE que le sien ». rapprocher_releve appelle
-- rapprocher_traiter_annonce(…, p_second_releve_requis := true) : au PREMIER
-- relevé, une annonce sans candidat n'est que journalisée ('aucune') ; elle ne
-- s'importe qu'au relevé SUIVANT. Or le relevé suivant ne vient pas tout seul :
-- le cron de l'extension repasse à 20 h (RELEVE_CADENCE_CRON_MS), le trigger
-- « premier relevé » serveur était mort (chantier du même jour). Un inscrit
-- attend donc une journée, ou un clic, pour voir son stock — et l'écran lui
-- montre 12 articles.
-- Preuve que le moteur importe bien au 2e relevé : jocabroc8 le 24/09 07:22 →
-- 08:02, 4 imports eBay + 3 Leboncoin, tous automatiques.
--
-- CE QUE FAIT CETTE MIGRATION — trois changements, tous dérivés du corps prod
-- relu le 24/09 (pg_get_functiondef), par remplacement ANCRÉ : une ancre qui
-- manque fait ÉCHOUER la migration au lieu de se taire.
--   1. rapprocher_releve : l'import se fait DÈS LE PREMIER relevé
--      (p_second_releve_requis := false). La 3e condition disparaît pour le
--      relevé ; rapprocher_rattraper garde son paramètre.
--   2. Le cas de Louis (fiche supprimée dans FillSell, annonce laissée en
--      ligne, réimportée 5 fois) ne boucle plus, mais par un marqueur PRÉCIS :
--      annonces_plateforme.fiche_supprimee_le, posé par
--      inventaire_supprimer_sans_retrait au moment du geste, effacé par un
--      rattachement ou un import MANUEL. La 4e condition du 23/09 (« porte
--      déjà une décision 'import' ») est remplacée par « fiche_supprimee_le IS
--      NULL » : elle bloquait aussi toute annonce dont la fiche avait disparu
--      par un autre chemin (melaniehermetz8, « Peluche », Beebs) — contraire à
--      la règle. Une annonce jamais vue n'a jamais été bloquée par l'une ni
--      par l'autre ; une annonce jamais importée s'importe toujours.
--   3. Rattrapage des annonces de Louis : les 4 annonces Beebs dont la fiche a
--      été supprimée par le geste (jobs 'cancelled' porteurs de
--      platform_fields.fiche_supprimee_le) reçoivent le marqueur — idempotent.
--
-- ZÉRO DOUBLON, où ça vit : annonces_plateforme_unique (user_id, platform,
-- listing_id) + l'upsert du relevé (background.js, on_conflict) → une annonce
-- = une ligne ; rapprocher_importer refuse 'deja_rattachee' tant que
-- inventaire_id est posé → une ligne = au plus un article vivant ; le marqueur
-- ci-dessus → jamais un second article après une suppression volontaire.
-- Aucune fusion automatique : les bandes 'propose' et la garde du jumeau
-- (titre inclus) restent des PROPOSITIONS à valider, inchangées.
-- Vinted n'est pas concernée : rapprocher_releve refuse la plateforme
-- ('plateforme'), le dressing écrit inventaire (origine 'vinted_sync') par sa
-- propre voie.
--
-- RATTRAPAGE SANS INSERTION À LA MAIN : les annonces laissées de côté sont
-- DÉJÀ dans annonces_plateforme (inventaire_id NULL, ignoree_le NULL,
-- en_ligne). Au prochain relevé, l'extension les re-voit (upsert, run_id
-- neuf), rapprocher_releve les rejoue (aucune ligne rapprochements pour ce
-- run) → bande 'aucune' → import immédiat. Prochain relevé : cron extension
-- 20 h après le précédent, veilleur, ou bouton « Relever » de l'app (cadence
-- serveur 15 min).
--
-- Appliquée en prod le 24/09/2026 à 10:35 (execute_sql), fichier pour la trace.

-- ── 0. Le marqueur ──────────────────────────────────────────────────────────
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS fiche_supprimee_le timestamptz;
COMMENT ON COLUMN public.annonces_plateforme.fiche_supprimee_le IS
  'Posé par inventaire_supprimer_sans_retrait : le vendeur a supprimé la fiche en gardant l''annonce en ligne. Tant qu''il est là, l''import AUTOMATIQUE ne recrée pas d''article (boucle de Louis, 19→23/09). Effacé par un rattachement ou un import manuel (rapprochement_decider, rapprocher_importer). 2026-09-24.';

-- ── 1. inventaire_supprimer_sans_retrait pose le marqueur ───────────────────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := '                                     source_rapprochement, vu_le, updated_at)';
  r1 text := '                                     source_rapprochement, vu_le, updated_at, fiche_supprimee_le)';
  a2 text := '            ''en_ligne'', NULL, NULL, NULL, now(), now())';
  r2 text := '            ''en_ligne'', NULL, NULL, NULL, now(), now(), now())';
  a3 text := '          proposition = NULL, disparu_le = NULL, ignoree_le = NULL,
          statut_plateforme = ''en_ligne'', updated_at = now();';
  r3 text := '          proposition = NULL, disparu_le = NULL, ignoree_le = NULL,
          -- Le geste du vendeur, daté : l''import automatique ne ressuscite
          -- pas cette fiche (2026-09-24, cf. rapprocher_traiter_annonce).
          fiche_supprimee_le = now(),
          statut_plateforme = ''en_ligne'', updated_at = now();';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'inventaire_supprimer_sans_retrait';
  IF v_def IS NULL THEN RAISE EXCEPTION 'inventaire_supprimer_sans_retrait introuvable'; END IF;
  IF position(r3 IN v_def) > 0 THEN RAISE NOTICE 'inventaire_supprimer_sans_retrait : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'inventaire_supprimer_sans_retrait : ancre 1 (colonnes INSERT) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a2 IN v_def) = 0 THEN RAISE EXCEPTION 'inventaire_supprimer_sans_retrait : ancre 2 (VALUES) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a3 IN v_def) = 0 THEN RAISE EXCEPTION 'inventaire_supprimer_sans_retrait : ancre 3 (ON CONFLICT) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(replace(replace(v_def, a1, r1), a2, r2), a3, r3);
  EXECUTE v_new;
END
$do$;

-- ── 2. rapprocher_traiter_annonce : la 4e condition devient le marqueur ─────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := '     -- ⛔ 2026-09-23 — QUATRIÈME CONDITION : jamais deux fois. Une annonce qui
     --    porte déjà une décision ''import'' a déjà été importée une fois ; si
     --    elle est redevenue « sans candidat », c''est que le vendeur a supprimé
     --    sa fiche (en gardant l''annonce en ligne) — on ne la ressuscite pas.
     --    Elle reste dans « à rattacher » ; le vendeur la rattache ou la
     --    ré-importe à la main (rapprocher_importer(…, ''utilisateur''), non gardé).
     AND NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = ''import'')';
  r1 text := '     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l''annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C''est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_traiter_annonce';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprocher_traiter_annonce introuvable'; END IF;
  IF position(r1 IN v_def) > 0 THEN RAISE NOTICE 'rapprocher_traiter_annonce : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_traiter_annonce : ancre (quatrième condition du 23/09) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(v_def, a1, r1);
  EXECUTE v_new;
END
$do$;

-- ── 3. rapprocher_releve : l'import dès le PREMIER relevé ───────────────────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := '    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, true);';
  r1 text := '    -- p_second_releve_requis := false (2026-09-24) : on importe TOUT ce qui est
    -- en ligne et sans candidat dès ce relevé, on rattache ensuite. La règle
    -- du « deuxième relevé » (18/09) laissait un inscrit sans stock jusqu''au
    -- prochain passage — 20 h, ou un clic (laura.rml38, labouquinerie85).
    v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, false, false);';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_releve';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprocher_releve introuvable'; END IF;
  IF position(r1 IN v_def) > 0 THEN RAISE NOTICE 'rapprocher_releve : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_releve : ancre (appel de rapprocher_traiter_annonce) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(v_def, a1, r1);
  EXECUTE v_new;
END
$do$;

-- ── 4. Un import ou un rattachement MANUEL efface le marqueur ───────────────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := '         proposition = NULL, ignoree_le = NULL, updated_at = now()
   WHERE id = a.id;';
  r1 text := '         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_importer';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprocher_importer introuvable'; END IF;
  IF position(r1 IN v_def) > 0 THEN RAISE NOTICE 'rapprocher_importer : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_importer : ancre (UPDATE après import) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(v_def, a1, r1);
  EXECUTE v_new;
END
$do$;

DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := '    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = ''manuel'', proposition = NULL, ignoree_le = NULL, updated_at = now() WHERE id = a.id;';
  r1 text := '    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = ''manuel'', proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now() WHERE id = a.id;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprochement_decider';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprochement_decider introuvable'; END IF;
  IF position(r1 IN v_def) > 0 THEN RAISE NOTICE 'rapprochement_decider : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprochement_decider : ancre (UPDATE attache) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(v_def, a1, r1);
  EXECUTE v_new;
END
$do$;

-- ── 5. Le marqueur sur les fiches DÉJÀ supprimées par le geste (Louis) ──────
-- Idempotent : seules les annonces sans marqueur, sans fiche, déjà importées
-- une fois ET dont un job porte platform_fields.fiche_supprimee_le (posé par
-- inventaire_supprimer_sans_retrait) le reçoivent. Relevé du 24/09 : 4 annonces
-- Beebs de louis@ttfamily.fr. « Peluche » (melaniehermetz8, sans ce job) n'est
-- PAS marquée : sa fiche a disparu autrement, elle se réimportera — c'est la règle.
UPDATE public.annonces_plateforme a
   SET fiche_supprimee_le = m.le, updated_at = now()
  FROM (SELECT j.user_id, j.platform,
               NULLIF(trim(COALESCE(j.platform_listing_id, '')), '') AS lid,
               NULLIF(trim(COALESCE(j.listing_url, '')), '') AS url,
               MAX(NULLIF(j.platform_fields ->> 'fiche_supprimee_le', '')::timestamptz) AS le
          FROM public.cross_post_jobs j
         WHERE j.platform_fields ? 'fiche_supprimee_le'
         GROUP BY 1, 2, 3, 4) m
 WHERE a.user_id = m.user_id AND a.platform = m.platform
   AND (a.listing_id = m.lid OR a.listing_id = m.url OR (m.url IS NOT NULL AND a.url = m.url))
   AND a.inventaire_id IS NULL AND a.fiche_supprimee_le IS NULL
   AND EXISTS (SELECT 1 FROM public.rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'import');

-- ── 6. Le contrôle qui l'empêche de revenir ─────────────────────────────────
DO $do$
DECLARE v_t text; v_r text; v_i text; v_d text; v_s text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_t FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rapprocher_traiter_annonce';
  SELECT pg_get_functiondef(p.oid) INTO v_r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rapprocher_releve';
  SELECT pg_get_functiondef(p.oid) INTO v_i FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rapprocher_importer';
  SELECT pg_get_functiondef(p.oid) INTO v_d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rapprochement_decider';
  SELECT pg_get_functiondef(p.oid) INTO v_s FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'inventaire_supprimer_sans_retrait';
  IF position('AND a.fiche_supprimee_le IS NULL' IN v_t) = 0 OR position('r.decision = ''import'')' IN v_t) > 0 THEN
    RAISE EXCEPTION 'rapprocher_traiter_annonce : la 4e condition n''est pas le marqueur fiche_supprimee_le';
  END IF;
  IF position('rapprocher_importer(' IN v_t) = 0 THEN RAISE EXCEPTION 'rapprocher_traiter_annonce n''appelle plus rapprocher_importer'; END IF;
  IF position('v_import_ouvert, false, false);' IN v_r) = 0 THEN RAISE EXCEPTION 'rapprocher_releve exige encore un deuxième relevé'; END IF;
  IF position('rapprocher_traiter_annonce(' IN v_r) = 0 THEN RAISE EXCEPTION 'rapprocher_releve n''appelle plus rapprocher_traiter_annonce'; END IF;
  IF position('fiche_supprimee_le = NULL' IN v_i) = 0 THEN RAISE EXCEPTION 'rapprocher_importer n''efface pas le marqueur'; END IF;
  IF position('fiche_supprimee_le = NULL' IN v_d) = 0 THEN RAISE EXCEPTION 'rapprochement_decider n''efface pas le marqueur'; END IF;
  IF position('fiche_supprimee_le = now()' IN v_s) = 0 THEN RAISE EXCEPTION 'inventaire_supprimer_sans_retrait ne pose pas le marqueur'; END IF;
END
$do$;
