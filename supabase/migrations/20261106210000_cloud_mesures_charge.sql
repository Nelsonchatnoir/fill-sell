-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LA CHARGE MESURÉE EN RÉEL, LUE À CHAQUE « CHECK NEWS » (06/11/2026 soir, décisions de Nico)
-- PRÉPARÉE, NON APPLIQUÉE (06/11 soir) : feu vert NOMMÉ de Nico requis, après relecture du SQL complet ; ordre et moment : docs/cloud/REPRISE.md, bloc « ENCHAÎNEMENT ».
--
-- « On mesurera la charge en réel, au fur et à mesure des utilisateurs ajoutés un par un » (pas d'essai synthétique).
--   · public.cloud_mesures : UNE ligne par serveur toutes les 5 min, écrite par l'agent de l'hôte
--     (serveur-cloud/deploiement/mesure/fillsell-mesure.py, lecture seule de l'hôte) : hote = processeur, mémoire, puce
--     de la machine ; comptes = par compte : mémoire (médiane, max, non récupérable), processeur (fils), puce, bridage,
--     oom, et SIGNES ANTI-ROBOT de la fenêtre (datadome = un défi DataDome qui s'ouvre, verification_appareil, glissiere,
--     restriction, blocage — lus dans le journal de l'orchestrateur, qui ne garde que les 8 premiers caractères d'un
--     compte : les vues comptent par ce préfixe). 30 jours gardés (l'appel efface au plus 50 lignes échues par écriture).
--   · public.cloud_mesure_noter(serveur, hote, comptes) : la seule écriture (service_role).
--   · public.cloud_charge_heures : par serveur et par heure de Paris (7 jours) — l'hôte, les comptes, les signes
--     anti-robot de l'heure, les JOBS du Cloud (faits, ratés = failed / needs_user, annulés, durée médiane et p95 du
--     dernier essai = published_at − processing_since). Un job est rangé au serveur ACTUEL du compte (cloud_postes).
--   · public.cloud_charge_comptes : par serveur, par compte (8 caractères) et par jour de Paris (7 jours) — mémoire,
--     processeur, puce, bridage, oom, SIGNES ANTI-ROBOT par catégorie, jobs.
--   · public.cloud_passage_30 : LA RÈGLE DE NICO pour passer de 15 à 30 comptes par serveur (docs/cloud/REPRISE.md),
--     condition par condition sur les 7 derniers jours ; l'orchestrateur la lit une fois par heure et l'alerte le dit
--     quand TOUTES sont réunies (Nico décide).
-- Lecture par Claude : select * from cloud_charge_heures order by heure desc limit 24;
--                      select * from cloud_charge_comptes where jour = (now() at time zone 'Europe/Paris')::date;
--                      select * from cloud_passage_30;
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
  'Charge réelle d''un serveur Cloud, une ligne par 5 min (agent fillsell-mesure de l''hôte, 06/11) ; lue par cloud_charge_heures / cloud_charge_comptes / cloud_passage_30. 30 jours.';

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

-- Un compte dans une fenêtre de 5 min (7 jours), signes anti-robot comptés par catégorie.
CREATE OR REPLACE VIEW public.cloud_mesures_comptes WITH (security_invoker = on) AS
  SELECT m.serveur, m.le, left(e.u, 8) AS compte, (e.v ? 'mem_max_mo') AS mesure, e.v,
         COALESCE((e.v -> 'signes' ->> 'datadome')::int, 0) AS s_datadome,
         COALESCE((e.v -> 'signes' ->> 'verification_appareil')::int, 0) AS s_verification_appareil,
         COALESCE((e.v -> 'signes' ->> 'glissiere')::int, 0) AS s_glissiere,
         COALESCE((e.v -> 'signes' ->> 'restriction')::int, 0) AS s_restriction,
         COALESCE((e.v -> 'signes' ->> 'blocage')::int, 0) AS s_blocage
    FROM public.cloud_mesures m CROSS JOIN LATERAL jsonb_each(m.comptes) e(u, v)
   WHERE m.le > now() - interval '30 days';

CREATE OR REPLACE VIEW public.cloud_charge_heures WITH (security_invoker = on) AS
WITH m AS (
  SELECT serveur, date_trunc('hour', le AT TIME ZONE 'Europe/Paris') AS heure, hote
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
  SELECT serveur, date_trunc('hour', le AT TIME ZONE 'Europe/Paris') AS heure,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'mem_med_mo')::numeric) FILTER (WHERE mesure) AS mem_par_compte_med_mo,
         max((v ->> 'mem_max_mo')::int) AS mem_par_compte_max_mo,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'nonrec_med_mo')::numeric) FILTER (WHERE mesure) AS nonrec_par_compte_med_mo,
         max((v ->> 'cpu_max_fils')::numeric) AS cpu_compte_max_fils,
         max((v ->> 'puce_max_pct')::numeric) AS puce_compte_max_pct,
         max((v ->> 'bride_part')::numeric) AS bride_part_max,
         sum(COALESCE((v ->> 'oom')::int, 0)) AS oom,
         sum(s_datadome + s_verification_appareil + s_glissiere + s_restriction + s_blocage) AS signes_anti_robot,
         sum(s_restriction + s_blocage) AS signes_graves
    FROM public.cloud_mesures_comptes WHERE le > now() - interval '7 days' GROUP BY 1, 2),
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
       COALESCE(c.signes_anti_robot, 0) AS signes_anti_robot, COALESCE(c.signes_graves, 0) AS signes_graves,
       COALESCE(j.jobs, 0) AS jobs, COALESCE(j.jobs_faits, 0) AS jobs_faits, COALESCE(j.jobs_rates, 0) AS jobs_rates,
       COALESCE(j.jobs_annules, 0) AS jobs_annules, j.duree_med_s, j.duree_p95_s
  FROM h LEFT JOIN c USING (serveur, heure) LEFT JOIN j USING (serveur, heure);

