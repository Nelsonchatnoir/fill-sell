-- INVERSE de 20261001_quantites_ebay_sans_lot.sql — sur décision seulement.
-- Remet la quantité d'avant sur les fiches que rien n'a touchées depuis
-- (toujours en stock ; une vente entre-temps est laissée telle quelle).
BEGIN;
SET LOCAL lock_timeout = '3s';
UPDATE inventaire i SET quantite = b.quantite_avant
  FROM public._backup_0110_quantites b
 WHERE i.id = b.inventaire_id AND i.statut = 'stock' AND i.quantite > b.quantite_avant;
COMMIT;
