-- Sortie d'Opla REPORTÉE AU 10/10 (consigne de Nico, 02/10 ~13:30 : « À partir
-- du 10 la sortie Opla. Il faut un interrupteur qui déclenche le 10 »).
--
-- La sortie a été mise en service trop tôt, le 02/10 à 10:51Z (handler-watch
-- v68 / get-pending-jobs v187) : 30 publications/republications Opla en attente
-- ont été closes ('cancelled', marqueur opla_sortie) et la republication
-- planifiée Opla coupée. Les fonctions sont désormais gardées par
-- l'interrupteur (handler-watch v69, get-pending-jobs v188) ; ce script :
--   1. pose l'interrupteur : coin_config `opla_sortie_le` = 1791583200
--      (2026-10-10T00:00:00+02:00) ; 0 = sortie désactivée ;
--   2. rouvre la republication planifiée Opla (republish_planifiee_pf_opla
--      0 → 1) — handler-watch la recoupera seul à la bascule ;
--   3. rend aux 30 jobs leur état d'avant la clôture (statut, motif, message),
--      tel que la clôture l'a noté dans platform_fields.opla_sortie et
--      erreurs_archivees ; la clôture reste tracée (opla_sortie_annulee).
-- Aucune annonce n'a été touchée ni avant ni ici (rien n'a été envoyé à Opla).
-- Sauvegarde : _backup_0210_opla_sortie_restauration (avant modification).
-- Inverse : 20261002_sortie_opla_reportee_au_10_10_INVERSE.sql

BEGIN;

INSERT INTO coin_config (key, value) VALUES ('opla_sortie_le', 1791583200)
ON CONFLICT (key) DO NOTHING;

UPDATE coin_config SET value = 1
 WHERE key = 'republish_planifiee_pf_opla' AND value = 0;

CREATE TABLE IF NOT EXISTS _backup_0210_opla_sortie_restauration AS
SELECT id, status, error, platform_fields, now() AS sauvegarde_le
  FROM cross_post_jobs
 WHERE platform = 'opla' AND status = 'cancelled'
   AND platform_fields ? 'opla_sortie'
   AND (platform_fields->'opla_sortie'->>'le') < '2026-10-02T12:00:00Z';

UPDATE cross_post_jobs j
   SET status = j.platform_fields->'opla_sortie'->>'statut_avant',
       error  = j.platform_fields->'erreurs_archivees'->-1->>'erreur',
       platform_fields =
         ((CASE WHEN j.platform_fields->'erreurs_archivees'->-1->>'par' LIKE '%(sortie d''Opla)'
                THEN jsonb_set(j.platform_fields, '{erreurs_archivees}', (j.platform_fields->'erreurs_archivees') - (-1))
                ELSE j.platform_fields END) - 'opla_sortie')
         || CASE WHEN j.platform_fields->'opla_sortie'->>'source_avant' IS NOT NULL
                 THEN jsonb_build_object('needs_user_source', j.platform_fields->'opla_sortie'->>'source_avant')
                 ELSE '{}'::jsonb END
         || jsonb_build_object('opla_sortie_annulee', jsonb_build_object(
              'le', now(),
              'raison', 'sortie d''Opla reportée au 10/10 (consigne de Nico, 02/10)',
              'cloture', j.platform_fields->'opla_sortie'))
  FROM _backup_0210_opla_sortie_restauration b
 WHERE b.id = j.id AND j.status = 'cancelled' AND j.platform_fields ? 'opla_sortie';

SELECT j.action, j.status, j.platform_fields->>'needs_user_source' AS source, count(*)
  FROM cross_post_jobs j JOIN _backup_0210_opla_sortie_restauration b ON b.id = j.id
 GROUP BY 1, 2, 3 ORDER BY 4 DESC;

COMMIT;
