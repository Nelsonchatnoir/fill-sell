-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE — réparation des ventes Vinted en lot (17/10) : scripts/reparations/20261017_ventes_vinted_en_lot.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Rend, depuis les sauvegardes _backup_1710_lots_*, l'état d'AVANT la réparation :
--   1. les retraits armés par la réparation et encore en attente sont annulés (un
--      retrait déjà FAIT sur une plateforme ne se défait pas — c'est pourquoi la
--      réparation n'en arme que pour un article PROUVÉ) ; les remises en vente nées des
--      annonces passées « vendues » sont abandonnées ;
--   2. les ventes créées par la réparation sont retirées ; les ventes adoptées
--      reprennent leurs valeurs ; les lignes « lot » reviennent (même id) ;
--   3. les fiches, puis les annonces, reprennent leur état ; les reçus créés tombent ;
--   4. la composition reprend ses décisions (la règle ne la rejouera pas tant que la
--      ligne « lot » est née avant elle : elle redevient « à réparer »).
-- Aucun mail, aucune note : ces écritures ne passent par aucun déclencheur de vente.
-- ⛔ FEU VERT NOMMÉ DE NICO REQUIS. Application :
--   npx supabase db query --linked -f scripts/reparations/20261017_ventes_vinted_en_lot_INVERSE.sql

BEGIN;
SET LOCAL statement_timeout = '300s';
SET LOCAL lock_timeout = '5s';
-- Ni retrait ni note pendant le retour arrière.
SELECT set_config('fillsell.sans_retrait', '1', true);
SELECT set_config('fillsell.vente_declaree', '1', true);

DO $garde$
BEGIN
  IF to_regclass('public._backup_1710_lots_entetes') IS NULL OR to_regclass('public._reparation_1710_lots') IS NULL THEN
    RAISE EXCEPTION 'sauvegardes du 17/10 absentes : rien n''est écrit';
  END IF;
END
$garde$;

-- 1. Les retraits armés par la réparation, encore en attente : annulés.
UPDATE public.cross_post_jobs d
   SET status = 'cancelled',
       error = 'Retrait annulé : la réparation des ventes Vinted en lot du 17/10 a été défaite. Ton annonce reste en ligne.'
 WHERE d.action = 'delete' AND d.status IN ('pending', 'needs_user')
   AND d.inventaire_id IN (SELECT id FROM public._backup_1710_lots_inventaire)
   AND NOT EXISTS (SELECT 1 FROM public._backup_1710_lots_jobs b WHERE b.id = d.id)
   AND d.created_at >= (SELECT min(le) FROM public._reparation_1710_lots);
UPDATE public.remises_en_vente r
   SET statut = 'abandonnee', motif = 'reparation_lot_defaite', traite_le = now()
 WHERE r.statut = 'a_faire' AND r.cree_le >= (SELECT min(le) FROM public._reparation_1710_lots)
   AND r.inventaire_id IN (SELECT id FROM public._backup_1710_lots_inventaire);

-- 2. Les ventes : créées → retirées ; adoptées → rendues ; lignes « lot » → revenues.
DELETE FROM public.ventes v
 WHERE v.id IN (SELECT c.vente_id FROM public.vinted_commandes_articles c
                  JOIN public._backup_1710_lots_entetes e ON e.user_id = c.user_id AND e.commande_ref = c.commande_ref
                 WHERE c.vente_id IS NOT NULL)
   AND v.id NOT IN (SELECT id FROM public._backup_1710_lots_ventes);
UPDATE public.ventes v
   SET commande_ref = b.commande_ref, vendu_le = b.vendu_le, releve_le = b.releve_le,
       prix_vente = b.prix_vente, benefice = b.benefice
  FROM public._backup_1710_lots_ventes b
 WHERE v.id = b.id
   AND (v.commande_ref, v.vendu_le, v.releve_le, v.prix_vente, v.benefice)
       IS DISTINCT FROM (b.commande_ref, b.vendu_le, b.releve_le, b.prix_vente, b.benefice);
INSERT INTO public.ventes SELECT * FROM public._backup_1710_lots_entetes ON CONFLICT DO NOTHING;

-- 3. Les fiches, puis les annonces ; les reçus créés.
UPDATE public.inventaire i
   SET statut = b.statut, quantite = b.quantite, prix_vente = b.prix_vente, margin = b.margin,
       margin_pct = b.margin_pct, plateforme = b.plateforme, date = b.date
  FROM public._backup_1710_lots_inventaire b
 WHERE i.id = b.id
   AND (i.statut, i.quantite, i.prix_vente, i.margin, i.margin_pct, i.plateforme, i.date)
       IS DISTINCT FROM (b.statut, b.quantite, b.prix_vente, b.margin, b.margin_pct, b.plateforme, b.date);
UPDATE public.cross_post_jobs j
   SET status = b.status, sold_at = b.sold_at, last_checked_at = b.last_checked_at, platform_fields = b.platform_fields
  FROM public._backup_1710_lots_jobs b
 WHERE j.id = b.id
   AND (j.status, j.sold_at, j.last_checked_at, j.platform_fields)
       IS DISTINCT FROM (b.status, b.sold_at, b.last_checked_at, b.platform_fields);
DELETE FROM public.ventes_operations o
 WHERE (o.user_id, o.cle) IN (SELECT c.user_id, 'annonce:vinted:' || c.item_id FROM public._backup_1710_lots_composition c)
   AND NOT EXISTS (SELECT 1 FROM public._backup_1710_lots_recus b WHERE b.user_id = o.user_id AND b.cle = o.cle);

-- 4. La composition reprend ses décisions.
UPDATE public.vinted_commandes_articles c
   SET inventaire_id = b.inventaire_id, vente_id = b.vente_id, prix_part = b.prix_part, decision = b.decision,
       motif = b.motif, decide_le = b.decide_le, eclatee_le = b.eclatee_le, maj_le = now()
  FROM public._backup_1710_lots_composition b
 WHERE c.user_id = b.user_id AND c.commande_ref = b.commande_ref AND c.item_id = b.item_id;

-- Contrôle : chaque ligne « lot » est revenue, aucune vente « <ref>:<article> » de ces commandes ne reste.
DO $controle$
BEGIN
  IF EXISTS (SELECT 1 FROM public._backup_1710_lots_entetes e
              WHERE NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = e.id)) THEN
    RAISE EXCEPTION 'une ligne « lot » n''est pas revenue : tout est annulé';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes v JOIN public._backup_1710_lots_entetes e
               ON e.user_id = v.user_id AND v.plateforme_code = 'vinted' AND v.commande_ref LIKE e.commande_ref || ':%'
              WHERE v.id NOT IN (SELECT id FROM public._backup_1710_lots_ventes)) THEN
    RAISE EXCEPTION 'une vente éclatée reste : tout est annulé';
  END IF;
END
$controle$;

SELECT (SELECT count(*) FROM public._backup_1710_lots_entetes) AS lignes_lot_rendues,
       (SELECT count(*) FROM public._backup_1710_lots_inventaire) AS fiches_rendues,
       (SELECT count(*) FROM public._backup_1710_lots_jobs) AS annonces_relues;

COMMIT;
