-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC — migration 20261018000000_commande_annulee_jamais_une_vente
-- Rien n'est écrit : ROLLBACK final (aucune vente, aucune fiche, aucun mail).
-- ═══════════════════════════════════════════════════════════════════════════
-- Déroulé, dans UNE transaction :
--   A. AVANT  — les trois définitions de prod sont celles lues le 18/10 (md5) ;
--               l'interrupteur ventes_annulees_retrait_pause est ouvert ; compteurs
--               email_logs et push_ventes du compte de Nico ; données d'essai sur le
--               compte de Nico SEULEMENT (fiches « [ESSAI 18/10] » à 999 €, annonces
--               fictives 90181018xx, jobs vendus, copies Leboncoin / eBay / Beebs
--               retirées à la vente, relevé, ventes, reçus) ; le défaut REJOUÉ avec
--               l'ancienne règle : une commande d'avant le 13/10 est seulement signalée ;
--   B. LA MIGRATION — son contenu exact (gardes md5 + sauvegarde + définitions + droits) ;
--   C. APRÈS  — C1 commande d'avant le 13/10 → vente retirée, fiche au stock, annonce
--               fermée, job clos, 2 copies (Leboncoin, eBay) remises en file, la copie
--               Beebs dont le retrait n'a pas abouti laissée de côté ; C2 la file crée
--               les 2 publications (jobs normaux, restant = quantité de la fiche) ;
--               C3 vente saisie → signalée, rien touché ; C4 classes des statuts ;
--               C5 définitions en place, règle fermée à l'app, sauvegarde complète ;
--               C6 l'INVERSE rend les trois md5 d'avant ; C9 email_logs et
--               push_ventes inchangés.
-- Lancement (par le coordinateur) :
--   npx supabase db query --linked -f scripts/essais/20261018000000_essai.sql
-- Lecture : la dernière requête rend une ligne par contrôle (cas, attendu, obtenu,
-- ok) ; tout doit être ok = true.
-- Ce fichier est GÉNÉRÉ depuis 20261018000000_essai.template.sql par
-- scripts/essais/20261018000000_generer.mjs : les parties B et C6 sont identiques,
-- octet pour octet, au corps de la migration et de l'inverse (contrôlé par
-- scripts/commande-annulee-jamais-vente-selftest.mjs).

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.push_relance = '1';

