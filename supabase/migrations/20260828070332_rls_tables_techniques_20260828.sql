-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260828070332 « rls_tables_techniques_20260828 » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Journal technique et sauvegardes de purge : aucun acces client.
-- Le trigger qui ecrit dans sync_import_ecartes n'est pas SECURITY DEFINER
-- mais s'execute dans la transaction de l'INSERT sur inventaire ; RLS activee
-- sans policy bloque anon/authenticated, le service_role passe outre.
alter table sync_import_ecartes enable row level security;
revoke all on sync_import_ecartes from anon, authenticated;

alter table inventaire_purge_20260828 enable row level security;
revoke all on inventaire_purge_20260828 from anon, authenticated;

alter table jobs_purge_20260828 enable row level security;
revoke all on jobs_purge_20260828 from anon, authenticated;

alter table captures_purge_20260828 enable row level security;
revoke all on captures_purge_20260828 from anon, authenticated;
