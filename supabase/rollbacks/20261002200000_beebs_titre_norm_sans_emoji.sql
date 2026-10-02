-- Retour arrière de 20261002200000 : beebs_titre_norm telle qu'en prod avant (20261001123000).
SET lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.beebs_titre_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT regexp_replace(btrim(COALESCE(p, '')), '\s+', ' ', 'g');
$f$;
