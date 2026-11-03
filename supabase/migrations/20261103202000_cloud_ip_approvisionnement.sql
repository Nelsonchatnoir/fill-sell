-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — APPROVISIONNEMENT DES IP (03/11/2026, point 2 de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle de Nico : « tout doit être automatique ; corriger la règle, pas le cas ».
--
--   1. LE REFUS EST PAR PLATEFORME (cloud_ips.refus) : un blocage de plateforme
--      (blocage_anti_robot, captcha_repete) n'envoie plus l'IP au rebut — il note un
--      refus sur CETTE plateforme, « non prouvé » tant qu'une visite de contrôle ne l'a
--      pas confirmé. Le rebut global reste pour les causes PROUVÉES (contrôle d'entrée,
--      liste noire, sortie non conforme, compte restreint, manuel). Vu le 02/11 : trois
--      IP jetées pour Beebs alors que la cause prouvée était l'Accept-Language du profil
--      (rapport machine-cloud-3010 § 22.11).
--   2. L'ATTRIBUTION PRÉFÈRE LES IP SANS REFUS ; un refus non prouvé ensuite ; un refus
--      prouvé en dernier recours seulement. Jamais deux comptes sur une IP (index
--      cloud_ips_un_titulaire, inchangé).
--   3. LA REQUALIFICATION : l'orchestrateur visite UNE page d'accueil de la plateforme,
--      depuis un navigateur de contrôle jetable sur l'IP (jamais une IP tenue par un
--      compte) ; cloud_ip_refus_visite applique le verdict (passe / glissière = refus
--      levé ; accès restreint = refus prouvé, revisité à 14 j).
--   4. LE REGISTRE DE TOUTE DÉPENSE (cloud_ip_commandes : achat ET prolongation) et le
--      PLAFOND MENSUEL (coin_config cloud_ip_budget_mensuel_usd), vérifié en base sous
--      verrou : cloud_ip_depense_ouvrir refuse au-delà, et refuse tant que l'interrupteur
--      de la nature n'est pas à 1 (cloud_ip_achats_auto, cloud_ip_renouvellement_auto —
--      créés à 0). Le serveur garde en plus sa garde IPROYAL_ACHATS_AUTORISES (0).
--   5. LE STOCK MINIMUM (cloud_ip_stock_min, 2) : IP disponibles attribuables à un
--      essai (≥ 7 + 2 + 1 jours de vie), lu par planDuJour (cloud-pool.js).
--   6. L'EXISTANT SUIT LA RÈGLE : les rebuts « blocage_anti_robot » / « captcha_repete »
--      vivants deviennent des refus non prouvés de leur plateforme (état disponible) ;
--      les IP vivantes de la liste « grillées pour Beebs » (docs/cloud/REPRISE.md, 02/11)
--      reçoivent un refus Beebs non prouvé. Toutes passeront par la visite de contrôle.
--
-- Fonctions réécrites DEPUIS pg_get_functiondef de la prod (03/11) : cloud_ip_signaler,
-- cloud_ip_attribuer, cloud_ip_reserver, cloud_pool_etat (ajouts seulement).
--
-- ── INVERSE ─────────────────────────────────────────────────────────────────
--   -- (les IP converties gardent leur refus dans le journal ; les remettre au rebut est un choix, pas un retour)
--   DROP FUNCTION IF EXISTS public.cloud_ip_refus_noter(bigint, text, text, jsonb);
--   DROP FUNCTION IF EXISTS public.cloud_ip_refus_noter_compte(uuid, text, text, jsonb);
--   DROP FUNCTION IF EXISTS public.cloud_ip_refus_visite(bigint, text, jsonb);
--   DROP FUNCTION IF EXISTS public.cloud_ip_a_visiter(timestamptz);
--   DROP FUNCTION IF EXISTS public.cloud_ip_depenses_mois(timestamptz);
--   DROP FUNCTION IF EXISTS public.cloud_ip_depense_ouvrir(text, integer, numeric, bigint, jsonb);
--   DROP FUNCTION IF EXISTS public.cloud_ip_depense_fermer(bigint, text, text, numeric, jsonb);
--   -- puis rejouer cloud_ip_signaler, cloud_ip_attribuer, cloud_ip_reserver, cloud_pool_etat d'avant (sauvegarde du 03/11)
--   DROP FUNCTION IF EXISTS public.cloud_ip_refus_prouve(jsonb);
--   ALTER TABLE public.cloud_ip_commandes DROP COLUMN IF EXISTS nature, DROP COLUMN IF EXISTS ip_id;
--   ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_refus_objet, DROP COLUMN IF EXISTS refus;
--   DELETE FROM public.coin_config WHERE key IN ('cloud_ip_stock_min','cloud_ip_budget_mensuel_usd','cloud_ip_achats_auto','cloud_ip_renouvellement_auto','cloud_ip_achat_max','cloud_ip_refus_revisite_jours');
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ═══ 0. Réglages (absente = le défaut de cloud_param) ═══════════════════════
-- Les interrupteurs de dépense naissent COUPÉS : aucun achat, aucune prolongation sans le GO de Nico.
INSERT INTO public.coin_config (key, value) VALUES
  ('cloud_ip_stock_min', 2),
  ('cloud_ip_budget_mensuel_usd', 60),
  ('cloud_ip_achats_auto', 0),
  ('cloud_ip_renouvellement_auto', 0),
  ('cloud_ip_achat_max', 10),
  ('cloud_ip_refus_revisite_jours', 14)
