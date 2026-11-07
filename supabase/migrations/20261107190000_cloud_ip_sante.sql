-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LA SANTÉ DES IP LIBRES ET « SAINES D'ABORD » (07/11/2026 soir, ordres 3 et 4 de Nico)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis (essai jetable : scripts/essais/20261107190000_banc.mjs).
--
-- Ordre 4 : « Ce contrôle de santé doit tourner seul, régulièrement, sur toutes les IP libres, pas seulement à l'achat :
-- une IP grillée n'est jamais donnée à un client. » L'orchestrateur (serveur-cloud/src/sante.js, entretien.controlerSante)
-- contrôle une IP libre à la fois — sortie en France, ni hébergeur ni proxy repéré, accès anonyme réel à Vinted,
-- Leboncoin, Beebs, Depop, eBay sans page anti-robot — et écrit le verdict ici.
-- Ordre 3 : « IP en trop : ne renouvelle que jusqu'à (clients + marge), en gardant les SAINES en priorité. Une IP grillée ne
-- compte jamais dans la marge : elle expire à son terme. » La règle est dans l'orchestrateur (cloud-pool.js, planDuJour).
--
-- 1. coin_config : cloud_ip_sante_controle = 0 (le contrôle périodique, COUPÉ) et cloud_ip_renouveler_saines_seulement = 0
--    (la règle « saines d'abord », COUPÉE) — tous deux à 1 seulement sur décision de Nico.
-- 2. cloud_ips.sante (jsonb, NULL = jamais contrôlée) : { version, verdict: saine | suspecte | grillee | inconnue, le,
--    saine_le, suspecte_le, grillee_le, echecs, controles, dernier, precedent } — écrite par cloud_ip_sante_noter
--    seulement. « grillee » = un échec RELU par un 2e contrôle au moins 30 min après le 1er (jamais un incident passager).
-- 3. cloud_ip_attribuable : une IP GRILLÉE n'est jamais attribuable (essai, client, retour au même compte, réservation) —
--    cloud_ip_attribuer, cloud_ip_reserver, cloud_pool_etat, cloud_vente_etat (les places) la lisent : rien d'autre à changer.
-- 4. cloud_ip_garde_nombre : une IP GRILLÉE n'est plus comptée vivante (miroir de regles.gardeNombre) — sinon la garde
--    refuserait l'achat qui reconstitue la marge ; elle reste un sous-ensemble de ce que compte le plan.
-- 5. cloud_ip_sante_noter(p_ip, p_sante) — service_role seul : verdict lisible, IP du pool (jamais tenue par un compte,
--    jamais au rebut ni expirée), « grillee » définitive (jamais rabaissée), 16 Ko au plus ; un changement de verdict va au
--    journal de l'IP (cloud_ip_evenements, nature « visite_controle », details.sante).
-- SANS DONNÉE DE SANTÉ (colonne vide), cloud_ip_attribuable et cloud_ip_garde_nombre rendent EXACTEMENT ce qu'elles
-- rendaient (prouvé par le banc, ligne à ligne).
--
-- Réécrites DEPUIS pg_get_functiondef de la prod du 07/11 ~17:45 (fixtures : scripts/essais/fixtures/prod-0711-ip-sante/,
-- md5 prod relus : cloud_ip_attribuable d58146e2…, cloud_ip_garde_nombre 713528bb…, à la fin de ligne près) :
-- cloud_ip_attribuable, cloud_ip_garde_nombre. Signatures, retours et droits INCHANGÉS (CREATE OR REPLACE garde les GRANT).
-- Coût : une colonne nullable (aucune réécriture de la table, 10 lignes), un test jsonb de plus par IP lue.
-- Inverse : supabase/rollbacks/20261107190000_cloud_ip_sante_INVERSE.sql. Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- ═══ 1. Réglages (absente = le défaut de cloud_param, 0) ════════════════════
INSERT INTO public.coin_config (key, value) VALUES
  ('cloud_ip_sante_controle', 0),
  ('cloud_ip_renouveler_saines_seulement', 0)
ON CONFLICT (key) DO NOTHING;

-- ═══ 2. La santé d'une IP ══════════════════════════════════════════════════
ALTER TABLE public.cloud_ips ADD COLUMN IF NOT EXISTS sante jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cloud_ips'::regclass AND conname = 'cloud_ips_sante_lisible') THEN
    ALTER TABLE public.cloud_ips ADD CONSTRAINT cloud_ips_sante_lisible CHECK (sante IS NULL OR (jsonb_typeof(sante) = 'object'
      AND sante ->> 'verdict' IN ('saine', 'suspecte', 'grillee', 'inconnue')));
  END IF;
END $$;
COMMENT ON COLUMN public.cloud_ips.sante IS
  '(07/11 soir, ordre 4 de Nico) Le contrôle de santé de l''IP libre (orchestrateur, sante.js) ; NULL = jamais contrôlée. Écrite par cloud_ip_sante_noter seulement. « grillee » : jamais attribuable, jamais renouvelée.';

-- ═══ 3. L'attribution : jamais une IP grillée ══════════════════════════════
-- Réécrite depuis la prod (07/11). Change : la ligne « AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee' ».
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee'
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$;

-- ═══ 4. La garde du nombre : une IP grillée n'est plus vivante (miroir EXACT : regles.gardeNombre) ═══
-- Réécrite depuis la prod (07/11, appliquée 17:08). Change : la ligne « AND COALESCE(i.sante ->> 'verdict', '') <> 'grillee' ».
CREATE OR REPLACE FUNCTION public.cloud_ip_garde_nombre(p_quantite integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH v AS (
    SELECT
      (SELECT count(*) FROM public.cloud_ips i
        WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
           OR (i.etat IN ('achetee', 'disponible')
               AND i.expire_le >= now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                         + public.cloud_param('marge_expiration_jours', 1))
               AND i.attributions < public.cloud_param('attributions_max', 6)
               AND NOT public.cloud_ip_refus_prouve(i.refus)
               AND COALESCE(i.sante ->> 'verdict', '') <> 'grillee'))::int AS vivantes,
      (SELECT COALESCE(sum(c.quantite), 0) FROM public.cloud_ip_commandes c
        WHERE c.nature = 'achat' AND c.statut IN ('demandee', 'en_cours'))::int AS en_commande,
      (SELECT count(*) FROM (
         SELECT p.id FROM public.profiles p
          WHERE p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE)
         UNION
         SELECT i.user_id FROM public.cloud_ips i
          WHERE i.user_id IS NOT NULL AND i.etat IN ('attribuee_essai', 'attribuee_client')) s)::int AS comptes,
      GREATEST(public.cloud_param('ip_marge', 3), 0) AS marge,
      (SELECT count(*) FROM public.cloud_attente)::int AS attente,
      GREATEST(COALESCE(p_quantite, 0), 0) AS demandees)
  SELECT jsonb_build_object(
    'ok', v.vivantes + v.en_commande + v.demandees <= v.comptes + v.marge + v.attente,
    'comptees', v.vivantes + v.en_commande + v.demandees,
    'borne', v.comptes + v.marge + v.attente,
    'vivantes', v.vivantes, 'en_commande', v.en_commande, 'demandees', v.demandees,
    'comptes', v.comptes, 'marge', v.marge, 'attente', v.attente)
  FROM v;
