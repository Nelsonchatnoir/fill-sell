-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — UNE BOUTIQUE QUI N'EST PLUS SURVEILLÉE SE VOIT DANS L'APP
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (18/10 16:51, lecture seule) : 8 couples compte × plateforme (6 comptes,
-- 654 annonces distinctes en ligne) ont une extension vivante (< 24 h) et un
-- relevé mort depuis plus de 24 h parce que la session de la plateforme est
-- fermée : lesmillesetunepepite (Leboncoin 217 depuis le 23/09, Vinted 234 depuis
-- le 22/09), meminiandmove (Leboncoin 37), lorenzocourouau87 (Leboncoin 40,
-- Vinted 69), ped29998 (Vinted 38), lenoobbien (Vinted 6), hu.anastasia (Beebs 13).
-- Une vente sur une de ces boutiques ne retire pas les autres annonces : risque de
-- double vente. L'app n'en dit rien : la session lue dans profiles.extension_sessions
-- n'est pas une preuve, et le bloc de synchro écarte les relevés de veille — ceux
-- justement qui butent sur le mur de session.
--
-- LA RÈGLE (la preuve est le RUN, jamais extension_sessions) :
--   public.surveillance_releves() — le compte de la session (auth.uid()), jamais
--   un autre : aucun paramètre. Une ligne par plateforme suivie (vinted, leboncoin,
--   beebs, depop ; eBay sauf relié par l'API ; une plateforme écartée par la
--   personne n'apparaît pas) :
--     · dernier_releve_le   fin du dernier relevé réussi (status done) ;
--     · dernier_mur_le / dernier_mur_marqueur  le dernier mur de session : run non
--       réussi portant [pas_connecte], « session_absente », « page de connexion »,
--       « non accordé », « Connexion … requise », ou status absente ;
--       [boutique_a_confirmer] n'en est PAS un (il a son propre geste) ;
--     · annonces_en_ligne   annonces DISTINCTES à surveiller : numéros des dépôts
--       publiés ∪ annonces relevées vivantes (un dépôt sans numéro compte pour un) ;
--     · ecartees_autre_compte  annonces du dernier relevé écartées parce qu'un autre
--       compte FillSell les suit déjà (sync_import_ecartes, motif autre_compte:<pf>) ;
--     · non_surveillee = dernier relevé réussi il y a plus de 24 h (ou jamais) ET
--       mur de session postérieur au dernier relevé réussi, au dernier relevé
--       incomplet (page lue, session ouverte) et à la dernière question de boutique
--       ET au moins une annonce à surveiller ;
--     · jours = jours pleins depuis le dernier relevé réussi.
--   Lecture bornée : vinted_sync_runs par (user_id, started_at DESC) sur 180 jours,
--   cross_post_jobs par (user_id, status), annonces_plateforme par (user_id, platform),
--   sync_import_ecartes par l'index posé ici (user_id, created_at DESC). Mesuré le
--   18/10 (EXPLAIN ANALYZE, compte le plus chargé : 494 runs, 932 dépôts publiés) :
--   12,8 ms. L'app la lit par relecture bornée (10 min, onglet visible).
--
-- ET LE DOUBLE COMPTE DE LA VEILLE : releves_morts_veille (ops-digest) additionnait
-- dépôts publiés et annonces relevées — la même annonce comptée deux fois
-- (lesmillesetunepepite Leboncoin : 430 = 213 + 217, vrai = 217). Réécrite depuis
-- la définition de PROD (md5 6db6781d3d214a04e7649b4560b402fb, lue le 18/10 17:14) :
-- seul le CTE a_surveiller change (annonces distinctes, même clé que ci-dessus).
--
-- Lecture seule, STABLE. Aucune écriture de données.
-- Inverse : supabase/rollbacks/20261018190000_surveillance_releves_INVERSE.sql
-- Essai à blanc : scripts/essais/20261018190000_essai.sql (ROLLBACK).
-- Application (après feu vert de Nico) :
--   npx supabase db query --linked -f supabase/migrations/20261018190000_surveillance_releves.sql
--   npx supabase migration repair --linked --status applied 20261018190000

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ⟦corps:début⟧
-- ── 0. La définition de prod de releves_morts_veille n'a pas bougé depuis sa lecture ──
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.releves_morts_veille(integer,integer)'::regprocedure))
     IS DISTINCT FROM '6db6781d3d214a04e7649b4560b402fb' THEN
    RAISE EXCEPTION 'releves_morts_veille a changé en prod depuis le 18/10 17:14 : migration arrêtée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 1. L'index des écartées (lecture par compte, la plus récente d'abord) ──
CREATE INDEX IF NOT EXISTS sync_import_ecartes_user_date
  ON public.sync_import_ecartes (user_id, created_at DESC);

-- ── 2. La surveillance des relevés, pour le compte de la session ──
CREATE OR REPLACE FUNCTION public.surveillance_releves()
 RETURNS TABLE(platform text, dernier_releve_le timestamp with time zone, dernier_mur_le timestamp with time zone,
               dernier_mur_marqueur text, annonces_en_ligne integer, ecartees_autre_compte integer,
               non_surveillee boolean, jours integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH moi AS (
    SELECT p.id,
           coalesce(CASE WHEN jsonb_typeof(p.platform_settings -> 'plateformes_ecartees') = 'array'
                         THEN p.platform_settings -> 'plateformes_ecartees' END, '[]'::jsonb) AS ecartees,
           coalesce(p.ebay_voie_api, false) AS ebay_api
      FROM profiles p
     WHERE p.id = auth.uid()
  ), suivies AS (
    SELECT v.pf
      FROM moi, (VALUES ('vinted'), ('leboncoin'), ('beebs'), ('depop'), ('ebay')) AS v(pf)
     WHERE NOT (moi.ecartees ? v.pf)
       AND NOT (v.pf = 'ebay' AND moi.ebay_api)
  ), runs AS (
    SELECT r.platform AS pf, r.status, r.started_at,
           coalesce(r.finished_at, r.updated_at, r.started_at) AS fin,
           CASE
             WHEN r.status = 'done' THEN NULL
             WHEN coalesce(r.erreur, '') ILIKE '%[boutique_a_confirmer]%' THEN 'boutique_a_confirmer'
             WHEN r.erreur ILIKE '%[pas_connecte]%' THEN 'pas_connecte'
             WHEN r.erreur ILIKE '%session_absente%' THEN 'session_absente'
             WHEN r.erreur ILIKE '%page de connexion%' THEN 'page_de_connexion'
             WHEN r.erreur ILIKE '%non accordé%' THEN 'acces_non_accorde'
             WHEN r.erreur ILIKE '%connexion % requise%' THEN 'connexion_requise'
             WHEN r.status = 'absente' THEN 'absente'
           END AS marqueur
      FROM vinted_sync_runs r
     WHERE r.user_id = (SELECT m.id FROM moi m)
       AND r.started_at > now() - interval '180 days'
       AND r.kind IN ('dressing', 'annonces')
       AND r.platform IN (SELECT s.pf FROM suivies s)
  ), dernier_done AS (
    SELECT DISTINCT ON (x.pf) x.pf, x.fin, x.started_at
      FROM runs x WHERE x.status = 'done'
     ORDER BY x.pf, x.fin DESC
  ), dernier_mur AS (
    SELECT DISTINCT ON (x.pf) x.pf, x.fin, x.marqueur
      FROM runs x WHERE x.marqueur IS NOT NULL AND x.marqueur <> 'boutique_a_confirmer'
     ORDER BY x.pf, x.fin DESC
  ), derniere_preuve AS (
    -- Ce qui dit que la session n'est PAS fermée : un relevé réussi, un relevé
    -- incomplet (la page a été lue), une question de boutique (Chrome est connecté).
    SELECT x.pf, max(x.fin) AS fin
      FROM runs x WHERE x.status IN ('done', 'incomplete') OR x.marqueur = 'boutique_a_confirmer'
     GROUP BY x.pf
  ), annonces AS (
    SELECT y.pf, count(DISTINCT y.cle)::int AS n FROM (
      SELECT j.platform AS pf, coalesce(nullif(btrim(j.platform_listing_id), ''), 'job:' || j.id::text) AS cle
        FROM cross_post_jobs j
       WHERE j.user_id = (SELECT m.id FROM moi m) AND j.status = 'published'
         AND j.platform IN (SELECT s.pf FROM suivies s)
      UNION ALL
      SELECT a.platform, a.listing_id
        FROM annonces_plateforme a
       WHERE a.user_id = (SELECT m.id FROM moi m) AND a.disparu_le IS NULL AND a.ignoree_le IS NULL
         AND a.platform IN (SELECT s.pf FROM suivies s)
    ) y GROUP BY y.pf
  ), ecartees AS (
    SELECT s.pf, count(DISTINCT e.vinted_item_id)::int AS n
      FROM suivies s
      LEFT JOIN dernier_done d ON d.pf = s.pf
      JOIN sync_import_ecartes e
        ON e.user_id = (SELECT m.id FROM moi m)
       AND e.motif = 'autre_compte:' || s.pf
       AND e.created_at >= coalesce(d.started_at, now() - interval '7 days') - interval '1 minute'
     GROUP BY s.pf
  )
  SELECT s.pf,
         d.fin,
         m.fin,
         m.marqueur,
         coalesce(n.n, 0),
         coalesce(e.n, 0),
         (coalesce(d.fin, '-infinity'::timestamptz) < now() - interval '24 hours'
          AND m.fin IS NOT NULL
          AND m.fin > coalesce(p.fin, '-infinity'::timestamptz)
          AND coalesce(n.n, 0) > 0),
         CASE WHEN d.fin IS NOT NULL THEN floor(extract(epoch FROM now() - d.fin) / 86400)::int END
    FROM suivies s
    LEFT JOIN dernier_done d ON d.pf = s.pf
    LEFT JOIN dernier_mur m ON m.pf = s.pf
    LEFT JOIN derniere_preuve p ON p.pf = s.pf
    LEFT JOIN annonces n ON n.pf = s.pf
    LEFT JOIN ecartees e ON e.pf = s.pf
   ORDER BY s.pf;
$function$;
REVOKE ALL ON FUNCTION public.surveillance_releves() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surveillance_releves() TO authenticated, service_role;
COMMENT ON FUNCTION public.surveillance_releves() IS
  '18/10 — par plateforme, pour auth.uid() seulement : dernier relevé réussi, dernier mur de session (le run fait preuve), annonces distinctes en ligne, écartées « autre compte », non_surveillee (> 24 h, mur postérieur, annonces > 0). Lecture seule.';

-- ── 3. La veille de l'ops-digest : annonces DISTINCTES (plus de double compte) ──
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
    -- (18/10) Annonces DISTINCTES : le numéro d'un dépôt publié et celui de
    -- l'annonce relevée sont la même annonce (un dépôt sans numéro compte pour un).
    SELECT user_id, platform, count(DISTINCT cle) AS n FROM (
      SELECT user_id, platform, coalesce(nullif(btrim(platform_listing_id), ''), 'job:' || id::text) AS cle FROM cross_post_jobs
       WHERE status = 'published' AND user_id IN (SELECT id FROM actifs)
      UNION ALL
      SELECT user_id, platform, listing_id FROM annonces_plateforme
       WHERE disparu_le IS NULL AND ignoree_le IS NULL AND user_id IN (SELECT id FROM actifs)
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
-- ⟦corps:fin⟧

COMMIT;
