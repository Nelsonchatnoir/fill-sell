-- ═══════════════════════════════════════════════════════════════════════════
-- RATTACHEMENT : PREUVES CROISÉES (2026-09-25 après-midi, chantier « zéro doublon »)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE CAS FONDATEUR — Jocabroc (Pro), pichet Art déco :
--   · fiche d'origine 1790073977327006 (Vinted, « … années 30 … », 15 €) ;
--   · relevé eBay du 24/09 à 09:33 : « … années 1930 … », 25 € → IMPORTÉ comme
--     un nouvel article (1790228012158). Motif lu en base : 'aucune' /
--     'aucun_candidat'. La règle « deux nombres différents = deux objets »
--     (titres_variantes_incompatibles, 24/09) voyait {30} ≠ {1930} et écartait
--     la bonne fiche du faisceau ET de la garde du jumeau.
-- MESURÉ SUR LE PARC (86 comptes, 13 701 fiches importées depuis le 17/09,
--   9 804 paires candidates, 12 220 photos empreintées) : les vrais doublons
--   ont souvent des titres qui diffèrent (« Ancien bénitier » / « Ancien Petit
--   Bénitier », « Orchidées, roses… » / « Orchidée et rose… ») et des prix qui
--   diffèrent d'une plateforme à l'autre (19 € / 32 €). Le faisceau exigeait
--   un prix proche pour atteindre 0,45 : il ne proposait rien, et l'annonce
--   s'importait en second article.
--
-- CE QUE POSE CETTE MIGRATION (tout le reste du moteur est INCHANGÉ) :
--   1. titre_nombres : les décennies se lisent (« années 30 » = 1930,
--      « 70s » = 1970). Miroir exact : src/utils/variantesTitre.js.
--   2. titre_jetons : les mots qui comptent d'un titre (≥ 3 lettres, hors
--      mots vides, pluriel ramené au singulier, nombres de 3 chiffres et plus).
--   3. titre_marque_utile : « Vintage », « Sans marque », « Autre »… ne sont
--      pas des marques (Jocabroc : marque « Vintage » sur tout son dressing).
--   4. titres_variantes_exclusives : la COULEUR exclut toujours (kits de
--      Louis) ; le NOMBRE n'exclut que si aucun des deux côtés ne contient
--      l'autre (« Lot 4 coupelles … 7,5 cm » / « Lot 4 coupelles » = même
--      objet ; « tome 2 » / « tome 3 » = deux objets). Utilisée par le
--      FAISCEAU seulement (bande 'propose') : la garde du jumeau et la bande
--      'certain' gardent la règle stricte (titres_variantes_incompatibles).
--   5. rapprocher_classer, second tour (faisceau) : jetons de titre_jetons,
--      fiches « disparues » de Vinted admises (l'objet est toujours en
--      stock), variantes exclusives, marque utile, et un recouvrement ≥ 0,6
--      suffit à PROPOSER quand le prix diffère. ⛔ Le faisceau ne rend
--      toujours QUE 'propose' : jamais d'import, jamais de rattachement seul.
--   6. photos : fiche_photos_urls, annonce_photos_urls, photos_distance —
--      LUES dans le cache photo_empreintes, jamais calculées ici (la fonction
--      edge doublons-balayage les calcule, migration 20260925151000).
-- ⛔ rapprocher_classer est patchée EN PLACE depuis pg_get_functiondef (md5
--    avant a20a0db8459ca37ded6c21834bc3b469, vérifié : un autre md5 arrête
--    tout), cinq ancres vérifiées une fois chacune.
-- ⛔ NE S'APPLIQUE PAS PAR `db push` (CLAUDE.md). Une par une.

-- ── 0. LES CORPS PROD SONT CEUX QU'ON A LUS ─────────────────────────────────
DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.titre_nombres(text)'::regprocedure)) <> 'd07ba847ed719f67168862827dcc078f' THEN
    RAISE EXCEPTION 'titre_nombres a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
  IF md5(pg_get_functiondef('public.rapprocher_classer(uuid,text,text,text,text,numeric,text[])'::regprocedure)) <> 'a20a0db8459ca37ded6c21834bc3b469' THEN
    RAISE EXCEPTION 'rapprocher_classer a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
END
$verif$;

-- ── 1. LES DÉCENNIES SE LISENT ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.titre_nombres(t text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Les nombres nus d'un titre, dédoublonnés, triés. Les DÉCENNIES se lisent
  -- (2026-09-25, pichet de Jocabroc) : « années 30 » = 1930, « 70s » = 1970.
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT n FROM (
      SELECT CASE
               WHEN m ~ '^[1-9]0s$' THEN '19' || left(m, 2)
               WHEN m ~ '^[1-9]0$' AND lag(m) OVER (ORDER BY o) ~ '^annees?$' THEN '19' || m
               ELSE m END AS n
        FROM unnest(string_to_array(titre_norm(t), ' ')) WITH ORDINALITY AS u(m, o)
    ) x
    WHERE n ~ '^[0-9]+$'
    ORDER BY n), '{}'::text[]);
