-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — trigger `trg_ebay_accounts_updated_at` (rapatrié 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliqué en prod le 05/09/2026 à 21h36 dans la migration
-- 20260905213647 (`ebay_accounts_oauth`). Le dépôt porte bien un fichier de ce
-- numéro — 20260905213647_ebay_accounts_oauth.sql — mais il a été RÉÉCRIT
-- depuis, et le trigger y a disparu : la fonction
-- `ebay_accounts_touch_updated_at` y est, le trigger qui l'appelle n'y est
-- plus. En prod il tourne. Après un reset, `updated_at` ne serait plus jamais
-- mis à jour sur ebay_accounts, en silence.
-- Numéro 20260905213648 (une seconde après) pour ne pas entrer en collision
-- avec le fichier existant, et pour passer juste après lui au rejeu.
-- SQL copié depuis schema_migrations.statements de 20260905213647.
--
-- ⚠️ DÉFAUT SIGNALÉ, NON CORRIGÉ (consigne du lot). Le même fichier du dépôt
-- diverge de la prod sur une colonne : il déclare
--     scopes text[] NOT NULL DEFAULT '{}'
-- alors que la prod porte `scopes text[]` nullable, sans défaut (relevé sur
-- information_schema : is_nullable=YES, column_default=NULL). Un reset
-- produirait donc une table ebay_accounts DIFFÉRENTE de la prod. À trancher
-- dans un lot dédié : soit le dépôt a raison et la prod doit être alignée,
-- soit l'inverse. Je ne touche à aucun des deux ici.
-- ═══════════════════════════════════════════════════════════════════════════

drop trigger if exists trg_ebay_accounts_updated_at on public.ebay_accounts;
create trigger trg_ebay_accounts_updated_at
  before update on public.ebay_accounts
  for each row execute function public.ebay_accounts_touch_updated_at();
