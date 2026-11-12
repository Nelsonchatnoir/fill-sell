-- SAUVEGARDE avant la migration 20261112100000_essai_formule_aucun_credit_hors_paiement (12/11/2026, question 9 des offres
-- Cloud : pendant l'essai d'une formule avec Cloud, aucun crédit mensuel hors paiement).
-- La migration n'écrit AUCUNE ligne : elle réécrit deux fonctions (grant_monthly_coins, coins_awaiting_payment). Ce qui est
-- sauvegardé : leurs deux définitions de prod, empreinte et droits, juste avant ; et, pour mémoire, l'empreinte des deux
-- témoins jamais touchés (grant_monthly_coins_sweep, upgrade_monthly_grant). Aucun compte : aucun n'est en essai d'une
-- formule aujourd'hui (PREUVE du 12/11/2026 10:02 : 0), et la migration n'écrit dans aucun.
-- ⛔ Garde : si une des deux fonctions a changé en prod depuis la lecture du 12/11/2026 vers 09:45 (md5 ci-dessous), RIEN
--    n'est écrit et la migration ne doit PAS être appliquée (elle est faite depuis ces définitions-là).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_essai_formule_aucun_credit_hors_paiement_SAUVEGARDE.sql
-- Retour : supabase/rollbacks/20261112100000_essai_formule_aucun_credit_hors_paiement_INVERSE.sql (les mêmes deux définitions).
DO $garde$
DECLARE v text;
BEGIN
  SELECT string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ' ' ORDER BY p.proname) INTO v
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('coins_awaiting_payment', 'grant_monthly_coins');
  IF v IS DISTINCT FROM 'coins_awaiting_payment=f559b9978471d31e78b1b25794c8f8fe grant_monthly_coins=185d1427c213ccb8d2a179adbfebc6ed' THEN
    RAISE EXCEPTION 'une des deux fonctions a changé en prod depuis le 12/11 09:45 (%) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
END $garde$;

CREATE TABLE public._backup_1112_essai_formule_aucun_credit_hors_paiement AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits,
       p.prosecdef AS security_definer, p.proconfig::text AS config,
       p.proname IN ('coins_awaiting_payment', 'grant_monthly_coins') AS reecrite
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('coins_awaiting_payment', 'grant_monthly_coins', 'grant_monthly_coins_sweep', 'upgrade_monthly_grant');
ALTER TABLE public._backup_1112_essai_formule_aucun_credit_hors_paiement ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1112_essai_formule_aucun_credit_hors_paiement FROM PUBLIC, anon, authenticated;

SELECT count(*) AS n, string_agg(nom || '=' || md5 || CASE WHEN reecrite THEN ' (réécrite)' ELSE ' (témoin)' END, ' ' ORDER BY nom) AS detail
  FROM public._backup_1112_essai_formule_aucun_credit_hors_paiement;
-- Attendu : 4 — coins_awaiting_payment=f559b9978471d31e78b1b25794c8f8fe (réécrite) grant_monthly_coins=185d1427c213ccb8d2a179adbfebc6ed
--   (réécrite) grant_monthly_coins_sweep=a0da488f8fe11ef872409caee220ad70 (témoin) upgrade_monthly_grant=2080915eaed8f9d8aae81345702dc672 (témoin).
