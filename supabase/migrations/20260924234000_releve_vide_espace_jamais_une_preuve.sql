-- ═══════════════════════════════════════════════════════════════════════════
-- UN RELEVÉ VIDE N'EST NI UNE PREUVE NI UNE RAISON DE RELANCER (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE FAIT (pironneau.vincent@gmail.com, 28865d04, relu en base le 24/09) :
--   · 23/09 10:05 → 11:01 : trois relevés Leboncoin par l'adresse
--     (api/dashboard/v1/search) — 528 annonces, 526 « en ligne ».
--   · 24/09 20:00, Chrome revient : relevé quotidien (cron, 0.6.62) → repli sur
--     la page, « 0 vue(s) sur 0 annoncée(s) », jugé COMPLET → rapprocher_releve
--     date disparu_le sur les 528 annonces.
--   · de 20:02 à 21:54 : 57 relevés « veilleur », un toutes les ~2 min, tous
--     vides (l'adresse répond : aucune annonce, active_ads = 0). Plus aucun
--     après l'application (21:55) : refus RELEVE_VIDE_ARRET à 21:56 et 21:58
--     dans les postgres_logs, aucun run créé.
--
-- LA CAUSE DE LA BOUCLE (chrome-extension/background.js, lu, pas supposé) :
--   checkPublishedListings : chaque job Leboncoin qui passe « plus en ligne »
--   appelle demanderRelevePourRattachement(platform), et
--   traiterRelevesEnAttente lance le relevé à la fin de CHAQUE poll (2 min) où
--   une disparition a été vue. Aucune cadence, aucune mémoire du relevé
--   précédent. Chez lui : 520 jobs de suivi (import du 23/09 16:34) vérifiés
--   8 par cycle (SALE_CHECK_MAX_PER_CYCLE), tous morts → une disparition neuve
--   à chaque cycle → un relevé à chaque cycle. Le relevé vide ne rattache rien,
--   le cycle suivant redemande. Le cron a sa cadence de 20 h : ce n'est pas lui.
--
-- LE MÊME RELEVÉ VIDE A MENTI AILLEURS (pourquoi l'étape 4) : bertin.dr
-- (24/09 19:21, cron, « 0 vue(s) sur 0 annoncée(s) », disparues 238) et
-- philippaa (23/09 10:08, disparues 21) — leurs annonces sont EN LIGNE : le
-- veilleur les a relues « active » dans l'heure (bertin : 139 sur 139, plus
-- 4 vendues lues sur page vivante). Un relevé vide datait donc la disparition
-- d'annonces vivantes.
--
-- CE QUE FAIT CETTE MIGRATION — serveur seul, valable pour TOUTES les versions
-- d'extension (aucun paquet Chrome Web Store) :
--   1. releve_compte_avait_annonces(user, pf) : le compte a eu des annonces
--      sur cette plateforme — une annonce déjà relevée, ou un dépôt qui a eu
--      son lien.
--   2. releve_vide_etat(user, pf) : LA règle, écrite une fois — combien de
--      relevés TERMINÉS (done) d'affilée n'ont rien vu depuis le dernier qui a
--      vu quelque chose. Les runs failed / absente / expired / cancelled ne
--      comptent ni pour ni contre : ils n'ont rien lu.
--   3. garde_releve_vide_sync_runs (BEFORE INSERT sur vinted_sync_runs) : un
--      relevé demandé par le VEILLEUR est refusé moins de 45 min après un
--      relevé vide, et n'est plus accepté du tout après deux relevés vides
--      d'affilée. Le barème des autres attentes (45 min, 3 h, 6 h) s'arrête
--      ici à son premier palier : la consigne coupe au deuxième relevé vide.
--      Refus = RAISE 'RELEVE_VIDE_…' → l'extension le reçoit comme un « run
--      non créé » (HTTP 400) : aucun onglet ouvert, Leboncoin pas touché.
--      Levée : le premier relevé qui voit au moins une annonce.
--   4. rapprocher_releve : un relevé qui n'a RIEN vu, sur un compte qui avait
--      des annonces, n'est pas complet → aucune disparu_le datée, aucun verdict
--      de trancher_publications_sans_lien. Remplacement ANCRÉ du corps prod
--      (md5 relu le 24/09 : cbc3c737c73cedbd540e6af86ae5ab1e) : une ancre qui
--      manque fait ÉCHOUER la migration au lieu de se taire.
--   5. releves_vides_signales() : l'app lit les plateformes à l'arrêt pour le
--      DIRE (bande ambre de « Mes annonces en ligne »), sans rien conclure.
--
-- CE QUI NE CHANGE PAS :
--   · les relevés demandés par la personne : « app » n'est pas gardé, et
--     « bouton_distant » réclame par UPDATE la ligne posée par
--     demander_sync_plateforme (aucun INSERT, donc aucun trigger) ;
--   · le relevé quotidien de l'extension (« cron », cadence 20 h intacte) et
--     les relevés du serveur (premier relevé, reprise de connexion, reprise
--     technique) : pas gardés ;
--   · tout relevé qui VOIT au moins une annonce : v_complet inchangé,
--     disparitions datées exactement comme avant ;
--   · un compte qui n'a jamais eu d'annonce sur la plateforme (le « [vide] » de
--     m0nc3f, 23/09) : aucune garde, relevé réussi à 0 comme avant ;
--   · le veilleur de vente (drapeaux posés sur les jobs), la détection des
--     ventes, les retraits, les republications, l'import : aucune de ces voies
--     n'appelle ces fonctions ;
--   · le dressing Vinted (kind 'dressing') : garde_cadence_sync_runs intacte.
--
-- ⛔ AUCUNE VOIE NE CONCLUT UNE VENTE OU UN RETRAIT D'UN RELEVÉ (vérifié le
--    24/09 sur les corps prod) : rapprocher_releve, rapprocher_traiter_annonce,
--    rapprocher_classer, rapprocher_importer, rapprocher_rattraper,
--    rapprochement_decider et trancher_publications_sans_lien n'insèrent aucun
--    job, n'écrivent ni vente, ni sold_at, ni statut 'vendu' ;
--    rapprocher_traiter_annonce ne fait qu'EFFACER un drapeau « plus en ligne »
--    quand l'annonce est revue en ligne.
--
-- Jouée d'abord À BLANC en prod (tout annulé par une exception finale) :
-- veilleur Leboncoin de pironneau refusé, cron / app / veilleur Opla acceptés,
-- relevé vide → complet=false, vide_non_probant=true, disparues=0 ; compte
-- sans annonce (leopold.linon9, eBay) → complet=true, inchangé.
-- Appliquée en prod le 24/09/2026 à 21:55 Paris (execute_sql, une seule
-- transaction) ; fichier pour la trace — jamais `supabase db push`.
--
-- RETOUR ARRIÈRE (si besoin, dans cet ordre) :
--   DROP TRIGGER IF EXISTS garde_releve_vide_sync_runs ON public.vinted_sync_runs;
--   puis rapprocher_releve : les trois remplacements du bloc 4 à l'envers
--   (r1→a1, r2→a2, r3→a3), par le même DO ancré.

