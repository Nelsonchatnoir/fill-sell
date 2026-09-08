-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES DE SAUVEGARDE DE public : RLS ACTIVÉE, DROITS anon/authenticated
-- RÉVOQUÉS — POSÉ EN PROD À LA MAIN LE 08/09 (19 tables), REFLÉTÉ ICI
-- ═══════════════════════════════════════════════════════════════════════════
-- Les tables jobs_*_backup_*, inventaire_*_backup_*, usage_logs_*_backup_*,
-- backfill_vinted_account_trace (et leurs sœurs jobs_purge_*, jobs_*_backup,
-- captures_*_backup_*, job_*_backup_*) sont des copies de travail créées par
-- CREATE TABLE … AS avant une correction de données. Une table ainsi créée
-- hérite des GRANT par défaut du schéma (anon/authenticated : tout) et n'a
-- PAS de RLS : par PostgREST, n'importe quelle session lisait des lignes
-- d'autres comptes.
--
-- RELEVÉ PROD du 08/09/2026 (pg_class + role_table_grants) : 38 tables
-- correspondent au motif ; RLS = true sur les 38, 0 policy ; 10 gardent
-- encore des GRANT anon/authenticated (captures_anthony_taille_backup_20260830,
-- jobs_anthony_taille_backup_20260830, jobs_beebs_ia_marque_backup_20260908_1800,
-- jobs_beebs_lbc_valeurs_backup_20260908_1815, jobs_failed_grand_menage_20260908,
-- jobs_gravity_maze_backup_20260829, jobs_isbn_backup_20260830,
-- jobs_josephine_failed_backup_20260908, jobs_nadege_drapeau_backup_20260830,
-- jobs_nadege_rearmement_backup_20260830, jobs_recreation_backup_20260908) —
-- RLS sans policy suffit à les fermer côté PostgREST, mais l'intention posée
-- le 08/09 est « RLS + REVOKE » : ce fichier, s'il est rejoué, la complète.
--
-- IDEMPOTENT PAR CONSTRUCTION : boucle sur pg_class (rien en dur), ENABLE ROW
-- LEVEL SECURITY et REVOKE sont sans effet quand déjà faits. Ne touche AUCUNE
-- table hors motif. Aucune donnée modifiée.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (
        c.relname LIKE '%\_backup\_%' ESCAPE '\'
        OR c.relname LIKE 'backfill\_%' ESCAPE '\'
        OR c.relname LIKE 'jobs\_purge\_%' ESCAPE '\'
        OR c.relname LIKE 'jobs\_%\_20260%' ESCAPE '\'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END;
$$;
