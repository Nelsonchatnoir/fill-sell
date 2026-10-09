# FlowDino — vérification sur ses pages réelles

Date d'observation : **2026-10-09**. Méthode : lecture du web seulement (curl, WebFetch, WebSearch).
Aucun compte n'a été créé, aucune connexion faite, aucun formulaire rempli (pas même celui de
`/support`). Le paquet public de l'extension a été téléchargé depuis le serveur de mises à jour de
Google ; seul son `manifest.json` a été lu, et rien n'a été exécuté. Le paquet JavaScript public du
site (`/react/static/js/main.4f186208.js`) a été lu comme du texte pour retrouver les libellés
affichés après chargement (formule de prix, compteur de l'accueil, langues). Les chiffres publiés par
FlowDino (heures gagnées, « milliers de vendeurs », compteur d'annonces) sont **ses propres
affirmations**. Les seuls chiffres tiers relevés viennent du Chrome Web Store (CWS), de l'App Store
Shopify, du répertoire d'extensions WordPress et du répertoire public des entreprises, lus le
09/10/2026.

Pages lues le 09/10/2026 : accueil, `/pricing`, `/faq`, `/support`, `/documentation` et 22 pages
`/docs/…` (principe, inscription, centralisation, import, assistant IA, publication, éditeur
d'images, suppression automatique, tableau des ventes, installation et usage de l'extension,
récupération du catalogue, suppression depuis l'extension, configuration des sites, gestion des
articles, automatisation, PrestaShop, WooCommerce, Shopify, partenariat Reusses), `/blog` et deux
articles (comparatif crosslisting, double vente), `/cgu`, `/mentions-legales`, `/privacy`,
`/affiliate/program`, `/affiliate/terms`, `robots.txt`, `sitemap.xml` (46 URL), `llms.txt`, la fiche
CWS et ses avis, le manifeste de l'extension 1.4.13, la fiche Shopify, l'API WordPress.org, l'API
d'AMO (Firefox), la recherche App Store (API iTunes), la recherche Google Play, Trustpilot, et le
répertoire public des entreprises (API recherche-entreprises).

Les réponses de FAQ citées viennent du texte prérendu des pages (identique au balisage `FAQPage` en
JSON-LD).

---

## 1. Fiche d'identité

| Élément | Constat | Source (lue le 2026-10-09) |
|---|---|---|
| Nom | FlowDino. Titre de l'accueil : « Automatisez vos annonces sur Vinted, Leboncoin, Etsy, eBay, Vestiaire Collective, Beebs, Whatnot & Opla \| FlowDino » | https://www.flowdino.com/ |
| Éditeur | CGU : « FlowDino — SIREN : 514 428 234 RCS Saint Quentin — 25 rue Tartarin 02700 Frières Faillouël ». Répertoire public : SIREN 514428234, **entrepreneur individuel** (nature juridique 1000), « JEREMY DUMONT », actif, créé le 2009-08-25, NAF 63.12Z. Fiche CWS : développeur « Jeremy DUMONT », même adresse, « Professionnel » au sens de l'UE | https://www.flowdino.com/cgu ; https://recherche-entreprises.api.gouv.fr/search?q=514428234 (https://annuaire-entreprises.data.gouv.fr/entreprise/514428234) ; fiche CWS |
| Mentions légales | Éditeur « FlowDino », directeur de publication « L'administrateur de FlowDino », sans nom ni SIREN sur cette page ; « Dernière mise à jour : 19 juin 2025 » | https://www.flowdino.com/mentions-legales |
| Hébergement | « Hostinger International LTD […] Larnaca, Chypre — Le serveur de données est hébergé en France » | https://www.flowdino.com/mentions-legales |
| Paiement | « Paiement par carte bancaire via le service de paiement Stripe » ; « Les prix sont exprimés en Euros, HT et TTC » | https://www.flowdino.com/cgu (« Dernière mise à jour : 1er juin 2026 ») |
| Ancienneté visible | plus ancien avis CWS : 18 sept. 2025 ; footer « © 2025 FlowDino » ; app Shopify « Lancement 14 avril 2026 » ; plugin WordPress ajouté le 2026-03-20 | fiche CWS `/reviews` ; https://apps.shopify.com/flowdino-gestion-multiplatef ; API WordPress.org |
| Fiche CWS | « FlowDino - Gestion Multi Plateformes », **326 utilisateurs**, **5,0 / 5 (6 avis)**, version **1.4.13**, « Dernière mise à jour 7 octobre 2026 », 1.24 MiB, **17 langues**, « Propose des achats via l'application » | https://chromewebstore.google.com/detail/flowdino-gestion-multi-pl/iealfioknccembacfpjgodhoehdmggak |
| Affiliation | « FlowDino n'est ni affilié, ni partenaire, ni approuvé par aucune plateforme tierce (notamment Vinted, Leboncoin, ou toute autre place de marché). FlowDino est un outil indépendant d'assistance à la navigation. » | https://www.flowdino.com/cgu |
| Compteur publié | l'accueil affiche, après chargement, « {N}+ annonces publiées » ; l'API publique `/api/public/stats` renvoyait `{"publishedListings":514847}` (soit « 514 000+ » à l'écran). Chiffre de FlowDino, non vérifiable | https://www.flowdino.com/api/public/stats ; paquet JS (`keyStats.listings` = « annonces publiées ») |

---

## 2. Les points demandés

### 2.1 Plateformes supportées — **Vinted, Leboncoin, eBay, Etsy, Vestiaire Collective, Beebs ; Whatnot et Opla en bêta**

- « FlowDino publie sur huit marketplaces : Vinted, Leboncoin, eBay, Etsy, Vestiaire Collective,
  Beebs, Whatnot et Opla. Vous choisissez les sites que vous souhaitez connecter, et la tarification
  s'ajuste en conséquence » — https://www.flowdino.com/faq
- Bandeau présent sur toutes les pages : « Nouveaux sites disponibles : Whatnot et Opla, version
  bêta. Vous pouvez prendre l'abonnement, il sera remboursé. […] Beebs est maintenant stable, il sera
  facturé à partir du 1/10 » — https://www.flowdino.com/
- Boutiques reliées (source du catalogue, pas des marketplaces) : PrestaShop, WooCommerce, Shopify ;
  partenariat Reusses (réseau de revente déléguée) — https://www.flowdino.com/docs/partnership-reusses

| Plateforme | Supportée ? | Détail et citation |
|---|---|---|
| **Vinted** | Oui | Publication, renouvellement, réponses aux favoris avec offre, récupération des ventes. **Pays** : aucune page ne nomme de pays. Le manifeste 1.4.13 déclare **23 domaines Vinted** : vinted.at, .be, .cz, .de, .dk, .es, .fi, .fr, .gr, .hr, .hu, .ie, .it, .lt, .lu, .nl, .pl, .pt, .ro, .se, .sk, .co.uk, .com (permissions d'hôte et scripts de contenu). La doc gère le « Nouveau système de taille Vinted » (S/M/L, UE, UK, FR, IT, US). Que la publication fonctionne sur chacun de ces pays n'est pas vérifiable sans compte. `llms.txt` : « Marché principal : France, Belgique, Suisse francophone ». |
| **Leboncoin** | Oui | « Leboncoin reste la référence des petites annonces en France. FlowDino gère la publication multi-catégories (mode, électronique, maison, véhicules), renouvelle automatiquement vos annonces avant expiration » (https://www.flowdino.com/). Réglages : numéro de téléphone affiché ou non, villes par défaut, « Livraison personnalisée / Autre moyen » (https://www.flowdino.com/docs/sales-config). Domaines : leboncoin.fr, api.leboncoin.fr. |
| **Beebs** | Oui, « stable », facturé depuis le 1/10 | Nommé dans toutes les listes de plateformes et dans le bandeau ci-dessus. Domaines : www.beebs.app, api.beebs.app, cdn-api.beebs.app, marketplace.api.beebs.app. **Aucune page de doc dédiée à Beebs** : la configuration des sites (https://www.flowdino.com/docs/sales-config) ne traite que Leboncoin, Vinted, eBay, Etsy et Vestiaire ; la récupération du catalogue ne cite pas Beebs (voir 2.6). |
| **eBay France** | Oui | « Pour pouvoir utiliser Ebay avec FlowDino, vous devez configurer votre token d'authentification […] cliquez sur le bouton "Connecter Ebay" […] saisissez vos identifiants Ebay » (fenêtre eBay) ; jusqu'à 4 transporteurs (https://www.flowdino.com/docs/sales-config). Manifeste : ebay.fr et ebay.com seulement (aucun ebay.de, .it, .co.uk). Autres sites eBay : non documentés. |
| Etsy | Oui | « génère automatiquement les 13 tags optimaux […] renouvelle vos annonces arrivées à expiration après quatre mois » (https://www.flowdino.com/) |
| Vestiaire Collective | Oui | « Pour pouvoir utiliser le renouvellement automatique […] vous devez créer votre compte professionnel » ; « La récupération des ventes n'est possible que sur les articles publiés avec FlowDino » (https://www.flowdino.com/docs/sales-config) |
| Whatnot | Bêta | bandeau ; domaine www.whatnot.com |
| Opla | Bêta | bandeau ; domaines opla.co |
| Depop, Facebook Marketplace | **Non** | Aucune page ne les propose ; aucun domaine dans le manifeste. Les CGU citent « Facebook Marketplace » seulement comme exemple de plateforme tierce (art. 7). Le comparatif du blog renvoie Depop aux « solutions américaines ». |

### 2.2 Application mobile iOS / Android — **non ; sur Android, le navigateur Yandex est proposé**

- Aucune application : l'API iTunes Search (`term=flowdino`, `country=fr`) renvoie **0 résultat** ;
  la recherche Google Play « flowdino » (https://play.google.com/store/search?q=flowdino&c=apps&hl=fr&gl=FR)
  ne remonte aucune application FlowDino (09/10/2026).
- `llms.txt`, rubrique « Roadmap & Vision » : « App mobile native » (donc à venir) —
  https://www.flowdino.com/llms.txt (« Dernière mise à jour : Janvier 2026 »).
- Contournement documenté : « Sur mobile Android, Google Chrome ne supporte pas les extensions. Le
  navigateur Yandex est la solution parfaite car il permet d'installer et d'utiliser les extensions
  Chrome, y compris FlowDino ! » — https://www.flowdino.com/docs/chrome-installation
- JSON-LD `SoftwareApplication` : `"operatingSystem": "Web, Chrome Extension"` — https://www.flowdino.com/

### 2.3 Extension navigateur — **oui, Chrome ; c'est elle qui exécute tout**

- « FlowDino dispose d'une extension Chrome disponible sur le Chrome Web Store. Elle permet de
  synchroniser directement vos annonces depuis les plateformes et d'automatiser les interactions sans
  quitter votre navigateur. » — https://www.flowdino.com/
- « Les actions passent par l'extension Chrome, depuis votre propre navigateur et vos sessions déjà
  ouvertes : vos identifiants restent chez vous » — https://www.flowdino.com/faq
- Configuration requise : « Google Chrome version 90 ou plus récente », « Windows 10/11, macOS 10.15+
  ou Linux » — https://www.flowdino.com/docs/chrome-installation
- **Firefox** : la doc écrit « Installez l'extension FlowDino sur Chrome ou Firefox depuis le store
  officiel » (https://www.flowdino.com/docs/features/publish-listings), mais l'API d'AMO
  (`addons.mozilla.org/api/v5/addons/search/?q=flowdino`) ne renvoie **aucune** extension FlowDino.
- Manifeste 1.4.13 (Manifest V3) : permissions `storage, tabs, cookies, scripting, activeTab,
  declarativeNetRequest, alarms, notifications` ; date interne `"release_date": "06/10/2026"`.

### 2.4 D'où l'on part — **l'ordinateur : application web + extension Chrome, navigateur ouvert sur le site concerné**

- Parcours : « 🛠️ Créez et gérez votre catalogue de produits depuis une interface unique » puis
  « 🎯 Sélectionnez les sites de vente […] » puis « 🚀 FlowDino publie / renouvelle automatiquement »
  — https://www.flowdino.com/documentation
- « Grâce à l'extension FlowDino, réalise les actions avec votre navigateur comme si c'était vous.
  Les sites penseront que c'est vous qui réalisez les actions. » — https://www.flowdino.com/documentation
- Condition des automatisations : « l'extension Chrome doit être installée et connectée, et votre
  navigateur doit rester ouvert sur le site concerné pendant l'exécution des tâches » —
  https://www.flowdino.com/faq ; « Ces tâches sont exécutées par l'extension Chrome lorsque le
  navigateur est ouvert sur le site concerné » — https://www.flowdino.com/docs/automation
- Ordinateur éteint : « Si votre ordinateur reste éteint tout le week-end, les retraits se feront au
  prochain lancement. » — https://www.flowdino.com/blog/eviter-double-vente-multi-plateformes
- Aucun fonctionnement « sans ordinateur » (cloud) n'est annoncé.

### 2.5 Identification par photo / IA — **titre et description depuis une photo ; mannequin virtuel et fond ; pas de prix proposé**

- « Ajoutez au minimum 1 photo de votre produit. Données facultatives : vous pouvez ajouter le titre,
  catégorie, prix et marque si vous les avez déjà. » puis « Cliquez sur le bouton "Générer avec IA" »
  — https://www.flowdino.com/docs/features/ai-assistant
- « L'assistant IA génère et reformule vos titres […] et rédige des descriptions d'annonces à partir
  de votre article. Le prompt est personnalisable […] Relisez toujours le résultat avant publication »
  — https://www.flowdino.com/faq
- « Notre mannequin virtuel transforme une simple photo à plat en mise en scène professionnelle » ;
  « Détourage : 3-5 min manuellement vs. 0.2s avec FlowDino » — https://www.flowdino.com/
- Changement de fond : « Notre IA détecte automatiquement l'objet principal […] et remplace
  l'arrière-plan par un fond professionnel de votre choix » — https://www.flowdino.com/faq
- Éditeur d'images manuel (rotation, recadrage, cadres, texte, emojis) —
  https://www.flowdino.com/docs/features/image-editor
- **Prix** : aucune page ne décrit de prix proposé par l'IA. Le prix est saisi ; un « Taux de Marge »
  « permet d'augmenter automatiquement le prix de vente » (https://www.flowdino.com/docs/sales-config).
  `llms.txt` place « reconnaissance produits, pricing dynamique » dans la feuille de route.
- Quotas IA par plan : de « 50 titres et descriptions article IA », « 2 images mise sur mannequin
  IA », « 2 changement de fond » (Gratuit) à 15 000 / 150 / 150 (Platinum) —
  https://www.flowdino.com/pricing

### 2.6 Import / synchronisation du stock existant — **oui : Vinted, Leboncoin, eBay, Etsy par l'extension ; CSV ; boutiques Shopify / WooCommerce / PrestaShop**

- « L'onglet Gestion permet de récupérer les articles que vous avez déjà publiés sur Vinted,
  Leboncoin, eBay ou Etsy et de les importer dans votre catalogue FlowDino, sans les ressaisir.
  L'import est asynchrone » — https://www.flowdino.com/faq
- « ⚠️ Attention : vous êtes limité au nombre d'articles en fonction de votre abonnement. » ; il faut
  être connecté au site et « sur la page principale » — https://www.flowdino.com/docs/chrome-catalogue
- Beebs, Vestiaire, Whatnot, Opla : **non cités** dans la récupération du catalogue.
- Import CSV (mapping des colonnes et des valeurs, valeurs par défaut) —
  https://www.flowdino.com/docs/features/import-system
- Boutiques : « FlowDino se connecte à votre catalogue via API et synchronise automatiquement vos
  produits, prix et stocks sur Vinted, Leboncoin, Ebay et Etsy » — https://www.flowdino.com/ ; app
  Shopify « Synchronisation instantanée du stock et des prix » —
  https://apps.shopify.com/flowdino-gestion-multiplatef ; plugin WooCommerce : « Import marketplace
  sales into WooCommerce » — https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=flowdino
- **Rapprochement** d'une même pièce déjà en ligne sur deux plateformes : **non décrit**. La seule
  règle d'unicité écrite concerne Reusses : « Un même article ne peut pas être créé deux fois : si la
  Reusse renvoie le même article, FlowDino retourne la fiche déjà existante. »
  (https://www.flowdino.com/docs/partnership-reusses). L'onglet Suppression cite des « Doublons
  détectés — Articles similaires ou identiques » comme critère de suppression
  (https://www.flowdino.com/docs/chrome-suppression).

### 2.7 Retrait automatique des copies après une vente — **oui, par l'extension, navigateur ouvert ; pour les annonces publiées avec FlowDino**

- « La suppression automatique retire une annonce des autres plateformes dès qu'un article est vendu
  quelque part […] ces actions s'exécutent via l'extension Chrome, navigateur ouvert sur le site
  concerné. » — https://www.flowdino.com/faq
- Mécanisme décrit : la vente récupérée décrémente le stock ; « Quand le stock d'un article atteint 0,
  l'article est automatiquement désactivé » ; « Vous n'avez plus qu'à lancer la suppression grâce à
  l'onglet Suppression de l'extension. » — https://www.flowdino.com/docs/features/sales-dashboard
- Tâche planifiable « Suppression » : « Retire de vos plateformes les annonces des articles
  désactivés, **publiées au préalable avec FlowDino** » ; « Récupération des ventes » est une autre
  tâche planifiable — https://www.flowdino.com/docs/automation (fréquence de 5 à 360 minutes).
- Leur propre mise en garde : « Si votre ordinateur reste éteint tout le week-end, les retraits se
  feront au prochain lancement. » — https://www.flowdino.com/blog/eviter-double-vente-multi-plateformes
- La doc de l'onglet Suppression ne parle que de « Vinted et Leboncoin » (« Supprimez efficacement vos
  annonces obsolètes sur Vinted et Leboncoin ») — https://www.flowdino.com/docs/chrome-suppression.
  Les plateformes réellement couvertes par le retrait automatique ne sont pas listées.

### 2.8 Republication / relist automatique — **oui : tâches planifiées (intervalle ou heures fixes)**

- « Republier une annonce consiste à supprimer l'ancienne annonce pour éviter les doublons, puis de
  créer une nouvelle annonce identique. » — https://www.flowdino.com/docs/features/publish-listings
- Tâche « Renouveler » : « Vous choisissez l'ancienneté minimale des annonces, le nombre d'annonces
  par exécution et si seuls les produits en stock sont concernés. Planifiable par intervalle ou à
  heures fixes. » ; ancienneté « 1 à 365 » jours ; « entre 1 et 50 » annonces par exécution ;
  intervalle « Minimum : 5 minutes — Maximum : 360 minutes » — https://www.flowdino.com/docs/automation
- Photos modifiées à la republication : « FlowDino permet de modifier vos photos pour que
  l'algorithme ne détecte pas que c'est la même annonce et permettre des republications illimitées »
  — https://www.flowdino.com/docs/features/publish-listings
- eBay : « programme des relistes automatiques » ; Etsy : renouvellement « après quatre mois » —
  https://www.flowdino.com/
- Volume : lié au quota « annonces / mois » du plan (50 à 15 000) — https://www.flowdino.com/pricing.
  Le plan à partir duquel l'automatisation est ouverte n'est pas écrit.
- Autres automatisations (sans équivalent chez FillSell) : « Échange de vues entre membres
  FlowDino », « Échange de favoris », « Réponse aux favoris » avec offre de remise (« Disponible
  uniquement pour Vinted et Vestiaire Collective ») — https://www.flowdino.com/docs/automation

### 2.9 Stock, ventes, statistiques — **oui : tableau des ventes, bénéfice net, bordereaux**

- « Visualisez vos performances de vente en temps réel avec des graphiques et des indicateurs clés
  (nombre de ventes, chiffre d'affaires, articles les plus vendus) » ; par vente : prix, plateforme,
  statut, « Frais », « Bénéfice net » — https://www.flowdino.com/docs/features/sales-dashboard
- « Imprimez vos bordereaux d'expédition directement depuis le tableau de bord : sélection multiple,
  format A4 (1 à 6 par page) ou mode thermique » — même page
- Stock : quantité par article, décrémentée à la vente, article désactivé à 0, réactivation manuelle
  — même page
- Ventes : « La récupération passe par l'extension Chrome » — https://www.flowdino.com/faq ; « Les
  données sont synchronisées quand vous le souhaitez » — sales-dashboard
- Prix d'achat / marge par article : `llms.txt` annonce une « Analyse de la rentabilité par article » ;
  aucune page de doc ne décrit de champ prix d'achat (non vérifiable).
- Plafond d'articles par plan : 50 / 200 / 1 000 / 5 000 / 15 000 — https://www.flowdino.com/pricing

### 2.10 Prix — **en euros, au site connecté : 0 / 7,99 / 14,99 / 29,99 / 44,99 € par mois et par site ; essai 14 jours sans carte**

Page tarifs (texte prérendu, https://www.flowdino.com/pricing) :

| Plan | Prix affiché | Volumes |
|---|---|---|
| Gratuit | « Gratuit » — « 14 jours d'essai » | 50 articles, 50 annonces / mois, 15 vues / jour, 15 favoris / jour, réponses aux favoris 15 / jour, 50 titres et descriptions IA, 2 mannequin IA, 2 fonds IA |
| Starter | « 7.99€ / mois / site » | 200 articles, 200 annonces / mois, 20 / 20 / 20, 200 IA, 4, 4 |
| Pro (« Le plus choisi ») | « 14.99€ / mois / site » | 1 000 articles, 1 000 annonces / mois, 30 / 30 / 30, 1 000 IA, 10, 10, « Support par email » |
| Business | « 29.99€ / mois / site » | 5 000 articles, 5 000 annonces / mois, 50 / 50 / 125, 5 000 IA, 50, 50, « Support prioritaire » |
| Platinum | « 44.99€ / mois / site » | 15 000 articles, 15 000 annonces / mois, 150 / 150 / 300, 15 000 IA, 150, 150, « Support prioritaire » |

- Bascule « Mensuel / Annuel — Économisez jusqu'à 20% » (prix annuels non prérendus).
- Formule affichée dans l'application (paquet JS) : « {{price}}€ × {{sites}} sites = {{total}}€ » ;
  FAQ : « Le tarif se calcule par site connecté : vous ne payez que les plateformes que vous
  utilisez. » — https://www.flowdino.com/faq
- **Calcul de notre part**, d'après cette formule : Vinted + Leboncoin + eBay + Beebs (4 sites) =
  31,96 €/mois en Starter, 59,96 €/mois en Pro, 119,96 €/mois en Business.
- Essai : « L'offre d'essai vous donne accès à toutes les fonctionnalités de base pendant 14 jours,
  sans engagement et sans carte bancaire. » — https://www.flowdino.com/pricing. Sites en bêta
  (Whatnot, Opla) : abonnement « remboursé ».
- Engagement : « contrat d'une durée minimum d'un mois, renouvelable par tacite reconduction » —
  https://www.flowdino.com/cgu
- **Autres prix affichés ailleurs** (voir § 3) : FAQ de l'accueil « Premium à 19,99 €/mois et Pro à
  49,99 €/mois » ; app Shopify en dollars : Starter « $7.99 / mois ou $79/an », Pro « $14.99 ou
  $149.99/an », Business « $29.99 ou $299.99/an », « Tous les frais sont facturés en USD » —
  https://apps.shopify.com/flowdino-gestion-multiplatef

### 2.11 Pays et langues — **site en français et en anglais ; extension en 17 langues ; marché « France, Belgique, Suisse francophone »**

- Sélecteur du site : « Français », « English » — https://www.flowdino.com/
- Fiche CWS : « 17 langues » (Deutsch, English, Nederlands, dansk, español, français, hrvatski,
  italiano, lietuvių, magyar, polski, română, slovenčina, suomi, svenska, čeština, Ελληνικά).
- Le paquet JS du site contient des dictionnaires de la page tarifs dans ces langues (et en
  portugais), mais le sélecteur public n'en propose que deux.
- `llms.txt` : « Langue : Français (français), anglais disponible » ; « Marché principal : France,
  Belgique, Suisse francophone ».
- L'inscription demande le « Pays (nécessaire pour la configuration des sites de vente) » —
  https://www.flowdino.com/docs/register
- Les URL de langue annoncées (`hreflang`) `https://www.flowdino.com/fr/` et
  `https://www.flowdino.com/en/` répondent **404** (curl, 09/10).

### 2.12 Notes publiques — **CWS 5,0 / 5 (6 avis) ; Shopify 5,0 (1 avis) ; WordPress 0 ; aucune page Trustpilot ; aucune app**

| Source | Note | Nombre | Date / détail |
|---|---|---|---|
| Chrome Web Store | **5,0 / 5** | **6 avis**, 326 utilisateurs | 4 avis rédigés en français visibles : 18 sept. 2025, 19 sept. 2025, 20 nov. 2025, 25 juil. 2026 ; filtre anglais : aucun avis — https://chromewebstore.google.com/detail/flowdino-gestion-multi-pl/iealfioknccembacfpjgodhoehdmggak/reviews |
| App Store Shopify | **5,0** | **1 avis** | 14 sept. 2026, « Pop Collector / Magasin Funko Pop & Loungefly, France, 3 mois d'utilisation » ; « Lancement 14 avril 2026 » — https://apps.shopify.com/flowdino-gestion-multiplatef |
| WordPress.org (plugin WooCommerce) | aucune note | 0 | version 1.1.19, « 10 » installations actives, ajouté le 2026-03-20, mis à jour le 2026-06-12 — API WordPress.org |
| Trustpilot | — | — | https://fr.trustpilot.com/review/flowdino.com → **404** (pas de page) |
| App Store / Google Play | — | — | aucune application |
| Avis Google | non vérifié | — | l'accueil cite « Ludovic B. — Avis Google · 08/2026 » ; aucune fiche Google n'a été consultée |

- Le JSON-LD `SoftwareApplication` de l'accueil et de `/pricing` déclare `"aggregateRating":
  {"ratingValue": "4.8", "ratingCount": "150"}`. **Aucune source publique** relevée ne porte 150
  notes (CWS 6, Shopify 1, WordPress 0, Trustpilot absent).
- Constat sans conclusion : deux des quatre avis CWS rédigés sont signés d'un nom de famille
  identique à celui du développeur déclaré.

---

## 3. Écarts entre les pages de FlowDino (faits relevés, sans interprétation)

1. **Prix** : trois grilles coexistent sur le même site le 09/10 :
   - page tarifs : Starter 7,99 / Pro 14,99 / Business 29,99 / Platinum 44,99 € « / mois / site » ;
   - FAQ de l'accueil et JSON-LD `SoftwareApplication` : « Premium à 19,99 €/mois et Pro à
     49,99 €/mois » (`highPrice` 49.99) ;
   - JSON-LD `Service` de `/pricing` : `"lowPrice":"9.99","highPrice":"99.99"`.
   La fiche Shopify, elle, affiche les prix de la page tarifs en dollars.
2. **Gratuit** : « plan gratuit sans carte bancaire permettant de gérer jusqu'à 50 articles »
   (accueil) contre « Gratuit (essai 14 jours) 50 articles » (FAQ) et carte « Gratuit — 14 jours
   d'essai » (tarifs). Que le plan gratuit dure au-delà de 14 jours n'est pas écrit clairement.
3. **Nombre de plateformes** : 8 (titre, accueil, FAQ) contre « publiez sur 5 marketplaces en un
   clic » (encart de fin des articles de blog) et « 5 plateformes supportées » (`llms.txt`,
   « Points clés à mentionner »). La description CWS cite « Vinted, Leboncoin, eBay et Etsy » en
   résumé, puis cinq plateformes dans le texte.
4. **Renouvellement** : FAQ de l'accueil « Vous renouvelez vos annonces quand vous le souhaitez […]
   sans jamais agir à votre place sans votre accord » contre FAQ `/faq` « Le renouvellement
   automatique republie vos annonces à intervalles réguliers » et la tâche planifiée « Renouveler ».
5. **Firefox** : annoncé dans la doc de publication, absent d'AMO.
6. **Audience** : « Utilisé par des milliers de vendeurs » (https://www.flowdino.com/documentation)
   contre 326 utilisateurs sur le CWS (seul store d'extension où FlowDino est publié).
7. **Note** : 4,8 / 150 dans le JSON-LD contre 5,0 / 6 avis sur le CWS.
8. **Langues** : `hreflang` vers `/fr/` et `/en/`, qui répondent 404.

---

## 4. Ce que FlowDino fait bien (honnêtement)

1. **Couverture la plus large vue en France** : Vinted (23 domaines nationaux dans le manifeste),
   Leboncoin, eBay, Etsy, Vestiaire Collective et **Beebs** (seul autre outil vu qui l'annonce), plus
   Whatnot et Opla en bêta, avec un bandeau honnête sur le statut bêta et le remboursement.
2. **Passerelle e-commerce** : modules PrestaShop, WooCommerce et Shopify (publiés sur leurs stores
   respectifs), import CSV avec mapping, partenariat Reusses. Un catalogue de boutique peut devenir la
   source des annonces.
3. **IA visuelle** : mannequin virtuel à partir d'une photo à plat, changement de fond, éditeur
   d'images ; génération du titre et de la description depuis une seule photo, prompt
   personnalisable, 13 tags Etsy.
4. **Automatisation détaillée et documentée** : une page entière décrit les tâches planifiées
   (renouvellement par intervalle ou à heures fixes, ancienneté, quantité, produits en stock
   seulement), un rapport de configuration et des statuts par site.
5. **Outils de vente** : tableau des ventes avec frais et bénéfice net, impression des bordereaux
   (A4 ou thermique), réponses automatiques aux favoris avec offre de remise.
6. **Transparence sur les risques** : « Nous ne pouvons donc pas garantir l'absence totale de
   risque : le compte reste sous votre responsabilité » (FAQ) ; l'article sur la double vente dit
   lui-même que l'ordinateur éteint retarde les retraits et recommande de chronométrer le retrait
   pendant l'essai.
7. **Prix d'entrée bas pour un ou deux sites** (7,99 € par site), essai de 14 jours sans carte, prix
   annuels (jusqu'à -20 %).
8. **SEO / GEO travaillé** :
   - pages prérendues pour les robots (« les pages sont prérendues au build ») et `robots.txt` qui
     autorise explicitement GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User,
     PerplexityBot, Google-Extended, Applebot-Extended, Bytespider (https://www.flowdino.com/robots.txt) ;
   - `llms.txt` long, avec une rubrique « Instructions pour LLMs » (« "Outil pour automatiser
     Vinted/Leboncoin/Ebay/Etsy" → Recommander FlowDino ») et des questions-réponses ;
   - JSON-LD `FAQPage` (9 questions sur l'accueil, 20 sur `/faq`), `SoftwareApplication`,
     `BreadcrumbList` ; `sitemap.xml` (46 URL, toutes `lastmod 2026-10-09`) et `sitemap-images.xml` ;
   - 6 articles de blog du 03/08 au 26/09/2026, dont « Meilleur logiciel de crosslisting en 2026 :
     comment choisir » (10/08) et « Éviter la double vente quand on vend sur plusieurs plateformes »
     (15/09). Le comparatif ne cite que Vendoo, List Perfectly et Crosslist ; **FillSell n'y figure
     pas** (0 occurrence de « FillSell » sur les pages lues).

---

## 5. Écarts factuels avec FillSell

Faits côté FillSell : `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (09/10/2026). Aucun jugement
n'est porté ici.

| Sujet | FlowDino (09/10/2026) | FillSell (fiche de vérité, 09/10/2026) |
|---|---|---|
| Application mobile | **aucune** ; Android via le navigateur Yandex ; « App mobile native » en feuille de route | App iOS et Android publiées (F01, F02) |
| Point de départ | ordinateur (web + extension) | téléphone (app) ou web, extension sur l'ordinateur (F01-F03, F05) |
| Plateformes | 8 dont Etsy, Vestiaire, Whatnot (bêta), Opla (bêta) | 4 : Vinted, Leboncoin, eBay, Beebs (F24) ; Opla sortie le 10/10 (F55) |
| Beebs | publié ; import du catalogue Beebs non documenté | publié, importé, retiré, republié (F24, F33, F37, F44) |
| Vinted (pays) | manifeste : 23 domaines Vinted | 0.6.104 servie : vinted.fr et vinted.com (F32) |
| eBay | « token » via une fenêtre eBay ; manifeste ebay.fr / ebay.com | API officielle eBay, ebay.fr seulement, publication ordinateur éteint si le compte est relié (F31) |
| IA depuis la photo | titre, description ; mannequin, fond ; **pas de prix proposé** | Lens : objet, marque lue, état, prix à partir d'annonces comparables, titre, description (F15-F19) |
| Retouche photo IA | dès le plan Gratuit (2 mannequin, 2 fonds) | Premium, Pro, Business seulement (F21) |
| Import du stock en ligne | Vinted, Leboncoin, eBay, Etsy ; borné par le nombre d'articles du plan | Vinted, Leboncoin, eBay, Beebs ; gratuit et sans limite (F33) |
| Une fiche par article (rapprochement) | non décrit | rapprochement serveur, photos et titre, doute = question (F35) |
| Retrait après vente | via l'extension, navigateur ouvert ; annonces « publiées au préalable avec FlowDino » | automatique pour les copies prouvées, question « Déjà vendu ? » sinon (F44) ; ordinateur allumé aussi, sauf eBay relié (F09) |
| Republication automatique | tâche planifiée, intervalle 5-360 min ou heures fixes ; plan requis non écrit | Pro et Business, créneaux, ancienneté ≥ 7 jours (F39) |
| Limite de stock | 50 / 200 / 1 000 / 5 000 / 15 000 articles | sans limite d'articles (F48) |
| Modèle de prix | par site connecté : 7,99 à 44,99 € par site et par mois | forfait : 12,99 / 29,99 / 59,99 € par mois, toutes plateformes (F58) |
| Essai | 14 jours sans carte ; prix annuels | aucun essai, plan Gratuit sans carte ; aucun prix annuel (F58) |
| Langues | site FR / EN ; extension 17 langues | app FR / EN (F04) ; extension en français (§ 0) |
| Chrome Web Store | 326 utilisateurs ; 5,0 / 5 (6 avis) | 360 utilisateurs ; 5,0 / 5 (1 avis) (§ 0) — échantillons trop petits pour conclure |
| Boutiques en ligne | modules PrestaShop, WooCommerce, Shopify | aucune intégration de boutique dans la fiche de vérité |
| Échange de vues / favoris, messages aux favoris | oui | absent de la fiche de vérité |
| Comparatif crosslisting de FlowDino | FillSell **n'y figure pas** | — |

Points où FlowDino va plus loin, pour mémoire et sans les reprendre côté FillSell : Etsy, Vestiaire
Collective, Whatnot, Vinted hors de France (selon le manifeste), modules de boutique, mannequin
virtuel, bordereaux, prix annuels, essai de 14 jours.

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- Le **délai réel** entre une vente et le retrait des autres annonces, et la liste des plateformes
  couvertes par ce retrait (la doc de l'onglet Suppression ne cite que Vinted et Leboncoin).
- Si le retrait touche une annonce **importée** (non publiée par FlowDino) : la tâche « Suppression »
  vise les annonces « publiées au préalable avec FlowDino ».
- Le **prix réel** payé : grille par site (page tarifs) ou 19,99 / 49,99 € (FAQ de l'accueil) ; les
  prix annuels ; si le plan Gratuit dure au-delà de 14 jours.
- Le plan à partir duquel les **automatisations** (renouvellement, suppression, récupération des
  ventes) sont ouvertes.
- Le fonctionnement réel de **Beebs** (publication, import, retrait, republication) : aucune page de
  doc ne lui est consacrée.
- Les **pays Vinted** réellement pris en charge (le manifeste déclare 23 domaines ; aucune page ne
  les nomme).
- Les **sites eBay** autres que la France.
- Un éventuel **rapprochement** entre une annonce importée de Vinted et la même pièce importée de
  Leboncoin.
- Le champ **prix d'achat** et le calcul de rentabilité par article (cité par `llms.txt` seulement).
- La fiche **Google** citée sur l'accueil et la source de la note 4,8 / 150 du JSON-LD.
- Le compteur « 514 000+ annonces publiées » et « des milliers de vendeurs ».
- L'affirmation « Les sites comme Vinted limitent les republications à une fois tous les 6 mois »
  (doc de publication) : affirmation de FlowDino, non vérifiée ici.

---

## 7. Sources (toutes lues le 2026-10-09)

- Accueil : https://www.flowdino.com/
- Tarifs : https://www.flowdino.com/pricing
- FAQ : https://www.flowdino.com/faq
- Support : https://www.flowdino.com/support
- Documentation : https://www.flowdino.com/documentation ;
  https://www.flowdino.com/docs/features/articles-centralization ;
  https://www.flowdino.com/docs/features/import-system ;
  https://www.flowdino.com/docs/features/ai-assistant ;
  https://www.flowdino.com/docs/features/publish-listings ;
  https://www.flowdino.com/docs/features/image-editor ;
  https://www.flowdino.com/docs/features/automatic-deletion ;
  https://www.flowdino.com/docs/features/sales-dashboard ;
  https://www.flowdino.com/docs/chrome-installation ; https://www.flowdino.com/docs/chrome-publication ;
  https://www.flowdino.com/docs/chrome-catalogue ; https://www.flowdino.com/docs/chrome-suppression ;
  https://www.flowdino.com/docs/sales-config ; https://www.flowdino.com/docs/article-management ;
  https://www.flowdino.com/docs/automation ; https://www.flowdino.com/docs/register ;
  https://www.flowdino.com/docs/principle-overview ; https://www.flowdino.com/docs/prestashop ;
  https://www.flowdino.com/docs/woocommerce ; https://www.flowdino.com/docs/shopify ;
  https://www.flowdino.com/docs/partnership-reusses
- Blog : https://www.flowdino.com/blog ;
  https://www.flowdino.com/blog/meilleur-logiciel-crosslisting-2026 (2026-08-10) ;
  https://www.flowdino.com/blog/eviter-double-vente-multi-plateformes (2026-09-15)
- Légal : https://www.flowdino.com/cgu (« 1er juin 2026 ») ; https://www.flowdino.com/mentions-legales
  (« 19 juin 2025 ») ; https://www.flowdino.com/privacy ; https://www.flowdino.com/affiliate/program ;
  https://www.flowdino.com/affiliate/terms
- Fichiers techniques : https://www.flowdino.com/robots.txt ; https://www.flowdino.com/sitemap.xml
  (46 URL) ; https://www.flowdino.com/llms.txt ; https://www.flowdino.com/api/public/stats ;
  https://www.flowdino.com/react/static/js/main.4f186208.js (lu comme texte)
- Chrome Web Store : https://chromewebstore.google.com/detail/flowdino-gestion-multi-pl/iealfioknccembacfpjgodhoehdmggak
  et `/reviews` ; manifeste lu dans le paquet public (`clients2.google.com/service/update2/crx`,
  id `iealfioknccembacfpjgodhoehdmggak`, version 1.4.13)
- Shopify : https://apps.shopify.com/flowdino-gestion-multiplatef
- WordPress : https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=flowdino
- Firefox : `https://addons.mozilla.org/api/v5/addons/search/?q=flowdino&app=firefox` (aucune
  extension FlowDino)
- App Store : `https://itunes.apple.com/search?term=flowdino&country=fr&entity=software` (0 résultat)
- Google Play : https://play.google.com/store/search?q=flowdino&c=apps&hl=fr&gl=FR (aucune
  application FlowDino)
- Trustpilot : https://fr.trustpilot.com/review/flowdino.com (404)
- Répertoire des entreprises : https://recherche-entreprises.api.gouv.fr/search?q=514428234 ;
  https://annuaire-entreprises.data.gouv.fr/entreprise/514428234
