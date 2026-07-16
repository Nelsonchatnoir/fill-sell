-- handler-watch (surveillance temps réel des handlers extension) — Phase A.
--
-- But : détecter en ≤ 3 min qu'un handler casse (sélecteur DOM changé, version
-- du site, anti-bot) au lieu de le découvrir le lendemain via ops-digest.
--
-- Deux objets :
--   1. monitor_state : état d'alerte (anti-spam / cooldown) ET journal
--      d'incidents. La fonction handler-watch (cron 3 min) y écrit une ligne
--      par (plateforme, signature d'erreur normalisée) ; le cooldown empêche
--      de ré-envoyer le même incident toutes les 3 min.
--   2. cross_post_jobs.handler_build : estampille de version de l'extension qui
--      a produit le job, pour enrichir le diagnostic (« quel build a cassé »).
--      Colonne DÉDIÉE — surtout pas dans platform_fields, qu'update-job-status
--      écrase en entier (pas de merge serveur).
--
-- ⚠️ Le cron pg_cron n'est PAS créé ici : il vit dans la migration
--    20260716110000_handler_watch_cron.sql, à n'appliquer QU'APRÈS le déploiement
--    de la fonction handler-watch (--no-verify-jwt), sinon le cron tape dans le
--    vide.

-- 1. Journal d'alertes / état anti-spam ---------------------------------------
create table if not exists public.monitor_state (
  id              bigint generated always as identity primary key,
  platform        text        not null,
  signature       text        not null,          -- signature d'erreur normalisée
  severity        text        not null,          -- 'S1' | 'S2' | 'S3'
  occurrences     integer     not null default 0,
  distinct_users  integer     not null default 0,
  sample_job_ids  jsonb       not null default '[]'::jsonb,
  sample_error    text,
  handler_build   text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_alerted_at timestamptz,                    -- null = jamais alerté encore
  resolved        bool        not null default false,
  unique (platform, signature)
);

create index if not exists monitor_state_last_seen_idx
  on public.monitor_state (last_seen_at desc);

comment on table public.monitor_state is
  'handler-watch : état anti-spam (cooldown des alertes) + journal des incidents handlers. Écrit par la fonction handler-watch (service role). Pas d''accès client.';

-- Écrit UNIQUEMENT par la fonction handler-watch via la service role key.
-- Aucune policy authenticated : ce n'est pas une donnée utilisateur (pas de
-- GRANT TO authenticated volontairement — voir CLAUDE.md, ce GRANT est réservé
-- aux tables réellement manipulées par les clients).

-- 2. Estampille de version du build extension ---------------------------------
alter table public.cross_post_jobs
  add column if not exists handler_build text;

comment on column public.cross_post_jobs.handler_build is
  'Version du build de l''extension Chrome (FILLSELL_BUILD + manifest) ayant traité ce job — diagnostic handler-watch. Renseigné par update-job-status.';
