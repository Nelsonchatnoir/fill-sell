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
