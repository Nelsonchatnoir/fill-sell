CREATE OR REPLACE FUNCTION public.listing_designe(p_listing text, p_url text, p_pid text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Un identifiant explicite contradictoire interdit le repli sur l'URL.
  -- On lit le segment d'annonce, jamais un nombre dans le titre ou la requête.
  SELECT length(btrim(coalesce(p_listing,''))) >= 4 AND
    CASE WHEN nullif(btrim(p_pid),'') IS NOT NULL THEN btrim(p_listing)=btrim(p_pid)
    ELSE btrim(p_listing)=coalesce(
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/items/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/ad/[^/]+/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/itm/(?:[^/]+/)?([0-9]+)(?:/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/p/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/(?:product|article)/(art_[A-Za-z0-9_-]+)(?:/|$)'), '') END;
$function$
;
