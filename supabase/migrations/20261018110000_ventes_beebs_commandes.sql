-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — VENTES BEEBS PROUVÉES PAR LA PAGE DES VENTES (lot 4, chantier « zéro orange »)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (base, 18/10) : aucune vente Beebs n'est jamais détectée seule —
-- detectBeebsState ne rend jamais « vendu », rien ne pose sale_signal = 'sold'
-- sur un job Beebs ; 12 ventes confirmées au clic, dont 6 rangées « Ailleurs »
-- (enregistrer_vente_declaree). Risque : double vente tant que la personne ne
-- clique pas.
--
-- LA RÈGLE : une vente qui figure sur la page des ventes Beebs (commande lue
-- par l'extension, numéro de produit EXACT) est PROUVÉE. La base sait déjà la
-- traiter, par le chemin de Depop : sale_signal 'sold' + sale_evidence
-- {platform, listing_id, state 'sold', exact true} sur le job publié →
--   · cross_post_jobs_preuve_vente_retire_copies : retraits des copies ;
--   · cross_post_jobs_push_vendu → push_trg_job : note de vente (mail si la
--     commande a moins de 24 h — unavailable_since = date de la commande) ;
--   · ventes_prouvees_tick (2 min) → vente rangée « beebs ».
-- Cette migration n'ajoute QUE la porte d'entrée : commandes_beebs_noter.
--   · rattachement par l'IDENTIFIANT seulement : UN job Beebs publié de CE
--     compte dont btrim(platform_listing_id) = le numéro de produit — deux =
--     doute, rien ; jamais un titre ; fiche en stock (sinon : déjà vendue) ;
--   · formes bornées (10 commandes, 10 produits, ref ^[A-Za-z0-9_-]{6,80}$,
--     produit ^[0-9]{6,}$ — toute autre forme : comptée, ignorée) ;
--   · statut classé par beebs_commande_classe (vente / annulee / inconnu) ;
--     une commande annulée lève la preuve posée par cette source (même geste
--     que commandes_vinted_noter) ; une vente déjà enregistrée n'est PAS
--     défaite ici (comptée « annulee_apres_vente », rien touché) ;
--   · aucune ligne inchangée réécrite (preuve déjà posée = « deja ») ;
--   · une simple disparition d'annonce ne vaut JAMAIS vente : rien ici ne lit
--     une disparition.
-- INTERRUPTEUR coin_config.ventes_beebs_commandes posé à 0 = MODE FANTÔME :
-- la fonction calcule ce qu'elle ferait, n'écrit RIEN sur les jobs, et rend
-- son bilan. Pourquoi éteint : la forme réelle de la page des ventes Beebs et
-- de products[].id n'est prouvée sur AUCUN compte (plateforme_commandes n'a
-- aucune ligne Beebs au 18/10) — le bilan fantôme la prouvera.
-- Bilan (comptes seulement, aucune donnée personnelle) dans usage_logs,
-- feature « ventes_beebs_commandes » : à chaque appel qui reçoit au moins une
-- commande, sinon au plus une fois par 6 h et par compte.
-- Inverse : supabase/rollbacks/20261018110000_ventes_beebs_commandes.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018110000_ventes_beebs_commandes.sql
--   npx supabase migration repair --linked --status applied 20261018110000

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

INSERT INTO public.coin_config (key, value) VALUES ('ventes_beebs_commandes', 0) ON CONFLICT (key) DO NOTHING;

