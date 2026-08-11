-- ✅ APPLIQUÉE EN PROD le 2026-08-11 (feu vert de Nico la nommant).
-- Trigger vérifié présent et actif (tgenabled='O'), et son comportement PROUVÉ
-- sur une ligne jetable (category_key='__test_trigger__', supprimée depuis) :
--   · upsert dom {required:false} sur une ligne server_400 → ressort
--     required=true / source=server_400 (dégradation neutralisée), et les
--     options fraîches du DOM sont bien acceptées au passage ;
--   · upsert server_400 {allowed_values:null} → les 4 options sont CONSERVÉES ;
--   · upsert dom {required:true} sur une ligne dom {required:false} → PASSE
--     (la promotion par le DOM reste possible, seule la dégradation est bloquée).
--
-- Un refus SERVEUR ne doit pas pouvoir être dégradé par une relecture du DOM.
--
-- LE PROBLÈME (relevé 2026-08-11) : platform_category_aspects n'apprend en
-- pratique que du DOM. Sur 409 lignes, 360 sont source='dom', 45 'manual', et
-- seulement 4 'server_400' — et ces 4-là portent `photos`, `title`,
-- `internal_memory_capacity`, c'est-à-dire précisément les clés que la passe
-- DOM n'énumère PAS. Tous les autres refus serveur ont été perdus :
--   vinted · Femmes > Vêtements > Robes > Midi     · brand  (29/07)
--   vinted · Femmes > Vêtements > Robes > Midi     · color  (30/07)
--   vinted · Enfants > Jeux et jouets > Peluches   · color  (10/08)
-- Quand Vinted affiche le champ SANS astérisque mais le refuse côté serveur, on
-- ne l'apprend jamais et l'utilisateur revient au même mur indéfiniment.
--
-- Le correctif côté extension (précédence server_400 > manual > dom dans
-- persistDiscoveredAspects) règle la collision À L'INTÉRIEUR d'un même envoi.
-- Il ne suffit PAS : au job suivant sur la même catégorie, la passe DOM repose
-- `required=false, source=dom` et l'upsert merge-duplicates ÉCRASE la
-- promotion. Sans le garde-fou ci-dessous, un refus serveur ne tient pas.
--
-- Idempotente (CREATE OR REPLACE + DROP IF EXISTS avant CREATE TRIGGER).

CREATE OR REPLACE FUNCTION public.platform_category_aspects_garde_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  poids CONSTANT jsonb := '{"server_400":3,"manual":2,"dom":1}'::jsonb;
  p_old integer := COALESCE((poids ->> COALESCE(OLD.source, 'dom'))::int, 1);
  p_new integer := COALESCE((poids ->> COALESCE(NEW.source, 'dom'))::int, 1);
BEGIN
  -- Dégradation refusée : une source plus FAIBLE ne peut pas repasser un champ
  -- de required=true à required=false. Le sens inverse (dom qui PROMEUT) reste
  -- autorisé — un astérisque nouvellement affiché est une information valide.
  IF OLD.required AND NOT NEW.required AND p_new < p_old THEN
    NEW.required := OLD.required;
    NEW.source   := OLD.source;
  END IF;

  -- Un refus 400 ne nomme QUE le champ : il n'apporte aucune valeur autorisée.
  -- Sans cette ligne, il effacerait les options relevées au DOM et l'app
  -- retomberait en saisie de texte libre là où elle offrait un vrai sélecteur.
  IF NEW.allowed_values IS NULL AND OLD.allowed_values IS NOT NULL THEN
    NEW.allowed_values := OLD.allowed_values;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_category_aspects_garde_source
  ON public.platform_category_aspects;

CREATE TRIGGER platform_category_aspects_garde_source
  BEFORE UPDATE ON public.platform_category_aspects
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_category_aspects_garde_source();
