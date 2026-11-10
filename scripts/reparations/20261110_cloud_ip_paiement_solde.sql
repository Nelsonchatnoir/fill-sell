-- (10/11 soir, ordre de Nico) LES IP SE PAIENT PAR LE SOLDE IPROYAL, PLUS JAMAIS PAR LA CARTE.
-- La banque refuse IPRoyal (« marchand non autorisé ») : achat id 4 du 10/11 19:36 (carte …9699, carte_id 410814) en échec
-- HTTP 500. Ce script, joué AVANT le déploiement du code qui retire la carte (approvisionnement.js / iproyal.js) :
--   1. cloud_ip_paiement_carte = 0 (le solde) — le code déployé n'en tient plus compte, la base dit la même chose ;
--   2. cloud_ip_achats_auto = 0 LE TEMPS du correctif : la pause d'une heure de l'échec finit à 20:36 et le redémarrage
--      de l'orchestrateur l'efface — l'achat d'UNE IP (accord de Nico, 4 $) passe par outils/acheter-une-ip.mjs
--      --accord-ecrit ; l'interrupteur revient à 1 ensuite (20261110_cloud_ip_achats_auto_rallume.sql).
-- Renouvellement automatique (cloud_ip_renouvellement_auto) : INCHANGÉ (1) — il paie désormais par le solde.
-- Exécution : npx supabase db query --linked -f <ce fichier>. Inverse : 20261110_cloud_ip_paiement_solde_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_1011_cloud_ip_paiement AS
  SELECT now() AS le, to_jsonb(c.*) AS ligne FROM public.coin_config c
  WHERE c.key IN ('cloud_ip_paiement_carte', 'cloud_ip_achats_auto', 'cloud_ip_carte_id');
ALTER TABLE public._backup_1011_cloud_ip_paiement ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1011_cloud_ip_paiement FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_1011_cloud_ip_paiement) <> 3 THEN
    RAISE EXCEPTION 'réglages cloud_ip_paiement_carte / cloud_ip_achats_auto / cloud_ip_carte_id introuvables';
  END IF;
  UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'cloud_ip_paiement_carte' AND value <> 0;
  UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'cloud_ip_achats_auto' AND value <> 0;
END $$;
SELECT key, value, updated_at FROM public.coin_config
WHERE key IN ('cloud_ip_paiement_carte', 'cloud_ip_achats_auto', 'cloud_ip_carte_id', 'cloud_ip_renouvellement_auto') ORDER BY key;
COMMIT;
