-- Inverse de 20261110_cloud_ip_paiement_solde.sql : les trois réglages reprennent la valeur sauvegardée.
-- ⛔ Le code déployé depuis le 10/11 soir ne paie plus JAMAIS par carte : remettre cloud_ip_paiement_carte à 1 ne
--    rallume pas la carte (il faudrait aussi redéployer l'orchestrateur d'avant).
BEGIN;
UPDATE public.coin_config c SET value = (b.ligne->>'value')::numeric, updated_at = now()
FROM public._backup_1011_cloud_ip_paiement b WHERE c.key = b.ligne->>'key';
SELECT key, value, updated_at FROM public.coin_config
WHERE key IN ('cloud_ip_paiement_carte', 'cloud_ip_achats_auto', 'cloud_ip_carte_id') ORDER BY key;
COMMIT;
