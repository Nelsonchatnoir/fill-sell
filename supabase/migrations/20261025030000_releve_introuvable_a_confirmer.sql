-- (25/10, point 1b de Nico) « FillSell attend le prochain relevé » : handler-watch DEMANDE désormais le
-- relevé qu'attend une pause « introuvable à confirmer » (déclencheur serveur:introuvable_a_confirmer ;
-- au plus un toutes les 6 h par compte et plateforme, poste en ligne). Il entre dans la
-- veille — sinon garde_releve_sans_geste l'avale EN SILENCE (RETURN NULL, aucune erreur).
-- Réécrit depuis pg_get_functiondef('public.releve_est_veille(text)') lu en prod le 25/10 (00:40) :
-- seule la dernière valeur est ajoutée. Inverse : la même fonction sans 'serveur:introuvable_a_confirmer'.
CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine',
    'serveur:introuvable_a_confirmer')
$function$;
