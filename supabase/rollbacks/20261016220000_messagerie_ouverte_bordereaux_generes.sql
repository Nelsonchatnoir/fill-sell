-- INVERSE de 20261016220000_messagerie_ouverte_bordereaux_generes.sql (bêta utilisable pour de vrai, 16/10 nuit).
-- Remet l'envoi sous liste blanche et ferme la génération, puis rend les fonctions de la prod
-- d'avant (pg_get_functiondef du 16/10, 22:55). Les colonnes ajoutées sont retirées ; une demande
-- de GÉNÉRATION encore en base est d'abord close (« echec », motif « retour_arriere ») pour que
-- l'ancienne contrainte de plateforme/statut tienne — rien ne repart chez une plateforme.
BEGIN;

UPDATE public.coin_config SET value = 1, updated_at = now() WHERE key = 'messagerie_envoi_mode';
UPDATE public.coin_config SET value = 0, updated_at = now() WHERE key = 'bordereaux_generation_ouverte';

-- Les réponses en attente sans liste blanche ne partent plus jamais.
UPDATE public.messagerie_reponses r SET statut = 'verrouillee', motif = 'liste_blanche'
 WHERE r.statut = 'en_attente'
   AND NOT EXISTS (SELECT 1 FROM public.messagerie_conversations mc
                    JOIN public.messagerie_liste_blanche lb ON lb.user_id = mc.user_id AND lb.platform = mc.platform
                                                           AND lb.conversation_ref = mc.conversation_ref
                   WHERE mc.id = r.conversation_id);

-- Les générations : closes, puis les colonnes et la contrainte d'avant.
DELETE FROM public.bordereaux_demandes WHERE action = 'generer' OR platform = 'beebs';
UPDATE public.bordereaux_demandes SET statut = 'echec', motif = 'retour_arriere', fini_le = now()
 WHERE statut IN ('generee','incertaine');
DROP INDEX IF EXISTS public.bordereaux_demandes_une_generation;
ALTER TABLE public.bordereaux_demandes
  DROP COLUMN IF EXISTS action, DROP COLUMN IF EXISTS choix, DROP COLUMN IF EXISTS engagement,
  DROP COLUMN IF EXISTS confirme_le, DROP COLUMN IF EXISTS geste, DROP COLUMN IF EXISTS geste_le,
  DROP COLUMN IF EXISTS essais_fichier, DROP COLUMN IF EXISTS essai_fichier_le;
ALTER TABLE public.bordereaux_demandes DROP CONSTRAINT IF EXISTS bordereaux_demandes_platform_check;
ALTER TABLE public.bordereaux_demandes ADD CONSTRAINT bordereaux_demandes_platform_check
  CHECK (platform IN ('vinted','leboncoin'));
ALTER TABLE public.bordereaux_demandes DROP CONSTRAINT IF EXISTS bordereaux_demandes_statut_check;
ALTER TABLE public.bordereaux_demandes ADD CONSTRAINT bordereaux_demandes_statut_check
  CHECK (statut IN ('demandee','en_cours','prete','echec','expiree'));

