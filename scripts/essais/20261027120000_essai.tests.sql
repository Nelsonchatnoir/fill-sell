-- Tests de 20261027120000_releve_identifiant_avant_fiche + réparation 20261027 (assemblés par 20261027120000_generer.sh,
-- ROLLBACK). Sur les vraies lignes du 27/10 ; les annonces d'essai portent des numéros 39999999xx inexistants.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  v_nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  v_nico_ann uuid := 'cae643f0-a8cc-4236-a4c0-b0f946baa7d9';
  v_nico_fiche bigint := 1793009407689006; v_nico_dbl bigint := 1793089261133;
  v_nico_depot uuid := '6eef55a8-adb9-46e8-870b-4ab0e45b34af'; v_nico_suivi uuid := 'dc8dca7a-f7a9-4990-9f60-aa145fdcd82f';
  v_xewer uuid := 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
  v_xe_ann uuid := '881172df-2306-4a92-b959-631516deb340'; v_xe_fiche bigint := 1792945124235; v_xe_dbl bigint := 1792999747010;
  v_xe_depot uuid := '3b92d5ca-a96a-4d53-929a-727cb3226080';
  v_johan uuid := '7b9d8a71-6464-457f-abdc-9baee2a8543f';
  v_jo_ann uuid := '15bfc328-23b0-46c5-b7cc-4aa14733462e'; v_jo_fiche bigint := 1792585627450; v_jo_autre bigint := 1792909660810;
  v_jo_depot uuid := 'a385636d-f7a8-4423-bd67-89bd36c82a33';
  j record; r jsonb; n integer; n2 integer; v_id uuid; v_job record; v_inv_avant integer; v_jobs_avant integer;
