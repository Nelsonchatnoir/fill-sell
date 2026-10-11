# Lot unique du 11/10 — rapport (Claude, mandat de Nico)

> Partie A codée, commitée, déployée, prouvée ; partie B : études seulement, rien codé.
> Versions relues en prod le 11/10 vers 12:10 Paris.

## Livrables

| Où | Quoi | Version / chemin |
|---|---|---|
| App | OTA servie (canal `production`) | **2.9.80** (`2026-10-11T09:58:27Z+fae2c89`) |
| Serveur | `get-pending-jobs` | **v233** (`verify_jwt` true, lu avant/après) |
| Serveur | `handler-watch` | **v96** (`verify_jwt` false, lu avant/après) |
| Base | migration 20261011120000 (A5) | **APPLIQUÉE** + inscrite (feu vert nommé) |
| Base | migration 20261011130000 (A2) | **APPLIQUÉE** + inscrite (feu vert nommé) |
| Extension | zip 0.6.107, seul dans son dossier | `C:\Users\nicol\fill-and-sell\build\CWS-0.6.107-A-TELEVERSER\fillsell-extension-0.6.107-85d1b89-cws.zip` (BUILD_ID `2026-10-11T09:59:16Z+85d1b89`) |
| Extension | anciens zips écartés | 0.6.106 → `build/anciens-zips/CWS-0.6.106-9d442ae-PUBLIEE-SERVIE-11-10` ; 0.6.105 → `…/CWS-0.6.105-8f88cdd-REMPLACE-JAMAIS-TELEVERSE` |

Selftests : câblés 250/251 → **256/257** (6 nouveaux ; seul rouge : `veille-commandes`, rouge avant) ;
non câblés 40/41 → 40/41 (rouge avant : `beebs-republication-prevol`). Deux selftests réécrits sur la
NOUVELLE règle Opla (A3/A4 révoqués : `opla-sortie`, `bascule-opla-depop`), deux lisent l'écriture via
`pfAPersister` (`tache-sans-demarrage`, `beebs-age-republication`) — mêmes assertions.
Preuves en transaction annulée : A5 15/15, A2 21/21, `preuve:push-ventes` 31/31, `preuve-mails-ventes` 27/27.

## A1 — lien du mail « Vendu » ouvert déconnecté

- **Cause** : `RequireAuth` renvoyait vers « / » avant que l'app lise `?ventes=a-decider`, et ne retenait que
  le chemin (`/app`, hors liste fermée) ; le défilement partait une seule fois à 400 ms, souvent avant que la
  liste (lue sans l'attendre) soit peinte.
- **Changé** : `/app?ventes=a-decider` entre dans la liste FERMÉE des cibles d'après connexion (seul ce
  paramètre ; `/extension` inchangé, TTL 30 min, consommation unique) ; connexion e-mail, Google web, Apple et
  Google natifs l'honorent ; inscription et confirmation d'inscription inchangées ; l'app attend que la liste
  soit peinte (10 s au plus, sans relire la base).
- **Ce que les gens voient** : lien du mail → connexion → Stock, la liste « Ventes à confirmer » à l'écran.
- `selftest:lien-ventes-apres-connexion`. Commit b14983c.

## A2 — sortie d'Opla : plus rien ne part vers Opla

- **Inventaire de `opla_ouvert`** : ne commandait plus rien depuis le 18/09 (seule lecture : l'app, valeur
  jamais utilisée). Le vrai interrupteur était déjà `opla_sortie_le`. `opla_ouvert` → 0 (journalisée),
  l'app ne la lit plus.
- **Causes** : la règle du 02/10 gardait aux comptes « reliés » relevés, ventes et retraits (A3), et ne
  fermait jamais un retrait Opla (A4) ; l'extension relevait Opla elle-même (alarme quotidienne, veilleur)
  et relisait les annonces Opla publiées. Le retrait de 10:10 chez ornellaracano venait de
  `inventaire_vendu_retire_ses_copies` → `armer_retrait_job`.
- **Un job Opla bloquait-il la file ? NON** (vérifié) : `get-pending-jobs` ne sert pas Opla à un poste sans
  accès, l'extension le saute en ~0 s. Chez ornellaracano, ce qui attend : 3 republications Vinted d'une
  AUTRE boutique (« ornella-vend ») retenues tant que Chrome est sur @luciatrendyshop.