DROP FUNCTION IF EXISTS public.bordereau_generer(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.bordereau_demande_etape(uuid, text, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.bordereau_demande_a_traiter(uuid, text[]);
DROP FUNCTION IF EXISTS public.messagerie_repondre(uuid, text, text, text);

-- ── Fonctions d'avant (prod du 16/10, 22:55) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.messagerie_repondre(p_conversation uuid, p_texte text, p_cle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_conv record;
  v_existe record;
  v_texte text := btrim(coalesce(p_texte, ''));
  v_blanche boolean;
  v_jour int;
  v_statut text; v_motif text; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
  IF char_length(v_texte) < 1 OR char_length(v_texte) > 2000 THEN RAISE EXCEPTION 'texte vide ou trop long (2000 au plus)'; END IF;
  IF p_cle IS NULL OR char_length(p_cle) NOT BETWEEN 8 AND 80 THEN RAISE EXCEPTION 'clé d''envoi invalide'; END IF;
  SELECT * INTO v_existe FROM messagerie_reponses WHERE user_id = v_user AND cle = p_cle;
  IF v_existe.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existe.id, 'statut', v_existe.statut, 'motif', v_existe.motif, 'deja', true);
  END IF;
  SELECT * INTO v_conv FROM messagerie_conversations WHERE id = p_conversation AND user_id = v_user;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation inconnue'; END IF;
  v_blanche := EXISTS (SELECT 1 FROM messagerie_liste_blanche lb
                        WHERE lb.user_id = v_user AND lb.platform = v_conv.platform
                          AND lb.conversation_ref = v_conv.conversation_ref);
  SELECT count(*) INTO v_jour FROM messagerie_reponses r
   WHERE r.user_id = v_user
     AND (r.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date
     AND r.statut IN ('en_attente','en_cours','envoyee');
  IF NOT v_blanche THEN v_statut := 'verrouillee'; v_motif := 'liste_blanche';
  ELSIF v_conv.reponse_possible IS FALSE THEN v_statut := 'verrouillee'; v_motif := 'reponse_fermee_par_la_plateforme';
  ELSIF v_jour >= 20 THEN v_statut := 'verrouillee'; v_motif := 'plafond_jour';
  ELSE v_statut := 'en_attente'; v_motif := NULL;
  END IF;
  INSERT INTO messagerie_reponses (user_id, conversation_id, platform, texte, statut, motif, cle)
  VALUES (v_user, v_conv.id, v_conv.platform, v_texte, v_statut, v_motif, p_cle)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'statut', v_statut, 'motif', v_motif);
END;
$function$;

CREATE OR REPLACE FUNCTION public.messagerie_reponse_a_envoyer(p_platforms text[] DEFAULT NULL::text[], p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_r record;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('reponse', NULL, 'motif', 'beta'); END IF;

  UPDATE messagerie_reponses SET statut = 'echec', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND pris_le < now() - interval '10 minutes';

  IF EXISTS (SELECT 1 FROM messagerie_reponses r WHERE r.user_id = v_user
               AND (r.statut = 'en_cours' OR (r.statut = 'envoyee' AND r.fini_le > now() - interval '60 seconds'))) THEN
    RETURN jsonb_build_object('reponse', NULL, 'motif', 'espacement');
  END IF;

  SELECT r.id, r.platform, r.texte, mc.conversation_ref, mc.interlocuteur_ref, mc.annonce_ref
    INTO v_r
    FROM messagerie_reponses r
    JOIN messagerie_conversations mc ON mc.id = r.conversation_id AND mc.user_id = r.user_id
   WHERE r.user_id = v_user AND r.statut = 'en_attente'
     AND (p_platforms IS NULL OR r.platform = ANY (p_platforms))
     AND EXISTS (SELECT 1 FROM messagerie_liste_blanche lb
                  WHERE lb.user_id = v_user AND lb.platform = mc.platform AND lb.conversation_ref = mc.conversation_ref)
   ORDER BY r.cree_le
   LIMIT 1
   FOR UPDATE OF r SKIP LOCKED;
  IF v_r.id IS NULL THEN
    UPDATE messagerie_reponses r SET statut = 'verrouillee', motif = 'liste_blanche'
     WHERE r.user_id = v_user AND r.statut = 'en_attente'
       AND NOT EXISTS (SELECT 1 FROM messagerie_conversations mc
                        JOIN messagerie_liste_blanche lb ON lb.user_id = mc.user_id AND lb.platform = mc.platform
                                                        AND lb.conversation_ref = mc.conversation_ref
                       WHERE mc.id = r.conversation_id);
    RETURN jsonb_build_object('reponse', NULL);
  END IF;
  UPDATE messagerie_reponses SET statut = 'en_cours', pris_le = now() WHERE id = v_r.id;
  RETURN jsonb_build_object('reponse', jsonb_build_object(
    'id', v_r.id, 'platform', v_r.platform, 'texte', v_r.texte,
    'conversation_ref', v_r.conversation_ref, 'interlocuteur_ref', v_r.interlocuteur_ref,
    'annonce_ref', v_r.annonce_ref));
END;
$function$;

CREATE OR REPLACE FUNCTION public.messagerie_reponse_resultat(p_id uuid, p_ok boolean, p_resultat jsonb DEFAULT '{}'::jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_res jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  v_res := jsonb_strip_nulls(jsonb_build_object(
    'http', CASE WHEN jsonb_typeof(p_resultat -> 'http') = 'number' THEN p_resultat -> 'http' END,
    'code', left(p_resultat ->> 'code', 60),
    'message_ref', left(p_resultat ->> 'message_ref', 200),
    'motif', left(p_resultat ->> 'motif', 120)));
  UPDATE messagerie_reponses
     SET statut = CASE WHEN p_ok THEN 'envoyee' ELSE 'echec' END,
         motif = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_resultat ->> 'motif', 'echec'), 120) END,
         fini_le = now(), resultat = v_res
   WHERE id = p_id AND user_id = v_user AND statut = 'en_cours';
  RETURN jsonb_build_object('ok', FOUND);
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
  )
  SELECT jsonb_build_object(
    'beta', public.messagerie_beta(auth.uid()),
    'non_lus', coalesce((SELECT sum(non_lus) FROM c), 0),
    'conversations_non_lues', (SELECT count(*) FROM c),
    'par_article', coalesce((SELECT jsonb_object_agg(inventaire_id::text, n)
                               FROM (SELECT inventaire_id, sum(non_lus) AS n FROM c
                                      WHERE inventaire_id IS NOT NULL GROUP BY inventaire_id) a), '{}'::jsonb),
    'a_expedier', (SELECT count(*) FROM plateforme_commandes pc
                    WHERE pc.user_id = auth.uid() AND pc.etat IN ('a_confirmer','a_expedier')));
