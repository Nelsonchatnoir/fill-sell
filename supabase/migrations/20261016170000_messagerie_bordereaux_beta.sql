-- ═══════════════════════════════════════════════════════════════════════════
-- CHANTIER « MESSAGES + BORDEREAUX » (16/10/2026) — BÊTA, COMPTE DE NICO SEUL
-- ═══════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/messages-bordereaux-1610/RAPPORT.md
-- Inverse : supabase/rollbacks/20261016170000_messagerie_bordereaux_beta.sql
--
-- Ce que pose cette migration (RIEN de destructif, aucune table existante
-- modifiée, aucune ligne existante réécrite) :
--   · messagerie_conversations / messagerie_messages : les conversations des
--     plateformes, relevées EN LECTURE par l'extension (Vinted, Leboncoin,
--     Depop ; Beebs quand le téléphone est vérifié) et par le serveur (eBay) ;
--   · messagerie_reponses : la file des réponses écrites dans l'app, exécutées
--     par l'extension — VERROUILLÉE par messagerie_liste_blanche (vide) ;
--   · plateforme_commandes : les commandes « à expédier » (lecture seule) ;
--   · bordereaux_copies + bucket privé `bordereaux` : la copie d'un bordereau,
--     5 jours au plus, effacée par la fonction edge bordereaux-purge ;
--   · messagerie_releves : l'état des relevés (dernier passage, pause
--     anti-robot par compte et par plateforme).
--
-- ⛔ DONNÉES PERSONNELLES, MINIMUM STRICT : le pseudo de l'interlocuteur (jamais
--    nom, adresse, téléphone, e-mail), le texte des messages (affichage seul,
--    30 jours), le pseudo de l'acheteur et le numéro de commande. Aucune
--    écriture dans usage_logs, aucun contenu dans un journal. Aucune IA.
-- ⛔ TOUT EST FERMÉ SANS profiles.beta_flags.messages_bordereaux = true :
--    chaque fonction d'écriture le relit (messagerie_beta) et refuse sinon.
-- ⛔ RLS : lecture de SES lignes seulement ; aucune écriture directe du client
--    (aucune politique INSERT/UPDATE/DELETE) — tout passe par les fonctions.
-- ⛔ La liste blanche ne s'écrit JAMAIS depuis l'app : en SQL, par Nico.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. LE DRAPEAU ──────────────────────────────────────────────────────────
-- Fermé par défaut : clé absente, valeur autre que true, profil illisible.
-- Un appelant authentifié ne peut interroger QUE son propre drapeau.
CREATE OR REPLACE FUNCTION public.messagerie_beta(p_user uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN false
    ELSE coalesce((
      SELECT (p.beta_flags -> 'messages_bordereaux') = 'true'::jsonb
        FROM profiles p
       WHERE p.id = coalesce(p_user, auth.uid())), false)
  END;
$function$;

-- ── 1. LES TABLES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messagerie_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform             text NOT NULL CHECK (platform IN ('vinted','leboncoin','beebs','depop','ebay')),
  conversation_ref     text NOT NULL CHECK (char_length(conversation_ref) BETWEEN 1 AND 200),
  interlocuteur_ref    text CHECK (interlocuteur_ref IS NULL OR char_length(interlocuteur_ref) <= 100),
  interlocuteur_pseudo text CHECK (interlocuteur_pseudo IS NULL OR char_length(interlocuteur_pseudo) <= 80),
  annonce_ref          text CHECK (annonce_ref IS NULL OR char_length(annonce_ref) <= 100),
  inventaire_id        bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  rattache_par         text CHECK (rattache_par IS NULL OR rattache_par IN ('fiche_vinted','annonce_relevee','job')),
  lien_cherche_le      timestamptz,
  titre_annonce        text CHECK (titre_annonce IS NULL OR char_length(titre_annonce) <= 200),
  photo_annonce        text CHECK (photo_annonce IS NULL OR char_length(photo_annonce) <= 600),
  cote                 text NOT NULL DEFAULT 'inconnu' CHECK (cote IN ('vendeur','acheteur','inconnu')),
  systeme              boolean NOT NULL DEFAULT false,
  dernier_message_le   timestamptz,
  dernier_extrait      text CHECK (dernier_extrait IS NULL OR char_length(dernier_extrait) <= 200),
  non_lus              integer NOT NULL DEFAULT 0 CHECK (non_lus >= 0 AND non_lus <= 9999),
  reponse_possible     boolean,
  offre_montant        numeric(12,2),
  offre_devise         text CHECK (offre_devise IS NULL OR char_length(offre_devise) <= 8),
  offre_statut         text CHECK (offre_statut IS NULL OR char_length(offre_statut) <= 60),
  commande_ref         text CHECK (commande_ref IS NULL OR char_length(commande_ref) <= 100),
  vu_dans_app_le       timestamptz,
  maj_le               timestamptz NOT NULL DEFAULT now(),
  cree_le              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, conversation_ref)
);
CREATE INDEX IF NOT EXISTS messagerie_conversations_user_date
  ON public.messagerie_conversations (user_id, dernier_message_le DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS messagerie_conversations_article
  ON public.messagerie_conversations (user_id, inventaire_id) WHERE inventaire_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messagerie_conversations_purge
  ON public.messagerie_conversations (coalesce(dernier_message_le, cree_le));
COMMENT ON TABLE public.messagerie_conversations IS
  'Bêta messagerie (16/10) : conversations relevées en LECTURE sur les plateformes. Pseudo seulement, jamais d''adresse. Purge 30 jours (messagerie_purger). Écriture : messagerie_enregistrer seulement.';

CREATE TABLE IF NOT EXISTS public.messagerie_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES public.messagerie_conversations(id) ON DELETE CASCADE,
  message_ref      text NOT NULL CHECK (char_length(message_ref) BETWEEN 1 AND 200),
  sens             text NOT NULL CHECK (sens IN ('recu','envoye','plateforme')),
  type             text NOT NULL CHECK (type IN ('texte','offre','statut','favori','systeme')),
  texte            text CHECK (texte IS NULL OR char_length(texte) <= 4000),
  offre_montant    numeric(12,2),
  offre_devise     text CHECK (offre_devise IS NULL OR char_length(offre_devise) <= 8),
  offre_statut     text CHECK (offre_statut IS NULL OR char_length(offre_statut) <= 60),
  envoye_le        timestamptz NOT NULL,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, message_ref)
);
CREATE INDEX IF NOT EXISTS messagerie_messages_conv_date
  ON public.messagerie_messages (conversation_id, envoye_le DESC);