- **Changé (une source, `opla_sortie_le`)** : base (mig 20261011130000) — tout job Opla qui naît ou redevient
  vivant est clos avec un message vrai, aucune ligne de relevé Opla, « Synchroniser » refuse Opla, aucune
  question « Déjà vendu ? » sur une copie Opla ; `get-pending-jobs` v233 et `handler-watch` v96 : rien servi,
  rien relancé, rien demandé ; extension 0.6.107 : plus de relevé, veille, sonde ni job Opla ; app 2.9.80 :
  Opla disparaît (tuile de relevé, Réglages, « Vendu sur Opla », logo et retrait sur la carte), l'historique
  se lit sans erreur.
- **Rattrapage** (par la règle, sauvegarde `_backup_1110_opla_*`, 0 note, 0 mail) : **31** jobs Opla clos
  (tous des retraits, avec ta phrase), 1 relevé en file clos, 25 questions sur des copies Opla caduques.
- **Ce que les gens voient** : plus aucune trace d'Opla dans l'app ; un retrait Opla clos dit « Opla n'est plus
  pris en charge par FillSell : cette annonce vendue est peut-être encore en ligne sur Opla, retire-la
  toi-même sur Opla. »
- **Reste** : les extensions ≤ 0.6.106 relisent encore les pages Opla publiées (veilleur) jusqu'à la 0.6.107 —
  aucun levier serveur ; la republication planifiée Opla est coupée par `republish_planifiee_pf_opla` = 0
  (un second interrupteur, laissé tel quel ; les 3 profils encore « actifs » sur Opla sont ignorés).

## A3 — republications Vinted qui ne démarrent jamais

- **(a) Qui a produit les copies « serveur »** : la CAPTURE vient de l'extension 0.6.102 (07/10 22:09-22:25 UTC) ;
  la COPIE était servie en mémoire par `get-pending-jobs` (`copieRepublishDepuisCapture`) et FIGÉE en base
  par l'écriture de mise de côté « tâche sans démarrage » (partie du `platform_fields` servi). Pas la cause.
- **(b) Pourquoi le silence** : l'invariant « une seule annonce hors ligne à la fois, par plateforme » de
  l'extension rendait « skipped » SANS RIEN ÉCRIRE tant que le Cendrier (166e5729) était à l'étape
  'deleted' : Vinted **restreint les mises en vente** de @stilyjoe (`/selling-restriction`) depuis le 07/10
  22:08 — 28 essais de remise en ligne, texte faux « rien à faire ». 61-62 services, puis mise de côté.
