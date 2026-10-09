# Relistly (relistly.io) — vérification sur pages réelles

Observation : **2026-10-09**. Lecture du web seule (curl, WebFetch, WebSearch). Aucun compte créé,
aucune connexion, aucun formulaire rempli. La page de connexion publique `app.relistly.io/login` et
son manifeste ont seulement été lus. Toutes les citations sont en anglais (sauf la page française),
recopiées telles quelles et lues le 09/10/2026. Les chiffres que Relistly publie sur lui-même sont
**ses propres affirmations** : ils n'ont pas été vérifiés. Seuls les chiffres du Chrome Web Store, de
Trustpilot et des recherches App Store / Google Play viennent de tiers.

> **Correction de la découverte** (`00-decouverte.md`, ligne 45) : ce n'est pas « 24 pays + UK, CH,
> NO ». La page Couverture compte **24 pays au total, Royaume-Uni, Suisse et Norvège compris**
> (15 de la zone euro, 6 de l'UE hors euro et 3 hors UE). La formule « 24 + UK, CH, NO » vient de la
> FAQ de l'accueil, qui contredit la page Couverture (voir § 4).

---

## 1. Identité

| Point | Constat | Source |
|---|---|---|
| Éditeur | « Paid In Full Dev. (trading as Relistly) », forme « Eenmanszaak (sole proprietorship) », KvK 42160705, Herengracht 582, 1017 CG Amsterdam ; « VAT ID (btw-id): To be added (not yet issued) » ; page mise à jour le 10/09/2026 | https://relistly.io/imprint |
| Création | `"foundingDate":"2026"` (données structurées de l'accueil) | https://relistly.io/ (source HTML) |
| Hébergement | site chez TransIP (Pays-Bas), application chez Fly.io (région UE) ; Supabase et Stripe cités | https://relistly.io/imprint, https://relistly.io/llms.txt |
| Homonyme | `relistly.com` est un autre produit, sans lien : « cross-post to Facebook Marketplace, Depop and OfferUp ». Relistly.io le signale lui-même sur 3 pages. | https://relistly.com (balise description), https://relistly.io/ai-info, https://relistly.io/support |
| Forme | application web `app.relistly.io` + extension Chrome « Relistly Bridge » | https://relistly.io/download, https://app.relistly.io/login |

---

## 2. Fiche synthétique

| Critère | Relistly (constat du 09/10/2026) |
|---|---|
| Plateformes | « 18 marketplaces » annoncées. **13 en service** : Vinted, Vestiaire Collective, Depop, Grailed, eBay, Etsy, Shopify, Poshmark, Whatnot, Mercari, Facebook Marketplace, StockX, Cardmarket. **2 petites annonces européennes en service** : Marktplaats (NL), 2dehands (BE). **1 partielle** : Vendora (GR/CY/BG), import et retrait seulement, « posting on the roadmap ». **2 « coming soon »** : Leboncoin, Kleinanzeigen. |
| Vinted | oui, « session-based » par l'extension. Pays : zone euro, UE hors euro et Royaume-Uni ; « No Vinted market in Switzerland / Norway » |
| Leboncoin | **non**, « coming soon — on the roadmap, not yet live » ; aucune date : « we are not putting a firm date on it » |
| Beebs | **absent** : le mot n'apparaît sur aucune des 17 pages de relistly.io lues, ni dans `llms.txt`, qui résume toutes les pages du site |
| eBay FR | eBay par l'« official API » ; aucun site eBay national n'est nommé (pas d'eBay.fr explicite) ; un calculateur « eBay EU » existe |
| Appli mobile iOS/Android | **aucune trouvée** : 0 résultat « Relistly » sur l'App Store (FR, NL, GB, US) ni sur Google Play. L'application web est déclarée installable (PWA, `display: standalone`, `orientation: portrait-primary`). |
| Extension | oui, « Relistly Bridge » (Chrome, Edge, Brave). Le site propose surtout un **.zip à charger en mode développeur** (v1.8.51). La fiche CWS est publique : **39 utilisateurs, v1.3.14, mise à jour le 12/08/2026, aucune note**. |
| Point de départ | l'**ordinateur** : l'application web pilote, l'extension d'un navigateur Chromium exécute. Le palier « no PC needed » est annoncé « Coming soon ». |
| Photo / IA | « Draft with AI » : titres, descriptions et suggestions de prix depuis les photos ; 30 / 150 / illimité crédits IA selon le palier ; « market comps » sur Pro |
| Import / synchro du stock | oui : « Import existing listings », import par place de marché ou par CSV |
| Retrait auto après vente | oui, sur tous les paliers, « roughly every 15 minutes » ; « Only touches listings Relistly posted » |
| Republication | « Automation — auto-relist, scheduled posts & send-offers » à partir de Growth (29 €) |
| Stock / ventes / stats | inventaire central ; « Basic sales analytics » (Starter) ; « Full profit analytics — COGS, margin, sell-through » (Growth) ; export CSV/PDF ; « Track all your shipments » (fiche CWS) |
| Prix | Starter 14 €, Growth 29 €, Pro 49 €, Business 89 € (« Coming soon ») ; en annuel 11 / 24 / 41 € ; EUR (£ au Royaume-Uni), TVA en sus ; **essai 14 jours sans carte** ; aucun palier gratuit |
| Pays / langues | 24 pays européens ; 10 devises ; annonces traduites en « 19 European languages » ; site en anglais, plus quelques pages en français et en allemand |
| Notes publiques | **Trustpilot : 2 avis** (5 étoiles chacun, 29/08/2026 et 14/09/2026), TrustScore 3,8 ; **CWS : aucune note** ; aucune fiche App Store ni Google Play |

---

## 3. Détail point par point (citations et URL)

### 3.1 Plateformes supportées

- Accueil : « Post to Vinted, Vestiaire, Depop, Grailed, eBay, Etsy, Shopify, Poshmark, Whatnot,
  Mercari, Facebook, StockX, Cardmarket, Marktplaats and 2dehands — without rebuilding a single
  listing (Leboncoin and Kleinanzeigen coming soon). » — https://relistly.io/
- FAQ des tarifs : « Live today: Vinted, Vestiaire Collective, Depop, Grailed, eBay, Etsy, Poshmark,
  Whatnot, Mercari, Shopify, Facebook Marketplace, StockX, Cardmarket, plus the EU classifieds
  Marktplaats (NL) and 2dehands (BE). Vendora supports import and auto-delist today, with posting on
  the roadmap. Leboncoin and Kleinanzeigen are coming soon. » — https://relistly.io/pricing
- Toutes les plateformes ne sont donc pas automatisées. Le site le dit lui-même : « Almost all. […]
  Vendora supports import and auto-delist but creating a new listing is still manual […] Leboncoin
  and Kleinanzeigen are coming soon » — https://relistly.io/integrations
- Mode de connexion : « Official APIs where available, session-based where not » —
  https://relistly.io/. eBay : « eBay connects through its official API, so posting, updating and
  sale reconciliation run server-side — they keep working while your browser is closed » —
  https://relistly.io/integrations/ebay. Vinted : « Vinted is a session-based connection: some
  actions run through your signed-in browser session » — https://relistly.io/integrations/vinted.
- **Vinted, pays** : « Vinted is wired up across the Eurozone, the non-euro EU markets and the UK. »
  « There is no Vinted market in Switzerland or Norway » — https://relistly.io/coverage. Liste des
  24 pays : 15 de la zone euro (NL, BE, DE, FR, ES, IT, AT, IE, PT, LU, FI, GR, SK, LT, HR), 6 de
  l'UE hors euro (PL, CZ, SE, DK, RO, HU) et 3 hors UE (UK, CH, NO). Ce sont les pays que Relistly
  **affirme** couvrir : la couverture effective de Vinted pays par pays n'a pas été vérifiée.
- **Leboncoin** : « Is Leboncoin supported yet? Not yet — it's coming soon. » ; « We would rather ship
  it properly than list a channel that cannot yet post reliably, so we are not putting a firm date on
  it. » — https://relistly.io/integrations/leboncoin. La page française dit de même : « Leboncoin
  arrive bientôt (en cours de développement) » — https://relistly.io/logiciel-crosslisting-vinted.
- **Beebs** : n'apparaît sur aucune des pages lues (accueil, tarifs, intégrations, Vinted, eBay,
  Leboncoin, couverture, téléchargement, assistance, outils, ai-info, llms.txt, page française,
  guide France, mentions légales, conditions, affiliation ; recherche du mot « beebs » dans le HTML
  brut). Six autres pages (`/why-relistly`, `/european-crosslisting-software`,
  `/compare/relistly-vs-crosslist`, `/guides/best-vinted-crosslisting-app`,
  `/multichannel-listing-management`, `/integrations/depop`) ont répondu 429 (limite de débit) et
  n'ont pas été relues ; leur résumé dans `llms.txt` ne nomme pas Beebs non plus.
- **eBay FR** : aucune mention d'eBay.fr. eBay est « one of 18 Relistly marketplaces, for sellers in
  24 European countries » — https://relistly.io/integrations/ebay.

### 3.2 Application mobile

- Aucune mention d'une application iOS ou Android sur les pages lues. Aucune page de Relistly ne
  pointe vers l'App Store ou Google Play.
- La recherche App Store (`itunes.apple.com/search?term=relistly`, pays FR, NL, GB et US) ne renvoie
  que des applications sans rapport (Re:List, RE-List, RELST…).
  https://itunes.apple.com/search?term=relistly&entity=software&country=fr
- La recherche Google Play (`play.google.com/store/search?q=relistly&c=apps`) ne renvoie aucun
  paquet nommé « relistly ».
- L'application web déclare un manifeste installable : `"display": "standalone"`,
  `"orientation": "portrait-primary"`, raccourcis « Inventory », « Compose a listing » et
  « Analytics » — https://app.relistly.io/manifest.webmanifest. Je n'ai pas pu vérifier, sans compte,
  ce que l'on peut faire réellement depuis un téléphone.
- Les outils gratuits « work on your phone » — https://relistly.io/tools. Cela vaut pour les
  calculateurs, pas pour la publication.

### 3.3 Extension navigateur

- « Install the Relistly Bridge […] Latest build · v 1.8.51 […] Download .zip » ; « Open
  chrome://extensions […] Turn on Developer mode […] Click Load unpacked » ; « Chrome Web Store —
  Coming soon […] We're in the Web Store review queue » — https://relistly.io/download
- La fiche CWS existe pourtant déjà et elle est publique : « Relistly Bridge », « 39 users »,
  « Version 1.3.14 », « Updated August 12, 2026 », « 0 out of 5 — No ratings », « Languages
  English », « Non-trader », « publish it to up to 17 marketplaces » —
  https://chromewebstore.google.com/detail/relistly-bridge/hgijoffcaeecdgpnmngccgknonenabnd
- Navigateurs : « Requires a Chromium-based browser (Chrome, Edge or Brave) » (données structurées,
  https://relistly.io/).

### 3.4 Point de départ (téléphone ou ordinateur)

- Le parcours décrit sur la fiche CWS : « 1. Create a listing in Relistly and choose where to post
  it. 2. Relistly Bridge publishes it through your own signed-in sessions. »
- Le palier qui libère de l'ordinateur n'existe pas encore : « Business — Hands-off resale — runs in
  the cloud […] 24/7 Cloud Autopilot — no PC needed » marqué « Coming soon » —
  https://relistly.io/pricing
- **Conclusion (déduite de leurs propres textes)** : aujourd'hui, on part de l'**ordinateur**
  (application web + extension Chromium) pour les plateformes « session », dont Vinted. eBay tourne
  côté serveur par l'API.

### 3.5 Identification par photo / IA

- « Generate titles, descriptions and pricing suggestions straight from your photos — then edit and
  publish. You keep full control of the final wording. » ; « Titles and descriptions from images —
  Price suggestions from real comps — Tone and length you choose » — https://relistly.io/
- Crédits : Starter « 30 AI listing credits / month », Growth « 150 », Pro « Unlimited AI credits »
  et « Market comps & AI price suggestions » — https://relistly.io/pricing
- Le site ne parle pas de reconnaissance d'objet au sens strict (marque, modèle, catégorie déduits de
  la photo). La qualité réelle n'est pas vérifiable sans compte.

### 3.6 Import / synchronisation du stock existant

- « Import existing listings from your marketplaces » ; « Sign in once per marketplace. Relistly
  pulls every live listing into one inventory. » — https://relistly.io/
- « You can import directly from a connected marketplace or by uploading a CSV. » —
  https://relistly.io/integrations/vinted
- Le site ne dit rien de la façon dont un même article présent sur deux plateformes est rapproché
  lors de l'import (dédoublonnage, fusion).

### 3.7 Retrait automatique des copies après une vente

- « Scheduled sale checks across channels — Removes matching listings automatically — **Only touches
  listings Relistly posted** » — https://relistly.io/
- « When an item sells on another channel, Relistly removes the matching Vinted listing it posted.
  Auto-delisting runs on a regular schedule (about every 15 minutes). » —
  https://relistly.io/integrations/vinted
- Inclus dans tous les paliers : « Auto-delisting — oversell protection » — https://relistly.io/pricing
- Le site ne dit pas sur quelle base deux annonces sont jugées « matching » (identifiant, titre,
  photo).

### 3.8 Republication / relist automatique

- Growth : « Automation — auto-relist, scheduled posts & send-offers » — https://relistly.io/pricing
- Guide : « how to relist across marketplaces with Relistly's delist-and-relist tools » —
  https://relistly.io/llms.txt (entrée « How to Relist on Vinted »)
- La cadence, les garde-fous et le comportement exact sur Vinted ne sont pas vérifiables sans compte.

### 3.9 Stock, ventes, statistiques

- « Net profit after marketplace fees — Best-selling channels and categories — Export to CSV or PDF »
  — https://relistly.io/
- Starter « Basic sales analytics » ; Growth « Full profit analytics — COGS, margin, sell-through » —
  https://relistly.io/pricing
- Fiche CWS : « Track all your shipments » ; « Access to the most complete sales analytics
  dashboard ».

### 3.10 Prix

- « Starter — €14/mo (€11 billed annually) […] Growth — €29/mo (€24 annually, most popular) […]
  Pro — €49/mo (€41 annually) […] Business — €89/mo (coming soon) » — https://relistly.io/pricing
- « Start with a 14-day free trial — no card required. Prices in EUR (£ for the UK); VAT may apply. »
  — https://relistly.io/pricing
- « Early-access pricing. All prices in EUR (£ for the UK), billed per account. » —
  https://relistly.io/
- Aucun palier gratuit permanent. Toutes les formules sont « Unlimited listings » : la facturation ne
  dépend pas du nombre d'annonces.
- Affiliation : « 30% recurring […] for 12 months » ; les filleuls ont « 20% off their first 3
  months » — https://relistly.io/affiliate

### 3.11 Pays et langues

- « 24 European countries — across the Eurozone, the non-euro EU, plus the UK, Switzerland and
  Norway » ; « 10 currencies » ; « 19 European languages » — https://relistly.io/coverage
- Le site est en anglais. On trouve aussi des pages natives en français
  (https://relistly.io/logiciel-crosslisting-vinted, guide « vendre sur Vinted et Vestiaire en même
  temps ») et en allemand (`/vinted-crosslisting-tool`, guide allemand), selon
  https://relistly.io/llms.txt.
- La fiche CWS est en anglais seulement.

### 3.12 Notes publiques

- **Trustpilot** : la page existe, avec **2 avis**, tous deux à 5 étoiles (29/08/2026 et
  14/09/2026), et un TrustScore de 3,8. Relistly a répondu à un avis le 30/08/2026. Le site
  contient un commentaire HTML sur le sujet : « invites reviews (no score shown) until the rating is
  strong enough to display; swap back to the rating TrustBox […] once we're at ~4.8+ ». Lecture
  du 09/10/2026 par WebFetch ; un curl direct a reçu un 403 « Verifying Connection ».
  https://www.trustpilot.com/review/relistly.io
- **Chrome Web Store** : « No ratings », 39 utilisateurs (voir § 3.3).
- **App Store / Google Play** : aucune fiche trouvée.
- **Témoignages du site** : ce sont des exemples fictifs, et le site l'écrit lui-même : « Sample
  testimonials shown as placeholders — replace with real customer quotes before launch. » —
  https://relistly.io/ (texte visible sous les 4 témoignages « Marieke K. », « Lukas S. »,
  « Chloé D. » et « Giulia R. »).

---

## 4. Incohérences relevées sur leurs propres pages (faits, sans jugement)

| Sujet | Version A | Version B |
|---|---|---|
| Nombre de pays | « 24 European countries across the EU/EEA, **plus** the UK, Switzerland and Norway » (FAQ, https://relistly.io/) | 24 pays **dont** UK, CH et NO (https://relistly.io/coverage) |
| Pays de Vinted | « connects Vinted for sellers in 24 European countries » (https://relistly.io/integrations/vinted) | « No Vinted market in Switzerland / Norway », soit 22 pays (https://relistly.io/coverage) |
| Délai du retrait | « It comes down from the rest **in seconds** » (https://relistly.io/) | « **roughly every 15 minutes** » (https://relistly.io/integrations/vinted, /ai-info) |
| Palier à 89 € | « Business — Coming soon » (https://relistly.io/pricing) | données structurées : offre « Unlimited », 89 €, `availability: InStock` (https://relistly.io/, source HTML) |
| Business dans llms.txt | « Business €89/mo » listé sans réserve parmi les formules (« Key facts », https://relistly.io/llms.txt) | « coming soon » (même fichier, section « Core ») |
| Nombre de places de marché | « 18 marketplaces » (site) | « up to 17 marketplaces » (fiche CWS) ; démo « 12 Connected marketplaces » (https://relistly.io/integrations) |
| Diffusion de l'extension | « Chrome Web Store — Coming soon […] review queue » (https://relistly.io/download, /support) | fiche CWS publique, v1.3.14 du 12/08/2026 (le .zip du site est en v1.8.51) |
| Leboncoin dans les guides | « Most US-based tools do not list Leboncoin; Relistly does. » (https://relistly.io/llms.txt, entrée « Crosslisting in France ») | « Leboncoin crosslisting is coming soon — it is on the Relistly roadmap, not yet live » (https://relistly.io/guides/crosslisting-in-france) |
| Conditions | textes de gabarit restés tels quels : « [effective date] » et « [Confirm your refund and withdrawal handling.] » (https://relistly.io/terms) | — |
| Plateforme ODR | « discontinued on 20 July 2025 » (https://relistly.io/imprint) | « The EU Online Dispute Resolution platform is available at ec.europa.eu/consumers/odr » (https://relistly.io/terms) |

---

## 5. Ce qu'ils font bien (honnêtement)

1. **Le travail SEO/GEO est très structuré**, et c'est le point qui compte le plus pour notre chantier :
   - un fichier `llms.txt` de 43 Ko, avec des « Key facts to quote », une « routing map » (quelle page
     cite-t-on pour quelle question), la liste de toutes les pages et une section de
     désambiguïsation (https://relistly.io/llms.txt) ;
   - une page `/ai-info` « for AI assistants & answer engines », qui contient des définitions
     citables, un tableau comparatif daté, des « Common misconceptions — corrected » et des
     consignes aux assistants (https://relistly.io/ai-info) ;
   - des données structurées complètes sur l'accueil : Organization (avec KvK), WebSite, FAQPage,
     SoftwareApplication avec AggregateOffer ;
   - un commentaire « WebMCP: expose Relistly's tools (fee calc, marketplace comparison, start
     trial) to in-browser AI agents » ;
   - un maillage dense : une page par place de marché (`/integrations/<x>`), une page par paire
     (`/integrations/vinted-and-ebay`…), des pages « vs » et « alternative » (`/compare/*`), des
     guides par pays (Vinted France, Allemagne, Italie, Pays-Bas, Pologne, Espagne, Royaume-Uni)
     et des guides « compte Vinted banni » par pays ;
   - des faits datés partout (« Verified 2 September 2026 »), et une réponse « Yes — Relistly
     supports Vinted » placée en tête de chaque page d'intégration, au format que reprennent les
     moteurs de réponse ;
   - 12 outils gratuits (calculateurs de frais Vinted, Depop, eBay UE, Vestiaire et StockX,
     convertisseur de pointures, générateur de titres, traducteur), qui servent d'aimants à
     requêtes (https://relistly.io/tools).
2. **Ils sont transparents sur ce qui n'est pas prêt** : Leboncoin et Kleinanzeigen sont « coming
   soon », sans date, et l'explication est assumée. Vendora est déclaré « import/delist »
   seulement. La page Leboncoin dit clairement « Not yet ».
3. **Large couverture internationale** : 13 places de marché en service, dont Vestiaire Collective,
   Grailed, StockX, Cardmarket et Marktplaats/2dehands, et 10 devises.
4. **Offre simple** : annonces illimitées à chaque palier, retrait automatique inclus partout, essai
   de 14 jours sans carte, prix bas en entrée (14 €, ou 11 € en annuel).
5. **Discours de sécurité clair** : pas de mot de passe demandé, cadence humaine, plafonds
   quotidiens, données hébergées dans l'UE (https://relistly.io/pricing, FAQ « Is it safe »).
6. **eBay par l'API officielle**, côté serveur, qui fonctionne navigateur fermé
   (https://relistly.io/integrations/ebay).
7. **Programme d'affiliation généreux** : 30 % récurrents pendant 12 mois, ouvert même aux comptes
   gratuits (https://relistly.io/affiliate).

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- La qualité réelle du « Draft with AI » (titre, description, prix) et la reconnaissance de l'objet
  sur photo.
- La façon dont l'import rapproche un même article présent sur plusieurs plateformes (doublons,
  fusion).
- La règle de « matching » du retrait automatique, sa fréquence réelle (secondes ou 15 min) et son
  comportement sur les annonces importées, non publiées par Relistly. Le site dit « Only touches
  listings Relistly posted ».
- Le fonctionnement réel de l'auto-relist sur Vinted (suppression puis republication, cadence,
  limites).
- Ce que l'application web permet depuis un téléphone (PWA déclarée, mais pas d'extension sur
  mobile).
- Le nombre réel de clients. Le seul chiffre tiers est 39 utilisateurs de l'extension sur le CWS,
  alors que l'installation principale passe par un .zip, que le CWS ne compte pas.
- Les pays où l'intégration Vinted fonctionne vraiment, et le fonctionnement d'eBay.fr en
  particulier.
- La durée réelle de l'essai et le moment où le prélèvement commence : le site dit « no card
  required », mais les conditions décrivent un prélèvement à la fin de l'essai « payment method on
  file ».

---

## 7. Écarts factuels avec FillSell (faits seulement)

Faits FillSell repris du contexte du chantier et de `00-decouverte.md` (fiche CWS FillSell :
360 utilisateurs, mise à jour du 08/10/2026).

| Point | Relistly (09/10/2026) | FillSell |
|---|---|---|
| Leboncoin | « coming soon », sans date | en service |
| Beebs | absent | en service |
| Appli mobile | aucune sur les stores ; PWA déclarée | applications iOS et Android ; le téléphone pilote |
| Point de départ | ordinateur (application web + extension Chromium) | téléphone (l'extension exécute sur l'ordinateur) |
| Extension sur le CWS | 39 utilisateurs, v1.3.14 (12/08/2026), aucune note ; diffusion principale en .zip « Load unpacked » | 360 utilisateurs, mise à jour du 08/10/2026 |
| Retrait automatique | « Only touches listings Relistly posted » | dans les règles internes, les copies liées par une preuve (dépôt FillSell, identifiant, import, geste de la personne) sont retirées, y compris les annonces importées |
| Plateformes hors France | 13 en service (Vestiaire, Depop, Grailed, Etsy, StockX, Marktplaats…) | Vinted, Leboncoin, eBay, Beebs (Depop en bêta fermée, non annoncée) |
| Avis publics | 2 sur Trustpilot ; témoignages du site marqués « placeholders » | à mesurer par le même procédé (hors périmètre de ce rapport) |

---

## 8. Points utiles au chantier SEO/GEO de FillSell

- **Une affirmation reprise par les assistants est fausse vis-à-vis de FillSell.** Relistly écrit,
  sur des pages destinées aux IA, que personne d'autre ne couvre Leboncoin :
  - « Relistly is the only mainstream crosslister that reaches any EU classifieds at all — no
    competitor covers Leboncoin either. » (https://relistly.io/integrations/leboncoin) ;
  - « No US-based crosslister […] reaches any of them » (https://relistly.io/llms.txt).

  Leurs tableaux comparatifs ne citent que des outils américains (Crosslist, Vendoo, List Perfectly,
  Voolist, Nifty, Flyp). Aucun outil français n'y figure : ni FillSell ni les autres outils
  français. Une page FillSell factuelle et datée (« Vinted + Leboncoin + eBay + Beebs en service »)
  donnerait aux moteurs de réponse le contre-fait.
- **Mécanismes à étudier pour notre propre site** : `llms.txt` avec « routing map », page `/ai-info`,
  FAQPage, pages « Yes — X supports Vinted », pages par paire de plateformes, faits datés,
  calculateurs gratuits.
- Ils se positionnent aussi en français sur « logiciel de crosslisting Vinted » et « vendre sur
  Vinted et Vestiaire en même temps » : ce sont des requêtes françaises sur lesquelles ils sont
  présents.

---

## 9. Sources (toutes lues le 2026-10-09)

| URL | Ce qui y a été lu |
|---|---|
| https://relistly.io/ | accueil : 18 places de marché, IA, retrait, prix, FAQ, témoignages « placeholders », données structurées, commentaires HTML |
| https://relistly.io/pricing | paliers, prix annuels, essai de 14 jours sans carte, FAQ des tarifs (plateformes en service, sécurité) |
| https://relistly.io/integrations | catalogue, statuts (Vendora partiel, Leboncoin et Kleinanzeigen « coming soon ») |
| https://relistly.io/integrations/vinted | Vinted « session-based », 24 pays, import CSV, retrait toutes les 15 min environ |
| https://relistly.io/integrations/ebay | eBay par l'API officielle, côté serveur |
| https://relistly.io/integrations/leboncoin | « Not yet — it's coming soon », pas de date |
| https://relistly.io/coverage | liste des 24 pays, Vinted absent de CH et NO, 10 devises, 19 langues |
| https://relistly.io/download | Relistly Bridge v1.8.51 en .zip, CWS « coming soon » |
| https://relistly.io/support | installation en mode développeur, adresse support@ |
| https://relistly.io/tools | 12 outils gratuits |
| https://relistly.io/ai-info | page pour les assistants IA, comparatif, désambiguïsation |
| https://relistly.io/llms.txt | faits citables, routing map, liste des pages |
| https://relistly.io/logiciel-crosslisting-vinted | page française, « Leboncoin (bientôt) » |
| https://relistly.io/guides/crosslisting-in-france | guide France, Leboncoin « coming soon » |
| https://relistly.io/imprint | éditeur, eenmanszaak, KvK, TVA non attribuée |
| https://relistly.io/terms | conditions (textes de gabarit restés) |
| https://relistly.io/affiliate | affiliation 30 % pendant 12 mois |
| https://app.relistly.io/manifest.webmanifest | PWA installable, portrait |
| https://chromewebstore.google.com/detail/relistly-bridge/hgijoffcaeecdgpnmngccgknonenabnd | 39 utilisateurs, v1.3.14, 12/08/2026, aucune note, non-trader |
| https://www.trustpilot.com/review/relistly.io | 2 avis 5 étoiles (29/08 et 14/09/2026), TrustScore 3,8 |
| https://itunes.apple.com/search?term=relistly&entity=software&country=fr | aucune application Relistly (même résultat pour NL, GB, US) |
| https://play.google.com/store/search?q=relistly&c=apps&hl=en | aucune application Relistly |
| https://relistly.com | homonyme sans lien (Facebook Marketplace, Depop, OfferUp) |
