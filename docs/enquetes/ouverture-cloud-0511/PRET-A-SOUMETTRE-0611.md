# Lot « Prêt à soumettre » (06/11/2026) — état des stores, champ par champ, et ce qui reste

Heures de Paris. Tout ce qui suit a été LU (API d'App Store Connect depuis la session ouverte, Play Console, base, code)
au moment indiqué. Ordre de Nico : seul l'abonnement Cloud se soumet ; la 2.9 (Apple) et la version Google attendent
l'AX42, un test réel sur ce serveur, puis le feu vert de Nico.

## 1. Apple — App Store Connect (app 6762152785, version 2.9 « À finaliser avant soumission », sortie MANUELLE)
| Champ | FR | EN | État |
|---|---|---|---|
| Nom | FillSell – Crosslisting | FillSell – Crosslisting | fait (part avec la 2.9 ; en ligne : « Achat Revente » / « Reseller App ») |
| Sous-titre | Assistant IA pour revendeurs | AI Inventory & Profit | fait |
| Description | 3 866 car., Depop oui, Opla non, Cloud « en France » | 3 498 car., LBC/Beebs « in France » seulement | fait |
| Nouveautés | oui | oui | fait |
| Mots-clés | cross-post,cross-listing,multi-plateformes,revente,annonces | crosslist,cross-post,reseller,multi-platform,listing,resale | fait |
| Vidéo d'aperçu | iPhone 6,3" + 6,9", iPad 13" (25 s, affiche à 10 s) | idem | fait 06/11 (6 vidéos, traitées par Apple) |
| Captures | 8 × iPhone 6,3", 6,5", 6,9" + iPad 13" | idem | fait 06/11 (64, toutes « COMPLETE ») ; iPhone Duo : non (facultatif) |
| En-tête de page produit (5244×2950) | — | — | non fait (facultatif, nouveau) |
| URL confidentialité | /legal#confidentialite | /legal?lang=en#confidentialite | fait |
| URL support / marketing | https://fillsell.app | https://fillsell.app | fait |
| Catégorie | Économie et entreprise / Finance | | inchangé |
| Âge | 4+ | | inchangé |
| Confidentialité de l'app | 13 types publiés 06/11 | | fait (docs/stores/donnees-2.9.md) |
| Notes relecteurs + compte | test@fillsell.app (mot de passe déjà saisi), notes 06/11 collées | | fait |
| Contrat « Paid Applications » | nouvelle version ACCEPTÉE 06/11, actif jusqu'au 13/04/2027 | | fait |
| Statut DSA | en vigueur : « pas commerçant » (16/04) | | **DÉCISION DE NICO (06/11 après-midi) : on reste « non commerçant »**, déclaration du 16/04 inchangée, rien à faire ; toute alerte Apple à ce sujet lui est signalée |
| Abonnements | Premium, Pro, Pro2, Premium Founder, Business : APPROVED ; **Cloud : WAITING_FOR_REVIEW** (soumis 10:37) | | fait |
| Binaire 2.9.161 | — | — | fait 06/11 13:20 : Codemagic 175 (dbd9f34) ENVOYÉ, build 2611061217, non soumis ; 172-174 refusés (lock, puis profil sans Push) |

## 2. Google — Play Console (app 4973021343170715891, publication gérée ACTIVÉE)
| Champ | fr-FR | en-US | État |
|---|---|---|---|
| Nom | FillSell – Crosslisting | FillSell – Crosslisting | en ligne depuis le 05/11 |
| Description courte | 5 plateformes | « One photo, one listing, posted to all your marketplaces. » | fait |
| Description | Depop oui, Opla non, Cloud « En France » | corrigée 06/11 : « Vinted, eBay or Depop (and, in France, Leboncoin and Beebs) », « cinq plateformes » et « LBC et eBay : bientôt » retirés | brouillon enregistré |
| Captures téléphone | 8 neuves, dans l'ordre | 8 neuves (EN), dans l'ordre | brouillon enregistré |
| Bannière 1024×500 | « Crée une fois. Vends partout. » | « List once. Sell everywhere. » | brouillon enregistré |
| Vidéo | youtube.com/watch?v=nPXOWMjW_AE (non répertoriée) | youtube.com/watch?v=9nqPNDN33yA (non répertoriée) | brouillon enregistré (vidéo verticale 1080×1920 : YouTube la classe en Short) |
| Icône | inchangée | | ok |
| Catégorie / tags | Productivité ; Finances perso, Outils, Productivité, Shopping | | inchangé |
| Coordonnées | support@fillsell.app, site | | inchangé |
| Sécurité des données | 14 types, suppression dans l'app, lien /legal#confidentialite | | enregistré 06/11, non envoyé |
| Accès à l'app | googlereview@fillsell.app (mot de passe inchangé) + notes 06/11 | | enregistré, non envoyé |
| Classification, cible, annonces… | 21/06/2026 | | inchangés |
| Déclaration IA | aucune déclaration « IA » proposée dans Contenu de l'application (10 déclarations, toutes traitées) | | rien à remplir aujourd'hui |
| Statut professionnel | « compte professionnel » choisi le 06/11 matin, NON validé (code SMS jamais saisi) | | **DÉCISION DE NICO (06/11 après-midi) : on n'y touche pas** — aucun code SMS demandé ; toute alerte Google à ce sujet lui est signalée |
| Abonnements | Premium, Pro, Business actifs ; Cloud actif (forfait mensuel, essai 7 j) + traduction en-US ajoutée 06/11 | | fait |
| AAB 2.9.161 (vc 33) | — | — | fait 06/11 : build/AAB-A-TELEVERSER-2.9.161-vc33/ (a61d0ec, Firebase, même clé que 2.9.38) ; piste interne : BROUILLON enregistré, aucun testeur, rien envoyé |

## 3. Code et base (06/11)
- Textes légaux du Cloud PUBLIÉS sur /legal (`CLOUD_TEXTES_LEGAUX = true`, offre toujours fermée) + clause « Territoire :
  France » + date du 6 novembre.
- Feuille des formules : Depop ajoutée à « Publication sur Vinted, Leboncoin, eBay, Beebs & Depop » (FR/EN).
- Traduction à l'affichage des messages stockés, export Excel et canal « Sales » en anglais (agent, relus).
- ⛔ Bug trouvé et corrigé : `pushVentes.plugin()` ne rendait jamais la main sur un vrai téléphone (plugin Capacitor
  pris pour une promesse) — `selftest:push-plugin-proxy` (règle : docs/regles/ventes-et-retraits.md).
- Migration 20261105230000 APPLIQUÉE 10:47:47 (feu vert nommé) ; journal relu sur de vraies republications.
- Binaire : versions alignées 2.9.161 (package.json, Android vc 33, Codemagic) — au-dessus de l'OTA servie (2.9.160).

## 4. Restes (qui, pourquoi)
- ~~Nico : pièce justificative DSA Apple ; code SMS Google~~ (06/11 après-midi : décision de Nico, on reste « non
  commerçant » / statut pro Google non touché) ; conditions Firebase (le garde-fou refuse que Claude accepte
  des conditions) ; ~~clé APNs « FillSell Push » et clé privée Firebase~~ (06/11 après-midi : posées et prouvées, § 6) ; pousser main (2 commits du terminal « Problèmes » en attente).
- Après les clés : `npm run binaires` (AAB 2.9.161 + Codemagic → TestFlight), téléversement en piste interne, essais
  avec les comptes de relecture (TestFlight / piste interne : identifiants = geste de Nico).

## 5. Suite du 06/11 après-midi
- Parcours connecté EN ANGLAIS prouvé sur le compte de démo test@fillsell.app (WebKit iPhone isolé, session par lien à
  usage unique côté serveur, révoquée ensuite) : Board, AI Stock, Sales, Stats en anglais ; reste trouvé et corrigé :
  la pastille « Sans plateforme » (Sales). Trouvé : ce compte affiche des dinars serbes (RSD) — script
  scripts/reparations/20261106_compte_relecture_apple_euro.sql prêt, non appliqué (garde-fou : à lancer par Nico).
- Web : site bloqué sur 8bd22d6 de 05/11 23:04 à 06/11 12:30 (lock) ; règle npm ci (a459538).

## 6. Session du 06/11 après-midi (Nico absent, autorisations écrites dans sa consigne)
- **Euro** (autorisation 1) : `20261106_compte_relecture_apple_euro.sql` APPLIQUÉ vers 13:50 — test@fillsell.app RSD → EUR,
  sauvegarde `_backup_0611_relecture_apple_devise` (« RSD »), plus aucun compte en RSD. Preuve à l'écran : parcours
  connecté isolé (WebKit iPhone, lien à usage unique révoqué ensuite, lecture seule) `node scripts/i18n/parcours-connecte-anglais.mjs
  --lien-demo build/captures-euro-relecture` → 7 écrans, « € » partout (Stats : « 7 832,70 € »), **0 RSD** (le script
  relève désormais les devises vues par écran). Reste visible : les montants s'écrivent à la française (« 7 832,70 € »)
  même en anglais (`formatCurrency`) — sans effet sur la devise, noté pour plus tard.
- **Clés des notifications** (autorisations 2-4) : clé privée du compte de service Firebase GÉNÉRÉE dans la console
  (projet fillsell-6cd47, `firebase-adminsdk-fbsvc@…`, fichier dans Téléchargements, jamais dans git). Les 5 fichiers .p8
  du PC éprouvés chez Apple (JWT, jeton d'appareil factice) : **seule AuthKey_J8G395AA93 (06/11 matin) est une clé APNs**
  (« BadDeviceToken » en production ET en bac à sable) ; DYF87JYZ89 (= `apple-key.p8` du dépôt), W7MZC3YK99 et
  SubscriptionKey_ZYC7ZAG2GL : « InvalidProviderToken ». Secrets posés : `APNS_KEY_ID`, `APNS_PRIVATE_KEY`,
  `APNS_TEAM_ID`, `APNS_TOPIC`, `FCM_SERVICE_ACCOUNT` (`node scripts/binaires.mjs --cles-seules --cle-apns=…`, option
  neuve : étapes B-C-D seulement) ; preuve par push-ventes v17 (`diagnostic: "cles"`) : Apple « BadDeviceToken »,
  Google « jeton_mal_forme » sur fillsell-6cd47 → **les deux clés acceptées**, rien envoyé à personne. Corrigé au passage
  dans `binaires.mjs` : la CLI exige `--yes` (secrets, net.http_post) et écrit « Warning/Target » sur stderr, qui collé
  après le JSON rendait le diagnostic illisible. Reste : bloc C (Pub/Sub) de `docs/push/CLES-NICO.md`, non demandé.
- **TestFlight** : build 2.9.161 (2611061217) « VALID » mais `MISSING_EXPORT_COMPLIANCE` jusqu'à 14:18 ; conformité
  faite par Nico (14:30, `usesNonExemptEncryption: false`) → relu 14:28 par l'API : **interne `IN_BETA_TESTING`**, les deux
  groupes internes (« Testeurs internes », « Testeurs internes Ornella », 1 testeur chacun, accès à tous les builds) le
  contiennent ; externe `READY_FOR_BETA_SUBMISSION` (RIEN soumis à la vérification bêta) ; expire le 04/02/2027.
- **DSA** : décision de Nico (tableaux ci-dessus) ; mails relus le 06/11 vers 14:05 : aucune alerte neuve (le mail Google
  « déclarez votre statut de professionnel » date du 04/11).
- **Compte de Nico « témoin » dans TestFlight** (demande de 14:3x) : il l'est DÉJÀ (`beta_flags.cloud = true` depuis le
  30/10 ; 3 témoins : Nico + les deux comptes de relecture). Son Cloud est vivant (« offert ») : il voit son Cloud en
  marche, jamais l'offre d'essai. Grille trois jauges : aucun témoin par compte n'existe (interrupteur global
  `coin_config.grille_trois_jauges` = 0, qui règle aussi les vrais quotas). **Décision de Nico : son compte tel quel,
  pas de grille** — rien écrit. Interrupteurs relus : `CLOUD_OFFER_ENABLED = false`, `cloud_offre_ouverte` absent (fermé),
  `grille_trois_jauges` = 0. Paiement réel impossible pour le Cloud sur ce compte : Stripe répond `already_cloud`
  (Cloud vivant sur un autre canal), Apple/Google ignorent l'achat (`cloud_deja_actif_autre_canal`) ; dans TestFlight
  tout achat passe en bac à sable. ⚠ Un achat de FORMULE en bac à sable (ou « Restaurer ») dans TestFlight écrit quand
  même les drapeaux de palier du vrai profil (`validate-apple-receipt` accepte les reçus bac à sable) : ne pas les toucher.
