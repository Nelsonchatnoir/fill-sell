-- ═══════════════════════════════════════════════════════════════════════════
-- LE CONTENU DU VENDEUR PART TEL QUEL (22/10 soir, point 8 — Louis, rapport docs/enquetes/lot-2210-soir/RAPPORT.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- Une fiche importée ne part plus AVANT que son annonce d'origine soit lue (texte, état, photos du vendeur) : la
-- publication attend « en cours de lecture de ton annonce d'origine » — jamais une erreur — et la lecture est
-- demandée. Une copie produite AVANT cette lecture (publication trop tôt, republication qui recopie ce dépôt) part
-- avec le contenu du vendeur (get-pending-jobs, _shared/contenu-fiche.js).
-- Fonction RÉÉCRITE depuis pg_get_functiondef relu en prod le 22/10 au soir : releve_est_veille (une valeur de plus).
-- Inverse : supabase/rollbacks/20261022210000_contenu_du_vendeur_INVERSE.sql

BEGIN;

-- 0. Les lectures d'origine demandées (stepper ou lot ouverts sans le contenu du vendeur, sur un appareil qui ne
--    peut pas le lire : un téléphone). L'extension ≥ 0.6.130 et l'app ouverte sur l'ordinateur les font.
create table if not exists public.lectures_origine_demandees (
  user_id uuid not null references auth.users(id) on delete cascade,
  inventaire_id bigint not null,
  plateforme text not null,
  demandee_le timestamptz not null default now(),
  faite_le timestamptz,
  essais integer not null default 0,
  primary key (user_id, inventaire_id)
);
alter table public.lectures_origine_demandees enable row level security;
drop policy if exists lectures_origine_demandees_proprio on public.lectures_origine_demandees;
create policy lectures_origine_demandees_proprio on public.lectures_origine_demandees
  for select using (auth.uid() = user_id);
revoke all on public.lectures_origine_demandees from anon;

