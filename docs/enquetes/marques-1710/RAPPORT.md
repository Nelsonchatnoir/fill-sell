# 17/10 fin d'après-midi — La marque de l'annonce fait foi (toutes plateformes)

> Consigne de Nico (17/10) : « La marque de l'annonce fait foi. « Chic Me » reste « Chic Me ». Jamais remplacée par
> « Other » ou « sans marque » tant que la plateforme accepte de la poser. Si une plateforme à liste fermée la refuse
> vraiment, dis-moi laquelle et pourquoi, au lieu de trancher. » Garde-fous de la session : aucune nouvelle
> extension, aucune OTA, aucun mail. Heures de Paris.

## 1. Ce que chaque plateforme accepte

Relevés du 17/10 vers 15:40 sur les comptes de Nico, dans les formulaires de dépôt, sans rien enregistrer.

| Plateforme | Marque hors de sa liste | Preuve |
|---|---|---|
| **Vinted** | **OUI, de nouveau** | `/items/new`, « Zorglubia FillSell » → « Marque non disponible / Sans marque / Utiliser "Zorglubia FillSell" comme marque » (`#custom-select-brand`), en T-shirts (Femmes) ET en Encadrements, une des deux catégories du relevé du 03/10 qui ne l'offrait plus. « Chic Me » est au catalogue (id 385564). |
| **eBay** | **OUI** | Aspect « Marque » en texte libre (FREE_TEXT, 19 037 suggestions, mesuré le 06/09). Jamais fermé par un refus 25129 : le cache n'a fermé que « Taille » (7 catégories). |
| **Depop** | **NON** | Liste fermée (21 697 marques actives). `/products/create` : « Zorglubia » et « Chic Me » → seulement « Other » ; « ChicMe » → ChicMe. Aucune saisie libre. |
| **Leboncoin** | **NON** | Listes fermées, avec un repli « Autre » ou « Sans marque » relevé en direct le 07/09 (`leboncoin.js` `VALEUR_GENERIQUE_RE`). Pas relevé de nouveau aujourd'hui. |
| **Beebs** | **NON** | Liste fermée d'environ 1 400 marques, avec « Autre » (vérifié en direct les 19/07 et 29/07). Pas relevé de nouveau aujourd'hui. |

⚠️ **L'offre de Vinted varie.** Les postes de patrick giry (15/10) et de Romain Guerin (14/10 et 16/10) ne voyaient
PAS la ligne de création (« aucune ligne exacte ni de création en 10 s »). L'offre dépend donc du compte ou de la date.
L'extension doit continuer à lire le formulaire à chaque dépôt, et c'est déjà le cas.

## 2. Ce qui remplaçait une marque, et ce qui change

### Vinted : rien à changer
L'extension (0.6.93 et suivantes) clique déjà la ligne « Utiliser "X" comme marque » quand elle nomme exactement la
marque. Code : `attendreChoixMarque`, `vinted.js` ; sélecteur `publish.custom_brand_option`. La ligne relevée
aujourd'hui y correspond : straight quotes, ligne `#custom-select-brand`. La question ne vient que si Vinted
n'offre pas la ligne : c'est alors un vrai refus, et la personne choisit.

Les réponses « Sans marque » gardées par article (`attributs.marque_vinted`) ne concernent qu'**1 fiche**. Les marques
retenues du compte ne vont jamais vers une absence.

### App (web) : CORRIGÉ
**Cause.** À l'étape « Publier », une marque absente d'un relevé de 200 valeurs au plus devenait « invalide ». La
valeur voisine par les mots (`nearestAllowedValue`) était alors posée d'office, pour Vinted, Leboncoin et Beebs. La
garde eBay au clic faisait de même.

**Mesuré sur 60 jours.** Ce sont des copies dont la marque diffère de la fiche. Toutes ne viennent pas de cette
cause : une partie sont des saisies de la personne.
- « Daily paper » → « Paper »
- « Chicago Bulls » → « BULLS »
- « Calvin Klein Jeans » → « Calvin Klein »
- « ASOS Design » → « ASOS »
- « Funko Pop » → « Funko »
- « Disney baby » → « Disney »

