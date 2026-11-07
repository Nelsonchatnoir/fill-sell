-- 20261107140000 — Une annonce VENDUE (ou en transaction) ne compte JAMAIS comme « en ligne » (07/11/2026, point 1, Louis)
--
-- Constat vérifié en base le 07/11 : deux remises en vente Leboncoin d'Amiral (Louis) ont été closes « cancelled » avec
-- « ton article y est en ligne sous l'annonce 3297400164 / 3298491503 : rien à refaire, rien n'est vendu », alors que ces
-- deux annonces sont VENDUES (jobs « sold » le 06/11 à 07:15 ; Leboncoin les garde « active » avec la transaction
-- « pending » / « sold », lue par le relevé : annonces_plateforme.transaction_plateforme). Leurs dépôts, 3303702852 et
-- 3303792394, sont « Cette annonce est désactivée » (HTTP 410, page publique lue le 07/11 à ~11:00) : refusés.
-- Cause : la garde « l'article est en ligne sous une autre annonce de la même fiche » (trancher_publications_sans_lien,
-- depot_jamais_en_ligne_refermer, article_en_ligne_ailleurs) lit statut_plateforme = 'en_ligne' seul. Effet de bord : la
-- série de Louis a pris la clôture du rang 1 pour une sortie de série (« cancelled »), pas pour un refus, et a déposé les
-- rangs 2 et 3 (refusés eux aussi).
--
-- LA RÈGLE (tous comptes, toutes plateformes) : une annonce PRISE PAR UNE VENTE — transaction lue « pending » / « sold »,
-- vente enregistrée (ventes_operations « annonce:<plateforme>:<numéro> »), job « sold », ou job publié portant la
-- preuve de vente (sale_signal 'sold') — n'est jamais « en ligne » pour ces gardes. Une seule aide la dit :
-- annonce_prise_par_une_vente(). Ce qu'elle ne change pas : le retrait des copies, le comptage des copies vivantes
-- (fiche_annonces_vivantes), la remise en vente, les relevés.
-- RÉPARATION PAR LA RÈGLE (jamais à la main) : à chaque relevé complet, depots_clos_sur_annonce_vendue_rejuger() rejuge
-- les dépôts clos ainsi depuis 14 jours, quand la vente était PROUVÉE AVANT la clôture et que le dépôt n'a été vu par
-- aucun relevé : « failed » avec le motif vrai (publication rendue, idempotent), et jamais quand une autre annonce de la
-- fiche, non vendue, est réellement en ligne (pas de doublon). Rien n'est redéposé par cette migration.
-- « Rien n'est vendu » ne s'écrit plus sur la remise en vente d'un article vendu : phrase_rien_vendu().
-- Définitions réécrites depuis pg_get_functiondef EN PRODUCTION (07/11) ; inverse : rollbacks/…_INVERSE.sql.

