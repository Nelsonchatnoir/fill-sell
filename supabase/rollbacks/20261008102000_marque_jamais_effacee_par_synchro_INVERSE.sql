-- INVERSE de 20261008102000_marque_jamais_effacee_par_synchro.sql (08/10/2026)
BEGIN;
DROP TRIGGER IF EXISTS inventaire_marque_jamais_effacee_par_synchro ON public.inventaire;
DROP FUNCTION IF EXISTS public.inventaire_marque_jamais_effacee_par_synchro();
COMMIT;
