-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION AUTOMATIQUE : UN ARTICLE QUE LA PLATEFORME INTERDIT N'EST
-- JAMAIS CANDIDAT (10/10/2026, Nico — republication automatique Depop câblée)
-- ═══════════════════════════════════════════════════════════════════════════
-- La republication automatique Depop passe par le MÊME circuit que Vinted,
-- Leboncoin et Beebs (migration 20261009230000 : 'depop' dans
-- republish_planifiee_plateformes(), pf_depop = 1). Une règle manquait : les
-- catégories que Depop interdit (lot du 09/10 soir) ne doivent JAMAIS partir en
-- republication automatique.
--
-- La table des interdits vit en JavaScript (_shared/depop-interdits.js : icône
-- de detectObjectIcon → règle + citation officielle) et n'est jamais recopiée en
-- SQL. get-pending-jobs juge chaque job Depop qui dépose ; sur une republication
-- AUTOMATIQUE d'un article interdit, il la clôt sans question (unité rendue par
-- republish_refund_on_terminal, annonce intacte) et pose le verdict
-- `depop_interdit` sur le job. Cette migration retire de la liste des candidats
-- tout article dont un job de la plateforme porte `<plateforme>_interdit` :
-- il n'est plus jamais reproposé (ni job, ni créneau consommé, ni boucle).
--
-- CE QU'ELLE CHANGE : republish_planifiee_candidats, branche HORS Vinted
-- seulement, une condition AJOUTÉE dans « base ». Pour un article sans verdict,
-- la fonction rend exactement ce qu'elle rendait. Vinted : inchangé.
-- Index utilisé : cross_post_jobs_inventaire (inventaire_id).
--
-- Définition de départ : celle LUE EN PROD le 10/10 (pg_get_functiondef,
-- md5 8c875235a90cc63eff0e716c9af497a2), vérifiée ci-dessous avant toute écriture. Idempotente.
-- Application (règle du 01/10) :
--   npx supabase db query --linked -f supabase/migrations/20261010100000_republication_auto_jamais_un_interdit.sql
--   npx supabase migration repair --linked --status applied 20261010100000
-- Inverse : scripts/reparations/20261010_inverse_republication_auto_jamais_un_interdit.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE v_md5 text := md5(pg_get_functiondef('public.republish_planifiee_candidats(uuid,jsonb,text)'::regprocedure));
BEGIN
  -- Déjà appliquée : rien à faire (idempotente).
  IF position('_interdit' IN pg_get_functiondef('public.republish_planifiee_candidats(uuid,jsonb,text)'::regprocedure)) > 0 THEN
    RAISE NOTICE 'republish_planifiee_candidats porte déjà la règle des interdits';
  ELSIF v_md5 IS DISTINCT FROM '8c875235a90cc63eff0e716c9af497a2' THEN
    RAISE EXCEPTION 'republish_planifiee_candidats a changé en prod depuis sa lecture (md5 %) — migration arrêtée, rien n''est écrit', v_md5;
  END IF;
END
$garde$;

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
               COALESCE(j.published_at, j.created_at) AS mise_en_ligne,
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
$function$
;

COMMIT;
