-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE PAR LOTS DE 25 : photos eBay lues par l'API → fiche (04/10, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- À relancer jusqu'à « completees = 0 », CPU relu entre deux lots.
-- Sauvegarde AVANT écriture (même instruction) : sauvegarde_photos_ebay_20261004.
-- Inverse : 20261004_photos_ebay_INVERSE.sql. Garde « même source » tenue par
-- fiche_completer_photos_capture (fiche ≤ 1 photo, vignette ou sa copie).
CREATE TABLE IF NOT EXISTS public.sauvegarde_photos_ebay_20261004 (
  inventaire_id bigint PRIMARY KEY, user_id uuid, photos jsonb, le timestamptz DEFAULT now());
ALTER TABLE public.sauvegarde_photos_ebay_20261004 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sauvegarde_photos_ebay_20261004 FROM anon, authenticated;
WITH lot AS (
  SELECT DISTINCT ON (i.id) i.id, i.user_id, i.photos, a.photo_url, a.donnees_index
    FROM public.inventaire i
    JOIN public.annonces_plateforme a ON a.inventaire_id = i.id AND a.disparu_le IS NULL AND a.platform = 'ebay'
   WHERE i.fusionne_dans IS NULL AND i.statut = 'stock' AND i.origine LIKE 'releve\_%'
     AND jsonb_array_length(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]' END) <= 1
     AND jsonb_typeof(a.donnees_index -> 'photos') = 'array' AND jsonb_array_length(a.donnees_index -> 'photos') > 1
     AND NOT EXISTS (SELECT 1 FROM public.sauvegarde_photos_ebay_20261004 s WHERE s.inventaire_id = i.id)
   ORDER BY i.id, a.vu_le DESC NULLS LAST
   LIMIT 25),
sauve AS (
  INSERT INTO public.sauvegarde_photos_ebay_20261004 (inventaire_id, user_id, photos)
  SELECT id, user_id, photos FROM lot ON CONFLICT DO NOTHING RETURNING inventaire_id)
SELECT count(*) AS lot,
       count(*) FILTER (WHERE public.fiche_completer_photos_capture(lot.id, lot.photo_url, lot.donnees_index)) AS completees,
       (SELECT count(*) FROM sauve) AS sauvegardees
  FROM lot;
