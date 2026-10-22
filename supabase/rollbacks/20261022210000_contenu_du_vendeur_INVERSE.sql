-- INVERSE de 20261022210000_contenu_du_vendeur : releve_est_veille reprend son corps lu en prod le 22/10 ; fonctions et
-- table retirées (les demandes de lecture d'origine sont des traces de session, sans autre usage).
BEGIN;
CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api')
$function$;
drop function if exists public.lecture_origine_faite(bigint);
drop function if exists public.lectures_origine_en_attente();
drop function if exists public.demander_lecture_origine(bigint);
drop function if exists public.jobs_contenu_origine(uuid, uuid[]);
drop function if exists public.fiches_contenu_vendeur(uuid, bigint[]);
drop table if exists public.lectures_origine_demandees;
COMMIT;
