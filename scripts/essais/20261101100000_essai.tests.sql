-- Tests de 20261101100000 (lot Vinted : parts égales quand une base manque), rejoués DANS la transaction de l'essai
-- puis ROLLBACK. L'AVANT (l'ancienne règle sur les 1 518 lots du parc) est pris avant la migration (§avant).
-- §avant
create temp table _r (essai text, ok boolean, detail text) on commit drop;
create temp table _avant on commit drop as
select c.user_id, c.commande_ref, p.item_id, p.prix, p.source
  from (select distinct user_id, commande_ref from vinted_commandes_articles where nb_articles > 1) c,
       lateral public.vinted_lot_parts(c.user_id, c.commande_ref) p;
-- §fin avant
-- §tests
do $t$
declare n int; m int; d text; r jsonb;
begin
  -- P1. Sur tout le parc : rien ne change là où l'ancienne règle donnait un prix (Vinted, prorata, reste, saisie).
  select count(*), count(*) filter (where a.prix is not distinct from b.prix and a.source is not distinct from b.source)
    into n, m
    from _avant a join (select c.user_id, c.commande_ref, p.item_id, p.prix, p.source
                          from (select distinct user_id, commande_ref from vinted_commandes_articles where nb_articles > 1) c,
                               lateral public.vinted_lot_parts(c.user_id, c.commande_ref) p) b
      on b.user_id = a.user_id and b.commande_ref = a.commande_ref and b.item_id = a.item_id
   where a.prix is not null;
  insert into _r values ('P1 parc : chaque prix déjà calculé est identique (prix et source)', n > 0 and n = m, format('%s/%s', m, n));

  -- P2. Sur tout le parc : là où l'ancienne règle rendait NULL avec un total connu et sans saisie sans prix, chaque
  --     article a maintenant sa part, et chaque lot retombe sur son reste au centime.
  select count(*), count(*) filter (where b.prix is not null and b.source = 'parts_egales')
    into n, m
    from _avant a
    join (select c.user_id, c.commande_ref, p.item_id, p.prix, p.source
            from (select distinct user_id, commande_ref from vinted_commandes_articles where nb_articles > 1) c,
                 lateral public.vinted_lot_parts(c.user_id, c.commande_ref) p) b
      on b.user_id = a.user_id and b.commande_ref = a.commande_ref and b.item_id = a.item_id
   where a.prix is null and a.source is null
     and (select max(x.total) from vinted_commandes_articles x where x.user_id = a.user_id and x.commande_ref = a.commande_ref) > 0
     and not exists (select 1 from _avant s where s.user_id = a.user_id and s.commande_ref = a.commande_ref and s.source = 'saisie');
  insert into _r values ('P2 parc : chaque article sans base a sa part (parts_egales)', n > 0 and n = m, format('%s/%s', m, n));
  select count(*) into n from (
    select c.user_id, c.commande_ref, max(x.total) total, sum(p.prix) s, bool_or(p.source = 'saisie') saisie, bool_or(p.source = 'vinted') vinted
      from (select distinct user_id, commande_ref from vinted_commandes_articles where nb_articles > 1) c
      join vinted_commandes_articles x on x.user_id = c.user_id and x.commande_ref = c.commande_ref,
           lateral (select * from public.vinted_lot_parts(c.user_id, c.commande_ref) q where q.item_id = x.item_id) p
     group by c.user_id, c.commande_ref) z
   where z.total > 0 and not z.saisie and not z.vinted and z.s is distinct from z.total;
  insert into _r values ('P2 parc : sans saisie ni montant Vinted, chaque lot à total connu retombe sur son total', n = 0, n::text);

  -- P3. Un lot de 3 articles inconnus à 10 € (compte de Nico, numéros fictifs) : 3,34 + 3,33 + 3,33, premier d'abord.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901201', '99999901211', 1, 3, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901201', '99999901212', 2, 3, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901201', '99999901213', 3, 3, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 'releve');
  select string_agg(prix::text || '/' || source, ' ' order by item_id) into d
    from public.vinted_lot_parts('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901201');
  insert into _r values ('P3 lot 10 € / 3 : 3.34 + 3.33 + 3.33 (parts_egales)',
    d = '3.34/parts_egales 3.33/parts_egales 3.33/parts_egales', d);
  -- P4. Le découpage écrit ces parts dans les ventes (somme = 10 €), sans question (vente ancienne).
  r := public.vente_vinted_lot_eclater('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901201', 'releve');
  select string_agg(prix_vente::text, ' ' order by commande_ref) into d from ventes
   where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and split_part(commande_ref, ':', 1) = '99999901201';
  insert into _r values ('P4 découpage : ventes 3.34 3.33 3.33', r ->> 'issue' = 'eclatee' and d = '3.34 3.33 3.33', coalesce(d, r::text));
  -- P5. Total inconnu : NULL, jamais 0.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901202', '99999901214', 1, 2, 'completed', true, null, 'EUR', '2025-09-01 10:00:00+00', 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901202', '99999901215', 2, 2, 'completed', true, null, 'EUR', '2025-09-01 10:00:00+00', 'releve');
  select count(*) into n from public.vinted_lot_parts('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901202') where prix is null;
  insert into _r values ('P5 total inconnu : NULL (jamais 0)', n = 2, n::text);
  -- P6. Montant Vinted par article : tel quel.
  insert into vinted_commandes_articles (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total, devise, commande_le, prix_vinted, source)
  values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901203', '99999901216', 1, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 7.5, 'releve'),
         ('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901203', '99999901217', 2, 2, 'completed', true, 10, 'EUR', '2025-09-01 10:00:00+00', 2.5, 'releve');
  select string_agg(prix::text || '/' || source, ' ' order by item_id) into d
    from public.vinted_lot_parts('f44b5917-bccc-4431-ba41-f40571a2ed18', '99999901203');
  insert into _r values ('P6 montant Vinted : 7.50 + 2.50 (vinted)', d = '7.50/vinted 2.50/vinted', d);
