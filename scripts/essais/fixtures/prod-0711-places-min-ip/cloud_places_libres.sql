CREATE OR REPLACE FUNCTION public.cloud_places_libres()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH servis AS (SELECT c.user_id FROM public.cloud_comptes_a_servir() c),
       reserves AS (
         SELECT DISTINCT i.reserve_pour AS u FROM public.cloud_ips i
          WHERE i.reserve_pour IS NOT NULL AND i.reserve_jusqu_au > now()
            AND NOT EXISTS (SELECT 1 FROM servis s WHERE s.user_id = i.reserve_pour))
  SELECT GREATEST(
    COALESCE((SELECT sum(s.capacite) FROM public.cloud_serveurs s
               WHERE s.etat = 'actif' AND s.vu_le > now() - interval '5 minutes'
                 AND COALESCE(s.details -> 'service' ->> 'apte', '') = 'true'), 0)::int
    - (SELECT count(*) FROM servis)::int
    - (SELECT count(*) FROM reserves)::int, 0);
$function$
