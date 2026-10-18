-- Essai à blanc de 20261018190000 (18/10) : tout est annulé (ROLLBACK). Lancer :
--   npx supabase db query --linked -f scripts/essais/20261018190000_essai.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- UNE BOUTIQUE QUI N'EST PLUS SURVEILLÉE SE VOIT DANS L'APP (18/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lecture seule de bout en bout : aucune annonce, aucun job, aucun run, aucun mail
-- n'est écrit ; la seule table touchée est _r (temporaire). La migration (fonction,
-- index, veille réécrite) et son inverse sont joués DANS la transaction, puis
-- annulés par le ROLLBACK final.
--   A. AVANT : la veille compte lesmillesetunepepite Leboncoin en double (430).
--   B. LA MIGRATION (son corps exact, ⟦corps:début⟧ … ⟦corps:fin⟧).
--   C. APRÈS : la RPC vue PAR lesmillesetunepepite (request.jwt.claims + rôle
--      authenticated, comme une session de l'app), sans session, droits, parc
--      entier (compte par compte), durée, veille sans double compte.
--   D. L'INVERSE (son corps exact) rend la veille de prod à l'octet.
-- Comptes : lesmillesetunepepite (4cd4d9ae-7165-4750-860f-6ecf747b1be0) en LECTURE
-- seulement — se faire passer pour elle ne lit que ses propres lignes.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _r (ordre serial, cas text, attendu text, obtenu text, ok boolean);

-- ═══ A. AVANT ═════════════════════════════════════════════════════════════
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'A1 avant : veille, lesmillesetunepepite Leboncoin (dépôts + annonces additionnés)', '430 (213 + 217, double compte)',
       coalesce((SELECT (l ->> 'a_surveiller') FROM jsonb_array_elements(public.releves_morts_veille(7, 500) -> 'lignes') l
                  WHERE l ->> 'uid' = '4cd4d9ae' AND l ->> 'platform' = 'leboncoin'), 'absente'),
       true;
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'A1b avant : veille, nombre de lignes', 'relu après la migration (C5b)',
       jsonb_array_length(public.releves_morts_veille(7, 500) -> 'lignes')::text, true;
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'A2 avant : public.surveillance_releves() n''existe pas', 'absente',
       CASE WHEN to_regprocedure('public.surveillance_releves()') IS NULL THEN 'absente' ELSE 'DÉJÀ LÀ' END,
       to_regprocedure('public.surveillance_releves()') IS NULL;

-- ═══ B. LA MIGRATION (son contenu exact, sans BEGIN/COMMIT) ═══════════════
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

-- ═══ C. APRÈS ═════════════════════════════════════════════════════════════
-- C1. La RPC vue PAR lesmillesetunepepite : chaque ligne, telle que l'app la lira.
DO $c1$
DECLARE v jsonb; t0 timestamptz; ms numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '4cd4d9ae-7165-4750-860f-6ecf747b1be0', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  t0 := clock_timestamp();
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v FROM public.surveillance_releves() s;
  ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C1 ligne ' || x.platform || ' (vue par lesmillesetunepepite)',
         CASE x.platform WHEN 'leboncoin' THEN 'non surveillée, 217 annonces' WHEN 'vinted' THEN 'non surveillée, 234 annonces' ELSE 'surveillée ou rien à surveiller' END,
         'relevé réussi ' || coalesce(to_char(x.dernier_releve_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), 'jamais')
           || ' · mur ' || coalesce(to_char(x.dernier_mur_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') || ' [' || x.dernier_mur_marqueur || ']', 'aucun')
           || ' · ' || x.annonces_en_ligne || ' annonce(s) · écartées autre compte ' || x.ecartees_autre_compte
           || ' · ' || CASE WHEN x.non_surveillee THEN 'NON SURVEILLÉE depuis ' || coalesce(x.jours::text, '?') || ' j' ELSE 'surveillée' END,
         CASE x.platform
           WHEN 'leboncoin' THEN x.non_surveillee AND x.annonces_en_ligne = 217
           WHEN 'vinted' THEN x.non_surveillee AND x.annonces_en_ligne = 234
           ELSE NOT x.non_surveillee END
    FROM jsonb_to_recordset(v) AS x(platform text, dernier_releve_le timestamptz, dernier_mur_le timestamptz, dernier_mur_marqueur text,
                                     annonces_en_ligne int, ecartees_autre_compte int, non_surveillee boolean, jours int);
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C1b durée de l''appel (rôle authenticated)', '< 200 ms', ms || ' ms', ms < 200;
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C1c ni eBay relié par l''API ni plateforme écartée ni Opla', 'aucune ligne opla ; ebay seulement hors voie API',
         coalesce((SELECT string_agg(e ->> 'platform', ', ' ORDER BY e ->> 'platform') FROM jsonb_array_elements(v) e), '(aucune)'),
         NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE e ->> 'platform' = 'opla')
         AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE e ->> 'platform' = 'ebay')
              OR NOT coalesce((SELECT ebay_voie_api FROM public.profiles WHERE id = '4cd4d9ae-7165-4750-860f-6ecf747b1be0'), false));
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C1d lignes non surveillées pour elle', 'leboncoin, vinted',
         coalesce((SELECT string_agg(e ->> 'platform', ', ' ORDER BY e ->> 'platform') FROM jsonb_array_elements(v) e WHERE (e ->> 'non_surveillee')::boolean), '(aucune)'),
         coalesce((SELECT string_agg(e ->> 'platform', ', ' ORDER BY e ->> 'platform') FROM jsonb_array_elements(v) e WHERE (e ->> 'non_surveillee')::boolean), '') = 'leboncoin, vinted';
