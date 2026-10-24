-- INVERSE de 20261024210000 : les quatre clés reviennent avec leurs valeurs du 24/10 (journalisé). À jouer AVANT
-- l'inverse de 20261024200000 et le retour de get-pending-jobs à une version qui les lit (sinon repli à 45).
BEGIN;
WITH ins AS (
  INSERT INTO public.coin_config (key, value, updated_at)
  VALUES ('republish_plafond_jour', 170, now()), ('republish_plafond_jour_premium', 50, now()),
         ('republish_plafond_jour_pro', 170, now()), ('republish_plafond_jour_business', 100000, now())
  ON CONFLICT (key) DO NOTHING RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, NULL, value, 'inverse 20261024210000' FROM ins;
COMMIT;
