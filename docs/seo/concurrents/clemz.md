# Clemz — vérification sur pages réelles

- **Site** : https://www.clemz.app (redirige vers https://www.clemz.app/fr)
- **Date d'observation** : 2026-10-09 (toutes les citations ci-dessous ont été lues ce jour-là, par curl
  et WebFetch, sans compte et sans connexion).
- **Méthode** : téléchargement des pages publiques (accueil, tarifs, FAQ, démarrage rapide, 16 pages de
  documentation, journal des mises à jour, CGU, politique de confidentialité, à propos, avis, contact), de la
  fiche Chrome Web Store (présentation et avis) et du manifeste de l'extension tel que la fiche CWS l'embarque.
  Recherches App Store (API iTunes, pays FR), Google Play et Trustpilot.
- **Verdict d'une ligne** : Clemz est une **extension navigateur d'automatisation d'un dressing Vinted, et de
  Vinted seulement** (republication, favoris, vues, sauvegarde, ventes, bordereaux, comptabilité, factures).
  Elle ne fait **pas** de crosslisting aujourd'hui. Le développeur a cependant écrit le 16/09/2026, en
  réponse à un avis : « Nous allons travailler à la publication simultanée, c'est certain ».

---

## 1. Identité

| Point | Constat | Source |
|---|---|---|
| Éditeur | « SASU Clemz, au capital de 1000 €, dont le siège social est situé CS 48756, 58 RUE DE MONCEAU, 75008 PARIS, immatriculée au RCS de Paris sous le numéro 938893203 » | https://www.clemz.app/fr/terms-conditions (CGU « Version mise à jour : 05 mars 2026 ») |
| Équipe | « Derrière Clemz, il y a moi, Clément, créateur indépendant et Lucile, pour le support client. » Clément vit à Montpellier, Lucile en région parisienne. | https://www.clemz.app/documentation/faq ; https://www.clemz.app/fr/about |
| Pied de page | « 2026 Clemz. Fait avec ♥️ à Montpellier » | toutes les pages |
| Lien avec Vinted | « Clemz et Vinted sont deux entreprises différentes et sans lien juridique. » La fiche CWS précise : « Cette extension n'est ni affiliée à Vinted, ni certifié par Vinted. » | FAQ ; fiche CWS |
| Communauté | Forum **vint-aide.com**, déclaré comme un service Clemz dans la politique de confidentialité : « site internet Clemz.app, extension Chrome, modules de synchronisation des ventes, support client et le forum vint-aide.com ». Chaînes YouTube, Instagram et TikTok (`@clemz_app`). | https://www.clemz.app/fr/privacy-policy ; liens du pied de page |
| Paiement | Stripe (« Les paiements sont traités par le prestataire Stripe ») | CGU art. 5 |
| Contact | Courriel `bonjour@clemz.app` uniquement. « Désolé mais j'ai dû enlever le formulaire de contact : gmail et outlook passaient mes réponses en spam... » | https://www.clemz.app/fr/contact |

---

## 2. Grille des points demandés

### 2.1 Plateformes supportées

**Vinted, et seulement Vinted.**

