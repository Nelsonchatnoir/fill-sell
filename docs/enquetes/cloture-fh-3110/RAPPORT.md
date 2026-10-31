# Clôture des lots F et H — 31/10/2026 après-midi : déploiements restants, dates par plateforme partout, fiche rapide

Heure de Paris partout. Demande de Nico du 31/10 (après-midi), complément « point 7 » reçu en cours de route.
Rapport précédent : `docs/enquetes/lot-h-3110/RAPPORT.md`. Règles durables : `docs/regles/stock-et-fiche.md`.

## 1. get-pending-jobs « porte unique » en production
| | Avant | Après | verify_jwt |
|---|---|---|---|
| get-pending-jobs | v312 (31/10 12:23:05) | **v313** (31/10 13:14:12, code du dépôt bef6d1a) | vrai → vrai |
| update-job-status | v160 | v160 (non touché, comme demandé) | faux |

- **Avant le déploiement** (lecture seule, règle du dépôt rejouée sur le parc entier) : une seule republication du parc
  concernée, la Vinted **6b7ee9f7 de Johan** (annonce 10493362099 retirée par lui le 30/10, retrait 33f7c480).
- **Johan** : 6b7ee9f7 **close à 13:15:45** par la v313 (« Annonce retirée à ta demande : cette republication n'a plus
  d'objet… », marque `republication_retrait_demande` → retrait 33f7c480), sa file restée en pause. **Ses 209 autres
  jobs ouverts ou retraits récents : empreinte (statut + message + platform_fields) identique avant / après.**
  Aucun autre job du parc n'a reçu la marque (relu : cedf24fc de Nico à 12:48 en v312, 6b7ee9f7 à 13:15 en v313).
- **Preuve sur le compte de Nico** (annonce de test Vinted à 999 €, `scripts/essais/20261031_cloture_fh_{1,2,3}_*.sql`,
  gestes de l'app sous ses claims ; la pause retient aussi les publications : file reprise 14:27:24 pour la seule
  publication de test, remise en pause 14:30:08) :
  1. 14:24 publication 9c79f960 → **en ligne 14:29:24, Vinted 10607515096** ;
  2. 14:30:10 republication manuelle **bd133ac9**, file EN PAUSE → au poll de 14:31:58 elle reste en attente
     (`a_capturer`, « file EN PAUSE → 1 … gardée ») ;
  3. 14:32:31 retrait ciblé **05724250** (même annonce), file toujours en pause → **14:34:00 la v313 clôt bd133ac9**
     (journal : « republication vinted bd133ac9 (pending) CLOSE — retrait 05724250 (pending) de la même annonce ; rien
     recréé » ; message « Annonce retirée à ta demande… », `arret_utilisateur`, `hors_quota`,
     `republication_retrait_demande`) ; le retrait est servi malgré la pause (14:34:01) et l'annonce retirée à 14:34:10.
  La v312 ne fermait pas une republication d'une file en pause (porte après la pause) : c'est le cas que couvre la v313.
- **En attente d'un geste (`needs_user`)** : même lecture, même règle (`.in("status", ["pending", "needs_user"])`,
  `republicationFermableParRetrait`), prouvée par `selftest:republication-retrait`. Une republication réellement
  `needs_user` n'a pas pu être fabriquée proprement sur le compte de Nico (voir § 5 pour la tentative Beebs) : jamais
  d'écriture directe d'un statut pour simuler.

## 2. Depuis quand l'article est en ligne, plateforme par plateforme : pastille, menu « … », fiche
- **Ce que Nico voyait** : sur le téléphone (bundle 2.9.140, sans le lot H), le menu « … » disait « En ligne depuis 5 j »
  — l'âge de la plus ANCIENNE annonce, sans plateforme et sans détail.
- **Une seule source** : `datesParPlateforme` (`_shared/mise-en-ligne.js`, la règle de la republication automatique,
  928 dates de XEWER identiques au SQL au lot H), lue pour UN article par `datesEnLigneDe(item)` (StockTab).
