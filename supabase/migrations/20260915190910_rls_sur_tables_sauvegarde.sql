-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260915190910 « rls_sur_tables_sauvegarde » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
      and c.relname like 'sauvegarde%'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
