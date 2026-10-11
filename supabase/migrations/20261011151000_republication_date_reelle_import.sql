-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION AUTOMATIQUE : L'ANCIENNETÉ D'UNE ANNONCE IMPORTÉE EST SA DATE
-- RÉELLE DE MISE EN LIGNE (11/10/2026, Nico — cas Louis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Preuve (lecture seule, 11/10) — republish_planifiee_candidats calcule l'âge :
--   · VINTED : inventaire.listed_at_guess = horodatage de la photo LU SUR
--     L'ANNONCE au relevé (background.js, photo_ts) — date réelle, pas la date
--     d'import. Louis : 181 annonces @evat éligibles à 30 jours. Inchangé ici.
--   · LEBONCOIN, BEEBS, DEPOP : COALESCE(published_at, created_at) du dernier
--     job publié — pour une annonce importée, le job du relevé, daté du jour
--     de l'IMPORT. Louis : 220 annonces Leboncoin en ligne, 0 éligible à 30 j.
-- Correction :
--   · annonces_plateforme.publiee_le : la date de mise en ligne lue sur la
--     plateforme au relevé (extension : Leboncoin first_publication_date ;
--     Beebs et Depop : aucune date lue aujourd'hui → comportement d'avant) ;
--   · republish_planifiee_candidats (définition EN PROD du 11/10, seule la
--     date d'un job d'IMPORT change) lit cette date quand elle existe.
-- Garde-fou anti-bannissement : la fonction ne fait que dire QUI est éligible ;
-- créneaux, espacement, pauses, plafonds du jour, du palier et de la boutique
-- (republish_planifiee_sweep, capacité du créneau) s'appliquent tels quels.
-- ⚠️ Appliquer : db query --linked -f, puis migration repair --status applied.

alter table public.annonces_plateforme add column if not exists publiee_le timestamptz;
comment on column public.annonces_plateforme.publiee_le is
  'Date de mise en ligne lue sur la plateforme au relevé (Leboncoin : first_publication_date). NULL = illisible. Sert à l''ancienneté de la republication automatique des annonces importées.';

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
  ORDER BY 6;
END;
$function$;
