-- ═══════════════════════════════════════════════════════════════════════════
-- UNE FICHE IMPORTÉE REÇOIT TOUTES LES PHOTOS DE SON ANNONCE (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- louis@ttfamily.fr (Business), 27/09 21:38 : les annonces importées depuis
-- Beebs n'ont qu'UNE photo dans FillSell, alors qu'elles en ont 4 ou 5 sur
-- Beebs (« Rangement Gris pour 12 pots… », 34056081 : 4 photos capturées,
-- 1 sur la fiche).
--
-- CAUSE, mesurée : la capture complète de l'annonce (toutes les photos, dans
-- l'ordre) est bien faite — mais souvent APRÈS l'import, au relevé suivant.
-- Entre les deux, la vignette unique de la liste a été recopiée chez nous
-- (…/rapatrie-fiche/<id>/…_0.jpg). La règle de l'extension « ne remplacer
-- qu'une vignette de la plateforme » (reporterCaptureSurArticle) prenait alors
-- cette copie pour une photo du vendeur, et ne complétait plus jamais la fiche.
-- Mesure parc (fiches en stock à UNE photo = la vignette ou sa copie, dont
-- l'annonce a une capture à plusieurs photos) : 162 — Beebs 17, eBay 79,
-- Leboncoin 42, Opla 24.
--
-- Ce que fait cette migration — FICHES SEULEMENT, jamais une annonce en ligne :
--  1. fiche_completer_photos_capture() : sur une fiche NON fusionnée dont les
--     photos sont vides ou réduites à la vignette de l'annonce (ou à sa copie
--     « rapatrie-fiche »), pose les photos de la capture, dans l'ordre, et
--     l'inscrit à la file de rapatriement. Une photo prise par la personne
--     (autre adresse) n'est JAMAIS remplacée.
--  2. Déclencheur sur annonces_plateforme (capture posée ou rattachement) :
--     la fiche est complétée dès que la capture arrive, quel que soit le
--     build de l'extension.
--  3. Rattrapage des 162 fiches.

CREATE OR REPLACE FUNCTION public.fiche_completer_photos_capture(p_inventaire bigint, p_vignette text, p_capture jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_photos jsonb;
  n integer;
BEGIN
  IF p_inventaire IS NULL OR jsonb_typeof(p_capture -> 'photos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT COALESCE(jsonb_agg(p ORDER BY o), '[]'::jsonb) INTO v_photos
    FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
   WHERE jsonb_typeof(p) = 'string' AND (p #>> '{}') ~ '^https?://';
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  UPDATE inventaire i SET
    photos = v_photos,
    photos_a_rapatrier = true
   WHERE i.id = p_inventaire
     AND i.fusionne_dans IS NULL
     AND jsonb_array_length(COALESCE(i.photos, '[]'::jsonb)) <= 1
     AND (i.photos -> 0 IS NULL
          OR (i.photos ->> 0) = p_vignette
          OR (i.photos ->> 0) LIKE '%/rapatrie-fiche/' || p_inventaire::text || '/%');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.fiche_completer_photos_capture(bigint, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.annonce_capture_complete_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.capture);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_capture_complete_fiche : annonce % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS annonce_capture_complete_fiche ON public.annonces_plateforme;
CREATE TRIGGER annonce_capture_complete_fiche
  AFTER UPDATE OF capture, inventaire_id ON public.annonces_plateforme
  FOR EACH ROW
  WHEN (NEW.inventaire_id IS NOT NULL AND NEW.capture IS NOT NULL
        AND jsonb_typeof(NEW.capture -> 'photos') = 'array'
        AND jsonb_array_length(NEW.capture -> 'photos') > 1)
  EXECUTE FUNCTION public.annonce_capture_complete_fiche();

-- 3. Rattrapage (fiches en stock seulement ; une vendue garde ce qu'elle a).
SELECT count(*) FILTER (WHERE fiche_completer_photos_capture(x.inventaire_id, x.photo_url, x.capture)) AS fiches_completees
  FROM (
    SELECT DISTINCT ON (ap.inventaire_id) ap.inventaire_id, ap.photo_url, ap.capture
      FROM annonces_plateforme ap
      JOIN inventaire i ON i.id = ap.inventaire_id
     WHERE i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND jsonb_array_length(COALESCE(i.photos, '[]'::jsonb)) <= 1
       AND jsonb_typeof(ap.capture -> 'photos') = 'array'
       AND jsonb_array_length(ap.capture -> 'photos') > 1
     ORDER BY ap.inventaire_id, jsonb_array_length(ap.capture -> 'photos') DESC, ap.capture_le DESC
  ) x;
