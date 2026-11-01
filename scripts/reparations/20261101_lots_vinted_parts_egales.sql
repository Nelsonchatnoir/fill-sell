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
BEGIN;

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
    RAISE EXCEPTION 'lots inattendus : % (% the_closet72), %/% €, % sans prix : rien n''est écrit', r.lots, r.l1, r.p1, r.p2, r.sans_prix;
  END IF;
  IF (SELECT count(*) FROM _parts) <> 123
     OR (SELECT count(*) FROM _parts WHERE user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a') <> 106 THEN
    RAISE EXCEPTION 'articles inattendus : % (attendu 123 dont 106 the_closet72) : rien n''est écrit', (SELECT count(*) FROM _parts);
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

COMMIT;
