-- ═══════════════════════════════════════════════════════════════════════════
-- PLAFOND JOURNALIER DES REPUBLICATIONS PREMIUM : RETOUR À 50 (04/10, point 7)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico du 12/09 (migration 20260912130000) : 170 « c'était une
-- erreur, pas une décision » → 50. Relu en prod le 04/10 : 170 de nouveau,
-- posé à la main après le 22/09 (les retenues tracent 50 jusqu'au 22/09 23:23,
-- 170 dès le 23/09 03:12), updated_at non touché (coin_config n'a pas de
-- déclencheur). Effet : nadegemarcelin78 84 republications Vinted depuis
-- minuit (96 le 02/10 — le volume exact de sa restriction Vinted d'août),
-- nerema75 59. Retour à 50 : get-pending-jobs relit la clé à chaque calcul de
-- retenue, effet au poll suivant. Un Premium qui a déjà passé 50 aujourd'hui
-- voit sa file retenue jusqu'à minuit Paris (régime voulu le 12/09).
-- Inverse : 20261004_plafond_republication_premium_50_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.sauvegarde_coin_config_20261004 AS
  SELECT key, value, updated_at, now() AS sauvegarde_le FROM public.coin_config WHERE key = 'republish_plafond_jour_premium';
UPDATE public.coin_config SET value = 50, updated_at = now()
 WHERE key = 'republish_plafond_jour_premium' AND value <> 50;
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'republish_plafond_jour_premium';
