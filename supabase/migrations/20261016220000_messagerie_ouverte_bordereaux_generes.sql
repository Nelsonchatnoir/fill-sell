-- ═══════════════════════════════════════════════════════════════════════════
-- BÊTA « MESSAGES + À EXPÉDIER » — UTILISABLE POUR DE VRAI (16/10/2026, nuit)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mission de Nico du 16/10 au soir : Nico ET Ornella testent tout eux-mêmes.
-- Rapport : docs/enquetes/messages-bordereaux-1610/RAPPORT.md (§ 10).
-- Inverse : supabase/rollbacks/20261016220000_messagerie_ouverte_bordereaux_generes.sql
--
-- 1. RÉPONDRE SANS LISTE BLANCHE (comptes bêta). Interrupteur
--    coin_config.messagerie_envoi_mode : 0 = fermé, 1 = liste blanche (le
--    fonctionnement d'avant ; c'est aussi la valeur si la clé manque),
--    2 = ouvert aux comptes bêta (posé ici). Garde-fous, tous en base :
--    · une réponse ne naît que d'un appui dans l'app (session de la personne :
--      messagerie_repondre exige auth.uid()) ;
--    · jamais deux fois : même clé d'envoi = même réponse (UNIQUE (user_id,
--      cle)) ; même texte vers la même conversation dans les 10 minutes = la
--      même réponse ; l'exécutant prend UNE réponse à la fois (FOR UPDATE SKIP
--      LOCKED) et une réponse prise jamais confirmée n'est JAMAIS renvoyée ;
--    · le texte envoyé est EXACTEMENT celui saisi : plus aucun btrim, et une
--      empreinte SHA-256 du texte, calculée ici (et comparée à celle que l'app
--      a calculée, si elle la donne) puis revérifiée par l'exécutant juste
--      avant l'envoi ;
--    · la trace : chaque réponse garde statut, prise, fin, empreinte et le
--      résultat technique (http, code, numéro du message, exécutant).
-- 2. GÉNÉRER LE BORDEREAU DEPUIS L'APP (Vinted « commander l'étiquette »,
--    Leboncoin « confirmer la disponibilité », Beebs « accepter la
--    commande ») — UNIQUEMENT sur un appui après l'écran de confirmation :
--    bordereau_generer exige la phrase d'engagement affichée (gardée en base).
--    Interrupteur coin_config.bordereaux_generation_ouverte = 1 (posé ici).
--    UNE SEULE génération par commande, à vie : index unique partiel (demandée,
--    en cours, générée, prête, incertaine) ; une génération prise et jamais
--    confirmée passe « incertaine » (on ne sait pas si la plateforme l'a reçue)
--    et bloque toute nouvelle génération ; l'extension relit l'état de la
--    plateforme AVANT le geste (déjà commandée = on récupère, rien de plus).
--    Les extensions d'avant (sans la capacité « generer ») ne reçoivent
--    jamais une demande de génération.
-- 3. Les choix de bordereau relevés en LECTURE (options_bordereau) pour l'écran
--    de confirmation (transporteur, étiquette papier ou code…).
--
-- Rien de destructif : aucune ligne existante réécrite (0 réponse, 0 demande,
-- 0 copie, 0 commande en base le 16/10 à 22:52) ; colonnes ajoutées NULL ou à
-- défaut ; fonctions réécrites DEPUIS LA PROD (pg_get_functiondef du 16/10,
-- 22:55) ; deux signatures changent (messagerie_repondre +p_empreinte,
-- bordereau_demande_a_traiter +p_capacites) : l'ancienne est supprimée pour
-- qu'un appel nommé n'ait jamais deux candidates.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. LES INTERRUPTEURS ───────────────────────────────────────────────────
INSERT INTO public.coin_config (key, value) VALUES ('messagerie_envoi_mode', 2)
ON CONFLICT (key) DO UPDATE SET value = 2, updated_at = now();
INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_generation_ouverte', 1)
ON CONFLICT (key) DO UPDATE SET value = 1, updated_at = now();

-- ── 1. LES COLONNES ────────────────────────────────────────────────────────
ALTER TABLE public.messagerie_reponses
  ADD COLUMN IF NOT EXISTS empreinte text CHECK (empreinte IS NULL OR empreinte ~ '^[0-9a-f]{64}$');
COMMENT ON COLUMN public.messagerie_reponses.empreinte IS
  'SHA-256 (hex) du texte EXACT saisi dans l''app ; l''exécutant la recalcule avant l''envoi et refuse si elle diffère (16/10 nuit).';

ALTER TABLE public.plateforme_commandes
  ADD COLUMN IF NOT EXISTS options_bordereau jsonb
  CHECK (options_bordereau IS NULL OR (jsonb_typeof(options_bordereau) = 'object' AND length(options_bordereau::text) <= 2000));
COMMENT ON COLUMN public.plateforme_commandes.options_bordereau IS
  'Ce que la plateforme propose pour générer le bordereau, relevé EN LECTURE (Vinted label_options : transporteur, dépôts, types d''étiquette ; Leboncoin : type d''envoi ; Beebs : transporteur). Jamais d''adresse, jamais de téléphone.';

ALTER TABLE public.bordereaux_demandes DROP CONSTRAINT IF EXISTS bordereaux_demandes_platform_check;
ALTER TABLE public.bordereaux_demandes ADD CONSTRAINT bordereaux_demandes_platform_check
  CHECK (platform IN ('vinted','leboncoin','beebs'));
ALTER TABLE public.bordereaux_demandes DROP CONSTRAINT IF EXISTS bordereaux_demandes_statut_check;
ALTER TABLE public.bordereaux_demandes ADD CONSTRAINT bordereaux_demandes_statut_check
  CHECK (statut IN ('demandee','en_cours','prete','echec','expiree','generee','incertaine'));
ALTER TABLE public.bordereaux_demandes
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'recuperer' CHECK (action IN ('recuperer','generer')),
  ADD COLUMN IF NOT EXISTS choix jsonb CHECK (choix IS NULL OR (jsonb_typeof(choix) = 'object' AND length(choix::text) <= 500)),
  ADD COLUMN IF NOT EXISTS engagement text CHECK (engagement IS NULL OR char_length(engagement) BETWEEN 10 AND 400),
  ADD COLUMN IF NOT EXISTS confirme_le timestamptz,
  ADD COLUMN IF NOT EXISTS geste text CHECK (geste IS NULL OR geste IN ('fait','deja_fait')),
  ADD COLUMN IF NOT EXISTS geste_le timestamptz,
  ADD COLUMN IF NOT EXISTS essais_fichier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS essai_fichier_le timestamptz;
-- UNE génération par commande, à vie (une échouée AVANT le geste ou expirée
-- sans poste n'a rien fait chez la plateforme : elle ne compte pas).
CREATE UNIQUE INDEX IF NOT EXISTS bordereaux_demandes_une_generation
  ON public.bordereaux_demandes (commande_id)
  WHERE action = 'generer' AND statut IN ('demandee','en_cours','generee','prete','incertaine');
COMMENT ON COLUMN public.bordereaux_demandes.engagement IS
  'La phrase de l''écran de confirmation, telle qu''affichée et acceptée par la personne (génération seulement).';

-- ── 2. RÉPONDRE : L'APP ENREGISTRE (texte exact, empreinte, une seule fois) ─
DROP FUNCTION IF EXISTS public.messagerie_repondre(uuid, text, text);
CREATE OR REPLACE FUNCTION public.messagerie_repondre(p_conversation uuid, p_texte text, p_cle text, p_empreinte text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_conv record;
  v_existe record;
  v_texte text := p_texte;
  v_empreinte text;
  v_mode integer;
  v_blanche boolean;
  v_jour int;
  v_statut text; v_motif text; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
  -- (16/10 nuit) Le texte est gardé TEL QUEL (plus de btrim) : il ne doit
  -- simplement pas être vide.
  IF v_texte IS NULL OR char_length(btrim(v_texte)) < 1 OR char_length(v_texte) > 2000 THEN
    RAISE EXCEPTION 'texte vide ou trop long (2000 au plus)';
  END IF;
  IF p_cle IS NULL OR char_length(p_cle) NOT BETWEEN 8 AND 80 THEN RAISE EXCEPTION 'clé d''envoi invalide'; END IF;
  v_empreinte := encode(sha256(convert_to(v_texte, 'UTF8')), 'hex');
  IF p_empreinte IS NOT NULL AND lower(p_empreinte) <> v_empreinte THEN
    RAISE EXCEPTION 'texte altéré en route (empreinte différente)';
  END IF;
  -- Même clé : c'est le même envoi (double appui, réseau rejoué).
  SELECT * INTO v_existe FROM messagerie_reponses WHERE user_id = v_user AND cle = p_cle;
  IF v_existe.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existe.id, 'statut', v_existe.statut, 'motif', v_existe.motif, 'deja', true);
  END IF;
  SELECT * INTO v_conv FROM messagerie_conversations WHERE id = p_conversation AND user_id = v_user;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation inconnue'; END IF;
  -- Même texte, même conversation, moins de 10 minutes : c'est le même envoi
  -- (deux téléphones, ou une clé perdue) — jamais deux fois chez l'acheteur.
  SELECT * INTO v_existe FROM messagerie_reponses r
   WHERE r.user_id = v_user AND r.conversation_id = v_conv.id AND r.empreinte = v_empreinte
     AND r.statut IN ('en_attente','en_cours','envoyee') AND r.cree_le > now() - interval '10 minutes'
   ORDER BY r.cree_le DESC LIMIT 1;
  IF v_existe.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existe.id, 'statut', v_existe.statut, 'motif', v_existe.motif, 'deja', true, 'meme_texte', true);
  END IF;
  SELECT c.value INTO v_mode FROM coin_config c WHERE c.key = 'messagerie_envoi_mode';
  v_mode := coalesce(v_mode, 1);
  v_blanche := EXISTS (SELECT 1 FROM messagerie_liste_blanche lb
                        WHERE lb.user_id = v_user AND lb.platform = v_conv.platform
                          AND lb.conversation_ref = v_conv.conversation_ref);
  SELECT count(*) INTO v_jour FROM messagerie_reponses r
   WHERE r.user_id = v_user
     AND (r.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date
     AND r.statut IN ('en_attente','en_cours','envoyee');
  IF v_mode = 0 THEN v_statut := 'verrouillee'; v_motif := 'envoi_ferme';
  ELSIF v_mode = 1 AND NOT v_blanche THEN v_statut := 'verrouillee'; v_motif := 'liste_blanche';
  ELSIF v_conv.reponse_possible IS FALSE THEN v_statut := 'verrouillee'; v_motif := 'reponse_fermee_par_la_plateforme';
  ELSIF v_jour >= 20 THEN v_statut := 'verrouillee'; v_motif := 'plafond_jour';
  ELSE v_statut := 'en_attente'; v_motif := NULL;
  END IF;
  INSERT INTO messagerie_reponses (user_id, conversation_id, platform, texte, statut, motif, cle, empreinte)
  VALUES (v_user, v_conv.id, v_conv.platform, v_texte, v_statut, v_motif, p_cle, v_empreinte)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'statut', v_statut, 'motif', v_motif, 'empreinte', v_empreinte);
END;
$function$;

-- ── 3. RÉPONDRE : L'EXÉCUTANT PREND UNE RÉPONSE (mode relu à la prise) ─────
CREATE OR REPLACE FUNCTION public.messagerie_reponse_a_envoyer(p_platforms text[] DEFAULT NULL::text[], p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_r record;
  v_mode integer;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('reponse', NULL, 'motif', 'beta'); END IF;

  UPDATE messagerie_reponses SET statut = 'echec', motif = 'sans_confirmation', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_cours' AND pris_le < now() - interval '10 minutes';
  -- (16/10 nuit) Une réponse qu'aucun poste n'a prise en 24 h ne part JAMAIS en
  -- retard (ordinateur éteint plusieurs jours : la conversation a pu changer).
  UPDATE messagerie_reponses SET statut = 'echec', motif = 'trop_ancienne', fini_le = now()
   WHERE user_id = v_user AND statut = 'en_attente' AND cree_le < now() - interval '24 hours';

  SELECT c.value INTO v_mode FROM coin_config c WHERE c.key = 'messagerie_envoi_mode';
  v_mode := coalesce(v_mode, 1);
  -- (16/10 nuit) Envoi fermé : toute réponse en attente est reverrouillée —
  -- elle ne partira jamais par surprise à la réouverture.
  IF v_mode = 0 THEN
    UPDATE messagerie_reponses SET statut = 'verrouillee', motif = 'envoi_ferme'
     WHERE user_id = v_user AND statut = 'en_attente';
    RETURN jsonb_build_object('reponse', NULL, 'motif', 'envoi_ferme');
  END IF;

  IF EXISTS (SELECT 1 FROM messagerie_reponses r WHERE r.user_id = v_user
               AND (r.statut = 'en_cours' OR (r.statut = 'envoyee' AND r.fini_le > now() - interval '60 seconds'))) THEN
    RETURN jsonb_build_object('reponse', NULL, 'motif', 'espacement');
  END IF;

  SELECT r.id, r.platform, r.texte, r.empreinte, mc.conversation_ref, mc.interlocuteur_ref, mc.annonce_ref
    INTO v_r
    FROM messagerie_reponses r
    JOIN messagerie_conversations mc ON mc.id = r.conversation_id AND mc.user_id = r.user_id
   WHERE r.user_id = v_user AND r.statut = 'en_attente'
     AND (p_platforms IS NULL OR r.platform = ANY (p_platforms))
     AND (v_mode = 2 OR EXISTS (SELECT 1 FROM messagerie_liste_blanche lb
                  WHERE lb.user_id = v_user AND lb.platform = mc.platform AND lb.conversation_ref = mc.conversation_ref))
   ORDER BY r.cree_le
   LIMIT 1
   FOR UPDATE OF r SKIP LOCKED;
  IF v_r.id IS NULL THEN
    -- Mode liste blanche : une réponse en attente dont la conversation a
    -- quitté la liste est reverrouillée (inchangé).
    IF v_mode = 1 THEN
      UPDATE messagerie_reponses r SET statut = 'verrouillee', motif = 'liste_blanche'
       WHERE r.user_id = v_user AND r.statut = 'en_attente'
         AND NOT EXISTS (SELECT 1 FROM messagerie_conversations mc
                          JOIN messagerie_liste_blanche lb ON lb.user_id = mc.user_id AND lb.platform = mc.platform
                                                          AND lb.conversation_ref = mc.conversation_ref
                         WHERE mc.id = r.conversation_id);
    END IF;
    RETURN jsonb_build_object('reponse', NULL);
  END IF;
  UPDATE messagerie_reponses SET statut = 'en_cours', pris_le = now() WHERE id = v_r.id;
  RETURN jsonb_build_object('reponse', jsonb_build_object(
    'id', v_r.id, 'platform', v_r.platform, 'texte', v_r.texte,
    'empreinte', coalesce(v_r.empreinte, encode(sha256(convert_to(v_r.texte, 'UTF8')), 'hex')),
    'conversation_ref', v_r.conversation_ref, 'interlocuteur_ref', v_r.interlocuteur_ref,
    'annonce_ref', v_r.annonce_ref));
END;
$function$;

-- ── 4. RÉPONDRE : LE RÉSULTAT (clés techniques seulement, jamais le texte) ──
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
    'motif', left(p_resultat ->> 'motif', 120),
    -- (16/10 nuit) Qui a envoyé (build de l'extension, ou « serveur ») et la
    -- vérification de l'empreinte juste avant l'envoi.
    'executant', left(p_resultat ->> 'executant', 80),
    'empreinte_ok', CASE WHEN jsonb_typeof(p_resultat -> 'empreinte_ok') = 'boolean' THEN p_resultat -> 'empreinte_ok' END));
  UPDATE messagerie_reponses
     SET statut = CASE WHEN p_ok THEN 'envoyee' ELSE 'echec' END,
         motif = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_resultat ->> 'motif', 'echec'), 120) END,
         fini_le = now(), resultat = v_res
   WHERE id = p_id AND user_id = v_user AND statut = 'en_cours';
  RETURN jsonb_build_object('ok', FOUND);
