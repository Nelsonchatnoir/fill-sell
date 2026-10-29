# Tableau et Statistiques sur téléphone — 29/10/2026

Demande de Nico (29/10) : sur téléphone (site mobile ET app iOS / Android), les tuiles et pastilles cliquables et les
nouveaux blocs de statistiques, avec le calcul unique (`utils/tableauStats.js`). Maquettes téléphone (vraies données
d'Ornella) publiées le 29/10, **écran 1 validé** par Nico (« Écran 1 go ») : le profit de la période en premier, la
carte « Profit net · depuis le début » du 16/10 n'est pas gardée. Règle durable : `docs/regles/tableau-et-statistiques.md`
§ 29/10. Suite du chantier desktop : `docs/enquetes/refonte-tableau-desktop-2810/RAPPORT.md`.

## Ce qui a changé
- **Tableau téléphone** (`ecrans/telephone/TableauTelephone.jsx`) : salutation, pastilles de période (Octobre · 30 jours ·
  12 mois · Depuis le début, mémorisées comme sur ordinateur), bloc encre « Profit · octobre » (écart, mini-courbe),
  8 tuiles de 104 px au moins, courbe cumulée (Encaissé / Profit / Ventes) lue au doigt, par plateforme, en ligne
  aujourd'hui (pastilles de 50 px), ça dort en stock, dernières ventes. Remplacés : « Profit net · depuis le début »,
  « Ce mois », Bénéfices et Marge par mois (7j-1M-6M-1A-YTD), Activité récente.
- **Feuille qui monte du bas** (`FeuilleDetail.jsx`) : le contenu du panneau de l'ordinateur (`bureau/detail.jsx`,
  extrait sans changement de rendu), mini-tuiles sur 2 colonnes, graphes au doigt, « ‹ retour » quand une plateforme
  s'ouvre depuis un indicateur. Fermeture : glisser vers le bas, ✕, toucher dehors, Échap, retour Android.
- **Statistiques téléphone** (`StatsTelephone.jsx`) : les blocs de l'ordinateur sur une colonne ; la plateforme la plus
  rentable devient une liste à 4 mini-valeurs (profit, marge, panier, délai) ; « Meilleures ventes » gardé.
- **Graphes** : mode `bandeau` (valeur au-dessus du tracé, `touch-action: pan-y`) ; échelles toujours rondes.
- **Calcul** : `meilleuresVentes` ajouté au module (selftest : 77 vérifications).

## Garde-fous
- Ordinateur inchangé (même composant `PanneauDetail`, contenu déplacé dans `detail.jsx`) ; écran de démarrage d'un
  compte vide, bandeaux du haut, encarts de quota : inchangés (restés dans `DashboardTab`).
- Aucune requête de plus : la lecture « en ligne » existante (`useStockEnLigne`) et les données déjà chargées.
- Paliers : inchangés (Stats ouvertes à tous, analyse IA comprise — même effet, même cache, même fonction).

## Vérifications
- Suite complète : 477 selftests, tous verts ; `build:essai` vert ; lint des fichiers touchés vert (seul reste
  l'avertissement ancien `EmptyStateDashboard` de DashboardTab, présent avant ce lot).
- Banc d'essai local (vrais `DashboardTab` / `StatsTab`, données exportées d'Ornella et de Nico, aucune connexion) :
  iPhone 390 px, Android 412 px, tablette 1 000 px (écran téléphone), ordinateur 1 440 px (inchangé) ; ouverture de
  feuille depuis une tuile, plateforme ouverte dans la feuille puis retour, fermeture par glissement, graphes au doigt.
- Pas de test sur un appareil iOS / Android réel depuis ce poste (aucun appareil ni émulateur connecté) : l'app native
  reçoit le même code par l'OTA ; à regarder sur le téléphone de Nico après mise à jour.

## Livraison (29/10, matin)
- Commits `34fe8a5` (lot) et `91d857b` (version 2.9.126), un seul push.
- **Web** : `build.json` = `2026-10-29T06:51:38Z+91d857b` ; script d'entrée 200 avec et sans `Origin` ; la feuille de styles du
  téléphone (`App-*.css`, `fst-feuille`) est servie.
- **OTA Capgo 2.9.126** (canal production relu à 2.9.125 avant, **2.9.126** après), build d'un arbre propre
  `2026-10-29T06:51:24Z+91d857b`.
- **Production** (session de Nico déjà ouverte, lecture seule, ordinateur) : Tableau et Stats desktop identiques, aucune
  erreur console. L'écran téléphone ne se contrôle pas d'ici sur fillsell.app (la page refuse d'être mise dans un cadre) :
  vérifié au banc d'essai sur le même code, à regarder sur le téléphone de Nico.
