-- INVERSE de 20261030090000_lecture_origine_suivie — rend les corps LUS EN PROD le 30/10 avant la migration
-- (pg_get_functiondef : demander_lecture_origine md5 91012090223664f636b3a304cbf7a420, lecture_origine_faite
-- md5 82eb2833c34348f2f09e363691b3c1ef, lectures_origine_en_attente md5 a8b2a9a3f58c3e926ed30811a77d92d0).
--   npx supabase db query --linked -f supabase/rollbacks/20261030090000_lecture_origine_suivie_INVERSE.sql
-- Les extensions ≥ 0.6.159 appellent alors des RPC absentes : l'erreur est avalée, elles lisent comme la 0.6.157.
begin;

drop function if exists public.lecture_origine_essai(bigint, text, text);
drop function if exists public.lecture_origine_conclure(bigint, text);
drop function if exists public.lecture_origine_signal();
drop function if exists public.demander_lecture_origine(bigint, boolean);

CREATE OR REPLACE FUNCTION public.demander_lecture_origine(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_origine text; v_pf text; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select origine into v_origine from public.inventaire where id = p_fiche and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  v_pf := case when v_origine = 'vinted_sync' then 'vinted'
               when v_origine ~ '^releve_(leboncoin|beebs|depop|ebay)$' then substring(v_origine from 8) end;
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
end $function$;
revoke all on function public.demander_lecture_origine(bigint) from public, anon;
grant execute on function public.demander_lecture_origine(bigint) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lecture_origine_faite(p_fiche bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.lectures_origine_demandees set faite_le = now(), essais = essais + 1
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$function$;

CREATE OR REPLACE FUNCTION public.lectures_origine_en_attente()
 RETURNS TABLE(inventaire_id bigint, plateforme text, vinted_item_id text, depuis timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

alter table public.lectures_origine_demandees
  drop column if exists prise_le,
  drop column if exists essai_le,
  drop column if exists motif;

commit;