END;
$function$;

-- ── 5. LES COMPTEURS : + le mode d'envoi et la génération (pour l'écran) ────
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
                    WHERE pc.user_id = auth.uid() AND pc.etat IN ('a_confirmer','a_expedier')),
    -- (16/10 nuit) Ce que l'écran doit dire : envoi ouvert, liste blanche ou
    -- fermé ; génération des bordereaux ouverte ou non. Comptes bêta seulement.
    'envoi_mode', CASE WHEN public.messagerie_beta(auth.uid())
                       THEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'messagerie_envoi_mode'), 1) END,
    'generation', CASE WHEN public.messagerie_beta(auth.uid())
                       THEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_generation_ouverte'), 0) = 1
                        AND coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_ouverts'), 0) = 1 END);
$function$;

-- ── 6. COMMANDES : + options_bordereau (relevé EN LECTURE) ─────────────────
-- Réécrite depuis la prod (16/10, 22:55) ; seule nouveauté : options_bordereau,
-- gardée quand le relevé ne la porte pas, et comparée comme les autres champs
-- (une commande inchangée n'est JAMAIS réécrite).
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
$function$;

-- ── 7. BORDEREAU : RÉCUPÉRER (au clic) — Beebs admis, réécrite depuis la prod ─
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
  IF v_cmd.platform NOT IN ('vinted','leboncoin','beebs') THEN
    RETURN jsonb_build_object('refuse', 'plateforme');
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

-- ── 8. BORDEREAU : GÉNÉRER (appui APRÈS l'écran de confirmation) ───────────
-- Rend : {copie…} si une copie valable existe ; {id, statut, deja} pour la
-- génération déjà née (JAMAIS une seconde) ; {id, statut} pour une demande
-- neuve ; {refuse: beta | ferme | plateforme | pas_a_generer | engagement |
-- choix | plafond_jour}. Un bordereau déjà prêt se récupère (bordereau_demander).
CREATE OR REPLACE FUNCTION public.bordereau_generer(p_commande uuid, p_choix jsonb DEFAULT '{}'::jsonb, p_engagement text DEFAULT NULL)
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
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
  IF coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_ouverts'), 0) <> 1
     OR coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    RETURN jsonb_build_object('refuse', 'ferme');
  END IF;

  SELECT * INTO v_cmd FROM plateforme_commandes WHERE id = p_commande AND user_id = v_user;
  IF v_cmd.id IS NULL THEN RAISE EXCEPTION 'commande inconnue'; END IF;
  IF v_cmd.platform NOT IN ('vinted','leboncoin','beebs') THEN
    RETURN jsonb_build_object('refuse', 'plateforme');
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

-- ── 9. L'EXTENSION : PRENDRE UNE DEMANDE (ou la suite d'une génération) ────
-- p_capacites : ce que l'extension sait faire. Sans « generer » (extensions
-- d'avant), aucune demande de génération n'est jamais rendue. Une demande non
-- prise en 30 min expire (poste éteint) ; une RÉCUPÉRATION prise et jamais
-- rendue en 10 min passe « echec » ; une GÉNÉRATION prise et jamais rendue
-- passe « incertaine » (la plateforme a pu la recevoir) et bloque toute autre.
-- Sans demande neuve : la plus ancienne génération faite dont le fichier
-- manque (« suite » : 15 essais au plus, 2 min d'écart, 24 h après le geste).
DROP FUNCTION IF EXISTS public.bordereau_demande_a_traiter(uuid);
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

  UPDATE bordereaux_demandes SET statut = 'expiree', motif = 'poste_absent', fini_le = now()
   WHERE user_id = v_user AND statut = 'demandee' AND cree_le < now() - interval '30 minutes';
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

-- ── 10. L'EXTENSION : LES ÉTAPES D'UNE GÉNÉRATION ──────────────────────────
-- en_cours → generee (geste fait, ou trouvé déjà fait) | incertaine (geste
-- tenté, issue inconnue) | echec (RIEN n'a été fait chez la plateforme) |
-- prete (copie) ; generee → generee (motif du fichier) | prete.
CREATE OR REPLACE FUNCTION public.bordereau_demande_etape(p_id uuid, p_statut text, p_motif text DEFAULT NULL::text,
                                                          p_copie uuid DEFAULT NULL::uuid, p_geste text DEFAULT NULL::text,
                                                          p_user uuid DEFAULT NULL::uuid)
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
$function$;

-- ── 11. LA RÉCUPÉRATION : son résultat (réécrite depuis la prod) ───────────
-- Seule nouveauté : une copie prête ferme aussi la génération « générée » de
-- la même commande (même fichier, jamais deux suites).
CREATE OR REPLACE FUNCTION public.bordereau_demande_resultat(p_id uuid, p_ok boolean, p_motif text DEFAULT NULL::text, p_copie uuid DEFAULT NULL::uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_cmd uuid;
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
   WHERE id = p_id AND user_id = v_user AND statut = 'en_cours' AND action = 'recuperer'
  RETURNING commande_id INTO v_cmd;
  IF v_cmd IS NOT NULL AND p_ok THEN
    UPDATE bordereaux_demandes SET statut = 'prete', motif = NULL, copie_id = p_copie, fini_le = now()
     WHERE commande_id = v_cmd AND user_id = v_user AND statut = 'generee';
  END IF;
  RETURN jsonb_build_object('ok', v_cmd IS NOT NULL);
END;
$function$;

-- ── 12bis. LES FICHIERS QU'AUCUNE COPIE NE TIENT : 24 h AU PLUS ────────────
-- Le module d'impression de l'app (src/messagerie/impression/) dépose, quand
-- l'appareil ne sait pas partager un fichier (WebView Android, repli iOS), le
-- PDF qu'il a fabriqué (10 × 15, « Tout imprimer ») dans le dossier privé du
-- compte, sous <uid>/impressions/, pour l'ouvrir par une adresse signée. Ces
-- fichiers — et tout fichier du bucket qu'aucune copie vivante ne tient (dépôt
-- jamais noté) — sont rendus à la purge après 24 h (id NULL : rien à dater ;
-- bordereaux-purge v2 le sait). Réécrite depuis la prod (16/10, 22:55).
CREATE OR REPLACE FUNCTION public.bordereaux_a_purger(p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, chemin text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  (SELECT b.id, b.chemin FROM bordereaux_copies b
    WHERE b.efface_le IS NULL AND b.expire_le <= now()
    ORDER BY b.expire_le
    LIMIT greatest(1, least(coalesce(p_limite, 200), 1000)))
  UNION ALL
  (SELECT NULL::uuid, o.name FROM storage.objects o
    WHERE o.bucket_id = 'bordereaux' AND o.created_at < now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM bordereaux_copies b WHERE b.chemin = o.name AND b.efface_le IS NULL)
    ORDER BY o.created_at
    LIMIT greatest(1, least(coalesce(p_limite, 200), 1000)));
$function$;
REVOKE ALL ON FUNCTION public.bordereaux_a_purger(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bordereaux_a_purger(integer) TO service_role;

-- Le cron horaire n'appelle la fonction edge QUE s'il y a quelque chose à effacer.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bordereaux-purge-horaire';
SELECT cron.schedule('bordereaux-purge-horaire', '23 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/bordereaux-purge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
  WHERE EXISTS (SELECT 1 FROM public.bordereaux_copies WHERE efface_le IS NULL AND expire_le <= now())
     OR EXISTS (SELECT 1 FROM storage.objects o
                 WHERE o.bucket_id = 'bordereaux' AND o.created_at < now() - interval '24 hours'
                   AND NOT EXISTS (SELECT 1 FROM public.bordereaux_copies b WHERE b.chemin = o.name AND b.efface_le IS NULL));
  $cron$);

-- ── 12. LES DROITS (piège du 19/09 : REVOKE anon NOMMÉ) ────────────────────
REVOKE ALL ON FUNCTION public.messagerie_repondre(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_reponse_a_envoyer(text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_reponse_resultat(uuid, boolean, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_compteurs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commandes_enregistrer(text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demander(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_generer(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_a_traiter(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_etape(uuid, text, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_resultat(uuid, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_repondre(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messagerie_reponse_a_envoyer(text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_reponse_resultat(uuid, boolean, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_compteurs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commandes_enregistrer(text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bordereau_demander(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bordereau_generer(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_a_traiter(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_etape(uuid, text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_resultat(uuid, boolean, text, uuid, uuid) TO authenticated, service_role;
