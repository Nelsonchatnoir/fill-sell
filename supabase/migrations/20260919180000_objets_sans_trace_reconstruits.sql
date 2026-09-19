-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — LES CINQ OBJETS SANS AUCUNE TRACE (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- DATE DE POSE : INCONNUE, pour les cinq.
-- Contrairement aux six autres objets rapatriés ce jour, ceux-ci n'ont NI
-- fichier dans le dépôt, NI ligne dans supabase_migrations.schema_migrations.
-- Ils ont été posés hors `apply_migration` — éditeur SQL du dashboard, psql,
-- ou l'assistant Supabase. Aucun `statements` à copier : leur définition est
-- RELEVÉE sur la prod du 19/09/2026 par pg_get_functiondef(),
-- pg_get_triggerdef(), pg_policies et cron.job. Le corps est reproduit tel
-- que Postgres le rend, sans reformatage. La date, elle, est perdue.
--
-- ⛔ AUCUN DROP dans ce fichier. Chaque objet est créé sous garde d'existence
-- (`IF NOT EXISTS` / `IF NOT FOUND`) ou par CREATE OR REPLACE. Rejouer ce
-- fichier sur la prod actuelle ne doit RIEN changer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1/5 · FONCTION set_profile_currency(text) ───────────────────────────────
-- Relevée par pg_get_functiondef. SECURITY DEFINER, search_path figé à public.
-- CREATE OR REPLACE : idempotent par construction, aucun DROP.
CREATE OR REPLACE FUNCTION public.set_profile_currency(p_currency text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles SET currency = p_currency WHERE id = auth.uid();
END;
$function$;

-- ── 2/5 · TRIGGER cross_post_jobs_republish_maintenance ─────────────────────
-- Relevé par pg_get_triggerdef :
--   CREATE TRIGGER cross_post_jobs_republish_maintenance BEFORE INSERT
--   ON public.cross_post_jobs FOR EACH ROW
--   EXECUTE FUNCTION republish_maintenance_guard()
-- La fonction republish_maintenance_guard(), elle, EST dans le dépôt
-- (20260831174500 puis 20260909153550) — seul le trigger manquait. Après un
-- reset, la garde de maintenance plateforme existait sans jamais se
-- déclencher : les jobs seraient partis pendant une panne annoncée.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'cross_post_jobs_republish_maintenance'
       AND tgrelid = 'public.cross_post_jobs'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER cross_post_jobs_republish_maintenance
      BEFORE INSERT ON public.cross_post_jobs
      FOR EACH ROW EXECUTE FUNCTION public.republish_maintenance_guard();
  END IF;
END $$;

-- ── 3/5 · CRON email-tunnel-job-relaunch-hourly ─────────────────────────────
-- Relevé sur cron.job : schedule '0 * * * *', appel pg_net vers email-tunnel
-- avec le header x-cron-secret (le seul qui fonctionne, cf. CLAUDE.md).
-- 🚨 GARDE D'EXISTENCE OBLIGATOIRE, ET C'EST LA LEÇON DE CLAUDE.md : un
-- `cron.schedule()` rejoué sur une base qui porte déjà le job le PLANIFIE EN
-- DOUBLE. C'est exactement l'accident que le bandeau « ne jamais db push »
-- décrit pour handler-watch-3min. On ne planifie donc que si le nom est
-- absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-tunnel-job-relaunch-hourly') THEN
    PERFORM cron.schedule(
      'email-tunnel-job-relaunch-hourly',
      '0 * * * *',
      $cmd$
  select net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"job_relaunch":true}'::jsonb
  );
  $cmd$
    );
  END IF;
END $$;

-- ── 4/5 · POLICY « select own profile » sur public.profiles ─────────────────
-- Relevée sur pg_policies : SELECT, rôle {public}, USING (auth.uid() = id).
-- ⚠️ Le rôle est bien `public` et non `authenticated` — c'est ce que porte la
-- prod, je le recopie sans le corriger. Sur une table en RLS et avec
-- `auth.uid() = id`, un anonyme (auth.uid() NULL) ne voit rien ; le rôle large
-- reste néanmoins plus permissif que le reste du projet. Signalé, non modifié.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles'
       AND policyname = 'select own profile'
  ) THEN
    CREATE POLICY "select own profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- ── 5/5 · POLICY founder_config_read_public sur public.founder_config ───────
-- Relevée sur pg_policies : SELECT, rôles {anon, authenticated}, USING (true).
-- Lecture publique assumée — la landing affiche le compteur de places
-- fondateur avant toute connexion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'founder_config'
       AND policyname = 'founder_config_read_public'
  ) THEN
    CREATE POLICY founder_config_read_public ON public.founder_config
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
