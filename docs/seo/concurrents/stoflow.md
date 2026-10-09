# StoFlow — vérification sur ses pages réelles

Date d'observation : **2026-10-09**. Méthode : lecture du web seulement (curl, WebFetch, WebSearch).
Aucun compte n'a été créé, aucune connexion faite, aucun formulaire rempli, aucun rendez-vous pris.
Le paquet public de l'extension a été téléchargé depuis le serveur de mises à jour de Google ; seul
son `manifest.json` a été lu, et rien n'a été exécuté. Les chiffres publiés par StoFlow (précision de
l'IA, photos traitées, heures gagnées) sont **ses propres affirmations**. Les seuls chiffres tiers
relevés viennent du Chrome Web Store (CWS) et de Firefox Add-ons (AMO), lus le 09/10/2026.

Pages lues le 09/10/2026 : accueil, `/pricing`, `/docs`, `/docs/aide/faq`, `/docs/videos`,
`/pour/vinted`, `/pour/leboncoin`, `/pour/ebay`, `/pour/etsy`, `/pour/vestiaire`, `/a-propos`,
`/support`, `/audit-vinted`, `/legal/mentions`, `/legal/cgv-particulier`, quatre articles de blog
(dont le comparatif), `robots.txt`, `sitemap.xml`, `llms.txt`, la fiche CWS et ses avis, l'API
publique d'AMO, la recherche App Store (API iTunes) et la recherche Google Play.

Les réponses de FAQ citées ci-dessous viennent du balisage `FAQPage` (JSON-LD) des pages, qui porte
le texte complet des réponses repliées à l'écran.

---

## 1. Fiche d'identité

| Élément | Constat | Source (lue le 2026-10-09) |
|---|---|---|
| Nom | StoFlow. Titre de l'accueil : « StoFlow : vendez sur Vinted, eBay, Leboncoin, Etsy, Vestiaire » | https://stoflow.com/ |
| Éditeur | « Raison sociale : Stokode SARL », « Capital social : 1 000 € », « Siège social : 5 rue Emile Zola, 77340 Pontault-Combault », « SIRET : 992 682 393 00010 », « RCS : Melun » | https://stoflow.com/legal/mentions |
| Fondateur | « Je m'appelle Matthias […] Je gère Shop Ton Outfit, ma boutique de seconde-main, depuis 3 ans. » Directeur de la publication : « Matthias Ribeiro », « Gérant de Stokode SARL » | https://stoflow.com/a-propos ; https://stoflow.com/legal/mentions |
| Lancement | « StoFlow est une plateforme SaaS lancée en 2025 » ; JSON-LD `"foundingDate":"2025"` | https://stoflow.com/a-propos ; https://stoflow.com/ |
| Hébergement | « Hébergeur : OVHcloud […] 59100 Roubaix » ; « hébergées en France, à Roubaix » | https://stoflow.com/legal/mentions ; https://stoflow.com/ (FAQ) |
| Fiche CWS | « StoFlow : vendez sur Vinted, Leboncoin, eBay, Etsy et Vestiaire », éditeur **STOKODE**, **175 utilisateurs**, **3,2 / 5 (6 avis)**, version **1.54.0**, « Dernière mise à jour : 8 octobre 2026 », 710 KiB, langue : « français », développeur déclaré « Professionnel » | https://chromewebstore.google.com/detail/stoflow-vendez-sur-vinted/mbckhfhfapmdgfidjjpkpnaafnckeipg |
| Fiche Firefox | « Stoflow-Marketplace Manager », version 1.54.0, créée le 02/02/2026, mise à jour le 08/10/2026, **13 utilisateurs quotidiens moyens**, **1 avis (5 / 5)** | https://addons.mozilla.org/fr/firefox/addon/stoflow-marketplace-manager/ (API AMO v5) |
| Affiliation | « Service indépendant, non affilié aux plateformes citées. » (CWS) ; « StoFlow est un outil indépendant […] Vinted ne propose pas d'API publique pour les vendeurs particuliers. » | fiche CWS ; https://stoflow.com/pour/vinted |

---

## 2. Les points demandés

### 2.1 Plateformes supportées — **Vinted, Leboncoin, eBay, Vestiaire Collective, Etsy, plus Opla et AbeBooks en bêta ; pas de Beebs**

