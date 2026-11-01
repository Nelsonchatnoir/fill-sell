# Ventes anciennes importées comme « non suivies » (01/11)

## Constat
- Nuit du 31/10 au 01/11, le relevé a lu la composition de 34 commandes « Lot N articles » DÉJÀ en historique (lignes
  posées par le premier relevé : the_closet72 le 27/10, PILOU le 26/10). `vente_vinted_lot_eclater` (règle du 17/10 :
  une vente par article) a remplacé chaque ligne « Lot » par ses articles (trace `usage_logs` `vente_lot_eclatee`) :
  - the_closet72 (8ac5bbda…) : 00:45-00:47, 27 lots → 106 articles, vendus du 29/08 au 11/11/2025 ;
  - PILOU (cae7a20d…) : 02:49-02:51, 7 lots → 17 articles, vendus du 30/12/2025 au 16/01/2026 ;
  - nadegemarcelin78 (8a2eba68…) : 00:28, veille, 2 articles vendus le 31/10 à 07:36 et 14:06 (ventes récentes).
- Aucun article n'était connu de FillSell → 125 questions `vente_vinted_article_inconnu` (« retire-le ailleurs »).
  Aucun `push_ventes`, aucun mail (déclencheur : relevé de plus de 24 h → rien ; note de lot : aucun article connu).

## 1. Ce que la personne voit
- Question, alerte, bandeau : rien. Aucun code de l'app, de l'extension ni des fonctions edge ne lit cette question.
- « À régler » et son badge : rien. Aucune de ses sources ne lit `ventes`.
- Badges : rien. Le seul badge d'onglet (Stock) compte les publications à compléter. L'en-tête montre le mois en cours.
- Liste des ventes : une carte par article, à sa date de 2025, « Article Vinted … (pas suivi par FillSell) », « 0,00 € »
  (prix NULL affiché 0, comportement existant) et « + prix d'achat ». Les ventes comptent aussi dans « Complète tes prix
  d'achat » (+123, au lieu de +34 pour les lignes « Lot »).
- Stats : sur une période qui couvre ces dates (« Tout », ou « 12 mois » pour PILOU), +89 ventes au total (123 articles
  moins 34 lignes « Lot ») et 0 € chacune. Le panier moyen baisse.

## 2. Doublons
- Aucun doublon : aucune autre vente ne porte le même article (`annonce_id`), la même commande ou la même référence, ni le
  même titre à la même date. Aucune vente supprimée n'a été recréée. Les ventes d'une même commande sont des articles
  distincts d'un même lot.
- Rien n'est compté deux fois : la ligne « Lot » a été RETIRÉE au profit de ses articles.
- ⚠️ En revanche, le chiffre d'affaires de ces lots est perdu. La ligne « Lot » portait le total, alors que ses articles
  sont à prix NULL : aucun prix de base n'existait pour le prorata, et la règle dit « base manquante = NULL ». Il manque
  397,90 € chez the_closet72 (27 lots) et 91,30 € chez PILOU (7 lots). La règle de prix n'a pas été changée : c'est à
  Nico de décider.

## 3. Règle corrigée (migration `20261101073000`, appliquée le 01/11 à 09:26 sur feu vert nommé de Nico)
- `question_article_inconnu_due(vendu_le, lu_le)` est vraie si la date de vente est connue et a moins de 48 h quand la
  commande est lue. C'est la fenêtre de la garde « vente récente prouvée » des mails.
- Le bloc D6 de `vente_vinted_lot_eclater` (réécrit depuis la prod, md5 00383597…) ne pose la question que si elle est
  vraie. Pour une vente ancienne, l'article entre dans l'historique comme une vente normale, sans question.
- Rien d'autre ne change : vente, décision, retraits (aucun) et mail de commande de moins de 24 h.
- Contrôles :
  - essai à blanc en prod (ROLLBACK) : 15/15 ;
  - selftest `question-article-inconnu-recente` : 18/18, puis `-- --prod` vert après application (md5 de
    `vente_vinted_lot_eclater` 5b7d3966…, aucune question sur une vente ancienne depuis) ;
  - suite complète relancée.

## 4. Neutralisation (autorisée par Nico)
- Script : `scripts/reparations/20261101_questions_article_inconnu_anciennes.sql`, passé le 01/11 à 07:17.
- 123 questions neutralisées : the_closet72 106, PILOU 17. Elles passent en feature
  `vente_vinted_article_inconnu_ancienne`, le texte de la question est retiré et la trace du script est ajoutée.
- Sauvegarde : `_backup_0111_questions_article_inconnu` (123 lignes). Inverse : `…_INVERSE.sql`.
- Aucune vente touchée : 3 843 ventes sur les trois comptes, identiques à l'octet dans l'essai.
- Les 2 questions de nadegemarcelin78 sont GARDÉES : ce sont des ventes du 31/10, lues moins de 24 h après. C'est
  exactement le cas où la règle pose la question.

## Hors périmètre (signalé, non touché)
- Les questions plus anciennes : 1 936 depuis le 17/10, sur 57 comptes, dont environ 1 774 portent sur une vente de plus
  de 48 h. Elles sont invisibles, comme celles de la nuit.
- L'affichage « 0,00 € » d'une vente à prix NULL dans la liste des ventes.
