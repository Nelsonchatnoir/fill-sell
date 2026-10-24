-- ═══════════════════════════════════════════════════════════════════════════
-- (24/10, lot « zéro blocage », A7) LE CATALOGUE VINTED PARTAGÉ NE S'ÉCRIT JAMAIS DANS UNE AUTRE LANGUE
-- ═══════════════════════════════════════════════════════════════════════════
-- `platform_category_aspects` n'a pas de colonne pays : l'extension relève les champs du formulaire de dépôt et
-- les écrit TELS QU'AFFICHÉS, sous la clé française du rayon. Le 24/10 (09:45 → 15:05), la page de mele.marta
-- (compte italien sur vinted.fr, page servie en italien — profiles.extension_sessions : langue « it-fr ») a réécrit
-- pour TOUS les comptes 8 lignes (« Condizioni », « Taglia », « Materiale (consigliato) », « Piattaforma »…) ;
-- l'écran Publier de chaque compte français comparait alors l'état de sa fiche à la liste italienne → champ demandé,
-- bloquant. Lignes remises en français à 15:10 (scripts/reparations/20261024_catalogue_vinted_italien.sql) ; l'app
-- lit désormais une liste d'états étrangère par identifiant (utils/catalogueListes.etatsVintedEnFrancais) ; le
-- correctif de l'extension (page non française → rien d'écrit) ne touche que les postes mis à jour.
-- LA RÈGLE, EN BASE (toutes versions d'extension) : quand l'auteur de l'écriture (auth.uid()) travaille sur une page
-- Vinted dont la langue n'est pas le français (profiles.extension_sessions, `langue` relevée par la sonde du compte
-- Vinted, ex. « it-fr », « en-fr »), la ligne Vinted garde son libellé, sa liste et son type :
--   · UPDATE : field_label, allowed_values et input_type restent ceux d'avant (l'exigence `required`, les dates et le
--     compteur d'observations suivent, comme avant) ;
--   · INSERT : la ligne n'est pas créée (un compte français la créera dans sa langue).
-- Aucun effet sur les écritures du service (scripts, fonctions : auth.uid() nul), ni sur les autres plateformes, ni
-- sur un compte dont la langue n'est pas relevée (rien n'est deviné).
-- Inverse : supabase/rollbacks/20261024220000_catalogue_vinted_langue_de_la_page_INVERSE.sql

CREATE OR REPLACE FUNCTION public.aspects_vinted_langue_de_la_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_etrangere boolean := false;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'vinted' OR v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p,
           LATERAL jsonb_path_query(COALESCE(p.extension_sessions, '{}'::jsonb), '$.**.langue') AS l(v)
     WHERE p.id = v_uid
       AND jsonb_typeof(l.v) = 'string'
       AND lower(l.v #>> '{}') !~ '^fr'
  ) INTO v_etrangere;
  IF NOT v_etrangere THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NULL;
  END IF;
  NEW.field_label := OLD.field_label;
  NEW.allowed_values := OLD.allowed_values;
  NEW.input_type := OLD.input_type;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.aspects_vinted_langue_de_la_page() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aspects_vinted_langue_de_la_page ON public.platform_category_aspects;
CREATE TRIGGER aspects_vinted_langue_de_la_page
  BEFORE INSERT OR UPDATE ON public.platform_category_aspects
  FOR EACH ROW EXECUTE FUNCTION public.aspects_vinted_langue_de_la_page();