- **OTA 2.9.162** (alignement des binaires, PRÉPARÉE, NON PUBLIÉE — feu vert de Nico) : voir § 7.

## 7. OTA 2.9.162 — remettre l'IPA et l'AAB 2.9.161 au même niveau (à publier sur feu vert de Nico seulement)
Pourquoi : l'AAB 2.9.161 embarque le web de a61d0ec, l'IPA (Codemagic 175) celui de dbd9f34 (avec « Sans plateforme »
traduit, 0997268) ; le canal `production` sert 2.9.160 avec « Updates Under Native : No » : les binaires 2.9.161 gardent
leur web embarqué. Une OTA 2.9.162 donne le MÊME web (celui de `main` au moment du build) aux deux binaires — et à tous
les téléphones du canal `production` (c'est pour cela qu'elle attend Nico).
Gestes (dossier principal, jamais un worktree ; `docs/agents/pieges.md` § Déploiement) :
1. `npx @capgo/cli channel list` → `production` = 2.9.160 (relu le 06/11 vers 14:15) ;
2. arbre PROPRE (aucun terminal en cours : `npm run build` refuse sinon) ; `package.json` + `package-lock.json` → 2.9.162,
   commit seul (`git commit --only package.json package-lock.json`) ; ⚠ `binaires.mjs` refusera ensuite un nouveau binaire
   tant que `build.gradle`/`codemagic.yaml` disent 2.9.161 (attendu : un binaire neuf = un numéro neuf) ;
3. `npm run build` puis `curl -s https://fillsell.app/build.json` comparé à `dist/build.json` (même commit, sans `-dirty`) ;
4. `npx @capgo/cli bundle upload --channel production --bundle 2.9.162 --path dist` ; relire le canal.
Pourquoi pas fait aujourd'hui : l'arbre partagé n'est pas propre (terminal « Problèmes » en cours), et un numéro monté
sans être publié serait pris par la prochaine OTA d'un autre terminal (sans le feu vert de Nico).
