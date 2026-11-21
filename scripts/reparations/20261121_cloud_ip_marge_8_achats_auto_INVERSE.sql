-- INVERSE de 20261121_cloud_ip_marge_8_achats_auto.sql : cloud_ip_marge et cloud_ip_achats_auto reprennent leur valeur d'avant
-- (10 et 0 au 21/11 midi), lues dans la sauvegarde.
BEGIN;
UPDATE public.coin_config c SET value = b.value, updated_at = now() FROM public._backup_2111_cloud_ip_marge_achats b WHERE c.key = b.key;
SELECT key, value FROM public.coin_config WHERE key IN ('cloud_ip_marge', 'cloud_ip_achats_auto') ORDER BY key;
COMMIT;