CREATE OR REPLACE VIEW public.cloud_charge_comptes WITH (security_invoker = on) AS
WITH c AS (
  SELECT serveur, (le AT TIME ZONE 'Europe/Paris')::date AS jour, compte, count(*) FILTER (WHERE mesure) AS fenetres_5min,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'mem_med_mo')::numeric) FILTER (WHERE mesure) AS mem_med_mo,
         max((v ->> 'mem_max_mo')::int) AS mem_max_mo,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (v ->> 'nonrec_med_mo')::numeric) FILTER (WHERE mesure) AS nonrec_med_mo,
         round(avg((v ->> 'cpu_moy_fils')::numeric), 3) AS cpu_moy_fils, max((v ->> 'cpu_max_fils')::numeric) AS cpu_max_fils,
         round(avg((v ->> 'puce_moy_pct')::numeric), 3) AS puce_moy_pct, max((v ->> 'puce_max_pct')::numeric) AS puce_max_pct,
         max((v ->> 'bride_part')::numeric) AS bride_part_max, sum(COALESCE((v ->> 'oom')::int, 0)) AS oom,
         sum(s_datadome) AS signes_datadome, sum(s_verification_appareil) AS signes_verification_appareil,
         sum(s_glissiere) AS signes_glissiere, sum(s_restriction) AS signes_restriction, sum(s_blocage) AS signes_blocage,
         sum(s_datadome + s_verification_appareil + s_glissiere + s_restriction + s_blocage) AS signes_total
    FROM public.cloud_mesures_comptes WHERE le > now() - interval '7 days' GROUP BY 1, 2, 3),
j AS (
  SELECT serveur, (debut AT TIME ZONE 'Europe/Paris')::date AS jour, left(user_id::text, 8) AS compte, count(*) AS jobs,
         count(*) FILTER (WHERE status = 'published') AS jobs_faits,
         count(*) FILTER (WHERE status IN ('failed', 'needs_user')) AS jobs_rates,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_med_s,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duree_s)::numeric) AS duree_p95_s
    FROM public.cloud_jobs_mesures GROUP BY 1, 2, 3)
SELECT c.*, COALESCE(j.jobs, 0) AS jobs, COALESCE(j.jobs_faits, 0) AS jobs_faits, COALESCE(j.jobs_rates, 0) AS jobs_rates,
       j.duree_med_s, j.duree_p95_s
  FROM c LEFT JOIN j USING (serveur, jour, compte);

