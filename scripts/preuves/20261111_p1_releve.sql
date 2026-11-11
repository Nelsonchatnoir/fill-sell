-- P1 (11/11/2026) — RELEVÉ des compteurs, LECTURE SEULE (aucune remise à zéro : on calcule des ÉCARTS entre deux relevés).
-- Les deux lectures du parc de get-pending-jobs (queryid relus dans pg_stat_statements le 11/11 ; le texte SQL ne change
-- pas avec les index, donc le queryid non plus), la table cross_post_jobs et son TOAST. Jouer UN relevé à la fois.
--   npx supabase db query --linked --read-only -f scripts/preuves/20261111_p1_releve.sql > <dossier>/p1_R0.json
-- Écarts et verdict : node scripts/preuves/20261111_p1_ecarts.mjs <Ravant.json> <R0.json> [<R1.json>]
-- `demarrage` et `depuis` disent si la base a redémarré ou si pg_stat_statements a été remis à zéro entre deux relevés :
-- la fenêtre ne vaut alors rien (le script le dit), on en reprend une neuve.
--
-- ══ PROCÉDURE DE PROD (préparée le 11/11/2026, NON exécutée — feu vert de Nico nommé pour CHAQUE migration) ══
-- 0. Juste avant : `git status` ; `npx supabase functions list` (get-pending-jobs v358, verify_jwt true : AUCUN
--    redéploiement, aucune ligne de code changée) ; `npx supabase migration list --linked` (20261111170000/170100/170200
--    absentes) ; `-f scripts/preuves/20261111_p1_index.sql --read-only` (existe = false pour les trois).
-- 1. Ravant puis R0 (15 min au moins entre les deux) : ce relevé, deux fois. `ecarts.mjs Ravant R0` = le taux d'avant.
-- 2. Pour 20261111170000, puis 20261111170100, puis 20261111170200, UNE à la fois :
--    a. npx supabase db query --linked --yes -f supabase/migrations/<version>_<nom>.sql
--    b. npx supabase db query --linked --read-only -f scripts/preuves/20261111_p1_index.sql
--       → pour cet index : existe, valide (indisvalid), pret (indisready) et definition_attendue à true.
--       Si valide = false, ou si (a) a échoué ou expiré après avoir créé l'index : ABANDON PROPRE —
--       npx supabase db query --linked --yes -f supabase/rollbacks/<version>_<nom>_INVERSE.sql, relire (existe = false),
--       ne PAS inscrire la version, s'arrêter et revenir vers Nico (IF NOT EXISTS sauterait un index INVALID sans rien dire).
--    c. npx supabase migration repair --linked --status applied <version>   (CLI 3.1 : `--yes` exigé pour une écriture)
-- 3. Les plans, sans exécution : -f scripts/preuves/20261111_p1_plan_colis.sql, _plan_marque.sql, _plan_refus.sql
--    (--read-only) → « Index Scan using cross_post_jobs_preuve_colis_idx », « …_preuve_marque_idx »,
--    « Index Scan using cross_post_jobs_refus_par_rayon_idx » (ou « Bitmap Index Scan on … »), aucun Seq Scan.
-- 4. R1, 30 min au moins après la dernière migration : `ecarts.mjs Ravant R0 R1` → pages par appel < 200 et
--    moins de 5 ms par appel pour les deux requêtes ; seq_scan de la table ≈ −3 par minute ; puis _index.sql :
--    idx_scan > 0 pour les trois index.
-- 5. Retour arrière (si un plan ou un écart déçoit) : les trois INVERSE de supabase/rollbacks/, dans l'ordre inverse,
--    chacun seul, puis `migration repair --linked --status reverted <version>`.
-- Aucun ANALYZE à lancer : le plan est prouvé sans statistiques neuves (selftest:taches-sans-balayage, C4).
SELECT extract(epoch FROM now())::float8 AS t,
       (now() AT TIME ZONE 'Europe/Paris')::text AS a_paris,
       pg_postmaster_start_time()::text AS demarrage,
       v.nom, v.queryid::text AS queryid,
       min(s.stats_since)::text AS depuis,
       coalesce(sum(s.calls), 0)::bigint AS calls,
       coalesce(sum(s.total_exec_time), 0)::float8 AS total_ms,
       coalesce(max(s.max_exec_time), 0)::float8 AS max_ms,
       coalesce(sum(s.shared_blks_hit + s.shared_blks_read), 0)::bigint AS pages,
       max(t.seq_scan) AS seq_scan, max(t.seq_tup_read) AS seq_tup_read, max(t.idx_tup_fetch) AS idx_tup_fetch,
       max(tt.idx_scan) AS toast_idx_scan
FROM (VALUES (7319884188374725879::bigint, 'Q1 preuve colis+marque'),
             (8453384118533357995::bigint, 'Q2 refus par rayon')) AS v(queryid, nom)
LEFT JOIN extensions.pg_stat_statements s ON s.queryid = v.queryid
CROSS JOIN (SELECT seq_scan, seq_tup_read, idx_tup_fetch FROM pg_stat_user_tables
            WHERE relid = 'public.cross_post_jobs'::regclass) t
CROSS JOIN (SELECT idx_scan FROM pg_stat_all_tables
            WHERE relid = (SELECT reltoastrelid FROM pg_class WHERE oid = 'public.cross_post_jobs'::regclass)) tt
GROUP BY v.queryid, v.nom
ORDER BY v.nom;
