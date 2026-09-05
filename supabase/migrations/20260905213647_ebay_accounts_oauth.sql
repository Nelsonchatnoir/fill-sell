-- ═══════════════════════════════════════════════════════════════════════════
-- eBay par API — LOT 0 « Connecter » (05/09/2026)
--
-- Une ligne par utilisateur FillSell ayant relié son compte vendeur eBay par
-- OAuth (authorization code grant, RuName Nicolas_Svobodn-NicolasS-FillSe-myiefmg,
-- callback = Edge Function ebay-oauth-callback). Les jetons y vivent ; RIEN
-- d'autre : aucun mot de passe eBay n'existe dans ce protocole.
--
-- ⛔ GARDE-FOU CRITIQUE : cette table est lisible et modifiable par le
-- service_role SEUL (Edge Functions). Ni `authenticated`, ni `anon`. Un
-- refresh_token vendeur lisible par PostgREST donnerait 18 mois d'accès au
-- compte eBay d'un utilisateur. Donc :
--   · RLS activée, ZÉRO policy (l'état voulu — ne JAMAIS en ajouter) ;
--   · REVOKE explicite des privilèges de table hérités des DEFAULT PRIVILEGES
--     du schéma public (Supabase accorde ALL à anon/authenticated sur toute
--     nouvelle table : la RLS sans policy bloque déjà les lignes, le REVOKE
--     retire aussi le droit de table — double verrou, vérifiable au catalogue).
-- L'app ne lit l'état de connexion que via la fonction ebay-account-status
-- (JWT), qui ne renvoie JAMAIS les jetons.
--
-- revoked_at : le vendeur peut révoquer depuis eBay sans nous prévenir. Un
-- refresh refusé (invalid_grant) stampe revoked_at — état NORMAL, pastille
-- « à reconnecter », jamais une erreur technique. Une reconnexion réussie
-- remet revoked_at à NULL (upsert sur user_id).
--
-- ✅ APPLIQUÉE EN PROD par Nico le 05/09/2026 à 23:36 (Europe/Paris), enregistrée
-- dans supabase_migrations.schema_migrations sous version 20260905213647,
-- name ebay_accounts_oauth — ce fichier a été RENOMMÉ de 20260905210000 vers
-- cette version pour que l'historique local suive le distant (db push reste
-- INTERDIT). Vérifs faites après pose : relrowsecurity=true · 0 policy ·
-- grants = service_role + postgres · 16 colonnes. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ebay_accounts (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ebay_user_id   text,
  refresh_token  text NOT NULL,
  access_token   text,
  expires_at     timestamptz,
  refresh_token_expires_at timestamptz,
  scopes         text[] NOT NULL DEFAULT '{}',
  connected_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_reason text,
  -- Lot 1 : dernier état vendeur relevé par l'Account API (checklist), pour
  -- l'afficher sans rappeler eBay à chaque ouverture et pour la MESURE
  -- (combien de comptes sont bloqués par quel état). Jamais de jeton dedans.
  seller_state   jsonb,
  seller_state_at timestamptz,
  -- Lot 1 : politiques choisies par l'utilisateur (« utiliser une politique
  -- existante » ou créée sur SON action explicite). Lues par les lots suivants.
  fulfillment_policy_id text,
  payment_policy_id     text,
  return_policy_id      text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ebay_accounts IS
  'Comptes eBay reliés par OAuth (lot 0, 05/09/2026). service_role SEUL : RLS sans policy + REVOKE anon/authenticated. Ne jamais ajouter de policy.';
COMMENT ON COLUMN public.ebay_accounts.revoked_at IS
  'Stampé quand eBay refuse le refresh (invalid_grant) : révocation côté vendeur ou refresh expiré. État normal → « à reconnecter ». Remis à NULL à la reconnexion.';
COMMENT ON COLUMN public.ebay_accounts.seller_state IS
  'Dernier relevé Account API (lot 1) : {inscription_vendeur, business_policies, politiques:{livraison,paiement,retours}, ...}. Aucun jeton.';

ALTER TABLE public.ebay_accounts ENABLE ROW LEVEL SECURITY;

-- Double verrou : la RLS sans policy bloque les lignes, le REVOKE retire le
-- droit de table hérité des default privileges. authenticated/anon n'ont
-- AUCUN chemin PostgREST vers cette table.
REVOKE ALL ON TABLE public.ebay_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ebay_accounts TO service_role;

-- updated_at automatique (même mécanique que les autres tables : trigger
-- dédié, pas d'extension moddatetime supposée présente).
CREATE OR REPLACE FUNCTION public.ebay_accounts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ebay_accounts_touch_updated_at ON public.ebay_accounts;
CREATE TRIGGER ebay_accounts_touch_updated_at
  BEFORE UPDATE ON public.ebay_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ebay_accounts_touch_updated_at();

-- ── Vérification attendue après application ────────────────────────────────
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'ebay_accounts';  → true
-- SELECT count(*) FROM pg_policies WHERE tablename = 'ebay_accounts';   → 0
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'ebay_accounts';                                  → service_role (et postgres) seulement