CREATE INDEX IF NOT EXISTS messagerie_messages_purge
  ON public.messagerie_messages (envoye_le);
COMMENT ON TABLE public.messagerie_messages IS
  'Bêta messagerie (16/10) : texte des messages pour l''affichage seul (aucune IA, aucun journal). Purge 30 jours.';

CREATE TABLE IF NOT EXISTS public.messagerie_liste_blanche (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('vinted','leboncoin','beebs','depop','ebay')),
  conversation_ref text NOT NULL CHECK (char_length(conversation_ref) BETWEEN 1 AND 200),
  note             text,
  ajoute_le        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform, conversation_ref)
);
COMMENT ON TABLE public.messagerie_liste_blanche IS
  'Bêta messagerie (16/10) : SEULES conversations vers lesquelles une réponse peut partir. VIDE à la pose. Ne s''écrit qu''en SQL (Nico), jamais depuis l''app ni l''extension.';

CREATE TABLE IF NOT EXISTS public.messagerie_reponses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES public.messagerie_conversations(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('vinted','leboncoin','beebs','depop','ebay')),
  texte            text NOT NULL CHECK (char_length(btrim(texte)) BETWEEN 1 AND 2000),
  statut           text NOT NULL DEFAULT 'verrouillee'
                   CHECK (statut IN ('en_attente','verrouillee','en_cours','envoyee','echec','annulee')),
  motif            text CHECK (motif IS NULL OR char_length(motif) <= 120),
  cle              text NOT NULL CHECK (char_length(cle) BETWEEN 8 AND 80),
  cree_le          timestamptz NOT NULL DEFAULT now(),
  pris_le          timestamptz,
  fini_le          timestamptz,
  resultat         jsonb,
  UNIQUE (user_id, cle)
);
CREATE INDEX IF NOT EXISTS messagerie_reponses_file
  ON public.messagerie_reponses (user_id, statut, cree_le);
COMMENT ON TABLE public.messagerie_reponses IS
  'Bêta messagerie (16/10) : réponses écrites dans l''app. Partent par l''extension (ou le serveur pour eBay) SEULEMENT vers une conversation de la liste blanche ; sinon « verrouillee ». resultat ne porte jamais le texte.';

CREATE TABLE IF NOT EXISTS public.messagerie_releves (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('vinted','leboncoin','beebs','depop','ebay')),
  dernier_le       timestamptz,
  dernier_motif    text CHECK (dernier_motif IS NULL OR char_length(dernier_motif) <= 120),
  bloque_le        timestamptz,
  pause_jusqu_au   timestamptz,
  PRIMARY KEY (user_id, platform)
);
COMMENT ON TABLE public.messagerie_releves IS
  'Bêta messagerie (16/10) : état des relevés de messages/commandes par compte et plateforme ; pause au premier signe de blocage (6 h, 24 h si récidive).';