ON CONFLICT (key) DO NOTHING;

-- ═══ 1. Le refus par plateforme ═════════════════════════════════════════════
ALTER TABLE public.cloud_ips ADD COLUMN IF NOT EXISTS refus jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cloud_ips_refus_objet') THEN
    ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_refus_objet CHECK (jsonb_typeof(refus) = 'object');
  END IF;
END $$;

-- Le journal connaît les gestes neufs.
ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT IF EXISTS cloud_ip_evenements_nature_check;
ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check CHECK (nature IN (
  'achat','controle_entree','reservation','attribution','retour_meme_compte','conversion','liberation','purge',
  'sortie_repos','signalement','rebut','renouvellement','identifiants_changes','expiration','incident',
  'refus','refus_leve','refus_prouve','visite_controle','depense'));

/** Un refus prouvé sur au moins une plateforme ? */
CREATE OR REPLACE FUNCTION public.cloud_ip_refus_prouve(p_refus jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT COALESCE(jsonb_typeof(p_refus) = 'object'
         AND EXISTS (SELECT 1 FROM jsonb_each(p_refus) e WHERE (e.value ->> 'prouvee')::boolean IS TRUE), false);
$f$;

CREATE OR REPLACE FUNCTION public.cloud_ip_refus_noter(p_ip bigint, p_plateforme text, p_cause text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_pf text := lower(btrim(COALESCE(p_plateforme, '')));
BEGIN
  IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'depop') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'plateforme_inconnue');
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  IF v.refus ? v_pf THEN
    -- Déjà noté : on garde la première date et la preuve éventuelle ; le geste reste au journal.
    PERFORM public.cloud_journal(p_ip, 'refus', v.user_id, jsonb_build_object('plateforme', v_pf, 'cause', p_cause, 'details', p_details, 'deja', true));
    RETURN jsonb_build_object('ok', true, 'deja', true, 'plateforme', v_pf);
  END IF;
  UPDATE public.cloud_ips
     SET refus = refus || jsonb_build_object(v_pf, jsonb_build_object('le', now(), 'cause', COALESCE(p_cause, 'inconnue'),
                 'prouvee', false, 'details', COALESCE(p_details, '{}'::jsonb))),
         maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'refus', v.user_id, jsonb_build_object('plateforme', v_pf, 'cause', p_cause, 'details', p_details));
  RETURN jsonb_build_object('ok', true, 'plateforme', v_pf);
END;
$f$;

