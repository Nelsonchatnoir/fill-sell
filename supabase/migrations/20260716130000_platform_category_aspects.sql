-- Catalogue CUMULATIF des champs obligatoires découverts par plateforme et
-- par catégorie (chantier « champs obligatoires, zéro trou », 2026-07-16).
--
-- Vinted/Leboncoin/Beebs n'ont AUCUNE API taxonomy équivalente à eBay : les
-- exigences par catégorie ne peuvent être apprises QUE par observation réelle
-- (boucle de découverte réactive). Trois sources, jamais devinées :
--   'dom'        : champ requis énuméré sur le formulaire par le content script
--   'server_400' : requis INVISIBLE côté DOM, capturé en parsant le refus
--                  serveur (cas fondateur : internal_memory_capacity Vinted,
--                  échec 400 réel du 2026-07-13)
--   'manual'     : relevé humain (sessions de mapping Étape 2)
--
-- La table joue pour ces 3 plateformes le rôle d'ebay_item_aspects pour eBay :
-- l'app la lit pour afficher les requis AVANT publication (saisie manuelle si
-- aucune source auto) ; l'extension la nourrit à chaque découverte.

CREATE TABLE IF NOT EXISTS public.platform_category_aspects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      text NOT NULL
                CHECK (platform IN ('vinted','leboncoin','beebs','ebay')),
  -- Clé de catégorie NORMALISÉE, stable côté app :
  --   vinted/beebs : chemin catalogue joint par ' > ' (ex. 'Électronique > Téléphones portables')
  --   leboncoin    : id ou chemin wizard (ex. 'telephonie/telephones_mobiles')
  --   ebay         : categoryId (redondant avec ebay_item_aspects — utilisé
  --                  seulement pour les découvertes DOM non couvertes par l'API)
  category_key  text NOT NULL,
  -- Nom TECHNIQUE du champ : nom serveur si connu (internal_memory_capacity),
  -- sinon clé DOM (data-testid, id) — jamais un libellé traduit.
  field_key     text NOT NULL,
  -- Libellé HUMAIN exact affiché par la plateforme (« Espace de stockage »).
  -- C'est lui qui est montré à l'utilisateur en saisie manuelle.
  field_label   text,
  required      boolean NOT NULL DEFAULT true,
  -- 'select' | 'text' | 'grid' | 'number' | 'toggle' | null si inconnu
  input_type    text,
  -- Échantillon d'options relevées (liste fermée), tronqué à ~200 entrées.
  allowed_values jsonb,
  source        text NOT NULL
                CHECK (source IN ('dom','server_400','manual')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  seen_count    integer NOT NULL DEFAULT 1,
  UNIQUE (platform, category_key, field_key)
);

COMMENT ON TABLE public.platform_category_aspects IS
  'Champs obligatoires par plateforme/catégorie appris par observation réelle (découverte réactive des content scripts + parsing des refus serveur). Équivalent cumulatif d''ebay_item_aspects pour Vinted/LBC/Beebs.';

CREATE INDEX IF NOT EXISTS platform_category_aspects_lookup_idx
  ON public.platform_category_aspects (platform, category_key);

-- Catalogue PARTAGÉ (aucune donnée utilisateur — uniquement la structure des
-- formulaires publics des plateformes). Lecture ET écriture par authenticated :
-- les découvertes viennent de l'extension, qui ne porte que le JWT utilisateur.
ALTER TABLE public.platform_category_aspects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_category_aspects readable by authenticated"
  ON public.platform_category_aspects;
CREATE POLICY "platform_category_aspects readable by authenticated"
  ON public.platform_category_aspects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_category_aspects insert by authenticated"
  ON public.platform_category_aspects;
CREATE POLICY "platform_category_aspects insert by authenticated"
  ON public.platform_category_aspects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "platform_category_aspects update by authenticated"
  ON public.platform_category_aspects;
CREATE POLICY "platform_category_aspects update by authenticated"
  ON public.platform_category_aspects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- GRANT complet (règle CLAUDE.md pour toute nouvelle table publique). Le
-- DELETE reste néanmoins INERTE pour authenticated : aucune policy DELETE —
-- un champ appris ne s'oublie que par intervention manuelle (service_role),
-- le catalogue ne peut que grandir ou se corriger, jamais être vidé par un
-- client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_category_aspects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_category_aspects TO service_role;
