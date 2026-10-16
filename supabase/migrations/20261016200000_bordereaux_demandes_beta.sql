-- ═══════════════════════════════════════════════════════════════════════════
-- BÊTA « MESSAGES + BORDEREAUX » — LE BORDEREAU AU CLIC (16/10/2026, soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/messages-bordereaux-1610/RAPPORT.md (§ 9, clôture).
-- Inverse : supabase/rollbacks/20261016200000_bordereaux_demandes_beta.sql
--
-- Le bouton « Bordereau » de l'app (compte bêta seulement) dépose une DEMANDE.
-- L'extension du poste — seule à avoir la session de la plateforme — la prend
-- à son passage suivant (≈ 2 min), ouvre la dernière marche UNE fois (Vinted
-- pdf_label / digital_label ; Leboncoin label_url), dépose la copie (5 jours
-- au plus, bucket privé `bordereaux`, bordereau_copie_noter) et rend le
-- résultat ; l'app affiche la copie sur le téléphone.
--
-- ⛔ JAMAIS SANS UN CLIC : seule bordereau_demander (appelée par l'app, session
--    de la personne) crée une demande ; ni le serveur ni l'extension n'en
--    créent. Une demande non prise en 30 min (poste éteint) EXPIRE : elle ne
--    part jamais en retard.
-- ⛔ JAMAIS UN GESTE QUI ENGAGE : seule une commande « à expédier » dont le
--    bordereau est PRÊT chez la plateforme (Vinted 220/230/250, Leboncoin
--    available + parcel-label-generated) peut être demandée. « Commander
--    l'étiquette » (Vinted), « confirmer la disponibilité » (Leboncoin),
--    « accepter la commande » (Beebs), « acheter l'étiquette » (eBay) restent
--    des gestes du vendeur, sur la plateforme.
-- ⛔ Interrupteur : coin_config.bordereaux_ouverts = 1 (posé ici) ; 0 ou absent
--    ferme tout (demande refusée « ferme », extension sans dernière marche).
--
-- Ce qui change dans l'existant : messagerie_purger, RÉÉCRITE DEPUIS LA PROD
-- (pg_get_functiondef du 16/10) + les demandes de plus de 30 jours + toute
-- commande restée 60 jours sans changement (une commande « à expédier » que la
-- plateforme ne rend plus ne reste pas éternellement à l'écran).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LA TABLE DES DEMANDES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bordereaux_demandes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commande_id  uuid NOT NULL REFERENCES public.plateforme_commandes(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('vinted','leboncoin')),
  statut       text NOT NULL DEFAULT 'demandee'
               CHECK (statut IN ('demandee','en_cours','prete','echec','expiree')),
  motif        text CHECK (motif IS NULL OR char_length(motif) <= 120),
  copie_id     uuid REFERENCES public.bordereaux_copies(id) ON DELETE SET NULL,
  cree_le      timestamptz NOT NULL DEFAULT now(),
  pris_le      timestamptz,
  fini_le      timestamptz
);
-- Une seule demande vivante par commande (un double appui ne double rien).
CREATE UNIQUE INDEX IF NOT EXISTS bordereaux_demandes_une_vivante
  ON public.bordereaux_demandes (commande_id) WHERE statut IN ('demandee','en_cours');
CREATE INDEX IF NOT EXISTS bordereaux_demandes_file
  ON public.bordereaux_demandes (user_id, statut, cree_le);
COMMENT ON TABLE public.bordereaux_demandes IS
  'Bêta bordereaux (16/10 soir) : une demande = UN clic sur « Bordereau » dans l''app. Prise par l''extension (bordereau_demande_a_traiter), qui dépose la copie (5 jours au plus). Jamais créée sans clic ; expirée après 30 min sans poste.';

ALTER TABLE public.bordereaux_demandes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bordereaux_demandes_lecture ON public.bordereaux_demandes;
CREATE POLICY bordereaux_demandes_lecture ON public.bordereaux_demandes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Droits de table posés (règle du dépôt) ; sans politique d'écriture, la RLS
-- refuse toute écriture directe : tout passe par les fonctions ci-dessous.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereaux_demandes TO authenticated;
REVOKE ALL ON public.bordereaux_demandes FROM anon;

-- ── 2. L'APP : DEMANDER LE BORDEREAU (UN CLIC) ─────────────────────────────
-- Rend : {copie, chemin, expire_le} si une copie valable existe déjà (rien ne
-- repart chez la plateforme) ; {id, statut} pour une demande neuve ou déjà
-- vivante ; {refuse: beta | ferme | plateforme | pas_pret | plafond_jour}.
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

  -- Une copie encore valable : on la rend, rien ne repart chez la plateforme.
  SELECT b.id, b.chemin, b.expire_le INTO v_copie FROM bordereaux_copies b
   WHERE b.commande_id = v_cmd.id AND b.user_id = v_user
     AND b.efface_le IS NULL AND b.expire_le > now()
   ORDER BY b.cree_le DESC LIMIT 1;
  IF v_copie.id IS NOT NULL THEN
    RETURN jsonb_build_object('copie', v_copie.id, 'chemin', v_copie.chemin, 'expire_le', v_copie.expire_le);
  END IF;

  -- Seul un bordereau PRÊT chez la plateforme se demande : jamais un geste qui engage.
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

-- ── 3. L'EXTENSION : PRENDRE UNE DEMANDE ───────────────────────────────────
-- UNE demande à la fois. Une demande jamais prise en 30 min expire (poste
-- éteint) ; une demande prise et jamais rendue en 10 min passe « echec ».
CREATE OR REPLACE FUNCTION public.bordereau_demande_a_traiter(p_user uuid DEFAULT NULL)
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

-- ── 4. L'EXTENSION : RENDRE LE RÉSULTAT ────────────────────────────────────
-- Une copie rendue doit appartenir au compte ET à la commande de la demande.
CREATE OR REPLACE FUNCTION public.bordereau_demande_resultat(p_id uuid, p_ok boolean, p_motif text DEFAULT NULL,
                                                             p_copie uuid DEFAULT NULL, p_user uuid DEFAULT NULL)
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

-- ── 5. LA PURGE (réécrite depuis la prod du 16/10) ─────────────────────────
CREATE OR REPLACE FUNCTION public.messagerie_purger(p_limite integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m int; v_r int; v_c int; v_cmd int; v_dem int;
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
  -- (16/10 soir) Les demandes de bordereau : 30 jours.
  DELETE FROM bordereaux_demandes WHERE id IN (
    SELECT id FROM bordereaux_demandes WHERE cree_le < now() - interval '30 days' LIMIT p_limite);
  GET DIAGNOSTICS v_dem = ROW_COUNT;
  -- Commandes closes : 30 jours ; (16/10 soir) toute commande figée 60 jours.
  DELETE FROM plateforme_commandes WHERE id IN (
    SELECT id FROM plateforme_commandes
     WHERE (etat IN ('livree','terminee','annulee') AND maj_le < now() - interval '30 days')
        OR maj_le < now() - interval '60 days'
     LIMIT p_limite);
  GET DIAGNOSTICS v_cmd = ROW_COUNT;
  RETURN jsonb_build_object('messages', v_m, 'reponses', v_r, 'conversations', v_c, 'commandes', v_cmd,
                            'demandes', v_dem);
END;
$function$;

-- ── 6. LES DROITS (REVOKE anon NOMMÉ) ──────────────────────────────────────
REVOKE ALL ON FUNCTION public.bordereau_demander(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_a_traiter(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bordereau_demande_resultat(uuid, boolean, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messagerie_purger(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bordereau_demander(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_a_traiter(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bordereau_demande_resultat(uuid, boolean, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messagerie_purger(integer) TO service_role;

-- ── 7. L'INTERRUPTEUR : DERNIÈRE MARCHE OUVERTE (au clic seulement) ────────
INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_ouverts', 1)
ON CONFLICT (key) DO UPDATE SET value = 1, updated_at = now();
