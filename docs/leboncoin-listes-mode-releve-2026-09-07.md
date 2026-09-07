# Leboncoin — listes fermées de Mode > Vêtements (relevé LIVE, 07/09/2026)

Relevé par Claude-in-Chrome sur `https://www.leboncoin.fr/deposer-une-annonce`,
session de Nico. Titre neutre « Pull en laine femme taille M », suggestion
« Mode > Vêtements » retenue. Chaque menu a été ouvert PUIS DÉROULÉ jusqu'à ce
que le nombre d'options cesse de bouger (trois relevés identiques d'affilée) —
c'est le chargement paresseux qui avait tronqué la liste Beebs à « Amisu » et
fait échouer le Jeans Vila. Formulaire quitté sans enregistrer, rien publié.

## Les six champs de la feuille

| clé | libellé | nature |
|---|---|---|
| `clothing_type` | Univers* | liste fermée (Femme / Homme / Enfant…) |
| `clothing_st` | Taille | liste fermée, 15 valeurs |
| `clothing_category` | Type de vêtement | liste fermée (pré-remplie par LBC) |
| `clothing_brand` | Marque | liste fermée **À RECHERCHE** (voir plus bas) |
| `clothing_color` | Couleur | liste fermée, 21 valeurs |
| `clothing_condition` | État | liste fermée, 5 valeurs |

⚠️ Aucun champ Matière sur cette feuille. La matière existe ailleurs
(`furniture_material`, `linens_material`, `table_art_material`) — à relever
feuille par feuille, elle n'est pas commune à la Mode.

## État — 5 valeurs

Neuf avec étiquette · Neuf sans étiquette · Très bon état · Bon état ·
État satisfaisant

Correspondance avec le vocabulaire Vinted (relevé des captures) :
« Neuf avec étiquette », « Neuf sans étiquette », « Très bon état » et
« Bon état » sont IDENTIQUES au caractère près. Seul « Satisfaisant » (Vinted)
n'existe pas : Leboncoin dit « État satisfaisant ». Ce n'est pas une valeur
approchée mais deux libellés différents — donc needs_user, comme arbitré.

## Taille — 15 valeurs

Taille unique · 30 - XXXS · 32 - XXS · 34 - XS · 36 - S · 38 - M · 40 - L ·
42 - XL · 44 - XXL · 46 - XXXL · 48 - 4XL · 50 - 5XL · 52 - 6XL · 54 - 7XL ·
56 - 8XL et plus

Format « NN - LL » (taille FR puis lettre). Vinted écrit « M / 38 / 10 »
(lettre / FR / UK). Les deux composants se correspondent exactement : la
correspondance est STRUCTURELLE, pas approchée. Elle reste à coder (non
basculée : Nico veut voir les taux d'abord).

## Couleur — 21 valeurs

Argenté / Acier · Beige / Camel · Blanc · Bleu / Ciel ·
Crème / Blanc cassé / Écru · Doré / Bronze / Cuivre · Gris / Anthracite ·
Imprimé · Jaune / Moutarde · Kaki · Lavande / Lilas · Marine / Turquoise ·
Marron · Multicolore · Noir · Orange / Corail · Rose / Fuchsia ·
Rouge / Bordeaux · Vert · Violet / Mauve · Autre

Libellés COMPOSÉS, là où Vinted a 29 couleurs simples. « Marine » (Vinted) vit
dans « Marine / Turquoise » (Leboncoin) : la correspondance par composant est
possible et sûre, mais elle reste à coder.

## Marque — liste fermée À RECHERCHE : le menu est VIDE tant qu'on ne tape pas

C'est le constat le plus important de ce relevé. À l'ouverture, le menu de
`clothing_brand` ne contient AUCUNE option. Il ne se peuple qu'après une frappe
CLAVIER RÉELLE, servie par le serveur : taper « Zar » rend quatre options —
Ana Alcazar, Azzaro, Rene Lezard, Zara.
Des événements `input` synthétiques ne suffisent pas : le menu reste vide.

CONSÉQUENCE MESURÉE EN BASE (464 jobs Leboncoin des 30 derniers jours) :

| issue du champ Marque | jobs |
|---|---|
| pré-rempli par Leboncoin, conservé | 201 |
| **champ sauté (marque NON posée)** | **122** |
| repli générique (« Autre », « Sans marque ») | 17 |
| sans warning marque | 124 |

`fillCriterionSafe` ouvre le menu et cherche parmi les options AFFICHÉES : sur
ce champ il n'y en a aucune, donc la marque n'est posée que lorsque Leboncoin
l'a lui-même déduite du titre. 122 annonces sont parties sans marque en un mois.
Le remède (taper la valeur, puis choisir l'option exacte) n'est PAS codé :
relevé et mesuré seulement, comme demandé.
