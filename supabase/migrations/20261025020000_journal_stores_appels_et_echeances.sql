-- ═══════════════════════════════════════════════════════════════════════════
-- REVENUS (25/10, point 4 de Nico) : CHAQUE APPEL DE STORE JOURNALISÉ, L'ÉCHÉANCE À CHAQUE NOTIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE le 25/10 à 01:32:26 (Paris) — mission de nuit de Nico (essai à blanc + selftests + preuve) : essai
-- 9/9 (scripts/essais/20261025020000_essai.sql), preuve relue (30 colonnes, connu NULL accepté, droits postgres +
-- service_role seuls, 15 lignes inchangées). Version relue unique avant application.
-- Constats en prod (lecture seule, 25/10 00:09 Paris) :
--   · stores_notifications_journal : 15 lignes Apple (11/10 21:43 → 24/10 20:14), 0 ligne Google. Journaux des
--     fonctions : 0 appel de Google à google-play-webhook du 05/10 03:26 au 25/10 00:30 (le dernier : v27, avant
--     le journal). Et la ligne Google n'était écrite qu'APRÈS décodage : un appel sans `message.data` (200) ou
--     illisible (500) ne laissait aucune trace ; ni messageId, ni publishTime, ni jeton, ni issue.
--   · 8 des 11 abonnés Apple actifs sans subscription_period_end : seule la résiliation l'écrivait.
-- Ce que fait cette migration (additive, idempotente, aucune ligne réécrite) :
--   1. stores_notifications_journal reçoit les colonnes d'UN APPEL : appel_id (la ligne complétée à la sortie),
--      message_id (Pub/Sub messageId | Apple notificationUUID), publie_le, evenement_le, abonnement_pubsub,
--      package_name, type_store (type Google brut), jeton_empreinte (sha256 hex du purchaseToken — jamais le
--      jeton), test, verification (oidc_ok | oidc_absent | oidc_refuse:<raison> | jws_ok | jws_refuse | jws_absent),
--      motif (traite | ignore:<raison> | rejet:<…> | erreur:<…>), http_status, termine_le, et l'échéance typée :
--      fin_periode (Apple expiresDate | Google expiryTime), renouvellement_auto, etat_store, environnement ;
--   2. connu devient NULLABLE : NULL = appel refusé ou illisible AVANT toute décision (ni connu, ni « inconnu à
--      décider » : l'index des inconnues ne le voit pas, aucune alerte) ;
--   3. droits du régime du 30/10 : table SERVEUR SEULEMENT — anon et authenticated perdent les droits d'office
--      qu'ils avaient (relus le 25/10 : ALL + TRUNCATE, séquence USAGE/SELECT/UPDATE ; la RLS sans politique les
--      bloquait déjà pour les lignes, pas pour TRUNCATE ni la séquence). Personne d'autre ne la lit (relu : app,
--      extension, ops-digest — aucun) ; service_role (les deux webhooks) garde lecture / écriture.
-- Inverse : 20261025020000_journal_stores_appels_et_echeances_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Les colonnes d'un appel ────────────────────────────────────────────────
ALTER TABLE public.stores_notifications_journal
  ADD COLUMN IF NOT EXISTS appel_id            uuid,
  ADD COLUMN IF NOT EXISTS message_id          text,
  ADD COLUMN IF NOT EXISTS publie_le           timestamptz,
  ADD COLUMN IF NOT EXISTS evenement_le        timestamptz,
  ADD COLUMN IF NOT EXISTS abonnement_pubsub   text,
  ADD COLUMN IF NOT EXISTS package_name        text,
  ADD COLUMN IF NOT EXISTS type_store          integer,
  ADD COLUMN IF NOT EXISTS jeton_empreinte     text,
  ADD COLUMN IF NOT EXISTS test                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification        text,
  ADD COLUMN IF NOT EXISTS motif               text,
  ADD COLUMN IF NOT EXISTS http_status         integer,
  ADD COLUMN IF NOT EXISTS termine_le          timestamptz,
  ADD COLUMN IF NOT EXISTS fin_periode         timestamptz,
  ADD COLUMN IF NOT EXISTS renouvellement_auto boolean,
  ADD COLUMN IF NOT EXISTS etat_store          text,
  ADD COLUMN IF NOT EXISTS environnement       text;

COMMENT ON COLUMN public.stores_notifications_journal.jeton_empreinte IS
  'sha256 hex du purchaseToken Google (jamais le jeton). Rapprochement : encode(sha256(convert_to(profiles.google_purchase_token, ''UTF8'')), ''hex'').';
COMMENT ON COLUMN public.stores_notifications_journal.fin_periode IS
  'Échéance lue chez le store au moment de l''appel : Apple expiresDate (sinon renewalDate), Google lineItems[].expiryTime.';
COMMENT ON COLUMN public.stores_notifications_journal.connu IS
  'true/false = décision de _shared/notifications-stores.js ; NULL = appel refusé ou illisible avant toute décision.';

-- ── 2. connu : NULL = aucune décision lue ─────────────────────────────────────
ALTER TABLE public.stores_notifications_journal ALTER COLUMN connu DROP NOT NULL;

-- ── Index : la ligne d'un appel (complétée à la sortie), un message rejoué, un abonnement Google ─
CREATE INDEX IF NOT EXISTS stores_notifications_journal_appel
  ON public.stores_notifications_journal (appel_id) WHERE appel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stores_notifications_journal_message
  ON public.stores_notifications_journal (canal, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stores_notifications_journal_jeton
  ON public.stores_notifications_journal (jeton_empreinte, recu_le DESC) WHERE jeton_empreinte IS NOT NULL;

-- ── 3. Droits (régime du 30/10) : serveur seulement ───────────────────────────
-- droits : serveur seulement (stores_notifications_journal)
ALTER TABLE public.stores_notifications_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stores_notifications_journal FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.stores_notifications_journal_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stores_notifications_journal TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.stores_notifications_journal_id_seq TO service_role;

COMMIT;

-- Relecture (après application) :
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'stores_notifications_journal' order by ordinal_position;
-- select grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'stores_notifications_journal' group by 1;   -- attendu : postgres, service_role
-- select count(*) from public.stores_notifications_journal;                                    -- inchangé (15 au 25/10 00:09)
