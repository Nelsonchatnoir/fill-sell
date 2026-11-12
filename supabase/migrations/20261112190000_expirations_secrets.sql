-- ═══════════════════════════════════════════════════════════════════════════
-- Les clés et certificats qui expirent — 12/11/2026 (panne « Se connecter avec Apple » du web, 11/11 21:56 → 12/11 18:33)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le secret client « Sign in with Apple » du web (6 mois au plus, Apple) avait expiré sans que rien ne le dise.
-- public.expirations_secrets : chaque clé ou certificat qui expire, avec son échéance. La fonction expirations-secrets
-- (pg_cron `expirations-secrets-jour`, chaque jour à 06:10 UTC = 07:10 Paris l'hiver, x-cron-secret) renouvelle seule le
-- secret Apple (un neuf de 180 jours dès qu'il a plus de 30 jours) et écrit à support@ 30 jours avant toute échéance, et
-- tout de suite si un renouvellement rate. Service role seulement : RLS sans policy, rien pour anon/authenticated.
-- Échéances relevées le 12/11/2026 (portail Apple Developer, RDAP, certificat de l'AAB vc37).
-- Inverse : supabase/rollbacks/20261112190000_expirations_secrets_INVERSE.sql
CREATE TABLE IF NOT EXISTS public.expirations_secrets (
  nom text PRIMARY KEY,
  libelle text NOT NULL,
  categorie text NOT NULL CHECK (categorie IN ('apple', 'google', 'stripe', 'domaine', 'autre')),
  expire_le timestamptz,
  renouvellement text NOT NULL CHECK (renouvellement IN ('automatique', 'manuel')),
  source text,
  dernier_renouvellement timestamptz,
  dernier_echec text,
  echec_le timestamptz,
  alerte_envoyee_le timestamptz,
  detail jsonb,
  mis_a_jour timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expirations_secrets ENABLE ROW LEVEL SECURITY;
-- droits : serveur seulement sur expirations_secrets (la fonction expirations-secrets, en service role ; jamais l'app ni un client)
REVOKE ALL ON public.expirations_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expirations_secrets TO service_role;

INSERT INTO public.expirations_secrets (nom, libelle, categorie, expire_le, renouvellement, source, dernier_renouvellement, detail) VALUES
  ('apple_siwa_secret_web', 'Secret client « Se connecter avec Apple » du web (Supabase, Services ID app.fillsell.web)', 'apple',
   '2027-05-11 19:33:25+01', 'automatique', 'clé Sign in with Apple TJY379J9P7 (12/11/2026), secret serveur APPLE_SIWA_P8',
   '2026-11-12 18:33:25+01', '{"kid":"TJY379J9P7","client_id":"app.fillsell.web","duree_jours":180}'::jsonb),
  ('apple_adhesion_programme', 'Adhésion Apple Developer Program (renouvellement annuel, 99 €)', 'apple', '2027-04-14 00:00:00+02', 'manuel', 'developer.apple.com › Compte', NULL, NULL),
  ('apple_cert_developpement', 'Certificat Apple Development', 'apple', '2027-04-18 00:00:00+02', 'manuel', 'developer.apple.com › Certificates', NULL, NULL),
  ('apple_cert_distribution_geree', 'Certificat Apple Distribution Managed', 'apple', '2027-04-19 00:00:00+02', 'manuel', 'developer.apple.com › Certificates', NULL, NULL),
  ('apple_cert_distribution_codemagic', 'Certificat Apple Distribution (Codemagic, clé API)', 'apple', '2027-04-20 00:00:00+02', 'manuel', 'developer.apple.com › Certificates', NULL, NULL),
  ('apple_profil_appstore', 'Profil de provisionnement « FillSell AppStore » (iOS App Store)', 'apple', '2027-04-20 00:00:00+02', 'manuel', 'developer.apple.com › Profiles', NULL, NULL),
  ('domaine_fillsell_app', 'Nom de domaine fillsell.app (Namecheap)', 'domaine', '2027-04-04 12:04:53+00', 'manuel', 'RDAP public', NULL, NULL),
  ('android_certificat_cle_envoi', 'Certificat de la clé d''envoi Android (AAB)', 'google', '2053-11-06 12:09:11+01', 'manuel', 'keytool -printcert sur l''AAB vc37', NULL, NULL)
ON CONFLICT (nom) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirations-secrets-jour') THEN
    PERFORM cron.schedule('expirations-secrets-jour', '10 6 * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/expirations-secrets',
        headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
        body    := '{"trigger":"expirations_secrets_cron"}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$);
  END IF;
END $$;
