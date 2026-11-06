-- INVERSE de 20261106_doudou_question_beebs_oui.sql : la question reprend statut, décision et preuves d'avant.
BEGIN;
UPDATE public.inventaire_doublons d SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, preuves = b.preuves
  FROM public._backup_0611_doudou_question b WHERE d.id = b.id;
COMMIT;