-- Une seule transaction (requête multi-instructions) : une ancre qui manque
-- annule TOUT. Et on n'attend pas un verrou indéfiniment sur une table que
-- l'extension écrit toutes les 2 min.
SET LOCAL lock_timeout = '5s';

-- ── 1. Le compte avait-il des annonces sur cette plateforme ? ──────────────
CREATE OR REPLACE FUNCTION public.releve_compte_avait_annonces(p_user uuid, p_platform text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM annonces_plateforme a
                  WHERE a.user_id = p_user AND a.platform = p_platform)
      OR EXISTS (SELECT 1 FROM cross_post_jobs j
                  WHERE j.user_id = p_user AND j.platform = p_platform AND j.listing_url IS NOT NULL);
$function$;

COMMENT ON FUNCTION public.releve_compte_avait_annonces(uuid, text) IS
  'Le compte a eu des annonces sur cette plateforme : une annonce déjà relevée (annonces_plateforme) ou un dépôt qui a eu son lien. Sert à releve_vide_etat et à rapprocher_releve. 2026-09-24.';

-- ── 2. LA règle : les relevés vides d'affilée ───────────────────────────────
CREATE OR REPLACE FUNCTION public.releve_vide_etat(p_user uuid, p_platform text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_avait boolean := false;
  v_vides integer := 0;
  v_dernier_fin timestamptz := NULL;
  v_dernier_run jsonb := NULL;
BEGIN
  IF p_user IS NOT NULL AND p_platform IS NOT NULL THEN
    v_avait := releve_compte_avait_annonces(p_user, p_platform);
  END IF;
  -- Un compte qui n'a jamais rien eu ici : un relevé à 0 est un relevé RÉUSSI
  -- (m0nc3f, 23/09). Rien à compter, rien à garder.
  IF v_avait THEN
    FOR r IN
      SELECT id, platform, status, declencheur, items_vus, items_crees, items_maj, total_entries,
             erreur, queued_at, started_at, finished_at
        FROM vinted_sync_runs
       WHERE user_id = p_user AND kind = 'annonces' AND platform = p_platform
         AND status = 'done' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 50
    LOOP
      -- Le premier relevé qui a VU quelque chose clôt la série.
      EXIT WHEN COALESCE(r.items_vus, 0) > 0;
      v_vides := v_vides + 1;
      IF v_vides = 1 THEN
        v_dernier_fin := r.finished_at;
        v_dernier_run := to_jsonb(r);
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object(
    'platform', p_platform,
    'avait_des_annonces', v_avait,
    'vides_consecutifs', v_vides,
    'dernier_vide_le', v_dernier_fin,
    -- Deux relevés vides d'affilée : le veilleur ne relance plus.
    'arret', v_vides >= 2,
    -- Un seul : le veilleur attend 45 min après lui.
    'reprise_veilleur_le', CASE WHEN v_vides = 1 THEN v_dernier_fin + interval '45 minutes' END,
    -- La ligne réelle du relevé vide le plus récent (l'app l'affiche).
    'dernier_vide_run', v_dernier_run
  );
END;
$function$;

COMMENT ON FUNCTION public.releve_vide_etat(uuid, text) IS
  'Relevés « annonces » TERMINÉS (done) d''affilée sans aucune annonce vue, depuis le dernier qui a vu quelque chose, sur un compte qui avait des annonces sur la plateforme. arret = 2 ou plus ; reprise_veilleur_le = 45 min après un relevé vide isolé. Lue par garde_releve_vide_sync_runs, rapprocher_releve (via releve_compte_avait_annonces) et releves_vides_signales. 2026-09-24.';

-- ── 3. La garde : le veilleur ne relance plus sur du vide ───────────────────
CREATE OR REPLACE FUNCTION public.garde_releve_vide_sync_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_etat jsonb;
  v_reprise timestamptz;
BEGIN
  -- Seul le VEILLEUR est gardé : c'est lui qui relançait toutes les 2 min.
  -- Relevés demandés par la personne (app / bouton_distant), relevé quotidien
  -- (cron, 20 h) et relevés du serveur : jamais touchés ici.
  IF NEW.kind IS DISTINCT FROM 'annonces'
     OR NEW.declencheur IS DISTINCT FROM 'veilleur'
     OR NEW.status NOT IN ('queued', 'running') THEN
    RETURN NEW;
  END IF;
  v_etat := releve_vide_etat(NEW.user_id, NEW.platform);
  IF COALESCE((v_etat ->> 'arret')::boolean, false) THEN
    RAISE EXCEPTION 'RELEVE_VIDE_ARRET: % relevés % vides d''affilée (dernier le %) sur un compte qui avait des annonces — le veilleur ne relance plus ; rien n''est conclu sur les annonces, un relevé demandé depuis l''app part toujours',
      v_etat ->> 'vides_consecutifs', NEW.platform, v_etat ->> 'dernier_vide_le';
  END IF;
  v_reprise := (v_etat ->> 'reprise_veilleur_le')::timestamptz;
  IF v_reprise IS NOT NULL AND now() < v_reprise THEN
    RAISE EXCEPTION 'RELEVE_VIDE_ESPACE: relevé % vide le % sur un compte qui avait des annonces — le veilleur attend jusqu''à %',
      NEW.platform, v_etat ->> 'dernier_vide_le', v_reprise;
  END IF;
  RETURN NEW;
END;
$function$;

-- CREATE OR REPLACE (PG 17) : idempotent sans DROP, donc sans verrou exclusif
-- sur une table que l'extension et l'app écrivent en continu.
CREATE OR REPLACE TRIGGER garde_releve_vide_sync_runs
  BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_vide_sync_runs();

-- ── 4. rapprocher_releve : un relevé vide ne date aucune disparition ────────
DO $do$
DECLARE
  v_def text; v_new text;
  a1 text := $a$  v_verdicts jsonb := NULL;$a$;
  r1 text := $a$  v_verdicts jsonb := NULL;
  v_vide_non_probant boolean := false;$a$;
  a2 text := $a$  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';$a$;
  r2 text := $a$  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';
  -- ── UN RELEVÉ VIDE N'EST JAMAIS UNE PREUVE (2026-09-24) ──────────────────
  -- Il n'a RIEN vu, sur un compte qui avait des annonces ici : ce n'est ni une
  -- preuve de disparition ni une preuve de vente. Pas de disparu_le, pas de
  -- verdict « refusée ». bertin.dr (24/09) : 238 annonces EN LIGNE datées
  -- disparues par un relevé à « 0 vue(s) sur 0 annoncée(s) ».
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;$a$;
  a3 text := $a$'disparues', n_disp, 'complet', v_complet);$a$;
  r3 text := $a$'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant);$a$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_releve';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rapprocher_releve introuvable'; END IF;
  IF position(r2 IN v_def) > 0 THEN RAISE NOTICE 'rapprocher_releve : déjà migrée'; RETURN; END IF;
  IF position(a1 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_releve : ancre 1 (v_verdicts) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a2 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_releve : ancre 2 (v_complet) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  IF position(a3 IN v_def) = 0 THEN RAISE EXCEPTION 'rapprocher_releve : ancre 3 (bilan rendu) introuvable — corps prod différent de celui relu le 24/09'; END IF;
  v_new := replace(replace(replace(v_def, a1, r1), a2, r2), a3, r3);
  EXECUTE v_new;
END
$do$;

-- ── 5. Ce que l'app lit pour le dire ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.releves_vides_signales()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text;
  v_etat jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN v_out; END IF;
  FOREACH v_pf IN ARRAY ARRAY['leboncoin', 'beebs', 'ebay', 'opla'] LOOP
    v_etat := releve_vide_etat(v_user, v_pf);
    IF COALESCE((v_etat ->> 'arret')::boolean, false) THEN
      v_out := v_out || jsonb_build_array(v_etat);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.releves_vides_signales() IS
  'Plateformes du compte connecté dont les relevés vides d''affilée ont arrêté le veilleur (releve_vide_etat.arret). Lue par l''app (Mes annonces en ligne) pour le dire, sans rien conclure sur les annonces. 2026-09-24.';

REVOKE ALL ON FUNCTION public.releve_compte_avait_annonces(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.releve_compte_avait_annonces(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.releve_vide_etat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.releve_vide_etat(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.releves_vides_signales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.releves_vides_signales() TO authenticated, service_role;

-- ── Contrôle final, bloquant ────────────────────────────────────────────────
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rapprocher_releve';
  IF position('v_vide_non_probant := true;' IN v_def) = 0
     OR position('''vide_non_probant'', v_vide_non_probant' IN v_def) = 0 THEN
    RAISE EXCEPTION 'contrôle final : rapprocher_releve ne porte pas la garde du relevé vide';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'garde_releve_vide_sync_runs'
                  AND tgrelid = 'public.vinted_sync_runs'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'contrôle final : trigger garde_releve_vide_sync_runs absent';
  END IF;
END
$do$;
