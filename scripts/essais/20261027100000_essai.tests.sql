-- Tests de 20261027100000_jamais_en_ligne_referme_par_le_releve + réparation 20261027 (assemblés par
-- 20261027100000_generer.sh, ROLLBACK). Sur les vraies lignes du 27/10 ; les annonces d'essai sont des numéros
-- 39999999xx inexistants, annulés avec le reste.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  v_boncoin uuid := '3f91c02e-3abc-4e08-8c46-b2232005b10e';
  v_gta uuid := 'aea284ac-5614-47b7-8473-8edcb27dfcb4';
  v_suivi uuid := '21d6091f-1f2e-4149-a5c2-5081f1d5575a';
  v_annonce uuid := '09448c8b-00ea-4027-b832-c20eee10e668';
  v_fiche bigint := 1792855407839006;
  v_ornella uuid := 'f8aa02a5-23cb-4325-bba8-127f61a75741';
  v_orn_job uuid := '495e9ffc-5efc-42c9-85a4-e31a9a1d7c72';
  v_orn_autre uuid := '3d93ce6e-6254-44a4-98ee-e1bdc870531d';
  v_recru uuid := '7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28';
  v_recru_job uuid := '46522917-24fd-43bb-a957-863682608e7a';
  v_recru_fiche bigint := 1791926966177014;
  v_autre_fiche bigint;
  j record; s record; b jsonb; n integer;
