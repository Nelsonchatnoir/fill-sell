-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260922183713 « rls_tables_sauvegarde_2209 » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.platform_category_aspects_sauvegarde_20260916 enable row level security;
alter table public.platform_category_aspects_sauvegarde_20260916b enable row level security;
alter table public.sauvegarde_ebay_jocabroc8_rayon_2109 enable row level security;
alter table public.sauvegarde_fn_spend_republish_1709 enable row level security;
alter table public.sauvegarde_jocabroc8_89508_2109 enable row level security;
alter table public.sauvegarde_memini_lbc_1709 enable row level security;
alter table public.sauvegarde_sandro_annonce_2109 enable row level security;
alter table public.sauvegarde_sandro_lien_2109 enable row level security;