$function$;

-- ═══ 5. L'écriture du verdict (l'orchestrateur, clé de service) ═══════════
CREATE OR REPLACE FUNCTION public.cloud_ip_sante_noter(p_ip bigint, p_sante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_avant text;
  v_apres text := p_sante ->> 'verdict';
BEGIN
  IF p_sante IS NULL OR jsonb_typeof(p_sante) <> 'object' OR v_apres IS NULL
     OR v_apres NOT IN ('saine', 'suspecte', 'grillee', 'inconnue') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'sante_illisible');
  END IF;
  IF octet_length(p_sante::text) > 16384 THEN RETURN jsonb_build_object('ok', false, 'raison', 'sante_trop_grosse'); END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  -- Jamais sur une IP tenue par un compte (attribuée pendant le contrôle : son verdict n'est pas écrit) ni hors du pool.
  IF v.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_tenue_par_un_compte'); END IF;
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_hors_pool'); END IF;
  v_avant := v.sante ->> 'verdict';
  -- Grillée = définitif : jamais rabaissée par un contrôle suivant (elle expire à son terme).
  IF v_avant = 'grillee' AND v_apres <> 'grillee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_grillee', 'avant', v_avant); END IF;
  UPDATE public.cloud_ips SET sante = p_sante, maj_le = now() WHERE id = p_ip;
  IF v_avant IS DISTINCT FROM v_apres THEN
    PERFORM public.cloud_journal(p_ip, 'visite_controle', NULL, jsonb_build_object('sante', jsonb_build_object(
      'avant', v_avant, 'apres', v_apres, 'le', p_sante ->> 'le', 'echecs', COALESCE(p_sante -> 'echecs', '[]'::jsonb))));
  END IF;
  RETURN jsonb_build_object('ok', true, 'avant', v_avant, 'apres', v_apres);
END;
$function$;

-- ═══ 6. Droits : rien pour le client, tout pour le serveur ═════════════════
REVOKE ALL ON FUNCTION public.cloud_ip_sante_noter(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_sante_noter(bigint, jsonb) TO service_role;
