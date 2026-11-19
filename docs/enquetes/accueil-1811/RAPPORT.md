# Lot T1 du 18/11/2026 — la refonte de l'accueil, jusqu'au Stock

Ordre de Nico du 18/11 soir. Étape 1 : maquettes (`C:\Users\nicol\fill-and-sell-design\accueil-1811\`, 21 écrans,
iPhone / Android / web), feu vert de Nico le 18/11 avec une retouche (le Stock garde tout) et 6 décisions. Étape 2 : ce
code. Règles durables : `docs/regles/parcours-entree.md` § 18/11/2026.

## Le constat (mesuré le 18/11)
49 inscrits (31 depuis les stores). 28 répondent « pas d'ordinateur », 27 voient « Choisis ta formule » (étape 4/8,
trois gros prix, « Passer » en haut à droite). 0 vrai clic sur une offre dans l'accueil, 19 « Passer », 0 essai, 0 abonné
issu de l'accueil ; 3 synchros, 2 publications. Les deux derniers essais (airmax69100 le 17/11 21:21, cec3986 le 15/11)
ont été pris APRÈS l'accueil (airmax69100 : « ordinateur_non » → présentation → « Passer » sur les offres → relevé →
fin, puis l'offre prise une minute plus tard hors de l'accueil). Trou repéré par Nico : après « Passer » sur les offres,
plus rien ne disait qu'il faut alors un ordinateur. Cas Butin d'Or (18/11 20:13-20:14, Android) : Business seul, le
bandeau Cloud une minute après, Business + Cloud → deux débits Google pleins le même soir (CHARGE_FULL_PRICE).

## Ce qui est fait (code)
1. **Accueil** (`src/entree/`) : « As-tu un ordinateur ? » en 2e sur tout téléphone ; « Non » → UN écran Cloud
   (`EtapesAccueil.jsx` : Pro + Cloud, « 7 jours gratuits » seulement si la carte d'offre le porte, un bouton, la date du
   1er prélèvement, les autres formules derrière un lien, « Plus tard » en bas) ; « Plus tard » → « Pour publier, il te
   faut un ordinateur » (lien par mail) ; « Oui » → l'extension (lien par mail, Cloud en alternative) ; plus de « Passer »
   en haut (flèche de retour) ; sortie au Stock ; journal `etape_vue {…, chemin, appareil}` et `cloud_offre_vue
   { essai_propose, … }`.
2. **Stock** : la carte Cloud en tête (App, au-dessus du Stock) ; « Republie ton stock en 1 clic » ajoutée sous le titre
   après la 1re synchro (ouvre le geste existant) ; rien d'autre ne bouge (5 lignes ajoutées à `StockTab.jsx`, 0
   retirée).
3. **Tableau vide** : « Pour bien démarrer » (4 marches) ajouté en tête.
4. **Propositions Cloud** : silence de 7 jours après un paiement, abonné = carte discrète au Stock seulement, bandeau du
   Tableau absent les 7 premiers jours (`cloud/propositionsCloud.js`).
5. **Offres** : chaque formule porte sa version + Cloud sous sa carte, avant de payer ; plus d'interrupteur.
6. **1re publication** : retouche cachée pour une formule sans retouche.
7. **Montée Google au prorata** + montant affiché (Google et Apple) avant de valider.

## La liste de contrôle du Stock (retouche n° 1 de Nico)
Chaque élément ci-dessous était là avant et l'est toujours, au même endroit, avec le même appel (verrou
`selftest:stock-tout-reste`, vert sur l'arbre ET sur le code d'avant pour les 49 éléments) :
01 titre « Mon stock » + boutique Vinted · 02 bandeaux « plateforme en pause » · 03 carte d'activité · 04 file des
tâches · 05 « Synchroniser tout » · 06 synchro d'une plateforme · 07 « Publier ton stock sur X » · 08 « Créer ma
première annonce » · 09 synchro en cours · 10 « N points à régler » · 11 « Ton stock est prêt » · 12 rattachement /
doublons · 13 carte de synchro Vinted (repli) · 14 alertes du compte · 15 Publier (choix → lot) · 16 Republier (choix
de plateforme → feuille avec le coût) · 17 À régler · 18 republication automatique · 19 Ajouter un article · 20 carte
d'ajout (écrire, parler, à la main, lot) · 21 attentes boutique / connexion · 22 recherche · 23 filtres rapides · 24
« Choisir des articles à publier » · 25 « Modifier le prix ou la quantité… » · 26 filtres actifs · 27 brouillons portant
le texte · 28 appel « Pas encore sur X » · 29 lot en cours · 30 panneau des filtres · 31 marques / catégories · 32
en-tête de liste (compte, tri, vue) · 33 brouillons · 34 prix d'achat · 35 republication en masse · 36 stock vide
(bandeau + « Ce que FillSell fait ») · 37 pause serveur · 38 « Afficher tout le stock » · 39 « À vérifier » · 40 « Prêts
à publier » · 41 « Rien ne correspond » · 42 « Voir les N autres » · 43 republication auto (pied) · 44 cartes
d'articles · 45 Publier / Régler / Remonter / Vendu · 46 mur de connexion dans la carte · 47 menu « … » · 48 infos
(tâche échouée, dates, état) · 49 questions et attentes.

## Preuves
- **Verrous** (rouges sur le code d'avant, verts après) : `selftest:accueil-refonte` (45 rouges avant → 62 verts),
  `propositions-cloud` (28), `montant-montee` (26), `retouche-free-cachee` (10), `stock-tout-reste` (54 ; les 49
  éléments du Stock verts AVANT et après, les 5 contrôles de la carte neuve rouges avant).
- **Essai réel** (18/11, 23:37 puis 23:40 après correction ; compte de test nicolas.svobodny+test11, accueil remis à zéro
  en base ; WebKit ISOLÉ au format iPhone, jamais le Chrome de Nico ; code de l'arbre servi en local, base de prod ;
  aucun achat, aucun mail) : « Où tu vends ? » → « As-tu un ordinateur ? » → Non → écran Cloud AVEC essai (« 7 jours
  gratuits », « 0 € aujourd'hui, puis 49,99 €/mois, résiliable à tout moment. », « Premier prélèvement le mercredi 25
  novembre ») → les autres formules → « Plus tard » → « Pour publier, il te faut un ordinateur » → « Continuer sans
  publier » → prénom → Stock : carte Cloud en grand, aucun « Installer l'extension » → Tableau : « Pour bien démarrer »,
  aucun bandeau Cloud (compte du jour). Journal relu en base : `cloud_offre_vue { essai_propose: true, formule_proposee:
  "pro_cloud", raison_sans_essai: null, appareil: "web" }`, `etape_vue { …, chemin, appareil }` sur chaque écran,
  `parcours_termine { destination: "stock", chemin: "sans_cloud" }`. Captures :
  `C:\Users\nicol\fill-and-sell-design\accueil-1811\preuves-reelles\` (avant correction : sous-dossier).
- **Corrigé grâce à l'essai réel** : le bouton de l'écran Cloud était sous la ligne de flottaison (pied désormais
  collant sur l'écran Cloud, « il te faut un ordinateur » et l'extension sur téléphone) ; un écran gardait le défilement
  du précédent (retour en haut à chaque écran) ; la feuille « autres formules » était rognée (portail au-dessus du
  parcours).
- L'écran « avec essai » est prouvé sur le web téléphone (compte jamais passé par l'essai). Sur iPhone, le compte Apple
  de Nico a déjà consommé l'essai : il verra la variante sans essai, honnête. Sur Android, même règle (même modèle des
  cartes, `selftest:formules-cloud-offres`).

## 19/11 — trois choses à finir (ordre de Nico)
### 1. L'écran d'inscription = la maquette 01
- `src/auth/EcranConnexion.jsx` (affichage seul) + App.jsx (`etapeConnexion` : l'écran 01, puis le formulaire e-mail
  d'avant, champ pour champ). Apple : iPhone (feuille native), web (OAuth), jamais Android. Gestes inchangés.
- Verrou `selftest:ecran-connexion` : 48 verts ; sur le code d'avant 32 rouges (l'écran neuf) et 16 verts (les gestes
  d'avant — signUp, verifyOtp 'signup', signInWithPassword, Apple natif, OAuth, formulaire — présents des deux côtés).
- Essai réel (19/11 00:21, WebKit ISOLÉ format iPhone, code de l'arbre servi en local, base de prod) : compte de test NEUF
  `nicolas.svobodny+inscription1911` — écran 01 → « Continuer avec mon e-mail » → adresse ×2 + mot de passe → « Créer
  mon compte » → « Regarde ta boîte mail » (le vrai mail de confirmation est parti vers la boîte de test) → lien de
  confirmation (jeton du lien, admin, sans mail) → entrée dans l'accueil « Où tu vends ? » ; puis autre navigateur :
  page de confirmation → « Me connecter » → formulaire de connexion direct (`/login?mode=login`) → connecté. Base relue :
  compte créé 00:21:42, confirmé 00:21:44, reconnecté 00:21:53, profil créé, accueil journalisé. Captures :
  `preuves-reelles/inscription-email/` (7 + journal) et `preuves-reelles/connexion/` (iPhone, Android, web).
- Non prouvé en réel : le code à 6 chiffres sur téléphone (natif seulement, code inchangé — verrou) ; Apple et Google
  (comptes réels, jamais d'automate de connexion sur un compte de Nico).

### 2. Montée Google au prorata : la confirmation de paiement
- Cause : l'alerte « Paiement reçu » (et Meta) ne partait que sur un crédit du mois ; la montée au prorata (même palier,
  même échéance) n'en crée pas. Le mail client Google, lui, partait sans montant (Google ne le donne pas dans l'abonnement)
  et pouvait dire « est renouvelée ».
- Correction (règle commune `_shared/confirmation-paiement.js`, les trois canaux) : un paiement réel = une confirmation
  (crédit OU changement au prorata), une par numéro de paiement (registre `cloud_mails`), jamais pour un essai à 0 €.
  Google lit le montant payé dans la commande (`orders.get`, droit vérifié sur 6 vraies commandes en lecture seule) ;
  mail « Ta formule passe à Pro + Cloud — Google Play a prélevé X € ». Stripe : la facture de prorata confirmée aussi.
  Apple : inchangé (la référence).
- Verrou `selftest:confirmation-paiement` : 55 verts ; 45 rouges sur le code d'avant.

### 3. La croix de la carte Cloud du Stock : validée, gardée (rien à faire).
