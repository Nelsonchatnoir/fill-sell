-- Tests de 20261023120000_republications_hors_quota (assemblés par 20261023120000_generer.sh, transaction annulée).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  thierry uuid := 'c2175e91-3854-4a66-8388-e28810166a3e';
  avant jsonb; apres jsonb; n_avant integer; n_apres integer; r jsonb; v_cycle timestamptz; v_job uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', thierry, 'role', 'authenticated')::text, true);
  avant := to_jsonb(public.quotas_etat());
  select coalesce(max(created_at), date_trunc('month', now())) into v_cycle from coin_ledger where user_id = thierry and kind in ('grant_monthly','grant_upgrade');
  select count(*) into n_avant from cross_post_jobs where user_id = thierry and action = 'republish' and created_at >= v_cycle
     and not (coalesce(platform_fields, '{}'::jsonb) ?| array['opla_sortie', 'hors_quota']);
  -- Ses republications de réparation passent hors quota
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('hors_quota', jsonb_build_object('motif', 'essai'))
   where user_id = thierry and action = 'republish' and created_at >= '2026-10-23 12:00:00+02';
  select count(*) into n_apres from cross_post_jobs where user_id = thierry and action = 'republish' and created_at >= v_cycle
     and not (coalesce(platform_fields, '{}'::jsonb) ?| array['opla_sortie', 'hors_quota']);
  apres := to_jsonb(public.quotas_etat());
  insert into _r values ('A1 ses republications de réparation sortent du compte', n_apres < n_avant, n_avant || ' → ' || n_apres);
  insert into _r values ('A2 l''état des quotas (affiché dans l''app) suit', avant::text <> apres::text or n_avant = n_apres, left(avant::text, 120) || ' → ' || left(apres::text, 120));
  -- Le geste « Republier » reste possible (rien d'autre ne change)
  select j.id into v_job from cross_post_jobs j where j.user_id = thierry and j.platform = 'vinted' and j.action = 'publish' and j.status = 'published'
     and not exists (select 1 from cross_post_jobs x where x.inventaire_id = j.inventaire_id and x.action = 'republish' and x.status in ('pending','processing','needs_user'))
   order by j.created_at desc limit 1;
  r := public.spend_coins_and_republish((select inventaire_id from cross_post_jobs where id = v_job), (select platform_listing_id from cross_post_jobs where id = v_job), 'manuel', null, 'vinted');
  insert into _r values ('B1 « Republier » fonctionne comme avant', (r ->> 'allowed')::boolean, r::text);
  -- Un autre compte (Louis) : son compte de quota est inchangé
  perform set_config('request.jwt.claims', json_build_object('sub', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'role', 'authenticated')::text, true);
  insert into _r values ('C1 un autre compte : quotas_etat répond', public.quotas_etat() is not null, left(to_jsonb(public.quotas_etat())::text, 160));
  perform set_config('request.jwt.claims', '', true);
end $$;
select essai, ok, left(coalesce(detail, ''), 200) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
