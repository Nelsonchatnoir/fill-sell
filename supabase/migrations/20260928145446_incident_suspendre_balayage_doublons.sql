-- Contention : garde-fou de la mission Nico, arrêt du travail de fond en erreur.
-- Idempotent. Un seul cron ; aucune fiche, vente ni annonce modifiée.
SET statement_timeout='2s';
SET lock_timeout='500ms';
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='doublons-balayage-2min' LIMIT 1), active:=false);
