-- INVERSE du rattrapage « sortie d'Opla » (scripts/reparations/20261011_opla_sortie_rattrapage.sql).
-- Remet jobs, relevés et questions tels que sauvegardés (_backup_1110_opla_*).
-- ⚠️ Tant que la migration 20261011130000 est en place, un job Opla remis en
--    attente est aussitôt reclos par garde_opla_sortie_jobs : rejouer d'abord
--    scripts/reparations/20261011_inverse_opla_sortie_plus_aucune_action.sql.
--   npx supabase db query --linked -f scripts/reparations/20261011_opla_sortie_rattrapage_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_1110_opla_jobs ORDER BY id, sauve_le) b
 WHERE j.id = b.id AND j.status = 'cancelled' AND j.platform_fields ? 'opla_sortie';
UPDATE public.vinted_sync_runs r
   SET status = b.status, finished_at = b.finished_at, erreur = b.erreur
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_1110_opla_releves ORDER BY id, sauve_le) b
 WHERE r.id = b.id;
UPDATE public.inventaire_doublons d
   SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, preuves = b.preuves
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_1110_opla_questions ORDER BY id, sauve_le) b
 WHERE d.id = b.id AND d.statut = 'caduque';
COMMIT;
