-- ═══════════════════════════════════════════════════════════════════════════
-- CRON « fusion-photo-1min » RALLUMÉ, AVEC UN PLAFOND DUR (30/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Coupé à 19:12 (passages à 6–25 s). Le passage est refait
-- (20260930203000_photo_avant_import) : un compte, ~2,5 s de travail au plus.
-- Le plafond DUR est ici : statement_timeout 8 s posé par la commande même —
-- au-delà, le passage entier est annulé (une seule transaction, rien d'écrit
-- à moitié) et le suivant reprend.
-- Seuil de coupure (Nico) : get-pending-jobs > 2 s de moyenne ou > 4 s au
-- p90 → cron.alter_job(…, active := false) immédiatement.
-- Retour arrière : SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'fusion-photo-1min';
SELECT cron.alter_job(jobid, schedule := '* * * * *',
                      command := $$SET statement_timeout = '8s'; SELECT public.fusion_photo_tick();$$,
                      active := true)
  FROM cron.job WHERE jobname = 'fusion-photo-1min';
