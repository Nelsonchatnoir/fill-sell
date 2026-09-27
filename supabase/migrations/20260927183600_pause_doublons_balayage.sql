-- PAUSE du cron doublons-balayage-2min (jobid 17) — GO Nico, 27/09 18:35.
-- Désactivation, PAS suppression : la commande, l'horaire et le jobid restent.
-- Motif : rapprochement_photos_decider tombe en statement timeout à chaque
-- appel depuis le 26/09 au soir (suspect n° 1 de la panne du 27/09 15:34-16:12).
-- Réactivation : cron.alter_job(..., active := true) quand la fonction tient.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'doublons-balayage-2min'), active := false);