-- ── LA RÈGLE DE NICO (06/11 soir) : passer de 15 à 30 comptes sur un serveur — toutes les conditions, 7 derniers jours ──
--   comptes   : au moins 10 vrais comptes servis en même temps sur 80 % des fenêtres (20e centile ≥ 10) ;
--   durée     : au moins 1 900 fenêtres de 5 min (≈ 6,6 jours sur 7) ;
--   mémoire   : projetée à 30 comptes (mémoire utilisée + comptes manquants × 95e centile de la mémoire max d'un compte),
--               au 95e centile des fenêtres, ≤ 70 % de la mémoire totale ; jamais moins de 6 Gio disponibles ;
--   processeur: p95 de l'hôte × 30 / comptes ouverts, au 95e centile des fenêtres, ≤ 60 % ;
--   puce      : idem pour le rendu 3D, ≤ 60 % ;
--   jobs      : au moins 100 jobs du Cloud, ratés ≤ 5 %, durée p95 ≤ 200 s (2 × la référence du 06/11 : 100 s) ;
--   bridage   : médiane par compte ≤ celle de la RÉFÉRENCE + 0,10 ;
--   signes    : ZÉRO restriction et ZÉRO blocage sur les 7 jours, et signes anti-robot par compte et par jour ≤ ceux de la
--               RÉFÉRENCE ; la référence = les fenêtres à 1-3 comptes (30 jours), au moins 7 compte-jours, sinon NON.
--   Les projections ne lisent que les fenêtres à 10 comptes ou plus.
CREATE OR REPLACE VIEW public.cloud_passage_30 WITH (security_invoker = on) AS
WITH f AS (
  SELECT m.serveur, m.le, COALESCE((m.hote ->> 'navigateurs_max')::int, 0) AS n,
         (m.hote ->> 'mem_total_mo')::numeric AS total, (m.hote ->> 'mem_dispo_min_mo')::numeric AS dispo,
         (m.hote ->> 'cpu_p95_pct')::numeric AS cpu, (m.hote ->> 'puce_p95_pct')::numeric AS puce
    FROM public.cloud_mesures m WHERE m.le > now() - interval '7 days'),
oc AS (
  SELECT c.serveur,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY (c.v ->> 'mem_max_mo')::numeric) FILTER (WHERE c.mesure) AS mem_compte_p95_mo,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (c.v ->> 'bride_part')::numeric) FILTER (WHERE c.mesure) AS bride_med,
         sum(c.s_datadome + c.s_verification_appareil + c.s_glissiere + c.s_restriction + c.s_blocage) AS signes,
         sum(c.s_restriction + c.s_blocage) AS graves, count(*) FILTER (WHERE c.mesure) AS compte_fenetres
    FROM public.cloud_mesures_comptes c
    JOIN f ON f.serveur = c.serveur AND f.le = c.le AND f.n >= 10
   GROUP BY 1),
graves7 AS (
  SELECT serveur, sum(s_restriction + s_blocage) AS graves
    FROM public.cloud_mesures_comptes WHERE le > now() - interval '7 days' GROUP BY 1),
rc AS (
  SELECT c.serveur,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY (c.v ->> 'bride_part')::numeric) FILTER (WHERE c.mesure) AS bride_med,
         sum(c.s_datadome + c.s_verification_appareil + c.s_glissiere + c.s_restriction + c.s_blocage) AS signes,
         count(*) FILTER (WHERE c.mesure) AS compte_fenetres
    FROM public.cloud_mesures_comptes c
    JOIN public.cloud_mesures m ON m.serveur = c.serveur AND m.le = c.le
   WHERE COALESCE((m.hote ->> 'navigateurs_max')::int, 0) BETWEEN 1 AND 3
   GROUP BY 1),
toutes AS (
  SELECT serveur, count(*) AS fenetres, percentile_cont(0.2) WITHIN GROUP (ORDER BY n) AS comptes_p20,
         max(total) AS total, min(dispo) AS dispo_min
    FROM f GROUP BY 1),