end
$t$;

-- R0. Avant la réparation des 34 lots : le chiffre d'affaires des deux comptes.
create temp table _ca0 on commit drop as
select user_id, sum(prix_vente) ca, count(*) n from ventes
 where user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70') group by user_id;
-- §fin tests
-- §apres reparation
do $rep$
declare n int; m int;
begin
  insert into _r select 'R1 CA the_closet72 = avant le découpage (+ 397,90 €)', a.ca + 397.90 = sum(v.prix_vente) and a.n = count(v.id),
    format('%s → %s (%s ventes)', a.ca, sum(v.prix_vente), count(v.id))
    from _ca0 a join ventes v on v.user_id = a.user_id where a.user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a' group by a.ca, a.n;
  insert into _r select 'R1 CA PILOU = avant le découpage (+ 91,30 €)', a.ca + 91.30 = sum(v.prix_vente) and a.n = count(v.id),
    format('%s → %s (%s ventes)', a.ca, sum(v.prix_vente), count(v.id))
    from _ca0 a join ventes v on v.user_id = a.user_id where a.user_id = 'cae7a20d-56c8-46a6-868c-ae1f885faa70' group by a.ca, a.n;
  -- La réparation pose exactement ce que la règle neuve calcule pour ces 34 lots.
  select count(*), count(*) filter (where v.prix_vente = p.prix and c.prix_part = p.prix)
    into n, m
    from (select distinct user_id, commande_ref from public._backup_0111_lots_parts_egales_compositions) l
    cross join lateral public.vinted_lot_parts(l.user_id, l.commande_ref) p
    join vinted_commandes_articles c on c.user_id = l.user_id and c.commande_ref = l.commande_ref and c.item_id = p.item_id
    join ventes v on v.id = c.vente_id;
  insert into _r values ('R2 réparation = la règle neuve, article par article (123)', n = 123 and m = 123, format('%s/%s', m, n));
  select count(*) into n from ventes v join public._backup_0111_lots_parts_egales_compositions c on c.user_id = v.user_id
   where v.plateforme_code = 'vinted' and v.commande_ref = c.commande_ref;
  insert into _r values ('R3 aucune ligne « Lot » revenue (rien compté deux fois)', n = 0, n::text);
end
$rep$;
-- §fin apres reparation
-- §apres inverse reparation
do $rinv$
begin
  insert into _r select 'R4 inverse de la réparation : CA rendu, sauvegardes retirées',
    bool_and(a.ca = (select sum(v.prix_vente) from ventes v where v.user_id = a.user_id))
      and to_regclass('public._backup_0111_lots_parts_egales_ventes') is null, null from _ca0 a;
end
$rinv$;
-- §fin apres inverse reparation
-- §inverse migration
do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : vinted_lot_parts revenue à la prod (md5 a79190d3…)',
    md5(pg_get_functiondef('public.vinted_lot_parts(uuid,text)'::regprocedure)) = 'a79190d317b946eff0bd82b9b43cb14d', null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