CREATE TEMP TABLE _res (ordre serial, cas text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
CREATE TEMP TABLE _essai (n integer PRIMARY KEY, fiche bigint, annonce text, job uuid, vente bigint,
                          pub_lbc uuid, pub_ebay uuid, pub_beebs uuid) ON COMMIT DROP;

-- ═══ A. AVANT LA MIGRATION ═══════════════════════════════════════════════════

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A1 avant : md5 de prod des trois fonctions',
       '611992961f9c880c3a7b2291de920e6b cfb649bcad9b6d3fa071958c221d80ba 04783ef73ab0e604e984fe70fd6b99a1',
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) || ' '
       || md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) || ' '
       || md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure)),
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = '611992961f9c880c3a7b2291de920e6b'
       AND md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) = 'cfb649bcad9b6d3fa071958c221d80ba'
       AND md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure)) = '04783ef73ab0e604e984fe70fd6b99a1';

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A2 avant : interrupteur ventes_annulees_retrait_pause ouvert, aucun prix par plateforme', '0 / 0',
       coalesce((SELECT value::text FROM public.coin_config WHERE key = 'ventes_annulees_retrait_pause'), 'absent') || ' / '
       || coalesce((SELECT value::text FROM public.coin_config WHERE key = 'price_per_platform'), 'absent'),
       coalesce((SELECT value FROM public.coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 0
       AND coalesce((SELECT value FROM public.coin_config WHERE key = 'price_per_platform'), 0) = 0;

INSERT INTO _cpt (moment, mails, notes)
SELECT 'avant',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');

-- A4. Données d'essai, compte de Nico : fiches 9018101800001 à …003, annonces fictives 90181018xx.
--     n = 1 : commande d'AVANT le 13/10, fiche vendue, copies Leboncoin et eBay retirées à la
--             vente (retrait deleted armé par vente_article_serveur), copie Beebs dont le
--             retrait n'a PAS abouti ;
--     n = 2 : vente SAISIE (source manuel, aucun job) ;
--     n = 3 : comme n = 1 sans copies, rejouée avec l'ANCIENNE règle (A5).
DO $donnees$
DECLARE
  u      uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  f      bigint := 9018101800000;
  v_cree timestamptz := timestamptz '2026-10-01 10:00:00+02';
  n      integer; v_lid text; v_job uuid; v_id bigint; v_titre text; v_pub uuid; v_pf text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN f AND f + 99)
     OR EXISTS (SELECT 1 FROM public.inventaire WHERE user_id = u AND vinted_item_id LIKE '90181018%')
     OR EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE user_id = u AND platform_listing_id LIKE '90181018%')
     OR EXISTS (SELECT 1 FROM public.ventes WHERE user_id = u AND annonce_id LIKE '90181018%') THEN
    RAISE EXCEPTION 'essai : des données d''essai 90181018… existent déjà — essai arrêté, rien n''est écrit';
  END IF;

  FOR n IN 1..3 LOOP
    v_lid := '901810180' || n;
    v_titre := '[ESSAI 18/10] Commande annulée jamais une vente ' || n || ' — ne pas publier';
    INSERT INTO public.inventaire (id, user_id, titre, prix_vente, statut, quantite, plateforme, vinted_item_id, vinted_status, photos)
    VALUES (f + n, u, v_titre, 999, 'vendu', 0, 'vinted', v_lid, 'sold',
            jsonb_build_array('https://example.invalid/essai-1810-' || n || '.jpg'));
    v_job := NULL;
    IF n <> 2 THEN
      INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price,
                                          platform_listing_id, listing_url, published_at, sold_at, platform_fields)
      VALUES (u, f + n, 'vinted', 'publish', 'sold', 'original', v_titre, 999, v_lid, 'https://www.vinted.fr/items/' || v_lid,
              v_cree - interval '20 days', v_cree,
              jsonb_build_object('essai_1810', true, 'sale_signal', 'sold', 'vente_operation_cle', 'annonce:vinted:' || v_lid))
      RETURNING id INTO v_job;
      INSERT INTO public.vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status)
      VALUES (u, v_lid, f + n, v_cree + interval '1 day', ((v_cree + interval '1 day') AT TIME ZONE 'Europe/Paris')::date, 999, 'sold');
    END IF;
    INSERT INTO public.ventes (user_id, titre, prix_vente, plateforme, plateforme_code, statut, quantite, date,
                               annonce_id, inventaire_id, source, created_at)
    VALUES (u, v_titre, 999, 'Vinted', 'vinted', 'vendu', 1, (v_cree AT TIME ZONE 'Europe/Paris')::date,
            v_lid, f + n, CASE WHEN n = 2 THEN 'manuel' END, v_cree)
    RETURNING id INTO v_id;
    IF n <> 2 THEN
      INSERT INTO public.ventes_operations (user_id, cle, inventaire_id, job_id, resultat, cree_le)
      VALUES (u, 'annonce:vinted:' || v_lid, f + n, v_job,
              jsonb_build_object('ok', true, 'ventes_ids', jsonb_build_array(v_id), 'essai_1810', true), v_cree);
    END IF;
    INSERT INTO _essai (n, fiche, annonce, job, vente) VALUES (n, f + n, v_lid, v_job, v_id);
  END LOOP;

  -- n = 1 : les copies. Leboncoin et eBay : dépôt cancelled + retrait deleted armé à
  -- l'instant de la vente ; Beebs : dépôt cancelled + retrait resté « cancelled » (pas abouti).
  FOREACH v_pf IN ARRAY ARRAY['leboncoin', 'ebay', 'beebs'] LOOP
    v_lid := CASE v_pf WHEN 'leboncoin' THEN '9018101811' WHEN 'ebay' THEN '9018101812' ELSE '9018101813' END;
    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, description, price, photos,
                                        platform_listing_id, listing_url, published_at, error, platform_fields)
    VALUES (u, f + 1, v_pf, 'publish', 'cancelled', 'original',
            '[ESSAI 18/10] Commande annulée jamais une vente 1 — ne pas publier', 'Essai 18/10 — ne pas publier.', 999,
            jsonb_build_array('https://example.invalid/essai-1810-1.jpg'),
            v_lid, 'https://example.invalid/' || v_pf || '/' || v_lid, v_cree - interval '19 days',
            'Annonce retirée par le vendeur (retrait ciblé depuis l''app) — pas une vente',
            jsonb_build_object('essai_1810', true))
    RETURNING id INTO v_pub;
    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, platform_listing_id, listing_url, platform_fields)
    VALUES (u, f + 1, v_pf, 'delete', CASE WHEN v_pf = 'beebs' THEN 'cancelled' ELSE 'deleted' END, 'original',
            '[ESSAI 18/10] Commande annulée jamais une vente 1 — ne pas publier', v_lid, 'https://example.invalid/' || v_pf || '/' || v_lid,
            jsonb_build_object('essai_1810', true, 'arme_par', jsonb_build_object('le', v_cree, 'depot', v_pub,
                               'chemin', 'vente_article_serveur', 'pose_par', 'armer_retrait_job (serveur)')));
    UPDATE _essai SET pub_lbc = CASE WHEN v_pf = 'leboncoin' THEN v_pub ELSE pub_lbc END,
                      pub_ebay = CASE WHEN v_pf = 'ebay' THEN v_pub ELSE pub_ebay END,
                      pub_beebs = CASE WHEN v_pf = 'beebs' THEN v_pub ELSE pub_beebs END
     WHERE _essai.n = 1;
  END LOOP;
END
$donnees$;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A4 avant : données d''essai posées (compte de Nico)', '3 fiches, 2 jobs vendus, 3 ventes, 2 reçus, 3 dépôts annulés, 3 retraits',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9018101800001 AND 9018101800003) || ' fiches, '
       || (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9018101800001 AND 9018101800003 AND status = 'sold') || ' jobs vendus, '
       || (SELECT count(*) FROM public.ventes WHERE id IN (SELECT vente FROM _essai)) || ' ventes, '
       || (SELECT count(*) FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cle LIKE 'annonce:vinted:90181018%') || ' reçus, '
       || (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 9018101800001 AND status = 'cancelled' AND action = 'publish') || ' dépôts annulés, '
       || (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 9018101800001 AND action = 'delete') || ' retraits',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9018101800001 AND 9018101800003) = 3
       AND (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9018101800001 AND 9018101800003 AND status = 'sold') = 2
       AND (SELECT count(*) FROM public.ventes WHERE id IN (SELECT vente FROM _essai)) = 3
       AND (SELECT count(*) FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cle LIKE 'annonce:vinted:90181018%') = 2
       AND (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 9018101800001 AND status = 'cancelled' AND action = 'publish') = 3
       AND (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = 9018101800001 AND action = 'delete') = 3;

-- A5. Le défaut, REJOUÉ avec l'ANCIENNE règle (n = 3) : la commande est d'avant le 13/10,
--     la vente reste, seulement signalée.
DO $a5$
DECLARE r jsonb; e record;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 3;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9018101890003', NULL);
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'A5 avant : ancienne règle — commande d''avant le 13/10 seulement signalée, la vente reste',
    'signalee ; annulation_anterieure_a_la_regle ; vente présente ; fiche vendu',
    coalesce(r ->> 'action', '?') || ' ; '
      || coalesce((SELECT l.metadata ->> 'motif' FROM public.usage_logs l WHERE l.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
                     AND l.feature = 'vente_vinted_commande_annulee_signalee' AND l.metadata ->> 'vente' = e.vente::text LIMIT 1), '∅')
      || ' ; vente ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente) THEN 'présente' ELSE 'absente' END
      || ' ; fiche ' || (SELECT statut FROM public.inventaire WHERE id = e.fiche),
    r ->> 'action' = 'signalee'
      AND (SELECT l.metadata ->> 'motif' FROM public.usage_logs l WHERE l.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
             AND l.feature = 'vente_vinted_commande_annulee_signalee' AND l.metadata ->> 'vente' = e.vente::text LIMIT 1) = 'annulation_anterieure_a_la_regle'
      AND EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente)
      AND (SELECT statut FROM public.inventaire WHERE id = e.fiche) = 'vendu');
