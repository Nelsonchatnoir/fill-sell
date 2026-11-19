-- (19/11/2026, décision de Nico — CAPACITÉ DU CLOUD : plus de plafond fixe à 30) cloud_capacite_mesures reçoit la
-- CONSOMMATION RÉELLE de chaque navigateur et le DÉTAIL des fenêtres de 5 min ; la règle (réserve de 20 %, marges du
-- processeur et de la puce, paliers de +5, signes graves) est en JS (serveur-cloud/src/flotte.js, capaciteReelle et
-- capaciteMesuree), testée par scripts/cloud-capacite-paliers-selftest.mjs.
--
-- Corps repris de pg_get_functiondef en PROD le 19/11 (md5 2a9387a0cafdce2fc12eec735c6be7d6 = l'inverse) : TOUTES les
-- clés d'avant gardent leur sens (l'orchestrateur d'avant les lit encore) ; seules s'ajoutent :
--   · conso_compte_pire_mo : le 95e centile, sur les comptes, de la mémoire NON récupérable (anon + shmem du conteneur,
--     nonrec_med_mo) au PIRE moment de chaque compte ; conso_compte_max_mo : le pire compte ; conso_comptes : combien ;
--     (mem_compte_p95_mo, lui, lit memory.current, cache compris : il plafonne à la limite du conteneur, 2 Go) ;
--   · conso_hote_pire_mo : la mémoire utilisée de l'hôte par navigateur ouvert au pire moment (socle compris) ;
--   · detail : une entrée par fenêtre, dans l'ordre, [instant (s), navigateurs ouverts, mémoire utilisée (Mo),
--     processeur p95 (%), puce p95 (%), oom, restrictions + blocages] ; detail_v = 1.
-- Aucune table, aucun droit changé (CREATE OR REPLACE garde postgres + service_role). Lecture seule, STABLE.
-- Essai : node scripts/essais/20261119170000_banc.mjs (Postgres jetable). Inverse :
-- supabase/rollbacks/20261119170000_cloud_capacite_conso_reelle_INVERSE.sql.
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
      FROM f CROSS JOIN c WHERE c.mem_compte_p95 > 0),
  -- (19/11) La mémoire NON récupérable de chaque compte à son pire moment de la fenêtre ; puis le 95e centile des comptes.
  pc AS (
    SELECT e.u, max((e.v ->> 'nonrec_med_mo')::numeric) AS pire
      FROM f CROSS JOIN LATERAL jsonb_each(f.comptes) e(u, v)
     WHERE jsonb_typeof(e.v) = 'object' AND e.v ? 'nonrec_med_mo'
     GROUP BY e.u),
  r AS (
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY pc.pire) AS compte_p95, max(pc.pire) AS compte_max, count(*) AS comptes FROM pc),
  -- (19/11) Chaque fenêtre : ouverts, mémoire utilisée (hors cache récupérable : total − MemAvailable au plus bas),
  -- processeur et puce p95, oom et signes graves de ses comptes.
  w AS (
    SELECT f.le, f.n, f.total - f.dispo AS utilisee, f.cpu, f.puce,
           (SELECT COALESCE(sum(COALESCE((e.v ->> 'oom')::int, 0)), 0)
              FROM jsonb_each(CASE WHEN jsonb_typeof(f.comptes) = 'object' THEN f.comptes ELSE '{}'::jsonb END) e(u, v)
             WHERE jsonb_typeof(e.v) = 'object') AS oom,
           (SELECT COALESCE(sum(COALESCE((e.v -> 'signes' ->> 'restriction')::int, 0) + COALESCE((e.v -> 'signes' ->> 'blocage')::int, 0)), 0)
              FROM jsonb_each(CASE WHEN jsonb_typeof(f.comptes) = 'object' THEN f.comptes ELSE '{}'::jsonb END) e(u, v)
             WHERE jsonb_typeof(e.v) = 'object') AS graves
      FROM f),
  d AS (
    SELECT max(w.utilisee / w.n) FILTER (WHERE w.n >= 1 AND w.utilisee IS NOT NULL) AS hote_pire,
           jsonb_agg(jsonb_build_array(floor(extract(epoch FROM w.le))::bigint, w.n, round(w.utilisee), round(w.cpu, 1), round(w.puce, 1),
             w.oom, w.graves) ORDER BY w.le) AS detail
      FROM w)
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
    || jsonb_build_object(
    'conso_compte_pire_mo', round(r.compte_p95), 'conso_compte_max_mo', round(r.compte_max), 'conso_comptes', r.comptes,
    'conso_hote_pire_mo', round(d.hote_pire),
    'detail', COALESCE(d.detail, '[]'::jsonb), 'detail_v', 1)
  FROM c CROSS JOIN g LEFT JOIN p ON true CROSS JOIN r CROSS JOIN d;
$function$;

REVOKE ALL ON FUNCTION public.cloud_capacite_mesures(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_capacite_mesures(text, integer) TO service_role;
