# Stock : cartes, menu « … », fiche de l'article — règles durables

Heure de Paris. Le récit : `docs/enquetes/cloture-fh-3110/RAPPORT.md` (31/10), `docs/enquetes/lot-h-3110/RAPPORT.md` (lot H).

## 31/10 — Depuis quand l'article est en ligne : PLATEFORME PAR PLATEFORME, partout, une seule source
- La source : `datesParPlateforme` (`supabase/functions/_shared/mise-en-ligne.js`) = la règle de l'éligibilité à la
  republication automatique (`republish_planifiee_candidats`, SQL relu en production). Jamais une autre date.
- Dans le Stock, UNE fonction la lit pour un article : `datesEnLigneDe(item)` (`src/tabs/StockTab.jsx`) — la feuille
  « En ligne depuis » (`src/stock/DatesEnLigne.jsx`), le menu « … » et la fiche s'en servent.
- La pastille de la carte = la mise en ligne la plus récente (ou celle de la plateforme filtrée « En ligne sur X ») ; un
  appui ouvre la feuille.
- Le menu « … » : UNE ligne par plateforme en ligne (« En ligne sur eBay depuis 12 j · importée »), chacune ouvre la
  feuille (retour de Nico : une ligne « En ligne depuis 5 jours » ne disait pas depuis quand sur chaque plateforme).
