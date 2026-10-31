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
