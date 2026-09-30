-- RETOUR ARRIÈRE — règle Louis partie 1 (20260930170000)
DROP TRIGGER IF EXISTS inventaire_doublons_jamais_deux_exemplaires ON public.inventaire_doublons;
DROP FUNCTION IF EXISTS public.inventaire_doublons_jamais_deux_exemplaires();
UPDATE public.inventaire_doublons SET statut = 'proposee', decide_le = NULL, decide_par = NULL
 WHERE decide_par = 'regle_louis_deux_exemplaires';
