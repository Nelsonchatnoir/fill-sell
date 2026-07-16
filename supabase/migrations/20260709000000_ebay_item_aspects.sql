-- Attributs (item aspects) eBay par catégorie feuille, source = API officielle
-- Taxonomy (fetchItemAspects / getItemAspectsForCategory).
--
-- Raison d'être : le mapping catégorie (src/utils/ebayCategories.js) donne un
-- chemin et un categoryId valides, mais rien sur les attributs que la
-- catégorie EXIGE. Cette table est la source de vérité de ces exigences —
-- jamais devinée, jamais scrapée : uniquement ce que l'API renvoie.
--
-- Une ligne par categoryId de NOTRE mapping (~237 feuilles), pas les milliers
-- de catégories eBay que nous ne mappons pas.

CREATE TABLE IF NOT EXISTS public.ebay_item_aspects (
  category_id   text PRIMARY KEY,
  -- Tableau d'aspects normalisés (cf. edge function fetch-ebay-aspects) :
  -- [{ name, required, dataType, format, mode, cardinality, allowedValues[] }]
  -- Tableau VIDE = la catégorie n'a réellement aucun aspect (cas distinct de
  -- l'échec : voir la colonne status).
  aspects       jsonb NOT NULL DEFAULT '[]'::jsonb,
  aspect_count  integer NOT NULL DEFAULT 0,
  required_count integer NOT NULL DEFAULT 0,
  -- 'ok'        : aspects récupérés (aspect_count peut valoir 0, c'est un fait)
  -- 'empty'     : l'API n'a retourné AUCUN aspect pour cette catégorie
  -- 'not_found' : categoryId absent du dump fetchItemAspects
  -- 'error'     : appel en échec (détail dans note)
  -- Aucun statut ne doit rester implicite : une catégorie sans ligne du tout
  -- signifie que le fetch ne l'a jamais traitée.
  status        text NOT NULL DEFAULT 'ok'
                CHECK (status IN ('ok','empty','not_found','error')),
  note          text,
  -- Traçabilité : d'où vient la donnée et contre quelle version de l'arbre.
  source        text NOT NULL DEFAULT 'fetch_item_aspects'
                CHECK (source IN ('fetch_item_aspects','get_item_aspects_for_category')),
  category_tree_id      text,
  category_tree_version text,
  marketplace_id        text NOT NULL DEFAULT 'EBAY_FR',
  ebay_env      text NOT NULL DEFAULT 'production'
                CHECK (ebay_env IN ('sandbox','production')),
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ebay_item_aspects IS
  'Aspects eBay par catégorie feuille (API Taxonomy). Alimentée manuellement par l''edge function fetch-ebay-aspects. Ne jamais éditer à la main : toute valeur doit venir de l''API.';

CREATE INDEX IF NOT EXISTS ebay_item_aspects_status_idx
  ON public.ebay_item_aspects (status);

-- Référentiel public en lecture (aucune donnée utilisateur) ; écriture réservée
-- au service_role (l'edge function). RLS activée pour ne pas exposer d'écriture
-- via l'API REST avec la clé anon.
ALTER TABLE public.ebay_item_aspects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ebay_item_aspects readable by authenticated" ON public.ebay_item_aspects;
CREATE POLICY "ebay_item_aspects readable by authenticated"
  ON public.ebay_item_aspects
  FOR SELECT
  TO authenticated
  USING (true);

-- Règle projet (CLAUDE.md) : toute nouvelle table du schéma public exige un
-- GRANT explicite pour authenticated. Ici lecture seule — les écritures
-- passent par le service_role, qui contourne la RLS.
GRANT SELECT ON public.ebay_item_aspects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebay_item_aspects TO service_role;
