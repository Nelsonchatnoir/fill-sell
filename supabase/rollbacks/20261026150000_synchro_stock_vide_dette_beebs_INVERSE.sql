-- INVERSE de 20261026150000_synchro_stock_vide_dette_beebs.sql : les trois corps de prod du 26/10 13:30, à l'identique.
BEGIN;
CREATE OR REPLACE FUNCTION public.demander_sync_dressing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_prof    record;
  v_capable boolean;
  v_fini    timestamptz;
  v_dans    integer;
  v_actif   text;
  v_id      uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  -- Une demande morte ne doit jamais bloquer le compte (index unique).
  perform purger_sync_queue_perimee(v_user);

  select extension_last_seen_at, extension_version into v_prof
  from profiles where id = v_user;

  -- Jamais aucune extension sur ce compte → accroche d'installation côté UI.
  if v_prof.extension_last_seen_at is null then
    return jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
  end if;

  -- Connue mais incapable de synchroniser (0.4.x, ou version jamais annoncée
  -- parce que le build est antérieur à l'envoi de `version` au poll) → message
  -- de mise à jour, surtout pas d'accroche d'installation.
  v_capable := version_cle(v_prof.extension_version) is not null
               and version_cle(v_prof.extension_version) >= version_cle('0.5.0');
  if not v_capable then
    return jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  end if;

  -- Cadence 15 min — vérifiée ICI **et** à la reprise par l'extension (le PC
  -- peut se réveiller des heures plus tard, après un cron quotidien qui a déjà
  -- synchronisé). Seul un run DONE arme la fenêtre : un échec se retente tout
  -- de suite. Miroir : SYNC_MANUAL_COOLDOWN_MS (background.js) et
  -- SYNC_CADENCE_MANUELLE_MS (src/utils/vintedSync.js) — même valeur, à faire
  -- évoluer ENSEMBLE.
  select max(finished_at) into v_fini
  from vinted_sync_runs
  where user_id = v_user and kind = 'dressing' and status = 'done';
  if v_fini is not null and v_fini > now() - interval '15 minutes' then
    v_dans := greatest(1, ceil(extract(epoch from (v_fini + interval '15 minutes' - now())) / 60)::int);
    return jsonb_build_object('ok', false, 'reason', 'cadence', 'prochaine_dans_min', v_dans);
  end if;

  -- Deux situations que l'index unique confond (il interdit les deux) et que
  -- l'utilisateur vit très différemment : une demande QUI ATTEND encore, et une
  -- sync DÉJÀ EN TRAIN de tourner sur l'ordinateur. Dire « déjà en attente »
  -- pendant qu'une sync tourne serait faux. On lit donc l'état avant d'insérer.
  select status into v_actif
  from vinted_sync_runs
  where user_id = v_user and kind = 'dressing' and status in ('queued', 'running')
  limit 1;
  if v_actif = 'running' then
    return jsonb_build_object('ok', false, 'reason', 'sync_en_cours');
  elsif v_actif = 'queued' then
    return jsonb_build_object('ok', false, 'reason', 'deja_en_attente');
  end if;

  -- L'index unique reste le juge en cas de course (deux clics à la
  -- milliseconde) : on relit alors l'état pour rendre le bon motif plutôt
  -- qu'un « déjà en attente » par défaut.
  begin
    insert into vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
    values (v_user, 'dressing', 'queued', 'bouton_distant', now())
    returning id into v_id;
  exception when unique_violation then
    select status into v_actif
    from vinted_sync_runs
    where user_id = v_user and kind = 'dressing' and status in ('queued', 'running')
    limit 1;
    return jsonb_build_object('ok', false,
      'reason', case when v_actif = 'running' then 'sync_en_cours' else 'deja_en_attente' end);
  end;

  return jsonb_build_object('ok', true, 'run_id', v_id);
end;
$function$;

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

-- (26/10 17:10) Corps de PROD APRÈS la migration 20261026171000 (exception eBay de Julian) : l'inverse de B ne la perd jamais.
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'beebs' AND releve_dette_beebs(p_user) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    -- (26/10, Julian Boissel — Nico) Le relevé serveur d'un compte eBay relié, lu par SON jeton, importe comme
    -- « Synchroniser » : une annonce eBay en ligne sans fiche devient une fiche. Les veilles de l'extension, non.
    IF NOT (releve_est_geste(v_run.declencheur)
            OR (a.platform = 'ebay' AND v_run.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine'))) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$
;

DROP FUNCTION IF EXISTS public.releve_dette_beebs_depuis(uuid, timestamptz);
COMMIT;
