-- INVERSE de 20261104200000_depart_activite_anonyme : enregistrer_depart reprend sa définition de prod du 04/11
-- (pg_get_functiondef, identique à 20261006090000), puis les deux fonctions neuves et la colonne partent.
-- ⚠️ Retirer la colonne efface les résumés déjà écrits : les recopier d'abord si on veut les garder.
BEGIN;

CREATE OR REPLACE FUNCTION public.enregistrer_depart(p_motif text, p_texte text, p_plateforme_app text, p_version_app text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_motif       text;
  v_texte       text;
  v_app         text;
  v_version     text;
  v_palier      text;
  v_anciennete  integer;
  v_ext_vue     boolean;
  v_ext_version text;
  v_plateformes text[] := '{}';
  v_nb          integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'enregistrer_depart : appel sans utilisateur' USING errcode = 'insufficient_privilege';
  END IF;

  -- Une seule réponse par compte : une seconde tentative (suppression relancée
  -- après un échec réseau) garde la première, sans erreur.
  INSERT INTO departs_compte_garde (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_motif := CASE WHEN p_motif IN ('installation', 'pas_marche', 'trop_cher', 'plus_besoin', 'autre_outil', 'autre') THEN p_motif END;
  v_texte := left(nullif(btrim(coalesce(p_texte, '')), ''), 2000);
  v_app := CASE WHEN lower(btrim(coalesce(p_plateforme_app, ''))) IN ('ios', 'android', 'web') THEN lower(btrim(p_plateforme_app)) END;
  v_version := left(nullif(btrim(coalesce(p_version_app, '')), ''), 80);

  BEGIN
    v_palier := palier_de(v_uid);
  EXCEPTION WHEN OTHERS THEN v_palier := NULL;
  END;

  BEGIN
    SELECT floor(extract(epoch FROM now() - u.created_at) / 60)::integer INTO v_anciennete
      FROM auth.users u WHERE u.id = v_uid;
  EXCEPTION WHEN OTHERS THEN v_anciennete := NULL;
  END;

  BEGIN
    SELECT (p.extension_last_seen_at IS NOT NULL OR nullif(btrim(p.extension_version), '') IS NOT NULL),
           nullif(btrim(p.extension_version), ''),
           coalesce(ARRAY(
             SELECT k FROM unnest(ARRAY['vinted', 'leboncoin', 'beebs', 'ebay', 'opla', 'depop']) AS k
              WHERE p.extension_sessions ->> k = 'true'), '{}')
      INTO v_ext_vue, v_ext_version, v_plateformes
      FROM profiles p WHERE p.id = v_uid;
    IF EXISTS (SELECT 1 FROM ebay_accounts e WHERE e.user_id = v_uid AND e.revoked_at IS NULL)
       AND NOT ('ebay' = ANY (coalesce(v_plateformes, '{}'))) THEN
      v_plateformes := coalesce(v_plateformes, '{}') || 'ebay'::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT count(*)::integer INTO v_nb FROM inventaire i WHERE i.user_id = v_uid AND i.fusionne_dans IS NULL;
  EXCEPTION WHEN OTHERS THEN v_nb := NULL;
  END;

  INSERT INTO departs_compte (motif, texte, palier, anciennete_minutes, extension_installee, extension_version,
                              plateformes_connectees, nb_articles, plateforme_app, version_app)
  VALUES (v_motif, v_texte, v_palier, v_anciennete, coalesce(v_ext_vue, false), v_ext_version,
          coalesce(ARRAY(SELECT DISTINCT x FROM unnest(v_plateformes) x ORDER BY 1), '{}'), v_nb, v_app, v_version);
  RETURN true;
END;
$function$
;

DROP FUNCTION IF EXISTS public.activite_anonyme_depart(uuid);
DROP FUNCTION IF EXISTS public.erreur_anonyme(text, text[]);
ALTER TABLE public.departs_compte DROP COLUMN IF EXISTS activite;

COMMIT;
