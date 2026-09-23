-- ═══════════════════════════════════════════════════════════════════════════
-- republish_ts_safe — lecture SÛRE d'un horodatage dans platform_fields
-- (2026-09-24, chantier « le créneau va au bout »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le sweep planifié doit distinguer un job EN VOL (qui occupe le seul Chrome
-- en ce moment) d'un job PARQUÉ pour une reprise future (anti-robot 45 min,
-- session 60 min) : le second n'a rien supprimé et n'occupe rien, il attend.
-- Cette lecture se fait sur `platform_fields->>'next_action_after'`. Un cast
-- direct `::timestamptz` casserait le sweep ENTIER si une seule ligne portait
-- une valeur malformée. Cette fonction rend NULL au lieu de lever — c'est un
-- garde-fou de robustesse, pas une décision métier.
--
-- Fonction NEUVE : rien à recopier de la prod. Elle est appelée par le sweep
-- (SECURITY DEFINER, propriétaire postgres) ; aucun GRANT supplémentaire.
CREATE OR REPLACE FUNCTION public.republish_ts_safe(p_pf jsonb, p_key text)
  RETURNS timestamptz
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (p_pf ->> p_key)::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;