Le site annonce sept marketplaces : « Automatisez vos ventes AbeBooks, eBay, Etsy, Leboncoin, Opla,
Vestiaire Collective et Vinted. » et un compteur « 7 Marketplaces » (https://stoflow.com/). La FAQ
du centre d'aide n'en nomme que cinq : « Vinted, Leboncoin, eBay, Etsy et Vestiaire Collective. »
(https://stoflow.com/docs/aide/faq). Opla et AbeBooks portent la mention « Bêta » sur les cartes
de prix (https://stoflow.com/pricing).

Chaque plan ouvre certaines plateformes (https://stoflow.com/pricing, FAQ de la page) : « Free :
Vinted, Leboncoin ; Starter : Vinted, Leboncoin, eBay France ; Pro : Vinted, Leboncoin, eBay France,
Vestiaire Collective, Opla ; Business : Vinted, Leboncoin, eBay 9 pays, Etsy, Vestiaire Collective,
Opla, AbeBooks. »

| Plateforme | Supportée ? | Détail et citation |
|---|---|---|
| **Vinted** | Oui, dès le plan Free | « Vinted est disponible à partir du plan Free. » (https://stoflow.com/pour/vinted). **Pays** : aucune page lue ne nomme de pays Vinted. Le manifeste de l'extension 1.54.0 ne déclare que `https://www.vinted.fr/*`, `https://www.vinted.com/*` et `https://api.vinted.fr/*`, sans vinted.be, .it, .es, .de ni aucun autre domaine national. **Déduction**, non confirmée par l'éditeur : Vinted France. |
| **Leboncoin** | Oui, dès le plan Free | « Leboncoin est disponible dès le plan gratuit, aux côtés de Vinted. » (https://stoflow.com/pour/leboncoin). Domaines : `www.leboncoin.fr`, `api.leboncoin.fr`, `auth.leboncoin.fr` (manifeste). |
| **eBay France** | Oui, à partir du plan **Starter** (14,99 €) | « eBay est disponible à partir du plan Starter. Le plan gratuit couvre Vinted et Leboncoin. » (https://stoflow.com/pour/ebay). Connexion « Via OAuth, le mécanisme d'autorisation officiel d'eBay ». Le manifeste ne déclare **aucun** domaine eBay, ce qui concorde avec un passage par l'API. |
| eBay hors France | Plan **Business** seulement | « Les neuf marchés européens d'eBay (France, Royaume-Uni, Allemagne, Italie, Espagne, Pays-Bas, Belgique, Pologne, Autriche) sont eux réservés au plan Business : en dessous, eBay se limite à la France. » (https://stoflow.com/docs/aide/faq) |
| **Beebs** | **Non** | Zéro occurrence de « Beebs » sur les 22 pages du site lues, sur la fiche CWS (hors du bloc « Articles similaires », où apparaît la fiche FillSell) et dans le manifeste. |
| Vestiaire Collective | Oui, à partir du plan **Pro** | « Vestiaire Collective est disponible à partir du plan Pro. » ; connexion par « un navigateur cloud hébergé en France » (https://stoflow.com/pour/vestiaire) |
| Etsy | Oui, plan **Business** | « Etsy est disponible à partir du plan Business. » (https://stoflow.com/pour/etsy) |
| Opla | « Bêta », plan Pro | carte Pro : « Opla Bêta » (https://stoflow.com/pricing) |
| AbeBooks | « Bêta », plan Business | carte Business : « AbeBooks Bêta » (https://stoflow.com/pricing). Aucun domaine AbeBooks dans le manifeste. |
| Depop, Whatnot, Cardmarket | **Non annoncés** | Aucune page ne les cite. Pourtant, le manifeste 1.54.0 (CWS et AMO) déclare des accès et des scripts de contenu sur `www.depop.com`, `webapi.depop.com`, `www.whatnot.com` et `www.cardmarket.com`, et des accès facultatifs à `www.facebook.com`. Ce qu'ils font n'est pas vérifiable : des permissions ne prouvent pas une fonction ouverte. |

### 2.2 Application mobile iOS / Android — **non, « en cours de construction »**

- « L'application mobile StoFlow existe-t-elle déjà ? Non, pas encore. Une application StoFlow pour
  iPhone et Android est en cours de construction ; elle n'est publiée ni sur l'App Store ni sur le
  Play Store, sans date annoncée pour l'instant. » — https://stoflow.com/docs/aide/faq
- Contrôle : l'API iTunes Search (`term=stoflow`, `country=fr`) renvoie **0 résultat** ; la recherche
  Google Play « stoflow » (https://play.google.com/store/search?q=stoflow&c=apps&hl=fr&gl=FR) ne
  remonte aucune application StoFlow ni Stokode (09/10/2026).
- Les CGV prévoient déjà ce cas : « 4.5 Abonnements souscrits depuis l'application mobile — Lorsque
  l'abonnement est souscrit depuis l'application iOS ou Android, le paiement est encaissé par Apple ou
  par Google » (https://stoflow.com/legal/cgv-particulier, « Dernière mise à jour : 22 sept. 2026 »).
- Le site est une application web utilisable dans le navigateur du téléphone (voir 2.4).

### 2.3 Extension navigateur — **oui, c'est la voie de connexion de Vinted et Leboncoin**

- « Cette extension relie votre navigateur à votre compte stoflow.com. Elle est gratuite […] Elle
  s'installe depuis cette page sur Google Chrome, Brave et Microsoft Edge. » — fiche CWS
- La FAQ cite aussi Firefox : « l'extension StoFlow (Chrome, Firefox, Edge, Brave), qui ne s'installe
  que sur un ordinateur » — https://stoflow.com/docs/aide/faq. L'extension Firefox existe bien
  (AMO, version 1.54.0).
- Pied de page de toutes les pages : « L'extension qui transforme vos ventes en ligne. »
- Il existe aussi un **mode cloud** à partir du plan Pro : « Avec le plan Pro, vos comptes tournent
  sur nos serveurs en France, ordinateur éteint. » — https://stoflow.com/ ; « en mode cloud, la
  session tourne sur nos serveurs pour Vinted, Leboncoin et Vestiaire Collective (eBay passe par
  l'API officielle et n'a jamais besoin de session). Avec le plan gratuit ou Starter, l'extension
  navigateur a besoin que votre navigateur soit ouvert. » — https://stoflow.com/ (FAQ)

### 2.4 D'où l'on part — **un tableau de bord web (ordinateur ou navigateur du téléphone) ; l'ordinateur reste obligatoire pour connecter Vinted et Leboncoin en Free et Starter**

- « Est-ce que StoFlow fonctionne sur mon téléphone ? Oui, presque tout fonctionne depuis le
  navigateur de ton téléphone : même compte, même catalogue, même tableau de bord que sur ordinateur.
  Une seule étape bute, et seulement sur les plans Free et Starter : connecter un compte Vinted ou
  Leboncoin. » — https://stoflow.com/docs/aide/faq
- « Existe-t-il un moyen de connecter Vinted ou Leboncoin depuis mon téléphone, sans ordinateur ?
  Oui, mais seulement à partir du plan Pro : le compte Cloud, une session hébergée par StoFlow gérée
  entièrement depuis un téléphone » — même page
- Parcours d'installation (fiche CWS) : « 1. Installez l'extension. 2. Créez votre compte.
  3. Connectez-vous à vos marketplaces comme d'habitude, puis reliez-les depuis votre tableau de bord.
  4. Créez ou importez vos articles, publiez, et suivez tout au même endroit. »
- La publication n'est jamais lancée seule : « Est-ce que StoFlow publie automatiquement ? Non. Tu
  choisis quand et où publier. StoFlow ne publie jamais sans ta confirmation. » —
  https://stoflow.com/docs/aide/faq

### 2.5 Identification par photo / IA — **oui : détourage, reconnaissance du produit, titre, description, prix**

- « Studio IA — Une photo. Une fiche complète. Déposez vos photos : StoFlow retire le fond, reconnaît
  le produit et remplit la fiche. » ; « 16 familles de produits reconnues » ; « Livres : fiche
  pré-remplie par ISBN ou code-barres » — https://stoflow.com/
- « Rédaction IA — La fiche s'écrit toute seule. Titre, description et prix rédigés depuis vos photos.
  Vous relisez, vous publiez. » ; « Titres en 3 formats » ; « Descriptions honnêtes […] Traduites en
  5 langues » ; « Prix en 3 niveaux — L'IA consulte le marché. Vous gardez le dernier mot. » —
  https://stoflow.com/
- « Que fait exactement l'IA ? Détourage en 0,2 seconde, reconnaissance du produit parmi 16 familles,
  puis proposition de titre, de description et de prix. Vos photos peuvent aussi être portées sur un
  mannequin virtuel. […] Chaque plan inclut un budget IA mensuel. » — https://stoflow.com/ (FAQ)
- Chiffres affichés, **non vérifiables** : « 0,2 s Temps moyen », « 99,8 % Précision », « 2M+ Photos
  traitées », « 10k h Temps économisé » — https://stoflow.com/
- Quotas par plan : Free « IA Essentielle, 300 détourages/mois » ; Starter « IA Plus : 5x plus que
  Free, 2 000 détourages/mois » ; Pro « IA Max : 4x plus que Starter, 5 000 détourages/mois » ;
  Business « IA Ultra : 5x plus que Pro, 15 000 détourages/mois ». La ligne « Rédaction par IA »
  n'apparaît que sur les cartes **Pro** et **Business** — https://stoflow.com/pricing. Renouvellement
  « le 1er de chaque mois » — https://stoflow.com/docs/aide/faq
- Prudence affichée : « L'IA peut-elle se tromper sur les attributs ? Oui, l'IA fait parfois des
  erreurs. Vérifie toujours les attributs détectés avant de publier. » — https://stoflow.com/docs/aide/faq

### 2.6 Import / synchronisation du stock existant — **oui, Vinted, Leboncoin, eBay et Etsy ; le lien entre annonces est un geste**

- « Vos annonces existantes s'importent en un clic : pas besoin de les refaire. » — https://stoflow.com/
- « Mes annonces déjà en ligne, je dois tout ressaisir ? Non, StoFlow importe vos annonces Vinted,
  Leboncoin, eBay et Etsy, puis les convertit en fiches produit en un clic, y compris celles créées
  avant StoFlow. » — https://stoflow.com/ (FAQ)
- « Mes annonces existantes sont-elles importées ? Oui. Utilise le bouton Synchroniser pour importer
  tes annonces existantes. Elles apparaissent comme « non liées » et tu peux les lier à ton inventaire
  StoFlow. » — https://stoflow.com/docs/aide/faq
- « StoFlow synchronise vos annonces existantes et vous permet de les rattacher à vos produits StoFlow,
  sans avoir à tout republier. » — https://stoflow.com/pour/vinted (FAQ)
- Aucune page lue ne décrit un **rapprochement automatique** de la même pièce entre deux plateformes
  (par photo ou autre) : le rattachement est présenté comme une action de la personne.
- Synchronisation continue (Pro et Business) : « Ventes, commandes, catalogue et messages relevés
  plusieurs fois par jour. » — https://stoflow.com/

### 2.7 Retrait automatique des copies après une vente — **oui, dès le plan Free, automatique ou après confirmation**

- « Vendu sur l'une, retiré des autres. Un produit vendu est retiré de toutes les autres marketplaces,
  automatiquement ou après votre feu vert. Fini la double vente. Inclus dès le plan gratuit. » —
  https://stoflow.com/
- « Comment StoFlow évite la double vente ? Dès qu'une vente est détectée (**4 synchronisations par
  jour, temps réel sur eBay**), un retrait est créé sur chaque marketplace où le produit est encore en
  ligne. Vous choisissez si le retrait part seul ou attend votre confirmation. » — https://stoflow.com/ (FAQ)
- Le passage en « vendu » sur StoFlow, lui, est automatique : « StoFlow le voit dès que la commande
  arrive et marque le produit comme vendu tout seul, sans rien te demander. » —
  https://stoflow.com/docs/aide/faq
- Aucun délai n'est garanti : « Aucun délai de détection n'est promis : garde un œil sur tes commandes
  pour les articles très demandés. » — https://stoflow.com/blog/synchroniser-son-stock-eviter-double-vente
  (mis à jour le 6 octobre 2026)
- En Free et Starter, l'extension exige un navigateur ouvert (citation en 2.3).

### 2.8 Republication / relist automatique — **oui sur Vinted et Leboncoin, automatique à partir du plan Pro**

- « Republication automatique — Les annonces qui vieillissent sont republiées, jusqu'à 200 par jour.
  Vinted et Leboncoin. » — https://stoflow.com/ (bloc « Mode cloud », plans Pro et Business)
- « La republication automatique est disponible à partir du plan Pro » ; règle « créée désactivée » ;
  « La republication manuelle en lot […] tu la lances depuis le tableau de bord de StoFlow, pour
  100 produits au plus par demande » ; « Dans l'extension, l'action « Republier » est refusée (au
  06/10/2026) : la republication passe par le tableau de bord » —
  https://stoflow.com/blog/extension-vinted-risque-blocage-compte
- Pas sur eBay : « La republication en lot est disponible sur Vinted et Leboncoin, pas sur eBay » —
  https://stoflow.com/pour/ebay. Pas sur Vestiaire : « la republication automatique reste propre à
  Vinted et Leboncoin » — https://stoflow.com/pour/vestiaire
- Plage horaire : « Les automatisations ne tournent que de 8h à 22h, heure de Paris. » — https://stoflow.com/
- Autres automatisations annoncées (Pro et Business) : relance des favoris (« 25 par jour maximum »),
  « Smart Pricing », « Négociation automatique », « Réponses automatiques », messagerie IA. « Plans
  Pro et Business. 2 comptes par marketplace en Pro, 5 en Business. » — https://stoflow.com/

### 2.9 Stock, ventes, statistiques — **oui ; tableau de rentabilité réservé au Business**

- Limite de produits **publiés** : « Free : 100 produits publiés, Starter : 500, Pro : 2 000,
  Business : illimités » ; « tes brouillons ne comptent pas » — https://stoflow.com/docs/aide/faq
- « Commandes unifiées — Ventes et achats des cinq marketplaces dans un seul écran. » ; « Bordereaux
  du jour — Tous les bordereaux du jour en un seul PDF, A4 ou étiquette thermique. » — https://stoflow.com/
- « Comptabilité automatique — Plans Pro et Business. Ventes, commissions et coûts arrivent seuls.
  Export Excel et FEC (bêta), alertes de seuils micro-entreprise et TVA. » — https://stoflow.com/
- « Statistiques de rentabilité — Plan Business. ROI par produit et par marketplace, stock dormant
  liquidé en un clic, meilleur créneau de publication. » — https://stoflow.com/
- Export des données : « Paramètres > Profil, bouton « Exporter (JSON) » » — https://stoflow.com/docs/aide/faq

### 2.10 Prix — **en euros TTC, Free 0 €, puis 14,99 / 29,99 / 79,99 € par mois ; pas d'essai gratuit sur les plans payants**

| Plan | Mensuel | Annuel (par mois) | Plateformes | Produits publiés |
|---|---|---|---|---|
| Free | 0 € « gratuit pour toujours » | — | Vinted, Leboncoin | 100 |
| Starter | 14,99 € | 12,5 € (« Économisez 29,89 €/an ») | + eBay France | 500 |
| Pro (« Le + populaire ») | 29,99 € | 25 € (« Économisez 59,89 €/an ») | + Vestiaire Collective, Opla Bêta | 2 000 |
| Business | 79,99 € | 66,67 € (« Économisez 159,89 €/an ») | + eBay 9 pays, Etsy, AbeBooks Bêta | illimité |

Source : https://stoflow.com/pricing (« Tous les montants affichés s'entendent TTC »).

- Annuel : « l'équivalent de 2 mois offerts (réduction de 20 % sur les plans Starter, Pro et
  Business) » — https://stoflow.com/pricing
- **Pas d'essai** : « Il n'existe pas d'essai gratuit sur les plans payants aujourd'hui. » —
  https://stoflow.com/docs/aide/faq
- Remboursement : « Satisfait ou remboursé 14 jours pour les particuliers (CGV, art. 4) » —
  https://stoflow.com/pricing ; « Ce droit s'exerce une seule fois par compte » —
  https://stoflow.com/docs/aide/faq
- Pause : « mettre votre abonnement en pause de 1 à 3 mois sans perdre vos données » —
  https://stoflow.com/ (FAQ)
- Parrainage : « s'il paie au mois, tu reçois la moitié du prix mensuel de son plan » —
  https://stoflow.com/docs/aide/faq
- Les cartes Pro et Business finissent par « + 5 autres avantages » et « + 6 autres avantages » :
  cette liste est chargée par le navigateur et **n'a pas pu être lue** sans exécuter la page.

### 2.11 Pays et langues — **France, en français seulement**

- Site : `"inLanguage":"fr"`, `og:locale` « fr_FR » ; aucune version dans une autre langue (aucune URL
  `/en/` dans le sitemap) — https://stoflow.com/ ; https://stoflow.com/sitemap.xml
- Fiche CWS : « Langues : français » ; fiche AMO : langue par défaut `fr`.
- « 100% Hébergé en France », « Support Français » — https://stoflow.com/
- Seules les **descriptions** d'annonces sont « Traduites en 5 langues » (langues non nommées) —
  https://stoflow.com/
- Marchés : Vinted (France, d'après le manifeste), Leboncoin (France), eBay France ou 9 pays européens
  en Business (citation en 2.1). Page « À propos » : « compatible avec les principales plateformes de
  revente en France et en Europe ».

### 2.12 Notes publiques — **CWS 3,2 / 5 (6 avis) ; Firefox 5 / 5 (1 avis) ; aucune page Trustpilot ; aucune app**

| Source | Note | Nombre d'avis | Utilisateurs | Lu le |
|---|---|---|---|---|
| Chrome Web Store | **3,2 / 5** | **6** | 175 | 2026-10-09 |
| Firefox Add-ons (AMO) | 5 / 5 (moyenne bayésienne affichée par l'API : 2,33) | 1 | 13 utilisateurs quotidiens moyens | 2026-10-09 |
| Trustpilot | — | — | — | `https://fr.trustpilot.com/review/stoflow.com` : **404** par WebFetch (curl : 403, vérification anti-robot). Aucune page trouvée. |
| App Store / Google Play | — | — | — | aucune application (voir 2.2) |
| Site | aucune note affichée, aucun `aggregateRating` dans le JSON-LD | — | — | 2026-10-09 |

Détail des 6 avis CWS (https://chromewebstore.google.com/detail/stoflow-vendez-sur-vinted/mbckhfhfapmdgfidjjpkpnaafnckeipg/reviews) :

| Date | Note | Extrait |
|---|---|---|
| 2 sept. 2026 | 5 | « top , vraiment trop pratique ! » — signé « matthias ribeiro », le même nom que le gérant de Stokode SARL indiqué dans les mentions légales |
| 19 juin 2026 | 1 | « Ne fonctionne pas ! le bouton "republier" ne fait strictement rien, que ce soit sur vinted ou leboncoin .... » |
| 4 juin 2026 | 1 | « impossible de publier sur une autre plateforme » |
| 3 juin 2026 | 5 | « super extension hyper pratique » |
| 8 mai 2026 | 5 | « très pratique et facile d'utilisation » |
| 2 mai 2026 | 2 | « quand je vois l'extension et la webapp on dirait qu'elle est complete mais malheureusement rien ne fonctionne » |

Les trois avis négatifs datent de mai et juin 2026. Les versions ont changé depuis (1.54.0 au
08/10/2026) : ces avis ne disent rien de l'état actuel du produit.

---

## 3. Écarts entre les pages de StoFlow (faits relevés, sans interprétation)

| Sujet | Page A | Page B |
|---|---|---|
| Nombre de marketplaces | « Une fiche, cinq marketplaces. » et « 7 Marketplaces » (https://stoflow.com/) | FAQ : « Vinted, Leboncoin, eBay, Etsy et Vestiaire Collective. » (https://stoflow.com/docs/aide/faq) |
| Délai de réponse du support | « Support Français (réponse < 2h) » (https://stoflow.com/) | « généralement sous 24 à 48 heures ouvrées » (https://stoflow.com/support) |
| Connexion à Etsy | « Vinted, Leboncoin, Etsy et Vestiaire Collective se connectent par une session de navigateur » (FAQ, « Faut-il installer quelque chose ? ») | « Pour eBay, Etsy et Vestiaire Collective, c'est une autorisation officielle qui expire » (même FAQ, « Ma connexion Vinted ou eBay ne marche plus ») |
| Navigateurs | CWS : « Google Chrome, Brave et Microsoft Edge » | FAQ : « Chrome, Firefox, Edge, Brave » (l'extension Firefox existe) |
| Audit Vinted | « Gratuit avec un compte StoFlow » | « Aucun compte StoFlow à créer. » (même page, https://stoflow.com/audit-vinted) |

---

## 4. Ce que StoFlow fait bien (honnêtement)

1. **Couverture large et lisible** : sept marketplaces, avec une grille claire de ce que chaque plan
   ouvre ; eBay sur 9 pays européens, Vestiaire Collective et Etsy, que peu d'outils français
   couvrent.
2. **Plan gratuit utile** : Vinted et Leboncoin, 100 produits, retrait automatique après une vente
   inclus, sans carte bancaire.
3. **Mode cloud livré** (plan Pro) : Vinted, Leboncoin et Vestiaire tournent ordinateur éteint, et le
   compte se pilote depuis un téléphone.
4. **Transparence sur les risques** : « C'est Vinted qui décide, pas nous » ; plage 8 h-22 h, délais
   aléatoires, plafonds identiques sur tous les plans, pause au premier signe de blocage ; un article
   entier explique ce que StoFlow ne fait pas. Chaque page « pour/… » liste « Uniquement les actions
   réellement prises en charge sur cette plateforme ».
5. **Aide et contrat soignés** : FAQ détaillée (échec de paiement, résiliation, suppression du compte,
   export JSON au titre de l'article 20 du RGPD), tutoriel vidéo de 57 minutes, charte des bonnes
   pratiques par marketplace, 14 jours remboursés, pause de 1 à 3 mois, prix annuels.
6. **Contenu SEO/GEO très travaillé** :
   - un comparatif sourcé et daté (« 23 juillet 2026, mis à jour le 6 octobre 2026 », 13 outils,
     « aucun outil n'est noté ni classé ici ») et **13 pages « StoFlow vs … »** (Bleam, Closo,
     ControlResell, Crosslist, DressKare, FLUF Connect, List Perfectly, Reposter.io, Vendoo, Vinkit,
     VintedCRM, Vinteer, You-Sync) ;
   - une page « pour » par marketplace, 56 articles de blog dans le sitemap (dont les 13 « StoFlow
     vs … »), trois outils d'audit gratuits ;
   - un balisage `FAQPage`, `Organization` et `SoftwareApplication` en JSON-LD et un `llms.txt`
     (https://stoflow.com/llms.txt, 18 Ko) ;
   - un `robots.txt` qui nomme GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc. **sans les
     bloquer** (mêmes exclusions que pour tous : /dashboard, /admin, /api…).
7. **Fonctions de gestion avancées**, mais réservées aux plans payants : messagerie unifiée avec
   réponses IA, négociation dans une marge fixée, comptabilité avec export FEC (bêta), bordereaux du
   jour en PDF, plusieurs comptes par marketplace.

---

## 5. Écarts factuels avec FillSell

Faits côté FillSell : `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (09/10/2026). Aucun jugement
n'est porté ici.

| Sujet | StoFlow (09/10/2026) | FillSell (fiche de vérité, 09/10/2026) |
|---|---|---|
| Application mobile | **aucune** (« en cours de construction ») | App iOS et Android publiées (F01, F02) |
| Beebs | **absent** | publié, synchronisé, retiré (F24) |
| eBay dans le plan gratuit | non (à partir de Starter, 14,99 €) | carte Gratuit : « Publication auto sur Vinted, Leboncoin, eBay & Beebs » (§ 10.1) |
| Limite de stock | 100 / 500 / 2 000 produits publiés selon le plan | stock sans limite d'articles sur tous les paliers (F48) |
| Rapprochement d'une même pièce entre plateformes | les annonces importées sont « non liées » et se lient à la main ; aucun rapprochement automatique décrit | rapprochement côté serveur (mêmes photos et accord du titre ; le doute devient une question) (F35) |
| Vinted (pays) | manifeste : vinted.fr et vinted.com seulement | 0.6.104 servie : vinted.fr et vinted.com (F32) — **même périmètre** |
| Republication automatique | à partir de Pro (29,99 €), Vinted et Leboncoin | à partir de Pro, Vinted, Leboncoin et Beebs (F39) |
| Langues | français seulement | app en français et en anglais (F04) |
| Chrome Web Store | 175 utilisateurs ; 3,2 / 5 (6 avis) | 360 utilisateurs ; 5,0 / 5 (1 avis) (§ 0) — échantillons trop petits pour conclure |
| Comparatif crosslisting de StoFlow | FillSell **n'y figure pas** (0 occurrence de « FillSell » sur les pages lues ; pas de page « stoflow-vs-fillsell » dans le sitemap) | — |

Points où StoFlow va plus loin, pour mémoire et sans les reprendre côté FillSell : Etsy, Vestiaire
Collective, eBay hors de France, mode cloud livré, extension Firefox, prix annuels, 14 jours
remboursés, messagerie unifiée, export FEC.

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- Le **délai réel** entre une vente et le retrait des autres annonces (« 4 synchronisations par jour »
  annoncées, sauf eBay en temps réel), et si la plage 8 h-22 h s'applique aussi aux retraits.
- Si la **rédaction IA** (titre, description, prix) est incluse en Free et Starter : la ligne
  « Rédaction par IA » ne figure que sur les cartes Pro et Business, alors que la FAQ dit « Chaque plan
  inclut un budget IA mensuel ».
- La **republication manuelle en lot** : le plan à partir duquel elle est ouverte n'est pas écrit
  clairement.
- Les **5 langues** de traduction des descriptions.
- Le contenu des « + 5 / + 6 autres avantages » des cartes Pro et Business (chargé par le navigateur).
- Le **pays Vinted** réellement pris en charge (France, d'après le manifeste seulement).
- Le rôle des accès Depop, Whatnot, Cardmarket et Facebook déclarés dans le manifeste.
- Les chiffres « 99,8 % Précision », « 2M+ Photos traitées », « 10k h » et « réponse < 2h ».
- Le nombre réel de clients : la seule mesure tierce est celle des stores d'extensions (175 sur
  Chrome, 13 utilisateurs quotidiens sur Firefox).
- Le fonctionnement réel du mode cloud et de l'import (non testés : aucun compte créé).

---

## 7. Sources (toutes lues le 2026-10-09)

- Accueil : https://stoflow.com/
- Tarifs : https://stoflow.com/pricing
- Centre d'aide : https://stoflow.com/docs ; FAQ : https://stoflow.com/docs/aide/faq ; vidéos :
  https://stoflow.com/docs/videos
- Pages par marketplace : https://stoflow.com/pour/vinted ; https://stoflow.com/pour/leboncoin ;
  https://stoflow.com/pour/ebay ; https://stoflow.com/pour/etsy ; https://stoflow.com/pour/vestiaire
- À propos : https://stoflow.com/a-propos ; support : https://stoflow.com/support ; audit :
  https://stoflow.com/audit-vinted
- Mentions légales : https://stoflow.com/legal/mentions ; CGV particuliers :
  https://stoflow.com/legal/cgv-particulier
- Comparatif : https://stoflow.com/blog/meilleur-logiciel-crosslisting-2026 (« mis à jour le
  6 octobre 2026 »)
- Blog : https://stoflow.com/blog/synchroniser-son-stock-eviter-double-vente ;
  https://stoflow.com/blog/extension-vinted-risque-blocage-compte ;
  https://stoflow.com/blog/vendre-sur-vinted-et-leboncoin-en-meme-temps
- Fichiers techniques : https://stoflow.com/robots.txt ; https://stoflow.com/sitemap.xml (93 URL) ;
  https://stoflow.com/llms.txt
- Chrome Web Store : https://chromewebstore.google.com/detail/stoflow-vendez-sur-vinted/mbckhfhfapmdgfidjjpkpnaafnckeipg
  et `/reviews` ; manifeste lu dans le paquet public (`clients2.google.com/service/update2/crx`,
  id `mbckhfhfapmdgfidjjpkpnaafnckeipg`, version 1.54.0)
- Firefox : https://addons.mozilla.org/fr/firefox/addon/stoflow-marketplace-manager/ (API
  `addons.mozilla.org/api/v5/addons/addon/stoflow-marketplace-manager/`)
- App Store : `https://itunes.apple.com/search?term=stoflow&country=fr&entity=software` (0 résultat)
- Google Play : https://play.google.com/store/search?q=stoflow&c=apps&hl=fr&gl=FR (aucune application StoFlow)
- Trustpilot : https://fr.trustpilot.com/review/stoflow.com (404)
