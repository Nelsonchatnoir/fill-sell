-- Inverse de supabase/migrations/20261018100000_bordereaux_echec_vinted_relance.sql (lot 1, 18/10).
-- Effet : les trois fonctions reprennent leur texte de prod d'avant (relu par pg_get_functiondef le 18/10 vers 11:10
-- Paris) ; la fonction d'aide, la table des relances autorisées et la colonne `relance` disparaissent.
-- Ce qui a été fait chez Vinted n'est pas défait (aucun geste ne se défait) ; une demande passée « echec » par la
-- règle reste « echec » (son motif dit pourquoi).
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018100000_bordereaux_echec_vinted_relance.sql
--   npx supabase migration repair --linked --status reverted 20261018100000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

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
$function$
;

CREATE OR REPLACE FUNCTION public.bordereau_demande_etape(p_id uuid, p_statut text, p_motif text DEFAULT NULL::text, p_copie uuid DEFAULT NULL::uuid, p_geste text DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_d record;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF p_statut NOT IN ('generee','incertaine','echec','prete') THEN RAISE EXCEPTION 'étape inconnue'; END IF;
  IF p_geste IS NOT NULL AND p_geste NOT IN ('fait','deja_fait') THEN RAISE EXCEPTION 'geste inconnu'; END IF;
  SELECT * INTO v_d FROM bordereaux_demandes WHERE id = p_id AND user_id = v_user AND action = 'generer' FOR UPDATE;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'demande_inconnue'); END IF;
  IF NOT ((v_d.statut = 'en_cours' AND p_statut IN ('generee','incertaine','echec','prete'))
       OR (v_d.statut = 'generee' AND p_statut IN ('generee','prete'))) THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'transition', 'statut', v_d.statut);
  END IF;
  IF p_statut = 'prete' AND NOT EXISTS (
       SELECT 1 FROM bordereaux_copies b WHERE b.id = p_copie AND b.user_id = v_user AND b.commande_id = v_d.commande_id) THEN
    RAISE EXCEPTION 'copie inconnue pour cette demande';
  END IF;
  UPDATE bordereaux_demandes
     SET statut = p_statut,
         motif = CASE WHEN p_statut = 'prete' THEN NULL ELSE left(nullif(btrim(coalesce(p_motif, '')), ''), 120) END,
         copie_id = CASE WHEN p_statut = 'prete' THEN p_copie ELSE copie_id END,
         geste = coalesce(geste, p_geste),
         geste_le = CASE WHEN geste_le IS NULL AND p_geste IS NOT NULL THEN now() ELSE geste_le END,
         fini_le = CASE WHEN p_statut IN ('prete','echec','incertaine') THEN now() ELSE fini_le END
   WHERE id = p_id;
  -- Une copie prête sert aussi l'éventuelle récupération de la même commande.
  IF p_statut = 'prete' THEN
    UPDATE bordereaux_demandes SET statut = 'prete', motif = NULL, copie_id = p_copie, fini_le = now()
     WHERE commande_id = v_d.commande_id AND user_id = v_user AND id <> p_id AND statut = 'generee';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$
;

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
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
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
      etat = EXCLUDED.etat, etat_plateforme = EXCLUDED.etat_plateforme, bordereau = EXCLUDED.bordereau,
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
          (EXCLUDED.etat, EXCLUDED.etat_plateforme, EXCLUDED.bordereau,
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

  RETURN jsonb_build_object('plateforme', p_platform, 'nouvelles', c_nouvelles, 'maj', c_maj,
                            'inchangees', c_inchangees, 'rattachees', c_rattachees);
END;
$function$
;


DROP FUNCTION IF EXISTS public.bordereaux_generations_closes(uuid);
DROP TABLE IF EXISTS public.bordereaux_relances_autorisees;
ALTER TABLE public.bordereaux_demandes DROP COLUMN IF EXISTS relance;
COMMIT;
