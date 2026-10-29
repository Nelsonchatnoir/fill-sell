-- Essai de 20261029200000 (29/10, lot B 4.5/4.9) — tests APRÈS la migration, assemblés par 20261029200000_generer.sh
-- (transaction annulée). Sur les vraies lignes ; les constats « page 404 » d'essai sont posés dans la transaction.
do $tests$
declare
  v_xewer uuid := 'abd12bb5-2899-4bd2-a394-02dc6763f3cc';
  v_l634 uuid := '22362f3a-86fe-4eb3-a986-ef4569f6d89f';
  v_l711 uuid := 'ef037533-8fc0-4997-b436-3c562f3256a5';
  v_polly uuid := '4cdadbc1-886e-4af1-a40c-37bfa2f805ff';
  v_louis uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  v_xu uuid := 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
  v_av jsonb := (select v from _avant limit 1);
  c record; j record; b jsonb; t0 timestamptz; v_ms numeric; v_plan jsonb;
  v_xmin_avant text; v_xmin_apres text; n_jobs_avant integer; v_def text;
begin
  -- A. Ce que la règle d'AVANT (prod) disait des quatre, sur les mêmes relevés.
  -- Polly n'est pas jugée ce jour-là (le relevé précédent du compte est antérieur à son dépôt + 7 jours) : c'est le
  -- relevé du 24/10 (grâce de 72 h) qui l'avait dite « jamais en ligne » ; voir N4 et N4b.
  insert into _r values ('A1 AVANT (prod) : les 3 dépôts du 4.5 jugés « failed » sur le même relevé (louis-seller : page 60 < index 253)',
    (select count(*) from jsonb_array_elements(v_av -> 'cas') x where x ->> 'status' = 'failed' and x ->> 'id' <> v_polly::text) = 3,
    (select string_agg((x ->> 'id')::text || '=' || (x ->> 'status') || ' « ' || left(coalesce(x ->> 'error', ''), 70) || '… »', ' | ') from jsonb_array_elements(v_av -> 'cas') x)
    || ' || bilans : ' || (select string_agg((x ->> 'user') || ' refusées ' || (x #>> '{bilan,refusees}') || ', en attente ' || (x #>> '{bilan,en_attente}'), ' | ') from jsonb_array_elements(v_av -> 'bilans') x));

  -- C. Corps, droits.
  insert into _r values ('C1 droits : trois fonctions nouvelles {postgres, service_role} ; trancher inchangé',
    (select bool_and(proacl::text = '{postgres=X/postgres,service_role=X/postgres}') from pg_proc
      where oid in ('public.releve_beebs_voit_tout_en_ligne(uuid)'::regprocedure,
                    'public.beebs_preuve_jamais_en_ligne(uuid,text,timestamp with time zone,numeric,jsonb,uuid)'::regprocedure,
                    'public.beebs_message_jamais_en_ligne(jsonb,boolean,text)'::regprocedure,
                    'public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)),
    null);
  v_def := regexp_replace(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure), '--[^\n]*', '', 'g');
  insert into _r values ('C2 hors Beebs, le texte du motif est celui d''avant ; plus « Sept jours après le dépôt » ; un seul juge appelé',
    v_def ~ 'v_msg := ''Cette annonce est absente de tes annonces '' \|\| v_nom\s+\|\| '' aux relevés complets du '''
    and v_def !~ 'Sept jours après le dépôt' and (length(v_def) - length(replace(v_def, 'beebs_preuve_jamais_en_ligne(', ''))) / length('beebs_preuve_jamais_en_ligne(') = 1,
    md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)));

  -- R. Le miroir de releveVoitToutEnLigne sur les relevés réels.
  insert into _r values ('R1 relevé de XEWER (page = index) : la page a tout vu ; louis-seller (page 60 < index) : jamais ; relevé inconnu : jamais',
    public.releve_beebs_voit_tout_en_ligne((select run from _runs where user_id = v_xu))
    and not public.releve_beebs_voit_tout_en_ligne((select run from _runs where user_id = v_louis))
    and not public.releve_beebs_voit_tout_en_ligne(gen_random_uuid()),
    (select string_agg(r.user_id::text || ' : ' || substring(r.erreur from 'page : \d+ annonce\(s\) affichée\(s\)') || ' / ' || substring(r.erreur from 'index public Beebs : \d+'), ' | ')
       from public.vinted_sync_runs r where r.id in (select run from _runs)));

  -- N. La règle nouvelle, mêmes relevés.
  select count(*) into n_jobs_avant from public.cross_post_jobs where user_id in (v_louis, v_xu) and created_at >= now();
  for c in select * from _runs loop
    t0 := clock_timestamp();
    b := public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run);
    insert into _bilans values ('nouvelle', c.user_id, b || jsonb_build_object('ms', round(extract(epoch from clock_timestamp() - t0) * 1000)));
  end loop;
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_xewer;
  insert into _r values ('N1 XEWER 34198358 (compte de 31 annonces, la page les a toutes vues) : « failed », preuve « relevé », message vrai et daté',
    j.status = 'failed' and j.pf #>> '{depot_jamais_en_ligne,preuve,source}' = 'releve'
    and j.error ~ '^Beebs a reçu ton annonce \(n° 34198358, en vérification à \d\dh\d\d le 19/10\), puis l''a retirée de sa vérification '
    and j.error ~ 'Beebs ne dit pas pourquoi\. Le relevé fait à \d\dh\d\d le \d\d/\d\d, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne\.'
    and j.error !~ 'refusée|serait refusé',
    j.error);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l634;
  insert into _r values ('N2 louis-seller 34200634 (page 60 < index 253) : reste « publiée », « pas encore visible » posé, aucun rouge',
    j.status = 'published' and j.error is null and j.pf #>> '{pas_encore_visible,regle}' = 'beebs_sans_preuve_de_refus_2910'
    and j.pf #>> '{pas_encore_visible,numero}' = '34200634' and not (j.pf ? 'depot_jamais_en_ligne'),
    j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l711;
  insert into _r values ('N3 louis-seller 34200711 : idem', j.status = 'published' and j.error is null
    and j.pf #>> '{pas_encore_visible,regle}' = 'beebs_sans_preuve_de_refus_2910', j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_polly;
  insert into _r values ('N4 Polly 34206489 (EN LIGNE le 28/10 à 22:03) : jamais « refusée » — publiée, son marqueur du 20/10 gardé tel quel',
    j.status = 'published' and j.error is null and j.pf #>> '{pas_encore_visible,regle}' = 'sortie_de_verification_2510',
    j.status || ' ' || coalesce(j.pf ->> 'pas_encore_visible', '∅'));
  insert into _r values ('N4b Polly : le relevé de louis-seller, « complet » pour l''ancienne règle (index), n''est JAMAIS une preuve pour la nouvelle',
    public.releve_preuve_absence((select run from _runs where user_id = v_louis))
    and public.beebs_preuve_jamais_en_ligne(v_louis, '34206489', '2026-10-20T21:51:59.769Z'::timestamptz, 10, j.pf, (select run from _runs where user_id = v_louis)) is null,
    null);
  insert into _r values ('N5 bilans de la nouvelle règle (refusées / en attente / Beebs sans preuve / ms)', true,
    (select string_agg(user_id::text || ' : ' || (bilan ->> 'refusees') || ' / ' || (bilan ->> 'en_attente') || ' / ' || coalesce(bilan ->> 'beebs_sans_preuve', '?') || ' / ' || (bilan ->> 'ms') || ' ms', ' | ') from _bilans));

  -- Le même relevé relu : aucune ligne réécrite.
  select string_agg(id::text || xmin::text, ',' order by id) into v_xmin_avant from public.cross_post_jobs where user_id in (v_louis, v_xu) and platform = 'beebs';
  for c in select * from _runs loop perform public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run); end loop;
  select string_agg(id::text || xmin::text, ',' order by id) into v_xmin_apres from public.cross_post_jobs where user_id in (v_louis, v_xu) and platform = 'beebs';
  insert into _r values ('N6 le même relevé relu : aucun job Beebs des deux comptes réécrit', v_xmin_avant = v_xmin_apres, null);

  -- La seconde preuve : deux constats « page 404 » (en vérification lue en entier) à 7 h d'écart, 8 jours après le dépôt.
  update public.cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('beebs_404_constats', jsonb_build_array(
      jsonb_build_object('le', '2026-10-28T10:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T17:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete')))
   where id = v_l634;
  -- … à 3 h d'écart seulement ; et « en vérification » non lue : jamais une preuve de refus.
  update public.cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('beebs_404_constats', jsonb_build_array(
      jsonb_build_object('le', '2026-10-28T10:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T13:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'complete'),
      jsonb_build_object('le', '2026-10-28T20:00:00.000Z', 'page_http', 404, 'produit', false, 'en_verification', 'non_lue')))
   where id = v_l711;
  t0 := clock_timestamp();
  perform public.trancher_publications_sans_lien(v_louis, 'beebs', (select run from _runs where user_id = v_louis));
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l634;
  insert into _r values ('N7 34200634 + deux constats 404 à 7 h d''écart (8 jours après) : « failed », preuve « constats_404 », heure de sortie jamais devinée',
    j.status = 'failed' and j.pf #>> '{depot_jamais_en_ligne,preuve,source}' = 'constats_404'
    and j.error ~ '^Beebs a reçu ton annonce \(n° 34200634, en vérification à 03h02 le 20/10\), puis l''a retirée de sa vérification sans la mettre en ligne ; Beebs ne dit pas pourquoi\. Sa page est introuvable \(404\) à 11h00 le 28/10 et encore à 18h00 le 28/10, et elle n''est plus dans tes annonces en vérification : Beebs n''a jamais mis cette annonce en ligne\.',
    j.error);
  select status, error, platform_fields pf into j from public.cross_post_jobs where id = v_l711;
  insert into _r values ('N8 34200711 + constats à 3 h d''écart (et un « en vérification » non lue) : toujours publiée', j.status = 'published', j.status);
  insert into _r values ('N9 durée de la règle sur le compte de louis-seller (relevé + 2 dépôts jugés)', v_ms < 2000, v_ms || ' ms');
  -- 500 € et plus : jamais jugée (Beebs les examine invisibles), même avec deux constats.
  insert into _r values ('N10 999 € : jamais une preuve, même avec deux constats 404',
    public.beebs_preuve_jamais_en_ligne(v_louis, '34200634', '2026-10-20T01:02:44Z'::timestamptz, 999, '{}'::jsonb, null) is null
    and public.beebs_preuve_jamais_en_ligne(v_louis, '34200634', '2026-10-20T01:02:44Z'::timestamptz, 1.5, '{}'::jsonb, null) ->> 'source' = 'constats_404', null);

  -- M. Le message : à l'octet près celui de messageRefusVerificationBeebs (mêmes entrées, sorties du JS le 29/10).
  insert into _r values ('M1 message SQL = message JS (relevé)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34198358', 'le', '2026-10-29T16:18:31Z',
      'vu_en_verification_le', '2026-10-19T16:09:07Z', 'sortie_constatee_le', '2026-10-19T16:12:30Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34198358, en vérification à 18h09 le 19/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 18h12 le 19/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h18 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M2 message SQL = message JS (constats 404)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'constats_404', 'numero', '34200634', 'le', '2026-10-28T17:00:00Z', 'premier', '2026-10-28T10:00:00Z',
      'vu_en_verification_le', '2026-10-20T01:02:40Z', 'sortie_constatee_le', '2026-10-20T03:32:40Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34200634, en vérification à 03h02 le 20/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 05h32 le 20/10) ; Beebs ne dit pas pourquoi. Sa page est introuvable (404) à 11h00 le 28/10 et encore à 18h00 le 28/10, et elle n''est plus dans tes annonces en vérification : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M3 message SQL = message JS (republication)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34206489', 'le', '2026-10-29T16:17:35Z',
      'vu_en_verification_le', '2026-10-20T21:51:59Z', 'sortie_constatee_le', '2026-10-23T21:51:59Z'), true, null)
    = 'Beebs a reçu ta nouvelle annonce (n° 34206489, en vérification à 23h51 le 20/10), puis l''a retirée de sa vérification sans la mettre en ligne (elle n''y était plus à 23h51 le 23/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. L''ancienne annonce avait été retirée : ton article n''est plus en ligne sur Beebs. Rien n''est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).', null);
  insert into _r values ('M4 message SQL = message JS (sans vue en vérification ; sortie dite par son heure)',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200711', 'le', '2026-10-29T16:17:35Z'), false, null)
    = 'Beebs a reçu ton annonce (n° 34200711), puis l''a retirée de sa vérification sans la mettre en ligne ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n''a jamais mis cette annonce en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).'
    and public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200712', 'le', '2026-10-29T16:17:35Z',
      'vu_en_verification_le', '2026-10-20T01:02:40Z', 'sortie_constatee_le', '2026-10-20T01:02:50Z'), false, null)
    ~ 'sans la mettre en ligne \(elle n''y était plus à 03h02 le 20/10\) ; Beebs ne dit pas pourquoi\.', null);
  insert into _r values ('M5 la photo en double se dit après la preuve, avant « Rien n''est en ligne »',
    public.beebs_message_jamais_en_ligne(jsonb_build_object('source', 'releve', 'numero', '34200711', 'le', '2026-10-29T16:17:35Z'), false, '34199999')
    ~ 'ne la montre pas : Beebs n''a jamais mis cette annonce en ligne\. Elle porte la même photo que ton annonce 34199999, déjà en ligne sur Beebs\. Rien n''est en ligne', null);

  -- P. Ce que coûtent les deux lectures de la preuve (compte de louis-seller, le plus gros des quatre).
  execute format('explain (analyze, buffers, format json) select min(_ts_ou_null(x.l ->> ''lu_le'')) from public.cross_post_jobs o
      cross join lateral (values (o.platform_fields #> ''{preuve_identifiant_beebs,avant}''), (o.platform_fields #> ''{preuve_identifiant_beebs,apres}'')) x(l)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(x.l -> ''pages'') = ''array'' then x.l -> ''pages'' else ''[]''::jsonb end) pg(p)
     where o.user_id = %L and o.created_at >= %L::timestamptz and o.platform = ''beebs'' and o.action in (''publish'', ''republish'')
       and o.platform_fields ? ''preuve_identifiant_beebs'' and pg.p ->> ''ok'' = ''true'' and jsonb_typeof(pg.p -> ''ids'') = ''array''
       and (pg.p -> ''ids'') ? ''34200634''', v_louis, '2026-10-19T01:02:44Z') into v_plan;
  insert into _r values ('P1 lecture des vues « en vérification » (louis-seller, dépôts depuis le 19/10) < 50 ms',
    (v_plan -> 0 ->> 'Execution Time')::numeric < 50, (v_plan -> 0 ->> 'Execution Time') || ' ms, ' || (v_plan -> 0 -> 'Plan' ->> 'Node Type'));
  execute format('explain (analyze, buffers, format json) select count(*) from public.cross_post_jobs o
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.platform_fields -> ''beebs_404_constats'') = ''array'' then o.platform_fields -> ''beebs_404_constats'' else ''[]''::jsonb end) e
     where o.user_id = %L and o.created_at >= %L::timestamptz and o.platform = ''beebs'' and o.platform_fields ? ''beebs_404_constats''
       and (btrim(coalesce(o.platform_listing_id, '''')) = ''34200634'' or annonce_id_job(''beebs'', o.listing_url) = ''34200634'')', v_louis, '2026-10-19T01:02:44Z') into v_plan;
  insert into _r values ('P2 lecture des constats 404 du numéro (louis-seller) < 50 ms',
    (v_plan -> 0 ->> 'Execution Time')::numeric < 50, (v_plan -> 0 ->> 'Execution Time') || ' ms');

  -- X. Rien d'autre.
  insert into _r values ('X1 aucun job créé par les jugements, aucun mail',
    (select count(*) from public.cross_post_jobs where user_id in (v_louis, v_xu) and created_at >= now()) = n_jobs_avant
    and (select count(*) from public.email_logs where sent_at >= now()) = 0, null);
end
$tests$;
