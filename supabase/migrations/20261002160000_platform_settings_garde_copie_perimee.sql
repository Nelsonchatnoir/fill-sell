-- ═══════════════════════════════════════════════════════════════════════════
-- platform_settings : la garde refuse aussi la COPIE PÉRIMÉE (02/10, suite)
-- ═══════════════════════════════════════════════════════════════════════════
-- Complète 20261002153000. Les apps et extensions déjà installées (extension
-- ≤ 0.6.86, onglets ouverts sur un ancien bundle) écrivent encore l'objet
-- ENTIER par un PATCH direct. La garde refuse déjà qu'une clé disparaisse ;
-- reste la copie périmée qui garde toutes les clés mais en ramène une
-- ancienne valeur (l'extension réécrivait un objet lu plusieurs minutes plus
-- tôt : une adresse Leboncoin corrigée entre-temps revenait à l'ancienne).
--
-- Chaque ancien écrivain ne change qu'UNE clé de premier niveau. Un PATCH
-- direct (PostgREST : request.method = 'PATCH') qui en change PLUSIEURS est
-- donc une copie périmée : refusé. Ne concerne pas les fonctions SQL ni la
-- porte platform_settings_fusionner (appelées en POST /rpc, ou hors API), qui
-- relisent la ligne sous verrou.
--
-- Rejouable : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.profiles_platform_settings_garde()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old      jsonb := CASE WHEN jsonb_typeof(OLD.platform_settings) = 'object' THEN OLD.platform_settings ELSE '{}'::jsonb END;
  v_new      jsonb := CASE WHEN jsonb_typeof(NEW.platform_settings) = 'object' THEN NEW.platform_settings ELSE '{}'::jsonb END;
  v_autorise text[] := string_to_array(NULLIF(current_setting('fillsell.ps_suppression', true), ''), ',');
  v_perdues  text[];
  v_changees text[];
BEGIN
  IF '*' = ANY (COALESCE(v_autorise, '{}')) THEN
    RETURN NEW;
  END IF;
  SELECT array_agg(c ORDER BY c) INTO v_perdues
  FROM (
    -- Toute clé de premier niveau.
    SELECT k AS c FROM jsonb_object_keys(v_old) k WHERE NOT (v_new ? k)
    UNION ALL
    -- Les champs d'adresse Leboncoin (la clé leboncoin restant présente).
    SELECT 'leboncoin.' || s
    FROM unnest(ARRAY['adresse', 'rue', 'code_postal', 'ville']) s
    WHERE jsonb_typeof(v_old -> 'leboncoin') = 'object' AND (v_old -> 'leboncoin') ? s
      AND v_new ? 'leboncoin'
      AND NOT (jsonb_typeof(v_new -> 'leboncoin') = 'object' AND (v_new -> 'leboncoin') ? s)
    UNION ALL
    -- Le lieu d'expédition eBay.
    SELECT 'ebay.adresse_expedition'
    WHERE jsonb_typeof(v_old -> 'ebay') = 'object' AND (v_old -> 'ebay') ? 'adresse_expedition'
      AND v_new ? 'ebay'
      AND NOT (jsonb_typeof(v_new -> 'ebay') = 'object' AND (v_new -> 'ebay') ? 'adresse_expedition')
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(v_autorise, '{}')) a WHERE x.c = a OR x.c LIKE a || '.%'
  );
  IF v_perdues IS NOT NULL THEN
    RAISE EXCEPTION 'platform_settings : écriture refusée, elle effacerait % — écrire par platform_settings_fusionner',
      array_to_string(v_perdues, ', ')
      USING ERRCODE = 'P0001',
            HINT = 'Une suppression se demande explicitement (paramètre p_supprimer).';
  END IF;

  -- La copie périmée d'un ancien client : PATCH direct qui change plusieurs
  -- clés de premier niveau d'un coup.
  IF current_setting('request.method', true) = 'PATCH' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changees
    FROM (
      SELECT k FROM jsonb_object_keys(v_new) k WHERE (v_old -> k) IS DISTINCT FROM (v_new -> k)
    ) y;
    IF cardinality(v_changees) > 1 THEN
      RAISE EXCEPTION 'platform_settings : écriture refusée, elle changerait % d''un coup (copie périmée probable) — écrire par platform_settings_fusionner',
        array_to_string(v_changees, ', ')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
