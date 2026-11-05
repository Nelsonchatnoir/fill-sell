-- INVERSE de la règle « une annonce publiée confirmée disparue est close » (handler-watch, _shared/annonce-publiee-disparue.js,
-- 05/11, garde-fou de Nico : la clôture doit pouvoir s'annuler). Chaque job clos par cette règle garde son état d'avant dans
-- platform_fields.annonce_disparue.avant { status, error } : il le retrouve tel quel, la marque est retirée. Seules les deux
-- marques de CETTE règle (POSES_PAR_DISPARUE) — jamais une clôture d'une autre règle (introuvable-a-confirmer, retraits…).
-- Bornes : :depuis (ISO) — les clôtures posées depuis cet instant ; par défaut toutes.
--   npx supabase db query --linked -f scripts/reparations/20261105_regle_annonces_publiees_disparues_INVERSE.sql
-- (remplacer le littéral '2026-11-05' ci-dessous pour borner).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_annonces_disparues_inverse AS
  SELECT now() AS le, to_jsonb(j.*) AS ligne FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_annonces_disparues_inverse ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_annonces_disparues_inverse FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_annonces_disparues_inverse
  SELECT now(), to_jsonb(j.*) FROM public.cross_post_jobs j
   WHERE j.status = 'cancelled'
     AND j.platform_fields->'annonce_disparue'->>'pose_par' IN ('handler-watch (annonce publiée confirmée disparue)', 'handler-watch (republication en pause confirmée disparue)')
     AND (j.platform_fields->'annonce_disparue'->>'at')::timestamptz >= '2026-11-05'::timestamptz;
UPDATE public.cross_post_jobs j
   SET status = COALESCE(j.platform_fields->'annonce_disparue'->'avant'->>'status', 'published'),
       error = j.platform_fields->'annonce_disparue'->'avant'->>'error',
       platform_fields = j.platform_fields - 'annonce_disparue'
 WHERE j.status = 'cancelled'
   AND j.platform_fields->'annonce_disparue'->>'pose_par' IN ('handler-watch (annonce publiée confirmée disparue)', 'handler-watch (republication en pause confirmée disparue)')
   AND (j.platform_fields->'annonce_disparue'->>'at')::timestamptz >= '2026-11-05'::timestamptz;
SELECT count(*) AS rendus FROM public._backup_annonces_disparues_inverse WHERE le > now() - interval '1 minute';
COMMIT;
