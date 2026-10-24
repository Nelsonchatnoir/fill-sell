-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (lot « zéro blocage », A7) — le catalogue Vinted PARTAGÉ écrit en ITALIEN, remis en français.
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause : `platform_category_aspects` n'a pas de colonne pays ; l'extension (persistDiscoveredAspects, background.js)
-- relève les champs du formulaire de dépôt et les écrit tels qu'affichés. Le 24/10 (09:45 → 15:05), la page de
-- mele.marta (compte italien sur vinted.fr, page servie en italien, profiles.extension_sessions langue « it-fr ») a
-- réécrit 8 lignes communes à TOUS les comptes : « Condizioni » avec « Nuovo con cartellino / Ottime / Buone… »,
-- « Taglia », « Materiale (consigliato) », « 1|ConsigliatoPiccola », « Piattaforma », « Classificazione per età ».
-- Effet : l'écran Publier de n'importe quel compte français compare l'état de sa fiche (« Très bon état ») à la
-- liste italienne → champ « Condizioni » demandé, bloquant (les 35 blocages de mele.marta viennent de là).
-- Le geste : remettre les libellés et les listes FRANÇAIS, sans rien toucher d'autre (required, source, dates) :
--   · état (3 lignes) : les 5 états français de Vinted (ETATS_VINTED.fr, _shared/vinted-pays.ts) ;
--   · taille et matière des T-shirts : la grille et la liste françaises du rayon voisin « Blouses » (même grille) ;
--   · format du colis des T-shirts : « 1|Petit, 2|Moyen, 3|Grand » (rayon voisin « Chemises ») ;
--   · plateforme des jeux : le libellé « Plateforme » (les valeurs sont des noms de consoles, identiques) ;
--   · classement des jeux : « Classement du contenu » et ses 17 valeurs (VINTED_CLASSEMENTS, src/utils/jeuxVideo.js).
-- Gardes (sinon RIEN) : chaque ligne porte encore l'écriture italienne relevée ; les rayons voisins sont en français.
-- Sauvegarde protégée : _backup_2410_catalogue_vinted_italien. Inverse : …_INVERSE.sql. Aucun job, aucune annonce,
-- aucun mail touchés.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public._backup_2410_catalogue_vinted_italien AS
  SELECT now() AS sauvegarde_le, a.* FROM public.platform_category_aspects a WHERE false;
ALTER TABLE public._backup_2410_catalogue_vinted_italien ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_catalogue_vinted_italien FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_catalogue_vinted_italien
  SELECT now(), a.* FROM public.platform_category_aspects a
   WHERE a.id IN ('f4941c98-75fb-4854-8b08-7c24a3b30a9e', '1e5076c2-5350-41b3-9ba3-b08f1c9e9ae4', '8c0be6e4-cd7f-4e8b-ba29-1470828af575',
                  '27b3e1c9-2aed-446b-b8aa-2eeb0c38ba01', '1b709e22-f8b8-46b5-ab74-9b8566cf78b0', 'f1f537cd-e4fa-4174-9a92-99424e568b6b',
                  '464d145a-fd75-4080-b308-d4b4a8fe1d87', 'f065d8d3-b644-4bcc-9816-44387bd5acda');

DO $$
DECLARE
  v_etats constant jsonb := '["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"]'::jsonb;
  v_classements constant jsonb := '["AO – Réservé aux adultes", "E – Tous publics", "E10+ – 10 ans et plus", "M – 17 ans et plus", "Non précisé", "PEGI 12", "PEGI 16", "PEGI 18", "PEGI 3", "PEGI 7", "RP – En attente de classement", "T – 13 ans et plus", "USK 0", "USK 12", "USK 16", "USK 18", "USK 6"]'::jsonb;
  v_taille jsonb;
  v_matiere jsonb;
  n integer;
  total integer := 0;
