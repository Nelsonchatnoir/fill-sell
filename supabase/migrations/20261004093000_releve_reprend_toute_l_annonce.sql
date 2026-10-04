SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- LE RELEVÉ REPREND TOUTE L'ANNONCE, ET LA PLATEFORME FAIT FOI POUR CE QUE LA
-- PERSONNE Y A CHANGÉ (04/10, Louis — points 1 et 3)
-- ═══════════════════════════════════════════════════════════════════════════
-- POINT 1 — « 8 fiches sur 15 sans description ni marque, catégorie jamais
-- reprise ». Cause : l'import crée la fiche avec la seule ligne de « Mes
-- annonces » (titre, prix, vignette) ; le détail vient de la CAPTURE de la
-- page, plafonnée à 30 pages par relevé (anti-robot). Louis avait 99 à 112
-- annonces Beebs : ses 26 rangements du 03/10 sont entrés par paquets, 18
-- n'avaient toujours aucune capture le 04/10 au matin. Et même capturée,
-- une fiche ne recevait jamais sa catégorie, ni son âge, ni son poids.
--   · `annonces_plateforme.donnees_index` : ce que l'annonce affiche, lu SANS
--     ouvrir sa page (Beebs : l'index public du site ; eBay : l'API Browse) —
--     posé par la fonction releve-completer, pour TOUTES les annonces d'un
--     compte en une fois.
--   · `fiche_completer_depuis_annonce` : la fiche rattachée reçoit, dans ses
--     SEULS champs vides, la description, la marque, la catégorie (ramenée à
--     la catégorie FillSell, type_fillsell_depuis_categorie), le prix, le
--     poids et les attributs (état, taille, couleur, matière, âge) que
--     l'annonce affiche. ⛔ Une valeur saisie n'est jamais remplacée.
--     Chaque champ complété est journalisé (inventaire_journal).
--   · Déclenché à chaque capture, à chaque lecture d'index, et au
--     rattachement (l'import compris) : toutes versions d'extension.
--
-- POINT 3 — « prix passé à 10 € sur Beebs, réimport, FillSell reste à 8 € ».
-- Règle de Nico : quand le relevé voit qu'un prix ou un poids a changé sur la
-- plateforme et que la personne ne l'a pas changé dans FillSell entre-temps,
-- la fiche prend la valeur de la plateforme ; si les deux ont changé, la plus
-- récente gagne et c'est noté au journal.
--   · Changement VU : le prix relevé diffère du relevé précédent de la même
--     annonce ; ou — rattrapage de ce qui a changé avant ce lot — il diffère
--     du prix auquel FillSell a connu l'annonce la première fois (dépôt ou
--     import : le premier job publié de la fiche sur cette plateforme).
--   · Rattrapage d'avant les traces : fiche sans aucune trace de changement
--     et TOUTES ses annonces en ligne (Vinted compris) d'accord sur le prix
--     de la plateforme → la fiche suit (Louis, rangement Rouge : 12 € au
--     dépôt, 8 € sur la fiche, 10 € sur Beebs).
--   · La fiche ne suit QUE si elle était alignée sur l'ancien prix de cette
--     plateforme (sinon c'est un prix propre à la plateforme : noté, pas
--     repris) et si la personne ne l'a pas changée dans l'app depuis
--     (inventaire.prix_vente_change_par = 'app' après l'observation
--     précédente = conflit).
--   · Conflit : la date de modification de la plateforme, quand elle la
--     donne (Beebs : update_date de l'index), départage ; sans elle, la
--     valeur FillSell est gardée — l'ordre n'est pas prouvé.
--   · Leboncoin arrondit à l'euro (x,50 → x+1) : un écart d'arrondi n'est
--     pas un changement.
--   · Même règle pour le poids, comparé par TRANCHE de la plateforme (Beebs :
--     200 g / 500 g / 1, 2, 5, 10, 15 kg ; Leboncoin : ses 11 tranches).
--   · Vinted (relevé du dressing) : même règle sur le prix demandé, d'un
--     relevé journalier au suivant (vinted_listing_snapshots).
-- ⛔ GARDE-FOU : rien ici ne touche une AUTRE annonce. La fiche suit ; les
--    autres plateformes ne bougent pas, la personne décide (aucun job créé).
-- ⛔ Une fiche vendue, fusionnée ou une annonce disparue ne suit rien.
-- ⛔ Toute erreur est avalée en avertissement : un relevé n'échoue jamais à
--    cause de ce déclencheur.
-- Idempotente.

ALTER TABLE public.annonces_plateforme
  ADD COLUMN IF NOT EXISTS donnees_index jsonb,
  ADD COLUMN IF NOT EXISTS donnees_index_le timestamptz;

COMMENT ON COLUMN public.annonces_plateforme.donnees_index IS
  'Ce que l''annonce affiche, lu sans ouvrir sa page (Beebs : index public ; eBay : API Browse/Trading). Clés normalisées : description, marque, categorie, etat, taille, couleur, matiere, age, poids_g, modifie_le, source. 04/10/2026.';

-- ── Les tranches de poids d'une plateforme ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.poids_tranche(p_platform text, p_g integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_g IS NULL THEN NULL
    WHEN p_platform = 'beebs' THEN COALESCE(
      (SELECT t FROM unnest(ARRAY[200, 500, 1000, 2000, 5000, 10000, 15000]) t WHERE t >= p_g ORDER BY t LIMIT 1), 15001)
    WHEN p_platform = 'leboncoin' THEN COALESCE(
      (SELECT t FROM unnest(ARRAY[100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 40000]) t WHERE t >= p_g ORDER BY t LIMIT 1), 40001)
    ELSE p_g
  END;
$function$;

-- ── Le poids qu'une capture (ou une lecture d'index) donne, en grammes ─────
CREATE OR REPLACE FUNCTION public.annonce_poids_g(p_platform text, p_d jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v numeric;
  t text;
BEGIN
  IF p_d IS NULL OR jsonb_typeof(p_d) <> 'object' THEN RETURN NULL; END IF;
  t := p_d ->> 'poids_g';
  IF t ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN v := t::numeric; END IF;
  IF v IS NULL AND NULLIF(p_d ->> 'format_colis_id', '') IS NOT NULL THEN
    SELECT poids_g INTO v FROM beebs_formats_colis WHERE id = p_d ->> 'format_colis_id';
  END IF;
  IF v IS NULL AND p_platform = 'beebs' AND COALESCE(p_d ->> 'format_colis', '') ~* '^poids' THEN
    v := public.poids_g_de_texte(p_d ->> 'format_colis');
  END IF;
  IF v IS NULL AND p_platform = 'leboncoin' AND jsonb_typeof(p_d -> 'attributs_bruts') = 'array' THEN
    SELECT (x ->> 'value')::numeric INTO v
      FROM jsonb_array_elements(p_d -> 'attributs_bruts') x
     WHERE x ->> 'key' = 'estimated_parcel_weight' AND (x ->> 'value') ~ '^[0-9]+(\.[0-9]+)?$'
     LIMIT 1;
  END IF;
  IF v IS NULL OR v < 1 OR v > 200000 THEN RETURN NULL; END IF;
  RETURN round(v)::integer;
END;
$function$;

-- ── Une valeur d'attribut lisible (même garde que l'extension, 18/09) ──────
-- Plus : une case « je n'en ai pas » n'est pas une valeur (relevé du 04/10
-- sur les captures du parc : « Sans marque » ×458, « Autre » ×190,
-- « -- non indiqué » ×233, « Non spécifié » ×81…). ⛔ « Sans marque » n'est
-- jamais écrit sur une fiche (règle du 03/10).
CREATE OR REPLACE FUNCTION public.valeur_attribut_saine(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(btrim(p), '') IS NOT NULL
     AND length(btrim(p)) <= 80
     AND btrim(p) !~* '(en savoir plus|afficher toutes les d[ée]finitions|la page s.ouvre|s.ouvre dans (un|une) nouvel|opens in a new (window|tab)|learn more|see all condition definitions|consulter la page|voir les d[ée]tails)'
     AND btrim(public.texte_sans_accents(p)) !~ '^[-–— ]*(non (indique|indiquee|specifie|specifiee|applicable|renseigne|renseignee|communique)|autres?|aucune?|sans marque|sans objet|n ?a|couleur|matiere|marque|unspecified|does not apply|not applicable|unbranded|no brand)[-–— .]*$'
     AND btrim(public.texte_sans_accents(p)) !~ '^[-–— ]*non indique';
$function$;

-- ── Opla écrit ses couleurs et matières en codes anglais (« BLACK, WHITE »,
-- « synthetic-leather ») ; sa page les affiche en français. On reprend ce que
-- la page affiche. Un code inconnu reste tel quel (rien d'inventé).
CREATE OR REPLACE FUNCTION public.opla_valeur_affichee(p_cle text, p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  t text;
  morceaux text[] := ARRAY[]::text[];
  v text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN p; END IF;
  FOREACH t IN ARRAY regexp_split_to_array(btrim(p), '\s*,\s*') LOOP
    v := CASE WHEN p_cle = 'couleur' THEN CASE upper(t)
           WHEN 'BLACK' THEN 'Noir' WHEN 'WHITE' THEN 'Blanc' WHEN 'GREY' THEN 'Gris' WHEN 'GRAY' THEN 'Gris'
           WHEN 'BLUE' THEN 'Bleu' WHEN 'NAVY' THEN 'Bleu marine' WHEN 'LIGHT-BLUE' THEN 'Bleu clair'
           WHEN 'RED' THEN 'Rouge' WHEN 'ROSE' THEN 'Rose' WHEN 'PINK' THEN 'Rose' WHEN 'BROWN' THEN 'Marron'
           WHEN 'SILVER' THEN 'Argenté' WHEN 'GOLD' THEN 'Doré' WHEN 'KHAKI' THEN 'Kaki' WHEN 'CREAM' THEN 'Crème'
           WHEN 'BURGUNDY' THEN 'Bordeaux' WHEN 'ORANGE' THEN 'Orange' WHEN 'YELLOW' THEN 'Jaune'
           WHEN 'GREEN' THEN 'Vert' WHEN 'DARK-GREEN' THEN 'Vert foncé' WHEN 'MINT' THEN 'Menthe'
           WHEN 'CORAL' THEN 'Corail' WHEN 'TURQUOISE' THEN 'Turquoise' WHEN 'PURPLE' THEN 'Violet'
           WHEN 'LILAC' THEN 'Lilas' WHEN 'APRICOT' THEN 'Abricot' WHEN 'MUSTARD' THEN 'Moutarde'
           WHEN 'CLEAR' THEN 'Transparent' WHEN 'VARIOUS' THEN 'Multicolore' WHEN 'BODY' THEN 'Chair'
           WHEN 'BEIGE' THEN 'Beige' WHEN 'CAMEL' THEN 'Camel' ELSE t END
         WHEN p_cle = 'matiere' THEN CASE lower(t)
           WHEN 'cotton' THEN 'Coton' WHEN 'plastic' THEN 'Plastique' WHEN 'synthetic-leather' THEN 'Simili cuir'
           WHEN 'polyester' THEN 'Polyester' WHEN 'wood' THEN 'Bois' WHEN 'wool' THEN 'Laine' WHEN 'leather' THEN 'Cuir'
           WHEN 'linen' THEN 'Lin' WHEN 'silk' THEN 'Soie' WHEN 'denim' THEN 'Denim' WHEN 'metal' THEN 'Métal'
           WHEN 'glass' THEN 'Verre' ELSE t END
         ELSE t END;
    morceaux := array_append(morceaux, v);
  END LOOP;
  RETURN array_to_string(morceaux, ', ');
END;
$function$;

-- ── Ce que l'annonce affiche : la capture de la page d'abord, l'index ensuite
CREATE OR REPLACE FUNCTION public.annonce_donnees(p_platform text, p_capture jsonb, p_index jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cap jsonb := CASE WHEN jsonb_typeof(p_capture) = 'object' THEN p_capture ELSE '{}'::jsonb END;
  idx jsonb := CASE WHEN jsonb_typeof(p_index) = 'object' THEN p_index ELSE '{}'::jsonb END;
  k text;
  v_out jsonb := '{}'::jsonb;
  v text;
BEGIN
  FOREACH k IN ARRAY ARRAY['description', 'marque', 'categorie', 'etat', 'taille', 'couleur', 'matiere', 'age'] LOOP
    v := COALESCE(NULLIF(btrim(cap ->> k), ''), NULLIF(btrim(idx ->> k), ''));
    IF v IS NOT NULL AND p_platform = 'opla' AND k IN ('couleur', 'matiere') THEN v := public.opla_valeur_affichee(k, v); END IF;
    IF v IS NOT NULL THEN v_out := v_out || jsonb_build_object(k, v); END IF;
  END LOOP;
  v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
    'poids_g', COALESCE(public.annonce_poids_g(p_platform, cap), public.annonce_poids_g(p_platform, idx))));
  RETURN v_out;
END;
$function$;

-- ═══ POINT 1 : COMPLÉTER LES SEULS CHAMPS VIDES ════════════════════════════
CREATE OR REPLACE FUNCTION public.fiche_completer_depuis_annonce(p_annonce_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  i inventaire%ROWTYPE;
  d jsonb;
  v_source text;
  v_desc text; v_marque text; v_type text; v_prix numeric; v_poids integer;
  v_attr jsonb := '{}'::jsonb;
  k text;
  v_champs text[] := ARRAY[]::text[];
  v_detail jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id;
  IF a.id IS NULL OR a.inventaire_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'non_rattachee'); END IF;
  SELECT * INTO i FROM inventaire WHERE id = a.inventaire_id AND user_id = a.user_id FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'fiche_absente_ou_fusionnee'); END IF;
  d := public.annonce_donnees(a.platform, a.capture, a.donnees_index);
  v_source := 'releve_' || a.platform;
  v_detail := jsonb_build_object('annonce_id', a.id, 'listing_id', a.listing_id, 'platform', a.platform);

  IF NULLIF(btrim(i.description), '') IS NULL AND length(COALESCE(d ->> 'description', '')) BETWEEN 1 AND 10000 THEN
    v_desc := d ->> 'description'; v_champs := array_append(v_champs, 'description');
  END IF;
  IF NULLIF(btrim(i.marque), '') IS NULL AND public.valeur_attribut_saine(d ->> 'marque') THEN
    v_marque := btrim(d ->> 'marque'); v_champs := array_append(v_champs, 'marque');
  END IF;
  IF i.type IS NULL THEN
    v_type := public.type_fillsell_depuis_categorie(a.platform, d ->> 'categorie');
    IF v_type IS NOT NULL THEN v_champs := array_append(v_champs, 'type'); END IF;
  END IF;
  IF i.prix_vente IS NULL AND COALESCE(i.statut, '') <> 'vendu' AND a.prix > 0 THEN
    v_prix := a.prix; v_champs := array_append(v_champs, 'prix_vente');
  END IF;
  IF i.poids_g IS NULL AND (d ->> 'poids_g') IS NOT NULL THEN
    v_poids := (d ->> 'poids_g')::integer; v_champs := array_append(v_champs, 'poids_g');
  END IF;
  FOREACH k IN ARRAY ARRAY['etat', 'taille', 'couleur', 'matiere', 'age'] LOOP
    IF NULLIF(btrim(i.attributs -> k ->> 'v'), '') IS NULL AND public.valeur_attribut_saine(d ->> k) THEN
      v_attr := v_attr || jsonb_build_object(k, jsonb_build_object('v', btrim(d ->> k), 'source', v_source, 'at', now()));
      v_champs := array_append(v_champs, 'attributs.' || k);
    END IF;
  END LOOP;

  IF cardinality(v_champs) = 0 THEN RETURN jsonb_build_object('ok', true, 'champs', '[]'::jsonb); END IF;

  PERFORM set_config('fillsell.source_changement', 'releve:' || a.platform, true);
  UPDATE inventaire SET
    description = COALESCE(v_desc, description),
    marque      = COALESCE(v_marque, marque),
    type        = COALESCE(v_type, type),
    prix_vente  = COALESCE(v_prix, prix_vente),
    poids_g     = COALESCE(v_poids, poids_g),
    attributs   = CASE WHEN v_attr = '{}'::jsonb THEN attributs ELSE COALESCE(attributs, '{}'::jsonb) || v_attr END
  WHERE id = i.id;
  PERFORM set_config('fillsell.source_changement', '', true);

  IF v_desc IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'description', NULL, left(v_desc, 120), v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_marque IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'marque', NULL, v_marque, v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_type IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'type', NULL, v_type, v_source, 'champ_vide_complete', v_detail || jsonb_build_object('categorie', d ->> 'categorie')); END IF;
  IF v_prix IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'prix_vente', NULL, v_prix::text, v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_poids IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'poids_g', NULL, v_poids::text, v_source, 'champ_vide_complete', v_detail); END IF;
  FOR k IN SELECT jsonb_object_keys(v_attr) LOOP
    PERFORM journaliser_fiche(a.user_id, i.id, 'attributs.' || k, NULL, v_attr -> k ->> 'v', v_source, 'champ_vide_complete', v_detail);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'champs', to_jsonb(v_champs));
