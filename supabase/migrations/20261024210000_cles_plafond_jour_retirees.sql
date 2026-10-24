-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024210000 — LES CLÉS DU PLAFOND DE REPUBLICATION PAR JOUR, RETIRÉES (24/10, décision de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Après 20261024200000 (fonctions SQL) et get-pending-jobs v278 (14:01:48) : plus AUCUN code ne lit
-- republish_plafond_jour, _premium, _pro, _business. Elles sortent de coin_config (journalisé dans
-- coin_config_journal), pour que personne ne les croie actives. La pause (republish_pause_apres = 50,
-- republish_pause_duree_min = 120), les quotas du mois, les espacements et le disjoncteur ne bougent pas.
-- Garde : on s'arrête si une fonction de la base lit encore l'une de ces clés.
-- Inverse : supabase/rollbacks/20261024210000_cles_plafond_jour_retirees_INVERSE.sql (valeurs du 24/10).
BEGIN;
DO $garde$
DECLARE v text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND pg_get_functiondef(p.oid) ~ 'republish_plafond_jour';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'encore lu par : % — ON S''ARRÊTE', v; END IF;
END
$garde$;
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, value, NULL, 'migration 20261024210000 (plus de plafond par jour, décision de Nico)'
  FROM public.coin_config
 WHERE key IN ('republish_plafond_jour', 'republish_plafond_jour_premium', 'republish_plafond_jour_pro', 'republish_plafond_jour_business');
DELETE FROM public.coin_config
 WHERE key IN ('republish_plafond_jour', 'republish_plafond_jour_premium', 'republish_plafond_jour_pro', 'republish_plafond_jour_business');
COMMIT;
