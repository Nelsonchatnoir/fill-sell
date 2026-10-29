# Cadre bleu au toucher, graphe vide, coin des axes — 29/10/2026

Capture de Nico (29/10, 09:31, iPhone, Tableau, « Encaissé cumulé · octobre », aucune vente en octobre) : en touchant le
graphe, un cadre bleu l'entoure ; un curseur traverse « Aucune vente pour l'instant », un bandeau « sam. 10 oct. ·
0,00 € · 0,00 € » s'affiche ; « La courbe se dessine dès la première vente » déborde à gauche ; « 1 oct. » touche « 0 € ».
Demande : corriger la règle pour tous les graphes et éléments touchables (Tableau, feuilles, panneau, Statistiques ;
téléphone, app, ordinateur), garder la navigation au clavier sur ordinateur avec un repère à nos couleurs. Règle
durable : `docs/regles/tableau-et-statistiques.md` § 29/10 « Toucher : jamais de cadre ».

## Causes
- **Cadre** : la zone tactile des courbes est un `<rect tabIndex=0>` (lecture au clavier) ; le toucher lui donne le
  focus et iOS dessine son contour système. La règle `:focus-visible` à nos couleurs ne l'empêchait pas.
- **Graphe vide** : la zone tactile, le curseur et le bandeau restaient actifs ; le message couvrait toute la boîte
  du graphe (axe vertical compris), d'où le débordement à gauche et le curseur qui le traverse.
- **Coin** : le premier libellé de l'axe horizontal pouvait commencer avant le tracé, sous le « 0 € » (2 px d'écart).
- **Trouvé en testant** : le curseur des courbes tombait ~40 px à GAUCHE du doigt (~50 px de la souris sur
  ordinateur) — la marge gauche était retirée deux fois dans le calcul du jour lu.

## Correctif
- `utils/modaliteSaisie.js` : `<html data-saisie="pointeur|clavier">` selon la dernière saisie (écouteurs en capture,
  posés une fois par `useSuiviSaisie()` dans les 4 écrans racines). `bureau.css` : dans `.fsb`, `:focus{outline:none}`
  partout ; au clavier seulement, contour `--fsb-teal-deep` sur les boutons et trait sarcelle autour du tracé d'une
  courbe (zone resserrée sur le tracé, jamais sur les libellés).
- `Graphes.jsx` : `grapheVide` (que des zéros) ou `vide` fourni → aucune zone tactile, aucun curseur, aucun bandeau ni
  infobulle ; le message est posé sur la zone du tracé et s'y replie. Colonnes vides : « Aucune vente · <période> »,
  ou « Profit non calculé : prix d'achat manquants ». Le jour lu est celui sous le doigt / la souris.
- `axe.js` : `placerAxe({ gauche })` — aucun libellé ne commence avant le tracé (selftest `axe-graphes` étendu).

## Vérifications
- Banc d'essai (vrais onglets, données d'Ornella — graphes pleins — et de Nico — octobre et 30 jours vides), toucher
  réel (Chrome, écran tactile émulé) à 360, 390, 412 et 430 px, Tableau et Stats, 4 périodes, chaque tuile, bloc
  profit et plateforme ouverts au doigt et leurs graphes touchés. **Avant** (code en ligne, 390 px) : cadre de focus
  à chaque toucher, curseur + bandeau sur le graphe vide, message traversé et débordant, « 1 oct. » à 2 px de « 0 € »,
  curseur à 37 px du doigt. **Après** : 392 graphes (dont 56 vides), 1 176 touchers, 784 détails ouverts — 0 défaut.
- Clavier (390, 1 024, 1 440, 1 920 px) : 146 focus, tous avec le repère à nos couleurs, flèches → curseur ; clic
  souris : aucun cadre. Survol souris d'un graphe vide (1 024 → 1 920 px) : ni curseur ni infobulle ; graphe plein :
  le curseur suit la souris. Libellés d'axe : 834 graphes de 360 à 1 920 px, 0 en défaut.

## Livraison (29/10, matin)
- Commits `ea68ba3` (correctif) et `bb37f4d` (version 2.9.128), un seul push.
- **Web** : `build.json` = `2026-10-29T09:10:04Z+bb37f4d` ; script d'entrée 200 avec et sans `Origin` ; la feuille de
  styles servie porte les règles `data-saisie`.
- **OTA Capgo 2.9.128** (canal production relu à 2.9.127 avant, **2.9.128** après), build d'un arbre propre
  `2026-10-29T09:09:53Z+bb37f4d`.
- **Production** (session de Nico déjà ouverte, lecture seule, ordinateur, son octobre sans vente) : graphe vide sans
  zone tactile, message à 56 px du bord (début du tracé), « 1 oct. » à 9 px de « 0 € » ; clic puis survol du graphe :
  ni cadre, ni curseur, ni infobulle ; aucune erreur console. Onglet Lens remis. Le téléphone ne se contrôle pas d'ici
  (fillsell.app refuse d'être mise dans un cadre) : vérifié au banc d'essai avec un toucher réel sur le même code.