- Le site ne nomme aucune autre place de marché. FAQ : « Clemz c'est une extension Chrome à installer sur
  son navigateur et qui fait des actions à votre place sur un compte Vinted. »
  (https://www.clemz.app/documentation/faq)
- La preuve la plus solide est le **manifeste de l'extension 1.32.1**, tel que la fiche CWS l'embarque
  (https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg).
  Ses `host_permissions` et ses `content_scripts` ne visent que des domaines Vinted, plus `www.clemz.app`.
  On n'y trouve **aucun** domaine Leboncoin, eBay, Beebs, Depop ou Vestiaire. Permissions déclarées :
  `storage`, `alarms`, `tabs`.
  - Attention à une fausse piste : la page CWS embarque aussi les manifestes des extensions « associées »
    (Dresskare, Vintup, Jarvis For Vinted, VintedCRM, Vrepop, Convert Label…). Ce sont eux qui contiennent
    des domaines Leboncoin, eBay et Vestiaire. Seul le manifeste en version 1.32.1 est celui de Clemz.
- **Pays Vinted couverts par le manifeste** (26 domaines nationaux, plus `vinted.net` pour les images) :
  vinted.fr, .be, .lu, .nl, .de, .at, .it, .es, .pt, .pl, .cz, .sk, .hu, .ro, .lt, .lv, .ee, .fi, .se,
  .dk, .si, .hr, .gr, .ie, .co.uk et vinted.com. Le site, lui, ne donne aucune liste de pays. Il écrit
  seulement « vinted.fr, vinted.be, etc. »
  (https://www.clemz.app/documentation/demarrage-rapide).
- Leboncoin : absent du produit. Il n'apparaît que dans la biographie du fondateur : « me suis mis à barouder
  sur les plateformes de seconde main : Vinted, LBC,... » (https://www.clemz.app/fr/about).
- Beebs, eBay FR : absents.
- Ce qui est **annoncé pour plus tard** (avis CWS du 15/09/2026 et réponse du développeur du 16/09/2026,
  https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg/reviews) :
  - l'avis : « à l'écoute des suggestions pour faire avancer l'extension, notamment pour la publication
    simultanée sur plusieurs plateformes, ce qui serait un vrai plus » ;
  - la réponse de « Clement de Clemz » : « Nous allons travailler à la publication simultanée, c'est
    certain » ;
  - le 08/10/2026, en réponse à un autre avis (« Clemz n'est pas encore un "tout-en-un" ») : « On travaille à
    fond pour se rapprocher du tout-en-un... sans faire une usine à gaz ! ».
  Aucune date et aucune liste de plateformes n'est donnée.

### 2.2 Application mobile iOS / Android

**Il n'existe pas d'application native.**
- Le site ne contient aucun lien vers l'App Store ni vers Google Play.
- L'API de recherche App Store (`itunes.apple.com/search?term=clemz&country=fr&entity=software`) renvoie
  `"resultCount":0` (09/10/2026).
- La recherche Google Play « clemz » et « clemz vinted » ne fait apparaître aucune application Clemz
  (https://play.google.com/store/search?q=clemz&c=apps&hl=fr, 09/10/2026).
- Sur mobile, l'extension tourne **dans un navigateur tiers** qui accepte les extensions Chrome :
  - Android : « Sur Android : utilisez le navigateur Quetta » (FAQ). Le démarrage rapide détaille
    l'installation par Quetta, avec une astuce : passer en « Version pour ordinateur » pour voir le bouton
    « Ajouter à Chrome ».
  - iOS : **la documentation se contredit**.
    - FAQ : « Clemz fonctionne sur tous vos appareils : ordinateur, Android (mobile/tablette) et IOS
      (Iphone / Ipad) » et « Sur IOS (Iphone/Ipad) : utilisez le navigateur Orion ».
    - Démarrage rapide : « Malheureusement Clemz n'est pas disponible sur Iphone/IOS ».
    - La page « Republier » cite « Chrome, Quetta ou Orion ».
  - Il ne fonctionne jamais dans l'application Vinted : « Clemz ne peut pas fonctionner sur l'application
    mobile de Vinted. » (démarrage rapide)

### 2.3 Extension navigateur

**Oui, c'est le cœur du produit.**
- Fiche CWS « Clemz - automatisez votre dressing », éditeur SASU Clemz, catégorie Shopping.
- **10 000 utilisateurs**, **4,8/5 sur 147 avis**, version **1.32.1**, « Dernière mise à jour : 8 octobre
  2026 », 1,32 Mio, 5 langues (English, español, français, italiano, polski), « Propose des achats via
  l'application ». Mention « L'éditeur a un bon historique, sans aucun cas de non-respect des règles ».
  (https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg?hl=fr, 09/10/2026)
- Navigateurs : Chrome sur ordinateur. Les CGU citent aussi Edge : « conçu pour fonctionner de manière
  optimale avec les versions récentes et à jour des navigateurs Chrome et Edge ». Sur mobile, Quetta
  (Android) et Orion (iOS, contradictoire, voir 2.2). Kiwi Browser apparaît encore sur la page « Traduire
  Clemz », et la page tarifs prévient : « Le paiement ne fonctionne pas toujours sur KiwiBrowser ».
- L'interface s'affiche **dans la page Vinted** : « Clemz va apparaître automatiquement en bas à gauche. »
  Un tableau de bord web existe aussi sur clemz.app (sauvegarde, ventes, comptabilité, « Mes conversations »).

### 2.4 D'où l'on part

- **Ordinateur** (Chrome) ou **téléphone Android** (Quetta). L'iPhone n'est pas tranché (voir 2.2).
- Tout passe toujours par le **site web Vinted**, ouvert dans le navigateur où l'extension est installée.
  Il n'y a pas d'application mobile qui pilote un autre appareil.
- L'appareil doit rester actif pendant le travail : « Ne touchez pas à votre navigateur (Chrome / Quetta)
  pendant que Clemz travaille » et « Ne laissez pas votre appareil se mettre en veille. Sur smart phone
  notamment, cela va couper la connexion et bloquera l'extension. »
  (https://www.clemz.app/documentation/resoudre-un-bug)

### 2.5 Identification par photo / IA (titre, description, prix)

**Rien de disponible publiquement aujourd'hui.**
- Accueil : la carte « Photo IA — Valorisez vos articles — Photos portées conformes » est marquée
  **« Bientôt »** (https://www.clemz.app/fr).
- Documentation « Messages auto » : « Comment marchent les "réponses IA" de Clemz ? — A venir ... »
  (https://www.clemz.app/documentation/messages-auto).
- En revanche, les CGU du 05/03/2026 décrivent déjà des « fonctionnalités de génération automatisée de
  contenus, notamment de descriptions d'articles ou de visuels, reposant sur des technologies d'intelligence
  artificielle ». Elles créent aussi des **« Crédits IA »** achetables par lots (« L'Utilisateur peut acheter
  des lots de Crédits IA au prix affiché au moment de l'achat », art. 4 bis). La politique de
  confidentialité mentionne la « génération de descriptions ou de visuels » et des « fournisseurs de services
  d'intelligence artificielle ».
- Aucun texte ne parle d'identifier un objet à partir d'une photo, ni de suggérer un titre ou un prix à
  partir d'une photo.
- **Impossible à vérifier sans compte** : savoir si une fonction IA est déjà ouverte à une partie des
  abonnés, et à quel prix sont les crédits.

### 2.6 Import / synchronisation du stock existant

- **Le dressing Vinted existant est lu sur place.**
  - Le « Smart dressing » affiche tout le dressing, avec filtres et tri par mot-clef, prix, vues et favoris.
    Pour les dressings de plus de 2000 articles, on travaille par tranche de positions.
  - La « Sauvegarde » copie les annonces (photos, titre, description, tailles, prix, mesures) sur clemz.app :
    « Sauvegarder ses annonces Vinted permet d'avoir un copie sur www.clemz.app […] de l'ensemble des photos
    et informations de vos articles ».
  - Sources : https://www.clemz.app/documentation/smart-dressing ;
    https://www.clemz.app/documentation/sauver-mes-annonces
- **Les ventes Vinted sont synchronisées** sur jusqu'à 3 ans d'historique : « Période de synchronisation
  vous permet de remonter plus loin dans votre historique de vente (jusqu'à 3 ans). »
  (https://www.clemz.app/documentation/synchroniser-ses-ventes). La synchronisation se lance par un bouton
  ou sur rappel, selon une fréquence réglable.
- **Réimport** : une annonce sauvegardée se renvoie vers Vinted, sur le même dressing ou sur un autre
  « en cas de ban ». Deux voies existent : la republication, ou l'« auto-complétion » du formulaire Vinted
  (version 1.31.0 du 29/09/2026).
- Aucun import depuis une autre plateforme : aucune n'est supportée.

### 2.7 Retrait automatique des copies après une vente (auto-delist)

**Sans objet.** Clemz ne publie que sur Vinted, donc il n'existe aucune copie à retirer ailleurs. Le seul
geste proche se fait sur clemz.app : quand une vente est synchronisée, « Clemz les passe en "vendus" »
(il s'agit des articles sauvegardés, https://www.clemz.app/documentation/synchroniser-ses-ventes). Ce
n'est pas un retrait d'annonce.

### 2.8 Republication / relist automatique

**C'est la fonction phare.**
- Mécanique : « Republier une annonce consiste à créer une nouvelle annonce en copiant exactement les
  informations d'une vieille annonce (mêmes photos, titre, description, etc.) puis supprimer l'ancienne
  annonce » (https://www.clemz.app/documentation/republier-des-articles).
- Déclenchement : l'utilisateur remplit une liste « à traiter » depuis son dressing, puis clique sur
  « Go Clemz ! ». La documentation publique ne décrit **aucune planification à heure fixe**. Elle conseille
  seulement de republier aux heures de pointe (« 6h-8h, 12h-13h, 19h-21h et les week-ends »).
- Modes de republication :
  - « Standard » : « Très rapide mais potentiellement visible pour Vinted » ;
  - « Navigation Humaine » : plus lent, avec plus de pauses ;
  - « Validation Manuelle » : l'utilisateur valide lui-même chaque formulaire (version 1.32.0 du
    06/10/2026, améliorée en 1.32.1 le 08/10).
  - Il existe aussi un réglage de rythme (espacement simple ou « Rythme naturel »).
- Types de republication : « (re)Publier en annonce », « Annonce => Brouillon » et « Brouillon => Annonce ».
- Photos : la republication repart des photos sauvegardées (« aucun risque de dégradation des photos après
  plusieurs republications »). Elle peut ajouter cadre, emoji, texte ou fond, avec un objectif annoncé
  noir sur blanc : « afin que Vinted ne les reconnaisse pas : idéal pour tromper l'algorithme ».
- Volumes mensuels selon la formule : 250 (essai), 300, 1 000, 3 000 et 6 500 republications par mois
  (page tarifs).
- Captchas : quand un captcha Vinted bloque Clemz, celui-ci « vous le présente directement et il vous suffit
  de le résoudre ».

### 2.9 Stock, ventes, statistiques

Source : https://www.clemz.app/documentation/synchroniser-ses-ventes, sauf mention contraire.
- **Suivi des ventes** par statut (« à préparer, expédiée, livrée »), avec filtre par dressing et suivi des
  colis par transporteur.
- **Analyse** : « Chiffre d'Affaires total, votre Volume de ventes, votre Panier moyen, et votre taux
  d'annulation ». On y trouve aussi une carte de chaleur des meilleurs moments pour vendre, les ventes par
  pays, les transporteurs et les réductions accordées.
- **Comptabilité** : vue mensuelle ou trimestrielle, au choix entre date de vente et date de finalisation,
  TVA ventilée « par pays », export CSV. Avertissement : « Clemz n'est pas un outil comptable agréé ».
- **Factures** PDF, numérotation réglable et envoi automatique à l'acheteur, « exclusivement réservée aux
  dressings ayant le statut PRO sur Vinted ».
- **Base clients** (CRM) : nombre de commandes, montant dépensé, date du dernier achat, export CSV ; l'e-mail
  de l'acheteur est récupéré pour les comptes PRO.
- **Bordereaux** générés automatiquement à chaque synchronisation, puis « jusqu'à 50 bordereaux d'un coup »
  dans un seul PDF. Trois formats : A4 complet, économie d'encre, imprimante thermique. Titre de l'article
  ajouté au bordereau, ou page « Sommaire » à part.
- **Automatisations de vente** : message à l'achat, à l'expédition (version 1.30.0) et à la finalisation, et
  « Évaluation automatique » 5 étoiles envoyée à l'acheteur. Jusqu'à 10 modèles de message, tirés au hasard.
- **« Stock »** au sens de Clemz : une liste « en stock » dans l'extension, qui met des articles de côté
  pour les republier plus tard. La sauvegarde clemz.app sert de catalogue (tri, filtres, listes, historique
  des republications, téléchargement des photos en zip).
- **Non trouvé dans les pages publiques** : un prix d'achat, une marge ou un bénéfice par article. Les CGU
  parlent de « marges » seulement dans une clause de non-garantie.
- **Autres fonctions**, hors stock :
  - messages automatiques aux personnes qui mettent un favori, avec offre de réduction ;
  - offres automatiques et contre-offres progressives ;
  - « échange » de vues et de favoris : Clemz donne des vues et des favoris aux articles d'autres
    utilisateurs de Clemz et en reçoit en retour (« En donnant des vues à la communauté et donc en recevant
    des vues en retour ») ;
  - modification en masse : prix, photos, masquage, suppression ;
  - « Smart messagerie » ;
  - copier-coller de textes enregistrés.

### 2.10 Prix

Page https://www.clemz.app/fr/pricing (le bouton « Mensuel » est actif par défaut). Les prix annuels se
lisent dans le HTML de la page (`data-pricing-value`) et dans la mention « paiement en 1 fois de … ».

| Formule | Mensuel | Annuel (−16 %) | Dressings Vinted actifs | Republications/mois | Vues/article | Favoris/article | Messages auto (favoris et offres) | Compta / factures / CRM |
|---|---|---|---|---|---|---|---|---|
| Essai gratuit | 0 €, « Durée : 1 mois » | — | 1 | 250 | ~10 | 10 | 40/jour | oui |
| Tiroir | **8,99 €/mois** | 89,90 €/an (≈ 7,49 €/mois) | 1 | 300 | ~10 | 10 | non | non |
| Placard (« Le plus populaire ! ») | **14,99 €/mois** | 149,90 €/an (≈ 12,49 €/mois) | 2 | 1 000 | ~20 | 20 | 60/jour | non |
| Dressing | **24,99 €/mois** | 249,90 €/an (≈ 20,82 €/mois) | 4 | 3 000 | ~30 | 30 | 150/jour | oui |
| Entrepot (« Pour les PROs ! ») | **34,99 €/mois** (49,99 € barré, « -30% ») | 349,90 €/an (≈ 29,15 €/mois) | 10 | 6 500 | ~40 | 40 | illimité | oui |

- Devise : **euro uniquement**. La page anglaise affiche les mêmes montants en € (https://www.clemz.app/en/pricing).
- Taxes : « toutes taxes comprises (TTC) pour les Utilisateurs non professionnels, et hors taxes (HT) pour
  les Utilisateurs professionnels » (CGU art. 4).
- Essai : « Essai gratuit : 1 mois pour tester Clemz » et « Vous pouvez essayer Clemz pendant 30 jours sans
  engagement et 100% gratuitement ». L'essai démarre au clic sur « Lier Clemz à ce dressing Vinted »
  (démarrage rapide). **Il n'y a pas de formule gratuite permanente.**
- Engagement : l'abonnement mensuel est sans durée et se résilie à tout moment ; l'annuel se renouvelle par
  période d'un an (CGU art. 1).
- « Prix fixé à vie si abonné : Clemz n'augmentera jamais votre abonnement tant que vous restez abonné »
  (sur chaque carte). Cela coexiste avec la clause des CGU « Les tarifs peuvent évoluer » (art. 4.1). Un
  bandeau « Augmentation des prix prévue dans plus de 3 ans » est présent dans le HTML, mais **en
  commentaire** : il n'est pas affiché.
- « Crédits IA » vendus par lots (CGU art. 4 bis) : **aucun prix affiché publiquement**.
- Parrainage (mois offerts) et affiliation (commissions, à partir de 10 filleuls abonnés) :
  https://www.clemz.app/documentation/devenir-affilie.

### 2.11 Pays et langues

- **Langues du site** : FR, EN, ES, IT, PL (sélecteur, `hreflang` en/fr/es/it/pl, `x-default` = /fr).
  Toute la documentation existe dans les 5 langues : le sitemap compte 127 URL, par exemple
  `relist-listings-for-articles`, `republicar-anuncios`, `ripubblicare-annunci`, `relistowac-ogloszenia`.
  Le sitemap est servi par https://www.clemz.app/sitemap.xml.gz, qui redirige vers un compartiment S3.
  Le site n'a **pas de blog**.
- **Langues de l'extension** sur le CWS : English, español, français, italiano, polski.
- Pour les autres langues : « Si Clemz n'est pas disponible dans votre langue préférée, vous pouvez
  facilement traduire n'importe quelle page en utilisant simplement Chrome ou Kiwi Browser. »
  (https://www.clemz.app/documentation/traduire-clemz)
- **Pays** : le site n'en liste aucun. Le manifeste couvre 26 domaines Vinted nationaux (voir 2.1). Les CGU
  sont de droit français, et « seule la version en français fait foi ».

### 2.12 Notes publiques

| Source | Note | Nombre | Date | URL |
|---|---|---|---|---|
| Chrome Web Store | **4,8 / 5** | **147 avis**, 10 000 utilisateurs | lu le 09/10/2026 ; avis les plus récents datés du 7, 8 et 9 oct. 2026 | https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg/reviews |
| Trustpilot | aucune fiche | — | 09/10/2026 : `fr.trustpilot.com/review/clemz.app` et `/review/www.clemz.app` renvoient 404 | — |
| App Store | aucune application | — | 09/10/2026, recherche iTunes FR : 0 résultat | https://itunes.apple.com/search?term=clemz&country=fr&entity=software |
| Google Play | aucune application | — | 09/10/2026 | https://play.google.com/store/search?q=clemz&c=apps&hl=fr |

- Ce que le site affiche lui-même : « Plus de 9 000 utilisateurs ont déjà fait confiance à Clemz » (accueil,
  tarifs, avis) et « Avis: 5/5 ⭐⭐⭐⭐⭐ » (https://www.clemz.app/fr/reviews). Ce 5/5 diffère du 4,8 du
  CWS.
- La description française du CWS dit « (+ de 7000 utilisateurs) », la description anglaise « (10,000+
  users) ».
- La description CWS contient aussi une pique contre la concurrence : « Comparez mes avis avec les faux avis
  des autres extensions ».
- Le développeur répond aux avis, souvent le jour même ou le lendemain (« Clement de Clemz — Développeur »).

---

## 3. Ce qu'ils font bien (honnêtement)

1. **Une profondeur fonctionnelle rare sur Vinted** : republication avec trois niveaux de prudence,
   sauvegarde qui garde la qualité des photos, réimport après un bannissement, automatisations de vente,
   bordereaux par lots au format thermique, comptabilité avec TVA par pays, factures PRO, base clients.
2. **Une cadence de livraison visible et soutenue** : 1.29.0 le 06/08, 1.30.0 le 25/08, 1.30.1 le 31/08,
   1.30.7 le 15/09, 1.31.0 le 29/09, 1.32.0 le 06/10, 1.32.1 le 08/10/2026. Chaque version est décrite en
   clair (https://www.clemz.app/changelog?locale=fr).
3. **Une note CWS solide** (4,8 sur 147 avis) et la plus grosse base installée de la niche (10 000). Les avis
   récents saluent tous le support « humain » et réactif.
4. **Des prix lisibles** : quatre paliers simples, quotas chiffrés, remise annuelle claire, essai d'un mois
   complet, avec la compta incluse pendant l'essai.
5. **Une documentation très fournie et bien référencée** : chaque fonction a sa page longue, avec
   explications, conseils et vidéos YouTube, déclinée en 5 langues avec hreflang. C'est un actif SEO
   important sur des requêtes comme « republier Vinted », « bordereaux Vinted » ou « messages favoris Vinted ».
6. **Le multi-dressing** natif : de 1 à 10 dressings Vinted selon le palier, avec filtre par dressing dans
   les ventes.
7. **Une communauté propre** (forum vint-aide.com), plus un parrainage et une affiliation.
8. **Le fonctionnement sur Android sans ordinateur** : le navigateur Quetta exécute l'extension directement
   sur le téléphone.
9. **La transparence juridique** : société, RCS, adresse, téléphone et statut de « professionnel » au sens
   de l'UE, tous affichés sur le CWS.

---

## 4. Écarts factuels avec FillSell (sans jugement)

- **Une seule plateforme** : Clemz ne couvre que Vinted (le manifeste 1.32.1 le prouve). FillSell couvre
  Vinted, Leboncoin, eBay et Beebs. En conséquence, Clemz n'a ni publication croisée ni retrait automatique
  des copies après une vente. La publication simultanée est **annoncée** par le développeur (16/09/2026),
  sans date.
- **Aucune application mobile native** chez Clemz. On passe par un navigateur tiers (Quetta sur Android ;
  sur iOS, Orion d'après la FAQ, alors que le démarrage rapide dit « pas disponible »). FillSell a une
  application iOS/Android qui pilote l'extension de l'ordinateur.
- **Pas de création d'annonce par photo ni par IA aujourd'hui** : « Photo IA » est marquée « Bientôt » et
  les « réponses IA » « A venir », même si les CGU prévoient déjà des « Crédits IA ».
- **Aucune formule gratuite permanente** : un essai d'un mois, puis 8,99 € par mois au minimum.
- **Pas de suivi du prix d'achat ni de la marge par article** dans la documentation publique.
- Un positionnement assumé sur l'**échange de vues et de favoris** et sur la **modification des photos
  « pour tromper l'algorithme »** de Vinted. C'est un choix produit, cité ici sans commentaire.

---

## 5. Ce qu'on ne peut pas vérifier sans compte

- Le fonctionnement réel de l'extension (fiabilité de la republication, taux de restrictions Vinted, temps
  de traitement).
- Si une fonction IA est déjà ouverte, et le prix des lots de « Crédits IA ».
- Si l'essai d'un mois demande une carte bancaire.
- Le contenu exact du tableau de bord clemz.app (analyse, comptabilité, conversations) au-delà des captures
  et des descriptions de la documentation.
- Le fonctionnement réel sur iOS par Orion, puisque la documentation se contredit.
- Le nombre réel d'abonnés payants : seuls les 10 000 « utilisateurs » du CWS sont publics, ce sont des
  installations.
- Une date ou un périmètre pour la « publication simultanée » annoncée.

---

## 6. Sources (toutes consultées le 2026-10-09)

| URL | Ce qu'on y a lu |
|---|---|
| https://www.clemz.app/fr | accueil : fonctions, « Photo IA — Bientôt », « Plus de 9 000 utilisateurs », lien Chrome Store seul, hreflang |
| https://www.clemz.app/fr/pricing | 4 paliers, quotas, essai d'un mois, mensuel/annuel −16 %, prix annuels |
| https://www.clemz.app/en/pricing | mêmes prix en €, « Free trial: 1 month » |
| https://www.clemz.app/documentation/faq | « extension Chrome… sur un compte Vinted », Quetta/Orion, équipe |
| https://www.clemz.app/documentation/demarrage-rapide | Chrome / Quetta, « pas disponible sur Iphone/IOS », pas d'appli Vinted, multi-dressing |
| https://www.clemz.app/documentation/republier-des-articles | mécanique de la republication, modes, photos modifiées, captchas |
| https://www.clemz.app/documentation/synchroniser-ses-ventes | ventes sur 3 ans, analyse, compta, factures PRO, CRM, bordereaux, automatisations |
| https://www.clemz.app/documentation/sauver-mes-annonces | sauvegarde, réimport, auto-complétion, « lien » sauvegarde ↔ Vinted |
| https://www.clemz.app/documentation/messages-auto | offres automatiques ; « réponses IA — A venir » |
| https://www.clemz.app/documentation/echanger-des-vues | échange de vues entre utilisateurs |
| https://www.clemz.app/documentation/smart-dressing | affichage et filtres du dressing entier |
| https://www.clemz.app/documentation/resoudre-un-bug | appareil actif, ne pas toucher au navigateur |
| https://www.clemz.app/documentation/traduire-clemz | traduction par Chrome / Kiwi pour les autres langues |
| https://www.clemz.app/documentation/devenir-affilie | parrainage, affiliation |
| https://www.clemz.app/changelog?locale=fr | versions 1.26.6 à 1.32.1 (15/07 → 08/10/2026) |
| https://www.clemz.app/fr/terms-conditions | SASU Clemz, RCS, paliers, TTC/HT, Chrome et Edge, Crédits IA, essai |
| https://www.clemz.app/fr/privacy-policy | forum vint-aide.com déclaré, IA (descriptions, visuels), Stripe |
| https://www.clemz.app/fr/about | Clément (Montpellier), Lucile ; « Vinted, LBC,... » |
| https://www.clemz.app/fr/reviews | « Avis: 5/5 », « +9 000 utilisateurs » |
| https://www.clemz.app/fr/contact | courriel seul, pas de formulaire |
| https://www.clemz.app/sitemap.xml.gz | 127 URL, documentation en 5 langues, pas de blog |
| https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg?hl=fr | 4,8 (147 avis), 10 000 utilisateurs, v1.32.1 du 8 oct. 2026, 5 langues, éditeur ; manifeste embarqué (domaines Vinted seulement) |
| https://chromewebstore.google.com/detail/clemz-automate-your-close/kjpggncklgopkhbfpohiaomjpljkbifg/reviews | avis du 7 au 9/10/2026 ; réponse du 16/09/2026 sur la « publication simultanée » |
| https://itunes.apple.com/search?term=clemz&country=fr&entity=software | 0 résultat |
| https://play.google.com/store/search?q=clemz&c=apps&hl=fr | aucune application Clemz |
| https://fr.trustpilot.com/review/clemz.app | 404 (aucune fiche) |
| https://www.vint-aide.com | forum Vinted ; compte « Clement » qui annonce les nouveautés de Clemz |
