-- Essai à blanc de 20261101100000_lot_vinted_parts_egales : ROLLBACK. Généré par 20261101100000_generer.sh.
begin;
set local statement_timeout = '300s';
-- §avant
create temp table _r (essai text, ok boolean, detail text) on commit drop;
create temp table _avant on commit drop as
select c.user_id, c.commande_ref, p.item_id, p.prix, p.source
  from (select distinct user_id, commande_ref from vinted_commandes_articles where nb_articles > 1) c,
       lateral public.vinted_lot_parts(c.user_id, c.commande_ref) p;
-- §fin avant
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261101100000 — UN LOT VINTED DÉCOUPÉ : CHAQUE ARTICLE REÇOIT SA PART DU PRIX DU LOT, MÊME SANS PRIX DE BASE (01/11)
-- Le cas (nuit du 31/10 au 01/11) : 34 lignes « Lot N articles » déjà en historique (the_closet72 27 lots, 397,90 € ;
-- PILOU 7 lots, 91,30 €) ont été découpées en 123 ventes d'article (règle du 17/10) ; aucun article n'avait de prix de
-- base (ni montant Vinted, ni annonce, ni fiche) : vinted_lot_parts rendait NULL pour chacun et le total du lot sortait
-- du chiffre d'affaires.
-- La règle (Nico, 01/11) : quand le prorata est impossible (une base manque), le reste du lot (total moins les prix
-- saisis gardés) est réparti à PARTS ÉGALES entre les articles restants, centimes au plus grand reste dans l'ordre de
-- la commande (le premier article d'abord) : somme = total du lot. Inchangé : montant Vinted par article tel quel ;
-- prorata des prix d'annonce quand toutes les bases sont connues ; prix saisi gardé ; total inconnu, ou reste inconnu
-- (une saisie sans prix), ou nul : NULL, jamais 0. Seul appelant : vente_vinted_lot_eclater (inchangée).
-- Fonction réécrite depuis pg_get_functiondef relu en production le 01/11 (md5 a79190d3…) ; seul le cas « base
-- manquante » change. Aucune donnée réécrite (les 34 lots de la nuit : scripts/reparations/20261101_lots_vinted_parts_egales.sql).
-- Inverse : supabase/rollbacks/20261101100000_lot_vinted_parts_egales_INVERSE.sql
-- Essai à blanc : scripts/essais/20261101100000_generer.sh → 20261101100000_essai.sql (ROLLBACK).
-- Application (feu vert NOMMÉ de Nico) : npx supabase db query --linked -f <ce fichier>
--   puis npx supabase migration repair --linked --status applied 20261101100000
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

do $garde$
begin
  if md5(pg_get_functiondef('public.vinted_lot_parts(uuid,text)'::regprocedure))
     is distinct from 'a79190d317b946eff0bd82b9b43cb14d' then
    raise exception 'définition de vinted_lot_parts changée en prod depuis le 01/11 : migration arrêtée, rien n''est écrit';
  end if;
end
$garde$;

CREATE OR REPLACE FUNCTION public.vinted_lot_parts(p_user uuid, p_ref text)
 RETURNS TABLE(item_id text, prix numeric, base numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids     text[];
  v_pv      numeric[];
  v_total   numeric;
  v_le      timestamptz;
  v_n       integer;
  v_k       integer;
  v_garde   numeric[];
  v_base    numeric[];
  v_prix    numeric[];
  v_src     text[];
  v_restants integer[] := '{}';
  v_vente   record;
  v_reste   numeric;
  v_reste_c bigint;
  v_somme   numeric;
  v_t       numeric;
  v_manque  integer := 0;
  v_alloue  bigint;
BEGIN
  SELECT array_agg(c.item_id ORDER BY c.position, c.item_id), array_agg(c.prix_vinted ORDER BY c.position, c.item_id),
         max(c.total), max(c.commande_le)
    INTO v_ids, v_pv, v_total, v_le
    FROM vinted_commandes_articles c
   WHERE c.user_id = p_user AND c.commande_ref = p_ref;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN RETURN; END IF;
  -- 1. Vinted donne le montant de chaque article : tel quel.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_pv) x WHERE x IS NULL OR x <= 0) THEN
    RETURN QUERY SELECT v_ids[k], round(v_pv[k], 2), NULL::numeric, 'vinted'::text FROM generate_series(1, v_n) AS k;
    RETURN;
  END IF;
  v_garde := array_fill(NULL::numeric, ARRAY[v_n]);
  v_base  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_prix  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_src   := array_fill(NULL::text, ARRAY[v_n]);
  -- 2a. Une vente déjà enregistrée SANS reçu de son annonce (saisie, confirmation
  --     de la personne) garde son prix ; celle d'un job (reçu) reçoit sa part.
  FOR v_k IN 1..v_n LOOP
    SELECT v.id, v.prix_vente INTO v_vente FROM ventes v
     WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = v_ids[v_k]
     ORDER BY v.id LIMIT 1;
    IF v_vente.id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM ventes_operations o
          WHERE o.user_id = p_user AND o.cle = 'annonce:vinted:' || v_ids[v_k]
            AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v_vente.id])) THEN
      v_src[v_k] := 'saisie';
      v_garde[v_k] := v_vente.prix_vente;
      v_prix[v_k] := v_vente.prix_vente;
    ELSE
      v_restants := v_restants || v_k;
    END IF;
  END LOOP;
  IF cardinality(v_restants) > 0 AND v_total IS NOT NULL AND v_total > 0 THEN
    IF EXISTS (SELECT 1 FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie' AND v_garde[k] IS NULL) THEN
      v_reste := NULL;                                   -- une saisie sans prix : le reste est inconnu
    ELSE
      v_reste := v_total - coalesce((SELECT sum(v_garde[k]) FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie'), 0);
    END IF;
    IF v_reste IS NOT NULL AND v_reste > 0 THEN
      IF cardinality(v_restants) = 1 THEN
        v_prix[v_restants[1]] := round(v_reste, 2);
        v_src[v_restants[1]] := 'reste';
      ELSE
        FOREACH v_k IN ARRAY v_restants LOOP
          v_t := coalesce(
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
                AND (v_le IS NULL OR s.captured_at <= v_le)
              ORDER BY s.captured_at DESC LIMIT 1),
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
              ORDER BY s.captured_at ASC LIMIT 1),
            (SELECT coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'detected_price')::numeric END,
                             j.price,
                             CASE WHEN j.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'prix_recreation')::numeric END,
                             CASE WHEN j.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields #>> '{republish_snapshot,prix}')::numeric END)
               FROM cross_post_jobs j
              WHERE j.user_id = p_user AND j.platform = 'vinted' AND j.action IN ('publish', 'republish')
                AND btrim(coalesce(j.platform_listing_id, '')) = v_ids[v_k]
              ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1),
            (SELECT i.prix_vente FROM inventaire i
              WHERE i.user_id = p_user AND i.vinted_item_id = v_ids[v_k] AND i.fusionne_dans IS NULL));
          IF v_t IS NULL OR v_t <= 0 THEN
            v_manque := v_manque + 1;
          ELSE
            v_base[v_k] := v_t;
          END IF;
        END LOOP;
        IF v_manque = 0 THEN
          v_somme := (SELECT sum(v_base[k]) FROM unnest(v_restants) AS k);
          v_reste_c := round(v_reste * 100);
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := floor(v_reste_c * v_base[v_k] / v_somme);
          END LOOP;
          v_alloue := (SELECT sum(v_prix[k]) FROM unnest(v_restants) AS k);
          FOR v_k IN
            SELECT k FROM unnest(v_restants) AS k
             ORDER BY (v_reste_c * v_base[k] / v_somme) - floor(v_reste_c * v_base[k] / v_somme) DESC,
                      length(v_ids[k]), v_ids[k]
             LIMIT greatest(v_reste_c - v_alloue, 0)
          LOOP
            v_prix[v_k] := v_prix[v_k] + 1;
          END LOOP;
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := v_prix[v_k] / 100.0;
            v_src[v_k] := 'prorata';
          END LOOP;
        ELSE
          -- (01/11, Nico) Une base manque : chaque article reçoit quand même sa part du lot, à PARTS ÉGALES entre
          -- ces articles, centimes au plus grand reste dans l'ordre de la commande, somme = total du lot. Le prix
          -- du lot ne sort jamais du chiffre d'affaires parce qu'un article n'a pas de prix de base.
          v_reste_c := round(v_reste * 100);
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := v_reste_c / cardinality(v_restants);        -- division entière (bigint)
          END LOOP;
          v_alloue := (v_reste_c / cardinality(v_restants)) * cardinality(v_restants);
          FOR v_k IN 1..(v_reste_c - v_alloue) LOOP
            v_prix[v_restants[v_k]] := v_prix[v_restants[v_k]] + 1;
          END LOOP;
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := v_prix[v_k] / 100.0;
            v_src[v_k] := 'parts_egales';
          END LOOP;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_ids[k], round(v_prix[k], 2), v_base[k], v_src[k] FROM generate_series(1, v_n) AS k;
