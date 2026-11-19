-- INVERSE de 20261119_cloud_ip_reglages.sql : les réglages reviennent de la sauvegarde _backup_1911_cloud_ip_reglages ; l'achat sur
-- demande (absent avant) est retiré.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.coin_config (key, value, updated_at)
  SELECT key, value, now() FROM public._backup_1911_cloud_ip_reglages
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
-- cloud_ip_achat_sur_demande : absent avant le script (= 0, la marge d'avant) → retiré, sauf s'il existait.
DELETE FROM public.coin_config WHERE key = 'cloud_ip_achat_sur_demande'
   AND NOT EXISTS (SELECT 1 FROM public._backup_1911_cloud_ip_reglages WHERE key = 'cloud_ip_achat_sur_demande');
SELECT key, value FROM public.coin_config WHERE key IN ('cloud_ip_achat_max', 'cloud_ip_stock_min', 'cloud_ip_budget_mensuel_usd', 'cloud_ip_achat_sur_demande') ORDER BY key;
COMMIT;
