-- Inverse : remet la valeur sauvegardée (170 relu le 04/10).
UPDATE public.coin_config c SET value = s.value, updated_at = now()
  FROM public.sauvegarde_coin_config_20261004 s WHERE c.key = s.key;
