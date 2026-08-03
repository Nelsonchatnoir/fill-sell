-- Doublons 'welcome' — bug du cron J+1 corrigé le 2026-08-03.
--
-- Cause : la dédup du cron d'email-tunnel lisait email_logs sans pagination ;
-- PostgREST plafonne à 1000 lignes, la table en avait 1488, et les lignes
-- 'welcome' de la veille (les plus récentes) tombaient dans la tranche
-- tronquée → re-envoi du welcome à tous les inscrits de la veille
-- (37 doublons du 01 au 03/08, ~180 au total depuis juin).
--
-- Cette migration fait deux choses :
--   1. supprime les doublons existants en GARDANT la ligne la plus ANCIENNE
--      par (user_id, email_type) — c'est elle qui rend vraies la dédup du
--      code et l'éligibilité du blast (« welcome antérieur au 2026-07-23 »),
--      et qui garantit qu'aucun envoi de rattrapage ne partira ;
--   2. pose un index unique PARTIEL limité aux types one-shot, nommés
--      explicitement. Liste FERMÉE volontairement : job_pending_relaunch
--      (et tout futur type récurrent, cooldown 72 h) écrit LÉGITIMEMENT
--      plusieurs lignes par compte — et comme logEmail avale les erreurs
--      d'insert, un index trop large étoufferait un type récurrent en
--      silence. Tout NOUVEAU type one-shot doit être ajouté à cette liste.
--
-- Idempotente : le DELETE ne trouve plus rien au second passage, l'index est
-- en IF NOT EXISTS.

DELETE FROM public.email_logs e
USING public.email_logs garde
WHERE e.email_type IN
        ('welcome', 'how_it_works', 'blast_relaunch_aout',
         'blast_founder', 'founder_plan', 'voice_conversion')
  AND garde.user_id = e.user_id
  AND garde.email_type = e.email_type
  AND (garde.sent_at, garde.id) < (e.sent_at, e.id);

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_one_shot_unique
  ON public.email_logs (user_id, email_type)
  WHERE email_type IN
        ('welcome', 'how_it_works', 'blast_relaunch_aout',
         'blast_founder', 'founder_plan', 'voice_conversion');
