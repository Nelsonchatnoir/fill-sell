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

-- @@CORPS_MIGRATION@@

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
-- @@CORPS_INVERSE@@
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
