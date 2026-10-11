-- ═══════════════════════════════════════════════════════════════════════════
-- (11/10, Louis — « Est-ce le même article ? » en boucle) UN ATTRIBUT
-- DISTINCTIF DIFFÉRENT ÉCARTE LA PAIRE D'OFFICE, SANS QUESTION
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré (compte Amiral) : 75 paires refusées par Louis, dont 49 où les deux
-- titres nomment des COULEURS différentes (« Rangement Gris et Rose » /
-- « Rangement Noir et Rose ») et 8 des nombres différents ; 18 encore
-- proposées. Cause : le moteur (_shared/rapprochement/texte.js,
-- couleursCompatibles2) tient deux titres pour compatibles dès qu'ils
-- partagent UNE couleur ou une couleur « voisine » (gris~noir), et même un
-- conflit de couleur ne fait qu'un « doute » quand la photo est identique —
-- or Louis met la même photo produit sur toutes ses couleurs. Chaque passe en
-- masse (07/10 15:45, 08/10 02:20) a tiré une paire par fiche parmi des
-- dizaines de variantes : un « non » ne neutralisait que SA paire.
-- Toutes les questions sont posées entre deux fiches (garde, absorbe) dans
-- inventaire_doublons, par plusieurs producteurs (moteur v3, « même photo »,
-- rattrapages) : la règle vit donc en BASE, à l'insertion, pour tous.
--
-- Règle (tous comptes) : une question écartée n'est jamais posée (garde avant
-- insertion, journal doublons_ecartes_par_regle) ; une paire DÉJÀ proposée est
-- close — statut 'refusee', decide_par 'regle', raison dans
-- preuves.ecartee_par_regle — l'effet d'un « Non, ce sont deux articles »
-- (jamais une fusion) :
--   · COULEUR : les deux titres (ou attributs.couleur) nomment des couleurs,
--     aucun n'est multicolore/à motif, et chacun en nomme une que l'autre n'a
--     pas — sauf nuance proche d'un seul côté (anthracite ~ noir, crème ~
--     blanc) entre deux titres d'UNE couleur ;
--   · NOMBRE (quantité, contenance, référence, modèle, taille chiffrée) :
--     chacun des deux titres porte un nombre que l'autre n'a pas ;
--   · TAILLE : attributs.taille des deux fiches renseignées et différentes ;
--   · PLUSIEURS EXEMPLAIRES : une fiche VENDUE face à une fiche en stock à
--     plusieurs exemplaires (quantité > 1) — une unité vendue ne vend pas les
--     autres, et ce n'est pas le même objet ;
--   · RAFALE : une des deux fiches a déjà été déclarée « différente » par la
--     personne au moins deux fois, et les titres ne sont pas identiques
--     (variantes d'un même modèle photographiées pareil).
-- Deux fiches au titre identique, sans aucun de ces écarts, restent posées
-- en question. Les questions de copie d'une vente (copie_non_prouvee) ne sont
-- pas concernées. Aucune fusion automatique : seule la personne fusionne.
-- Les paires déjà proposées sont reclassées par la MÊME fonction (sauvegarde
-- _backup_1110_doublons_attribut_distinctif ; inverse dans supabase/rollbacks).
-- ═══════════════════════════════════════════════════════════════════════════

-- Forme comparable : minuscules, sans accents, ponctuation → espaces.
CREATE OR REPLACE FUNCTION public.doublon_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT ' ' || regexp_replace(
           translate(lower(COALESCE(p, '')),
             'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ’''-_/.,;:!?()[]{}"«»+*&#',
             'aaaaaaceeeeiiiinooooouuuuyyoe                           '),
           '\s+', ' ', 'g') || ' ';
$$;

-- Les couleurs nommées : canonique → mots ; un mot « base » (le nom même de la
-- couleur et ses accords) ne tolère pas de voisine ; une NUANCE si.
CREATE OR REPLACE FUNCTION public.doublon_couleurs(p_titre text, p_attr text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := public.doublon_norm(COALESCE(p_titre, '') || ' ' || COALESCE(p_attr, ''));
  v_dico jsonb := '{
    "blanc":  ["blanc","blanche","blancs","blanches"],
    "noir":   ["noir","noire","noirs","noires"],
    "gris":   ["gris","grise","grises"],
    "bleu":   ["bleu","bleue","bleus","bleues"],
    "rouge":  ["rouge","rouges"],
    "rose":   ["rose","roses","pink"],
    "vert":   ["vert","verte","verts","vertes"],
    "jaune":  ["jaune","jaunes"],
    "orange": ["orange","oranges"],
    "violet": ["violet","violette","violets","violettes"],
    "marron": ["marron","marrons","brun","brune"],
    "beige":  ["beige","beiges"]
  }'::jsonb;
  v_nuances jsonb := '{
    "blanc":  ["ecru","ivoire","creme","vanille"],
    "beige":  ["sable","nude","camel","taupe","chameau"],
    "marron": ["chocolat","cognac","caramel","noisette","chataigne","tabac"],
    "gris":   ["anthracite","chine","argent","argente","argentee","acier"],
    "bleu":   ["marine","turquoise","ciel","azur","indigo","denim","cobalt","navy"],
    "rouge":  ["bordeaux","carmin","cerise","grenat"],
    "rose":   ["fuchsia","framboise","saumon","poudre","magenta"],
    "vert":   ["kaki","olive","emeraude","menthe","sapin","pistache","anis"],
    "jaune":  ["moutarde","citron","ocre","curry","dore","doree"],
    "orange": ["corail","abricot","rouille","brique","terracotta","cuivre"],
    "violet": ["mauve","lilas","prune","lavande","parme","aubergine","pourpre"]
  }'::jsonb;
  v_base text[] := '{}'; v_nu text[] := '{}'; k text; m text;
  v_multi boolean := v ~ ' (multicolore|multicolor|motifs?|fleuri|fleurs?|imprime|rayures?|raye|rayee|carreaux|leopard|pois|camouflage|arc en ciel) ';
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_dico) LOOP
    FOR m IN SELECT jsonb_array_elements_text(v_dico -> k) LOOP
      IF position(' ' || m || ' ' IN v) > 0 AND NOT (k = ANY (v_base)) THEN v_base := v_base || k; END IF;
    END LOOP;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(v_nuances) LOOP
    FOR m IN SELECT jsonb_array_elements_text(v_nuances -> k) LOOP
      IF position(' ' || m || ' ' IN v) > 0 AND NOT (k = ANY (v_nu)) AND NOT (k = ANY (v_base)) THEN v_nu := v_nu || k; END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('base', to_jsonb(v_base), 'nuance', to_jsonb(v_nu), 'multi', v_multi);
