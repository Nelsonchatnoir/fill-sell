-- RÉACTIVATION du cron doublons-balayage-2min (jobid 17) — consigne de Nico
-- (27/09 : « réactive le cron seulement quand la fonction est corrigée »).
-- Préalables faits : migration 20260927190000 appliquée (chaque appel sous les
-- 8 s de l'appelant, progression enregistrée fiche par fiche), fonction edge
-- doublons-balayage v2 déployée (verify_jwt false relu avant/après).
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'doublons-balayage-2min'), active := true);
