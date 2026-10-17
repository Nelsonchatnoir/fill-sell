-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION — VENTES VINTED EN LOT (17/10, point 11 — Amiral/Louis) — NON APPLIQUÉE
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉREQUIS (sinon le script ne trouve RIEN, c'est voulu) :
--   1. migration 20261017120000_ventes_vinted_en_lot APPLIQUÉE ;
--   2. extension 0.6.123 servie sur les postes concernés : la composition de chaque
--      commande en lot (transaction.order.item_ids, lue par la session du vendeur) est
--      relue UNE fois (mémoire lots_v1) et gardée dans vinted_commandes_articles —
--      decision 'a_reparer' pour une ligne « lot » née avant la règle.
--   Sans composition lue : RIEN. Jamais le titre « Lot N articles ».
-- PÉRIMÈTRE : lignes « lot » du relevé (une commande, aucune fiche, aucune annonce)
-- vendues ces 30 derniers jours, nées AVANT la règle, dont la composition PROUVÉE a au
-- moins 2 articles, commande ni failed ni cancelled, compte sans relevé en cours.
-- PAR COMMANDE — vente_vinted_lot_eclater, la règle elle-même, tout ou rien :
--   une vente par article (adoptée si elle existe déjà, jamais doublée), la fiche vendue
--   par le circuit normal (enregistrer_vente_atomique, ou la fiche vendue et
--   inventaire_vendu_retire_ses_copies), ses copies PROUVÉES retirées ; un article
--   inconnu de FillSell = une vente sans fiche + la question (usage_logs
--   'vente_vinted_article_inconnu'), jamais un retrait ; la ligne « lot » retirée (trace
--   usage_logs 'vente_lot_eclatee', ligne entière) ; un doute = rien (decision 'en_doute').
-- ZÉRO MAIL, ZÉRO PUSH :
--   · source 'reparation' : aucune note de commande n'est créée ;
--   · les notes nées pour les articles naissent « déclarées » (fillsell.vente_declaree),
--     puis toute note née dans CETTE transaction est classée 'doublon' avant la fin ;
--   · contrôles avant le COMMIT (sinon tout est annulé) : email_logs des comptes du
--     périmètre inchangé, aucune note neuve autre que doublon / declaree / ignoree ;
--   · après le COMMIT, recompter 5 minutes plus tard (requêtes en fin de fichier).
-- SAUVEGARDES : _backup_1710_lots_entetes, _composition, _ventes, _inventaire, _jobs,
-- _recus ; journal _reparation_1710_lots. Inverse : 20261017_ventes_vinted_en_lot_INVERSE.sql.
-- SIMULATION D'ABORD : remplacer le COMMIT final par ROLLBACK et lire le journal rendu.
-- ⛔ FEU VERT NOMMÉ DE NICO REQUIS. Application :
--   npx supabase db query --linked -f scripts/reparations/20261017_ventes_vinted_en_lot.sql

BEGIN;
SET LOCAL statement_timeout = '300s';
SET LOCAL lock_timeout = '5s';

-- 0. Garde : la règle est là et allumée.
DO $garde$
BEGIN
  IF to_regclass('public.vinted_commandes_articles') IS NULL
     OR to_regprocedure('public.vente_vinted_lot_eclater(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261017120000 absente : réparation arrêtée, rien n''est écrit';
  END IF;
  IF coalesce((SELECT value FROM public.coin_config WHERE key = 'ventes_vinted_lot_depuis'), 0) <= 0 THEN
    RAISE EXCEPTION 'règle coupée (ventes_vinted_lot_depuis = 0) : réparation arrêtée, rien n''est écrit';
  END IF;
  IF to_regclass('public._backup_1710_lots_entetes') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegardes du 17/10 déjà présentes : réparation déjà passée, rien n''est écrit';
  END IF;
END
$garde$;

-- 1. Le périmètre PROUVÉ (la composition lue, jamais le titre).
CREATE TABLE public._backup_1710_lots_entetes AS
SELECT v.* FROM public.ventes v
 WHERE v.plateforme_code = 'vinted' AND v.source = 'releve'
   AND v.inventaire_id IS NULL AND v.annonce_id IS NULL
   AND v.commande_ref ~ '^[0-9]{1,24}$'
   AND coalesce(v.vendu_le, v.created_at) >= now() - interval '30 days'
   AND v.created_at < to_timestamp((SELECT value FROM public.coin_config WHERE key = 'ventes_vinted_lot_depuis'))
   AND (SELECT count(*) FROM public.vinted_commandes_articles c
         WHERE c.user_id = v.user_id AND c.commande_ref = v.commande_ref AND c.eclatee_le IS NULL) >= 2
   AND NOT EXISTS (SELECT 1 FROM public.vinted_commandes_articles c
                    WHERE c.user_id = v.user_id AND c.commande_ref = v.commande_ref AND public.vinted_commande_annulee(c.statut))
   AND NOT EXISTS (SELECT 1 FROM public.vinted_sync_runs r WHERE r.user_id = v.user_id AND r.status = 'running');

CREATE TEMP TABLE _avant ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.email_logs
           WHERE user_id IN (SELECT DISTINCT user_id FROM public._backup_1710_lots_entetes)) AS mails_perimetre,
         (SELECT coalesce(max(id), 0) FROM public.push_ventes) AS note_max,
         pg_current_xact_id()::text::bigint AS xact;

-- 2. Sauvegardes : tout ce que la règle peut toucher.
CREATE TABLE public._backup_1710_lots_composition AS
SELECT c.* FROM public.vinted_commandes_articles c
  JOIN public._backup_1710_lots_entetes e ON e.user_id = c.user_id AND e.commande_ref = c.commande_ref;
CREATE TABLE public._backup_1710_lots_ventes AS
SELECT v.* FROM public.ventes v
 WHERE v.plateforme_code = 'vinted'
   AND (v.user_id, v.annonce_id) IN (SELECT c.user_id, c.item_id FROM public._backup_1710_lots_composition c);
CREATE TABLE public._backup_1710_lots_inventaire AS
SELECT i.* FROM public.inventaire i
 WHERE (i.user_id, i.vinted_item_id) IN (SELECT c.user_id, c.item_id FROM public._backup_1710_lots_composition c)
    OR i.id IN (SELECT j.inventaire_id FROM public.cross_post_jobs j
                  JOIN public._backup_1710_lots_composition c
                    ON c.user_id = j.user_id AND j.platform = 'vinted' AND btrim(coalesce(j.platform_listing_id, '')) = c.item_id
                 WHERE j.inventaire_id IS NOT NULL);
CREATE TABLE public._backup_1710_lots_jobs AS
SELECT j.* FROM public.cross_post_jobs j WHERE j.inventaire_id IN (SELECT id FROM public._backup_1710_lots_inventaire);
CREATE TABLE public._backup_1710_lots_recus AS
SELECT o.* FROM public.ventes_operations o
 WHERE (o.user_id, o.cle) IN (SELECT c.user_id, 'annonce:vinted:' || c.item_id FROM public._backup_1710_lots_composition c);

-- 3. La règle, commande par commande (la plus ancienne d'abord).
CREATE TABLE public._reparation_1710_lots AS
SELECT now() AS le, e.id AS entete, e.user_id, e.commande_ref, e.prix_vente AS total,
       public.vente_vinted_lot_eclater(e.user_id, e.commande_ref, 'reparation') AS r
  FROM public._backup_1710_lots_entetes e
 ORDER BY e.vendu_le, e.id;

-- 4. Zéro mail, zéro push : toute note née dans CETTE transaction est classée.
UPDATE public.push_ventes SET statut = 'doublon', motif = 'reparation_1710_ventes_lot', traite_le = now()
 WHERE id > (SELECT note_max FROM _avant) AND lot = (SELECT xact FROM _avant) AND statut = 'a_envoyer';

-- 5. Contrôles : au moindre écart, tout est annulé.
DO $controle$
BEGIN
  IF (SELECT count(*) FROM public.email_logs
       WHERE user_id IN (SELECT DISTINCT user_id FROM public._backup_1710_lots_entetes)) <> (SELECT mails_perimetre FROM _avant) THEN
    RAISE EXCEPTION 'email_logs a bougé pendant la réparation : tout est annulé';
  END IF;
  IF EXISTS (SELECT 1 FROM public.push_ventes
              WHERE id > (SELECT note_max FROM _avant) AND lot = (SELECT xact FROM _avant)
                AND statut NOT IN ('doublon', 'declaree', 'ignoree')) THEN
    RAISE EXCEPTION 'une note de vente partirait : tout est annulé';
  END IF;
  IF EXISTS (SELECT 1 FROM public._reparation_1710_lots j
              WHERE j.r ->> 'issue' = 'eclatee' AND j.total IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.vinted_commandes_articles c
                                 WHERE c.user_id = j.user_id AND c.commande_ref = j.commande_ref AND c.prix_part IS NULL)
                AND (SELECT sum(c.prix_part) FROM public.vinted_commandes_articles c
                      WHERE c.user_id = j.user_id AND c.commande_ref = j.commande_ref) <> j.total) THEN
    RAISE EXCEPTION 'somme des articles ≠ total Vinted : tout est annulé';
  END IF;
END
$controle$;

-- 6. Le journal (une ligne par commande) : issue, raison, articles (décision, prix).
SELECT j.commande_ref, left(j.user_id::text, 8) AS compte, j.total, j.r ->> 'issue' AS issue,
       left(coalesce(j.r ->> 'raison', ''), 160) AS raison,
       (SELECT string_agg(c.item_id || ':' || coalesce(c.decision, '∅') || ':' || coalesce(c.prix_part::text, '∅'), ' ; '
                          ORDER BY c.position)
          FROM public.vinted_commandes_articles c WHERE c.user_id = j.user_id AND c.commande_ref = j.commande_ref) AS articles,
       (SELECT count(*) FROM public.cross_post_jobs d
         WHERE d.action = 'delete' AND d.created_at >= j.le
           AND d.inventaire_id IN (SELECT c.inventaire_id FROM public.vinted_commandes_articles c
                                    WHERE c.user_id = j.user_id AND c.commande_ref = j.commande_ref)) AS retraits_armes
  FROM public._reparation_1710_lots j
 ORDER BY 1;

COMMIT;

-- APRÈS (5 minutes) — rien ne doit avoir bougé côté mails :
--   select count(*) from email_logs where user_id in (select distinct user_id from _backup_1710_lots_entetes)
--     and sent_at > (select min(le) from _reparation_1710_lots);                                   -- attendu : 0
--   select statut, count(*) from push_ventes where cree_le >= (select min(le) from _reparation_1710_lots)
--     and user_id in (select distinct user_id from _backup_1710_lots_entetes) group by 1;            -- aucune « envoyee » née de la réparation
--   select d.platform, d.status, count(*) from cross_post_jobs d where d.action = 'delete'
--     and d.created_at >= (select min(le) from _reparation_1710_lots)
--     and d.inventaire_id in (select id from _backup_1710_lots_inventaire) group by 1, 2;              -- retraits armés
