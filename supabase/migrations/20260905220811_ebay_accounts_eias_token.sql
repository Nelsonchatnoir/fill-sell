-- ═══════════════════════════════════════════════════════════════════════════
-- eBay par API — identifiant IMMUABLE du vendeur (06/09/2026)
--
-- ebay_accounts.ebay_user_id porte le pseudo (UserID du Trading GetUser), qui
-- peut CHANGER. La notification « Marketplace Account Deletion » d'eBay
-- identifie le vendeur par username, userId et eiasToken ; le Trading GetUser
-- rend l'EIASToken (« identifiant unique de l'utilisateur, inchangé quand le
-- pseudo change »). On le stocke pour que la suppression (fonction
-- ebay-account-deletion) retrouve la ligne même après un changement de pseudo.
--
-- Écriture : ebay-oauth-callback (service_role) à la connexion. Lecture :
-- ebay-account-deletion. Aucune donnée eBay ailleurs que dans cette table.
-- Le callback TOLÈRE l'absence de la colonne (retente sans elle) : déployer
-- le code avant la pose ne casse pas la connexion.
--
-- ✅ APPLIQUÉE EN PROD par Nico le 06/09/2026 (00:08 Europe/Paris), enregistrée dans
-- supabase_migrations.schema_migrations sous version 20260905220811, name
-- ebay_accounts_eias_token — fichier RENOMMÉ de 20260906090000 vers cette version
-- pour que l'historique local suive le distant (db push reste INTERDIT).
-- Vérifié : colonne ebay_eias_token présente (17 colonnes). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ebay_accounts
  ADD COLUMN IF NOT EXISTS ebay_eias_token text;

COMMENT ON COLUMN public.ebay_accounts.ebay_eias_token IS
  'EIASToken eBay (identifiant immuable du vendeur, Trading GetUser). Clé de rapprochement de la notification Marketplace Account Deletion, avec le pseudo en repli.';

-- Vérification attendue : 17 colonnes, dont ebay_eias_token text.
