-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260828063754 « sauvegarde_avant_purge_brouillons_20260828 » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists inventaire_purge_20260828 as
select i.*, now() as sauvegarde_le
from inventaire i
where i.statut = 'stock'
  and coalesce(i.origine,'') = 'vinted_sync'
  and (
        i.vinted_status = 'draft'
     or (i.photos is null or jsonb_typeof(i.photos) <> 'array' or jsonb_array_length(i.photos) = 0)
      )
  and not exists (select 1 from cross_post_jobs j where j.inventaire_id = i.id);
