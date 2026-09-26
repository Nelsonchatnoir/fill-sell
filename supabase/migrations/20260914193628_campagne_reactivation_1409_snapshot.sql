-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260914193628 « campagne_reactivation_1409_snapshot » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- ============================================================================
-- Campagne de réactivation du 14/09/2026 — SNAPSHOT GELÉ de la segmentation.
--
-- Table d'OPS, jamais lue par l'app : RLS activée et REVOKE anon/authenticated
-- dans le même geste (règle du 14/09). Seul le service_role y accède.
--
-- Elle ne contient AUCUN envoi : c'est une photographie du parc au moment de
-- la mesure, pour que les listes ne dérivent pas entre la préparation et le
-- feu vert. Aucune ligne d'email_destinataires n'est touchée ici.
-- ============================================================================
create table if not exists public.campagne_reactivation_1409 (
  user_id            uuid primary key,
  email              text not null,
  inscrit_le         timestamptz not null,
  derniere_activite  timestamptz not null,
  jours_inactif      integer not null,
  ext_installee      boolean not null,
  nb_jobs            integer not null,
  nb_publications    integer not null,   -- jobs avec published_at non nul
  nb_gestes_publi    integer not null,   -- usage_logs publish/republish
  nb_articles        integer not null,
  sync_faite         boolean not null,
  payant             boolean not null,
  statut_payant      text,
  segment            text not null,      -- 'A' | 'B' | 'C' | 'D' | 'PAYANT'
  motif_exclusion    text,               -- non nul = hors campagne
  mesure_le          timestamptz not null default now()
);

alter table public.campagne_reactivation_1409 enable row level security;
revoke all on public.campagne_reactivation_1409 from anon, authenticated;

comment on table public.campagne_reactivation_1409 is
  'Snapshot gelé de la segmentation de la campagne de réactivation du 14/09/2026. Ops seulement, aucun accès anon/authenticated.';
