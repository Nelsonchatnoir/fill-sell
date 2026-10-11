-- INVERSE de supabase/migrations/20261011130000_opla_sortie_plus_aucune_action.sql
-- Retire les deux gardes, rend demander_sync_plateforme et
-- poser_questions_copies_non_prouvees telles qu'avant (définitions EN PROD du
-- 11/10, avant la migration) et opla_ouvert à 1 (journalisé).
--   npx supabase db query --linked -f scripts/reparations/20261011_inverse_opla_sortie_plus_aucune_action.sql
BEGIN;
DROP TRIGGER IF EXISTS garde_opla_sortie_jobs ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS garde_opla_sortie_releves ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.garde_opla_sortie_jobs();
DROP FUNCTION IF EXISTS public.garde_opla_sortie_releves();
-- (les définitions d'avant, recopiées de la prod le 11/10, suivent)
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

WITH maj AS (UPDATE public.coin_config SET value = 1, updated_at = now() WHERE key = 'opla_ouvert' AND value IS DISTINCT FROM 1 RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par) SELECT key, 0, value, 'inverse de la migration 20261011130000' FROM maj;
-- opla_sortie_passee() et opla_message_cloture() restent (sans effet seules).
COMMIT;
