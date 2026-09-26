-- APPLIQUÉE le 26/09 (GO Nico, point 4) — version enregistrée 20260926092254. Essai à blanc avant : seules les instructions du compte de Nico sont notées, celles d un autre compte ignorées.
-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC TEMPORAIRE — CE QUE LA BASE VOIT D'UNE REQUÊTE DE L'EXTENSION
-- (2026-09-26, point 4 du GO de Nico : « avant d'écrire le trigger, vérifie
-- sur une vraie requête que l'origine chrome-extension:// arrive bien jusqu'à
-- la base »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Les journaux de la passerelle ne gardent PAS l'en-tête Origin (vérifié le
-- 26/09 : clé absente de edge_logs). La seule preuve possible est donc côté
-- base, là où le futur trigger lira : current_setting('request.headers').
--
-- ⛔ PÉRIMÈTRE : UNIQUEMENT les requêtes du compte de Nico
--    (f44b5917-bccc-4431-ba41-f40571a2ed18) — aucune donnée d'aucun autre
--    utilisateur n'est lue ni gardée. Plafond 200 lignes.
-- ⛔ Ne modifie RIEN : trigger AFTER, par instruction, qui n'écrit que dans sa
--    propre table. Une erreur est avalée (jamais un point de panne).
-- ⛔ Retiré dès la mesure faite (migration de retrait qui suit).

create table if not exists public._diag_entetes_inventaire (
  id           bigserial primary key,
  le           timestamptz not null default now(),
  methode      text,
  chemin       text,
  role         text,
  origin       text,
  referer      text,
  user_agent   text,
  x_client_info text
);
alter table public._diag_entetes_inventaire enable row level security;
grant select, insert, update, delete on public._diag_entetes_inventaire to authenticated;

create or replace function public._diag_entetes_inventaire_noter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_h jsonb;
  v_c jsonb;
begin
  begin
    v_c := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if coalesce(v_c ->> 'sub', '') <> 'f44b5917-bccc-4431-ba41-f40571a2ed18' then return null; end if;
    if (select count(*) from public._diag_entetes_inventaire) >= 200 then return null; end if;
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    insert into public._diag_entetes_inventaire (methode, chemin, role, origin, referer, user_agent, x_client_info)
    values (current_setting('request.method', true), current_setting('request.path', true), v_c ->> 'role',
            v_h ->> 'origin', v_h ->> 'referer', left(v_h ->> 'user-agent', 160), left(v_h ->> 'x-client-info', 120));
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public._diag_entetes_inventaire_noter() from public, anon, authenticated;

drop trigger if exists _diag_entetes_inventaire on public.inventaire;
create trigger _diag_entetes_inventaire
  after update on public.inventaire
  for each statement
  execute function public._diag_entetes_inventaire_noter();
