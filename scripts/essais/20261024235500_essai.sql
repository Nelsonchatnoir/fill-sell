-- Essai à blanc de 20261024235500_bordereaux_vinted_tous_les_comptes (24/10 nuit : paliers Pro et Business) : ROLLBACK, rien ne reste.
--   npx supabase db query --linked -f scripts/essais/20261024235500_essai.sql
-- Assemblé : corps de la migration (sans BEGIN/COMMIT) + scripts/essais/20261024235500_tests.sql.
begin;
set local statement_timeout = '120s';
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024235500_bordereaux_vinted_tous_les_comptes
-- (24/10 soir, décision 2 de Nico) « Ouvre les bordereaux Vinted à TOUS les comptes, manuels et automatiques (fin de
-- la bêta pour Vinted). Leboncoin, Beebs, Depop et eBay restent fermés : dans l'app, un message court et clair
-- (« Bientôt disponible »), jamais un bouton qui échoue. Bordereau automatique : uniquement Vinted pour l'instant.
-- Jamais d'étiquette payante générée. »
-- (24/10 nuit, CHANGEMENT DE RÈGLE de Nico) « Uniquement pour les paliers Pro et Business, jamais Free ni Premium »
-- — manuel et automatique ; pour Free et Premium : aucun bouton, aucune mention, aucune incitation (ni dans les
-- modales). Cette migration porte aussi la révision des fonctions de 20261024233000 / 20261024235000 déjà appliquées
-- (commandes_enregistrer, bordereau_auto_pour_commande) : le palier y est vérifié. Mesuré le 24/10 à 21:45 : les 4
-- comptes bêta sont Pro ou Business, aucune demande de bordereau depuis 19:41 — aucun compte Free ou Premium n'en a eu ;
-- aucun bordereau déjà généré n'est touché.
-- CE QUI CHANGE :
--   · public.bordereaux_ouverts_pour(compte, plateforme) : LE seul endroit qui le dit. Vinted : paliers Pro et Business
--     (palier_de), tous si coin_config.bordereaux_vinted_tous = 1 (0 = retour à la bêta Pro/Business seule, sans
--     migration) ; toute autre
--     plateforme : fermée pour tous (aucune commande Leboncoin, Beebs, Depop ni eBay n'a jamais été relevée, mesuré
--     le 24/10 : les 4 comptes bêta n'ont que des commandes Vinted) ;
--   · messagerie_releve_autorise : hors bêta, le relevé des COMMANDES Vinted seules, jamais les messages
--     (« commandes_seules », lu par l'extension 0.6.140 ; les extensions d'avant ne demandent rien hors bêta) ;
--   · commandes_enregistrer, bordereau_demander, bordereau_generer, bordereau_demande_a_traiter, bordereau_copie_noter,
--     bordereau_auto_pour_commande : la bêta OU les bordereaux Vinted ouverts ; une autre plateforme répond
--     « bientot » et aucune de ses demandes n'est servie ;
--   · messagerie_compteurs : « bordereaux_vinted » (l'écran « À expédier » d'un compte hors bêta, dès que son poste a
--     l'extension 0.6.140) ; la messagerie elle-même reste à la bêta.
-- Corps réécrits depuis pg_get_functiondef EN PROD (24/10 soir), un remplacement exact chacun (scratchpad
-- generer-235500.cjs). Aucune donnée client modifiée ; aucun mail, aucune notification.
-- Application (feu vert NOMMÉ de Nico seulement) :
--   npx supabase db query --linked -f supabase/migrations/20261024235500_bordereaux_vinted_tous_les_comptes.sql
--   npx supabase migration repair --linked --status applied 20261024235500
-- Essai à blanc (ROLLBACK) : scripts/essais/20261024235500_essai.sql
-- Inverse : supabase/rollbacks/20261024235500_bordereaux_vinted_tous_les_comptes_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE LA MIGRATION

INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_vinted_tous', 1)
  ON CONFLICT (key) DO UPDATE SET value = 1, updated_at = now();

-- Le seul endroit qui dit si les bordereaux d'une plateforme sont ouverts à un compte.
CREATE OR REPLACE FUNCTION public.bordereaux_ouverts_pour(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT 'vinted'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN false
    WHEN coalesce(p_user, auth.uid()) IS NULL THEN false
    -- Leboncoin, Beebs, Depop, eBay : fermés pour tous (« Bientôt disponible »).
    WHEN lower(coalesce(p_platform, '')) <> 'vinted' THEN false
    -- (24/10 nuit, décision de Nico) Paliers Pro et Business SEULEMENT — jamais Free ni Premium, bêta comprise.
    WHEN public.palier_de(coalesce(p_user, auth.uid())) NOT IN ('pro', 'business') THEN false
    -- Vinted : tous les comptes Pro / Business (interrupteur coin_config.bordereaux_vinted_tous), sinon la bêta.
    WHEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_vinted_tous'), 0) = 1 THEN true
    ELSE public.messagerie_beta(coalesce(p_user, auth.uid()))
  END;
$function$;
REVOKE ALL ON FUNCTION public.bordereaux_ouverts_pour(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bordereaux_ouverts_pour(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commandes_enregistrer(p_platform text, p_commandes jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_c jsonb; v_ref text; v_ann text; v_old record; v_inv bigint; v_par text; v_lien record;
  v_etat text; v_bord text; v_insere boolean; v_opt jsonb;
  c_nouvelles int := 0; c_maj int := 0; c_inchangees int := 0; c_rattachees int := 0;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','beebs','depop','ebay') THEN
    RAISE EXCEPTION 'plateforme inconnue';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- (24/10 soir, décision 2 de Nico) Hors bêta : les commandes VINTED s'enregistrent (bordereaux ouverts à tous).
  IF NOT public.messagerie_beta(v_user) AND NOT public.bordereaux_ouverts_pour(v_user, p_platform) THEN
    RETURN jsonb_build_object('refuse', 'beta');
  END IF;
  IF jsonb_typeof(coalesce(p_commandes, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_commandes, '[]'::jsonb)) > 40 THEN
    RAISE EXCEPTION 'lot de commandes hors borne (40 au plus)';
  END IF;

  FOR v_c IN SELECT value FROM jsonb_array_elements(coalesce(p_commandes, '[]'::jsonb)) LOOP
    v_ref := nullif(btrim(coalesce(v_c ->> 'ref', '')), '');
    IF v_ref IS NULL THEN CONTINUE; END IF;
    v_ann := nullif(btrim(coalesce(v_c ->> 'annonce_ref', '')), '');
    v_etat := CASE WHEN v_c ->> 'etat' IN ('a_confirmer','a_expedier','expediee','livree','terminee','annulee','retour','litige')
                   THEN v_c ->> 'etat' ELSE 'inconnu' END;
    v_bord := CASE WHEN v_c ->> 'bordereau' IN ('a_generer','a_obtenir','pret','indisponible','sans_objet')
                   THEN v_c ->> 'bordereau' ELSE 'inconnu' END;
    v_opt := CASE WHEN jsonb_typeof(v_c -> 'options_bordereau') = 'object'
                       AND length((v_c -> 'options_bordereau')::text) <= 2000
                  THEN v_c -> 'options_bordereau' END;
    SELECT * INTO v_old FROM plateforme_commandes
     WHERE user_id = v_user AND platform = p_platform AND commande_ref = v_ref;
    v_inv := v_old.inventaire_id; v_par := v_old.rattache_par;
    IF v_ann IS NOT NULL AND (v_old.id IS NULL OR v_old.annonce_ref IS DISTINCT FROM v_ann OR v_old.inventaire_id IS NULL) THEN
      SELECT l.inventaire_id, l.par INTO v_lien FROM public.messagerie_article_pour_annonce(v_user, p_platform, v_ann) l;
      v_inv := coalesce(v_lien.inventaire_id, v_inv); v_par := CASE WHEN v_lien.inventaire_id IS NOT NULL THEN v_lien.par ELSE v_par END;
      IF v_lien.inventaire_id IS NOT NULL THEN c_rattachees := c_rattachees + 1; END IF;
    END IF;

    INSERT INTO plateforme_commandes AS pc (
      user_id, platform, commande_ref, etat, etat_plateforme, bordereau, acheteur_pseudo, titre, photo_url,
      montant, devise, annonce_ref, inventaire_id, rattache_par, conversation_ref, transporteur, envoi_ref,
      a_expedier_avant, vendue_le, options_bordereau)
    VALUES (
      v_user, p_platform, v_ref, v_etat,
      left(nullif(btrim(coalesce(v_c ->> 'etat_plateforme', '')), ''), 80), v_bord,
      left(nullif(btrim(coalesce(v_c ->> 'acheteur_pseudo', '')), ''), 80),
      left(nullif(btrim(coalesce(v_c ->> 'titre', '')), ''), 200),
      left(nullif(btrim(coalesce(v_c ->> 'photo', '')), ''), 600),
      nullif(v_c ->> 'montant', '')::numeric,
      left(nullif(v_c ->> 'devise', ''), 8),
      left(v_ann, 100), v_inv, v_par,
      left(nullif(btrim(coalesce(v_c ->> 'conversation_ref', '')), ''), 200),
      left(nullif(btrim(coalesce(v_c ->> 'transporteur', '')), ''), 80),
      left(nullif(btrim(coalesce(v_c ->> 'envoi_ref', '')), ''), 100),
      nullif(v_c ->> 'a_expedier_avant', '')::timestamptz,
      nullif(v_c ->> 'vendue_le', '')::timestamptz,
      v_opt)
    ON CONFLICT (user_id, platform, commande_ref) DO UPDATE SET
      -- (24/10 soir, décision 3 de Nico) Une commande NON détaillée à ce relevé arrive « inconnu » : elle ne remplace
      -- jamais un état connu (le bouton Bordereau disparaissait — 56 commandes Vinted le 24/10).
      etat = CASE WHEN EXCLUDED.etat = 'inconnu' AND pc.etat <> 'inconnu' THEN pc.etat ELSE EXCLUDED.etat END,
      etat_plateforme = CASE WHEN EXCLUDED.etat = 'inconnu' AND pc.etat <> 'inconnu' THEN pc.etat_plateforme ELSE EXCLUDED.etat_plateforme END,
      bordereau = CASE WHEN EXCLUDED.bordereau = 'inconnu' AND pc.bordereau <> 'inconnu' THEN pc.bordereau ELSE EXCLUDED.bordereau END,
      acheteur_pseudo = coalesce(EXCLUDED.acheteur_pseudo, pc.acheteur_pseudo),
      titre = coalesce(EXCLUDED.titre, pc.titre), photo_url = coalesce(EXCLUDED.photo_url, pc.photo_url),
      montant = coalesce(EXCLUDED.montant, pc.montant), devise = coalesce(EXCLUDED.devise, pc.devise),
      annonce_ref = coalesce(EXCLUDED.annonce_ref, pc.annonce_ref),
      inventaire_id = coalesce(EXCLUDED.inventaire_id, pc.inventaire_id),
      rattache_par = coalesce(EXCLUDED.rattache_par, pc.rattache_par),
      conversation_ref = coalesce(EXCLUDED.conversation_ref, pc.conversation_ref),
      transporteur = coalesce(EXCLUDED.transporteur, pc.transporteur),
      envoi_ref = coalesce(EXCLUDED.envoi_ref, pc.envoi_ref),
      a_expedier_avant = coalesce(EXCLUDED.a_expedier_avant, pc.a_expedier_avant),
      vendue_le = coalesce(EXCLUDED.vendue_le, pc.vendue_le),
      options_bordereau = coalesce(EXCLUDED.options_bordereau, pc.options_bordereau), maj_le = now()
    WHERE (pc.etat, pc.etat_plateforme, pc.bordereau, pc.acheteur_pseudo, pc.titre, pc.photo_url, pc.montant,
           pc.devise, pc.annonce_ref, pc.inventaire_id, pc.rattache_par, pc.conversation_ref, pc.transporteur,
           pc.envoi_ref, pc.a_expedier_avant, pc.vendue_le, pc.options_bordereau)
          IS DISTINCT FROM
          (CASE WHEN EXCLUDED.etat = 'inconnu' AND pc.etat <> 'inconnu' THEN pc.etat ELSE EXCLUDED.etat END,
           CASE WHEN EXCLUDED.etat = 'inconnu' AND pc.etat <> 'inconnu' THEN pc.etat_plateforme ELSE EXCLUDED.etat_plateforme END,
           CASE WHEN EXCLUDED.bordereau = 'inconnu' AND pc.bordereau <> 'inconnu' THEN pc.bordereau ELSE EXCLUDED.bordereau END,
           coalesce(EXCLUDED.acheteur_pseudo, pc.acheteur_pseudo), coalesce(EXCLUDED.titre, pc.titre),
           coalesce(EXCLUDED.photo_url, pc.photo_url), coalesce(EXCLUDED.montant, pc.montant),
           coalesce(EXCLUDED.devise, pc.devise), coalesce(EXCLUDED.annonce_ref, pc.annonce_ref),
           coalesce(EXCLUDED.inventaire_id, pc.inventaire_id), coalesce(EXCLUDED.rattache_par, pc.rattache_par),
           coalesce(EXCLUDED.conversation_ref, pc.conversation_ref), coalesce(EXCLUDED.transporteur, pc.transporteur),
           coalesce(EXCLUDED.envoi_ref, pc.envoi_ref), coalesce(EXCLUDED.a_expedier_avant, pc.a_expedier_avant),
           coalesce(EXCLUDED.vendue_le, pc.vendue_le), coalesce(EXCLUDED.options_bordereau, pc.options_bordereau))
    RETURNING (xmax = 0) INTO v_insere;
    IF NOT FOUND THEN c_inchangees := c_inchangees + 1;
    ELSIF v_insere THEN c_nouvelles := c_nouvelles + 1;
    ELSE c_maj := c_maj + 1;
    END IF;
  END LOOP;

  -- (18/10) Une commande changée peut fermer une génération (étiquette échouée chez Vinted, annulée).
  IF c_maj + c_nouvelles > 0 THEN PERFORM public.bordereaux_generations_closes(v_user); END IF;

  RETURN jsonb_build_object('plateforme', p_platform, 'nouvelles', c_nouvelles, 'maj', c_maj,
                            'inchangees', c_inchangees, 'rattachees', c_rattachees);
END;
$function$;

CREATE OR REPLACE FUNCTION public.messagerie_releve_autorise(p_platform text, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_pause timestamptz;
  v_coupe numeric;
  v_commandes_seules boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'utilisateur');
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL OR p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','beebs','depop','ebay') THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'parametres');
  END IF;
  -- (24/10 soir, décision 2 de Nico) Fin de la bêta des bordereaux Vinted : hors bêta, le poste relève les COMMANDES
  -- Vinted seules — jamais les messages (l'extension 0.6.140 lit « commandes_seules » ; celles d'avant ne demandent
  -- rien hors bêta).
  IF NOT public.messagerie_beta(v_user) THEN
    IF p_platform = 'vinted' AND public.bordereaux_ouverts_pour(v_user, 'vinted') THEN
      v_commandes_seules := true;
    ELSE
      RETURN jsonb_build_object('autorise', false, 'motif', 'beta');
    END IF;
  END IF;
  SELECT c.value INTO v_coupe FROM coin_config c WHERE c.key = 'messagerie_releves_ouverts';
  IF v_coupe IS NOT NULL AND v_coupe = 0 THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'coupe');
  END IF;
  SELECT r.pause_jusqu_au INTO v_pause FROM messagerie_releves r
   WHERE r.user_id = v_user AND r.platform = p_platform;
  IF v_pause IS NOT NULL AND v_pause > now() THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'pause', 'pause_jusqu_au', v_pause);
  END IF;
  IF p_platform = 'vinted' AND public.compte_en_pause_antirobot(v_user) THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'antirobot_vinted');
  END IF;
  IF EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = p_platform AND h.paused) THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'plateforme_en_pause');
  END IF;
  RETURN jsonb_build_object('autorise', true, 'commandes_seules', v_commandes_seules);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bordereau_demander(p_commande uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cmd record;
  v_copie record;
  v_dem record;
  v_ouvert integer;
  v_jour int;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  -- (24/10 soir, décision 2 de Nico) Fin de la bêta des bordereaux VINTED : ouverts aux paliers Pro et Business.
  IF NOT public.messagerie_beta(v_user) AND NOT public.bordereaux_ouverts_pour(v_user, 'vinted') THEN
    RETURN jsonb_build_object('refuse', 'beta');
  END IF;
  SELECT c.value INTO v_ouvert FROM coin_config c WHERE c.key = 'bordereaux_ouverts';
  IF coalesce(v_ouvert, 0) <> 1 THEN RETURN jsonb_build_object('refuse', 'ferme'); END IF;

  SELECT * INTO v_cmd FROM plateforme_commandes WHERE id = p_commande AND user_id = v_user;
  IF v_cmd.id IS NULL THEN RAISE EXCEPTION 'commande inconnue'; END IF;
  -- (24/10 soir, décision 2 de Nico) Vinted seulement, paliers Pro et Business (jamais Free ni Premium, bêta comprise) ;
  -- Leboncoin, Beebs, Depop, eBay : « Bientôt disponible » (jamais un bouton qui échoue ; jamais une étiquette payante).
  IF NOT public.bordereaux_ouverts_pour(v_user, v_cmd.platform) THEN
    RETURN jsonb_build_object('refuse', CASE WHEN v_cmd.platform = 'vinted' THEN 'palier' ELSE 'bientot' END);
  END IF;

  -- Une copie encore valable : on la rend, rien ne repart chez la plateforme.
  SELECT b.id, b.chemin, b.expire_le INTO v_copie FROM bordereaux_copies b
   WHERE b.commande_id = v_cmd.id AND b.user_id = v_user
     AND b.efface_le IS NULL AND b.expire_le > now()
   ORDER BY b.cree_le DESC LIMIT 1;
  IF v_copie.id IS NOT NULL THEN
    RETURN jsonb_build_object('copie', v_copie.id, 'chemin', v_copie.chemin, 'expire_le', v_copie.expire_le);
  END IF;

  -- Seul un bordereau PRÊT chez la plateforme se RÉCUPÈRE (le générer passe
  -- par bordereau_generer, écran de confirmation compris).
  IF v_cmd.etat <> 'a_expedier' OR v_cmd.bordereau <> 'pret' THEN
    RETURN jsonb_build_object('refuse', 'pas_pret', 'etat', v_cmd.etat, 'bordereau', v_cmd.bordereau);
  END IF;

  SELECT * INTO v_dem FROM bordereaux_demandes d
   WHERE d.commande_id = v_cmd.id AND d.statut IN ('demandee','en_cours') LIMIT 1;
  IF v_dem.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_dem.id, 'statut', v_dem.statut, 'deja', true);
  END IF;

  SELECT count(*) INTO v_jour FROM bordereaux_demandes d
   WHERE d.user_id = v_user
     AND (d.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date;
  IF v_jour >= 20 THEN RETURN jsonb_build_object('refuse', 'plafond_jour'); END IF;

  INSERT INTO bordereaux_demandes (user_id, commande_id, platform)
  VALUES (v_user, v_cmd.id, v_cmd.platform)
  ON CONFLICT (commande_id) WHERE statut IN ('demandee','en_cours') DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT d.id INTO v_id FROM bordereaux_demandes d
     WHERE d.commande_id = v_cmd.id AND d.statut IN ('demandee','en_cours') LIMIT 1;
    RETURN jsonb_build_object('id', v_id, 'statut', 'demandee', 'deja', true);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'statut', 'demandee');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bordereau_generer(p_commande uuid, p_choix jsonb DEFAULT '{}'::jsonb, p_engagement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cmd record;
  v_copie record;
  v_gen record;
  v_jour int;
  v_id uuid;
  v_choix jsonb := coalesce(p_choix, '{}'::jsonb);
  v_engagement text := btrim(coalesce(p_engagement, ''));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  -- (24/10 soir, décision 2 de Nico) Fin de la bêta des bordereaux VINTED : ouverts aux paliers Pro et Business.
  IF NOT public.messagerie_beta(v_user) AND NOT public.bordereaux_ouverts_pour(v_user, 'vinted') THEN
    RETURN jsonb_build_object('refuse', 'beta');
  END IF;
  IF coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_ouverts'), 0) <> 1
     OR coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    RETURN jsonb_build_object('refuse', 'ferme');
  END IF;

  SELECT * INTO v_cmd FROM plateforme_commandes WHERE id = p_commande AND user_id = v_user;
  IF v_cmd.id IS NULL THEN RAISE EXCEPTION 'commande inconnue'; END IF;
  -- (24/10 soir, décision 2 de Nico) Vinted seulement, paliers Pro et Business (jamais Free ni Premium, bêta comprise) ;
  -- Leboncoin, Beebs, Depop, eBay : « Bientôt disponible » (jamais un bouton qui échoue ; jamais une étiquette payante).
  IF NOT public.bordereaux_ouverts_pour(v_user, v_cmd.platform) THEN
    RETURN jsonb_build_object('refuse', CASE WHEN v_cmd.platform = 'vinted' THEN 'palier' ELSE 'bientot' END);
  END IF;

  -- Une copie valable : rien à générer.
  SELECT b.id, b.chemin, b.expire_le INTO v_copie FROM bordereaux_copies b
   WHERE b.commande_id = v_cmd.id AND b.user_id = v_user AND b.efface_le IS NULL AND b.expire_le > now()
   ORDER BY b.cree_le DESC LIMIT 1;
  IF v_copie.id IS NOT NULL THEN
    RETURN jsonb_build_object('copie', v_copie.id, 'chemin', v_copie.chemin, 'expire_le', v_copie.expire_le);
  END IF;

  -- JAMAIS une seconde génération : celle qui existe est rendue telle quelle.
  SELECT d.id, d.statut, d.motif INTO v_gen FROM bordereaux_demandes d
   WHERE d.commande_id = v_cmd.id AND d.action = 'generer'
     AND d.statut IN ('demandee','en_cours','generee','prete','incertaine')
   ORDER BY d.cree_le DESC LIMIT 1;
  IF v_gen.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_gen.id, 'statut', v_gen.statut, 'motif', v_gen.motif, 'deja', true);
  END IF;

  -- Seule une commande qui ATTEND le geste se génère (Vinted : étiquette à
  -- commander ; Leboncoin : disponibilité à confirmer ; Beebs : à accepter).
  IF NOT ((v_cmd.platform = 'vinted' AND v_cmd.etat = 'a_expedier' AND v_cmd.bordereau = 'a_obtenir')
       OR (v_cmd.platform IN ('leboncoin','beebs') AND v_cmd.etat = 'a_confirmer' AND v_cmd.bordereau = 'a_generer')) THEN
    RETURN jsonb_build_object('refuse', 'pas_a_generer', 'etat', v_cmd.etat, 'bordereau', v_cmd.bordereau);
  END IF;

  -- L'écran de confirmation a été montré et accepté : sa phrase est gardée.
  IF char_length(v_engagement) NOT BETWEEN 10 AND 400 THEN
    RETURN jsonb_build_object('refuse', 'engagement');
  END IF;
  -- Choix bornés : type d'étiquette Vinted (1 papier, 2 code, 3 QR) seulement.
  IF jsonb_typeof(v_choix) <> 'object' OR length(v_choix::text) > 500
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_choix) k WHERE k NOT IN ('type_etiquette'))
     OR (v_choix ? 'type_etiquette' AND (jsonb_typeof(v_choix -> 'type_etiquette') <> 'number'
                                          OR (v_choix ->> 'type_etiquette')::int NOT IN (1, 2, 3))) THEN
    RETURN jsonb_build_object('refuse', 'choix');
  END IF;

  SELECT count(*) INTO v_jour FROM bordereaux_demandes d
   WHERE d.user_id = v_user
     AND (d.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date;
  IF v_jour >= 20 THEN RETURN jsonb_build_object('refuse', 'plafond_jour'); END IF;

  BEGIN
    INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, choix, engagement, confirme_le)
    VALUES (v_user, v_cmd.id, v_cmd.platform, 'generer', v_choix, v_engagement, now())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Deux appuis simultanés : l'index unique a gardé le premier.
    SELECT d.id, d.statut INTO v_gen FROM bordereaux_demandes d
     WHERE d.commande_id = v_cmd.id AND d.statut IN ('demandee','en_cours','generee','prete','incertaine')
     ORDER BY d.cree_le DESC LIMIT 1;
    RETURN jsonb_build_object('id', v_gen.id, 'statut', v_gen.statut, 'deja', true);
  END;
  RETURN jsonb_build_object('id', v_id, 'statut', 'demandee');
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.bordereau_copie_noter(p_commande uuid, p_chemin text, p_taille integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  -- (24/10 soir, décision 2 de Nico) Hors bêta : la copie d'une commande Vinted (bordereaux ouverts à tous).
  IF NOT public.messagerie_beta(v_user) AND NOT EXISTS (
       SELECT 1 FROM plateforme_commandes pc
        WHERE pc.id = p_commande AND pc.user_id = v_user AND public.bordereaux_ouverts_pour(v_user, pc.platform)) THEN
    RETURN jsonb_build_object('refuse', 'beta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plateforme_commandes pc WHERE pc.id = p_commande AND pc.user_id = v_user) THEN
    RAISE EXCEPTION 'commande inconnue';
  END IF;
  IF p_chemin IS NULL OR split_part(p_chemin, '/', 1) <> v_user::text THEN
    RAISE EXCEPTION 'chemin hors du dossier du compte';
  END IF;
  INSERT INTO bordereaux_copies (user_id, commande_id, chemin, taille_octets)
  VALUES (v_user, p_commande, p_chemin, p_taille)
  ON CONFLICT (chemin) DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.messagerie_compteurs()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT mc.inventaire_id, mc.non_lus
      FROM messagerie_conversations mc
     WHERE mc.user_id = auth.uid() AND public.messagerie_beta(auth.uid())
       AND mc.non_lus > 0 AND NOT mc.systeme
       AND (mc.vu_dans_app_le IS NULL OR mc.vu_dans_app_le < coalesce(mc.dernier_message_le, mc.cree_le))
  ), d AS (
    -- (24/10 soir, décision 2 de Nico) Bordereaux VINTED ouverts aux paliers Pro et Business : l'écran « À expédier »
    -- existe pour un tel compte hors bêta dès que son poste sait relever les commandes Vinted (extension 0.6.140 ou
    -- plus) — jamais un écran vide promis à un poste qui ne le remplira pas. Free et Premium : rien (bêta comprise :
    -- « bordereaux_vinted » faux, l'app ne montre aucun bouton ni aucune mention de bordereau).
    SELECT public.messagerie_beta(auth.uid()) AS beta,
           public.bordereaux_ouverts_pour(auth.uid(), 'vinted') AND (
             public.messagerie_beta(auth.uid())
             OR coalesce((SELECT string_to_array(substring(p.extension_version FROM '^[0-9]+\.[0-9]+\.[0-9]+'), '.')::int[] >= ARRAY[0, 6, 140]
                            FROM profiles p WHERE p.id = auth.uid()), false)) AS bordereaux
  )
  SELECT jsonb_build_object(
    'beta', d.beta,
    'bordereaux_vinted', d.bordereaux,
    'non_lus', coalesce((SELECT sum(non_lus) FROM c), 0),
    'conversations_non_lues', (SELECT count(*) FROM c),
    'par_article', coalesce((SELECT jsonb_object_agg(inventaire_id::text, n)
                               FROM (SELECT inventaire_id, sum(non_lus) AS n FROM c
                                      WHERE inventaire_id IS NOT NULL GROUP BY inventaire_id) a), '{}'::jsonb),
    'a_expedier', (SELECT count(*) FROM plateforme_commandes pc
                    WHERE pc.user_id = auth.uid() AND pc.etat IN ('a_confirmer','a_expedier')),
    -- (16/10 nuit) Ce que l'écran doit dire : envoi ouvert, liste blanche ou
    -- fermé ; génération des bordereaux ouverte ou non. Comptes bêta (envoi) ; (24/10) comptes aux bordereaux Vinted
    -- ouverts (génération) — Free et Premium : null.
    'envoi_mode', CASE WHEN d.beta
                       THEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'messagerie_envoi_mode'), 1) END,
    'generation', CASE WHEN d.bordereaux
                       THEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_generation_ouverte'), 0) = 1
                        AND coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_ouverts'), 0) = 1 END)
  FROM d;
$function$;


-- Essai à blanc de 20261024235500 (bordereaux Vinted : paliers Pro et Business seulement, jamais Free ni Premium) — les
-- contrôles, joués APRÈS le corps de la migration, dans la même transaction, puis ROLLBACK (assemblé par
-- scripts/essais/20261024235500_essai.sql).
-- Comptes : Nico (f44b5917…, Pro, bêta — sa bêta est retirée DANS la transaction pour jouer « Pro hors bêta », puis
-- rendue) ; Ornella (f8aa02a5…, Business, bêta — passée Free DANS la transaction pour jouer « bêta Free ») ;
-- sos.cuisine (90ace0e4…, Premium, hors bêta). Commandes « ESSAI-NB-* » créées dans la transaction : rien ne reste, aucun
-- mail, aucune notification (tout est annulé au ROLLBACK).
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- A. L'aide, sans session.
insert into _r select 'A1 Premium hors bêta (sos.cuisine) : Vinted FERMÉ', not public.bordereaux_ouverts_pour('90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', 'vinted'), null;
insert into _r select 'A2 Pro bêta (Nico) : Vinted ouvert, Beebs fermé',
  public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'beebs'), null;