END;
$$;

-- Les nombres QUI DISENT L'OBJET : quantité (« lot de 3 », « 12 pots »,
-- « 3 pièces », « x2 »), contenance ou dimension (500 ml, 1,5 l, 30 cm, 2 kg),
-- taille, pointure, âge (taille 38, T40, pointure 42, 6 mois, 4 ans), et les
-- références lettres+chiffres (GA-2100, S23, RX580). Un nombre seul — code de
-- rangement en tête de titre (« 0620 - »), année, numéro de lot du vendeur —
-- ne dit rien de l'objet : jamais lu (contre-épreuve du 11/10 : sans ce tri,
-- 94 fusions confirmées par les gens auraient été écartées).
CREATE OR REPLACE FUNCTION public.doublon_nombres(p_titre text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  WITH t AS (SELECT ' ' || regexp_replace(lower(COALESCE(p_titre, '')), '[^a-z0-9àâäçéèêëîïôöùûüœ,.]+', ' ', 'g') || ' ' AS s),
  q AS (
    SELECT 'q' || m[1] AS v FROM t, regexp_matches(t.s, ' lot de (\d+) ', 'g') m
    UNION SELECT 'q' || m[1] FROM t, regexp_matches(t.s, ' (\d+) ?(?:pots?|pieces?|pièces?|pcs|unites?|unités?|paires?|exemplaires?|couvercles?|bouteilles?|verres?|assiettes?|tasses?|cartes?|livres?|tomes?|figurines?) ', 'g') m
    UNION SELECT 'q' || m[1] FROM t, regexp_matches(t.s, ' x ?(\d+) ', 'g') m
    UNION SELECT 'q' || m[1] FROM t, regexp_matches(t.s, ' (\d+) ?x ', 'g') m
    UNION SELECT 'u' || replace(m[1], ',', '.') || m[2] FROM t, regexp_matches(t.s, ' (\d+(?:[.,]\d+)?) ?(ml|cl|l|litres?|g|kg|cm|mm|m|go|to|mah|w|v) ', 'g') m
    UNION SELECT 't' || m[1] FROM t, regexp_matches(t.s, ' (?:taille|t|pointure|p) ?(\d{2,3}) ', 'g') m
    UNION SELECT 'a' || m[1] || m[2] FROM t, regexp_matches(t.s, ' (\d+) ?(ans|mois) ', 'g') m
    UNION SELECT 'r' || m[1] FROM regexp_matches(' ' || regexp_replace(regexp_replace(lower(COALESCE(p_titre, '')), '[-_/]', '', 'g'), '[^a-z0-9]+', ' ', 'g') || ' ',
                                                 ' ([a-z]{1,4}\d{2,}[a-z]{0,2}) ', 'g') m
  )
  SELECT COALESCE(array_agg(DISTINCT v), '{}') FROM q;
$$;

-- L'écart distinctif de deux fiches, ou NULL. Pur : la même réponse partout.
CREATE OR REPLACE FUNCTION public.doublon_attribut_distinctif(
  p_titre_a text, p_titre_b text, p_attr_a jsonb DEFAULT NULL, p_attr_b jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  ca jsonb := public.doublon_couleurs(p_titre_a, p_attr_a #>> '{couleur,v}');
  cb jsonb := public.doublon_couleurs(p_titre_b, p_attr_b #>> '{couleur,v}');
  a_tout text[]; b_tout text[]; a_seul text[]; b_seul text[];
  na text[] := public.doublon_nombres(p_titre_a); nb text[] := public.doublon_nombres(p_titre_b);
  -- Taille d'attribut comparable : sans « taille/EU/FR/UK/US », sans parenthèses ;
  -- seulement un nombre ou une taille-lettre (M ≠ 38 ne se juge pas : équivalences).
  ta text := NULLIF(regexp_replace(regexp_replace(lower(COALESCE(p_attr_a #>> '{taille,v}', '')), '\(.*?\)|taille|eu|fr|uk|us|\s', '', 'g'), '[^a-z0-9.,]', '', 'g'), '');
  tb text := NULLIF(regexp_replace(regexp_replace(lower(COALESCE(p_attr_b #>> '{taille,v}', '')), '\(.*?\)|taille|eu|fr|uk|us|\s', '', 'g'), '[^a-z0-9.,]', '', 'g'), '');
  v_voisines jsonb := '{"blanc":["beige","gris"],"beige":["blanc","marron","jaune","orange","rose","gris"],
    "marron":["beige","orange","jaune","rouge","vert","gris","noir"],"noir":["gris","marron","bleu"],
    "gris":["noir","blanc","beige","bleu","vert","marron"],"bleu":["gris","noir","vert","violet"],
    "rouge":["rose","orange","marron","violet"],"rose":["rouge","violet","orange","beige"],
    "vert":["bleu","jaune","marron","gris","beige"],"jaune":["orange","beige","vert","marron"],
    "orange":["rouge","jaune","marron","rose","beige"],"violet":["rose","bleu","rouge"]}'::jsonb;
BEGIN
  -- COULEUR
  IF NOT (ca ->> 'multi')::boolean AND NOT (cb ->> 'multi')::boolean THEN
    a_tout := ARRAY(SELECT jsonb_array_elements_text(ca -> 'base') UNION SELECT jsonb_array_elements_text(ca -> 'nuance'));
    b_tout := ARRAY(SELECT jsonb_array_elements_text(cb -> 'base') UNION SELECT jsonb_array_elements_text(cb -> 'nuance'));
    IF cardinality(a_tout) > 0 AND cardinality(b_tout) > 0 THEN
      a_seul := ARRAY(SELECT unnest(a_tout) EXCEPT SELECT unnest(b_tout));
      b_seul := ARRAY(SELECT unnest(b_tout) EXCEPT SELECT unnest(a_tout));
      IF cardinality(a_seul) > 0 AND cardinality(b_seul) > 0 THEN
        -- Tolérance : deux titres d'UNE couleur chacun, voisines, et l'une
        -- n'est nommée que par une nuance (anthracite / noir).
        IF NOT (cardinality(a_tout) = 1 AND cardinality(b_tout) = 1
                AND COALESCE((v_voisines -> a_tout[1]) ? b_tout[1], false)
                AND (jsonb_array_length(ca -> 'nuance') = 1 OR jsonb_array_length(cb -> 'nuance') = 1)) THEN
          RETURN 'couleur';
        END IF;
      END IF;
    END IF;
  END IF;
  -- NOMBRE
  IF cardinality(na) > 0 AND cardinality(nb) > 0
     AND EXISTS (SELECT 1 FROM unnest(na) x WHERE NOT x = ANY (nb))
     AND EXISTS (SELECT 1 FROM unnest(nb) x WHERE NOT x = ANY (na)) THEN
    RETURN 'nombre';
  END IF;
  -- TAILLE (attributs des deux fiches)
  IF ta IS NOT NULL AND tb IS NOT NULL AND ta <> tb
     AND ((ta ~ '^\d+([.,]\d+)?$' AND tb ~ '^\d+([.,]\d+)?$')
          OR (ta ~ '^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$' AND tb ~ '^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$')) THEN
    RETURN 'taille';
  END IF;
  RETURN NULL;
END;
$$;

-- La règle appliquée à une paire de fiches : la raison, ou NULL (vrai doute).
CREATE OR REPLACE FUNCTION public.doublon_ecarte_par_regle(p_user uuid, p_garde bigint, p_absorbe bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g record; a record; v_raison text; v_refus integer;
BEGIN
  SELECT id, titre, statut, quantite, attributs INTO g FROM inventaire WHERE id = p_garde;
  SELECT id, titre, statut, quantite, attributs INTO a FROM inventaire WHERE id = p_absorbe;
  IF g.id IS NULL OR a.id IS NULL OR g.id = a.id THEN RETURN NULL; END IF;
  v_raison := doublon_attribut_distinctif(g.titre, a.titre, g.attributs, a.attributs);
  IF v_raison IS NOT NULL THEN RETURN v_raison; END IF;
  IF (g.statut = 'vendu' AND a.statut <> 'vendu' AND COALESCE(a.quantite, 1) > 1)
     OR (a.statut = 'vendu' AND g.statut <> 'vendu' AND COALESCE(g.quantite, 1) > 1) THEN
    RETURN 'plusieurs_exemplaires';
  END IF;
  -- Titres comparés sans le code de rangement de tête (« 0720 - », « ) »).
  IF regexp_replace(doublon_norm(g.titre), '^[^a-z]*', '') IS DISTINCT FROM regexp_replace(doublon_norm(a.titre), '^[^a-z]*', '') THEN
    SELECT count(*) INTO v_refus FROM inventaire_doublons d
    WHERE d.user_id = p_user AND d.statut = 'refusee' AND d.decide_par = 'utilisateur'
      AND (d.garde IN (p_garde, p_absorbe) OR d.absorbe IN (p_garde, p_absorbe));
    IF v_refus >= 2 THEN RETURN 'variantes_deja_refusees'; END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Le journal des questions écartées d'office (mesure, jamais relu pour décider).
CREATE TABLE IF NOT EXISTS public.doublons_ecartes_par_regle (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  garde bigint, absorbe bigint,
  motif text, source text, raison text NOT NULL,
  le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doublons_ecartes_par_regle_user_le ON public.doublons_ecartes_par_regle (user_id, le DESC);
-- RLS sans politique : aucune ligne visible côté client (journal serveur) ;
-- GRANT posé selon la règle du dépôt (toute table publique).
ALTER TABLE public.doublons_ecartes_par_regle ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doublons_ecartes_par_regle TO authenticated;

-- À l'insertion : une question que la règle écarte n'est PAS posée (même
-- forme que la garde inventaire_doublons_jamais_deux_exemplaires : RETURN
-- NULL). Le producteur voit « pas posée » : le moteur v3 range alors
-- l'article au stock comme un article distinct (« paire tranchée → un autre
-- article »), aucune fiche ne reste « à vérifier » sans question. L'écart est
-- journalisé dans doublons_ecartes_par_regle.
CREATE OR REPLACE FUNCTION public.inventaire_doublons_attribut_distinctif()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_raison text;
BEGIN
  IF NEW.statut IS DISTINCT FROM 'proposee' OR NEW.motif = 'copie_non_prouvee'
     OR NEW.garde IS NULL OR NEW.absorbe IS NULL OR NEW.garde = NEW.absorbe THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_raison := doublon_ecarte_par_regle(NEW.user_id, NEW.garde, NEW.absorbe);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'inventaire_doublons_attribut_distinctif (% / %): %', NEW.garde, NEW.absorbe, SQLERRM;
    RETURN NEW;   -- jamais bloquant : la question reste posée
  END;
  IF v_raison IS NOT NULL THEN
    INSERT INTO doublons_ecartes_par_regle (user_id, garde, absorbe, motif, source, raison)
    VALUES (NEW.user_id, NEW.garde, NEW.absorbe, NEW.motif, NEW.source, v_raison);
    RETURN NULL;   -- pas de question : deux articles distincts
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventaire_doublons_attribut_distinctif ON public.inventaire_doublons;
CREATE TRIGGER trg_inventaire_doublons_attribut_distinctif
  BEFORE INSERT ON public.inventaire_doublons
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_doublons_attribut_distinctif();

REVOKE ALL ON FUNCTION public.doublon_ecarte_par_regle(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventaire_doublons_attribut_distinctif() FROM PUBLIC, anon, authenticated;

-- Reclassement des paires DÉJÀ proposées, par la même règle (tous comptes).
CREATE TABLE IF NOT EXISTS public._backup_1110_doublons_attribut_distinctif AS
  SELECT d.*, now() AS sauvegarde_le, NULL::text AS raison
  FROM public.inventaire_doublons d WHERE false;

WITH a_clore AS (
  SELECT d.id, doublon_ecarte_par_regle(d.user_id, d.garde, d.absorbe) AS raison
  FROM inventaire_doublons d
  WHERE d.statut = 'proposee' AND d.motif IS DISTINCT FROM 'copie_non_prouvee'
    AND d.garde IS NOT NULL AND d.absorbe IS NOT NULL AND d.garde <> d.absorbe
), sauve AS (
  INSERT INTO public._backup_1110_doublons_attribut_distinctif
  SELECT d.*, now(), c.raison FROM inventaire_doublons d JOIN a_clore c ON c.id = d.id
  WHERE c.raison IS NOT NULL
  RETURNING id, raison
)
UPDATE inventaire_doublons d
   SET statut = 'refusee', decide_par = 'regle', decide_le = now(),
       preuves = COALESCE(d.preuves, '{}'::jsonb) || jsonb_build_object('ecartee_par_regle',
         jsonb_build_object('raison', s.raison, 'regle', 'attribut_distinctif_1110', 'reclassee', true, 'le', now()))
  FROM sauve s
 WHERE d.id = s.id AND d.statut = 'proposee';
