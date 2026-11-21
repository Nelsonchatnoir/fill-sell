-- (21/11/2026 midi, point 5 de Nico) MARGE D'IP FIXE À 8, PUIS LES ACHATS AUTOMATIQUES RALLUMÉS. Lu en prod le 21/11 :
-- coin_config cloud_ip_marge = 10 (réécrit à 11:13:10 par le recalcul « max(6 ; 2 × pic sur 7 j) » de l'orchestrateur,
-- supprimé par ce lot : entretien.js avecSeuilStock) et cloud_ip_achats_auto = 0 (coupé à 11:14:43). Ordre de Nico : marge
-- FIXE de 8 IP saines libres (en plus des places gardées et des IP attribuées), une IP par achat (approvisionnement.js,
-- ACHAT_PAR_ESSAI_MAX), et cloud_ip_achats_auto = 1 « sinon plus aucune IP n'est achetée quand le stock s'épuise ».
-- ⛔ À jouer APRÈS le redéploiement de l'orchestrateur qui ne recalcule plus la marge (sinon elle repasse à 10 et l'ancien
-- code peut acheter 2 IP d'un coup). Deux valeurs changent, rien d'autre.
-- Sauvegarde : _backup_2111_cloud_ip_marge_achats ; inverse : 20261121_cloud_ip_marge_8_achats_auto_INVERSE.sql.
-- Lancer : npx supabase db query --linked --yes -f scripts/reparations/20261121_cloud_ip_marge_8_achats_auto.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2111_cloud_ip_marge_achats AS
  SELECT now() AS le, key, value, updated_at FROM public.coin_config WHERE key IN ('cloud_ip_marge', 'cloud_ip_achats_auto');
ALTER TABLE public._backup_2111_cloud_ip_marge_achats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_cloud_ip_marge_achats FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public._backup_2111_cloud_ip_marge_achats) <> 2 THEN RAISE EXCEPTION 'les deux clés doivent exister (relire coin_config)'; END IF;
END $$;
UPDATE public.coin_config SET value = 8, updated_at = now() WHERE key = 'cloud_ip_marge' AND value IS DISTINCT FROM 8;
UPDATE public.coin_config SET value = 1, updated_at = now() WHERE key = 'cloud_ip_achats_auto' AND value IS DISTINCT FROM 1;
SELECT key, value, (updated_at AT TIME ZONE 'Europe/Paris')::timestamp(0) AS maj FROM public.coin_config
 WHERE key IN ('cloud_ip_marge', 'cloud_ip_achats_auto', 'cloud_ip_achat_max', 'cloud_ip_achat_sur_demande') ORDER BY key;
COMMIT;
