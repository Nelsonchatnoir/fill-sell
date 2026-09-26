-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260919132610 « socle_origine_profiles_inventaire » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  is_premium boolean DEFAULT false,
  stripe_customer_id text,
  created_at timestamp with time zone DEFAULT now(),
  subscription_cancel_at_period_end boolean DEFAULT false,
  subscription_period_end text,
  currency character varying(3) DEFAULT 'EUR'::character varying,
  lens_count_today integer DEFAULT 0,
  lens_count_date date DEFAULT CURRENT_DATE,
  voice_count_today integer DEFAULT 0,
  voice_count_date date DEFAULT CURRENT_DATE,
  stats_analysis_cache jsonb,
  is_founder boolean DEFAULT false,
  username text,
  lang text DEFAULT 'fr'::text,
  apple_original_transaction_id text,
  lens_daily_override integer,
  lens_monthly_override integer,
  google_purchase_token text,
  google_product_id text,
  is_pro boolean DEFAULT false,
  push_token text,
  platform_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  extension_last_seen_at timestamp with time zone,
  extension_build text,
  is_comped boolean DEFAULT false NOT NULL,
  extension_sessions jsonb,
  monthly_grant_override integer,
  extension_version text,
  is_business boolean DEFAULT false NOT NULL,
  onboarded_at timestamp with time zone,
  vinted_sync_pin jsonb,
  extension_session_rejetee_at timestamp with time zone,
  ebay_voie_api boolean DEFAULT false NOT NULL,
  extension_maj_en_attente text,
  extension_maj_vue_at timestamp with time zone,
  acquisition_source text,
  acquisition_medium text,
  acquisition_campaign text,
  acquisition_content text,
  acquisition_fbclid text,
  acquisition_referrer text,
  acquisition_captured_at timestamp with time zone,
  plateformes_visibles text[] DEFAULT '{}'::text[] NOT NULL,
  beta_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventaire (
  id bigint NOT NULL,
  user_id uuid,
  titre text,
  prix_achat numeric,
  prix_vente numeric,
  margin numeric,
  margin_pct numeric,
  statut text,
  date text,
  created_at timestamp with time zone DEFAULT now(),
  marque text,
  description text,
  type text,
  purchase_costs numeric DEFAULT 0,
  selling_fees numeric DEFAULT 0,
  quantite integer DEFAULT 1,
  emplacement text,
  plateforme text,
  photos jsonb,
  vinted_item_id text,
  origine text,
  prix_achat_inconnu boolean DEFAULT false NOT NULL,
  listed_at_guess timestamp with time zone,
  first_seen_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  disparu_le timestamp with time zone,
  vinted_view_count integer,
  vinted_favourite_count integer,
  vinted_status text,
  vinted_catalog_id integer,
  vinted_account_id text,
  attributs jsonb DEFAULT '{}'::jsonb NOT NULL,
  fusionne_dans bigint,
  fusionne_le timestamp with time zone,
  CONSTRAINT inventaire_pkey PRIMARY KEY (id),
  CONSTRAINT inventaire_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT inventaire_fusionne_dans_fkey FOREIGN KEY (fusionne_dans)
    REFERENCES public.inventaire(id) ON DELETE SET NULL
);

ALTER TABLE public.inventaire ENABLE ROW LEVEL SECURITY;
