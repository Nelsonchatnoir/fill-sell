-- (10/11 soir) Après le déploiement de l'orchestrateur qui paie TOUJOURS par le solde (jamais par carte) et l'achat de
-- l'IP accordée par Nico : l'achat automatique reprend (cloud_ip_achats_auto = 1, la valeur d'avant le correctif,
-- sauvegardée dans _backup_1011_cloud_ip_paiement). cloud_ip_paiement_carte reste à 0 (et n'est plus lu).
-- Inverse : UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'cloud_ip_achats_auto';
BEGIN;
DO $$
BEGIN
  IF COALESCE((SELECT (ligne->>'value')::numeric FROM public._backup_1011_cloud_ip_paiement WHERE ligne->>'key' = 'cloud_ip_achats_auto'), 0) <> 1 THEN
    RAISE EXCEPTION 'cloud_ip_achats_auto n''était pas à 1 avant le correctif : rien rallumé';
  END IF;
  UPDATE public.coin_config SET value = 1, updated_at = now() WHERE key = 'cloud_ip_achats_auto' AND value <> 1;
END $$;
SELECT key, value, updated_at FROM public.coin_config
WHERE key IN ('cloud_ip_paiement_carte', 'cloud_ip_achats_auto', 'cloud_ip_renouvellement_auto') ORDER BY key;
COMMIT;