/** Le refus noté sur l'IP que TIENT ce compte (crochet de l'orchestrateur : une plateforme fermée en « restreint »). */
CREATE OR REPLACE FUNCTION public.cloud_ip_refus_noter_compte(p_user uuid, p_plateforme text, p_cause text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_ip bigint;
BEGIN
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_sans_ip'); END IF;
  RETURN public.cloud_ip_refus_noter(v_ip, p_plateforme, p_cause, p_details) || jsonb_build_object('ip_id', v_ip);
END;
$f$;

/**
 * Le verdict d'une VISITE DE CONTRÔLE (orchestrateur, controle.js) : jamais sur une IP tenue par un compte.
 * passe | glissiere → refus levé ; restreint → refus prouvé ; autre (indetermine…) → visite notée, rien ne change.
 */
CREATE OR REPLACE FUNCTION public.cloud_ip_refus_visite(p_ip bigint, p_plateforme text, p_visite jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_pf text := lower(btrim(COALESCE(p_plateforme, '')));
  v_verdict text := COALESCE(p_visite ->> 'verdict', '');
  v_visite jsonb := COALESCE(p_visite, '{}'::jsonb) || jsonb_build_object('le', COALESCE(p_visite ->> 'fait_le', now()::text));
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  IF v.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_tenue_par_un_compte'); END IF;
  IF NOT (v.refus ? v_pf) THEN RETURN jsonb_build_object('ok', false, 'raison', 'aucun_refus'); END IF;
  IF v_verdict IN ('passe', 'glissiere') THEN
    UPDATE public.cloud_ips SET refus = refus - v_pf, maj_le = now() WHERE id = p_ip;
    PERFORM public.cloud_journal(p_ip, 'refus_leve', NULL, jsonb_build_object('plateforme', v_pf, 'visite', v_visite, 'refus', v.refus -> v_pf));
    RETURN jsonb_build_object('ok', true, 'issue', 'leve', 'plateforme', v_pf);
  ELSIF v_verdict = 'restreint' THEN
    UPDATE public.cloud_ips
       SET refus = jsonb_set(refus, ARRAY[v_pf], (refus -> v_pf) || jsonb_build_object('prouvee', true, 'prouvee_le', now(), 'derniere_visite', v_visite)),
           maj_le = now()
     WHERE id = p_ip;
    PERFORM public.cloud_journal(p_ip, 'refus_prouve', NULL, jsonb_build_object('plateforme', v_pf, 'visite', v_visite));
    RETURN jsonb_build_object('ok', true, 'issue', 'prouve', 'plateforme', v_pf);
  END IF;
  UPDATE public.cloud_ips
     SET refus = jsonb_set(refus, ARRAY[v_pf], (refus -> v_pf) || jsonb_build_object('derniere_visite', v_visite)), maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'visite_controle', NULL, jsonb_build_object('plateforme', v_pf, 'visite', v_visite));
  RETURN jsonb_build_object('ok', true, 'issue', 'inchange', 'plateforme', v_pf);
END;
$f$;

/**
 * Les IP à visiter (orchestrateur : une par heure au plus) : disponibles, libres de toute réservation, vivantes au
 * moins 1 jour, avec un refus non prouvé jamais visité (ou visité il y a plus de 24 h sans verdict), ou un refus prouvé
 * visité il y a plus de `refus_revisite_jours` (14). Les plus anciens refus d'abord.
 */
CREATE OR REPLACE FUNCTION public.cloud_ip_a_visiter(p_maintenant timestamptz DEFAULT now())
RETURNS TABLE (ip_id bigint, plateforme text, prouvee boolean, refus_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT i.id, e.key, COALESCE((e.value ->> 'prouvee')::boolean, false), public.cloud_ts(e.value ->> 'le')
    FROM public.cloud_ips i, jsonb_each(i.refus) e
   WHERE i.etat = 'disponible' AND i.user_id IS NULL
     AND (i.reserve_pour IS NULL OR i.reserve_jusqu_au < p_maintenant)
     AND i.expire_le > p_maintenant + interval '1 day'
     AND CASE WHEN COALESCE((e.value ->> 'prouvee')::boolean, false)
              THEN COALESCE(public.cloud_ts(e.value -> 'derniere_visite' ->> 'le'), public.cloud_ts(e.value ->> 'prouvee_le'), '-infinity'::timestamptz)
                   < p_maintenant - make_interval(days => public.cloud_param('refus_revisite_jours', 14))
              ELSE COALESCE(public.cloud_ts(e.value -> 'derniere_visite' ->> 'le'), '-infinity'::timestamptz) < p_maintenant - interval '24 hours'
         END
   ORDER BY COALESCE((e.value ->> 'prouvee')::boolean, false), public.cloud_ts(e.value ->> 'le') NULLS FIRST, i.id;
$f$;

-- ═══ 2. Le registre de TOUTE dépense IPRoyal et le plafond mensuel ══════════
ALTER TABLE public.cloud_ip_commandes ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'achat';
ALTER TABLE public.cloud_ip_commandes ADD COLUMN IF NOT EXISTS ip_id bigint REFERENCES public.cloud_ips (id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cloud_ip_commandes_nature') THEN
    ALTER TABLE public.cloud_ip_commandes ADD CONSTRAINT cloud_ip_commandes_nature CHECK (nature IN ('achat', 'prolongation'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS cloud_ip_commandes_demandee ON public.cloud_ip_commandes (demandee_le);

/** Ce qui est dépensé ce mois-ci (heure de Paris), en dollars : achats et prolongations, hors échecs et remboursements. */
CREATE OR REPLACE FUNCTION public.cloud_ip_depenses_mois(p_maintenant timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT COALESCE(sum(prix_usd), 0)::numeric
    FROM public.cloud_ip_commandes
   WHERE statut NOT IN ('echec', 'remboursee')
     AND date_trunc('month', demandee_le AT TIME ZONE 'Europe/Paris') = date_trunc('month', p_maintenant AT TIME ZONE 'Europe/Paris');
$f$;

/**
 * Ouvre une dépense AVANT l'appel au fournisseur (une ligne « demandee » : une mort entre les deux laisse une trace,
 * jamais un achat invisible). Refuse : interrupteur de la nature à 0, prix illisible, plafond du mois dépassé.
 * Sous verrou : deux entretiens ne dépassent jamais ensemble le plafond.
 */
CREATE OR REPLACE FUNCTION public.cloud_ip_depense_ouvrir(p_nature text, p_quantite integer, p_prix_usd numeric, p_ip bigint DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  v_budget numeric := public.cloud_param('ip_budget_mensuel_usd', 0);
  v_deja numeric;
  v_id bigint;
BEGIN
  IF p_nature NOT IN ('achat', 'prolongation') THEN RETURN jsonb_build_object('ok', false, 'raison', 'nature_inconnue'); END IF;
  IF (p_nature = 'achat' AND public.cloud_param('ip_achats_auto', 0) <> 1)
     OR (p_nature = 'prolongation' AND public.cloud_param('ip_renouvellement_auto', 0) <> 1) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'interrupteur_coupe');
  END IF;
  IF p_prix_usd IS NULL OR p_prix_usd <= 0 OR p_quantite IS NULL OR p_quantite < 1 OR p_quantite > 50 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'prix_ou_quantite_illisible');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip_depense', 0));
  v_deja := public.cloud_ip_depenses_mois();
  IF v_budget <= 0 OR v_deja + p_prix_usd > v_budget THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'plafond', 'depense_mois_usd', v_deja, 'budget_usd', v_budget, 'prix_usd', p_prix_usd);
  END IF;
  INSERT INTO public.cloud_ip_commandes (fournisseur, nature, quantite, statut, prix_usd, go_par, ip_id, details)
  VALUES ('iproyal', p_nature, p_quantite, 'demandee', p_prix_usd,
          CASE WHEN p_nature = 'achat' THEN 'automatique (cloud_ip_achats_auto)' ELSE 'automatique (cloud_ip_renouvellement_auto)' END,
          p_ip, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  IF p_ip IS NOT NULL THEN
    PERFORM public.cloud_journal(p_ip, 'depense', NULL, jsonb_build_object('commande_id', v_id, 'nature', p_nature, 'prix_usd', p_prix_usd));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'depense_mois_usd', v_deja + p_prix_usd, 'budget_usd', v_budget);
END;
$f$;

/** Ferme (ou fait avancer) une dépense : en_cours (commande passée), livree, echec ; la commande et le prix lus. */
CREATE OR REPLACE FUNCTION public.cloud_ip_depense_fermer(p_id bigint, p_statut text, p_commande text DEFAULT NULL, p_prix_usd numeric DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF p_statut NOT IN ('en_cours', 'livree', 'echec') THEN RETURN false; END IF;
  UPDATE public.cloud_ip_commandes
     SET statut = p_statut,
         commande = COALESCE(p_commande, commande),
         prix_usd = COALESCE(p_prix_usd, prix_usd),
         livree_le = CASE WHEN p_statut = 'livree' THEN now() ELSE livree_le END,
         details = details || COALESCE(p_details, '{}'::jsonb)
   WHERE id = p_id AND statut IN ('demandee', 'en_cours');
  RETURN FOUND;
END;
$f$;

-- ═══ 3. Le signalement : refus par plateforme, rebut pour les causes prouvées ═══
-- Réécrite depuis la prod (03/11). Seul change : blocage_anti_robot / captcha_repete → refus de la plateforme
-- (p_details.plateforme, ou p_details.details.plateforme), JAMAIS le rebut ; le titulaire GARDE son IP.
CREATE OR REPLACE FUNCTION public.cloud_ip_signaler(p_ip bigint, p_critere text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_nouvelle bigint;
  v_pf text := lower(COALESCE(p_details ->> 'plateforme', p_details -> 'details' ->> 'plateforme', ''));
BEGIN
  IF p_critere NOT IN ('blocage_anti_robot','captcha_repete','compte_restreint','liste_noire',
                       'sortie_non_conforme','controle_entree','manuel') THEN
    RAISE EXCEPTION 'cloud_ip_signaler : critère inconnu %', p_critere;
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  PERFORM public.cloud_journal(p_ip, 'signalement', v.user_id, jsonb_build_object('critere', p_critere, 'details', p_details, 'etat_avant', v.etat));
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', true, 'deja', v.etat); END IF;
  -- (03/11) Une plateforme qui refuse : un refus sur ELLE, non prouvé — jamais tout le pool, jamais le rebut.
  IF p_critere IN ('blocage_anti_robot', 'captcha_repete') THEN
    IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'depop') THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'plateforme_requise');
    END IF;
    RETURN public.cloud_ip_refus_noter(p_ip, v_pf, p_critere, p_details) || jsonb_build_object('refus', true, 'rebut', false, 'titulaire', v.user_id);
  END IF;
  UPDATE public.cloud_ips
     SET etat = 'rebut', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL,
         rebut_critere = p_critere, rebut_le = now(), liberee_le = COALESCE(liberee_le, now()), maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'rebut', v.user_id, jsonb_build_object('critere', p_critere));
  IF v.user_id IS NOT NULL THEN
    v_nouvelle := public.cloud_ip_attribuer(v.user_id, CASE WHEN v.etat = 'attribuee_client' THEN 'client' ELSE 'essai' END);
  END IF;
  RETURN jsonb_build_object('ok', true, 'rebut', true, 'titulaire', v.user_id, 'nouvelle_ip', v_nouvelle);
END;
$function$;

-- ═══ 4. L'attribution et la réservation préfèrent les IP sans refus ═════════
-- Réécrites depuis la prod (03/11). Seul change : l'ORDER BY du choix d'une IP disponible
-- (sans refus → refus non prouvé → refus prouvé en dernier recours).
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint;
  v_retour boolean := false;
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, (i.refus = '{}'::jsonb) DESC, public.cloud_ip_refus_prouve(i.refus),
              i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET etat = 'attribuee_' || p_nature, user_id = p_user,
         attributions = attributions + CASE WHEN dernier_user_id IS DISTINCT FROM p_user THEN 1 ELSE 0 END,
         dernier_user_id = p_user, derniere_origine = p_nature,
         reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, CASE WHEN v_retour THEN 'retour_meme_compte' ELSE 'attribution' END, p_user,
          jsonb_build_object('nature', p_nature));
  RETURN v_ip;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ip bigint;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, (i.refus = '{}'::jsonb) DESC, public.cloud_ip_refus_prouve(i.refus),
            i.expire_le, i.attributions, i.id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET reserve_pour = p_user, reserve_jusqu_au = now() + make_interval(mins => public.cloud_param('reservation_min', 30)), maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'reservation', p_user, '{}'::jsonb);
  RETURN v_ip;
END;
$function$;

-- ═══ 5. L'état du pool (ajouts : refus, stock minimum, dépenses du mois) ════
-- Réécrite depuis la prod (03/11) ; les clés d'avant sont inchangées.
CREATE OR REPLACE FUNCTION public.cloud_pool_etat()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'par_etat', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_ips GROUP BY etat) s), '{}'::jsonb),
    'attribuables_essai', (SELECT count(*) FROM public.cloud_ips i
                            WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai')),
    'attribuables_essai_sans_refus_prouve', (SELECT count(*) FROM public.cloud_ips i
                            WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai')
                              AND NOT public.cloud_ip_refus_prouve(i.refus)),
    'reservees', (SELECT count(*) FROM public.cloud_ips WHERE reserve_pour IS NOT NULL AND reserve_jusqu_au > now()),
    'repos_prets_48h', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND repos_fin <= now() + interval '48 hours'),
    'purges_en_retard', (SELECT count(*) FROM public.cloud_ips WHERE etat = 'repos' AND purge_prouvee_le IS NULL
                           AND liberee_le < now() - interval '1 hour'),
    'en_attente', (SELECT count(*) FROM public.cloud_attente),
    'attente_max_h', (SELECT round(EXTRACT(EPOCH FROM now() - min(demande_le)) / 3600, 1) FROM public.cloud_attente),
    'comptes_sans_place', (SELECT count(*) FROM public.profiles p
                            WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now()
                                                          AND p.cloud_essai_arrete IS NOT TRUE))
                              AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)),
    'postes', COALESCE((SELECT jsonb_object_agg(etat, n) FROM (SELECT etat, count(*) n FROM public.cloud_postes GROUP BY etat) s), '{}'::jsonb),
    'commandes_en_cours', (SELECT COALESCE(sum(quantite), 0) FROM public.cloud_ip_commandes
                            WHERE statut IN ('demandee', 'en_cours') AND nature = 'achat'),
    'echeances_3j', (SELECT count(*) FROM public.cloud_ips
                      WHERE etat IN ('attribuee_essai', 'attribuee_client')
                        AND expire_le <= now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3))),
    'rebuts_24h', (SELECT count(*) FROM public.cloud_ips WHERE rebut_le > now() - interval '24 hours'),
    'essais_7j', (SELECT count(*) FROM public.profiles WHERE cloud_essai_debut > now() - interval '7 days'),
    'refus_non_prouves', (SELECT count(*) FROM public.cloud_ips i, jsonb_each(i.refus) e
                           WHERE i.etat NOT IN ('expiree', 'rebut') AND COALESCE((e.value ->> 'prouvee')::boolean, false) IS FALSE),
    'refus_prouves', (SELECT count(*) FROM public.cloud_ips i, jsonb_each(i.refus) e
                       WHERE i.etat NOT IN ('expiree', 'rebut') AND (e.value ->> 'prouvee')::boolean IS TRUE),
    'stock_min', public.cloud_param('ip_stock_min', 2),
    'depenses_mois_usd', public.cloud_ip_depenses_mois(),
    'budget_mensuel_usd', public.cloud_param('ip_budget_mensuel_usd', 0),
    'achats_auto', public.cloud_param('ip_achats_auto', 0),
    'renouvellement_auto', public.cloud_param('ip_renouvellement_auto', 0)
  );