END
$a5$;

-- ═══ B. LA MIGRATION (son contenu exact, sans BEGIN/COMMIT) ═══════════════════

-- ═══ CORPS DE LA MIGRATION (repris à l'octet par l'essai à blanc) ═══════════
-- ── 0. Les définitions de prod n'ont pas bougé depuis leur lecture (18/10) ──
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure))
     IS DISTINCT FROM '611992961f9c880c3a7b2291de920e6b' THEN
    RAISE EXCEPTION 'vente_commande_annulee_vinted a changé en prod depuis le 18/10 : migration arrêtée, rien n''est écrit';
  END IF;
  IF md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure))
     IS DISTINCT FROM 'cfb649bcad9b6d3fa071958c221d80ba' THEN
    RAISE EXCEPTION 'remises_en_vente_tick a changé en prod depuis le 18/10 : migration arrêtée, rien n''est écrit';
  END IF;
  IF md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure))
     IS DISTINCT FROM '04783ef73ab0e604e984fe70fd6b99a1' THEN
    RAISE EXCEPTION 'ventes_statut_classe a changé en prod depuis le 18/10 : migration arrêtée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 0b. Les définitions d'AVANT, gardées pour l'inverse (jamais relues ailleurs) ──
CREATE TABLE IF NOT EXISTS public._backup_1810_fonctions_commande_annulee (
  ordre integer PRIMARY KEY, nom text NOT NULL, def text NOT NULL, md5 text NOT NULL, garde_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_1810_fonctions_commande_annulee ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1810_fonctions_commande_annulee FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_1810_fonctions_commande_annulee (ordre, nom, def, md5)
SELECT 1, 'vente_commande_annulee_vinted', d, md5(d) FROM pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure) d
UNION ALL
SELECT 2, 'remises_en_vente_tick', d, md5(d) FROM pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure) d
UNION ALL
SELECT 3, 'ventes_statut_classe', d, md5(d) FROM pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure) d
ON CONFLICT (ordre) DO NOTHING;