$function$;

CREATE OR REPLACE FUNCTION public.commandes_enregistrer(p_platform text, p_commandes jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_c jsonb; v_ref text; v_ann text; v_old record; v_inv bigint; v_par text; v_lien record;
  v_etat text; v_bord text; v_insere boolean;
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
      a_expedier_avant, vendue_le)
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
      nullif(v_c ->> 'vendue_le', '')::timestamptz)
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
      vendue_le = coalesce(EXCLUDED.vendue_le, pc.vendue_le), maj_le = now()
    WHERE (pc.etat, pc.etat_plateforme, pc.bordereau, pc.acheteur_pseudo, pc.titre, pc.photo_url, pc.montant,
           pc.devise, pc.annonce_ref, pc.inventaire_id, pc.rattache_par, pc.conversation_ref, pc.transporteur,
           pc.envoi_ref, pc.a_expedier_avant, pc.vendue_le)
          IS DISTINCT FROM
          (EXCLUDED.etat, EXCLUDED.etat_plateforme, EXCLUDED.bordereau,
           coalesce(EXCLUDED.acheteur_pseudo, pc.acheteur_pseudo), coalesce(EXCLUDED.titre, pc.titre),
           coalesce(EXCLUDED.photo_url, pc.photo_url), coalesce(EXCLUDED.montant, pc.montant),
           coalesce(EXCLUDED.devise, pc.devise), coalesce(EXCLUDED.annonce_ref, pc.annonce_ref),
           coalesce(EXCLUDED.inventaire_id, pc.inventaire_id), coalesce(EXCLUDED.rattache_par, pc.rattache_par),
           coalesce(EXCLUDED.conversation_ref, pc.conversation_ref), coalesce(EXCLUDED.transporteur, pc.transporteur),
           coalesce(EXCLUDED.envoi_ref, pc.envoi_ref), coalesce(EXCLUDED.a_expedier_avant, pc.a_expedier_avant),
           coalesce(EXCLUDED.vendue_le, pc.vendue_le))
    RETURNING (xmax = 0) INTO v_insere;
    IF NOT FOUND THEN c_inchangees := c_inchangees + 1;
    ELSIF v_insere THEN c_nouvelles := c_nouvelles + 1;
    ELSE c_maj := c_maj + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('plateforme', p_platform, 'nouvelles', c_nouvelles, 'maj', c_maj,
                            'inchangees', c_inchangees, 'rattachees', c_rattachees);
END;
$function$;
ALTER TABLE public.plateforme_commandes DROP COLUMN IF EXISTS options_bordereau;
ALTER TABLE public.messagerie_reponses DROP COLUMN IF EXISTS empreinte;

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
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
  SELECT c.value INTO v_ouvert FROM coin_config c WHERE c.key = 'bordereaux_ouverts';
  IF coalesce(v_ouvert, 0) <> 1 THEN RETURN jsonb_build_object('refuse', 'ferme'); END IF;

  SELECT * INTO v_cmd FROM plateforme_commandes WHERE id = p_commande AND user_id = v_user;
  IF v_cmd.id IS NULL THEN RAISE EXCEPTION 'commande inconnue'; END IF;
  IF v_cmd.platform NOT IN ('vinted','leboncoin') THEN
    RETURN jsonb_build_object('refuse', 'plateforme');
  END IF;

  SELECT b.id, b.chemin, b.expire_le INTO v_copie FROM bordereaux_copies b
   WHERE b.commande_id = v_cmd.id AND b.user_id = v_user
     AND b.efface_le IS NULL AND b.expire_le > now()
   ORDER BY b.cree_le DESC LIMIT 1;
  IF v_copie.id IS NOT NULL THEN
    RETURN jsonb_build_object('copie', v_copie.id, 'chemin', v_copie.chemin, 'expire_le', v_copie.expire_le);
  END IF;

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

