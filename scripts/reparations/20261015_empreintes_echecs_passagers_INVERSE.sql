-- INVERSE de 20261015_empreintes_echecs_passagers.sql : les lignes sauvegardées
-- reviennent dans photo_empreintes_echecs (sauf celles dont la photo a depuis
-- une empreinte ou un nouvel échec noté).
BEGIN;
INSERT INTO public.photo_empreintes_echecs
  SELECT b.* FROM public._backup_1510_empreintes_echecs_passagers b
   WHERE NOT EXISTS (SELECT 1 FROM public.photo_empreintes_echecs e WHERE e.url = b.url)
     AND NOT EXISTS (SELECT 1 FROM public.photo_empreintes p WHERE p.url = b.url);
COMMIT;
