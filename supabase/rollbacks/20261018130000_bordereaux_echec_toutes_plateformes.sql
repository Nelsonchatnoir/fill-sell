-- Inverse de supabase/migrations/20261018130000_bordereaux_echec_toutes_plateformes.sql : le texte de prod d'avant (Vinted seul).
-- Application : npx supabase db query --linked -f supabase/rollbacks/20261018130000_bordereaux_echec_toutes_plateformes.sql
--   npx supabase migration repair --linked --status reverted 20261018130000
BEGIN;
CREATE OR REPLACE FUNCTION public.bordereaux_generations_closes(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a integer := 0;
  v_b integer := 0;
BEGIN
  IF p_user IS NULL THEN RETURN 0; END IF;
  -- Vinted a dit « étiquette échouée » (envoi 210 → 'indisponible') : un ÉCHEC,
  -- jamais « générée, récupération du fichier… ».
  UPDATE bordereaux_demandes d
     SET statut = 'echec', motif = 'etiquette_echouee_chez_vinted', fini_le = now()
    FROM plateforme_commandes pc
   WHERE d.user_id = p_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND pc.id = d.commande_id AND pc.user_id = d.user_id
     AND pc.platform = 'vinted' AND pc.bordereau = 'indisponible';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  -- Commande annulée chez la plateforme : la génération s'arrête.
  UPDATE bordereaux_demandes d
     SET statut = 'echec', motif = 'commande_annulee', fini_le = now()
    FROM plateforme_commandes pc
   WHERE d.user_id = p_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND pc.id = d.commande_id AND pc.user_id = d.user_id AND pc.etat = 'annulee';
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END;
$function$
;

COMMIT;
