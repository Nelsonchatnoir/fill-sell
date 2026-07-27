-- Télémétrie de dégradation des sélecteurs de l'extension Chrome
-- (registre déclaratif — docs/SELECTOR_AUDIT.md, chrome-extension/selectors/).
--
-- ANONYME PAR CONSTRUCTION : install_id est un UUID d'installation généré côté
-- extension (chrome.storage.local 'fs_install_id'), sans aucun lien avec le
-- compte. AUCUNE colonne user_id, AUCUNE URL d'annonce, AUCUN contenu d'annonce
-- ne doit jamais être ajouté à cette table.
--
-- resolved_via : index du maillon de la chaîne ayant résolu (0 = sélecteur
-- principal, >0 = fallback utilisé, -1 = échec total de résolution).
--
-- RÉTENTION : purge des lignes de plus de 30 jours (politique à appliquer,
-- ex. pg_cron quotidien :
--   delete from public.selector_health where created_at < now() - interval '30 days');

create table public.selector_health (
  id bigint generated always as identity primary key,
  install_id uuid not null,
  platform text not null,
  selector_key text not null,
  resolved_via int not null,
  assert_passed boolean not null,
  extension_version text,
  created_at timestamptz not null default now()
);

create index selector_health_platform_key_created_idx
  on public.selector_health (platform, selector_key, created_at desc);

alter table public.selector_health enable row level security;

-- INSERT seul : la télémétrie s'écrit depuis l'extension (clé anon), elle ne se
-- lit que côté service_role (analytics internes). Aucune policy SELECT/UPDATE/
-- DELETE volontairement.
create policy selector_health_insert_only
  on public.selector_health
  for insert
  to anon, authenticated
  with check (true);

-- Breaking change Supabase de mai 2026 : les policies seules ne suffisent plus,
-- les GRANT explicites sont requis.
grant usage on schema public to anon, authenticated;
grant insert on public.selector_health to anon, authenticated;
