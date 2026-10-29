-- 20261030090000 — (30/10, lot C partie 1) LA LECTURE DE LA DESCRIPTION D'ORIGINE, SUIVIE JUSQU'À L'ÉCRAN.
-- Appliquée sur l'autorisation de Nico (lot C : « Tu as toutes les autorisations (fonctions, migrations…) ») :
--   npx supabase db query --linked -f supabase/migrations/20261030090000_lecture_origine_suivie.sql
--   npx supabase migration repair --linked --status applied 20261030090000
-- Inverse : supabase/rollbacks/20261030090000_lecture_origine_suivie_INVERSE.sql (corps lus en prod le 30/10, md5 :
--   demander_lecture_origine 91012090…, lecture_origine_faite 82eb2833…). Essai : scripts/essais/20261030090000_essai.sql.
--
-- CONSTAT (usage_logs, 23/10 → 29/10) : l'écran d'attente ne savait QUE « la description est-elle là ? ». Quand
-- l'ordinateur échouait (onglet indisponible 1 133 fois, annonce introuvable 430, page sans annonce 202, anti-robot 12),
-- l'échec n'allait qu'au journal : l'écran attendait 3 min avant de proposer quoi que ce soit, et une annonce supprimée
-- ouvrait le stepper comme si de rien n'était. Cas exemplaire : maelyne.lac, 29/10 16:46, téléphone Android, PC en
-- ligne — la lecture n'est jamais revenue, rien ne le lui a dit, elle a quitté.
-- RÈGLE : la demande porte son état, écrit par l'extension (≥ 0.6.159) — prise (l'ordinateur a commencé), échec et son
-- motif, conclusion (lue / sans texte / introuvable) — et l'app le relit à chaque tour d'attente : une étape vraie à
-- l'écran, un échec dit tout de suite avec ses issues (réessayer, écrire, faire rédiger). « Réessayer » relance la
-- demande (p_relancer) même dans les 15 min. Un signal léger (lecture_origine_signal) dit à l'extension, entre deux
-- polls, qu'une personne attend.
-- Inchangé : qui peut demander, le relevé des autres plateformes, ce que get-pending-jobs retient, les anciennes
-- extensions (elles appellent toujours lecture_origine_faite, qui efface seulement un motif périmé en plus).

alter table public.lectures_origine_demandees
  add column if not exists prise_le timestamptz,
  add column if not exists essai_le timestamptz,
  add column if not exists motif text;

comment on column public.lectures_origine_demandees.prise_le is
  '(30/10) L''extension a commencé cette lecture (lecture_origine_essai ''prise'').';
comment on column public.lectures_origine_demandees.essai_le is
  '(30/10) Dernier essai raté (lecture_origine_essai ''echec'').';
comment on column public.lectures_origine_demandees.motif is
  '(30/10) Motif du dernier échec, ou de la conclusion (sans_texte, introuvable) ; null = lue ou pas encore tentée.';

-- La demande (le clic « Publier »), et « Réessayer » (p_relancer) : la seule différence est la fenêtre de 15 min.
drop function if exists public.demander_lecture_origine(bigint);
create or replace function public.demander_lecture_origine(p_fiche bigint, p_relancer boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;
revoke all on function public.demander_lecture_origine(bigint, boolean) from public, anon;
grant execute on function public.demander_lecture_origine(bigint, boolean) to authenticated, service_role;

-- Une lecture faite ICI (l'app) : la demande se ferme, un motif d'échec périmé s'efface.
create or replace function public.lecture_origine_faite(p_fiche bigint)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update public.lectures_origine_demandees set faite_le = now(), essais = essais + 1, motif = null
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$function$;

-- L'extension (≥ 0.6.159) dit où en est la lecture : 'prise' (commencée) ou 'echec' (avec son motif).
create or replace function public.lecture_origine_essai(p_fiche bigint, p_etat text, p_motif text default null)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update public.lectures_origine_demandees
     set prise_le = case when p_etat = 'prise' then now() else prise_le end,
         essai_le = case when p_etat = 'echec' then now() else essai_le end,
         essais = essais + case when p_etat = 'echec' then 1 else 0 end,
         motif = case when p_etat = 'echec' then left(coalesce(nullif(p_motif, ''), 'inconnu'), 60)
                      when p_etat = 'prise' then null else motif end
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null and p_etat in ('prise', 'echec')
$function$;

-- La conclusion : 'ok' (lue, texte posé), 'sans_texte' (lue, l'annonce n'a pas de description), 'introuvable'
-- (l'annonce n'existe plus chez la plateforme). La demande se ferme, le motif dit laquelle.
create or replace function public.lecture_origine_conclure(p_fiche bigint, p_resultat text)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update public.lectures_origine_demandees
     set faite_le = now(), essais = essais + 1,
         motif = case when p_resultat in ('sans_texte', 'introuvable') then p_resultat else null end
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$function$;

-- Le signal léger : une personne attend-elle une lecture (demandée il y a moins de 15 min, pas faite) ? Une ligne,
-- par la clé primaire (user_id en tête) : rien d'autre n'est lu.
create or replace function public.lecture_origine_signal()
 returns table(n integer, plus_recente timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::integer, max(d.demandee_le)
    from public.lectures_origine_demandees d
   where d.user_id = auth.uid() and d.faite_le is null and d.demandee_le > now() - interval '15 minutes'
$function$;

revoke all on function public.lecture_origine_essai(bigint, text, text) from public, anon;
revoke all on function public.lecture_origine_conclure(bigint, text) from public, anon;
revoke all on function public.lecture_origine_signal() from public, anon;
revoke all on function public.lecture_origine_faite(bigint) from public, anon;
grant execute on function public.lecture_origine_essai(bigint, text, text) to authenticated, service_role;
grant execute on function public.lecture_origine_conclure(bigint, text) to authenticated, service_role;
grant execute on function public.lecture_origine_signal() to authenticated, service_role;
grant execute on function public.lecture_origine_faite(bigint) to authenticated, service_role;

-- La liste des lectures à faire : la plus RÉCENTE d'abord (le dernier clic n'est jamais coupé par la limite de 50 —
-- 81 demandes ouvertes en une heure chez un compte le 27/10). Le reste du corps est celui lu en prod (md5 a8b2a9a3…).
create or replace function public.lectures_origine_en_attente()
 returns table(inventaire_id bigint, plateforme text, vinted_item_id text, depuis timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;
