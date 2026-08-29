-- ⏳ NON APPLIQUÉE — SQL montré à Nico le 29/08, application après feu vert
-- explicite (une par une, jamais de db push).
--
-- Plafond quotidien d'exécution des republications : 100 → 45 (2026-08-29).
-- La clé a été posée à 100 (20260829130000, appliquée) comme filet
-- quasi inactif le temps de tester la cadence irrégulière ; décision Nico du
-- 29/08 après la restriction nadegemarcelin78 : 45/jour, appliqué au CLAIM
-- côté serveur (get-pending-jobs v18) en plus du plafond embarqué dans
-- l'extension — les trois lecteurs (serveur, extension, affichage StockTab)
-- lisent CETTE clé, un seul réglage.
-- Idempotente : UPDATE sur la clé existante (posée par 20260829130000).

UPDATE public.coin_config SET value = 45, updated_at = now()
WHERE key = 'republish_plafond_jour';
