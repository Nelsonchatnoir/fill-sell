-- INVERSE de supabase/migrations/20261018190000_surveillance_releves.sql :
--   · public.surveillance_releves() disparaît (l'app la lit en best-effort : sans
--     elle, la ligne « n'est plus surveillée » ne s'affiche simplement pas) ;
--   · l'index sync_import_ecartes_user_date disparaît ;
--   · releves_morts_veille reprend le corps de PROD d'avant, tel quel
--     (md5 6db6781d3d214a04e7649b4560b402fb, lu le 18/10 17:14).
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018190000_surveillance_releves_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ⟦corps:début⟧
DROP FUNCTION IF EXISTS public.surveillance_releves();
DROP INDEX IF EXISTS public.sync_import_ecartes_user_date;

CREATE OR REPLACE FUNCTION public.releves_morts_veille(p_jours integer DEFAULT 7, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH actifs AS (
    SELECT p.id, p.email, p.extension_last_seen_at,
           coalesce(CASE WHEN jsonb_typeof(p.platform_settings -> 'plateformes_ecartees') = 'array'
                         THEN p.platform_settings -> 'plateformes_ecartees' END, '[]'::jsonb) AS ecartees
      FROM profiles p
     WHERE p.extension_last_seen_at > now() - interval '24 hours'
  ), dernier_done AS (
    SELECT r.user_id, r.platform, max(r.finished_at) AS done_le
      FROM vinted_sync_runs r JOIN actifs a ON a.id = r.user_id
     WHERE r.status = 'done' AND r.platform <> 'opla'
     GROUP BY 1, 2
  ), dernier_run AS (
    SELECT DISTINCT ON (r.user_id, r.platform)
           r.user_id, r.platform, r.status, r.declencheur, r.started_at, r.erreur
      FROM vinted_sync_runs r JOIN actifs a ON a.id = r.user_id
     ORDER BY r.user_id, r.platform, r.started_at DESC
  ), a_surveiller AS (
    SELECT user_id, platform, sum(n) AS n FROM (
      SELECT user_id, platform, count(*) AS n FROM cross_post_jobs
       WHERE status = 'published' AND user_id IN (SELECT id FROM actifs) GROUP BY 1, 2
      UNION ALL
      SELECT user_id, platform, count(*) FROM annonces_plateforme
       WHERE disparu_le IS NULL AND ignoree_le IS NULL AND user_id IN (SELECT id FROM actifs) GROUP BY 1, 2
    ) x GROUP BY 1, 2
  ), lignes AS (
    SELECT left(d.user_id::text, 8) AS uid,
           a.email,
           d.platform,
           to_char(d.done_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS dernier_releve_reussi,
           extract(day FROM now() - d.done_le)::int AS jours,
           to_char(dr.started_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS dernier_run,
           dr.status || '/' || coalesce(dr.declencheur, '?') AS dernier_statut,
           CASE
             WHEN dr.erreur ILIKE '%[boutique_a_confirmer]%' THEN 'boutique à confirmer'
             WHEN dr.erreur ILIKE '%session_absente%' OR dr.erreur ILIKE '%page de connexion%'
               OR dr.erreur ILIKE '%non accordé%' THEN 'session fermée'
             WHEN dr.erreur ILIKE '%anti-robot%' OR dr.erreur ILIKE '%anti_robot%'
               OR dr.erreur ILIKE '%datadome%' THEN 'mur anti-robot'
             WHEN dr.erreur ILIKE '%[watchdog]%' OR dr.erreur ILIKE '%Onglet de travail%'
               OR dr.erreur ILIKE '%pas fini de charger%' OR dr.erreur ILIKE '%jamais réclamée%' THEN 'panne technique jamais reprise'
             WHEN dr.status = 'done' THEN 'jamais reprogrammé'
             ELSE 'autre : ' || left(coalesce(dr.erreur, ''), 80)
           END AS cause_probable,
           coalesce(s.n, 0)::int AS a_surveiller,
           to_char(a.extension_last_seen_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS extension_vue
      FROM dernier_done d
      JOIN actifs a ON a.id = d.user_id
      JOIN dernier_run dr ON dr.user_id = d.user_id AND dr.platform = d.platform
      LEFT JOIN a_surveiller s ON s.user_id = d.user_id AND s.platform = d.platform
     WHERE d.done_le < now() - make_interval(days => greatest(1, coalesce(p_jours, 7)))
       AND NOT (a.ecartees ? d.platform)
       AND dr.status <> 'cancelled'
       AND (d.platform = 'vinted' OR coalesce(s.n, 0) > 0)
     ORDER BY d.platform, d.done_le
     LIMIT greatest(1, least(coalesce(p_limite, 200), 500))
  ), figes AS (
    SELECT count(*) FILTER (WHERE status = 'running' AND coalesce(progres_le, updated_at) < now() - interval '1 hour') AS running_figes,
           count(*) FILTER (WHERE status = 'queued' AND queued_at < now() - interval '7 hours') AS queued_oublies
      FROM vinted_sync_runs WHERE status IN ('running', 'queued')
  )
  SELECT jsonb_build_object(
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM lignes l), '[]'::jsonb),
    'figes', (SELECT jsonb_build_object('running_figes', running_figes, 'queued_oublies', queued_oublies) FROM figes),
    'jours', greatest(1, coalesce(p_jours, 7)),
    'lu_le', now()
  );
$function$;
REVOKE ALL ON FUNCTION public.releves_morts_veille(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releves_morts_veille(integer, integer) TO service_role;

-- Contrôle : le corps rendu est celui d'avant, à l'octet.
DO $controle$
BEGIN
  IF md5(pg_get_functiondef('public.releves_morts_veille(integer,integer)'::regprocedure))
     IS DISTINCT FROM '6db6781d3d214a04e7649b4560b402fb' THEN
    RAISE EXCEPTION 'inverse : releves_morts_veille ne retrouve pas son corps de prod d''avant — rien n''est écrit';
  END IF;
END
$controle$;
-- ⟦corps:fin⟧
COMMIT;
