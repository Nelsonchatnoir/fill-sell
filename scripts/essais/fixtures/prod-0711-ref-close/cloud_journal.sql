CREATE OR REPLACE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
  VALUES (p_ip, p_nature, p_user, COALESCE(p_details, '{}'::jsonb));
$function$
