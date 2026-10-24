-- INVERSE de 20261024_question_boutique_autre_compte.sql : la question f6904c8e (compte 0a24c951) retrouve l'état
-- d'avant (statut, decide_le, decide_par), lu dans _backup_2410_question_boutique_autre_compte. Rien d'autre.
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.inventaire_doublons q
   SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par
  FROM public._backup_2410_question_boutique_autre_compte b
 WHERE q.id = b.id AND q.id = 'f6904c8e-e006-4e43-a4eb-3d98057ada39'
   AND q.statut = 'caduque' AND q.decide_par = 'rapprochement_v3';
COMMIT;
