-- ═══════════════════════════════════════════════════════════════════════════
-- P1 (11/11/2026) — la preuve « format de colis » du parc ne balaie plus cross_post_jobs (1/3)
-- ═══════════════════════════════════════════════════════════════════════════
-- NON APPLIQUÉE — feu vert de Nico, nommé, pour CETTE migration.
-- BUT : get-pending-jobs (`envoiColisProuveParc`) lit, pour tout le parc et sur 30 jours, les
--   tâches Vinted qui portent `platform_fields -> 'colis_pose_envoi'`. Le seul index
--   utilisable était `cross_post_jobs_created` : ~95 000 lignes lues et détoastées par appel
--   pour presque aucune trouvée (≈ 197 600 pages, 600 à 1 100 ms, 7,8 s au pire ; mesuré le
--   11/11 entre 13:29 et 14:03). L'index partiel ne contient QUE les lignes qui portent la clé :
--   la lecture devient proportionnelle au nombre de preuves (≈ 0 à 300), pas à la table.
--   Aucune ligne de code changée : le prédicat est exactement le filtre envoyé par PostgREST
--   (`NOT platform_fields->'colis_pose_envoi' IS NULL`), l'ordre (created_at DESC) celui
--   d'aujourd'hui, donc les mêmes lignes rendues (prouvé : selftest:taches-sans-balayage).
-- COÛT ESTIMÉ : construction = deux passes sur la table (≈ 1 s et ≈ 195 000 pages chacune,
--   comme un appel d'aujourd'hui) ; taille ≈ 16 kB (0 à 300 entrées) ; écriture : un prédicat
--   jsonb évalué par insertion ou mise à jour non-HOT (platform_fields est déjà dans le prédicat
--   de cross_post_jobs_signal_vendu_idx : aucune mise à jour HOT perdue), une entrée écrite
--   seulement pour une ligne qui porte la clé.
-- CONCURRENTLY : ni lecture ni écriture bloquée (ShareUpdateExclusiveLock : VACUUM, ANALYZE et
--   changements de structure attendent). UNE instruction par fichier, sans BEGIN/COMMIT : une
--   transaction refuse CONCURRENTLY. À lancer SEUL : `db query --linked --yes -f` ; puis relire
--   `pg_index.indisvalid` (un échec laisse un index INVALID que IF NOT EXISTS sauterait sans
--   rien dire : DROP INDEX CONCURRENTLY puis recommencer) ; puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_preuve_colis_idx;
--   (supabase/rollbacks/20261111170000_index_preuve_colis_vinted_INVERSE.sql)
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_preuve_colis_idx
  ON public.cross_post_jobs (created_at DESC)
  WHERE (platform_fields -> 'colis_pose_envoi') IS NOT NULL;
