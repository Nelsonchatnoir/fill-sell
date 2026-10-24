-- ═══════════════════════════════════════════════════════════════════════════
-- 20261024233000_commandes_etat_connu_jamais_efface
-- (24/10 soir, décision 3 de Nico) « Au-delà de 5 commandes Vinted en cours, les suivantes passent « inconnu » et le
-- bouton Bordereau disparaît (56 commandes en base) : corrige la RÈGLE pour tous les comptes. »
-- Cause : le relevé ne détaille que 5 commandes par passage (toujours les 5 premières jusqu'à la 0.6.137) ; les autres
-- arrivent sans état d'envoi → « inconnu », et commandes_enregistrer REMPLAÇAIT l'état connu par « inconnu ».
-- Règle (toutes versions d'extension) : un « inconnu » entrant ne remplace JAMAIS un état connu — ni l'état, ni l'état
-- plateforme, ni le bordereau ; une commande neuve est créée comme avant ; un état lu (détail, annulée, terminée)
-- s'écrit comme avant. L'extension 0.6.138 donne en plus son tour à chaque commande (le reste du correctif).
-- commandes_enregistrer réécrite depuis la définition LUE EN PROD le 24/10 (pg_get_functiondef,
-- md5 939abb2e0e96a3979c3a5b6b6ccad7ec → 1d5aaa1b61a89ecd8cf96c89c36911ea) : seuls l'UPDATE et sa comparaison changent ; droits inchangés.
-- Application (feu vert NOMMÉ de Nico seulement) :
--   npx supabase db query --linked -f supabase/migrations/20261024233000_commandes_etat_connu_jamais_efface.sql
--   npx supabase migration repair --linked --status applied 20261024233000
-- Essai à blanc (ROLLBACK) : scripts/essais/20261024233000_essai.sql — Inverse : supabase/rollbacks/20261024233000_commandes_etat_connu_jamais_efface_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE LA MIGRATION
BEGIN;

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

COMMIT;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════
