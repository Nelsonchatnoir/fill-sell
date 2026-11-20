-- INVERSE de 20261120_quota_republication_free_30.sql : quota_republication_free revient à la valeur sauvegardée (50)
-- dans public._backup_2011_quota_republication_free. Ne touche que cette clé ; la jauge jauge_remontees_free (30) et
-- les paliers payants restent tels quels. L'écran ne lit plus cette clé (grilleDuPalier) : seul le calcul serveur
-- interrupteur à 0 (grille_trois_jauges = 0) la reprendrait.
-- À lancer par : npx supabase db query --linked -f scripts/reparations/20261120_quota_republication_free_30_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.coin_config c SET value = b.value, updated_at = now()
  FROM public._backup_2011_quota_republication_free b WHERE c.key = b.key AND c.key = 'quota_republication_free';
SELECT key, value, updated_at AT TIME ZONE 'Europe/Paris' AS maj_paris FROM public.coin_config
  WHERE key IN ('quota_republication_free', 'jauge_remontees_free') ORDER BY key;
COMMIT;
