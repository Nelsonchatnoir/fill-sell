-- ═══════════════════════════════════════════════════════════════════════════
-- inventaire.attributs — UN endroit par article pour taille, état, marque,
-- couleur(s), matière, genre, catégorie Vinted, attributs lus, ISBN — avec
-- SOURCE et DATE par champ (arbitrage Nico, 06/09/2026 soir : schéma validé,
-- « pose-le »).
--
-- Forme : une clé par champ, chaque champ = { v, source, at }
--   "taille":   { "v": "L",        "source": "vinted_liste",  "at": "2026-09-06T…" }
--   "etat":     { "v": "Bon état", "source": "vinted_liste",  "at": "…" }
--   "marque":   { "v": "adidas",   "source": "vinted_liste",  "at": "…" }
--   "couleur":  { "v": "Rouge",    "source": "vinted_detail", "at": "…" }
--   "couleur2": { "v": null,       "source": "vinted_detail", "at": "…" }
--   "matiere":  { "v": "Coton",    "source": "lens",          "at": "…" }
--   "genre":    { "v": "Homme",    "source": "lens",          "at": "…" }
--   "categorie_vinted": { "v": 1806, "chemin": [...], "source": "vinted_detail", "at": "…" }
--   "attributs_visibles": { "v": { … }, "source": "lens", "at": "…" }
--   "isbn":     { "v": "978…",     "source": "lens",          "at": "…" }
-- Sources FERMÉES : vinted_liste | vinted_detail | capture | lens | manuel.
-- Priorité à l'écriture : manuel > vinted_detail > capture > vinted_liste
-- > lens — une source plus faible n'écrase jamais une plus forte, mais
-- remplit un champ vide. Valeurs = libellés en clair, jamais un id seul.
--
-- Écrivains : extension (sync liste, retour FETCH_VINTED_ITEM, captures),
-- ListingPreviewScreen (Lens / analyse photo / saisie) — tous en
-- `authenticated`, la policy « update own » existante suffit ; le worker
-- eBay lit en service_role. Lecteurs : stepper (canonical_fields),
-- generate-listing, worker eBay (assemblerAspects), handlers extension
-- (via platform_fields du job).
--
-- Fonction inventaire_attributs_fusion(existants, nouveaux) : pose la règle
-- de priorité UNE fois, côté base, pour tous les écrivains (l'extension
-- n'a pas à relire la ligne avant d'écrire : UPDATE … SET attributs =
-- inventaire_attributs_fusion(attributs, $1)).
--
-- APPLIQUÉE en prod le 06/09/2026 (feu vert nominal de Nico), via db query --linked -f.
-- Vérification après application :
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_name = 'inventaire' AND column_name = 'attributs';
--   SELECT inventaire_attributs_fusion('{"taille":{"v":"M","source":"lens","at":"2026-09-01"}}',
--                                      '{"taille":{"v":"L","source":"vinted_liste","at":"2026-09-06"}}');  -- → L (liste > lens)
--   SELECT inventaire_attributs_fusion('{"taille":{"v":"L","source":"manuel","at":"2026-09-01"}}',
--                                      '{"taille":{"v":"M","source":"vinted_liste","at":"2026-09-06"}}');  -- → L (manuel gagne)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS attributs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.inventaire.attributs IS
  'Attributs de l''article, une clé par champ = {v, source, at}. Sources : vinted_liste | vinted_detail | capture | lens | manuel. Priorité manuel > vinted_detail > capture > vinted_liste > lens. Cf. migration 20260907000000.';

CREATE OR REPLACE FUNCTION public.inventaire_attributs_rang(p_source text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_source
    WHEN 'manuel'        THEN 5
    WHEN 'vinted_detail' THEN 4
    WHEN 'capture'       THEN 3
    WHEN 'vinted_liste'  THEN 2
    WHEN 'lens'          THEN 1
    ELSE 0 END;
$$;

-- Fusion champ par champ : le nouveau ne remplace l'existant que si sa
-- source est de rang supérieur OU ÉGAL (même source = rafraîchissement) ;
-- un champ absent est toujours posé ; une valeur nulle ne remplace jamais
-- une valeur non nulle.
CREATE OR REPLACE FUNCTION public.inventaire_attributs_fusion(p_existants jsonb, p_nouveaux jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out jsonb := COALESCE(p_existants, '{}'::jsonb);
  v_cle text;
  v_nouveau jsonb;
  v_ancien jsonb;
BEGIN
  IF p_nouveaux IS NULL OR jsonb_typeof(p_nouveaux) <> 'object' THEN RETURN v_out; END IF;
  FOR v_cle, v_nouveau IN SELECT key, value FROM jsonb_each(p_nouveaux) LOOP
    IF jsonb_typeof(v_nouveau) <> 'object' THEN CONTINUE; END IF;
    IF v_nouveau->'v' IS NULL OR jsonb_typeof(v_nouveau->'v') = 'null' THEN CONTINUE; END IF;
    v_ancien := v_out->v_cle;
    IF v_ancien IS NULL OR jsonb_typeof(v_ancien) <> 'object'
       OR v_ancien->'v' IS NULL OR jsonb_typeof(v_ancien->'v') = 'null'
       OR public.inventaire_attributs_rang(v_nouveau->>'source') >= public.inventaire_attributs_rang(v_ancien->>'source')
    THEN
      v_out := jsonb_set(v_out, ARRAY[v_cle], v_nouveau, true);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventaire_attributs_rang(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventaire_attributs_fusion(jsonb, jsonb) TO authenticated, service_role;

-- Trigger : la règle de priorité s'applique QUELLE QUE SOIT la voie
-- d'écriture (upsert PostgREST de la sync, PATCH de l'extension, update du
-- stepper) — l'écrivain envoie ses champs {v, source, at}, la base fusionne
-- avec l'existant. À l'INSERT il n'y a rien à fusionner.
CREATE OR REPLACE FUNCTION public.inventaire_attributs_avant_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.attributs IS DISTINCT FROM OLD.attributs THEN
    NEW.attributs := public.inventaire_attributs_fusion(OLD.attributs, NEW.attributs);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventaire_attributs_fusion_trg ON public.inventaire;
CREATE TRIGGER inventaire_attributs_fusion_trg
  BEFORE UPDATE OF attributs ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_attributs_avant_update();
