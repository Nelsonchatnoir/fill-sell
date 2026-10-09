# Flypr (https://flypr.app) — vérification sur pièces

**Observé le 2026-10-09** (entre 13:05 et 13:20 UTC environ). J'ai seulement lu le web : pages publiques
(curl, WebFetch), le code JavaScript public du site, le paquet public de l'extension
(`https://flypr.app/flypr-extension.zip`), lu sans être installé ni exécuté, ainsi que les recherches App
Store, Google Play, Chrome Web Store et Trustpilot. Je n'ai créé aucun compte, fait aucune connexion ni
rempli aucun formulaire.

Sauf mention contraire, chaque citation vient de la page indiquée, lue le 09/10/2026. Les chiffres et
les promesses de Flypr sont **ses propres affirmations** : je ne les ai pas vérifiées en usage.

Dans la découverte (`00-decouverte.md`), Flypr est la correspondance probable (≈ 65 %) du nom dicté
« Flipper ». Nico doit encore la confirmer.

---

## 0. En une phrase

Flypr est un outil français tenu par **un fondateur seul** (Nicolas Bret, micro-entrepreneur). Il
combine une **application web** (stock, profit, fiscalité française) et une **extension Chrome
distribuée en .zip** (mode développeur, **absente du Chrome Web Store**). L'extension remplit les
formulaires de 6 sites : Vinted, Leboncoin, eBay, Grailed, Selency et Vestiaire Collective. Flypr n'a
**pas d'application mobile native**, ne gère **pas Beebs** et n'annonce **aucun retrait automatique
des copies** après une vente. **Rien n'a été publié depuis le 18/04/2026.** Le 09/10/2026, l'adresse
d'API inscrite dans le code du site et de l'extension répond « Application not found ».

---

## 1. Les points demandés, un par un

### 1.1 Plateformes prises en charge

| Plateforme | Ce que dit Flypr | Source |
|---|---|---|
| **Vinted** | Oui. « Fripes & vêtements — Auto-fill en 1 clic » | https://flypr.app/ |
| **Leboncoin** | Oui. « Tout & tout le monde — Auto-fill en 1 clic » | https://flypr.app/ |
| **eBay** | Oui. « Tech, collector, sneakers ». L'extension cible `*.ebay.fr` et `*.ebay.com` | https://flypr.app/ ; manifeste du .zip |
| **Grailed** | Oui | https://flypr.app/ |
| **Selency** | Oui (« Mobilier vintage & déco ») | https://flypr.app/ |
| **Vestiaire Collective** | Oui, « depuis le plan Pro ». Selon Flypr, la publication y « demande une validation manuelle par leur équipe » | https://flypr.app/faq |
| **Beebs** | **Nommé nulle part** : ni sur le site, ni dans le manifeste de l'extension | toutes les pages lues + manifeste |
| Depop, Etsy, Facebook Marketplace | Depop n'apparaît que dans un article de blog (« Depop vs Vinted »). Etsy est « À l'étude » dans la feuille de route. Une adresse Facebook Marketplace figure dans le code de la page /extension de l'app, mais pas dans les sites autorisés par le manifeste. | https://flypr.app/blog ; https://flypr.app/roadmap |

