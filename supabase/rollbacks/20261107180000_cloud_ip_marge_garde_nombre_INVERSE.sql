-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de supabase/migrations/20261107180000_cloud_ip_marge_garde_nombre.sql — les corps de la PROD du 07/11
-- (pg_get_functiondef, fixtures : scripts/essais/fixtures/prod-0711-ip-garde/), mot pour mot.
-- Ordre : REDÉPLOYER D'ABORD l'orchestrateur d'avant (il relit cloud_ip_stock_min et cloud_ip_budget_mensuel_usd, restés en
-- base), puis ce fichier : cloud_pool_etat d'avant (il ne lit plus cloud_ip_garde_nombre), cloud_ip_depense_ouvrir d'avant
-- (le plafond en dollars revient), les deux fonctions neuves retirées, les trois réglages créés par la migration retirés
-- (cloud_ip_marge, cloud_ip_paiement_carte, cloud_capacite_alerte_pct — absent = 65 dans le code d'avant).
-- Les dépenses inscrites entre-temps restent au registre (cloud_ip_commandes) : rien n'est effacé.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

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
$function$
;

CREATE OR REPLACE FUNCTION public.cloud_ip_depense_ouvrir(p_nature text, p_quantite integer, p_prix_usd numeric, p_ip bigint DEFAULT NULL::bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

DROP FUNCTION IF EXISTS public.cloud_capacite_mesures(text, integer);
DROP FUNCTION IF EXISTS public.cloud_ip_garde_nombre(integer);
DELETE FROM public.coin_config WHERE key IN ('cloud_ip_marge', 'cloud_ip_paiement_carte', 'cloud_capacite_alerte_pct');