$function$;

-- ── 2. LES MOTS QUI COMPTENT ────────────────────────────────────────────────
-- ⛔ MIROIR EXACT de jetonsDuTitre (scripts/lib/meme-objet.mjs) : même liste de
--    mots vides, même racinisation. Le selftest doublons compare les deux.
CREATE OR REPLACE FUNCTION public.titre_jetons(t text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT j FROM (
      SELECT m, CASE
               WHEN m ~ '^[1-9]0s$' THEN '19' || left(m, 2)
               WHEN m ~ '^[1-9]0$' AND lag(m) OVER (ORDER BY o) ~ '^annees?$' THEN '19' || m
               WHEN m ~ '^[0-9]+$' THEN m
               WHEN length(m) > 4 AND m ~ '[sx]$' THEN left(m, -1)
               ELSE m END AS j
        FROM unnest(string_to_array(titre_norm(t), ' ')) WITH ORDINALITY AS u(m, o)
    ) x
    WHERE CASE WHEN j ~ '^[0-9]+$' THEN length(j) >= 3
               ELSE length(m) >= 3
                    -- ⟦mots-vides:début⟧
                    AND NOT (m = ANY (ARRAY['pour', 'avec', 'sans', 'par', 'sur', 'les', 'des', 'une', 'aux', 'est', 'dans', 'tres', 'bon', 'etat', 'neuf', 'neuve', 'taille', 'occasion', 'the', 'and', 'for', 'with', 'tbe', 'excellent', 'parfait', 'comme', 'ans', 'mois', 'vintage']))
                    -- ⟦mots-vides:fin⟧
          END
    ORDER BY 1), '{}'::text[]);
$function$;

-- ── 3. UNE MARQUE QUI N'EN EST PAS UNE ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.titre_marque_utile(m text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN titre_norm(m) = ANY (
    -- ⟦marques-vides:début⟧
    ARRAY['', 'sans marque', 'sans', 'autre', 'autres', 'vintage', 'fait main', 'handmade', 'artisanal', 'artisanale', 'artisanat', 'inconnue', 'inconnu', 'marque inconnue', 'no brand', 'non marque', 'non marquee', 'unbranded', 'generique', 'marque generique', 'aucune', 'none', 'other', 'divers']
    -- ⟦marques-vides:fin⟧
  ) THEN '' ELSE titre_norm(m) END;
$function$;

