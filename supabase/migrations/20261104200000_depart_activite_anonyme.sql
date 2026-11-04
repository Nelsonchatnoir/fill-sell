-- ═══════════════════════════════════════════════════════════════════════════
-- FICHE DE DÉPART : CE QUE FILLSELL A FAIT, EN CHIFFRES ANONYMES (04/11, point 8)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 03/11, un compte est parti avec pour raison « mon compte Vinted vient d'être supprimé suite à la première
-- publication avec vous ». Tout a été effacé avec le compte : impossible de vérifier ce que FillSell avait fait
-- (combien de dépôts, à quel rythme, quelles erreurs).
--
-- LA RÈGLE (tous les comptes) : `enregistrer_depart`, que l'app appelle JUSTE AVANT d'effacer quoi que ce soit
-- (src/compte/supprimerCompte.js, seul point d'entrée web / iOS / Android), écrit désormais dans la nouvelle colonne
-- `departs_compte.activite` un résumé ANONYME de l'activité, par plateforme :
--   · publications, republications, retraits FAITS (mise en ligne prouvée : published_at ; retrait : statut deleted),
--     tâches demandées, annulées, encore en file ; nombre de tâches par voie (extension, api, cloud) ;
--   · première et dernière action (heure de Paris, à la minute), première et dernière mise en ligne ;
--   · nombre d'erreurs (erreur des tâches en échec ou en attente d'un geste + erreurs archivées, hors messages de file
--     « En file » / « En attente ») et les 3 DERNIÈRES, chacune réduite à : action, statut, heure, texte rendu
--     anonyme, diagnostic technique rendu anonyme.
--
-- RIEN QUI PERMETTE DE RETROUVER LA PERSONNE (RGPD) : ni e-mail, ni identifiant de compte, ni titre d'annonce, ni
-- numéro ou lien d'annonce, ni pseudo. Un texte d'erreur passe par `erreur_anonyme` :
--   1. le titre de l'annonce, son numéro, son lien, l'e-mail, sa partie avant « @ » et le pseudo de la personne sont
--      effacés mot pour mot (casse ignorée) ;
--   2. tout ce qui est CITÉ (« … », "…", “…”, même non refermé) devient « … » — c'est là que vivent les titres,
--      adresses (« Adresse "Via …" » vu en base), marques, valeurs saisies ;
--   3. liens, adresses e-mail, et TOUS les chiffres (numéros, codes postaux, prix) sont effacés ;
--   4. 160 caractères au plus.
-- Les décomptes ne portent aucune donnée de la personne.
--
-- PORTES : la ligne ne s'écrit que par `enregistrer_depart` (une par compte, garde inchangée) ; les deux fonctions
-- neuves ne sont exécutables ni par anon ni par authenticated (seule `enregistrer_depart`, SECURITY DEFINER, les
-- appelle). Un résumé qui casse laisse `activite` vide : la réponse est gardée et la suppression n'attend jamais
-- (même schéma que le contexte du 06/10).
--
-- `enregistrer_depart` est réécrite depuis sa définition EN PROD (pg_get_functiondef du 04/11, identique au dépôt
-- 20261006090000) ; seul ajout : le bloc « activité » et la colonne dans l'INSERT.
--
-- ⛔ AUCUNE DONNÉE TOUCHÉE (une colonne vide ajoutée). Inverse :
-- supabase/rollbacks/20261104200000_depart_activite_anonyme_INVERSE.sql
BEGIN;

ALTER TABLE public.departs_compte ADD COLUMN IF NOT EXISTS activite jsonb;
COMMENT ON COLUMN public.departs_compte.activite IS
  'Résumé ANONYME de l''activité au départ (04/11) : par plateforme, publications / republications / retraits faits, première et dernière action, erreurs (3 dernières, texte rendu anonyme par erreur_anonyme). Ni titre, ni numéro d''annonce, ni donnée personnelle.';

-- Un texte d'erreur sans rien qui désigne une personne ni une annonce.
CREATE OR REPLACE FUNCTION public.erreur_anonyme(p_texte text, p_a_taire text[] DEFAULT '{}')
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v    text := coalesce(p_texte, '');
  t    text;
  pos  integer;
  tour integer;