END
$c1$;

-- C2. Sans session (aucun auth.uid()) : rien, jamais le compte d'un autre.
DO $c2$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO n FROM public.surveillance_releves();
  INSERT INTO _r (cas, attendu, obtenu, ok) SELECT 'C2 sans session : aucune ligne', '0', n::text, n = 0;
END
$c2$;

-- C3. Les droits : authenticated et service_role oui ; anon et PUBLIC non ; la veille reste au service_role.
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C3 droits surveillance_releves (anon / authenticated / service_role)', 'non / oui / oui',
       CASE WHEN has_function_privilege('anon', 'public.surveillance_releves()', 'EXECUTE') THEN 'oui' ELSE 'non' END || ' / '
       || CASE WHEN has_function_privilege('authenticated', 'public.surveillance_releves()', 'EXECUTE') THEN 'oui' ELSE 'non' END || ' / '
       || CASE WHEN has_function_privilege('service_role', 'public.surveillance_releves()', 'EXECUTE') THEN 'oui' ELSE 'non' END,
       NOT has_function_privilege('anon', 'public.surveillance_releves()', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.surveillance_releves()', 'EXECUTE')
       AND has_function_privilege('service_role', 'public.surveillance_releves()', 'EXECUTE');
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C3b droits releves_morts_veille (authenticated / service_role)', 'non / oui',
       CASE WHEN has_function_privilege('authenticated', 'public.releves_morts_veille(integer,integer)', 'EXECUTE') THEN 'oui' ELSE 'non' END || ' / '
       || CASE WHEN has_function_privilege('service_role', 'public.releves_morts_veille(integer,integer)', 'EXECUTE') THEN 'oui' ELSE 'non' END,
       NOT has_function_privilege('authenticated', 'public.releves_morts_veille(integer,integer)', 'EXECUTE')
       AND has_function_privilege('service_role', 'public.releves_morts_veille(integer,integer)', 'EXECUTE');
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C3c SECURITY DEFINER, STABLE, sans paramètre', 'oui',
       CASE WHEN p.prosecdef AND p.provolatile = 's' AND p.pronargs = 0 THEN 'oui' ELSE 'NON' END,
       p.prosecdef AND p.provolatile = 's' AND p.pronargs = 0
  FROM pg_proc p WHERE p.oid = 'public.surveillance_releves()'::regprocedure;

-- C4. Le parc : chaque compte actif (extension vue < 24 h), vu PAR lui-même.
DO $c4$
DECLARE u record; v jsonb; t0 timestamptz; ms numeric; max_ms numeric := 0; tot_ms numeric := 0; nb int := 0;
        couples text[] := '{}'; comptes int := 0; annonces int := 0; un boolean;
BEGIN
  FOR u IN SELECT p.id, p.email FROM public.profiles p WHERE p.extension_last_seen_at > now() - interval '24 hours' ORDER BY p.email LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    t0 := clock_timestamp();
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v FROM public.surveillance_releves() s;
    ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
    max_ms := greatest(max_ms, ms); tot_ms := tot_ms + ms; nb := nb + 1;
    un := false;
    FOR i IN 0 .. jsonb_array_length(v) - 1 LOOP
      IF (v -> i ->> 'non_surveillee')::boolean THEN
        couples := couples || (split_part(u.email, '@', 1) || ' ' || (v -> i ->> 'platform') || ' ' || (v -> i ->> 'annonces_en_ligne'));
        annonces := annonces + (v -> i ->> 'annonces_en_ligne')::int;
        un := true;
      END IF;
    END LOOP;
    IF un THEN comptes := comptes + 1; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C4 parc : couples compte × plateforme non surveillés (lu le 18/10 17:15 : 8 couples, 6 comptes, 654 annonces)',
         'entre 1 et 30 couples (le parc bouge)',
         coalesce(array_length(couples, 1), 0) || ' couples, ' || comptes || ' comptes, ' || annonces || ' annonces : ' || array_to_string(couples, ' · '),
         coalesce(array_length(couples, 1), 0) BETWEEN 1 AND 30;
  INSERT INTO _r (cas, attendu, obtenu, ok)
  SELECT 'C4b parc : durée par compte (' || nb || ' comptes)', 'max < 200 ms',
         'max ' || round(max_ms, 1) || ' ms, moyenne ' || round(tot_ms / greatest(nb, 1), 1) || ' ms', max_ms < 200;
END
$c4$;

-- C5. La veille de l'ops-digest : plus de double compte.
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C5 veille, lesmillesetunepepite Leboncoin (annonces distinctes)', '217',
       coalesce((SELECT (l ->> 'a_surveiller') FROM jsonb_array_elements(public.releves_morts_veille(7, 500) -> 'lignes') l
                  WHERE l ->> 'uid' = '4cd4d9ae' AND l ->> 'platform' = 'leboncoin'), 'absente'),
       (SELECT (l ->> 'a_surveiller')::int FROM jsonb_array_elements(public.releves_morts_veille(7, 500) -> 'lignes') l
         WHERE l ->> 'uid' = '4cd4d9ae' AND l ->> 'platform' = 'leboncoin') = 217;
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C5b veille : autant de lignes qu''avant (seul le compte change)',
       (SELECT obtenu FROM _r WHERE cas LIKE 'A1b %') || ' lignes',
       jsonb_array_length(public.releves_morts_veille(7, 500) -> 'lignes') || ' lignes',
       jsonb_array_length(public.releves_morts_veille(7, 500) -> 'lignes')::text = (SELECT obtenu FROM _r WHERE cas LIKE 'A1b %');
INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'C5c index sync_import_ecartes_user_date posé', 'présent',
       CASE WHEN to_regclass('public.sync_import_ecartes_user_date') IS NOT NULL THEN 'présent' ELSE 'ABSENT' END,
       to_regclass('public.sync_import_ecartes_user_date') IS NOT NULL;

-- ═══ D. L'INVERSE (son contenu exact, sans BEGIN/COMMIT) ═══════════════════
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

INSERT INTO _r (cas, attendu, obtenu, ok)
SELECT 'D1 inverse : surveillance_releves et l''index disparaissent, la veille retrouve son corps de prod',
       'absente / absent / 6db6781d…',
       CASE WHEN to_regprocedure('public.surveillance_releves()') IS NULL THEN 'absente' ELSE 'PRÉSENTE' END || ' / '
       || CASE WHEN to_regclass('public.sync_import_ecartes_user_date') IS NULL THEN 'absent' ELSE 'PRÉSENT' END || ' / '
       || left(md5(pg_get_functiondef('public.releves_morts_veille(integer,integer)'::regprocedure)), 8) || '…',
       to_regprocedure('public.surveillance_releves()') IS NULL
       AND to_regclass('public.sync_import_ecartes_user_date') IS NULL
       AND md5(pg_get_functiondef('public.releves_morts_veille(integer,integer)'::regprocedure)) = '6db6781d3d214a04e7649b4560b402fb';

SELECT ordre, cas, attendu, obtenu, ok FROM _r ORDER BY ordre;

ROLLBACK;
