-- (06/11, ordre de Nico, point 5) Nicolas THOBOIS (compte 46b1f110, compte 46b1f110) a écrit « STOP » à support@ le
-- 24/10 à 19:29 (mail sorti du spam le 06/11). Désinscription de TOUS les envois marketing, mot pour mot les écritures de
-- desinscrire() (_shared/desinscription.ts) : registre canonique email_destinataires (desinscrit, desinscrit_le, origine)
-- + trace d'audit email_logs « marketing_optout » (lue par le tunnel et les blasts). estDesinscrit() lit les deux. Le
-- support (catégorie 'support') n'est jamais filtré : il reste joignable s'il écrit. Origine nommée (pas « lien_email »).
-- Inverse : 20261106_thobois_desinscription_INVERSE.sql (le geste de réinscription de desinscrire(reinscrire)).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_thobois AS
SELECT now() AS le, d.email, d.desinscrit, d.desinscrit_le, d.reinscrit_le, d.origine FROM public.email_destinataires d
 WHERE d.email = 'nicolas.thobois@live.fr';
ALTER TABLE public._backup_0611_thobois ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_thobois FROM PUBLIC, anon, authenticated;
UPDATE public.email_destinataires
   SET desinscrit = true, desinscrit_le = now(), origine = 'mail_stop_support_2410 (ordre de Nico du 06/11)'
 WHERE email = 'nicolas.thobois@live.fr';
INSERT INTO public.email_logs (user_id, email_type, email)
VALUES ('46b1f110-d05e-40a4-a147-9a0dc7eee866', 'marketing_optout', 'nicolas.thobois@live.fr');
SELECT d.email, d.desinscrit, d.desinscrit_le, d.origine,
       (SELECT count(*) FROM public.email_logs l WHERE l.user_id = '46b1f110-d05e-40a4-a147-9a0dc7eee866' AND l.email_type = 'marketing_optout') AS optout
  FROM public.email_destinataires d WHERE d.email = 'nicolas.thobois@live.fr';
COMMIT;
