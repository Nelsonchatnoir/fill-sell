CREATE OR REPLACE FUNCTION public.cloud_ip_depense_fermer(p_id bigint, p_statut text, p_commande text DEFAULT NULL::text, p_prix_usd numeric DEFAULT NULL::numeric, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
