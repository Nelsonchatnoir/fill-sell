# Redrip — vérification sur ses pages réelles

Date d'observation : **2026-10-09**. Méthode : lecture du web seulement (curl, WebFetch, WebSearch).
Aucun compte n'a été créé, aucune connexion faite, aucun formulaire rempli. Le paquet public de
l'extension a été téléchargé depuis le serveur de mises à jour de Google ; seul son `manifest.json` a
été lu, et rien n'a été exécuté. Les chiffres d'utilisateurs, de ventes et de notes publiés par Redrip
sont **ses propres affirmations**. Les seuls chiffres tiers relevés sont ceux du Chrome Web Store (CWS),
de Trustpilot et d'AlternativeTo, lus le 09/10/2026.

---

## 1. Fiche d'identité

| Élément | Constat | Source (lue le 2026-10-09) |
|---|---|---|
| Nom sur le CWS | « Vinted Assistant - Reposte vos annonces en un clic sur Vinted et Leboncoin » (éditeur : redrip.app) | https://chromewebstore.google.com/detail/redrip/ljefajifldflgjhipnfabbhjbbhnhoho |
| Utilisateurs CWS | **1 000 utilisateurs** | idem |
| Note CWS | **4,4 / 5 (26 avis)** | idem |
| Version / mise à jour | 11.999.173, « Dernière mise à jour : 8 octobre 2026 », 928 KiB, langue de la fiche : « français » | idem |
| Statut de l'éditeur sur le CWS | « Non-professionnel — Ce développeur ne s'est pas identifié comme professionnel » ; « Propose des achats via l'application » | idem |
| Auteur | « Antoine, un développeur indépendant » | https://www.redrip.app/ (FAQ) |
| Origine affichée | « 🇫🇷 Made in France », « — Since 2021 » ; CGU « régies par le droit français » | https://www.redrip.app/ ; https://www.redrip.app/cgu.html |
| Affiliation | « Non affilié à Vinted UAB ni à Leboncoin. » | https://www.redrip.app/ |

---

## 2. Les points demandés

### 2.1 Plateformes supportées — **Vinted et Leboncoin, rien d'autre**

- Accueil : « Gagnez du temps et vendez plus sur Vinted et Leboncoin. » — https://www.redrip.app/
- Leur propre comparatif le dit en toutes lettres : « Redrip couvre Vinted et Leboncoin, dans les deux
  sens, mais pas eBay ni Depop. » — https://www.redrip.app/blog/vinted-bot-meilleurs-outils-2026/
- **Preuve technique** (manifest.json de la version 11.999.173, paquet public CWS) : les
  `host_permissions` ne comptent que des domaines Vinted, `www.leboncoin.fr`, `api.leboncoin.fr`,
  `img.leboncoin.fr`, redrip.app, un bucket S3 d'étiquettes Vinted et un projet Supabase. Il n'y a
  **aucun domaine eBay, Beebs ni Depop**.