CREATE TABLE IF NOT EXISTS public.plateforme_commandes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform           text NOT NULL CHECK (platform IN ('vinted','leboncoin','beebs','depop','ebay')),
  commande_ref       text NOT NULL CHECK (char_length(commande_ref) BETWEEN 1 AND 100),
  etat               text NOT NULL DEFAULT 'inconnu'
                     CHECK (etat IN ('a_confirmer','a_expedier','expediee','livree','terminee','annulee','retour','litige','inconnu')),
  etat_plateforme    text CHECK (etat_plateforme IS NULL OR char_length(etat_plateforme) <= 80),
  bordereau          text NOT NULL DEFAULT 'inconnu'
                     CHECK (bordereau IN ('a_generer','a_obtenir','pret','indisponible','sans_objet','inconnu')),
  acheteur_pseudo    text CHECK (acheteur_pseudo IS NULL OR char_length(acheteur_pseudo) <= 80),
  titre              text CHECK (titre IS NULL OR char_length(titre) <= 200),
  photo_url          text CHECK (photo_url IS NULL OR char_length(photo_url) <= 600),
  montant            numeric(12,2),
  devise             text CHECK (devise IS NULL OR char_length(devise) <= 8),
  annonce_ref        text CHECK (annonce_ref IS NULL OR char_length(annonce_ref) <= 100),
  inventaire_id      bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  rattache_par       text CHECK (rattache_par IS NULL OR rattache_par IN ('fiche_vinted','annonce_relevee','job')),
  conversation_ref   text CHECK (conversation_ref IS NULL OR char_length(conversation_ref) <= 200),
  transporteur       text CHECK (transporteur IS NULL OR char_length(transporteur) <= 80),
  envoi_ref          text CHECK (envoi_ref IS NULL OR char_length(envoi_ref) <= 100),
  a_expedier_avant   timestamptz,
  vendue_le          timestamptz,
  maj_le             timestamptz NOT NULL DEFAULT now(),
  cree_le            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, commande_ref)
);
CREATE INDEX IF NOT EXISTS plateforme_commandes_user_etat
  ON public.plateforme_commandes (user_id, etat, vendue_le DESC NULLS LAST);
COMMENT ON TABLE public.plateforme_commandes IS
  'Bêta bordereaux (16/10) : commandes relevées EN LECTURE (pseudo acheteur, n° de commande, article). Ne touche jamais ventes ni inventaire. envoi_ref = identifiant du colis chez la plateforme, jamais le fichier.';

CREATE TABLE IF NOT EXISTS public.bordereaux_copies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commande_id      uuid NOT NULL REFERENCES public.plateforme_commandes(id) ON DELETE CASCADE,
  chemin           text NOT NULL UNIQUE CHECK (char_length(chemin) <= 300),
  taille_octets    integer CHECK (taille_octets IS NULL OR taille_octets BETWEEN 0 AND 5242880),
  cree_le          timestamptz NOT NULL DEFAULT now(),
  expire_le        timestamptz NOT NULL DEFAULT (now() + interval '5 days'),
  efface_le        timestamptz,
  CHECK (expire_le <= cree_le + interval '5 days')
);
CREATE INDEX IF NOT EXISTS bordereaux_copies_expire
  ON public.bordereaux_copies (expire_le) WHERE efface_le IS NULL;
COMMENT ON TABLE public.bordereaux_copies IS
  'Bêta bordereaux (16/10) : copie d''un bordereau (porte nom et adresse de l''acheteur) — 5 jours AU PLUS (contrainte), effacée par la fonction edge bordereaux-purge (cron horaire).';

-- ── 2. RLS : CHACUN LIT SES LIGNES, PERSONNE N'ÉCRIT EN DIRECT ─────────────
ALTER TABLE public.messagerie_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messagerie_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messagerie_liste_blanche ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messagerie_reponses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messagerie_releves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plateforme_commandes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bordereaux_copies        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messagerie_conversations_lecture ON public.messagerie_conversations;
CREATE POLICY messagerie_conversations_lecture ON public.messagerie_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS messagerie_messages_lecture ON public.messagerie_messages;
CREATE POLICY messagerie_messages_lecture ON public.messagerie_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS messagerie_liste_blanche_lecture ON public.messagerie_liste_blanche;
CREATE POLICY messagerie_liste_blanche_lecture ON public.messagerie_liste_blanche
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS messagerie_reponses_lecture ON public.messagerie_reponses;
CREATE POLICY messagerie_reponses_lecture ON public.messagerie_reponses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS messagerie_releves_lecture ON public.messagerie_releves;
CREATE POLICY messagerie_releves_lecture ON public.messagerie_releves
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS plateforme_commandes_lecture ON public.plateforme_commandes;
CREATE POLICY plateforme_commandes_lecture ON public.plateforme_commandes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS bordereaux_copies_lecture ON public.bordereaux_copies;
CREATE POLICY bordereaux_copies_lecture ON public.bordereaux_copies
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Règle du dépôt (CLAUDE.md, « GRANT sur toute nouvelle table ») : les droits
-- de table sont posés ; la RLS ci-dessus, sans politique d'écriture, refuse
-- toute écriture directe du client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messagerie_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messagerie_messages      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messagerie_liste_blanche TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messagerie_reponses      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messagerie_releves       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plateforme_commandes     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereaux_copies        TO authenticated;
REVOKE ALL ON public.messagerie_conversations, public.messagerie_messages, public.messagerie_liste_blanche,
              public.messagerie_reponses, public.messagerie_releves, public.plateforme_commandes,
              public.bordereaux_copies FROM anon;

