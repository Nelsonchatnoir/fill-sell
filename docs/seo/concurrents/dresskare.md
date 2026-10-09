# DressKare : vérification sur ses pages réelles

Date d'observation : **2026-10-09**. Méthode : lecture du web uniquement (curl, WebFetch, WebSearch).
Aucun compte n'a été créé, aucune connexion n'a été faite et aucun formulaire n'a été rempli. Le paquet
public de l'extension a été téléchargé depuis le serveur de mises à jour de Google : seul son
`manifest.json` a été lu, rien n'a été exécuté, et le paquet a été supprimé ensuite. La page
`https://app.dresskare.com/` a seulement été lue (HTML de la page d'accueil, sans connexion).

Les chiffres d'utilisateurs, de vendeuses, de déposants et de comptes « jamais bloqués » viennent de
DressKare : **ce sont ses propres affirmations**. Les seuls chiffres tiers relevés viennent du Chrome Web
Store (CWS), du Shopify App Store et de Trustpilot, tous lus le 09/10/2026.

---

## 1. Fiche d'identité

| Élément | Constat | Source (lue le 2026-10-09) |
|---|---|---|
| Titre du site | « Logiciel de dépôt-vente Vinted et marketplace \| DressKare » | https://dresskare.com/ |
| Promesse | « Fais de la seconde main ton métier. » ; « un logiciel qui automatise tes ventes Vinted, une marketplace pour sourcer du stock auprès des particuliers, une formation pour progresser dans le métier » | https://dresskare.com/ |
| Cible | « Dépôt-vente · Resell · Boutique » ; parcours « Particulier / Pro : Reseller, dépôt-vente, e-commerce » | https://dresskare.com/ |
| Société | SIRET 900 169 731 00016 ; adresse « DRESSKARE, 18 RUE STE CATHERINE 69001 LYON » (la politique de confidentialité, sur la même page, dit « 13 rue Sainte Catherine ») | https://dresskare.com/mentions-legales |
| Adresse déclarée au CWS et au Shopify App Store | « 59 Rue des Tables Claudiennes, Lyon 69001 » ; « Professionnel » au sens de l'UE ; D-U-N-S 281733260 | https://chromewebstore.google.com/detail/dresskare/mofkohgamkldigbgolmbgmipaofobcfb ; https://apps.shopify.com/dresskare-connect |
| Équipe affichée | « Gregory, Le CEO » ; « Catia, La Content Manager » ; « Adrien, Le CTO & Dev ». Histoire : « DressKare est né pendant le confinement » | https://dresskare.com/qui-sommes-nous |
| Chiffres annoncés (déclaratifs) | « 250+ vendeuses actives » ; « 900+ utilisateurs de l'extension sur le Chrome Web Store » ; « 0 compte bloqué sur 250+ vendeuses » ; « 26 654 déposants inscrits, 2 019 ces 90 derniers jours » | https://dresskare.com/ |
| Modèle | Abonnement mensuel, « 0 % de commission sur tes ventes ». L'ancien plan à la commission est retiré : « Le plan en commission ne fait plus partie des formules DressKare » | https://dresskare.com/prix ; https://dresskare.com/centre-aide/plan-commission-migration |

---

## 2. Les points demandés

### 2.1 Plateformes supportées : **Vinted, plus une boutique Shopify. Pas de Leboncoin, de Beebs ni d'eBay**

**Ce que dit le produit**

- La grille des prix, ligne « Multiplateformes », affiche **« Bientôt »** dans les quatre offres (Éco, Actif,
  Essentiel, Pro). Source : https://dresskare.com/prix
- La page d'accueil et toutes les pages « solution » ne nomment que **Vinted** et **Shopify**. Exemple :
  « Ta boutique Shopify et Vinted, un seul stock. » (https://dresskare.com/)
- Leur propre comparatif du 07/10/2026 se situe sur Vinted : « Si tu vends sur beaucoup de places de
  marché, Vendoo se défend. Si ton activité tourne autour de Vinted, du dépôt-vente ou de Shopify,
  DressKare couvre davantage. » Le même texte présente DressKare comme fait pour un « vendeur professionnel
  centré sur Vinted ».
  Source : https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/dresskare-vs-vendoo-comparatif-2026
- Le centre d'aide (79 articles) a une rubrique « Extension & Vinted » et une rubrique « Shopify ». Il n'a
  aucune rubrique sur Leboncoin, Vestiaire Collective, eBay ou Beebs (https://dresskare.com/centre-aide).

**Preuve technique.** Le manifeste de l'extension (version 0.1.325, paquet public du CWS) déclare ces
`host_permissions` : `*.vinted.fr`, `.com`, `.it`, `.be`, `.nl`, `.de`, `.es`, `.pt`, `.pl`, `.cz`, `.lt`,
`.lv`, `*.dresskare.com` et `localhost:20000`. Le manifeste ne contient **aucun domaine Leboncoin,
Vestiaire, eBay, Beebs ni Depop**.

**D'où vient la mention de Vestiaire et de Leboncoin.** Elle vient d'un article de blog,
« Multiposter sur Vinted, Vestiaire Collective et Leboncoin » (Gregory Giovannone, publié le 20.07.2026,
modifié le 18.08.2026). L'article dit : « Crée ton compte DressKare et pilote Vinted, Vestiaire Collective
et Leboncoin depuis un seul tableau de bord. » Il parle aussi de diffusion « sur Vinted, Vestiaire et
Leboncoin » et d'un stock où la pièce « passe automatiquement en indisponible sur les autres ». La grille
des prix (« Bientôt »), le manifeste de l'extension et leur comparatif du 07/10 disent le contraire. Les
CGV citent Leboncoin et Vestiaire seulement comme des plateformes où le vendeur reste libre de vendre les
articles confiés (§ 11.5), pas comme des intégrations.
Sources : https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/multiposter-vinted-vestiaire-leboncoin ;
https://dresskare.com/cgv

| Plateforme | Supportée ? | Détail |
|---|---|---|
| **Vinted** | Oui (cœur du produit) | Aucun pays n'est annoncé sur le site. Le manifeste couvre 12 domaines Vinted (.fr .com .it .be .nl .de .es .pt .pl .cz .lt .lv). C'est une autorisation technique, pas une promesse commerciale. |
| **Shopify** (boutique, pas marketplace) | Oui, offre Pro (69 €) | Application « DressKare : synchro Vinted » sur le Shopify App Store, lancée le 30 juin 2025. |
| **Leboncoin** | **Non** | Seulement dans l'article de blog cité plus haut. Rien dans le produit ni dans le manifeste. |
| **Vestiaire Collective** | **Non** | Idem. |
| **Beebs** | **Non** | Un article de blog présente Beebs (« Beebs : Une nouvelle opportunité… », publié le 14.10.2024) sans dire que DressKare le prend en charge. Aucun domaine dans le manifeste. |
| **eBay FR** | **Non** | Aucune mention dans le produit, aucun domaine dans le manifeste. |
| Depop | Non | Idem. |

### 2.2 Application mobile iOS / Android : **non, une PWA (application web installable)**

- « DressKare fonctionne comme une application mobile, directement depuis ton navigateur. Pas besoin de
  passer par l'App Store ou le Google Play Store. » ; « Est-ce une vraie application ? Oui, c'est une
  Progressive Web App (PWA). » ; « Sur iPhone, l'installation ne fonctionne qu'avec Safari. » ; « Les
  notifications push fonctionnent sur Android. Sur iPhone, le support est plus limité ».
  Source : https://dresskare.com/centre-aide/installer-application-mobile
- App Store France : l'API de recherche d'iTunes renvoie `"resultCount":0` pour « dresskare » et pour
  « dresskool » (https://itunes.apple.com/search?term=dresskare&country=fr&entity=software).
- Google Play : la recherche « dresskare » ne remonte aucune application DressKare
  (https://play.google.com/store/search?q=dresskare&c=apps&hl=fr).
- Côté mobile, la PWA sert à la prise de photos et au suivi : « l'application mobile DressKare prend le
  relais pour la partie terrain » (photos en rafale, stock, ventes, statistiques). En revanche, « La
  publication et la republication se lancent depuis ton ordinateur ».
  Source : https://dresskare.com/centre-aide/pourquoi-extension-chrome-securite

### 2.3 Extension navigateur : **oui, Chrome, sur ordinateur seulement**

- Fiche CWS : nom « Dresskare », 971 utilisateurs, note 4,6 (11 avis), version 0.1.325, « Dernière mise à
  jour 9 octobre 2026 », 3,23 Mio, langue « français ». Elle demande les permissions `tabs`, `scripting`,
  `identity`, `storage`, `alarms` et `notifications` (manifeste).
  Source : https://chromewebstore.google.com/detail/dresskare/mofkohgamkldigbgolmbgmipaofobcfb
- « Elle fonctionne sur Chrome, sur ordinateur uniquement. » ; « L'extension fonctionne-t-elle quand mon
  ordinateur est éteint ? Non. […] Rien de tout cela ne tourne sur mobile ni ordinateur éteint. » ;
  « L'ordinateur doit rester allumé avec un onglet Vinted ouvert sur Chrome. »
  Source : https://dresskare.com/extension-dresskare
- L'extension mise sur la sécurité : « Elle ne stocke ni ton mot de passe, ni ton jeton de connexion » ;
  « on ne se connecte jamais à ta place depuis un serveur ».
  Source : https://dresskare.com/centre-aide/pourquoi-extension-chrome-securite

### 2.4 D'où l'on part : **les deux, avec un partage strict des rôles**

- Téléphone (PWA) : « L'ajout express, sur ton téléphone » ; « Réservé au mobile : sur ordinateur, l'écran
  te renvoie vers ton téléphone » (https://dresskare.com/ajouter-ses-articles-vinted).
- Ordinateur (extension) : publication, republication, automatisations, import du dressing, retrait d'une
  annonce. « Depuis ton téléphone, tu peux supprimer l'article dans DressKare, mais pas l'annonce Vinted »
  (https://dresskare.com/centre-aide/supprimer-article-dresskare-et-vinted).
- Ordre d'installation affiché : « Crée ton compte […] installe l'extension Chrome sur ton ordinateur […]
  importe ton dressing Vinted en 1 clic » (https://dresskare.com/notre-solution-vinted-extension).

### 2.5 Identification par photo / IA : **oui, dès l'offre Actif (19 €)**

- « À partir d'une photo : elle détoure le fond, identifie la marque, la catégorie, la taille, l'état,
  rédige un titre + une description SEO optimisée pour Vinted, et propose un prix basé sur la demande
  réelle. » (FAQ, https://dresskare.com/ et https://dresskare.com/prix)
- Le prix proposé est « appuyée sur les ventes de notre communauté de vendeurs pros » ; « Rien ne part sur
  Vinted sans toi » ; « Toutes les catégories Vinted, pas seulement la mode ».
  Source : https://dresskare.com/intelligence-artificielle
- Modèles de rédaction et prompts personnalisés ; « Ajout en masse […] l'IA les regroupe article par
  article » ; détourage, « Mannequins IA pour tes photos portées ».
  Sources : https://dresskare.com/ajouter-ses-articles-vinted ; https://dresskare.com/prix
- Limite : « Inclus dès l'offre Actif, 19 €/mois […] L'offre Éco (9,90 €) ne permet que de synchroniser un
  dressing Vinted déjà en ligne. » Le volume dépend d'un « budget IA » : 200, 400 ou 800 « ajouts
  d'articles/mois* » selon l'offre, et « Les mannequins IA consomment ce même budget ».
  Sources : https://dresskare.com/intelligence-artificielle ; https://dresskare.com/prix

### 2.6 Import / synchronisation du stock existant : **oui, Vinted ; plus Excel et Shopify**

- « Quatre façons d'ajouter tes articles, aucune ressaisie » : l'ajout express sur mobile, « L'import de ton
  dressing Vinted » (« photos, titres, descriptions et prix », « Depuis ton ordinateur, avec l'extension
  Chrome »), « Un fichier Excel » (modèle fourni, 10 Mo au plus) et le formulaire de dépôt rempli par le
  client. L'import du dressing Vinted est inclus dès l'offre Éco. Excel et l'ajout d'articles sont « Dès
  Actif ».
  Source : https://dresskare.com/ajouter-ses-articles-vinted
- Doublons : « DressKare détecte les articles déjà présents et ne les importe pas deux fois. »
  Source : https://dresskare.com/centre-aide/importer-dressing-vinted
- Écran « Statut de synchronisation Vinted » à trois onglets (« Synchronisés », « Sur Vinted uniquement »,
  « Sur DressKare uniquement »). On peut y importer, lier, délier ou supprimer. Le texte précise : « Un
  passage par cet écran une fois par mois suffit ». Une vente peut ne pas encore être remontée : « La vente
  n'a pas encore été remontée […] à toi de passer la fiche au bon statut ».
  Source : https://dresskare.com/centre-aide/statut-synchronisation-vinted
- Shopify : produits marqués « dresskare » importés ; modes « Import, Export, Bidirectionnel, Stock » (offre
  Pro). Sources : https://apps.shopify.com/dresskare-connect ; https://dresskare.com/centre-aide

### 2.7 Retrait automatique des copies après une vente (auto-delist) : **seulement entre Shopify et Vinted**

- Shopify et Vinted : « Une vente sur votre boutique retire l'annonce Vinted (extension DressKare) » ;
  « une vente sur Vinted fait baisser le stock de la boutique » ; « Après l'import, seuls le stock et le
  statut vendu se synchronisent (pas les prix, titres ni photos) ».
  Source : https://apps.shopify.com/dresskare-connect
- Entre marketplaces : rien, puisqu'une seule marketplace (Vinted) est prise en charge.
- Vente détectée sur Vinted : elle met à jour le stock DressKare (« Suivi de commande : la vente détectée
  met ton stock et ton expédition à jour »). Ce n'est pas un retrait de copies ailleurs.
  Source : https://dresskare.com/extension-dresskare
- Retrait manuel : « Supprimer dans DressKare ET sur Vinted », depuis l'ordinateur ; « Toute réponse
  ambiguë est traitée comme un échec, et un échec ne supprime rien nulle part. »
  Source : https://dresskare.com/centre-aide/supprimer-article-dresskare-et-vinted

### 2.8 Republication / relist automatique : **oui, dès l'offre Éco, sur Vinted**

- « Republication auto tous les X jours (par défaut 7), à l'heure que tu choisis » ; « Cadence maîtrisée
  (par défaut 20 articles/h) » (https://dresskare.com/).
- « Elle republie au maximum 20 articles par heure, avec au moins 3 minutes entre deux articles » ;
  « Aucun plafond journalier n'est imposé aujourd'hui » ; « Chaque republication fait deux gestes sur
  Vinted : l'annonce est retirée, puis remise en ligne » ; repère de risque « environ 50 actions par
  jour » ; en cas de restriction, DressKare « met les automatisations du compte concerné en pause
  24 heures ».
  Source : https://dresskare.com/centre-aide/combien-republications-vinted-par-jour
- « Remise en vente automatique — Dès Actif — Tu vends une pièce dont il te reste d'autres exemplaires :
  l'annonce revient en ligne toute seule. » (https://dresskare.com/extension-dresskare)
- La republication demande un ordinateur allumé avec Chrome et un onglet Vinted ouvert (cf. § 2.3).

### 2.9 Stock, ventes, statistiques : **oui, et plus loin (facturation, comptabilité)**

- « Dashboard CA, marge, ventes en attente & stock vivant en temps réel » (https://dresskare.com/).
- Page « Mes commandes » : commandes, chiffre d'affaires, marge, colis à préparer, à déposer ; import,
  export, facture par commande (https://dresskare.com/centre-aide/suivre-commandes-vinted).
- « Module Compta » (Essentiel et plus) : « marge réelle, dépenses, URSSAF et TVA » ; « Les chiffres sont
  indicatifs : fais-les valider par ton comptable » (https://dresskare.com/logiciel-comptabilite-vendeur-vinted).
- Impression sur imprimante thermique, bordereaux, étiquettes Chronopost (Essentiel), suivi des colis
  (https://dresskare.com/prix).
- Limites de stock : Éco « ✗ » (pas de gestion de stock), Actif 100, Essentiel 249, Pro « Illimité »
  (https://dresskare.com/prix).

### 2.10 Prix : **4 abonnements en euros TTC par mois, essai de 7 jours sans carte, pas de plan gratuit**

| Offre | Prix | Principaux contenus (citations de https://dresskare.com/prix) |
|---|---|---|
| **Éco** | **9,90 € TTC / mois** | « Republication illimitée et automatisée », messages aux favoris, offres auto, remerciement, « Suivi ventes et bordereaux », « 1 compte Vinted ». 0 ajout d'article par mois, pas d'IA ni de gestion de stock. |
| **Actif** | **19 € TTC / mois** | « Gestion de stock : 100 articles », « IA d'ajout », « 200 ajouts d'articles/mois* », détourage, mannequins IA, « Multi-comptes illimité » |
| **Essentiel** | **39 € TTC / mois** (« Plus populaire ») | 249 articles, 400 ajouts, « dépôts-vente illimités », facturation et CRM, « Module Compta », page vitrine SEO |
| **Pro** | **69 € TTC / mois** | « Gestion de stock illimitée », 800 ajouts, « Connecteur Shopify », développement sur mesure, support premium |
| Formation DressKool | **79 € une seule fois** | « 8 modules, 68 leçons, accès à vie », « 2 mois d'abonnement DressKare inclus (offre limitée) » |

- Essai : « 7 jours d'essai gratuit, sans carte bancaire. Sans engagement, annulable en 1 clic. »
- Pas de plan gratuit : « DressKare ne propose pas de plan gratuit, seulement un essai de 7 jours puis un
  abonnement » (https://dresskare.com/centre-aide/plan-commission-migration).
- « 🔒 Aucune hausse sans 1 mois de préavis ». Aucun tarif annuel n'a été vu.
- Shopify Connect : application « Gratuit » sur le Shopify App Store, mais « Un compte DressKare est
  nécessaire » (https://apps.shopify.com/dresskare-connect).

### 2.11 Pays et langues : **France, en français seulement**

- Le site, l'application web (`<html lang="fr">`, https://app.dresskare.com/), la fiche CWS (« Langues :
  français ») et la fiche Shopify (« Langues : français ») sont tous en français. Aucune version dans une
  autre langue n'a été trouvée.
- Aucun pays n'est annoncé. Les témoignages viennent de Lyon, Bordeaux, Paris, Toulouse, Nantes, Marseille,
  Lille et Strasbourg (https://dresskare.com/avis). Un avis Shopify vient de Belgique.
- Le manifeste autorise 12 domaines Vinted européens (cf. § 2.1). Rien sur le site ne dit qu'ils sont
  vraiment pris en charge.

### 2.12 Notes publiques

| Source | Note | Nombre d'avis | Dates | URL |
|---|---|---|---|---|
| Chrome Web Store | **4,6 / 5** | **11** | Le filtre « français » affiche 10 avis à 5 étoiles, du 1 juin 2024 au 4 oct. 2026 (dont 4 entre le 8 sept. et le 4 oct. 2026). Le 11e avis n'apparaît pas avec ce filtre et n'a pas été lu. | https://chromewebstore.google.com/detail/dresskare/mofkohgamkldigbgolmbgmipaofobcfb/reviews |
| Shopify App Store (DressKare : synchro Vinted) | **5,0 / 5** | **5** | Avis visibles des 30 sept. et 1 oct. 2026 (France, Belgique) | https://apps.shopify.com/dresskare-connect?locale=fr |
| Trustpilot | **0** (« TrustScore 0 sur 5 ») | **0** | « Profil revendiqué • septembre 2026 » (lu par WebFetch : curl reçoit un 403) | https://fr.trustpilot.com/review/www.dresskare.com |
| Capterra | non vérifiable | — | La page renvoie un 403 à la lecture. Un résultat de recherche indique « 0 » avis et un prix de départ de 9,90 € (non confirmé). | https://www.capterra.co.uk/software/1241183/Dresskare |
| App Store / Google Play | aucune application | — | — | cf. § 2.2 |

À noter, sans conclusion :
- L'avis CWS du 1 juin 2024 est signé « Grégory Giovannone ». C'est le nom de l'auteur des articles du blog,
  et le CEO s'appelle « Gregory ».
- La page https://dresskare.com/avis publie 7 témoignages (avril à juillet 2026) avec cette réserve : « ne
  font pas l'objet d'un contrôle par un tiers indépendant ».

---

## 3. Autres fonctions (hors de la grille demandée)

- **Automatisations Vinted** (dès l'offre Éco) : message aux favoris avec remise, offres acceptées,
  refusées ou contre-proposées selon un seuil, réponses automatiques, remerciement après la vente,
  « Journal des automatisations ». Le site parle de « Sept automatisations, pas une de plus ».
  Source : https://dresskare.com/extension-dresskare
- **Dépôt-vente** (Essentiel) : fiche et espace en ligne pour chaque déposant, grille de commissions par
  tranches, reversements, formulaire public de dépôt, étiquettes Chronopost.
  Source : https://dresskare.com/prix
- **Marketplace de sourcing** (« VendreMesVêtements ») : des particuliers confient ou vendent leurs
  vêtements à une vendeuse proche, « 0 % de commission DressKare ».
  Sources : https://dresskare.com/ ; https://dresskare.com/centre-aide/plans-dresskare
- **Plusieurs comptes Vinted** (dès Actif, « Multi-comptes illimité »).
- **Alertes de sourcing** : « Trouver des articles à revendre sur Vinted avec les alertes DressKare »
  (https://dresskare.com/centre-aide).
- **Formation DressKool** : 79 €, vendue à part (https://dresskare.com/dresskool).

---

## 4. Incohérences entre leurs propres pages (faits relevés)

1. **Plateformes.** L'article de blog (20/07, modifié le 18/08/2026) parle de piloter « Vinted, Vestiaire
   Collective et Leboncoin ». La grille des prix dit « Multiplateformes : Bientôt », et le manifeste ne
   contient que des domaines Vinted.
2. **Offre du connecteur Shopify.** La grille, la FAQ et le comparatif Vendoo disent Pro (69 €). La page
   d'accueil dit : « Dès l'offre Essentiel, 39 €/mois ». Un témoignage dit : « Ce qui m'a fait passer au plan
   Essentiel, c'est la synchro Shopify ».
3. **Accès à la marketplace de déposants.** Selon la grille, elle est cochée dans les 4 offres. Selon
   l'accueil : « Incluse dans l'abonnement dès l'offre Essentiel […] (pas pendant l'essai) ». Selon l'aide
   « plans » : « l'accès à la marketplace de déposants après DressKool ».
4. **« 0 compte bloqué ».** La page d'accueil l'affiche. L'aide écrit pourtant : « les comptes qui dépassent
   environ 50 actions dans la journée […] sont nettement plus souvent restreints » et consacre une page à
   « Compte Vinted temporairement limité ». Les deux textes parlent de « bloqué » d'un côté, de
   « restreint » de l'autre.
5. **Prix dans un témoignage.** Un avis de mai 2026 cite « les 19 € par mois » pour du dépôt-vente, alors que
   le dépôt-vente s'ouvre aujourd'hui à 39 €. Le témoignage peut être antérieur à la grille actuelle.
6. **Adresse.** Trois adresses lyonnaises apparaissent : 18 et 13 rue Sainte-Catherine (mentions légales),
   et 59 rue des Tables Claudiennes (CWS, Shopify).

---

## 5. Ce qu'ils font bien (honnêtement)

- **Un vrai produit de niche, profond** : le dépôt-vente de bout en bout (déposants, commissions,
  reversements, espace déposant, facturation, comptabilité URSSAF et TVA). Nous n'avons vu ce périmètre chez
  aucun autre outil Vinted lors de la découverte.
- **Une grille de prix transparente** : quatre offres, un tableau complet des fonctions, des plafonds
  chiffrés (stock, ajouts IA), un essai de 7 jours sans carte et un engagement écrit de préavis avant toute
  hausse.
- **Un centre d'aide très honnête sur les limites** : ordinateur allumé obligatoire, pas de publication
  depuis le mobile, rythme de republication documenté (20 par heure, 3 min, repère de 50 actions par jour),
  un échec de suppression qui ne supprime rien, des chiffres comptables présentés comme indicatifs.
- **Un discours de sécurité clair et constant** : session de l'utilisateur, aucun identifiant stocké,
  aucune action depuis un serveur.
- **Un vrai connecteur Shopify** publié sur le Shopify App Store (5,0, 5 avis), avec retrait de l'annonce
  Vinted après une vente en boutique.
- **Une extension très active** : mise à jour le jour même de l'observation (9 oct. 2026), version 0.1.325,
  4 avis CWS en un mois.
- **Une machine de contenu SEO** : un sitemap de 451 URL, dont 348 articles de blog et 79 articles d'aide
  (dernière modification le 08/10/2026). On y trouve au moins 12 comparatifs « dresskare-vs-… » (Vendoo,
  Vinteer, Clemz, Vintup, Bleam, Reusses, Fripio…), datés et sourcés (« Comparatif établi sur les pages
  publiées par Vendoo le 7 octobre 2026 »), avec une « Réponse rapide » en tête, un format très bien adapté
  aux moteurs de réponse IA. Ils ont aussi des pages outils (calculateur de revenus) et des pages par
  métier.
- **Des avertissements loyaux** : « Revenus donnés à titre indicatif […] Aucun revenu garanti. »

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- La qualité réelle de l'IA (reconnaissance de marque et de taille, justesse du prix) et le « 50 fiches en
  10 minutes ».
- Le fonctionnement réel de l'extension sur les domaines Vinted hors de France (le manifeste en autorise
  12, le site n'en promet aucun).
- Le contenu de « Multiplateformes : Bientôt » : quelles plateformes, quand.
- Ce que fait vraiment la PWA (écrans, statistiques sur mobile, notifications).
- La détection automatique des ventes Vinted, son délai et sa fiabilité (l'aide reconnaît des ventes « pas
  encore remontées »).
- Les chiffres déclaratifs : « 250+ vendeuses actives », « 0 compte bloqué », « 26 654 déposants
  inscrits », « 645 000 comptes Vinted » analysés.
- La note et le texte du 11e avis CWS.
- La page Capterra (403 à la lecture).
- L'offre exacte qui ouvre le connecteur Shopify et la marketplace (cf. § 4).

---

## 7. Face à FillSell (des faits, sans jugement)

| Point | DressKare (observé le 09/10/2026) | FillSell (contexte du chantier) |
|---|---|---|
| Marketplaces | Vinted seul, plus une boutique Shopify. « Multiplateformes : Bientôt » | Vinted, Leboncoin, eBay, Beebs |
| Application mobile | PWA, aucune application sur l'App Store ni sur Google Play | Applications iOS et Android |
| Rôle du téléphone | Photos, suivi, stock. « La publication et la republication se lancent depuis ton ordinateur » | Le téléphone pilote, l'extension exécute sur l'ordinateur |
| Retrait des copies après une vente | Seulement entre Shopify et Vinted | Entre les plateformes prises en charge |
| Offre gratuite | Aucune (essai de 7 jours) | Gratuit avec plafonds (dont 50 republications par mois) |
| IA dès l'entrée de gamme | Non : l'IA et l'ajout d'articles commencent à 19 € | — (à documenter côté FillSell) |
| Langue | Français seulement | — |
| Fonctions que FillSell n'a peut-être pas (à vérifier de notre côté) | Dépôt-vente et CRM des déposants, comptabilité URSSAF et TVA, connecteur Shopify, messages aux favoris, gestion des offres, mannequins IA, marketplace de déposants, formation | — |

**Pour le SEO/GEO de FillSell.** Aucune URL du sitemap DressKare ne nomme FillSell (le contenu des
348 articles n'a pas été lu en entier). Leur angle « Vinted + dépôt-vente + Shopify » laisse libre le
terrain du **crosslisting Vinted, Leboncoin, eBay et Beebs piloté depuis le téléphone**. Leur propre
comparatif renvoie d'ailleurs les vendeurs multi-plateformes vers d'autres outils (« Si tu vends sur
beaucoup de places de marché, Vendoo se défend »).

---

## 8. Correction à reporter dans `00-decouverte.md`

La ligne 282 de `00-decouverte.md` dit : « Reposter, FLUF et DressKare publient vers Vinted et Leboncoin,
parfois au-delà. » **Pour DressKare, la vérification ne le confirme pas.** Le produit, la grille des prix
(« Multiplateformes : Bientôt »), le manifeste de l'extension (aucun domaine Leboncoin) et leur comparatif
du 07/10/2026 décrivent un outil réservé à Vinted et Shopify. Seul un article de blog de juillet et août 2026
annonce Leboncoin et Vestiaire. La ligne 46 de `00-decouverte.md` (« Vestiaire et Leboncoin contradictoires
selon les pages ») est exacte.

---

## 9. Sources (toutes lues le 2026-10-09)

- https://dresskare.com/ : accueil, chiffres, FAQ
- https://dresskare.com/prix : grille, « Multiplateformes : Bientôt »
- https://dresskare.com/extension-dresskare : extension, automatisations, ordinateur seulement
- https://dresskare.com/ajouter-ses-articles-vinted : 4 façons d'ajouter, import Vinted, Excel
- https://dresskare.com/intelligence-artificielle : IA, offre Actif
- https://dresskare.com/notre-solution-vinted-extension : vue d'ensemble, mobile ou ordinateur
- https://dresskare.com/logiciel-comptabilite-vendeur-vinted : module Compta
- https://dresskare.com/avis : témoignages et réserve
- https://dresskare.com/qui-sommes-nous : équipe
- https://dresskare.com/mentions-legales : SIRET, adresses
- https://dresskare.com/cgv : § 11.5, § 12, § 18
- https://dresskare.com/centre-aide : 79 articles, rubriques
- https://dresskare.com/centre-aide/installer-application-mobile : PWA
- https://dresskare.com/centre-aide/pourquoi-extension-chrome-securite : rôle du mobile
- https://dresskare.com/centre-aide/importer-dressing-vinted : import et doublons
- https://dresskare.com/centre-aide/statut-synchronisation-vinted : écran de synchronisation
- https://dresskare.com/centre-aide/supprimer-article-dresskare-et-vinted : suppression des deux côtés
- https://dresskare.com/centre-aide/combien-republications-vinted-par-jour : cadence et restrictions
- https://dresskare.com/centre-aide/suivre-commandes-vinted : commandes, CA, marge
- https://dresskare.com/centre-aide/suivi-ca-marge-stock : tableau de bord
- https://dresskare.com/centre-aide/plans-dresskare : 4 plans
- https://dresskare.com/centre-aide/plan-commission-migration : pas de plan gratuit, plan à la commission retiré
- https://dresskare.com/centre-aide/prise-photos-rafale-mobile : ajout express
- https://dresskare.com/centre-aide/synchroniser-stock-shopify-vinted : synchro du stock Shopify
- https://dresskare.com/centre-aide/filtrer-stock-par-plateforme-publication : filtre Vinted / Shopify
- https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/multiposter-vinted-vestiaire-leboncoin : article de blog (20.07, modifié le 18.08.2026)
- https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/dresskare-vs-vendoo-comparatif-2026 : comparatif du 07.10.2026
- https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/beebs-une-nouvelle-opportunite-pour-les-vendeurs-de-seconde-main : article sur Beebs (14.10.2024)
- https://dresskare.com/sitemap.xml : 451 URL
- https://app.dresskare.com/ : `lang="fr"`, manifeste PWA
- https://chromewebstore.google.com/detail/dresskare/mofkohgamkldigbgolmbgmipaofobcfb : fiche CWS, et `/reviews`
- Paquet CWS `mofkohgamkldigbgolmbgmipaofobcfb` (version 0.1.325) : `manifest.json`, `host_permissions`
- https://apps.shopify.com/dresskare-connect?locale=fr : Shopify App Store
- https://fr.trustpilot.com/review/www.dresskare.com : Trustpilot
- https://itunes.apple.com/search?term=dresskare&country=fr&entity=software : App Store FR, 0 résultat
- https://play.google.com/store/search?q=dresskare&c=apps&hl=fr : Google Play, aucune application DressKare
- https://www.capterra.co.uk/software/1241183/Dresskare : 403, non vérifié
