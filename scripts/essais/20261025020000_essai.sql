-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC de 20261025020000_journal_stores_appels_et_echeances.sql (25/10 nuit)
-- ═══════════════════════════════════════════════════════════════════════════
-- Corps de la migration À L'IDENTIQUE (sans BEGIN/COMMIT), puis les contrôles ; la dernière instruction lève une
-- exception qui porte le bilan : tout est annulé. Attendu : « ESSAI À BLANC TERMINÉ — tout est annulé. 0 échec(s) ».
-- Généré depuis la migration (scripts/essais : ne pas modifier le corps à la main).
--   npx supabase db query --linked -f scripts/essais/20261025020000_essai.sql
BEGIN;
CREATE TEMP TABLE essai_avant ON COMMIT DROP AS SELECT count(*)::bigint AS n FROM public.stores_notifications_journal;
-- ════ Corps de la migration (identique) ════
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


-- ════ Contrôles ════
CREATE TEMP TABLE essai_resultats (le serial, controle text, ok boolean, detail text) ON COMMIT DROP;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'les 17 colonnes d''un appel existent', count(*) = 17, string_agg(column_name, ',')
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stores_notifications_journal'
   AND column_name IN ('appel_id','message_id','publie_le','evenement_le','abonnement_pubsub','package_name','type_store',
     'jeton_empreinte','test','verification','motif','http_status','termine_le','fin_periode','renouvellement_auto','etat_store','environnement');
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'connu accepte NULL', is_nullable = 'YES', is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'stores_notifications_journal' AND column_name = 'connu';
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'les 3 index', count(*) = 3, string_agg(indexname, ',') FROM pg_indexes
 WHERE schemaname = 'public' AND indexname IN ('stores_notifications_journal_appel','stores_notifications_journal_message','stores_notifications_journal_jeton');
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'anon et authenticated : aucun droit (table, séquence)',
  NOT has_table_privilege('anon', 'public.stores_notifications_journal', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.stores_notifications_journal', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_sequence_privilege('anon', 'public.stores_notifications_journal_id_seq', 'USAGE,SELECT,UPDATE')
  AND NOT has_sequence_privilege('authenticated', 'public.stores_notifications_journal_id_seq', 'USAGE,SELECT,UPDATE'), NULL;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'service_role : lecture, écriture, séquence',
  has_table_privilege('service_role', 'public.stores_notifications_journal', 'SELECT')
  AND has_table_privilege('service_role', 'public.stores_notifications_journal', 'INSERT')
  AND has_table_privilege('service_role', 'public.stores_notifications_journal', 'UPDATE')
  AND has_sequence_privilege('service_role', 'public.stores_notifications_journal_id_seq', 'USAGE'), NULL;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RLS active', relrowsecurity, NULL FROM pg_class WHERE oid = 'public.stores_notifications_journal'::regclass;
-- Une ligne dans la forme du 12/10 (webhook déployé avant la migration) passe toujours.
INSERT INTO public.stores_notifications_journal (canal, type, effet, connu, effet_applique, detail)
VALUES ('google', 'ESSAI_1210', 'aucun', false, false, '{"essai": true}'::jsonb);
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'forme du 12/10 : écrite, test = false par défaut', count(*) = 1 AND bool_and(NOT test), NULL
  FROM public.stores_notifications_journal WHERE type = 'ESSAI_1210';
-- Un appel illisible : connu NULL, puis complété à la sortie par appel_id.
INSERT INTO public.stores_notifications_journal (canal, type, effet, connu, effet_applique, appel_id, message_id, verification, motif)
VALUES ('google', '(illisible)', 'aucun', NULL, false, '00000000-0000-4000-8000-000000002510', 'essai-msg', 'oidc_absent', 'rejet:sans_donnees');
UPDATE public.stores_notifications_journal SET http_status = 200, termine_le = now(), fin_periode = now() + interval '30 days'
 WHERE appel_id = '00000000-0000-4000-8000-000000002510';
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'appel illisible : connu NULL accepté, complété par appel_id',
  count(*) = 1 AND bool_and(connu IS NULL AND http_status = 200 AND termine_le IS NOT NULL AND fin_periode IS NOT NULL), NULL
  FROM public.stores_notifications_journal WHERE appel_id = '00000000-0000-4000-8000-000000002510';
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'lignes existantes inchangées (hors les 2 d''essai)', count(*) FILTER (WHERE type NOT IN ('ESSAI_1210', '(illisible)') OR type IS NULL) = (SELECT n FROM essai_avant), count(*)::text
  FROM public.stores_notifications_journal;
DO $$
DECLARE v_bilan text; v_echecs integer;
BEGIN
  SELECT string_agg(format('%s %s%s', CASE WHEN ok THEN 'OK' ELSE 'KO' END, controle,
                    CASE WHEN ok OR detail IS NULL THEN '' ELSE ' [' || left(detail, 300) || ']' END), chr(10) ORDER BY le),
         count(*) FILTER (WHERE NOT ok)
    INTO v_bilan, v_echecs FROM essai_resultats;
  RAISE EXCEPTION 'ESSAI À BLANC TERMINÉ — tout est annulé. % échec(s) sur % contrôles :%', v_echecs,
    (SELECT count(*) FROM essai_resultats), chr(10) || v_bilan;
END $$;
ROLLBACK;