-- ── 1. vente_commande_annulee_vinted : plus de date-charnière ; les copies reviennent ──
CREATE OR REPLACE FUNCTION public.vente_commande_annulee_vinted(p_vente bigint, p_statut text, p_commande text, p_commande_le timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_motif text := 'commande_' || lower(coalesce(nullif(btrim(p_statut), ''), 'annulee'));
  v_rendue text := NULL; v_hist bigint; v_ms bigint; v_snap record; v_job text := NULL; v_q integer;
  v_vs text := NULL; v_recus jsonb := NULL;   -- (17/10) l'annonce de la fiche ; les reçus gardés dans la trace
  v_copie record; v_copies integer := 0;      -- (18/10) les copies retirées à cause de cette vente
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  IF v.plateforme_code IS DISTINCT FROM 'vinted' THEN RETURN jsonb_build_object('action', 'hors_sujet'); END IF;
  -- Même interrupteur et même liste d'attente que la règle eBay (09/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  -- La preuve de la plateforme : l'annonce FillSell close « vendue » sur ce numéro.
  IF v.annonce_id IS NOT NULL THEN
    SELECT * INTO j FROM cross_post_jobs c
     WHERE c.user_id = v.user_id AND c.platform = 'vinted' AND c.status = 'sold'
       AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  END IF;
  -- (18/10, règle de Nico) UNE COMMANDE ÉCHOUÉE, ANNULÉE OU REMBOURSÉE N'EST JAMAIS
  -- UNE VENTE, quelle que soit sa date : seule une vente SAISIE à la main (ni relevé,
  -- ni annonce close « vendue » sur son numéro) reste, signalée une fois.
  IF NOT (coalesce(v.source, '') = 'releve' OR j.id IS NOT NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_vinted_commande_annulee_signalee'
                    AND u.metadata ->> 'vente' = v.id::text) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_vinted_commande_annulee_signalee',
        jsonb_build_object('vente', v.id::text, 'commande', p_commande, 'statut', p_statut, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'motif', 'vente_saisie_jamais_retiree'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'vinted', coalesce(v.commande_ref, p_commande), v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_vinted', v_motif);
  -- (17/10) Le reçu qui va tomber part dans la trace : une réparation inverse le rend tel quel.
  IF v.annonce_id IS NOT NULL THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o
     WHERE o.user_id = v.user_id AND o.cle = 'annonce:vinted:' || v.annonce_id;
  END IF;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'statut', p_statut, 'commande', p_commande, 'source', 'releve_vinted', 'motif', v_motif,
                       'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  -- Le reçu de la vente tombe avec elle : une vraie vente future de la même
  -- annonce (remise en ligne par Vinted) s'enregistrera normalement.
  IF v.annonce_id IS NOT NULL THEN
    DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = 'annonce:vinted:' || v.annonce_id;
  END IF;

  -- (17/10) Le dernier relevé de l'annonce, lu UNE fois : il décide du job et de vinted_status.
  IF v.annonce_id IS NOT NULL THEN
    SELECT s.status, s.captured_at INTO v_snap FROM vinted_listing_snapshots s
     WHERE s.user_id = v.user_id AND s.vinted_item_id = v.annonce_id ORDER BY s.captured_at DESC LIMIT 1;
  END IF;

  -- La fiche revient au stock.
  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL THEN
      IF i.statut = 'vendu' AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
        UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'commande_annulee', traite_le = now()
         WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
        UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
        v_rendue := 'fiche';
        -- (18/10) LES COPIES RETIRÉES À CAUSE DE CETTE VENTE REVIENNENT PAR LES JOBS
        -- NORMAUX : un retrait `deleted` d'une autre plateforme, armé par
        -- vente_article_serveur à l'instant de la vente (± 2 min), dont le dépôt est
        -- `cancelled` → une ligne remises_en_vente sur CE dépôt (marqué
        -- vente_annulee_remise) ; remises_en_vente_tick crée la publication avec ses
        -- gardes (déjà en vente, plafond, poste absent, pause, jamais un débit).
        FOR v_copie IN
          SELECT d.platform, p.id AS depot
            FROM cross_post_jobs d
            JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
           WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete' AND d.status = 'deleted'
             AND d.platform <> 'vinted'
             AND d.platform_fields #>> '{arme_par,chemin}' = 'vente_article_serveur'
             AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
             AND p.user_id = v.user_id AND p.platform = d.platform AND p.status = 'cancelled'
             AND coalesce(p.action, 'publish') IN ('publish', 'republish')
          ORDER BY d.platform
        LOOP
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut', p_statut, 'le', now()))
           WHERE id = v_copie.depot;
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now() + interval '2 minutes')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'a_faire', motif = NULL, prochain_essai = now() + interval '2 minutes', traite_le = NULL
            WHERE remises_en_vente.statut <> 'faite';
          v_copies := v_copies + 1;
        END LOOP;
      ELSIF i.statut = 'stock' THEN
        -- Plusieurs exemplaires : l'exemplaire revient, sa copie « vendue » (créée
        -- par enregistrer_vente_atomique au même instant, sans lien) est effacée.
        UPDATE inventaire SET quantite = coalesce(quantite, 0) + v_q WHERE id = i.id;
        v_ms := floor(extract(epoch FROM v.created_at) * 1000)::bigint;
        SELECT h.id INTO v_hist FROM inventaire h
         WHERE h.user_id = v.user_id AND h.statut = 'vendu' AND h.id BETWEEN v_ms - 2000 AND v_ms + 20000
           AND h.titre IS NOT DISTINCT FROM i.titre AND h.prix_vente IS NOT DISTINCT FROM v.prix_vente
           AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = h.id)
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.inventaire_id = h.id)
         ORDER BY abs(h.id - v_ms) LIMIT 1;
        IF v_hist IS NOT NULL THEN DELETE FROM inventaire WHERE id = v_hist; END IF;
        v_rendue := 'exemplaire';
      END IF;
      IF v_rendue IS NOT NULL THEN
        INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
          (v.user_id, i.id, CASE WHEN v_rendue = 'fiche' THEN 'statut' ELSE 'quantite' END,
           CASE WHEN v_rendue = 'fiche' THEN i.statut ELSE i.quantite::text END,
           CASE WHEN v_rendue = 'fiche' THEN 'stock' ELSE (coalesce(i.quantite, 0) + v_q)::text END,
           'releve_vinted', 'commande_annulee',
           jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut_vinted', p_statut, 'copie_effacee', v_hist, 'copies_remises', v_copies));
        -- (17/10) L'ANNONCE DE LA FICHE : la valeur que le relevé du dressing écrit
        -- (content-scripts/vinted.js : 'closed' = fermée sans vente, 'active' = en ligne),
        -- seulement si la fiche porte CETTE annonce et si la valeur change — tracée
        -- dans inventaire_journal comme le statut.
        IF v.annonce_id IS NOT NULL AND btrim(coalesce(i.vinted_item_id, '')) = v.annonce_id THEN
          v_vs := CASE WHEN v_snap.status = 'active' AND v_snap.captured_at > coalesce(j.sold_at, v.created_at)
                       THEN 'active' ELSE 'closed' END;
          IF i.vinted_status IS DISTINCT FROM v_vs THEN
            UPDATE inventaire SET vinted_status = v_vs WHERE id = i.id AND vinted_status IS DISTINCT FROM v_vs;
            INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
              (v.user_id, i.id, 'vinted_status', i.vinted_status, v_vs, 'releve_vinted', 'commande_annulee',
               jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut_vinted', p_statut,
                                  'releve_statut', v_snap.status, 'releve_le', v_snap.captured_at));
          ELSE
            v_vs := NULL;   -- déjà la bonne valeur : rien d'écrit
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- L'annonce : revue EN LIGNE après la vente → le job redevient « publié » ;
  -- sinon il est clos et le dit. Jamais une remise en ligne en silence.
  IF j.id IS NOT NULL THEN
    IF v_snap.status = 'active' AND v_snap.captured_at > coalesce(j.sold_at, v.created_at) THEN
      UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
             platform_fields = (coalesce(platform_fields, '{}'::jsonb)
               - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
               || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'commande', p_commande, 'statut', p_statut,
                                     'vente', v.id, 'annonce', 'en_ligne', 'releve_le', v_snap.captured_at))
       WHERE id = j.id AND status = 'sold';
      v_job := 'en_ligne';
    ELSE
      UPDATE cross_post_jobs SET status = 'cancelled',
             error = 'Commande Vinted annulée : l''article est revenu dans ton stock. L''annonce Vinted reste fermée : remets-le en vente quand tu veux.',
             platform_fields = coalesce(platform_fields, '{}'::jsonb)
               || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'commande', p_commande, 'statut', p_statut,
                                     'vente', v.id, 'annonce', 'fermee'))
       WHERE id = j.id AND status = 'sold';
      v_job := 'close';
    END IF;
  END IF;
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'copie_effacee', v_hist, 'job', v_job, 'vinted_status', v_vs,
                            'copies_remises', v_copies);
END;
$function$
;

