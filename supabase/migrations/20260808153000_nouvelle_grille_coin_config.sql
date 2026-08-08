-- Nouvelle grille tarifaire (2026-08-08, décision Nico — étape 2 du chantier).
-- MÊME PRIX POUR TOUS LES PALIERS : plus aucun prix conditionné à is_pro /
-- is_premium / is_comped nulle part (les deux migrations suivantes retirent
-- les conditions dans spend_coins_and_publish et spend_coins_and_republish).
--
--   génération   : 1 → 6 Pépites
--   publication  : 3 → 1 Pépite / plateforme
--   grants       : free 30 → 50 · premium 150 → 400 · pro 600 → 1200
--
-- INCHANGÉS : price_republish 1 · price_lens_overflow 6 · price_ia_light 9 ·
-- price_ia_advanced 32 · price_original 0 · free_stock_limit.
--
-- Aucun rattrapage de solde, aucune reprise : les soldes acquis restent, les
-- nouveaux montants partent au prochain grant (grant_monthly_coins /
-- upgrade_monthly_grant lisent coin_config AU MOMENT du grant), les nouveaux
-- prix s'appliquent immédiatement à toute dépense (les RPC lisent coin_config
-- au moment du débit). Idempotent : rejouer ne change rien.

UPDATE coin_config SET value = 6    WHERE key = 'price_generate';
UPDATE coin_config SET value = 1    WHERE key = 'price_per_platform';
UPDATE coin_config SET value = 50   WHERE key = 'monthly_grant_free';
UPDATE coin_config SET value = 400  WHERE key = 'monthly_grant_premium';
UPDATE coin_config SET value = 1200 WHERE key = 'monthly_grant_pro';
