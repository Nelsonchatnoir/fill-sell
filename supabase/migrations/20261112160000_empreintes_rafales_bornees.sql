-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261112160000_empreintes_rafales_bornees — PAS PLUS DE 10 APPELS D'EMPREINTES À LA FOIS (12/11, point 5, GO de Nico)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CAUSE PROUVÉE (journaux, lecture seule, 24 h au 12/11) : empreintes-urls échoue (546, « CPU Time exceeded ») pendant
-- les RAFALES d'appels simultanés : 0 % d'échec dans les minutes à 1–3 appels, 25,5 % à 13–30, 27,5 % à 31 et plus ;
-- 661 des 690 échecs dans les minutes à 13 appels et plus ; ≈ 5,6 requêtes perdues par arrêt du worker. 87 % des appels
-- viennent de rapprochement_v3_empreinter (rapprochement après « Synchroniser » : 30 appels de 6 photos d'un coup, alors
-- que la fonction n'en traite que 5 — la 6e est remise à chaque fois ; la fonction en permettait 200).
-- CE QUI CHANGE : 10 appels à la fois au plus, 5 photos par appel (défauts 5 et 10, et une demande plus grosse est
-- bornée). Rien d'autre. Le débit du client est gardé par la fonction edge rapprochement (même lot) : 50 photos par passe
-- (au lieu de 180) relues après 4 s (au lieu de 12), 40 relances par chaîne pour les photos (au lieu de 12).
-- fusion_photo_tick : INCHANGÉE (6 appels de 4 photos au plus, une fois par minute : déjà sous la borne).
-- Fonction réécrite depuis pg_get_functiondef EN PROD (lu le 12/11 vers 15:10, md5 84047aafee4b325fa6f5a91db3665f3b) ; SECURITY DEFINER,
-- search_path, propriétaire et droits (postgres, service_role) inchangés (CREATE OR REPLACE les garde).
-- Banc : scripts/essais/20261112160000_banc.mjs. Sauvegarde : scripts/reparations/20261112_empreintes_rafales_bornees_SAUVEGARDE.sql.
-- Inverse : supabase/rollbacks/20261112160000_empreintes_rafales_bornees_INVERSE.sql.
BEGIN;

DO $garde$
BEGIN
  IF md5(replace(pg_get_functiondef('public.rapprochement_v3_empreinter(text[],integer,integer)'::regprocedure), chr(13), '')) <> '84047aafee4b325fa6f5a91db3665f3b' THEN
    RAISE EXCEPTION 'rapprochement_v3_empreinter a changé en prod depuis sa lecture du 12/11 : régénérer 20261112160000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreinter(p_urls text[], p_par_appel integer DEFAULT 5, p_appels_max integer DEFAULT 10)
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
  -- (12/11, point 5 de Nico) Jamais plus de 10 appels à la fois, 5 photos chacun (ce que empreintes-urls traite :
  -- MAX_URLS = 5) : au-delà, les appels simultanés partagent un worker qui dépasse son temps de calcul et échouent
  -- ensemble (546). Une demande plus grosse est BORNÉE, jamais refusée : le reste part à la relance suivante.
  IF p_par_appel IS NULL OR p_par_appel < 1 THEN p_par_appel := 5; END IF;
  p_par_appel := LEAST(p_par_appel, 5);
  IF p_appels_max IS NULL OR p_appels_max < 1 THEN p_appels_max := 10; END IF;
  p_appels_max := LEAST(p_appels_max, 10);
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
