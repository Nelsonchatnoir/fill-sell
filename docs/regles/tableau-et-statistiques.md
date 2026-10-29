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