- **(c) Règle** : une tâche servie est démarrable, ou retenue AVANT d'être servie avec son motif.
  `get-pending-jobs` v233 ne sert plus une republication 'captured' retenue par une autre à 'deleted' ; motif
  écrit une fois (« En attente : ton annonce « … » a été retirée et n'est pas encore revenue en ligne… Rien
  n'a été retiré. » + la restriction Vinted nommée), réservation remise à zéro, toutes les retenues du compte
  le disent ; ce qui est servi en mémoire ne s'écrit plus jamais (`pfAPersister`). Extension 0.6.107 : même
  retenue écrite, `/selling-restriction` reconnu (recul 1 h/3 h/6 h, texte vrai), capture bornée à 90 s.
- **(d) Les 8** : relancées par la voie de la relance (erreurs archivées, copie servie retirée → l'extension
  recapture avant tout retrait) ; elles attendent, motif affiché, la remise en ligne du Cendrier. **Rien n'est
  retiré de Vinted** tant que la restriction n'est pas levée. ⚠️ À dire à jonathanrabany AUJOURD'HUI : son
  Cendrier (10144207409) est hors ligne depuis le 07/10 ; c'est à lui de lever la restriction chez Vinted.
- **(e) ltouze (4cb3085f)** : la sonde de capture ne répondait jamais (attente 300 s > vie du service worker,
  cycle mort sans écrire, file figée 19,5 h ; même article figé 3 fois) — bornée à 90 s dans la 0.6.107 ;
  tâche laissée telle quelle (son Chrome n'est plus vu depuis le 07/10).
- **Reste** : 7 republications à l'étape 'deleted' en attente depuis août sur 4 autres comptes (boujeantgab,
  marieange.fleurant7 ×2, steve.knl1984 ×3, manonboni) : leurs annonces sont hors ligne et retiennent les
  autres republications — désormais dit à l'écran ; à traiter à part. Beebs 5a5d21ff (privaterelay) :
  « tâche sans démarrage », non étudiée.

## A4 — publier en masse depuis le Stock (Louis)

- **Constat** : le mode de sélection du lot existait (cases, « Tout (N) », Continuer) mais n'avait plus de
  porte depuis la refonte des gestes du haut (03/10).
- **Changé** : porte discrète « Choisir des articles à publier » ; la sélection porte sur la liste FILTRÉE
  (recherche, filtres, tri gardés) et la règle unique du lot ; « Continuer » ouvre `LotPublication`
  (mêmes quotas, questions, plateformes écartées, poids facultatif ; seulement les plateformes où l'article
  n'est pas déjà). Plafond du lot inchangé : **20 articles** (« Tout (N) » coche les 20 premiers de la vue).
- **Preuve** : vrai StockTab, données fictives, 390 et 360 px (`scripts/apercu/capture-selection-publier.mjs`).
- **Reste (à trancher)** : relever le plafond de 20 pour les gros stocks (Louis) — non fait, le lot ne bouge pas.

## A5 — ventes sans ligne en compta

- **Cause exacte** : la migration 20261009130000 a posé un déclencheur exécuté avec les droits de l'APPELANT
  qui appelle `_ts_ou_null`, fermée à `authenticated` depuis le 27/09 → depuis le 09/10 ~12:00, **tout signal
  de vente Vinted posé par l'extension tombait en 403** (7 797 refus en 24 h) ; le repli de l'extension
  passait la fiche « vendu » sans ligne de vente ni retrait des copies. Même classe que le 04/10.
- **Changé** (mig 20261011120000, appliquée sur feu vert) : le déclencheur en SECURITY DEFINER (corps
  inchangé) ; règle en base : une fiche passée « vendu » par le dressing alors qu'un job Vinted vivant porte
  l'annonce exacte et qu'aucune vente n'est écrite reste en stock et le signal part sur le job → vente
  prouvée (une ligne, le stock, les retraits) ; sans preuve, « Vendue ? ». Contrôle de classe :
  `selftest:declencheurs-droits --prod` (aucun des 25 déclencheurs aux droits de l'appelant n'appelle une
  fonction fermée).
- **Rattrapage** (par la règle, sauvegarde `_backup_1110_ventes_vinted_*`, 0 mail, 0 notification) : 51
  fiches / 18 comptes → **37 ventes enregistrées** (4 retraits de copies armés), **14 laissées à « Vendue ? »**
  (prix à confirmer). Louis : comme les autres (ta décision). Relu après : 0 fiche restante ; 23 signaux de
  vente Vinted acceptés dans l'heure qui a suivi (0 depuis le 09/10 11:43 avant).
- **Reste** : 22 fiches plus anciennes (03/09 → 03/10, hors de la fenêtre de l'incident) dans le même état —
  non touchées, à trancher.

## Preuves de push

`preuve:push-ventes` 31/31 et `preuve-mails-ventes` 27/27 : scénarios recalés sur les règles du 06/10 soir
(annonce vue en ligne) et du 09/10 (mail après la vente enregistrée), assertions inchangées.
⚠️ `preuve-vente-signalee-une-fois` : sa partie R lit les VRAIES ventes de Louis ; il les a traitées
lui-même dans l'app à 10:33-10:38 (5 lignes, 5 reçus) — la liste est vide, R2c-R5b n'ont plus d'objet
(partie S verte). Rien à voir avec ce lot.

## B1 — injecter en parallèle sur les plateformes (étude)

- **Aujourd'hui** : le serveur raisonne déjà par plateforme (une étape « retrait » et une « relevé » par
  plateforme et par passage, « un seul retrait en vol » par plateforme) ; restent communs au compte le plafond
  du jour et la pause de respiration (50 d'affilée → 120 min). L'extension fait tout EN SÉRIE sous un verrou
  unique (`withJobFlowLock`), un onglet par plateforme mais un seul travaille, 8-20 s entre deux jobs.
  **Goulot** : une horloge de geste UNIQUE (`dernierGesteRepublishAt`, 2 min) partagée par toutes les
  plateformes. Créneaux qui se chevauchent = temps partagé : **choix de conception** du 18/09 (« un seul
  Chrome pour quatre plateformes »), pas une contrainte anti-robot. Chez Louis, l'alternance des soirs venait
  de SES jours cochés.
- **Défaut trouvé** : l'espacement des créneaux ne fait que monter (médiane des écarts que le balayage impose
  lui-même) : Louis Beebs 900 → 1 319 s (−32 % de capacité), LBC 900 → 1 084 s ; un compte Vinted 354 → 2 866 s.
- **Gain mesuré** : ÷ 4 réaliste pour la PUBLICATION EN LOT multi-plateforme et les retraits (20 articles ×
  4 plateformes : ~1 h 40-2 h 15 → ~25-35 min) ; republications ÷ 1,5 à 2,5 au mieux (l'espacement par
  plateforme borne) ; hu.anastasia (219 en file, Vinted seule) : 0 gain ; XEWER : ÷ 1,5 ; Louis : 0 aujourd'hui.
- **Risques** : charge du PC (2-4 pages lourdes), plusieurs jobs coupés d'un coup si le service worker meurt,
  pause de respiration atteinte 4× plus vite (à rendre par plateforme), collisions d'un même article (nouvelle
  garde : jamais deux jobs du même article en vol), bfcache (vu sur eBay) plus probable.
- **Étapes, chacune réversible** : **É0 (1re étape sûre, serveur seul)** casser le cliquet d'espacement
  (max(plancher, durée réelle)) — test en transaction annulée, 0 job ; **É1** créneaux de plateformes
  différentes le même soir sans partage du temps (balayage + capacité partagée) — test réel chez Nico, 2 annonces
  ≥ 999 € ; **É2** horloge de geste par plateforme (petit, extension, coupure par interrupteur serveur) ;
  **É3** vrais workers parallèles (gros chantier, concurrence 1 → 2 → 4). Détail :
  `docs/enquetes/lot-1110/B1-B2.md`.

## B2 — rythme promis / rythme réel (Louis)

- Vérifié : 41 republications Leboncoin en 7 jours (40 publiées), 11 à 18 prévues par créneau, espacement
  900-1 079 s, 96 éligibles au 10/10, 200 annonces LBC en ligne.
- **Formule** (côté serveur, `republish_planifiee_etat`) : capacité d'un créneau = `capacite((fin−début), espacement)` ;
  débit/jour = capacité × taux réalisé (0,91) borné par les plafonds × jours cochés / 7 ; **jours entre deux
  passages = max(âge réglé, annonces en ligne / débit)**. Louis : ancien réglage ≈ 69 j (≈ 3 semaines sur les
  ~137 en rotation) ; réglage d'aujourd'hui (tous les jours 17:00-23:59) ≈ **10 jours** pour 7 réglés.
- **Affichage** : `src/components/RepublicationPlanifiee.jsx`, bloc « Aujourd'hui » : « Avec tes 200 annonces
  en ligne sur Leboncoin, chacune repassera environ tous les 10 jours (tu as réglé 7). », ambre au-delà de
  1,5 × le réglage. Une clé `rotation` dans `republish_planifiee_etat` (migration → feu vert).
- **Leviers** : (1) cliquet d'espacement (+20 % LBC, +47 % Beebs chez Louis, risque faible) ; (2) créneau
  quotidien/plus long (fait par Louis) ; (3) plancher LBC/Beebs < 900 s (+50 % à 600 s, risque anti-robot non
  mesuré, essai par paliers) ; (4) plafond Premium 50/j (commercial) ; (5) chevauchement sans partage + horloge
  par plateforme (B1 É1/É2).

## B3 — deux comptes Vinted, pro et perso (Louis)

- **Boutiques** : @neyenonie (247512093, session ouverte dans Brave, relevée) et @evat (371531, **aucun relevé
  depuis le 25/09**). D'après ta formulation : pro = @neyenonie, perso = @evat (à confirmer avec Louis).
- **Aujourd'hui** : la vente Leboncoin crée bien le retrait Vinted ; l'extension lit le vendeur de la page
  (371531 ≠ session) → needs_user `boutique_etrangere`, rien retiré ; le retrait repart seul dès que la sonde
  voit @evat connectée. **Aucun délai maximal, aucune relance, aucun mail.** Louis voit une ligne GRISE « En
  attente de ta boutique @evat… » (l'app dit « Chrome », le job dit « Brave »), rien d'orange.
  En attente maintenant : 2 retraits (Raiponce et Maximus depuis le 10/10 11:30 ; Kit bûche depuis le 11/10
  09:40) — ces deux articles vendus sur Leboncoin sont encore à vendre sur @evat.
- **Exposition** : @evat 189 fiches dont **43 avec une copie active ailleurs** (42 LBC, 10 Beebs) ; le risque va
  dans les DEUX sens : une vente sur @evat n'est vue par personne (la veille ne lit que la boutique ouverte).
- **Options** : (1) rappel visible et daté (orange, durée, risque ; mail support après N heures ; « Je l'ai
  retirée moi-même ») — petit, app + serveur ; risque : bascule toujours manuelle, sens b non couvert ;
  (2) passage de boutique guidé par l'extension (popup « 2 retraits attendent @evat », relevé de veille d'@evat
  pendant la visite) — reconnexion Vinted à refaire, nouvelle extension ; (3) un profil de navigateur par
  boutique avec routage serveur (comme Depop) — couvre tout, mais contredit « une seule extension active »,
  double exposition anti-robot, gros chantier.

## B4 — notifications push : 0 appareil

- **En place** : `@capacitor/push-notifications` 8.1.3 (Android branché, iOS : relais du jeton dans
  `AppDelegate.swift`) ; `build.gradle` applique google-services SEULEMENT si `google-services.json` existe ;
  `aps-environment = production` (entitlements + codemagic) ; serveur `push-ventes` / `_shared/push-envoi.ts`.
- **Manque, exactement** : (1) `android/app/google-services.json` ; (2) secret Supabase `FCM_SERVICE_ACCOUNT`
  (clé « firebase-adminsdk ») ; (3) secrets `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_TEAM_ID`, `APNS_TOPIC`
  (Team ID **BQ379Y93X3**, topic **app.fillsell.app** connus) ; (4) une clé APNs `.p8` (les deux `.p8` de
  Téléchargements ne sont pas des clés APNs) ; (5) capacité Push Notifications sur l'App ID `app.fillsell.app`
  + profil « FillSell AppStore » régénéré ; (6) un binaire avec le module jamais fabriqué ; (7) le script
  `npm run binaires:2.9.62` est périmé (exige package.json = 2.9.62, main en 2.9.80) : à recaler sur un
  numéro ≥ 2.9.81 (versionName, codemagic agvtool, constantes du script ; versionCode 33 si jamais envoyé).
- **Ce que Claude prépare seul** : recaler versions et script ; poser `APNS_TEAM_ID` et `APNS_TOPIC` ; à
  réception des fichiers : ranger `google-services.json`, poser les secrets, preuve à jeton factice (Apple
  « BadDeviceToken », Google « jeton invalide », rien envoyé), AAB + APK d'essai, notes de version.
- **Ce que seul Nico fait** :
  - **Firebase** (console.firebase.google.com, compte Google de FillSell) : « Créer un projet » → `FillSell`
    → décocher Google Analytics → « Créer le projet » ; icône Android → package **`app.fillsell.app`**, pseudo
    `FillSell Android`, SHA-1 vide → « Enregistrer l'application » → « Télécharger google-services.json » ;
    ⚙️ « Paramètres du projet » → « Comptes de service » → « Générer une nouvelle clé privée » → « Générer la
    clé » ; onglet « Cloud Messaging » : « API Firebase Cloud Messaging (V1) » = Activé.
  - **Apple Developer** : Identifiers → `app.fillsell.app` → cocher « Push Notifications » → Save → Confirm ;
    Profiles → « FillSell AppStore » → Edit → Save (nom inchangé) ; Keys → « + » → `FillSell Push` → cocher
    « Apple Push Notifications service (APNs) » → Configure → « Sandbox & Production », « Team Scoped » → Save
    → Continue → Register → **Download** (téléchargeable UNE fois ; le nom du fichier donne le Key ID).
  - Laisser les trois fichiers dans `C:\Users\nicol\Downloads` et dire « fichiers push dans Téléchargements,
    Key ID … ». **Rien n'est envoyé aux stores sans ton go.**
