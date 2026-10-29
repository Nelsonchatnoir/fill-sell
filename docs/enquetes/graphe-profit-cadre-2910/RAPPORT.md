# Graphe du bloc profit sous la ligne du bas — 29/10/2026

Captures iPhone de Nico (29/10, 10:12, Tableau, « 12 mois » et « Depuis le début ») : « le graph est mal cadré, il est
sous la ligne du bas ». Les barres du bloc profit passent sous le trait du pied et sur « 202 ventes comptées ».
Règle durable : `docs/regles/tableau-et-statistiques.md` § 29/10 « Un graphe ne sort jamais de sa boîte ».

## Cause
`TraceHeros` (`ecrans/bureau/Graphes.jsx`) se dessinait sur `max(84 px, hauteur de la boîte)`. Sur téléphone la boîte
fait 64 px (`telephone.css`) : 20 px de dessin débordaient vers le bas (le SVG est en `overflow: visible`), 12 px
sous la ligne du pied en mode barres (12 mois, depuis le début) et 10,5 px en mode courbe (octobre, 30 jours).

Premier correctif refusé par Nico sur les captures (« maintenant c'est carrément au-dessus de la barre ; il faut que
ce soit aligné à la barre, propre, pro, nickel ») : rentrées dans leur boîte, les barres flottaient 8 px au-dessus du
trait (l'écart du bloc entre le graphe et le pied).

## Correctif
- Hauteur du dessin = hauteur mesurée de la boîte (84 px seulement avant la première mesure).
- Le graphe repose SUR la ligne du pied : sa boîte reprend l'écart du bloc (`margin-bottom` -10 px ordinateur et
  portable étroit, -8 px téléphone) ; barres à base plate au ras de la boîte (coins arrondis en haut seulement) ;
  courbe dont le trait du bas (2,5 px) repose sur la ligne ; échelle du minimum (0 ou un cumul négatif) au maximum.
  Période sans profit : le trait plat est couché sur la ligne, le point du jour centré dessus.

## Vérifications
- Banc d'essai (données d'Ornella et de Nico), 11 largeurs (360, 390, 412, 430, 768, 1 000, 1 024, 1 100, 1 280,
  1 440, 1 920 px), Tableau et Stats, 4 périodes : chaque trait, barre, point et libellé de chaque graphe mesuré dans
  sa boîte, et le graphe du bloc profit au-dessus de sa ligne. **Avant** (390 px) : 84 px dans 64 px, jusqu'à 12 px
  sous la ligne. **Après** : 330 graphes (dont 88 blocs profit), 0 défaut ; chaque barre posée sur la ligne (écart
  0 px, tolérance 0,5 px), courbe partant de la ligne (1,3 px = demi-épaisseur du trait).

## Constat à part (données, rien modifié)
Les 202 ventes du compte de Nico ont toutes `prix_achat = 0` (gratuit) le 29/10 à 10 h ; l'export du matin en avait
200 à NULL (inconnu). D'où profit = encaissé (3 980,60 €) : le calcul suit la règle (0 = gratuit). Seul chemin
d'écriture en lot trouvé : « C'était gratuit (0 €) » de l'onglet Ventes. Question posée à Nico.
