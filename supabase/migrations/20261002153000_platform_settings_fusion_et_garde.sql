-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.platform_settings : UNE SEULE PORTE D'ÉCRITURE + UNE GARDE (02/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Incident du 02/10 : l'adresse Leboncoin d'ornellaracano a disparu entre le
-- 30/09 20:25Z et le 01/10 06:19Z (publication Leboncoin bloquée), celle de
-- meminiandmove entre le 21 et le 25/09, les plateformes choisies à l'entrée
-- de deux autres comptes aussi. Cause : NEUF écrivains (app, extension,
-- get-pending-jobs) faisaient « lire l'objet entier → modifier une clé →
-- réécrire l'objet entier ». Une lecture ratée ou vide (`cur?.platform_settings
-- || {}`) et l'objet entier était remplacé par la seule clé écrite ; deux
-- écrivains simultanés (onglet + extension, dont l'extension qui réécrit une
-- copie lue plusieurs minutes plus tôt) et la dernière écriture effaçait
-- l'autre.
--
-- 1. platform_settings_fusionner(chemin, patch, supprimer) — la seule façon
--    d'écrire désormais. Le serveur relit la ligne sous verrou (FOR UPDATE),
--    fusionne UNIQUEMENT à l'emplacement visé, crée les parents manquants,
--    et n'enlève que les clés nommées dans `supprimer`. Jamais l'objet entier.
--      · patch objet sur un objet → fusion de premier niveau à cet endroit
--        (`||`) : viser l'objet le plus profond qu'on modifie ;
--      · patch non-objet (tableau, booléen…) → la valeur à cet endroit est
--        remplacée (ex. extension_jours, plateformes_vendeur) ;
--      · chemin vide : patch objet obligatoire (la racine n'est jamais
--        remplacée, seulement complétée).
--    SECURITY INVOKER : la RLS de profiles s'applique (sa propre ligne). Sans
--    session (clé de service, scripts), p_user est obligatoire.
--
-- 2. profiles_platform_settings_garde — REFUSE toute écriture (y compris un
--    PATCH direct d'une ancienne app ou d'une ancienne extension encore en
--    service) qui ferait disparaître une clé existante : toutes les clés de
--    premier niveau (leboncoin, vinted, ebay, beebs, opla, plateformes_vendeur,
--    extension_jours…), plus les champs d'adresse leboncoin.{adresse, rue,
--    code_postal, ville} et ebay.adresse_expedition. Une suppression n'est
--    permise que demandée explicitement : la fonction ci-dessus pose
--    `fillsell.ps_suppression` (liste des chemins pointés, pour la transaction)
--    à partir de son `supprimer` ; un script de réparation peut poser '*'.
--    Un VIDAGE de valeur (adresse = '') n'est pas une disparition : la
--    personne peut toujours effacer son adresse elle-même.
--
-- Rejouable : CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.platform_settings_fusionner(
  p_chemin    text[],
  p_patch     jsonb,
  p_supprimer text[] DEFAULT '{}',
  p_user      uuid   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid   := auth.uid();
  v_user   uuid;
  v_chemin text[] := COALESCE(p_chemin, '{}');
  v_supp   text[] := COALESCE(p_supprimer, '{}');
  v_ps     jsonb;
  v_new    jsonb;
  v_cible  jsonb;
  v_i      int;
BEGIN
  -- Qui écrit : la personne connectée (jamais pour un autre compte), ou, sans
  -- session, la clé de service / l'administrateur pour le compte nommé.
  IF v_uid IS NOT NULL THEN
    IF p_user IS NOT NULL AND p_user <> v_uid THEN
      RAISE EXCEPTION 'platform_settings_fusionner : écriture refusée pour un autre compte'
        USING ERRCODE = '42501';
    END IF;
    v_user := v_uid;
  ELSE
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'platform_settings_fusionner : session requise' USING ERRCODE = '42501';
    END IF;
    v_user := p_user;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'platform_settings_fusionner : compte non précisé' USING ERRCODE = '22023';
  END IF;
  IF p_patch IS NULL AND cardinality(v_supp) = 0 THEN
    RAISE EXCEPTION 'platform_settings_fusionner : rien à écrire' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_chemin) = 0 AND p_patch IS NOT NULL AND jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'platform_settings_fusionner : à la racine, seul un objet se fusionne' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_chemin || v_supp) s WHERE s IS NULL OR s = '' OR position(',' IN s) > 0) THEN
    RAISE EXCEPTION 'platform_settings_fusionner : clé vide ou invalide' USING ERRCODE = '22023';
  END IF;

  SELECT platform_settings INTO v_ps FROM profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_fusionner : profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  v_ps  := CASE WHEN jsonb_typeof(v_ps) = 'object' THEN v_ps ELSE '{}'::jsonb END;
  v_new := v_ps;

  -- Les parents manquants deviennent des objets vides. Un parent qui existe
  -- mais n'est PAS un objet : on refuse (le remplacer détruirait sa valeur).
  FOR v_i IN 1 .. cardinality(v_chemin) - 1 LOOP
    IF v_new #> v_chemin[1:v_i] IS NULL THEN
      v_new := jsonb_set(v_new, v_chemin[1:v_i], '{}'::jsonb, true);
    ELSIF jsonb_typeof(v_new #> v_chemin[1:v_i]) <> 'object' THEN
      RAISE EXCEPTION 'platform_settings_fusionner : « % » n''est pas un objet', array_to_string(v_chemin[1:v_i], '.')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_cible := CASE WHEN cardinality(v_chemin) = 0 THEN v_new ELSE v_new #> v_chemin END;
  IF p_patch IS NOT NULL THEN
    IF jsonb_typeof(p_patch) = 'object' AND (v_cible IS NULL OR jsonb_typeof(v_cible) = 'object') THEN
      v_cible := COALESCE(v_cible, '{}'::jsonb) || p_patch;
    ELSE
      v_cible := p_patch;
    END IF;
  END IF;
  IF cardinality(v_supp) > 0 AND jsonb_typeof(v_cible) = 'object' THEN
    v_cible := v_cible - v_supp;
  END IF;

  IF cardinality(v_chemin) = 0 THEN
    v_new := v_cible;
  ELSIF v_cible IS NOT NULL THEN
    v_new := jsonb_set(v_new, v_chemin, v_cible, true);
  END IF;

  IF v_new IS DISTINCT FROM v_ps THEN
    -- Les suppressions DEMANDÉES, et elles seules, passent la garde.
    PERFORM set_config('fillsell.ps_suppression',
      COALESCE((SELECT string_agg(array_to_string(v_chemin || s, '.'), ',') FROM unnest(v_supp) s), ''), true);
    UPDATE profiles SET platform_settings = v_new WHERE id = v_user;
    PERFORM set_config('fillsell.ps_suppression', '', true);
  END IF;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_settings_fusionner(text[], jsonb, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_settings_fusionner(text[], jsonb, text[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_settings_fusionner(text[], jsonb, text[], uuid) TO authenticated, service_role;

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_platform_settings_garde ON public.profiles;
CREATE TRIGGER profiles_platform_settings_garde
  BEFORE UPDATE OF platform_settings ON public.profiles
  FOR EACH ROW
  WHEN (OLD.platform_settings IS DISTINCT FROM NEW.platform_settings)
  EXECUTE FUNCTION public.profiles_platform_settings_garde();
