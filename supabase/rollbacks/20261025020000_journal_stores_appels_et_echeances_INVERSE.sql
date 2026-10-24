-- INVERSE de 20261025020000_journal_stores_appels_et_echeances.sql — la migration est APPLIQUÉE (25/10 01:32), cet inverse NE l'est PAS.
-- ⚠ Les fonctions edge déployées avec la migration doivent d'abord revenir à leur version d'avant (sinon le repli
--   « forme du 12/10 » de journaliserNotificationStore prend le relais : aucune ligne perdue, compléments dans detail).
-- Les lignes « illisible » (connu NULL) sont gardées : connu passe à false pour elles, avec la trace dans detail.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.stores_notifications_journal
   SET connu = false,
       detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('connu_avant_inverse', 'null')
 WHERE connu IS NULL;
ALTER TABLE public.stores_notifications_journal ALTER COLUMN connu SET NOT NULL;

DROP INDEX IF EXISTS public.stores_notifications_journal_appel;
DROP INDEX IF EXISTS public.stores_notifications_journal_message;
DROP INDEX IF EXISTS public.stores_notifications_journal_jeton;

ALTER TABLE public.stores_notifications_journal
  DROP COLUMN IF EXISTS appel_id, DROP COLUMN IF EXISTS message_id, DROP COLUMN IF EXISTS publie_le,
  DROP COLUMN IF EXISTS evenement_le, DROP COLUMN IF EXISTS abonnement_pubsub, DROP COLUMN IF EXISTS package_name,
  DROP COLUMN IF EXISTS type_store, DROP COLUMN IF EXISTS jeton_empreinte, DROP COLUMN IF EXISTS test,
  DROP COLUMN IF EXISTS verification, DROP COLUMN IF EXISTS motif, DROP COLUMN IF EXISTS http_status,
  DROP COLUMN IF EXISTS termine_le, DROP COLUMN IF EXISTS fin_periode, DROP COLUMN IF EXISTS renouvellement_auto,
  DROP COLUMN IF EXISTS etat_store, DROP COLUMN IF EXISTS environnement;

-- Droits d'avant (relus le 25/10 00:09) : anon et authenticated avaient TOUT (RLS sans politique). Remis à
-- l'identique pour un inverse exact — à ne rejouer qu'en connaissance de cause.
GRANT ALL ON TABLE public.stores_notifications_journal TO anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.stores_notifications_journal_id_seq TO anon, authenticated;

COMMIT;