| Plateforme | Supportée ? | Détail |
|---|---|---|
| **Vinted** | Oui | La fiche CWS annonce 25 pays : « France, Belgique, Luxembourg, Suisse, Italie, Espagne, Portugal, Pays-Bas, Allemagne, Autriche, Pologne, République Tchèque, Slovaquie, Lituanie, Hongrie, Roumanie, Suède, Danemark, Finlande, Grèce, Croatie, Irlande, Royaume-Uni, USA, Australie ». Le manifeste couvre 26 domaines Vinted (.fr .com .co.uk .de .es .it .nl .be .pl .cz .sk .at .lu .pt .lt .hu .ro .se .dk .fi .gr .hr .ie .ee .lv .si). Il ne contient ni `vinted.ch` ni domaine australien. La page d'installation parle de « 23 domaines pays ». |
| **Leboncoin** | Oui, **France seulement** | « Publication Leboncoin : France. » (fiche CWS) ; « La publication Leboncoin concerne la France. Côté Vinted, Redrip fonctionne dans tous les pays Vinted. » (https://www.redrip.app/blog/publier-vinted-sur-leboncoin/) |
| **Beebs** | Non | Aucune mention sur le site ni sur le CWS, aucun domaine dans le manifeste. |
| **eBay FR** | Non | « mais pas eBay ni Depop » (comparatif cité plus haut), aucun domaine dans le manifeste. |
| Depop | Non | idem |

Les pages en anglais, allemand et italien ne parlent que de Vinted (0 occurrence de « Leboncoin » dans
https://www.redrip.app/en/, /de/ et /it/). Titre EN : « Redrip — Free Vinted Chrome extension
(relist + AI) ».

### 2.2 Application mobile iOS / Android — **non**

- Aucune application « Redrip » pour Vinted sur l'App Store FR : la recherche « redrip » ne remonte que
  4 applications d'un éditeur sans rapport, « Redrip Solutions LTD » (lecteur multimédia, jeu,
  utilitaires), et « redrip vinted » ne donne rien (API iTunes Search, country=fr, 2026-10-09).
- Rien sur Google Play pour « redrip » ni « redrip vinted » (https://play.google.com/store/search?q=redrip&c=apps&hl=fr&gl=FR).
- Leur page mobile le confirme : « Redrip est une extension Chrome — elle ne fonctionne pas sur Safari
  iOS ou Chrome Mobile par défaut. Mais 2 navigateurs gratuits ouvrent la porte aux extensions sur
  téléphone : Orion sur iPhone et Yandex sur Android. » — https://www.redrip.app/install-mobile.html
- « Pas de bot mobile à ce jour — Vinted ne permet pas l'installation d'extensions sur les apps
  mobiles. » — https://www.redrip.app/vinted-bot/

### 2.3 Extension navigateur — **oui, c'est le produit**

- « Redrip est une extension Chrome tout-en-un pour les vendeurs Vinted. » — https://www.redrip.app/
- Navigateurs : « Chrome, Brave, Edge, Arc — tous les navigateurs Chromium. Firefox arrive. » — https://www.redrip.app/
- Un tableau de bord existe dans l'extension (« overlay Redrip », onglet « Dressing ») et un compte web
  sur redrip.app sert au plan et aux quotas : « Crée ensuite un compte sur redrip.app/register […] ça
  synchronise ton plan et ton quota mensuel avec l'extension. » — https://www.redrip.app/install.html
  (`app.redrip.app`, visible sur la maquette de l'accueil, ne répond pas : code HTTP 000, curl, 2026-10-09).

### 2.4 D'où l'on part — **l'ordinateur, depuis le dressing Vinted (ou « Mes annonces » Leboncoin)**

- On part d'une annonce **déjà en ligne** : « Vous sélectionnez les articles dans votre dressing Vinted,
  vous cliquez, et l'extension crée les annonces Leboncoin pour vous. » —
  https://www.redrip.app/blog/publier-vinted-sur-leboncoin/
- Le sens inverse existe : « Ouvrez « Mes annonces » sur Leboncoin, puis l'overlay Redrip. Sélectionnez
  les annonces à transférer vers Vinted. » — https://www.redrip.app/blog/transferer-leboncoin-vers-vinted/
- Le téléphone n'est possible qu'à travers un navigateur tiers (Orion, Yandex). Le site recommande
  l'ordinateur : « l'usage sur ordinateur reste recommandé pour les vendeurs qui font beaucoup de volume »
  — https://www.redrip.app/install-mobile.html
- Rien ne montre qu'on puisse créer un article à partir de zéro (photo → annonce) dans Redrip.

### 2.5 Identification par photo / IA — **pas d'identification par photo propre ; IA de texte**

- Aucune identification d'objet par photo faite par Redrip. Le seul usage de la photo passe par Vinted :
  « Vinted détecte la catégorie, la marque, la couleur et la taille à partir de la photo — Redrip les
  applique automatiquement, exactement comme le formulaire de dépôt Vinted. » (fiche CWS)
- Un guide plus ancien dit le contraire pour Leboncoin → Vinted : « À compléter sur Vinted : marque,
  taille et état » (https://www.redrip.app/blog/transferer-leboncoin-vers-vinted/, mis à jour le
  15/08/2026). La fiche CWS, plus récente, annonce « Rien à saisir ». On ne peut pas trancher sans
  compte.
- L'IA porte sur le texte : « 10 descriptions IA/mois » (Gratuit) jusqu'à « Descriptions IA
  illimitées » (Professional) ; « Republication IA » et « Réponses IA illimitées » en Professional
  seulement ; « Répondez automatiquement aux acheteurs Vinted dans 9 langues » — https://www.redrip.app/
- Rien sur une IA de prix. Il existe en revanche « Update prix en bulk » (CWS) et « la baisse de prix
  automatique » (https://www.redrip.app/blog/transferer-leboncoin-vers-vinted/).
- Le « Générateur d'annonce Vinted » public se remplit avec des champs texte (type, marque, taille,
  état…), sans photo — https://www.redrip.app/outils/generateur-annonce-vinted/
- Le prestataire d'IA change selon la page : « Mistral AI, société française, sur des serveurs situés
  dans l'Union européenne » (https://www.redrip.app/privacy.html, mise à jour du 1er juillet 2026) ;
  « OpenAI pour l'IA » (https://www.redrip.app/install.html) ; « via ta clé OpenAI »
  (https://www.redrip.app/vinted-bot/).

### 2.6 Import / synchronisation du stock existant — **lecture du dressing, en local ; pas de stock serveur**

- L'extension lit le dressing Vinted et les annonces Leboncoin existantes. Elle n'importe pas ces
  annonces dans un stock hébergé : « Tes articles Vinted (titres, prix, photos, statuts) — pour les
  afficher dans le dashboard. Tout ça est stocké via l'API chrome.storage.local de Chrome, sur ton disque
  dur. Si tu désinstalles l'extension, tout disparaît. » — https://www.redrip.app/privacy.html
- Pour Leboncoin, l'extension sert à « lister tes annonces existantes » ; « le lien entre un article
  Vinted et une annonce Leboncoin est conservé localement (chrome.storage) » — https://www.redrip.app/privacy.html
- Entre appareils, seul le compte est commun : « Ton plan, ton historique de republications et ton
  quota sont gérés côté serveur […]. En revanche, l'historique local de tâches (logs Pilote auto) est par
  navigateur. » — https://www.redrip.app/install-mobile.html
- Un marqueur évite les doublons au transfert : « le marqueur « déjà sur Leboncoin » dans le dressing
  Vinted » — https://www.redrip.app/blog/eviter-double-vente-vinted-leboncoin/

### 2.7 Retrait automatique des copies après une vente (auto-delist) — **oui, Vinted ↔ Leboncoin**

- « Synchronisation des ventes Vinted ↔ Leboncoin. Vendu sur Vinted ? L'annonce Leboncoin est
  supprimée. Annonce Leboncoin partie ? L'article Vinted est masqué. Automatique, en arrière-plan. »
  (fiche CWS)
- Côté Vinted, l'article est masqué, pas supprimé : « Côté Vinted, Redrip masque l'article plutôt que de
  le supprimer : si c'était une fausse alerte, vous le réaffichez en un clic. » —
  https://www.redrip.app/blog/eviter-double-vente-vinted-leboncoin/
- Délai : « Elle se fait en arrière-plan, au plus tard lors du prochain passage sur Leboncoin ou via une
  vérification automatique périodique. » ; « Pour agir côté Leboncoin, l'extension a besoin d'un passage
  sur leboncoin.fr ; Redrip peut l'ouvrir brièvement en arrière-plan pour réconcilier. » (même page)
- Garde-fou : « les annonces sont sauvegardées avant suppression » (même page).
- Le lien entre les deux annonces naît du transfert : « Le lien entre les deux annonces est créé au
  moment du transfert » (même page). Rien n'indique qu'une annonce publiée hors de Redrip soit rattachée.

### 2.8 Republication / relist automatique — **oui, c'est le cœur du produit**

- « Republication automatique — Sélectionnez vos articles et republiez-les en lot sur Vinted et
  Leboncoin. » — https://www.redrip.app/
- « Mode auto 24/7 — Republication programmée toutes les X minutes des annonces Vinted. Fermez l'onglet,
  Redrip continue à travailler en arrière-plan. » ; « Republier les annonces Leboncoin en lot » (fiche CWS)
- Quotas : Gratuit « 50 republications » (« 50 republications/mois » sur
  https://www.redrip.app/install-mobile.html), Starter 1 000, Advanced 3 000, Professional
  « Republications illimitées » — https://www.redrip.app/
- Côté Leboncoin : mode brouillon et « publication programmée » (heure de départ, délai entre deux
  annonces) — https://www.redrip.app/blog/publier-vinted-sur-leboncoin/

### 2.9 Stock, ventes, statistiques — **tableau de bord Vinted ; pas de comptabilité ni de marge**

- « Dashboard centralisé — Articles, conversations, ventes, achats, étiquettes, statistiques : tout au
  même endroit. » (fiche CWS)
- La maquette de l'accueil montre « Republiés (7j) », « Vues », « Ventes » et un onglet « Insights /
  Statistiques » — https://www.redrip.app/
- Autres outils : « Téléchargement étiquettes en masse — Mergez vos étiquettes d'expédition en un seul
  PDF » (CWS) ; offres automatiques aux favoris ; « Négociations automatiques » ; follow/unfollow en masse ;
  « Communauté : échange de vues et de likes » ; « Comptes Vinted illimités » dès le plan gratuit.
- Aucune page lue ne parle de prix d'achat, de marge, de bénéfice ni d'export comptable (recherche de
  « marge », « prix d'achat », « inventaire », « stock », « export » dans l'accueil, la fiche CWS, les
  pages d'installation, de confidentialité et deux guides).

### 2.10 Prix — **en euros, gratuit à vie puis 3 paliers ; pas d'essai des paliers payants**

| Plan | Mensuel | Annuel (« 2 mois offerts ») | Ce qui change |
|---|---|---|---|
| Gratuit | 0 € « Pour toujours » | — | 50 republications, 10 publications Leboncoin/mois, 10 descriptions IA/mois, 10 messages aux favoris/jour |
| Starter | **5,99 €/mois** | 4,99 €/mois, « Facturé 59,90 € par an » | 1 000 republications, 100 publications Leboncoin/mois |
| Advanced (« Populaire ») | **11,99 €/mois** | 9,99 €/mois, « Facturé 119,90 € par an » | 3 000 republications, 500 publications Leboncoin/mois |
| Professional | **19,99 €/mois** | 16,66 €/mois, « Facturé 199,90 € par an » | tout illimité, + Republication IA et Réponses IA illimitées |

- Source : https://www.redrip.app/ (grille et code HTML de la bascule mensuel/annuel). Paiement par liens
  Stripe. Mentions : « Prix figé à vie », « Sans engagement · annulable ».
- Phrase de la grille : « Toutes les fonctionnalités incluses dans chaque plan. Seule la limite de
  republications change. » Pourtant, la même grille réserve « Republication IA » et « Réponses IA
  illimitées » au plan Professional.
- Essai : le plan gratuit sert d'essai (bouton « Essayer »). La description courte du CWS dit « Test
  Gratuit ». Aucun essai d'un palier payant n'est annoncé.
- Prix contradictoires ailleurs sur le site : « des plans payants existent à partir de 4,99€/mois (1000
  republications) » (https://www.redrip.app/install.html), qui correspond au prix annuel ramené au mois ;
  « Redrip est 100% gratuit. Aucun abonnement, aucun freemium piégé. Pour toujours. »
  (https://www.redrip.app/vinted-bot/) ; « L'accès aux fonctionnalités proposées à ce jour est libre. »
  (https://www.redrip.app/cgu.html, CGU du 1er juillet 2026).
- Programme d'affiliation : « 30% sur les 3 premiers mois, puis 20% à vie », cookie de 60 jours —
  https://www.redrip.app/affiliate

### 2.11 Pays et langues

- Site en 8 langues : fr, en, es, de, it, nl, pl, pt (balises `hreflang` de l'accueil ; sitemap de 523
  URL, dernier `lastmod` le 2026-10-02 — https://www.redrip.app/sitemap.xml).
- Fiche CWS en « français » seulement.
- Réponses IA : « français, anglais, italien, espagnol, néerlandais, polonais, allemand, portugais,
  roumain » (fiche CWS).
- Marché : Vinted dans les pays listés au § 2.1 ; Leboncoin en France.

### 2.12 Notes publiques

| Source | Note | Nombre d'avis | Date / remarque |
|---|---|---|---|
| Chrome Web Store | **4,4 / 5** | **26 avis** | Lu le 2026-10-09 (https://chromewebstore.google.com/detail/redrip/ljefajifldflgjhipnfabbhjbbhnhoho/reviews?hl=fr). Les 10 avis les plus récents, du 1er août au 5 octobre 2026, notent 5, 1, 5, 5, 5, 2, 5, 5, 1 et 5 étoiles. Avis négatifs : « je déconseille surtout le boost des favories marche pas » (1 oct. 2026, 1★) ; « cramé par Vinted à la premiere utilisation » (14 sept. 2026, 2★) ; « Décevant » (13 août 2026, 1★). Le développeur répond à chacun. |
| Trustpilot | 0,0 | **0 avis** | Page « Redrip Avis », marquée comme revendiquée (juillet 2026) : « Cette entreprise n'a pas encore reçu d'avis » (https://fr.trustpilot.com/review/redrip.app, lue via WebFetch ; curl renvoie 403). |
| App Store / Google Play | — | — | Pas d'application (§ 2.2). |
| AlternativeTo | — | 1 like | « Redrip is a Chrome extension that automates selling on Vinted. », « Subscription ranging between $5 and $20 per month », ajouté le 26/06/2026, mis à jour le 11/07/2026 (https://alternativeto.net/software/redrip/about/). |
| Product Hunt (via hunted.space) | — | 3 votes, 1 commentaire | « A Chrome extension for Vinted, designed with restraint » ; le texte de lancement dit « Free Chrome extension » et « via your own OpenAI key » (https://hunted.space/product/redrip). |

Ce que le site affiche sur sa note : « 4,5/5 sur le Chrome Web Store » et « 5 — Note moyenne /5 »
(https://www.redrip.app/). Son balisage JSON-LD déclare `AggregateRating` 4.4 sur `ratingCount` 15.
Le CWS affiche 4,4 sur 26 avis le même jour.

---

## 3. Écarts entre leurs propres pages (faits, relevés le 2026-10-09)

Ces écarts ne disent rien de la qualité du produit. Ils montrent seulement ce qu'un lecteur, ou un
moteur de réponse, peut citer de travers.

| Sujet | Page A | Page B | Tiers |
|---|---|---|---|
| Nombre d'utilisateurs | « Plus de 2 000 vendeurs l'utilisent quotidiennement » (accueil, FAQ) | « 200+ vendeurs Vinted » ; « Plus de 200 utilisateurs l'utilisent quotidiennement » (install.html) | CWS : 1 000 utilisateurs |
| Note | « 4,5/5 sur le Chrome Web Store » ; « 5 Note moyenne /5 » (accueil) | JSON-LD 4.4 sur 15 avis | CWS : 4,4 sur 26 avis |
| Prix | 5,99 / 11,99 / 19,99 €/mois (accueil) | « à partir de 4,99€/mois » (install.html) ; « 100% gratuit. Aucun abonnement » (vinted-bot/) | AlternativeTo : 5 à 20 $/mois |
| Prestataire d'IA | Mistral AI, UE (privacy.html) | OpenAI (install.html) ; « ta clé OpenAI » (vinted-bot/) | Product Hunt : « your own OpenAI key » |
| IA dans le plan gratuit | « 10 descriptions IA/mois » en Gratuit (accueil) | IA « réservées au forfait Pro » (privacy.html) | — |
| Ancienneté | « Since 2021 » (accueil) | « for over 2 years » (en/) ; « depuis plus d'un an » (FAQ du CWS) | Ajouté sur AlternativeTo le 26/06/2026 |
| Domaines Vinted | « 23 domaines pays » (install.html) | 25 pays (fiche CWS) | Manifeste : 26 domaines Vinted |
| Leboncoin → Vinted | « À compléter sur Vinted : marque, taille et état » (blog, mis à jour le 15/08) | « Rien à saisir » (fiche CWS) | — |

---

## 4. Ce qu'ils font bien (honnêtement)

1. **Le prix d'entrée** : un plan gratuit sans limite de durée, puis 5,99 € (4,99 € à l'année). Le plan
   le plus cher, à 19,99 €, a tout en illimité. Les quotas sont lisibles.
2. **Une automatisation Vinted très complète** : republication en lot et en « mode auto 24/7 » onglet
   fermé, offres et messages aux favoris, négociations automatiques, réponses IA en 9 langues,
   étiquettes fusionnées en un PDF, prix modifiables en masse, multi-comptes Vinted dès le gratuit.
3. **Un transfert Vinted ↔ Leboncoin dans les deux sens, en lot**. Il a un mode brouillon Leboncoin
   (pour ne pas payer une modification), une publication programmée et le marqueur « déjà sur
   Leboncoin ». Le numéro de téléphone est repris et masqué.
4. **Un auto-delist automatique et prudent** : la vente Vinted supprime l'annonce Leboncoin sans
   confirmation. Dans l'autre sens, l'article Vinted est **masqué (réversible)**, pas supprimé. Les
   annonces sont sauvegardées avant suppression.
5. **26 domaines Vinted** couverts (manifeste) : Redrip vise d'emblée toute l'Europe de Vinted.
6. **La confidentialité comme argument** : aucun mot de passe, les données restent dans le navigateur
   (`chrome.storage.local`), le backend Supabase et l'IA Mistral sont dans l'UE. C'est écrit en clair.
7. **Un développeur visible et réactif** : il répond à chaque avis du CWS dans la journée, y compris aux
   négatifs. La mise à jour date de la veille (08/10/2026). Le produit est versionné et le site publie
   un historique (« version 7 (août 2026) », « corrigé depuis la version 7.2 »).
8. **Un dispositif SEO / GEO solide pour sa taille** : sitemap de 523 URL, site en 8 langues avec
   `hreflang`, centre d'aide Vinted (Vinted Go, frais, impôts, shadowban), outils gratuits (calculateur de
   frais, générateur d'annonce, déclaration d'impôts), comparatifs « X vs Redrip » (Dotb, Clemz, Cassou),
   guides Leboncoin. Le JSON-LD couvre `SoftwareApplication`, `FAQPage`, `HowTo` et `AggregateOffer`.
   Le `robots.txt` autorise explicitement GPTBot, ClaudeBot, PerplexityBot et Google-Extended.
   Le programme d'affiliation paie 30 % puis 20 % à vie.

---

## 5. Écarts factuels avec FillSell (sans jugement)

Repère FillSell : https://fillsell.app, d'après `src/pages/LandingPage.jsx` du dépôt (worktree
seo-crosslisting). Fiche CWS FillSell : 360 utilisateurs, chiffre relevé dans
`docs/seo/concurrents/00-decouverte.md`.

| Point | Redrip (09/10/2026) | FillSell (pages publiques) |
|---|---|---|
| Plateformes | Vinted et Leboncoin (FR) seulement. « pas eBay ni Depop ». Pas de Beebs. | Vinted, Leboncoin, eBay, Beebs |
| Application mobile | Aucune. L'extension tourne sur mobile via Orion (iOS) ou Yandex (Android). | Apps iOS et Android (« Sur l'App Store et Google Play ») ; « Ton téléphone pilote. Ton ordinateur exécute. » |
| Point de départ | Une annonce déjà en ligne sur Vinted (ou Leboncoin) | Une photo prise au téléphone, ou le stock |
| Photo / IA | Pas d'identification par photo propre ; IA de texte (descriptions, réponses, republication IA) | « Tu photographies. L'IA écrit l'annonce. » (titre, description, catégorie, marque, taille), plus une retouche photo IA |
| Stock | Données locales au navigateur (`chrome.storage.local`), effacées à la désinstallation ; aucun stock serveur | Stock hébergé ; les annonces existantes des 4 plateformes sont relues et rattachées (« un article, une fiche ») |
| Comptabilité | Aucune mention de prix d'achat ni de marge | « ce que tu as acheté, ce que tu as vendu, ce qu'il te reste et ce que ça t'a rapporté » ; marge mise à jour à chaque vente |
| Auto-delist | Automatique, sans confirmation, sur la paire Vinted ↔ Leboncoin ; masquage réversible côté Vinted | Sur les 4 plateformes ; la page publique dit « Tu confirmes, il retire les annonces des autres plateformes » |
| Langue de la fiche CWS | Français seulement | non relevé ici |

Points où Redrip va plus loin que la promesse publique de FillSell : les automatismes propres à Vinted
(offres et messages aux favoris, négociations automatiques, réponses IA en 9 langues, échange de vues,
étiquettes en lot), un plan gratuit à vie, un site en 8 langues et un retrait sans confirmation.

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- La réalité et la fiabilité de l'auto-delist (délai réel, cas des ventes Leboncoin conclues hors
  plateforme, articles publiés hors de Redrip).
- Ce qui reste à saisir pour Leboncoin → Vinted : « Rien à saisir » (CWS) ou « marque, taille et état »
  à compléter (blog).
- Les vrais quotas appliqués (les 50 republications du plan gratuit sont-elles mensuelles ?) et le
  périmètre IA du plan gratuit.
- Le prestataire d'IA réellement utilisé (Mistral ou OpenAI) et le besoin éventuel d'une clé OpenAI
  personnelle.
- Le contenu exact des « statistiques » du tableau de bord (la maquette de l'accueil est une image de
  démonstration).
- La couverture réelle de la Suisse et de l'Australie : aucun domaine Vinted correspondant dans le
  manifeste.
- Les chiffres qu'ils publient (« 850k articles republiés », « 3× Plus de ventes », « 15h
  Économisées /sem », « 2 000 vendeurs ») : ce sont leurs affirmations, sans source.
- Le comportement du « Pilote auto » sur mobile (Orion / Yandex).

---

## 7. Sources (toutes lues le 2026-10-09)

- https://www.redrip.app/ — accueil, grille de prix, FAQ, JSON-LD
- https://www.redrip.app/install.html — installation, permissions, prix « à partir de 4,99 € »
- https://www.redrip.app/install-mobile.html — mobile via Orion / Yandex
- https://www.redrip.app/vinted-bot/ — « 100% gratuit », « ta clé OpenAI »
- https://www.redrip.app/en/ ; https://www.redrip.app/de/ ; https://www.redrip.app/it/ — versions étrangères (Vinted seul)
- https://www.redrip.app/aide/ — centre d'aide
- https://www.redrip.app/blog/publier-vinted-sur-leboncoin/ — transfert Vinted → Leboncoin, pays
- https://www.redrip.app/blog/transferer-leboncoin-vers-vinted/ — transfert Leboncoin → Vinted
- https://www.redrip.app/blog/eviter-double-vente-vinted-leboncoin/ — synchronisation des ventes
- https://www.redrip.app/blog/vinted-bot-meilleurs-outils-2026/ — « pas eBay ni Depop »
- https://www.redrip.app/outils/generateur-annonce-vinted/ — générateur à champs texte
- https://www.redrip.app/privacy.html — stockage local, Mistral AI, Supabase UE, Stripe
- https://www.redrip.app/cgu.html — CGU du 1er juillet 2026
- https://www.redrip.app/affiliate — affiliation 30 % / 20 %
- https://www.redrip.app/robots.txt ; https://www.redrip.app/sitemap.xml — robots et sitemap (523 URL)
- https://chromewebstore.google.com/detail/redrip/ljefajifldflgjhipnfabbhjbbhnhoho — fiche CWS (1 000 utilisateurs, 4,4 sur 26 avis, v11.999.173, MAJ 08/10/2026, pays)
- https://chromewebstore.google.com/detail/redrip/ljefajifldflgjhipnfabbhjbbhnhoho/reviews?hl=fr — avis
- Paquet public CWS (clients2.google.com, id ljefajifldflgjhipnfabbhjbbhnhoho) — `manifest.json` v11.999.173 : permissions et domaines
- https://itunes.apple.com/search?term=redrip&country=fr&entity=software — App Store FR : aucune app Redrip pour Vinted
- https://play.google.com/store/search?q=redrip&c=apps&hl=fr&gl=FR — Google Play : rien
- https://fr.trustpilot.com/review/redrip.app — 0 avis
- https://alternativeto.net/software/redrip/about/ — fiche AlternativeTo
- https://hunted.space/product/redrip — lancement Product Hunt
