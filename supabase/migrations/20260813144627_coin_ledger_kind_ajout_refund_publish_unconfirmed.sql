-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260813144627 « coin_ledger_kind_ajout_refund_publish_unconfirmed » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Ajoute 'refund_publish_unconfirmed' aux motifs autorisés de coin_ledger.
-- Motif : la RPC refund_publish_unconfirmed() insère ce kind, absent de la
-- contrainte → le cron publish-sans-lien-echec-daily (jobid 10) échouait
-- intégralement (run du 13/08 05:30 en ERROR). Aucune ligne existante n'est
-- concernée : on ne fait qu'élargir la liste.
alter table public.coin_ledger
  drop constraint coin_ledger_kind_check,
  add constraint coin_ledger_kind_check check (
    kind = any (array[
      'grant_monthly'::text,
      'grant_upgrade'::text,
      'purchase'::text,
      'spend_publish'::text,
      'spend_lens'::text,
      'refund'::text,
      'admin'::text,
      'release_publish'::text,
      'spend_generate'::text,
      'refund_generate'::text,
      'spend_republish'::text,
      'refund_republish'::text,
      'refund_publish_unconfirmed'::text
    ])
  );
