-- INVERSE des deux relances à la main du 11/11 (compte 64eab2f9) — témoin 20261111_relances_manuelles_64eab2f9.sql.
-- Ce qu'il rendrait : sur une tâche ENCORE dans l'état laissé par une relance (pas publiée depuis, aucun essai depuis),
-- les clés que la relance avait retirées, depuis ses propres traces :
--   relance 2 → recreation_tentee = tentee_avant, recreation_envois = envois_avant, recreation_bloquee = bloquee_avant ;
--   relance 1 seule → recreation_bloquee = relance_manuelle.avant ;
-- et le statut needs_user que handler-watch avait posé. ⛔ Une tâche publiée, ou réessayée depuis la relance (son
-- recreation_tentee est plus récent que la relance), n'est JAMAIS touchée : défaire une relance qui a abouti remettrait
-- en attente une annonce en ligne. Lu le 11/11 vers 23:05 : les 6 sont publiées → cet inverse n'écrit RIEN, il le dit.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1111_relances_64eab2f9') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : le témoin n''a pas été passé, rien à défaire';
  END IF;
END
$garde$;

WITH cibles AS (
  SELECT j.id, j.platform_fields AS pf
    FROM public.cross_post_jobs j
    JOIN public._backup_1111_relances_64eab2f9 b ON b.id = j.id
   WHERE j.status = 'pending'
     AND NOT (j.platform_fields ? 'recreation_bloquee')
     AND (
       (j.platform_fields ? 'relance_manuelle_2' AND NOT (j.platform_fields ? 'recreation_tentee'))
       OR (NOT (j.platform_fields ? 'relance_manuelle_2')
           AND coalesce((j.platform_fields->'recreation_tentee'->>'at')::timestamptz, '-infinity')
               < (j.platform_fields->'relance_manuelle'->>'le')::timestamptz)
     )
)
UPDATE public.cross_post_jobs j
   SET status = 'needs_user',
       platform_fields = CASE
         WHEN c.pf ? 'relance_manuelle_2' THEN c.pf
           || jsonb_build_object('recreation_tentee', c.pf->'relance_manuelle_2'->'tentee_avant',
                                 'recreation_envois', c.pf->'relance_manuelle_2'->'envois_avant',
                                 'recreation_bloquee', c.pf->'relance_manuelle_2'->'bloquee_avant')
         ELSE c.pf || jsonb_build_object('recreation_bloquee', c.pf->'relance_manuelle'->'avant')
       END
  FROM cibles c
 WHERE j.id = c.id;

COMMIT;

SELECT left(j.id::text, 8) AS tache, j.status, j.platform_fields ? 'recreation_bloquee' AS bloquee
  FROM public.cross_post_jobs j JOIN public._backup_1111_relances_64eab2f9 b ON b.id = j.id ORDER BY 1;
