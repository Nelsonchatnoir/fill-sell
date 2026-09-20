-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION : LES VENTES LEBONCOIN COLLÉES AU MAUVAIS ARTICLE (2026-09-20)
-- ═══════════════════════════════════════════════════════════════════════════
-- Conséquence du défaut corrigé par 20260920200000 (un identifiant VIDE
-- identifiait le dernier job publié du compte). Le relevé des ventes Leboncoin
-- envoie `listing_id: null` pour chaque ligne : TOUTES ses lignes se sont donc
-- rattachées au même article, qui n'a rien vendu et qui est resté en stock.
--
-- CE QUE CETTE MIGRATION TOUCHE, compté avant de l'écrire :
--   302 ventes Leboncoin issues du relevé portent un inventaire_id
--     · 18 dont le titre est EXACTEMENT celui de l'article → CONSERVÉES ;
--     · 284 dont le titre n'a rien à voir → DÉTACHÉES (11 comptes) :
--         jocabroc8 144 · louis 42 · xxewwer 32 · misscat801 23 ·
--         ornellaracano 13 · b.halbot 9 · nicolas.svobodny 7 ·
--         bilelbourouis45 7 · pro.aurelie.82 5 · josephinecerni 1 · voirememe 1
--   Parmi elles, 21 portent en plus un prix d'achat et un bénéfice calculés
--   contre l'article collé (Ornella 13, Nico 7, voirememe 1) : ces deux
--   colonnes repartent à NULL.
--
-- ⛔ ON DÉTACHE, ON NE DEVINE PAS. `inventaire_id = NULL` veut dire « on ne
--    sait pas à quel article cette vente correspond » — ce qui est la vérité.
--    Le prochain relevé, avec la fonction corrigée, rattachera par titre + prix
--    quand c'est certain, et laissera vide sinon.
-- ⛔ prix_achat À NULL, JAMAIS À ZÉRO (règle du 03/08) : NULL = inconnu, et
--    l'article n'entre alors dans AUCUN calcul de marge. Écrire 0 produirait
--    une marge de 100 % sur du vent.
-- ⛔ LE CHIFFRE D'AFFAIRES N'EST PAS TOUCHÉ : `prix_vente` reste tel quel. Il
--    est vrai même sans article rattaché.
-- ⛔ AUCUN ARTICLE N'EST MODIFIÉ : la branche qui écrit inventaire.prix_vente
--    ne se déclenche que sur un article déjà `statut = 'vendu'` ; les articles
--    collés sont tous en `stock`. Vérifié : 0 ligne d'inventaire à réparer.
-- ⛔ IDEMPOTENTE : au second passage, plus aucune ligne ne remplit le WHERE.
--
-- TRAÇABLE : chaque ligne réparée garde la trace de ce qu'on lui a retiré, dans
-- `ventes.description` ? NON — on ne touche pas au texte de la personne. La
-- trace est ici, dans cette migration, et dans le compte rendu du 20/09.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE ventes v
   SET inventaire_id = NULL,
       prix_achat    = NULL,
       benefice      = NULL
  FROM inventaire i
 WHERE i.id = v.inventaire_id
   AND v.source = 'releve'
   AND v.plateforme_code = 'leboncoin'
   AND v.inventaire_id IS NOT NULL
   AND titre_norm(v.titre) IS DISTINCT FROM titre_norm(i.titre);