-- ── 4. LA COULEUR EXCLUT, LE NOMBRE SEULEMENT S'IL CONTREDIT ────────────────
CREATE OR REPLACE FUNCTION public.titres_variantes_exclusives(a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  ca text[] := titre_couleurs(a); cb text[] := titre_couleurs(b);
  na text[]; nb text[];
BEGIN
  IF COALESCE(array_length(ca, 1), 0) > 0 AND COALESCE(array_length(cb, 1), 0) > 0 AND ca <> cb THEN RETURN true; END IF;
  na := titre_nombres(a); nb := titre_nombres(b);
  IF COALESCE(array_length(na, 1), 0) > 0 AND COALESCE(array_length(nb, 1), 0) > 0
     AND NOT (na <@ nb OR nb <@ na) THEN RETURN true; END IF;
  RETURN false;
END;
$function$;

-- ── 5. LE FAISCEAU (second tour de rapprocher_classer) ─────────────────────
DO $patch$
DECLARE
  v_src text; v_new text;
  a1 text := $a1$    v_ja := ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(v_t, ' ')) t WHERE length(t) >= 3);$a1$;
  b1 text := $b1$    v_ja := titre_jetons(p_titre); -- MODIF 2026-09-25 : les mots qui comptent (racinisés, hors mots vides)$b1$;
  a2 text := $a2$            ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(titre_norm(i.titre), ' ')) t WHERE length(t) >= 3) AS jt,$a2$;
  b2 text := $b2$            titre_jetons(i.titre) AS jt, -- MODIF 2026-09-25$b2$;
  a3 text := $a3$            titre_norm(COALESCE(NULLIF(trim(i.marque), ''),$a3$;
  b3 text := $b3$            titre_marque_utile(COALESCE(NULLIF(trim(i.marque), ''), -- MODIF 2026-09-25 : « Vintage » n'est pas une marque$b3$;
  a4 text := $a4$        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
          AND NOT titres_variantes_incompatibles(p_titre, i.titre) -- AJOUT 2026-09-24 : la couleur et le nombre excluent$a4$;
  b4 text := $b4$        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.fusionne_dans IS NULL -- MODIF 2026-09-25 : une fiche « disparue » de Vinted est toujours en stock, elle reste candidate
          AND NOT titres_variantes_exclusives(p_titre, i.titre) -- MODIF 2026-09-25 : la couleur exclut ; le nombre seulement si aucun côté ne contient l'autre$b4$;
  a5 text := $a5$             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
      ORDER BY$a5$;
  b5 text := $b5$             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
             OR q.recouvrement >= 0.6) -- MODIF 2026-09-25 : le prix change d'une plateforme à l'autre ; un titre qui recouvre à 60 % suffit à PROPOSER
      ORDER BY$b5$;
  a5b text := $a5b$      WHERE q.recouvrement >= 0.34
        AND (0.50 * q.recouvrement$a5b$;
  b5b text := $b5b$      WHERE q.recouvrement >= 0.34
        AND ((0.50 * q.recouvrement$b5b$;
  n int;
BEGIN
  SELECT pg_get_functiondef('public.rapprocher_classer(uuid,text,text,text,text,numeric,text[])'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'a20a0db8459ca37ded6c21834bc3b469' THEN RAISE EXCEPTION 'rapprocher_classer : md5 inattendu — ON S ARRETE'; END IF;
  v_new := v_src;
  FOR n IN 1..6 LOOP
    DECLARE av text; ap text; c int;
    BEGIN
      av := CASE n WHEN 1 THEN a1 WHEN 2 THEN a2 WHEN 3 THEN a3 WHEN 4 THEN a4 WHEN 5 THEN a5 ELSE a5b END;
      ap := CASE n WHEN 1 THEN b1 WHEN 2 THEN b2 WHEN 3 THEN b3 WHEN 4 THEN b4 WHEN 5 THEN b5 ELSE b5b END;
      c := (length(v_new) - length(replace(v_new, av, ''))) / length(av);
      IF c <> 1 THEN RAISE EXCEPTION 'rapprocher_classer : ancre % trouvée % fois (attendu 1) — ON S ARRETE', n, c; END IF;
      v_new := replace(v_new, av, ap);
    END;
  END LOOP;
  EXECUTE v_new;
END
$patch$;

-- ── 6. LES PHOTOS, LUES DANS LE CACHE ───────────────────────────────────────
-- Les N premières photos d'une fiche (chaînes ou objets {url}), dans l'ordre.
CREATE OR REPLACE FUNCTION public.fiche_photos_urls(p_photos jsonb, p_n integer DEFAULT 3)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT u FROM (
      SELECT CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}'
                                  WHEN 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END AS u, o
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_photos) = 'array' THEN p_photos ELSE '[]'::jsonb END)
             WITH ORDINALITY AS x(e, o)
    ) y
    WHERE u ~ '^https?://'
    ORDER BY o
    LIMIT greatest(p_n, 0)), '{}'::text[]);
$function$;

-- La vignette d'une annonce relevée, puis les photos de sa capture.
CREATE OR REPLACE FUNCTION public.annonce_photos_urls(p_photo_url text, p_capture jsonb, p_n integer DEFAULT 3)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT u FROM (
      SELECT u, min(o) AS o FROM (
        SELECT p_photo_url AS u, 0::bigint AS o
        UNION ALL
        SELECT CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}'
                                    WHEN 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END, o
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_capture -> 'photos') = 'array' THEN p_capture -> 'photos' ELSE '[]'::jsonb END)
               WITH ORDINALITY AS x(e, o)
      ) z
      WHERE u ~ '^https?://'
      GROUP BY u
    ) y
    ORDER BY o
    LIMIT greatest(p_n, 0)), '{}'::text[]);
$function$;

-- La paire de photos la plus proche entre deux listes d'URL, d'après le cache.
-- Seuils = _shared/empreinte-image.ts (mesure du 23/09) : identique dHash ≤ 5
-- ET pHash ≤ 8 (preuve), proche dHash ≤ 10 (indice). NULL = pas d'empreinte
-- d'un côté ou de l'autre : on ne sait pas, ce n'est PAS « différente ».
CREATE OR REPLACE FUNCTION public.photos_distance(p_a text[], p_b text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('dhash', d, 'phash', p,
           'verdict', CASE WHEN d <= 5 AND p <= 8 THEN 'identique' WHEN d <= 10 THEN 'proche' ELSE 'differente' END)
    FROM (
      SELECT d, p FROM (
        SELECT bit_count(ea.dhash::bit(64) # eb.dhash::bit(64))::int AS d,
               bit_count(ea.phash::bit(64) # eb.phash::bit(64))::int AS p
          FROM photo_empreintes ea, photo_empreintes eb
         WHERE ea.url = ANY (p_a) AND eb.url = ANY (p_b)
      ) w
      ORDER BY d + p, d
      LIMIT 1
    ) z;
$function$;

-- Droits : les fonctions pures servent au moteur (SECURITY DEFINER) et aux
-- contrôles ; photos_distance lit une table ouverte en lecture aux connectés.
REVOKE ALL ON FUNCTION public.titre_jetons(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.titre_marque_utile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.titres_variantes_exclusives(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiche_photos_urls(jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.annonce_photos_urls(text, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.photos_distance(text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.titre_jetons(text), public.titre_marque_utile(text),
  public.titres_variantes_exclusives(text, text), public.fiche_photos_urls(jsonb, integer),
  public.annonce_photos_urls(text, jsonb, integer), public.photos_distance(text[], text[])
  TO authenticated, service_role;
