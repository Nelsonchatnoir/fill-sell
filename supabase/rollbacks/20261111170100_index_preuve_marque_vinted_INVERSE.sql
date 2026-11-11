-- INVERSE de 20261111170100_index_preuve_marque_vinted (11/11/2026, P1 2/3) : la migration n'a fait qu'AJOUTER un index
-- partiel ; l'inverse le retire, et rien d'autre (aucune donnée, aucun code). Après l'inverse, la preuve marque du parc
-- reprend le chemin d'avant (cross_post_jobs_created, toute la fenêtre de 30 jours) : le balayage revient.
-- Sert aussi d'ABANDON PROPRE si l'index est resté INVALID après un échec de construction (pg_index.indisvalid = false).
-- CONCURRENTLY : ni lecture ni écriture bloquée ; UNE instruction, sans transaction. `db query --linked --yes -f`, seul.
DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_preuve_marque_idx;
