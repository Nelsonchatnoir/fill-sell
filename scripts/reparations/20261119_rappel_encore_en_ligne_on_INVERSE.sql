-- INVERSE de 20261119_rappel_encore_en_ligne_on.sql : l'interrupteur revient à la valeur sauvegardée (0 : ni bandeau ni push).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.coin_config c SET value = b.value, updated_at = now()
  FROM public._backup_1911_rappel_encore_en_ligne b WHERE c.key = b.key;
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif';
COMMIT;
