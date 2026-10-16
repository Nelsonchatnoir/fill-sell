-- INVERSE de 20261016170000_messagerie_bordereaux_beta.sql (bêta messages + bordereaux, 16/10/2026).
-- ⚠️ Efface les données de la bêta (conversations, messages, réponses, commandes relevées) : elles ne
--    concernent que les comptes porteurs de beta_flags.messages_bordereaux (Nico) et se relèvent à nouveau.
-- ⚠️ Le bucket `bordereaux` ne se supprime que VIDE : vider d'abord ses fichiers par l'API Storage
--    (fonction edge bordereaux-purge, ou tableau de bord), sinon la dernière instruction échoue seule.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('messagerie-purge-quotidienne', 'bordereaux-purge-horaire', 'ebay-messagerie-20min');

DROP POLICY IF EXISTS bordereaux_select ON storage.objects;
DROP POLICY IF EXISTS bordereaux_insert ON storage.objects;
DROP POLICY IF EXISTS bordereaux_delete ON storage.objects;

DROP FUNCTION IF EXISTS public.bordereau_copie_noter(uuid, text, integer);
DROP FUNCTION IF EXISTS public.bordereaux_a_purger(integer);
DROP FUNCTION IF EXISTS public.messagerie_purger(integer);
DROP FUNCTION IF EXISTS public.messagerie_compteurs();
DROP FUNCTION IF EXISTS public.messagerie_vue(uuid);
DROP FUNCTION IF EXISTS public.messagerie_reponse_resultat(uuid, boolean, jsonb, uuid);
DROP FUNCTION IF EXISTS public.messagerie_reponse_a_envoyer(text[], uuid);
DROP FUNCTION IF EXISTS public.messagerie_repondre(uuid, text, text);
DROP FUNCTION IF EXISTS public.commandes_enregistrer(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.messagerie_enregistrer(text, jsonb, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS public.messagerie_releve_bloque(text, text, uuid);
DROP FUNCTION IF EXISTS public.messagerie_releve_autorise(text, uuid);
DROP FUNCTION IF EXISTS public.messagerie_article_pour_annonce(uuid, text, text);

DROP TABLE IF EXISTS public.bordereaux_copies;
DROP TABLE IF EXISTS public.messagerie_reponses;
DROP TABLE IF EXISTS public.messagerie_messages;
DROP TABLE IF EXISTS public.messagerie_liste_blanche;
DROP TABLE IF EXISTS public.messagerie_releves;
DROP TABLE IF EXISTS public.messagerie_conversations;
DROP TABLE IF EXISTS public.plateforme_commandes;

DROP FUNCTION IF EXISTS public.messagerie_beta(uuid);

DELETE FROM storage.buckets WHERE id = 'bordereaux';
