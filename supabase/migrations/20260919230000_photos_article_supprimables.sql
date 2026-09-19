-- ═══════════════════════════════════════════════════════════════════════════
-- LE MÉNAGE DES PHOTOS QUAND UN ARTICLE EST SUPPRIMÉ (2026-09-19)
--
-- Supprimer un article ne supprimait RIEN dans listing-photos : App.jsx faisait
-- `from('inventaire').delete()` et s'arrêtait là. C'est la source des
-- orphelines que la migration 20260916081000 a dû lister à la main après coup
-- (3 738 objets sous <uid>/raw/, 1 278 Mo).
--
-- ⛔ CETTE FONCTION NE SUPPRIME RIEN. Elle est en LECTURE SEULE : elle rend la
--    liste des noms qu'il est sûr de supprimer. La suppression elle-même se
--    fait par l'API Storage côté client, sous la policy DELETE existante
--    (propriétaire de son dossier uniquement). Une erreur ici ne peut donc pas
--    détruire un fichier — elle peut seulement en épargner un de trop.
--
-- ── LES CINQ VERROUS DU 16/09, TOUS REPRIS, AUCUN RETIRÉ ───────────────────
--   1. l'URL n'est référencée NULLE PART (liste des référents ci-dessous) ;
--   2. AUCUNE sœur de la même fournée n'est référencée — une fournée dont une
--      photo sert appartient à un article, on n'y touche pas ;
--   3. le compte n'a AUCUNE génération facturée (usage_logs.feature =
--      'generate_listing') dans les ±24 h autour du téléversement : une photo
--      dont la génération a été PAYÉE n'est pas orpheline, elle est orpheline
--      DE TEXTE, et reste la matière première d'un rattrapage ;
--   4. le compte n'a créé AUCUN article dans les ±24 h autour du téléversement ;
--   5. elle a PLUS DE 7 JOURS. Rien de récent ne part, quoi qu'il arrive.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE, MESURÉE, À CONNAÎTRE : les verrous 3, 4 et 5 ont été
--    écrits pour un balayage RÉTROSPECTIF de photos dont on ignorait la
--    provenance. Appliqués au moment où l'on supprime UN article précis, ils
--    sont très conservateurs : une photo montée aujourd'hui et dont l'article
--    est supprimé aujourd'hui ne partira PAS (verrou 5), et une photo dont
--    l'article est passé par la génération payante ne partira pas non plus
--    (verrou 3). Le ménage attrape donc surtout les articles anciens, sans
--    génération autour. C'est volontaire : dans un geste irréversible, on
--    épargne plutôt que de détruire. À rediscuter si Nico veut que les
--    verrous 3-5 soient relâchés quand la provenance est CONNUE.
--
-- ── LA LISTE COMPLÈTE DES RÉFÉRENTS — MESURÉE, PAS SUPPOSÉE ────────────────
-- Relevé du 19/09 : balayage de TOUTES les colonnes text/jsonb/ARRAY du schéma
-- public à la recherche de « listing-photos ». Les tables vivantes qui en
-- portent :
--     vinted_republish_captures.photos_urls   4 765 lignes  ← le plus gros
--     cross_post_jobs.platform_fields         4 156         (republish_snapshot…)
--     cross_post_jobs.photos                  1 891
--     inventaire.photos                       1 246
--     fiches_annonce.fiche                      138
--     lens_scans.photos                           3
--     annonces_plateforme.photo_url               1
--     annonces_plateforme.capture                 (fil d'Ariane + photos)
--
-- ⚠️ LA MIGRATION DU 16/09 N'EN REGARDAIT QUE TROIS (inventaire.photos,
--    cross_post_jobs.photos, fiches_annonce.fiche). Les deux plus gros
--    référents — vinted_republish_captures.photos_urls et
--    cross_post_jobs.platform_fields — lui échappaient. VÉRIFIÉ le 19/09 :
--    zéro photo de sa liste figée n'est référencée par ces colonnes, ses
--    verrous 2 à 5 les ont protégées par accident. Rien à réparer, mais le
--    trou est refermé ici. ⛔ On ne touche pas à cette migration ni à sa liste.
--
-- Les ~100 tables `sauvegarde_*` / `jobs_*_backup_*` ne comptent PAS comme
-- référents : ce sont des photographies figées de lignes qui, par
-- construction, n'existent plus. Une photo que seule une sauvegarde mentionne
-- n'est utilisée par rien.
--
-- ── LES DEUX ANOMALIES D'ARBORESCENCE SONT IGNORÉES, PAS RANGÉES ───────────
-- Le bucket porte un dossier nommé par un timestamp (« 1782765789434/… ») et
-- un uid IMBRIQUÉ dans un uid. Le filtre `name LIKE <uid> || '/raw/%'` les
-- écarte tous les deux sans les toucher : le premier n'a pas un uid en tête,
-- le second n'a pas « raw » en deuxième segment.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.photos_article_supprimables(p_noms text[])
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefixe text;
BEGIN
  -- Pas de session, pas de liste : aucune suppression anonyme possible.
  IF v_uid IS NULL OR p_noms IS NULL OR array_length(p_noms, 1) IS NULL THEN
    RETURN;
  END IF;
  v_prefixe := v_uid::text || '/raw/';

  RETURN QUERY
  WITH cand AS (
    -- ⛔ LE GARDE D'APPARTENANCE : on ne considère QUE les objets du dossier
    --    de l'appelant, et QUE sous raw/. Un nom d'un autre compte passé à la
    --    main n'entre jamais dans la suite.
    SELECT o.name,
           o.created_at,
           split_part(split_part(o.name, '/', 3), '_', 1) AS lot
    FROM storage.objects o
    WHERE o.bucket_id = 'listing-photos'
      AND o.name = ANY (p_noms)
      AND o.name LIKE v_prefixe || '%'
  ),
  -- Toutes les photos des MÊMES fournées, y compris celles qu'on ne nous a pas
  -- demandées : c'est le verrou 2 qui a besoin de les voir.
  fratrie AS (
    SELECT o.name,
           split_part(split_part(o.name, '/', 3), '_', 1) AS lot
    FROM storage.objects o
    WHERE o.bucket_id = 'listing-photos'
      AND o.name LIKE v_prefixe || '%'
      AND split_part(split_part(o.name, '/', 3), '_', 1) IN (SELECT c.lot FROM cand c)
  ),
  -- ── Les textes où une URL listing-photos peut se trouver ─────────────────
  -- Les deux grosses tables sont restreintes au compte : une photo de
  -- <uid>/raw/ ne peut légitimement être référencée que par ses propres
  -- lignes. Les petites tables sont balayées EN ENTIER (≈ 6 500 lignes), pour
  -- couvrir aussi un référencement croisé accidentel.
  sources AS (
    SELECT i.photos::text AS t FROM public.inventaire i
      WHERE i.user_id = v_uid AND i.photos::text LIKE '%listing-photos%'
    UNION ALL
    SELECT j.photos::text FROM public.cross_post_jobs j
      WHERE j.user_id = v_uid AND j.photos::text LIKE '%listing-photos%'
    UNION ALL
    SELECT j.platform_fields::text FROM public.cross_post_jobs j
      WHERE j.user_id = v_uid AND j.platform_fields::text LIKE '%listing-photos%'
    UNION ALL
    SELECT f.fiche::text FROM public.fiches_annonce f
      WHERE f.fiche::text LIKE '%listing-photos%'
    UNION ALL
    SELECT array_to_string(v.photos_urls, ' ') FROM public.vinted_republish_captures v
      WHERE array_to_string(v.photos_urls, ' ') LIKE '%listing-photos%'
    UNION ALL
    SELECT a.photo_url FROM public.annonces_plateforme a
      WHERE a.photo_url LIKE '%listing-photos%'
    UNION ALL
    SELECT a.capture::text FROM public.annonces_plateforme a
      WHERE a.capture::text LIKE '%listing-photos%'
    UNION ALL
    SELECT l.photos::text FROM public.lens_scans l
      WHERE l.photos::text LIKE '%listing-photos%'
  ),
  -- ⛔ LE PIÈGE DU `?v=` (incident Delavier du 02/09) : les URLs portent une
  --    clé de cache en query. Comparer l'URL telle quelle ne matche RIEN — la
  --    première mesure du 16/09 rendait « 0 photo référencée sur 3 738 »,
  --    c'est-à-dire « supprimez tout ». La classe de caractères s'arrête donc
  --    avant le `?`, le `"`, l'apostrophe, l'antislash et les blancs : la
  --    query est coupée par construction.
  refs AS (
    SELECT DISTINCT (regexp_matches(
             s.t, '/storage/v1/object/public/listing-photos/([^"?''[:space:]\\]+)', 'g'))[1] AS nom
    FROM sources s
  ),
  lots AS (
    SELECT fr.lot, bool_or(EXISTS (SELECT 1 FROM refs r WHERE r.nom = fr.name)) AS lot_ref
    FROM fratrie fr GROUP BY fr.lot
  )
  SELECT c.name
  FROM cand c
  JOIN lots l ON l.lot = c.lot
  WHERE NOT EXISTS (SELECT 1 FROM refs r WHERE r.nom = c.name)   -- verrou 1
    AND NOT l.lot_ref                                            -- verrou 2
    AND c.created_at < now() - interval '7 days'                 -- verrou 5
    AND NOT EXISTS (                                             -- verrou 3
      SELECT 1 FROM public.usage_logs ul
      WHERE ul.user_id = v_uid
        AND ul.feature = 'generate_listing'
        AND ul.created_at BETWEEN c.created_at - interval '24 hours'
                              AND c.created_at + interval '24 hours')
    AND NOT EXISTS (                                             -- verrou 4
      SELECT 1 FROM public.inventaire i
      WHERE i.user_id = v_uid
        AND i.created_at BETWEEN c.created_at - interval '24 hours'
                             AND c.created_at + interval '24 hours');
END $$;

COMMENT ON FUNCTION public.photos_article_supprimables(text[]) IS
  'Rend, parmi les noms fournis, ceux du dossier <uid>/raw/ de l''appelant qui '
  'passent les 5 verrous du 16/09 (non référencés, fournée entière libre, pas '
  'de génération facturée ni d''article créé à ±24 h, plus de 7 jours). '
  'LECTURE SEULE : ne supprime jamais rien.';

REVOKE ALL ON FUNCTION public.photos_article_supprimables(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.photos_article_supprimables(text[]) TO authenticated;
