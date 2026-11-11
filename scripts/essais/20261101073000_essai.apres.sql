-- Contrôles de l'essai à blanc de 20261101073000, découpés par 20261101073000_generer.sh (marqueurs « -- § »).
-- §réparation
do $apres$
begin
  insert into _r select 'T5 réparation : 123 neutralisées (boutique-8ac5bbda 106, COMPTE-CAE7A20D 17)',
    count(*) = 123 and count(*) filter (where user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') = 106
      and count(*) filter (where user_id = 'cae7a20d-56c8-46a6-868c-ae1f885faa70') = 17
      and bool_and(not metadata ? 'question') and bool_and(metadata ? 'neutralisee'),
    count(*)::text from usage_logs where feature = 'vente_vinted_article_inconnu_ancienne';
  insert into _r select 'T5 réparation : les 2 de boutique-essai-4 gardées', count(*) = 2, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu' and user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b'
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz;
  insert into _r select 'T5 réparation : ventes des trois comptes identiques à l''octet',
    (select h from _ventes_avant) = md5(string_agg(row(v.*)::text, '|' order by v.id)), count(*)::text
    from ventes v where v.user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b');
end
$apres$;
-- §fin réparation
-- §inverse réparation
do $rinv$
begin
  insert into _r select 'T6 inverse de la réparation : 125 questions revenues, sauvegarde retirée',
    count(*) = 125 and to_regclass('public._backup_0111_questions_article_inconnu') is null, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu'
     and user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz and created_at < '2026-11-01 03:00:00 Europe/Paris'::timestamptz;
end
$rinv$;
-- §fin inverse réparation
-- §inverse migration
do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : vente_vinted_lot_eclater revenue à la prod (md5 00383597…), règle retirée',
    md5(pg_get_functiondef('public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure)) = '003835978f4e9578e222bc87f5913560'
      and to_regprocedure('public.question_article_inconnu_due(timestamptz,timestamptz)') is null, null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
