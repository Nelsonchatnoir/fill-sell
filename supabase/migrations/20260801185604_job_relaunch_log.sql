-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — table `job_relaunch_log` (rapatriée le 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliquée en prod le 01/08/2026 à 18h56 sous la version
-- 20260801185604 (`job_relaunch_log`), sans jamais laisser de fichier dans le
-- dépôt. 0 occurrence du nom dans supabase/migrations/ avant celui-ci.
-- CE QUI SUIT EST LE SQL RÉEL, copié depuis
-- supabase_migrations.schema_migrations.statements — non réécrit, non
-- reformaté, non corrigé.
-- ═══════════════════════════════════════════════════════════════════════════

-- Registre de relance des jobs jamais pris en charge par l'extension.
-- email_logs n'a AUCUNE contrainte d'unicite : une dedup lue-puis-ecrite y
-- laisserait passer un doublon des que deux runs du cron se chevauchent.
-- Ici c'est Postgres qui refuse : UNIQUE (job_id, statut), et l'edge function
-- reserve le job par INSERT ... ON CONFLICT DO NOTHING ... RETURNING avant
-- d'envoyer quoi que ce soit.
-- Le statut 'skipped_extension_active' (cas 3 : extension active ET job
-- dormant = bug de notre cote) occupe une ligne DISTINCTE : il journalise sans
-- consommer le droit d'envoi, donc le job repart normalement en cas 2 si
-- l'extension redevient muette.
create table if not exists public.job_relaunch_log (
  id         bigserial primary key,
  job_id     uuid        not null references public.cross_post_jobs(id) on delete cascade,
  user_id    uuid        not null,
  statut     text        not null check (statut in ('sent','skipped_extension_active')),
  cas        smallint,
  created_at timestamptz not null default now(),
  unique (job_id, statut)
);

create index if not exists job_relaunch_log_user_idx
  on public.job_relaunch_log (user_id, created_at desc);

grant select, insert, update, delete on public.job_relaunch_log to authenticated;
grant usage, select on sequence public.job_relaunch_log_id_seq to authenticated;

alter table public.job_relaunch_log enable row level security;

drop policy if exists job_relaunch_log_self on public.job_relaunch_log;
create policy job_relaunch_log_self on public.job_relaunch_log
  for select to authenticated using (auth.uid() = user_id);
-- Ecriture : service_role uniquement (edge function email-tunnel), donc aucune
-- policy d'insert/update/delete cote client.
