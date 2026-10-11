-- ═══════════════════════════════════════════════════════════════════════════
-- 20261011130000 — SORTIE D'OPLA : PLUS AUCUNE ACTION OPLA, POUR PERSONNE
-- (11/10, lot unique de Nico — A2)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (11/10) : la sortie a basculé le 10/10 à 00:00 Paris (coin_config
-- `opla_sortie_le`), mais des actions Opla naissaient encore :
--   · relevés Opla depuis l'app (Louis 08:49, docherleny 09:50) — un compte
--     « relié » gardait sa synchronisation (règle A3 du 02/10) ;
--   · relevés « cron » et « veilleur » insérés par l'extension elle-même ;
--   · un RETRAIT Opla créé à 10:10 chez ornellaracano (« Veste bomber floral »)
--     par inventaire_vendu_retire_ses_copies → armer_retrait_job (règle A4) ;
--   · 27 retraits Opla vivants (needs_user ou en file), jamais faisables.
-- `opla_ouvert` = 1 ne commandait plus rien depuis le 18/09 (seule lecture :
-- l'app, valeur jamais utilisée) : elle passe à 0 et l'app ne la lit plus.
--
-- LA RÈGLE (décision de Nico du 11/10 : A3 et A4 RÉVOQUÉS), UNE SEULE SOURCE :
-- `opla_sortie_le` (secondes epoch ; 0 = sortie désactivée ; absente = le
-- 10/10/2026 00:00 Paris) — la même que _shared/opla-sortie.js, depop_autorise.
--   1. opla_sortie_passee() : l'interrupteur, lu par toute la base ;
--   2. AUCUN job Opla vivant après la sortie : tout job Opla qui NAÎT ou
--      REDEVIENT pending / processing / needs_user (publication, republication,
--      RETRAIT ; app, serveur, extension, relance, créneau) est clos aussitôt :
--      'cancelled' + message vrai ; un retrait dit la phrase de Nico (la copie
--      est peut-être encore en ligne sur Opla, à retirer soi-même) ;
--   3. AUCUN relevé Opla : une ligne vinted_sync_runs Opla n'est plus créée
--      (même mécanisme que garde_releve_sans_geste : l'insertion est ignorée,
--      l'extension lit « run_non_cree » et ne lit rien) ; « Synchroniser »
--      refuse Opla comme une plateforme inconnue (demander_sync_plateforme) ;
--   4. AUCUNE question « Déjà vendu ? » sur une copie Opla (elle ne se retire
--      plus d'ici) : poser_questions_copies_non_prouvees l'écarte.
-- Avant la bascule (ou interrupteur à 0) : rien ne change.
-- Ce qui ne dépend pas de la base : get-pending-jobs ne sert plus aucun job ni
-- relevé Opla, handler-watch clôt ce qui reste et ne relance plus rien,
-- l'extension 0.6.107 ne lit plus Opla (veilleur, relevés, sonde).
--
-- Rattrapage (jobs Opla vivants, relevés en file, questions sur des copies
-- Opla) : scripts/reparations/20261011_opla_sortie_rattrapage.sql — sauvegarde
-- avant, par la règle (le déclencheur ci-dessous fait la clôture), aucun mail,
-- aucune notification.
-- Inverse : scripts/reparations/20261011_inverse_opla_sortie_plus_aucune_action.sql
-- Preuve (transaction annulée) : node scripts/preuves/preuve-opla-plus-rien.mjs --avec-migration=20261011130000
--
-- MESURE (« tâche automatique mesurée, bornée ») : aucune tâche nouvelle. Les
-- déclencheurs ne lisent qu'une clé de coin_config (index primaire), et
-- seulement pour une ligne Opla (clause WHEN).
-- Application (règle du 01/10) :
--   npx supabase db query --linked -f supabase/migrations/20261011130000_opla_sortie_plus_aucune_action.sql
--   npx supabase migration repair --linked --status applied 20261011130000

-- ── 1. L'interrupteur, une seule lecture ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.opla_sortie_passee()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT CASE WHEN c.value = 0 THEN false ELSE now() >= to_timestamp(c.value) END
                     FROM public.coin_config c WHERE c.key = 'opla_sortie_le'),
                  now() >= to_timestamp(1791583200));
$function$;
GRANT EXECUTE ON FUNCTION public.opla_sortie_passee() TO authenticated, service_role;

-- Les messages (mot pour mot ceux de _shared/opla-sortie.js, messageClotureOpla).
CREATE OR REPLACE FUNCTION public.opla_message_cloture(p_action text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE coalesce(p_action, 'publish')
    WHEN 'delete' THEN 'Opla n''est plus pris en charge par FillSell : cette annonce vendue est peut-être encore en ligne sur Opla, retire-la toi-même sur Opla.'
    WHEN 'republish' THEN 'Opla n''est plus disponible dans FillSell. Ton annonce Opla n''a pas été touchée, et cela ne compte pas dans tes limites.'
    ELSE 'Opla n''est plus disponible dans FillSell. Rien n''a été publié sur Opla, et cela ne compte pas dans tes limites.'
  END;
$function$;
GRANT EXECUTE ON FUNCTION public.opla_message_cloture(text) TO authenticated, service_role;

-- ── 2. Aucun job Opla vivant après la sortie ───────────────────────────────
CREATE OR REPLACE FUNCTION public.garde_opla_sortie_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_avant text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NEW.status END;
  v_pf    jsonb := coalesce(NEW.platform_fields, '{}'::jsonb);
BEGIN
  IF NOT public.opla_sortie_passee() THEN RETURN NEW; END IF;
  -- L'erreur d'avant est gardée (comme archiverErreur) : jamais rien d'effacé.
  IF TG_OP = 'UPDATE' AND nullif(btrim(coalesce(OLD.error, '')), '') IS NOT NULL THEN
    v_pf := jsonb_set(v_pf, '{erreurs_archivees}',
      coalesce(v_pf -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'erreur', OLD.error, 'statut', OLD.status, 'archive_le', now(), 'par', 'garde_opla_sortie_jobs (sortie d''Opla)')));
  END IF;
  NEW.platform_fields := (v_pf - 'needs_user_source' - 'next_action_after') || jsonb_build_object('opla_sortie', jsonb_build_object(
    'le', now(), 'par', 'garde_opla_sortie_jobs', 'statut_avant', v_avant,
    'source_avant', v_pf ->> 'needs_user_source', 'operation', TG_OP));
  NEW.status := 'cancelled';
  NEW.error := public.opla_message_cloture(coalesce(NEW.action, 'publish'));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS garde_opla_sortie_jobs ON public.cross_post_jobs;
CREATE TRIGGER garde_opla_sortie_jobs
  BEFORE INSERT OR UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.platform = 'opla' AND NEW.status IN ('pending', 'processing', 'needs_user'))
  EXECUTE FUNCTION public.garde_opla_sortie_jobs();

