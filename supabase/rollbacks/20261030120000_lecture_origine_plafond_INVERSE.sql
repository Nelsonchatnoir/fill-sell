-- INVERSE de 20261030120000_lecture_origine_plafond (30/10, lot D point 1).
-- Remet les 4 fonctions telles que lues en prod le 30/10 vers 10:20 (pg_get_functiondef, md5 :
-- lectures_origine_en_attente 6a746ca5b260bcfe907f51ada61b4379, lecture_origine_signal 478dd949d2128ec267220a2e9bbc0eec,
-- demander_lecture_origine 2cd0360d86802b48d826396159025470, lecture_origine_conclure f06c2935891c84d71240406f0cddd590),
-- retire le déclencheur et sa fonction, puis les deux colonnes.
drop trigger if exists usage_logs_lecture_origine_echec on public.usage_logs;
drop function if exists public._lecture_origine_echec_note();

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
   order by min(x.depuis) desc nulls last
   limit 50
$function$
;

CREATE OR REPLACE FUNCTION public.lecture_origine_signal()
 RETURNS TABLE(n integer, plus_recente timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer, max(d.demandee_le)
    from public.lectures_origine_demandees d
   where d.user_id = auth.uid() and d.faite_le is null and d.demandee_le > now() - interval '15 minutes'
$function$
;

CREATE OR REPLACE FUNCTION public.demander_lecture_origine(p_fiche bigint, p_relancer boolean DEFAULT false)
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
    set demandee_le = now(), faite_le = null, plateforme = excluded.plateforme,
        prise_le = null, essai_le = null, motif = null
    where coalesce(p_relancer, false)
       or public.lectures_origine_demandees.faite_le is not null
       or public.lectures_origine_demandees.demandee_le < now() - interval '15 minutes';
  if v_pf = 'vinted' then
    return jsonb_build_object('ok', true, 'reason', 'lecture_par_l_extension', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.status in ('queued', 'running')) then
    return jsonb_build_object('ok', true, 'reason', 'releve_deja_en_file', 'plateforme', v_pf);
  end if;
  if not coalesce(p_relancer, false) and exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
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
end $function$
;

CREATE OR REPLACE FUNCTION public.lecture_origine_conclure(p_fiche bigint, p_resultat text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.lectures_origine_demandees
     set faite_le = now(), essais = essais + 1,
         motif = case when p_resultat in ('sans_texte', 'introuvable') then p_resultat else null end
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$function$
;

alter table public.lectures_origine_demandees drop column if exists echecs, drop column if exists dernier_echec;
