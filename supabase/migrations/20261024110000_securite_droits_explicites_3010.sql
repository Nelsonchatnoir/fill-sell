-- ═══════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ AVANT LE 30/10 : DROITS EXPLICITES, SAUVEGARDES FERMÉES, FONCTIONS DE LECTURE RESSERRÉES (24/10, point 10)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI CHANGE CHEZ SUPABASE LE 30/10/2026 (changelog 28/04, « Tables not exposed to Data and GraphQL APIs
-- automatically ») : une table créée dans `public` ne reçoit plus AUCUN droit d'office (anon, authenticated, ni
-- service_role). Les tables existantes gardent les leurs. Sans règle, la prochaine table d'une migration serait
-- invisible pour l'app ET pour les fonctions edge (42501), le jour d'une mise en prod.
-- CE QUE LES ADVISORS DISAIENT LE 23/10 À 21:10 (avant) : 4 sauvegardes SANS RLS et lisibles par anon
-- (_backup_2010_sebastien_beebs_jobs, _backup_2010_louis_seller_lbc_echecs, _backup_2110_parc_jamais_vues_jobs,
-- _backup_2110_louis_seller_doublons — n'importe qui avec la clé publique pouvait les lire) ; 18 sauvegardes avec
-- droits anon/authenticated ; 73 fonctions SECURITY DEFINER appelables par anon, dont 19 fonctions de LECTURE (18
-- sans contrôle d'identité) qui répondaient pour n'importe quel compte (annonce_publiee_par_compte, article_vendu,
-- comptes_sont_lies, quota_annonces_consommees…).
-- LA RÈGLE, POUR TOUJOURS :
--   1. Une table de sauvegarde (est_table_de_sauvegarde : « _… », « sauvegarde… », « …backup… », « …_AAAAMMJJ »)
--      a la RLS et AUCUN droit anon ni authenticated — les existantes maintenant, les futures à leur naissance.
--   2. Toute nouvelle table de `public` naît avec la RLS ; si ce n'est pas une sauvegarde, service_role reçoit ses
--      droits (table et séquences : les fonctions edge continuent de marcher après le 30/10) ; anon et authenticated
--      ne reçoivent QUE ce que la migration leur donne, explicitement (selftest tables-droits-explicites).
--   3. Les droits par défaut de `public` passent dès aujourd'hui au régime du 30/10 (rien d'implicite sur les
--      tables et séquences ; aucune nouvelle fonction exécutable par anon) : le comportement ne change pas le 30/10.
--   4. Les 19 fonctions de lecture SECURITY DEFINER : plus jamais anon ; authenticated seulement pour les deux que
--      l'app ou get-pending-jobs appellent sous la session de la personne (quotas_etat, qui contrôle auth.uid() ;
--      boutique_vinted_autre_compte, appelée avec user.id) ; les 17 autres ne sont appelées que par des fonctions
--      SECURITY DEFINER (propriétaire postgres) ou par service_role : authenticated retiré. service_role et postgres
--      gardent tout.
--   5. Les fonctions de déclencheur SECURITY DEFINER (49) ne s'appellent jamais en RPC : EXECUTE retiré à anon et
--      authenticated (un déclencheur se déclenche sans ce droit — prouvé dans l'essai). Les 5 RPC à contrôle
--      d'identité appelées par l'app connectée (reserver_scan_lens, set_app_build, set_profile_currency,
--      set_profile_username, synchro_relancer_rangement) : anon retiré, authenticated gardé.
-- Appelants relus le 23/10 (app src/, extension chrome-extension/, fonctions edge, corps SQL, politiques, vues) :
-- aucun appel anon ; seuls appels authenticated : quotas_etat (app), boutique_vinted_autre_compte (get-pending-jobs,
-- userClient). Aucun corps de fonction n'est réécrit.
-- Inverse : supabase/rollbacks/20261024110000_securite_droits_explicites_3010_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';

-- ── 1. Qu'est-ce qu'une table de sauvegarde ? Une seule définition. ──────────
CREATE OR REPLACE FUNCTION public.est_table_de_sauvegarde(p_nom text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT coalesce(p_nom, '') ~ '^_'
      OR coalesce(p_nom, '') ~ '^(sauvegarde|backup)'
      OR coalesce(p_nom, '') ~ '(backup|_sauvegarde)'
      OR coalesce(p_nom, '') ~ '_20[0-9]{6}(_[0-9]{4})?$'
      OR coalesce(p_nom, '') ~ '^campagne_reactivation_[0-9]{4}$'
$function$;
REVOKE ALL ON FUNCTION public.est_table_de_sauvegarde(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_table_de_sauvegarde(text) TO authenticated, service_role;

-- ── 1 bis. Les droits d'avant, sauvegardés (l'inverse les remet à l'identique). ─
CREATE TABLE IF NOT EXISTS public._backup_2410_securite_droits AS
  SELECT 'fonction'::text AS genre, p.oid::regprocedure::text AS objet, p.proacl::text AS acl, NULL::boolean AS rls, now() AS le
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
  UNION ALL
  SELECT 'table', c.oid::regclass::text, c.relacl::text, c.relrowsecurity, now()
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND public.est_table_de_sauvegarde(c.relname)
  UNION ALL
  SELECT 'defaut', d.defaclobjtype::text, d.defaclacl::text, NULL, now()
    FROM pg_default_acl d
   WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace;
ALTER TABLE public._backup_2410_securite_droits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2410_securite_droits FROM anon, authenticated;

-- ── 2. Les sauvegardes existantes : RLS, aucun droit client. ────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS nom, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND public.est_table_de_sauvegarde(c.relname)
  LOOP
    IF NOT t.rls THEN EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.nom); END IF;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', t.nom);
  END LOOP;
END $$;

-- ── 3. Droits par défaut de public : le régime du 30/10, dès maintenant. ────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ── 4. Toute nouvelle table naît protégée (déclencheur d'événement). ────────
-- Jamais bloquant : une erreur est notée au journal, la création de la table passe toujours.
CREATE OR REPLACE FUNCTION public.fillsell_table_nait_protegee()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record; s record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
     WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       AND object_type IN ('table', 'table partition') AND schema_name = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
      IF public.est_table_de_sauvegarde(split_part(cmd.object_identity, '.', 2)) THEN
        EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', cmd.object_identity);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO service_role', cmd.object_identity);
        FOR s IN
          SELECT d.objid::regclass AS seq
            FROM pg_depend d JOIN pg_class sc ON sc.oid = d.objid AND sc.relkind = 'S'
           WHERE d.refobjid = cmd.objid AND d.deptype IN ('a', 'i')
        LOOP
          EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', s.seq);
        END LOOP;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'fillsell_table_nait_protegee : % non protégée (%)', cmd.object_identity, SQLERRM;
    END;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public.fillsell_table_nait_protegee() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS fillsell_table_nait_protegee;
CREATE EVENT TRIGGER fillsell_table_nait_protegee
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.fillsell_table_nait_protegee();

-- ── 5. Les 19 fonctions de lecture SECURITY DEFINER. ────────────────────────
REVOKE EXECUTE ON FUNCTION public.annonce_publiee_par_compte(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonce_publiee_par_compte_lie(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.article_vendu(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.boutique_proprietaire(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comptes_sont_lies(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debut_cycle_quotas(uuid) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fiche_annonces_vivantes'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.opla_sortie_passee() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plateforme_ecartee_pour(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.quota_annonces_consommees(uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rapprocher_classer_identifiant(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.releve_ebay_par_api(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.republish_planifiee_actives_eligibles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retrait_job_prouve(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_multi_ouverte_pour(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vente_prouvee_fiche_liee(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vinted_boutique_du_poste(uuid) FROM PUBLIC, anon, authenticated;
-- appelées sous la session de la personne : authenticated gardé, anon retiré
REVOKE EXECUTE ON FUNCTION public.quotas_etat() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.boutique_vinted_autre_compte(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quotas_etat() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.boutique_vinted_autre_compte(uuid, text) TO authenticated, service_role;

-- ── 6. Les RPC de l'app connectée (contrôle auth.uid() dedans) : anon retiré. ─
REVOKE EXECUTE ON FUNCTION public.reserver_scan_lens(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_app_build(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_profile_currency(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_profile_username(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.synchro_relancer_rangement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserver_scan_lens(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_app_build(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_profile_currency(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_profile_username(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.synchro_relancer_rangement() TO authenticated, service_role;

-- ── 7. Les fonctions de déclencheur SECURITY DEFINER : jamais en RPC. ───────
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype = 'trigger'::regtype
       AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

COMMIT;