begin
  -- C. Corps, droits, déclencheurs.
  insert into _r values ('C1 droits : règle {postgres, service_role}, trancher inchangés, fail_publish {postgres}',
    (select proacl::text from pg_proc where oid = 'public.depot_jamais_en_ligne_refermer(uuid,text,bigint,text,uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.fail_publish_without_listing_url(timestamp with time zone)'::regprocedure) = '{postgres=X/postgres}',
    (select proacl::text from pg_proc where oid = 'public.depot_jamais_en_ligne_refermer(uuid,text,bigint,text,uuid)'::regprocedure));
  insert into _r values ('C2 deux déclencheurs sur annonces_plateforme',
    (select count(*) from pg_trigger where tgrelid = 'public.annonces_plateforme'::regclass and tgname like 'annonces_plateforme_referme_depot_%') = 2, null);
  insert into _r values ('C3 plus aucun « refusée par sa modération » écrit par trancher ni fail_publish (hors commentaires)',
    regexp_replace(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure), '--[^\n]*', '', 'g') !~ 'refusée par sa modération|refusée par sa vérification|refusé à la vérification'
    and regexp_replace(pg_get_functiondef('public.fail_publish_without_listing_url(timestamp with time zone)'::regprocedure), '--[^\n]*', '', 'g') !~ 'refusée par sa modération', null);

  -- R. La réparation (déjà jouée au-dessus) : la GTA refermée par la règle.
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_gta;
  insert into _r values ('R1 GTA : close sans rouge, en ligne sous 3295468043',
    j.status = 'cancelled' and j.pf #>> '{depot_jamais_en_ligne,issue}' = 'article_en_ligne_ailleurs'
      and j.pf #>> '{depot_jamais_en_ligne,issue_avant}' = 'refus_moderation_probable'
      and j.pf #>> '{depot_jamais_en_ligne,annonce_en_ligne}' = '3295468043'
      and j.pf #>> '{depot_jamais_en_ligne,refermee,annonce_id}' = v_annonce::text
      and j.pf #>> '{depot_jamais_en_ligne,refermee,suivie_par}' = v_suivi::text
      and j.pf #>> '{reparation_2710_jamais_en_ligne,par}' = 'regle', j.status || ' | ' || coalesce(j.pf #>> '{depot_jamais_en_ligne}', ''));
  insert into _r values ('R2 GTA : le motif dit ce qu''on sait',
    j.error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces Leboncoin, mais ton article y est en ligne sous l''annonce 3295468043 (vue au relevé du 26/10 à 16h53) : rien à refaire, rien n''est vendu.', j.error);
  insert into _r values ('R3 GTA : l''ancien motif archivé',
    (j.pf -> 'erreurs_archivees' -> -1 ->> 'erreur') like 'Leboncoin n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération%'
      and (j.pf -> 'erreurs_archivees' -> -1 ->> 'statut') = 'failed', j.pf ->> 'erreurs_archivees');
  select status, listing_url, platform_listing_id into s from public.cross_post_jobs where id = v_suivi;
  insert into _r values ('R4 la publication qui suit 3295468043 est intacte (publiée, même lien)',
    s.status = 'published' and s.platform_listing_id = '3295468043' and s.listing_url = 'https://www.leboncoin.fr/ad/jeux_video/3295468043', s.status);
  select count(*) into n from public.cross_post_jobs c join public._backup_2710_jamais_en_ligne b on b.id = c.id
   where c.id <> v_gta and c.status = 'failed' and c.error like '%n''a donné aucun motif. Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.'
     and c.error !~ 'refusée par sa|retirée' and c.platform_fields #>> '{reparation_2710_jamais_en_ligne,par}' = 'texte';
  insert into _r values ('R5 les 10 autres lignes : toujours en échec, motif sans déduction', n = 10, n::text);
  insert into _r values ('R6 Leboncoin (paugues 36529e5f) : texte exact, mêmes relevés',
    (select error from public.cross_post_jobs where id = '36529e5f-5b03-4f00-93ba-7862365c5ba2')
      = 'Cette annonce est absente de tes annonces Leboncoin aux relevés complets du 25/10 à 16h44 et du 26/10 à 19h23, et Leboncoin n''a donné aucun motif. Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.',
    (select error from public.cross_post_jobs where id = '36529e5f-5b03-4f00-93ba-7862365c5ba2'));
  insert into _r values ('R7 eBay (43e3371c) : texte exact',
    (select error from public.cross_post_jobs where id = '43e3371c-39bd-45ec-9686-05e500000828')
      = 'Cette annonce est absente de tes annonces eBay aux relevés complets du 24/10 à 22h58 et du 25/10 à 16h51, et eBay n''a donné aucun motif. Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.', null);
  insert into _r values ('R8 Beebs (abd12bb5) : trois jours, sans « refusée par sa vérification »',
    (select error from public.cross_post_jobs where id::text like 'abd12bb5%')
      = 'Trois jours après le dépôt, cette annonce n''était ni en ligne ni « en vérification » dans tes annonces Beebs aux relevés complets du 22/10 à 21h19 et du 23/10 à 02h33, et Beebs n''a donné aucun motif. Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.',
    (select error from public.cross_post_jobs where id::text like 'abd12bb5%'));

  -- D1. Le 26/10 rejoué : ligne rouge, annonce détachée, puis rattachée par le rapprochement → refermée par le déclencheur.
  update public.cross_post_jobs c set status = b.status, error = b.error, platform_fields = b.platform_fields
    from public._backup_2710_jamais_en_ligne b where c.id = b.id and c.id = v_gta;
  update public.annonces_plateforme set inventaire_id = null, job_id = null where id = v_annonce;
  insert into _r values ('D1a annonce détachée : la ligne reste en échec (rien sur un numéro qui n''est pas le sien)',
    (select status from public.cross_post_jobs where id = v_gta) = 'failed', null);
  update public.annonces_plateforme set inventaire_id = v_fiche, job_id = v_suivi where id = v_annonce;
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_gta;
  insert into _r values ('D1b rattachée à la fiche : refermée sur-le-champ par le déclencheur',
    j.status = 'cancelled' and j.pf #>> '{depot_jamais_en_ligne,annonce_en_ligne}' = '3295468043', j.status);

  -- D2. Même numéro : le dépôt d'Ornella (3286567604, jamais vu) apparaît en ligne → « publiée » avec son lien.
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_ornella, 'leboncoin', '3286567604', 'https://www.leboncoin.fr/ad/essai/3286567604', 'essai 27/10', 'en_ligne', now());
  select status, error, listing_url, platform_fields pf into j from public.cross_post_jobs where id = v_orn_job;
  insert into _r values ('D2 même numéro, suivie par personne : publiée, lien posé, erreur archivée',
    j.status = 'published' and j.error is null and j.listing_url = 'https://www.leboncoin.fr/ad/essai/3286567604'
      and not (j.pf ? 'depot_jamais_en_ligne') and j.pf #>> '{depot_jamais_en_ligne_leve,annonce}' = '3286567604'
      and (j.pf -> 'erreurs_archivees' -> -1 ->> 'statut') = 'failed', j.status || ' | ' || coalesce(j.listing_url, ''));

  -- D3. Même numéro mais déjà suivie par une autre publication : close sans rouge, jamais deux lignes publiées.
  update public.cross_post_jobs c set status = b.status, error = b.error, platform_fields = b.platform_fields, listing_url = b.listing_url
    from public._backup_2710_jamais_en_ligne b where c.id = b.id and c.id = v_orn_job;
  update public.annonces_plateforme set statut_plateforme = 'inconnu', job_id = v_orn_autre
   where user_id = v_ornella and platform = 'leboncoin' and listing_id = '3286567604';
  update public.annonces_plateforme set statut_plateforme = 'en_ligne'
   where user_id = v_ornella and platform = 'leboncoin' and listing_id = '3286567604';
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_orn_job;
  insert into _r values ('D3 même numéro suivi ailleurs : close, « déjà suivie par FillSell »',
    j.status = 'cancelled' and j.pf #>> '{depot_jamais_en_ligne,issue}' = 'en_ligne_meme_numero'
      and j.error like 'Ce dépôt est en ligne sur Leboncoin sous l''annonce 3286567604 (vue au relevé du %), déjà suivie par FillSell : rien à refaire, rien n''est vendu.'
      and (select status from public.cross_post_jobs where id = v_orn_autre) = 'published', j.status || ' | ' || coalesce(j.error, ''));

  -- G. Les gardes : jamais un titre, jamais une autre fiche, jamais une autre plateforme.
  select id into v_autre_fiche from public.inventaire where user_id = v_recru and id <> v_recru_fiche order by id desc limit 1;
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  select v_recru, 'leboncoin', '3999999991', 'https://www.leboncoin.fr/ad/essai/3999999991', title, 'en_ligne', now()
    from public.cross_post_jobs where id = v_recru_job;
  insert into _r values ('G1 même titre, aucune fiche : rien', (select status from public.cross_post_jobs where id = v_recru_job) = 'failed', null);
  update public.annonces_plateforme set inventaire_id = v_autre_fiche where user_id = v_recru and listing_id = '3999999991';
  insert into _r values ('G2 même titre, AUTRE fiche : rien', (select status from public.cross_post_jobs where id = v_recru_job) = 'failed', v_autre_fiche::text);
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le, inventaire_id)
  values (v_recru, 'beebs', '3999999992', 'https://www.beebs.app/fr/p/3999999992', 'essai', 'en_ligne', now(), v_recru_fiche);
  insert into _r values ('G3 même fiche, AUTRE plateforme : rien', (select status from public.cross_post_jobs where id = v_recru_job) = 'failed', null);
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le, inventaire_id, disparu_le)
  values (v_recru, 'leboncoin', '3999999993', 'https://www.leboncoin.fr/ad/essai/3999999993', 'essai', 'en_ligne', now(), v_recru_fiche, now());
  insert into _r values ('G4 même fiche, même plateforme, mais disparue : rien', (select status from public.cross_post_jobs where id = v_recru_job) = 'failed', null);
  update public.annonces_plateforme set disparu_le = null where user_id = v_recru and listing_id = '3999999993';
  insert into _r values ('G5 témoin : même fiche, même plateforme, en ligne → refermée',
    (select status from public.cross_post_jobs where id = v_recru_job) = 'cancelled', null);

  -- T. trancher sur le dernier relevé de BONCOIN : passe la règle, rend son bilan.
  b := public.trancher_publications_sans_lien(v_boncoin, 'leboncoin', '941f3088-7c16-411e-8e1b-dbcaa5be89ac');
  insert into _r values ('T1 trancher : ok, bilan de la règle rendu', (b ->> 'ok')::boolean and b ? 'refermees' and (b -> 'refermees' ->> 'ok')::boolean, b::text);
