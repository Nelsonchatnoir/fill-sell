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
$function$