BEGIN
  -- 1. Ce qu'on sait propre à la personne ou à l'annonce, mot pour mot, casse ignorée.
  FOREACH t IN ARRAY coalesce(p_a_taire, '{}'::text[]) LOOP
    t := btrim(coalesce(t, ''));
    CONTINUE WHEN char_length(t) < 3;
    tour := 0;
    pos := strpos(lower(v), lower(t));
    WHILE pos > 0 AND tour < 20 LOOP
      v := overlay(v PLACING '…' FROM pos FOR char_length(t));
      pos := strpos(lower(v), lower(t));
      tour := tour + 1;
    END LOOP;
  END LOOP;
  -- 2. Tout ce qui est cité, même coupé avant le guillemet fermant.
  v := regexp_replace(v, '«[^»]*(»|$)', '«…»', 'g');
  v := regexp_replace(v, '“[^”]*(”|$)', '“…”', 'g');
  v := regexp_replace(v, '"[^"]*("|$)', '"…"', 'g');
  -- 3. Liens, adresses e-mail, chiffres.
  v := regexp_replace(v, 'https?://[^[:space:]]+', '<lien>', 'gi');
  v := regexp_replace(v, '[^[:space:]]+@[^[:space:]]+', '<e-mail>', 'g');
  v := regexp_replace(v, '[0-9]+', '#', 'g');
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  RETURN nullif(left(btrim(v), 160), '');
END;
$$;
COMMENT ON FUNCTION public.erreur_anonyme(text, text[]) IS
  'Texte d''erreur rendu anonyme pour departs_compte.activite (04/11) : mots à taire effacés, citations, liens, e-mails et chiffres effacés, 160 caractères.';

