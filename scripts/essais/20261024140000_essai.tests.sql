-- Tests de 20261024140000_refus_plateformes_vraie_cause (assemblés par 20261024140000_generer.sh, ROLLBACK).
-- Rejeu sur les vrais jobs : chacun est remis dans l'état d'avant son jugement, puis rejugé par la fonction neuve.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  v_joca uuid := '53efea05-dc2d-4467-a8cd-c6fa52a47a61';
  v_louis uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  v_run uuid; b jsonb; j record; n_mails integer;
begin
  select count(*) into n_mails from public.email_logs;
  -- C les corps et les droits.
  insert into _r values ('C1 trancher : corps attendu',
    md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) = 'cea7fc3e15e05d907afb694adcff6cbe', null);
  insert into _r values ('C2 fail_publish : corps attendu',
    md5(pg_get_functiondef('public.fail_publish_without_listing_url(timestamp with time zone)'::regprocedure)) = 'd7cb366098abafab120c59791ad34fb0', null);
  insert into _r values ('C3 droits inchangés : trancher {postgres, service_role}, fail_publish {postgres}, aide {postgres, service_role}',
    (select proacl::text from pg_proc where oid = 'public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.fail_publish_without_listing_url(timestamp with time zone)'::regprocedure) = '{postgres=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.article_en_ligne_ailleurs(uuid,text,bigint,text[])'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}',
    (select proacl::text from pg_proc where oid = 'public.article_en_ligne_ailleurs(uuid,text,bigint,text[])'::regprocedure));

  -- A l'aide sur les vraies fiches.
  insert into _r values ('A1 Short Okaïdi (louis-seller) : en ligne par le compte relié, 3286756945',
    public.article_en_ligne_ailleurs(v_louis, 'leboncoin', 1789889085803006, ARRAY[]::text[]) = '{"issue": "en_ligne_par_compte_relie", "listing_id": "3286756945"}'::jsonb,
    public.article_en_ligne_ailleurs(v_louis, 'leboncoin', 1789889085803006, ARRAY[]::text[])::text);
  insert into _r values ('A2 numéro exclu : rien', public.article_en_ligne_ailleurs(v_louis, 'leboncoin', 1789889085803006, ARRAY['3286756945']) is null, null);
  insert into _r values ('A3 Jupe Gémo (louis-seller) : en ligne nulle part', public.article_en_ligne_ailleurs(v_louis, 'leboncoin', 1789889085803000, ARRAY[]::text[]) is null, null);
  insert into _r values ('A4 arguments nuls : rien', public.article_en_ligne_ailleurs(null, 'leboncoin', 1, null) is null and public.article_en_ligne_ailleurs(v_louis, 'leboncoin', null, null) is null, null);

  -- T jocabroc8, estampe (job 20587777) : remise « publiée » telle qu'avant son jugement du 22/10, puis rejugée.
  update public.cross_post_jobs set status = 'published', error = null,
         platform_fields = platform_fields - 'depot_jamais_en_ligne'
   where id = '20587777-4821-4548-ac1b-9c14722a4c43';
  select r.id into v_run from public.vinted_sync_runs r
   where r.user_id = v_joca and r.platform = 'ebay' and r.kind = 'annonces' and public.releve_preuve_absence(r.id)
   order by r.started_at desc limit 1;
  b := public.trancher_publications_sans_lien(v_joca, 'ebay', v_run);
  select status, error, platform_fields -> 'depot_jamais_en_ligne' d into j from public.cross_post_jobs where id = '20587777-4821-4548-ac1b-9c14722a4c43';
  insert into _r values ('T1 estampe : close sans rouge, « arrêtée sur eBay le 11/10 à 18h27 — pas par FillSell », en ligne sous 407302958488',
    j.status = 'cancelled' and j.d ->> 'issue' = 'arretee_sur_ebay' and j.error like '%arrêtée le 11/10 à 18h27 — pas par FillSell, et sans vente%'
      and j.error like '%en ligne sous l''annonce 407302958488 : rien à refaire.%' and j.d ->> 'annonce_en_ligne' = '407302958488'
      and j.d -> 'refund' = 'null'::jsonb
      and j.error not like '%modération%' and j.error not like '%doublons%' and j.error not like '%jamais été mis en ligne%', j.status || ' | ' || left(j.error, 200));

  -- O louis-seller, Short Okaïdi (job a32b31ec) : remis « publié sans lien », puis rejugé (48 h passées).
  update public.cross_post_jobs set status = 'published', error = null,
         platform_fields = platform_fields - 'listing_url_abandon'
   where id = 'a32b31ec-f5ac-4eb1-baa6-44ebcffdfcd0';
  b := public.fail_publish_without_listing_url('2026-10-20 03:29:30+00'::timestamptz);
  select status, error, platform_fields -> 'depot_jamais_en_ligne' d into j from public.cross_post_jobs where id = 'a32b31ec-f5ac-4eb1-baa6-44ebcffdfcd0';
  insert into _r values ('O1 Short Okaïdi : clos sans rouge, « DÉJÀ en ligne sous l''annonce 3286756945, publiée par ton compte FillSell relié »',
    j.status = 'cancelled' and j.d ->> 'issue' = 'en_ligne_par_compte_relie' and j.d ->> 'annonce_en_ligne' = '3286756945'
      and j.error like '%DÉJÀ en ligne sous l''annonce 3286756945, publiée par ton compte FillSell relié%', j.status || ' | ' || left(j.error, 160));
  insert into _r values ('O2 le bilan compte la clôture', (b ->> 'en_ligne_ailleurs')::int >= 1, b::text);

  insert into _r values ('M aucun mail', (select count(*) from public.email_logs) = n_mails, null);
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) || '/' || count(*) as verts from _r;
