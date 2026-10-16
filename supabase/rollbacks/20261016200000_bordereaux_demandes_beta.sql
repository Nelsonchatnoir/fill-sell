-- INVERSE de 20261016200000_bordereaux_demandes_beta.sql (bordereau au clic, bêta 16/10 soir).
-- Ferme la dernière marche, retire les demandes et leurs fonctions, rend la purge d'avant
-- (définition prod du 16/10, avant cette migration). Les copies déjà déposées restent
-- gérées par bordereaux_copies + bordereaux-purge (5 jours au plus).
BEGIN;

UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'bordereaux_ouverts';

DROP FUNCTION IF EXISTS public.bordereau_demander(uuid);
DROP FUNCTION IF EXISTS public.bordereau_demande_a_traiter(uuid);
DROP FUNCTION IF EXISTS public.bordereau_demande_resultat(uuid, boolean, text, uuid, uuid);
DROP TABLE IF EXISTS public.bordereaux_demandes;

CREATE OR REPLACE FUNCTION public.messagerie_purger(p_limite integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m int; v_r int; v_c int; v_cmd int;
BEGIN
  DELETE FROM messagerie_messages WHERE id IN (
    SELECT id FROM messagerie_messages WHERE envoye_le < now() - interval '30 days' LIMIT p_limite);
  GET DIAGNOSTICS v_m = ROW_COUNT;
  DELETE FROM messagerie_reponses WHERE id IN (
    SELECT id FROM messagerie_reponses WHERE cree_le < now() - interval '30 days' LIMIT p_limite);
  GET DIAGNOSTICS v_r = ROW_COUNT;
  DELETE FROM messagerie_conversations WHERE id IN (
    SELECT id FROM messagerie_conversations
     WHERE coalesce(dernier_message_le, cree_le) < now() - interval '30 days' LIMIT p_limite);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  DELETE FROM plateforme_commandes WHERE id IN (
    SELECT id FROM plateforme_commandes
     WHERE etat IN ('livree','terminee','annulee') AND maj_le < now() - interval '30 days' LIMIT p_limite);
  GET DIAGNOSTICS v_cmd = ROW_COUNT;
  RETURN jsonb_build_object('messages', v_m, 'reponses', v_r, 'conversations', v_c, 'commandes', v_cmd);
END;
$function$;
REVOKE ALL ON FUNCTION public.messagerie_purger(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messagerie_purger(integer) TO service_role;

COMMIT;