REVOKE ALL ON FUNCTION public.vente_commande_annulee_vinted(bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── 2. remises_en_vente_tick : une copie retirée à cause d'une vente annulée revient ──
CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_cpu numeric;
  r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_op jsonb; v_place jsonb; v_motif text; v_report timestamptz; v_nouveau uuid;
  v_vu timestamptz; v_api boolean; v_sortie bigint; v_prix integer;
  v_faites integer := 0; v_abandons integer := 0; v_reports integer := 0;
  v_annul boolean; v_restant integer;   -- (18/10) copie retirée à cause d'une vente annulée
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;
    -- (18/10) Le dépôt `cancelled` d'une copie retirée à cause d'une vente Vinted
    -- annulée (vente_commande_annulee_vinted) : pas de reçu, le restant est la
    -- quantité de la fiche ; toutes les autres gardes s'appliquent.
    v_annul := (j.id IS NOT NULL AND j.status = 'cancelled' AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'));
    v_restant := CASE WHEN v_annul THEN COALESCE(i.quantite, 1) ELSE NULLIF(v_op->>'restant', '')::integer END;

    IF j.id IS NULL OR (j.status <> 'sold' AND NOT v_annul) THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF NOT v_annul AND (v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true') THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF NOT v_annul AND COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay', 'depop') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      -- (06/10 soir) eBay : une annonce importée n'est « vendue » que si eBay
      -- la dit ÉPUISÉE (ebay-api-worker, sale_evidence.exact) — elle n'est plus
      -- en ligne ; la fiche qui garde du stock doit être remise en vente.
      AND NOT (r.platform = 'ebay' AND (
            COALESCE(j.platform_fields #>> '{sale_evidence,exact}', '') = 'true'
         OR (COALESCE(j.platform_fields #>> '{quantite_ebay,exacte}', '') = 'true'
             AND COALESCE(NULLIF(j.platform_fields #>> '{quantite_ebay,disponible}', '')::numeric, 1) <= 0))) THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
    -- (08/10, Louis) L'annonce « vendue » est encore EN LIGNE après la vente
    -- (dressing Vinted, relevé des autres plateformes) : une remise ferait un
    -- doublon. On revient dans 6 h (la vente annulée ou l'annonce partie, elle
    -- repart d'elle-même).
    ELSIF (r.platform = 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND (
             SELECT s.status = 'active' AND s.captured_at > COALESCE(j.sold_at, now())
               FROM vinted_listing_snapshots s
              WHERE s.user_id = r.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
              ORDER BY s.captured_at DESC LIMIT 1))
       OR (r.platform <> 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND EXISTS (
             SELECT 1 FROM annonces_plateforme a
              WHERE a.user_id = r.user_id AND a.platform = r.platform AND a.listing_id = btrim(j.platform_listing_id)
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now()))) THEN
      v_motif := 'annonce_vendue_encore_en_ligne'; v_report := now() + interval '6 hours';
    ELSIF EXISTS (
        SELECT 1 FROM cross_post_jobs c
         WHERE c.user_id = r.user_id AND c.inventaire_id = r.inventaire_id AND c.platform = r.platform
           AND c.id <> j.id AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
           AND (c.status IN ('pending', 'processing', 'needs_user')
                OR (c.status = 'published' AND NOT EXISTS (
                      SELECT 1 FROM cross_post_jobs d
                       WHERE d.user_id = c.user_id AND d.inventaire_id = c.inventaire_id
                         AND d.platform = c.platform AND d.action = 'delete' AND d.status = 'deleted'
                         AND CASE WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                                   AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                                  THEN annonce_id_de_job(d.platform_listing_id, d.listing_url)
                                     = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                                  ELSE d.created_at > COALESCE(c.published_at, c.created_at) END))))
      OR EXISTS (
        SELECT 1 FROM annonces_plateforme a
         WHERE a.user_id = r.user_id AND a.inventaire_id = r.inventaire_id AND a.platform = r.platform
           AND a.statut_plateforme IN ('en_ligne', 'en_verification')
           AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
           AND a.listing_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- (09/10 soir, Louis) Plus de branche « jumeau_en_ligne » : l'annonce
    -- d'une AUTRE fiche ne retient jamais la remise en vente de celle-ci
    -- (migration 20261009233000). « deja_en_vente » (CETTE fiche) reste.
    END IF;

    IF v_motif IS NULL AND EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = r.platform AND h.paused) THEN
      v_motif := 'plateforme_en_pause'; v_report := now() + interval '1 hour';
    END IF;
    IF v_motif IS NULL THEN
      SELECT p.extension_last_seen_at, COALESCE(p.ebay_voie_api, false) INTO v_vu, v_api
        FROM profiles p WHERE p.id = r.user_id;
      IF NOT (v_vu > now() - interval '7 days' OR (r.platform = 'ebay' AND v_api)) THEN
        v_motif := 'poste_absent'; v_report := now() + interval '6 hours';
      END IF;
    END IF;
    IF v_motif IS NULL THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                j.title, j.description, j.price, j.photos,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now())))
        RETURNING id INTO v_nouveau;
      EXCEPTION
        WHEN unique_violation THEN v_motif := 'deja_en_vente';
        WHEN OTHERS THEN v_motif := 'refus_creation: ' || left(SQLERRM, 160);
      END;
    END IF;

    IF v_nouveau IS NOT NULL THEN
      UPDATE remises_en_vente SET statut = 'faite', motif = NULL, job_cree = v_nouveau,
             essais = essais + 1, traite_le = now() WHERE id = r.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (r.user_id, 'remise_en_vente', jsonb_build_object('plateforme', r.platform,
        'inventaire_id', r.inventaire_id::text, 'job_vendu', j.id, 'job_cree', v_nouveau,
        'restant', v_restant, 'apres_annulation', v_annul));
      v_faites := v_faites + 1;
    ELSIF v_report IS NOT NULL AND v_report <> 'infinity' THEN
      UPDATE remises_en_vente SET motif = v_motif, essais = essais + 1, prochain_essai = v_report,
             traite_le = now() WHERE id = r.id;
      v_reports := v_reports + 1;
    ELSE
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = v_motif, essais = essais + 1,
             traite_le = now() WHERE id = r.id;
      v_abandons := v_abandons + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('issue', 'tour', 'faites', v_faites, 'reportees', v_reports,
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$
;

-- ── 3. ventes_statut_classe : « canceled » / « cancelled » Vinted, « refunded » eBay ──
CREATE OR REPLACE FUNCTION public.ventes_statut_classe(p_platform text, p_statut text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'completed' THEN 'vente' WHEN 'failed' THEN 'annulee'
      -- (18/10, règle de Nico) une commande annulée n'est jamais une vente, sous
      -- tous ses noms (vinted_commande_annulee les connaissait déjà).
      WHEN 'canceled' THEN 'annulee' WHEN 'cancelled' THEN 'annulee' ELSE 'inconnu' END
    WHEN 'leboncoin' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'done' THEN 'vente' WHEN 'cancelled' THEN 'annulee'
      WHEN 'in_progress' THEN 'en_cours' ELSE 'inconnu' END
    WHEN 'opla' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'shipped' THEN 'vente' WHEN 'delivered' THEN 'vente' WHEN 'completed' THEN 'vente'
      WHEN 'accepted' THEN 'en_cours' WHEN 'waiting_for_shipment' THEN 'en_cours'
      WHEN 'cancelled' THEN 'annulee' WHEN 'refused' THEN 'annulee' WHEN 'failed' THEN 'annulee'
      ELSE 'inconnu' END
    -- (09/10) Depop : l'annonce passe STATUS_PURCHASED à l'achat (relevé du 09/10,
    -- annonce vendue publique 936331996) ; aucun autre statut n'est observé.
    WHEN 'depop' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'status_purchased' THEN 'vente' ELSE 'inconnu' END
    WHEN 'ebay' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'paid' THEN 'vente' WHEN 'partially_refunded' THEN 'vente'
      WHEN 'fully_refunded' THEN 'annulee' WHEN 'cancelled' THEN 'annulee'
      -- (18/10) remboursée sous son autre nom : jamais une vente.
      WHEN 'refunded' THEN 'annulee'
      -- (09/10 soir) annulation demandée, pas encore faite : ni vente, ni retrait.
      WHEN 'annulation_en_cours' THEN 'en_cours'
      ELSE 'inconnu' END
    ELSE 'inconnu' END;
$function$
;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════

-- ═══ C. APRÈS LA MIGRATION ═══════════════════════════════════════════════════

-- C1. Commande d'AVANT le 13/10 (n = 1) : la vente est retirée, la fiche au stock, l'annonce
--     fermée, le job clos ; 2 copies remises en file (Leboncoin, eBay), Beebs laissée.
DO $c1$
DECLARE r jsonb; e record; i record; v_trace jsonb;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 1;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9018101890001', NULL);
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT l.metadata INTO v_trace FROM public.usage_logs l
   WHERE l.user_id = i.user_id AND l.feature = 'vente_retiree' AND l.metadata -> 'vente' ->> 'id' = e.vente::text;
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C1 après : commande d''avant le 13/10 → vente retirée, fiche au stock, annonce fermée, job clos, 2 copies remises',
    'retiree/fiche/close/closed/2 ; stock/1/closed ; vente absente ; trace avec reçu ; supprimée 1 ; job cancelled',
    coalesce(r ->> 'action', '?') || '/' || coalesce(r ->> 'fiche', '∅') || '/' || coalesce(r ->> 'job', '∅') || '/' || coalesce(r ->> 'vinted_status', '∅') || '/' || coalesce(r ->> 'copies_remises', '∅')
      || ' ; ' || i.statut || '/' || coalesce(i.quantite::text, '∅') || '/' || coalesce(i.vinted_status, '∅')
      || ' ; vente ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente) THEN 'présente' ELSE 'absente' END
      || ' ; trace ' || CASE WHEN v_trace ? 'recus' AND jsonb_typeof(v_trace -> 'recus') = 'array' THEN 'avec reçu' ELSE 'sans reçu' END
      || ' ; supprimée ' || (SELECT count(*) FROM public.ventes_supprimees s WHERE s.vente_id = e.vente)
      || ' ; job ' || (SELECT status FROM public.cross_post_jobs WHERE id = e.job),
    r ->> 'action' = 'retiree' AND r ->> 'fiche' = 'fiche' AND r ->> 'job' = 'close' AND r ->> 'vinted_status' = 'closed' AND (r ->> 'copies_remises')::int = 2
      AND i.statut = 'stock' AND i.quantite = 1 AND i.vinted_status = 'closed'
      AND NOT EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente)
      AND v_trace ? 'recus' AND jsonb_typeof(v_trace -> 'recus') = 'array'
      AND (SELECT count(*) FROM public.ventes_supprimees s WHERE s.vente_id = e.vente) = 1
      AND (SELECT status FROM public.cross_post_jobs WHERE id = e.job) = 'cancelled');
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C1b après : la file remises_en_vente porte Leboncoin et eBay (dépôts marqués), jamais Beebs',
    'leboncoin:a_faire ebay:a_faire ; marqués 2 ; beebs sans marqueur, sans ligne',
    coalesce((SELECT string_agg(platform || ':' || statut, ' ' ORDER BY platform) FROM public.remises_en_vente WHERE inventaire_id = e.fiche AND job_vendu IN (e.pub_lbc, e.pub_ebay, e.pub_beebs)), '∅')
      || ' ; marqués ' || (SELECT count(*) FROM public.cross_post_jobs WHERE id IN (e.pub_lbc, e.pub_ebay, e.pub_beebs) AND platform_fields ? 'vente_annulee_remise')
      || ' ; beebs ' || CASE WHEN (SELECT platform_fields ? 'vente_annulee_remise' FROM public.cross_post_jobs WHERE id = e.pub_beebs) THEN 'marqué' ELSE 'sans marqueur' END
      || ', ' || CASE WHEN EXISTS (SELECT 1 FROM public.remises_en_vente WHERE job_vendu = e.pub_beebs) THEN 'avec ligne' ELSE 'sans ligne' END,
    (SELECT string_agg(platform || ':' || statut, ' ' ORDER BY platform) FROM public.remises_en_vente WHERE inventaire_id = e.fiche AND job_vendu IN (e.pub_lbc, e.pub_ebay, e.pub_beebs)) = 'ebay:a_faire leboncoin:a_faire'
      AND (SELECT count(*) FROM public.cross_post_jobs WHERE id IN (e.pub_lbc, e.pub_ebay, e.pub_beebs) AND platform_fields ? 'vente_annulee_remise') = 2
      AND NOT (SELECT platform_fields ? 'vente_annulee_remise' FROM public.cross_post_jobs WHERE id = e.pub_beebs)
      AND NOT EXISTS (SELECT 1 FROM public.remises_en_vente WHERE job_vendu = e.pub_beebs));
END
$c1$;

-- C2. La file crée les publications (jobs normaux) : 2 faites, restant = quantité de la fiche.
DO $c2$
DECLARE r jsonb; e record;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 1;
  UPDATE public.remises_en_vente SET prochain_essai = now() - interval '1 second' WHERE job_vendu IN (e.pub_lbc, e.pub_ebay);
  r := public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C2 après : remises_en_vente_tick crée les 2 publications (Leboncoin, eBay), en file, restant 1',
    'tour faites 2 abandonnées 0 ; 2 jobs pending publish apres_annulation ; lignes faites 2 ; motifs ∅',
    coalesce(r ->> 'issue', '?') || ' faites ' || coalesce(r ->> 'faites', '?') || ' abandonnées ' || coalesce(r ->> 'abandonnees', '?')
      || ' ; ' || (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending' AND c.action = 'publish'
                     AND c.platform IN ('leboncoin', 'ebay') AND (c.platform_fields #>> '{remise_en_vente,apres_annulation}') = 'true'
                     AND (c.platform_fields #>> '{remise_en_vente,restant}') = '1') || ' jobs'
      || ' ; lignes faites ' || (SELECT count(*) FROM public.remises_en_vente WHERE job_vendu IN (e.pub_lbc, e.pub_ebay) AND statut = 'faite' AND job_cree IS NOT NULL)
      || ' ; motifs ' || coalesce((SELECT string_agg(coalesce(motif, '∅'), ',') FROM public.remises_en_vente WHERE job_vendu IN (e.pub_lbc, e.pub_ebay)), '∅'),
    r ->> 'issue' = 'tour' AND (r ->> 'faites')::int = 2 AND (r ->> 'abandonnees')::int = 0
      AND (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending' AND c.action = 'publish'
             AND c.platform IN ('leboncoin', 'ebay') AND (c.platform_fields #>> '{remise_en_vente,apres_annulation}') = 'true'
             AND (c.platform_fields #>> '{remise_en_vente,restant}') = '1') = 2
      AND (SELECT count(*) FROM public.remises_en_vente WHERE job_vendu IN (e.pub_lbc, e.pub_ebay) AND statut = 'faite' AND job_cree IS NOT NULL) = 2);
  -- Les nouvelles publications ne portent pas le marqueur du dépôt annulé (remise_en_vente_champs).
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C2b après : la publication neuve ne porte ni vente_annulee_remise ni vente_operation_cle', '0',
    (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending'
       AND (c.platform_fields ? 'vente_annulee_remise' OR c.platform_fields ? 'vente_operation_cle'))::text,
    (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending'
       AND (c.platform_fields ? 'vente_annulee_remise' OR c.platform_fields ? 'vente_operation_cle')) = 0);
  -- Rejeu : la même ligne n'est plus à faire, le tick ne crée rien de plus.
  r := public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C2c après : rejeu du tick — rien de plus', 'faites 0 ; 2 jobs',
    'faites ' || coalesce(r ->> 'faites', '?') || ' ; ' || (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending') || ' jobs',
    (r ->> 'faites')::int = 0 AND (SELECT count(*) FROM public.cross_post_jobs c WHERE c.inventaire_id = e.fiche AND c.status = 'pending') = 2);
END
$c2$;

-- C3. Vente SAISIE (n = 2) : signalée, rien touché.
DO $c3$
DECLARE r jsonb; e record;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 2;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9018101890002', NULL);
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C3 après : vente saisie → signalée (vente_saisie_jamais_retiree), vente et fiche intactes',
    'signalee ; vente_saisie_jamais_retiree ; vente présente ; vendu',
    coalesce(r ->> 'action', '?') || ' ; '
      || coalesce((SELECT l.metadata ->> 'motif' FROM public.usage_logs l WHERE l.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
                     AND l.feature = 'vente_vinted_commande_annulee_signalee' AND l.metadata ->> 'vente' = e.vente::text LIMIT 1), '∅')
      || ' ; vente ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente) THEN 'présente' ELSE 'absente' END
      || ' ; ' || (SELECT statut FROM public.inventaire WHERE id = e.fiche),
    r ->> 'action' = 'signalee'
      AND (SELECT l.metadata ->> 'motif' FROM public.usage_logs l WHERE l.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
             AND l.feature = 'vente_vinted_commande_annulee_signalee' AND l.metadata ->> 'vente' = e.vente::text LIMIT 1) = 'vente_saisie_jamais_retiree'
      AND EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente)
      AND (SELECT statut FROM public.inventaire WHERE id = e.fiche) = 'vendu');
END
$c3$;

-- C4. Les classes de statut.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C4 après : classes — vinted failed/canceled/cancelled annulées, completed vente ; ebay refunded annulée, paid vente ; leboncoin inchangé',
       'annulee annulee annulee vente ; annulee annulee annulee vente ; vente annulee en_cours',
       public.ventes_statut_classe('vinted', 'failed') || ' ' || public.ventes_statut_classe('vinted', 'canceled') || ' ' || public.ventes_statut_classe('vinted', 'CANCELLED') || ' ' || public.ventes_statut_classe('vinted', 'completed')
       || ' ; ' || public.ventes_statut_classe('ebay', 'refunded') || ' ' || public.ventes_statut_classe('ebay', 'FULLY_REFUNDED') || ' ' || public.ventes_statut_classe('ebay', 'cancelled') || ' ' || public.ventes_statut_classe('ebay', 'paid')
       || ' ; ' || public.ventes_statut_classe('leboncoin', 'done') || ' ' || public.ventes_statut_classe('leboncoin', 'cancelled') || ' ' || public.ventes_statut_classe('leboncoin', 'in_progress'),
       public.ventes_statut_classe('vinted', 'failed') = 'annulee' AND public.ventes_statut_classe('vinted', 'canceled') = 'annulee'
       AND public.ventes_statut_classe('vinted', 'CANCELLED') = 'annulee' AND public.ventes_statut_classe('vinted', 'completed') = 'vente'
       AND public.ventes_statut_classe('ebay', 'refunded') = 'annulee' AND public.ventes_statut_classe('ebay', 'FULLY_REFUNDED') = 'annulee'
       AND public.ventes_statut_classe('ebay', 'cancelled') = 'annulee' AND public.ventes_statut_classe('ebay', 'paid') = 'vente'
       AND public.ventes_statut_classe('leboncoin', 'done') = 'vente' AND public.ventes_statut_classe('leboncoin', 'cancelled') = 'annulee'
       AND public.ventes_statut_classe('leboncoin', 'in_progress') = 'en_cours';

-- C5. Les définitions nouvelles sont en place, fermées à l'app ; la sauvegarde a ses 3 lignes.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C5 après : définitions nouvelles, règle fermée à l''app, sauvegarde de 3 définitions aux md5 d''avant',
       'neuve/neuve/neuve ; fermée ; 3 ; md5 gardés = A1',
       CASE WHEN position('vente_annulee_remise' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0 THEN 'neuve' ELSE 'ancienne' END
       || '/' || CASE WHEN position('vente_annulee_remise' IN pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) > 0 THEN 'neuve' ELSE 'ancienne' END
       || '/' || CASE WHEN public.ventes_statut_classe('vinted', 'cancelled') = 'annulee' THEN 'neuve' ELSE 'ancienne' END
       || ' ; ' || CASE WHEN has_function_privilege('authenticated', 'public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)', 'execute') THEN 'OUVERTE' ELSE 'fermée' END
       || ' ; ' || (SELECT count(*) FROM public._backup_1810_fonctions_commande_annulee)
       || ' ; ' || coalesce((SELECT string_agg(md5, ' ' ORDER BY ordre) FROM public._backup_1810_fonctions_commande_annulee), '∅'),
       position('vente_annulee_remise' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0
       AND position('vente_annulee_remise' IN pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) > 0
       AND NOT has_function_privilege('authenticated', 'public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)', 'execute')
       AND (SELECT count(*) FROM public._backup_1810_fonctions_commande_annulee) = 3
       AND (SELECT string_agg(md5, ' ' ORDER BY ordre) FROM public._backup_1810_fonctions_commande_annulee)
           = '611992961f9c880c3a7b2291de920e6b cfb649bcad9b6d3fa071958c221d80ba 04783ef73ab0e604e984fe70fd6b99a1';

-- C6. L'INVERSE rend les trois md5 d'avant (son contenu exact, sans BEGIN/COMMIT).
-- ═══ CORPS DE L'INVERSE (repris à l'octet par l'essai à blanc) ══════════════
DO $inverse$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public._backup_1810_fonctions_commande_annulee ORDER BY ordre LOOP
    EXECUTE r.def;
  END LOOP;
END
$inverse$;

REVOKE ALL ON FUNCTION public.vente_commande_annulee_vinted(bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

DO $verif$
DECLARE r record; v_md5 text;
BEGIN
  FOR r IN SELECT * FROM public._backup_1810_fonctions_commande_annulee ORDER BY ordre LOOP
    v_md5 := CASE r.nom
      WHEN 'vente_commande_annulee_vinted' THEN md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure))
      WHEN 'remises_en_vente_tick' THEN md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure))
      WHEN 'ventes_statut_classe' THEN md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure))
    END;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION 'inverse : % relue avec le md5 % au lieu de % — tout est annulé', r.nom, v_md5, r.md5;
    END IF;
  END LOOP;
END
$verif$;
-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C6 après : l''inverse rend les trois définitions d''avant (md5 de A1)',
       '611992961f9c880c3a7b2291de920e6b cfb649bcad9b6d3fa071958c221d80ba 04783ef73ab0e604e984fe70fd6b99a1',
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) || ' '
       || md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) || ' '
       || md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure)),
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = '611992961f9c880c3a7b2291de920e6b'
       AND md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) = 'cfb649bcad9b6d3fa071958c221d80ba'
       AND md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure)) = '04783ef73ab0e604e984fe70fd6b99a1'
       AND NOT has_function_privilege('authenticated', 'public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)', 'execute');

