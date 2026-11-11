-- P1 (11/11/2026) — CONTRÔLE des trois index partiels, LECTURE SEULE : existence, validité (indisvalid / indisready),
-- définition exacte (celle qu'épingle selftest:taches-sans-balayage), taille, usage. Après CHAQUE migration de P1 :
--   npx supabase db query --linked --read-only -f scripts/preuves/20261111_p1_index.sql
-- existe = true et valide = false : la construction a échoué (ou a été coupée) et l'index INVALID reste en place ;
-- IF NOT EXISTS le sauterait sans rien dire → l'INVERSE de supabase/rollbacks/ (DROP INDEX CONCURRENTLY), puis Nico.
SELECT a.nom,
       c.oid IS NOT NULL AS existe,
       coalesce(x.indisvalid, false) AS valide,
       coalesce(x.indisready, false) AS pret,
       coalesce(pg_get_indexdef(c.oid) = a.definition, false) AS definition_attendue,
       pg_size_pretty(coalesce(pg_relation_size(c.oid), 0)) AS taille,
       s.idx_scan, s.idx_tup_read, s.idx_tup_fetch
FROM (VALUES
  ('cross_post_jobs_preuve_colis_idx',
   'CREATE INDEX cross_post_jobs_preuve_colis_idx ON public.cross_post_jobs USING btree (created_at DESC) WHERE ((platform_fields -> ''colis_pose_envoi''::text) IS NOT NULL)'),
  ('cross_post_jobs_preuve_marque_idx',
   'CREATE INDEX cross_post_jobs_preuve_marque_idx ON public.cross_post_jobs USING btree (created_at DESC) WHERE ((platform_fields -> ''marque_pose_envoi''::text) IS NOT NULL)'),
  ('cross_post_jobs_refus_par_rayon_idx',
   'CREATE INDEX cross_post_jobs_refus_par_rayon_idx ON public.cross_post_jobs USING btree ((((platform_fields -> ''republish_snapshot''::text) ->> ''catalog_id''::text))) WHERE ((platform_fields -> ''server_required_fields''::text) IS NOT NULL)')
) AS a(nom, definition)
LEFT JOIN pg_class c ON c.relname = a.nom AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_index x ON x.indexrelid = c.oid
LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = c.oid
ORDER BY a.nom;
