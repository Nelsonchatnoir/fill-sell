-- (21/11/2026 soir, décision de Nico) Les annonces EN LIGNE rangées dans un rayon incohérent avec leur titre (audit du
-- 21/11 + contrôle de cohérence) ne sont PAS touchées. Leur fiche reçoit la catégorie CORRIGÉE (attributs.categorie_corrigee,
-- source « manuel » : la décision de Nico) : la PROCHAINE republication repart dedans (_shared/categorie-republication.js :
-- get-pending-jobs pour Leboncoin et Beebs, la correction de capture pour Vinted, ebay-api-worker pour eBay).
-- La tâche Vans déjà en file (fc6058d3, Leboncoin, republication) reçoit tout de suite « Mode › Chaussures ».
-- Rayons choisis dans les arbres relevés (identifiants vérifiés) :
--   Vinted 1795180771367000 « Pull neuf kaki TU » (femme)         → 197  Femmes › Vêtements › Sweats et sweats à capuche › Autres pull-overs & sweat-shirts
--   Vinted 1795180770389015 « Pull homme Brooks XL »               → 267  Hommes › Vêtements › Sweats et pulls › Pulls et pulls à capuche
--   Vinted 1795252281600 « Gilet Sixth June » (sans manches, maille)→ 2553 Hommes › Vêtements › Manteaux et vestes › Vestes sans manches
--   Beebs + Leboncoin 1794585418334010 « miniature blendeur rose »  → Jeux, jouets et loisirs › Poupées › Accessoires pour poupées et poupons ; Loisirs › Jeux & Jouets
--   Leboncoin 1793541891471 « pin's pikachu »                      → Loisirs › Collection
--   Leboncoin 1793886273736022 « Vans Sk8-Hi »                     → Mode › Chaussures
--   eBay 1795264600083 « Petite boîte en émail cloisonné »         → 36017 Maison › Décoration d'intérieur › Boîtes, jarres, bocaux
--   eBay 1794833852786014 « Lot 2 boîtes pot-pourri »              → 20552 Maison › Décoration d'intérieur › Parfums d'intérieur
-- Sauvegarde : _backup_2111_categorie_corrigee (attributs des 8 fiches, platform_fields de la tâche Vans). Inverse :
-- 20261121_categorie_corrigee_8_annonces_INVERSE.sql. Rien retiré, rien republié.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_2111_categorie_corrigee') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_2111_categorie_corrigee AS
  SELECT 'inventaire'::text AS quoi, i.id::text AS cle, i.user_id, i.attributs AS avant, now() AS le
    FROM public.inventaire i
   WHERE i.id IN (1795180771367000, 1795180770389015, 1795252281600, 1794585418334010, 1793541891471, 1793886273736022, 1795264600083, 1794833852786014)
  UNION ALL
  SELECT 'job', j.id::text, j.user_id, j.platform_fields, now()
    FROM public.cross_post_jobs j WHERE j.id = 'fc6058d3-d107-44df-b166-707a9b1657b7';
ALTER TABLE public._backup_2111_categorie_corrigee ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_categorie_corrigee FROM PUBLIC, anon, authenticated;

WITH corr(id, v) AS (VALUES
  (1795180771367000, '{"vinted": {"chemin": ["Femmes", "Vêtements", "Sweats et sweats à capuche", "Autres pull-overs & sweat-shirts"], "id": "197"}}'::jsonb),
  (1795180770389015, '{"vinted": {"chemin": ["Hommes", "Vêtements", "Sweats et pulls", "Pulls et pulls à capuche"], "id": "267"}}'::jsonb),
  (1795252281600,    '{"vinted": {"chemin": ["Hommes", "Vêtements", "Manteaux et vestes", "Vestes sans manches"], "id": "2553"}}'::jsonb),
  (1794585418334010, '{"beebs": {"chemin": ["Jeux, jouets et loisirs", "Poupées", "Accessoires pour poupées et poupons"]}, "leboncoin": {"chemin": ["Loisirs", "Jeux & Jouets"]}}'::jsonb),
  (1793541891471,    '{"leboncoin": {"chemin": ["Loisirs", "Collection"]}}'::jsonb),
  (1793886273736022, '{"leboncoin": {"chemin": ["Mode", "Chaussures"]}}'::jsonb),
  (1795264600083,    '{"ebay": {"chemin": ["Maison", "Décoration d''intérieur", "Boîtes, jarres, bocaux"], "id": "36017"}}'::jsonb),
  (1794833852786014, '{"ebay": {"chemin": ["Maison", "Décoration d''intérieur", "Parfums d''intérieur"], "id": "20552"}}'::jsonb)
)
UPDATE public.inventaire i
   SET attributs = jsonb_build_object('categorie_corrigee', jsonb_build_object('v', c.v, 'source', 'manuel', 'at', now()::text,
       'motif', 'reparation_2111_coherence_categories (décision de Nico, 21/11 soir)'))
  FROM corr c WHERE i.id = c.id;

UPDATE public.cross_post_jobs j
   SET platform_fields = jsonb_set(j.platform_fields, '{lbcCategoryPath}', '["Mode", "Chaussures"]'::jsonb)
       || jsonb_build_object('categorie_corrigee_avant_depart', jsonb_build_object('avant', j.platform_fields -> 'lbcCategoryPath',
          'apres', '["Mode", "Chaussures"]'::jsonb, 'regle', 'chaussure_hors_chaussures', 'source', 'reparation', 'le', now()::text,
          'pose_par', 'scripts/reparations/20261121_categorie_corrigee_8_annonces.sql'))
 WHERE j.id = 'fc6058d3-d107-44df-b166-707a9b1657b7' AND j.status = 'pending';
COMMIT;