END;
$function$;
REVOKE ALL ON FUNCTION public.fiche_completer_depuis_annonce(uuid) FROM PUBLIC, anon, authenticated;

-- ═══ POINT 3 : LA PLATEFORME FAIT FOI POUR CE QUE LA PERSONNE Y A CHANGÉ ════
-- Deux prix « égaux » pour une plateforme : au centime, ou à l'arrondi
-- Leboncoin (qui n'affiche que des euros entiers).
CREATE OR REPLACE FUNCTION public.prix_equivalents(p_platform text, p_fiche numeric, p_plateforme numeric)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_fiche IS NOT NULL AND p_plateforme IS NOT NULL AND (
    abs(p_fiche - p_plateforme) < 0.01
    OR (p_platform = 'leboncoin' AND p_plateforme = trunc(p_plateforme)
        AND (p_plateforme = round(p_fiche) OR p_plateforme = ceil(p_fiche) OR p_plateforme = floor(p_fiche))));
$function$;

-- Le cœur, commun au prix et au poids. Rend le motif retenu.
--   p_champ        'prix_vente' | 'poids_g'
--   p_nouveau      valeur lue sur la plateforme
--   p_ancien       valeur de la plateforme à l'observation précédente
--   p_observe_le   date de cette observation précédente
--   p_date_pf      date de modification donnée par la plateforme (ou NULL)
CREATE OR REPLACE FUNCTION public.fiche_suivre_plateforme(p_user uuid, p_inventaire bigint, p_platform text, p_champ text,
                                                          p_nouveau numeric, p_ancien numeric, p_observe_le timestamptz,
                                                          p_date_pf timestamptz, p_detail jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  i inventaire%ROWTYPE;
  v_fiche numeric;
  v_change_le timestamptz;
  v_change_par text;
  v_aligne boolean;
  v_egal_nouveau boolean;
  v_user boolean;
  v_motif text;
  v_suit boolean := false;
BEGIN
  IF p_champ NOT IN ('prix_vente', 'poids_g') OR p_nouveau IS NULL OR p_ancien IS NULL THEN RETURN 'ignore'; END IF;
  SELECT * INTO i FROM inventaire WHERE id = p_inventaire AND user_id = p_user FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL OR COALESCE(i.statut, '') <> 'stock' THEN RETURN 'fiche_hors_stock'; END IF;
  IF p_champ = 'prix_vente' THEN
    v_fiche := i.prix_vente; v_change_le := i.prix_vente_change_le; v_change_par := i.prix_vente_change_par;
    IF v_fiche IS NULL THEN RETURN 'fiche_vide'; END IF;
    v_egal_nouveau := public.prix_equivalents(p_platform, v_fiche, p_nouveau);
    -- La plateforme a-t-elle VRAIMENT bougé ? (l'arrondi Leboncoin d'un
    -- prix déposé à 11,50 € n'est pas un geste de la personne)
    IF public.prix_equivalents(p_platform, p_ancien, p_nouveau) THEN RETURN 'plateforme_inchangee'; END IF;
    v_aligne := public.prix_equivalents(p_platform, v_fiche, p_ancien);
  ELSE
    v_fiche := i.poids_g; v_change_le := i.poids_change_le; v_change_par := i.poids_change_par;
    IF v_fiche IS NULL THEN RETURN 'fiche_vide'; END IF;
    v_egal_nouveau := public.poids_tranche(p_platform, v_fiche::integer) = public.poids_tranche(p_platform, p_nouveau::integer);
    IF public.poids_tranche(p_platform, p_ancien::integer) = public.poids_tranche(p_platform, p_nouveau::integer) THEN RETURN 'plateforme_inchangee'; END IF;
    v_aligne := public.poids_tranche(p_platform, v_fiche::integer) = public.poids_tranche(p_platform, p_ancien::integer);
  END IF;
  IF v_egal_nouveau THEN RETURN 'deja_aligne'; END IF;

  v_user := v_change_par = 'app' AND v_change_le IS NOT NULL AND (p_observe_le IS NULL OR v_change_le > p_observe_le);
  IF v_user THEN
    IF p_date_pf IS NOT NULL AND p_date_pf > v_change_le THEN
      v_motif := 'conflit_plateforme_plus_recente'; v_suit := true;
    ELSE
      v_motif := CASE WHEN p_date_pf IS NULL THEN 'conflit_fillsell_garde_ordre_inconnu' ELSE 'conflit_fillsell_plus_recent' END;
    END IF;
  ELSIF v_aligne THEN
    v_motif := 'change_sur_la_plateforme'; v_suit := true;
  ELSE
    v_motif := 'valeur_propre_a_la_plateforme';
  END IF;

  IF v_suit THEN
    PERFORM set_config('fillsell.source_changement', 'plateforme:' || p_platform, true);
    IF p_champ = 'prix_vente' THEN
      UPDATE inventaire SET prix_vente = p_nouveau WHERE id = i.id;
    ELSE
      UPDATE inventaire SET poids_g = p_nouveau::integer WHERE id = i.id;
    END IF;
    PERFORM set_config('fillsell.source_changement', '', true);
  END IF;

  -- Une seule ligne de journal par valeur et par motif (un relevé repasse
  -- chaque jour : on ne répète pas « prix propre à la plateforme »).
  IF v_suit OR NOT EXISTS (
       SELECT 1 FROM inventaire_journal jj
        WHERE jj.inventaire_id = i.id AND jj.champ = p_champ AND jj.motif = v_motif
          AND jj.apres = p_nouveau::text AND jj.detail ->> 'platform' = p_platform) THEN
    PERFORM journaliser_fiche(p_user, i.id, p_champ, v_fiche::text, p_nouveau::text, 'plateforme:' || p_platform, v_motif,
      COALESCE(p_detail, '{}'::jsonb) || jsonb_build_object('platform', p_platform, 'ancien_sur_la_plateforme', p_ancien,
        'observe_le', p_observe_le, 'date_plateforme', p_date_pf, 'fiche_change_le', v_change_le, 'fiche_change_par', v_change_par,
        'fiche_suit', v_suit));
  END IF;
  RETURN v_motif;
END;
$function$;
REVOKE ALL ON FUNCTION public.fiche_suivre_plateforme(uuid, bigint, text, text, numeric, numeric, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- La date de modification que la plateforme donne, quand elle la donne.
CREATE OR REPLACE FUNCTION public.annonce_date_modification(p_capture jsonb, p_index jsonb)
 RETURNS timestamptz
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  t text := COALESCE(NULLIF(p_index ->> 'modifie_le', ''), NULLIF(p_capture ->> 'modifie_le', ''));
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN t::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.annonce_vers_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ancien numeric;
  v_observe timestamptz;
  v_fiche_prix numeric;
  v_w_new integer;
  v_w_old integer;
  v_detail jsonb;
BEGIN
  BEGIN
    -- 1. Les champs vides, à chaque nouvelle matière (capture, index, rattachement).
    IF TG_OP = 'INSERT' OR NEW.inventaire_id IS DISTINCT FROM OLD.inventaire_id
       OR NEW.capture IS DISTINCT FROM OLD.capture OR NEW.donnees_index IS DISTINCT FROM OLD.donnees_index THEN
      PERFORM public.fiche_completer_depuis_annonce(NEW.id);
    END IF;

    -- 2. Le suivi de la plateforme : une annonce déjà rattachée, toujours en ligne.
    IF TG_OP = 'UPDATE' AND NEW.inventaire_id IS NOT DISTINCT FROM OLD.inventaire_id
       AND NEW.disparu_le IS NULL AND COALESCE(NEW.statut_plateforme, 'en_ligne') IN ('en_ligne', 'en_verification', 'inconnu') THEN
      v_detail := jsonb_build_object('annonce_id', NEW.id, 'listing_id', NEW.listing_id);
      -- PRIX
      IF NEW.prix IS NOT NULL AND NEW.prix > 0 THEN
        SELECT prix_vente INTO v_fiche_prix FROM inventaire WHERE id = NEW.inventaire_id;
        IF v_fiche_prix IS NOT NULL AND NOT public.prix_equivalents(NEW.platform, v_fiche_prix, NEW.prix) THEN
          IF OLD.prix IS NOT NULL AND abs(OLD.prix - NEW.prix) >= 0.01 THEN
            v_ancien := OLD.prix; v_observe := COALESCE(OLD.vu_le, OLD.updated_at);
            v_detail := v_detail || jsonb_build_object('observation', 'releve_precedent');
          ELSE
            -- Rattrapage : le prix auquel FillSell a connu l'annonce la
            -- première fois sur cette plateforme (dépôt ou import).
            SELECT j.price, j.created_at INTO v_ancien, v_observe
              FROM cross_post_jobs j
             WHERE j.inventaire_id = NEW.inventaire_id AND j.platform = NEW.platform
               AND j.action = 'publish' AND j.status = 'published' AND j.price IS NOT NULL
             ORDER BY j.created_at ASC
             LIMIT 1;
            v_detail := v_detail || jsonb_build_object('observation', 'premier_job_de_la_plateforme');
            -- Le premier dépôt ne dit pas toujours le prix d'hier (Louis,
            -- rangement Rouge : déposé à 12 € le 19/09, fiche à 8 €, Beebs à
            -- 10 €). Avant ce lot, aucune trace ne dit qui a changé quoi :
            -- quand la fiche n'en porte aucune (prix_vente_change_par vide)
            -- et que TOUTES ses annonces en ligne — Vinted compris — sont
            -- d'accord sur le prix de cette plateforme, c'est lui le prix
            -- réel : la fiche suit. Une seule annonce en désaccord (prix
            -- propre à une plateforme) et rien ne bouge.
            IF (v_ancien IS NULL OR NOT public.prix_equivalents(NEW.platform, v_fiche_prix, v_ancien))
               AND (SELECT i0.prix_vente_change_par FROM inventaire i0 WHERE i0.id = NEW.inventaire_id) IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM annonces_plateforme b
                  WHERE b.inventaire_id = NEW.inventaire_id AND b.id <> NEW.id AND b.disparu_le IS NULL
                    AND b.prix > 0 AND NOT public.prix_equivalents(b.platform, NEW.prix, b.prix))
               AND NOT EXISTS (
                 SELECT 1 FROM inventaire i2
                   JOIN LATERAL (SELECT s.price FROM vinted_listing_snapshots s
                                  WHERE s.user_id = i2.user_id AND s.vinted_item_id = i2.vinted_item_id
                                  ORDER BY s.captured_at DESC LIMIT 1) s ON true
                  WHERE i2.id = NEW.inventaire_id AND i2.vinted_item_id IS NOT NULL AND i2.disparu_le IS NULL
                    AND s.price > 0 AND abs(s.price - NEW.prix) >= 0.01) THEN
              v_ancien := v_fiche_prix; v_observe := NULL;
              v_detail := v_detail || jsonb_build_object('observation', 'annonces_toutes_d_accord');
            END IF;
          END IF;
          IF v_ancien IS NOT NULL THEN
            PERFORM public.fiche_suivre_plateforme(NEW.user_id, NEW.inventaire_id, NEW.platform, 'prix_vente',
              NEW.prix, v_ancien, v_observe, public.annonce_date_modification(NEW.capture, NEW.donnees_index), v_detail);
          END IF;
        END IF;
      END IF;
      -- POIDS (capture de la page ou lecture d'index, d'une fois sur l'autre)
      IF NEW.capture IS DISTINCT FROM OLD.capture OR NEW.donnees_index IS DISTINCT FROM OLD.donnees_index THEN
        v_w_new := COALESCE(public.annonce_poids_g(NEW.platform, NEW.capture), public.annonce_poids_g(NEW.platform, NEW.donnees_index));
        v_w_old := COALESCE(public.annonce_poids_g(NEW.platform, OLD.capture), public.annonce_poids_g(NEW.platform, OLD.donnees_index));
        IF v_w_new IS NOT NULL AND v_w_old IS NOT NULL THEN
          PERFORM public.fiche_suivre_plateforme(NEW.user_id, NEW.inventaire_id, NEW.platform, 'poids_g',
            v_w_new, v_w_old, COALESCE(OLD.capture_le, OLD.donnees_index_le), public.annonce_date_modification(NEW.capture, NEW.donnees_index),
            jsonb_build_object('annonce_id', NEW.id, 'listing_id', NEW.listing_id, 'observation', 'capture_precedente'));
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_vers_fiche (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS annonce_vers_fiche ON public.annonces_plateforme;
CREATE TRIGGER annonce_vers_fiche
  AFTER INSERT OR UPDATE ON public.annonces_plateforme
  FOR EACH ROW
  WHEN (NEW.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.annonce_vers_fiche();

-- ── Vinted : le prix demandé, d'un relevé du dressing au suivant ──────────
CREATE OR REPLACE FUNCTION public.vinted_releve_vers_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv bigint;
  v_ancien numeric;
  v_observe timestamptz;
BEGIN
  BEGIN
    IF NEW.price IS NULL OR NEW.price <= 0 OR COALESCE(NEW.status, '') NOT IN ('active', 'en_ligne', 'available', '') THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND OLD.price IS NOT NULL AND abs(OLD.price - NEW.price) >= 0.01 THEN
      v_ancien := OLD.price; v_observe := OLD.captured_at;
    ELSIF TG_OP = 'INSERT' THEN
      SELECT s.price, s.captured_at INTO v_ancien, v_observe
        FROM vinted_listing_snapshots s
       WHERE s.user_id = NEW.user_id AND s.vinted_item_id = NEW.vinted_item_id AND s.captured_on < NEW.captured_on
         AND s.price IS NOT NULL
       ORDER BY s.captured_at DESC
       LIMIT 1;
    END IF;
    IF v_ancien IS NULL OR abs(v_ancien - NEW.price) < 0.01 THEN RETURN NULL; END IF;
    SELECT id INTO v_inv FROM inventaire WHERE user_id = NEW.user_id AND vinted_item_id = NEW.vinted_item_id;
    IF v_inv IS NULL THEN RETURN NULL; END IF;
    PERFORM public.fiche_suivre_plateforme(NEW.user_id, v_inv, 'vinted', 'prix_vente', NEW.price, v_ancien, v_observe, NULL,
      jsonb_build_object('vinted_item_id', NEW.vinted_item_id, 'observation', 'releve_precedent'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vinted_releve_vers_fiche (article %) : %', NEW.vinted_item_id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS vinted_releve_vers_fiche ON public.vinted_listing_snapshots;
CREATE TRIGGER vinted_releve_vers_fiche
  AFTER INSERT OR UPDATE OF price ON public.vinted_listing_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.vinted_releve_vers_fiche();
