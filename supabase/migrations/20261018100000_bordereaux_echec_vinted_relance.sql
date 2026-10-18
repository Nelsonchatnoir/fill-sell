-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — BORDEREAUX VINTED : L'ÉCHEC DE VINTED SE DIT, LA BOUCLE S'ARRÊTE,
--         ZÉRO NOUVEL ÉCHEC, UNE RELANCE AUTORISÉE (lot 1, chantier « zéro orange »)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (Louis, 18/10, 2 commandes Vinted Go) : l'extension a commandé
-- l'étiquette (PUT transactions/<id>/shipment/order, 09:53:15 et 09:55:14) ;
-- Vinted a écrit « Échec du bordereau d'envoi » UNE seconde après (envoi 210,
-- LabelFailed). Cause (code du site de Vinted relu le 18/10) : Vinted nomme les
-- types d'étiquette en toutes lettres (« printable », « digital », « code ») ;
-- l'extension (0.6.125 et avant) les lisait comme des chiffres 1/2/3 et les
-- jetait tous — elle commandait SANS type alors que Vinted en proposait
-- plusieurs. Correctif dans l'extension 0.6.126 (CAPACITES_BORDEREAU).
-- En base, ensuite : la demande restait « générée » (l'app disait « Bordereau
-- généré sur Vinted : récupération du fichier… ») et la suite relisait le
-- fichier 15 fois, jusqu'à 10:55.
--
-- LA RÈGLE (tous les comptes) :
--  1. Une génération « générée » sans copie dont la commande est en ÉCHEC chez
--     Vinted (bordereau 'indisponible' = envoi 210) devient « echec »
--     (etiquette_echouee_chez_vinted) — commande annulée : « echec »
--     (commande_annulee). Fait à chaque relevé des commandes et à chaque prise
--     (bordereaux_generations_closes) ; la suite ne relit plus ces fichiers.
--  2. Une génération Vinted n'est plus donnée qu'à une extension qui envoie le
--     type d'étiquette en toutes lettres (capacité « vinted_types_texte »,
--     0.6.126). Une extension d'avant ne la prend pas ; si aucune extension
--     capable ne l'a prise en 15 minutes, elle se ferme « echec »
--     (extension_a_mettre_a_jour) : RIEN n'a été commandé, l'app le dit.
--  3. Relance : une étiquette échouée chez Vinted peut être recommandée UNE
--     fois, seulement sur autorisation écrite en base
--     (bordereaux_relances_autorisees : SQL seulement, aucun accès de l'app),
--     par une extension qui sait relancer (« relance_vinted »), avant une date
--     limite. Commande prête, expédiée ou annulée entre-temps : l'autorisation
--     est consommée SANS relance (rien n'est touché). La relance reprend le
--     choix et la phrase d'engagement de la demande d'origine.
--  4. bordereau_demande_etape accepte « generee » → « echec » (l'extension
--     0.6.126 dit l'échec de Vinted dès la tentative de 8 s).
-- Les fonctions sont réécrites depuis leur texte de PROD (pg_get_functiondef,
-- 18/10 vers 11:10 Paris), seules les lignes marquées (18/10) changent.
-- Inverse : supabase/rollbacks/20261018100000_bordereaux_echec_vinted_relance.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018100000_bordereaux_echec_vinted_relance.sql
--   npx supabase migration repair --linked --status applied 20261018100000

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.bordereaux_demandes ADD COLUMN IF NOT EXISTS relance boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bordereaux_relances_autorisees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id uuid NOT NULL UNIQUE REFERENCES public.bordereaux_demandes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autorise_par text NOT NULL CHECK (char_length(autorise_par) BETWEEN 3 AND 300),
  avant timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  consommee_le timestamptz,
  issue text CHECK (issue IS NULL OR char_length(issue) <= 120),
  relance_id uuid REFERENCES public.bordereaux_demandes(id) ON DELETE SET NULL
);
ALTER TABLE public.bordereaux_relances_autorisees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bordereaux_relances_autorisees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereaux_relances_autorisees TO service_role;

-- 1. Les générations que la plateforme a fermées (règle 1).
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
  -- Vinted a dit « étiquette échouée » (envoi 210 → 'indisponible') : un ÉCHEC,
  -- jamais « générée, récupération du fichier… ».
  UPDATE bordereaux_demandes d
     SET statut = 'echec', motif = 'etiquette_echouee_chez_vinted', fini_le = now()
    FROM plateforme_commandes pc
   WHERE d.user_id = p_user AND d.action = 'generer' AND d.statut = 'generee' AND d.copie_id IS NULL
     AND pc.id = d.commande_id AND pc.user_id = d.user_id
     AND pc.platform = 'vinted' AND pc.bordereau = 'indisponible';
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
REVOKE ALL ON FUNCTION public.bordereaux_generations_closes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bordereaux_generations_closes(uuid) TO service_role;

-- 2. La prise d'une demande par l'extension (règles 1, 2, 3).
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
  IF NOT public.messagerie_beta(v_user) THEN RETURN jsonb_build_object('demande', NULL, 'motif', 'beta'); END IF;

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
   WHERE d.user_id = v_user AND d.statut = 'demandee'
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

-- 3. L'étape rendue par l'extension (règle 4 : « generee » → « echec »).
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
  -- (18/10) « generee » → « echec » : la plateforme a dit que l'étiquette a échoué.
  IF NOT ((v_d.statut = 'en_cours' AND p_statut IN ('generee','incertaine','echec','prete'))
       OR (v_d.statut = 'generee' AND p_statut IN ('generee','prete','echec'))) THEN
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

-- 4. Le relevé des commandes ferme aussi ce que la plateforme a fermé (règle 1).
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

  -- (18/10) Une commande changée peut fermer une génération (étiquette échouée chez Vinted, annulée).
  IF c_maj + c_nouvelles > 0 THEN PERFORM public.bordereaux_generations_closes(v_user); END IF;

  RETURN jsonb_build_object('plateforme', p_platform, 'nouvelles', c_nouvelles, 'maj', c_maj,
                            'inchangees', c_inchangees, 'rattachees', c_rattachees);
END;
$function$;

-- 5. La règle s'applique tout de suite à ce qui est déjà en base (tous les comptes).
SELECT public.bordereaux_generations_closes(x.user_id)
  FROM (SELECT DISTINCT d.user_id FROM public.bordereaux_demandes d WHERE d.action = 'generer' AND d.statut = 'generee') x;

COMMIT;
