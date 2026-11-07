-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — IP TOUJOURS D'AVANCE, PLUS DE PLAFOND EN DOLLARS, CAPACITÉ MESURÉE (07/11/2026, décisions de Nico)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis (essai jetable : scripts/essais/20261107180000_banc.mjs).
--
-- 1. « IP toujours d'avance » : coin_config cloud_ip_marge (3 au départ) = les IP attribuables gardées d'avance sur les
--    comptes Cloud ; l'orchestrateur achète ce qui manque (entretien horaire + réapprovisionnement rapide) et renouvelle
--    les IP des comptes avant leur échéance, celles de la marge suivant la même règle. cloud_ip_stock_min reste en base
--    (lu par l'orchestrateur d'avant tant qu'il n'est pas redéployé) ; le nouveau ne le lit plus.
-- 2. « Plus de plafond en dollars » : cloud_ip_depense_ouvrir ne lit plus cloud_ip_budget_mensuel_usd (la ligne reste
--    en base, inerte, pour l'orchestrateur d'avant et l'inverse). À sa place, sous LE MÊME verrou
--    (pg_advisory_xact_lock 'cloud_ip_depense' : plusieurs serveurs, une seule vérité), UNE garde du NOMBRE pour un ACHAT
--    (cloud_ip_garde_nombre) :
--      comptées = IP attribuées + IP du pool (achetee, disponible) qui couvrent un essai, non usées, sans refus prouvé
--                 + IP en commande (achats demandee / en_cours) + IP demandées ;
--      borne    = comptes Cloud (actifs, ou titulaires d'une IP) + marge + personnes en attente ;
--    refus « garde_nombre » au-delà (l'orchestrateur alerte support@ tout de suite). Elle compte un SOUS-ENSEMBLE de ce que
--    compte le plan de l'orchestrateur (planDuJour) : jamais le repos ni une IP qui expire bientôt — un achat que le plan
--    demande passe toujours ; seule une boucle bute. Une PROLONGATION n'y passe jamais (une IP gardée n'ajoute rien) ; son
--    anti-boucle : la même commande (ou la même IP) jamais prolongée deux fois en cloud_ip_prolongation_espacement_jours
--    (15 par défaut, absent de coin_config) — refus « prolongation_recente ».
-- 3. Le moyen de paiement (addendum) : coin_config cloud_ip_paiement_carte NAÎT À 0 (le solde, comme aujourd'hui) ;
--    cloud_ip_carte_id n'est pas créé (absent = la carte qui expire le plus tard). Le registre ne change pas.
-- 4. La capacité mesurée : cloud_capacite_mesures(serveur, heures) rend, sur les mesures de l'agent (cloud_mesures), les
--    projections que l'orchestrateur lit chaque heure (flotte.js, capaciteMesuree) ; coin_config cloud_capacite_alerte_pct
--    = 80 (absent jusqu'ici = 65 dans le code d'avant).
-- cloud_pool_etat : « budget_mensuel_usd » et « stock_min » retirés (plus lus) ; « marge », « garde », « paiement_carte »
-- ajoutés ; les autres clés inchangées.
--
-- Réécrites DEPUIS pg_get_functiondef de la prod du 07/11 (fixtures : scripts/essais/fixtures/prod-0711-ip-garde/) :
-- cloud_ip_depense_ouvrir, cloud_pool_etat. Signatures, retours et droits INCHANGÉS (CREATE OR REPLACE garde les GRANT).
-- Fonctions neuves : cloud_ip_garde_nombre(integer), cloud_capacite_mesures(text, integer) — service_role seul.
-- Coût mesuré en prod (EXPLAIN ANALYZE en lecture seule, 07/11) : la garde = 2,4 ms (profiles parcourue une fois, 363 blocs,
-- appelée seulement quand un achat se prépare) ; cloud_capacite_mesures('cloud-2', 24) = 3,6 ms (218 fenêtres, 52 blocs,
-- une fois par heure) ; les trois lectures du réapprovisionnement rapide (toutes les 5 min) = 1,3 ms (7 blocs).
-- Inverse : supabase/rollbacks/20261107180000_cloud_ip_marge_garde_nombre_INVERSE.sql. Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- ═══ 0. Réglages (absente = le défaut de cloud_param) ═══════════════════════
INSERT INTO public.coin_config (key, value) VALUES
  ('cloud_ip_marge', 3),
  ('cloud_ip_paiement_carte', 0),
  ('cloud_capacite_alerte_pct', 80)
ON CONFLICT (key) DO NOTHING;

-- ═══ 1. La garde du nombre (miroir EXACT : regles.gardeNombre, supabase/functions/_shared/cloud-pool.js) ═══
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
               AND NOT public.cloud_ip_refus_prouve(i.refus)))::int AS vivantes,
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

-- ═══ 2. La dépense : plus de plafond en dollars ; la garde du nombre (achat), l'anti-boucle (prolongation) ═══
-- Réécrite depuis la prod (07/11). Change : v_budget et le refus « plafond » retirés ; sous le verrou, la garde du nombre
-- pour un achat, l'anti-boucle pour une prolongation ; le retour garde « depense_mois_usd » (information) et dit la garde.
CREATE OR REPLACE FUNCTION public.cloud_ip_depense_ouvrir(p_nature text, p_quantite integer, p_prix_usd numeric, p_ip bigint DEFAULT NULL::bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_garde jsonb;
  v_commande text := NULLIF(btrim(COALESCE(p_details ->> 'commande', '')), '');
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
  -- Sous verrou : deux entretiens (deux serveurs) ne passent jamais ensemble ; le second voit la ligne du premier.
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip_depense', 0));
  IF p_nature = 'achat' THEN
    v_garde := public.cloud_ip_garde_nombre(p_quantite);
    IF (v_garde ->> 'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'garde_nombre', 'garde', v_garde);
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.cloud_ip_commandes c
                 WHERE c.nature = 'prolongation' AND c.statut NOT IN ('echec', 'remboursee')
                   AND c.demandee_le > now() - make_interval(days => public.cloud_param('ip_prolongation_espacement_jours', 15))
                   AND ((v_commande IS NOT NULL AND c.details ->> 'commande' = v_commande)
                        OR (p_ip IS NOT NULL AND c.ip_id = p_ip))) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'prolongation_recente', 'commande', v_commande, 'ip_id', p_ip);
  END IF;
  INSERT INTO public.cloud_ip_commandes (fournisseur, nature, quantite, statut, prix_usd, go_par, ip_id, details)
  VALUES ('iproyal', p_nature, p_quantite, 'demandee', p_prix_usd,
          CASE WHEN p_nature = 'achat' THEN 'automatique (cloud_ip_achats_auto)' ELSE 'automatique (cloud_ip_renouvellement_auto)' END,
          p_ip, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  IF p_ip IS NOT NULL THEN
    PERFORM public.cloud_journal(p_ip, 'depense', NULL, jsonb_build_object('commande_id', v_id, 'nature', p_nature, 'prix_usd', p_prix_usd));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'depense_mois_usd', public.cloud_ip_depenses_mois(), 'garde', v_garde);
END;
$function$;

-- ═══ 3. L'état du pool ═══════════════════════════════════════════════════════
-- Réécrite depuis la prod (07/11). Change : « stock_min » et « budget_mensuel_usd » retirés ; « marge », « garde »,
-- « paiement_carte » ajoutés. Les autres clés inchangées.
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
    'marge', public.cloud_param('ip_marge', 3),
    'garde', public.cloud_ip_garde_nombre(0),
    'depenses_mois_usd', public.cloud_ip_depenses_mois(),
    'paiement_carte', public.cloud_param('ip_paiement_carte', 0),
    'achats_auto', public.cloud_param('ip_achats_auto', 0),
    'renouvellement_auto', public.cloud_param('ip_renouvellement_auto', 0)
  );
