-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260914194001 « email_logs_one_shot_reactivation_1409 » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- ============================================================================
-- Campagne de réactivation 14/09/2026 — les 4 types entrent dans l'index.
--
-- Règle CLAUDE.md : un type ONE-SHOT (un envoi par utilisateur, à vie) qui
-- n'est pas dans le WHERE de email_logs_one_shot_unique repart en doublon
-- sans que rien ne le signale (bug du welcome, 03/08). Les quatre segments
-- sont one-shot par construction : un compte reçoit UN segment, UNE fois.
--
-- Idempotent : on recrée l'index avec la liste complète. Aucune ligne de ces
-- quatre types n'existe encore, la création ne peut pas buter sur un doublon.
-- ============================================================================
drop index if exists public.email_logs_one_shot_unique;

create unique index email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type in (
    'welcome',
    'how_it_works',
    'blast_relaunch_aout',
    'blast_founder',
    'founder_plan',
    'voice_conversion',
    'blast_sync_dressing',
    'reactiv_1409_a',
    'reactiv_1409_b',
    'reactiv_1409_c',
    'reactiv_1409_d'
  );
