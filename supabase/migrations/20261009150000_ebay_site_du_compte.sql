-- ═══════════════════════════════════════════════════════════════════════════
-- 20261009150000 — LE SITE eBAY DU COMPTE RELIÉ (09/10, Marta — chantier B)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle de Nico : un compte eBay étranger n'est JAMAIS publié sur ebay.fr.
-- Le site d'inscription (Trading GetUser <Site> : « France », « Italy »…) est
-- noté ici par ebay-oauth-callback à la connexion, ou à la première
-- publication / au premier réglage (_shared/ebay-site.ts), puis lu par
-- ebay-api-worker et ebay-account. Deux colonnes, aucune donnée écrite ici.
ALTER TABLE public.ebay_accounts ADD COLUMN IF NOT EXISTS ebay_site text;
ALTER TABLE public.ebay_accounts ADD COLUMN IF NOT EXISTS ebay_site_lu_le timestamptz;
COMMENT ON COLUMN public.ebay_accounts.ebay_site IS
  'Site eBay d''inscription du compte (Trading GetUser <Site>). Autre que France = jamais publié sur ebay.fr (règle du 09/10).';
