-- ═══════════════════════════════════════════════════════════════════════════
-- LA FICHE REÇOIT LA LECTURE LA PLUS RICHE DE SON ANNONCE D'ORIGINE (23/10, point 1 — audit du parc)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ (audit du 23/10, fiches importées depuis le 18/09) : 230 fiches eBay de 17 comptes ont 5 photos
-- alors que leur annonce en porte 6 à 24. La page eBay lue par l'extension (données ld+json) ne donne que 5 photos ;
-- le détail par l'API (Browse, GetItem) les donne toutes. La complétion prenait la CAPTURE d'abord : 5 photos, puis le
-- détail complet arrivait sur une fiche qui n'avait « déjà plus » une seule photo — plus rien ne la complétait.
-- LA RÈGLE :
--   1. annonce_capture_complete_fiche — la lecture qui porte le PLUS de photos l'emporte (page ou détail API) ;
--   2. fiche_completer_photos_capture — toutes les photos, dans l'ordre, sans doublon, les photos eBay en PLEINE
--      TAILLE (même clé d'image, s-l1600) ; et une fiche qui porte ENCORE ce que la base lui a mis à sa dernière
--      complétion (même nombre de photos, toutes des copies FillSell de CETTE fiche ou des photos eBay de son annonce)
--      reçoit la lecture plus riche quand elle arrive. ⛔ Une photo retouchée ou ajoutée par la personne, une photo
--      retirée par elle (le nombre ne correspond plus) : la fiche n'est plus jamais touchée.
-- Fonctions RÉÉCRITES depuis pg_get_functiondef relu en prod le 23/10 vers 12:30 (fiche_completer_photos_capture :
-- le corps de 20261023100000).
-- Inverse : supabase/rollbacks/20261023130000_photos_origine_source_la_plus_riche_INVERSE.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.annonce_capture_complete_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n_cap integer := CASE WHEN jsonb_typeof(NEW.capture -> 'photos') = 'array' THEN jsonb_array_length(NEW.capture -> 'photos') ELSE 0 END;
  n_idx integer := CASE WHEN jsonb_typeof(NEW.donnees_index -> 'photos') = 'array' THEN jsonb_array_length(NEW.donnees_index -> 'photos') ELSE 0 END;
BEGIN
  BEGIN
    -- (23/10) La lecture la plus riche l'emporte : la page eBay (ld+json) n'en donne que 5, le détail API toutes.
    IF n_idx > n_cap AND n_idx > 1 THEN
      PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.donnees_index);
    ELSIF n_cap > 1 THEN
      PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.capture);
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
  v_origine text;
  v_k integer;
  v_derniere integer;
  v_mode text;
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
  -- (23/10) Toutes les photos de l'annonce, dans SON ordre, sans doublon — une photo eBay en PLEINE TAILLE (la même
  -- clé d'image sert l'original sous s-l1600 ; deux tailles d'une même photo ne font qu'une).
  SELECT COALESCE(jsonb_agg(to_jsonb(x.u) ORDER BY x.o), '[]'::jsonb) INTO v_photos
    FROM (SELECT DISTINCT ON (COALESCE(public.ebay_cle_image(t.p #>> '{}'), t.p #>> '{}'))
                 CASE WHEN public.ebay_cle_image(t.p #>> '{}') IS NOT NULL
                      THEN 'https://i.ebayimg.com/images/g/' || public.ebay_cle_image(t.p #>> '{}') || '/s-l1600.jpg'
                      ELSE t.p #>> '{}' END AS u, t.o
            FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
           WHERE jsonb_typeof(t.p) = 'string' AND (t.p #>> '{}') ~ '^https?://'
           ORDER BY COALESCE(public.ebay_cle_image(t.p #>> '{}'), t.p #>> '{}'), t.o) x;
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  SELECT i.photos, i.user_id, i.origine,
         CASE WHEN jsonb_typeof(i.photos) = 'array' THEN jsonb_array_length(i.photos) ELSE 0 END
    INTO v_avant, v_user, v_origine, v_k
    FROM inventaire i WHERE i.id = p_inventaire;
  -- 1. La vignette (ou sa copie) à la place de toutes les photos.
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
  v_mode := 'vignette';
  -- 2. (23/10) La fiche porte encore ce que la base lui a mis à sa dernière complétion, et cette lecture est plus riche.
  IF n = 0 AND v_k >= 2 AND jsonb_array_length(v_photos) > v_k AND COALESCE(v_origine, '') LIKE 'releve\_%' THEN
    SELECT (jl.detail ->> 'apres')::integer INTO v_derniere
      FROM inventaire_journal jl
     WHERE jl.inventaire_id = p_inventaire AND jl.champ = 'photos' AND jl.motif = 'photos_origine_completees'
     ORDER BY jl.created_at DESC, jl.id DESC NULLS LAST LIMIT 1;
    IF v_derniere = v_k AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_avant) AS e(p)
          -- une photo qui n'est ni une copie FillSell de CETTE fiche ni une photo eBay de l'annonce (NULL compris) : choix de la personne
          WHERE NOT COALESCE(
            COALESCE(e.p ->> 'url', e.p #>> '{}') ~ ('/(rapatrie-fiche|rehosted)/' || p_inventaire::text || '/')
            OR public.ebay_cle_image(COALESCE(e.p ->> 'url', e.p #>> '{}')) IN (
                 SELECT public.ebay_cle_image(v.u) FROM jsonb_array_elements_text(v_photos) AS v(u)), false)) THEN
      UPDATE inventaire i SET photos = v_photos, photos_a_rapatrier = true
       WHERE i.id = p_inventaire AND i.fusionne_dans IS NULL AND i.photos IS NOT DISTINCT FROM v_avant;
      GET DIAGNOSTICS n = ROW_COUNT;
      v_mode := 'lecture_plus_riche';
    END IF;
  END IF;
  IF n > 0 THEN
    PERFORM journaliser_fiche(v_user, p_inventaire, 'photos', left(COALESCE(v_avant::text, ''), 500),
      jsonb_array_length(v_photos)::text || ' photo(s) de l''annonce d''origine', 'releve', 'photos_origine_completees',
      jsonb_build_object('avant', CASE WHEN jsonb_typeof(v_avant) = 'array' THEN jsonb_array_length(v_avant) ELSE 0 END,
                         'apres', jsonb_array_length(v_photos), 'vignette', p_vignette, 'mode', v_mode));
  END IF;
  RETURN n > 0;
END;
$function$;

COMMIT;
