-- ═══════════════════════════════════════════════════════════════════════════
-- VEILLE — LES REFUS LEBONCOIN, RANGÉS PAR FAMILLE ; UNE NOUVELLE FAMILLE SE VOIT (13/11/2026, 3e réponse de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Nico, 13/11 : « Les 2 refus inexpliqués : garde-les à l'œil, tu me dis si une nouvelle famille apparaît. »
-- LECTURE SEULE, bornée (dépôts Leboncoin des N derniers jours, index created_at). À lancer :
--   cd C:\Users\nicol\fill-and-sell
--   npx supabase db query --linked --read-only -f scripts/lbc-refus-familles.prod.sql -o table
-- Un refus = la marque du juge : depot_jamais_en_ligne « refus_moderation_probable » (base, trancher_publications_sans_lien)
-- ou jamais_en_ligne (handler-watch). Familles connues (rapport LBC du 13/11), dans cet ordre :
--   1. mots_cles     : le texte de la tâche porte plus de 5 hashtags ou une liste « Mots-clés : » — servi tel quel AVANT la
--                      règle des cinq mots-clés (get-pending-jobs v372, 13/11 12:39) ; APRÈS, ramené à 5 : un refus ici
--                      s'affiche « mots_cles_apres_regle » = à regarder (la règle ne suffirait pas) ;
--   2. photos        : d'autres fiches du compte avaient au dépôt une annonce en ligne aux MÊMES fichiers photo (nombre dans
--                      `jumelles` ; garde de get-pending-jobs à partir de 2) ou une question « Est-ce le même article ? »
--                      ouverte (photo identique) ;
--   3. relance       : la tâche relance un dépôt refusé (relance_apres_depot_mort, copie d'une tâche refusée) ou une tâche
--                      refusée de la même fiche porte le même titre, le même texte, le même prix et les mêmes photos ;
--   4. inexplique    : aucune des trois. Les deux du 13/11 : d87570eb a19cc894 (K-Way), cfdfda6f 2da8e471 (autoradio).
-- LIRE : `famille`. Une NOUVELLE famille = plusieurs « inexplique » (ou « mots_cles_apres_regle ») qui se ressemblent
-- (même rayon, même exécutant, mêmes indices) — les colonnes d'indices sont là pour ça ; un « photos » ou « relance »
-- déposé après le déploiement des gardes du 13/11 dit qu'une garde a laissé passer (à regarder aussi).
WITH p AS (
  SELECT 14 AS jours,                                         -- fenêtre (jours)
         timestamptz '2026-11-13 11:39:55+00' AS regle_cinq   -- get-pending-jobs v372 (cinq mots-clés servis au plus)
), r AS (
  SELECT j.id, j.user_id, j.inventaire_id, j.title, j.description, j.price, j.photos, j.platform_fields pf, j.handler_build,
         j.published_at, j.created_at, j.status,
         coalesce((j.platform_fields #>> '{depot_jamais_en_ligne,le}')::timestamptz, (j.platform_fields #>> '{jamais_en_ligne,at}')::timestamptz) AS juge_le,
         array(SELECT coalesce(e ->> 'url', e ->> 'original', e #>> '{}')
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.photos) = 'array' THEN j.photos ELSE '[]'::jsonb END) e) AS urls
    FROM cross_post_jobs j, p
   WHERE j.created_at > now() - make_interval(days => p.jours + 30)
     AND j.platform = 'leboncoin' AND j.action IN ('publish', 'republish') AND j.published_at > now() - make_interval(days => p.jours)
     AND ((j.platform_fields #>> '{depot_jamais_en_ligne,issue}') = 'refus_moderation_probable' OR j.platform_fields ? 'jamais_en_ligne')
), f AS (
  SELECT r.*,
    (SELECT count(*) FROM regexp_matches(coalesce(r.description, ''), '#[^\s#&]+', 'g')) AS hashtags,
    coalesce(r.description, '') ~* '(^|\n)\s*(mots?[ -]*cl[ée]s?|keywords?|tags?)\s*:' AS liste_mots_cles,
    -- Jumelles au dépôt : annonces d'AUTRES fiches en ligne au dépôt, première photo de leur fiche dans le dépôt, et toutes
    -- les photos du plus petit des deux ensembles identiques (même règle que _shared/lbc-memes-photos.js).
    (SELECT count(DISTINCT ap.listing_id)
       FROM annonces_plateforme ap
       JOIN inventaire i ON i.id = ap.inventaire_id AND jsonb_typeof(i.photos) = 'array'
      WHERE ap.user_id = r.user_id AND ap.platform = 'leboncoin' AND ap.inventaire_id IS DISTINCT FROM r.inventaire_id
        AND coalesce(ap.publiee_le, ap.created_at) < r.published_at
        AND (ap.disparu_le IS NULL OR ap.disparu_le > r.published_at) AND (ap.retiree_le IS NULL OR ap.retiree_le > r.published_at)
        AND cardinality(r.urls) > 0
        AND coalesce(i.photos -> 0 ->> 'url', i.photos -> 0 ->> 'original', CASE WHEN jsonb_typeof(i.photos -> 0) = 'string' THEN i.photos ->> 0 END) = ANY (r.urls)
        AND (SELECT count(*) FROM jsonb_array_elements(i.photos) e WHERE coalesce(e ->> 'url', e ->> 'original', e #>> '{}') = ANY (r.urls))
            >= least(cardinality(r.urls), jsonb_array_length(i.photos))) AS jumelles,
    EXISTS (SELECT 1 FROM inventaire_doublons d
             WHERE d.user_id = r.user_id AND d.motif = 'photo_identique' AND d.created_at < r.published_at
               AND (d.statut = 'proposee' OR d.decide_le > r.published_at)
               AND (d.garde = r.inventaire_id OR d.absorbe = r.inventaire_id)) AS question_meme_article,
    coalesce((r.pf #>> '{relance_apres_depot_mort,issue}') = 'refus_moderation_probable', false)
      OR EXISTS (SELECT 1 FROM cross_post_jobs s WHERE s.id::text = r.pf ->> 'relance_copie_de'
                   AND ((s.platform_fields #>> '{depot_jamais_en_ligne,issue}') = 'refus_moderation_probable' OR s.platform_fields ? 'jamais_en_ligne'))
      OR EXISTS (SELECT 1 FROM cross_post_jobs s
                  WHERE r.inventaire_id IS NOT NULL AND s.inventaire_id = r.inventaire_id AND s.user_id = r.user_id AND s.id <> r.id
                    AND s.platform = 'leboncoin' AND s.action = 'publish' AND s.published_at < r.published_at
                    AND ((s.platform_fields #>> '{depot_jamais_en_ligne,issue}') = 'refus_moderation_probable' OR s.platform_fields ? 'jamais_en_ligne')
                    AND btrim(regexp_replace(coalesce(s.title, ''), '\s+', ' ', 'g')) = btrim(regexp_replace(coalesce(r.title, ''), '\s+', ' ', 'g'))
                    AND btrim(regexp_replace(coalesce(s.description, ''), '\s+', ' ', 'g')) = btrim(regexp_replace(coalesce(r.description, ''), '\s+', ' ', 'g'))
                    AND s.price IS NOT DISTINCT FROM r.price AND s.photos = r.photos) AS relance_identique
  FROM r
)
SELECT
  CASE WHEN f.hashtags > 5 OR f.liste_mots_cles THEN CASE WHEN f.published_at < (SELECT regle_cinq FROM p) THEN 'mots_cles' ELSE 'mots_cles_apres_regle' END
       WHEN f.jumelles > 0 OR f.question_meme_article THEN 'photos'
       WHEN f.relance_identique THEN 'relance'
       ELSE 'inexplique' END AS famille,
  left(f.user_id::text, 8) AS compte, left(f.id::text, 8) AS job,
  to_char(f.published_at AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS depose, to_char(f.juge_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS juge,
  left(f.title, 40) AS titre, f.pf -> 'lbcCategoryPath' AS rayon, f.price AS prix, cardinality(f.urls) AS photos,
  coalesce(f.pf #>> '{navigateur_poste}', f.handler_build) AS executant,
  f.hashtags, f.jumelles, f.question_meme_article AS question, f.relance_identique AS relance,
  -- Indices (pour voir naître une famille parmi les « inexplique ») :
  length(coalesce(f.description, '')) AS texte_car,
  coalesce(f.description, '') ~ '%' AS pourcent,
  coalesce(f.title, '') || ' ' || coalesce(f.description, '') ~* '(https?://|www\.|\.(fr|com)\M)' AS lien,
  coalesce(f.description, '') ~ '(\+33|\m0[1-9])([ .-]?\d{2}){4}' AS telephone,
  coalesce(f.title, '') ~* '\mpour\M' AS titre_pour,
  coalesce(f.title, '') = coalesce(f.description, '') AS texte_egal_titre
FROM f
ORDER BY CASE WHEN f.hashtags > 5 OR f.liste_mots_cles THEN 1 WHEN f.jumelles > 0 OR f.question_meme_article THEN 2 WHEN f.relance_identique THEN 3 ELSE 0 END,
         f.published_at DESC;