- **Pastille** de la carte : inchangée (lot H) — la plus récente, ou la plateforme filtrée ; un appui ouvre la feuille.
- **Menu « … »** : UNE ligne par plateforme en ligne — « En ligne sur eBay depuis 42 j · importée », « En ligne sur
  Leboncoin depuis 9 j · republiée »… — chacune ouvre la feuille « En ligne depuis » (état, date et heure de Paris,
  publiée / republiée / importée, historique). Calculé pour le menu ouvert seulement (jamais par carte et par rendu).
- **Fiche de l'article** (« Modifier l'article ») : bloc « En ligne depuis » en tête — une ligne par plateforme en
  ligne (logo, « en ligne depuis N j », date, publiée / republiée / importée) et « Détail par plateforme et
  historique » qui ouvre la même feuille par-dessus la fiche. Lecture seule : rien n'entre dans l'enregistrement.
- Gardes : `selftest:lot-h-dates` (55, dont 7 neuves : source unique, une ligne par plateforme, fiche rendue sur les
  données réelles de GIGN — Leboncoin 9 j republiée, Vinted 11 j, eBay 42 j importée —, rien quand rien n'est daté).
- Vu au banc (téléphone, données de Nico) : fiche de la Veste de test → « Beebs · en ligne depuis aujourd'hui · 31 oct.
  2026 à 11:46 · Publiée par FillSell » et « Détail par plateforme et historique (dont 1 plus en ligne) » → feuille
  (Beebs en ligne ; Leboncoin plus en ligne, historique 3 mises en ligne dont 1 republication).
- **Production** : À COMPLÉTER (web après le déploiement Vercel ; téléphone après l'OTA).

## 3. OTA
À COMPLÉTER.

## 4. La fiche d'un article met une seconde à s'ouvrir
### a. Mesurer d'abord
- **Web, production, session de Nico (lecture seule, aucune connexion)** : rendu React du toucher ≈ 10 ms, aucune tâche
  de plus de 16 ms (Event Timing) — son compte n'a que 79 annonces et la fenêtre Chrome pilotée ne peint qu'une image par
  ~0,9 s (fenêtre masquée) : les images ne s'y mesurent pas. Nico l'a confirmé : la latence est **sur le téléphone**.
- **Aucun téléphone n'est branché au PC** (adb : aucun appareil) → **banc** (`scripts/banc-fiche/`) : la VRAIE app en
  build de production, servie en local avec un faux client Supabase (aucun réseau, aucune écriture, aucune connexion),
  sur les données du compte de Nico démultipliées à **2 900 articles / 11 670 jobs** (le plus gros stock du parc :
  2 892 ; l'export d'un compte client a été refusé — données personnelles — et n'a pas été contourné). Toucher RÉEL
  (`touchscreen.tap`) ; mesure = Event Timing (toucher → image suivante) et horloge de la page.
  - « Android » : Chromium en Pixel 7, CPU ralenti ×4 (téléphone milieu de gamme) et ×6 (entrée de gamme) ;
  - « iPhone » : WebKit en iPhone 13 (pas de ralenti possible : CPU du PC).
  Ce ne sont pas des téléphones physiques : l'ordre de grandeur et le rapport avant / après sont sûrs, pas le chiffre
  exact de chaque appareil.

### b. La cause (profil CPU du toucher, banc ×1)
- Ouvrir la fiche change un état d'**App** (`editItem`) → App se redessine → **tout le Stock se redessine** : `StockTab`
  est mémorisé, mais 25 de ses props étaient des fonctions ou objets NEUFS à chaque rendu d'App (gestes `addItem`,
  `delItem`, `markSold`…, `extensionStatus={{…}}`, `plusEnLigne={{…}}`). Taper une lettre dans la fiche faisait pareil.
- Et chaque rendu du Stock refaisait des parcours de **tout le stock** : 93 % du temps dans
  `detectObjectKeywordDetailBase` (reconnaissance de l'objet par mots-clés), appelée pour CHAQUE article par la garde
  « Depop refuse l'article » (`repubSelectionnable` → `plateformesRepubliables` → `depopRefuseLArticle`) ; puis « à
  publier », « à remonter », l'horloge du poste (aplatissement de tous les jobs), les retraits bloqués.
- Ni requête attendue, ni photo, ni animation : la fiche elle-même se monte en ~15 ms.

### c. La correction (à la racine, aucune fonction retirée)
1. `src/utils/republication.js` : l'icône d'objet mémorisée par son texte (fonction pure : même texte → même icône).
2. `src/tabs/StockTab.jsx` : les parcours de tout le stock mémorisés sur leurs entrées (`repubActionnables`,
   `repubActionnablesVue`, `aPublierTout`, `aRemonterTout`, `retardHorloge`, retraits bloqués) ; leurs règles lisent
   l'heure → une horloge locale d'une minute (`minuteCourante`, en transition, aucune lecture de la base).
3. `src/App.jsx` : le Stock ne reçoit plus AUCUNE valeur neuve à chaque rendu — gestes à identité stable
   (`src/utils/fonctionsStables.js` : relais fixe qui appelle la dernière version, posée après le rendu validé), objets
   mémorisés (`extensionStatusStock`, `plusEnLigneStock`, `messagerieStock`), la feuille « Plus en ligne » dessinée par
   App passe par un contexte (`src/stock/renduVivant.js`) pour suivre chaque saisie. Vérifié au banc : à l'ouverture de
   la fiche, 0 prop du Stock changée (25 avant).
- Garde-fous : la fiche est inchangée (mêmes champs, même enregistrement `handleEditSave`, aucune valeur provisoire) ;
  les gestes appellent exactement les mêmes fonctions ; `selftest:fiche-rapide` (16) : même verdict Depop que le calcul
  direct sur 680 cas, aucune prop neuve dans la balise du Stock, parcours mémorisés, relais = dernière version.
  Un premier essai avait placé les hooks après un retour anticipé d'App : erreur React 310 vue AU BANC, corrigée avant
  tout commit (règle écrite dans `docs/regles/stock-et-fiche.md`, vérifiée par le selftest).

### d. Avant / après (même banc, même mesure, médiane de 6 touchers)
À COMPLÉTER.

## 5. Beebs — preuve de la republication complète : PAS FAITE (l'annonce n'est jamais sortie de vérification)
- Relevé Beebs du compte de Nico demandé à 13:20 (geste « Synchroniser », `…_lot_f_releve_beebs_nico.sql`) : 13 annonces
  en ligne + 1 en vérification (33640171, un article réel) ; **34270410 (déposée le 31/10 à 11:46) n'apparaît ni en
  ligne ni en vérification**. Même chose pour les dépôts de test du 30/10 34268419 et 34267794, marqués
  `pas_encore_visible` (« jamais vue en ligne ») depuis la nuit. Beebs ne met pas en ligne ces annonces de test.
- Rien n'a été forcé : 34270410 et sa fiche (1793438700001) restent en place, sa publication 18d07d9c inchangée. La
  republication Beebs n'a pas été lancée (elle ne pourrait que viser une annonce que Beebs ne montre pas). À reprendre
  quand Beebs la met en ligne : `…_lot_f_releve_beebs_nico.sql` pour le voir, puis le parcours du lot F.
- Relevé suivant : À COMPLÉTER (fin de travail).

## 6. Fin de dossier et non-régression
- update-job-status : non modifié, non déployé (v160, verify_jwt faux, relu).
- **Republication Vinted et Leboncoin** (compte de Nico, annonces de test à 999 €, file ACTIVE, v313 ;
  `…_cloture_fh_4_publications_nico.sql`, `…_5_republications_nico.sql`) : publication 5842ee5e → Vinted 10607666666
  (14:39), ee17adb2 → Leboncoin 3299212696 (14:38) ; republications manuelles 14:39:51 : Vinted 7667d391, Leboncoin
  fc8c5e64 → À COMPLÉTER.
- **Pause et reprise de file** (bouton de l'app, `file_pause_basculer`) : reprise 14:27:24 → la publication part ;
  pause 14:30:08 → la republication bd133ac9 reste en attente au poll de 14:31:58 (« file EN PAUSE → 1 … gardée ») ;
  reprise 14:35 (…_4) → publications et republications servies ; pause finale : À COMPLÉTER.
- À COMPLÉTER : « Tout annuler » sur un lot, relevé et rattachement, filtres et tris, enregistrement de la fiche.

## 7. Décisions de Nico sur les deux « à décider » du lot F
### a. « captured » compte comme une republication engagée — APPROUVÉ
- **Ce qui existait** (audit en lecture seule de tous les chemins, définitions lues en production) : depuis le 22/10
  (migration 20261022200000), `republication_engagee` (captured, deleted, ou retrait engagé ; statut non terminal) garde
  les trois chemins par lesquels un relevé date une annonce disparue ou ouvre « Vendue ? » :
  `constater_absences_releve` (relevés de toutes plateformes, Beebs exclu), le déclencheur
  `cross_post_jobs_alerte_tenue` (tout signal neuf : relevé, veilleur, dépôt sans lien — 71 alertes effacées depuis le
  24/10, dont 61 de Johan) et `inventaire_disparu_garde_republication` (sync dressing Vinted, doublée côté extension :
  les 964 republications Vinted vivantes portent toutes `vinted_item_id`). Le reste (get-pending-jobs, handler-watch,
  moteur, eBay) ne date rien pendant une republication engagée. **« captured » était donc déjà couvert : rien refait.**
  La note « migration à décider » du lot F était périmée (corrigée dans `docs/regles/rapprochement-et-releves.md`).
- **Le trou réel** : la garde se cherchait par FICHE seulement. Une annonce visée rattachée à une autre fiche (doublon
  créé par le moteur, défusion) ou à aucune n'était pas protégée. Aucun cas aujourd'hui (395 republications engagées hors
  Vinted : annonce visée toujours sur sa fiche), mais rien ne l'empêchait.
- **Comblé** : migration **20261031150000** (feu vert du point 7a ; définitions relues en production juste avant,
  identiques ; appliquée à 14:45:09 par `db query -f`, `migration repair --status applied`) : `republication_engagee_numero`
  (mêmes étapes, numéro visé lu dans la colonne, `old_platform_listing_id`, l'instantané, `vinted_item_id`, le lien), ajoutée
  aux trois gardes. Inverse : `supabase/rollbacks/20261031150000_republication_engagee_par_numero_INVERSE.sql` (les
  définitions d'avant, texte de production). Aucune donnée réécrite. Relu après : les trois fonctions portent la garde,
  **582 / 582 republications engagées retrouvées par leur numéro** ; coût mesuré (EXPLAIN ANALYZE, Johan) : 3,9 ms, index
  `cross_post_jobs_user_status`. Selftest : `selftest:republication-engagee-numero` (17).
- **Preuve sur le compte de Nico** : republication Leboncoin de test fc8c5e64 à l'étape « captured » (14:40:42) ; relevé
  Leboncoin demandé à 14:42:06 (`…_cloture_fh_8_releve_lbc_nico.sql`) → À COMPLÉTER.
- **Comptes réels** (30 derniers jours) : depuis le 22/10 21:14, **0 annonce datée disparue ni « Vendue ? » posée par un
  relevé pendant une republication engagée**, Sébastien et Johan compris. Avant la garde (à regarder, NON réparé) :
  7 annonces Leboncoin datées disparues pendant une republication engagée — jocabroc8 3279968973 (08/10), voirememe
  3247959211 (15/10), hu.anastasia 3264157655 (19/10), nino57270 3290997674 (20/10), baptiste.giboire 2837829331
  (21/10), xxewwer 3286804038 (21/10, étape captured), louis 3285974950 (21/10). Sébastien : 76 dates écrites APRÈS la
  recréation (l'ancienne annonce était vraiment partie : conforme). Johan : deux « Vendue ? » ouverts sur des fiches
  dont une republication attend (annonces 3297733232 et 3297738346, ses propres remises en ligne du 30/10, déplacées sur
  ces fiches par la fusion du 31/10 10:23 — elles ne sont PAS les annonces visées par ces republications) : à regarder,
  non réparé.
- **Ouvert, à décider** : une republication `published` à l'étape `recreated` dont la recréation n'est pas confirmée est
  hors garde (Johan 29/10 : « Vendue ? » posé sur les NOUVELLES annonces 3296005486 et 3296315778, levé par handler-watch
  le 30/10).

### b. Rattachement automatique d'une remise en ligne au prix changé — REFUSÉ
Rien ne change : la question au vendeur reste. Écrit dans `docs/regles/rapprochement-et-releves.md`.
