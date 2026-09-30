-- ═══════════════════════════════════════════════════════════════════════════
-- LE SECRET DES CRONS SORT DU DÉPÔT : IL SE LIT DANS LE VAULT (30/09, 22:45)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le secret `x-cron-secret` était écrit en clair dans les migrations, dans
-- `_shared/payment-notify.ts`, dans CLAUDE.md — et donc sur GitHub depuis le
-- 12/06 (783a8e1). Qui l'a peut déclencher n'importe lequel de nos crons.
--
-- Ce fichier ne change RIEN au comportement : la valeur mise dans le vault est
-- celle d'aujourd'hui, relue dans une commande de cron existante (elle n'est
-- écrite nulle part ici). Il remplace seulement les endroits qui la portaient :
--   · public.cron_secret() : lit `cron_secret` dans vault.decrypted_secrets ;
--     SECURITY DEFINER, fermée à anon/authenticated (seuls postgres, les crons
--     et les fonctions DEFINER l'appellent) ;
--   · les 11 commandes de cron.job qui portaient le secret : l'en-tête devient
--     (en-tête sans le secret) || jsonb_build_object('x-cron-secret', cron_secret()) ;
--   · handle_new_user, recalage_xewer_tick, fusion_photo_tick : réécrites
--     DEPUIS pg_get_functiondef, seul l'en-tête change.
-- La ROTATION (nouvelle valeur) se fait ensuite, hors fichier : vault ET
-- variable CRON_SECRET des fonctions au même moment (docs/ROTATION_CRON_SECRET.md).
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

-- ── 1. Le secret dans le vault (valeur d'aujourd'hui, relue en base) ───────
DO $v$
DECLARE v_val text;
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN RETURN; END IF;
  SELECT substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') INTO v_val
    FROM cron.job WHERE jobname = 'handler-watch-3min';
  IF v_val IS NULL THEN RAISE EXCEPTION 'secret de cron introuvable dans handler-watch-3min'; END IF;
  PERFORM vault.create_secret(v_val, 'cron_secret', 'x-cron-secret des crons et triggers pg_net (30/09)');
END $v$;

CREATE OR REPLACE FUNCTION public.cron_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$f$;
REVOKE ALL ON FUNCTION public.cron_secret() FROM PUBLIC, anon, authenticated;

-- ── 2. Les commandes de cron ────────────────────────────────────────────────
DO $c$
DECLARE j record; v_cmd text;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job WHERE command ~ '"x-cron-secret"\s*:\s*"' LOOP
    v_cmd := regexp_replace(j.command, '"x-cron-secret"\s*:\s*"[^"]*"\s*,', '', 'g');
    v_cmd := regexp_replace(v_cmd, ',\s*"x-cron-secret"\s*:\s*"[^"]*"', '', 'g');
    v_cmd := regexp_replace(v_cmd, '(headers\s*:=\s*)(''[^'']*''::jsonb)',
                            '\1(\2 || jsonb_build_object(''x-cron-secret'', public.cron_secret()))');
    IF v_cmd ~ '"x-cron-secret"\s*:\s*"' OR v_cmd !~ 'public\.cron_secret\(\)' THEN
      RAISE EXCEPTION 'commande du cron % non transformée', j.jobid;
    END IF;
    PERFORM cron.alter_job(j.jobid, command := v_cmd);
  END LOOP;
END $c$;

-- ── 3. Les trois fonctions (depuis leur définition en prod) ─────────────────
DO $fn$
DECLARE f text; v_def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.handle_new_user()', 'public.recalage_xewer_tick()', 'public.fusion_photo_tick()'] LOOP
    v_def := pg_get_functiondef(f::regprocedure);
    v_def := regexp_replace(v_def,
      '''\{"Content-Type"\s*:\s*"application/json"\s*,\s*"x-cron-secret"\s*:\s*"[^"]*"\}''::jsonb',
      'jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', public.cron_secret())', 'g');
    IF v_def ~ '"x-cron-secret"\s*:\s*"' OR v_def !~ 'public\.cron_secret\(\)' THEN
      RAISE EXCEPTION 'fonction % non transformée', f;
    END IF;
    EXECUTE v_def;
  END LOOP;
END $fn$;
