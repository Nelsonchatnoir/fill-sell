-- ═══════════════════════════════════════════════════════════════════════════
-- P1 (11/11/2026) — les champs exigés par rayon ne balaient plus cross_post_jobs (3/3)
-- ═══════════════════════════════════════════════════════════════════════════
-- NON APPLIQUÉE — feu vert de Nico, nommé, pour CETTE migration. À appliquer APRÈS 20261111170100.
-- BUT : get-pending-jobs (« PAS DE RETRAIT SANS RECRÉATION GARANTIE ») apprend, sur les refus 400
--   de tous les comptes et de tout l'historique, les champs que Vinted exige dans un rayon :
--   `platform_fields -> 'republish_snapshot' ->> 'catalog_id' = <rayon>` et
--   `platform_fields -> 'server_required_fields'` non nul. Aucune condition indexable : un Seq Scan
--   de toute la table à chaque rayon (≈ 194 000 pages, ≈ 800 ms ; ≈ 3 par minute le 11/11). L'index
--   partiel ne contient que les refus (≈ 200 lignes estimées), clé = le rayon : la lecture devient
--   proportionnelle aux refus du rayon (40 au plus). Aucune ligne de code changée : expression et
--   prédicat = le texte envoyé par PostgREST ; à rayon égal, le btree rend les lignes dans l'ordre
--   physique, comme le Seq Scan, donc les mêmes 40 premières (selftest:taches-sans-balayage).
-- COÛT ESTIMÉ : construction = deux passes sur la table (≈ 1 s, ≈ 195 000 pages chacune) ;
--   taille ≈ 16 kB aujourd'hui (≈ 20 octets par refus) ; écriture : un prédicat jsonb de plus par
--   insertion ou mise à jour non-HOT, aucune mise à jour HOT perdue, une entrée seulement par refus.
-- CONCURRENTLY, UNE instruction, sans transaction (voir 20261111170000). À lancer SEUL :
--   `db query --linked --yes -f`, relire `pg_index.indisvalid` (INVALID : DROP INDEX
--   CONCURRENTLY puis recommencer), puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_refus_par_rayon_idx;
--   (supabase/rollbacks/20261111170200_index_refus_par_rayon_vinted_INVERSE.sql)
CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_refus_par_rayon_idx
  ON public.cross_post_jobs (((platform_fields -> 'republish_snapshot') ->> 'catalog_id'))
  WHERE (platform_fields -> 'server_required_fields') IS NOT NULL;
