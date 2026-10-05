-- 04/10 soir — relance du cron 27 ebay-releve-api (GO de Nico), à 10 min.
-- Inverse : select cron.alter_job(job_id := 27, active := false);
select cron.alter_job(job_id := 27, schedule := '*/10 * * * *', active := true);
select jobid, jobname, schedule, active from cron.job where jobid in (27, 28);
