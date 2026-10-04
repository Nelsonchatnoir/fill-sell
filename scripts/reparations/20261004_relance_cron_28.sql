-- 04/10 soir — relance du cron 28 releve-completer (GO de Nico), toutes les 15 min.
-- Inverse : select cron.alter_job(job_id := 28, active := false);
select cron.alter_job(job_id := 28, schedule := '7-59/15 * * * *', active := true);
select jobid, jobname, schedule, active from cron.job where jobid in (27, 28);
