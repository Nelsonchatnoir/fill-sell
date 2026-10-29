-- Essai à blanc de 20261029201000_beebs_rearmer_retrait_vente_sans_fiche : ROLLBACK. Généré par 20261029201000_generer.sh.
begin;
set local statement_timeout = '120s';
-- Essai de 20261029201000 (29/10, lot B 4.9 B) — partie AVANT la migration, assemblée par 20261029201000_generer.sh
-- (transaction annulée). Le retrait cfed66ca de Sébastien (copie Beebs 34219819, fiche supprimée) est mis dans l'état
-- que le filet regarde : clos « deleted », puis l'annonce revue EN LIGNE par un relevé (ligne posée dans la transaction).
-- La fonction DE LA PROD le juge d'abord (sous-bloc défait par une exception).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _avant (n_rearmes integer, statut text);
update public.cross_post_jobs set status = 'deleted', error = null where id = 'cfed66ca-ae69-48c2-a312-ab796a79bdd7';
insert into public.annonces_plateforme (user_id, platform, listing_id, url, statut_plateforme, vu_le)
values ('48dd94f7-3105-49a7-af54-24d9c479a980', 'beebs', '34219819', 'https://www.beebs.app/fr/p/34219819', 'en_ligne', now());
do $avant$
declare v text;
begin
  begin
    v := public.retraits_beebs_rearmer_revus('48dd94f7-3105-49a7-af54-24d9c479a980')::text
      || ':' || (select status from public.cross_post_jobs where id = 'cfed66ca-ae69-48c2-a312-ab796a79bdd7');
    raise exception using message = v, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _avant values (split_part(sqlerrm, ':', 1)::integer, split_part(sqlerrm, ':', 2));
  end;
end
$avant$;
-- 20261029201000 — (29/10, lot B 4.9 B) UN RETRAIT BEEBS REVU EN LIGNE SE RÉARME AUSSI QUAND LA FICHE EST SUPPRIMÉE.
-- ⛔ NON APPLIQUÉE. À appliquer seulement sur feu vert NOMMÉ de Nico, après l'essai à blanc :
--   npx supabase db query --linked -f supabase/migrations/20261029201000_beebs_rearmer_retrait_vente_sans_fiche.sql
--   npx supabase migration repair --linked --status applied 20261029201000
-- Inverse : supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql (md5 relu).
-- Essai : scripts/essais/20261029201000_essai.sql (20261029201000_generer.sh : migration + tests, ROLLBACK).
--
-- CONSTAT : Sébastien (48dd94f7), retrait cfed66ca (copie Beebs 34219819, jamais en ligne), armé le 25/10 à 09:57 par
-- la vente Vinted 286083 (10500161434) ; la fiche a été supprimée : inventaire_id NULL sur le dépôt 803df781, le retrait
-- et la vente. Le filet retraits_beebs_rearmer_revus (un retrait Beebs clos « deleted » puis revu EN LIGNE par un relevé
-- repart) exigeait une fiche « vendu » par jointure sur inventaire : il ne réarmerait JAMAIS ce retrait si Beebs publiait
-- l'annonce tard — double vente possible.
-- RÈGLE (R4) : fiche présente → inchangé (fiche « vendu ») ; fiche supprimée (inventaire_id NULL sur le dépôt ET le
-- retrait) → la vente prouvée par SA ligne ventes : même compte, sans fiche elle non plus, autre plateforme que Beebs,
-- pas annulée, née à l'instant où elle a armé ce retrait (platform_fields.arme_par.le ± 2 min — la règle du 18/10 qui
-- relie une vente à ses retraits pour les remises en vente), et aucune annulation posée sur le dépôt
-- (vente_annulee_remise). Le chemin d'armement (arme_par.chemin vente_article_serveur / vente_copie_prouvee), le
-- plafond de 3 réarmements, le relevé « en ligne » après la clôture : inchangés. Jamais un titre.
-- CPU : la nouvelle branche ne se lit que pour un retrait Beebs « deleted » revu en ligne SANS fiche (rare) ; lecture
-- des ventes du compte par ventes_user_idx, bornée à ± 2 min. 20 retraits par appel (inchangé).
-- Corps repris de pg_get_functiondef EN PROD le 29/10 (md5 0756d52c09e79dedc45a66971a8ebf2c) ; un seul changement :
-- la condition « fiche vendue ».


DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) <> '0756d52c09e79dedc45a66971a8ebf2c' THEN
    RAISE EXCEPTION 'retraits_beebs_rearmer_revus a changé en prod depuis sa lecture du 29/10 : régénérer 20261029201000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.retraits_beebs_rearmer_revus(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d record; n integer := 0;
begin
  for d in
    select j.id, j.platform_fields as pf, a.id as annonce, a.vu_le, a.run_id
      from public.cross_post_jobs j
      join public.annonces_plateforme a
        on a.user_id = j.user_id and a.platform = 'beebs' and a.listing_id = btrim(j.platform_listing_id)
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
     where j.user_id = p_user and j.platform = 'beebs' and j.action = 'delete' and j.status = 'deleted'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^\d+$'
       and j.platform_fields #>> '{arme_par,chemin}' in ('vente_article_serveur', 'vente_copie_prouvee')
       and coalesce((j.platform_fields -> 'delete_trace')::text, '') !~* 'confirmation (envoy|re[cç]u)'
       and coalesce((j.platform_fields #>> '{rearme_revu_en_ligne,n}')::int, 0) < 3
       and a.vu_le > greatest(j.created_at,
                              coalesce(public._ts_ou_null(j.platform_fields ->> 'processing_since'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{delete_preuve,lu_le}'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{rearme_revu_en_ligne,le}'), '-infinity'::timestamptz))
                     + interval '10 minutes'
       and not exists (select 1 from public.cross_post_jobs o
                        where o.user_id = j.user_id and o.platform = 'beebs' and o.action = 'delete'
                          and o.status in ('pending', 'processing', 'needs_user')
                          and btrim(coalesce(o.platform_listing_id, '')) = btrim(j.platform_listing_id))
       and exists (select 1 from public.cross_post_jobs dep
                    where (j.platform_fields #>> '{arme_par,depot}') ~ '^[0-9a-fA-F-]{36}$'
                      and dep.id = (j.platform_fields #>> '{arme_par,depot}')::uuid
                      and (exists (select 1 from public.inventaire i
                                    where i.id = dep.inventaire_id and i.user_id = dep.user_id and i.statut = 'vendu')
                           -- (29/10, lot B 4.9 B — Sébastien 48dd94f7, retrait cfed66ca, copie 34219819) FICHE SUPPRIMÉE :
                           -- inventaire_id NULL sur le dépôt, le retrait et la vente — la jointure sur la fiche ne
                           -- réarmait jamais ce retrait si Beebs publiait tard. La vente est alors prouvée par SA ligne
                           -- ventes : même compte, sans fiche elle non plus, autre plateforme que Beebs, pas annulée, née
                           -- à l'instant où elle a armé ce retrait (arme_par.le ± 2 min, la règle du 18/10 des remises en
                           -- vente) ; et aucune annulation de vente posée sur le dépôt (vente_annulee_remise). Jamais un titre.
                           or (dep.inventaire_id is null and j.inventaire_id is null and dep.user_id = j.user_id
                               and not (coalesce(dep.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise')
                               and public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') is not null
                               and exists (select 1 from public.ventes v
                                            where v.user_id = j.user_id and v.inventaire_id is null
                                              and v.created_at between public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') - interval '2 minutes'
                                                                   and public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') + interval '2 minutes'
                                              and lower(coalesce(v.statut, '')) not in ('annule', 'annulé', 'annulée', 'cancelled', 'canceled')
                                              and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''), '')) not in ('', 'beebs')))))
     limit 20
  loop
    update public.cross_post_jobs set
           status = 'pending',
           error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
           platform_fields = (platform_fields - array['processing_since', 'next_action_after', 'delete_confirmed_by',
                                                      'delete_preuve', 'beebs_en_moderation'])
             || jsonb_build_object('rearme_revu_en_ligne', jsonb_build_object('le', now(), 'vu_le', d.vu_le,
                  'releve', d.run_id, 'n', coalesce((d.pf #>> '{rearme_revu_en_ligne,n}')::int, 0) + 1,
                  'trace_precedente', d.pf -> 'delete_trace'))
     where id = d.id and status = 'deleted';
    if found then
      update public.annonces_plateforme set retiree_le = null, retrait_job_id = null, updated_at = now()
       where id = d.annonce and retrait_job_id = d.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

-- Essai de 20261029201000 (29/10, lot B 4.9 B) — tests APRÈS la migration (transaction annulée).
do $tests$
declare
  v_seb uuid := '48dd94f7-3105-49a7-af54-24d9c479a980';
  v_ret uuid := 'cfed66ca-ae69-48c2-a312-ab796a79bdd7';
  v_dep uuid := '803df781-a884-419e-a21a-c5aaf14ee87e';
  v_def text; n integer; j record; v_stock bigint; v_vendu bigint; t0 timestamptz; v_ms numeric; n_jobs integer;
begin
  select count(*) into n_jobs from public.cross_post_jobs where user_id = v_seb and created_at >= now();
  insert into _r values ('A1 AVANT (prod) : fiche supprimée → le retrait revu en ligne n''est PAS réarmé',
    (select n_rearmes from _avant) = 0 and (select statut from _avant) = 'deleted', (select n_rearmes || ' / ' || statut from _avant));
  v_def := pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure);
  insert into _r values ('C1 la règle d''avant (fiche « vendu ») est gardée mot pour mot ; droits inchangés',
    v_def ~ 'where i\.id = dep\.inventaire_id and i\.user_id = dep\.user_id and i\.statut = ''vendu''\)'
    and (select proacl::text from pg_proc where oid = 'public.retraits_beebs_rearmer_revus(uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}',
    (select proacl::text from pg_proc where oid = 'public.retraits_beebs_rearmer_revus(uuid)'::regprocedure));

  -- Les cas qui ne doivent RIEN réarmer, et la règle d'avant (chacun dans un sous-bloc défait).
  begin
    update public.cross_post_jobs set platform_fields = platform_fields || '{"vente_annulee_remise": {"vente": 286083}}'::jsonb where id = v_dep;
    n := public.retraits_beebs_rearmer_revus(v_seb);
    raise exception using message = n::text, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _r values ('R2 vente annulée posée sur le dépôt (vente_annulee_remise) : rien', sqlerrm = '0', sqlerrm);
  end;
  begin
    update public.cross_post_jobs
       set platform_fields = jsonb_set(platform_fields, '{arme_par,le}', to_jsonb((public._ts_ou_null(platform_fields #>> '{arme_par,le}') + interval '1 hour')::text))
     where id = v_ret;
    n := public.retraits_beebs_rearmer_revus(v_seb);
    raise exception using message = n::text, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _r values ('R3 aucune vente née à l''instant de l''armement (± 2 min) : rien', sqlerrm = '0', sqlerrm);
  end;
  select id into v_stock from public.inventaire where user_id = v_seb and statut = 'stock' limit 1;
  select id into v_vendu from public.inventaire where user_id = v_seb and statut = 'vendu' limit 1;
  begin
    update public.cross_post_jobs set inventaire_id = v_stock where id in (v_ret, v_dep);
    n := public.retraits_beebs_rearmer_revus(v_seb);
    raise exception using message = n::text, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _r values ('R4 fiche présente, EN STOCK : rien (la vente se lit sur la fiche, comme avant)', sqlerrm = '0',
      sqlerrm || ' (fiche ' || coalesce(v_stock::text, '∅') || ')');
  end;
  begin
    update public.cross_post_jobs set inventaire_id = v_vendu where id in (v_ret, v_dep);
    n := public.retraits_beebs_rearmer_revus(v_seb);
    raise exception using message = n::text, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _r values ('R5 fiche présente, VENDUE : réarmé (règle d''avant, inchangée)', sqlerrm = '1',
      sqlerrm || ' (fiche ' || coalesce(v_vendu::text, '∅') || ')');
  end;

  -- Le cas de Sébastien : fiche supprimée, vente Vinted 286083 née à l'instant de l'armement.
  t0 := clock_timestamp();
  n := public.retraits_beebs_rearmer_revus(v_seb);
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_ret;
  insert into _r values ('R1 Sébastien cfed66ca (fiche supprimée, vente 286083 lue sur sa ligne) : réarmé, « pending », trace rearme_revu_en_ligne',
    n = 1 and j.status = 'pending' and (j.pf #>> '{rearme_revu_en_ligne,n}')::int = 1
    and j.error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
    n || ' / ' || j.status || ' / ' || coalesce(j.pf ->> 'rearme_revu_en_ligne', '∅'));
  insert into _r values ('R6 relu aussitôt : rien de plus (le retrait est en file, jamais deux)', public.retraits_beebs_rearmer_revus(v_seb) = 0, null);
  insert into _r values ('P1 durée de l''appel pour le compte de Sébastien', v_ms < 200, v_ms || ' ms');
  insert into _r values ('X1 aucun job créé, aucun mail',
    (select count(*) from public.cross_post_jobs where user_id = v_seb and created_at >= now()) = n_jobs
    and (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end
$tests$;
-- INVERSE de 20261029201000_beebs_rearmer_retrait_vente_sans_fiche (29/10, lot B 4.9 B).
-- Rend retraits_beebs_rearmer_revus tel que LU EN PROD le 29/10 (pg_get_functiondef, md5
-- 0756d52c09e79dedc45a66971a8ebf2c — relu à la fin). Les retraits réarmés entre-temps restent ce qu'ils sont (pending,
-- rearme_revu_en_ligne) : un retrait d'une annonce vue en ligne après la vente.
-- ⛔ À jouer seulement sur ordre de Nico : npx supabase db query --linked -f <ce fichier>.


CREATE OR REPLACE FUNCTION public.retraits_beebs_rearmer_revus(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d record; n integer := 0;
begin
  for d in
    select j.id, j.platform_fields as pf, a.id as annonce, a.vu_le, a.run_id
      from public.cross_post_jobs j
      join public.annonces_plateforme a
        on a.user_id = j.user_id and a.platform = 'beebs' and a.listing_id = btrim(j.platform_listing_id)
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
     where j.user_id = p_user and j.platform = 'beebs' and j.action = 'delete' and j.status = 'deleted'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^\d+$'
       and j.platform_fields #>> '{arme_par,chemin}' in ('vente_article_serveur', 'vente_copie_prouvee')
       and coalesce((j.platform_fields -> 'delete_trace')::text, '') !~* 'confirmation (envoy|re[cç]u)'
       and coalesce((j.platform_fields #>> '{rearme_revu_en_ligne,n}')::int, 0) < 3
       and a.vu_le > greatest(j.created_at,
                              coalesce(public._ts_ou_null(j.platform_fields ->> 'processing_since'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{delete_preuve,lu_le}'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{rearme_revu_en_ligne,le}'), '-infinity'::timestamptz))
                     + interval '10 minutes'
       and not exists (select 1 from public.cross_post_jobs o
                        where o.user_id = j.user_id and o.platform = 'beebs' and o.action = 'delete'
                          and o.status in ('pending', 'processing', 'needs_user')
                          and btrim(coalesce(o.platform_listing_id, '')) = btrim(j.platform_listing_id))
       and exists (select 1 from public.cross_post_jobs dep
                     join public.inventaire i on i.id = dep.inventaire_id and i.user_id = dep.user_id
                    where (j.platform_fields #>> '{arme_par,depot}') ~ '^[0-9a-fA-F-]{36}$'
                      and dep.id = (j.platform_fields #>> '{arme_par,depot}')::uuid
                      and i.statut = 'vendu')
     limit 20
  loop
    update public.cross_post_jobs set
           status = 'pending',
           error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
           platform_fields = (platform_fields - array['processing_since', 'next_action_after', 'delete_confirmed_by',
                                                      'delete_preuve', 'beebs_en_moderation'])
             || jsonb_build_object('rearme_revu_en_ligne', jsonb_build_object('le', now(), 'vu_le', d.vu_le,
                  'releve', d.run_id, 'n', coalesce((d.pf #>> '{rearme_revu_en_ligne,n}')::int, 0) + 1,
                  'trace_precedente', d.pf -> 'delete_trace'))
     where id = d.id and status = 'deleted';
    if found then
      update public.annonces_plateforme set retiree_le = null, retrait_job_id = null, updated_at = now()
       where id = d.annonce and retrait_job_id = d.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

DO $relu$
BEGIN
  IF md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) <> '0756d52c09e79dedc45a66971a8ebf2c' THEN
    RAISE EXCEPTION 'inverse 20261029201000 : retraits_beebs_rearmer_revus n''est pas revenue à la définition lue en prod le 29/10';
  END IF;
END
$relu$;

do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : retraits_beebs_rearmer_revus revenue à la prod (md5 0756d52c…)',
    md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) = '0756d52c09e79dedc45a66971a8ebf2c', null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
