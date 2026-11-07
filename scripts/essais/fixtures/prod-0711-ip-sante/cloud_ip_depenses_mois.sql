CREATE OR REPLACE FUNCTION public.cloud_ip_depenses_mois(p_maintenant timestamp with time zone DEFAULT now())
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(sum(prix_usd), 0)::numeric
    FROM public.cloud_ip_commandes
   WHERE statut NOT IN ('echec', 'remboursee')
     AND date_trunc('month', demandee_le AT TIME ZONE 'Europe/Paris') = date_trunc('month', p_maintenant AT TIME ZONE 'Europe/Paris');
$function$