BEGIN
  SELECT allowed_values INTO v_taille FROM public.platform_category_aspects
   WHERE platform = 'vinted' AND category_key = 'Femmes > Vêtements > Hauts et t-shirts > Blouses' AND field_key = 'size' AND field_label = 'Taille';
  SELECT allowed_values INTO v_matiere FROM public.platform_category_aspects
   WHERE platform = 'vinted' AND category_key = 'Femmes > Vêtements > Hauts et t-shirts > Blouses' AND field_key = 'material' AND field_label = 'Matériau (recommandé)';
  IF v_taille IS NULL OR v_taille::text !~ 'Taille unique' OR v_taille::text ~ 'Taglia' THEN
    RAISE EXCEPTION 'grille française des Blouses introuvable ou étrangère — rien n''est fait';
  END IF;
  IF v_matiere IS NULL OR v_matiere::text !~ 'Coton' OR v_matiere::text ~ 'Cotone' THEN
    RAISE EXCEPTION 'liste française des matières des Blouses introuvable ou étrangère — rien n''est fait';
  END IF;

  UPDATE public.platform_category_aspects SET field_label = 'État', allowed_values = v_etats
   WHERE id IN ('f4941c98-75fb-4854-8b08-7c24a3b30a9e', '1b709e22-f8b8-46b5-ab74-9b8566cf78b0', 'f1f537cd-e4fa-4174-9a92-99424e568b6b')
     AND platform = 'vinted' AND field_key = 'condition' AND allowed_values::text ~ 'Nuovo con cartellino';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 3 THEN RAISE EXCEPTION 'états : % ligne(s) au lieu de 3 — rien n''est fait', n; END IF;

  UPDATE public.platform_category_aspects SET field_label = 'Taille', allowed_values = v_taille
   WHERE id = '1e5076c2-5350-41b3-9ba3-b08f1c9e9ae4' AND platform = 'vinted' AND field_key = 'size' AND field_label = 'Taglia';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'taille : % ligne(s) — rien n''est fait', n; END IF;

  UPDATE public.platform_category_aspects SET field_label = 'Matériau (recommandé)', allowed_values = v_matiere
   WHERE id = '8c0be6e4-cd7f-4e8b-ba29-1470828af575' AND platform = 'vinted' AND field_key = 'material' AND field_label = 'Materiale (consigliato)';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'matière : % ligne(s) — rien n''est fait', n; END IF;

  UPDATE public.platform_category_aspects SET field_label = 'Format du colis', allowed_values = '["1|Petit", "2|Moyen", "3|Grand"]'::jsonb
   WHERE id = '27b3e1c9-2aed-446b-b8aa-2eeb0c38ba01' AND platform = 'vinted' AND field_key = 'package_size' AND allowed_values::text ~ 'Piccola';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'format du colis : % ligne(s) — rien n''est fait', n; END IF;

  UPDATE public.platform_category_aspects SET field_label = 'Plateforme'
   WHERE id = '464d145a-fd75-4080-b308-d4b4a8fe1d87' AND platform = 'vinted' AND field_key = 'video_game_platform' AND field_label = 'Piattaforma';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'plateforme : % ligne(s) — rien n''est fait', n; END IF;

  UPDATE public.platform_category_aspects SET field_label = 'Classement du contenu', allowed_values = v_classements
   WHERE id = 'f065d8d3-b644-4bcc-9816-44387bd5acda' AND platform = 'vinted' AND field_key = 'video_game_ratings' AND field_label = 'Classificazione per età';
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF n <> 1 THEN RAISE EXCEPTION 'classement : % ligne(s) — rien n''est fait', n; END IF;

  RAISE NOTICE 'catalogue Vinted remis en français : % lignes', total;
END $$;

SELECT a.id, a.category_key, a.field_key, a.field_label, left(a.allowed_values::text, 90) AS valeurs
  FROM public.platform_category_aspects a
 WHERE a.id IN ('f4941c98-75fb-4854-8b08-7c24a3b30a9e', '1e5076c2-5350-41b3-9ba3-b08f1c9e9ae4', '8c0be6e4-cd7f-4e8b-ba29-1470828af575',
                '27b3e1c9-2aed-446b-b8aa-2eeb0c38ba01', '1b709e22-f8b8-46b5-ab74-9b8566cf78b0', 'f1f537cd-e4fa-4174-9a92-99424e568b6b',
                '464d145a-fd75-4080-b308-d4b4a8fe1d87', 'f065d8d3-b644-4bcc-9816-44387bd5acda')
 ORDER BY a.category_key, a.field_key;
COMMIT;