-- ── L'annonce est-elle prise par une vente ? (une seule aide, lue par toutes les gardes « en ligne ») ──
CREATE OR REPLACE FUNCTION public.annonce_prise_par_une_vente(p_user uuid, p_platform text, p_listing_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT nullif(btrim(p_listing_id), '') IS NOT NULL AND p_user IS NOT NULL AND p_platform IS NOT NULL AND (
    -- la transaction lue par le relevé sur ce numéro exact (Leboncoin : « Achat en cours » / « Vendu »)
    EXISTS (SELECT 1 FROM public.annonces_plateforme a
             WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = btrim(p_listing_id)
               AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold'))
    -- la vente enregistrée de cette annonce
    OR EXISTS (SELECT 1 FROM public.ventes_operations o
                WHERE o.user_id = p_user AND o.cle = 'annonce:' || p_platform || ':' || btrim(p_listing_id))
    -- le dépôt de cette annonce : vendu, ou publié avec la preuve de vente
    OR EXISTS (SELECT 1 FROM public.cross_post_jobs c
                WHERE c.user_id = p_user AND c.platform = p_platform
                  AND (c.status = 'sold' OR (c.status = 'published' AND COALESCE(c.platform_fields ->> 'sale_signal', '') = 'sold'))
                  AND btrim(c.platform_listing_id) = btrim(p_listing_id))
  );
$function$;
REVOKE ALL ON FUNCTION public.annonce_prise_par_une_vente(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── « rien n'est vendu », ou « ta vente d'avant n'est pas touchée » sur une remise en vente ──
CREATE OR REPLACE FUNCTION public.phrase_rien_vendu(p_platform_fields jsonb, p_majuscule boolean DEFAULT false)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN COALESCE(p_platform_fields, '{}'::jsonb) ? 'remise_en_vente'
              THEN CASE WHEN p_majuscule THEN 'Ta vente d''avant n''est pas touchée' ELSE 'ta vente d''avant n''est pas touchée' END
              ELSE CASE WHEN p_majuscule THEN 'Rien n''est vendu' ELSE 'rien n''est vendu' END END;
$function$;

-- ── La règle qui rejuge ce que l'ancienne garde a clos à tort (appelée à chaque relevé, bornée) ──
-- Un dépôt clos « cancelled » parce que « ton article y est en ligne sous l'annonce X » (ou « … par ton compte relié »),
-- depuis 14 jours au plus, est rejugé quand, À LA FOIS : (1) la vente de X était PROUVÉE AVANT la clôture (job « sold »
-- daté avant, ou preuve de vente lue avant) ; (2) le dépôt lui-même n'a été vu par AUCUN relevé (sous aucun statut) ;
-- (3) aucune autre annonce de la fiche, NON vendue, n'est réellement en ligne (ni sur ce compte, ni par la fiche jumelle
-- d'un compte relié) — sinon la clôture tient, jamais de doublon. Rejugé = « failed » avec le motif vrai, publication
-- rendue (refund_publish_unconfirmed, idempotent) ; ni retrait, ni vente, ni stock, ni annonce touchés ; rien redéposé.
CREATE OR REPLACE FUNCTION public.depots_clos_sur_annonce_vendue_rejuger(p_user uuid, p_platform text, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j record;
  v_trace jsonb;
  v_ann text;
  v_le timestamptz;
  v_ids text[];
  v_comptes uuid[];
  v_nom text;
  v_ref jsonb;
  v_msg text;
  v_releves text;
  v_vivante text;
  v_arch jsonb;
  n_rejuges integer := 0; n_vus integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_platform = 'vinted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                           WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  FOR j IN
    SELECT c.id, c.inventaire_id, c.platform_listing_id, c.listing_url, c.error, c.platform_fields
      FROM cross_post_jobs c
     WHERE c.user_id = p_user AND c.platform = p_platform AND c.status = 'cancelled'
       AND COALESCE(c.action, 'publish') = 'publish'
       AND c.platform_fields #>> '{depot_jamais_en_ligne,issue}' IN ('article_en_ligne_ailleurs', 'en_ligne_par_compte_relie')
       AND _ts_ou_null(c.platform_fields #>> '{depot_jamais_en_ligne,le}') > now() - interval '14 days'
     ORDER BY c.created_at
     LIMIT 25
     FOR UPDATE SKIP LOCKED
  LOOP
    n_vus := n_vus + 1;
    v_trace := j.platform_fields -> 'depot_jamais_en_ligne';
    v_ann := nullif(btrim(v_trace ->> 'annonce_en_ligne'), '');
    v_le := _ts_ou_null(v_trace ->> 'le');
    IF v_ann IS NULL OR v_le IS NULL THEN CONTINUE; END IF;
    IF v_comptes IS NULL THEN
      v_comptes := ARRAY[p_user] || ARRAY(SELECT CASE WHEN l.user_a = p_user THEN l.user_b ELSE l.user_a END
                                            FROM comptes_lies l WHERE l.user_a = p_user OR l.user_b = p_user);
    END IF;
    -- (1) La vente de l'annonce citée était prouvée AVANT la clôture.
    IF NOT EXISTS (
      SELECT 1 FROM cross_post_jobs s
       WHERE s.user_id = ANY (v_comptes) AND s.platform = p_platform AND btrim(s.platform_listing_id) = v_ann
         AND ((s.status = 'sold' AND s.sold_at IS NOT NULL AND s.sold_at <= v_le)
              OR _ts_ou_null(s.platform_fields #>> '{sale_evidence,lu_le}') <= v_le)) THEN
      CONTINUE;
    END IF;
    -- (2) Le dépôt n'a été vu par aucun relevé.
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        annonce_id_job(p_platform, j.listing_url),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')]
        || ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(v_trace -> 'identifiants') = 'array' THEN v_trace -> 'identifiants' ELSE '[]'::jsonb END) e)
      ) AS x WHERE x IS NOT NULL AND x <> '');
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform
                  AND (ap.listing_id = ANY (COALESCE(v_ids, ARRAY[]::text[])) OR ap.job_id = j.id)) THEN
      CONTINUE;
    END IF;
    -- (3) Jamais de doublon : une autre annonce de la fiche, non vendue, réellement en ligne → la clôture tient.
    IF j.inventaire_id IS NOT NULL THEN
      v_vivante := NULL;
      SELECT ap.listing_id INTO v_vivante FROM annonces_plateforme ap
       WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.inventaire_id = j.inventaire_id
         AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL
         AND ap.listing_id <> ALL (COALESCE(v_ids, ARRAY[]::text[]))
         AND NOT public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id)
       LIMIT 1;
      IF v_vivante IS NULL AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_vivante FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL (COALESCE(v_ids, ARRAY[]::text[]))
           AND NOT public.annonce_prise_par_une_vente(o.compte, p_platform, o.listing_id)
         LIMIT 1;
      END IF;
      IF v_vivante IS NOT NULL THEN CONTINUE; END IF;
    END IF;
    -- (4) Rejugé : « failed », motif vrai, publication rendue.
    SELECT string_agg(to_char(COALESCE(r.finished_at, r.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI'), ' et du '
                      ORDER BY r.started_at)
      INTO v_releves
      FROM vinted_sync_runs r
     WHERE r.user_id = p_user
       AND r.id::text IN (COALESCE(v_trace ->> 'premier', ''), COALESCE(v_trace ->> 'second', ''));
    v_ref := refund_publish_unconfirmed(j.id);
    v_msg := 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom
      || CASE WHEN v_releves IS NOT NULL THEN ' (relevés complets du ' || v_releves || ')' ELSE '' END
      || '. L''annonce ' || v_ann || ', citée avant comme « en ligne », est vendue : elle ne compte pas comme ton article en vente. '
      || CASE WHEN p_platform = 'leboncoin'
              THEN 'Leboncoin refuse parfois une annonce juste après son dépôt, par exemple quand une annonce semblable est encore affichée : son motif est dans le mail « Votre annonce … a été refusée » qu''il t''a envoyé. '
              ELSE '' END
      || 'Ta vente de l''annonce ' || v_ann || ' n''est pas touchée, et cette publication ne compte pas dans tes limites.';
    v_arch := CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array'
                   THEN j.platform_fields -> 'erreurs_archivees' ELSE '[]'::jsonb END
              || CASE WHEN NULLIF(btrim(j.error), '') IS NULL THEN '[]'::jsonb
                      ELSE jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'cancelled', 'erreur', left(j.error, 600),
                             'par', 'rejugé : l''annonce citée était vendue')) END;
    IF jsonb_array_length(v_arch) > 20 THEN
      v_arch := (SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(v_arch) WITH ORDINALITY t(e, o)
                  WHERE o > jsonb_array_length(v_arch) - 20);
    END IF;
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
        || jsonb_build_object(
          'erreurs_archivees', v_arch,
          'depot_jamais_en_ligne', (v_trace - 'annonce_en_ligne') || jsonb_build_object(
            'issue', 'refus_moderation_probable', 'issue_avant', v_trace -> 'issue', 'annonce_vendue_citee', v_ann,
            'refund', v_ref,
            'rejuge', jsonb_build_object('le', now(), 'regle', 'annonce_vendue_jamais_en_ligne_0711', 'run_id', p_run_id)))
     WHERE id = j.id AND status = 'cancelled';
    IF FOUND THEN n_rejuges := n_rejuges + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'vus', n_vus, 'rejuges', n_rejuges);
END;
$function$;
REVOKE ALL ON FUNCTION public.depots_clos_sur_annonce_vendue_rejuger(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── article_en_ligne_ailleurs (lue par fail_publish_without_listing_url) ──
CREATE OR REPLACE FUNCTION public.article_en_ligne_ailleurs(p_user uuid, p_platform text, p_inventaire bigint, p_exclus text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id text;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_inventaire IS NULL THEN RETURN NULL; END IF;
  SELECT ap.listing_id INTO v_id FROM annonces_plateforme ap
   WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.inventaire_id = p_inventaire
     AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     AND NOT public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id)
     AND ap.listing_id <> ALL (coalesce(array_remove(p_exclus, NULL), ARRAY[]::text[]))
   ORDER BY ap.vu_le DESC NULLS LAST LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('listing_id', v_id, 'issue', 'article_en_ligne_ailleurs'); END IF;
  IF EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = p_inventaire OR f.fiche_b = p_inventaire) THEN
    SELECT o.listing_id INTO v_id FROM jumelle_occupe_plateformes(p_user, p_inventaire) o
     WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND nullif(btrim(o.listing_id), '') IS NOT NULL
       AND NOT public.annonce_prise_par_une_vente(o.compte, p_platform, o.listing_id)
       AND o.listing_id <> ALL (coalesce(array_remove(p_exclus, NULL), ARRAY[]::text[]))
     LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('listing_id', v_id, 'issue', 'en_ligne_par_compte_relie'); END IF;
  END IF;
  RETURN NULL;
END;
$function$;

-- ── depot_jamais_en_ligne_refermer ──
CREATE OR REPLACE FUNCTION public.depot_jamais_en_ligne_refermer(p_user uuid, p_platform text, p_inventaire bigint DEFAULT NULL::bigint, p_listing_id text DEFAULT NULL::text, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j record;
  a record;
  v_ids text[];
  v_suivi uuid;
  v_nom text;
  v_trace jsonb;
  v_arch jsonb;
  v_vue text;
  n_publiees integer := 0; n_closes integer := 0; n_vues integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_platform = 'vinted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                           WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  FOR j IN
    SELECT c.id, c.inventaire_id, c.platform_listing_id, c.listing_url, c.error, c.platform_fields
      FROM cross_post_jobs c
     WHERE c.user_id = p_user AND c.status = 'failed' AND c.platform = p_platform
       AND COALESCE(c.action, 'publish') = 'publish'
       AND COALESCE(c.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne'
       AND ((p_inventaire IS NULL AND p_listing_id IS NULL)
            OR c.inventaire_id = p_inventaire
            OR btrim(c.platform_listing_id) = p_listing_id
            OR c.platform_fields #>> '{lbc_depot,adsubmit,id}' = p_listing_id
            OR COALESCE(c.platform_fields #> '{depot_jamais_en_ligne,identifiants}', '[]'::jsonb) ? p_listing_id)
     ORDER BY c.created_at
     LIMIT 25
     FOR UPDATE SKIP LOCKED
  LOOP
    n_vues := n_vues + 1;
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        annonce_id_job(p_platform, j.listing_url),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')]
        || ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(j.platform_fields #> '{depot_jamais_en_ligne,identifiants}') = 'array'
                  THEN j.platform_fields #> '{depot_jamais_en_ligne,identifiants}' ELSE '[]'::jsonb END) e)
      ) AS x WHERE x IS NOT NULL AND x <> '');
    v_trace := CASE WHEN jsonb_typeof(j.platform_fields -> 'depot_jamais_en_ligne') = 'object'
                    THEN j.platform_fields -> 'depot_jamais_en_ligne' ELSE '{}'::jsonb END;
    -- L'erreur affichée part aux archives (20 dernières, comme _shared/erreurs-archivees.js).
    v_arch := CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array'
                   THEN j.platform_fields -> 'erreurs_archivees' ELSE '[]'::jsonb END
              || CASE WHEN NULLIF(btrim(j.error), '') IS NULL THEN '[]'::jsonb
                      ELSE jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'failed', 'erreur', left(j.error, 600),
                             'par', 'releve : article retrouvé en ligne')) END;
    IF jsonb_array_length(v_arch) > 20 THEN
      v_arch := (SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(v_arch) WITH ORDINALITY t(e, o)
                  WHERE o > jsonb_array_length(v_arch) - 20);
    END IF;

    -- a. MÊME NUMÉRO : le dépôt lui-même est en ligne.
    SELECT ap.id, ap.listing_id, ap.url, ap.job_id, ap.run_id, ap.vu_le INTO a FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY (COALESCE(v_ids, ARRAY[]::text[]))
       AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL
     ORDER BY ap.vu_le DESC NULLS LAST LIMIT 1;
    IF a.id IS NOT NULL THEN
      v_vue := to_char(a.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');
      v_suivi := NULL;
      IF a.job_id IS NOT NULL AND a.job_id <> j.id THEN
        SELECT o.id INTO v_suivi FROM cross_post_jobs o
         WHERE o.id = a.job_id AND o.user_id = p_user AND o.status IN ('published', 'sold');
      END IF;
      IF v_suivi IS NULL AND NULLIF(btrim(a.url), '') IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'published', error = NULL, listing_url = a.url,
          platform_listing_id = COALESCE(NULLIF(btrim(platform_listing_id), ''), a.listing_id),
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['depot_jamais_en_ligne', 'pas_encore_visible'])
            || jsonb_build_object(
              'erreurs_archivees', v_arch,
              'depot_jamais_en_ligne_leve', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
                'annonce', a.listing_id, 'annonce_id', a.id, 'vue_le', a.vu_le, 'constat', v_trace))
         WHERE id = j.id AND status = 'failed';
        IF FOUND THEN n_publiees := n_publiees + 1; END IF;
        CONTINUE;
      END IF;
      IF v_suivi IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Ce dépôt est en ligne sur ' || v_nom || ' sous l''annonce ' || a.listing_id || ' (vue au relevé du ' || v_vue
            || '), déjà suivie par FillSell : rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.',
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
            || jsonb_build_object(
              'erreurs_archivees', v_arch,
              'depot_jamais_en_ligne', v_trace || jsonb_build_object('issue', 'en_ligne_meme_numero', 'issue_avant', v_trace -> 'issue',
                'annonce_en_ligne', a.listing_id,
                'refermee', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
                  'annonce_id', a.id, 'vue_le', a.vu_le, 'suivie_par', v_suivi)))
         WHERE id = j.id AND status = 'failed';
        IF FOUND THEN n_closes := n_closes + 1; END IF;
        CONTINUE;
      END IF;
    END IF;

    -- b. AUTRE NUMÉRO, MÊME FICHE, MÊME PLATEFORME, MÊME COMPTE.
    IF j.inventaire_id IS NULL THEN CONTINUE; END IF;
    SELECT ap.id, ap.listing_id, ap.url, ap.job_id, ap.run_id, ap.vu_le INTO a FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.inventaire_id = j.inventaire_id
       AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL
       AND NOT public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id)
       AND ap.listing_id <> ALL (COALESCE(v_ids, ARRAY[]::text[]))
     ORDER BY ap.vu_le DESC NULLS LAST LIMIT 1;
    IF a.id IS NULL THEN CONTINUE; END IF;
    v_vue := to_char(a.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');
    UPDATE cross_post_jobs SET status = 'cancelled',
      error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
        || a.listing_id || ' (vue au relevé du ' || v_vue || ') : rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
        || jsonb_build_object(
          'erreurs_archivees', v_arch,
          'depot_jamais_en_ligne', v_trace || jsonb_build_object('issue', 'article_en_ligne_ailleurs', 'issue_avant', v_trace -> 'issue',
            'annonce_en_ligne', a.listing_id,
            'refermee', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
              'annonce_id', a.id, 'vue_le', a.vu_le, 'suivie_par', a.job_id)))
     WHERE id = j.id AND status = 'failed';
    IF FOUND THEN n_closes := n_closes + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'vues', n_vues, 'publiees', n_publiees, 'closes', n_closes);
