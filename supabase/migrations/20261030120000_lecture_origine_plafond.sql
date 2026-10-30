-- ═══════════════════════════════════════════════════════════════════════════
-- (30/10, lot D point 1) LA LECTURE D'ORIGINE NE TOURNE PLUS JAMAIS EN BOUCLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas réel : lauran (2f4383e9), extension 0.6.157, fiche 1793281265192003, annonce
-- Vinted 10581764660 MASQUÉE (vinted_status hidden). Depuis le 30/10 09:06, une
-- lecture « page_sans_annonce » toutes les 2 min (et une trace d'échec chaque fois),
-- alors qu'elle avait choisi « Faire rédiger » à 09:16 et à 09:26.
-- Causes (audit du 30/10) :
--   · la demande est resservie 7 JOURS (lectures_origine_en_attente) sans regarder ni
--     les échecs, ni le choix fait sur la fiche ;
--   · « Faire rédiger » pose le choix sur la fiche sans fermer la demande ;
--   · les freins de l'extension (repos, trace 1/h) vivent en mémoire du service
--     worker, perdue à chaque redémarrage ; la 0.6.157 n'écrit rien sur la demande.
-- La règle, côté serveur (elle vaut pour TOUTES les versions de l'extension, sans
-- attendre le Chrome Web Store) :
--   1. un échec est compté par la base elle-même, à la trace que toute extension
--      écrit déjà (usage_logs « lecture_fond », origine demandée ou page) ;
--   2. « page sans annonce » ou « introuvable » = échec DÉFINITIF dès le premier :
--      la demande est conclue (faite_le + motif « masquee » si l'annonce est masquée
--      chez Vinted, « illisible » sinon, « introuvable » pour une annonce disparue) ;
--   3. tout autre échec : plafond dur de 3 par demande, puis conclue « illisible » ;
--   4. une demande n'est plus servie dès qu'un choix (Écrire / Faire rédiger) est
--      posé sur la fiche APRÈS elle, ou que la fiche a un texte ;
--   5. une demande conclue sans texte n'est plus réarmée par un simple « Publier »
--      pendant 24 h (l'app dit tout de suite pourquoi et propose Écrire / Faire
--      rédiger) ; « Réessayer » (p_relancer) la réarme toujours.
-- GARDE-FOU tenu : aucune lecture en masse, la lecture de fond reste coupée ; on ne
-- touche qu'à la lecture À LA DEMANDE. Fonctions réécrites depuis pg_get_functiondef
-- de la prod (md5 avant : voir l'inverse).
-- Inverse : supabase/rollbacks/20261030120000_lecture_origine_plafond_INVERSE.sql

alter table public.lectures_origine_demandees
  add column if not exists echecs integer not null default 0,
  add column if not exists dernier_echec text;

comment on column public.lectures_origine_demandees.echecs is
  '(30/10, lot D) Échecs de lecture de CETTE demande, comptés par la base à la trace usage_logs « lecture_fond » ; remis à 0 à chaque (re)demande. Plafond : 3.';
comment on column public.lectures_origine_demandees.dernier_echec is
  '(30/10, lot D) Le dernier motif d''échec brut écrit par l''extension (page_sans_annonce, onglet_indisponible, antirobot…).';

-- ── 1-3. L'échec compté par la base, à la trace de l'extension ─────────────
create or replace function public._lecture_origine_echec_note()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fiche bigint;
  v_res text := left(coalesce(new.metadata->>'resultat', ''), 60);
  v_statut text;
begin
  if new.user_id is null or v_res = '' or v_res = 'ok' then return null; end if;
  begin
    v_fiche := (new.metadata->>'inventaire_id')::bigint;
  exception when others then
    return null;
  end;
  if v_fiche is null then return null; end if;
  select i.vinted_status into v_statut from public.inventaire i where i.id = v_fiche and i.user_id = new.user_id;
  update public.lectures_origine_demandees d
     set echecs = d.echecs + 1,
         dernier_echec = v_res,
         essai_le = now(),
         faite_le = case when v_res in ('page_sans_annonce', 'introuvable') or d.echecs + 1 >= 3 then now() end,
         motif = case
                   when v_res = 'introuvable' then 'introuvable'
                   when v_res = 'page_sans_annonce' and v_statut in ('hidden', 'draft') then 'masquee'
                   when v_res = 'page_sans_annonce' or d.echecs + 1 >= 3 then 'illisible'
                   else v_res
                 end
   where d.user_id = new.user_id and d.inventaire_id = v_fiche and d.faite_le is null
     and d.plateforme = 'vinted' and d.demandee_le <= new.created_at;
  return null;
end $function$;

revoke all on function public._lecture_origine_echec_note() from public, anon, authenticated;

drop trigger if exists usage_logs_lecture_origine_echec on public.usage_logs;
create trigger usage_logs_lecture_origine_echec
  after insert on public.usage_logs
  for each row
  when (new.feature = 'lecture_fond'
        and coalesce(new.metadata->>'resultat', 'ok') <> 'ok'
        and (new.metadata->>'origine' like 'demandee%' or new.metadata->>'origine' = 'page'))
  execute function public._lecture_origine_echec_note();

-- ── 4. Une demande servie seulement si elle est VIVANTE ─────────────────────
-- (prod md5 6a746ca5b260bcfe907f51ada61b4379 avant) + choix postérieur, texte présent.
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
        join public.inventaire f on f.id = d.inventaire_id and f.user_id = d.user_id
       where d.user_id = auth.uid() and d.faite_le is null and d.demandee_le > now() - interval '7 days'
         -- (30/10, lot D) plus de lecture après un choix (Écrire / Faire rédiger) posé APRÈS la demande,
         -- ni quand la fiche a déjà son texte (la lecture ne pose que sur une fiche vide)
         and not (coalesce(f.attributs #>> '{description_sans_lecture,v}', '') in ('ecrite', 'redigee')
                  and coalesce(public._ts_ou_null(f.attributs #>> '{description_sans_lecture,at}'), 'infinity'::timestamptz) >= date_trunc('milliseconds', d.demandee_le))
         and coalesce(f.description, '') !~ '\S\s+\S'
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

-- (prod md5 478dd949d2128ec267220a2e9bbc0eec avant) — mêmes exclusions que le service.
CREATE OR REPLACE FUNCTION public.lecture_origine_signal()
 RETURNS TABLE(n integer, plus_recente timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer, max(d.demandee_le)
    from public.lectures_origine_demandees d
    join public.inventaire f on f.id = d.inventaire_id and f.user_id = d.user_id
   where d.user_id = auth.uid() and d.faite_le is null and d.demandee_le > now() - interval '15 minutes'
     and not (coalesce(f.attributs #>> '{description_sans_lecture,v}', '') in ('ecrite', 'redigee')
              and coalesce(public._ts_ou_null(f.attributs #>> '{description_sans_lecture,at}'), 'infinity'::timestamptz) >= date_trunc('milliseconds', d.demandee_le))
     and coalesce(f.description, '') !~ '\S\s+\S'
$function$;

-- ── 5. La (re)demande : compteur remis à 0 ; conclue sans texte = 24 h sans réarmer ──
-- (prod md5 2cd0360d86802b48d826396159025470 avant)
CREATE OR REPLACE FUNCTION public.demander_lecture_origine(p_fiche bigint, p_relancer boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_origine text; v_pf text; v_id uuid;
  v_conclue text;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select origine into v_origine from public.inventaire where id = p_fiche and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  v_pf := case when v_origine = 'vinted_sync' then 'vinted'
               when v_origine ~ '^releve_(leboncoin|beebs|depop|ebay)$' then substring(v_origine from 8) end;
  if v_pf is null then return jsonb_build_object('ok', true, 'reason', 'sans_origine_a_lire'); end if;
  -- (30/10, lot D) Conclue sans texte il y a moins de 24 h (masquée, illisible, introuvable, sans texte) :
  -- un simple « Publier » ne relance pas la lecture, l'app le dit tout de suite. « Réessayer » relance.
  if not coalesce(p_relancer, false) then
    select d.motif into v_conclue from public.lectures_origine_demandees d
     where d.user_id = v_user and d.inventaire_id = p_fiche and d.faite_le > now() - interval '24 hours'
       and d.motif in ('masquee', 'illisible', 'introuvable', 'sans_texte');
    if v_conclue is not null then
      return jsonb_build_object('ok', true, 'reason', 'conclue', 'motif', v_conclue, 'plateforme', v_pf);
    end if;
  end if;
  insert into public.lectures_origine_demandees (user_id, inventaire_id, plateforme)
  values (v_user, p_fiche, v_pf)
  on conflict (user_id, inventaire_id) do update
    set demandee_le = now(), faite_le = null, plateforme = excluded.plateforme,
        prise_le = null, essai_le = null, motif = null, echecs = 0, dernier_echec = null
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

-- ── La conclusion de l'extension (≥ 0.6.160) accepte « masquee » et « illisible » ──
-- (prod md5 f06c2935891c84d71240406f0cddd590 avant)
CREATE OR REPLACE FUNCTION public.lecture_origine_conclure(p_fiche bigint, p_resultat text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.lectures_origine_demandees
     set faite_le = now(), essais = essais + 1,
         motif = case when p_resultat in ('sans_texte', 'introuvable', 'masquee', 'illisible') then p_resultat else null end
   where user_id = auth.uid() and inventaire_id = p_fiche and faite_le is null
$function$;
