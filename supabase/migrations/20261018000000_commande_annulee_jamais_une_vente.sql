-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — UNE COMMANDE ÉCHOUÉE, ANNULÉE OU REMBOURSÉE N'EST JAMAIS UNE VENTE
-- (règle de Nico, 18/10 : sur aucune plateforme, chez aucun compte, quelle que
-- soit la date de la commande) — ET LES COPIES RETIRÉES À CAUSE DE CETTE VENTE
-- REVIENNENT PAR LES JOBS NORMAUX
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (lecture seule, 18/10) : trois ventes Vinted de commandes « failed »
-- (108583 casque VR, 125191 BlazBlue, 167304 pull Mango) étaient seulement
-- SIGNALÉES (usage_logs vente_vinted_commande_annulee_signalee, motif
-- annulation_anterieure_a_la_regle) : vente_commande_annulee_vinted ne retirait
-- une vente que pour une commande du 13/10 ou après (décision du 15/10, « comme
-- le stock d'avant la règle eBay »). Nico tranche le 18/10 : une commande
-- échouée, annulée ou remboursée n'est JAMAIS une vente. Et pour 125191, les
-- copies Leboncoin, eBay et Beebs retirées À CAUSE de la vente (retraits armés par
-- `vente_article_serveur` au même instant) ne revenaient jamais : la fiche
-- revenait au stock sans ses copies.
--
-- LA RÈGLE (trois fonctions, réécrites depuis pg_get_functiondef EN PROD le 18/10,
-- md5 vérifiés ci-dessous — la migration S'ARRÊTE si une définition a bougé) :
--   1. vente_commande_annulee_vinted : plus aucune date-charnière. Une vente née
--      d'une PREUVE (relevé, ou annonce FillSell close « vendue » sur son numéro)
--      est retirée quelle que soit la date de la commande ; seule une vente SAISIE
--      à la main reste, signalée une fois (vente_saisie_jamais_retiree). Le reste
--      ne bouge pas (trace ventes_supprimees + usage_logs avec les reçus, fiche au
--      stock ou exemplaire rendu, état d'annonce du relevé, job republié ou clos,
--      même interrupteur, même liste d'attente, aucun mail).
--      + quand la FICHE revient au stock : chaque copie d'une autre plateforme
--      retirée à cause de cette vente (retrait `deleted` armé par
--      vente_article_serveur à l'instant de la vente, dépôt `cancelled`) est remise
--      dans la file remises_en_vente (job_vendu = ce dépôt, marqueur
--      vente_annulee_remise sur le dépôt) — la file crée la publication avec SES
--      gardes : rien si déjà en vente, plafond du palier, poste absent, plateforme
--      en pause, jamais un débit. Jamais un dépôt direct ici.
--   2. remises_en_vente_tick : accepte une ligne dont le job_vendu est un dépôt
--      `cancelled` porteur de vente_annulee_remise (pas de reçu : le restant est la
--      quantité de la fiche) ; tout le reste de ses gardes est inchangé.
--   3. ventes_statut_classe : Vinted « canceled » / « cancelled » et eBay « refunded »
--      sont des annulations (la fonction vinted_commande_annulee les connaissait
--      déjà ; la classe du relevé, non). Aucun autre statut ne change de classe.
-- Les définitions de prod d'AVANT sont GARDÉES dans
-- public._backup_1810_fonctions_commande_annulee (ordre, nom, def) : l'inverse les
-- rejoue telles quelles (supabase/rollbacks/20261018000000_…).
--
-- Essai à blanc (ROLLBACK) : scripts/essais/20261018000000_essai.sql.
-- Réparation ensuite : scripts/reparations/20261018_ventes_commandes_failed.sql.
-- Application (feu vert de Nico donné pour cette session) :
--   npx supabase db query --linked -f supabase/migrations/20261018000000_commande_annulee_jamais_une_vente.sql
--   npx supabase migration repair --linked --status applied 20261018000000
-- Selftests : scripts/vente-vinted-annulee-selftest.mjs (point 8 réécrit),
--             scripts/commande-annulee-jamais-vente-selftest.mjs.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

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

COMMIT;
