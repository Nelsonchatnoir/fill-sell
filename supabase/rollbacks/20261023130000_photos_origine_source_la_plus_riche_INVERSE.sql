-- INVERSE de 20261023130000_photos_origine_source_la_plus_riche : les deux fonctions reprennent leur corps lu en prod
-- le 23/10 vers 12:30 (pg_get_functiondef, avant application).
BEGIN;
CREATE OR REPLACE FUNCTION public.annonce_capture_complete_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF jsonb_typeof(NEW.capture -> 'photos') = 'array' AND jsonb_array_length(NEW.capture -> 'photos') > 1 THEN
      PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.capture);
    ELSIF jsonb_typeof(NEW.donnees_index -> 'photos') = 'array' AND jsonb_array_length(NEW.donnees_index -> 'photos') > 1 THEN
      PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.donnees_index);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_capture_complete_fiche : annonce % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fiche_completer_photos_capture(p_inventaire bigint, p_vignette text, p_capture jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_photos jsonb;
  v_avant jsonb;
  v_user uuid;
  n integer;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) — y compris par le déclencheur
  -- annonce_capture_complete_fiche lors d'une écriture de l'extension : la fiche
  -- doit appartenir à auth.uid(). service_role, cron et SQL d'administration :
  -- inchangés. Le déclencheur attrape l'exception (WARNING) : l'écriture de
  -- l'annonce n'est jamais refusée pour autant.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = p_inventaire AND i.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'fiche non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_inventaire IS NULL OR jsonb_typeof(p_capture -> 'photos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  -- (23/10) Toutes les photos de l'annonce, dans SON ordre, sans doublon.
  SELECT COALESCE(jsonb_agg(x.p ORDER BY x.o), '[]'::jsonb) INTO v_photos
    FROM (SELECT DISTINCT ON (t.p #>> '{}') t.p, t.o
            FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
           WHERE jsonb_typeof(t.p) = 'string' AND (t.p #>> '{}') ~ '^https?://'
           ORDER BY t.p #>> '{}', t.o) x;
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  SELECT i.photos, i.user_id INTO v_avant, v_user FROM inventaire i WHERE i.id = p_inventaire;
  -- (23/10) La photo de la fiche se lit sous ses deux formes (chaîne nue, objet {url}) ; sa copie chez nous
  -- (rapatriement, départ d'une publication) et la même image eBay à une autre taille sont la vignette.
  UPDATE inventaire i SET
    photos = v_photos,
    photos_a_rapatrier = true
   WHERE i.id = p_inventaire
     AND i.fusionne_dans IS NULL
     AND jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) <= 1
     AND public.photo_est_vignette_de_fiche(i.id, i.origine,
           CASE WHEN jsonb_typeof(i.photos) = 'array' THEN COALESCE(i.photos -> 0 ->> 'url', i.photos ->> 0) END,
           p_vignette, v_photos ->> 0);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM journaliser_fiche(v_user, p_inventaire, 'photos', left(COALESCE(v_avant::text, ''), 500),
      jsonb_array_length(v_photos)::text || ' photo(s) de l''annonce d''origine', 'releve', 'photos_origine_completees',
      jsonb_build_object('avant', CASE WHEN jsonb_typeof(v_avant) = 'array' THEN jsonb_array_length(v_avant) ELSE 0 END,
                         'apres', jsonb_array_length(v_photos), 'vignette', p_vignette));
  END IF;
  RETURN n > 0;
END;
$function$;

COMMIT;
