-- ═══════════════════════════════════════════════════════════════════════════
-- VENTE 28273 RETIRÉE — commande eBay REMBOURSÉE (09/10 soir, GO de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- lfdldl (b6005a59), portefeuille 1790174163845, 29,99 €, commande
-- 23-15177-13609:10084247633623 : FULLY_REFUNDED chez eBay (lu le 09/10). La vente est
-- née du relevé (source « releve ») : la règle 20261009210000 la retire (trace
-- ventes_supprimees source releve_ebay, usage_logs « vente_retiree »). La fiche reste en
-- stock (cette commande ne l'avait pas vendue) ; aucune copie touchée ; 0 mail.
-- Puis la pause posée pendant la mesure du parc est levée (règle active pour la suite).
-- Mesure du parc (09/10 soir) : 2 ventes en base sur 43 commandes remboursées/annulées —
-- 28273 (ici) et 88286 (saisie par la personne : jamais retirée, signalée par la règle).
-- Sauvegarde : _backup_0910_vente_28273. Inverse : 20261009_vente_28273_commande_remboursee_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public._backup_0910_vente_28273 (k text NOT NULL, cle text NOT NULL, ligne jsonb, sauve_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0910_vente_28273 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0910_vente_28273 FROM anon, authenticated;
INSERT INTO _backup_0910_vente_28273 (k, cle, ligne) SELECT 'vente', v.id::text, to_jsonb(v) FROM ventes v WHERE v.id = 28273;
INSERT INTO _backup_0910_vente_28273 (k, cle, ligne) SELECT 'inventaire', i.id::text, to_jsonb(i) FROM inventaire i WHERE i.id = 1790174163845;

UPDATE coin_config SET value = 0, updated_at = now() WHERE key = 'ventes_annulees_retrait_pause';
DO $r$
DECLARE r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ventes WHERE id = 28273 AND source = 'releve' AND commande_ref = '23-15177-13609:10084247633623') THEN
    RAISE EXCEPTION 'état inattendu : vente 28273';
  END IF;
  r := public.vente_commande_annulee(28273, 'FULLY_REFUNDED');
  IF r ->> 'action' <> 'retiree' THEN RAISE EXCEPTION 'vente non retirée : %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1790174163845 AND statut = 'stock') THEN RAISE EXCEPTION 'relecture : fiche'; END IF;
  INSERT INTO _backup_0910_vente_28273 (k, cle, ligne) VALUES ('resultat', '28273', r);
END $r$;
COMMIT;
SELECT k, cle, ligne ->> 'action' AS action FROM _backup_0910_vente_28273 ORDER BY k;
