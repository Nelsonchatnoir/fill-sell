-- INVERSE de scripts/reparations/20261101_lots_vinted_parts_egales.sql : les 123 ventes d'article reprennent leur
-- prix d'avant (NULL) et les compositions leur prix_part et maj_le d'avant (copies entières dans
-- _backup_0111_lots_parts_egales_{ventes,compositions}) — seulement si la valeur posée par la réparation est toujours là
-- (une saisie faite depuis par la personne est gardée et comptée). Puis les sauvegardes sont retirées.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_lots_vinted_parts_egales_INVERSE.sql
BEGIN;

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

COMMIT;
