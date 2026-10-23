-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE INTROUVABLE NE REPART PAS EN REPUBLICATION AUTOMATIQUE (23/10, point 3 — Louis, Beebs)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ : 8 annonces Beebs de louis@ ont quitté sa boutique le 18/10 (transfert de ses fiches @evat vers
-- louis-seller, où les articles sont en ligne sous de nouveaux numéros). La lecture de la nuit était juste (« Beebs n'a
-- pas rendu l'annonce ») ; le défaut est une BOUCLE : la republication automatique prenait chaque nuit le dernier
-- dépôt de la fiche sans regarder qu'il était signalé « plus en ligne » ni que sa republication précédente avait été
-- close « disparue » — 2 pauses le 20/10, 8 le 21/10, 8 le 23/10, et les vraies republications privées de leurs
-- créneaux. Même chose sur Leboncoin (3 annonces, 2 comptes).
-- LA RÈGLE : republish_planifiee_candidats (plateformes hors Vinted — Vinted s'appuie déjà sur la disparition relevée
-- par le dressing) écarte une annonce dont l'absence est établie sur son identifiant exact, tant qu'aucun relevé ne
-- l'a revue : motif annonce_introuvable. Ni créneau, ni plafond, ni palier, ni quota ne changent ; rien n'est retiré
-- ni créé ; la question « vendue ? » du dépôt reste la seule (jamais une double vente manquée).
-- Fonction RÉÉCRITE depuis pg_get_functiondef relu en prod le 23/10 vers 12:50 (md5 9fbf8e2d9a2ab81786ae98ba3801d1c2).
-- Inverse : supabase/rollbacks/20261023140000_republication_annonce_introuvable_INVERSE.sql
BEGIN;

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

COMMIT;