-- ── 3. Aucun relevé Opla ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.garde_opla_sortie_releves()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.opla_sortie_passee() THEN RETURN NEW; END IF;
  RAISE LOG 'garde_opla_sortie_releves : relevé Opla % ignoré (user %, déclencheur %) — sortie d''Opla',
    coalesce(NEW.kind, '?'), NEW.user_id, coalesce(NEW.declencheur, '(aucun)');
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS garde_opla_sortie_releves ON public.vinted_sync_runs;
CREATE TRIGGER garde_opla_sortie_releves
  BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW
  WHEN (NEW.platform = 'opla')
  EXECUTE FUNCTION public.garde_opla_sortie_releves();

-- « Synchroniser » : Opla refusée comme une plateforme inconnue (définition
-- EN PROD du 11/10, une condition ajoutée après celle de Depop).
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
  v_api  boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  -- (09/10) Depop : seulement pour un compte autorisé (depop_autorise).
  IF v_pf = 'depop' AND NOT public.depop_autorise(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  -- (11/10, Nico) Sortie d'Opla : plus aucun relevé Opla, pour personne.
  IF v_pf = 'opla' AND public.opla_sortie_passee() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  -- (27/09) « Je ne vends pas sur X » : aucun relevé, même demandé à la main.
  IF plateforme_ecartee_pour(v_user, v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_ecartee');
  END IF;
  -- (04/10) eBay relié officiellement : le serveur lit le compte par l'API.
  v_api := v_pf = 'ebay' AND compte_ebay_api(v_user) IS NOT NULL;
  IF NOT v_api THEN
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
    -- (08/10) Pas un refus : la plateforme vient d'être lue, le rangement repart.
    PERFORM rapprochement_demander(v_user, 'recent:' || v_pf);
    PERFORM rapprochement_relancer(v_user);
    RETURN jsonb_build_object('ok', true, 'reason', 'recent', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  IF v_api THEN
    -- (08/10) Le relevé par l'API part tout de suite, jamais par l'extension.
    BEGIN
      PERFORM net.http_post(
        url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-releve-api',
        body := jsonb_build_object('quotidien', false, 'user_id', v_user),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
        timeout_milliseconds := 120000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'demander_sync_plateforme(ebay api, %) : %', v_user, SQLERRM;
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id, 'par_api', v_api);
END;
$function$;

-- ── 4. Aucune question « Déjà vendu ? » sur une copie Opla ─────────────────
-- (définition EN PROD du 11/10, une condition ajoutée)
CREATE OR REPLACE FUNCTION public.poser_questions_copies_non_prouvees(p_inventaire_id bigint, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_source text DEFAULT 'vente'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv inventaire%ROWTYPE;
  v_vendu_sur text;
  n integer := 0;
BEGIN
  SELECT * INTO v_inv FROM inventaire WHERE id = p_inventaire_id;
  IF NOT FOUND OR v_inv.fusionne_dans IS NOT NULL OR v_inv.statut IS DISTINCT FROM 'vendu' THEN
    RETURN 0;
  END IF;
  -- La plateforme de la vente, pour le texte : la vente enregistrée, sinon la fiche.
  SELECT lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) INTO v_vendu_sur
    FROM ventes v
   WHERE v.user_id = v_inv.user_id AND v.inventaire_id = v_inv.id
     AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
   ORDER BY v.created_at DESC LIMIT 1;
  v_vendu_sur := COALESCE(v_vendu_sur, lower(NULLIF(btrim(COALESCE(v_inv.plateforme, '')), '')));

  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  SELECT v_inv.user_id, v_inv.id, v_inv.id, 'probable', 'proposee', 'copie_non_prouvee',
         jsonb_build_object(
           'job', j.id, 'annonce_id', ap.id, 'platform', j.platform,
           'url', COALESCE(NULLIF(btrim(COALESCE(ap.url, '')), ''), NULLIF(btrim(COALESCE(j.listing_url, '')), '')),
           'titre', COALESCE(NULLIF(btrim(COALESCE(ap.titre, '')), ''), NULLIF(btrim(COALESCE(j.title, '')), ''), v_inv.titre),
           'vendu_sur', v_vendu_sur,
           'rattachement', j.platform_fields -> 'rattachement'),
         left(COALESCE(p_source, 'vente'), 80)
    FROM cross_post_jobs j
    JOIN LATERAL (
      SELECT a.id, a.url, a.titre FROM annonces_plateforme a
       WHERE a.job_id = j.id AND a.user_id = j.user_id AND a.disparu_le IS NULL AND a.retiree_le IS NULL
       ORDER BY a.vu_le DESC NULLS LAST LIMIT 1) ap ON true
   WHERE j.user_id = v_inv.user_id AND j.inventaire_id = v_inv.id
     AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published'
     AND (p_sauf_job IS NULL OR j.id <> p_sauf_job)
     AND (p_sauf_plateforme IS NULL OR j.platform <> p_sauf_plateforme)
     AND lower(COALESCE(NULLIF(v_inv.plateforme, ''), '')) <> lower(j.platform)
     AND (v_vendu_sur IS NULL OR v_vendu_sur <> lower(j.platform))
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'
     -- (11/10, Nico) Sortie d'Opla : aucune question sur une copie Opla (elle ne se retire plus d'ici).
     AND NOT (j.platform = 'opla' AND public.opla_sortie_passee())
     AND NOT public.retrait_job_prouve(j.id)
     AND public.fiche_annonces_vivantes(v_inv.id, j.platform) < 2
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d
                      WHERE d.user_id = j.user_id AND d.inventaire_id = j.inventaire_id AND d.platform = j.platform
                        AND d.action = 'delete' AND d.status IN ('pending', 'processing', 'needs_user'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- ── 5. opla_ouvert : la clé morte s'aligne sur la sortie (journalisé) ──────
WITH maj AS (
  UPDATE public.coin_config SET value = 0, updated_at = now()
   WHERE key = 'opla_ouvert' AND value IS DISTINCT FROM 0
  RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, 1, value, 'migration 20261011130000 (clé morte depuis le 18/09 ; la sortie se lit sur opla_sortie_le)' FROM maj;
