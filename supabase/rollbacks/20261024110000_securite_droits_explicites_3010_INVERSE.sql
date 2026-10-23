-- Inverse de supabase/migrations/20261024110000_securite_droits_explicites_3010.sql
-- Remet À L'IDENTIQUE les droits sauvegardés dans _backup_2410_securite_droits (fonctions SECURITY DEFINER, tables de
-- sauvegarde et leur RLS, droits par défaut de public), retire le déclencheur d'événement.
-- ⚠️ Rouvre les 4 sauvegardes qui étaient lisibles par anon : à n'utiliser qu'en cas de casse prouvée.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';

DROP EVENT TRIGGER IF EXISTS fillsell_table_nait_protegee;
DROP FUNCTION IF EXISTS public.fillsell_table_nait_protegee();

DO $$
DECLARE r record; a record; v_role text;
BEGIN
  -- fonctions : on retire tout aux rôles client, puis on remet exactement l'ACL d'avant
  FOR r IN SELECT objet, acl FROM public._backup_2410_securite_droits WHERE genre = 'fonction' LOOP
    CONTINUE WHEN to_regprocedure(r.objet) IS NULL;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.objet);
    CONTINUE WHEN r.acl IS NULL;  -- ACL par défaut (PUBLIC) : on la remet
    FOR a IN SELECT (aclexplode(r.acl::aclitem[])).* LOOP
      v_role := CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
      EXECUTE format('GRANT %s ON FUNCTION %s TO %s', a.privilege_type, r.objet, v_role);
    END LOOP;
  END LOOP;
  FOR r IN SELECT objet FROM public._backup_2410_securite_droits WHERE genre = 'fonction' AND acl IS NULL LOOP
    CONTINUE WHEN to_regprocedure(r.objet) IS NULL;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.objet);
  END LOOP;
  -- tables de sauvegarde : ACL et RLS d'avant
  FOR r IN SELECT objet, acl, rls FROM public._backup_2410_securite_droits WHERE genre = 'table' LOOP
    CONTINUE WHEN to_regclass(r.objet) IS NULL;
    IF r.rls IS FALSE THEN EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', r.objet); END IF;
    CONTINUE WHEN r.acl IS NULL;
    FOR a IN SELECT (aclexplode(r.acl::aclitem[])).* LOOP
      CONTINUE WHEN a.grantee = 0;
      v_role := quote_ident(pg_get_userbyid(a.grantee));
      CONTINUE WHEN v_role NOT IN ('anon', 'authenticated');
      EXECUTE format('GRANT %s ON TABLE %s TO %s', a.privilege_type, r.objet, v_role);
    END LOOP;
  END LOOP;
END $$;

-- droits par défaut de public (état relu le 23/10 : tout à anon, authenticated, service_role)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
COMMIT;