Citation : « Six plateformes : Vinted, Leboncoin, eBay, Grailed, Selency et Vestiaire Collective. […]
Publication en Europe (France + marchés EU) uniquement. » (https://flypr.app/faq)

Remplissage inégal selon le site, d'après Flypr : « Oui, pour les plateformes principales (Vinted,
Leboncoin). […] Sur Grailed, eBay et Vestiaire Collective, certains champs spécifiques (état détaillé,
matière) demandent parfois une confirmation manuelle » (https://flypr.app/faq).

**Vinted : quels pays ?**
- Le site ne donne aucune liste de pays. Il dit seulement « France + marchés EU » (FAQ). La page
  features parle de comptes Vinted séparés pour « les marchés (FR, DE, IT) »
  (https://flypr.app/features).
- Le manifeste de l'extension 1.4.1 autorise `*.vinted.fr`, `.com`, `.be`, `.de`, `.it` et `.es`.
- En revanche, le module de republication (`src/flypr-engine/relist.js`) envoie toujours vers
  `https://www.vinted.fr/items/<id>/edit`, une adresse écrite en dur. D'après le code, la republication
  ne vise donc que vinted.fr. Je ne l'ai pas vérifié en usage.

**eBay FR** : oui, `ebay.fr` est couvert. L'extension ouvre `https://www.ebay.fr/sl/prelist/suggest`
(`background.js`).

### 1.2 Application mobile iOS / Android

**Il n'y a pas d'application native.**
- « L'app est 100% responsive […] L'extension Chrome, elle, s'utilise sur desktop pour publier en un
  clic. Une app mobile native est sur la roadmap. » (https://flypr.app/faq)
- Feuille de route, rubrique « Prochainement » : « Application mobile native iOS + Android ». Rubrique
  « En cours » : « PWA iOS avec notifications push » (https://flypr.app/roadmap).
- Journal des versions v1.3 (5 avril 2026) : « PWA : installez Flypr sur votre écran d'accueil »
  (https://flypr.app/changelog).
- La recherche App Store France (API iTunes Search, `term=flypr`, `country=fr`) renvoie
  **0 résultat**. La recherche Google Play `q=flypr` (hl=fr, gl=FR) ne renvoie aucune appli Flypr.
  Les deux recherches datent du 09/10/2026.

### 1.3 Extension de navigateur

**Oui, pour Chrome sur ordinateur, mais hors du Chrome Web Store.**
- Page /extension de l'app : le texte se trouve dans le JavaScript public de la page, que je n'ai pas
  ouvert connecté. On y lit : « Télécharge le .zip et suis le guide d'installation ci-dessous. » et
  « Activer le mode développeur ». La page ajoute : « C'est l'installation normale des extensions non
  publiées. Chrome affiche un avertissement au démarrage ».
- Article de blog du 16/04/2026 : « L'extension Flypr n'est pas encore sur le Chrome Web Store
  (soumission en cours). Tu peux l'installer dès maintenant en mode développeur »
  (https://flypr.app/blog/extension-chrome-vinted).
- Journal des versions v2.2 (17/04/2026) : « Extension Chrome v1.5 prête pour soumission au Chrome
  Web Store » (https://flypr.app/changelog).
- Recherche « flypr » sur le Chrome Web Store le 09/10/2026 : **aucun résultat**
  (https://chromewebstore.google.com/search/flypr). La même méthode appliquée à « vintex » renvoie bien
  la fiche de Vintex (4,01/5, 79 avis, 7 000 utilisateurs), ce qui montre que la méthode fonctionne.
- Paquet public `https://flypr.app/flypr-extension.zip` (99 438 octets, servi le 09/10/2026) :
  manifeste MV3, **version « 1.4.1 »** (et non la 1.5 annoncée), `"author": "Flypr SAS"`. Les fichiers
  y sont datés du 01/04 au **18/04/2026**.

### 1.4 Point de départ : téléphone ou ordinateur

**L'article se crée dans l'application web, sur ordinateur ou sur téléphone, mais la publication se
fait depuis l'ordinateur.**
- Étape 1 : « Ajoute ton article — Photo, nom, prix d'achat ». Étape 2 : « Extension Chrome :
  sélectionne tes plateformes et publie » (https://flypr.app/).
- Journal des versions v1.0.1 : « Ajout rapide de produit depuis le mobile » (https://flypr.app/changelog).
- La FAQ précise que l'extension « s'utilise sur desktop pour publier ».
- Mécanisme de publication, d'après la FAQ : quand la personne « ouvre le formulaire de publication
  sur Vinted, Leboncoin ou une autre plateforme, [l'extension] pré-remplit automatiquement les
  champs […] Tu vérifies et tu publies. » C'est donc un **remplissage assisté** sur la page ouverte
  par la personne, pas un dépôt lancé à distance depuis le téléphone (https://flypr.app/faq).

### 1.5 Reconnaissance par photo et IA (titre, description, prix)

- Accueil : « Photo, nom, prix d'achat — l'IA génère la description, la catégorie et le prix de vente
  suggéré. » (https://flypr.app/)
- Page features : « Descriptions IA (Claude) — Génère des titres, descriptions et hashtags optimisés
  pour chaque plateforme à partir d'une simple photo ou d'un SKU. » Inclus dans Starter
  (https://flypr.app/features).
- Page tarifs : « Scan photo (reconnaissance) », « Prix marché (base 1,9M refs) » et « Détourage
  photo auto » sont réservés au plan **Business**. Les « IA descriptions » sont limitées à 50 par mois
  en Starter et illimitées en Pro (https://flypr.app/pricing).
- **Ces informations ne concordent pas** : la feuille de route classe encore « Scan photo IA : titre,
  marque, prix en 2 secondes » et « Auto-fill catégorie Vinted depuis la photo » dans « En cours »
  (https://flypr.app/roadmap). La base « 1,9M références » est « Inclus dans Starter » sur /features,
  mais réservée au Business sur /pricing.
- Agent IA de messagerie (Vinted) : « L'AI Agent […] répond à la place des messages que tu reçois
  sur Vinted : négociations, questions […] Il est propulsé par Claude et tourne 24/7 »
  (https://flypr.app/faq).

### 1.6 Import et synchronisation du stock existant

- **Import par fichier** : « Import CSV / Excel — Migre ton ancien fichier Excel ou l'export d'un autre
  outil […] importe ton stock en bloc. » Inclus dans Free (https://flypr.app/features). La ligne
  « Import CSV ✓ » apparaît dans les 4 plans (https://flypr.app/pricing). Pourtant, la feuille de route
  range « Import CSV en masse de votre stock » dans « Prochainement » (https://flypr.app/roadmap).
- **Ventes et achats Vinted** : « Tes ventes et achats Vinted remontent automatiquement dans ton
  dashboard. » (texte de la page /extension, dans son JS). D'après le code (`sales.js`), l'extension
  lit la boîte Vinted « tab=selling » **quand la personne ouvre cette page**, puis marque l'article
  vendu via `/api/sales/mark-sold`. Si l'article n'existe pas dans Flypr, il est ignoré
  (« Product may not exist yet in Flypr — skip silently »).
- **Import des annonces déjà en ligne** (relevé du dressing Vinted ou des annonces Leboncoin/eBay) :
  **aucune mention sur le site**, et le code de l'extension n'en montre aucune trace. Le journal des
  versions v1.0.5 (15/03/2026) mentionne seulement une « Synchronisation du stock depuis l'extension »,
  sans détail.

### 1.7 Retrait automatique des copies après une vente

**Il n'est annoncé nulle part.** Aucune page ne promet de retirer les autres annonces quand un article
se vend. Dans le code de l'extension 1.4.1, je n'ai trouvé aucun module de suppression d'annonce :
les modules sont relist, ai-agent, favorites, purchases, sales et crm-scraper. La fonction `sales.js`
se contente de marquer la fiche vendue dans Flypr. Ce constat porte sur le code lu, pas sur un essai.

### 1.8 Republication automatique (relist)

- « Le Relist republie automatiquement tes articles pour qu'ils remontent dans les listings Vinted.
  Flypr le fait à intervalles humains, avec du jitter aléatoire » (https://flypr.app/faq).
- Le relist est inclus dès Starter (« Relist automatique », https://flypr.app/pricing).
- **Vinted seulement.** Le module ne s'exécute que sur Vinted (`if (!E.onVinted()) return;`). Il ouvre
  la page de **modification** de l'annonce (`/items/<id>/edit`), peut changer le titre (suffixe « v2 »,
  préfixe) et le prix (± n %), puis valide le formulaire. Il attend 45 s à 4 min entre deux articles.
  D'après le code, il ne supprime ni ne recrée l'annonce.

### 1.9 Stock, ventes, statistiques

- « Dashboard temps réel : CA, profit net, ROI, marges — commissions et frais déduits
  automatiquement. » (https://flypr.app/)
- « Ventes + étiquettes — Deadlines, impression groupée 4×6, suivi achats. » (https://flypr.app/)
- Statistiques complètes à partir du plan Pro (https://flypr.app/pricing). Le journal v2.0 cite une
  « heatmap ventes » (https://flypr.app/changelog).
- Fiscalité française : calculateur multi-statuts, livre des recettes URSSAF, Factur-X B2B (Business),
  export comptable (https://flypr.app/features).
- « Mode Collectionneur » et CRM acheteurs (https://flypr.app/features ; https://flypr.app/roadmap).

### 1.10 Prix

Source : https://flypr.app/pricing, le 09/10/2026, en euros.

| Plan | Mensuel | Annuel (« -20% ») | Principales limites |
|---|---|---|---|
| Gratuit | 0 € « à vie, sans carte bancaire » | — | 4 produits, 2 plateformes, 3 photos par produit, 1 compte Vinted |
| Starter | 6,90 €/mois | 5,52 €/mois | 20 produits, 4 plateformes, IA descriptions 50/mois, relist auto |
| Pro (« Recommandé ») | 12,90 €/mois | 10,32 €/mois | produits illimités, 6 plateformes, agent IA, statistiques complètes, 3 comptes Vinted |
| Business | 29,90 €/mois | 23,92 €/mois | scan photo, prix marché, détourage, 10 comptes Vinted, plusieurs utilisateurs, Factur-X et API |

- Essai : « 1 mois offert sur tous les plans payants ». Ensuite, « ton abonnement se poursuit
  automatiquement au tarif affiché ». Un rappel est envoyé 3 jours avant (FAQ tarifs).
- « Satisfait ou remboursé 14 jours », « Paiement sécurisé Stripe » (https://flypr.app/).
- Un plan « Enterprise sur mesure » est proposé au-delà de 10 comptes Vinted (FAQ tarifs).
- Les pages ne placent pas l'agent IA dans le même plan : « Inclus dans Starter » sur l'accueil,
  Pro sur /pricing et /features.

### 1.11 Pays et langues

- « Flypr est 100% en français — interface, support, documentation, IA. […] marketplaces
  européennes uniquement » (https://flypr.app/faq).
- Le site ne déclare qu'une seule langue : `hrefLang="fr-FR"`. Il n'a pas de version anglaise.
- Hébergement, selon les pages : « hébergées en Europe » (accueil), « serveurs en France (Paris) »
  (FAQ), « Vercel (région européenne) et […] Railway (région UE) » (/trust). Les mentions légales
  citent Railway Corp., Vercel Inc. et Cloudinary Ltd. avec leurs adresses aux États-Unis.

### 1.12 Notes publiques

| Où | Résultat le 09/10/2026 |
|---|---|
| Chrome Web Store | Aucune fiche (recherche « flypr » vide ; méthode contrôlée sur « vintex ») |
| App Store (FR) | 0 résultat (API iTunes Search) |
| Google Play (FR) | Aucune appli Flypr dans les résultats de « flypr » |
| Trustpilot | `https://fr.trustpilot.com/review/flypr.app` → **404** (aucune fiche) |
| Site | Aucun avis ni témoignage. Aucun `aggregateRating` dans le JSON-LD. Le manifeste annonce : « Aucun "avis client" n'est rédigé en interne » (https://flypr.app/manifeste) |
| X (@flypr_app) | **Non vérifiable** : x.com répond 402 à la lecture automatique |

**Aucune note publique n'existe, donc aucun nombre d'avis.**

---

## 2. Signes d'activité, datés

| Indice | Valeur | Source |
|---|---|---|
| Dernière version du journal | v2.2 du **17 avril 2026** | https://flypr.app/changelog |
| Dernier article de blog | **18 avril 2026** (« DAC7 revendeur 2026 », etc. ; « 72 + articles ») | https://flypr.app/blog |
| Plan du site | 131 adresses, **toutes** avec `lastmod` = `2026-04-18T15:46:00.030Z` | https://flypr.app/sitemap.xml |
| Extension publique | version 1.4.1, fichiers les plus récents du **18/04/2026** | https://flypr.app/flypr-extension.zip |
| CGU | « Dernière mise à jour : 2 avril 2026 » | https://flypr.app/legal/terms |
| Cache de l'accueil | en-tête `Age: 1130297` (≈ 13 jours sans nouveau déploiement servi par ce nœud Vercel) | en-têtes HTTP de https://flypr.app |
| API du service | Le JS du site et de l'extension appellent `https://endearing-prosperity-production-c350.up.railway.app`. Le 09/10/2026 vers 13:09 UTC, quatre lectures sans connexion (racine, `/health`, `/api/health`, `/api/auth/me`) ont toutes répondu **404 `{"message":"Application not found"}`** | JS public du site et `src/flypr-engine/core.js` |
| Page de statut | rendue côté navigateur ; le HTML statique affiche « Backend API — Verification... » | https://flypr.app/status |

Lecture prudente : ces indices **concordent** avec un produit dont le développement s'est arrêté
mi-avril 2026, et dont le service, au 09/10/2026, ne répond plus à l'adresse que son propre code
utilise. **Ce n'est pas une preuve de fermeture** : l'API a pu changer d'adresse sans nouveau
déploiement du site, ce qui serait peu probable mais reste possible. Je n'ai pas poussé le test plus
loin (pas de connexion, pas de compte).

---

## 3. Incohérences entre les pages de Flypr (relevées, sans jugement)

- Agent IA : « Inclus dans Starter » sur l'accueil, Pro sur /pricing et /features.
- Base « 1,9M références » : Starter sur /features, Business sur /pricing.
- Scan photo IA : vendu dans le plan Business (/pricing), mais toujours « En cours » sur /roadmap.
- Import CSV : inclus dans tous les plans (/pricing, /features), mais « Prochainement » sur /roadmap.
- Vestiaire Collective : « 6e plateforme supportée » (récemment ajouté) et « À l'étude » sur la même
  page /roadmap.
- Extension : le journal annonce une v1.5 « prête pour soumission », le .zip servi est en 1.4.1.
- Éditeur : « Flypr — Micro-entreprise » (mentions légales) et « micro-entrepreneur » (CGU), mais
  `"author": "Flypr SAS"` dans le manifeste de l'extension. Aucun SIREN n'est affiché.

---

## 4. Ce que Flypr fait bien (honnêtement)

- **Une présence SEO en français très travaillée** : 72 articles et plus (fiscalité, URSSAF, DAC7,
  micro-BIC, guides par plateforme et par produit), 3 outils gratuits (calculateur de profit,
  calculateur fiscal, simulateur de marge Vinted), des pages par ville (Paris, Lyon, Marseille…) et par
  niche (sneakers, livres, vintage…), ainsi que des pages « Flypr vs » et « alternative à » qui nomment
  dotb.io, Vintex, Clemz, Selleraider et Jarvis (https://flypr.app/alternatives). FillSell n'y est pas
  cité.
- **Données structurées complètes** : `SoftwareApplication`, `Organization`, `Offer` et `FAQPage`
  (13 questions sur l'accueil, 30 sur /faq), meta descriptions soignées. C'est un bon modèle pour être
  repris par les moteurs génératifs (GEO).
- **Tarifs publics et clairs** : plan gratuit permanent, mois offert, -20 % à l'année, remboursement
  sous 14 jours, résiliation en un clic.
- **Un angle « fiscalité française »** que peu d'outils traitent : livre des recettes, seuils,
  Factur-X.
- **Des niches au-delà des généralistes** : Grailed, Selency, Vestiaire Collective.
- **Fonctions Vinted variées** : agent IA de messagerie, messages automatiques aux favoris, CRM
  acheteurs, étiquettes 4×6, suivi des achats.
- **Transparence affichée** : journal des versions, feuille de route, manifeste, page sécurité, kit
  presse. Le fondateur assume un projet jeune : « Je n'ai pas de chiffres flatteurs à vous vendre »
  (https://flypr.app/about).

## 5. Écarts factuels avec FillSell (sans dénigrement)

| Point | Flypr (observé le 09/10/2026) | FillSell |
|---|---|---|
| App mobile | Aucune app native (« sur la roadmap ») ; web adaptatif ou PWA | App iOS/Android, le téléphone pilote |
| Extension | .zip en mode développeur, absente du Chrome Web Store | Fiche publique sur le Chrome Web Store |
| Beebs | Absent | Pris en charge |
| Retrait des copies après une vente | Non annoncé ; aucun module de suppression dans l'extension 1.4.1 | Retrait automatique des copies |
| Republication | Vinted seulement (modification de l'annonce sur vinted.fr) | Republication sur plusieurs plateformes |
| Reprise des annonces déjà en ligne | Non annoncée (import par CSV ; ventes Vinted lues quand la personne ouvre sa boîte) | Relevé et synchronisation des annonces existantes |
| Publication | Remplissage assisté du formulaire ouvert par la personne | Exécutée par l'extension, commandée depuis le téléphone |
| Plateformes en plus | Grailed, Selency, Vestiaire Collective | — |
| Fiscalité française intégrée | Oui (livre des recettes, Factur-X, calculateur) | — (à comparer, hors du périmètre de cette fiche) |
| Notes publiques | Aucune | Voir la fiche CWS de FillSell |
| Activité | Rien de publié depuis le 18/04/2026 ; API en 404 le 09/10/2026 | Active |

## 6. Ce qu'on ne peut pas vérifier sans compte

- Si le service fonctionne aujourd'hui : connexion, tableau de bord, paiement Stripe. L'API répond 404,
  mais une nouvelle adresse reste possible.
- La qualité réelle du remplissage sur chaque site, et les pays Vinted réellement acceptés à la
  publication (le manifeste couvre 6 domaines Vinted, le relist n'utilise que vinted.fr).
- L'existence et le fonctionnement du « Scan photo », du « Prix marché 1,9M refs » et de l'agent IA.
- Le nombre d'utilisateurs, payants ou non. Aucun chiffre n'est publié.
- L'activité du compte X @flypr_app (x.com refuse la lecture automatique).
- L'entité juridique exacte (micro-entreprise ou SAS) et son SIREN.
- Si un retrait des copies serait fait côté serveur (rien ne l'annonce, et l'extension n'a pas le code
  pour supprimer une annonce).

---

## 7. Sources (toutes lues le 2026-10-09)

- https://flypr.app/ — accueil (plateformes, 3 étapes, tarifs résumés, FAQ courte, fondateur)
- https://flypr.app/pricing — tarifs, comparatif par plan, FAQ des tarifs
- https://flypr.app/faq — 25 questions (plateformes, mobile, langue, relist, agent IA, hébergement)
- https://flypr.app/features — 15 fonctions et leur plan
- https://flypr.app/roadmap — en cours, prochainement, à l'étude
- https://flypr.app/changelog — versions v1.0 (15/01/2026) à v2.2 (17/04/2026)
- https://flypr.app/blog — index, dernier article du 18/04/2026
- https://flypr.app/blog/extension-chrome-vinted — « pas encore sur le Chrome Web Store » (publié le 16/04/2026)
- https://flypr.app/alternatives — comparatif nommant dotb.io, Vintex, Clemz, Selleraider, Jarvis
- https://flypr.app/comparatif ; https://flypr.app/trust ; https://flypr.app/about ; https://flypr.app/press ; https://flypr.app/manifeste ; https://flypr.app/why-flypr ; https://flypr.app/demo ; https://flypr.app/status
- https://flypr.app/legal/mentions — « Flypr — Micro-entreprise », directeur de la publication Nicolas Bret
- https://flypr.app/legal/terms — CGU du 2 avril 2026
- https://flypr.app/sitemap.xml ; https://flypr.app/robots.txt
- https://flypr.app/flypr-extension.zip — manifeste 1.4.1, modules relist et sales (lu sans installation)
- JS public de la page /extension : `https://flypr.app/_next/static/chunks/app/(app)/extension/page-0c04a0a8ee8e3ee3.js`
- https://chromewebstore.google.com/search/flypr — aucun résultat ; contrôle : https://chromewebstore.google.com/search/vintex
- https://itunes.apple.com/search?term=flypr&country=fr&entity=software — `resultCount: 0`
- https://play.google.com/store/search?q=flypr&c=apps&hl=fr&gl=FR — aucune appli Flypr
- https://fr.trustpilot.com/review/flypr.app — 404
- https://x.com/flypr_app — non lisible (402)