-- C9. Aucun mail, aucune note ; journal et traces bornés aux fiches d'essai.
INSERT INTO _cpt (moment, mails, notes)
SELECT 'apres',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C9 après : email_logs et push_ventes du compte inchangés ; journal borné aux fiches d''essai',
       'mails =, notes = ; journal 2 (statut, vinted_status) sur la fiche 1 seulement',
       'mails ' || a.mails || '→' || b.mails || ', notes ' || a.notes || '→' || b.notes
       || ' ; journal ' || (SELECT count(*) FROM public.inventaire_journal WHERE motif = 'commande_annulee' AND inventaire_id BETWEEN 9018101800001 AND 9018101800003)
       || ' (' || coalesce((SELECT string_agg(champ, ',' ORDER BY champ) FROM public.inventaire_journal WHERE motif = 'commande_annulee' AND inventaire_id = 9018101800001), '∅') || ')',
       a.mails = b.mails AND a.notes = b.notes
       AND (SELECT count(*) FROM public.inventaire_journal WHERE motif = 'commande_annulee' AND inventaire_id BETWEEN 9018101800001 AND 9018101800003) = 2
       AND (SELECT string_agg(champ, ',' ORDER BY champ) FROM public.inventaire_journal WHERE motif = 'commande_annulee' AND inventaire_id = 9018101800001) = 'statut,vinted_status'
  FROM _cpt a, _cpt b WHERE a.moment = 'avant' AND b.moment = 'apres';

SELECT ordre, cas, attendu, obtenu, ok FROM _res ORDER BY ordre;

ROLLBACK;
