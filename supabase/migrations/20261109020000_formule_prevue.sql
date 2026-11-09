-- ═══════════════════════════════════════════════════════════════════════════
-- C4 — LA FORMULE PRÉVUE À LA FIN DE LA PÉRIODE (09/11/2026 nuit, point C4 de Nico : « voir les autres formules et
-- pouvoir descendre »). ⛔ PRÉPARÉE, NON APPLIQUÉE : C4 n'est pas en service (docs/enquetes/c4-descente-0911/RAPPORT.md).
--
-- profiles.formule_prevue       text NULL  — 'premium' | 'pro' : la formule qui REMPLACERA l'actuelle à la fin de la
--                                            période payée (une descente programmée). NULL = rien de prévu.
-- profiles.formule_prevue_le    timestamptz NULL — l'instant du changement (= fin de la période payée en cours).
-- profiles.formule_prevue_canal text NULL  — 'stripe' | 'apple' | 'google' : qui l'applique (et où l'annuler).
-- Écrites par les fonctions de paiement seulement (service_role) : changer-formule, stripe-webhook (lues chez Stripe :
-- _shared/descente-formule.js descentePrevue) ; Apple / Google plus tard. Jamais par le client (REVOKE). Lisibles par
-- le client (SELECT de profiles) : l'écran dit « Ta formule passera à Premium le 9 décembre · Annuler ».
-- Les droits (is_premium / is_pro / is_business) n'en dépendent JAMAIS : ils suivent ce que le canal facture.
--
-- Essai : scripts/essais/20261109020000_banc.mjs (Postgres JETABLE). Inverse :
-- supabase/rollbacks/20261109020000_formule_prevue_INVERSE.sql. Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS formule_prevue text NULL,
  ADD COLUMN IF NOT EXISTS formule_prevue_le timestamptz NULL,
  ADD COLUMN IF NOT EXISTS formule_prevue_canal text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_formule_prevue_valeurs') THEN
    -- NOT VALID : aucune relecture de la table au moment de poser la règle (toutes les lignes sont NULL de toute façon).
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_formule_prevue_valeurs CHECK (
      (formule_prevue IS NULL AND formule_prevue_le IS NULL AND formule_prevue_canal IS NULL)
      OR (formule_prevue IN ('premium', 'pro') AND formule_prevue_le IS NOT NULL AND formule_prevue_canal IN ('stripe', 'apple', 'google'))
    ) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.formule_prevue IS
  'C4 (09/11/2026) : formule qui remplacera l''actuelle à la fin de la période payée (premium | pro), NULL = rien de prévu. Écrite par les fonctions de paiement, jamais par le client. Les droits n''en dépendent jamais.';
COMMENT ON COLUMN public.profiles.formule_prevue_le IS 'C4 (09/11/2026) : instant du changement prévu (fin de la période payée).';
COMMENT ON COLUMN public.profiles.formule_prevue_canal IS 'C4 (09/11/2026) : canal qui applique le changement prévu (stripe | apple | google).';

-- Les GRANT UPDATE de profiles sont PAR COLONNE en prod (relu le 09/11 : pas d'UPDATE de table pour authenticated) :
-- ces colonnes n'y sont pas ; REVOKE redit par prudence. (L'INSERT de table, lui, sert à la création du profil : un
-- REVOKE par colonne n'y peut rien — colonnes d'affichage seulement, la règle CHECK tient.)
REVOKE UPDATE (formule_prevue, formule_prevue_le, formule_prevue_canal) ON public.profiles FROM anon, authenticated;
