-- ÉTEINDRE le rythme par plateforme (migration 20261025200000) : retour au rythme du COMPTE, toutes plateformes
-- (règle du 18/09), au passage suivant du balayage. Journalisé (coin_config_trace).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.coin_config SET value = 0 WHERE key = 'republish_rythme_par_plateforme';
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'republish_rythme_par_plateforme';
COMMIT;