END;
$function$;

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
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 01/11 — LES 34 LOTS VINTED DÉCOUPÉS À PRIX NULL CETTE NUIT : LE PRIX DU LOT À PARTS ÉGALES ENTRE SES ARTICLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Autorisation de Nico (01/11) : répartir le prix de chaque lot à parts égales entre ses articles, pour les 34 lots de
-- the_closet72 et PILOU (397,90 € et 91,30 €), avec sauvegarde et inverse.
-- Périmètre = les lignes « Lot N articles » retirées par vente_vinted_lot_eclater entre 00:00 et 03:00 (heure de Paris)
-- le 01/11 pour ces deux comptes (usage_logs vente_lot_eclatee : la ligne d'avant, son prix) ; leurs articles =
-- vinted_commandes_articles de la commande, et la vente écrite pour chacun (vente_id).
-- Le prix : celui de la ligne « Lot » (= total de la commande lu sur Vinted), en centimes, à parts égales, le reste des
-- centimes au premier article dans l'ordre de la commande (position, numéro) — la règle de 20261101100000
-- (vinted_lot_parts, « parts_egales »), écrite ici pour que la réparation ne dépende pas de la migration. Somme = prix
-- du lot. Les prix d'achat sont inconnus (NULL) : le bénéfice reste NULL.
-- Touché : ventes.prix_vente (123 lignes, NULL → la part) et vinted_commandes_articles.prix_part. Rien d'autre : aucune
-- vente créée ni supprimée, aucune note, aucun mail (ventes n'a aucun déclencheur sur UPDATE).
-- Sauvegardes : _backup_0111_lots_parts_egales_{ventes,compositions} (lignes entières). Inverse : …_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_lots_vinted_parts_egales.sql

DO $$
BEGIN
  IF to_regclass('public._backup_0111_lots_parts_egales_ventes') IS NOT NULL
     OR to_regclass('public._backup_0111_lots_parts_egales_compositions') IS NOT NULL THEN
    RAISE EXCEPTION 'déjà passé (sauvegardes _backup_0111_lots_parts_egales_* présentes) : rien n''est écrit';
  END IF;
END
$$;

CREATE TEMP TABLE _lots ON COMMIT DROP AS
SELECT u.user_id, u.metadata ->> 'commande' AS cmd, (u.metadata -> 'avant' ->> 'prix_vente')::numeric AS prix_lot,
       (u.metadata -> 'avant' ->> 'id')::bigint AS ligne_lot
  FROM usage_logs u
 WHERE u.feature = 'vente_lot_eclatee'
   AND u.user_id IN ('8ac5bbda-0947-4612-82fd-effdaa3ca84a',   -- the_closet72
                     'cae7a20d-56c8-46a6-868c-ae1f885faa70')   -- PILOU
   AND u.created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz
   AND u.created_at <  '2026-11-01 03:00:00 Europe/Paris'::timestamptz;

CREATE TEMP TABLE _parts ON COMMIT DROP AS
SELECT c.user_id, c.commande_ref, c.item_id, c.vente_id, l.prix_lot,
       row_number() OVER (PARTITION BY c.user_id, c.commande_ref ORDER BY c.position, c.item_id) AS rang,
       count(*) OVER (PARTITION BY c.user_id, c.commande_ref) AS n,
       round(l.prix_lot * 100)::bigint AS lot_c
  FROM vinted_commandes_articles c
  JOIN _lots l ON l.user_id = c.user_id AND l.cmd = c.commande_ref;
ALTER TABLE _parts ADD COLUMN part numeric;
UPDATE _parts SET part = round(((lot_c / n) + CASE WHEN rang <= lot_c - (lot_c / n) * n THEN 1 ELSE 0 END) / 100.0, 2);

-- ── Les preuves, toutes, avant la moindre écriture ─────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  SELECT count(*) AS lots,
         count(*) FILTER (WHERE user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') AS l1,
         sum(prix_lot) FILTER (WHERE user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') AS p1,
         sum(prix_lot) FILTER (WHERE user_id = 'cae7a20d-56c8-46a6-868c-ae1f885faa70') AS p2,
         count(*) FILTER (WHERE prix_lot IS NULL OR prix_lot <= 0) AS sans_prix,
         count(DISTINCT (user_id, cmd)) AS distincts
    INTO r FROM _lots;
  IF r.lots <> 34 OR r.l1 <> 27 OR r.p1 <> 397.90 OR r.p2 <> 91.30 OR r.sans_prix <> 0 OR r.distincts <> 34 THEN
    RAISE EXCEPTION 'lots inattendus : % (% du compte 8ac5bbda), %/% €, % sans prix : rien n''est écrit', r.lots, r.l1, r.p1, r.p2, r.sans_prix;
  END IF;
  IF (SELECT count(*) FROM _parts) <> 123
     OR (SELECT count(*) FROM _parts WHERE user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') <> 106 THEN
    RAISE EXCEPTION 'articles inattendus : % (attendu 123 dont 106 du compte 8ac5bbda) : rien n''est écrit', (SELECT count(*) FROM _parts);
  END IF;
  -- Chaque article a SA vente, encore à prix NULL, sans prix d'achat ni bénéfice, une seule fois.
  IF (SELECT count(*) FROM _parts p JOIN ventes v ON v.id = p.vente_id AND v.user_id = p.user_id
       WHERE v.prix_vente IS NULL AND v.prix_achat IS NULL AND v.benefice IS NULL AND v.inventaire_id IS NULL
         AND v.plateforme_code = 'vinted' AND v.commande_ref = p.commande_ref || ':' || p.item_id) <> 123
     OR (SELECT count(DISTINCT vente_id) FROM _parts) <> 123 THEN
    RAISE EXCEPTION 'une vente d''article manque, a déjà un prix ou n''est pas celle de son article : rien n''est écrit';
  END IF;
  -- La ligne « Lot » n'existe plus (rien compté deux fois) ; aucune autre vente ne porte ces articles.
  IF EXISTS (SELECT 1 FROM ventes v JOIN _lots l ON v.user_id = l.user_id
              WHERE v.id = l.ligne_lot OR (v.plateforme_code = 'vinted' AND v.commande_ref = l.cmd)) THEN
    RAISE EXCEPTION 'une ligne « Lot » existe encore : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM ventes v JOIN _parts p ON v.user_id = p.user_id AND v.annonce_id = p.item_id
              WHERE v.id <> p.vente_id) THEN
    RAISE EXCEPTION 'un article porte une autre vente : rien n''est écrit';
  END IF;
  -- Somme des parts = prix du lot, au centime.
  IF EXISTS (SELECT 1 FROM _parts GROUP BY user_id, commande_ref, prix_lot HAVING sum(part) <> prix_lot) THEN
    RAISE EXCEPTION 'une somme de parts diffère du prix de son lot : rien n''est écrit';
  END IF;
END
$$;

CREATE TEMP TABLE _ca_avant ON COMMIT DROP AS
SELECT user_id, coalesce(sum(prix_vente), 0) AS ca, count(*) AS n FROM ventes
 WHERE user_id IN ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70') GROUP BY user_id;

CREATE TABLE public._backup_0111_lots_parts_egales_ventes AS
SELECT v.* FROM ventes v WHERE v.id IN (SELECT vente_id FROM _parts);
CREATE TABLE public._backup_0111_lots_parts_egales_compositions AS
SELECT c.* FROM vinted_commandes_articles c JOIN _parts p
    ON p.user_id = c.user_id AND p.commande_ref = c.commande_ref AND p.item_id = c.item_id;
REVOKE ALL ON public._backup_0111_lots_parts_egales_ventes FROM anon, authenticated;
REVOKE ALL ON public._backup_0111_lots_parts_egales_compositions FROM anon, authenticated;
ALTER TABLE public._backup_0111_lots_parts_egales_ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0111_lots_parts_egales_compositions ENABLE ROW LEVEL SECURITY;

UPDATE ventes v SET prix_vente = p.part
  FROM _parts p
 WHERE v.id = p.vente_id AND v.user_id = p.user_id AND v.prix_vente IS NULL;
UPDATE vinted_commandes_articles c SET prix_part = p.part, maj_le = now()
  FROM _parts p
 WHERE c.user_id = p.user_id AND c.commande_ref = p.commande_ref AND c.item_id = p.item_id;

-- ── Contrôles après : le chiffre d'affaires revient à sa valeur d'avant le découpage, rien compté deux fois ────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.user_id, a.ca AS ca_avant, a.n AS n_avant, coalesce(sum(v.prix_vente), 0) AS ca_apres, count(v.id) AS n_apres,
           (SELECT sum(prix_lot) FROM _lots l WHERE l.user_id = a.user_id) AS lots
      FROM _ca_avant a JOIN ventes v ON v.user_id = a.user_id GROUP BY a.user_id, a.ca, a.n
  LOOP
    IF r.ca_apres <> r.ca_avant + r.lots OR r.n_apres <> r.n_avant THEN
      RAISE EXCEPTION 'contrôle CA % : % → % (attendu % + %), % → % ventes', r.user_id, r.ca_avant, r.ca_apres, r.ca_avant, r.lots, r.n_avant, r.n_apres;
    END IF;
    RAISE NOTICE 'CA % : % € → % € (+ % €, prix des lots d''avant le découpage), % ventes inchangées', r.user_id, r.ca_avant, r.ca_apres, r.lots, r.n_apres;
  END LOOP;
  IF EXISTS (SELECT 1 FROM _parts p JOIN ventes v ON v.id = p.vente_id GROUP BY p.user_id, p.commande_ref, p.prix_lot
              HAVING sum(v.prix_vente) <> p.prix_lot) THEN
    RAISE EXCEPTION 'contrôle : un lot ne retombe pas sur son prix';
  END IF;
END
$$;

SELECT a.user_id, a.ca AS ca_avant_reparation, sum(v.prix_vente) AS ca_apres, count(v.id) AS ventes
  FROM _ca_avant a JOIN ventes v ON v.user_id = a.user_id GROUP BY a.user_id, a.ca ORDER BY 1;

-- §apres reparation
do $rep$
declare n int; m int;
begin
  insert into _r select 'R1 CA boutique-8ac5bbda = avant le découpage (+ 397,90 €)', a.ca + 397.90 = sum(v.prix_vente) and a.n = count(v.id),
    format('%s → %s (%s ventes)', a.ca, sum(v.prix_vente), count(v.id))
    from _ca0 a join ventes v on v.user_id = a.user_id where a.user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a' group by a.ca, a.n;
  insert into _r select 'R1 CA COMPTE-CAE7A20D = avant le découpage (+ 91,30 €)', a.ca + 91.30 = sum(v.prix_vente) and a.n = count(v.id),
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
-- INVERSE de scripts/reparations/20261101_lots_vinted_parts_egales.sql : les 123 ventes d'article reprennent leur
-- prix d'avant (NULL) et les compositions leur prix_part et maj_le d'avant (copies entières dans
-- _backup_0111_lots_parts_egales_{ventes,compositions}) — seulement si la valeur posée par la réparation est toujours là
-- (une saisie faite depuis par la personne est gardée et comptée). Puis les sauvegardes sont retirées.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_lots_vinted_parts_egales_INVERSE.sql

DO $$
BEGIN
  IF to_regclass('public._backup_0111_lots_parts_egales_ventes') IS NULL
     OR to_regclass('public._backup_0111_lots_parts_egales_compositions') IS NULL THEN
    RAISE EXCEPTION 'sauvegardes _backup_0111_lots_parts_egales_* absentes : rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public._backup_0111_lots_parts_egales_ventes) <> 123
     OR (SELECT count(*) FROM public._backup_0111_lots_parts_egales_compositions) <> 123 THEN
    RAISE EXCEPTION 'sauvegardes incomplètes : rien n''est écrit';
  END IF;
END
$$;

CREATE TEMP TABLE _gardees ON COMMIT DROP AS
SELECT v.id FROM ventes v JOIN public._backup_0111_lots_parts_egales_compositions c
    ON c.user_id = v.user_id AND c.vente_id = v.id
  JOIN vinted_commandes_articles x ON x.user_id = c.user_id AND x.commande_ref = c.commande_ref AND x.item_id = c.item_id
 WHERE v.prix_vente IS DISTINCT FROM x.prix_part;

UPDATE ventes v SET prix_vente = b.prix_vente
  FROM public._backup_0111_lots_parts_egales_ventes b
 WHERE v.id = b.id AND v.id NOT IN (SELECT id FROM _gardees);
UPDATE vinted_commandes_articles x SET prix_part = b.prix_part, maj_le = b.maj_le
  FROM public._backup_0111_lots_parts_egales_compositions b
 WHERE x.user_id = b.user_id AND x.commande_ref = b.commande_ref AND x.item_id = b.item_id
   AND b.vente_id NOT IN (SELECT id FROM _gardees);

DO $$
BEGIN
  RAISE NOTICE 'inverse : % ventes rendues à leur prix d''avant, % gardées (prix changé depuis par la personne)',
    123 - (SELECT count(*) FROM _gardees), (SELECT count(*) FROM _gardees);
  IF (SELECT count(*) FROM ventes v JOIN public._backup_0111_lots_parts_egales_ventes b ON b.id = v.id
       WHERE v.prix_vente IS NOT DISTINCT FROM b.prix_vente) + (SELECT count(*) FROM _gardees) <> 123 THEN
    RAISE EXCEPTION 'inverse incomplet : rien n''est écrit';
  END IF;
END
$$;

DROP TABLE public._backup_0111_lots_parts_egales_ventes;
DROP TABLE public._backup_0111_lots_parts_egales_compositions;

-- §apres inverse reparation
do $rinv$
begin
  insert into _r select 'R4 inverse de la réparation : CA rendu, sauvegardes retirées',
    bool_and(a.ca = (select sum(v.prix_vente) from ventes v where v.user_id = a.user_id))
      and to_regclass('public._backup_0111_lots_parts_egales_ventes') is null, null from _ca0 a;
end
$rinv$;
-- §fin apres inverse reparation
-- INVERSE de 20261101100000 : vinted_lot_parts telle que relue en production le 01/11 avant la migration
-- (pg_get_functiondef, md5 a79190d317b946eff0bd82b9b43cb14d). Aucune donnée à remettre.

CREATE OR REPLACE FUNCTION public.vinted_lot_parts(p_user uuid, p_ref text)
 RETURNS TABLE(item_id text, prix numeric, base numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids     text[];
  v_pv      numeric[];
  v_total   numeric;
  v_le      timestamptz;
  v_n       integer;
  v_k       integer;
  v_garde   numeric[];
  v_base    numeric[];
  v_prix    numeric[];
  v_src     text[];
  v_restants integer[] := '{}';
  v_vente   record;
  v_reste   numeric;
  v_reste_c bigint;
  v_somme   numeric;
  v_t       numeric;
  v_manque  integer := 0;
  v_alloue  bigint;
BEGIN
  SELECT array_agg(c.item_id ORDER BY c.position, c.item_id), array_agg(c.prix_vinted ORDER BY c.position, c.item_id),
         max(c.total), max(c.commande_le)
    INTO v_ids, v_pv, v_total, v_le
    FROM vinted_commandes_articles c
   WHERE c.user_id = p_user AND c.commande_ref = p_ref;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN RETURN; END IF;
  -- 1. Vinted donne le montant de chaque article : tel quel.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_pv) x WHERE x IS NULL OR x <= 0) THEN
    RETURN QUERY SELECT v_ids[k], round(v_pv[k], 2), NULL::numeric, 'vinted'::text FROM generate_series(1, v_n) AS k;
    RETURN;
  END IF;
  v_garde := array_fill(NULL::numeric, ARRAY[v_n]);
  v_base  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_prix  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_src   := array_fill(NULL::text, ARRAY[v_n]);
  -- 2a. Une vente déjà enregistrée SANS reçu de son annonce (saisie, confirmation
  --     de la personne) garde son prix ; celle d'un job (reçu) reçoit sa part.
  FOR v_k IN 1..v_n LOOP
    SELECT v.id, v.prix_vente INTO v_vente FROM ventes v
     WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = v_ids[v_k]
     ORDER BY v.id LIMIT 1;
    IF v_vente.id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM ventes_operations o
          WHERE o.user_id = p_user AND o.cle = 'annonce:vinted:' || v_ids[v_k]
            AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v_vente.id])) THEN
      v_src[v_k] := 'saisie';
      v_garde[v_k] := v_vente.prix_vente;
      v_prix[v_k] := v_vente.prix_vente;
    ELSE
      v_restants := v_restants || v_k;
    END IF;
  END LOOP;
  IF cardinality(v_restants) > 0 AND v_total IS NOT NULL AND v_total > 0 THEN
    IF EXISTS (SELECT 1 FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie' AND v_garde[k] IS NULL) THEN
      v_reste := NULL;                                   -- une saisie sans prix : le reste est inconnu
    ELSE
      v_reste := v_total - coalesce((SELECT sum(v_garde[k]) FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie'), 0);
    END IF;
    IF v_reste IS NOT NULL AND v_reste > 0 THEN
      IF cardinality(v_restants) = 1 THEN
        v_prix[v_restants[1]] := round(v_reste, 2);
        v_src[v_restants[1]] := 'reste';
      ELSE
        FOREACH v_k IN ARRAY v_restants LOOP
          v_t := coalesce(
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
                AND (v_le IS NULL OR s.captured_at <= v_le)
              ORDER BY s.captured_at DESC LIMIT 1),
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
              ORDER BY s.captured_at ASC LIMIT 1),
            (SELECT coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'detected_price')::numeric END,
                             j.price,
                             CASE WHEN j.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'prix_recreation')::numeric END,
                             CASE WHEN j.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields #>> '{republish_snapshot,prix}')::numeric END)
               FROM cross_post_jobs j
              WHERE j.user_id = p_user AND j.platform = 'vinted' AND j.action IN ('publish', 'republish')
                AND btrim(coalesce(j.platform_listing_id, '')) = v_ids[v_k]
              ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1),
            (SELECT i.prix_vente FROM inventaire i
              WHERE i.user_id = p_user AND i.vinted_item_id = v_ids[v_k] AND i.fusionne_dans IS NULL));
          IF v_t IS NULL OR v_t <= 0 THEN
            v_manque := v_manque + 1;
          ELSE
            v_base[v_k] := v_t;
          END IF;
        END LOOP;
        IF v_manque = 0 THEN
          v_somme := (SELECT sum(v_base[k]) FROM unnest(v_restants) AS k);
          v_reste_c := round(v_reste * 100);
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := floor(v_reste_c * v_base[v_k] / v_somme);
          END LOOP;
          v_alloue := (SELECT sum(v_prix[k]) FROM unnest(v_restants) AS k);
          FOR v_k IN
            SELECT k FROM unnest(v_restants) AS k
             ORDER BY (v_reste_c * v_base[k] / v_somme) - floor(v_reste_c * v_base[k] / v_somme) DESC,
                      length(v_ids[k]), v_ids[k]
             LIMIT greatest(v_reste_c - v_alloue, 0)
          LOOP
            v_prix[v_k] := v_prix[v_k] + 1;
          END LOOP;
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := v_prix[v_k] / 100.0;
            v_src[v_k] := 'prorata';
          END LOOP;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_ids[k], round(v_prix[k], 2), v_base[k], v_src[k] FROM generate_series(1, v_n) AS k;
END;
$function$;

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
