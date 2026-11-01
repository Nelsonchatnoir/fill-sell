-- Tests de 20261101073000 (question « retire-le ailleurs » : vente récente seulement), rejoués DANS la transaction de
-- l'essai puis ROLLBACK. Deux commandes fictives (numéros 9999990110x, articles 9999990111x) sur le compte de Nico
-- (f44b5917…) : un lot vendu le 01/09/2025, lu maintenant ; un lot vendu il y a 2 h. Puis la réparation des 123
-- questions de la nuit et son inverse, rejoués eux aussi.
create temp table _r (essai text, ok boolean, detail text) on commit drop;

do $t$
declare r jsonb; n int; q int; d text;
begin
  insert into _r values
    ('T1 vendue il y a 1 h : question', public.question_article_inconnu_due(now() - interval '1 hour'), null),
    ('T1 vendue il y a 47 h : question', public.question_article_inconnu_due(now() - interval '47 hours'), null),
    ('T1 vendue il y a 49 h : aucune', not public.question_article_inconnu_due(now() - interval '49 hours'), null),
    ('T1 date inconnue : aucune', not public.question_article_inconnu_due(null), null),
    ('T1 the_closet72 (04/09/2025 lue le 01/11) : aucune',
       not public.question_article_inconnu_due('2025-09-04 16:09:20+00', '2026-10-31 23:45:29+00'), null),
    ('T1 nadegemarcelin78 (31/10 07:36 lue le 01/11 00:28) : question',
       public.question_article_inconnu_due('2026-10-31 06:36:32+00', '2026-10-31 23:28:40+00'), null),
    ('T2 eclater appelle la règle, une seule fois',
       (select (length(prosrc) - length(replace(prosrc, 'question_article_inconnu_due(v_le)', '')))
               / length('question_article_inconnu_due(v_le)') = 1
          from pg_proc where oid = 'public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure), null);

  -- T3. Lot ancien, deux articles inconnus de FillSell : deux ventes normales, aucune question, aucune note.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', '99999901111', 1, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', '99999901112', 2, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve');
  r := public.vente_vinted_lot_eclater('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901101', 'releve');
  select count(*) into n from ventes where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and split_part(commande_ref, ':', 1) = '99999901101'
     and inventaire_id is null and statut = 'vendu' and date = '2025-09-01' and source = 'releve';
  select count(*) into q from usage_logs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and feature = 'vente_vinted_article_inconnu' and metadata ->> 'commande' = '99999901101';
  select string_agg(decision, ',' order by item_id) into d from vinted_commandes_articles
   where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and commande_ref = '99999901101';
  insert into _r values ('T3 lot ancien : 2 ventes au 01/09/2025, 0 question, décisions article_inconnu, aucune note',
    r ->> 'issue' = 'eclatee' and n = 2 and q = 0 and d = 'article_inconnu,article_inconnu' and r ->> 'note' is null,
    format('issue=%s ventes=%s questions=%s decisions=%s', r ->> 'issue', n, q, d));

  -- T4. Lot récent (il y a 2 h), mêmes conditions : la question est posée pour chaque article, comme avant.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', '99999901113', 1, 2, 'completed', true, 10, 'EUR', now() - interval '2 hours', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', '99999901114', 2, 2, 'completed', true, 10, 'EUR', now() - interval '2 hours', 'releve');
  r := public.vente_vinted_lot_eclater('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901102', 'releve');
  select count(*) into n from ventes where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and split_part(commande_ref, ':', 1) = '99999901102' and inventaire_id is null and statut = 'vendu';
  select count(*) into q from usage_logs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     and feature = 'vente_vinted_article_inconnu' and metadata ->> 'commande' = '99999901102' and metadata ? 'question';
  insert into _r values ('T4 lot récent : 2 ventes, 2 questions (inchangé)', r ->> 'issue' = 'eclatee' and n = 2 and q = 2,
    format('issue=%s ventes=%s questions=%s', r ->> 'issue', n, q));
end
$t$;

-- T5. Avant la réparation des questions de la nuit : le périmètre et l'empreinte des ventes des trois comptes.
do $av$
begin
  insert into _r select 'T5 avant : 125 questions de la nuit', count(*) = 125, count(*)::text
    from usage_logs where feature = 'vente_vinted_article_inconnu'
     and user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')
     and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz and created_at < '2026-11-01 03:00:00 Europe/Paris'::timestamptz;
  create temp table _ventes_avant on commit drop as select md5(string_agg(row(v.*)::text, '|' order by v.id)) h, count(*) n
    from ventes v where v.user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b');
end
$av$;
