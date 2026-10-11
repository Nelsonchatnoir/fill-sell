-- INVERSE de 20261011190000_doublons_attribut_distinctif.
-- 1. La garde à l'insertion disparaît (les questions redeviennent posées comme avant).
DROP TRIGGER IF EXISTS trg_inventaire_doublons_attribut_distinctif ON public.inventaire_doublons;
DROP FUNCTION IF EXISTS public.inventaire_doublons_attribut_distinctif();
-- 2. Les paires reclassées redeviennent proposées, à l'identique (sauvegarde).
UPDATE public.inventaire_doublons d
   SET statut = b.statut, decide_par = b.decide_par, decide_le = b.decide_le, preuves = b.preuves
  FROM public._backup_1110_doublons_attribut_distinctif b
 WHERE d.id = b.id AND d.statut = 'refusee' AND d.decide_par = 'regle';
-- (les fiches « à vérifier » rangées par le reclassement ne sont pas recachées :
--  leur question redevenue proposée suffit à les reproposer.)
-- 3. Fonctions de la règle (sans effet une fois la garde retirée).
DROP FUNCTION IF EXISTS public.doublon_ecarte_par_regle(uuid, bigint, bigint);
DROP FUNCTION IF EXISTS public.doublon_attribut_distinctif(text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.doublon_nombres(text);
DROP FUNCTION IF EXISTS public.doublon_couleurs(text, text);
DROP FUNCTION IF EXISTS public.doublon_norm(text);
-- Le journal doublons_ecartes_par_regle et la sauvegarde sont GARDÉS (mesure, preuve).