end $$;
-- P. Coût : un relevé complet relu à l'identique ne déclenche rien ; la lecture du déclencheur est bornée.
do $$
declare v_boncoin uuid := '3f91c02e-3abc-4e08-8c46-b2232005b10e'; t0 timestamptz; n integer; v_ms numeric; v_plan json; v_avant text; v_apres text;
begin
  select md5(string_agg(id::text || status || coalesce(error, '') || coalesce(platform_fields::text, ''), ',' order by id)) into v_avant
    from public.cross_post_jobs where user_id = v_boncoin;
  t0 := clock_timestamp();
  update public.annonces_plateforme set vu_le = now(), statut_plateforme = statut_plateforme, inventaire_id = inventaire_id
   where user_id = v_boncoin and platform = 'leboncoin';
  get diagnostics n = row_count;
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000;
  select md5(string_agg(id::text || status || coalesce(error, '') || coalesce(platform_fields::text, ''), ',' order by id)) into v_apres
    from public.cross_post_jobs where user_id = v_boncoin;
  insert into _r values ('P1 relevé de BONCOIN relu à l''identique : aucun job réécrit', v_avant = v_apres, n || ' annonces, ' || round(v_ms) || ' ms');
  execute 'explain (analyze, format json) select 1 from public.cross_post_jobs c where c.user_id = ''447d920c-976a-4d8f-aff4-a2998050358c'' and c.status = ''failed'' and c.platform = ''leboncoin'' and coalesce(c.platform_fields, ''{}''::jsonb) ? ''depot_jamais_en_ligne'' limit 1' into v_plan;
  insert into _r values ('P2 lecture du déclencheur (compte louis-seller) < 5 ms', (v_plan -> 0 ->> 'Execution Time')::numeric < 5, (v_plan -> 0 ->> 'Execution Time') || ' ms');
  t0 := clock_timestamp();
  perform public.depot_jamais_en_ligne_refermer(u.user_id, u.platform, null, null, null)
     from (select distinct user_id, platform from public._backup_2710_jamais_en_ligne) u;
  insert into _r values ('P3 la règle sur les 7 comptes × plateformes (ms)', true, round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms');
end $$;
do $$
declare n_mails integer;
begin
  insert into _r values ('M1 aucun retrait armé, aucun redépôt', (select count(*) from public.cross_post_jobs where created_at >= now() and action in ('delete', 'publish', 'republish')) = 0, null);
  insert into _r values ('M2 aucun mail', (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) || '/' || count(*) as verts from _r;
