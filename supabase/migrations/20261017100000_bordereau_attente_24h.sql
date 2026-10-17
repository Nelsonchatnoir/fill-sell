-- ═══════════════════════════════════════════════════════════════════════════
-- BÊTA « À EXPÉDIER » : UNE DEMANDE ATTEND L'ORDINATEUR 24 H (17/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Feu vert de Nico, 17/10 : « feu vert sur la migration 24 h ».
-- Une demande faite depuis le téléphone (récupérer un bordereau, le générer :
-- commander l'étiquette Vinted, confirmer la disponibilité Leboncoin, accepter
-- la commande Beebs) attend désormais l'ordinateur 24 h au lieu de 30 min.
--
-- Réécrite DEPUIS pg_get_functiondef de la prod du 17/10 (bordereau_demande_
-- a_traiter, md5 e08f9b22c6c2b96a96415417909ff430, identique à
-- 20261016220000). UNE seule ligne change : l'expiration des demandes
-- « demandee » (30 minutes → 24 hours). Le reste est mot pour mot la prod :
-- prise « en_cours » sans réponse en 10 min → « echec » (récupérer) ou
-- « incertaine » (générer, jamais refaite) ; suite « fichier » d'une
-- génération faite, 15 essais, 24 h après le geste.
--
-- Garde-fou (inchangé, extension) : juste avant tout geste, l'extension relit
-- l'état de la commande chez la plateforme (decisionGeneration, puis relecture
-- dans le geste lui-même) ; une commande annulée, expédiée ou déjà traitée
-- entre-temps = aucun geste. Une génération reste unique par commande (index).
--
-- Inverse : supabase/rollbacks/20261017100000_bordereau_attente_24h.sql
-- ⛔ Appliquer : db query --linked -f <ce fichier> PUIS migration repair
--    --linked --status applied 20261017100000.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bordereau_demande_a_traiter(p_user uuid DEFAULT NULL::uuid, p_capacites text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_d record;
  v_ouvert integer;
  v_generer boolean := coalesce('generer' = ANY (p_capacites), false);
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'beta'); END IF;

  -- (17/10, feu vert de Nico) Une demande attend l'ordinateur 24 h (30 min avant).
  UPDATE bordereaux_demandes SET statut = 'expiree', motif = 'poste_absent', fini_le = now()
   WHERE user_id = v_user AND statut = 'demandee' AND cree_le < now() - interval '24 hours';
  UPDATE bordereaux_demandes SET statut = 'echec', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND action = 'recuperer' AND pris_le < now() - interval '10 minutes';
  UPDATE bordereaux_demandes SET statut = 'incertaine', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND action = 'generer' AND pris_le < now() - interval '10 minutes';

  SELECT c.value INTO v_ouvert FROM coin_config c WHERE c.key = 'bordereaux_ouverts';
  IF coalesce(v_ouvert, 0) <> 1 THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'ferme'); END IF;
  IF coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    v_generer := false;
  END IF;

  SELECT d.id, d.platform, d.action, d.choix, pc.id AS commande_id, pc.commande_ref, pc.envoi_ref,
         pc.etat_plateforme, pc.transporteur
    INTO v_d
    FROM bordereaux_demandes d
    JOIN plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
   WHERE d.user_id = v_user AND d.statut = 'demandee' AND (d.action = 'recuperer' OR v_generer)
   ORDER BY d.cree_le
   LIMIT 1
   FOR UPDATE OF d SKIP LOCKED;
  IF v_d.id IS NOT NULL THEN
    UPDATE bordereaux_demandes SET statut = 'en_cours', pris_le = now() WHERE id = v_d.id;
    RETURN jsonb_build_object('demande', jsonb_build_object(
      'id', v_d.id, 'platform', v_d.platform, 'action', v_d.action, 'choix', coalesce(v_d.choix, '{}'::jsonb),
      'commande_id', v_d.commande_id, 'commande_ref', v_d.commande_ref, 'envoi_ref', v_d.envoi_ref,
      'etat_plateforme', v_d.etat_plateforme, 'transporteur', v_d.transporteur));
  END IF;

  IF NOT v_generer THEN RETURN jsonb_build_object('demande', NULL); END IF;
  -- La SUITE d'une génération faite : seulement le fichier (aucun geste).
  SELECT d.id, d.platform, d.choix, pc.id AS commande_id, pc.commande_ref, pc.envoi_ref, pc.transporteur
    INTO v_d
    FROM bordereaux_demandes d
    JOIN plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
   WHERE d.user_id = v_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND d.essais_fichier < 15 AND d.geste_le > now() - interval '24 hours'
     AND (d.essai_fichier_le IS NULL OR d.essai_fichier_le < now() - interval '2 minutes')
     -- Le fichier n'est pas lisible d'ici (Beebs), ou l'envoi est déjà parti : on arrête.
     AND coalesce(d.motif, '') NOT IN ('fichier_sur_beebs', 'bordereau_sans_objet')
   ORDER BY coalesce(d.essai_fichier_le, d.geste_le)
   LIMIT 1
   FOR UPDATE OF d SKIP LOCKED;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('demande', NULL); END IF;
  UPDATE bordereaux_demandes SET essais_fichier = essais_fichier + 1, essai_fichier_le = now() WHERE id = v_d.id;
  RETURN jsonb_build_object('demande', jsonb_build_object(
    'id', v_d.id, 'platform', v_d.platform, 'action', 'fichier', 'choix', coalesce(v_d.choix, '{}'::jsonb),
    'commande_id', v_d.commande_id, 'commande_ref', v_d.commande_ref, 'envoi_ref', v_d.envoi_ref,
    'transporteur', v_d.transporteur));
END;
$function$;

COMMENT ON TABLE public.bordereaux_demandes IS
  'Bêta bordereaux (16/10 soir) : une demande = UN clic sur « Bordereau » dans l''app. Prise par l''extension (bordereau_demande_a_traiter), qui dépose la copie (5 jours au plus). Jamais créée sans clic ; expirée après 24 h sans poste (17/10 ; 30 min avant).';
