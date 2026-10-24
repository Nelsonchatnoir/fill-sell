-- INVERSE de 20261025030000_releve_introuvable_a_confirmer : releve_est_veille tel qu'en prod avant (lu le 25/10 à 01:3x).
CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine')
$function$;