$function$;

-- ═══ 6. L'existant suit la règle ════════════════════════════════════════════
-- 6.1 Les rebuts pour une plateforme (blocage_anti_robot, captcha_repete) encore vivants : refus NON PROUVÉ de leur
--     plateforme (lue au journal : details.plateforme ou details.details.plateforme), état disponible. Sans plateforme
--     lisible : laissés au rebut (rien à visiter).
WITH a_convertir AS (
  SELECT i.id, i.rebut_critere, i.rebut_le,
         (SELECT lower(COALESCE(e.details ->> 'plateforme', e.details -> 'details' ->> 'plateforme'))
            FROM public.cloud_ip_evenements e
           WHERE e.ip_id = i.id AND e.nature IN ('rebut', 'signalement')
             AND COALESCE(e.details ->> 'plateforme', e.details -> 'details' ->> 'plateforme') IS NOT NULL
           ORDER BY e.le DESC LIMIT 1) AS pf
    FROM public.cloud_ips i
   WHERE i.etat = 'rebut' AND i.rebut_critere IN ('blocage_anti_robot', 'captcha_repete') AND i.expire_le > now()
), convertis AS (
  UPDATE public.cloud_ips i
     SET etat = 'disponible', user_id = NULL,
         refus = i.refus || jsonb_build_object(c.pf, jsonb_build_object('le', COALESCE(c.rebut_le, now()), 'cause', c.rebut_critere,
                 'prouvee', false, 'details', jsonb_build_object('reprise', 'regle du 03/11 : un refus de plateforme n''est plus un rebut'))),
         rebut_critere = NULL, rebut_le = NULL, maj_le = now()
    FROM a_convertir c
   WHERE i.id = c.id AND c.pf IN ('vinted', 'leboncoin', 'beebs', 'depop')
  RETURNING i.id, c.pf
)
INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
SELECT id, 'refus', NULL, jsonb_build_object('plateforme', pf, 'reprise', 'rebut_converti_0311') FROM convertis;

