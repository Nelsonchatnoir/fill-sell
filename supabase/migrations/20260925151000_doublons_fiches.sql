-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS DE FICHES : CERTAIN = UNE SEULE FICHE, PROBABLE = UNE QUESTION
-- (2026-09-25 après-midi, chantier « zéro doublon »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le relevé (Leboncoin, Beebs, eBay, Opla) et la synchronisation du dressing
-- Vinted créent une fiche quand ils ne reconnaissent pas l'objet. La
-- migration 20260925150000 fait reconnaître davantage AVANT l'import ; celle-ci
-- traite ce qui passe quand même, dans les deux sens (Vinted → relevé comme
-- relevé → Vinted), avec les PREUVES CROISÉES :
--   titre (mots qui comptent, racinisés) · couleur · nombre · marque · prix ·
--   lot contre unité · PHOTO (empreinte dHash/pHash du cache photo_empreintes).
--
-- LES NIVEAUX (miroir exact : scripts/lib/meme-objet.mjs, mesurés sur le parc) :
--   · CERTAIN — photo identique (dHash ≤ 5, pHash ≤ 8) ET ≥ 75 % des mots du
--     titre le plus court dans l'autre ; ou titre exact + prix égal quand
--     aucune empreinte n'existe. Jamais si : couleur/nombre/marque
--     contredisent, lot contre unité, quantité > 1, une fiche vendue, deux
--     annonces vivantes sur la même plateforme, plusieurs candidats, ou un
--     « frein » sur la fiche qui disparaîtrait (job actif, vente, saisie à la
--     main, deux prix d'achat, deux fiches d'annonce).
--     → rattachement automatique (annonce) ou FUSION automatique (fiches),
--       journalisée, réversible par inventaire_defusionner.
--   · PROBABLE — photo identique et titre qui se recoupe (≥ 40 %), photo proche
--     et titre ≥ 60 %, titre exact, ou titre ≥ 75 % + prix égal/proche sans
--     photo, ou titre PRÉCIS (≥ 5 mots qui comptent, ≥ 80 % en commun) quelles
--     que soient les photos (re-photographié, détouré : le pichet de Jocabroc).
--     → une QUESTION dans l'app (« Est-ce le même article ? »), jamais
--     rien d'automatique.
--   · ÉCARTÉ — tout le reste. La photo identique ne suffit JAMAIS seule : des
--     vendeurs réutilisent une photo entre variantes (chaussettes à message,
--     figurines d'un lot, kits de Louis).
-- ⛔ UNE DÉCISION HUMAINE EST DÉFINITIVE : une paire refusée (« Non »), une
--    fusion défaite, une proposition d'annonce refusée ou détachée ne revient
--    jamais toute seule.
--
-- CE QUE POSE CETTE MIGRATION :
--   1. tables inventaire_doublons (propositions et décisions),
--      inventaire_doublons_verifies (une fiche importée n'est examinée
--      qu'une fois), photo_empreintes_echecs (une image illisible n'est pas
--      retentée en boucle) ;
--   2. les signaux : titre_quantite_marquee, fiche_marque, meme_objet_signaux,
--      meme_objet_niveau, fiche_photos_toutes, fiche_annonces_vivantes ;
--   3. inventaire_fusionner_pour(user, garde, absorbé, par) — le corps PROD
--      d'inventaire_fusionner (md5 c14d1f1839c6991578378caf8b3e4077), patché
--      en place, + L'IDENTITÉ VINTED QUI SUIT L'OBJET (l'absorbé porte
--      l'annonce Vinted vivante, le gardé n'en a pas → elle passe au gardé ;
--      sinon la fiche gardée se croit hors de Vinted et rouvre une publication
--      Vinted — le doublon de Romain, 21/09). inventaire_fusionner devient
--      l'appel utilisateur de cette fonction (auth.uid(), 'utilisateur') ;
--   4. inventaire_defusionner (corps PROD, md5
--      fff536e47878e751e7f5ac7b8238b7a7, patché en place) rend l'identité
--      Vinted et marque la paire « défaite » (plus jamais reproposée) ;
--   5. inventaire_doublon_evaluer / inventaire_doublons_pour / RPC
--      inventaire_doublon_decider (« Oui, c'est le même » / « Non ») ;
--   6. rapprocher_confirmer_photo : une annonce PROPOSÉE dont la photo prouve
--      le rattachement est rattachée (même geste que la bande 'certain') ;
--   7. rapprochement_urls_a_empreinter / rapprochement_photos_decider : le
--      travail de la fonction edge doublons-balayage (migration suivante).
-- ⛔ NE S'APPLIQUE PAS PAR `db push` (CLAUDE.md). Une par une.

-- ── 0. LES CORPS PROD SONT CEUX QU'ON A LUS ─────────────────────────────────
DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_fusionner(bigint,bigint)'::regprocedure)) <> 'c14d1f1839c6991578378caf8b3e4077' THEN
    RAISE EXCEPTION 'inventaire_fusionner a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
  IF md5(pg_get_functiondef('public.inventaire_defusionner(uuid)'::regprocedure)) <> 'fff536e47878e751e7f5ac7b8238b7a7' THEN
    RAISE EXCEPTION 'inventaire_defusionner a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
END
$verif$;

-- ── 1. LES TABLES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventaire_doublons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garde       bigint NOT NULL,          -- la fiche qui reste (pas de FK : la décision survit à la fiche)
  absorbe     bigint NOT NULL,          -- la fiche qui la rejoint
  niveau      text NOT NULL CHECK (niveau IN ('certain', 'probable')),
  statut      text NOT NULL DEFAULT 'proposee' CHECK (statut IN ('proposee', 'fusionnee', 'refusee', 'defaite', 'caduque')),
  motif       text,
  preuves     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source      text NOT NULL,            -- 'balayage' | 'recensement_2509' | …
  fusion_id   uuid,
  decide_le   timestamptz,
  decide_par  text,                     -- 'utilisateur' | 'auto' | 'support'
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.inventaire_doublons IS
  'Deux fiches du même compte qui désignent peut-être le même objet : proposée (question « Est-ce le même article ? »), fusionnée (par la personne ou automatiquement quand c''est certain), refusée, défaite (fusion annulée) ou caduque. Une paire refusée ou défaite n''est jamais reproposée. Migration 20260925151000.';
CREATE UNIQUE INDEX IF NOT EXISTS inventaire_doublons_paire
  ON public.inventaire_doublons (user_id, least(garde, absorbe), greatest(garde, absorbe));
CREATE INDEX IF NOT EXISTS inventaire_doublons_ouverts
  ON public.inventaire_doublons (user_id) WHERE statut = 'proposee';
ALTER TABLE public.inventaire_doublons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventaire_doublons_lecture ON public.inventaire_doublons;
CREATE POLICY inventaire_doublons_lecture ON public.inventaire_doublons
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Écriture : UNIQUEMENT par les RPC (SECURITY DEFINER) — aucune politique
-- d'écriture, la RLS refuse tout INSERT/UPDATE/DELETE direct.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire_doublons TO authenticated;
GRANT ALL ON public.inventaire_doublons TO service_role;

CREATE TABLE IF NOT EXISTS public.inventaire_doublons_verifies (
  inventaire_id bigint PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verifie_le    timestamptz NOT NULL DEFAULT now(),
  resultat      jsonb NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.inventaire_doublons_verifies IS
  'Une fiche importée (relevé ou dressing Vinted) examinée une fois par le balayage des doublons — pour ne jamais la réexaminer en boucle. Migration 20260925151000.';
ALTER TABLE public.inventaire_doublons_verifies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire_doublons_verifies TO authenticated;
GRANT ALL ON public.inventaire_doublons_verifies TO service_role;

CREATE TABLE IF NOT EXISTS public.photo_empreintes_echecs (
  url       text PRIMARY KEY,
  motif     text,
  essais    integer NOT NULL DEFAULT 1,
  echec_le  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.photo_empreintes_echecs IS
  'Images qu''on n''a pas pu empreinter (404, format, trop lourde) : retentées 3 fois au plus, pas plus d''une fois toutes les 6 h. Rien de personnel : une URL publique. Migration 20260925151000.';
ALTER TABLE public.photo_empreintes_echecs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_empreintes_echecs TO authenticated;
GRANT ALL ON public.photo_empreintes_echecs TO service_role;

-- ── 2. LES SIGNAUX ──────────────────────────────────────────────────────────
-- Le titre annonce-t-il un LOT (« 6 spatules », « lot de », « deux », « 3 x ») ?
-- ⛔ Miroir : quantiteMarquee (scripts/lib/meme-objet.mjs).
CREATE OR REPLACE FUNCTION public.titre_quantite_marquee(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (' ' || titre_norm(t) || ' ') ~ ' (lot|lots|paire|paires|duo|trio|deux|trois|quatre|cinq|six|sept|huit|dix|douze) '
      OR titre_norm(t) ~ '^[1-9][0-9]? [a-z]'
      OR (' ' || titre_norm(t) || ' ') ~ ' [1-9][0-9]? ?x ';
$function$;

-- La marque d'une fiche : la colonne, sinon l'attribut (objet {v} ou texte).
CREATE OR REPLACE FUNCTION public.fiche_marque(p_marque text, p_attributs jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(NULLIF(trim(p_marque), ''),
                  CASE WHEN jsonb_typeof(p_attributs -> 'marque') = 'object' THEN p_attributs -> 'marque' ->> 'v'
                       ELSE p_attributs ->> 'marque' END);
$function$;

-- Toutes les photos connues d'une fiche : les siennes, puis celles de ses
-- annonces relevées (vignette et capture) — une plateforme ré-héberge, l'autre
-- garde sa copie : on compare ce qu'on a.
CREATE OR REPLACE FUNCTION public.fiche_photos_toutes(p_inv bigint)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT u FROM (
      SELECT u, min(r) AS r FROM (
        SELECT u, o AS r FROM inventaire i, unnest(fiche_photos_urls(i.photos, 3)) WITH ORDINALITY AS x(u, o) WHERE i.id = p_inv
        UNION ALL
        SELECT u, 10 + o FROM annonces_plateforme ap, unnest(annonce_photos_urls(ap.photo_url, ap.capture, 2)) WITH ORDINALITY AS y(u, o)
         WHERE ap.inventaire_id = p_inv
      ) z GROUP BY u
    ) w ORDER BY r LIMIT 8), '{}'::text[]);
$function$;

-- Les annonces vivantes d'une fiche : (plateforme, identifiant). Un dépôt
-- 'published' sans identifiant compte comme une annonce d'identifiant inconnu.
CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inv bigint)
 RETURNS TABLE (platform text, listing_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ap.platform, ap.listing_id FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inv AND ap.disparu_le IS NULL
  UNION
  SELECT j.platform, COALESCE(NULLIF(j.platform_listing_id, ''), 'job:' || j.id::text) FROM cross_post_jobs j
   WHERE j.inventaire_id = p_inv AND j.action IN ('publish', 'republish') AND j.status = 'published'
  UNION
  SELECT 'vinted', i.vinted_item_id FROM inventaire i
   WHERE i.id = p_inv AND i.vinted_item_id IS NOT NULL AND i.disparu_le IS NULL;
$function$;

-- LES SIGNAUX D'UNE PAIRE. ⛔ Miroir : signaux() (scripts/lib/meme-objet.mjs).
CREATE OR REPLACE FUNCTION public.meme_objet_signaux(p_titre_a text, p_titre_b text, p_marque_a text, p_marque_b text,
                                                     p_prix_a numeric, p_prix_b numeric, p_photos_a text[], p_photos_b text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  ja text[] := titre_jetons(p_titre_a); jb text[] := titre_jetons(p_titre_b);
  ca text[] := titre_couleurs(p_titre_a); cb text[] := titre_couleurs(p_titre_b);
  na text[] := titre_nombres(p_titre_a); nb text[] := titre_nombres(p_titre_b);
  ma text := titre_marque_utile(p_marque_a); mb text := titre_marque_utile(p_marque_b);
  v_min integer; v_communs integer; v_ov numeric; v_prix text; v_ratio numeric; v_photo jsonb;
BEGIN
  v_min := least(COALESCE(array_length(ja, 1), 0), COALESCE(array_length(jb, 1), 0));
  v_communs := (SELECT count(*) FROM unnest(ja) x WHERE x = ANY (jb))::integer;
  v_ov := CASE WHEN v_min = 0 THEN 0 ELSE v_communs::numeric / v_min END;
  v_prix := CASE WHEN p_prix_a IS NULL OR p_prix_b IS NULL OR p_prix_a <= 0 OR p_prix_b <= 0 THEN 'inconnu'
                 WHEN abs(p_prix_a - p_prix_b) < 0.01 THEN 'egal'
                 WHEN abs(p_prix_a - p_prix_b) / greatest(p_prix_a, p_prix_b) <= 0.15 THEN 'proche'
                 ELSE 'different' END;
  v_ratio := CASE WHEN p_prix_a > 0 AND p_prix_b > 0 THEN greatest(p_prix_a, p_prix_b) / least(p_prix_a, p_prix_b) ELSE 1 END;
  v_photo := photos_distance(COALESCE(p_photos_a, '{}'::text[]), COALESCE(p_photos_b, '{}'::text[]));
  RETURN jsonb_build_object(
    'ov', round(v_ov, 2),
    'communs', v_communs,
    'exact', titre_norm(p_titre_a) <> '' AND titre_norm(p_titre_a) = titre_norm(p_titre_b),
    'couleur', CASE WHEN COALESCE(array_length(ca, 1), 0) > 0 AND COALESCE(array_length(cb, 1), 0) > 0 AND ca <> cb THEN 'conflit' ELSE 'ok' END,
    'nombre', CASE WHEN COALESCE(array_length(na, 1), 0) = 0 OR COALESCE(array_length(nb, 1), 0) = 0 OR na = nb THEN 'ok'
                   WHEN na <@ nb OR nb <@ na THEN 'partiel' ELSE 'conflit' END,
    'marque', CASE WHEN ma = '' OR mb = '' THEN 'inconnue'
                   WHEN ma = mb OR position(ma in mb) > 0 OR position(mb in ma) > 0 THEN 'egale' ELSE 'conflit' END,
    'prix', v_prix,
    'photo', COALESCE(v_photo, jsonb_build_object('verdict', 'inconnue')),
    'lot', CASE WHEN titre_quantite_marquee(p_titre_a) <> titre_quantite_marquee(p_titre_b) AND v_ratio > 1.8
                THEN 'lot_contre_unite' ELSE 'ok' END);
END;
$function$;

-- LE VERDICT D'UNE PAIRE, sans son contexte. ⛔ Miroir : niveau() (meme-objet.mjs).
CREATE OR REPLACE FUNCTION public.meme_objet_niveau(s jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v text := COALESCE(s -> 'photo' ->> 'verdict', 'inconnue');
  ov numeric := COALESCE((s ->> 'ov')::numeric, 0);
  exact boolean := COALESCE((s ->> 'exact')::boolean, false);
  certain_photo boolean; certain_texte boolean;
BEGIN
  IF s ->> 'couleur' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'couleur'); END IF;
  IF s ->> 'nombre' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'nombre'); END IF;
  IF s ->> 'marque' = 'conflit' THEN RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'marque'); END IF;
  certain_photo := v = 'identique' AND ov >= 0.75;
  certain_texte := v = 'inconnue' AND exact AND s ->> 'prix' = 'egal';
  IF (certain_photo OR certain_texte) AND s ->> 'nombre' = 'ok' AND s ->> 'lot' = 'ok' THEN
    RETURN jsonb_build_object('niveau', 'certain', 'motif', CASE WHEN certain_photo THEN 'photo_identique' ELSE 'titre_exact_prix_egal' END);
  END IF;
  IF (v = 'identique' AND ov >= 0.4) OR (v = 'proche' AND ov >= 0.6) OR (exact AND v <> 'differente')
     OR (v = 'inconnue' AND ov >= 0.75 AND s ->> 'prix' IN ('egal', 'proche'))
     -- Un titre PRÉCIS (≥ 5 mots qui comptent, ≥ 80 % en commun) reste une
     -- question même quand les photos diffèrent : le vendeur a re-photographié
     -- ou détouré (pichet de Jocabroc : même objet, fond changé, dHash 22).
     OR (v IN ('differente', 'inconnue') AND ov >= 0.8 AND COALESCE((s ->> 'communs')::integer, 0) >= 5) THEN
    RETURN jsonb_build_object('niveau', 'probable', 'motif',
      CASE WHEN s ->> 'lot' <> 'ok' THEN 'lot_contre_unite'
           WHEN s ->> 'nombre' = 'partiel' THEN 'nombres_partiels'
           WHEN v = 'identique' THEN 'photo_identique'
           WHEN exact THEN 'titre_exact'
           WHEN v = 'proche' THEN 'photo_proche'
           WHEN v IN ('differente', 'inconnue') AND ov >= 0.8 AND COALESCE((s ->> 'communs')::integer, 0) >= 5 THEN 'titre_precis'
           ELSE 'titre_proche' END);
  END IF;
  RETURN jsonb_build_object('niveau', 'ecarte', 'motif', CASE WHEN v = 'differente' THEN 'photos_differentes' ELSE 'preuves_insuffisantes' END);
END;
$function$;

-- ── 3. LA FUSION : UNE FONCTION INTERNE, ET L'IDENTITÉ VINTED QUI SUIT ──────
-- inventaire_fusionner_pour = le corps PROD d'inventaire_fusionner, dont on
-- change : l'en-tête (l'utilisateur et l'auteur sont passés), la source de
-- v_user, la valeur de `par`, et l'AJOUT du bloc « identité Vinted ».
DO $patch$
DECLARE
  v_src text; v_new text; c int;
  a1 text := $a1$CREATE OR REPLACE FUNCTION public.inventaire_fusionner(p_garde bigint, p_absorbe bigint)$a1$;
  b1 text := $b1$CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text)$b1$;
  a2 text := $a2$  v_user uuid := auth.uid();$a2$;
  b2 text := $b2$  v_user uuid := p_user; -- MODIF 2026-09-25 : l'appelant dit pour qui (inventaire_fusionner passe auth.uid())$b2$;
  a3 text := $a3$  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, 'utilisateur')$a3$;
  b3 text := $b3$  VALUES (v_user, p_garde, p_absorbe, v_dep, v_champs, COALESCE(NULLIF(p_par, ''), 'utilisateur')) -- MODIF 2026-09-25$b3$;
  a4 text := $a4$  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;$a4$;
  b4 text := $b4$  -- ── AJOUT 2026-09-25 : L'IDENTITÉ VINTED SUIT L'OBJET ─────────────────────
  -- L'absorbé porte l'annonce Vinted VIVANTE et le gardé n'en a pas : elle
  -- passe au gardé. Sans ça, la fiche gardée se croit hors de Vinted et rouvre
  -- une publication Vinted (le doublon qu'on vient d'éviter — Romain, 21/09).
  -- Journalisée dans champs_repris : inventaire_defusionner la rend.
  -- (Index unique (user_id, vinted_item_id) : l'absorbé la lâche d'abord.)
  IF g.vinted_item_id IS NULL AND a.vinted_item_id IS NOT NULL AND a.disparu_le IS NULL THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(g.vinted_catalog_id, a.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess)
     WHERE id = p_garde;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;$b4$;
BEGIN
  SELECT pg_get_functiondef('public.inventaire_fusionner(bigint,bigint)'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'c14d1f1839c6991578378caf8b3e4077' THEN RAISE EXCEPTION 'inventaire_fusionner : md5 inattendu — ON S ARRETE'; END IF;
  v_new := v_src;
  c := (length(v_new) - length(replace(v_new, a1, ''))) / length(a1); IF c <> 1 THEN RAISE EXCEPTION 'fusion ancre 1 : % fois', c; END IF;
  v_new := replace(v_new, a1, b1);
  c := (length(v_new) - length(replace(v_new, a2, ''))) / length(a2); IF c <> 1 THEN RAISE EXCEPTION 'fusion ancre 2 : % fois', c; END IF;
  v_new := replace(v_new, a2, b2);
  c := (length(v_new) - length(replace(v_new, a3, ''))) / length(a3); IF c <> 1 THEN RAISE EXCEPTION 'fusion ancre 3 : % fois', c; END IF;
  v_new := replace(v_new, a3, b3);
  c := (length(v_new) - length(replace(v_new, a4, ''))) / length(a4); IF c <> 1 THEN RAISE EXCEPTION 'fusion ancre 4 : % fois', c; END IF;
  v_new := replace(v_new, a4, b4);
  EXECUTE v_new;
END
$patch$;

-- L'appel de l'app : exactement le même geste qu'avant, pour la personne connectée.
CREATE OR REPLACE FUNCTION public.inventaire_fusionner(p_garde bigint, p_absorbe bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 2026-09-25 : le corps vit dans inventaire_fusionner_pour (le balayage des
  -- doublons fusionne pour le compte, sans session) ; ici, la personne connectée.
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  RETURN inventaire_fusionner_pour(auth.uid(), p_garde, p_absorbe, 'utilisateur');
END;
$function$;

-- ── 4. LA DÉFUSION REND L'IDENTITÉ VINTED ET CLÔT LA PAIRE ──────────────────
DO $patch$
DECLARE
  v_src text; v_new text; c int;
  a1 text := $a1$    ELSIF v_cle = 'attributs' THEN$a1$;
  b1 text := $b1$    ELSIF v_cle = 'vinted_identite' THEN
      -- AJOUT 2026-09-25 : l'identité Vinted rendue à l'absorbé (le gardé la
      -- lâche d'abord : index unique (user_id, vinted_item_id)).
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'attributs' THEN$b1$;
  a2 text := $a2$  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;$a2$;
  b2 text := $b2$  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  -- AJOUT 2026-09-25 : une fusion défaite n'est JAMAIS refaite ni reproposée.
  UPDATE inventaire_doublons SET statut = 'defaite', decide_le = now(), decide_par = 'utilisateur'
   WHERE user_id = v_user AND least(garde, absorbe) = least(f.garde, f.absorbe) AND greatest(garde, absorbe) = greatest(f.garde, f.absorbe);$b2$;
BEGIN
  SELECT pg_get_functiondef('public.inventaire_defusionner(uuid)'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'fff536e47878e751e7f5ac7b8238b7a7' THEN RAISE EXCEPTION 'inventaire_defusionner : md5 inattendu — ON S ARRETE'; END IF;
  v_new := v_src;
  c := (length(v_new) - length(replace(v_new, a1, ''))) / length(a1); IF c <> 1 THEN RAISE EXCEPTION 'défusion ancre 1 : % fois', c; END IF;
  v_new := replace(v_new, a1, b1);
  c := (length(v_new) - length(replace(v_new, a2, ''))) / length(a2); IF c <> 1 THEN RAISE EXCEPTION 'défusion ancre 2 : % fois', c; END IF;
  v_new := replace(v_new, a2, b2);
  EXECUTE v_new;
END
$patch$;

-- ── 5. UNE PAIRE DE FICHES : LE VERDICT, AVEC SON CONTEXTE ──────────────────
CREATE OR REPLACE FUNCTION public.inventaire_doublon_evaluer(p_a bigint, p_b bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a inventaire%ROWTYPE; b inventaire%ROWTYPE; g inventaire%ROWTYPE; x inventaire%ROWTYPE;
  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;
BEGIN
  SELECT * INTO a FROM inventaire WHERE id = p_a;
  SELECT * INTO b FROM inventaire WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id OR a.user_id <> b.user_id THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'paire_invalide');
  END IF;
  IF a.fusionne_dans IS NOT NULL OR b.fusionne_dans IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deja_fusionnee');
  END IF;
  -- ⛔ UNE DÉCISION HUMAINE EST DÉFINITIVE.
  IF EXISTS (SELECT 1 FROM inventaire_doublons d
              WHERE d.user_id = a.user_id AND d.statut IN ('refusee', 'defaite')
                AND least(d.garde, d.absorbe) = least(a.id, b.id) AND greatest(d.garde, d.absorbe) = greatest(a.id, b.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = a.user_id AND f.defait_le IS NOT NULL
                AND ((f.garde = a.id AND f.absorbe = b.id) OR (f.garde = b.id AND f.absorbe = a.id)))
     OR EXISTS (SELECT 1 FROM rapprochements r JOIN annonces_plateforme ap ON ap.id = r.annonce_id
              WHERE r.user_id = a.user_id AND r.par = 'utilisateur' AND r.decision IN ('refus_proposition', 'detache')
                AND ((ap.inventaire_id = b.id AND r.inventaire_id = a.id) OR (ap.inventaire_id = a.id AND r.inventaire_id = b.id))) THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'refuse_par_la_personne');
  END IF;
  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
  END IF;

  s := meme_objet_signaux(a.titre, b.titre, fiche_marque(a.marque, a.attributs), fiche_marque(b.marque, b.attributs),
                          a.prix_vente, b.prix_vente, fiche_photos_toutes(a.id), fiche_photos_toutes(b.id));
  nv := meme_objet_niveau(s);
  v_niveau := nv ->> 'niveau'; v_motif := nv ->> 'motif';

  -- LE CONTEXTE, que ni le titre ni la photo ne savent :
  -- une fiche vendue (autre unité ? vente à rattacher ?) → jamais d'ici ;
  IF v_niveau <> 'ecarte' AND (a.statut IS DISTINCT FROM 'stock' OR b.statut IS DISTINCT FROM 'stock') THEN
    v_niveau := 'ecarte'; v_motif := 'fiche_vendue';
  END IF;
  -- plusieurs exemplaires en stock → la personne tranche ;
  IF v_niveau = 'certain' AND (COALESCE(a.quantite, 1) > 1 OR COALESCE(b.quantite, 1) > 1) THEN
    v_niveau := 'probable'; v_motif := 'quantite';
  END IF;
  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.
  IF v_niveau <> 'ecarte' THEN
    SELECT string_agg(DISTINCT va.platform, ',') INTO v_meme_pf
      FROM fiche_annonces_vivantes(a.id) va
      JOIN fiche_annonces_vivantes(b.id) vb ON vb.platform = va.platform AND vb.listing_id <> va.listing_id
     WHERE NOT EXISTS (SELECT 1 FROM fiche_annonces_vivantes(a.id) x2 JOIN fiche_annonces_vivantes(b.id) y2
                          ON y2.platform = x2.platform AND y2.listing_id = x2.listing_id
                        WHERE x2.platform = va.platform);
    IF v_meme_pf IS NOT NULL AND v_niveau = 'certain' THEN
      v_niveau := 'probable'; v_motif := 'deux_annonces_meme_plateforme';
    END IF;
  END IF;

  -- QUI GARDE : la fiche créée par la personne quand l'autre vient d'un relevé
  -- ou du dressing ; sinon la plus ancienne. L'identité Vinted suit (fusion).
  IF (b.origine IS NULL OR b.origine = 'fillsell') AND (a.origine LIKE 'releve\_%' OR a.origine = 'vinted_sync') THEN
    g := b; x := a;
  ELSIF (a.origine IS NULL OR a.origine = 'fillsell') AND (b.origine LIKE 'releve\_%' OR b.origine = 'vinted_sync') THEN
    g := a; x := b;
  ELSIF a.created_at <= b.created_at THEN g := a; x := b;
  ELSE g := b; x := a;
  END IF;
  -- LES FREINS de la fiche qui disparaîtrait : ce que la personne y a mis.
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = x.id AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    v_freins := v_freins || 'job_actif'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = x.id) THEN v_freins := v_freins || 'ventes'::text; END IF;
  IF EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = x.id)
     AND EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = g.id) THEN
    v_freins := v_freins || 'deux_fiches_annonce'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(x.attributs) = 'object' THEN x.attributs ELSE '{}'::jsonb END) e
              WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    v_freins := v_freins || 'saisie_manuelle'::text;
  END IF;
  IF g.prix_achat IS NOT NULL AND x.prix_achat IS NOT NULL AND g.prix_achat <> x.prix_achat THEN
    v_freins := v_freins || 'deux_prix_achat'::text;
  END IF;
  IF v_niveau = 'certain' AND COALESCE(array_length(v_freins, 1), 0) > 0 THEN
    v_niveau := 'probable'; v_motif := 'a_trancher';
  END IF;

  RETURN jsonb_build_object('niveau', v_niveau, 'motif', v_motif, 'garde', g.id, 'absorbe', x.id,
                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf);
END;
$function$;

-- LES DOUBLONS POSSIBLES D'UNE FICHE (parmi les fiches PLUS ANCIENNES du
-- compte qui partagent au moins un mot qui compte), unicité appliquée : un
-- « certain » n'en est un que s'il est seul, sans autre photo identique et
-- sans jumeau de titre dont on ne connaît pas la photo.
CREATE OR REPLACE FUNCTION public.inventaire_doublons_pour(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f inventaire%ROWTYPE; v_jb text[]; v_out jsonb := '[]'::jsonb; v_c record; v_e jsonb;
  n_certains integer; n_photo integer; n_inconnus integer;
BEGIN
  SELECT * INTO f FROM inventaire WHERE id = p_fiche;
  IF f.id IS NULL OR f.fusionne_dans IS NOT NULL OR f.statut IS DISTINCT FROM 'stock' THEN RETURN '[]'::jsonb; END IF;
  v_jb := titre_jetons(f.titre);
  IF COALESCE(array_length(v_jb, 1), 0) = 0 THEN RETURN '[]'::jsonb; END IF;
  FOR v_c IN
    SELECT i.id FROM inventaire i
     WHERE i.user_id = f.user_id AND i.id <> f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND (i.created_at < f.created_at OR (i.created_at = f.created_at AND i.id < f.id))
       AND NOT (i.vinted_item_id IS NOT NULL AND f.vinted_item_id IS NOT NULL)
       AND titre_jetons(i.titre) && v_jb
  LOOP
    v_e := inventaire_doublon_evaluer(v_c.id, f.id);
    IF v_e ->> 'niveau' <> 'ecarte' THEN
      v_out := v_out || jsonb_build_array(v_e || jsonb_build_object('candidat', v_c.id));
    END IF;
  END LOOP;
  SELECT count(*) FILTER (WHERE e ->> 'niveau' = 'certain'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'identique'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'inconnue' AND (e -> 'signaux' ->> 'ov')::numeric >= 0.75)
    INTO n_certains, n_photo, n_inconnus
    FROM jsonb_array_elements(v_out) e;
  IF n_certains > 1 OR (n_certains = 1 AND (n_photo > 1 OR (n_inconnus > 0 AND n_photo = 1))) THEN
    SELECT COALESCE(jsonb_agg(CASE WHEN e ->> 'niveau' = 'certain'
                                   THEN e || jsonb_build_object('niveau', 'probable', 'motif', 'plusieurs_candidats')
                                   ELSE e END), '[]'::jsonb)
      INTO v_out FROM jsonb_array_elements(v_out) e;
  END IF;
  RETURN v_out;
END;
$function$;

-- ── 6. LA RÉPONSE DE LA PERSONNE : « Oui, c'est le même » / « Non » ────────
CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

-- ── 7. UNE ANNONCE PROPOSÉE QUE LA PHOTO PROUVE ─────────────────────────────
-- Même geste que la bande 'certain' de rapprocher_traiter_annonce : recâbler
-- le dépôt remplacé, sinon un job de suivi. Rien n'est envoyé à la plateforme.
CREATE OR REPLACE FUNCTION public.rapprocher_confirmer_photo(p_annonce_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_urls text[]; v_ids bigint[]; v_c record; v_s jsonb; v_nv jsonb;
  v_elu bigint := NULL; v_best jsonb; v_job uuid; v_job_elu uuid;
  n_certains integer := 0; n_photo integer := 0; n_inconnus integer := 0;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.proposition IS NULL THEN
    RETURN 'sans_objet';
  END IF;
  v_urls := annonce_photos_urls(a.photo_url, a.capture, 3);
  IF COALESCE(array_length(v_urls, 1), 0) = 0 THEN RETURN 'sans_photo'; END IF;
  v_ids := ARRAY(SELECT DISTINCT x FROM (
             SELECT NULLIF(a.proposition ->> 'inventaire_id', '')::bigint AS x
             UNION ALL
             SELECT NULLIF(c ->> 'inventaire_id', '')::bigint
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.proposition -> 'candidats') = 'array'
                                              THEN a.proposition -> 'candidats' ELSE '[]'::jsonb END) c) z
           WHERE x IS NOT NULL);
  FOR v_c IN SELECT i.* FROM inventaire i WHERE i.id = ANY (v_ids) AND i.user_id = a.user_id AND i.fusionne_dans IS NULL LOOP
    v_s := meme_objet_signaux(a.titre, v_c.titre, a.capture ->> 'marque', fiche_marque(v_c.marque, v_c.attributs),
                              a.prix, v_c.prix_vente, v_urls, fiche_photos_toutes(v_c.id));
    v_nv := meme_objet_niveau(v_s);
    IF v_s -> 'photo' ->> 'verdict' = 'identique' THEN n_photo := n_photo + 1; END IF;
    IF v_s -> 'photo' ->> 'verdict' = 'inconnue' AND (v_s ->> 'ov')::numeric >= 0.75 THEN n_inconnus := n_inconnus + 1; END IF;
    IF v_nv ->> 'niveau' = 'certain' AND v_nv ->> 'motif' = 'photo_identique'
       AND v_c.statut = 'stock' AND COALESCE(v_c.quantite, 1) <= 1
       -- aucune autre annonce vivante de cette fiche sur cette plateforme
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.user_id = a.user_id AND x.platform = a.platform
                          AND x.inventaire_id = v_c.id AND x.disparu_le IS NULL AND x.id <> a.id) THEN
      -- le dépôt FillSell de la fiche sur cette plateforme, s'il existe, doit
      -- être REMPLACÉ (son annonce n'est plus vivante) — sinon deux annonces.
      SELECT j.id INTO v_job FROM cross_post_jobs j
       WHERE j.user_id = a.user_id AND j.inventaire_id = v_c.id AND j.platform = a.platform
         AND j.action IN ('publish', 'republish') AND j.status = 'published'
       ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
      IF v_job IS NULL OR NOT EXISTS (SELECT 1 FROM annonces_plateforme ap2 WHERE ap2.job_id = v_job AND ap2.disparu_le IS NULL AND ap2.id <> a.id) THEN
        n_certains := n_certains + 1; v_elu := v_c.id; v_best := v_s; v_job_elu := v_job;
      END IF;
    END IF;
  END LOOP;
  IF n_certains <> 1 OR n_photo > 1 OR n_inconnus > 0 THEN
    RETURN CASE WHEN n_certains > 1 OR n_photo > 1 OR n_inconnus > 0 THEN 'ambigu' ELSE 'reste_propose' END;
  END IF;
  -- UNICITÉ DANS TOUT LE STOCK : aucune autre fiche du compte n'a une photo identique à l'annonce.
  IF EXISTS (
    WITH ea AS (SELECT dhash, phash FROM photo_empreintes WHERE url = ANY (v_urls)),
         idem AS (SELECT DISTINCT e.url FROM photo_empreintes e, ea
                   WHERE bit_count(e.dhash::bit(64) # ea.dhash::bit(64)) <= 5
                     AND bit_count(e.phash::bit(64) # ea.phash::bit(64)) <= 8)
    SELECT 1 FROM inventaire i
     WHERE i.user_id = a.user_id AND i.id <> v_elu AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND fiche_photos_urls(i.photos, 3) && ARRAY(SELECT url FROM idem)) THEN
    RETURN 'ambigu';
  END IF;
  IF v_job_elu IS NOT NULL THEN
    PERFORM rapprocher_recabler_job(v_job_elu, a.url, a.listing_id, 'auto',
      jsonb_build_object('annonce_id', a.id, 'motif', 'photo_identique', 'signaux', v_best));
    v_job := v_job_elu;
  ELSE
    v_job := rapprocher_job_de_suivi(a.user_id, a.platform, v_elu, a.titre, a.prix, a.url, a.listing_id, 'auto',
      jsonb_build_object('annonce_id', a.id, 'motif', 'photo_identique', 'signaux', v_best));
  END IF;
  UPDATE annonces_plateforme SET inventaire_id = v_elu, job_id = v_job, source_rapprochement = 'automatique',
                                 proposition = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (a.user_id, a.id, v_elu, 'attache', 'auto', 0.95,
          jsonb_build_object('job_id', v_job, 'motif', 'photo_identique', 'signaux', v_best));
  RETURN 'attache';
END;
$function$;

-- ── 8. LE TRAVAIL DU BALAYAGE (appelé par la fonction edge doublons-balayage)
-- Une URL est « résolue » quand elle a son empreinte, ou qu'on a renoncé.
CREATE OR REPLACE FUNCTION public.urls_resolues(p_urls text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_urls, '{}'::text[])) u
     WHERE NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = u)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs x WHERE x.url = u AND (x.essais >= 3 OR x.echec_le > now() - interval '6 hours')));
