# Refonte du Tableau et des Statistiques sur ordinateur — 28/10/2026 soir

Demande de Nico (28/10, soir) : sur ordinateur, le Tableau et les Statistiques « ne vont pas du tout » ; une page
desktop dense et lisible, des pastilles et tuiles cliquables qui ouvrent leur détail, des statistiques avancées
calculées honnêtement, et UNE source pour les chiffres. Maquettes validées par Nico le 28/10 vers 23:40 (lien
claude.ai « FillSell Tableau desktop », données réelles du compte d'Ornella). Règle durable :
`docs/regles/tableau-et-statistiques.md`.

## 1. Constat avant (écrans réels, compte de Nico, 1 440 px)
- **Statistiques** : l'écran mobile étiré — une seule courbe de profit sur toute la largeur, libellés d'axe dessinés
  dans un `viewBox` agrandi (≈ 20 px, « Mai Jun Jul… » géants), cartes empilées en colonne.
- **Tableau** : deux petits graphes (Bénéfices, Marge par mois) dans du vide ; rien d'autre à lire.
- **Chiffres discordants** (compte d'Ornella) : en-tête « 508,80 € profit · 99 ventes ce mois » = mois CALENDAIRE
  (1–28 oct.) ; Stats « 612,80 € · 124 ventes · dernier mois » = mois GLISSANT (depuis le 28/09, `setMonth(-1)`).
  Deux périodes sous deux libellés presque identiques. S'y ajoutaient : marge des Stats en moyenne SIMPLE des %
  (Tableau : pondérée) ; délai « entre l'ajout et la vente » calculé depuis la date d'IMPORT des articles du dressing
  et, à défaut, rapproché par le TITRE ; mois de l'en-tête lu avec `new Date('AAAA-MM-JJ').getMonth()` (fuseau).

## 2. Ce qui a changé, écran par écran
### Une seule source : `src/utils/tableauStats.js` (fonctions pures, `npm run selftest:tableau-stats`, 74 vérifications)
- Périodes nommées : `mois` (du 1er à aujourd'hui), `30j`, `3m`/`6m`/`12m`, `tout` (seule à inclure les ventes sans
  date) ; jours de Paris comparés en texte ; comparaison à jours égaux (1–28 oct. ↔ 1–28 sept.), aucune sous 5 ventes.
- Recalcul du prototype des maquettes sur les données réelles d'Ornella : **module = maquette, aucun écart** (encaissé,
  profit, marge, panier, délai, prix affiché, stock, pour les 4 périodes).
### En-tête (web ≥ 769 px, inchangé sur téléphone où il est masqué)
- « 508,80 € profit · **99 ventes en octobre** » (au lieu de « ce mois »), même ensemble de ventes que le Tableau.
### Tableau sur ordinateur (web ≥ 1 024 px) — `src/ecrans/bureau/TableauBureau.jsx`
- Sélecteur de période (Octobre · 30 derniers jours · 12 derniers mois · Depuis le début), mémorisé par navigateur ;
  sous lui, la période de comparaison nommée.
- Bloc encre « Profit · octobre » (le chiffre lu en premier) + 8 tuiles : encaissé, ventes, panier moyen, marge, délai de
  vente constaté (moyenne + médiane + nombre de ventes mesurées), articles en ligne, stock immobilisé, écoulement ;
  chaque tuile avec son écart (▲/▼, pts, j) et la valeur d'avant nommée, ou « aujourd'hui » pour un état du stock.
- Courbe cumulée jour par jour (encaissé / profit / ventes) contre la période d'avant, survol au jour près
  (crosshair + infobulle), étiquettes exactes au centime ; colonnes mois par mois pour 12 mois / depuis le début.
- Par plateforme : encaissé, part, nombre de ventes, marge ; plateformes en ligne sans vente listées à part ;
  total = encaissé de la tuile, au centime.
- En ligne aujourd'hui (pastilles par plateforme + « Pas encore publiés »), Ça dort en stock (tranches 0–29 / 30–59 /
  60–89 / 90+ jours, prix d'achat immobilisé, 3 plus anciens), Dernières ventes (délai constaté, profit).
- Grille de 12 colonnes ; jusqu'à 1 680 px de large (27″) ; sous ~1 180 px de contenu (portable 13″ étroit), le
  bloc profit passe en bandeau et les cartes vont par deux.
### Panneau détaillé — `src/ecrans/bureau/PanneauDetail.jsx`
- Ouvert par toute tuile, pastille ou ligne : plateforme (encaissé, part, 6 mini-indicateurs comparés, ventes par
  jour, prix encaissé / affiché, meilleures marques, catégories, dernières ventes, lien vers ses ventes) ; en ligne
  sur une plateforme (annonces les plus anciennes) ; pas encore publiés ; articles qui dorment ; stock immobilisé
  (« comment c'est calculé », plus gros montants) ; chaque indicateur (valeur, écart, « comment c'est calculé »,
  jour par jour, par plateforme).
- Panneau latéral fixé à la fenêtre ; fermeture par « Fermer », Échap ou clic à côté ; focus rendu à l'élément qui
  l'a ouvert ; l'écran derrière ne bouge pas.
### Statistiques sur ordinateur — `src/ecrans/bureau/StatsBureau.jsx`
- 6 tuiles (encaissé, profit, marge, ventes, panier, délai) ; bandeau qui DIT pourquoi les écarts manquent.
- Quelle plateforme rapporte le plus : tableau ventes / encaissé / profit / marge / panier / délai + titres « plus de
  profit », « meilleure marge » (≥ 5 ventes au prix d'achat connu), « vend le plus vite » (≥ 5 ventes mesurées).
- Mois par mois (depuis le premier mois daté, 12 au plus) : colonnes encaissé + profit et tableau avec écart au mois
  d'avant (le mois en cours n'est jamais comparé).
- Délai de vente constaté par plateforme / catégorie / marque, répartition (le jour même, 1–2 j, 3–7 j, 8–30 j, +30 j).
- Marques qui vendent le mieux, catégories (part non classée DITE), prix encaissé / prix affiché (ratio + tranches),
  écoulement du stock + ancienneté, jours de la semaine où ça vend, analyse IA (même fonction, même cache).
### Mobile (téléphone, tablette native, fenêtre < 1 024 px) — mise en page inchangée
- Mêmes calculs que le desktop : carte « Ce mois » et en-tête sur la période `mois` ; Stats sur les périodes du module
  (« 1M » = 30 derniers jours, libellé « 30 DERNIERS JOURS ») ; marge pondérée ; délai constaté (règle ci-dessous,
  libellé « de la mise en ligne à la vente »). Écran de démarrage (compte vide) et bandeaux du haut : inchangés.

## 3. Statistiques ajoutées
Comparaison à la période d'avant (toutes les tuiles de période), délai de vente constaté (moyenne, médiane, nombre ;
par plateforme, catégorie, marque ; répartition), panier moyen par plateforme, prix encaissé / prix affiché, taux
d'écoulement, ancienneté du stock en tranches avec prix d'achat immobilisé, plateforme la plus rentable (profit, marge,
vitesse), marques et catégories, jours de la semaine, évolution mois par mois avec écart, détail complet par plateforme.