$function$;

-- ═══ 4. La capacité mesurée (lue chaque heure par l'orchestrateur : flotte.js, capaciteMesuree) ═══
-- Sur les `p_heures` dernières heures (24 ; borné à 1-168) de CE serveur, fenêtre par fenêtre (agent fillsell-mesure) :
--   n_mem  = comptes ouverts + min(70 % de la mémoire − mémoire utilisée, mémoire disponible − 6 Gio) / mémoire p95 d'un compte ;
--   n_cpu  = comptes ouverts × 60 / processeur p95 de l'hôte ;  n_puce = idem pour la puce (fenêtres à 1 compte ou plus) ;
-- chacune au 5e centile des fenêtres (= la charge au 95e) — les limites de la règle chiffrée du 06/11 (70 % de la mémoire,
-- 6 Gio libres, 60 % du processeur et de la puce). Et : fenêtres, comptes au plus, signes graves sur 7 jours (restriction,
-- blocage), oom. Lecture seule, une fois par heure (≤ 288 lignes).
CREATE OR REPLACE FUNCTION public.cloud_capacite_mesures(p_serveur text, p_heures integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH f AS (
    SELECT m.le, COALESCE((m.hote ->> 'navigateurs_max')::numeric, 0) AS n,
           (m.hote ->> 'mem_total_mo')::numeric AS total, (m.hote ->> 'mem_dispo_min_mo')::numeric AS dispo,
           (m.hote ->> 'cpu_p95_pct')::numeric AS cpu, (m.hote ->> 'puce_p95_pct')::numeric AS puce, m.comptes
      FROM public.cloud_mesures m
     WHERE m.serveur = p_serveur
       AND m.le > now() - make_interval(hours => GREATEST(LEAST(COALESCE(p_heures, 24), 168), 1))),
  c AS (
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY (e.v ->> 'mem_max_mo')::numeric) AS mem_compte_p95,
           COALESCE(sum(COALESCE((e.v ->> 'oom')::int, 0)), 0) AS oom
      FROM f CROSS JOIN LATERAL jsonb_each(f.comptes) e(u, v)
     WHERE jsonb_typeof(e.v) = 'object' AND e.v ? 'mem_max_mo'),
  g AS (
    SELECT COALESCE(sum(COALESCE((e.v -> 'signes' ->> 'restriction')::int, 0) + COALESCE((e.v -> 'signes' ->> 'blocage')::int, 0)), 0) AS graves
      FROM public.cloud_mesures m CROSS JOIN LATERAL jsonb_each(m.comptes) e(u, v)
     WHERE m.serveur = p_serveur AND m.le > now() - interval '7 days' AND jsonb_typeof(e.v) = 'object'),
  p AS (
    SELECT percentile_cont(0.05) WITHIN GROUP (ORDER BY f.n + LEAST(0.70 * f.total - (f.total - f.dispo), f.dispo - 6144) / c.mem_compte_p95)
             FILTER (WHERE f.total > 0 AND f.dispo IS NOT NULL) AS n_mem,
           percentile_cont(0.05) WITHIN GROUP (ORDER BY CASE WHEN f.cpu > 0 THEN 60 * f.n / f.cpu END) FILTER (WHERE f.n >= 1) AS n_cpu,
           percentile_cont(0.05) WITHIN GROUP (ORDER BY CASE WHEN f.puce > 0 THEN 60 * f.n / f.puce END) FILTER (WHERE f.n >= 1) AS n_puce
      FROM f CROSS JOIN c WHERE c.mem_compte_p95 > 0)
  SELECT jsonb_build_object(
    'serveur', p_serveur,
    'fenetres', (SELECT count(*) FROM f),
    'fenetres_avec_comptes', (SELECT count(*) FROM f WHERE f.n >= 1),
    'comptes_max', (SELECT max(f.n) FROM f),
    'mem_total_mo', (SELECT max(f.total) FROM f),
    'dispo_min_mo', (SELECT min(f.dispo) FROM f),
    'mem_compte_p95_mo', round(c.mem_compte_p95),
    'n_mem', floor(p.n_mem), 'n_cpu', floor(p.n_cpu), 'n_puce', floor(p.n_puce),
    'oom', c.oom, 'graves_7j', g.graves,
    'derniere_le', (SELECT max(f.le) FROM f))
  FROM c CROSS JOIN g LEFT JOIN p ON true;
$function$;

-- ═══ 5. Droits : rien pour le client, tout pour le serveur ═════════════════
REVOKE ALL ON FUNCTION public.cloud_ip_garde_nombre(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloud_capacite_mesures(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_garde_nombre(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_capacite_mesures(text, integer) TO service_role;