update profiles set beta_flags = beta_flags - 'messages_bordereaux' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'A3 Pro HORS bêta : Vinted ouvert, Leboncoin fermé',
  public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin'), null;
update coin_config set value = 0 where key = 'bordereaux_vinted_tous';
insert into _r select 'A4 interrupteur à 0 : Pro hors bêta fermé, Business bêta ouvert',
  not public.bordereaux_ouverts_pour('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted')
  and public.bordereaux_ouverts_pour('f8aa02a5-23cb-4325-bba8-127f61a75741', 'vinted'), null;
update coin_config set value = 1 where key = 'bordereaux_vinted_tous';

-- B. Session du compte Pro HORS bêta (Nico, bêta retirée dans la transaction).
select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
       set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into _r select 'B1 relevé Vinted : autorisé, commandes seules',
  (r ->> 'commandes_seules') = 'true' and ((r ->> 'autorise') = 'true' or r ->> 'motif' not in ('beta')), r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'B2 relevé Leboncoin : refusé (bêta)', (r ->> 'autorise') = 'false' and r ->> 'motif' = 'beta', r::text
  from (select public.messagerie_releve_autorise('leboncoin') r) x;
insert into _r select 'B3 une commande Vinted s''enregistre', (r ->> 'refuse') is null, r::text
  from (select public.commandes_enregistrer('vinted', '[{"ref":"ESSAI-NB-1","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'B4 une commande Leboncoin est refusée', r ->> 'refuse' = 'beta', r::text
  from (select public.commandes_enregistrer('leboncoin', '[{"ref":"ESSAI-NB-L","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'B5 automatique : la commande Vinted neuve reçoit UNE demande « récupérer »',
  count(*) = 1 and bool_and(d.action = 'recuperer' and d.choix ->> 'auto' = 'true'), string_agg(d.action || ' ' || d.statut, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id
 where c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and c.commande_ref = 'ESSAI-NB-1';
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin', 'ESSAI-NB-L2', 'a_expedier', 'pret', 'essai lbc');
insert into _r select 'B6 récupérer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_demander(c.id) r from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
update plateforme_commandes set etat = 'a_confirmer', bordereau = 'a_generer' where commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B7 générer sur Leboncoin : « bientot »', r ->> 'refuse' = 'bientot', r::text
  from (select public.bordereau_generer(c.id, '{}'::jsonb, 'Je confirme la disponibilité de l''article') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2') x;
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre, cree_le)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-NB-2', 'a_expedier', 'a_obtenir', 'essai vinted', now() - interval '3 days');
insert into _r select 'B8 générer sur Vinted (bouton, Pro hors bêta) : demande déposée', r ->> 'statut' = 'demandee' and r ? 'id', r::text
  from (select public.bordereau_generer(c.id, '{"type_etiquette":1}'::jsonb, 'Je commande l''étiquette Vinted de cette vente') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-2') x;
insert into bordereaux_demandes (user_id, commande_id, platform, cree_le)
select c.user_id, c.id, 'leboncoin', now() - interval '1 hour' from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2';
insert into _r select 'B9 le poste prend une demande VINTED, jamais la Leboncoin', (r -> 'demande' ->> 'platform') = 'vinted', left(r::text, 200)
  from (select public.bordereau_demande_a_traiter(null, array['generer','vinted_types_texte','relance_vinted']) r) x;
insert into _r select 'B10 copie d''une commande Vinted notée ; Leboncoin refusée',
  (select (public.bordereau_copie_noter(c.id, 'f44b5917-bccc-4431-ba41-f40571a2ed18/vinted-essai.pdf', 10) ->> 'id') is not null
     from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-1')
  and (select public.bordereau_copie_noter(c.id, 'f44b5917-bccc-4431-ba41-f40571a2ed18/lbc-essai.pdf', 10) ->> 'refuse' = 'beta'
         from plateforme_commandes c where c.commande_ref = 'ESSAI-NB-L2'), null;
update profiles set extension_version = '0.6.131' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'B11 compteurs, extension 0.6.131 : pas d''écran (rien ne le remplirait)',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'false', r::text from (select public.messagerie_compteurs() r) x;
update profiles set extension_version = '0.6.140' where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
insert into _r select 'B12 compteurs, extension 0.6.140 : « À expédier » et génération ouverts, messagerie fermée',
  (r ->> 'beta') = 'false' and (r ->> 'bordereaux_vinted') = 'true' and (r ->> 'generation') = 'true' and r ->> 'envoi_mode' is null
  and (r ->> 'a_expedier')::int >= 2, r::text from (select public.messagerie_compteurs() r) x;

-- P. Session du compte PREMIUM hors bêta (sos.cuisine) : rien, même avec l'extension 0.6.140.
select set_config('request.jwt.claim.sub', '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3', true),
       set_config('request.jwt.claims', '{"sub":"90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3","role":"authenticated"}', true);
update profiles set extension_version = '0.6.140' where id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3';
insert into _r select 'P1 Premium : aucun relevé des commandes', (r ->> 'autorise') = 'false' and r ->> 'motif' = 'beta', r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'P2 Premium : aucune commande enregistrée', r ->> 'refuse' = 'beta', r::text
  from (select public.commandes_enregistrer('vinted', '[{"ref":"ESSAI-P-1","etat":"a_expedier","bordereau":"pret"}]'::jsonb) r) x;
insert into _r select 'P3 Premium : compteurs sans « À expédier » ni génération (aucune mention)',
  (r ->> 'bordereaux_vinted') = 'false' and r ->> 'generation' is null, r::text from (select public.messagerie_compteurs() r) x;
insert into _r select 'P4 Premium : aucune demande servie', r -> 'demande' is null or r ->> 'demande' is null, left(r::text, 200)
  from (select public.bordereau_demande_a_traiter(null, array['generer','vinted_types_texte']) r) x;

-- D. Un compte BÊTA passé Free (Ornella, dans la transaction) : plus aucun bordereau, ni manuel ni automatique.
select set_config('request.jwt.claim.sub', 'f8aa02a5-23cb-4325-bba8-127f61a75741', true),
       set_config('request.jwt.claims', '{"sub":"f8aa02a5-23cb-4325-bba8-127f61a75741","role":"authenticated"}', true);
insert into _r select 'D0 Business bêta : ouvert', public.bordereaux_ouverts_pour(null, 'vinted'), null;
update profiles set is_business = false, is_pro = false, is_premium = false, is_comped = false where id = 'f8aa02a5-23cb-4325-bba8-127f61a75741';
insert into _r select 'D1 bêta passée Free : Vinted FERMÉ', not public.bordereaux_ouverts_pour(null, 'vinted') and public.palier_de('f8aa02a5-23cb-4325-bba8-127f61a75741') = 'free', null;
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f8aa02a5-23cb-4325-bba8-127f61a75741', 'vinted', 'ESSAI-D-1', 'a_expedier', 'a_obtenir', 'essai free');
insert into _r select 'D2 bêta Free : aucune demande automatique', count(*) = 0, count(*)::text
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-D-1';
insert into _r select 'D3 bêta Free : le bouton « générer » est refusé (« palier »)', r ->> 'refuse' = 'palier', r::text
  from (select public.bordereau_generer(c.id, '{"type_etiquette":1}'::jsonb, 'Je commande l''étiquette Vinted de cette vente') r
          from plateforme_commandes c where c.commande_ref = 'ESSAI-D-1') x;
insert into _r select 'D4 bêta Free : compteurs « bordereaux_vinted » faux, messagerie (bêta) gardée',
  (r ->> 'beta') = 'true' and (r ->> 'bordereaux_vinted') = 'false' and r ->> 'generation' is null, left(r::text, 200)
  from (select public.messagerie_compteurs() r) x;
insert into _r select 'D5 auto : motif « palier »', public.bordereau_auto_pour_commande(c.id) = 'palier', public.bordereau_auto_pour_commande(c.id)
  from plateforme_commandes c where c.commande_ref = 'ESSAI-D-1';

-- C. Session du compte bêta Pro (Nico, bêta rendue) : relevé complet, compteurs.
update profiles set beta_flags = coalesce(beta_flags, '{}'::jsonb) || '{"messages_bordereaux": true}'::jsonb where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
select set_config('request.jwt.claim.sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', true),
       set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into _r select 'C1 bêta Pro : relevé Vinted complet (pas « commandes seules »)',
  (r ->> 'commandes_seules') = 'false' and ((r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta'), r::text
  from (select public.messagerie_releve_autorise('vinted') r) x;
insert into _r select 'C2 bêta Pro : relevé Beebs toujours permis (messages)', (r ->> 'autorise') = 'true' or r ->> 'motif' <> 'beta', r::text
  from (select public.messagerie_releve_autorise('beebs') r) x;
insert into _r select 'C3 bêta Pro : compteurs « beta » et « bordereaux_vinted »', (r ->> 'beta') = 'true' and (r ->> 'bordereaux_vinted') = 'true', left(r::text, 200)
  from (select public.messagerie_compteurs() r) x;
insert into _r select 'C4 aucune erreur d''automatique tracée', count(*) = 0, count(*)::text
  from usage_logs where feature = 'bordereau_auto_erreur' and created_at = now();
insert into _r select 'C5 aucun bordereau déjà généré n''est touché (copies réelles intactes)', count(*) = 0, count(*)::text
  from bordereaux_copies b where b.efface_le is not null and b.efface_le = now();
select essai, ok, left(detail, 300) detail from _r order by essai;

rollback;