## 4. Écarté ou borné faute de donnée fiable
- **Heures de vente** : `vendu_le` porte midi pour les ventes antérieures au 19/09 (remplissage) et l'heure de
  DÉTECTION pour un relevé ; heure réelle connue pour 40 ventes sur 715 chez Ornella. Pas de graphe ; la raison est
  écrite sous « Jours où ça vend ».
- **Délai pour les articles importés d'un dressing** (`origine` renseignée) : vraie date de mise en ligne inconnue
  (`listed_at_guess` est une estimation, refusée) → écartés ; plus aucun rapprochement par le titre.
- **Catégories** : 210 ventes sur 332 (12 mois, Ornella) sans catégorie → affichées comme « non classées », jamais
  devinées.
- **Prix affiché** : seulement quand FillSell connaît le prix publié sur la plateforme de la vente (212 ventes sur 332).
- **Stock comparé au passé** : pas de photographie du stock passé → états « aujourd'hui », sans flèche.
- **Prévisions, durées estimées** : aucune.

## 5. Garde-fous tenus
- Aucune requête de plus à l'ouverture : calcul sur les ventes et l'inventaire déjà chargés et sur la lecture « en
  ligne » existante (`useStockEnLigne`, + colonne `price`). < 15 ms par période sur le compte d'Ornella.
- Chacun ne voit que ses données (lectures RLS du compte connecté, inchangées).
- Découpage gratuit / Premium / Pro : inchangé (l'onglet Stats et son analyse IA étaient déjà ouverts à tous).
- Aucun fichier de l'extension, aucune fonction edge, aucune migration.

## 6. Vérifications
- `npm run selftest:tableau-stats` (74 vérifications), `build:essai` vert, lint des fichiers touchés vert.
- Suite complète (477 selftests, 4 en parallèle, 275 s) : tout vert sauf `selftest:brut-garde-depop-session` (§ D,
  lens-analysis « ligne EUR », né des commits Lens du 28/10 23:38-23:40 d'un autre terminal) — remis au vert par ce
  terminal dans `67e4282` (relu vert le 29/10 après le push) : suite entièrement verte.
  Deux rouges NÉS de ce lot, corrigés avant le commit : `messagerie-app` et `a-regler-sans-bandeau` épinglent la balise
  d'ouverture du conteneur de page (la largeur desktop passe donc par un attribut `data-bureau-large` posé APRÈS la
  classe) ; `aucune-estimation` lisait « jour après jour » comme un délai promis (titre devenu « jour par jour »).
- Banc d'essai local (vrais composants `DashboardTab` / `StatsTab`, données exportées d'Ornella et de Nico, aucune
  connexion) : 1 100, 1 280, 1 440, 1 920 px, panneau, téléphone 390 px (écran mobile identique).

## 7. Livraison (29/10, nuit)
- Commits `6c6455b` (lot) et `e87f4af` (version 2.9.125), poussés avec l'accord de Nico en même temps que 6 commits
  d'autres terminaux déjà commités (Lens ×3, handler-watch, migration Beebs appliquée, docs de clôture).
- **Web** : `https://fillsell.app/build.json` = `2026-10-29T05:16:51Z+e87f4af` ; script d'entrée 200 avec et sans `Origin`.
- **OTA Capgo 2.9.125** envoyée (canal production relu à 2.9.124 avant, **2.9.125** après), build d'un arbre propre
  `2026-10-29T05:16:43Z+e87f4af`. Le natif garde l'écran mobile (`useBureau` : web seulement) : l'OTA porte le calcul
  commun (en-tête, carte « Ce mois », Stats mobiles).
- **Contrôle en production** (session de Nico déjà ouverte, lecture seule, 1 536 px) : Tableau desktop (période,
  tuiles, plateformes en ligne sans vente, états vides), Statistiques desktop (12 mois, comparaison aux 12 mois
  d'avant), aucune erreur console. Correctif de suite (web seulement, sans OTA : ces écrans ne s'affichent jamais dans
  l'app native) : graduations des axes toujours rondes (« 333 € / 667 € » vus en production → 500 / 1 000 / 1 500 €).
