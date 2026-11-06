CREATE OR REPLACE FUNCTION public.leboncoin_transaction_lue(p_colonne text, p_capture jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_colonne), '') IS NOT NULL THEN left(lower(btrim(p_colonne)), 40)
    WHEN jsonb_typeof(p_capture -> 'attributs_bruts') = 'array' THEN coalesce(
      (SELECT left(lower(btrim(e ->> 'value')), 40) FROM jsonb_array_elements(p_capture -> 'attributs_bruts') e
        WHERE e ->> 'key' = 'transaction_status' AND nullif(btrim(e ->> 'value'), '') IS NOT NULL LIMIT 1),
      'aucune')
    ELSE NULL END;
$function$
