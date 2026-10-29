-- INVERSE de 20261029151000_bordereau_auto_par_compte (point 6, 29/10/2026).
-- Remet les deux fonctions EXACTEMENT comme en prod le 29/10 vers 13:45 (pg_get_functiondef), puis retire l aide.
-- Le réglage platform_settings.bordereaux.auto éventuellement écrit par des comptes reste (inerte) : rien n est effacé.
-- Les demandes closes « expiree / auto_desactive » restent closes (rien n avait été fait chez la plateforme).
BEGIN;

CREATE OR REPLACE FUNCTION public.bordereau_auto_pour_commande(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_depuis timestamptz;
  v_action text;
  v_format text;
  v_choix jsonb;
  v_jour int;
BEGIN
  SELECT * INTO c FROM plateforme_commandes WHERE id = p_id;
  IF c.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_ouverts'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  v_depuis := to_timestamp(coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto_depuis'), 0));
  -- Seulement les ventes vues APRÈS l'ouverture, et récentes : jamais l'arriéré d'un compte.
  IF c.cree_le < v_depuis OR c.cree_le < now() - interval '7 days' THEN RETURN 'avant_ouverture'; END IF;
  -- (24/10 soir, décision 2 de Nico) Vinted seulement : étiquette payée par l'acheteur. Leboncoin, Beebs : bientôt ;
  -- jamais eBay (étiquette payante), ni Depop (pas de bordereau en France).
  IF c.platform <> 'vinted' THEN RETURN 'plateforme'; END IF;
  -- (24/10 nuit, décision de Nico) Paliers Pro et Business SEULEMENT, bêta comprise — jamais Free ni Premium ;
  -- manuels ET automatiques (fin de la bêta pour Vinted).
  IF public.palier_de(c.user_id) NOT IN ('pro', 'business') THEN RETURN 'palier'; END IF;
  IF NOT public.bordereaux_ouverts_pour(c.user_id, c.platform) THEN RETURN 'hors_beta'; END IF;

  IF c.etat = 'a_expedier' AND c.bordereau = 'a_obtenir' THEN
    v_action := 'generer';
  ELSIF c.etat = 'a_expedier' AND c.bordereau = 'pret' THEN
    v_action := 'recuperer';
  ELSE
    RETURN 'rien_a_faire';
  END IF;
  IF v_action = 'generer'
     AND coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    RETURN 'generation_fermee';
  END IF;
  -- Vinted ne laisse pas FillSell le faire (enlèvement à domicile daté, téléphone exigé) : le bouton manuel le dit.
  IF v_action = 'generer' AND c.platform = 'vinted' AND (c.options_bordereau ->> 'generable') = 'false' THEN
    RETURN 'non_generable';
  END IF;

  -- Une seule fois par commande : jamais après une demande (du vendeur ou automatique), ni avec une copie vivante.
  IF EXISTS (SELECT 1 FROM bordereaux_demandes d WHERE d.commande_id = c.id) THEN RETURN 'deja_demandee'; END IF;
  IF EXISTS (SELECT 1 FROM bordereaux_copies b WHERE b.commande_id = c.id AND b.efface_le IS NULL AND b.expire_le > now()) THEN
    RETURN 'copie_presente';
  END IF;
  SELECT count(*) INTO v_jour FROM bordereaux_demandes d
   WHERE d.user_id = c.user_id
     AND (d.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date;
  IF v_jour >= 20 THEN RETURN 'plafond_jour'; END IF;

  v_format := CASE WHEN (SELECT p.platform_settings #>> '{bordereaux,format}' FROM profiles p WHERE p.id = c.user_id) = 'code'
                   THEN 'code' ELSE 'pdf' END;
  v_choix := jsonb_build_object('auto', true, 'format', v_format)
    || CASE WHEN v_action = 'generer' AND c.platform = 'vinted'
            THEN jsonb_build_object('type_etiquette', CASE WHEN v_format = 'code' THEN 3 ELSE 1 END) ELSE '{}'::jsonb END;

  -- Garde de double vente : deux commandes en cours pour la même fiche → rien d'automatique, le vendeur choisit.
  IF v_action = 'generer' AND c.inventaire_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM plateforme_commandes o
        WHERE o.user_id = c.user_id AND o.inventaire_id = c.inventaire_id AND o.id <> c.id
          AND o.etat IN ('a_confirmer', 'a_expedier')) THEN
    INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, statut, motif, choix, fini_le)
    VALUES (c.user_id, c.id, c.platform, 'generer', 'echec', 'deux_commandes_meme_fiche', v_choix, now());
    RETURN 'deux_commandes_meme_fiche';
  END IF;

  BEGIN
    IF v_action = 'generer' THEN
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, choix, engagement, confirme_le)
      VALUES (c.user_id, c.id, c.platform, 'generer', v_choix,
              'Bordereau automatique dès la vente (décision de Nico du 24/10/2026 ; format du compte : ' || v_format || ')',
              now());
    ELSE
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, choix)
      VALUES (c.user_id, c.id, c.platform, v_choix);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'deja_demandee';
  END;
  RETURN 'demandee';