-- 6.2 La liste « grillées pour Beebs » (docs/cloud/REPRISE.md, 02/11 16:50) : un refus Beebs non prouvé sur celles qui
--     vivent encore et n'en ont pas — elles passeront par la visite de contrôle comme les autres.
WITH marquees AS (
  UPDATE public.cloud_ips i
     SET refus = i.refus || jsonb_build_object('beebs', jsonb_build_object('le', now(), 'cause', 'liste_grillees_beebs_0211',
                 'prouvee', false, 'details', jsonb_build_object('source', 'docs/cloud/REPRISE.md (02/11), jamais tracé en base'))),
         maj_le = now()
   WHERE i.etat NOT IN ('expiree', 'rebut') AND NOT (i.refus ? 'beebs')
     AND host(i.ip) IN ('81.181.239.136', '185.134.192.253', '185.134.194.88', '176.103.180.12', '80.12.178.102',
                        '94.194.94.233', '188.126.31.118')
  RETURNING i.id
)
INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
SELECT id, 'refus', NULL, jsonb_build_object('plateforme', 'beebs', 'reprise', 'liste_grillees_beebs_0211') FROM marquees;

-- ═══ 7. Droits : rien pour le client, tout pour le serveur ═════════════════
REVOKE ALL ON FUNCTION public.cloud_ip_refus_prouve(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_refus_noter(bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_refus_noter_compte(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_refus_visite(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_a_visiter(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_depenses_mois(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_depense_ouvrir(text, integer, numeric, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_depense_fermer(bigint, text, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_attribuer(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_ip_reserver(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_pool_etat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_refus_prouve(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_refus_noter(bigint, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_refus_noter_compte(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_refus_visite(bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_a_visiter(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_depenses_mois(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_depense_ouvrir(text, integer, numeric, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_depense_fermer(bigint, text, text, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_attribuer(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_ip_reserver(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_pool_etat() TO service_role;
