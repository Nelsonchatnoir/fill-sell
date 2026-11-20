-- (20/11/2026 soir, bloc E de Nico) Le Free a 30 REMONTÉES (republications) PAR MOIS, PARTOUT : config, écran, calcul.
-- La règle : une seule valeur pour le Free. Le calcul serveur applique déjà 30 (quota_remontees_plafond('free') lit
-- jauge_remontees_free = 30 tant que coin_config.grille_trois_jauges = 1, lu le 20/11) ; l'écran lit désormais la même
-- jauge (grilleDuPalier(K, 'free').remontees). Restait quota_republication_free = 50 (posé le 05/10 par la migration
-- 20261005173000), la valeur que le serveur reprendrait si l'interrupteur de la grille repassait à 0 : elle passe à 30.
-- Les paliers payants (quota_republication_premium / _pro / _business, jauge_remontees_*) ne bougent pas.
-- Relu en base le 20/11 (lecture seule) : quota_republication_free = 50 (maj 05/10 17:43 Paris), jauge_remontees_free = 30,
-- grille_trois_jauges = 1.
-- À lancer APRÈS feu vert de Nico : npx supabase db query --linked -f scripts/reparations/20261120_quota_republication_free_30.sql
-- Inverse : 20261120_quota_republication_free_30_INVERSE.sql (remet la valeur sauvegardée, 50).
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2011_quota_republication_free AS
  SELECT now() AS le, key, value, updated_at FROM public.coin_config WHERE key = 'quota_republication_free';
ALTER TABLE public._backup_2011_quota_republication_free ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2011_quota_republication_free FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_2011_quota_republication_free) <> 1 THEN
    RAISE EXCEPTION 'quota_republication_free absente de coin_config : relire';
  END IF;
  IF (SELECT value FROM public.coin_config WHERE key = 'quota_republication_free') IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'quota_republication_free n''est plus 50 (lu le 20/11) : relire';
  END IF;
  IF (SELECT value FROM public.coin_config WHERE key = 'jauge_remontees_free') IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'jauge_remontees_free n''est plus 30 (lu le 20/11) : relire, les deux valeurs doivent dire la même chose';
  END IF;
END $$;
UPDATE public.coin_config SET value = 30, updated_at = now() WHERE key = 'quota_republication_free' AND value = 50;
SELECT key, value, updated_at AT TIME ZONE 'Europe/Paris' AS maj_paris FROM public.coin_config
  WHERE key IN ('quota_republication_free', 'jauge_remontees_free', 'grille_trois_jauges') ORDER BY key;
SELECT public.quota_remontees_plafond('free') AS plafond_free_serveur;
COMMIT;
