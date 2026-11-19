-- (19/11/2026, demande de Nico : « le stock = les IP des clients actifs et des essais en cours + une petite marge »)
-- VALIDÉ par Nico le 19/11 (« Marge 2, achat max 2, et retrait des réglages stock_min et budget » ; ~14:00 : achat sur demande). NON JOUÉ : le coordinateur
-- l'applique (npx supabase db query --linked -f …). Inverse : 20261119_cloud_ip_reglages_INVERSE.sql.
--  · cloud_ip_achat_max 10 → 2 : IPRoyal facture 4 $ une IP seule, 3 $ l'IP dès 2 (devis lus le 19/11 : 1 → 4 $, 2 → 6 $,
--    3 → 9 $) ; une commande se prolonge EN ENTIER (les IP sœurs avec celle qui sert) : par 2, le prix de gros reste et une
--    prolongation forcée ne paie au plus qu'une IP sœur ;
--  · cloud_ip_stock_min (4, posé le 16/11 18:01) et cloud_ip_budget_mensuel_usd (60) : LUS PAR PERSONNE depuis le 07/11
--    (la marge remplace le stock minimum ; plus de plafond en dollars) — retirés pour ne plus faire croire qu'ils agissent ;
--  · (19/11 ~14:00, décision de Nico) cloud_ip_achat_sur_demande = 1 (absent jusqu'ici = 0) : un achat seulement pour un client
--    qui attend VRAIMENT une place sans IP saine libre, UNE IP à la fois, jamais pour remplacer une IP mauvaise ; plus aucune
--    IP achetée ni renouvelée d'avance pour la marge (cloud_ip_marge reste 2 : le seul jeu de la garde du nombre).
--    ⛔ Le rachat reste COUPÉ (cloud_ip_achats_auto = 0 depuis 13:17, Nico) : ce script ne le rallume PAS.
--  · inchangés : cloud_ip_marge 2, cloud_ip_achats_auto 1, cloud_ip_renouvellement_auto 1, cloud_ip_renouveler_saines_seulement 1,
--    cloud_ip_sante_controle 1 ; cloud_repos_jours et cloud_grace_jours absents (7 et 2 jours).
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_1911_cloud_ip_reglages AS
  SELECT now() AS le, key, value FROM public.coin_config
   WHERE key IN ('cloud_ip_achat_max', 'cloud_ip_stock_min', 'cloud_ip_budget_mensuel_usd', 'cloud_ip_achat_sur_demande');
ALTER TABLE public._backup_1911_cloud_ip_reglages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_cloud_ip_reglages FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_1911_cloud_ip_reglages WHERE key <> 'cloud_ip_achat_sur_demande') <> 3 THEN RAISE EXCEPTION 'réglages relus : 3 attendus'; END IF;
  IF (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_achat_max') <> 10 THEN RAISE EXCEPTION 'cloud_ip_achat_max a changé depuis sa lecture (10)'; END IF;
  IF (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_marge') <> 2 THEN RAISE EXCEPTION 'cloud_ip_marge n''est plus 2 (lu le 19/11) : relire'; END IF;
END $$;
UPDATE public.coin_config SET value = 2, updated_at = now() WHERE key = 'cloud_ip_achat_max' AND value = 10;
DELETE FROM public.coin_config WHERE key IN ('cloud_ip_stock_min', 'cloud_ip_budget_mensuel_usd');
INSERT INTO public.coin_config (key, value, updated_at) VALUES ('cloud_ip_achat_sur_demande', 1, now())
ON CONFLICT (key) DO UPDATE SET value = 1, updated_at = now();
SELECT key, value FROM public.coin_config WHERE key LIKE 'cloud_ip_%' ORDER BY key;
COMMIT;
