-- INVERSE de 20261008233100_ventes_prouvees_automatiques.sql (et de l'index 20261008233000).
-- Retire l'appelant, la veille et leurs tables. NE défait PAS les ventes déjà
-- enregistrées par le cron : elles sont des ventes ordinaires (reçu
-- ventes_operations, retraits armés par la chaîne existante) ; pour en
-- retrouver une, `ventes_prouvees_passages.detail` (job, ventes_ids) AVANT de
-- lancer cet inverse. Un retrait de copie déjà exécuté sur une plateforme est
-- irréversible.
-- Couper sans rien retirer : UPDATE coin_config SET value = 0 WHERE key = 'ventes_prouvees_auto_depuis';
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ventes-prouvees-2min') THEN
    PERFORM cron.unschedule('ventes-prouvees-2min');
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.ventes_prouvees_veille(integer);
DROP FUNCTION IF EXISTS public.ventes_prouvees_tick(integer, integer);
DROP FUNCTION IF EXISTS public.enregistrer_vente_prouvee(uuid);
DROP FUNCTION IF EXISTS public.ventes_prouvees_a_enregistrer(timestamptz, integer, uuid, uuid, boolean);
DROP TABLE IF EXISTS public.ventes_prouvees_alertes;
DROP TABLE IF EXISTS public.ventes_prouvees_refus;
DROP TABLE IF EXISTS public.ventes_prouvees_passages;
WITH del AS (DELETE FROM public.coin_config WHERE key = 'ventes_prouvees_auto_depuis' RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, value, NULL, 'inverse 20261008233100' FROM del;
COMMIT;
-- Puis, SEUL (hors transaction) :
-- DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_signal_vendu_idx;
