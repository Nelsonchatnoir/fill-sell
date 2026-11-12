-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- profiles.cloud_formule — LA FORMULE AVEC CLOUD D'UN COMPTE (12/11/2026, offres Cloud, validé par Nico : « je valide tout »)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 'premium_cloud' | 'pro_cloud' | 'business_cloud' | NULL. Posée par les flux de paiement des trois canaux quand une
-- formule avec Cloud est active ou en essai (stripe-webhook, create-checkout-session, apple-iap-webhook,
-- validate-apple-receipt, google-play-webhook, validate-google-purchase), remise à NULL quand elle tombe ou que son
-- Cloud est retiré (cancel-subscription, webhooks). L'app la LIT seulement (« Ta formule : Pro + Cloud ») et fait
-- « sans formule » si elle manque. Les droits ne la lisent PAS : palier = drapeaux (palier_de), Cloud = colonnes Cloud
-- (cloud_etat) — elle ne fait que nommer.
-- Droits : ceux des autres colonnes Cloud du profil, sans rien poser — SELECT au niveau de la table pour authenticated
-- (RLS « select own profile » : sa ligne seulement) ; AUCUN UPDATE pour authenticated (ses UPDATE sont par colonne, 13
-- colonnes nommées, celle-ci n'en est pas) : écriture serveur seulement (service_role).
-- Rejouable (IF NOT EXISTS). Inverse : supabase/rollbacks/20261112000000_profiles_cloud_formule_INVERSE.sql.
-- Essayée sur une base JETABLE : scripts/essais/20261112000000_banc.mjs.
-- (12/11/2026) Verrou court : si une transaction tient profiles, l'ALTER échoue en 5 s au lieu de bloquer la file.
SET lock_timeout = '5s';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cloud_formule text;
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_cloud_formule_connue') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_cloud_formule_connue
      CHECK (cloud_formule IS NULL OR cloud_formule IN ('premium_cloud', 'pro_cloud', 'business_cloud'));
  END IF;
END $c$;
COMMENT ON COLUMN public.profiles.cloud_formule IS 'Formule avec Cloud active ou en essai (premium_cloud | pro_cloud | business_cloud), posée par les flux de paiement ; NULL = aucune. Lue par l''app, jamais par les droits.';
