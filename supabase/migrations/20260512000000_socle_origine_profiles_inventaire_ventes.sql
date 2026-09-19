-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE D'ORIGINE — les trois tables que le dépôt n'a JAMAIS créées
-- (rapatriées le 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : de nulle part, et c'est exactement le problème. `profiles`,
-- `inventaire` et `ventes` existent en prod depuis l'origine du projet, créées
-- AVANT que les migrations existent (tableur Supabase). Le dépôt les mentionne
-- des centaines de fois — ALTER, policies, index, RPC, clés étrangères — et ne
-- les CRÉE jamais.
-- DATE DE POSE EN PROD : inconnue, antérieure à la première migration
-- enregistrée (20260511000000). Le numéro n'est donc pas une date, c'est une
-- contrainte d'ordre de rejeu — et il a dû être choisi finement :
--   · APRÈS 20260511000000, la BASELINE de l'historique (la plus ancienne
--     version présente dans supabase_migrations.schema_migrations). Constaté
--     le 19/09 : un fichier numéroté AVANT cette baseline n'est pas seulement
--     rejoué en retard, il est purement IGNORÉ par le moteur de rejeu des
--     branches Supabase — il n'apparaît même pas dans le schema_migrations de
--     la branche. Le socle portait d'abord 20260510000000 et n'a jamais été
--     tenté, sur trois branches de suite.
--   · AVANT 20260514000000_founder_plan, son premier consommateur
--     (« ALTER TABLE profiles ADD COLUMN is_founder »).
-- 20260512000000 est le seul créneau libre qui satisfait les deux.
--
-- CE QUE ÇA CASSAIT, MESURÉ ET PAS SUPPOSÉ. Une branche Supabase vierge montée
-- le 19/09 sur le dépôt a rejoué DEUX migrations sur 199 avant de tomber :
--     20260511000000_lens_temp_bucket ......... ok
--     20260513000000_usage_logs_and_quota ..... ok
--     20260514000000_founder_plan ............. ÉCHEC
--         ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder …
--         → la table profiles n'existe pas.
-- Statut de la branche : MIGRATIONS_FAILED. Un `db reset` ne reconstruisait
-- donc RIEN depuis le début du projet, et personne ne pouvait le savoir sans
-- essayer.
--
-- STRUCTURE RELEVÉE SUR LA PROD DU 19/09/2026, générée depuis
-- information_schema.columns + pg_attribute + pg_constraint — pas reconstituée
-- de mémoire, pas retapée à la main.
--
-- ⛔ CE FICHIER NE CRÉE QUE LES TABLES, leurs clés primaires et leurs clés
-- étrangères. Les colonnes ajoutées après coup, les policies, les index et les
-- grants vivent DÉJÀ dans leurs migrations respectives : `IF NOT EXISTS`
-- partout rend ce fichier inerte sur une base qui les a, et rend les ALTER
-- ultérieurs inertes sur une base vierge. Le résultat est le même dans les
-- deux sens. Rejoué sur la prod actuelle, il ne change rien — vérifié.
--
-- ⚠️ DÉFAUTS SIGNALÉS, NON CORRIGÉS (consigne du lot) :
--  · `ventes` porte des GRANTs CRUD complets à `anon`, relevés tels quels en
--    prod (information_schema.role_table_grants). Sur une table en RLS sans
--    policy visant `anon`, ça ne donne rien — mais ça n'a aucune raison
--    d'être et mérite un REVOKE dans un lot dédié.
--  · `inventaire.id` est un `bigint NOT NULL` SANS séquence ni identité :
--    c'est l'application qui fabrique l'id (horodatage en millisecondes).
--    Recopié tel quel.

-- ── profiles ────────────────────────────────────────────────────────────────
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

-- ── inventaire ──────────────────────────────────────────────────────────────
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

-- ── ventes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventes (
  id                 bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  titre              text,
  prix_achat         numeric,
  prix_vente         numeric,
  benefice           numeric,
  date               date,
  user_id            uuid,
  marque             text,
  type               text,
  description        text,
  emplacement        text,
  plateforme         text,
  quantite           integer,
  inventaire_id      bigint,
  statut             text,
  selling_fees       numeric,
  plateforme_code    text,
  plateforme_origine text,
  vendu_le           timestamptz,
  commande_ref       text,
  source             text,
  releve_le          timestamptz,
  devise             text,
  frais_plateforme   numeric
);

ALTER TABLE public.ventes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.ventes TO service_role;
