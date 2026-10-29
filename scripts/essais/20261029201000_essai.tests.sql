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
