# Tableau, en-tête et Statistiques : les chiffres affichés

> Sujet ouvert le 28/10/2026 (refonte desktop du Tableau et des Statistiques). Une règle nouvelle de ce sujet
> s'ajoute ICI, jamais dans `CLAUDE.md`. Les règles de LECTURE d'une vente (plateforme normalisée, marge % au
> prix d'achat > 0, « Sans plateforme », tri) restent dans `docs/regles/ventes-et-retraits.md` § 16/10.

## 28/10 — Tableau, en-tête et Statistiques : une seule source pour les chiffres (rapport `docs/enquetes/refonte-tableau-desktop-2810/RAPPORT.md`)
- **Un chiffre = une période NOMMÉE** : `src/utils/tableauStats.js` définit `mois` (du 1er à aujourd'hui), `30j`,
  `3m`/`6m`/`12m` (glissants) et `tout` (seule période où entrent les ventes sans date), en jours de Paris comparés en
  texte. L'en-tête (« 99 ventes en octobre »), le Tableau (mobile et desktop) et les Stats lisent CE module. Avant :
  « 99 ventes ce mois » (mois calendaire) à côté de « 124 ventes · dernier mois » (mois glissant). Le « 1M » des Stats
  mobiles s'appelle désormais « 30 DERNIERS JOURS ».
- **Comparaison à jours égaux** (octobre 1–28 contre 1–28 septembre) ; sous 5 ventes dans la période d'avant, AUCUN
  écart affiché (`comparable()`). Le stock (en ligne, immobilisé, ancienneté) est un état d'aujourd'hui : jamais comparé.
- **Marge : une règle partout** (pondérée, ventes au prix d'achat > 0). Les Stats faisaient une moyenne simple des %.
- **Délai de vente CONSTATÉ** : de la première mise en ligne connue (plus ancien `published_at` des jobs, sinon l'ajout)
  à la vente, articles CRÉÉS dans FillSell seulement ; un article importé d'un dressing est écarté (vraie date de mise
  en ligne inconnue) ; plus de rapprochement par le titre ; rien tant que les jobs ne sont pas lus. Jamais une prévision.
- **Prix affiché** = `cross_post_jobs.price` du dernier job publié avant la vente, sur la plateforme de la vente.
- **Écarté faute de donnée fiable : l'HEURE de vente** (`vendu_le` = midi de remplissage pour les anciennes ventes,
  heure de détection pour un relevé ; `nbHeuresReelles` le compte). Les jours de la semaine, eux, sont fiables.
- **Charge** : aucun appel de plus à l'ouverture ; tout se calcule sur les ventes et l'inventaire déjà chargés et sur
  la lecture « en ligne » existante (`useStockEnLigne`, + la colonne `price`). Mesuré : < 15 ms par période sur le
  compte d'Ornella (715 ventes, 894 fiches, 920 jobs). Selftest : `npm run selftest:tableau-stats`.
- **Affichage desktop** (`src/ecrans/bureau/`, `hooks/useBureau`) : web à partir de 1 024 px seulement ; app native et
  petits écrans gardent l'écran mobile. Écran de démarrage (compte vide) et bandeaux du haut du Tableau inchangés.

## 29/10 — Téléphone : mêmes chiffres, pensés pour le pouce (rapport `docs/enquetes/refonte-tableau-telephone-2910/RAPPORT.md`)
- **Site mobile ET app iOS / Android** (tout ce qui n'est pas « ordinateur » au sens de `hooks/useBureau`) :
  `src/ecrans/telephone/` (TableauTelephone, StatsTelephone, FeuilleDetail). Maquette « écran 1 » validée par Nico le
  29/10 : la carte « Profit net · depuis le début » du 16/10, « Ce mois », Bénéfices / Marge par mois (7j-1M-6M-1A-YTD)
  et « Activité récente » sont REMPLACÉS par la période nommée en haut (Octobre · 30 jours · 12 mois · Depuis le début),
  le bloc profit de la période, 8 tuiles, la courbe cumulée et les blocs de l'ordinateur. Les Stats du téléphone
  passent aux 4 périodes de l'ordinateur (1M/3M/6M/1A disparaissent) ; « Meilleures ventes » est gardé
  (`tableauStats.meilleuresVentes`).
- **Le détail est UN contenu** (`ecrans/bureau/detail.jsx` → `contenuDetail`) : panneau latéral sur ordinateur, feuille
  qui monte du bas sur téléphone. La feuille suit la règle des couches (`utils/modale.js`) : portail sur body,
  `useFondFige`, `useEchap`, `useRetourAndroid` (retour = détail d'avant, puis fermeture), et ne se monte QUE ouverte
  (sinon le retour Android serait intercepté sur tout le Tableau). Fermeture : glisser vers le bas (poignée, en-tête,
  contenu déjà en haut), ✕ de 44 px, toucher dehors.
- **Graphes au doigt** : `bandeau` (Graphes.jsx) — la valeur touchée s'écrit AU-DESSUS du tracé, `touch-action: pan-y`
  garde le défilement vertical. Tuiles ≥ 104 px, lignes ≥ 60 px, pastilles ≥ 50 px, retour haptique léger à
  l'ouverture (natif seulement, `toucherLeger`).
- Inchangés : l'écran de démarrage d'un compte vide, les bandeaux du haut, les encarts de quota, l'ordinateur
  (même rendu, le contenu du panneau n'a été que déplacé), le découpage des paliers (Stats ouvertes à tous).

## 29/10 — Libellés de l'axe horizontal : jamais deux qui se touchent (rapport `docs/enquetes/axe-graphes-2910/RAPPORT.md`)
- Bug vu par Nico sur iPhone (feuille « Vinted · depuis le début », Ventes par mois) : ~20 mois écrits côte à côte,
  « janvfévmarsavr… » illisible. RÈGLE pour TOUS les graphes (ordinateur et téléphone, Tableau, panneau / feuille,
  Statistiques, toutes périodes) : un graphe ne reçoit plus une liste de libellés figée, mais des JEUX du plus dense
  au plus clairsemé (`ecrans/bureau/axe.js`) ; `Courbes` / `Colonnes` mesurent le texte à leur largeur réelle
  (`useMesureTexte`, canvas, police de la page) et gardent le premier jeu dont les libellés tiennent avec 10 px
  d'écart, sans déborder du graphe (`placerAxe`). Le détail de chaque mois ou jour se lit au survol / au toucher.
- **Mois** (`axeMois`) : tous, un sur deux, trimestres (janv. avr. juil. oct.), semestres, puis les seuls changements
  d'année ; dès que la série couvre deux années civiles, janvier s'écrit **« 2026 »** (graisse 600). Le mois en cours
  reste en gras quand il a sa place. **Jours** (`axeJours`) : grille par semaine, « auj. » toujours écrit (un repère
  qui le touche s'efface), la fin du mois seulement si elle a la place. **Listes courtes** (`axeSimple`) : jours de la
  semaine.
- Jamais de `labels` à trous calculés à la main (`i % 2 ? '' : …`) : c'est ce qui cassait à une autre largeur. Un
  nouveau graphe passe un `axe`. Selftest `npm run selftest:axe-graphes` (toutes largeurs 220 → 1 920 px × séries
  1 → 130 mois et 1 → 31 jours).

## 29/10 — Toucher : jamais de cadre ; graphe vide : rien ne bouge (rapport `docs/enquetes/focus-graphes-vides-2910/RAPPORT.md`)
- Capture iPhone de Nico (Tableau, « Encaissé cumulé · octobre », aucune vente) : un cadre bleu autour du graphe touché
  (focus de la zone tactile SVG, dessiné par iOS), un curseur qui traverse « Aucune vente pour l'instant », un bandeau
  « sam. 10 oct. · 0,00 € », le message qui déborde à gauche et « 1 oct. » collé à « 0 € ».
- **Focus** (`bureau.css` + `utils/modaliteSaisie.js`) : dans tout `.fsb` (Tableau, Stats, feuille, panneau ; web et
  app), AUCUN contour au toucher ni à la souris (`:focus{outline:none}`), même celui que le navigateur dessine seul.
  Le repère n'existe qu'au clavier (`html[data-saisie="clavier"]`, posé par la dernière saisie) : contour
  `--fsb-teal-deep` sur les boutons, trait sarcelle autour de la zone d'une courbe (les flèches déplacent le curseur).
  Un nouvel écran racine appelle `useSuiviSaisie()` ; un nouveau style de focus passe par
  `:where(:root:not([data-saisie="pointeur"]))`.
- **Graphe vide** (`grapheVide` : que des zéros, ou `vide` fourni) : aucune zone tactile, aucun curseur, aucun bandeau
  ni infobulle ; le message est posé sur la zone du tracé (entre les marges, jamais sur l'axe vertical) et s'y replie.
  Les colonnes vides reçoivent un message (`vide`) : « Aucune vente · <période> », ou « Profit non calculé : prix
  d'achat manquants » quand il y a des ventes sans prix d'achat.
- **Coin bas-gauche** : aucun libellé de l'axe horizontal ne commence avant le tracé (`placerAxe({ gauche })`) —
  jamais sous le « 0 € » de l'axe vertical.
- **Un graphe ne sort jamais de sa boîte, et le bloc profit repose SUR sa ligne** (29/10, captures iPhone : barres sous
  la ligne du bas, puis « aligné à la barre, propre, nickel ») : chaque graphe est dessiné à la hauteur RÉELLE de sa
  boîte, jamais à une hauteur minimale codée en dur (`TraceHeros` gardait 84 px dans une boîte de 64 px) ; la boîte
  du graphe du bloc profit touche le trait du pied (marge basse négative = l'écart du bloc : 10 px ordinateur, 8 px
  téléphone) et le dessin est ancré au bas de la boîte (`bottom: 0`, aucun écart dû aux fractions de pixel), les
  barres ont une base plate au ras de ce trait (coins arrondis en haut seulement), la courbe en part ;
  un cumul négatif reste dans la boîte (échelle min → max). Rapport `docs/enquetes/graphe-profit-cadre-2910/RAPPORT.md`.
- **Marge et ventes gratuites** (29/10, Nico) : une vente à 0 € (gratuite) entre dans la marge comme tout prix connu ;
  les tuiles Marge (Tableau, Stats, détail d'une plateforme) ne disent « prix d'achat manquants » que s'il y a des
  ventes et qu'AUCUNE n'a de prix d'achat connu ; le détail dit « dont N gratuites ». Règle : `ventesStats.js` b).
