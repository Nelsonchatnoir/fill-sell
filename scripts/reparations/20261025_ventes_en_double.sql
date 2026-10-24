-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 nuit — ventes écrites EN DOUBLE par l'écran Ventes (audit N7 ; cause corrigée dans
-- src/tabs/VentesTab.jsx : verrou par ligne, relecture avant écriture, ligne ET lot).
-- Ce qui est retiré : une ligne `ventes` identique à une précédente (même compte, même article, même prix, même titre,
-- même date, même plateforme, même statut, même commande), écrite moins de 2 secondes après elle, sur un article à UN
-- seul exemplaire (inventaire.quantite ≤ 1 : il ne peut pas se vendre deux fois), dans les 60 derniers jours. La
-- première ligne de chaque groupe est GARDÉE. Rien d'autre n'est touché (ni la fiche, ni le stock, ni les mails).
-- Mesuré le 25/10 à 00:5x : af37fa49 64 lignes (24 articles, 28/09 19:16-19:26, 416,64 € comptés en trop),
-- 90ace0e4 1 ligne (274894, 24/10, 70 ms après 274893), e25ff459 1 ligne (16/10, 1 ms).
-- Aucune ligne référencée ailleurs n'est retirée (push_ventes, ventes_supprimees, vinted_commandes_articles,
-- ventes_ebay_exemplaires, ventes_annulees_attente_go). Une suppression par le rôle postgres ne déclenche pas
-- ventes_suppression_trace (réservé aux gestes de l'app).
-- Sauvegarde : _backup_2510_ventes_doublons. Inverse : 20261025_ventes_en_double_INVERSE.sql.
-- Essai à blanc : remplacer COMMIT par ROLLBACK (le dernier SELECT dit ce qui serait retiré).
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_ventes_doublons AS
  SELECT now() AS sauvegarde_le, NULL::bigint AS id_garde, v.* FROM public.ventes v WHERE false;
ALTER TABLE public._backup_2510_ventes_doublons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_ventes_doublons FROM PUBLIC, anon, authenticated;

WITH groupes AS (
  SELECT v.id, first_value(v.id) OVER w AS id_garde, row_number() OVER w AS rang,
         v.created_at - first_value(v.created_at) OVER w AS ecart
    FROM public.ventes v
   WHERE v.created_at > now() - interval '60 days' AND v.inventaire_id IS NOT NULL
  WINDOW w AS (PARTITION BY v.user_id, v.inventaire_id, v.prix_vente, v.titre, v.date, v.plateforme, v.statut,
                            coalesce(v.commande_ref, '') ORDER BY v.created_at, v.id)
), cibles AS (
  SELECT g.id, g.id_garde FROM groupes g
    JOIN public.ventes v ON v.id = g.id
    JOIN public.inventaire i ON i.id = v.inventaire_id
   WHERE g.rang > 1 AND g.ecart <= interval '2 seconds' AND coalesce(i.quantite, 1) <= 1
     AND NOT EXISTS (SELECT 1 FROM public.push_ventes p WHERE p.vente_id = g.id)
     AND NOT EXISTS (SELECT 1 FROM public.ventes_supprimees s WHERE s.vente_id = g.id)
     AND NOT EXISTS (SELECT 1 FROM public.vinted_commandes_articles c WHERE c.vente_id = g.id)
     AND NOT EXISTS (SELECT 1 FROM public.ventes_ebay_exemplaires e WHERE e.vente_id = g.id)
     AND NOT EXISTS (SELECT 1 FROM public.ventes_annulees_attente_go a WHERE a.vente_id = g.id)
)
INSERT INTO public._backup_2510_ventes_doublons
SELECT now(), c.id_garde, v.* FROM public.ventes v JOIN cibles c ON c.id = v.id
 WHERE NOT EXISTS (SELECT 1 FROM public._backup_2510_ventes_doublons b WHERE b.id = v.id);

DELETE FROM public.ventes v
 USING public._backup_2510_ventes_doublons b
 WHERE b.id = v.id AND b.sauvegarde_le > now() - interval '5 minutes';

SELECT b.user_id, count(*) AS retirees, count(DISTINCT b.inventaire_id) AS articles, sum(b.prix_vente) AS ca_retire,
       (SELECT count(*) FROM public.email_logs e WHERE e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public._backup_2510_ventes_doublons b GROUP BY b.user_id ORDER BY 2 DESC;
COMMIT;
