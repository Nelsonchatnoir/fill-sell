-- ═══════════════════════════════════════════════════════════════════════════
-- Bascule quotas (4/4) : L'INTERRUPTEUR — clés de quotas + prix à 0
--
-- ⚠️ À APPLIQUER EN DERNIER, après 1/ 2/ 3/ (leurs fonctions sont fail-open
-- tant que ces clés n'existent pas) et JUSTE AVANT l'OTA (entre les deux,
-- l'app affichera des soldes figés — fenêtre à garder courte).
--
-- CONVENTIONS :
-- · quota_republication_business = 0 signifie ILLIMITÉ (les fonctions
--   sautent le comptage sur 0). Même convention pour tout quota_* : 0 ou
--   clé absente = pas de limite.
-- · republication_avie_depuis = epoch (secondes) de la bascule — le « 50 à
--   vie » free ne compte QUE les republications créées après cet instant
--   (jamais rétroactif). ON CONFLICT DO NOTHING : un rejeu de la migration
--   ne déplace PAS l'origine. Un int porte l'epoch jusqu'en 2038.
-- · Les clés de PRIX passent à 0 mais NE SONT PAS SUPPRIMÉES : les remonter
--   ressuscite l'ancien monde tel quel (branches v_price>0 intactes).
--   Valeurs d'avant, pour le retour arrière :
--     price_generate=6 · price_per_platform=1 · price_republish=1 ·
--     price_lens_overflow=6 · price_ia_light=9 · price_ia_advanced=32
--   (la retouche AVANCÉE est par ailleurs retirée du produit — son prix à 0
--   reste posé pour les vieux clients OTA qui enverraient encore l'option.)
--
-- ⚠️ À appliquer explicitement. Idempotente (rejouable sans effet second,
-- avie_depuis compris).
-- ═══════════════════════════════════════════════════════════════════════════

-- Quotas par palier (gestes réels, par cycle d'abonnement)
INSERT INTO coin_config (key, value) VALUES
  ('quota_annonces_free', 5), ('quota_annonces_premium', 40),
  ('quota_annonces_pro', 120), ('quota_annonces_business', 300),
  ('quota_scan_free', 3), ('quota_scan_premium', 40),
  ('quota_scan_pro', 120), ('quota_scan_business', 300),
  ('quota_republication_premium', 1500), ('quota_republication_pro', 5000),
  ('quota_republication_business', 0),          -- 0 = ILLIMITÉ (convention)
  ('republication_avie_free', 50),
  ('quota_retouche_free', 0), ('quota_retouche_premium', 5),
  ('quota_retouche_pro', 20), ('quota_retouche_business', 50),
  ('quota_voix_free', 10), ('quota_voix_premium', 30),
  ('quota_voix_pro', 80), ('quota_voix_business', 200)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Origine du « 50 à vie » : posée UNE fois, jamais déplacée par un rejeu.
INSERT INTO coin_config (key, value)
VALUES ('republication_avie_depuis', extract(epoch FROM now())::integer)
ON CONFLICT (key) DO NOTHING;

-- Les prix s'éteignent — les Pépites ne gouvernent plus rien.
UPDATE coin_config SET value = 0, updated_at = now()
WHERE key IN ('price_generate', 'price_per_platform', 'price_republish',
              'price_lens_overflow', 'price_ia_light', 'price_ia_advanced');
