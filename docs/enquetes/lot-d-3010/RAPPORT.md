# Lot D — derniers correctifs puis FillSell Cloud (30/10, à partir de 09:51, heures de Paris lues en base)

Consigne de Nico (30/10 matin) : partie 1 (trois correctifs), partie 2 (FillSell Cloud posé et implémenté), compte de
Nico seul pour les tests. Audits en lecture seule d'abord (4 en parallèle), puis correctifs, essais à blanc, feux
verts nommés pour les migrations, déploiements relus avant / après.

## Partie 1 — Correctifs

### 1.1 La lecture de la description d'origine en boucle — CLOS
- **Cause (audit)** : la demande (`lectures_origine_demandees`) était resservie 7 JOURS par `lectures_origine_en_attente`
  sans regarder ni les échecs ni le choix fait sur la fiche ; « Faire rédiger » posait le choix sans fermer la demande ;
  les freins de l'extension (repos, trace 1/h) vivent en mémoire du service worker, perdue à chaque redémarrage ; la
  0.6.157 n'écrit rien sur la demande. L'annonce de lauran (10581764660) est **MASQUÉE** chez Vinted (vinted_status
  hidden) — ni supprimée (ce serait 404), ni vendue.
- **Règle (base, toutes versions de l'extension)** : migration `20261030120000_lecture_origine_plafond` (feu vert de
  Nico 10:26, appliquée 10:27, repair fait ; inverse dans `supabase/rollbacks/`, essai à blanc 10 groupes verts) — voir
  `docs/regles/republication-et-publication.md` § 30/10 point 1. get-pending-jobs v303 ne retient plus la file pour une
  demande morte et plafonne les relevés « lecture d'origine » hors Vinted (3 terminés en 24 h). L'app dit « masquée »
  / « illisible » avec Écrire, Faire rédiger, Réessayer (OTA).
- **Preuve (usage_logs)** : lauran 47 relectures ratées de 09:16 à 10:16 → **0** de 10:27 à 10:58 (parc entier : 0).
- Garde-fou tenu : aucune lecture en masse, rien à l'import ; l'extension n'est pas touchée (aucun zip neuf).

### 1.2 L'abonnement Google périmé (BONCOIN) — CLOS
- **Fait rectifié** : le lot C se trompait (« elle paie deux fois ») — Google REVOKED + EXPIRED + remboursé le 29/10 à
  10:04 ; au paiement Stripe de 18:14 il était gratuit. Le profil gardait jeton, produit et fin Google (26/11).
- **Règle** : un canal qui s'arrête ne retire que SON droit (`_shared/droits-canaux.js`) — google-play-webhook v32,
  validate-google-purchase v12, stripe-webhook v61 ; la garde « jamais deux abonnements » relit l'abonnement chez
  Google (create-checkout-session v61) — `docs/regles/mails-paiements-comptabilite.md` § 30/10.
- **BONCOIN nettoyé** (10:33, `scripts/reparations/20261030_boncoin_canal_google_mort.sql`, sauvegarde
  `_backup_3010_canal_google_mort`, inverse prêt) : canal Google effacé, Premium Stripe intact.
- **API Google relue (lecture seule)** : patrick giry = Premium Google **ACTIF** jusqu'au 25/11 13:37 — légitime. Les 6
  autres jetons sont morts (EXPIRED ou 410), drapeaux déjà à 0, non touchés.
- **MRR** (actifs seuls, par canal, `abonnements-stores-audit` v2) : Stripe 33 · 837,67 € ; Apple 13 · 236,87 € ;
  Google 1 · 12,99 € → **47 abonnés · 1 087,53 € TTC / mois**.

### 1.3 Les republications Vinted d'Ornella — CLOS (règle du « dire »)
- **Cause** : la garde « une boutique Vinted à la fois » (légitime) — les 4 articles sont sur @ornella-vend (472079),
  Chrome est ouvert sur @luciatrendyshop ; @ornella-vend n'a pas été ouverte dans Chrome depuis le 13/10 (un passage
  le 26/10 a publié l'une d'elles). Aucun autre compte dans ce cas.