CREATE OR REPLACE FUNCTION public.bordereau_demande_a_traiter(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_d record;
  v_ouvert integer;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'beta'); END IF;

  UPDATE bordereaux_demandes SET statut = 'expiree', motif = 'poste_absent', fini_le = now()
   WHERE user_id = v_user AND statut = 'demandee' AND cree_le < now() - interval '30 minutes';
  UPDATE bordereaux_demandes SET statut = 'echec', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND pris_le < now() - interval '10 minutes';

  SELECT c.value INTO v_ouvert FROM coin_config c WHERE c.key = 'bordereaux_ouverts';
  IF coalesce(v_ouvert, 0) <> 1 THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'ferme'); END IF;

  SELECT d.id, d.platform, pc.id AS commande_id, pc.commande_ref, pc.envoi_ref
    INTO v_d
    FROM bordereaux_demandes d
    JOIN plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
   WHERE d.user_id = v_user AND d.statut = 'demandee'
   ORDER BY d.cree_le
   LIMIT 1
   FOR UPDATE OF d SKIP LOCKED;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('demande', NULL); END IF;
  UPDATE bordereaux_demandes SET statut = 'en_cours', pris_le = now() WHERE id = v_d.id;
  RETURN jsonb_build_object('demande', jsonb_build_object(
    'id', v_d.id, 'platform', v_d.platform, 'commande_id', v_d.commande_id,
    'commande_ref', v_d.commande_ref, 'envoi_ref', v_d.envoi_ref));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bordereau_demande_resultat(p_id uuid, p_ok boolean, p_motif text DEFAULT NULL::text, p_copie uuid DEFAULT NULL::uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF p_ok AND NOT EXISTS (
       SELECT 1 FROM bordereaux_copies b
         JOIN bordereaux_demandes d ON d.commande_id = b.commande_id AND d.user_id = b.user_id
        WHERE b.id = p_copie AND b.user_id = v_user AND d.id = p_id) THEN
    RAISE EXCEPTION 'copie inconnue pour cette demande';
  END IF;
  UPDATE bordereaux_demandes
     SET statut = CASE WHEN p_ok THEN 'prete' ELSE 'echec' END,
         motif = CASE WHEN p_ok THEN NULL ELSE left(coalesce(nullif(btrim(p_motif), ''), 'echec'), 120) END,
         copie_id = CASE WHEN p_ok THEN p_copie ELSE NULL END,
         fini_le = now()
   WHERE id = p_id AND user_id = v_user AND statut = 'en_cours';
  RETURN jsonb_build_object('ok', FOUND);
END;
$function$;

REVOKE ALL ON FUNCTION public.messagerie_repondre(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_a_traiter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_repondre(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_a_traiter(uuid) TO authenticated, service_role;

-- La purge d'avant (copies seulement) et son cron.
CREATE OR REPLACE FUNCTION public.bordereaux_a_purger(p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, chemin text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.id, b.chemin FROM bordereaux_copies b
   WHERE b.efface_le IS NULL AND b.expire_le <= now()
   ORDER BY b.expire_le
   LIMIT greatest(1, least(coalesce(p_limite, 200), 1000));
$function$;
REVOKE ALL ON FUNCTION public.bordereaux_a_purger(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bordereaux_a_purger(integer) TO service_role;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bordereaux-purge-horaire';
SELECT cron.schedule('bordereaux-purge-horaire', '23 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/bordereaux-purge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
  WHERE EXISTS (SELECT 1 FROM public.bordereaux_copies WHERE efface_le IS NULL AND expire_le <= now());
  $cron$);

DELETE FROM public.coin_config WHERE key IN ('messagerie_envoi_mode', 'bordereaux_generation_ouverte');

COMMIT;