-- 1. Les fiches d'un compte, avec les dates auxquelles leur texte, leur état et leurs photos ont été LUS chez le vendeur,
--    et leurs annonces (lecture de l'origine). Bornée aux identifiants demandés (un poll : quelques fiches).
create or replace function public.fiches_contenu_vendeur(p_user uuid, p_ids bigint[])
returns table(id bigint, origine text, titre text, description text, photos jsonb, attributs jsonb,
              vinted_item_id text, description_lue_le timestamptz, etat_lu_le timestamptz, photos_lues_le timestamptz,
              annonces jsonb, origine_lue_le timestamptz, disparu_le timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select i.id, i.origine, i.titre, i.description, i.photos, i.attributs, i.vinted_item_id,
         greatest(public._ts_ou_null(i.attributs #>> '{description_source,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'description')),
         greatest(public._ts_ou_null(i.attributs #>> '{etat,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'attributs.etat')),
         (select max(a.capture_le) from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
         (select coalesce(jsonb_agg(jsonb_build_object('platform', a.platform, 'capture_le', a.capture_le,
                                                       'disparu_le', a.disparu_le, 'listing_id', a.listing_id)), '[]'::jsonb)
            from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
         -- La lecture de l'origine déjà FAITE (détail Vinted lu par l'extension ou l'app) : ce qui manque encore
         -- n'existe pas chez le vendeur — on n'attend plus (jamais une attente sans fin).
         (select max(d.faite_le) from public.lectures_origine_demandees d
           where d.user_id = i.user_id and d.inventaire_id = i.id),
         i.disparu_le
    from public.inventaire i
   where i.user_id = p_user and i.id = any (coalesce(p_ids, array[]::bigint[]))
$$;

-- 2. Quand le contenu d'une copie a-t-il été produit ? Une republication Leboncoin / Beebs / Depop recopie son job
--    source, qui recopie le sien… : on remonte la chaîne jusqu'au dépôt (40 maillons au plus).
create or replace function public.jobs_contenu_origine(p_user uuid, p_jobs uuid[])
returns table(job_id uuid, contenu_le timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with recursive ch as (
    select j.id as job_id, j.action, j.created_at, j.platform_fields ->> 'republish_source_job_id' as src, 0 as n
      from public.cross_post_jobs j
     where j.user_id = p_user and j.id = any (coalesce(p_jobs, array[]::uuid[]))
    union all
    select ch.job_id, s.action, s.created_at, s.platform_fields ->> 'republish_source_job_id', ch.n + 1
      from ch
      join public.cross_post_jobs s on s.user_id = p_user
       and s.id = case when ch.src ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ch.src::uuid end
     where ch.action = 'republish' and ch.n < 40
  )
  select distinct on (job_id) job_id, created_at from ch order by job_id, n desc
$$;

-- 4. La lecture de l'origine est demandée. Relevé (Leboncoin, Beebs, Depop) : un relevé de VEILLE de la plateforme
--    (il n'importe rien ; il lit d'abord les annonces rattachées jamais lues), au plus un par quart d'heure.
--    Vinted : la description se lit au détail, par l'extension — la demande est notée pour elle.
create or replace function public.demander_lecture_origine(p_fiche bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_user uuid := auth.uid();
  v_origine text; v_pf text; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select origine into v_origine from public.inventaire where id = p_fiche and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  v_pf := case when v_origine = 'vinted_sync' then 'vinted'
               when v_origine ~ '^releve_(leboncoin|beebs|depop)$' then substring(v_origine from 8) end;
  if v_pf is null then return jsonb_build_object('ok', true, 'reason', 'sans_origine_a_lire'); end if;
  insert into public.lectures_origine_demandees (user_id, inventaire_id, plateforme)
  values (v_user, p_fiche, v_pf)
  on conflict (user_id, inventaire_id) do update
    set demandee_le = now(), faite_le = null, plateforme = excluded.plateforme
    where public.lectures_origine_demandees.faite_le is not null
       or public.lectures_origine_demandees.demandee_le < now() - interval '15 minutes';
  if v_pf = 'vinted' then
    return jsonb_build_object('ok', true, 'reason', 'lecture_par_l_extension', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.status in ('queued', 'running')) then
    return jsonb_build_object('ok', true, 'reason', 'releve_deja_en_file', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.declencheur = 'serveur:lecture_origine'
               and coalesce(s.queued_at, s.started_at) > now() - interval '15 minutes') then
    return jsonb_build_object('ok', true, 'reason', 'releve_recent', 'plateforme', v_pf);
  end if;
  begin
    insert into public.vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
    values (v_user, 'annonces', v_pf, 'queued', 'serveur:lecture_origine', now())
    returning id into v_id;
  exception when others then
    return jsonb_build_object('ok', true, 'reason', 'releve_non_pose', 'detail', left(sqlerrm, 200), 'plateforme', v_pf);
  end;
  return jsonb_build_object('ok', true, 'reason', case when v_id is null then 'releve_non_pose' else 'releve_demande' end,
                            'plateforme', v_pf, 'run_id', v_id);
end $$;

-- 5. Ce qui attend une lecture d'origine (pour l'extension ≥ 0.6.130 et l'app ouverte sur l'ordinateur) : les demandes
--    ouvertes, et les fiches dont une publication est retenue par get-pending-jobs (attente_lecture_origine).
create or replace function public.lectures_origine_en_attente()
returns table(inventaire_id bigint, plateforme text, vinted_item_id text, depuis timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select x.inventaire_id, x.plateforme, i.vinted_item_id, min(x.depuis)
    from (
      select d.inventaire_id, d.plateforme, d.demandee_le as depuis
        from public.lectures_origine_demandees d
       where d.user_id = auth.uid() and d.faite_le is null and d.demandee_le > now() - interval '7 days'
      union all
      select j.inventaire_id, j.platform_fields #>> '{attente_lecture_origine,plateforme}',
             public._ts_ou_null(j.platform_fields #>> '{attente_lecture_origine,depuis}')
        from public.cross_post_jobs j
       where j.user_id = auth.uid() and j.status = 'pending' and j.platform_fields ? 'attente_lecture_origine'
    ) x
    join public.inventaire i on i.id = x.inventaire_id and i.user_id = auth.uid()
   where auth.uid() is not null and x.inventaire_id is not null
     -- une annonce Vinted disparue du dressing ne se lit plus (et ne se demande plus)
     and not (x.plateforme = 'vinted' and i.disparu_le is not null)
   group by x.inventaire_id, x.plateforme, i.vinted_item_id
   order by min(x.depuis)
   limit 50
$$;

-- 6. Une lecture d'origine faite (la fiche a reçu son texte) : la demande est close. Appelée par l'app et l'extension.
create or replace function public.lecture_origine_faite(p_fiche bigint)
returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  update public.lectures_origine_demandees set faite_le = now(), essais = essais + 1
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$$;

-- 7. Le relevé de lecture d'origine est un relevé de VEILLE (il n'importe rien) : garde_releve_sans_geste le laisse
--    partir. Corps de prod du 22/10, une valeur de plus.
CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine')
$function$;

revoke all on function public.fiches_contenu_vendeur(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.fiches_contenu_vendeur(uuid, bigint[]) to service_role;
revoke all on function public.jobs_contenu_origine(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.jobs_contenu_origine(uuid, uuid[]) to service_role;
revoke all on function public.demander_lecture_origine(bigint) from public, anon;
grant execute on function public.demander_lecture_origine(bigint) to authenticated;
revoke all on function public.lectures_origine_en_attente() from public, anon;
grant execute on function public.lectures_origine_en_attente() to authenticated;
revoke all on function public.lecture_origine_faite(bigint) from public, anon;
grant execute on function public.lecture_origine_faite(bigint) to authenticated;

COMMIT;
