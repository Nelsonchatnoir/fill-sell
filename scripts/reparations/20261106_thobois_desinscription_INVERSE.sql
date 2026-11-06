-- INVERSE de 20261106_thobois_desinscription.sql : comme desinscrire({ reinscrire: true }) — registre remis, trace retirée.
BEGIN;
UPDATE public.email_destinataires d SET desinscrit = b.desinscrit, desinscrit_le = b.desinscrit_le, origine = b.origine, reinscrit_le = now()
  FROM public._backup_0611_thobois b WHERE d.email = b.email;
DELETE FROM public.email_logs WHERE user_id = '46b1f110-d05e-40a4-a147-9a0dc7eee866' AND email_type = 'marketing_optout';
COMMIT;