$function$;

-- Les fiches importées à examiner : récentes (14 jours), en stock, jamais examinées.
CREATE OR REPLACE FUNCTION public.doublons_fiches_a_examiner(p_limite integer)
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT i.id FROM inventaire i
   WHERE (i.origine LIKE 'releve\_%' OR i.origine = 'vinted_sync')
     AND i.created_at > now() - interval '14 days'
     AND i.fusionne_dans IS NULL AND i.statut = 'stock'
     AND NOT EXISTS (SELECT 1 FROM inventaire_doublons_verifies v WHERE v.inventaire_id = i.id)
   ORDER BY i.created_at
   LIMIT greatest(p_limite, 0);
$function$;

-- Les URL à empreinter, par priorité : les annonces proposées (et leurs
-- candidates), puis les fiches importées à examiner (et leurs jumelles de titre).
CREATE OR REPLACE FUNCTION public.rapprochement_urls_a_empreinter(p_limite integer DEFAULT 12)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out text[] := '{}'::text[]; v_a record; v_f record; v_u text; v_jb text[];
BEGIN
  -- (a) annonces proposées, les plus récentes d'abord
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT 60
  LOOP
    FOREACH v_u IN ARRAY (annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                          || COALESCE((SELECT array_agg(u) FROM (
                               SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                                THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                               UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[]))
    LOOP
      IF NOT urls_resolues(ARRAY[v_u]) AND NOT (v_u = ANY (v_out)) THEN v_out := v_out || v_u; END IF;
      IF COALESCE(array_length(v_out, 1), 0) >= p_limite THEN RETURN v_out; END IF;
    END LOOP;
  END LOOP;
  -- (b) fiches importées à examiner, et leurs jumelles de titre (≤ 10 chacune)
  FOR v_f IN SELECT i.* FROM inventaire i WHERE i.id IN (SELECT doublons_fiches_a_examiner(20)) ORDER BY i.created_at LOOP
    v_jb := titre_jetons(v_f.titre);
    FOREACH v_u IN ARRAY (fiche_photos_toutes(v_f.id)
                          || COALESCE((SELECT array_agg(u) FROM (
                               SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                                 SELECT i.id FROM inventaire i
                                  WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                    AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                    AND titre_jetons(i.titre) && v_jb
                                    AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                                  LIMIT 10) j) z), '{}'::text[]))
    LOOP
      IF NOT urls_resolues(ARRAY[v_u]) AND NOT (v_u = ANY (v_out)) THEN v_out := v_out || v_u; END IF;
      IF COALESCE(array_length(v_out, 1), 0) >= p_limite THEN RETURN v_out; END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$function$;

-- Les décisions, une fois les photos résolues.
CREATE OR REPLACE FUNCTION public.rapprochement_photos_decider(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a record; v_f record; v_r text; v_cands jsonb; v_e jsonb; v_fus jsonb; v_jb text[];
  n_attache integer := 0; n_ambigu integer := 0; n_reste integer := 0;
  n_examinees integer := 0; n_fusions integer := 0; n_propositions integer := 0; n_attente integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  -- (a) annonces proposées dont les photos sont résolues
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT greatest(p_limite, 0) * 3
  LOOP
    EXIT WHEN clock_timestamp() - v_debut > interval '20 seconds';
    IF NOT urls_resolues(annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                               THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                              UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[])) THEN
      CONTINUE;
    END IF;
    v_r := rapprocher_confirmer_photo(v_a.id);
    IF v_r = 'attache' THEN n_attache := n_attache + 1;
    ELSE
      IF v_r = 'ambigu' THEN n_ambigu := n_ambigu + 1; ELSE n_reste := n_reste + 1; END IF;
      UPDATE annonces_plateforme
         SET proposition = proposition || jsonb_build_object('photo_evaluee_le', now(), 'photo_verdict', v_r)
       WHERE id = v_a.id AND inventaire_id IS NULL AND proposition IS NOT NULL;
    END IF;
  END LOOP;

  -- (b) fiches importées : examinées UNE fois, quand leurs photos (et celles de
  --     leurs jumelles de titre) sont résolues
  FOR v_f IN SELECT i.* FROM inventaire i WHERE i.id IN (SELECT doublons_fiches_a_examiner(greatest(p_limite, 0))) ORDER BY i.created_at LOOP
    EXIT WHEN clock_timestamp() - v_debut > interval '40 seconds';
    v_jb := titre_jetons(v_f.titre);
    IF NOT urls_resolues(fiche_photos_toutes(v_f.id)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                                SELECT i.id FROM inventaire i
                                 WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                   AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                   AND titre_jetons(i.titre) && v_jb
                                   AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                                 LIMIT 10) j) z), '{}'::text[]))
       AND v_f.created_at > now() - interval '2 hours' THEN
      -- on attend les empreintes (au plus 2 h : au-delà on décide sans elles)
      n_attente := n_attente + 1;
      CONTINUE;
    END IF;
    v_cands := inventaire_doublons_pour(v_f.id);
    n_examinees := n_examinees + 1;
    v_fus := NULL;
    FOR v_e IN SELECT e FROM jsonb_array_elements(v_cands) e ORDER BY (e ->> 'niveau' = 'certain') DESC LOOP
      IF v_e ->> 'niveau' = 'certain' AND v_fus IS NULL THEN
        v_fus := inventaire_fusionner_pour(v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint,
                                           'auto (doublon certain : ' || COALESCE(v_e ->> 'motif', '') || ')');
        IF COALESCE((v_fus ->> 'ok')::boolean, false) THEN
          n_fusions := n_fusions + 1;
          INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, fusion_id, decide_le, decide_par)
          VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'certain', 'fusionnee', v_e ->> 'motif',
                  v_e, 'balayage', NULLIF(v_fus ->> 'fusion_id', '')::uuid, now(), 'auto')
          ON CONFLICT DO NOTHING;
        END IF;
      ELSIF v_e ->> 'niveau' IN ('probable', 'certain') THEN
        INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
        VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'probable', 'proposee', v_e ->> 'motif', v_e, 'balayage')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN n_propositions := n_propositions + 1; END IF;
      END IF;
    END LOOP;
    INSERT INTO inventaire_doublons_verifies (inventaire_id, user_id, resultat)
    VALUES (v_f.id, v_f.user_id, jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus))
    ON CONFLICT (inventaire_id) DO NOTHING;
  END LOOP;

  -- (c) propositions devenues sans objet (une des deux fiches fusionnée ailleurs, vendue ou supprimée)
  UPDATE inventaire_doublons d SET statut = 'caduque', decide_le = now(), decide_par = 'auto'
   WHERE d.statut = 'proposee'
     AND (NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.fusionne_dans IS NULL AND i.statut = 'stock')
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.absorbe AND i.fusionne_dans IS NULL AND i.statut = 'stock'));

  RETURN jsonb_build_object('annonces_rattachees', n_attache, 'annonces_ambigues', n_ambigu, 'annonces_restees_proposees', n_reste,
                            'fiches_examinees', n_examinees, 'fiches_en_attente_photos', n_attente,
                            'fusions', n_fusions, 'propositions', n_propositions,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

-- ── 9. DROITS ───────────────────────────────────────────────────────────────
-- ⛔ Les fonctions qui prennent un utilisateur en paramètre ne sont JAMAIS
--    appelables par une personne connectée : service seulement.
REVOKE ALL ON FUNCTION public.inventaire_fusionner_pour(uuid, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventaire_fusionner_pour(uuid, bigint, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.inventaire_doublon_evaluer(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventaire_doublon_evaluer(bigint, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.inventaire_doublons_pour(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventaire_doublons_pour(bigint) TO service_role;
REVOKE ALL ON FUNCTION public.rapprocher_confirmer_photo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_confirmer_photo(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rapprochement_urls_a_empreinter(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_urls_a_empreinter(integer) TO service_role;
REVOKE ALL ON FUNCTION public.rapprochement_photos_decider(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_photos_decider(integer) TO service_role;
REVOKE ALL ON FUNCTION public.doublons_fiches_a_examiner(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doublons_fiches_a_examiner(integer) TO service_role;
REVOKE ALL ON FUNCTION public.fiche_annonces_vivantes(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiche_annonces_vivantes(bigint) TO service_role;
REVOKE ALL ON FUNCTION public.fiche_photos_toutes(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiche_photos_toutes(bigint) TO service_role;
REVOKE ALL ON FUNCTION public.meme_objet_signaux(text, text, text, text, numeric, numeric, text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meme_objet_niveau(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.titre_quantite_marquee(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiche_marque(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urls_resolues(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meme_objet_signaux(text, text, text, text, numeric, numeric, text[], text[]),
  public.meme_objet_niveau(jsonb), public.titre_quantite_marquee(text), public.fiche_marque(text, jsonb),
  public.urls_resolues(text[]) TO authenticated, service_role;
-- La réponse de la personne : RPC de l'app.
REVOKE ALL ON FUNCTION public.inventaire_doublon_decider(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventaire_doublon_decider(uuid, text) TO authenticated, service_role;
-- inventaire_fusionner garde ses droits (CREATE OR REPLACE les conserve) :
-- authenticated + service_role, comme avant.