**Règle.** `estChampMarque` (`src/publication/moteur/listes.js`) couvre :
- Vinted `brand` ;
- Leboncoin `*_brand` ;
- Beebs `Marque` ;
- l'aspect eBay `Marque`.

Une marque présente est gardée telle quelle. Si elle est dans la liste, c'est l'écriture exacte de la liste. Elle
n'est jamais rapprochée d'une autre, et c'est la plateforme qui tranche au dépôt.

Pour eBay :
- en texte libre, la marque part telle quelle et n'est jamais « invalide » ;
- en liste fermée (SELECTION_ONLY), eBay la refuse vraiment : la personne choisit, rien n'est posé d'office.

**Fichiers.**
- `listes.js` : `jugerValeurContreListe` ;
- `regles.js` : `gardeAspectsEbay`, Marque `sansRapprochement` ;
- `ListingPreviewScreen.jsx` : branche classique, statut eBay.

La couleur, la matière et les autres champs gardent leur rapprochement.

**Livraison.** Web au push. App mobile à la prochaine OTA (aucune OTA ce soir, consigne).
Selftest : `publication-moteur`, section [M], 11 contrôles.

### Extension : À FAIRE dans la prochaine version, sur ton feu vert
Ces corrections ne sont pas faites ce soir (consigne « aucune nouvelle extension ») :
1. **Leboncoin.** `fillCriterionSafe("marque")` passe par `findOptionCascade` sur une liste déjà remplie. Cette
   cascade accepte « une option contenue dans la valeur » (« Chic » pour « Chic Me ») avant de se replier sur
   « Autre ». À corriger : égalité exacte seulement, sinon « Autre ».
2. **Beebs.** La cascade par inclusion pose le même risque. Quand « Autre » n'est pas affiché, une IA choisit dans
   la liste affichée (`beebs.js` :2948-3013, :3667-3698) : elle peut poser une autre marque. À corriger : égalité
   exacte, sinon « Autre », jamais une autre marque.
3. **Depop.** La règle stricte de la 0.6.123 compare les espaces : « Chic Me » ≠ « ChicMe », donc « Other » alors
   que Depop connaît la marque. À corriger :
   - égalité qui ignore les espaces, tirets, points et apostrophes, mais jamais `&` ni `+` (H&M ≠ H&M+) ;
   - si plusieurs marques Depop tombent sur la même clé, l'écriture exacte gagne, sinon « Other ». Depop a lui-même
     33 paires de ce type, comme « Rocket Dog / Rocketdog ».

## 3. Ce qui reste à ta décision : Depop, Leboncoin, Beebs refusent vraiment
Une marque absente de leur liste ne peut pas être posée : il n'y a pas de saisie libre. Exemples absents de Depop
(liste du 08/10) :
- Jules, Orchestra, Du Pareil au Même, Grain de Blé, Paris 2024, pago ;
- Bonobo : Depop n'a que « Bonobos », une autre marque.

Trois choix possibles :
- **(a) « Other » / « Autre »** : la règle actuelle. L'annonce part, sans marque chez cette plateforme.
- **(b) Ne pas publier sur cette plateforme** : une question, ou une exclusion de l'article. Aucune annonce sans sa
  marque, mais moins d'annonces.
- **(c) « Other » + la marque écrite dans la description.** L'annonce part et l'acheteur voit la marque. Il faut
  toucher le texte de la description de cette plateforme.

Ampleur sur 60 jours (copies dont la fiche a une vraie marque et qui sont parties en absence de marque) :

| Plateforme | Parties en absence de marque | Copies |
|---|---:|---:|
| Leboncoin | 41 | 1 734 |
| Beebs | 32 | 1 369 |
| Vinted | 28 (réponses des personnes) | 576 |
| Depop | 4 | 215 |
| eBay | 3 | 551 |
