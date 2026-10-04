-- ═══════════════════════════════════════════════════════════════════════════
-- Veille CPU de la base — 04/10/2026 (incident CPU 99 %, app bloquée)
-- ═══════════════════════════════════════════════════════════════════════════
-- veille-cpu (fonction, verify_jwt = false, x-cron-secret) lit les métriques
-- de l'instance toutes les 2 min, garde un échantillon (3 jours) et prévient
-- Nico au-delà de 70 % pendant 10 min (une fois par heure au plus), puis au
-- retour sous 50 %. L'ops-digest affiche le maximum des 24 dernières heures.
-- Service role seulement : RLS sans policy, rien pour anon/authenticated.
-- Inverse : SELECT cron.unschedule('veille-cpu-2min');
--           DROP TABLE public.veille_cpu_alertes; DROP TABLE public.veille_cpu;
CREATE TABLE IF NOT EXISTS public.veille_cpu (
  le timestamptz PRIMARY KEY DEFAULT now(),
  total numeric NOT NULL,
  inactif numeric NOT NULL,
  pct numeric,
  connexions integer
);
ALTER TABLE public.veille_cpu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.veille_cpu FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.veille_cpu_alertes (
  id bigserial PRIMARY KEY,
  le timestamptz NOT NULL DEFAULT now(),
  nature text NOT NULL CHECK (nature IN ('alerte', 'retabli')),
  pct_min numeric,
  pct_max numeric,
  envoi jsonb
);
ALTER TABLE public.veille_cpu_alertes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.veille_cpu_alertes FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'veille-cpu-2min') THEN
    PERFORM cron.schedule('veille-cpu-2min', '*/2 * * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/veille-cpu',
        headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
        body    := '{"trigger":"veille_cpu_cron"}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$);
  END IF;
END $$;
