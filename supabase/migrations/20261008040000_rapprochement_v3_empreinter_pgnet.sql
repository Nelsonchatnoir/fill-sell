-- ═══════════════════════════════════════════════════════════════════════════
-- (08/10) LES EMPREINTES MANQUANTES PARTENT PAR LA BASE (pg_net), JAMAIS PAR UN
-- fetch DE LA FONCTION EDGE
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré sur Corinne le 08/10 à 01:02 (rapprochement v6, trace par passage) :
-- un appel edge → edge est limité par le runtime — après 60 appels à
-- empreintes-urls (360 photos) en une minute, chaque fetch suivant est refusé
-- sur-le-champ : « Rate limit exceeded for function. Retry after 17873ms ».
-- Six passages « sans progrès » plus tard, le compte était classé avec 1 191
-- photos sans empreinte (jamais une fusion à tort — la fusion exige la photo —
-- mais des doutes en trop). Les mêmes appels envoyés par pg_net ne sont pas
-- limités : 100 appels d'un coup (600 photos) → 100 × HTTP 200 en quelques
-- secondes (01:04). C'est déjà la voie de fusion_photo_tick (cron 20).
--
-- rapprochement (fonction edge) appelle cette fonction par lot, puis attend
-- l'arrivée des lignes (photo_empreintes / photo_empreintes_echecs), bornée.
-- Service role seulement : c'est l'orchestrateur qui la tient, jamais l'app.

CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreinter(
  p_urls text[],
  p_par_appel int DEFAULT 6,     -- empreintes-urls : 2 s de CPU par requête
  p_appels_max int DEFAULT 100   -- 600 photos par lot
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.rapprochement_v3_empreinter(text[], int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_empreinter(text[], int, int) TO service_role;
