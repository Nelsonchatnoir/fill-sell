-- ═══════════════════════════════════════════════════════════════════════════
-- LE STOCK EN COURS SOUS LA RÈGLE « UNE COMMANDE eBAY = UN EXEMPLAIRE » (09/10 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico (point 4) : appliquer la règle (migration 20261009190000), pas de
-- geste à la main. Les ventes eBay relevées (commande) liées à une fiche encore EN
-- STOCK, au 09/10 soir :
--   99461  duport.leo3      1791015782859 maillot Flamengo  eBay 2 disponibles (lu 08/10 18:08 UTC) → en stock, quantité 2
--   52666  lfdldl           1790174168241 lames Mach3       eBay épuisée (veille, 09/10 10:08 UTC)    → vendue
--   99441  emhost0          1790174236694 dentelle          eBay épuisée (veille, 09/10 07:18 UTC)    → vendue
-- HORS règle : 28273 (lfdldl, portefeuille 1790174163845) — commande REMBOURSÉE chez eBay
-- (FULLY_REFUNDED, lu le 09/10) : rien n'est fait, la fiche reste en stock.
-- Sauvegarde : _backup_0910_ebay_exemplaires (fiches et tous leurs jobs, AVANT).
-- Inverse : scripts/reparations/20261009_ebay_exemplaires_stock_en_cours_INVERSE.sql
-- npx supabase db query --linked -f scripts/reparations/20261009_ebay_exemplaires_stock_en_cours.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public._backup_0910_ebay_exemplaires (
  k text NOT NULL, cle text NOT NULL, ligne jsonb, sauve_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0910_ebay_exemplaires ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0910_ebay_exemplaires FROM anon, authenticated;
INSERT INTO _backup_0910_ebay_exemplaires (k, cle, ligne)
SELECT 'inventaire', i.id::text, to_jsonb(i) FROM inventaire i WHERE i.id IN (1791015782859, 1790174168241, 1790174236694);
INSERT INTO _backup_0910_ebay_exemplaires (k, cle, ligne)
SELECT 'job', j.id::text, to_jsonb(j) FROM cross_post_jobs j WHERE j.inventaire_id IN (1791015782859, 1790174168241, 1790174236694);
INSERT INTO _backup_0910_ebay_exemplaires (k, cle, ligne) VALUES ('debut', 'debut', jsonb_build_object('le', now()));

DO $a$
DECLARE r jsonb; v bigint;
BEGIN
  FOREACH v IN ARRAY ARRAY[99461, 52666, 99441]::bigint[] LOOP
    r := public.ebay_commande_appliquer(v);
    INSERT INTO _backup_0910_ebay_exemplaires (k, cle, ligne) VALUES ('decision', v::text, r);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1791015782859 AND statut = 'stock' AND quantite = 2) THEN RAISE EXCEPTION 'relecture : Flamengo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1790174168241 AND statut = 'vendu') THEN RAISE EXCEPTION 'relecture : Mach3'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = 1790174236694 AND statut = 'vendu') THEN RAISE EXCEPTION 'relecture : dentelle'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs WHERE inventaire_id = 1791015782859 AND action = 'delete'
              AND created_at > (SELECT (ligne ->> 'le')::timestamptz FROM _backup_0910_ebay_exemplaires WHERE k = 'debut')) THEN
    RAISE EXCEPTION 'relecture : un retrait a été armé sur le Flamengo';
  END IF;
END $a$;

COMMIT;

SELECT k, cle, ligne ->> 'decision' AS decision, ligne ->> 'motif' AS motif FROM _backup_0910_ebay_exemplaires WHERE k = 'decision' ORDER BY cle;
