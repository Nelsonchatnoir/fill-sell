-- ═══════════════════════════════════════════════════════════════════════════
-- « POURQUOI TU PARS ? » — LA RÉPONSE DONNÉE À LA SUPPRESSION DU COMPTE (06/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Marine (05/10) a supprimé son compte 45 min après l'inscription : impossible
-- de savoir pourquoi, l'app ne demandait rien. Désormais l'écran de
-- confirmation finale pose la question (facultative, zéro clic de plus) et
-- l'app appelle `enregistrer_depart` JUSTE AVANT d'effacer quoi que ce soit.
--
-- LA TABLE `departs_compte` SURVIT À LA SUPPRESSION, ET NE PORTE RIEN QUI
-- DÉSIGNE LA PERSONNE : ni e-mail, ni identifiant de compte (RGPD — le compte
-- est effacé, sa trace ne doit pas l'être en douce). Elle garde la réponse et
-- le contexte, lus ICI côté serveur (jamais confiés au client) :
--   palier (palier_de), ancienneté en minutes (auth.users.created_at),
--   extension vue un jour + sa version (profiles), plateformes connectées
--   (dernière sonde de l'extension, profiles.extension_sessions, plus eBay
--   relié par l'API, ebay_accounts non révoqué), nombre d'articles (fiches non
--   fusionnées). Le client ne fournit que le motif, le texte, la plateforme de
--   l'app (ios/android/web) et la version de l'app.
-- ⚠️ Le TEXTE LIBRE est écrit par la personne : il peut contenir ce qu'elle y
-- met (nom, adresse). L'écran le dit (« pas reliée à ton compte »).
--
-- PORTES :
--   · aucune lecture ni écriture directe pour anon/authenticated (RLS active,
--     aucune politique, aucun droit) : la seule porte est la fonction ;
--   · une réponse par compte : la garde `departs_compte_garde` tient
--     l'identifiant TANT QUE LE COMPTE EXISTE et part avec lui (FK en cascade
--     sur auth.users) — il ne reste rien qui relie la réponse au compte ;
--   · la fonction ne lève jamais pour un motif inconnu ni un texte trop long :
--     elle range (motif inconnu → null, texte coupé à 2 000 caractères). Un
--     contexte illisible (une sous-requête qui casse) laisse la case vide, la
--     réponse est gardée quand même.
-- La suppression du compte n'attend PAS cette fonction au-delà de 2,5 s et
-- continue quoi qu'il arrive (src/compte/supprimerCompte.js).
--
-- ⛔ AUCUNE DONNÉE TOUCHÉE. Inverse : supabase/rollbacks/20261006090000_departs_compte_INVERSE.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.departs_compte (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  le                      timestamptz NOT NULL DEFAULT now(),
  motif                   text CHECK (motif IN ('installation', 'pas_marche', 'trop_cher', 'plus_besoin', 'autre_outil', 'autre')),
  texte                   text CHECK (texte IS NULL OR char_length(texte) <= 2000),
  palier                  text,
  anciennete_minutes      integer,
  extension_installee     boolean,
  extension_version       text,
  plateformes_connectees  text[] NOT NULL DEFAULT '{}',
  nb_articles             integer,
  plateforme_app          text CHECK (plateforme_app IN ('ios', 'android', 'web')),
  version_app             text CHECK (version_app IS NULL OR char_length(version_app) <= 80)
);
COMMENT ON TABLE public.departs_compte IS
  'Réponse « Pourquoi tu pars ? » donnée à la suppression du compte (06/10). Survit au compte, sans e-mail ni identifiant. Écrite par enregistrer_depart() seulement.';

ALTER TABLE public.departs_compte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.departs_compte FROM PUBLIC, anon, authenticated;

-- Une réponse par compte, sans laisser d'identifiant derrière lui.
CREATE TABLE IF NOT EXISTS public.departs_compte_garde (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  le      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.departs_compte_garde IS
  'Une réponse de départ par compte. La ligne part avec le compte (cascade sur auth.users) : rien ne relie departs_compte à une personne.';
ALTER TABLE public.departs_compte_garde ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.departs_compte_garde FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enregistrer_depart(
  p_motif          text,
  p_texte          text,
  p_plateforme_app text,
  p_version_app    text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.enregistrer_depart(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_depart(text, text, text, text) TO authenticated;

COMMIT;
