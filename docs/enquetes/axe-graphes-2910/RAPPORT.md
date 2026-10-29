# Libellés d'axe qui se chevauchent — 29/10/2026

Capture de Nico (29/10, 08:35, iPhone, fillsell.app) : feuille « Vinted · depuis le début » ouverte depuis Encaissé,
graphe « Ventes par mois » ; les ~20 mois de l'axe s'écrivent les uns sur les autres (« janvfévmarsavrmaijuin… »).
Demande : corriger la RÈGLE pour tous les graphes (téléphone et ordinateur, toutes périodes, Tableau, feuilles,
Statistiques) — jamais deux libellés d'axe qui se touchent, quelle que soit la largeur ou la période. Règle durable :
`docs/regles/tableau-et-statistiques.md` § 29/10 « Libellés de l'axe horizontal ».

## Cause
Chaque appelant décidait seul de ses libellés, sans connaître la largeur : la feuille « par plateforme » écrivait TOUS
les mois (`detail.jsx`), le Tableau « un sur deux au-delà de 8 / 14 mois », les colonnes « jour par jour » un jour sur
sept PLUS le dernier (« 28 » et « 29 » collés), les courbes une liste fixe. À 390 px, « un sur deux » sur 40 mois
chevauche encore ; seul le graphe connaît sa largeur.

## Correctif
- `src/ecrans/bureau/axe.js` (pur, sans React) : l'appelant décrit des JEUX de libellés du plus dense au plus
  clairsemé — `axeMois` (tous, un sur deux, trimestres, semestres, changements d'année ; janvier = « 2026 » dès que la
  série couvre deux années), `axeJours` (grille par semaine, « auj. » toujours écrit, fin du mois si elle a la place),
  `axeSimple` (jours de la semaine). `placerAxe` garde le premier jeu dont les libellés tiennent avec 10 px d'écart,
  sans sortir du graphe.
- `Courbes` / `Colonnes` (`Graphes.jsx`) prennent `axe` au lieu de `labels` / `xTicks` / `fort` et mesurent le texte à
  leur largeur réelle (`useMesureTexte` dans `outils.js` : canvas, police calculée, remesure une fois les polices
  chargées). Les 10 graphes à axe passent par là (Tableau ordinateur et téléphone, panneau / feuille, Stats).
- Au passage : le graphe mois par mois de la feuille d'une plateforme disait « Touche un jour » → « Touche un mois ».

## Vérifications
- `npm run selftest:axe-graphes` : règle tenue sur 220 → 1 920 px × séries de 1 à 130 mois et de 1 à 31 jours, deux
  mesures de texte (plus d'un million de vérifications).
- Banc d'essai (vrais onglets, données exportées d'Ornella et de Nico, aucune connexion) : chaque période cliquée,
  chaque tuile, bloc profit et plateforme ouverts, libellés mesurés dans le navigateur. **Avant** (code en ligne) :
  69 graphes sur 171 en défaut à 390 / 412 px (jusqu'à 21 px de recouvrement). **Après** : 983 graphes contrôlés à
  360, 390, 412, 430, 768, 1 000, 1 024, 1 100, 1 280, 1 366, 1 440, 1 680 et 1 920 px, français et anglais —
  0 en défaut, écart le plus serré 11,4 px.
- Ordinateur : mêmes repères qu'avant sur les courbes (1, 8, 15, 22, auj., 31 oct.) ; seul changement visible, janvier
  écrit « 2025 », « 2026 » sur les séries à cheval sur deux années.
