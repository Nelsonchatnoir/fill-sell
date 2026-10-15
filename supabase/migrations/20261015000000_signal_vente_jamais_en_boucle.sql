-- ════════════════════════════════════════════════════════════════════════════
-- UNE CARTE « VENDUE » N'EST JAMAIS UNE BOUCLE (15/10/2026, P1-0 — Louis, Tech-t)
-- ════════════════════════════════════════════════════════════════════════════
-- Constats prouvés en prod le 14/10 (rapport docs/enquetes/reprise-1410/) :
--  1. Louis, « 12 adaptateurs Vert » (job d7b3b535, annonce 10289157745) : l'annonce
--     est EN LIGNE (relevé du dressing 20:20:17). Le « vendu » vient de la synchro du
--     dressing de l'extension : pour une ANCIENNE annonce vendue de la même fiche
--     (même produit remis en vente, stock 9 996), faute de job par numéro elle prend
--     « le job vivant de la fiche » et y colle le signal. Le serveur l'a démenti
--     (vinted_dressing_dement_signaux, 20:20:20), puis la même synchro l'a reposé.
--     enregistrer_vente_atomique refuse la vente (« toujours en ligne ») SANS lever le
--     signal, et l'app n'offre aucune sortie sous un « vendu » : la carte revient à
--     chaque rechargement.
--  2. Kit bûche / Raiponce (Louis, 12/10), Swatch (Tech-t, 11/10) : un VRAI « vendu »
--     sur une fiche déjà vendue par une vente saisie → refus « stock déjà vendu »,
--     carte éternelle (≈ 30 cartes de ce type dans le parc).
-- Règles posées ici (jamais un titre, toujours le numéro de l'annonce) :
--  a. un signal « vendu » posé sur une annonce Vinted que la synchro du dressing EN
--     COURS voit EN LIGNE est refusé à l'écriture (déclencheur, tracé) ;
--  b. un refus « toujours en ligne » lève le faux signal (tracé), une fois ;
--  c. la plateforme prouve la vente d'une fiche DÉJÀ vendue par UNE vente saisie
--     (sans commande, sur cette plateforme ou « ailleurs ») : même cession (règle du
--     02/10, la saisie prime) — l'annonce est classée vendue, AUCUNE seconde vente,
--     aucun mail (vente déclarée) ;
--  d. signal_vente_trancher : les deux sorties de la carte (« Ce n'est pas vendu »,
--     « Déjà enregistrée »), décidées par la base, jamais un appui qui efface une
--     preuve de la plateforme ;
--  e. signaux_vente_reconcilier : le passage des ventes prouvées (cron 2 min) règle
--     seul, borné, les cartes déjà bloquées (a et c).
-- Définitions de départ : pg_get_functiondef EN PROD le 15/10 (pas le dépôt).
-- Inverse : supabase/rollbacks/20261015000000_signal_vente_jamais_en_boucle_INVERSE.sql
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';

-- ── Lever un signal de vente, tracé (jamais une ligne inchangée) ────────────────
CREATE OR REPLACE FUNCTION public.signal_vente_lever(p_job uuid, p_cle text, p_trace jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.cross_post_jobs c
     SET platform_fields = (coalesce(c.platform_fields, '{}'::jsonb)
           - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price'])
         || jsonb_build_object(p_cle, coalesce(p_trace, '{}'::jsonb) || jsonb_build_object(
              'le', now(), 'signal', c.platform_fields ->> 'sale_signal',
              'depuis', coalesce(c.platform_fields ->> 'unavailable_since', c.platform_fields ->> 'unavailable_pending_since')))
   WHERE c.id = p_job AND c.status = 'published'
     AND (c.platform_fields ? 'sale_signal' OR c.platform_fields ? 'unavailable_since' OR c.platform_fields ? 'unavailable_pending_since');
  RETURN FOUND;
END;
$function$;

-- ── L'annonce Vinted vue EN LIGNE après le signal (ou par la même synchro) ─────
-- Même prédicat que la garde de enregistrer_vente_atomique (08/10) : le dernier
-- relevé du dressing de CETTE annonce (numéro exact) dit « active » et il est
-- postérieur au signal, ou il appartient à la synchro qui a posé le signal.
CREATE OR REPLACE FUNCTION public.signal_vente_vu_en_ligne(p_user uuid, p_listing text, p_signal timestamptz)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_snap record;
BEGIN
  IF p_user IS NULL OR nullif(btrim(coalesce(p_listing, '')), '') IS NULL THEN RETURN NULL; END IF;
  SELECT s.status, s.captured_at INTO v_snap FROM public.vinted_listing_snapshots s
   WHERE s.user_id = p_user AND s.vinted_item_id = btrim(p_listing)
   ORDER BY s.captured_at DESC LIMIT 1;
  IF v_snap.status IS DISTINCT FROM 'active' THEN RETURN NULL; END IF;
  IF p_signal IS NULL OR v_snap.captured_at >= p_signal THEN RETURN v_snap.captured_at; END IF;
  IF EXISTS (SELECT 1 FROM public.vinted_sync_runs r
              WHERE r.user_id = p_user AND r.kind = 'dressing'
                AND r.started_at <= LEAST(v_snap.captured_at, p_signal)
                AND coalesce(r.finished_at, now()) >= GREATEST(v_snap.captured_at, p_signal)) THEN
    RETURN v_snap.captured_at;
  END IF;
  RETURN NULL;
END;
$function$;

-- ── La vente saisie de la MÊME cession (règle du 02/10, appliquée au job) ───────
-- Fiche vendue (dernier exemplaire), UNE seule vente sur la fiche, sans commande
-- relevée, saisie sur cette plateforme ou « ailleurs » (ou sans plateforme), et
-- l'annonce de ce job n'a encore aucun reçu. Jamais le titre.
CREATE OR REPLACE FUNCTION public.vente_saisie_meme_cession(p_job uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j public.cross_post_jobs%ROWTYPE; i public.inventaire%ROWTYPE; v_n integer; v_id bigint; v_cle text;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job;
  IF j.id IS NULL OR j.inventaire_id IS NULL OR coalesce(j.action, 'publish') NOT IN ('publish', 'republish') THEN RETURN NULL; END IF;
  SELECT * INTO i FROM public.inventaire WHERE id = j.inventaire_id AND user_id = j.user_id;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'vendu' THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_n FROM public.ventes v WHERE v.user_id = j.user_id AND v.inventaire_id = i.id;
  IF v_n <> 1 THEN RETURN NULL; END IF;
  v_cle := CASE WHEN nullif(btrim(j.platform_listing_id), '') IS NOT NULL
    THEN 'annonce:' || j.platform || ':' || btrim(j.platform_listing_id) ELSE 'job:' || j.id::text END;
  IF EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = j.user_id AND o.cle = v_cle) THEN RETURN NULL; END IF;
  SELECT v.id INTO v_id FROM public.ventes v
   WHERE v.user_id = j.user_id AND v.inventaire_id = i.id AND v.commande_ref IS NULL
     AND (v.plateforme_code IS NULL OR v.plateforme_code IN ('ailleurs', j.platform))
   LIMIT 1;
  RETURN v_id;
END;
$function$;

-- ── Clore l'annonce comme vendue, sur une vente DÉJÀ enregistrée ───────────────
-- Aucune ligne de vente, aucun stock touché, aucun mail (vente déclarée), un reçu
-- pour que tout rejeu rende la même réponse.
CREATE OR REPLACE FUNCTION public.signal_vente_clore_meme_cession(p_job uuid, p_vente bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j public.cross_post_jobs%ROWTYPE; v_cle text; v_res jsonb;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job FOR UPDATE;
  IF j.id IS NULL OR j.status IS DISTINCT FROM 'published' OR p_vente IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'venteCreated', false, 'inventaireUpdated', false,
      'reason', 'Cette annonce n’est plus à confirmer comme vendue.');
  END IF;
  v_cle := CASE WHEN nullif(btrim(j.platform_listing_id), '') IS NOT NULL
    THEN 'annonce:' || j.platform || ':' || btrim(j.platform_listing_id) ELSE 'job:' || j.id::text END;
  v_res := jsonb_build_object('ok', true, 'venteCreated', false, 'inventaireUpdated', false,
    'siblingsCancelled', 0, 'pendingRemoval', 0, 'retraitsArmes', 0, 'emailSent', false, 'venteNotee', false,
    'meme_cession', true, 'vente_saisie', p_vente, 'ventes_ids', to_jsonb(ARRAY[p_vente]), 'rejouee', false,
    'reason', 'Cette vente était déjà enregistrée : l’annonce est classée vendue, rien n’est compté deux fois.');
  INSERT INTO public.ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
  VALUES (j.user_id, v_cle, j.inventaire_id, j.id, v_res)
  ON CONFLICT (user_id, cle) DO NOTHING;
  -- Vente déclarée : la note de vente naît « declaree » (aucun mail, aucun push).
  PERFORM set_config('fillsell.vente_declaree', '1', true);
  UPDATE public.cross_post_jobs SET status = 'sold', sold_at = now(), last_checked_at = now(),
         platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'vente_operation_cle', v_cle,
           'vente_meme_cession', jsonb_build_object('vente', p_vente, 'le', now(), 'par', p_par))
   WHERE id = j.id;
  PERFORM set_config('fillsell.vente_declaree', '', true);
  RETURN v_res;
END;
$function$;

-- ── (a) Un « vendu » posé sur une annonce que la synchro EN COURS voit en ligne ─
CREATE OR REPLACE FUNCTION public.cross_post_jobs_signal_vente_vu_en_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lid text; v_snap record;
BEGIN
  BEGIN
    IF NEW.status IS DISTINCT FROM 'published' OR coalesce(NEW.action, 'publish') NOT IN ('publish', 'republish') THEN RETURN NEW; END IF;
    IF coalesce(OLD.platform_fields ->> 'sale_signal', '') = 'sold' THEN RETURN NEW; END IF;
    v_lid := nullif(btrim(coalesce(NEW.platform_listing_id, '')), '');
    IF v_lid IS NULL THEN RETURN NEW; END IF;
    SELECT s.status, s.captured_at INTO v_snap FROM public.vinted_listing_snapshots s
     WHERE s.user_id = NEW.user_id AND s.vinted_item_id = v_lid
     ORDER BY s.captured_at DESC LIMIT 1;
    IF v_snap.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
    -- Le relevé « en ligne » appartient à la synchro du dressing qui tourne EN CE
    -- MOMENT : elle ne peut pas voir la même annonce en ligne ET vendue.
    IF NOT EXISTS (SELECT 1 FROM public.vinted_sync_runs r
                    WHERE r.user_id = NEW.user_id AND r.kind = 'dressing' AND r.status = 'running'
                      AND r.started_at <= v_snap.captured_at) THEN
      RETURN NEW;
    END IF;
    NEW.platform_fields := (NEW.platform_fields
        - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price'])
      || jsonb_build_object('signal_refuse_annonce_en_ligne', jsonb_build_object(
           'le', now(), 'releve_le', v_snap.captured_at, 'signal', 'sold',
           'depuis', NEW.platform_fields ->> 'unavailable_since',
           'motif', 'la synchro du dressing en cours voit cette annonce en ligne'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cross_post_jobs_signal_vente_vu_en_ligne (job %) : % — écriture d''origine conservée', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cross_post_jobs_signal_vente_vu_en_ligne ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_signal_vente_vu_en_ligne
  BEFORE UPDATE OF platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.platform = 'vinted' AND (NEW.platform_fields ->> 'sale_signal') = 'sold')
  EXECUTE FUNCTION public.cross_post_jobs_signal_vente_vu_en_ligne();

-- ── (b, c) La vente : le refus lève le faux signal ; la même cession se clôt ───
CREATE OR REPLACE FUNCTION public.enregistrer_vente_atomique(p_user uuid, p_cle text, p_inventaire bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_prix numeric DEFAULT NULL::numeric, p_frais numeric DEFAULT 0, p_quantite integer DEFAULT 1, p_quantite_attendue integer DEFAULT NULL::integer, p_plateforme text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '1500ms'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
 j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE; copie record;
 v_inv bigint:=p_inventaire; v_cle text; precedent jsonb; v_resultat jsonb;
 v_prix numeric; v_pa numeric; v_benef numeric; v_pct numeric; v_frais numeric:=coalesce(p_frais,0);
 v_pf text:=p_plateforme; v_code text; v_libelle text; v_q integer:=coalesce(p_quantite,1); v_restant integer;
 v_vente bigint; v_ids bigint[]:='{}'; v_historique bigint; v_n integer;
 v_retraits integer:=0; v_annules integer:=0; v_proof boolean:=false;
 v_snap record;
 v_alerte timestamptz; v_fin_ebay timestamptz; v_vu_ebay timestamptz; v_revue_le timestamptz;
 v_saisie bigint; v_sans_stock boolean:=false;
 v_none jsonb:=jsonb_build_object('ok',false,'venteCreated',false,'inventaireUpdated',false,
  'siblingsCancelled',0,'pendingRemoval',0,'retraitsArmes',0,'emailSent',false,'venteNotee',false);
BEGIN
 IF p_user IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>p_user) THEN
  RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE='42501'; END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user;
  IF j.id IS NULL OR coalesce(j.action,'publish') NOT IN ('publish','republish') THEN
   RETURN v_none||jsonb_build_object('reason','Annonce introuvable pour cette vente.'); END IF;
  v_inv:=j.inventaire_id;
  v_cle:=CASE WHEN nullif(btrim(j.platform_listing_id),'') IS NOT NULL
    THEN 'annonce:'||j.platform||':'||btrim(j.platform_listing_id) ELSE 'job:'||j.id::text END;
  v_q:=1;
  -- (09/10, audit eBay — XEWER, vente 78319) UN VIEUX JOB SANS FICHE NE VEND JAMAIS
  -- L'ANNONCE D'UNE FICHE : un ancien dépôt sans fiche portant le MÊME numéro que le
  -- job d'une fiche (déjà vendue) a posé « Vendue ? » ; le « Oui » écrivait une
  -- deuxième vente.
  IF v_inv IS NULL AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL AND EXISTS(
     SELECT 1 FROM cross_post_jobs k WHERE k.user_id=p_user AND k.platform=j.platform AND k.id<>j.id
       AND k.inventaire_id IS NOT NULL AND coalesce(k.action,'publish') IN ('publish','republish')
       AND btrim(k.platform_listing_id)=btrim(j.platform_listing_id)) THEN
   RETURN v_none||jsonb_build_object('code','job_sans_fiche','reason',
    'Cette annonce appartient à un article de ton stock : sa vente s’enregistre depuis cet article, jamais deux fois.');
  END IF;
 ELSE
  IF nullif(btrim(p_cle),'') IS NULL OR length(p_cle)>150 OR v_inv IS NULL THEN
   RETURN v_none||jsonb_build_object('reason','La référence de cette confirmation de vente manque.'); END IF;
  v_cle:='manuel:'||p_cle;
 END IF;
 -- Tous les chemins prennent d'abord le verrou de la fiche, puis des jobs.
 -- Deux plateformes de la même fiche ne peuvent pas consommer en parallèle.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||coalesce(v_inv::text,v_cle),0));
 SELECT o.resultat INTO precedent FROM ventes_operations o WHERE o.user_id=p_user AND o.cle=v_cle;
 IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
 IF v_inv IS NOT NULL THEN
  SELECT * INTO i FROM inventaire WHERE id=v_inv AND user_id=p_user FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
   RETURN v_none||jsonb_build_object('reason','La fiche de cet exemplaire doit être confirmée avant d’enregistrer la vente.'); END IF;
 END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
  IF j.inventaire_id IS DISTINCT FROM v_inv THEN RAISE EXCEPTION 'La fiche a changé ; réessaie.'; END IF;
  IF nullif(j.platform_fields->>'vente_operation_cle','') IS NOT NULL THEN
   SELECT o.resultat INTO precedent FROM ventes_operations o
    WHERE o.user_id=p_user AND o.cle=j.platform_fields->>'vente_operation_cle';
   IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
  END IF;
  IF j.status='sold' THEN
   -- Ancienne vente sans reçu : ne jamais reconsommer ni inventer son lien.
   RETURN v_none||jsonb_build_object('reason','Cette ancienne vente doit être vérifiée dans tes ventes avant toute nouvelle confirmation. Aucun stock n’a été recompté.'); END IF;
  IF j.status<>'published' THEN RETURN v_none||jsonb_build_object('reason','Cette annonce n’est plus à confirmer comme vendue.'); END IF;
  -- (08/10, Louis) VINTED : une annonce que la synchro du dressing a revue EN
  -- LIGNE après son signal n'est pas vendue ; une annonce remplacée par une
  -- autre annonce EN LIGNE de la même fiche non plus (« Vendue ? » sur une
  -- copie disparue : 14 ventes déclarées le 06/10, 4 annonces toujours en ligne).
  IF j.platform='vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL THEN
   SELECT s.status, s.captured_at INTO v_snap FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=btrim(j.platform_listing_id) ORDER BY s.captured_at DESC LIMIT 1;
   IF v_snap.status='active' AND (v_snap.captured_at>=coalesce(_ts_ou_null(j.platform_fields->>'unavailable_since'),j.published_at,j.created_at)
      -- (08/10) ou relevé de la MÊME synchro du dressing que le signal (horodaté juste avant lui)
      OR EXISTS(SELECT 1 FROM vinted_sync_runs r WHERE r.user_id=p_user AND r.kind='dressing'
        AND r.started_at<=LEAST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since'))
        AND coalesce(r.finished_at,now())>=GREATEST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since')))) THEN
    -- (15/10, Louis — adaptateurs Vert, job d7b3b535) LE REFUS LÈVE LE FAUX SIGNAL :
    -- la carte « Vendue » revenait à chaque rechargement (aucune sortie). L'annonce
    -- est vue en ligne par le relevé : le signal est démenti ici, une fois, tracé.
    PERFORM public.signal_vente_lever(j.id, 'signal_dementi_a_la_confirmation',
      jsonb_build_object('releve_le', v_snap.captured_at, 'par', 'enregistrer_vente_atomique'));
    RETURN v_none||jsonb_build_object('code','annonce_en_ligne','signal_leve',true,'reason','Cette annonce est toujours en ligne sur Vinted (relevé du dressing du '
      ||to_char(v_snap.captured_at AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')||') : aucune vente n’est enregistrée.');
   END IF;
   IF coalesce(j.platform_fields->>'sale_signal','')<>'sold' AND i.id IS NOT NULL
      AND nullif(btrim(i.vinted_item_id),'') IS NOT NULL AND btrim(i.vinted_item_id)<>btrim(j.platform_listing_id)
      AND coalesce(i.vinted_status,'')='active' AND i.disparu_le IS NULL
      AND EXISTS(SELECT 1 FROM vinted_listing_snapshots s WHERE s.user_id=p_user AND s.vinted_item_id=btrim(i.vinted_item_id)
                  AND s.status='active' AND s.captured_at>now()-interval '26 hours') THEN
    RETURN v_none||jsonb_build_object('reason','Cet article est en ligne sur Vinted sous une autre annonce ('||btrim(i.vinted_item_id)
      ||') : celle-ci a été remplacée, ce n’est pas une vente.');
   END IF;
  END IF;
  IF NOT retrait_job_prouve(j.id) OR (v_inv IS NOT NULL AND fiche_annonces_vivantes(v_inv,j.platform)>1) THEN
   RETURN v_none||jsonb_build_object('reason','Plusieurs exemplaires sont possibles. Confirme la fiche de cette annonce avant d’enregistrer sa vente.'); END IF;
  v_proof:=coalesce(j.platform_fields->>'sale_signal','')='sold';
  IF NOT v_proof AND j.platform='vinted' AND nullif(j.platform_listing_id,'') IS NOT NULL THEN
   SELECT s.status='sold' INTO v_proof FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=j.platform_listing_id ORDER BY s.captured_at DESC LIMIT 1;
  END IF;
  -- (09/10, audit eBay) SANS FICHE ET SANS PREUVE, RIEN N'EST VENDU : un dépôt dont
  -- l'article n'est pas dans le stock n'enregistre pas une vente sur un appui (la
  -- question « Vendue ? » ne lui est plus posée, cf. l'app).
  IF v_inv IS NULL AND NOT coalesce(v_proof,false) THEN
   RETURN v_none||jsonb_build_object('code','job_sans_fiche','reason',
    'Cette annonce n’est liée à aucun article de ton stock : aucune vente n’est enregistrée ici. Si tu l’as vendu, enregistre la vente depuis l’article.');
  END IF;
  -- (09/10, Marta) SANS PREUVE DE VENTE, une annonce que la plateforme montre
  -- ENCORE EN LIGNE n'est pas vendue. « Plus en ligne — Vendue ? » posée à tort
  -- (enchère eBay en cours lue « terminée » par le veilleur : 920016444915, fin
  -- le 14/10) enregistrait une vente « Ailleurs » d'un seul appui. Font foi les
  -- lectures de la plateforme, jamais un titre :
  --  · eBay : une date de fin À VENIR (fin_ebay), ou le veilleur qui a vu
  --    l'annonce en vente APRÈS l'alerte (quantite_ebay) ;
  --  · toute plateforme relevée (hors Vinted, qui a ses gardes ci-dessus) : la
  --    ligne d'annonce vue EN LIGNE par un relevé APRÈS l'alerte — mêmes
  --    conditions que alerte_lever_revues_plateformes.
  -- Une preuve « sold » n'est jamais retenue ici ; une vente enregistrée depuis
  -- la fiche (sans annonce, p_job nul) non plus : c'est le chemin proposé.
  IF NOT coalesce(v_proof,false) THEN
   v_alerte:=_ts_ou_null(j.platform_fields->>'unavailable_since');
   IF j.platform='ebay' THEN
    -- (09/10, audit eBay — labouquinerie85, vente 42187) UNE ENCHÈRE NE SE VEND QUE
    -- CHEZ eBAY : gagnée, le veilleur la prouve (vendus > 0) et elle s'enregistre
    -- seule ; en cours, finie sans acheteur ou pas encore comptée, un appui n'en
    -- fait jamais une vente — et n'arme donc aucun retrait de ses copies.
    IF j.platform_fields#>>'{fin_ebay,format}'='AUCTION' OR j.platform_fields#>>'{format_ebay,format}'='AUCTION' THEN
     RETURN v_none||jsonb_build_object('code','enchere','reason',
      'C’est une enchère eBay : elle n’est vendue que si eBay le dit (enchère gagnée). Aucune vente n’est enregistrée et aucune autre annonce n’est retirée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
    v_fin_ebay:=_ts_ou_null(j.platform_fields#>>'{fin_ebay,fin}');
    IF v_fin_ebay>now() THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'Cette annonce est toujours en ligne sur eBay (fin prévue le '||to_char(v_fin_ebay AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||') : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
    v_vu_ebay:=_ts_ou_null(j.platform_fields#>>'{quantite_ebay,vu_le}');
    IF v_alerte IS NOT NULL AND v_vu_ebay>v_alerte AND coalesce(j.platform_fields#>>'{quantite_ebay,terminee}','')<>'true' THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'eBay montre cette annonce en vente (lue le '||to_char(v_vu_ebay AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||') : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
   END IF;
   IF v_alerte IS NOT NULL AND j.platform<>'vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL THEN
    SELECT max(a.vu_le) INTO v_revue_le FROM annonces_plateforme a
     WHERE a.user_id=p_user AND a.platform=j.platform AND a.listing_id=btrim(j.platform_listing_id)
       AND a.statut_plateforme='en_ligne' AND a.disparu_le IS NULL AND a.vu_le>v_alerte;
    IF v_revue_le IS NOT NULL THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'Cette annonce a été revue en ligne sur '||CASE j.platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'ebay' THEN 'eBay'
        WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE j.platform END
      ||' le '||to_char(v_revue_le AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||', après l’alerte : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
   END IF;
  END IF;
  v_pf:=CASE WHEN coalesce(v_proof,false) THEN j.platform ELSE 'ailleurs' END;
  v_prix:=coalesce(p_prix,j.price); v_frais:=0;
 ELSE
  v_prix:=p_prix;
 END IF;
 -- (02/10 soir, point 8) La plateforme de la vente se compare par son CODE
 -- (« vinted »), jamais par son libellé (« Vinted ») : l'annonce de la
 -- plateforme vendue n'était jamais passée « vendue », et les ventes n'avaient
 -- pas de plateforme_code. Le libellé reste celui de l'écran.
 v_code:=coalesce(plateforme_normalisee(v_pf),'ailleurs');
 IF v_code='autre' THEN v_code:='ailleurs'; END IF;
 v_libelle:=CASE WHEN p_job IS NOT NULL OR v_pf IS NULL OR v_pf=v_code THEN
   CASE v_code WHEN 'vinted' THEN 'Vinted' WHEN 'ebay' THEN 'eBay' WHEN 'leboncoin' THEN 'Leboncoin'
     WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE 'Ailleurs' END ELSE v_pf END;
 IF v_prix IS NULL OR v_prix<=0 OR v_prix::text IN ('NaN','Infinity','-Infinity') OR v_frais<0 OR v_frais::text IN ('NaN','Infinity','-Infinity')
    OR v_q<1 OR v_q>1000 THEN RETURN v_none||jsonb_build_object('reason','Vérifie le prix, les frais et la quantité vendue.'); END IF;
 IF v_inv IS NOT NULL THEN
  -- (15/10 — Kit bûche de Louis, Swatch de Tech-t) LA PLATEFORME PROUVE LA VENTE
  -- D'UNE FICHE DÉJÀ VENDUE PAR UNE VENTE SAISIE : c'est la même cession (règle du
  -- 02/10, « la saisie prime »). L'annonce est classée vendue, AUCUNE seconde vente,
  -- aucun stock recompté. Autre cas (vente saisie sur une autre plateforme nommée,
  -- plusieurs ventes) : refus à code, la carte offre « Déjà enregistrée ».
  IF p_job IS NOT NULL AND coalesce(v_proof,false) AND (i.statut='vendu' OR coalesce(i.quantite,1)<v_q) THEN
   v_saisie:=public.vente_saisie_meme_cession(j.id);
   IF v_saisie IS NOT NULL THEN
    RETURN public.signal_vente_clore_meme_cession(j.id, v_saisie, 'enregistrer_vente_atomique');
   END IF;
   -- Fiche passée « vendu » par une ancienne synchro du dressing, SANS AUCUNE ligne
   -- de vente : la plateforme prouve la vente de CETTE annonce, elle s'enregistre
   -- (le stock est déjà à zéro), datée du signal.
   IF i.statut='vendu' AND NOT EXISTS(SELECT 1 FROM ventes v WHERE v.user_id=p_user AND v.inventaire_id=v_inv) THEN
    v_sans_stock:=true;
   ELSE
    RETURN v_none||jsonb_build_object('code','deja_vendue','reason','Cet article est déjà vendu : si c’est cette vente-là, touche « Déjà enregistrée » ; rien ne sera compté deux fois.');
   END IF;
  END IF;
  IF NOT v_sans_stock AND (i.statut='vendu' OR coalesce(i.quantite,1)<v_q) THEN
   RETURN v_none||jsonb_build_object('reason','Ce stock a déjà été vendu ou modifié. Actualise-le avant de confirmer.'); END IF;
  IF p_job IS NULL AND (p_quantite_attendue IS NULL OR coalesce(i.quantite,1) IS DISTINCT FROM p_quantite_attendue) THEN
   RETURN v_none||jsonb_build_object('reason','La quantité en stock a changé. Actualise-la avant de confirmer la vente.'); END IF;
  -- Une vente historique potentiellement identique n'est jamais recomptée.
  -- Les ventes des opérations précédentes sont distinguées par leur reçu.
  IF EXISTS(SELECT 1 FROM ventes v WHERE v.user_id=p_user AND v.inventaire_id=v_inv
    AND (p_job IS NULL OR v.created_at>=coalesce(j.published_at,j.created_at))
    AND NOT EXISTS(SELECT 1 FROM ventes_operations o WHERE o.user_id=p_user AND o.inventaire_id=v_inv
      AND o.resultat->'ventes_ids' @> to_jsonb(ARRAY[v.id])) LIMIT 1) THEN
   RETURN v_none||jsonb_build_object('code','vente_deja_liee','reason','Une vente est déjà liée à cette fiche. Vérifie-la dans tes ventes pour éviter de la compter deux fois.'); END IF;
  v_pa:=CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
  v_benef:=CASE WHEN v_pa IS NOT NULL THEN v_prix-v_pa-coalesce(i.purchase_costs,0)-v_frais END;
  v_pct:=v_benef/v_prix*100; v_restant:=CASE WHEN v_sans_stock THEN 0 ELSE coalesce(i.quantite,1)-v_q END;
 END IF;
 -- Le reçu et toutes les écritures suivantes disparaissent ensemble en cas d'erreur.
 INSERT INTO ventes_operations(user_id,cle,inventaire_id,job_id,resultat) VALUES(p_user,v_cle,v_inv,p_job,'{}');
 IF p_job IS NOT NULL THEN
  UPDATE cross_post_jobs SET status='sold',sold_at=now(),last_checked_at=now(),
   platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle)
   WHERE id=j.id;
 END IF;
 FOR v_n IN 1..v_q LOOP
  INSERT INTO ventes(user_id,inventaire_id,titre,prix_achat,prix_vente,benefice,marque,type,description,
    emplacement,date,plateforme,plateforme_code,annonce_id,quantite,statut,selling_fees)
   VALUES(p_user,v_inv,coalesce(j.title,i.titre),v_pa,v_prix,v_benef,i.marque,i.type,i.description,
    i.emplacement,CASE WHEN v_sans_stock THEN coalesce((_ts_ou_null(j.platform_fields->>'unavailable_since') AT TIME ZONE 'Europe/Paris')::date,
      (now() AT TIME ZONE 'Europe/Paris')::date) ELSE (now() AT TIME ZONE 'Europe/Paris')::date END,v_libelle,v_code,
    CASE WHEN p_job IS NOT NULL THEN nullif(btrim(j.platform_listing_id),'') END,1,'vendu',v_frais) RETURNING id INTO v_vente;
  v_ids:=array_append(v_ids,v_vente);
 END LOOP;
 IF v_inv IS NOT NULL THEN
  IF v_restant>0 THEN
   UPDATE inventaire SET quantite=v_restant WHERE id=v_inv;
   LOOP
    v_historique:=(extract(epoch FROM clock_timestamp())*1000)::bigint+(random()*9999)::int;
    EXIT WHEN NOT EXISTS(SELECT 1 FROM inventaire WHERE id=v_historique);
   END LOOP;
   INSERT INTO inventaire(id,user_id,titre,prix_achat,prix_achat_inconnu,purchase_costs,prix_vente,margin,margin_pct,
    selling_fees,statut,quantite,marque,type,description,emplacement,plateforme,date)
   VALUES(v_historique,p_user,i.titre,v_pa,v_pa IS NULL,0,v_prix,v_benef,v_pct,v_frais,'vendu',v_q,
    i.marque,i.type,i.description,i.emplacement,v_libelle,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  ELSE
   UPDATE inventaire SET quantite=CASE WHEN p_job IS NULL THEN v_q ELSE 0 END,
    statut='vendu',prix_vente=v_prix,margin=v_benef,margin_pct=v_pct,
    selling_fees=v_frais,plateforme=v_libelle,date=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE id=v_inv;
  END IF;
  FOR copie IN SELECT c.id,c.status,c.platform FROM cross_post_jobs c
    WHERE c.user_id=p_user AND c.inventaire_id=v_inv AND c.id IS DISTINCT FROM p_job
      AND c.action IN ('publish','republish') AND c.status IN ('pending','processing','needs_user','published')
      AND (p_job IS NULL OR c.platform IS DISTINCT FROM j.platform)
      -- Une vente partielle ne clôt que l'annonce explicitement vendue.
      -- Les autres annonces gardent leur stock et leur propre futur reçu.
      AND (v_restant=0 OR (p_job IS NULL AND c.platform=v_code AND c.status='published'))
      AND retrait_job_prouve(c.id) AND fiche_annonces_vivantes(v_inv,c.platform)<2
    ORDER BY c.id LIMIT 25 FOR UPDATE OF c
  LOOP
   UPDATE cross_post_jobs SET platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle) WHERE id=copie.id;
   IF p_job IS NULL AND copie.platform=v_code AND copie.status='published' THEN
    -- La personne a nommé la plateforme de cette vente. La seule annonce
    -- prouvée de cet exemplaire y est soldée, jamais retirée.
    UPDATE cross_post_jobs SET status='sold',sold_at=now() WHERE id=copie.id;
   ELSIF copie.status='published' THEN
    IF armer_retrait_job(copie.id,'vente_copie_prouvee','0 seconds') IS NOT NULL THEN v_retraits:=v_retraits+1; END IF;
   ELSE
    UPDATE cross_post_jobs SET status='cancelled',error='Cet exemplaire a été vendu ; cette publication est arrêtée.' WHERE id=copie.id;
    v_annules:=v_annules+1;
   END IF;
  END LOOP;
 END IF;
 IF p_job IS NOT NULL THEN
  INSERT INTO usage_logs(user_id,feature,metadata) VALUES(p_user,'vente_a_annoncer',
   jsonb_build_object('job_id',j.id,'inventaire_id',v_inv::text,'plateforme',v_code,'plateforme_annonce',j.platform,
    'titre',coalesce(j.title,i.titre),'prix_vente',v_prix,'benefice',v_benef,'retraits_a_cliquer',0,
    'retrait_beebs_auto',v_retraits,'vendu_le',now()));
 END IF;
 v_resultat:=v_none||jsonb_build_object('ok',true,'venteCreated',true,'inventaireUpdated',v_inv IS NOT NULL,
  'siblingsCancelled',v_annules,'retraitsArmes',v_retraits,'venteNotee',p_job IS NOT NULL,
  'ventes_ids',to_jsonb(v_ids),'restant',v_restant,'rejouee',false);
 UPDATE ventes_operations SET resultat=v_resultat WHERE user_id=p_user AND cle=v_cle;
 RETURN v_resultat;
END;
$function$;

-- ── (d) Les deux sorties de la carte, tranchées par la base ─────────────────────
--   'pas_vendue'  : vue en ligne par le relevé → démenti ; vue vendue → la
--                   plateforme fait foi (refus dit) ; sinon → la page est relue
--                   au prochain passage du veilleur, la carte se tait 24 h.
--   'meme_vente'  : une vente est déjà enregistrée pour cette fiche → l'annonce
--                   est classée vendue, aucune seconde vente.
CREATE OR REPLACE FUNCTION public.signal_vente_trancher(p_job uuid, p_reponse text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE j public.cross_post_jobs%ROWTYPE; v_vu timestamptz; v_snap record; v_vente bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job AND user_id = auth.uid() FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'Annonce introuvable.'); END IF;
  IF j.status IS DISTINCT FROM 'published' OR coalesce(j.action, 'publish') NOT IN ('publish', 'republish')
     OR coalesce(j.platform_fields ->> 'sale_signal', '') <> 'sold' THEN
    RETURN jsonb_build_object('ok', true, 'issue', 'deja_tranche');
  END IF;
  IF p_reponse = 'pas_vendue' THEN
    IF j.platform = 'vinted' THEN
      v_vu := public.signal_vente_vu_en_ligne(j.user_id, j.platform_listing_id,
                public._ts_ou_null(j.platform_fields ->> 'unavailable_since'));
      IF v_vu IS NOT NULL THEN
        PERFORM public.signal_vente_lever(j.id, 'signal_dementi_par_la_personne',
          jsonb_build_object('releve_le', v_vu, 'preuve', 'releve_du_dressing'));
        INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES (j.user_id, 'signal_vente_tranche',
          jsonb_build_object('job', j.id, 'reponse', p_reponse, 'issue', 'dementi', 'plateforme', j.platform));
        RETURN jsonb_build_object('ok', true, 'issue', 'dementi', 'releve_le', v_vu,
          'reason', 'Vinted montre bien cette annonce en ligne : l’alerte est retirée, rien n’est enregistré.');
      END IF;
      SELECT s.status, s.captured_at INTO v_snap FROM public.vinted_listing_snapshots s
       WHERE s.user_id = j.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
       ORDER BY s.captured_at DESC LIMIT 1;
      IF v_snap.status = 'sold' AND v_snap.captured_at >= coalesce(j.published_at, j.created_at) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'vendue_selon_plateforme',
          'reason', 'Vinted montre cette annonce vendue (relevé du '
            || to_char(v_snap.captured_at AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24:MI')
            || ') : si c’est bien vendu, enregistre la vente ; si l’acheteur a annulé, FillSell le verra à la prochaine lecture de tes commandes.');
      END IF;
    END IF;
    UPDATE public.cross_post_jobs SET last_checked_at = NULL,
           platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('signal_conteste',
             jsonb_build_object('le', now(), 'par', 'personne', 'signal_depuis', platform_fields ->> 'unavailable_since'))
     WHERE id = j.id;
    INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES (j.user_id, 'signal_vente_tranche',
      jsonb_build_object('job', j.id, 'reponse', p_reponse, 'issue', 'relecture', 'plateforme', j.platform));
    RETURN jsonb_build_object('ok', true, 'issue', 'relecture',
      'reason', 'Noté : FillSell relit cette annonce à son prochain passage. Rien n’est enregistré d’ici là.');
  ELSIF p_reponse = 'meme_vente' THEN
    IF j.inventaire_id IS NOT NULL THEN
      SELECT v.id INTO v_vente FROM public.ventes v
       WHERE v.user_id = j.user_id AND v.inventaire_id = j.inventaire_id
       ORDER BY v.created_at DESC, v.id DESC LIMIT 1;
    END IF;
    IF v_vente IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'aucune_vente',
        'reason', 'Aucune vente n’est encore enregistrée pour cet article : touche « Oui, enregistrer la vente ».');
    END IF;
    INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES (j.user_id, 'signal_vente_tranche',
      jsonb_build_object('job', j.id, 'reponse', p_reponse, 'issue', 'meme_vente', 'vente', v_vente, 'plateforme', j.platform));
    RETURN public.signal_vente_clore_meme_cession(j.id, v_vente, 'personne');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'Réponse inconnue.');
END;
$function$;

-- ── (e) Les cartes déjà bloquées se règlent seules, bornées ─────────────────────
CREATE OR REPLACE FUNCTION public.signaux_vente_reconcilier(p_max integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
DECLARE c record; v_vu timestamptz; v_vente bigint; v_res jsonb; n_dem integer := 0; n_fus integer := 0; n_vus integer := 0;
        v_ids_dem text[] := ARRAY[]::text[]; v_ids_fus text[] := ARRAY[]::text[];
        v_debut timestamptz := clock_timestamp(); v_budget boolean := false;
BEGIN
  -- Ordre tournant (graine = le créneau de 2 min) : aucune carte n'en affame une
  -- autre quand il y en a plus que le lot ; budget de 1,5 s par passage.
  FOR c IN
    SELECT j.id, j.user_id, j.platform, j.platform_listing_id, j.platform_fields
      FROM public.cross_post_jobs j
     WHERE j.status = 'published' AND (j.platform_fields ->> 'sale_signal') = 'sold'
       AND coalesce(j.action, 'publish') IN ('publish', 'republish')
     ORDER BY hashtextextended(j.id::text, floor(extract(epoch FROM now()) / 120)::bigint)
     LIMIT greatest(1, least(coalesce(p_max, 40), 200))
  LOOP
    IF clock_timestamp() - v_debut > interval '1500 milliseconds' THEN v_budget := true; EXIT; END IF;
    n_vus := n_vus + 1;
    IF c.platform = 'vinted' THEN
      v_vu := public.signal_vente_vu_en_ligne(c.user_id, c.platform_listing_id,
                public._ts_ou_null(c.platform_fields ->> 'unavailable_since'));
      IF v_vu IS NOT NULL THEN
        IF public.signal_vente_lever(c.id, 'signal_dementi_par_releve',
             jsonb_build_object('releve_le', v_vu, 'par', 'signaux_vente_reconcilier')) THEN
          n_dem := n_dem + 1; v_ids_dem := v_ids_dem || left(c.id::text, 8);
        END IF;
        CONTINUE;
      END IF;
    END IF;
    v_vente := public.vente_saisie_meme_cession(c.id);
    IF v_vente IS NOT NULL THEN
      v_res := public.signal_vente_clore_meme_cession(c.id, v_vente, 'signaux_vente_reconcilier');
      IF v_res ->> 'ok' = 'true' THEN n_fus := n_fus + 1; v_ids_fus := v_ids_fus || left(c.id::text, 8); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('vus', n_vus, 'dementis', n_dem, 'fusionnes', n_fus, 'budget_atteint', v_budget)
      || CASE WHEN n_dem > 0 THEN jsonb_build_object('dementis_jobs', to_jsonb(v_ids_dem)) ELSE '{}'::jsonb END
      || CASE WHEN n_fus > 0 THEN jsonb_build_object('fusionnes_jobs', to_jsonb(v_ids_fus)) ELSE '{}'::jsonb END;
END;
$function$;

-- ── Le passage des ventes prouvées appelle la réconciliation ────────────────────
CREATE OR REPLACE FUNCTION public.ventes_prouvees_tick(p_max integer DEFAULT 25, p_budget_ms integer DEFAULT 4000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_debut   timestamptz := clock_timestamp();
  v_epoch   integer;
  v_depuis  timestamptz;
  v_max     integer := greatest(1, least(coalesce(p_max, 25), 100));
  v_budget  interval := make_interval(secs => greatest(500, least(coalesce(p_budget_ms, 4000), 15000)) / 1000.0);
  c         record;
  r         jsonb;
  v_issue   text;
  n_cand    integer := 0;
  n_ok      integer := 0;
  n_ref     integer := 0;
  n_rep     integer := 0;
  v_hors_budget boolean := false;
  v_detail  jsonb := '[]'::jsonb;
  v_reco    jsonb := NULL;
BEGIN
  SELECT value INTO v_epoch FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis';
  IF coalesce(v_epoch, 0) <= 0 THEN
    RETURN jsonb_build_object('issue', 'coupe');            -- coupé : rien lu, rien écrit
  END IF;
  -- Deux passages simultanés (cron + rattrapage, ou un cron en retard) : le
  -- second ne fait rien. Le verrou tombe avec la transaction.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('ventes_prouvees_tick', 0)) THEN
    RETURN jsonb_build_object('issue', 'deja_en_cours');
  END IF;
  v_depuis := to_timestamp(v_epoch);
  FOR c IN SELECT * FROM ventes_prouvees_a_enregistrer(v_depuis, v_max) LOOP
    n_cand := n_cand + 1;
    IF clock_timestamp() - v_debut > v_budget THEN
      v_hors_budget := true; n_rep := n_rep + 1;               -- au passage suivant
      CONTINUE;
    END IF;
    r := enregistrer_vente_prouvee(c.job_id);
    v_issue := r ->> 'issue';
    IF v_issue = 'enregistree' THEN n_ok := n_ok + 1;
    ELSIF v_issue IN ('refusee', 'erreur') THEN n_ref := n_ref + 1;
    ELSE n_rep := n_rep + 1;
    END IF;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'job', c.job_id, 'user', left(c.user_id::text, 8), 'inv', c.inventaire_id, 'pf', c.platform,
      'preuve', c.preuve, 'preuve_le', c.preuve_le, 'issue', v_issue, 'raison', r ->> 'reason',
      'ventes', r -> 'ventes_ids', 'retraits', r -> 'retraitsArmes'));
  END LOOP;
  -- (15/10) Les cartes « Vendue » qui ne peuvent plus aboutir se règlent seules :
  -- signal démenti par le relevé, ou même cession qu'une vente saisie. Isolé :
  -- un échec ici ne coûte jamais le passage des ventes prouvées.
  BEGIN
    v_reco := public.signaux_vente_reconcilier(40);
  EXCEPTION WHEN OTHERS THEN
    v_reco := jsonb_build_object('erreur', left(SQLERRM, 200));
  END;
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, budget_atteint, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'fait',
          n_cand, n_ok, n_ref, n_rep, v_hors_budget,
          CASE WHEN n_cand > 0 OR coalesce((v_reco ->> 'dementis')::int, 0) + coalesce((v_reco ->> 'fusionnes')::int, 0) > 0 OR v_reco ? 'erreur'
               THEN v_detail || CASE WHEN v_reco IS NOT NULL THEN jsonb_build_array(jsonb_build_object('reconciliation', v_reco)) ELSE '[]'::jsonb END END);
  DELETE FROM ventes_prouvees_passages
   WHERE id IN (SELECT id FROM ventes_prouvees_passages WHERE debut < now() - interval '14 days' ORDER BY id LIMIT 500);
  RETURN jsonb_build_object('issue', 'fait', 'candidates', n_cand, 'enregistrees', n_ok, 'refusees', n_ref,
                            'reportees', n_rep, 'budget_atteint', v_hors_budget, 'reconciliation', v_reco,
                            'duree_ms', (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer);
EXCEPTION WHEN OTHERS THEN
  -- Jamais un échec muet : le passage raté est tracé (la veille le voit).
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'erreur',
          n_cand, 0, 0, 0, jsonb_build_object('erreur', left(SQLERRM, 300)));
  RETURN jsonb_build_object('issue', 'erreur', 'erreur', left(SQLERRM, 300));
END;
$function$;

-- ── Droits : seules les deux sorties de la carte sont ouvertes à l'app ──────────
REVOKE ALL ON FUNCTION public.signal_vente_lever(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_vente_vu_en_ligne(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vente_saisie_meme_cession(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_vente_clore_meme_cession(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signaux_vente_reconcilier(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cross_post_jobs_signal_vente_vu_en_ligne() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_vente_trancher(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signal_vente_trancher(uuid, text) TO authenticated;

COMMIT;
