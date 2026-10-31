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
- **Article en ligne sur 5 plateformes, code de l'OTA 2.9.142 (commit 1efadd9), viewport de téléphone (banc, données
  du compte de Nico)** — « Sweat Tommy Jeans bleu marine – Taille M » :
  - menu « … » : « En ligne sur Depop depuis 5 j » · « En ligne sur Beebs depuis 5 j · importée » · « En ligne sur eBay
    depuis 5 j · importée » · « En ligne sur Vinted depuis 32 j · importée » · « En ligne sur Leboncoin depuis 51 j ·
    importée », chacune ouvre la feuille ;
  - fiche : bloc « En ligne depuis » — Depop 26 oct. 2026 à 11:58 publiée par FillSell ; Beebs et eBay 26 oct. à 11:13,
    Vinted 28 sept. à 21:57, Leboncoin 10 sept. à 10:52, importées — et « Détail par plateforme et historique » → la
    feuille (5 plateformes en ligne, historique de chacune).
- **Production web** : EN ATTENTE — le push sur main (16ffa59, 1efadd9) a été refusé deux fois par le classifieur de
  Claude Code ; tant que Nico ne l'a pas fait, fillsell.app sert dbbc512 (lot H sans ces deux ajouts).
- **Téléphone** : le bundle 2.9.142 est servi et actif (§ 3) ; aucun téléphone n'est accessible depuis ce poste — rien
  n'a été vu sur un appareil réel.

## 3. OTA
- Les points 2 et 4 changent le code : le `dist/` de dbbc512 (2.9.141, jamais envoyé) n'a PAS été envoyé ; nouvelle version.
- Canal production lu **2.9.140** → version **2.9.142** (commit 1efadd9, `npm run build` sur arbre propre : build
  `2026-10-31T14:07:21Z+1efadd9`) → `npx @capgo/cli@8.99.0 bundle upload --channel production --bundle 2.9.142 --path dist`
  (5,7 s) → canal relu : **production = 2.9.142** (bundle du 31/10 15:07:49). Le bundle contient le lot H (pastille,
  feuille « En ligne depuis », filtre « En ligne sur X », tri « Mise en ligne récente ») et les points 2 et 4.
