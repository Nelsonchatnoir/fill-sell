-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — LOT 1.2 : L'ÉCHEC D'ÉTIQUETTE SE DIT SUR TOUTES LES PLATEFORMES
-- ═══════════════════════════════════════════════════════════════════════════
-- bordereaux_generations_closes (migration 20261018100000) ne fermait que Vinted
-- (envoi 210). L'extension 0.6.126 dit aussi « indisponible » quand Leboncoin
-- signale l'échec de son étiquette (événement d'échec du colis) : la génération
-- se ferme de la même façon, motif etiquette_echouee_chez_<plateforme>. Réécrite
-- depuis son texte de PROD (pg_get_functiondef, 18/10 vers 12:35) ; seule la
-- condition de plateforme et le motif changent.
-- Inverse : supabase/rollbacks/20261018130000_bordereaux_echec_toutes_plateformes.sql
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018130000_bordereaux_echec_toutes_plateformes.sql
--   npx supabase migration repair --linked --status applied 20261018130000
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
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
  -- La plateforme a dit « étiquette échouée » (Vinted : envoi 210 ; Leboncoin :
  -- échec du colis — 'indisponible') : un ÉCHEC, jamais « générée, récupération du fichier… ».
  UPDATE bordereaux_demandes d
     SET statut = 'echec', motif = 'etiquette_echouee_chez_' || pc.platform, fini_le = now()
    FROM plateforme_commandes pc
   WHERE d.user_id = p_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND pc.id = d.commande_id AND pc.user_id = d.user_id
     AND pc.bordereau = 'indisponible';
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
$function$;
COMMIT;
