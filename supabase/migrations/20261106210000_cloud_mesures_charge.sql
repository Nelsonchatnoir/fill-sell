-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LA CHARGE MESURÉE EN RÉEL, LUE À CHAQUE « CHECK NEWS » (06/11/2026 soir, décision de Nico)
-- PRÉPARÉE, NON APPLIQUÉE (06/11 soir) : feu vert NOMMÉ de Nico requis, après relecture du SQL complet ; ordre et moment : docs/cloud/REPRISE.md, bloc « 07/11 MATIN ».
--
-- « On mesurera la charge en réel, au fur et à mesure des utilisateurs ajoutés un par un » (pas d'essai synthétique).
--   · public.cloud_mesures : UNE ligne par serveur toutes les 5 min, écrite par l'agent de l'hôte
--     (serveur-cloud/deploiement/mesure/fillsell-mesure.py, lecture seule de l'hôte) : hote = processeur, mémoire, puce
--     de la machine ; comptes = par compte (uuid) : mémoire (médiane, max, non récupérable), processeur (fils), puce,
--     bridage, oom. 30 jours gardés (l'appel efface au plus 50 lignes échues par écriture : le stock ne grossit jamais).
--   · public.cloud_mesure_noter(serveur, hote, comptes) : la seule écriture (service_role).
--   · public.cloud_charge_heures : par serveur et par heure de Paris (7 jours) — l'hôte, les comptes (médiane et max
--     de la mémoire par compte, pointes de processeur et de puce, bridage, oom) et les JOBS du Cloud (pris dans l'heure :
--     faits, durée médiane et p95 du dernier essai = published_at − processing_since, ratés = failed / needs_user,
--     annulés). Le job est rangé au serveur ACTUEL du compte (cloud_postes).
--   · public.cloud_charge_comptes : par serveur, par compte et par jour de Paris (7 jours) — la même chose, compte par compte.
-- Lecture par Claude : select * from cloud_charge_heures order by heure desc limit 24;
--                      select * from cloud_charge_comptes where jour = (now() at time zone 'Europe/Paris')::date;
-- Vues en security_invoker, fermées au client (anon, authenticated) ; table sous RLS sans politique.
-- Coût : une insertion toutes les 5 min par serveur ; les vues ne tournent que quand on les lit (jobs lus par compte du
-- Cloud, index cross_post_jobs_user_created_idx). Aucune ligne existante réécrite.
-- Inverse : supabase/rollbacks/20261106210000_cloud_mesures_charge_INVERSE.sql. Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cloud_mesures (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serveur text NOT NULL CHECK (serveur ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  le      timestamptz NOT NULL DEFAULT now(),
  hote    jsonb NOT NULL DEFAULT '{}'::jsonb,
  comptes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cloud_mesures_serveur_le ON public.cloud_mesures (serveur, le DESC);
ALTER TABLE public.cloud_mesures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cloud_mesures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cloud_mesures TO service_role;   -- droits : serveur seulement (cloud_mesures : agent de l'hôte, fonctions, vues lues par Claude)
COMMENT ON TABLE public.cloud_mesures IS
  'Charge réelle d''un serveur Cloud, une ligne par 5 min (agent fillsell-mesure de l''hôte, 06/11) ; lue par cloud_charge_heures / cloud_charge_comptes. 30 jours.';

CREATE OR REPLACE FUNCTION public.cloud_mesure_noter(p_serveur text, p_hote jsonb, p_comptes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_serveur IS NULL OR p_serveur !~ '^[a-z0-9][a-z0-9-]{0,40}$' THEN
    RAISE EXCEPTION 'cloud_mesure_noter : nom de serveur illisible';
  END IF;
  IF jsonb_typeof(COALESCE(p_hote, '{}'::jsonb)) <> 'object' OR jsonb_typeof(COALESCE(p_comptes, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'cloud_mesure_noter : hote et comptes sont des objets';
  END IF;
  IF pg_column_size(p_hote) + pg_column_size(p_comptes) > 200000 THEN
    RAISE EXCEPTION 'cloud_mesure_noter : mesure trop grosse';
  END IF;
  INSERT INTO public.cloud_mesures (serveur, hote, comptes)
  VALUES (p_serveur, COALESCE(p_hote, '{}'::jsonb), COALESCE(p_comptes, '{}'::jsonb));
  DELETE FROM public.cloud_mesures
   WHERE id IN (SELECT m.id FROM public.cloud_mesures m
                 WHERE m.serveur = p_serveur AND m.le < now() - interval '30 days' ORDER BY m.le LIMIT 50);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_mesure_noter(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_mesure_noter(text, jsonb, jsonb) TO service_role;

-- Les jobs du Cloud (7 jours), un par ligne : serveur actuel du compte, début du dernier essai, durée, statut.
CREATE OR REPLACE VIEW public.cloud_jobs_mesures WITH (security_invoker = on) AS
  SELECT po.serveur, x.user_id, x.status, x.action, x.platform, x.debut,
         CASE WHEN x.status = 'published' AND x.published_at >= x.debut THEN extract(epoch FROM (x.published_at - x.debut)) END AS duree_s
    FROM public.cloud_postes po
    CROSS JOIN LATERAL (
      SELECT c.user_id, c.status, c.action, c.platform, c.published_at,
             CASE WHEN c.platform_fields ->> 'processing_since' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
                  THEN (c.platform_fields ->> 'processing_since')::timestamptz END AS debut
        FROM public.cross_post_jobs c
       WHERE c.user_id = po.user_id AND c.created_at > now() - interval '30 days' AND c.handler_build LIKE '%-cloud%') x
   WHERE x.debut > now() - interval '7 days';

CREATE OR REPLACE VIEW public.cloud_charge_heures WITH (security_invoker = on) AS
WITH m AS (
  SELECT serveur, date_trunc('hour', le AT TIME ZONE 'Europe/Paris') AS heure, hote, comptes
    FROM public.cloud_mesures WHERE le > now() - interval '7 days'),
h AS (
  SELECT serveur, heure, count(*) AS fenetres_5min,
         max((hote ->> 'navigateurs_max')::int) AS comptes_ouverts_max,
         round(avg((hote ->> 'cpu_moy_pct')::numeric), 1) AS cpu_moy_pct,
         max((hote ->> 'cpu_p95_pct')::numeric) AS cpu_p95_max_pct,
         round(avg((hote ->> 'puce_moy_pct')::numeric), 2) AS puce_moy_pct,
         max((hote ->> 'puce_p95_pct')::numeric) AS puce_p95_max_pct,
         min((hote ->> 'mem_dispo_min_mo')::int) AS mem_dispo_min_mo,
         max((hote ->> 'mem_utilisee_max_pct')::numeric) AS mem_utilisee_max_pct
    FROM m GROUP BY 1, 2),
c AS (
  SELECT m.serveur, m.heure,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'mem_med_mo')::numeric) AS mem_par_compte_med_mo,
         max((v ->> 'mem_max_mo')::int) AS mem_par_compte_max_mo,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'nonrec_med_mo')::numeric) AS nonrec_par_compte_med_mo,
         max((v ->> 'cpu_max_fils')::numeric) AS cpu_compte_max_fils,
         max((v ->> 'puce_max_pct')::numeric) AS puce_compte_max_pct,
         max((v ->> 'bride_part')::numeric) AS bride_part_max,
         sum((v ->> 'oom')::int) AS oom
    FROM m CROSS JOIN LATERAL jsonb_each(m.comptes) e(u, v) GROUP BY 1, 2),
j AS (
  SELECT serveur, date_trunc('hour', debut AT TIME ZONE 'Europe/Paris') AS heure, count(*) AS jobs,
         count(*) FILTER (WHERE status = 'published') AS jobs_faits,
         count(*) FILTER (WHERE status IN ('failed', 'needs_user')) AS jobs_rates,
         count(*) FILTER (WHERE status = 'cancelled') AS jobs_annules,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_med_s,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_p95_s
    FROM public.cloud_jobs_mesures GROUP BY 1, 2)
SELECT h.serveur, h.heure, h.fenetres_5min, h.comptes_ouverts_max,
       h.cpu_moy_pct, h.cpu_p95_max_pct, h.puce_moy_pct, h.puce_p95_max_pct, h.mem_dispo_min_mo, h.mem_utilisee_max_pct,
       c.mem_par_compte_med_mo, c.mem_par_compte_max_mo, c.nonrec_par_compte_med_mo, c.cpu_compte_max_fils,
       c.puce_compte_max_pct, c.bride_part_max, c.oom,
       COALESCE(j.jobs, 0) AS jobs, COALESCE(j.jobs_faits, 0) AS jobs_faits, COALESCE(j.jobs_rates, 0) AS jobs_rates,
       COALESCE(j.jobs_annules, 0) AS jobs_annules, j.duree_med_s, j.duree_p95_s
  FROM h LEFT JOIN c USING (serveur, heure) LEFT JOIN j USING (serveur, heure);

CREATE OR REPLACE VIEW public.cloud_charge_comptes WITH (security_invoker = on) AS
WITH m AS (
  SELECT serveur, (le AT TIME ZONE 'Europe/Paris')::date AS jour, e.u, e.v
    FROM public.cloud_mesures CROSS JOIN LATERAL jsonb_each(comptes) e(u, v)
   WHERE le > now() - interval '7 days'),
c AS (
  SELECT serveur, jour, u AS compte, count(*) AS fenetres_5min,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'mem_med_mo')::numeric) AS mem_med_mo,
         max((v ->> 'mem_max_mo')::int) AS mem_max_mo,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'nonrec_med_mo')::numeric) AS nonrec_med_mo,
         round(avg((v ->> 'cpu_moy_fils')::numeric), 3) AS cpu_moy_fils, max((v ->> 'cpu_max_fils')::numeric) AS cpu_max_fils,
         round(avg((v ->> 'puce_moy_pct')::numeric), 3) AS puce_moy_pct, max((v ->> 'puce_max_pct')::numeric) AS puce_max_pct,
         max((v ->> 'bride_part')::numeric) AS bride_part_max, sum((v ->> 'oom')::int) AS oom
    FROM m GROUP BY 1, 2, 3),
j AS (
  SELECT serveur, (debut AT TIME ZONE 'Europe/Paris')::date AS jour, user_id::text AS compte, count(*) AS jobs,
         count(*) FILTER (WHERE status = 'published') AS jobs_faits,
         count(*) FILTER (WHERE status IN ('failed', 'needs_user')) AS jobs_rates,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_med_s,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_p95_s
    FROM public.cloud_jobs_mesures GROUP BY 1, 2, 3)
SELECT c.*, COALESCE(j.jobs, 0) AS jobs, COALESCE(j.jobs_faits, 0) AS jobs_faits, COALESCE(j.jobs_rates, 0) AS jobs_rates,
       j.duree_med_s, j.duree_p95_s
  FROM c LEFT JOIN j USING (serveur, jour, compte);

REVOKE ALL ON public.cloud_jobs_mesures, public.cloud_charge_heures, public.cloud_charge_comptes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cloud_jobs_mesures, public.cloud_charge_heures, public.cloud_charge_comptes TO service_role;