- **Actif** : à 15:41, 3 comptes tournent déjà le bundle (`profiles.app_build` = `2026-10-31T14:07:21Z+1efadd9`, posé
  par l'app au lancement) ; le téléphone de Nico ne l'avait pas encore pris (il le prend à la prochaine ouverture de
  l'app, puis au redémarrage suivant). Je n'ai pas accès à un téléphone : ce que montre l'app est vu au banc, en
  viewport de téléphone, sur le même code (commit 1efadd9) — voir § 2.

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

### d. Avant / après (même banc, même mesure : toucher → image suivante, médiane de 6 touchers)
Première série (≈ 14:00–14:20, machine calme ; « avant » = bef6d1a, « après » = code final avant les derniers ajouts) :

| Banc | Avant | Après mémoire des icônes | Après (final) |
|---|---|---|---|
| PC (Chromium ×1), 2 900 articles | 704 ms | 88 ms | 40 ms |
| Android milieu de gamme (×4), 2 900 articles | 3 928 ms | 320 ms | 104 ms |
| Android entrée de gamme (×6), 2 900 articles | 6 608 ms | 576 ms | 152 ms |
| Android ×4, stock de Nico (44 articles) | 184 ms | — | 104 ms |
| iPhone (WebKit, CPU du PC), 2 900 articles | ne se pose jamais (> 4 min sans qu'une carte soit stable) | — | 40 ms (Event Timing), 50 ms à l'image |

Série finale (≈ 15:10–15:25, même banc, « après » = commit 1efadd9 = l'OTA 2.9.142, avant et après mesurés à la suite ;
la machine était plus chargée — Chrome de Nico, extension — d'où un « avant » plus lent que dans la première série) :

| Banc | Avant (bef6d1a) | Après (1efadd9) |
|---|---|---|
| PC (Chromium ×1), 2 900 articles | 1 400 ms | **56 ms** |
| Android milieu de gamme (×4), 2 900 articles | 8 896 ms | **208 ms** |
| Android entrée de gamme (×6), 2 900 articles | 14 880 ms | **344 ms** |
| Android ×4, stock de Nico (44 articles) | 400 ms | **216 ms** |
| iPhone (WebKit, CPU du PC), 2 900 articles | ne répond pas en 15 min (aucune carte « stable ») | **64 ms** |
| iPhone (WebKit, CPU du PC), 500 articles | 3 696 ms | **64 ms** |

Ce qui reste dans l'« après » : le rendu d'App lui-même et la création de la fiche (≈ 30 ms de JS au CPU ×4, puis la
peinture du voile flouté). Le Stock n'est plus redessiné ; taper une lettre dans la fiche ne le redessine plus non plus.

## 5. Beebs — preuve de la republication complète : PAS FAITE (l'annonce n'est jamais sortie de vérification)
- Relevé Beebs du compte de Nico demandé à 13:20 (geste « Synchroniser », `…_lot_f_releve_beebs_nico.sql`) : 13 annonces
  en ligne + 1 en vérification (33640171, un article réel) ; **34270410 (déposée le 31/10 à 11:46) n'apparaît ni en
  ligne ni en vérification**. Même chose pour les dépôts de test du 30/10 34268419 et 34267794, marqués
  `pas_encore_visible` (« jamais vue en ligne ») depuis la nuit. Beebs ne met pas en ligne ces annonces de test.
- Rien n'a été forcé : 34270410 et sa fiche (1793438700001) restent en place, sa publication 18d07d9c inchangée. La
  republication Beebs n'a pas été lancée (elle ne pourrait que viser une annonce que Beebs ne montre pas). À reprendre
  quand Beebs la met en ligne : `…_lot_f_releve_beebs_nico.sql` pour le voir, puis le parcours du lot F.
- Relevé suivant, 15:26:28 : identique (13 en ligne, 1 en vérification — 33640171) ; 34270410 toujours invisible.
  **Le parcours complet de republication Beebs reste à prouver** quand Beebs mettra une annonce de test en ligne.

## 6. Fin de dossier et non-régression
- update-job-status : non modifié, non déployé (v160, verify_jwt faux, relu).
- **Republication Vinted et Leboncoin** (compte de Nico, annonces de test à 999 €, file ACTIVE, v313 ;
  `…_cloture_fh_4_publications_nico.sql`, `…_5_republications_nico.sql`) : publication 5842ee5e → Vinted 10607666666
  (14:39), ee17adb2 → Leboncoin 3299212696 (14:38) ; republications manuelles 14:39:51 : **Vinted 7667d391 →
  10607800394 (14:48:21)**, **Leboncoin fc8c5e64 → 3299231853 (14:53:44)** — captured → deleted → recreated, une à la
  fois, aucune annonce en double.
- **Relevé et rattachement** : relevé Leboncoin demandé à 14:42:06 pendant que fc8c5e64 attendait (captured) → la
  synchro ATTEND la remise en ligne (garde existante « ta synchro attend une remise en ligne ») et part à 14:54:16, juste
  après la recréation : « 16 en ligne lues sur 16 annoncées … disparues 0 » ; la nouvelle annonce 3299231853 est
  rattachée à SA fiche (1793438700001) par son numéro (source `job`), aucune fiche neuve, rien daté disparu.
- **« Republier en lot » puis « Tout annuler »** (file en pause, `…_7_lot_annule_nico.sql`, mêmes écritures que l'app) :
  la republication Vinted d9349c7a créée dans un lot puis annulée (« Annulée à ta demande — ton annonce est restée en
  ligne. », `arret_utilisateur`, `hors_quota`), rien n'est parti ; Leboncoin refusé à la création par le serveur
  (`cadence_24h` : republiée à 14:53 — garde normale, vérifiée dans une transaction annulée, rien écrit).
- **Fin des essais** (`…_6_fin_nico.sql`) : retraits 45362eb6 (Vinted 10607800394) et 9491204e (Leboncoin 3299231853)
  servis malgré la pause, faits ; file EN PAUSE (relu : `file_pause.active = true`), comme Nico l'avait laissée ; aucun
  job ouvert sur son compte.
- **Pause et reprise de file** (bouton de l'app, `file_pause_basculer`) : reprise 14:27:24 → la publication part ;
  pause 14:30:08 → la republication bd133ac9 reste en attente au poll de 14:31:58 (« file EN PAUSE → 1 … gardée ») ;
  reprise 14:35 (…_4) → publications et republications servies ; pause 15:04 (…_7) — relu à 15:06 : `file_pause.active = true`.
- **Enregistrement de la fiche** : `handleEditSave` n'est pas touché (aucune ligne du diff dans la fonction). De bout en
  bout au banc sur le code de l'OTA (`scripts/banc-fiche/enregistrer.mjs`, le faux client NOTE les écritures, rien
  n'atteint la base) : toucher la Veste de test → fiche ouverte avec son bloc « En ligne depuis » → nom et emplacement
  modifiés → « Enregistrer » → l'app envoie l'`update` d'`inventaire` avec les 13 champs habituels (nom « … (banc) »,
  emplacement « Banc A1 »), la fiche se ferme, la carte montre le nouveau nom ; les dates par plateforme ne sont JAMAIS
  envoyées. Sur fillsell.app : en attente du push (voir § 2).
- **Filtres et tris du Stock** : `selftest:stock-refonte` (102) et `selftest:lot-h-dates` (55) verts ; les parcours
  mémorisés (à publier, à remonter) gardent leurs entrées (`selftest:fiche-rapide`).
- **Suite complète** : 506 selftests, 0 rouge (14:48 → 15:01, sur le commit 16ffa59), `build:essai` vert, lint : aucun
  problème nouveau (App 51 = 51, StockTab 15 = 15 ; fichiers neufs propres).

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
  Leboncoin demandé à 14:42:06 (`…_cloture_fh_8_releve_lbc_nico.sql`) → il attend la remise en ligne (deuxième
  ceinture, existante), part à 14:54:16 : 16/16 lues, **disparues 0**, aucune annonce datée disparue ; la republication
  a abouti normalement (3299212696 → 3299231853 à 14:53:44), la nouvelle annonce rattachée par son numéro. La migration
  du 31/10 n'a pas eu à jouer ici (même fiche) ; elle est prouvée par sa lecture en production (582 / 582) et son selftest.
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
