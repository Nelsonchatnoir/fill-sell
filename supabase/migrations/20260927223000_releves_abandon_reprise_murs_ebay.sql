-- ═══════════════════════════════════════════════════════════════════════════
-- RELEVÉS : UN ABANDON ARRÊTE TOUT · UN RELEVÉ INCOMPLET SE REPREND ·
-- LES MURS eBAY SE NOMMENT (27/09 soir, lot « synchronisation parfaite »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesures du 27/09 ~21:30 (prod, lecture seule) :
--  · 24 abandons « je ne vends pas sur X » posés ; angelofthedeath91 a pourtant
--    eu 7 relevés Beebs, 8 eBay et 7 Leboncoin en 3 jours sur des plateformes
--    abandonnées (le veilleur et le bouton de l'app ne lisaient pas l'abandon,
--    seul le relevé quotidien le faisait) ; 5 jobs actifs sur des plateformes
--    abandonnées (patrick.giry07 eBay, melaniehermetz8 Vinted ×4).
--  · kacemksoukaina et antoinelatour8 : eBay redirige « Mes annonces » vers
--    /fpa/upgrade (« Renseigner les informations de votre compte ») — le compte
--    eBay n'est pas encore vendeur. Le relevé disait « le Hub vendeur n'a pas
--    rendu son compteur » (faux : il n'y a pas de Hub) et la personne relançait
--    (6 relevés en 40 min). martinteophile : « Veuillez confirmer votre
--    identité » — même travers.
--  · Sur 48 h, 45 relevés de 4 plateformes se sont clos « [incomplet] » ou
--    expirés, et AUCUN n'a été repris : la règle « un relevé incomplet reprend »
--    n'existait que pour le Hub eBay muet (extension).
--
-- Ce que fait cette migration (rien n'est retiré, rien n'est supprimé) :
--  1. plateforme_ecartee_pour(user, pf) : la lecture unique de l'abandon.
--  2. garde_plateforme_ecartee_sync_runs : aucun relevé (quel que soit son
--     déclencheur : veilleur, app, cron, serveur, reprise) n'est créé ni
--     réclamé sur une plateforme abandonnée — l'insertion est simplement
--     ignorée (l'extension voit « run non créé » et passe).
--  3. plateforme_ecarter : met aussi EN PAUSE les publications / republications
--     en attente de cette plateforme (needs_user 'plateforme_ecartee', phrase
--     claire), et les relâche telles quelles si la personne réactive la
--     plateforme. Les RETRAITS continuent : ils protègent d'une double vente.
--  4. garde_plateforme_ecartee_jobs : un job de publication / republication
--     créé après l'abandon naît en pause, avec la même phrase.
--  5. demander_sync_plateforme : refuse proprement (« plateforme_ecartee »).
--  6. releve_ebay_mur_nomme : /fpa/upgrade → statut 'absente' « compte eBay
--     pas encore vendeur » [mur:upgrade] ; « confirmer votre identité » →
--     'absente' [mur:reauth]. Plus de reprise, plus de faux « Hub muet ».
--  7. releve_incomplet_reprise : un relevé qui se clôt incomplet, en échec ou
--     expiré, pour une cause qui n'appelle aucun geste de la personne, est
--     remis en file automatiquement (déclencheur 'reprise'), deux fois au plus
--     par 6 h et par plateforme. Un relevé incomplet ne conclut toujours rien
--     (rapprocher_releve, trancher_publications_sans_lien : inchangés).
--  8. Rattrapage : les 5 jobs actifs sur une plateforme abandonnée passent en
--     pause (statut corrigé, réversible, rien n'est retiré).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plateforme_ecartee_pour(p_user uuid, p_platform text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE WHEN jsonb_typeof(p.platform_settings -> 'plateformes_ecartees') = 'array'
                THEN (p.platform_settings -> 'plateformes_ecartees') ? lower(p_platform)
                ELSE false END
      FROM profiles p WHERE p.id = p_user), false);
$function$;
REVOKE ALL ON FUNCTION public.plateforme_ecartee_pour(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plateforme_ecartee_pour(uuid, text) TO authenticated, service_role;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.garde_plateforme_ecartee_sync_runs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf text;
BEGIN
  IF NEW.status NOT IN ('queued', 'running') THEN RETURN NEW; END IF;
  -- Une progression d'un relevé déjà lancé n'est pas un nouveau relevé.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('queued', 'running') AND NEW.status = 'running' AND OLD.status = 'running' THEN
    RETURN NEW;
  END IF;
  v_pf := CASE WHEN NEW.kind = 'annonces' THEN NEW.platform
               WHEN NEW.kind = 'dressing' THEN 'vinted'
               ELSE NULL END;
  IF v_pf IS NULL OR NOT plateforme_ecartee_pour(NEW.user_id, v_pf) THEN RETURN NEW; END IF;
  -- La personne a dit « je ne vends pas sur X » : aucun relevé, d'où qu'il
  -- vienne. On ignore l'écriture (ni erreur, ni ligne) : l'extension lit
  -- « run non créé / déjà réclamé » et passe à la suite.
  RAISE LOG 'garde_plateforme_ecartee_sync_runs : relevé % ignoré (user %, % écartée, déclencheur %)',
    TG_OP, NEW.user_id, v_pf, NEW.declencheur;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS garde_plateforme_ecartee_sync_runs ON public.vinted_sync_runs;
CREATE TRIGGER garde_plateforme_ecartee_sync_runs
  BEFORE INSERT OR UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_plateforme_ecartee_sync_runs();

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plateforme_ecartee_message(p_platform text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'En pause : tu as indiqué ne pas vendre sur '
    || CASE lower(p_platform) WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                              WHEN 'opla' THEN 'Opla' WHEN 'vinted' THEN 'Vinted' ELSE p_platform END
    || '. Rien ne part sur cette plateforme. Pour la reprendre, réactive-la dans Réglages › Plateformes : '
    || 'cette publication repartira d''elle-même.';
$function$;

CREATE OR REPLACE FUNCTION public.plateforme_ecarter(p_platform text, p_ecarter boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ps   jsonb; v_liste jsonb; v_n integer := 0; v_jobs integer := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  SELECT COALESCE(platform_settings, '{}'::jsonb) INTO v_ps FROM profiles WHERE id = v_user FOR UPDATE;
  v_liste := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_liste FROM jsonb_array_elements(v_liste) e WHERE (e #>> '{}') <> v_pf;
  IF p_ecarter THEN v_liste := v_liste || to_jsonb(v_pf); END IF;
  UPDATE profiles SET platform_settings = v_ps || jsonb_build_object('plateformes_ecartees', v_liste) WHERE id = v_user;
  IF p_ecarter THEN
    UPDATE vinted_sync_runs
       SET status = 'cancelled', finished_at = now(), updated_at = now(),
           erreur = 'plateforme écartée par l''utilisateur (« je ne vends pas sur ' || v_pf || ' »)'
     WHERE user_id = v_user AND status = 'queued'
       AND ((kind = 'annonces' AND platform = v_pf) OR (kind = 'dressing' AND v_pf = 'vinted'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    -- Les publications et republications en attente passent EN PAUSE, avec la
    -- phrase qui dit pourquoi et comment reprendre. Les retraits continuent.
    UPDATE cross_post_jobs j SET
      status = 'needs_user',
      error = plateforme_ecartee_message(v_pf),
      platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
        'needs_user_source', 'plateforme_ecartee',
        'plateforme_ecartee', jsonb_build_object('le', now(), 'statut_avant', j.status,
                                                 'source_avant', j.platform_fields -> 'needs_user_source'))
     WHERE j.user_id = v_user AND j.platform = v_pf
       AND j.action IN ('publish', 'republish') AND j.status = 'pending';
    GET DIAGNOSTICS v_jobs = ROW_COUNT;
  ELSE
    -- Réactivée : ce qui avait été mis en pause par l'abandon repart tel quel.
    UPDATE cross_post_jobs j SET
      status = COALESCE(NULLIF(j.platform_fields #>> '{plateforme_ecartee,statut_avant}', ''), 'pending'),
      error = NULL,
      platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb) - 'needs_user_source' - 'plateforme_ecartee')
        || CASE WHEN jsonb_typeof(j.platform_fields #> '{plateforme_ecartee,source_avant}') = 'string'
                THEN jsonb_build_object('needs_user_source', j.platform_fields #> '{plateforme_ecartee,source_avant}')
                ELSE '{}'::jsonb END
        || jsonb_build_object('plateforme_reprise_le', now())
     WHERE j.user_id = v_user AND j.platform = v_pf
       AND j.status = 'needs_user' AND j.platform_fields ->> 'needs_user_source' = 'plateforme_ecartee';
    GET DIAGNOSTICS v_jobs = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'plateforme', v_pf, 'ecartee', p_ecarter, 'ecartees', v_liste,
                            'demandes_annulees', v_n, 'jobs_en_pause_ou_repris', v_jobs);
END;
$function$;
REVOKE ALL ON FUNCTION public.plateforme_ecarter(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plateforme_ecarter(text, boolean) TO authenticated;

-- 4 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.garde_plateforme_ecartee_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.action NOT IN ('publish', 'republish') OR NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  IF NOT plateforme_ecartee_pour(NEW.user_id, NEW.platform) THEN RETURN NEW; END IF;
  NEW.status := 'needs_user';
  NEW.error := plateforme_ecartee_message(NEW.platform);
  NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object(
    'needs_user_source', 'plateforme_ecartee',
    'plateforme_ecartee', jsonb_build_object('le', now(), 'statut_avant', 'pending'));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS garde_plateforme_ecartee_jobs ON public.cross_post_jobs;
CREATE TRIGGER garde_plateforme_ecartee_jobs
  BEFORE INSERT ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.garde_plateforme_ecartee_jobs();

-- 5 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ext  timestamptz;
  v_ver  text;
  v_min  integer;
  v_code integer;
  v_actif record;
  v_fini timestamptz;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  -- (27/09) « Je ne vends pas sur X » : aucun relevé, même demandé à la main.
  IF plateforme_ecartee_pour(v_user, v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_ecartee');
  END IF;
  SELECT extension_last_seen_at, extension_version INTO v_ext, v_ver FROM profiles WHERE id = v_user;
  IF v_ext IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
  END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
  v_min := COALESCE(v_min, 642);
  v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
      (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
      + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
  IF v_min > 0 AND v_code < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne', 'version', v_ver, 'minimum', v_min);
  END IF;
  PERFORM purger_sync_queue_perimee(v_user);
  SELECT id, status INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  SELECT max(finished_at) INTO v_fini FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status = 'done';
  IF v_fini IS NOT NULL AND v_fini > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cadence', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id);
END;
$function$;

-- 6 ─────────────────────────────────────────────────────────────────────────
-- Les deux textes que l'extension (0.6.69 → 0.6.74) lit dans la page quand
-- eBay n'a PAS de Hub à montrer. Ils arrivent dans « [page] … » ou « page lue :
-- /fpa/upgrade ». On les transforme en ce qu'ils sont : un compte à finir côté
-- eBay (bouton « Devenir vendeur eBay » dans l'app), ou une confirmation
-- d'identité demandée par eBay (« Me reconnecter »). Statut 'absente' : ni
-- échec, ni reprise, ni conclusion sur les annonces.
CREATE OR REPLACE FUNCTION public.releve_ebay_mur_nomme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e text := COALESCE(NEW.erreur, '');
  v_mur text;
BEGIN
  IF COALESCE(NEW.items_vus, 0) > 0 THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('failed', 'done', 'queued', 'running') THEN RETURN NEW; END IF;
  IF position('[mur:' in v_e) > 0 THEN RETURN NEW; END IF;
  IF v_e ~* '/fpa/upgrade' THEN
    v_mur := '[incomplet] session ebay : page de connexion vendeur [mur:upgrade] — ton compte eBay n''est pas encore un compte vendeur : '
          || 'eBay demande d''abord de « renseigner les informations de ton compte ». Aucune annonce à relever tant que ce n''est pas fait.';
  ELSIF v_e ~* 'confirmer votre identit' THEN
    v_mur := '[incomplet] session ebay : page de connexion [mur:reauth] — eBay demande de confirmer ton identité avant d''ouvrir tes annonces.';
  ELSE
    RETURN NEW;
  END IF;
  -- Une reprise en cours de pose (running → queued) ou une clôture : dans
  -- les deux cas, c'est un mur, pas une panne. Rien ne se relance.
  NEW.status := 'absente';
  NEW.finished_at := COALESCE(NEW.finished_at, now());
  NEW.erreur := v_mur;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS releve_ebay_mur_nomme ON public.vinted_sync_runs;
CREATE TRIGGER releve_ebay_mur_nomme
  BEFORE UPDATE OF erreur ON public.vinted_sync_runs
  FOR EACH ROW WHEN (NEW.platform = 'ebay' AND NEW.kind = 'annonces')
  EXECUTE FUNCTION public.releve_ebay_mur_nomme();

-- 7 ─────────────────────────────────────────────────────────────────────────
-- Les causes qui appellent un GESTE de la personne : on ne relit pas en
-- boucle ce qu'elle seule peut débloquer (l'app lui montre le bouton).
CREATE OR REPLACE FUNCTION public.releve_cause_utilisateur(p_erreur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_erreur, '') ~* (
    'page de connexion|acc[èe]s opla non accord|http 401|\[mur:|confirmer votre identit|/fpa/upgrade'
    || '|hors-compte|boutique|plateforme [ée]cart[ée]e|multiplateforme ferm|\[vide\]');
$function$;

CREATE OR REPLACE FUNCTION public.releve_incomplet_reprise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  BEGIN
    -- Complet et réussi : rien à reprendre.
    IF NEW.status = 'done' AND COALESCE(NEW.erreur, '') NOT LIKE '[incomplet]%' THEN RETURN NULL; END IF;
    IF releve_cause_utilisateur(NEW.erreur) THEN RETURN NULL; END IF;
    IF plateforme_ecartee_pour(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
    -- Déjà une lecture en file ou en cours : elle fera foi.
    IF EXISTS (SELECT 1 FROM vinted_sync_runs r
                WHERE r.user_id = NEW.user_id AND r.kind = 'annonces' AND r.platform = NEW.platform
                  AND r.status IN ('queued', 'running') AND r.id <> NEW.id) THEN
      RETURN NULL;
    END IF;
    -- Deux reprises au plus par 6 h et par plateforme : au-delà, le relevé
    -- reste dit incomplet (jamais conclu), et le prochain passage normal le
    -- refera.
    SELECT count(*) INTO v_n FROM vinted_sync_runs r
     WHERE r.user_id = NEW.user_id AND r.kind = 'annonces' AND r.platform = NEW.platform
       AND r.declencheur = 'reprise' AND r.queued_at > now() - interval '6 hours';
    IF v_n >= 2 THEN RETURN NULL; END IF;
    INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
    VALUES (NEW.user_id, 'annonces', NEW.platform, 'queued', 'reprise', now());
    RAISE LOG 'releve_incomplet_reprise : run % (% %) → reprise %/2', NEW.id, NEW.platform, NEW.status, v_n + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_incomplet_reprise : run % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS releve_incomplet_reprise ON public.vinted_sync_runs;
CREATE TRIGGER releve_incomplet_reprise
  AFTER UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW WHEN (NEW.kind = 'annonces' AND OLD.status = 'running'
                     AND NEW.status IN ('done', 'failed', 'expired')
                     AND NEW.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
  EXECUTE FUNCTION public.releve_incomplet_reprise();

-- 8 ─────────────────────────────────────────────────────────────────────────
UPDATE cross_post_jobs j SET
  status = 'needs_user',
  error = plateforme_ecartee_message(j.platform),
  platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
    'needs_user_source', 'plateforme_ecartee',
    'plateforme_ecartee', jsonb_build_object('le', now(), 'statut_avant', j.status,
                                             'source_avant', j.platform_fields -> 'needs_user_source',
                                             'par', 'rattrapage 20260927223000'))
 WHERE j.action IN ('publish', 'republish') AND j.status = 'pending'
   AND plateforme_ecartee_pour(j.user_id, j.platform);
