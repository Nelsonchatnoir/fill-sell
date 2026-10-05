-- ═══════════════════════════════════════════════════════════════════════════
-- eBay ORDER_CONFIRMATION — les abonnements (05/10, GO Nico, point 14)
-- ═══════════════════════════════════════════════════════════════════════════
-- Un abonnement par compte eBay relié (Notification API, sujet
-- ORDER_CONFIRMATION, destination unique = la fonction ebay-notifications).
-- Écrit et lu par ebay-notifications (clé de service) seulement : RLS sans
-- politique, rien pour anon/authenticated — même régime que
-- ebay_notification_verdicts (porte des identifiants eBay).
-- Inverse : DROP TABLE public.ebay_abonnements_ventes;
CREATE TABLE IF NOT EXISTS public.ebay_abonnements_ventes (
  user_id uuid PRIMARY KEY,
  ebay_user_id text,
  subscription_id text,
  destination_id text,
  statut text NOT NULL DEFAULT 'a_creer' CHECK (statut IN ('a_creer', 'actif', 'refuse')),
  erreur text,
  essais integer NOT NULL DEFAULT 0,
  cree_le timestamptz NOT NULL DEFAULT now(),
  maj_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ebay_abonnements_ventes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ebay_abonnements_ventes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ebay_abonnements_ventes TO service_role;
