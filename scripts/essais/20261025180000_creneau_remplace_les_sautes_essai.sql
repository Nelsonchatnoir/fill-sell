-- ESSAI (BEGIN … ROLLBACK) de la PROPOSITION 20261025 creneau_remplace_les_sautes — NE LAISSE RIEN.
-- Jouer : npx supabase db query --linked -f scripts/essais/PROPOSITION_20261025_creneau_remplace_les_sautes_essai.sql
-- La sortie est la DERNIÈRE requête (une ligne par constat, colonnes ordre / section / ligne) ; tout le reste est annulé.
-- Comptes (par identifiant) : jocabroc8 53efea05, josephinecerni afeef3c7, xxewwer de63ca45, louis faf5021a, meminiandmove 63ad8597 (leurs plateformes à republication planifiée active).
-- 1. candidats AVANT (fonctions de prod) ; 2. balayage avec l'ANCIENNE règle (sous-transaction annulée) ;
-- 3. corps de la proposition (garde md5 comprise) ; 4. candidats APRÈS ; 5. balayage avec la NOUVELLE règle ;
-- 6. sorties ; ROLLBACK. lock_timeout 3 s : si le cron tient une ligne, l'essai échoue au lieu d'attendre.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '3s';

CREATE TEMP TABLE essai_sortie (ordre serial, section text, ligne jsonb) ON COMMIT DROP;
CREATE TEMP TABLE essai_comptes ON COMMIT DROP AS
SELECT p.id AS uid, split_part(p.email, '@', 1) AS email, pf
FROM profiles p CROSS JOIN unnest(republish_planifiee_plateformes()) pf
WHERE p.id IN ('53efea05-dc2d-4467-a8cd-c6fa52a47a61', 'afeef3c7-0b0b-408c-a25b-3823448e3eb1', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', 'faf5021a-479a-4bb3-b3ec-c296770739b7', '63ad8597-4fee-4277-9a69-14ad44af1896')
  AND COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false);
CREATE TEMP TABLE essai_cand (phase text, email text, pf text, inv_id bigint, item_id text, boutique text, titre text, motif text, rang integer) ON COMMIT DROP;
CREATE TEMP TABLE essai_mesures (phase text, email text, pf text, n integer, ms integer) ON COMMIT DROP;
CREATE TEMP TABLE essai_balayage (phase text, sortie jsonb, ms integer) ON COMMIT DROP;
CREATE TEMP TABLE essai_creneaux (phase text, id bigint, email text, platform text, statut text, prevues integer, sautes jsonb) ON COMMIT DROP;

-- ── 1. AVANT : les fonctions de prod ─────────────────────────────────────────

INSERT INTO essai_cand (phase, email, pf, inv_id, item_id, boutique, titre, motif, rang)
SELECT 'avant', k.email, k.pf, c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
FROM essai_comptes k
CROSS JOIN LATERAL republish_planifiee_candidats(k.uid, republish_planifiee_reglage(k.uid, k.pf), k.pf) c;
DO $m$
DECLARE r record; t0 timestamptz; n integer;
BEGIN
  FOR r IN SELECT * FROM essai_comptes LOOP
    t0 := clock_timestamp();
    SELECT count(*) INTO n FROM republish_planifiee_candidats(r.uid, republish_planifiee_reglage(r.uid, r.pf), r.pf);
    INSERT INTO essai_mesures VALUES ('avant', r.email, r.pf, n,
      round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer);
  END LOOP;
END $m$;
INSERT INTO essai_creneaux
SELECT 'avant', r.id, split_part(p.email, '@', 1), r.platform, r.statut, r.prevues, r.sautes
FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id
WHERE r.statut = 'en_cours';

