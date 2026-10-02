-- INVERSE de 20261002_sortie_opla_reportee_au_10_10.sql — à ne jouer que sur
-- décision de Nico. Remet les 30 jobs dans l'état de la sauvegarde (clos par la
-- sortie), recoupe la republication planifiée Opla et retire l'interrupteur
-- (la date par défaut du code, le 10/10, s'applique alors).
BEGIN;

UPDATE cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM _backup_0210_opla_sortie_restauration b
 WHERE b.id = j.id;

UPDATE coin_config SET value = 0 WHERE key = 'republish_planifiee_pf_opla' AND value = 1;
DELETE FROM coin_config WHERE key = 'opla_sortie_le';

SELECT count(*) FROM cross_post_jobs j JOIN _backup_0210_opla_sortie_restauration b ON b.id = j.id
 WHERE j.status = b.status;

COMMIT;
