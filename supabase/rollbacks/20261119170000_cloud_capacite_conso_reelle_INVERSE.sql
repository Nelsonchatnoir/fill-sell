-- INVERSE de 20261119170000_cloud_capacite_conso_reelle : le corps de PROD du 19/11 avant la migration, mot pour mot
-- (pg_get_functiondef, md5 2a9387a0cafdce2fc12eec735c6be7d6). Les clés ajoutées disparaissent ; l'orchestrateur retombe
-- seul sur les anciennes clés (flotte.js, capaciteReelle : source « ancienne », limite prudente).
CREATE OR REPLACE FUNCTION public.cloud_capacite_mesures(p_serveur text, p_heures integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH f AS (
    SELECT m.le, COALESCE((m.hote ->> 'navigateurs_max')::numeric, 0) AS n,
           (m.hote ->> 'mem_total_mo')::numeric AS total, (m.hote ->> 'mem_dispo_min_mo')::numeric AS dispo,
           (m.hote ->> 'cpu_p95_pct')::numeric AS cpu, (m.hote ->> 'puce_p95_pct')::numeric AS puce, m.comptes
      FROM public.cloud_mesures m
     WHERE m.serveur = p_serveur
       AND m.le > now() - make_interval(hours => GREATEST(LEAST(COALESCE(p_heures, 24), 168), 1))),
  c AS (
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY (e.v ->> 'mem_max_mo')::numeric) AS mem_compte_p95,
           COALESCE(sum(COALESCE((e.v ->> 'oom')::int, 0)), 0) AS oom
      FROM f CROSS JOIN LATERAL jsonb_each(f.comptes) e(u, v)
     WHERE jsonb_typeof(e.v) = 'object' AND e.v ? 'mem_max_mo'),
  g AS (
    SELECT COALESCE(sum(COALESCE((e.v -> 'signes' ->> 'restriction')::int, 0) + COALESCE((e.v -> 'signes' ->> 'blocage')::int, 0)), 0) AS graves
      FROM public.cloud_mesures m CROSS JOIN LATERAL jsonb_each(m.comptes) e(u, v)
     WHERE m.serveur = p_serveur AND m.le > now() - interval '7 days' AND jsonb_typeof(e.v) = 'object'),
  p AS (
    SELECT percentile_cont(0.05) WITHIN GROUP (ORDER BY f.n + LEAST(0.70 * f.total - (f.total - f.dispo), f.dispo - 6144) / c.mem_compte_p95)
             FILTER (WHERE f.total > 0 AND f.dispo IS NOT NULL) AS n_mem,
           percentile_cont(0.05) WITHIN GROUP (ORDER BY CASE WHEN f.cpu > 0 THEN 60 * f.n / f.cpu END) FILTER (WHERE f.n >= 1) AS n_cpu,
           percentile_cont(0.05) WITHIN GROUP (ORDER BY CASE WHEN f.puce > 0 THEN 60 * f.n / f.puce END) FILTER (WHERE f.n >= 1) AS n_puce
      FROM f CROSS JOIN c WHERE c.mem_compte_p95 > 0)
  SELECT jsonb_build_object(
    'serveur', p_serveur,
    'fenetres', (SELECT count(*) FROM f),
    'fenetres_avec_comptes', (SELECT count(*) FROM f WHERE f.n >= 1),
    'comptes_max', (SELECT max(f.n) FROM f),
    'mem_total_mo', (SELECT max(f.total) FROM f),
    'dispo_min_mo', (SELECT min(f.dispo) FROM f),
    'mem_compte_p95_mo', round(c.mem_compte_p95),
    'n_mem', floor(p.n_mem), 'n_cpu', floor(p.n_cpu), 'n_puce', floor(p.n_puce),
    'oom', c.oom, 'graves_7j', g.graves,
    'derniere_le', (SELECT max(f.le) FROM f))
  FROM c CROSS JOIN g LEFT JOIN p ON true;
$function$
;

REVOKE ALL ON FUNCTION public.cloud_capacite_mesures(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_capacite_mesures(text, integer) TO service_role;
