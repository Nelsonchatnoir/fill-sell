-- platform_health (mode dégradé automatique) — Phase B.
--
-- Une plateforme peut être mise EN PAUSE (paused=true) : get-pending-jobs cesse
-- alors de distribuer ses jobs, qui RESTENT 'pending' (ni 'failed', ni perdus)
-- → 100 % réversible (repasser paused=false suffit). L'app affiche un message
-- de maintenance à l'utilisateur (bandeau StepPublish + badge StockTab).
--
-- Déclenchement : MANUEL (toi) à tout moment, ou AUTOMATIQUE par handler-watch
-- sur S1 (même signature cross-user) / S3 (anti-bot) — l'auto-pause est
-- derrière un flag OFF par défaut (env HANDLER_WATCH_AUTOPAUSE côté fonction).
-- Réactivation : MANUELLE uniquement pour l'instant (pas d'auto-resume).
--
-- `reason`/`severity` sont INTERNES (diagnostic) — jamais montrés à l'user.

create table if not exists public.platform_health (
  platform     text        primary key,          -- 'vinted'|'leboncoin'|'beebs'|'ebay'
  paused       bool        not null default false,
  reason       text,                              -- interne, jamais affiché
  severity     text,                              -- 'S1'|'S3' à l'origine de la pause auto
  paused_since timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.platform_health is
  'Mode dégradé : paused=true fait cesser la distribution des jobs de la plateforme (get-pending-jobs), jobs conservés en pending. Écrit par handler-watch (service role) ou manuellement. reason/severity internes.';

-- Les 4 plateformes, saines par défaut.
insert into public.platform_health (platform, paused)
values ('vinted', false), ('leboncoin', false), ('beebs', false), ('ebay', false)
on conflict (platform) do nothing;

-- RLS : lecture seule pour les clients (l'app lit l'état pour afficher le
-- message de maintenance). Les écritures passent par la service role
-- (handler-watch / SQL manuel), qui bypass la RLS — donc PAS de policy
-- d'écriture pour authenticated, et GRANT limité à SELECT (moins de privilège
-- que le CRUD complet : cette table n'est jamais modifiée par un client).
alter table public.platform_health enable row level security;

drop policy if exists "platform_health readable by authenticated" on public.platform_health;
create policy "platform_health readable by authenticated"
  on public.platform_health for select
  to authenticated
  using (true);

grant select on public.platform_health to authenticated;