- La fiche (« Modifier l'article », `src/App.jsx`) : bloc « En ligne depuis » (`ResumeDatesEnLigne`), lu à l'ouverture
  de la fiche, lecture seule (rien n'entre dans l'enregistrement) ; « Détail par plateforme et historique » ouvre la
  feuille par-dessus la fiche.
- Gardes : `selftest:lot-h-dates`.

## 31/10 — La fiche s'ouvre tout de suite : le Stock ne se redessine JAMAIS pour rien
- Mesuré (banc `scripts/banc-fiche/`, vraie app en build de production, 2 900 articles, toucher réel) : 3,9 s au CPU
  d'un téléphone (×4) entre le toucher d'une carte et l'affichage de la fiche, 0,7 s sur PC. Causes : ouvrir la fiche
  (état d'App) redessinait tout le Stock (25 props neuves à chaque rendu d'App), et chaque rendu du Stock refaisait des
  parcours de TOUT le stock (dont la reconnaissance de l'objet par mots-clés, 93 % du temps).
- ⛔ `StockTab` est mémorisé : App ne lui passe JAMAIS une valeur neuve à chaque rendu — pas de flèche ni d'objet écrits
  dans la balise. Un geste passe par `useFonctionsStables` (`src/utils/fonctionsStables.js` : relais fixe, appelle la
  dernière version) ; un objet par `useMemo` ; un contenu DESSINÉ par App dans le Stock passe par un contexte
  (`src/stock/renduVivant.js`), sinon il resterait périmé quand le Stock saute son rendu.
- ⛔ Les hooks d'App se déclarent AVANT ses retours anticipés (`if(authLoading||appLoading)return(`), sinon erreur React
  310 au premier chargement (vu au banc le 31/10).
- ⛔ Un parcours de tout le stock (à publier, à remonter, republiables, horloge du poste…) est mémorisé sur ses entrées ;
  s'il lit l'heure, il dépend de `minuteCourante` (horloge locale d'une minute, en transition — aucune lecture de la base).
- Une fonction pure et coûteuse appelée par article (ex. `detectObjectIcon`) se mémorise par son texte
  (`src/utils/republication.js`, `iconeObjetMemorisee`).
- Gardes : `selftest:fiche-rapide` (pas de prop neuve, parcours mémorisés, même verdict que le calcul direct).
- Re-mesurer : `node scripts/banc-fiche/construire.mjs <racine> <sortie> <export.json>` puis
  `node scripts/banc-fiche/mesurer.mjs <sortie> chromium 4 2900` (Event Timing : toucher → image suivante).

## 31/10 soir (lot I, Rosa Metra) — stock vide après une synchro à zéro
- La carte de synchro (résumé et carte) propose AUSSI « Crée ta première annonce » (photo → Lens) quand la synchro est
  finie, n'a rien trouvé et que le stock est vide (`src/stock/synchroSansRien.js`) ; « Synchroniser » reste. Lens s'ouvre
  par l'événement `fillsell:ouvrir-lens` écouté par App : aucune prop neuve au Stock.

## 31/10 soir (lot J, Rosa Metra) — le bouton « Synchroniser » dit ce qui est à jour
- Règle pure : `src/stock/boutonSynchro.js` (selftest `lot-j-3110`), branchée dans `src/stock/BlocSynchro.jsx`.
- Sous le bouton : la dernière synchro de chaque plateforme CONNECTÉE (« Vinted à jour il y a 3 min · Leboncoin à jour
  il y a 4 min ») ; une plateforme jamais lue ou « pas connectée » ne compte que si la sonde voit sa session (ou eBay
  relié par l'API) : « vient d'être connecté, pas encore synchronisé ».
- Toutes les plateformes connectées lues il y a moins de 15 min (même seuil que `demander_sync_plateforme` « recent » et
  la cadence Vinted de l'app) → bouton grisé, « Tout est à jour, prochaine synchro automatique vers XX h » (heure de
  Paris, arrondie) ; il se rouvre seul à la fin des 15 min (un rendu, aucune lecture), ou dès qu'une plateforme n'est
  plus à jour / vient d'être connectée. Stock vide mais annonces trouvées (remis à zéro) : jamais grisé (règle du 26/10).
- « Prochaine synchro automatique » : eBay API = 20 h après le dernier relevé fini (+ le tour de 10 min d'ebay-releve-api) ;
  extension = jamais avant 20 h après le dernier relevé fini, à l'heure de l'alarme quotidienne (dernier relevé
  automatique `cron` connu, 24 h) — sans relevé automatique connu, le plancher de 20 h. La plus proche est dite.
- Lectures : sessions à l'ouverture puis chaque minute SEULEMENT pendant le grisé (relectureBornee) ; relevés des 3
  derniers jours (`lireRelevesRecents`) une fois par grisé. Rien ne change à la cadence ni aux relevés automatiques.

## 01/11 (lot J, point 2 bis — compte de Nico, 2.9.144) — la carte de synchro, plus sobre
- Le détail par plateforme est REPLIÉ : il s'ouvre en touchant l'en-tête de la carte (« Synchronisé il y a… », chevron) ;
  à la place, UNE phrase : « La synchro et la surveillance des ventes sont automatiques. » (extension vue), ou, bouton
  grisé, « Tout est à jour, prochaine synchro automatique vers XX h ».
- « Synchronisé il y a… », le détail et le grisage comptent le dernier relevé RÉUSSI quel que soit son déclencheur (cron,
  veilleur, serveur, API, bouton, app) : `lireDerniersReussis` (statut done, 30 jours, index (user_id, started_at) :
  1 ms sur le compte le plus chargé), lu dans la relecture bornée du bloc ; `avecDernierReussi` : plus récent que la
  dernière synchro demandée (réussie ou non) → la plateforme est « à jour ». Les pastilles et les points à régler gardent
  la règle du 05/10 (synchros de la personne seulement). Cas : Vinted « 29/10 » (bouton) alors que le cron avait réussi le
  30/10 à 20:05, eBay « 29/10 » alors que l'API avait relevé le 31/10 à 10:10.
- Même composant sur le site et l'app mobile (BlocSynchro).

## 03/11 — « Remonter mes annonces » plateforme par plateforme (rapport `docs/enquetes/six-points-0311/RAPPORT.md` § 3)
- Choix de la plateforme (pastilles : celles où une annonce est republiable MAINTENANT, `plateformesRepubliables` ; eBay
  jamais, décision du 02/11), date de CETTE plateforme sur chaque ligne, tri par dernière publication ou republication
  (date inconnue à la fin). Une seule source : `datesParPlateforme` (suivi du 31/10) — `src/stock/remonterParPlateforme.js`.
- Plateforme choisie → la feuille de republication s'ouvre avec cette seule plateforme cochée
  (`ouvrirFeuilleRepublication(choisis, [plateforme])`, `repubSheet.choix`). La sélection repart à neuf à chaque
  changement de plateforme ou de tri (`EcranSelection.cleSelection`).

## 05/11 — la barre d'un job : une seule source, la base
- La position d'une barre de job est `positionJob` (`src/utils/barresJobs.js`) : fonction pure du job (republish_step,
  statut, horodatages en base) et de l'heure — même chiffre sur la carte, dans la file, la feuille, web et app ; posée
  dès l'affichage (piste `reprise`), jamais remontée depuis 0 ; une portion par phase écrite en base, jamais de débord,
  jamais en recul (essai raté = posé sur CAP_ESSAI). Un départ de plus de 6 h reste un départ. Ni l'ordre ni la logique
  des étapes ne changent. Selftest `barre-job-position`.

## 05/11 matin — Le bandeau « En cours » du Stock : la barre du job qu'il nomme
- La barre du bandeau (photo, « Leboncoin · republication », « N sur M ») est celle du job NOMMÉ : `pisteJob` (étape lue en
  base, `positionJob`), la même que sa ligne dans « Ta file », une instance par job (`key`). « N sur M » reste le compte
  de la fournée. Avant : `fraction = faites/total` + glissement compté depuis l'affichage — 0 % tant qu'aucune plateforme
  n'était FINIE (Nico, 05/11 10:20 : « 0 sur 3 », barre vide, la file à 72 % et 79 %), retour au début à chaque
  réouverture. Vu sur le vrai écran (WebKit iPhone, profil isolé) : bandeau 0 % face à 46 % dans la file avant le
  correctif. Selftest `barre-job-position` (bandeau).
