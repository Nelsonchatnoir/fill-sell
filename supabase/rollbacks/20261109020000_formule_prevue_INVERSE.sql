-- INVERSE de supabase/migrations/20261109020000_formule_prevue.sql (C4, 09/11/2026).
-- ⛔ APRÈS le retour des fonctions qui écrivent ces colonnes (changer-formule, stripe-webhook) à une version qui ne les
-- écrit plus — sinon leurs écritures échouent (journalisées, jamais bloquantes pour les droits).
-- Perd les descentes prévues ENREGISTRÉES (pas celles de Stripe : elles vivent dans ses schedules).
SET lock_timeout = '5s';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_formule_prevue_valeurs;
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS formule_prevue,
  DROP COLUMN IF EXISTS formule_prevue_le,
  DROP COLUMN IF EXISTS formule_prevue_canal;