proj AS (
  SELECT f.serveur,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY (f.total - f.dispo) + GREATEST(30 - f.n, 0) * oc.mem_compte_p95_mo) AS mem_proj_p95_mo,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY f.cpu * 30 / f.n) AS cpu_proj_p95_pct,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY f.puce * 30 / f.n) AS puce_proj_p95_pct
    FROM f JOIN oc USING (serveur) WHERE f.n >= 10 GROUP BY 1),
j AS (
  SELECT serveur, count(*) AS jobs, count(*) FILTER (WHERE status IN ('failed', 'needs_user')) AS rates,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY duree_s) AS duree_p95_s
    FROM public.cloud_jobs_mesures GROUP BY 1),
v AS (
  SELECT s.nom AS serveur, t.fenetres, t.comptes_p20, t.total, t.dispo_min,
         round(p.mem_proj_p95_mo::numeric) AS mem_proj_p95_mo, round(oc.mem_compte_p95_mo::numeric) AS mem_compte_p95_mo,
         round(p.cpu_proj_p95_pct::numeric, 1) AS cpu_proj_p95_pct, round(p.puce_proj_p95_pct::numeric, 1) AS puce_proj_p95_pct,
         j.jobs, j.rates, round(j.duree_p95_s::numeric) AS duree_p95_s,
         round(oc.bride_med::numeric, 3) AS bride_med, round(rc.bride_med::numeric, 3) AS bride_med_reference,
         COALESCE(g.graves, 0) AS signes_graves_7j,
         round(oc.signes::numeric / NULLIF(oc.compte_fenetres / 288.0, 0), 3) AS signes_par_compte_jour,
         round(rc.signes::numeric / NULLIF(rc.compte_fenetres / 288.0, 0), 3) AS signes_par_compte_jour_reference,
         round(rc.compte_fenetres / 288.0, 1) AS compte_jours_reference
    FROM public.cloud_serveurs s
    LEFT JOIN toutes t ON t.serveur = s.nom LEFT JOIN proj p ON p.serveur = s.nom LEFT JOIN oc ON oc.serveur = s.nom
    LEFT JOIN rc ON rc.serveur = s.nom LEFT JOIN j ON j.serveur = s.nom LEFT JOIN graves7 g ON g.serveur = s.nom
   WHERE s.etat = 'actif')
SELECT v.*,
       COALESCE(v.comptes_p20 >= 10, false) AS ok_comptes,
       COALESCE(v.fenetres >= 1900, false) AS ok_duree,
       COALESCE(v.mem_proj_p95_mo <= 0.70 * v.total AND v.dispo_min >= 6144, false) AS ok_memoire,
       COALESCE(v.cpu_proj_p95_pct <= 60, false) AS ok_processeur,
       COALESCE(v.puce_proj_p95_pct <= 60, false) AS ok_puce,
       COALESCE(v.jobs >= 100 AND v.rates::numeric / v.jobs <= 0.05 AND v.duree_p95_s <= 200, false) AS ok_jobs,
       COALESCE(v.bride_med <= v.bride_med_reference + 0.10, false) AS ok_bridage,
       COALESCE(v.compte_jours_reference >= 7 AND v.signes_graves_7j = 0
                AND v.signes_par_compte_jour <= v.signes_par_compte_jour_reference, false) AS ok_signes,
       COALESCE(v.comptes_p20 >= 10 AND v.fenetres >= 1900 AND v.mem_proj_p95_mo <= 0.70 * v.total AND v.dispo_min >= 6144
                AND v.cpu_proj_p95_pct <= 60 AND v.puce_proj_p95_pct <= 60
                AND v.jobs >= 100 AND v.rates::numeric / v.jobs <= 0.05 AND v.duree_p95_s <= 200
                AND v.bride_med <= v.bride_med_reference + 0.10
                AND v.compte_jours_reference >= 7 AND v.signes_graves_7j = 0
                AND v.signes_par_compte_jour <= v.signes_par_compte_jour_reference, false) AS conditions_reunies
  FROM v;

REVOKE ALL ON public.cloud_jobs_mesures, public.cloud_mesures_comptes, public.cloud_charge_heures, public.cloud_charge_comptes,
  public.cloud_passage_30 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cloud_jobs_mesures, public.cloud_mesures_comptes, public.cloud_charge_heures, public.cloud_charge_comptes,
  public.cloud_passage_30 TO service_role;
