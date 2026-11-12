-- INVERSE de supabase/migrations/20261112160000_empreintes_rafales_bornees.sql (12/11/2026) : la définition de PROD de
-- rapprochement_v3_empreinter lue le 12/11 vers 15:10 (pg_get_functiondef, lecture seule), à l'octet (md5 84047aafee4b325fa6f5a91db3665f3b). Droits
-- inchangés. Aucune ligne à remettre : la migration n'en écrit aucune.
-- Avec l'inverse, redéployer la fonction edge rapprochement depuis l'archive de cfef7d7 (180 photos, 12 s, 12 relances).
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261112160000_empreintes_rafales_bornees_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261112160000
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreinter(p_urls text[], p_par_appel integer DEFAULT 6, p_appels_max integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n int := COALESCE(array_length(p_urls, 1), 0);
  v_i int := 1;
  v_appels int := 0;
  v_lot text[];
BEGIN
  IF p_par_appel IS NULL OR p_par_appel < 1 OR p_par_appel > 8 THEN p_par_appel := 6; END IF;
  IF p_appels_max IS NULL OR p_appels_max < 1 OR p_appels_max > 200 THEN p_appels_max := 100; END IF;
  WHILE v_i <= v_n AND v_appels < p_appels_max LOOP
    v_lot := p_urls[v_i : v_i + p_par_appel - 1];
    BEGIN
      PERFORM net.http_post(
        url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/empreintes-urls',
        body := jsonb_build_object('urls', to_jsonb(v_lot)),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
        timeout_milliseconds := 60000);
      v_appels := v_appels + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rapprochement_v3_empreinter : %', SQLERRM;
      EXIT;
    END;
    v_i := v_i + p_par_appel;
  END LOOP;
  RETURN jsonb_build_object('appels', v_appels, 'photos', LEAST(v_n, v_appels * p_par_appel));
END;
$function$;

COMMIT;