-- ── 2. Le balayage d'AUJOURD'HUI, ancienne règle : joué puis ANNULÉ (sous-transaction levée), ses
--     résultats gardés dans des variables (une variable PL/pgSQL survit à l'annulation, la base non).
DO $b$
DECLARE t0 timestamptz := clock_timestamp(); v jsonb; v_cr jsonb; v_ms integer;
BEGIN
  BEGIN
    v := public.republish_planifiee_sweep();
    v_ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer;
    SELECT jsonb_agg(jsonb_build_object('id', r.id, 'email', split_part(p.email, '@', 1), 'platform', r.platform, 'statut', r.statut,
                                        'prevues', r.prevues, 'sautes', r.sautes))
      INTO v_cr
    FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id
    WHERE r.statut = 'en_cours' OR r.updated_at >= now();
    RAISE EXCEPTION 'essai : on annule le balayage ancienne règle' USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
    NULL;  -- tout ce que l'ancien balayage a écrit est annulé ; v, v_ms, v_cr restent
  END;
  INSERT INTO essai_balayage VALUES ('ancienne_regle', v, v_ms);
  INSERT INTO essai_creneaux
  SELECT 'ancienne_regle', (e ->> 'id')::bigint, e ->> 'email', e ->> 'platform', e ->> 'statut', (e ->> 'prevues')::integer, e -> 'sautes'
  FROM jsonb_array_elements(COALESCE(v_cr, '[]'::jsonb)) e;
END $b$;

-- ── 3. LA PROPOSITION (garde md5 + fonctions) ───────────────────────────────
DO $garde$
DECLARE v_ecart text := '';
BEGIN
  IF md5(pg_get_functiondef('public.republish_planifiee_sweep()'::regprocedure)) <> '6f146a071cbcb51508b64d881d67ca99' THEN
    v_ecart := v_ecart || ' republish_planifiee_sweep'; END IF;
  IF md5(pg_get_functiondef('public.republish_planifiee_candidats(uuid,jsonb,text)'::regprocedure)) <> '77fd309ebdd99d40b89ad2faa1f64a09' THEN
    v_ecart := v_ecart || ' republish_planifiee_candidats'; END IF;
  IF md5(pg_get_functiondef('public.republish_planifiee_etat(text)'::regprocedure)) <> 'fdb1ed209a2563020de423d55086113f' THEN
    v_ecart := v_ecart || ' republish_planifiee_etat'; END IF;
  IF v_ecart <> '' THEN
    RAISE EXCEPTION 'La prod a changé depuis la proposition du 25/10 (%): relire pg_get_functiondef et refaire la proposition.', v_ecart;
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.republish_essai_saute(p_status text, p_pf jsonb, p_error text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- (25/10, Jocabroc 53efea05) UN ESSAI SAUTÉ : une republication de portée ARTICLE
  -- (republish_echec_portee) arrêtée SANS RIEN avoir retiré ni redéposé — annonce introuvable,
  -- question, garde — close ou en attente. Ce n'est pas une republication : le créneau rend sa
  -- place et son rythme au candidat suivant. Marques d'un retrait engagé ou d'un dépôt tenté :
  -- la liste de _shared/accident-avant-retrait.js (MARQUES_RETRAIT_OU_DEPOT), mot pour mot.
  -- Une panne du COMPTE (session, anti-robot, compte bloqué…) n'est jamais un sauté.
  SELECT COALESCE(p_status, '') IN ('cancelled', 'failed', 'needs_user')
     AND COALESCE(p_pf ->> 'republish_step', 'a_capturer') IN ('a_capturer', 'captured')
     AND NOT (COALESCE(p_pf, '{}'::jsonb) ?| ARRAY['deleted_at', 'deleted_at_serveur', 'deleted_at_client',
           'suppression_verdict', 'republish_suppression_envoyee', 'recreation_tentee', 'recreation_envois',
           'recreation_depot_parti', 'depot_parti_vers_profil', 'new_vinted_item_id'])
     AND COALESCE(public.republish_echec_portee(p_status, p_pf, p_error), '') = 'article'
$function$;

REVOKE ALL ON FUNCTION public.republish_essai_saute(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_essai_saute(text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.republish_planifiee_candidats(p_user uuid, p_reglage jsonb, p_platform text DEFAULT 'vinted'::text)
 RETURNS TABLE(inv_id bigint, item_id text, boutique text, titre text, motif text, rang integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_age integer := LEAST(365, GREATEST(7, COALESCE(NULLIF(p_reglage ->> 'age_jours', '')::integer, 30)));
  v_seuil timestamptz;
  v_ordre text := COALESCE(p_reglage ->> 'ordre', 'anciennes');
  v_premier date; v_probant boolean;
BEGIN
  v_seuil := now() - make_interval(days => v_age);

  IF v_pf <> 'vinted' THEN
    RETURN QUERY
    WITH base AS (
      SELECT i.id, i.titre, i.prix_vente, d.listing_id, d.mise_en_ligne
      FROM inventaire i
      JOIN LATERAL (
        SELECT COALESCE(NULLIF(trim(j.platform_listing_id), ''), NULL) AS listing_id,
               -- (11/10, Nico) L'ANCIENNETÉ D'UNE ANNONCE IMPORTÉE est sa date de
               -- mise en ligne RÉELLE, lue sur la plateforme au relevé
               -- (annonces_plateforme.publiee_le ; Leboncoin :
               -- first_publication_date) — plus la date d'IMPORT, que portait
               -- le job du relevé (handler_build 'releve-annonces'). Date
               -- illisible, absente ou postérieure au job : la date du job,
               -- comme avant (jamais une republication à l'aveugle). Un dépôt
               -- ou une republication FillSell garde sa propre date.
               COALESCE(
                 CASE WHEN j.handler_build ~* '^releve-annonces' THEN (
                   SELECT a.publiee_le FROM annonces_plateforme a
                   WHERE a.user_id = p_user AND a.platform = v_pf
                     AND a.listing_id = NULLIF(trim(j.platform_listing_id), '')
                     AND a.publiee_le IS NOT NULL
                     AND a.publiee_le <= COALESCE(j.published_at, j.created_at)
                   ORDER BY a.publiee_le ASC
                   LIMIT 1) END,
                 COALESCE(j.published_at, j.created_at)) AS mise_en_ligne,
               j.photos
        FROM cross_post_jobs j
        WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = v_pf
          AND j.action IN ('publish', 'republish') AND j.status = 'published'
          AND NULLIF(trim(j.listing_url), '') IS NOT NULL
        ORDER BY COALESCE(j.published_at, j.created_at) DESC
        LIMIT 1
      ) d ON true
      WHERE i.user_id = p_user
        AND i.statut = 'stock'
        AND i.disparu_le IS NULL
        -- 24/09 : alignée sur spend_coins_and_republish (756f090). Les photos
        -- viennent du job source, SINON de la fiche (article importé ou
        -- rattaché par un relevé). Hors Opla, la fiche n'est acceptée que si
        -- TOUTES ses photos sont sur notre Storage (retrait puis redépôt : une
        -- photo de CDN de plateforme ne se télécharge pas). Opla modifie en
        -- place et n'envoie pas d'images.
        AND (
          (jsonb_typeof(d.photos) = 'array' AND jsonb_array_length(d.photos) > 0)
          OR (
            jsonb_typeof(i.photos) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL)
            AND (v_pf = 'opla' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL
                AND trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                              THEN a.v #>> '{}' ELSE a.v ->> 'url' END)
                    !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/'))
          )
        )
        AND d.mise_en_ligne < v_seuil
        -- (10/10, Nico) UNE PLATEFORME QUI INTERDIT L'ARTICLE ne le voit jamais
        -- repartir en republication AUTOMATIQUE. Le verdict est posé sur un de
        -- ses jobs, sous la clé `<plateforme>_interdit`, par get-pending-jobs
        -- (aujourd'hui Depop : _shared/depop-interdits.js, la table unique —
        -- jamais recopiée ici). Une fois vu interdit, l'article n'est plus
        -- candidat sur cette plateforme : aucun job, aucune question, aucun
        -- créneau consommé. L'annonce en ligne n'est pas touchée.
        AND NOT EXISTS (
          SELECT 1 FROM cross_post_jobs x
          WHERE x.inventaire_id = i.id AND x.user_id = p_user AND x.platform = v_pf
            AND x.platform_fields ? (v_pf || '_interdit'))
    ),
    dernier AS (
      SELECT DISTINCT ON (j.inventaire_id)
        j.inventaire_id AS inv, j.status, j.published_at, j.created_at
      FROM cross_post_jobs j
      WHERE j.user_id = p_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.inventaire_id IN (SELECT b.id FROM base b)
      ORDER BY j.inventaire_id, j.created_at DESC
    )
    SELECT b.id, b.listing_id, NULL::text, b.titre,
      CASE
        WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
        WHEN d.status = 'needs_user' THEN 'attente_decision'
        WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
        WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
        -- (24/10, lot « zéro blocage », A4 — louis fa5c6f20) Une annonce VENDUE sur CET identifiant — le relevé a lu
        -- la vente (transaction_plateforme 'sold'), ou le dépôt porte le signal 'sold' — ne repart jamais en
        -- republication automatique : la republication serait arrêtée « introuvable » avant tout retrait.
        WHEN EXISTS (
          SELECT 1 FROM annonces_plateforme a
           WHERE a.user_id = p_user AND a.platform = v_pf AND a.listing_id = b.listing_id
             AND a.transaction_plateforme = 'sold')
          OR EXISTS (
          SELECT 1 FROM cross_post_jobs x
           WHERE x.user_id = p_user AND x.inventaire_id = b.id AND x.platform = v_pf
             AND NULLIF(trim(x.platform_listing_id), '') = b.listing_id
             AND x.status = 'published' AND x.platform_fields ->> 'sale_signal' = 'sold')
        THEN 'annonce_vendue'
        -- (23/10, point 3 — Louis) Une annonce dont l'ABSENCE est établie — signalée « plus en ligne » (sale_signal
        -- 'unavailable') ou republication close « disparue » (annonce_disparue), sur CET identifiant — et qu'aucun relevé
        -- n'a revue depuis ne repart pas en republication automatique : chaque nuit, une republication recréée pour une
        -- annonce morte se mettait en pause chez la personne. Un relevé qui revoit l'identifiant lève la garde de lui-même.
        WHEN EXISTS (
          SELECT 1 FROM cross_post_jobs x
           WHERE x.user_id = p_user AND x.inventaire_id = b.id AND x.platform = v_pf
             AND NULLIF(trim(x.platform_listing_id), '') = b.listing_id
             AND ((x.status = 'published' AND x.platform_fields ->> 'sale_signal' = 'unavailable')
                  OR (x.action = 'republish' AND x.platform_fields ? 'annonce_disparue'))
             AND NOT EXISTS (
               SELECT 1 FROM annonces_plateforme a
                WHERE a.user_id = p_user AND a.platform = v_pf AND a.listing_id = b.listing_id
                  AND a.vu_le > COALESCE(public._ts_ou_null(x.platform_fields ->> 'unavailable_since'),
                                         public._ts_ou_null(x.platform_fields #>> '{annonce_disparue,at}'),
                                         x.created_at)))
        THEN 'annonce_introuvable'
        ELSE NULL
      END,
      (row_number() OVER (ORDER BY
         CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
         b.mise_en_ligne ASC, b.id ASC))::integer
    FROM base b
    LEFT JOIN dernier d ON d.inv = b.id
    ORDER BY 6;
    RETURN;
  END IF;

  -- ── VINTED : inchangé depuis le 12/09 ────────────────────────────────────
  SELECT min(s.captured_on) INTO v_premier FROM vinted_listing_snapshots s WHERE s.user_id = p_user;
  v_probant := v_premier IS NOT NULL AND v_premier <= v_seuil::date;

  RETURN QUERY
  WITH base AS (
    SELECT i.id, i.vinted_item_id, i.vinted_account_id, i.titre, i.prix_vente, i.vinted_view_count, i.listed_at_guess
    FROM inventaire i
    WHERE i.user_id = p_user
      AND i.statut = 'stock'
      AND i.vinted_item_id IS NOT NULL
      AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
      AND (i.vinted_status IS NULL OR i.vinted_status NOT IN ('hidden', 'draft'))
      AND i.disparu_le IS NULL
      AND i.listed_at_guess IS NOT NULL
      AND i.listed_at_guess < v_seuil
  ),
  dernier AS (
    SELECT DISTINCT ON (j.platform_fields ->> 'vinted_item_id')
      j.platform_fields ->> 'vinted_item_id' AS item, j.status, j.published_at, j.created_at
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.action = 'republish'
      AND j.platform_fields ->> 'vinted_item_id' IN (SELECT b.vinted_item_id FROM base b)
    ORDER BY j.platform_fields ->> 'vinted_item_id', j.created_at DESC
  ),
  -- (24/10, lot « zéro blocage », A5 — jocabroc8 d4281e1d / fde3d484) Une annonce Vinted dont la republication a été
  -- close « disparue » (annonce_disparue) et qu'aucun relevé n'a revue en ligne depuis ne repart pas en republication
  -- automatique (la règle du 23/10 ne couvrait que les autres plateformes). Un relevé qui la revoit lève la garde.
  disparues AS (
    SELECT x.platform_fields ->> 'vinted_item_id' AS item,
           max(COALESCE(public._ts_ou_null(x.platform_fields #>> '{annonce_disparue,at}'), x.created_at)) AS le
    FROM cross_post_jobs x
    WHERE x.user_id = p_user AND x.action = 'republish' AND x.platform = 'vinted'
      AND x.platform_fields ? 'annonce_disparue'
      AND x.platform_fields ->> 'vinted_item_id' IN (SELECT b.vinted_item_id FROM base b)
    GROUP BY 1
  ),
  -- (25/10, Jocabroc 53efea05) L'ABSENCE PROUVÉE PAR LES RELEVÉS, AVANT TOUT ESSAI. Une annonce
  -- absente de DEUX relevés COMPLETS du dressing de SA boutique commencés après sa dernière vue
  -- (vinted_listing_snapshots, par son identifiant EXACT) n'est plus en ligne : elle ne part plus
  -- en republication automatique. C'est la preuve qui clôt une pause « introuvable »
  -- (_shared/introuvable-a-confirmer.js, releveComplet : 'done', lus ≥ annoncés, non vide, fini,
  -- ni « [incomplet] » ni « disparitions non marquées » ni « n'a pas rendu sa liste », dressing de
  -- la boutique de l'annonce) — sans attendre qu'un essai échoue. Le 23/10, trois des quatre
  -- republications de Jocabroc visaient des annonces absentes du dressing depuis le 02, le 07 et
  -- le 10/10 (10117159001 tentée les 17, 19 et 23/10) : trois places du créneau perdues. Jamais
  -- vue par un relevé, ou boutique inconnue : aucune preuve, rien ne change. Un relevé qui la
  -- revoit lève la garde de lui-même. Aucune fiche n'est modifiée.
  releves AS (
    SELECT trim(r.vinted_user_id) AS boutique, r.started_at
    FROM vinted_sync_runs r
    WHERE r.user_id = p_user AND r.kind = 'dressing' AND r.status = 'done'
      AND r.total_entries IS NOT NULL AND r.total_entries >= 0
      AND r.items_vus >= r.total_entries AND r.items_vus > 0
      AND r.finished_at IS NOT NULL
      AND NULLIF(trim(r.vinted_user_id), '') IS NOT NULL
      AND COALESCE(r.erreur, '') !~* '(\[incomplet\]|disparitions non marquées|n''a pas rendu sa liste)'
      AND r.started_at > now() - interval '60 days'
  ),
  absentes AS (
    SELECT b.vinted_item_id AS item
    FROM base b
    JOIN LATERAL (
      SELECT max(s.captured_at) AS le FROM vinted_listing_snapshots s
       WHERE s.user_id = p_user AND s.vinted_item_id = b.vinted_item_id
    ) v ON v.le IS NOT NULL
    WHERE NULLIF(trim(b.vinted_account_id), '') IS NOT NULL
      AND (SELECT count(*) FROM releves rl
            WHERE rl.boutique = trim(b.vinted_account_id)
              AND rl.started_at > v.le + interval '1 minute') >= 2
  ),
  snap AS (
    SELECT s.vinted_item_id AS item, min(s.captured_on) AS premier
    FROM vinted_listing_snapshots s
    WHERE v_probant AND s.user_id = p_user
      AND s.vinted_item_id IN (SELECT b.vinted_item_id FROM base b)
    GROUP BY s.vinted_item_id
  )
  SELECT b.id, b.vinted_item_id, b.vinted_account_id, b.titre,
    CASE
      WHEN d.status IN ('pending', 'processing') THEN 'en_cours'
      WHEN d.status = 'needs_user' THEN 'attente_decision'
      WHEN d.status = 'failed' AND d.created_at > now() - interval '24 hours' THEN 'echec_recent'
      WHEN d.status = 'published' AND d.published_at > now() - interval '24 hours' THEN 'republiee_recemment'
      WHEN v_probant AND sn.premier IS NOT NULL AND sn.premier > v_seuil::date THEN 'observee_trop_recente'
      WHEN (di.item IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM vinted_listing_snapshots s
         WHERE s.user_id = p_user AND s.vinted_item_id = b.vinted_item_id
           AND s.status = 'active' AND s.captured_on > di.le::date))
        OR ab.item IS NOT NULL  -- (25/10) absente de deux relevés complets de sa boutique
      THEN 'annonce_introuvable'
      ELSE NULL
    END,
    (row_number() OVER (ORDER BY
       CASE WHEN v_ordre = 'prix' THEN b.prix_vente END DESC NULLS LAST,
       CASE WHEN v_ordre = 'vues'
            THEN b.vinted_view_count::numeric / GREATEST(1, extract(epoch FROM (now() - b.listed_at_guess)) / 86400)
       END ASC NULLS LAST,
       b.listed_at_guess ASC, b.id ASC))::integer
  FROM base b
  LEFT JOIN dernier d ON d.item = b.vinted_item_id
  LEFT JOIN snap sn ON sn.item = b.vinted_item_id
  LEFT JOIN disparues di ON di.item = b.vinted_item_id
  LEFT JOIN absentes ab ON ab.item = b.vinted_item_id
  ORDER BY 6;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_pf         text;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_cle        text;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
  -- 18/09 : multiplateforme
  v_palier     text;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
  v_duree      integer;  -- (08/10, Louis) durée estimée d'une republication
  v_fin_regl   timestamptz;  -- (11/10, Louis) fin du créneau selon le RÉGLAGE courant
  v_debut_ryt  timestamptz;  -- (11/10) départ du rythme (réalignement compris)
  v_prev_ryt   integer;      -- (11/10) prévues comptées depuis ce départ
  v_portee     text;         -- (12/10, A4) portée d'un échec : compte | article
  -- (25/10, Jocabroc 53efea05) la place d'un candidat sauté est rendue ; toute retenue dit son motif
  v_reels_cr    integer;     -- jobs du créneau qui ont agi, agissent ou vont agir (non sautés)
  v_sautes_cr   integer;     -- essais sautés du créneau (republish_essai_saute)
  v_remplace    boolean;     -- la place des sautés est-elle encore rendue ? (au plus `prevues`)
  v_dernier_pf  text;        -- plateforme de la republication qui fixe le rythme
  v_prochaine   timestamptz; -- l'heure à laquelle le rythme laisse partir la suivante
  v_job_cree_pf boolean;     -- un job est né pour CETTE plateforme pendant ce passage
  v_sortie_cpt  boolean;     -- le passage s'est arrêté sur un refus du COMPTE
  v_tentes      integer;     -- candidats éligibles soumis au RPC pendant ce passage
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;
  SELECT value INTO v_disj_max FROM coin_config WHERE key = 'republish_disjoncteur_echecs';
  v_disj_max := GREATEST(1, COALESCE(v_disj_max, 2));
  SELECT value INTO v_grace FROM coin_config WHERE key = 'republish_palier_perdu_grace_h';
  v_grace := GREATEST(1, COALESCE(v_grace, 48));

  -- Les comptes qui ont AU MOINS UNE plateforme active.
  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM unnest(republish_planifiee_plateformes()) pf
      WHERE COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false)
    )
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_cree := false;

    -- 0. LE DROIT. Un compte actif sans palier Pro : on pose la date, puis on
    -- arrête au-delà de la grâce — une seule fois, pour les quatre.
    v_palier := republish_palier(v_compte.id);
    IF v_palier NOT IN ('pro', 'business') THEN
      SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_compte.id FOR UPDATE;
      FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
        v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
        CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object'
                   OR NOT COALESCE((v_cur ->> 'actif')::boolean, false);
        v_perdu := NULLIF(v_cur ->> 'palier_perdu_le', '')::timestamptz;
        IF v_perdu IS NULL THEN
          v_cur := v_cur || jsonb_build_object('palier_perdu_le', now());
        ELSIF v_perdu < now() - make_interval(hours => v_grace) THEN
          v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                               'arret_motif', 'palier_perdu');
        ELSE
          CONTINUE;
        END IF;
        v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
      END LOOP;
      UPDATE profiles SET platform_settings = v_ps WHERE id = v_compte.id;
      CONTINUE;
    END IF;

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOR v_pf IN
      SELECT pf FROM unnest(republish_planifiee_plateformes()) AS pf
      ORDER BY (SELECT count(*) FROM cross_post_jobs j
                 WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = pf
                   AND j.platform_fields ->> 'republish_source' = 'auto'
                   AND j.created_at >= date_trunc('day', now())) ASC,  -- MODIF FAMINE 2026-09-24 : la plateforme la MOINS servie aujourd hui passe d abord (tour de role), au lieu de Vinted toujours en tete
               array_position(republish_planifiee_plateformes(), pf)
    LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.

      v_regl := republish_planifiee_reglage(v_compte.id, v_pf);
      CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
      -- Interrupteur de la plateforme (fail-closed).
      CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
      -- La date de palier perdu n'a plus lieu d'être : le droit est là.
      IF v_regl ->> 'palier_perdu_le' IS NOT NULL THEN
        UPDATE profiles
           SET platform_settings = jsonb_set(platform_settings, ARRAY[v_pf, 'republish_planifiee'],
                 (platform_settings #> ARRAY[v_pf, 'republish_planifiee']) - 'palier_perdu_le', true)
         WHERE id = v_compte.id;
      END IF;

      -- 2. Hors créneau → rien. Un créneau manqué n'est jamais rattrapé.
      v_fen := republish_planifiee_fenetre(v_regl, now());
      CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

      v_minuit := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));

      -- 2bis. DISJONCTEUR DU JOUR : cette plateforme s'est-elle déjà arrêtée
      -- aujourd'hui ? (note posée sur un créneau de la journée locale)
      IF EXISTS (
        SELECT 1 FROM republish_creneaux r
        WHERE r.user_id = v_compte.id AND r.platform = v_pf
          AND r.debut >= v_minuit AND r.sautes ? '_disjoncteur'
      ) THEN
        CONTINUE;
      END IF;

      IF v_pf = 'vinted' THEN
        v_ident    := republish_boutique_connectee(v_compte.id);
        v_boutique := v_ident ->> 'user_id';
        v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
      ELSE
        v_ident := NULL; v_boutique := NULL; v_multi := false;
      END IF;

      -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de
      -- compte : le nombre par jour CHOISI pour cette plateforme (NULL = aucun).
      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      SELECT count(*) INTO v_faits
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
        v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN v_plafond ELSE LEAST(GREATEST(1, v_plafond_b), v_plafond) END;
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
          AND j.platform_fields ->> 'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
      END IF;

      -- La ligne du créneau courant, créée au premier passage avec ce que le
      -- serveur ATTEND à cet instant (c'est ce que l'app annonce). La capacité
      -- est PARTAGÉE : le temps déjà réservé par les autres plateformes est
      -- déduit — un seul Chrome pour quatre files.
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
        AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      -- Boutique connue, aucune ligne à son nom : une ligne SANS boutique du
      -- même créneau est née avant que la sonde ne parle — elle lui appartient.
      -- On la BAPTISE, on n'en crée pas une seconde. (Baptiser n'est pas geler :
      -- l'autre boutique aura, elle, sa PROPRE ligne, parce que la lecture
      -- ci-dessus discrimine sur la boutique à chaque passage.)
      IF NOT FOUND AND v_boutique IS NOT NULL THEN
        UPDATE republish_creneaux
           SET boutique = v_boutique, updated_at = now()
         WHERE user_id = v_compte.id AND platform = v_pf
           AND debut = (v_fen ->> 'courant_debut')::timestamptz AND boutique IS NULL
        RETURNING * INTO v_row;
      END IF;
      -- Boutique INCONNUE alors que le créneau a déjà une ligne : on ne fabrique
      -- pas un doublon sans nom (il réserverait de la capacité pour les autres
      -- plateformes sans jamais rien produire). On reprend celle qui existe.
      IF NOT FOUND AND v_boutique IS NULL THEN
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf
          AND debut = (v_fen ->> 'courant_debut')::timestamptz
        ORDER BY updated_at DESC LIMIT 1;
      END IF;
      IF NOT FOUND THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        -- MODIF FAMINE 2026-09-24 : part EGALE du creneau entre les plateformes actives+eligibles
        -- (republish_planifiee_actives_eligibles), au lieu de reserver tout le temps a la premiere
        -- (Vinted). Un compte mono-plateforme -> N=1 -> part pleine -> INCHANGE. On ne touche NI a
        -- l espacement (v_esp, propre a la plateforme), NI aux plafonds/quotas (LEAST plus bas).
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        INSERT INTO republish_creneaux
          (user_id, platform, jour, de, a, fuseau, debut, fin, statut, boutique,
           eligibles_debut, prevues, espacement_sec, extension_vue)
        VALUES
          (v_compte.id, v_pf, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
           COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
           (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
           v_elig, v_prevues, (v_esp ->> 'sec')::integer,
           v_compte.extension_last_seen_at > now() - interval '10 minutes')
        ON CONFLICT (user_id, platform, debut, (COALESCE(boutique, ''::text))) DO NOTHING;
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
          AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      END IF;

      -- 2ter. (11/10, Louis — @evat, plus rien après 14:00) LA LIGNE DU CRÉNEAU
      -- SUIT LE RÉGLAGE. Elle est retrouvée par son DÉBUT : déplacer la FIN du
      -- créneau (14:00 → 17:00 → 23:59) reprenait la ligne née avec l'ancienne
      -- fin — 6ter coupait tout à 14:00, la clôture la passait « ecourte », et
      -- l'app annonçait des republications que le balayage ne faisait plus.
      -- Désormais, une fin (ou des heures) qui ne sont plus celles du réglage
      -- RÉALIGNENT la ligne : nouvelle fin, ligne rouverte si la fin est à venir,
      -- prévues recalculées pour le TEMPS RESTANT exactement comme à la
      -- création (part égale, espacement réel, plafonds, éligibles), et le
      -- rythme repart de cet instant (6). Raccourcir le créneau le raccourcit
      -- aussi : plus rien ne part après la nouvelle fin (6ter).
      v_fin_regl := (v_fen ->> 'courant_fin')::timestamptz;
      IF v_row.id IS NOT NULL AND v_fin_regl IS NOT NULL
         AND (v_row.fin IS DISTINCT FROM v_fin_regl
              OR v_row.a IS DISTINCT FROM (v_regl ->> 'a')::time
              OR v_row.de IS DISTINCT FROM (v_regl ->> 'de')::time) THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM (v_fin_regl - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        -- (25/10) un essai SAUTÉ (republish_essai_saute) n'est pas une faite : sa place reste
        -- rendue après le réalignement (même lecture qu'en 6bis).
        SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error))
          INTO v_faits_cr FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        UPDATE republish_creneaux
           SET de = (v_regl ->> 'de')::time, a = (v_regl ->> 'a')::time,
               fin = v_fin_regl,
               prevues = v_faits_cr + v_prevues,
               espacement_sec = (v_esp ->> 'sec')::integer,
               statut = CASE WHEN v_fin_regl > now() THEN 'en_cours' ELSE statut END,
               sautes = (sautes - '_fin_de_creneau' - '_prevues_atteintes')
                        || jsonb_build_object('_reglage_change', jsonb_build_object(
                             'motif', 'reglage_change', 'platform', v_pf,
                             'fin_avant', v_row.fin, 'fin', v_fin_regl,
                             'prevues_avant', v_row.prevues, 'prevues', v_faits_cr + v_prevues,
                             'faites_avant', v_faits_cr, 'depuis', now(),
                             'statut_avant', v_row.statut, 'at', now())),
               updated_at = now()
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      -- (25/10, Jocabroc 53efea05) CETTE RETENUE DIT SON MOTIF. Le 24/10, Chrome est resté muet
      -- de 16:58 à 21:12 (heure de Paris) : le créneau Leboncoin s'est clos « manque » avec
      -- sautes = {} et l'app a dit « Rien n'est parti. 51 annonces étaient éligibles. ». Un ÉTAT
      -- daté, comme _bloque_en_vol : posé à la transition, levé au retour (leve_le) — jamais une
      -- ligne réécrite à chaque passage.
      IF v_compte.extension_last_seen_at IS NULL
         OR v_compte.extension_last_seen_at <= now() - interval '10 minutes' THEN
        IF NOT (v_row.sautes ? '_extension_absente') OR (v_row.sautes -> '_extension_absente' ? 'leve_le') THEN
          UPDATE republish_creneaux
             SET sautes = sautes || jsonb_build_object('_extension_absente', jsonb_build_object(
                   'motif', 'extension_absente', 'platform', v_pf,
                   'depuis', now(),
                   'premiere', COALESCE(v_row.sautes -> '_extension_absente' -> 'premiere', to_jsonb(now())),
                   'episodes', COALESCE((v_row.sautes -> '_extension_absente' ->> 'episodes')::integer, 0) + 1,
                   'derniere_vue', v_compte.extension_last_seen_at,
                   'at', now())),
                 updated_at = now()
           WHERE id = v_row.id;
        END IF;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_extension_absente' AND NOT (v_row.sautes -> '_extension_absente' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_extension_absente,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;
      -- ⛔ Plus de `boutique = COALESCE(boutique, v_boutique)` ici : c'était le
      -- gel. La ligne PORTE sa boutique depuis sa lecture ; une autre boutique
      -- ne réécrit plus celle-ci, elle obtient la sienne.
      IF NOT v_row.extension_vue THEN
        UPDATE republish_creneaux
           SET extension_vue = true, updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs DU COMPTE consécutifs de ce créneau,
      -- sur cette plateforme, sans réussite intercalée.
      -- (12/10, A4) Il comptait un échec d'ARTICLE (un failed quel qu'en soit
      -- le motif) comme une panne du compte, et ne voyait pas une panne du
      -- compte parquée en needs_user (session, anti-robot) : deux articles
      -- refusés arrêtaient la plateforme pour la journée. Désormais
      -- (republish_echec_portee) : seul un échec qui vient du COMPTE (session,
      -- anti-robot, compte bloqué, restriction Vinted, accès, boutique ouverte
      -- étrangère…) compte ; un article en échec ne bloque que lui — il ne
      -- compte pas et ne coupe pas la chaîne ; un job en cours (pending,
      -- processing sans cause du compte) l'arrête comme avant.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, j.platform_fields AS pf, j.error
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        v_portee := republish_echec_portee(v_j.status, v_j.pf, v_j.error);
        IF v_portee = 'compte' THEN v_disj_n := v_disj_n + 1;
        ELSIF v_portee = 'article' THEN CONTINUE;  -- un article en échec ne bloque que lui
        ELSE EXIT;  -- pending / processing sans cause du compte : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_compte_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME.
      -- (08/10, Louis) une suppression ENVOYÉE (pas encore prouvée) compte comme
      -- un retrait engagé : l'annonce est peut-être déjà hors ligne, le créneau attend.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted' OR j.platform_fields ? 'republish_suppression_envoyee'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)
                                AND COALESCE(republish_ts_safe(j.platform_fields, 'next_action_after'), now()) <= now()),  -- MODIF 2026-09-24 : un job PARQUE (reprise future : anti-robot 45 min, session 60 min) et sans suppression (step <> deleted) n'occupe pas le creneau ; il n'est plus compte en vol, le creneau continue avec un autre article, l'annonce parquee reste en ligne
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                                AND trim(i.vinted_account_id) <> v_boutique)
      INTO v_hors_ligne, v_mobiles, v_parques
      FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.status IN ('pending', 'processing');
      IF v_hors_ligne + v_mobiles > 0 THEN
        v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
        v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
          'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
          'platform', v_pf,
          'en_vol', v_hors_ligne + v_mobiles,
          'hors_ligne', v_hors_ligne,
          'parques_autre_boutique', v_parques,
          'boutique', v_boutique,
          'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
          'at', now());
        UPDATE republish_creneaux
           SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id;
      END IF;
      IF v_parques > 0 THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_parques_autre_boutique',
            jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
      END IF;

      -- 5. Le nombre par jour CHOISI pour la plateforme, s'il y en a un.
      -- (24/10, décision de Nico) Plus d'enveloppe de compte ni de plafond du palier.
      IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe.
      -- (11/10) Ligne réalignée sur un nouveau réglage : le rythme repart du
      -- réalignement, sur les prévues qui restaient à faire (sinon la fenêtre
      -- entière, comme avant). Jamais plus serré que la création ne l'aurait fait.
      v_debut_ryt := COALESCE(NULLIF(v_row.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_row.debut);
      v_prev_ryt := COALESCE(v_row.prevues, 1)
                    - CASE WHEN v_row.sautes ? '_reglage_change'
                           THEN COALESCE((v_row.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := extract(epoch FROM (v_row.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt);
      -- (25/10, Jocabroc 53efea05) LA PLACE D'UN CANDIDAT SAUTÉ EST RENDUE. Un essai de portée
      -- ARTICLE arrêté sans rien avoir retiré ni redéposé (republish_essai_saute : annonce
      -- introuvable, question, garde) n'est pas une republication : il ne compte ni dans les
      -- prévues du créneau (6bis) ni dans le rythme (6) — le candidat suivant prend sa place au
      -- passage suivant. Le 23/10, trois annonces mortes ont pris trois des six places Vinted et
      -- 1 h 30 de rythme (fde3d484, d4281e1d, 961f0a27). L'intervalle (durée / prévues) et la
      -- règle « un seul Chrome : le rythme est celui du COMPTE, toutes plateformes » (18/09) ne
      -- changent pas : deux republications qui ont AGI restent espacées comme avant. Les sautés
      -- rendus sont bornés à `prevues` par créneau (au-delà : comptés comme avant, motif
      -- _remplacements_epuises). Le nombre par jour choisi et le quota du mois comptent toujours
      -- tous les jobs nés (spend_coins_and_republish, étape 5) : intouchés.
      SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error)),
             count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error))
        INTO v_reels_cr, v_sautes_cr
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      v_remplace := v_sautes_cr <= COALESCE(v_row.prevues, 0);
      v_dernier := NULL; v_dernier_pf := NULL;
      SELECT j.created_at, j.platform INTO v_dernier, v_dernier_pf FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut
        AND (NOT v_remplace OR NOT republish_essai_saute(j.status, j.platform_fields, j.error))
      ORDER BY j.created_at DESC
      LIMIT 1;
      IF v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle) THEN
        -- (25/10) LE RYTHME QUI RETIENT LE DIT : la republication de référence (sa plateforme
        -- comprise) et l'heure qu'elle fixe ; apres_fin = plus rien ne pourra partir dans ce
        -- créneau. Une écriture par republication de référence, jamais à chaque passage. Le
        -- 24/10, Leboncoin (36 min) attendait derrière chaque republication Vinted (30 min) et
        -- n'est jamais passé, sans un mot.
        v_prochaine := v_dernier + make_interval(secs => v_intervalle);
        IF (v_row.sautes -> '_espacement' ->> 'dernier') IS DISTINCT FROM (to_jsonb(v_dernier) #>> '{}') THEN
          UPDATE republish_creneaux
             SET sautes = sautes || jsonb_build_object('_espacement', jsonb_build_object(
                   'motif', 'espacement', 'platform', v_pf,
                   'dernier', v_dernier, 'dernier_platform', v_dernier_pf,
                   'intervalle_s', round(v_intervalle)::integer,
                   'prochaine', v_prochaine,
                   'apres_fin', v_prochaine >= v_row.fin,
                   'at', now())),
                 updated_at = now()
           WHERE id = v_row.id;
        END IF;
        CONTINUE;
      END IF;
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ — compté (25/10) en jobs non sautés ;
      -- au-delà de `prevues` sautés, ils comptent comme avant et le créneau le dit.
      v_faits_cr := v_reels_cr + CASE WHEN v_remplace THEN 0 ELSE v_sautes_cr END;
      IF NOT v_remplace AND NOT (v_row.sautes ? '_remplacements_epuises') THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_remplacements_epuises', jsonb_build_object(
            'motif', 'remplacements_epuises', 'platform', v_pf,
            'sautes', v_sautes_cr, 'prevues', v_row.prevues, 'at', now())));
      END IF;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
        CONTINUE;
      END IF;

      -- 6ter. (08/10, Louis) JAMAIS UNE REPUBLICATION LANCÉE QUI NE PEUT PAS FINIR
      -- DANS LE CRÉNEAU. Le 06/10, la 9e republication Beebs de Louis est partie
      -- à 21:54 (créneau 19:00–22:00, ~20 min par republication Beebs) : sa
      -- suppression a eu lieu à 21:58, la remise en ligne tombait hors créneau.
      -- Il reste moins que la durée d'une republication sur cette plateforme pour
      -- ce compte (republish_duree_estimee) : on n'en lance plus, l'article
      -- reste en ligne, intact, et part au créneau suivant.
      v_duree := republish_duree_estimee(v_compte.id, v_pf);
      IF v_row.fin IS NOT NULL AND v_row.fin - now() < make_interval(secs => v_duree) THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_fin_de_creneau', jsonb_build_object('motif', 'fin_de_creneau', 'platform', v_pf,
            'reste_s', GREATEST(0, extract(epoch FROM v_row.fin - now())::integer), 'duree_s', v_duree, 'at', now())));
        CONTINUE;
      END IF;

      -- 7. Plafond de la boutique connectée (Vinted, calculé plus haut).
      IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;

      -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
      -- autres boutiques jamais pendant ce créneau (Vinted seul).
      -- (25/10, Jocabroc 53efea05) Les candidats lus : les 50 premiers ÉLIGIBLES et les 50
      -- premiers mis de côté, dans l'ordre du rang (100 au plus ; au plus 50 appels au RPC, comme
      -- avant). Avant, LIMIT 50 tombait sur les rangs bruts : cinquante annonces mises de côté en
      -- tête (Leboncoin « anciennes » : 83 introuvables sur 134 chez Jocabroc) cachaient tout
      -- éligible, et le passage finissait sans job et sans mot.
      v_notes := '{}'::jsonb; v_examines := 0;
      v_job_cree_pf := false; v_sortie_cpt := false; v_tentes := 0;
      FOR v_cand IN
        SELECT x.inv_id, x.item_id, x.boutique, x.titre, x.motif, x.rang
        FROM (
          SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang,
                 CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END AS ordre_b,
                 row_number() OVER (PARTITION BY (c.motif IS NULL)
                   ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                                 WHEN c.boutique IS NULL THEN 1
                                 ELSE 2 END, c.rang) AS n_groupe
          FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ) x
        WHERE x.n_groupe <= 50
        ORDER BY x.ordre_b, x.rang
        LIMIT 100
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          -- (25/10) Une annonce introuvable (ou vendue) le dit UNE fois : notée au premier créneau
          -- qui l'écarte, plus dans les suivants (30 jours) — et elle n'est plus jamais tentée.
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id)
             AND NOT (v_cand.motif IN ('annonce_introuvable', 'annonce_vendue') AND EXISTS (
               SELECT 1 FROM republish_creneaux r2
               WHERE r2.user_id = v_compte.id AND r2.platform = v_pf AND r2.id <> v_row.id
                 AND r2.debut > now() - interval '30 days'
                 AND r2.sautes -> v_cle ->> 'motif' = v_cand.motif)) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80),
                                 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                                 'titre', left(COALESCE(v_cand.titre, ''), 80), 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        -- (25/10) Un article n'est tenté qu'UNE fois par créneau : un essai sauté rend sa place
        -- au candidat SUIVANT, jamais à lui-même (une annulation ne le remet pas en tête).
        IF EXISTS (
          SELECT 1 FROM cross_post_jobs j
          WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
            AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
            AND j.inventaire_id = v_cand.inv_id) THEN
          CONTINUE;
        END IF;
        v_tentes := v_tentes + 1;

        -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
        BEGIN
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
          v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL, v_pf);
          PERFORM set_config('request.jwt.claims', '', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('request.jwt.claims', '', true);
          v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                      'message', left(SQLERRM, 200));
        END;
        v_reason := v_rpc ->> 'reason';

        v_ligne := jsonb_build_object(
          'compte', v_compte.email, 'platform', v_pf, 'inventaire_id', v_cand.inv_id,
          'vinted_item_id', v_cand.item_id, 'examines', v_examines,
          'creneau_id', v_row.id, 'boutique', v_boutique,
          'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
          'reason', v_reason);

        IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
          v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
          UPDATE cross_post_jobs
             SET platform_fields = platform_fields || jsonb_build_object(
                   'republish_moteur', 'serveur',
                   'republish_planifie', true,
                   'republish_creneau_id', v_row.id::text,
                   'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
           WHERE id = v_job;
          v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
          v_rapport := v_rapport || v_ligne;
          v_cree := true;
          v_job_cree_pf := true;
          EXIT;
        END IF;

        IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
          v_notes := v_notes || jsonb_build_object(v_cle,
            jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                               'titre', left(COALESCE(v_cand.titre, ''), 80),
                               'platform', v_pf, 'at', now()));
        END IF;
        v_rapport := v_rapport || v_ligne;
        -- Portée ARTICLE → candidat suivant ; portée COMPTE → on sort.
        -- (17/10) lien_annonce_incertain : le lien exact de CETTE annonce n'est pas sûr,
        -- seul cet article attend (spend_coins_and_republish, Amiral 317adae1).
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable', 'lien_annonce_incertain') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        v_sortie_cpt := true;
        EXIT;
      END LOOP;

      -- (25/10) Rien n'est né et rien ne l'a dit (tout candidat mis de côté, déjà tenté ou refusé
      -- pour lui-même) : le créneau le note, une fois.
      IF NOT v_job_cree_pf AND NOT v_sortie_cpt AND NOT (v_row.sautes ? '_aucun_candidat') THEN
        v_notes := v_notes || jsonb_build_object('_aucun_candidat', jsonb_build_object(
          'motif', 'aucun_candidat_eligible', 'platform', v_pf,
          'examines', v_examines, 'tentes', v_tentes, 'at', now()));
      END IF;

      IF v_notes <> '{}'::jsonb THEN
        PERFORM republish_creneau_noter(v_row.id, v_notes);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.republish_planifiee_etat(p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz;
  v_crees_pf integer; v_abouties_pf integer; v_crees_compte integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb; v_disjoncteur jsonb;
  v_ouverte boolean; v_en_ligne integer;
  v_cr republish_creneaux%ROWTYPE; v_faits_cr integer; v_debut_ryt timestamptz; v_prev_ryt integer;
  v_intervalle numeric; v_source_capacite text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('error', 'invalid_platform', 'platform', v_pf);
  END IF;

  v_palier := republish_palier(v_user);
  v_regl := republish_planifiee_reglage(v_user, v_pf);
  v_ouverte := republish_planifiee_pf_ouverte(v_pf);
  v_en_ligne := republish_planifiee_annonces_en_ligne(v_user, v_pf);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant), COMMUN
  -- à toutes les plateformes — une republication est une republication.
  IF v_palier IN ('premium', 'pro') THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      SELECT COALESCE(max(l.created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger l WHERE l.user_id = v_user AND l.kind IN ('grant_monthly', 'grant_upgrade');
      SELECT count(*) INTO v_faits_mois FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_cycle;
    ELSE
      v_quota := NULL;
    END IF;
  END IF;

  v_fuseau := COALESCE(v_regl ->> 'fuseau', 'Europe/Paris');
  v_minuit := republish_minuit_local(v_fuseau);
  -- Trois compteurs du jour : CETTE plateforme, le COMPTE (l'enveloppe), et le
  -- total manuel + auto (affichage).
  SELECT count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*)
  INTO v_crees_pf, v_abouties_pf, v_crees_compte, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  IF v_pf = 'vinted' THEN
    v_ident := republish_boutique_connectee(v_user);
    v_boutique := v_ident ->> 'user_id';
    v_boutiques := republish_boutiques(v_user);
    v_multi := jsonb_array_length(v_boutiques) >= 2;
  ELSE
    v_ident := NULL; v_boutique := NULL; v_boutiques := '[]'::jsonb; v_multi := false;
  END IF;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'platform', v_pf,
      'actif', false,
      'configure', v_regl IS NOT NULL,
      'ouverte', v_ouverte,
      'annonces_en_ligne', v_en_ligne,
      'reglage', v_regl,
      'palier', v_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'aujourdhui', jsonb_build_object(
        'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
        'crees_compte', v_crees_compte, 'crees_total', v_crees_total),
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
      'moteur', CASE WHEN v_pf = 'vinted' AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user, v_pf);

  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl, v_pf) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  -- « Ce dressing n'a pas été servi depuis X jours » : avec une ligne par
  -- boutique, la dernière fois qu'une boutique a été servie est lisible —
  -- max(debut) de SES créneaux. Avant la clé par boutique, ce chiffre
  -- n'existait pas : toutes les lignes portaient la première boutique vue.
  IF jsonb_array_length(v_boutiques) > 0 THEN
    SELECT COALESCE(jsonb_agg(b || jsonb_build_object(
             'vu_le', (SELECT max(r.debut) FROM republish_creneaux r
                        WHERE r.user_id = v_user AND r.platform = v_pf
                          AND r.boutique = b ->> 'user_id'),
             'eligibles', COALESCE((v_par_boutique ->> (b ->> 'user_id'))::integer, 0),
             'connectee', (b ->> 'user_id') IS NOT DISTINCT FROM v_boutique)
           ORDER BY o), '[]'::jsonb)
    INTO v_boutiques
    FROM jsonb_array_elements(v_boutiques) WITH ORDINALITY AS t(b, o);
  END IF;

  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  -- (11/10, Louis — « D'ici 17h, ce créneau permet jusqu'à 0 republication »
  -- alors que le balayage en prévoyait d'autres) La capacité annoncée est CE
  -- QUE LE BALAYAGE FERA : créneau en cours dont la ligne suit le réglage →
  -- ses prévues restantes, bornées par le temps qui reste à son rythme ;
  -- sinon le calcul que le balayage fait à la création de la ligne (part
  -- égale entre les plateformes actives, espacement réel). L'ancienne
  -- « capacité partagée » retirait le temps réservé par les autres
  -- plateformes : un autre calcul que celui du balayage, donc un autre chiffre.
  v_source_capacite := 'creation';
  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    SELECT r.* INTO v_cr FROM republish_creneaux r
    WHERE r.user_id = v_user AND r.platform = v_pf
      AND r.debut = (v_fen ->> 'courant_debut')::timestamptz
      AND COALESCE(r.boutique, '') = COALESCE(v_boutique, '')
    LIMIT 1;
    IF v_cr.id IS NOT NULL AND v_cr.statut = 'en_cours'
       AND v_cr.fin = (v_fen ->> 'courant_fin')::timestamptz THEN
      -- (25/10) comme le balayage (6bis) : un essai SAUTÉ rend sa place tant que les sautés du
      -- créneau restent ≤ prévues — l'app annonce ce que le balayage fera.
      SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error))
             + CASE WHEN count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error))
                         <= COALESCE(v_cr.prevues, 0)
                    THEN 0
                    ELSE count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error)) END
        INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_cr.id::text;
      v_debut_ryt := COALESCE(NULLIF(v_cr.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_cr.debut);
      v_prev_ryt := COALESCE(v_cr.prevues, 1)
                    - CASE WHEN v_cr.sautes ? '_reglage_change'
                           THEN COALESCE((v_cr.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := GREATEST(60, extract(epoch FROM (v_cr.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt));
      v_capacite := LEAST(GREATEST(0, COALESCE(v_cr.prevues, 0) - v_faits_cr),
                          GREATEST(0, ceil(GREATEST(0, v_duree) / v_intervalle))::integer);
      v_source_capacite := 'creneau_en_cours';
    END IF;
  END IF;
  IF v_source_capacite = 'creation' THEN
    v_capacite := republish_planifiee_capacite(
      GREATEST(60, GREATEST(0, v_duree) / GREATEST(1, republish_planifiee_actives_eligibles(v_user)))::integer,
      (v_esp ->> 'sec')::integer);
    IF COALESCE(v_duree, 0) <= 0 THEN v_capacite := 0; END IF;
  END IF;

  -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de compte :
  -- seul le nombre par jour CHOISI pour cette plateforme borne, s'il y en a un
  -- (NULL = aucun : LEAST l'ignore plus bas).
  v_restants := CASE WHEN (v_regl ->> 'plafond_jour') IS NULL THEN NULL
                     WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_pf) END;

  IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
    v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
    v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN (v_regl ->> 'plafond_jour')::integer
                        ELSE LEAST(GREATEST(1, v_plafond_b), (v_regl ->> 'plafond_jour')::integer) END;
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_plafond_b IS NULL THEN NULL
                         WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;

  v_attendu := LEAST(v_restants,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  -- L'interrupteur de la plateforme : à 0, rien ne part.
  IF NOT v_ouverte THEN v_attendu := 0; END IF;
  v_borne := CASE
    WHEN NOT v_ouverte THEN 'plateforme_fermee'
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  -- Une ligne par boutique : l'écran montre CELLE de la boutique connectée.
  -- Boutique inconnue → la plus récente, comme avant.
  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut = 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut <> 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    IF v_blocage IS NOT NULL AND (v_blocage ? 'leve_le') THEN v_blocage := NULL; END IF;
    v_disjoncteur := v_courant -> 'sautes' -> '_disjoncteur';
  END IF;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', true,
    'configure', true,
    'ouverte', v_ouverte,
    'annonces_en_ligne', v_en_ligne,
    'reglage', v_regl,
    'palier', v_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
      'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
      'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'capacite_source', v_source_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', COALESCE(v_faites_live, 0), 'blocage', v_blocage, 'disjoncteur', v_disjoncteur,
    'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
    'moteur', 'planifie'
  );
END;
$function$
;


-- ── 4. APRÈS : la nouvelle règle ─────────────────────────────────────────────

INSERT INTO essai_cand (phase, email, pf, inv_id, item_id, boutique, titre, motif, rang)
SELECT 'apres', k.email, k.pf, c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
FROM essai_comptes k
CROSS JOIN LATERAL republish_planifiee_candidats(k.uid, republish_planifiee_reglage(k.uid, k.pf), k.pf) c;
DO $m$
DECLARE r record; t0 timestamptz; n integer;
BEGIN
  FOR r IN SELECT * FROM essai_comptes LOOP
    t0 := clock_timestamp();
    SELECT count(*) INTO n FROM republish_planifiee_candidats(r.uid, republish_planifiee_reglage(r.uid, r.pf), r.pf);
    INSERT INTO essai_mesures VALUES ('apres', r.email, r.pf, n,
      round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer);
  END LOOP;
END $m$;

-- ── 5. Le balayage d'AUJOURD'HUI, nouvelle règle ────────────────────────────
DO $b$
DECLARE t0 timestamptz := clock_timestamp(); v jsonb;
BEGIN
  v := public.republish_planifiee_sweep();
  INSERT INTO essai_balayage VALUES ('nouvelle_regle', v, round(extract(epoch FROM clock_timestamp() - t0) * 1000)::integer);
END $b$;
INSERT INTO essai_creneaux
SELECT 'nouvelle_regle', r.id, split_part(p.email, '@', 1), r.platform, r.statut, r.prevues, r.sautes
FROM republish_creneaux r JOIN profiles p ON p.id = r.user_id
WHERE r.statut = 'en_cours' OR r.updated_at >= now();

-- ── 6. SORTIES ───────────────────────────────────────────────────────────────
-- 6a. Par compte et plateforme : éligibles avant / après, motifs après, temps du calcul.
INSERT INTO essai_sortie (section, ligne)
SELECT 'resume', jsonb_build_object(
  'compte', k.email, 'pf', k.pf,
  'eligibles_avant', (SELECT count(*) FROM essai_cand c WHERE c.phase = 'avant' AND c.email = k.email AND c.pf = k.pf AND c.motif IS NULL),
  'eligibles_apres', (SELECT count(*) FROM essai_cand c WHERE c.phase = 'apres' AND c.email = k.email AND c.pf = k.pf AND c.motif IS NULL),
  'motifs_apres', (SELECT jsonb_object_agg(m, n) FROM (SELECT COALESCE(c.motif, '(eligible)') m, count(*) n FROM essai_cand c
                    WHERE c.phase = 'apres' AND c.email = k.email AND c.pf = k.pf GROUP BY 1) x),
  'ms_avant', (SELECT m.ms FROM essai_mesures m WHERE m.phase = 'avant' AND m.email = k.email AND m.pf = k.pf),
  'ms_apres', (SELECT m.ms FROM essai_mesures m WHERE m.phase = 'apres' AND m.email = k.email AND m.pf = k.pf),
  'creneau', (SELECT jsonb_build_object('de', r.regl ->> 'de', 'a', r.regl ->> 'a', 'jours', r.regl -> 'jours', 'ordre', r.regl ->> 'ordre',
                                        'plafond_jour', r.regl -> 'plafond_jour')
              FROM (SELECT republish_planifiee_reglage(k.uid, k.pf) regl) r))
FROM essai_comptes k ORDER BY k.email, k.pf;

-- 6b. Les annonces que la nouvelle règle écarte (éligibles avant, introuvables après), avec leur preuve.
INSERT INTO essai_sortie (section, ligne)
SELECT 'ecartee', jsonb_build_object(
  'compte', a.email, 'pf', a.pf, 'rang', a.rang, 'annonce', a.item_id, 'titre', left(a.titre, 45),
  'derniere_vue', (SELECT to_char(max(s.captured_at) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') FROM vinted_listing_snapshots s
                    WHERE s.user_id = k.uid AND s.vinted_item_id = a.item_id),
  'releves_complets_sans_elle', (SELECT count(*) FROM vinted_sync_runs r
     WHERE r.user_id = k.uid AND r.kind = 'dressing' AND r.status = 'done' AND r.total_entries IS NOT NULL
       AND r.items_vus >= r.total_entries AND r.items_vus > 0 AND r.finished_at IS NOT NULL
       AND trim(r.vinted_user_id) = trim(a.boutique)
       AND r.started_at > (SELECT max(s.captured_at) FROM vinted_listing_snapshots s WHERE s.user_id = k.uid AND s.vinted_item_id = a.item_id) + interval '1 minute'
       AND r.started_at > now() - interval '60 days'),
  'signal_plus_en_ligne', EXISTS (SELECT 1 FROM cross_post_jobs x WHERE x.user_id = k.uid AND x.inventaire_id = a.inv_id
       AND x.platform = 'vinted' AND x.platform_fields ->> 'sale_signal' = 'unavailable'),
  'essais_republication_passes', (SELECT count(*) FROM cross_post_jobs x WHERE x.user_id = k.uid AND x.action = 'republish'
       AND x.platform_fields ->> 'vinted_item_id' = a.item_id))
FROM essai_cand a
JOIN essai_cand b ON b.phase = 'apres' AND b.email = a.email AND b.pf = a.pf AND b.inv_id = a.inv_id
JOIN essai_comptes k ON k.email = a.email AND k.pf = a.pf
WHERE a.phase = 'avant' AND a.motif IS NULL AND b.motif IS NOT NULL
ORDER BY a.email, a.pf, a.rang;

-- 6c. CE SOIR : les six premiers éligibles (ordre du balayage : boutique connectée, puis rang), avant et après.
INSERT INTO essai_sortie (section, ligne)
SELECT 'ce_soir', jsonb_build_object('compte', x.email, 'pf', x.pf, 'phase', x.phase,
  'six_premiers', jsonb_agg(jsonb_build_object('rang', x.rang, 'annonce', COALESCE(x.item_id, 'inv:' || x.inv_id), 'titre', left(x.titre, 40)) ORDER BY x.o))
FROM (
  SELECT c.*, row_number() OVER (PARTITION BY c.phase, c.email, c.pf ORDER BY
           CASE WHEN c.pf = 'vinted' AND c.boutique = (republish_boutique_connectee(k.uid) ->> 'user_id') THEN 0
                WHEN c.boutique IS NULL THEN 1 ELSE 2 END, c.rang) o
  FROM essai_cand c JOIN essai_comptes k ON k.email = c.email AND k.pf = c.pf
  WHERE c.motif IS NULL
) x
WHERE x.o <= 6
GROUP BY x.email, x.pf, x.phase
ORDER BY x.email, x.pf, x.phase;

-- 6d. Les créneaux des 23 et 24/10 de Jocabroc : chaque job, sauté ou non (ce que la nouvelle règle aurait rendu).
INSERT INTO essai_sortie (section, ligne)
SELECT 'jocabroc_23_24', jsonb_build_object(
  'creneau', r.id, 'jour', r.jour, 'pf', r.platform, 'prevues', r.prevues, 'faites', r.faites,
  'jobs', (SELECT jsonb_agg(jsonb_build_object(
             'job', left(j.id::text, 8), 'cree', to_char(j.created_at AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'),
             'annonce', COALESCE(j.platform_fields ->> 'vinted_item_id', j.platform_listing_id), 'statut', j.status,
             'saute', republish_essai_saute(j.status, j.platform_fields, j.error),
             'absente_avant_essai', CASE WHEN j.platform = 'vinted' THEN (
                SELECT count(*) FROM vinted_sync_runs s2
                 WHERE s2.user_id = j.user_id AND s2.kind = 'dressing' AND s2.status = 'done' AND s2.total_entries IS NOT NULL
                   AND s2.items_vus >= s2.total_entries AND s2.items_vus > 0 AND s2.finished_at IS NOT NULL
                   AND trim(s2.vinted_user_id) = '137708392' AND s2.started_at < j.created_at
                   AND s2.started_at > (SELECT max(s.captured_at) FROM vinted_listing_snapshots s
                                         WHERE s.user_id = j.user_id AND s.vinted_item_id = j.platform_fields ->> 'vinted_item_id'
                                           AND s.captured_at < j.created_at) + interval '1 minute') >= 2 END)
           ORDER BY j.created_at)
           FROM cross_post_jobs j
           WHERE j.user_id = r.user_id AND j.action = 'republish'
             AND j.platform_fields ->> 'republish_creneau_id' = r.id::text))
FROM republish_creneaux r
WHERE r.user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61' AND r.jour IN ('2026-10-23', '2026-10-24')
ORDER BY r.jour, r.platform;

-- 6e. Le balayage d'aujourd'hui : ancienne règle (annulée) contre nouvelle, et les notes que la nouvelle écrit.
INSERT INTO essai_sortie (section, ligne)
SELECT 'balayage', jsonb_build_object('regle', b.phase, 'ms', b.ms,
  'comptes', b.sortie #> '{comptes}', 'crees', b.sortie #> '{crees}', 'traites', b.sortie #> '{traites}',
  'detail', (SELECT jsonb_agg(jsonb_build_object('compte', split_part(e ->> 'compte', '@', 1), 'pf', e ->> 'platform', 'allowed', e -> 'allowed',
                    'reason', e ->> 'reason', 'annonce', COALESCE(e ->> 'vinted_item_id', e ->> 'inventaire_id'), 'examines', e -> 'examines'))
             FROM jsonb_array_elements(b.sortie -> 'detail') e),
  'erreur', b.sortie ->> 'message')
FROM essai_balayage b ORDER BY CASE b.phase WHEN 'ancienne_regle' THEN 0 ELSE 1 END;

INSERT INTO essai_sortie (section, ligne)
SELECT 'notes_nouvelles', jsonb_build_object('creneau', n.id, 'compte', n.email, 'pf', n.platform, 'statut', n.statut, 'prevues', n.prevues,
  'cles_ajoutees', (SELECT jsonb_object_agg(k, n.sautes -> k) FROM jsonb_object_keys(n.sautes) k
                     WHERE NOT (COALESCE(a.sautes, '{}'::jsonb) ? k) OR (a.sautes -> k) IS DISTINCT FROM (n.sautes -> k)))
FROM essai_creneaux n
LEFT JOIN essai_creneaux a ON a.phase = 'avant' AND a.id = n.id
WHERE n.phase = 'nouvelle_regle'
  AND EXISTS (SELECT 1 FROM jsonb_object_keys(n.sautes) k
               WHERE NOT (COALESCE(a.sautes, '{}'::jsonb) ? k) OR (a.sautes -> k) IS DISTINCT FROM (n.sautes -> k));

INSERT INTO essai_sortie (section, ligne)
SELECT 'notes_anciennes', jsonb_build_object('creneau', n.id, 'compte', n.email, 'pf', n.platform, 'statut', n.statut,
  'cles_ajoutees', (SELECT jsonb_object_agg(k, n.sautes -> k) FROM jsonb_object_keys(n.sautes) k
                     WHERE NOT (COALESCE(a.sautes, '{}'::jsonb) ? k) OR (a.sautes -> k) IS DISTINCT FROM (n.sautes -> k)))
FROM essai_creneaux n
LEFT JOIN essai_creneaux a ON a.phase = 'avant' AND a.id = n.id
WHERE n.phase = 'ancienne_regle'
  AND EXISTS (SELECT 1 FROM jsonb_object_keys(n.sautes) k
               WHERE NOT (COALESCE(a.sautes, '{}'::jsonb) ? k) OR (a.sautes -> k) IS DISTINCT FROM (n.sautes -> k));

-- 6f. La boucle de candidats du NOUVEAU balayage pour Jocabroc, telle qu'il la lira ce soir (même requête que
--     l'étape 8 : 50 éligibles + 50 mis de côté, boutique connectée d'abord, rang) — les 12 premières lignes.
INSERT INTO essai_sortie (section, ligne)
SELECT 'boucle_ce_soir', jsonb_build_object('compte', 'jocabroc8', 'pf', y.pf,
  'lignes', jsonb_agg(jsonb_build_object('rang', y.rang, 'annonce', COALESCE(y.item_id, 'inv:' || y.inv_id), 'motif', y.motif,
                                         'titre', left(y.titre, 35)) ORDER BY y.o))
FROM (
  SELECT x.*, row_number() OVER (PARTITION BY x.pf ORDER BY x.ordre_b, x.rang) o
  FROM (
    SELECT k.pf, c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang,
           CASE WHEN b.boutique IS NOT NULL AND c.boutique = b.boutique THEN 0 WHEN c.boutique IS NULL THEN 1 ELSE 2 END AS ordre_b,
           row_number() OVER (PARTITION BY k.pf, (c.motif IS NULL)
             ORDER BY CASE WHEN b.boutique IS NOT NULL AND c.boutique = b.boutique THEN 0 WHEN c.boutique IS NULL THEN 1 ELSE 2 END, c.rang) AS n_groupe
    FROM essai_comptes k
    CROSS JOIN LATERAL (SELECT CASE WHEN k.pf = 'vinted' THEN republish_boutique_connectee(k.uid) ->> 'user_id' END AS boutique) b
    CROSS JOIN LATERAL republish_planifiee_candidats(k.uid, republish_planifiee_reglage(k.uid, k.pf), k.pf) c
    WHERE k.uid = '53efea05-dc2d-4467-a8cd-c6fa52a47a61'
  ) x
  WHERE x.n_groupe <= 50
) y
WHERE y.o <= 12
GROUP BY y.pf;

SELECT ordre, section, ligne FROM essai_sortie ORDER BY ordre;
ROLLBACK;
