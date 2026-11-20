-- INVERSE de 20261120_thecloset_question_references_differentes.sql : la question 2a7958c3 reprend son état sauvegardé.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.inventaire_doublons d
   SET statut = b.statut, decide_par = b.decide_par, decide_le = b.decide_le, preuves = b.preuves
  FROM public._backup_2011_question_2a7958c3 b
 WHERE d.id = b.id AND d.decide_par = 'regle';
SELECT id, statut, decide_par FROM public.inventaire_doublons WHERE id = '2a7958c3-b7e1-4485-a284-945675f3b792';
COMMIT;
