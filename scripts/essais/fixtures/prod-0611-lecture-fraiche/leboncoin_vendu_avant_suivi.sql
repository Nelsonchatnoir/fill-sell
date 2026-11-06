CREATE OR REPLACE FUNCTION public.leboncoin_vendu_avant_suivi(p_user uuid, p_listing text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
           SELECT lower(btrim(COALESCE(u.metadata ->> 'transaction', ''))) = 'sold'
              AND NULLIF(btrim(COALESCE(u.metadata ->> 'avant', '')), '') IS NULL
             FROM public.usage_logs u
            WHERE u.user_id = p_user AND u.feature = 'vente_leboncoin_transaction'
              AND u.metadata ->> 'listing_id' = btrim(p_listing)
            ORDER BY u.created_at LIMIT 1), false)
     AND NOT EXISTS (
           SELECT 1 FROM public.usage_logs u
            WHERE u.user_id = p_user AND u.feature = 'vente_leboncoin_transaction'
              AND u.metadata ->> 'listing_id' = btrim(p_listing)
              AND (lower(COALESCE(u.metadata ->> 'transaction', '')) IN ('aucune', 'pending')
                   OR lower(COALESCE(u.metadata ->> 'avant', '')) IN ('aucune', 'pending')));
$function$