END;
$function$;

-- ── trancher_publications_sans_lien ──
CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
  v_refermees jsonb := NULL;
  v_rejuges jsonb := NULL;   -- (07/11, point 1)
  -- (29/10, lot B 4.5/4.9) Beebs : la preuve du refus (beebs_preuve_jamais_en_ligne), son numéro, les dépôts sans preuve.
  v_preuve jsonb; v_num text; n_beebs_sans_preuve integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;
  -- (27/10, GTA de BONCOIN) UNE LIGNE « JAMAIS MISE EN LIGNE » DONT L'ARTICLE EST RETROUVÉ EN LIGNE SE REFERME :
  -- même numéro (le dépôt lui-même), ou une autre annonce de la MÊME fiche sur la MÊME plateforme, vue en ligne
  -- par un relevé de ce compte (depot_jamais_en_ligne_refermer). Le déclencheur des annonces la referme dès le
  -- rattachement ; cette passe, à chaque relevé, rattrape ce qu'il n'aurait pas vu. Jamais sur un titre.
  BEGIN
    v_refermees := depot_jamais_en_ligne_refermer(p_user, p_platform, NULL, NULL, p_run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trancher_publications_sans_lien : refermeture (%, %) : %', p_user, p_platform, SQLERRM;
  END;

  -- (07/11, point 1 — Louis) Une clôture « ton article y est en ligne sous l'annonce X » posée alors que X était
  -- VENDUE (transaction en cours ou vente enregistrée) est rejugée : depots_clos_sur_annonce_vendue_rejuger.
  BEGIN
    v_rejuges := depots_clos_sur_annonce_vendue_rejuger(p_user, p_platform, p_run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trancher_publications_sans_lien : rejugement (%, %) : %', p_user, p_platform, SQLERRM;
  END;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0,'rejuges',v_rejuges);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND NOT public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id)
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id, public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id) AS vendue INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids)
         AND NOT public.annonce_prise_par_une_vente(o.compte, p_platform, o.listing_id) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    -- (27/10) Aucune plateforme ne donne de motif ici : le texte dit l'absence constatée, jamais « refusée par sa
    -- modération » (une déduction). Un vrai motif lu au dépôt (adsubmit 4xx) a son propre texte, ailleurs.
    v_msg := 'Cette annonce est absente de tes annonces ' || v_nom || ' aux relevés complets du '
      || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || ', et ' || v_nom || CASE WHEN p_platform = 'leboncoin' THEN ' n''a rien affiché à FillSell. Leboncoin refuse parfois une annonce juste après son dépôt, par exemple quand une annonce semblable est déjà en ligne : son motif est dans le mail « Votre annonce … a été refusée » qu''il t''a envoyé. ' ELSE ' n''a donné aucun motif. ' END
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id
                || CASE WHEN v_doublon.vendue THEN ', vendue, que ' || v_nom || ' affiche encore (transaction en cours). '
                        ELSE ', déjà en ligne sur ' || v_nom || '. ' END
           ELSE '' END
      || public.phrase_rien_vendu(j.platform_fields, true) || ', ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    -- (25/10, proposition — mesure N11) Beebs : 7 jours, pas 72 h. 18 dépôts sortis de la vérification sans être en
    -- ligne le sont devenus 48 à 126 h plus tard (bd380fbf 34113827 : 67,6 h ; DeadRoz : 16 annonces à 86-126 h) ;
    -- à 7 jours, 0 faux refus sur 1 293 dépôts vus en ligne (31 jours).
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '7 days' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le, c.price,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      -- ── (29/10, lot B 4.5/4.9) BEEBS : UN SEUL JUGE, DEUX PREUVES — JAMAIS « REFUSÉE » SANS ELLES ─────────────────
      -- louis-seller 22362f3a (34200634) et ef037533 (34200711) le 20/10, XEWER abd12bb5 (34198358) le 19/10 : ARRIVÉS
      -- chez Beebs (numéro lu « en vérification », preuve_identifiant_beebs), puis jugés ici sur deux relevés dits
      -- complets dont le total est le compteur de l'INDEX public (releve_preuve_absence) — en retard sur les annonces
      -- neuves, et la page « en ligne » n'en montre que 60. Polly 34206489 (louis-seller) : jugée « jamais en ligne » le
      -- 24/10 sur deux relevés ainsi faits, EN LIGNE le 28/10 à 22:03 (constat_en_ligne_2810). Désormais un dépôt Beebs
      -- ne se conclut (ni « failed », ni clos « en ligne ailleurs ») que sur l'une des preuves du juge de handler-watch
      -- (_shared/beebs-sortie-verification.js), lues par beebs_preuve_jamais_en_ligne : CE relevé a vu TOUT « en ligne »
      -- par la PAGE (releve_beebs_voit_tout_en_ligne, miroir de releveVoitToutEnLigne), ou deux constats « page 404 » de
      -- l'extension sur le numéro EXACT à 6 h d'écart (« en vérification » lue en entier) — le relevé, ou le dernier
      -- constat, 7 jours au moins après la dernière vue en vérification. Sinon : « pas encore visible », posé une fois
      -- (aucune ligne inchangée réécrite), jamais « refusée ». Un seul numéro, ou rien n'est conclu.
      v_preuve := NULL; v_num := NULL;
      IF p_platform = 'beebs' THEN
        v_num := CASE WHEN array_length(v_ids, 1) = 1 THEN v_ids[1] END;
        IF v_num IS NOT NULL THEN
          v_preuve := beebs_preuve_jamais_en_ligne(p_user, v_num, j.publie, j.price, j.platform_fields, p_run_id);
        END IF;
        IF v_preuve IS NULL THEN
          IF NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'pas_encore_visible') THEN
            UPDATE cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pas_encore_visible',
                jsonb_build_object('depuis', now(), 'derniere', now(), 'regle', 'beebs_sans_preuve_de_refus_2910',
                                   'numero', v_num, 'releve', p_run_id))
             WHERE id = j.id AND status = 'published' AND NOT (COALESCE(platform_fields, '{}'::jsonb) ? 'pas_encore_visible');
          END IF;
          n_beebs_sans_preuve := n_beebs_sans_preuve + 1;
          n_attente := n_attente + 1; CONTINUE;
        END IF;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND NOT public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id)
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids)
         AND NOT public.annonce_prise_par_une_vente(o.compte, p_platform, o.listing_id) LIMIT 1;
      END IF;
      -- (24/10, point 6 — jocabroc8) Une annonce eBay dont la veille a lu la FIN (fin_ebay.fin, aucune vente) a été
      -- EN LIGNE : eBay l'a acceptée, puis elle y a été arrêtée — pas par FillSell (ce job est encore « publié » :
      -- aucun retrait FillSell ne l'a close). Pages eBay relues le 23/10 : « Le vendeur a mis fin à cette annonce …
      -- car elle comportait une erreur », 2 et 17 min après la mise en ligne. Ce n'est PAS un refus : close sans
      -- rouge, avec sa date (et l'annonce sous laquelle l'article est en ligne, s'il l'est). Quotas comme avant :
      -- rendue seulement là où l'ancien jugement la rendait (aucun article en ligne ailleurs).
      IF p_platform = 'ebay' AND _ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') IS NOT NULL
         AND coalesce(j.platform_fields #>> '{fin_ebay,vendus}', '0') ~ '^0+$' THEN
        v_refund := CASE WHEN v_vivante.listing_id IS NULL AND v_jum_id IS NULL THEN refund_publish_unconfirmed(j.id) END;
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le '
            || to_char(_ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
            || ' — pas par FillSell, et sans vente. Ce n''est pas un refus d''eBay. '
            || CASE WHEN v_vivante.listing_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_vivante.listing_id || ' : rien à refaire.'
                 WHEN v_jum_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_jum_id || ', publiée par ton compte FillSell relié : rien à refaire.'
                 ELSE 'Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', 'arretee_sur_ebay', 'fin', j.platform_fields #>> '{fin_ebay,fin}',
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'refund', v_refund, 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, ' || public.phrase_rien_vendu(j.platform_fields, false) || '.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id, public.annonce_prise_par_une_vente(ap.user_id, ap.platform, ap.listing_id) AS vendue INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := 'Cette annonce est absente de tes annonces ' || v_nom
        || ' aux relevés complets du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || ', et ' || v_nom || CASE WHEN p_platform = 'leboncoin' THEN ' n''a rien affiché à FillSell. Leboncoin refuse parfois une annonce juste après son dépôt, par exemple quand une annonce semblable est déjà en ligne : son motif est dans le mail « Votre annonce … a été refusée » qu''il t''a envoyé. ' ELSE ' n''a donné aucun motif. ' END
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id
                || CASE WHEN v_doublon.vendue THEN ', vendue, que ' || v_nom || ' affiche encore (transaction en cours). '
                        ELSE ', déjà en ligne sur ' || v_nom || '. ' END
             ELSE '' END
        || public.phrase_rien_vendu(j.platform_fields, true) || ', ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
      -- (29/10, lot B 4.5 — R3, Nico) Beebs : « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a
      -- retirée de sa vérification sans la mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas
      -- pourquoi. » + la preuve datée — le même texte que messageRefusVerificationBeebs (handler-watch). Aucune durée.
      IF p_platform = 'beebs' THEN
        v_msg := beebs_message_jamais_en_ligne(v_preuve, false, v_doublon.listing_id);
      END IF;
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true)
            || CASE WHEN v_preuve IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('preuve', v_preuve) END)
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles,
                            'refermees', v_refermees, 'beebs_sans_preuve', n_beebs_sans_preuve, 'rejuges', v_rejuges);
END;
$function$;