-- Le résumé anonyme de l'activité d'un compte, par plateforme.
CREATE OR REPLACE FUNCTION public.activite_anonyme_depart(p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH taire AS (
    SELECT coalesce(array_remove(ARRAY[p.email, split_part(coalesce(p.email, ''), '@', 1), p.username], NULL), '{}'::text[]) AS mots
      FROM profiles p WHERE p.id = p_uid
  ),
  jobs AS (
    SELECT j.platform, j.action, j.status, j.created_at, j.published_at, coalesce(j.voie, 'extension') AS voie,
           j.error, j.platform_fields,
           array_remove(ARRAY[j.title, j.platform_listing_id, j.listing_url], NULL)
             || coalesce((SELECT t.mots FROM taire t), '{}'::text[]) AS mots
      FROM cross_post_jobs j
     WHERE j.user_id = p_uid AND j.platform IS NOT NULL
  ),
  erreurs AS (
    -- L'erreur d'une tâche en échec ou en attente d'un geste, avec son diagnostic technique.
    SELECT j.platform, j.action, j.status AS statut,
           CASE WHEN j.platform_fields -> 'last_diagnostic' ->> 'at' ~ '^\d{4}-\d{2}-\d{2}T'
                THEN (j.platform_fields -> 'last_diagnostic' ->> 'at')::timestamptz ELSE j.created_at END AS le,
           j.error AS texte,
           CASE jsonb_typeof(j.platform_fields -> 'last_diagnostic')
             WHEN 'object' THEN concat_ws(' — ', j.platform_fields -> 'last_diagnostic' ->> 'quoi',
                                                 j.platform_fields -> 'last_diagnostic' ->> 'detail')
             WHEN 'string' THEN j.platform_fields ->> 'last_diagnostic'
           END AS diagnostic,
           j.mots
      FROM jobs j
     WHERE j.status IN ('failed', 'needs_user') AND nullif(btrim(j.error), '') IS NOT NULL
    UNION ALL
    -- Les erreurs archivées (chaque essai repris garde la sienne), hors messages de file.
    SELECT j.platform, j.action, e ->> 'statut',
           CASE WHEN e ->> 'le' ~ '^\d{4}-\d{2}-\d{2}T' THEN (e ->> 'le')::timestamptz END,
           e ->> 'erreur', NULL, j.mots
      FROM jobs j,
           jsonb_array_elements(CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array'
                                     THEN j.platform_fields -> 'erreurs_archivees' ELSE '[]'::jsonb END) e
     WHERE nullif(btrim(e ->> 'erreur'), '') IS NOT NULL
       AND btrim(e ->> 'erreur') !~ '^(En file|En attente)[[:space:]]*:'
  ),
  erreurs_rangees AS (
    SELECT er.*, count(*) OVER (PARTITION BY er.platform) AS nb,
           row_number() OVER (PARTITION BY er.platform ORDER BY er.le DESC NULLS LAST) AS rang
      FROM erreurs er
  ),
  voies AS (
    SELECT j.platform, jsonb_object_agg(j.voie, j.n) AS voies
      FROM (SELECT platform, voie, count(*) AS n FROM jobs GROUP BY platform, voie) j
     GROUP BY j.platform
  ),
  par_plateforme AS (
    SELECT j.platform,
           count(*) FILTER (WHERE j.action = 'publish' AND j.published_at IS NOT NULL) AS publications,
           count(*) FILTER (WHERE j.action = 'republish' AND j.published_at IS NOT NULL) AS republications,
           count(*) FILTER (WHERE j.action = 'delete' AND j.status = 'deleted') AS retraits,
           count(*) AS taches,
           count(*) FILTER (WHERE j.status = 'cancelled') AS annulees,
           count(*) FILTER (WHERE j.status IN ('pending', 'processing')) AS en_file,
           min(j.created_at) AS premiere_action,
           max(greatest(j.created_at, j.published_at)) AS derniere_action,
           min(j.published_at) AS premiere_mise_en_ligne,
           max(j.published_at) AS derniere_mise_en_ligne
      FROM jobs j
     GROUP BY j.platform
  )
  SELECT jsonb_build_object(
           'version', 1,
           'plateformes', coalesce(jsonb_object_agg(pp.platform, jsonb_build_object(
             'publications', pp.publications,
             'republications', pp.republications,
             'retraits', pp.retraits,
             'taches', pp.taches,
             'annulees', pp.annulees,
             'en_file', pp.en_file,
             'voies', v.voies,
             'premiere_action', to_char(pp.premiere_action AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI'),
             'derniere_action', to_char(greatest(pp.derniere_action,
                                  (SELECT max(er.le) FROM erreurs_rangees er WHERE er.platform = pp.platform))
                                  AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI'),
             'premiere_mise_en_ligne', to_char(pp.premiere_mise_en_ligne AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI'),
             'derniere_mise_en_ligne', to_char(pp.derniere_mise_en_ligne AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI'),
             'erreurs', coalesce((SELECT max(er.nb) FROM erreurs_rangees er WHERE er.platform = pp.platform), 0),
             'dernieres_erreurs', coalesce((
               SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'action', er.action,
                        'statut', er.statut,
                        'le', to_char(er.le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI'),
                        'texte', erreur_anonyme(er.texte, er.mots),
                        'diagnostic', erreur_anonyme(er.diagnostic, er.mots))) ORDER BY er.rang)
                 FROM erreurs_rangees er
                WHERE er.platform = pp.platform AND er.rang <= 3), '[]'::jsonb)
           )), '{}'::jsonb))
    FROM par_plateforme pp
    LEFT JOIN voies v ON v.platform = pp.platform;
$$;
COMMENT ON FUNCTION public.activite_anonyme_depart(uuid) IS
  'Résumé anonyme de l''activité d''un compte, par plateforme, pour departs_compte.activite (04/11). Appelée par enregistrer_depart seulement.';

REVOKE ALL ON FUNCTION public.erreur_anonyme(text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activite_anonyme_depart(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erreur_anonyme(text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.activite_anonyme_depart(uuid) TO service_role;

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
  v_activite    jsonb;
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

  -- (04/11) Ce que FillSell a fait, en chiffres anonymes, lu avant tout effacement.
  BEGIN
    v_activite := activite_anonyme_depart(v_uid);
  EXCEPTION WHEN OTHERS THEN v_activite := NULL;
  END;

  INSERT INTO departs_compte (motif, texte, palier, anciennete_minutes, extension_installee, extension_version,
                              plateformes_connectees, nb_articles, plateforme_app, version_app, activite)
  VALUES (v_motif, v_texte, v_palier, v_anciennete, coalesce(v_ext_vue, false), v_ext_version,
          coalesce(ARRAY(SELECT DISTINCT x FROM unnest(v_plateformes) x ORDER BY 1), '{}'), v_nb, v_app, v_version,
          v_activite);
  RETURN true;
END;
$function$;

COMMIT;
