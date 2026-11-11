-- INVERSE de 20261111180000_retrait_apres_publication (11/11/2026, L1 — chemins résiduels, relecture) : la migration n'a
-- fait qu'AJOUTER deux déclencheurs et deux fonctions sur cross_post_jobs — l'inverse les retire, et rien d'autre. Aucune
-- fonction existante n'avait été réécrite. Ce qui reste, volontairement : les marques déjà posées (annulee_par_suppression,
-- retrait_apres_publication*, des clés de platform_fields que plus rien n'écrit) et les retraits déjà armés (des retraits
-- ordinaires : ils s'exécutent ou s'annulent comme les autres). Après l'inverse, le filet A d'update-job-status ne retire
-- plus rien (la marque du choix n'est plus posée) et un lien tardif n'arme plus de retrait.
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS zzz_retrait_apres_publication_lien ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS zzz_annulee_par_suppression ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.cross_post_jobs_retrait_apres_publication_lien();
DROP FUNCTION IF EXISTS public.cross_post_jobs_annulee_par_suppression();
RESET lock_timeout;