-- Statuts de commande Beebs (code du site relu le 16/10 nuit : WAIT_SELLER_CONFIRM → … → LABEL_PRINTED,
-- IN_DELIVERY, DELIVERED, APPROVED_BY_BUYER, SELLER_PAID, CANCELLED, LITIGATION…). WAIT_SELLER_CONFIRM est une
-- vente : l'acheteur a payé et Beebs réserve l'article — c'est là que naît la double vente. Litige, colis
-- perdu, statut inconnu : rien n'est décidé.
CREATE OR REPLACE FUNCTION public.beebs_commande_classe(p_statut text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN upper(coalesce(p_statut, '')) LIKE 'WAIT_SELLER_CONFIRM%' THEN 'vente'
    WHEN upper(coalesce(p_statut, '')) IN ('CONFIRMED_BY_SELLER', 'WAITING_GENARATING_LABEL_BY_SELLER', 'IN_DELIVERY',
                                           'RETRIEVED_BY_BUYER', 'APPROVED_BY_BUYER') THEN 'vente'
    WHEN upper(coalesce(p_statut, '')) LIKE 'LABEL_PRINTED%' THEN 'vente'
    WHEN upper(coalesce(p_statut, '')) LIKE 'DELIVERED%' THEN 'vente'
    WHEN upper(coalesce(p_statut, '')) LIKE 'SELLER_PAID%' THEN 'vente'
    WHEN upper(coalesce(p_statut, '')) = 'CANCELLED' THEN 'annulee'
    ELSE 'inconnu' END;
$function$;
REVOKE ALL ON FUNCTION public.beebs_commande_classe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beebs_commande_classe(text) TO authenticated, service_role;

-- p_rows : [{ref, statut, date, produits:[numéros]}] — la forme de normaliserCommandesBeebs est acceptée aussi
-- ({ref, etat_plateforme, vendue_le, annonce_ref}). p_lecture (facultatif) : des COMPTES de la lecture de la page
-- ({liens, illisibles, requetes}), recopiés tels quels dans le bilan (entiers seulement).
CREATE OR REPLACE FUNCTION public.commandes_beebs_noter(p_rows jsonb, p_user uuid DEFAULT NULL::uuid, p_lecture jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user uuid;
  v_ecrit boolean;
  v_row jsonb;
  v_ref text;
  v_statut text;
  v_classe text;
  v_date timestamptz;
  v_produits jsonb;
  v_id text;
  v_jobs uuid[];
  v_job uuid;
  v_pf jsonb;
  v_stock boolean;
  v_lecture jsonb := '{}'::jsonb;
  v_bilan jsonb;
  c_recues int := 0; c_prouvees int := 0; c_deja int := 0; c_doute int := 0; c_sans_job int := 0;
  c_forme int := 0; c_annulees int := 0; c_levees int := 0; c_annulee_apres int := 0; c_inconnu int := 0;
  c_fiche_vendue int := 0; c_produits int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme (rien écrit sur les jobs).
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_beebs_commandes'), 0) = 1;

  IF jsonb_typeof(p_lecture) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(k, (p_lecture ->> k)::int), '{}'::jsonb) INTO v_lecture
      FROM unnest(ARRAY['liens', 'illisibles', 'requetes']) k
     WHERE coalesce(p_lecture ->> k, '') ~ '^[0-9]{1,6}$';
  END IF;

  IF jsonb_typeof(p_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
      c_recues := c_recues + 1;
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN c_forme := c_forme + 1; CONTINUE; END IF;
      v_ref := btrim(coalesce(v_row ->> 'ref', ''));
      IF v_ref !~ '^[A-Za-z0-9_-]{6,80}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;
      v_statut := left(btrim(coalesce(v_row ->> 'statut', v_row ->> 'etat_plateforme', '')), 60);
      v_classe := public.beebs_commande_classe(v_statut);
      v_date := coalesce(_ts_ou_null(v_row ->> 'date'), _ts_ou_null(v_row ->> 'vendue_le'));
      v_produits := CASE WHEN jsonb_typeof(v_row -> 'produits') = 'array' THEN v_row -> 'produits'
                         WHEN nullif(btrim(coalesce(v_row ->> 'annonce_ref', '')), '') IS NOT NULL
                           THEN jsonb_build_array(v_row ->> 'annonce_ref')
                         ELSE '[]'::jsonb END;

      IF v_classe = 'annulee' THEN
        c_annulees := c_annulees + 1;
        -- La preuve posée par CETTE source pour CETTE commande est levée (job encore publié).
        FOR v_job IN SELECT j.id FROM cross_post_jobs j
                      WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'published'
                        AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
                        AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
          IF NOT v_ecrit THEN c_levees := c_levees + 1;
          ELSIF signal_vente_lever(v_job, 'commande_beebs_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
            c_levees := c_levees + 1;
          END IF;
        END LOOP;
        -- Déjà enregistrée comme vente : rien n'est défait ici (comptée, à décider).
        c_annulee_apres := c_annulee_apres + (SELECT count(*) FROM cross_post_jobs j
          WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'sold'
            AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
            AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref)::int;
        CONTINUE;
      END IF;
      IF v_classe <> 'vente' THEN c_inconnu := c_inconnu + 1; CONTINUE; END IF;

      FOR v_id IN SELECT btrim(x) FROM jsonb_array_elements_text(v_produits) x LIMIT 10 LOOP
        c_produits := c_produits + 1;
        IF v_id !~ '^[0-9]{6,}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;
        -- Le job de CE compte qui porte CE numéro, exactement — jamais un titre.
        SELECT array_agg(j.id) INTO v_jobs FROM cross_post_jobs j
         WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'published'
           AND coalesce(j.action, 'publish') IN ('publish', 'republish')
           AND btrim(coalesce(j.platform_listing_id, '')) = v_id;
        IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
          -- Déjà vendue par un autre chemin (job « sold » au même numéro) : rien à faire.
          IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = v_user AND j.platform = 'beebs'
                      AND j.status = 'sold' AND btrim(coalesce(j.platform_listing_id, '')) = v_id) THEN
            c_deja := c_deja + 1;
          ELSE
            c_sans_job := c_sans_job + 1;
          END IF;
          CONTINUE;
        END IF;
        IF array_length(v_jobs, 1) > 1 THEN c_doute := c_doute + 1; CONTINUE; END IF;
        v_job := v_jobs[1];
        SELECT j.platform_fields, (i.id IS NOT NULL AND i.statut = 'stock' AND i.fusionne_dans IS NULL)
          INTO v_pf, v_stock
          FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
         WHERE j.id = v_job;
        IF coalesce(v_pf ->> 'sale_signal', '') = 'sold' AND v_pf #>> '{sale_evidence,listing_id}' = v_id
           AND v_pf #>> '{sale_evidence,platform}' = 'beebs' THEN
          c_deja := c_deja + 1; CONTINUE;                         -- preuve déjà là : aucune réécriture
        END IF;
        IF NOT coalesce(v_stock, false) THEN c_fiche_vendue := c_fiche_vendue + 1; CONTINUE; END IF;
        c_prouvees := c_prouvees + 1;
        IF v_ecrit THEN
          UPDATE cross_post_jobs c
             SET platform_fields = coalesce(c.platform_fields, '{}'::jsonb) || jsonb_build_object(
                   'sale_signal', 'sold',
                   -- La date de la COMMANDE : une vente ancienne n'envoie jamais de mail (push_trg_job, 24 h).
                   'unavailable_since', coalesce(c.platform_fields ->> 'unavailable_since',
                                                 to_char(coalesce(v_date, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
                   'sale_evidence', jsonb_build_object('platform', 'beebs', 'listing_id', v_id, 'state', 'sold', 'exact', true,
                     'source', 'commande_beebs', 'commande', v_ref, 'statut', v_statut, 'lu_le', now(), 'par', 'page_ventes_beebs'))
           WHERE c.id = v_job AND c.status = 'published';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  v_bilan := jsonb_build_object('mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
    'recues', c_recues, 'produits', c_produits, 'prouvees_ou_auraient', c_prouvees, 'deja', c_deja, 'doute', c_doute,
    'sans_job', c_sans_job, 'fiche_deja_vendue', c_fiche_vendue, 'forme_inconnue', c_forme, 'statut_inconnu', c_inconnu,
    'annulees', c_annulees, 'preuves_levees', c_levees, 'annulee_apres_vente', c_annulee_apres) || v_lecture;
  IF c_recues > 0 OR NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v_user AND u.feature = 'ventes_beebs_commandes'
                                    AND u.created_at > now() - interval '6 hours') THEN
    INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v_user, 'ventes_beebs_commandes', v_bilan);
  END IF;
  RETURN v_bilan;
END;
$function$;
REVOKE ALL ON FUNCTION public.commandes_beebs_noter(jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commandes_beebs_noter(jsonb, uuid, jsonb) TO authenticated, service_role;

COMMIT;