- **Trou corrigé** : une republication retenue ne le disait nulle part (error NULL). Désormais le job porte le message
  et la date d'attente (get-pending-jobs v303) ; la file dit « (en attente depuis le 24 oct.) ». Prouvé à 10:58 sur
  ses 4 jobs. Rien n'a été forcé.

## Partie 2 — FillSell Cloud

### 2.0 L'état des lieux (audit du 30/10 matin, avant tout geste)
| Point | Avant le lot D |
|---|---|
| Serveur Hetzner `fillsell-cloud-1` (cx43, 178.105.24.16, cloud.fillsell.app) | en marche, **figé au 05/10** (34c915e, extension 0.6.98-cloud), aucun navigateur |
| Prise atomique `prendre_job` (lot C) | en base, **aucun appelant** |
| Coffre AES-256-GCM à trousseau | code du 29/10, **non déployé** ; 0 ligne en base |
| Sel `cloud_empreinte_sel` | **absent** du vault (préparation d'essai refusée) |
| IP | modèle « dédiée par compte » ; 1 IP (94.194.94.233, fin 04/11) **plus attribuable à un essai** depuis le 25/10 → pool vide, 785 alertes « pool vide » (aucun mail) |
| Rotation / module fournisseur / alerte de solde | **absents** ; API résidentielle IPRoyal **non activée** ; solde 10,60 $ |
| Écrans (présentation, activation, Me connecter, mur, résiliation) | **existent** (Nico témoin écrit en dur) ; manquaient : conditions, état de l'exécutant, « à reconnecter », Depop |
| Paiement | Stripe : `STRIPE_PRICE_CLOUD` **absent** (paiement indisponible) ; Apple `app.fillsell.cloud.sub`, Google `cloud-monthly` / `cloud-trial-3d` (7 j) prêts côté code ; **aucun mode test Stripe** |
| Textes légaux | sections de /legal (CGV art. 7, confidentialité 4.8) cachées ; « Vinted et Leboncoin » seulement, « IP toujours la même » |

### 2.1 Ce qui est fait et prouvé (30/10)
| Point | Fait | Preuve |
|---|---|---|
| Sel `cloud_empreinte_sel` | posé au vault à 10:37 (tiré en base, jamais affiché) | HMAC 64 car., normalisation identique |
| Migration Cloud `20261030130000` | appliquée 11:09:56 (feu vert de Nico), repair | rotation = 1, colonnes des conditions, 2 fonctions, Depop au coffre ; essai à blanc 7 groupes |
| Module fournisseur d'IP | `serveur-cloud/src/fournisseurIp.js` (seul point de sortie) | tests serveur 33/33 ; entretien de 11:19 : solde 10,60 $ lu, seuil 5 $, aucune alerte, aucun achat |
| Serveur | redéployé sur c09148e à 11:16, extension **0.6.159-cloud** | `/sante` ok ; orchestrateur c09148ed96c9 |
| Rotation de `COFFRE_CLE` | **faite en vrai** : ligne écrite clé 1 → rotation → relue par le trousseau → rechiffrée clé 2 → ancienne clé retirée → relue clé 2 seule → ligne d'essai effacée | `outils/coffre-etat.mjs` ; `.env` sans `COFFRE_CLES_ANCIENNES` |
| Compte de Nico | drapeau `beta_flags.cloud` + option offerte (11:19, script + inverse) | servi en rotation, aucune IP attribuée |
| Exécutant | navigateur ouvert 11:19:46 (mode rotation_pool), session FillSell a958154e, poste Cloud vu 11:20:47 (build c09148e-cloud) | `cloud_executant_moi` : « actif » ; le poste de l'ordinateur et `extension_build` inchangés |
| Beebs, IP neuve, accès direct | **BLOQUÉ** : « Accès temporairement restreint — quelque chose dans le comportement du navigateur nous a intrigué », IP 94.194.94.233, ID b2b50871-8c20-a5ab-7cd8-0d73adda5a4b (10:19:36 UTC) | capture `/srv/fillsell-cloud/essais/` ; même mur que le 26/09 (autre IP, autre navigateur) |
| Fonctions | get-pending-jobs v304, update-job-status v157, create-checkout-session v62 (relues avant / après) | verify_jwt inchangés |

### 2.2 Refusés par le garde-fou (non contournés)
- **Afficher la clé du coffre** (« Credential Materialization ») : la clé neuve n'existe que dans `/srv/fillsell-cloud/.env`.
- **Envoyer l'OTA 2.9.137** (« Production Deploy ») : `dist/` construit (`2026-10-30T10:20:28Z+c09148e`), non envoyé.

### 2.3 Ce qui reste (raison exacte)
- **Connexions réelles** (Vinted, Leboncoin, Depop) depuis « Me connecter », puis publication / republication /
  retrait / relevé / vente par l'exécutant : il faut les identifiants de Nico (À Nico). Tout est prêt jusque-là.
- **Beebs** : bloqué par la plateforme depuis le serveur (deux IP, deux navigateurs) — à trancher (questions).
- **Stripe en mode test** : le connecteur Stripe ne voit que le mode RÉEL (un seul compte, livemode true) ; les trois
  fonctions de paiement lisent une seule clé. Il faut des clés de test (tableau de bord) et un aiguillage par témoin —
  pas fait (risque sur le paiement réel de tous). Le parcours réel est prêt : il ne manque que `STRIPE_PRICE_CLOUD`.
- **IP en rotation résidentielle** : API résidentielle IPRoyal non activée (trafic à acheter, 6,25 $/Go) ; en attendant,
  rotation sur les IP françaises du pool = UNE seule (94.194.94.233, fin le 04/11 à 13:57).
- **Prévenir avant de lancer une publication Cloud** (Ornella, point c de l'audit : une republication lancée seule sur
  une fiche d'une autre boutique) — non fait (le message existe désormais sur le job).

## Suite du lot D (30/10, ordres et décisions de Nico vers 11:30)

### Ordres
- **OTA 2.9.137 ENVOYÉE** (canal production relu 2.9.136 → 2.9.137) — bundle `2026-10-30T10:20:28Z+c09148e`.
- **Clé du coffre** : donnée UNE fois dans la réponse à Nico (elle n'est écrite dans aucun fichier, commit ni rapport).

### Décisions appliquées
- **2e IP fixe** : commande IPRoyal **86965910**, ISP dédiée France 30 j, **4 $**, sans renouvellement, IP
  **185.134.194.88** (fin 29/11 11:37) ; entrée au pool (id 2), contrôle d'entrée à l'entretien horaire, puis rotation
  sur les deux (rendez-vous par compte et par tranche de 24 h). Solde IPRoyal : 10,60 → **6,60 $**.
- **6 jetons Google morts** nettoyés (relus EXPIRED ou 410 chez Google à 12:05 ; `scripts/reparations/20261030_jetons_google_morts{,_INVERSE}.sql`,
  sauvegarde `_backup_3010_canal_google_mort`). Reste un seul jeton : Patrick Giry, ACTIF.
- **Stripe réel ce soir** : prix Cloud relu chez Stripe (lecture) — `price_1UMuLDQZRA77vrWJZfZh2IS4`, actif, 20,00 €/mois,
  essai 7 jours. ⚠ La pose du secret `STRIPE_PRICE_CLOUD` a été REFUSÉE par le garde-fou (« Secret-Store Writes ») :
  à Nico. Script de bascule « offert → essai Stripe » prêt (`20261030_cloud_nico_offert_vers_essai_stripe{,_INVERSE}.sql`).

### Promesses des conditions d'utilisation, relues dans le code
| Promesse | Avant | Après |
|---|---|---|
| Rappel la veille, app + mail | **tenue** : mail unique `cloud_essai_veille` (catégorie support, index une-fois) dans email-tunnel, cron `email-tunnel-daily` 09:00 UTC, fenêtre J-2 → J-1 (`_shared/cloud-rappel-veille.js`) ; bandeau dans l'app (`rappelVeilleDu`) | inchangée |
| Effacement ≤ 3 jours après l'arrêt | **NON tenue en rotation** (la purge du 05/10 ne partait qu'avec l'IP mise au repos) | **tenue** : `entretien.purgerComptesInactifs` — à chaque entretien horaire, tout compte dont le Cloud n'est plus actif (hors grâce de 2 j) : navigateur + profil détruits, coffre vidé, session révoquée (test serveur) |
| Historique des IP utilisées par le compte | non tenu en rotation | **tenu** : chaque session journalisée sur son IP (`cloud_journal`, nature attribution, identifiant effacé à 12 mois) |
| Confidentialité 4.8, CGV art. 7 (non publiées) | « IP réservée, toujours la même », repos 7 j, Vinted et Leboncoin | **alignées** : adresses IP françaises qui peuvent changer, plus de repos promis, Vinted / Leboncoin / Beebs / Depop |
| CGV art. 6 (rétractation, publiée) | existe : 14 jours, prorata si exécution immédiate | inchangée — le renvoi des conditions est juste |

### Beebs — diagnostic, pistes, solution
**Ce qui déclenche « Accès temporairement restreint » : le NAVIGATEUR du serveur, pas l'IP.**
| Essai (30/10) | Navigateur | IP | Résultat |
|---|---|---|---|
| A | Chromium de steel-browser (Linux, aucun WebGL, 0 plugin PDF, « Chromium » seul dans Sec-Ch-Ua) | 94.194.94.233 (ISP) | **bloqué** (10:19 UTC, ID b2b50871…) |
| B | **vrai Chrome Windows** (PC de Nico, profil vierge) | 94.194.94.233 | **passe** : formulaire de connexion |
| C | vrai Chrome Windows | 185.134.194.88 (neuve) | **passe** |
| D | Google Chrome officiel Linux (conteneur, écran, Paris, SwiftShader) | 94.194.94.233 | **vérification** « Faites glisser vers la droite » (passable par l'utilisateur) |
| E | idem D + `--accept-lang=fr-FR,fr` | 185.134.194.88 (jamais vue de Beebs) | **bloqué** (ID b392e242…) |
- Signaux comparés (vrai Chrome / Cloud) : Windows / Linux ; Chrome 156 « Google Chrome » / Chromium 154 seul ; WebGL AMD
  réel / aucun (Chromium) ou SwiftShader (Chrome) ; 5 plugins PDF / 0 ; fuseau Paris et `webdriver` faux des deux côtés.
- **Piste 3 (IP résidentielle) : non mesurée** — 1 Go = 7,35 $ > solde 6,60 $ (recharge = carte dans le tableau de
  bord IPRoyal : à Nico). **Piste 4 (IP neuve, accès direct)** : essais C et E.
- Erreur trouvée en passant : la page de connexion Beebs du Cloud était `/fr/login` (une 404) → **`/fr/auth`** corrigé.
- **Solution retenue (à construire)** : le navigateur Cloud passe à **Google Chrome officiel** (image
  `serveur-cloud/navigateur-chrome/`, prête et mesurée) ; Beebs y présente au pire une vérification que
  l'utilisateur passe LUI-MÊME dans « Me connecter » (aucun résolveur, aucun service tiers) ; la sortie de Beebs
  privilégie l'IP où Beebs vérifie au lieu de bloquer ; la mesure résidentielle se fait après recharge. Il reste à
  y charger l'extension (Chrome officiel ignore `--load-extension` : installation par stratégie d'entreprise
  `ExtensionInstallForcelist` et un CRX signé de la clé de la copie Cloud) et à remplacer steel-browser dans
  `navigateur.js`. **Coût par utilisateur** : même serveur (≈ 0,8 € / mois de serveur et d'IP partagés aujourd'hui),
  + 0 € de licence ; avec résidentiel pour Beebs seul : ≈ 7,35 $ / Go (estimé 0,2 à 0,5 Go / mois / vendeur actif →
  1,5 à 3,7 $). Demande de partenariat Beebs rédigée, non envoyée : `docs/cloud/beebs-demande-partenariat.md`.

## Suite 2 du lot D (30/10 après-midi — « tout est payé, on finit le Cloud »)

### Ordres
- **STRIPE_PRICE_CLOUD posé** (12:29) = `price_1UMuLDQZRA77vrWJZfZh2IS4` ; empreinte du secret (secrets list)
  6803167d… = sha256 du prix → c'est bien cette valeur que les fonctions lisent.
- **IPRoyal** : 1 Go de résidentiel acheté (commande 86970189, 6,25 $ débités, sans renouvellement), confié à un
  sous-utilisateur de test (identifiants dans secrets.env et le .env du serveur, jamais affichés). ⚠ La recharge de
  15 $ n'apparaît PAS sur le solde revendeur que lit l'API (6,60 → 0,35 $ après l'achat) : l'alerte « solde bas » est
  partie (journal du serveur, aucun mail). Résidentiel consommé par les essais : 0,041 Go (≈ 10 Mo par page Beebs
  avec un profil neuf). Les deux IP fixes restent (contrôle d'entrée de la 2e passé : 1 et 2 « disponible »).

### Navigateur Cloud sur Google Chrome officiel — FAIT
- Image `navigateur-chrome/` (Chrome 156 officiel, écran, fr, Paris), extension Cloud installée par **stratégie
  d'entreprise** (CRX3 signé de la clé de la copie Cloud, servi en local par le relais, version 0.6.159.4355x),
  `DeveloperToolsAvailability = 1` (sans elle Chrome refuse de piloter l'extension). Relais de proxy dans le conteneur
  (les identifiants ne vont jamais à Chrome), trafic Beebs seul vers le résidentiel si `BEEBS_RESIDENTIEL=1` (laissé à 0 :
  mesuré inutile, voir plus bas). Serveur sur 3d00e71.
- Prouvé : navigateur de Nico ouvert sous Chrome, extension présente (service worker), session FillSell posée, poste
  Cloud qui interroge la file (13:04:10, build …-cloud) ; « Me connecter » de bout en bout (ticket, WebSocket comme
  l'app, image au format téléphone) : **Vinted OK, Depop OK** ; Leboncoin et Beebs : mur DataDome.
- Corrigés en passant : la page de connexion **Leboncoin** du Cloud était `/se-connecter` (404 même dans un vrai Chrome)
  → `/compte/part/mes-annonces` (renvoie vers auth.leboncoin.fr/login) ; Beebs `/fr/auth` (fait plus tôt).

### Beebs (et Leboncoin) — mesures en accès direct
| Navigateur | Sortie | Beebs /fr/auth | Leboncoin |
|---|---|---|---|
| vrai Chrome Windows (PC de Nico, profil vierge) | IP fixe 1 | passe | — |
| vrai Chrome Windows | IP fixe 2 | passe (11:5x et 12:5x) | passe (page servie) |
| Chrome officiel du serveur | IP fixe 1 | glissière à 11:48 ; **bloqué** à 12:37 | **bloqué** |
| Chrome officiel du serveur | IP fixe 2 | **bloqué** | **bloqué** |
| Chrome officiel du serveur | résidentielle FR (neuve à chaque essai) | **bloqué** ×4 (SwiftShader, rendu GL Mesa, sans WebGL, écran 1536×864) | — |
| Chromium steel (ancien navigateur) | IP 1 et 2 | bloqué | **bloqué** (12:56 ; il passait le 05/10) |
- **Pourquoi** : ni l'IP (un vrai Chrome passe par les mêmes IP), ni le type d'IP (le résidentiel est bloqué aussi), ni
  la langue, le fuseau, le navigateur Chrome / Chromium : c'est **l'environnement du serveur** — Linux sans carte
  graphique (rendu logiciel SwiftShader / Mesa, ou pas de WebGL). Beebs et Leboncoin sont protégés par le même
  service anti-robot (DataDome) : depuis nos essais répétés de la journée, il ne donne plus la glissière à cet
  environnement, il le bloque d'emblée (sur IP fixe comme résidentielle).
- **Solution retenue (à décider)** : exécuter Beebs et Leboncoin depuis une machine à **vraie carte graphique** (GPU),
  à mesurer avant tout engagement ; le reste du Cloud (Vinted, Depop, eBay par l'API) tourne déjà. Le résidentiel n'est
  PAS nécessaire (il ne change rien) : `BEEBS_RESIDENTIEL` reste à 0, coût 0. Demande de partenariat Beebs gardée en
  brouillon, non envoyée.
