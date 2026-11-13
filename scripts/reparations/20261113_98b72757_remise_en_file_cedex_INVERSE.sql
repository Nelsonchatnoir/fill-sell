-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261113_98b72757_remise_en_file_cedex.sql — les publications remises en file retournent en needs_user
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- SEULEMENT les tâches encore dans l'état laissé par la réparation (pending, remise_en_file posée par elle) : une tâche
-- reprise depuis par un poste (processing, published, à nouveau needs_user…) n'est jamais touchée (listée en fin).
-- Statut, erreur et platform_fields d'avant reviennent de la sauvegarde. La sauvegarde reste en place (preuve) ; à
-- supprimer à la main une fois l'inverse validé.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261113_98b72757_remise_en_file_cedex_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1311_98b72757_remise_en_file') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas été jouée, rien à rendre';
  END IF;
END
$garde$;

CREATE TEMP TABLE _a_rendre ON COMMIT DROP AS
  SELECT b.id
    FROM public._backup_1311_98b72757_remise_en_file b JOIN public.cross_post_jobs j ON j.id = b.id
   WHERE j.status = 'pending'
     AND j.platform_fields -> 'remise_en_file' ->> 'par' = 'réparation 20261113 N6b';

UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1311_98b72757_remise_en_file b
 WHERE j.id = b.id AND j.id IN (SELECT id FROM _a_rendre) AND j.status = 'pending';

SELECT (SELECT count(*) FROM _a_rendre) AS taches_rendues,
       (SELECT count(*) FROM public._backup_1311_98b72757_remise_en_file) AS taches_remises_en_file,
       (SELECT string_agg(left(b.id::text, 8) || ' (' || j.status || ')', ', ')
          FROM public._backup_1311_98b72757_remise_en_file b JOIN public.cross_post_jobs j ON j.id = b.id
         WHERE b.id NOT IN (SELECT id FROM _a_rendre)) AS reprises_depuis_non_rendues;
COMMIT;
