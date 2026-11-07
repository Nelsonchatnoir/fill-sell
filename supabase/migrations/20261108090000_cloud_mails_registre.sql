-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LE REGISTRE DES MAILS D'ÉVÉNEMENT (08/11/2026, ordre de Nico : « un seul mail par événement »)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Essai jetable : scripts/cloud/preuve-resiliation-mails.mjs
-- (Postgres embarqué, jamais la prod). Jour J, étape 1 (docs/reprise/JOUR-OUVERTURE-CLOUD.md) : AVANT les fonctions.
--
-- Les mails Cloud (début d'essai, paiement, arrêt pendant l'essai, arrêt programmé, impayé Apple / Google) partent
-- des webhooks des boutiques et de cancel-subscription (_shared/cloud-mails.js, cloud-mails-envoi.ts). Une boutique
-- REJOUE ses notifications (Apple, Google : tant qu'elle n'a pas reçu 200 ; Stripe : idem), et deux chemins peuvent dire
-- le même événement (cancel-subscription ET customer.subscription.updated). La clé (user_id, evenement, cle) est
-- RÉSERVÉE par un INSERT avant l'envoi : le second INSERT échoue (23505) → aucun second mail. L'envoi raté libère la clé
-- (renvoyable au prochain rejeu).
--   cle : l'abonnement (Stripe sub_…, Apple originalTransactionId, Google purchaseToken), suivi pour un paiement de la
--         facture / transaction / commande, pour un arrêt programmé de la date de fin, pour un impayé de la période.
-- RLS activée, AUCUNE politique, rien pour anon / authenticated : service_role seulement (les fonctions edge).
-- Aucune donnée personnelle hors user_id (pas d'adresse) ; le compte supprimé emporte ses lignes (ON DELETE CASCADE).
-- Coût : un INSERT par événement de paiement Cloud (quelques-uns par client et par mois).
-- INVERSE : supabase/rollbacks/20261108090000_cloud_mails_registre_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cloud_mails (
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  evenement  text        NOT NULL CHECK (evenement IN ('essai_debut', 'paiement', 'arret_essai', 'arret_programme', 'impaye')),
  cle        text        NOT NULL CHECK (length(cle) BETWEEN 1 AND 400),
  canal      text        CHECK (canal IS NULL OR canal IN ('stripe', 'apple', 'google', 'inconnu')),
  pris_le    timestamptz NOT NULL DEFAULT now(),
  envoye_le  timestamptz,
  detail     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, evenement, cle)
);

COMMENT ON TABLE public.cloud_mails IS
  'FillSell Cloud : une ligne par mail d''événement de paiement (clé réservée avant l''envoi : un seul mail par événement, même rejoué). Service role seulement. Migration 20261108090000.';

-- droits : serveur seulement — cloud_mails (aucun droit anon / authenticated ; les fonctions edge passent par service_role).
ALTER TABLE public.cloud_mails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_mails FROM PUBLIC;
REVOKE ALL ON public.cloud_mails FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_mails TO service_role;
