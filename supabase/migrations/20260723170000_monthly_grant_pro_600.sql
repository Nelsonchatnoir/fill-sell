-- ── Grant mensuel Pro : 800 → 600 ────────────────────────────────────────────
-- (2026-07-23) Morceau EXTRAIT de 20260707100000_lens_coins_config.sql, la
-- migration « économie v2 » volontairement jamais appliquée en prod. L'app
-- affiche 600 partout depuis le 14/07 (constante DISPLAY_GRANT_PRO, retirée
-- dans le même commit que cette migration) alors que la prod créditait 800 :
-- on aligne le crédit réel sur la promesse affichée.
--
-- ⚠️ Le RESTE de 20260707100000 reste GATÉ : pas de monthly_grant_free tant
-- que lens-analysis payant-par-scan (index.ts, jamais déployé) n'est pas en
-- prod — activer le grant Free sans cette contrepartie offrirait ~10
-- publications/mois à chaque compte gratuit (« le cadeau sans la
-- contrepartie », cf. le gate documenté dans la migration d'origine).
--
-- Pas de claw-back : les Pro déjà crédités de 800 ce mois-ci gardent leur
-- solde ; le prochain grant (1er du mois, ou top-up upgrade_monthly_grant)
-- prendra 600.
UPDATE public.coin_config SET value = 600, updated_at = now()
WHERE key = 'monthly_grant_pro';
