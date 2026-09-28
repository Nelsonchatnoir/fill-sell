-- Réactivation seulement après correction et mesure des deux RPC lourdes.
SET statement_timeout='2s';
SET lock_timeout='500ms';
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='doublons-balayage-2min' LIMIT 1), active:=true);