-- ── 3. LE RATTACHEMENT À L'ARTICLE : PAR L'IDENTIFIANT, JAMAIS LE TITRE ────
-- Mêmes voies, même ordre que enregistrer_ventes_relevees (prod du 16/10) :
-- fiche Vinted (vinted_item_id), annonce relevée rattachée par une preuve
-- (retrait_job_prouve), dépôt FillSell prouvé désignant l'annonce
-- (listing_designe). Une fiche fusionnée renvoie à la fiche qui l'a reçue.
CREATE OR REPLACE FUNCTION public.messagerie_article_pour_annonce(p_user uuid, p_platform text, p_annonce text)
RETURNS TABLE (inventaire_id bigint, par text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ann text := nullif(btrim(coalesce(p_annonce, '')), '');
  v_inv bigint;
  v_par text;
BEGIN
  IF p_user IS NULL OR v_ann IS NULL OR p_platform IS NULL THEN RETURN; END IF;
  IF p_platform = 'vinted' THEN
    SELECT i.id INTO v_inv FROM inventaire i
     WHERE i.user_id = p_user AND i.vinted_item_id = v_ann AND i.fusionne_dans IS NULL
     ORDER BY i.id DESC LIMIT 1;
    IF v_inv IS NOT NULL THEN v_par := 'fiche_vinted'; END IF;
  END IF;
  IF v_inv IS NULL THEN
    SELECT ap.inventaire_id INTO v_inv FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform
       AND ap.listing_id = v_ann AND ap.inventaire_id IS NOT NULL
       AND public.retrait_job_prouve(ap.job_id)
     ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
    IF v_inv IS NOT NULL THEN v_par := 'annonce_relevee'; END IF;
  END IF;
  IF v_inv IS NULL THEN
    SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
     WHERE j.user_id = p_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
       AND j.action IN ('publish', 'republish') AND public.retrait_job_prouve(j.id)
       AND public.listing_designe(v_ann, j.listing_url, j.platform_listing_id)
     ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_inv IS NOT NULL THEN v_par := 'job'; END IF;
  END IF;
  IF v_inv IS NULL THEN RETURN; END IF;
  SELECT coalesce(i.fusionne_dans, i.id) INTO v_inv FROM inventaire i WHERE i.id = v_inv AND i.user_id = p_user;
  IF v_inv IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v_inv, v_par;
END;
$function$;

-- ── 4. LE RELEVÉ : AUTORISÉ ? BLOQUÉ ? ─────────────────────────────────────
-- Relu par l'extension AVANT chaque passage (fail-closed côté extension).
-- Interrupteur général : coin_config messagerie_releves_ouverts = 0 coupe tout
-- (clé absente = ouvert, mais seulement pour les comptes bêta).
CREATE OR REPLACE FUNCTION public.messagerie_releve_autorise(p_platform text, p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_pause timestamptz;
  v_coupe numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'utilisateur');
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL OR p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','beebs','depop','ebay') THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'parametres');
  END IF;
  IF NOT public.messagerie_beta(v_user) THEN
    RETURN jsonb_build_object('autorise', false, 'motif', 'beta');
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
  RETURN jsonb_build_object('autorise', true);
END;
$function$;

-- Premier signe de blocage (403, 429, captcha, DataDome, page « accès
-- restreint ») : plus AUCUN relevé de messages/commandes sur cette plateforme
-- pour ce compte pendant 6 h ; 24 h si un blocage a déjà été vu dans les 24 h.
CREATE OR REPLACE FUNCTION public.messagerie_releve_bloque(p_platform text, p_motif text, p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_avant timestamptz;
  v_duree interval;
  v_jusqu timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','beebs','depop','ebay') THEN
    RAISE EXCEPTION 'plateforme inconnue';
  END IF;
  SELECT r.bloque_le INTO v_avant FROM messagerie_releves r WHERE r.user_id = v_user AND r.platform = p_platform;
  v_duree := CASE WHEN v_avant IS NOT NULL AND v_avant > now() - interval '24 hours'
                  THEN interval '24 hours' ELSE interval '6 hours' END;
  v_jusqu := now() + v_duree;
  INSERT INTO messagerie_releves AS r (user_id, platform, dernier_le, dernier_motif, bloque_le, pause_jusqu_au)
  VALUES (v_user, p_platform, now(), left(coalesce(p_motif, 'blocage'), 120), now(), v_jusqu)
  ON CONFLICT (user_id, platform) DO UPDATE
    SET dernier_le = now(), dernier_motif = EXCLUDED.dernier_motif,
        bloque_le = now(), pause_jusqu_au = greatest(coalesce(r.pause_jusqu_au, v_jusqu), v_jusqu);
  RETURN jsonb_build_object('pause_jusqu_au', v_jusqu, 'duree_h', extract(epoch FROM v_duree) / 3600);
END;
$function$;

-- ── 5. L'ÉCRITURE D'UN RELEVÉ DE MESSAGES ──────────────────────────────────
-- Une seule porte. Bornes dures : 60 conversations et 300 messages par appel.
-- Rien de plus vieux que 30 jours n'entre. Une conversation inchangée n'est
-- JAMAIS réécrite (ON CONFLICT … WHERE … IS DISTINCT FROM). Le rattachement à
-- l'article n'est recherché qu'à la naissance, au changement d'annonce, ou une
-- fois par jour tant qu'il manque.
CREATE OR REPLACE FUNCTION public.messagerie_enregistrer(
  p_platform text, p_conversations jsonb, p_messages jsonb DEFAULT '[]'::jsonb,
  p_etat jsonb DEFAULT '{}'::jsonb, p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_c jsonb; v_m jsonb;
  v_ref text; v_ann text; v_der timestamptz; v_env timestamptz;
  v_old record; v_inv bigint; v_par text; v_cherche timestamptz;
  v_conv uuid; v_insere boolean; v_lien record;
  v_type text; v_sens text;
  c_nouvelles int := 0; c_maj int := 0; c_inchangees int := 0; c_anciennes int := 0;
  c_msg_nouveaux int := 0; c_msg_connus int := 0; c_msg_anciens int := 0; c_msg_orphelins int := 0;
  c_rattachees int := 0;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','beebs','depop','ebay') THEN
    RAISE EXCEPTION 'plateforme inconnue';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF NOT public.messagerie_beta(v_user) THEN
    RETURN jsonb_build_object('refuse', 'beta');
  END IF;
  IF jsonb_typeof(coalesce(p_conversations, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_conversations, '[]'::jsonb)) > 60 THEN
    RAISE EXCEPTION 'lot de conversations hors borne (60 au plus)';
  END IF;
  IF jsonb_typeof(coalesce(p_messages, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_messages, '[]'::jsonb)) > 300 THEN
    RAISE EXCEPTION 'lot de messages hors borne (300 au plus)';
  END IF;

  FOR v_c IN SELECT value FROM jsonb_array_elements(coalesce(p_conversations, '[]'::jsonb)) LOOP
    v_ref := nullif(btrim(coalesce(v_c ->> 'ref', '')), '');
    IF v_ref IS NULL THEN CONTINUE; END IF;
    v_der := nullif(v_c ->> 'dernier_le', '')::timestamptz;
    IF v_der IS NOT NULL AND v_der < now() - interval '30 days' THEN
      c_anciennes := c_anciennes + 1; CONTINUE;
    END IF;
    v_ann := nullif(btrim(coalesce(v_c ->> 'annonce_ref', '')), '');

    SELECT * INTO v_old FROM messagerie_conversations
     WHERE user_id = v_user AND platform = p_platform AND conversation_ref = v_ref;
    -- Un relevé PARTIEL (la liste seule, sans le détail) n'efface jamais ce
    -- qu'un relevé complet a appris : annonce, titre, photo, côté, offre.
    v_ann := coalesce(v_ann, v_old.annonce_ref);
    v_inv := v_old.inventaire_id; v_par := v_old.rattache_par; v_cherche := v_old.lien_cherche_le;
    IF v_ann IS NULL THEN
      v_inv := NULL; v_par := NULL;
    ELSIF v_old.id IS NULL OR v_old.annonce_ref IS DISTINCT FROM v_ann
          OR (v_old.inventaire_id IS NULL AND (v_old.lien_cherche_le IS NULL OR v_old.lien_cherche_le < now() - interval '1 day')) THEN
      SELECT l.inventaire_id, l.par INTO v_lien FROM public.messagerie_article_pour_annonce(v_user, p_platform, v_ann) l;
      v_inv := v_lien.inventaire_id; v_par := v_lien.par; v_cherche := now();
      IF v_inv IS NOT NULL THEN c_rattachees := c_rattachees + 1; END IF;
    END IF;

    INSERT INTO messagerie_conversations AS mc (
      user_id, platform, conversation_ref, interlocuteur_ref, interlocuteur_pseudo, annonce_ref,
      inventaire_id, rattache_par, lien_cherche_le, titre_annonce, photo_annonce, cote, systeme,
      dernier_message_le, dernier_extrait, non_lus, reponse_possible,
      offre_montant, offre_devise, offre_statut, commande_ref)
    VALUES (
      v_user, p_platform, v_ref,
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'interlocuteur_ref', '')), ''), 100), v_old.interlocuteur_ref),
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'interlocuteur_pseudo', '')), ''), 80), v_old.interlocuteur_pseudo),
      left(v_ann, 100), v_inv, v_par, v_cherche,
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'titre', '')), ''), 200), v_old.titre_annonce),
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'photo', '')), ''), 600), v_old.photo_annonce),
      CASE WHEN v_c ->> 'cote' IN ('vendeur','acheteur') THEN v_c ->> 'cote' ELSE coalesce(v_old.cote, 'inconnu') END,
      coalesce((v_c ->> 'systeme')::boolean, v_old.systeme, false),
      coalesce(v_der, v_old.dernier_message_le),
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'extrait', '')), ''), 200), v_old.dernier_extrait),
      greatest(0, least(9999, coalesce(nullif(v_c ->> 'non_lus', '')::int, v_old.non_lus, 0))),
      coalesce(nullif(v_c ->> 'reponse_possible', '')::boolean, v_old.reponse_possible),
      coalesce(nullif(v_c #>> '{offre,montant}', '')::numeric, v_old.offre_montant),
      coalesce(left(nullif(v_c #>> '{offre,devise}', ''), 8), v_old.offre_devise),
      coalesce(left(nullif(v_c #>> '{offre,statut}', ''), 60), v_old.offre_statut),
      coalesce(left(nullif(btrim(coalesce(v_c ->> 'commande_ref', '')), ''), 100), v_old.commande_ref))
    ON CONFLICT (user_id, platform, conversation_ref) DO UPDATE SET
      interlocuteur_ref = EXCLUDED.interlocuteur_ref, interlocuteur_pseudo = EXCLUDED.interlocuteur_pseudo,
      annonce_ref = EXCLUDED.annonce_ref, inventaire_id = EXCLUDED.inventaire_id,
      rattache_par = EXCLUDED.rattache_par, lien_cherche_le = EXCLUDED.lien_cherche_le,
      titre_annonce = EXCLUDED.titre_annonce, photo_annonce = EXCLUDED.photo_annonce,
      cote = EXCLUDED.cote, systeme = EXCLUDED.systeme, dernier_message_le = EXCLUDED.dernier_message_le,
      dernier_extrait = EXCLUDED.dernier_extrait, non_lus = EXCLUDED.non_lus,
      reponse_possible = EXCLUDED.reponse_possible, offre_montant = EXCLUDED.offre_montant,
      offre_devise = EXCLUDED.offre_devise, offre_statut = EXCLUDED.offre_statut,
      commande_ref = EXCLUDED.commande_ref, maj_le = now()
    WHERE (mc.interlocuteur_ref, mc.interlocuteur_pseudo, mc.annonce_ref, mc.inventaire_id, mc.rattache_par,
           mc.lien_cherche_le, mc.titre_annonce, mc.photo_annonce, mc.cote, mc.systeme, mc.dernier_message_le,
           mc.dernier_extrait, mc.non_lus, mc.reponse_possible, mc.offre_montant, mc.offre_devise,
           mc.offre_statut, mc.commande_ref)
          IS DISTINCT FROM
          (EXCLUDED.interlocuteur_ref, EXCLUDED.interlocuteur_pseudo, EXCLUDED.annonce_ref, EXCLUDED.inventaire_id,
           EXCLUDED.rattache_par, EXCLUDED.lien_cherche_le, EXCLUDED.titre_annonce, EXCLUDED.photo_annonce,
           EXCLUDED.cote, EXCLUDED.systeme, EXCLUDED.dernier_message_le, EXCLUDED.dernier_extrait,
           EXCLUDED.non_lus, EXCLUDED.reponse_possible, EXCLUDED.offre_montant, EXCLUDED.offre_devise,
           EXCLUDED.offre_statut, EXCLUDED.commande_ref)
    RETURNING (xmax = 0) INTO v_insere;
    IF NOT FOUND THEN c_inchangees := c_inchangees + 1;
    ELSIF v_insere THEN c_nouvelles := c_nouvelles + 1;
    ELSE c_maj := c_maj + 1;
    END IF;
  END LOOP;

  FOR v_m IN SELECT value FROM jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) LOOP
    v_ref := nullif(btrim(coalesce(v_m ->> 'conversation_ref', '')), '');
    v_env := nullif(v_m ->> 'envoye_le', '')::timestamptz;
    IF v_ref IS NULL OR nullif(btrim(coalesce(v_m ->> 'ref', '')), '') IS NULL OR v_env IS NULL THEN
      c_msg_orphelins := c_msg_orphelins + 1; CONTINUE;
    END IF;
    IF v_env < now() - interval '30 days' THEN c_msg_anciens := c_msg_anciens + 1; CONTINUE; END IF;
    SELECT mc.id INTO v_conv FROM messagerie_conversations mc
     WHERE mc.user_id = v_user AND mc.platform = p_platform AND mc.conversation_ref = v_ref;
    IF v_conv IS NULL THEN c_msg_orphelins := c_msg_orphelins + 1; CONTINUE; END IF;
    v_type := CASE WHEN v_m ->> 'type' IN ('texte','offre','statut','favori','systeme') THEN v_m ->> 'type' ELSE 'systeme' END;
    v_sens := CASE WHEN v_m ->> 'sens' IN ('recu','envoye','plateforme') THEN v_m ->> 'sens' ELSE 'plateforme' END;
    INSERT INTO messagerie_messages (user_id, conversation_id, message_ref, sens, type, texte,
                                     offre_montant, offre_devise, offre_statut, envoye_le)
    VALUES (v_user, v_conv, left(btrim(v_m ->> 'ref'), 200), v_sens, v_type,
            left(nullif(v_m ->> 'texte', ''), 4000),
            nullif(v_m ->> 'offre_montant', '')::numeric,
            left(nullif(v_m ->> 'offre_devise', ''), 8),
            left(nullif(v_m ->> 'offre_statut', ''), 60),
            v_env)
    ON CONFLICT (conversation_id, message_ref) DO NOTHING;
    IF FOUND THEN c_msg_nouveaux := c_msg_nouveaux + 1; ELSE c_msg_connus := c_msg_connus + 1; END IF;
  END LOOP;

  INSERT INTO messagerie_releves AS r (user_id, platform, dernier_le, dernier_motif)
  VALUES (v_user, p_platform, now(), left(nullif(p_etat ->> 'motif', ''), 120))
  ON CONFLICT (user_id, platform) DO UPDATE
    SET dernier_le = now(), dernier_motif = EXCLUDED.dernier_motif;

  RETURN jsonb_build_object(
    'plateforme', p_platform,
    'conversations_nouvelles', c_nouvelles, 'conversations_maj', c_maj,
    'conversations_inchangees', c_inchangees, 'conversations_anciennes', c_anciennes,
    'rattachees', c_rattachees,
    'messages_nouveaux', c_msg_nouveaux, 'messages_connus', c_msg_connus,
    'messages_anciens', c_msg_anciens, 'messages_orphelins', c_msg_orphelins);
END;
$function$;

-- ── 6. L'ÉCRITURE D'UN RELEVÉ DE COMMANDES ─────────────────────────────────
-- Lecture seule des plateformes : ne touche JAMAIS ventes ni inventaire
-- (la vente reste l'affaire de enregistrer_ventes_relevees et du bandeau).
CREATE OR REPLACE FUNCTION public.commandes_enregistrer(p_platform text, p_commandes jsonb, p_user uuid DEFAULT NULL)
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

-- ── 7. RÉPONDRE : ÉCRIRE DANS L'APP, PARTIR PAR L'EXTENSION ────────────────
-- La réponse est TOUJOURS enregistrée (l'app montre ce qui a été écrit), mais
-- ne passe « en_attente » (donc partante) que si la conversation est dans la
-- liste blanche ; sinon « verrouillee ». Plafond : 20 réponses par jour (heure
-- de Paris), même en liste blanche. Idempotente par `cle` (double appui).
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

-- L'extension (ou le serveur pour eBay) prend UNE réponse à la fois : liste
-- blanche RELUE au moment de la prise, au moins 60 s depuis le dernier envoi
-- du compte. Une réponse prise et jamais confirmée en 10 min passe « echec »
-- (sans_confirmation) — JAMAIS renvoyée seule : on ne sait pas si elle est
-- partie, et un message en double vers un acheteur est pire qu'un raté.
CREATE OR REPLACE FUNCTION public.messagerie_reponse_a_envoyer(p_platforms text[] DEFAULT NULL, p_user uuid DEFAULT NULL)
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
    -- Une réponse en attente dont la conversation a quitté la liste blanche
    -- est reverrouillée : elle ne partira jamais par surprise plus tard.
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

-- Le résultat rendu par l'exécutant. Seules des clés techniques sont gardées
-- (http, code, message_ref, motif) : jamais le texte, jamais une réponse brute.
CREATE OR REPLACE FUNCTION public.messagerie_reponse_resultat(p_id uuid, p_ok boolean, p_resultat jsonb DEFAULT '{}'::jsonb, p_user uuid DEFAULT NULL)
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

-- L'app : « j'ai vu cette conversation dans FillSell » (le badge s'éteint
-- jusqu'au prochain message). Ne touche RIEN chez la plateforme.
CREATE OR REPLACE FUNCTION public.messagerie_vue(p_conversation uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  UPDATE messagerie_conversations SET vu_dans_app_le = now()
   WHERE id = p_conversation AND user_id = auth.uid()
     AND (vu_dans_app_le IS NULL OR vu_dans_app_le < coalesce(dernier_message_le, cree_le));
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Les compteurs de non-lus : global et par article. Une conversation compte
-- si la plateforme la dit non lue, qu'elle n'est pas un message de la
-- plateforme elle-même, et qu'elle n'a pas été vue dans FillSell depuis son
-- dernier message.
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

-- ── 8. LES PURGES ──────────────────────────────────────────────────────────
-- 30 jours pour les messages, les conversations, les réponses ; les commandes
-- closes (livrée, terminée, annulée) 30 jours après leur dernier changement.
-- Lots bornés (p_limite par table et par passage).
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

-- Les copies de bordereaux à effacer : expirées (5 jours au plus) ou dont la
-- commande n'existe plus. La fonction edge bordereaux-purge efface le fichier
-- par l'API Storage (le SQL ne le peut pas : protect_objects_delete), puis
-- date efface_le.
CREATE OR REPLACE FUNCTION public.bordereaux_a_purger(p_limite integer DEFAULT 200)
RETURNS TABLE (id uuid, chemin text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.id, b.chemin FROM bordereaux_copies b
   WHERE b.efface_le IS NULL AND b.expire_le <= now()
   ORDER BY b.expire_le
   LIMIT greatest(1, least(coalesce(p_limite, 200), 1000));
$function$;

-- ── 9. LE BUCKET DES COPIES (PRIVÉ) ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bordereaux', 'bordereaux', false, 5242880, ARRAY['application/pdf', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS bordereaux_select ON storage.objects;
CREATE POLICY bordereaux_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bordereaux' AND (storage.foldername(name))[1] = (auth.uid())::text);
DROP POLICY IF EXISTS bordereaux_insert ON storage.objects;
CREATE POLICY bordereaux_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bordereaux' AND (storage.foldername(name))[1] = (auth.uid())::text
              AND public.messagerie_beta(auth.uid()));
DROP POLICY IF EXISTS bordereaux_delete ON storage.objects;
CREATE POLICY bordereaux_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bordereaux' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Enregistrer la copie (après le dépôt du fichier par l'extension).
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
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('refuse', 'beta'); END IF;
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

-- ── 10. LES DROITS SUR LES FONCTIONS (piège du 19/09 : REVOKE anon NOMMÉ) ──
REVOKE ALL ON FUNCTION public.messagerie_beta(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_article_pour_annonce(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.messagerie_releve_autorise(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_releve_bloque(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_enregistrer(text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commandes_enregistrer(text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_repondre(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_reponse_a_envoyer(text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_reponse_resultat(uuid, boolean, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_vue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_compteurs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_purger(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bordereaux_a_purger(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bordereau_copie_noter(uuid, text, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.messagerie_beta(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_article_pour_annonce(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_releve_autorise(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_releve_bloque(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_enregistrer(text, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commandes_enregistrer(text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_repondre(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messagerie_reponse_a_envoyer(text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_reponse_resultat(uuid, boolean, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_vue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messagerie_compteurs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.messagerie_purger(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bordereaux_a_purger(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bordereau_copie_noter(uuid, text, integer) TO authenticated;

-- ── 11. LES CRONS (UTC : cron.timezone = GMT) ──────────────────────────────
-- Purge des messages : une fois par jour, 01:55 UTC (03:55 Paris l'été).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'messagerie-purge-quotidienne';
SELECT cron.schedule('messagerie-purge-quotidienne', '55 1 * * *',
  $cron$ SET statement_timeout = '20s'; SELECT public.messagerie_purger(5000); $cron$);

-- Copies de bordereaux : toutes les heures, et la fonction edge n'est appelée
-- QUE s'il y a une copie expirée (une requête indexée sinon, rien d'autre).
-- Le secret de cron est lu dans le vault (public.cron_secret()), jamais écrit.
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

-- eBay (API officielle, serveur) : relevé des messages et des commandes à
-- expédier toutes les 20 min, SEULEMENT s'il existe un compte bêta relié à
-- eBay (sinon : une requête, rien d'autre). Fonction edge ebay-messagerie
-- (secret du vault, jamais écrit).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ebay-messagerie-20min';
SELECT cron.schedule('ebay-messagerie-20min', '7-59/20 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-messagerie',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{"mode":"releve"}'::jsonb,
    timeout_milliseconds := 60000)
  WHERE EXISTS (SELECT 1 FROM public.profiles p
                  JOIN public.ebay_accounts e ON e.user_id = p.id AND e.revoked_at IS NULL
                 WHERE (p.beta_flags -> 'messages_bordereaux') = 'true'::jsonb);
  $cron$);
