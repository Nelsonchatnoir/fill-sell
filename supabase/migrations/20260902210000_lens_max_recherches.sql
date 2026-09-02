-- ═══════════════════════════════════════════════════════════════════════════
-- Lens : plafond de recherches web piloté par clé (02/09 soir)
--
-- Mesuré (audit du jour) : le coût d'un scan est LINÉAIRE en recherches web
-- (+0,019 $ pièce — 0,010 $ de frais direct + cache des résultats), 34 % des
-- scans en faisaient ≥ 4 (max observé 7) et AUCUN plafond n'existait
-- (web_search sans max_uses). À 3, le p99 du scan passe de 0,152 $ à ~0,086 $
-- et la moyenne baisse d'environ 13 % sans changer le produit.
--
-- lens-analysis lit cette clé à chaque requête (fail-open : 0 ou clé absente
-- = comportement historique sans plafond). Ajustable sans redéploiement —
-- c'est le bouton de qualité/coût à surveiller sur identification_incertaine
-- pendant une semaine avant d'envisager 2.
--
-- ⚠️ À appliquer explicitement. Idempotente (rejouable, remet 3).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO coin_config (key, value) VALUES ('lens_max_recherches', 3)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
