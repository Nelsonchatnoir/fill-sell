-- INVERSE de 20261105010000_releve_controle_blocage_lbc : releve_est_veille() remise à sa définition de prod du 05/11
-- (pg_get_functiondef, md5 7e2c89d3cdc246613703c6b066c5350b) — la visite de contrôle Leboncoin redevient refusée par
-- garde_releve_sans_geste. Rien d'autre à défaire : la migration n'écrit aucune ligne.
BEGIN;

CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine',
    'serveur:introuvable_a_confirmer')
$function$;

COMMIT;
