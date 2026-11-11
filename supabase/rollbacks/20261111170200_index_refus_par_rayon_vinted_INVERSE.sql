-- INVERSE de 20261111170200_index_refus_par_rayon_vinted (11/11/2026, P1 3/3) : la migration n'a fait qu'AJOUTER un
-- index partiel ; l'inverse le retire, et rien d'autre (aucune donnée, aucun code). Après l'inverse, les champs exigés
-- par rayon se relisent par un Seq Scan de toute la table : le balayage revient.
-- Sert aussi d'ABANDON PROPRE si l'index est resté INVALID après un échec de construction (pg_index.indisvalid = false).
-- CONCURRENTLY : ni lecture ni écriture bloquée ; UNE instruction, sans transaction. `db query --linked --yes -f`, seul.
DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_refus_par_rayon_idx;
