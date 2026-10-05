-- ═══════════════════════════════════════════════════════════════════════════
-- Les photos eBay lues par l'API reportées sur la fiche — 04/10/2026 (GO de Nico, 20:00)
-- ═══════════════════════════════════════════════════════════════════════════
-- 663 fiches eBay en stock, nées d'un relevé, à UNE photo alors que l'API eBay
-- a déjà rendu toutes les photos de leur annonce (donnees_index.photos) —
-- 3 607 photos, 35 comptes. La règle « un relevé reprend TOUTES les photos »
-- n'était tenue que pour la CAPTURE de l'extension. Même garde (« même
-- source » : fiche à une photo au plus, et c'est la vignette de l'annonce ou
-- sa copie rapatrie-fiche), même fonction (fiche_completer_photos_capture).
-- Rattrapage par lots de 25 : scripts/reparations/20261004_photos_ebay_lot.sql.
-- Inverse : la définition d'origine (20261004093000 et suivantes), à reposer
-- depuis pg_get_functiondef relu avant ce fichier :
--   annonce_capture_complete_fiche() : PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.capture);
--   déclencheur : AFTER UPDATE OF capture, inventaire_id … WHEN capture.photos > 1.
-- 1. LA RÈGLE (déclencheur) : la capture OU l'index de l'API, la capture
--    d'abord. Même garde, même fonction, rien d'autre.
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
DROP TRIGGER IF EXISTS annonce_capture_complete_fiche ON public.annonces_plateforme;
CREATE TRIGGER annonce_capture_complete_fiche
  AFTER UPDATE OF capture, inventaire_id, donnees_index ON public.annonces_plateforme
  FOR EACH ROW
  WHEN (new.inventaire_id IS NOT NULL AND (
        (new.capture IS NOT NULL AND jsonb_typeof(new.capture -> 'photos') = 'array' AND jsonb_array_length(new.capture -> 'photos') > 1)
     OR (new.donnees_index IS NOT NULL AND jsonb_typeof(new.donnees_index -> 'photos') = 'array' AND jsonb_array_length(new.donnees_index -> 'photos') > 1)))
  EXECUTE FUNCTION public.annonce_capture_complete_fiche();
