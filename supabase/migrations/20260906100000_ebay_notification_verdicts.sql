-- ═══════════════════════════════════════════════════════════════════════════
-- eBay — journal d'exploitation des notifications reçues (06/09/2026)
--
-- POURQUOI : le verdict de signature de ebay-account-deletion (valide /
-- invalide / indéterminée) ne vivait que dans les logs Supabase, que seul le
-- tableau de bord permet de lire. Cette table rend le DERNIER verdict lisible
-- en SQL (db query --linked) — pour Nico comme pour Claude — et garde une
-- trace des défis et des notifications reçues.
--
-- AUCUNE DONNÉE eBay D'UTILISATEUR : ni username, ni userId, ni eiasToken.
-- Seulement le topic, l'identifiant technique de la notification, le
-- verdict et son détail, l'identifiant de clé (kid) et le nombre de lignes
-- ebay_accounts effacées. La règle « données eBay = ebay_accounts seule »
-- reste entière.
--
-- Écriture : service_role (la fonction), best-effort — un insert qui échoue
-- ne change jamais la réponse faite à eBay. Lecture : service_role.
-- RLS activée, ZÉRO policy, REVOKE anon/authenticated (même verrou que
-- ebay_accounts).
--
-- ✅ APPLIQUÉE EN PROD le 06/09/2026 ~10:15 (Europe/Paris) sur GO nominal de Nico,
-- via db query --linked --file (pas de ligne dans schema_migrations : c'est la
-- pratique des poses par CLI ; db push reste INTERDIT). Vérifié après pose :
-- relrowsecurity=true · 0 policy · grants = postgres + service_role · 10 colonnes.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ebay_notification_verdicts (
  id              bigserial PRIMARY KEY,
  received_at     timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL,            -- 'defi' | 'notification'
  topic           text,                     -- MARKETPLACE_ACCOUNT_DELETION, ou autre topic ignoré
  notification_id text,                     -- identifiant technique eBay (pas une donnée utilisateur)
  verdict         text NOT NULL,            -- 'valide' | 'invalide' | 'indeterminee' | 'defi_repondu' | 'ignoree'
  detail          text,
  kid             text,
  effacees        integer NOT NULL DEFAULT 0,
  http_status     integer
);

COMMENT ON TABLE public.ebay_notification_verdicts IS
  'Journal des défis et notifications eBay reçus par ebay-account-deletion : verdict de signature et lignes effacées. Aucune donnée utilisateur eBay. service_role seul.';

ALTER TABLE public.ebay_notification_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ebay_notification_verdicts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ebay_notification_verdicts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ebay_notification_verdicts_id_seq TO service_role;

-- Lecture du dernier verdict :
-- SELECT received_at AT TIME ZONE 'Europe/Paris' AS recu, kind, topic, verdict, detail, kid, effacees, http_status
-- FROM ebay_notification_verdicts ORDER BY received_at DESC LIMIT 5;