END;
$function$;
REVOKE ALL ON FUNCTION public.bordereau_auto_pour_commande(uuid) FROM PUBLIC, anon, authenticated;

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
  -- (18/10) Envoie le type d'étiquette Vinted en toutes lettres (0.6.126) ; sait relancer.
  v_types_texte boolean := coalesce('vinted_types_texte' = ANY (p_capacites), false);
  v_relance boolean := coalesce('relance_vinted' = ANY (p_capacites), false);
  v_a record;
  v_pc record;
  v_rel uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- (24/10 soir, décision 2 de Nico) Fin de la bêta des bordereaux VINTED : le poste de tout compte prend ses demandes
  -- Vinted ; Leboncoin, Beebs, Depop, eBay : aucune demande servie (« Bientôt disponible »).
  IF NOT public.messagerie_beta(v_user) AND NOT public.bordereaux_ouverts_pour(v_user, 'vinted') THEN
    RETURN jsonb_build_object('demande', NULL, 'motif', 'beta');
  END IF;

  -- (17/10, feu vert de Nico) Une demande attend l'ordinateur 24 h (30 min avant).
  UPDATE bordereaux_demandes SET statut = 'expiree', motif = 'poste_absent', fini_le = now()
   WHERE user_id = v_user AND statut = 'demandee' AND cree_le < now() - interval '24 hours';
  UPDATE bordereaux_demandes SET statut = 'echec', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND action = 'recuperer' AND pris_le < now() - interval '10 minutes';
  UPDATE bordereaux_demandes SET statut = 'incertaine', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND action = 'generer' AND pris_le < now() - interval '10 minutes';
  -- (18/10) Ce que la plateforme a fermé (étiquette échouée chez Vinted, commande annulée).
  PERFORM public.bordereaux_generations_closes(v_user);

  SELECT c.value INTO v_ouvert FROM coin_config c WHERE c.key = 'bordereaux_ouverts';
  IF coalesce(v_ouvert, 0) <> 1 THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'ferme'); END IF;
  IF coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    v_generer := false;
  END IF;

  -- (18/10) Une génération Vinted qu'aucune extension capable n'a prise en 15 min :
  -- RIEN n'a été commandé, l'app dit pourquoi (une extension d'avant commanderait
  -- sans type d'étiquette : échec chez Vinted).
  IF v_generer AND NOT v_types_texte THEN
    UPDATE bordereaux_demandes SET statut = 'echec', motif = 'extension_a_mettre_a_jour', fini_le = now()
     WHERE user_id = v_user AND statut = 'demandee' AND action = 'generer' AND platform = 'vinted'
       AND cree_le < now() - interval '15 minutes';
  END IF;

  -- (18/10) La relance autorisée (SQL seulement), UNE fois, par une extension qui la sait.
  IF v_generer AND v_types_texte AND v_relance THEN
    SELECT a.id, a.demande_id, d.commande_id, d.choix, d.engagement, d.confirme_le
      INTO v_a
      FROM bordereaux_relances_autorisees a
      JOIN bordereaux_demandes d ON d.id = a.demande_id AND d.user_id = a.user_id
     WHERE a.user_id = v_user AND a.consommee_le IS NULL AND a.avant > now()
       AND d.platform = 'vinted' AND d.action = 'generer' AND d.statut = 'echec'
       AND d.motif = 'etiquette_echouee_chez_vinted'
     ORDER BY a.cree_le
     LIMIT 1
     FOR UPDATE OF a SKIP LOCKED;
    IF v_a.id IS NOT NULL THEN
      SELECT pc.etat, pc.bordereau INTO v_pc FROM plateforme_commandes pc WHERE pc.id = v_a.commande_id AND pc.user_id = v_user;
      IF v_pc.etat = 'a_expedier' AND v_pc.bordereau IN ('indisponible', 'a_obtenir')
         AND NOT EXISTS (SELECT 1 FROM bordereaux_copies b WHERE b.commande_id = v_a.commande_id AND b.user_id = v_user
                          AND b.efface_le IS NULL AND b.expire_le > now())
         AND NOT EXISTS (SELECT 1 FROM bordereaux_demandes x WHERE x.commande_id = v_a.commande_id
                          AND x.statut IN ('demandee', 'en_cours', 'generee', 'prete', 'incertaine')) THEN
        INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, choix, engagement, confirme_le, relance)
        VALUES (v_user, v_a.commande_id, 'vinted', 'generer', v_a.choix, v_a.engagement, v_a.confirme_le, true)
        RETURNING id INTO v_rel;
        UPDATE bordereaux_relances_autorisees SET consommee_le = now(), issue = 'relance_deposee', relance_id = v_rel WHERE id = v_a.id;
      ELSE
        -- Prête, expédiée, annulée, ou déjà reprise entre-temps : on ne touche à rien.
        UPDATE bordereaux_relances_autorisees
           SET consommee_le = now(), issue = left('sans_relance_' || coalesce(v_pc.etat, '?') || '_' || coalesce(v_pc.bordereau, '?'), 120)
         WHERE id = v_a.id;
      END IF;
    END IF;
  END IF;

  SELECT d.id, d.platform, d.action, d.choix, d.relance, pc.id AS commande_id, pc.commande_ref, pc.envoi_ref,
         pc.etat_plateforme, pc.transporteur
    INTO v_d
    FROM bordereaux_demandes d
    JOIN plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
   WHERE d.user_id = v_user AND d.statut = 'demandee' AND public.bordereaux_ouverts_pour(v_user, d.platform)
     AND (d.action = 'recuperer'
          OR (v_generer AND (d.platform <> 'vinted' OR v_types_texte) AND (NOT d.relance OR v_relance)))
   ORDER BY d.cree_le
   LIMIT 1
   FOR UPDATE OF d SKIP LOCKED;
  IF v_d.id IS NOT NULL THEN
    UPDATE bordereaux_demandes SET statut = 'en_cours', pris_le = now() WHERE id = v_d.id;
    RETURN jsonb_build_object('demande', jsonb_build_object(
      'id', v_d.id, 'platform', v_d.platform, 'action', v_d.action, 'choix', coalesce(v_d.choix, '{}'::jsonb),
      'commande_id', v_d.commande_id, 'commande_ref', v_d.commande_ref, 'envoi_ref', v_d.envoi_ref,
      'etat_plateforme', v_d.etat_plateforme, 'transporteur', v_d.transporteur, 'relance', coalesce(v_d.relance, false)));
  END IF;

  IF NOT v_generer THEN RETURN jsonb_build_object('demande', NULL); END IF;
  -- La SUITE d'une génération faite : seulement le fichier (aucun geste).
  SELECT d.id, d.platform, d.choix, pc.id AS commande_id, pc.commande_ref, pc.envoi_ref, pc.transporteur
    INTO v_d
    FROM bordereaux_demandes d
    JOIN plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
   WHERE d.user_id = v_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND public.bordereaux_ouverts_pour(v_user, d.platform)
     AND d.essais_fichier < 15 AND d.geste_le > now() - interval '24 hours'
     AND (d.essai_fichier_le IS NULL OR d.essai_fichier_le < now() - interval '2 minutes')
     -- Le fichier n'est pas lisible d'ici (Beebs), ou l'envoi est déjà parti : on arrête.
     AND coalesce(d.motif, '') NOT IN ('fichier_sur_beebs', 'bordereau_sans_objet')
     -- (18/10) La plateforme a dit l'échec : il n'y a pas de fichier à chercher.
     AND pc.bordereau IS DISTINCT FROM 'indisponible'
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

DROP FUNCTION IF EXISTS public.bordereau_auto_actif(uuid);

COMMIT;