begin
  -- C. Corps et droits.
  insert into _r values ('C1 droits : la règle et la résorption {postgres, service_role} ; les deux portes inchangées',
    (select proacl::text from pg_proc where oid = 'public.annonce_rattacher_par_identifiant(uuid,text)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.fiche_releve_doublon_resorber(uuid)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.rapprocher_importer(uuid,uuid,text)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.rapprochement_attacher(uuid,bigint,text,jsonb)'::regprocedure) = '{postgres=X/postgres,service_role=X/postgres}', null);

  -- R. La réparation (jouée au-dessus) : Nico résorbé, XEWER et Johan signalés, rien touché chez eux.
  select inventaire_id, job_id, source_rapprochement into j from public.annonces_plateforme where id = v_nico_ann;
  insert into _r values ('R1 Nico : l''annonce Depop rejoint la fiche d''origine et SON dépôt',
    j.inventaire_id = v_nico_fiche and j.job_id = v_nico_depot and j.source_rapprochement = 'job', j::text);
  insert into _r values ('R2 Nico : la fiche en double est absorbée (quitte le stock), journal inventaire_fusions',
    (select fusionne_dans from public.inventaire where id = v_nico_dbl) = v_nico_fiche
    and exists (select 1 from public.inventaire_fusions where absorbe = v_nico_dbl and garde = v_nico_fiche and par = 'regle:identifiant_avant_fiche'), null);
  insert into _r values ('R3 Nico : le job de suivi en double est clos, le dépôt intact (publié, même lien)',
    (select status from public.cross_post_jobs where id = v_nico_suivi) = 'cancelled'
    and (select platform_fields ? 'doublon_identifiant' from public.cross_post_jobs where id = v_nico_suivi)
    and (select status || '|' || listing_url from public.cross_post_jobs where id = v_nico_depot) = 'published|https://www.depop.com/products/nvlsonchatnoir-roman-en-tres-bon-etat-30fa/', null);
  insert into _r values ('R4 XEWER : à signaler (fiche vendue, une vente), rien écrit',
    (select resultat ->> 'motif' from public._resultat_2710_doublons where annonce_id = v_xe_ann) = 'fiche_pas_intacte'
    and (select (resultat ->> 'ventes')::int from public._resultat_2710_doublons where annonce_id = v_xe_ann) = 1
    and (select inventaire_id from public.annonces_plateforme where id = v_xe_ann) = v_xe_dbl
    and (select fusionne_dans from public.inventaire where id = v_xe_dbl) is null,
    (select resultat::text from public._resultat_2710_doublons where annonce_id = v_xe_ann));
  insert into _r values ('R5 Johan : à signaler (fiche créée par la personne), rien écrit',
    (select resultat ->> 'motif' from public._resultat_2710_doublons where annonce_id = v_jo_ann) = 'fiche_pas_nee_du_releve'
    and (select inventaire_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_autre, null);
  select count(*), count(*) filter (where (resultat ->> 'ok')::boolean) into n, n2 from public._resultat_2710_doublons;
  insert into _r values ('R6 parc : 4 paires, 1 résorbée, 3 à signaler', n = 4 and n2 = 1, n || ' / ' || n2);

  select count(*) into v_inv_avant from public.inventaire where user_id in (v_nico, v_xewer, v_johan);
  select count(*) into v_jobs_avant from public.cross_post_jobs where user_id in (v_nico, v_xewer, v_johan);

  -- I1. Le geste de Nico rejoué : « Importer » sur l'annonce de son propre dépôt → la fiche d'origine, jamais une neuve.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  r := public.rapprocher_importer(v_nico, v_nico_ann, 'utilisateur');
  insert into _r values ('I1 personne, dépôt PUBLIÉ : rattachée à 1793009407689006 et à son dépôt, aucune fiche neuve',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_nico_fiche and (r ->> 'job_id')::uuid = v_nico_depot
    and (select inventaire_id from public.annonces_plateforme where id = v_nico_ann) = v_nico_fiche, r::text);

  -- I2. XEWER rejoué : le moteur importe l'annonce d'un dépôt VENDU → la fiche vendue, son dépôt ; rien retiré.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_xe_ann;
  r := public.rapprocher_importer(v_xewer, v_xe_ann, 'rapprochement');
  insert into _r values ('I2 moteur, dépôt VENDU : rattachée à la fiche vendue et à son dépôt, aucun job neuf',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_xe_fiche and (r ->> 'job_id')::uuid = v_xe_depot
    and (select status from public.cross_post_jobs where id = v_xe_depot) = 'sold', r::text);

  -- I3. Johan rejoué : le moteur rattache par la photo à une AUTRE fiche → l'identifiant l'emporte.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_jo_ann;
  v_id := public.rapprochement_attacher(v_jo_ann, v_jo_autre, 'photo_identique', '{}'::jsonb);
  insert into _r values ('I3 photo vers une autre fiche : refusée (NULL), l''annonce rejoint la fiche de son dépôt',
    v_id is null and (select inventaire_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_fiche
    and (select job_id from public.annonces_plateforme where id = v_jo_ann) = v_jo_depot, coalesce(v_id::text, 'null'));

  -- I4. Le moteur vers la MÊME fiche que le dépôt : il reçoit le job du dépôt, pas un job de suivi.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  v_id := public.rapprochement_attacher(v_nico_ann, v_nico_fiche, 'photo_identique', '{}'::jsonb);
  insert into _r values ('I4 photo vers la fiche du dépôt : le job du dépôt', v_id = v_nico_depot, coalesce(v_id::text, 'null'));

  insert into _r values ('I5 aucune fiche ni aucun job créés par I1-I4',
    (select count(*) from public.inventaire where user_id in (v_nico, v_xewer, v_johan)) = v_inv_avant
    and (select count(*) from public.cross_post_jobs where user_id in (v_nico, v_xewer, v_johan)) = v_jobs_avant, null);

  -- I6. Sans dépôt qui la porte : l'import d'avant, inchangé (fiche neuve).
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_nico, 'depop', 'essai-2710-sans-depot-3999999995', 'https://www.depop.com/products/essai-2710-sans-depot-3999999995/', 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  r := public.rapprocher_importer(v_nico, v_id, 'utilisateur');
  insert into _r values ('I6 sans dépôt : fiche neuve comme avant (aucune régression)',
    (r ->> 'decision') = 'import' and exists (select 1 from public.inventaire where id = (r ->> 'inventaire_id')::bigint and origine = 'releve_depop'), r::text);

  -- I7. Dépôt ANNULÉ sur une fiche EN STOCK : un job de suivi (règle du 25/09).
  select c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id into v_job
    from public.cross_post_jobs c join public.inventaire i on i.id = c.inventaire_id and i.statut = 'stock' and i.fusionne_dans is null
   where c.platform = 'leboncoin' and c.action = 'publish' and c.status = 'cancelled' and c.platform_listing_id ~ '^[0-9]{9,}$'
     and not (coalesce(c.platform_fields, '{}'::jsonb) ? 'detache_le') and coalesce(c.platform_fields ->> 'source', '') <> 'releve'
     and not exists (select 1 from public.annonces_plateforme a where a.user_id = c.user_id and a.platform = 'leboncoin' and a.listing_id = c.platform_listing_id)
     and not exists (select 1 from public.cross_post_jobs p where p.user_id = c.user_id and p.platform = 'leboncoin' and p.status = 'published'
                      and btrim(p.platform_listing_id) = c.platform_listing_id)
   order by c.created_at desc limit 1;
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_job.user_id, 'leboncoin', v_job.platform_listing_id, 'https://www.leboncoin.fr/ad/essai/' || v_job.platform_listing_id, 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  r := public.rapprocher_importer(v_job.user_id, v_id, 'rapprochement');
  insert into _r values ('I7 dépôt annulé, fiche en stock : rattachée avec un job de suivi publié',
    (r ->> 'decision') = 'attache' and (r ->> 'inventaire_id')::bigint = v_job.inventaire_id and (r ->> 'job_id')::uuid <> v_job.id
    and (select status || '|' || (platform_fields ->> 'source') from public.cross_post_jobs where id = (r ->> 'job_id')::uuid) = 'published|releve', r::text);

  -- I8. Une annonce que la PERSONNE a détachée de la fiche du dépôt n'y revient pas par la règle.
  update public.annonces_plateforme set inventaire_id = null, job_id = null, source_rapprochement = null where id = v_nico_ann;
  insert into public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
  values (v_nico, v_nico_ann, v_nico_fiche, 'detache', 'utilisateur', '{"essai": "2710"}'::jsonb);
  r := public.annonce_rattacher_par_identifiant(v_nico_ann, 'essai');
  insert into _r values ('I8 détachée par la personne : la règle s''abstient', r is null, coalesce(r::text, 'null'));
end $$;
-- P. Coût : la règle sur le plus gros compte (en jobs), sans correspondance, 20 fois.
do $$
declare v_user uuid; v_n bigint; v_id uuid; t0 timestamptz; v_ms numeric; r jsonb;
begin
  select user_id, count(*) into v_user, v_n from public.cross_post_jobs group by 1 order by 2 desc limit 1;
  insert into public.annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (v_user, 'leboncoin', '3999999996', 'https://www.leboncoin.fr/ad/essai/3999999996', 'Essai 27/10', 'en_ligne', now())
  returning id into v_id;
  t0 := clock_timestamp();
  for i in 1..20 loop r := public.annonce_rattacher_par_identifiant(v_id, 'essai'); end loop;
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  insert into _r values ('P1 la règle sur le plus gros compte < 20 ms par annonce', r is null and v_ms < 20, v_n || ' jobs, ' || round(v_ms, 2) || ' ms par appel');
end $$;
do $$
begin
  insert into _r values ('M1 aucun retrait armé, aucun dépôt, aucune vente écrite',
    (select count(*) from public.cross_post_jobs where created_at >= now() and action in ('delete', 'republish')) = 0
    and (select count(*) from public.cross_post_jobs where created_at >= now() and coalesce(platform_fields ->> 'source', '') <> 'releve') = 0
    and (select count(*) from public.ventes where created_at >= now()) = 0, null);
  insert into _r values ('M2 aucun mail', (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) || '/' || count(*) as verts from _r;
