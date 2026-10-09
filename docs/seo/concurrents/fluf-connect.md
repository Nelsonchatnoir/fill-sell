# FLUF Connect (fluf.io) — vérification sur pages réelles

Observation : **2026-10-09**. Lecture du web seule (curl, WebFetch, WebSearch). Aucun compte créé,
aucune connexion, aucun formulaire rempli, aucun appel aux points d'API (`/wp-json/`, que leur
`robots.txt` interdit aux robots). Les citations sont recopiées telles quelles (en anglais, sauf
les pages françaises) et ont été lues le 09/10/2026. Les chiffres que FLUF publie sur lui-même sont
**ses propres affirmations** : ils n'ont pas été vérifiés. Seuls les chiffres de l'App Store, de
Google Play, du Chrome Web Store et de Trustpilot viennent de tiers.

Sources principales lues en entier : l'accueil, `/pricing/`, `/integrations/`, `/about/`,
`/reviews/`, `/changelog/`, `/developers/`, `/llms.txt`, `/llms-full.txt` (corpus complet du centre
d'aide : 9 381 lignes, 440 Ko), les plans de site, les pages `/fr/` et les pages Leboncoin.

> **Corrections de la découverte** (`00-decouverte.md`, § FLUF Connect) :
> 1. Les **pages « par trajet » ne sont pas en français.** Les 572 pages `/crosslisting/x-to-y/`
>    (dont `leboncoin-to-vinted` et `vinted-to-leboncoin`) et les 265 pages `/channels/` sont en
>    anglais (`<html lang="en-ZA">`, `hreflang` en-GB seulement). `https://fluf.io/fr/crosslisting/vinted-to-leboncoin/`
>    rend une **404**. Le français se limite à **22 adresses `/fr/`** (15 pages principales
>    traduites et 8 pages éditoriales, dont une en double).
> 2. « Leboncoin : crosslisting et synchro du stock seulement » vient de la page française. Deux autres
>    pages de FLUF disent l'inverse pour la synchro : le tableau « live » de `/integrations/` et le
>    guide anglais Leboncoin (« Leboncoin is not one of them »). Voir § 4.
> 3. Les prix en livres sont bien contradictoires. Le tableau de prix actuel est Starter 9 £, Pro 29 £
>    et Super Seller « Custom ». Les anciens noms (Growth 19 £, Seller 99 £, Super Seller 299 £)
>    restent sur au moins 5 pages. Voir § 3.10 et § 4.

---

## 1. Identité

| Point | Constat | Source |
|---|---|---|
| Éditeur | « FLUF LTD », Colosseum Apartments, 2a Palmers Road, London E2 0SX, Royaume-Uni ; info@fluf.io ; +44 7760 476710 | https://play.google.com/store/apps/details?id=com.fluf.connect.mobile |
| Statut UE | fiche CWS : « This developer has identified itself as a trader per the definition from the European Union » ; DUNS 225936933 | https://chromewebstore.google.com/detail/eoagkkaoehjaeplamhpmgfpeidnejdjh |
| Ancienneté | profil Trustpilot « Claimed profile • Apr 2022 » ; app iOS publiée le 13/09/2025 (`releaseDate` iTunes) | https://www.trustpilot.com/review/fluf.io ; https://itunes.apple.com/lookup?id=6751919515&country=gb |
| Accroche | titre de l'accueil : « FLUF Connect: Seller Operating System across 60+ Channels » | https://fluf.io/ |
| Forme | tableau de bord web (`fluf.io/connect`), apps iOS et Android, extension Chrome « FLUF Utility » (nom sur le CWS : « Crosslist: FLUF Connect Utility & Crosslister »), API REST, webhooks, serveur MCP, nœud n8n, Zapier | https://fluf.io/developers/ ; https://fluf.io/llms.txt |
| Site | WordPress + WooCommerce (chemins `/wp-content/`, `/wp-json/`) ; agrégateur d'annonces d'occasion (`/catalogue`, 8 354 pages d'atterrissage) et annuaire de grossistes à côté du logiciel | https://fluf.io/robots.txt ; https://fluf.io/wp-sitemap.xml |

---

## 2. Fiche synthétique

| Critère | FLUF Connect (constat du 09/10/2026) |
|---|---|
| Plateformes | Selon la page, « 60+ » (site), « 63 » (`llms.txt`, `/about/`), « 50+ » (App Store, Google Play, CWS) ou « 14+ » (guide Leboncoin). Le tableau « généré depuis les données de capacité live » de `/integrations/` compte **131 lignes**, dont **44 avec synchro du stock**. Les marketplaces mode et d'occasion : Vinted, Depop, eBay, Etsy, Vestiaire Collective, Grailed, Poshmark, Mercari, Whatnot, Facebook Marketplace, Wallapop, Subito, Kleinanzeigen, Marktplaats, willhaben, Tise, Yaga, Leboncoin, etc. |
| Vinted | oui, sur **19 domaines** : UK, FR, DE, ES, IT, NL, BE, PL, CZ, LT, LU, PT, AT, SE, DK, FI, SK, HU, RO. Connexion par l'extension Chrome. Synchro, republication et offres annoncées. |
| Leboncoin | crosslisting **oui**. Synchro, retrait et détection des ventes **contradictoires** selon la page. Ni republication, ni gestion des offres, ni synchro des commandes. Connexion par l'extension, plusieurs comptes possibles depuis le 16/09/2026. |
| Beebs | **absent** : le nom n'apparaît ni dans `llms.txt`, ni dans le corpus d'aide complet, ni dans le tableau de 131 lignes, ni dans les plans de site |
| eBay FR | annoncé : « 17+ eBay regional markets including UK, US, Canada, Australia, Germany, France, Italy, Spain » ; connexion OAuth |
| Appli mobile | **oui, iOS et Android** (« FLUF Connect », iOS 15.1+, appli de 52 Mo). Elle s'ouvre sur l'appareil photo. |
| Extension | **oui**, Chrome sur ordinateur seulement. Sur le CWS : 1 000 utilisateurs, 4,5/5 (10 notes), v2.356 du 07/10/2026. |
| Point de départ | **les deux**. Le téléphone sert à photographier et à publier. L'ordinateur, avec Chrome et l'extension, est requis pour connecter Vinted, Leboncoin et Facebook. Les tâches « device-based » attendent que Chrome ou l'app soit ouvert. La republication Vinted tourne aussi depuis l'app depuis le 07/09/2026 (changelog). |
| Photo / IA | oui : marque, catégorie, état, titre, description et suggestion de prix depuis une photo, en « ~7 seconds ». **50 créations/mois sur Starter, 250 sur Pro**, puis 5 crédits (« about £0.10 ») chacune. L'accueil dit pourtant « Unlimited AI listings on every plan ». |
| Import / stock existant | oui : import automatique des annonces des canaux connectés, CSV, Google Sheets ou ZIP. « Find & combine duplicates » regroupe les doublons par photos, avec confirmation de la personne. |
| Retrait auto après vente | oui (« FLUF takes it down from the others »). Ventes vérifiées toutes les **90 min (Starter)** ou **60 min (Pro)**. Pour Vinted, un transfert des e-mails de vente agit « within seconds ». Leboncoin : contradictoire, voir § 3.7. |
| Republication | oui, **à partir de Pro** (29 £), sur 13 canaux dont Vinted, eBay, Depop, Vestiaire et Subito. **Pas sur Leboncoin.** |
| Stock / ventes / stats | tableau de bord (produits actifs, commandes, revenu avec frais), métriques quotidiennes, coût d'achat et profit, historique de 3 mois sur Starter ou complet sur Pro, Xero/QuickBooks dès Pro, commandes centralisées, messagerie unifiée, expédition |
| Prix | **Starter 9 £/mois (59 £/an)**, **Pro 29 £/mois (199 £/an)**, **Super Seller « Custom »**. Essai de **7 jours pour 1 £**, limité à 100 produits actifs. Pas de palier gratuit. Paiement en £ sur le site, y compris sur les pages `/fr/`. L'App Store FR facture en € : Starter 9 €, Pro 29 €, Super Seller 349 €. |
| Pays / langues | Éditeur britannique. Interface en 30 langues, annonces traduites en 35 langues, 46 devises. Site en anglais, avec des sections `/fr/`, `/it/`, `/es/`, `/de/`, `/nl/` et `/pl/`. La fiche App Store est en anglais seulement. La fiche Google Play est traduite en français. |
| Notes publiques | **Trustpilot 4,6 (33 avis)** ; **App Store GB 5,0 (10 notes)**, US 4,0 (2), **FR : aucune note** ; **Google Play 5,0 (10 avis), 1 k+ téléchargements** ; **CWS 4,5 (10 notes), 1 000 utilisateurs** |

---

## 3. Détail point par point (citations et URL)

### 3.1 Plateformes supportées

- `llms.txt` : « 63 supported marketplaces: Depop, Designer Wardrobe, eBay, Etsy, Facebook, Grailed,
  Gumtree UK, Gumtree Australia, Klosetklub, Leboncoin, Marktplaats, Kijiji, Kleinanzeigen, Causee,
  Gettit, Jolicloset, Vendora, Misellit, Poshmark, Mercari, Trade Me, Tradera, Tise, Tilt, Bidzzy,
  BigCommerce, OpenCart, PrestaShop, Allegro, Square, StockX, Mercado Libre, Trendyol, Shopify, Temu,
  TikTok Shop, Vakoop, Vestiaire Collective, Vinted, Wallapop, Whatnot, willhaben, Enjoei, Gotrendier,
  Subito, WooCommerce, Abebooks, Amazon, Cardmarket, Emag, Onbuy, Discogs, Wix, Squarespace, Yaga,
  La Reboucle, Debenhams, La Redoute, IBS, ePRICE, MediaMarkt, Sprinter, Koçtaş » —
  https://fluf.io/llms.txt
- `/integrations/` : « This table is generated from FLUF Connect's live channel capability data, so it
  always reflects what the platform supports today ». Le tableau compte **131 lignes**. Beaucoup
  sont des enseignes de distribution : Auchan, Carrefour, Castorama, Leroy Merlin, Conforama,
  Galeries Lafayette, Kiabi, BUT, Cultura, Decathlon, E.Leclerc, Rue du Commerce, etc. Ces lignes
  n'ont que « Crosslisting : Yes ». **44 lignes** ont aussi la synchro du stock. —
  https://fluf.io/integrations/
- Les lignes qui nous concernent dans ce tableau :

  | Canal | Crosslisting | Inventory Sync | Auto-Relisting | Offer Management | Order Sync |
  |---|---|---|---|---|---|
  | Vinted | Yes | Yes | Yes | Yes | Yes |
  | eBay | Yes | Yes | Yes | Yes | Yes |
  | Depop | Yes | Yes | Yes | Yes | Yes |
  | leboncoin | Yes | — | — | — | — |

  (https://fluf.io/integrations/)
- Le même nombre varie selon la page : « 60+ marketplaces » (https://fluf.io/), « 63 marketplaces »
  (https://fluf.io/about/), « Sell on 50+ marketplaces » (App Store, Google Play, CWS) et « cross-list
  to Leboncoin and 14+ other marketplaces » (https://fluf.io/channels/sell-on-leboncoin/).

### 3.2 Vinted : quels pays ?

- « Select your Vinted country from the dropdown: United Kingdom (vinted.co.uk), France (vinted.fr),
  Germany (vinted.de), Spain (vinted.es), Italy (vinted.it), Netherlands (vinted.nl), Belgium
  (vinted.be), Poland (vinted.pl), Czech Republic (vinted.cz), Lithuania (vinted.lt), Luxembourg
  (vinted.lu), Portugal (vinted.pt), Austria (vinted.at), Sweden (vinted.se), Denmark (vinted.dk),
  Finland (vinted.fi), Slovakia (vinted.sk), Hungary (vinted.hu), Romania (vinted.ro) » —
  https://fluf.io/support/connect-vinted/ (mise à jour du 03/10/2026)
- Connexion : « Connect your account using the FLUF Utility Chrome Extension ». Prérequis :
  « Google Chrome browser ». — même page
- Réglages Vinted : « Crosslist as draft » (l'annonce part dans les brouillons Vinted), « Image
  distortion » (« Unchanged / Medium (recommended) / High »), « Automatic offer management % »,
  « Send messages to likers » et « Post-purchase message ». — même page
- Autres services Vinted : « Vinted Bumps » payés avec la carte du compte Vinted, et « Vinted Likes
  Exchange » : « your idle browser gives likes back. Off by default ». —
  https://fluf.io/support/vinted-bumps/ ; https://fluf.io/support/vinted-likes-exchange/

### 3.3 Leboncoin

- Connexion : « Install the FLUF browser extension, sign in to Leboncoin and connect it from Channels.
  No Pro account or API key is required. Set the required posting postcode ». —
  https://fluf.io/crosslisting/vinted-to-leboncoin/
- Le canal est classé « device-based » : « Device-based channels include Vinted, Facebook Marketplace,
  Poshmark, Gumtree, Wallapop, Whatnot, Vestiaire, Yaga, KlosetKlub, Leboncoin, Grailed, Mercari and
  Vinterior ». — https://fluf.io/support/browser-extension-help/
- Plusieurs comptes Leboncoin sont possibles depuis le 16/09/2026 : « Connect more than one account
  on Kleinanzeigen, Wallapop, Leboncoin, Marktplaats… ». — https://fluf.io/changelog/
- Les catégories Leboncoin sont disponibles dans la correspondance depuis le 29/09/2026 :
  « LeBonCoin categories now appear when mapping ». — https://fluf.io/changelog/
- Ce que FLUF fait pour Leboncoin, selon sa page française :
  « Synchronisation des commandes : Non ; Republication automatique : Non ; Gestion des offres : Non »
  et « Sur Leboncoin, FLUF Connect couvre la publication et le suivi du stock ». —
  https://fluf.io/fr/vendre-sur-leboncoin/ (« Dernière vérification : 2026-07-25 »)
- Pour la synchro du stock, les pages se contredisent. Voir § 3.7.
- Volume déclaré : « This week on leboncoin via FLUF: 1,429 active listings (-11%) ». —
  https://fluf.io/channels/sell-on-leboncoin/

### 3.4 Beebs et eBay FR

- **Beebs** : 0 occurrence dans `https://fluf.io/llms.txt`, `https://fluf.io/llms-full.txt`, le
  tableau de `https://fluf.io/integrations/` et les plans de site
  (`wp-sitemap-pages_urls-1.xml` : 983 adresses, `sitemap-localized.xml`).
- **eBay FR** : « FLUF Connect supports 17+ eBay regional markets including UK, US, Canada, Australia,
  Germany, France, Italy, Spain, and more ». — https://fluf.io/channels/sell-on-ebay/ ; connexion
  « eBay uses OAuth for secure authentication » (https://fluf.io/support/connect-ebay/). Le guide
  eBay nomme ses exemples sur eBay.co.uk. Aucun réglage propre à eBay.fr n'est décrit.

### 3.5 Application mobile et extension ; d'où l'on part

- « iPhone and Android app — Snap a photo to list, and run your shop from your phone — no computer
  needed. » — https://fluf.io/pricing/
- « Search FLUF Connect in the App Store or Google Play » ; onglets « Create, Feed, Crosslist,
  Orderbook, More » ; « The camera opens on launch. » — https://fluf.io/support/mobile-app-overview/
- L'extension demande un ordinateur : « The FLUF extension is a Chrome extension, and Chrome
  extensions only exist on desktop Chrome — on a Windows PC, a Mac, or a Chromebook. » Les canaux qui
  s'en passent : « Depop, eBay, Etsy and Shopify connect straight from your phone in a couple of
  taps. » — https://fluf.io/support/browser-extension-help/
- Les tâches attendent l'appareil : « Queued for hours: an extension channel with nothing to run it.
  Open Chrome with the extension, or the app. » — https://fluf.io/support/how-sync-works/ ;
  « The mobile app can run supported channel jobs while open. » —
  https://fluf.io/support/browser-extension-help/
- Changelog du 07/09/2026 : « Vinted relisting now runs from the FLUF app on your phone — no computer
  or Chrome extension needed. » Du 18/09/2026 : « Vinted listings from the app no longer fail… » et
  « Vinted orders now show up within minutes while the app is open. » — https://fluf.io/changelog/
- Téléphone comme appareil photo de l'ordinateur : « Use your phone as a wireless camera for your
  laptop » — https://fluf.io/support/remote-control-camera/ ; accueil : « Shoot on your phone, the
  listings appear on your laptop ». — https://fluf.io/
- Fiche CWS : « This extension does the work in your browser on marketplaces that need your own
  logged-in session, such as Vinted and Facebook Marketplace » ; « Detects sales and removes sold items
  from your other marketplaces » ; « Runs Vinted relisting, offers and Bumps for you ». —
  https://chromewebstore.google.com/detail/eoagkkaoehjaeplamhpmgfpeidnejdjh

**Lecture** : on peut partir du téléphone, mais Vinted et Leboncoin se connectent depuis Chrome sur
ordinateur. Ensuite, leurs tâches attendent que Chrome (ou l'app ouverte, pour certaines tâches
Vinted) soit disponible. Le modèle est donc proche de celui de FillSell : le téléphone pilote,
l'ordinateur exécute.

### 3.6 Identification par photo / IA

- « Photograph an item and you get a finished listing back — brand, category, condition, title and
  description. Unlimited on every plan, with no per-listing fee. » et « Reads brand, category, colour
  and condition from the photos ». — https://fluf.io/
- Mobile : « After ~7 seconds the AI preview overlay slides up showing title, price range, brand,
  category, and condition. » Puis « Quick List » ou « Edit ». — https://fluf.io/support/ai-listing-creation/
- Langue : « By default the AI writes titles and descriptions in English. If you sell on Subito,
  Leboncoin, Vinted Poland… set AI writing language ». — même page
- Quota : « Each plan includes a number of product creations a month: 50 on Starter, 250 on Pro… each
  extra creation costs 5 credits (about £0.10). » — https://fluf.io/support/plans-and-billing/
- Prudence affichée : « AI may misidentify brands, materials or condition ». —
  https://fluf.io/support/ai-listing-creation/
- Autres outils IA : détourage et retouche (payés en crédits), « AI Authenticity Check », assistant
  « Intesa », traduction des annonces en 35 langues. — https://fluf.io/llms.txt

### 3.7 Import du stock, retrait automatique, synchronisation

- Import : « Your existing listings are imported automatically. No manual entry. » —
  https://fluf.io/integrations/ ; formats : CSV, Excel, Google Sheets, ZIP de photos
  (https://fluf.io/support/bulk-import-listings/).
- Rapprochement des doublons d'avant FLUF : « For items you listed on more than one channel before
  joining FLUF, FLUF will link them automatically when possible. If it misses any, use Combine
  listings » (https://fluf.io/support/how-sync-works/) ; « FLUF refreshes those channels and then
  shows you each set that looks like the same item, with photos… press Combine… or Not the same…
  Combine all confident » ; « FLUF won't quietly re-combine anything you've pulled apart ». —
  https://fluf.io/support/combine-duplicate-listings/
- Retrait après vente : « Sell it on one marketplace and FLUF takes it down from the others. » —
  https://fluf.io/pricing/ ; délai par palier : « Sales checked every… 90 min / 60 min / Custom ». —
  même page
- Vinted par e-mail : « Forward your Vinted "item sold" emails to FLUF, and we take the item down on
  your other channels within seconds ». Il faut le configurer soi-même : « This doesn't happen on its
  own. » — https://fluf.io/support/synchronise-vinted-with-email-forwarding/
- **Leboncoin : quatre pages, trois réponses.**
  - Tableau « live » : Inventory Sync « — ». — https://fluf.io/integrations/
  - Guide anglais : « FLUF removes it from the other channels that support automatic removal.
    Leboncoin is not one of them: when an item sells elsewhere, end the Leboncoin ad yourself, and
    when it sells on Leboncoin, mark it sold in FLUF. » — https://fluf.io/channels/sell-on-leboncoin/
  - Page du trajet Vinted → Leboncoin : « When an item sells on Vinted, FLUF automatically deletes the
    Leboncoin ad within minutes » ; détection d'une vente faite sur Leboncoin : « Limited
    (integrated-shipping only) » ; vente en main propre : « Vinted listing removed once you mark the
    Leboncoin ad as sold or delete it ». — https://fluf.io/crosslisting/vinted-to-leboncoin/
  - Page française : « Synchronisation de l'inventaire : Oui ». — https://fluf.io/fr/vendre-sur-leboncoin/
- Ce que la synchro ne couvre pas : « Title, description, category: No. Edit these in FLUF and push
  the edit ». — https://fluf.io/support/how-sync-works/

### 3.8 Republication / relist automatique

- « Automated relisting is available on Depop, Designer Wardrobe, eBay, Etsy, Kleinanzeigen,
  Marktplaats, Mercari, Poshmark, Subito, Vestiaire Collective, Vinted, Wallapop and willhaben » —
  https://fluf.io/integrations/ (Leboncoin n'y figure pas).
- Palier : « Relisting, offer management, smart pricing, listing boosts and Xero / QuickBooks
  accounting integrations are part of the Pro plan and above. » —
  https://fluf.io/support/plans-and-billing/
- Vinted : « Vinted | Via Chrome Extension | Extension + Chrome running » —
  https://fluf.io/support/relisting/. Le changelog du 07/09/2026 ajoute la republication depuis
  l'app (§ 3.5).
- Réglages : stratégies par ancienneté, prix ou catégorie, limite quotidienne, délai de 5 min à
  1 h entre deux republications Vinted (changelog du 18/09/2026), une carte par boutique. —
  https://fluf.io/support/relisting/ ; https://fluf.io/changelog/

### 3.9 Stock, ventes, statistiques

- Tableau de bord : « Active Cross-Listed Products », « Total Orders » (Fulfilled, Pending,
  Refunded), « Revenue » (« Items, Shipping, and Fees ») et « Set revenue goal ». —
  https://fluf.io/support/dashboard-overview/
- Coûts et profit : champ « Item Cost », import des coûts en CSV ou XLSX. —
  https://fluf.io/support/cost-management/
- Historique : « Starter — last 3 months ; Pro — your full history ». —
  https://fluf.io/support/plans-and-billing/
- Accueil : « Sales, fees and stock across every connected marketplace, in one place and in your own
  currency ». — https://fluf.io/
- Autres outils : commandes de toutes les plateformes (et dans Shopify), messagerie unifiée,
  expédition, ventes par catégorie, classements entre vendeurs et approvisionnement (lots de
  grossistes, recherches Vinted et eBay surveillées). — https://fluf.io/llms.txt

### 3.10 Prix

- Tableau de `/pricing/` : « Starter £9 /month, £59/year (£5/mo) First year ; Pro £29 /month,
  £199/year (£17/mo) First year ; Super Seller Custom » ; « Start 7 days for £1 » ; « The trial covers
  up to 100 active products ». — https://fluf.io/pricing/
- Ce que chaque palier ajoute :
  - Starter : crosslisting illimité, synchro du stock, synchro des commandes, publication Instagram,
    50 créations IA par mois, 3 mois d'historique.
  - Pro : republication, gestion des offres, mises en avant, règles de prix, 1 boutique
    supplémentaire, API en lecture, 1 accès d'équipe, 250 créations IA par mois.
  - Super Seller : API en lecture et écriture, webhooks, file prioritaire, réponse en moins de 24 h
    en semaine. — https://fluf.io/pricing/
- Essai : 7 jours pour 1 £, limité à 100 produits actifs. Pas de palier gratuit : « Y a-t-il un plan
  gratuit ? — No. The trial is £1 for 7 days, then plans start at £9/month. » — https://fluf.io/fr/features/
- Paliers achetables dans l'app (App Store GB) : « Starter (Monthly) £9.00 ; Starter (Annual) £59.00 ;
  Pro (Monthly) £29.00 ; Pro (Annual) £199.00 ; **Super Seller (Monthly) £299.00** ; Pro Legacy
  (Monthly) £19.00 ; Pro Legacy (Monthly) £49.00 ; Pro Legacy (Annual) £190.00 ; Super Seller Legacy
  (Monthly) £99.00 ; Super Seller Legacy (Annual) £990.00 ». —
  https://apps.apple.com/gb/app/fluf-connect/id6751919515
- App Store FR, en euros : « Starter (Monthly) 9,00 € ; Pro (Monthly) 29,00 € ; Starter (Annual)
  59,00 € ; Pro (Annual) 199,00 € ; **Super Seller (Monthly) 349,00 €** ; Pro Legacy (Monthly)
  22,00 € et 59,00 € ; Pro Legacy (Annual) 190,00 € ; Super Seller Legacy (Monthly) 99,00 € ;
  (Annual) 990,00 € ». — https://apps.apple.com/fr/app/fluf-connect/id6751919515
- Sur le site, y compris sur les pages `/fr/`, les prix ne sont affichés qu'en livres sterling. —
  https://fluf.io/fr/pricing/

### 3.11 Pays et langues

- Éditeur britannique (§ 1). L'accueil cite des marketplaces locales : « ES Wallapop, IT Subito,
  AT Willhaben, PL Allegro, DE Kleinanzeigen, FR Leboncoin, NL Marktplaats, EE LV Yaga, NO SE Tise,
  UK Gumtree, MX GoTrendier, NZ TradeMe ». — https://fluf.io/
- « 46 currencies » ; « 35 listing-translation languages · app in 30 languages ». — https://fluf.io/
- « FLUF speaks 30 languages… both the FLUF Mobile app and the Connect dashboard », dont le
  français. — https://fluf.io/support/change-app-language/
- Fiche App Store : « Language: EN English » (GB, FR et US). — https://apps.apple.com/gb/app/fluf-connect/id6751919515
- Fiche Google Play FR : titre « FLUF Connect: Vente Multicanal », description en français qui cite
  « Vinted, Leboncoin, eBay, Depop ». — https://play.google.com/store/apps/details?id=com.fluf.connect.mobile&hl=fr&gl=FR
- CWS : « 31 languages » dont le français. — https://chromewebstore.google.com/detail/eoagkkaoehjaeplamhpmgfpeidnejdjh
- Site : `hreflang` en-GB, it-IT, fr-FR et es-ES sur 15 pages principales. Pages éditoriales en
  `/de/`, `/nl/` et `/pl/`. — https://fluf.io/sitemap-localized.xml ; https://fluf.io/wp-sitemap-pages_urls-1.xml

### 3.12 Notes publiques (lues le 09/10/2026)

| Source | Note | Volume | Détail | URL |
|---|---|---|---|---|
| Trustpilot | **4,6** (« Excellent ») ; l'image des étoiles affiche « 4.5 out of 5 » | **33 avis** (32 sur 12 mois) | 88 % de 5 étoiles, 12 % de 4 étoiles, 0 % en dessous ; avis récents datés du 28/09 au 08/10/2026 ; profil revendiqué en avril 2022. Lu par WebFetch : curl renvoie 403. | https://uk.trustpilot.com/review/fluf.io |
| App Store GB | **5,0** | **10 notes** | v2.9 du 05/10/2026 | https://apps.apple.com/gb/app/fluf-connect/id6751919515 |
| App Store US | 4,0 | 2 notes | — | https://apps.apple.com/us/app/fluf-connect/id6751919515 |
| App Store FR | aucune | 0 (« Cette app n'a pas reçu suffisamment de notes ou d'avis ») | — | https://apps.apple.com/fr/app/fluf-connect/id6751919515 |
| Google Play (GB) | **5,0** | **10 avis**, **1 k+ téléchargements** | mise à jour du 04/10/2026 ; avis du 28/04, du 09/08 et du 18/09/2026 | https://play.google.com/store/apps/details?id=com.fluf.connect.mobile |
| Chrome Web Store | **4,5** | **10 notes**, **1 000 utilisateurs** | v2.356 du 07/10/2026 | https://chromewebstore.google.com/detail/eoagkkaoehjaeplamhpmgfpeidnejdjh |
| Leur site (données structurées) | `"ratingValue":"5","ratingCount":"1"` | 1 | dans le bloc `SoftwareApplication` de l'accueil | https://fluf.io/ (source HTML) |

Volume d'activité **déclaré par FLUF**, invérifiable :
- Vinted : « This week on Vinted via FLUF: 3,612 sales (-9% vs last week), average sale £19.59, 221k
  active listings (+11%) » (https://fluf.io/channels/sell-on-vinted/) ;
- eBay : « 3,385 sales… average sale £35.77, 315k active listings » (https://fluf.io/channels/sell-on-ebay/) ;
- Depop : « 1,904 sales… 1.1m active listings » (https://fluf.io/channels/sell-on-depop/) ;
- Leboncoin : « 1,429 active listings (-11%) » (https://fluf.io/channels/sell-on-leboncoin/).

---

## 4. Incohérences relevées sur leurs propres pages (faits, sans jugement)

| Sujet | Version A | Version B | Sources |
|---|---|---|---|
| Paliers et prix | Starter 9 £, Pro 29 £, Super Seller « Custom » | FAQ de la même page : « Starter is £9/month, Seller £29/month, Pro £99/month, and Super Seller is custom » | https://fluf.io/pricing/ |
| Paliers et prix | 9 £ / 29 £ / sur devis | « Growth à 19 £/mois (500 produits), Seller à 99 £/mois (5 000 produits) et Super Seller à 299 £/mois » | https://fluf.io/fr/logiciel-crosslisting/ ; idem sur `/fr/vendre-plusieurs-plateformes/` et `/fr/automatiser-ventes-vinted/` |
| Prix d'entrée | « from £9/month » | « from £19/month on the FLUF Connect Growth plan » ; « à partir de 19 £/mois » ; données structurées de l'accueil : `"price":"19","priceCurrency":"GBP"` | https://fluf.io/crosslisting/vinted-to-leboncoin/ ; https://fluf.io/fr/vendre-sur-leboncoin/ ; https://fluf.io/ (HTML) |
| Super Seller | « Custom » (site) | 299 £ par mois (App Store GB), 349 € par mois (App Store FR) | https://fluf.io/pricing/ ; App Store |
| Automatisations | « included from Pro upwards » | « Auto-relisting and offer management are included in every FLUF Connect plan — they are not paid add-ons » (même page) ; « l'automatisation est incluse dans tous les forfaits » | https://fluf.io/integrations/ ; https://fluf.io/fr/vendre-sur-leboncoin/ |
| Republication Vinted | à partir de Pro | « Automated relisting for Vinted starts at Seller » ; « on Seller and above » | https://fluf.io/pricing/ ; https://fluf.io/about/ |
| IA | « 50 / mo » sur Starter | « Unlimited AI listings on every plan — no per-listing fee » (même page) | https://fluf.io/ |
| Limites | « No plan limits how many products you list » | « Les limites comptent les produits non vendus : un article parti ne consomme plus votre quota » | https://fluf.io/about/ ; https://fluf.io/fr/vendre-sur-leboncoin/ |
| Synchro, tous canaux | « Every channel supports crosslisting and inventory sync » (TL;DR) | 87 lignes sur 131 sans synchro dans le tableau juste en dessous | https://fluf.io/integrations/ |
| Synchro Leboncoin | « — » (tableau live) ; « Leboncoin is not one of them » (guide) | « Oui » (page FR) ; « automatically deletes the Leboncoin ad within minutes » (trajet) | voir § 3.7 |
| Nombre de canaux | 60+ / 63 | 50+ (stores) ; 14+ (guide Leboncoin) ; 131 lignes (tableau) | § 3.1 |
| Langues de l'app | « app in 30 languages » ; article : 30 | « FLUF Mobile speaks 16 languages » (index de `llms.txt`) ; fiche App Store : EN | https://fluf.io/ ; https://fluf.io/llms.txt ; App Store |
| Parrainage | « 50% of every person you refer's subscription, for as long as they stay subscribed » | « 50% De leurs paiements pendant 6 mois, jusqu'à 100 £ par parrainage » | https://fluf.io/ ; https://fluf.io/fr/pricing/ |
| Remise annuelle | « Save 40 % » | « 45% » (Starter), « 42% » (Pro) dans le tableau d'`/integrations/` | https://fluf.io/ ; https://fluf.io/integrations/ |
| Exclusivité | « FLUF Connect is the only crosslisting tool that supports both Vinted and Leboncoin for individual sellers » | FillSell publie aussi vers Vinted et Leboncoin (contexte du chantier) | https://fluf.io/crosslisting/vinted-to-leboncoin/ |
| Pages `/fr/` | contenu en français | parties en anglais (« See pricing », « 7 days for £1… », tableau des prix, réponse de FAQ « No. The trial is £1… ») ; traductions littérales (« Croix-listage », « Enregistrer 40 % », « Commencez à publier en communautés ») | https://fluf.io/fr/ ; https://fluf.io/fr/pricing/ ; https://fluf.io/fr/features/ |
| Langue des pages anglaises | `<html lang="en-ZA">` | `hreflang="en-GB"` sur les mêmes pages | https://fluf.io/crosslisting/vinted-to-leboncoin/ (HTML) |

---

## 5. Ce qu'ils font bien (honnêtement)

- **Une couverture très large et datée.** Vinted sur 19 pays, Leboncoin, eBay sur plus de 17 sites,
  et de nombreuses places de marché locales en Europe (Wallapop, Subito, Kleinanzeigen, Marktplaats,
  willhaben, Tise, Yaga) que peu d'outils couvrent. Les fonctions sont détaillées canal par canal
  dans un tableau (« generated from FLUF Connect's live channel capability data »).
- **Ils écrivent ce qui ne marche pas** : « Nous préférons vous le dire avant que vous vous
  abonniez » (Leboncoin, page FR) ; « Note on scope: FLUF's auto-relisting and automated offer
  management are not yet supported on Wallapop ». Ces avertissements se contredisent d'une page à
  l'autre (§ 4), mais ils existent.
- **Un produit proche du nôtre** : app iOS et Android qui s'ouvre sur l'appareil photo, analyse IA en
  ~7 s, « Quick List », téléphone comme appareil photo de l'ordinateur, extension qui exécute sur
  l'ordinateur, republication Vinted depuis l'app.
- **Des doublons d'avant l'inscription rapprochés par photos**, avec une confirmation
  (« Combine » / « Not the same ») qui est retenue : « FLUF won't quietly re-combine anything
  you've pulled apart ».
- **Plusieurs façons de détecter une vente Vinted** : par l'extension, par l'app ouverte ou par le
  transfert des e-mails de vente, « within seconds ».
- **Un rythme de livraison élevé** : changelog presque quotidien (2 oct., 1er oct., 30 sept.,
  29 sept.…), app iOS mise à jour le 05/10, Android le 04/10 et extension le 07/10/2026.
- **Des outils à côté** : gestion des offres, envoi d'offres aux personnes qui ont aimé l'article,
  baisses de prix programmées, Xero et QuickBooks, messagerie unifiée, expédition, API, MCP, n8n,
  Zapier, assistant IA « Intesa ».
- **Un centre d'aide épais et à jour** (articles mis à jour le 03/10/2026), publié en entier pour
  les IA (`llms-full.txt`).
- **De bonnes notes, sur un petit volume** : Trustpilot 4,6 (33 avis), Google Play 5,0 (10),
  App Store GB 5,0 (10), CWS 4,5 (10).
- **Un essai bon marché et des prix d'entrée bas** : 1 £ pour 7 jours, puis 9 £ par mois, ou 59 £ la
  première année.

---

## 6. Ce qu'on ne peut pas vérifier sans compte

- **Le comportement réel sur Leboncoin** : leurs pages se contredisent sur le retrait automatique
  et la détection des ventes (§ 3.7). Seul un essai trancherait.
- **Ce que l'app fait sans ordinateur** pour Vinted et Leboncoin : publication, retrait,
  republication. Le changelog l'annonce pour la republication Vinted. Le centre d'aide dit encore
  « Extension + Chrome running ».
- **La qualité de l'IA** (marque, prix suggéré), en français en particulier : l'IA écrit en anglais
  par défaut.
- **Le délai réel de retrait après une vente** : 60 ou 90 min selon le palier, ou quelques secondes
  par le transfert d'e-mails.
- **Le rapprochement automatique** des annonces d'avant l'inscription : « when possible », sans
  critère public.
- **Le prix réellement payé** : la page de paiement est derrière un compte, la devise d'un abonnement
  web pris depuis la France n'est pas affichée, et les paliers « Legacy » sont encore en vente sur
  l'App Store.
- **Les chiffres d'activité « via FLUF »** et « thousands of sellers » : ce sont leurs affirmations.
- **eBay.fr en pratique** : les sites eBay sont annoncés, mais leurs réglages ne sont pas décrits.
- **La traduction française des écrans de l'app** : les captures des stores n'ont pas été
  regardées.

---

## 7. Écarts factuels avec FillSell (faits seulement)

Les faits FillSell viennent du contexte du chantier et de `00-decouverte.md` (fiche CWS FillSell :
360 utilisateurs, mise à jour du 08/10/2026).

| Point | FLUF Connect (09/10/2026) | FillSell |
|---|---|---|
| Beebs | absent | en service |
| Leboncoin, retrait après vente | contradictoire ; le tableau « live » et le guide anglais disent « non » (« end the Leboncoin ad yourself ») | en service : les copies liées par une preuve sont retirées (règles internes) |
| Leboncoin, republication / offres / commandes | non / non / non (leur page FR) | — (non comparé ici) |
| Palier gratuit | aucun ; essai de 7 jours à 1 £ | palier gratuit (50 republications par mois) |
| Devise affichée aux Français | livres sterling sur tout le site, y compris `/fr/` ; euros seulement dans l'App Store FR | euros |
| Langue des pages françaises | 22 adresses `/fr/`, en partie en anglais ou traduites mot à mot ; pages « trajet » en anglais seulement | produit et site en français |
| Fiche App Store | en anglais ; aucune note en France | — (à mesurer par le même procédé) |
| Extension sur le CWS | 1 000 utilisateurs, 4,5 (10 notes), v2.356 du 07/10/2026 | 360 utilisateurs, mise à jour du 08/10/2026 |
| Plateformes hors France | des dizaines (Depop, Vestiaire, Etsy, Wallapop, Subito, Kleinanzeigen…) | Vinted, Leboncoin, eBay, Beebs (Depop en bêta fermée, non annoncée) |
| Point de départ | téléphone ou ordinateur ; Chrome sur ordinateur requis pour connecter Vinted et Leboncoin | téléphone ; l'extension exécute sur l'ordinateur |

---

## 8. Points utiles au chantier SEO/GEO de FillSell

- **Une affirmation fausse vis-à-vis de FillSell**, sur une page en anglais qu'un assistant peut
  reprendre : « FLUF Connect is the only crosslisting tool that supports both Vinted and Leboncoin
  for individual sellers » (https://fluf.io/crosslisting/vinted-to-leboncoin/). En français : « La
  prise en charge de Leboncoin est d'ailleurs rare sur le marché — la plupart des outils de
  crosslisting s'arrêtent à Vinted, Vestiaire Collective ou eBay » (https://fluf.io/fr/vendre-sur-leboncoin/).
  Une page FillSell factuelle et datée (Vinted + Leboncoin + eBay + Beebs, avec ce que fait chaque
  canal : retrait, republication) donnerait le contre-fait.
- **Le trajet Vinted ↔ Leboncoin n'existe chez eux qu'en anglais.** Les adresses
  `/fr/crosslisting/...` rendent 404. Leurs pages françaises sont générales (« Vendre sur
  Leboncoin », « Logiciel de crosslisting », « Vendre sur plusieurs plateformes », « Automatiser ses
  ventes sur Vinted », « Vendre sur Vinted et Vestiaire »). Une page française par trajet (Vinted
  → Leboncoin, Leboncoin → Vinted, Vinted → Beebs…) n'a donc pas de concurrent FLUF en français.
- **Leur outillage pour les IA, à étudier pour notre site** :
  - `robots.txt` qui autorise nommément OAI-SearchBot, GPTBot, ClaudeBot, PerplexityBot,
    Google-Extended, etc. ;
  - `llms.txt` (fiche d'identité et tableau des canaux) et `llms-full.txt` (tout le centre d'aide,
    440 Ko) ;
  - export JSON du support ;
  - page « AI Agent Guide » ;
  - points `fc/agentic/v1` (plans, abonnement, catalogue) ;
  - données structurées `SoftwareApplication` et `FAQPage`.
- **Le volume** : 572 pages de trajet, 265 pages par canal ou comparatif (« leboncoin-vs-vinted »,
  « leboncoin-vs-ebay »), des calculateurs de frais (« leboncoin fee calculator »), une ligne de
  données hebdomadaires « via FLUF » par canal et un bloc « Sources et vérification » daté sur les
  pages françaises (« Dernière vérification : 2026-07-25 »).
- **Leur faiblesse en France est mesurable** : prix en £, pages `/fr/` mêlées d'anglais, fiche App
  Store en anglais sans note en France, pas de Beebs, Leboncoin limité ou contradictoire. Ce sont des
  faits qu'une page comparative FillSell peut citer avec leurs URL, sans jugement.

---

## 9. Sources (toutes lues le 2026-10-09)

- https://fluf.io/ (et source HTML : données structurées)
- https://fluf.io/robots.txt ; https://fluf.io/wp-sitemap.xml ; https://fluf.io/sitemap-localized.xml ;
  https://fluf.io/wp-sitemap-pages_urls-1.xml ; https://fluf.io/wp-sitemap-flufconnect_urls-1.xml ;
  https://fluf.io/wp-sitemap-posts_urls-1.xml
- https://fluf.io/llms.txt ; https://fluf.io/llms-full.txt
- https://fluf.io/pricing/ ; https://fluf.io/integrations/ ; https://fluf.io/about/ ;
  https://fluf.io/reviews/ ; https://fluf.io/changelog/ ; https://fluf.io/developers/ ;
  https://fluf.io/ai-agents-read-here/ ; https://fluf.io/crosslisting/
- https://fluf.io/support/connect-vinted/ ; https://fluf.io/support/browser-extension-help/ ;
  https://fluf.io/support/how-sync-works/ ; https://fluf.io/support/mobile-app-overview/ ;
  https://fluf.io/support/mobile-troubleshooting/ ; https://fluf.io/support/ai-listing-creation/ ;
  https://fluf.io/support/plans-and-billing/ ; https://fluf.io/support/relisting/ ;
  https://fluf.io/support/combine-duplicate-listings/ ;
  https://fluf.io/support/synchronise-vinted-with-email-forwarding/ ;
  https://fluf.io/support/dashboard-overview/ ; https://fluf.io/support/cost-management/ ;
  https://fluf.io/support/change-app-language/ ; https://fluf.io/support/connect-ebay/ (tous lus dans
  `llms-full.txt`)
- https://fluf.io/crosslisting/vinted-to-leboncoin/ ; https://fluf.io/crosslisting/leboncoin-to-vinted/ ;
  https://fluf.io/channels/sell-on-leboncoin/ ; https://fluf.io/channels/leboncoin-vs-vinted/ ;
  https://fluf.io/channels/sell-on-vinted/ ; https://fluf.io/channels/sell-on-ebay/ ;
  https://fluf.io/channels/sell-on-depop/
- https://fluf.io/fr/ ; https://fluf.io/fr/pricing/ ; https://fluf.io/fr/integrations/ ;
  https://fluf.io/fr/channels/ ; https://fluf.io/fr/features/ ; https://fluf.io/fr/vendre-sur-leboncoin/ ;
  https://fluf.io/fr/logiciel-crosslisting/ ; https://fluf.io/fr/vendre-plusieurs-plateformes/ ;
  https://fluf.io/fr/automatiser-ventes-vinted/ ; https://fluf.io/fr/vendre-vinted-vestiaire/ ;
  https://fluf.io/fr/support/connect-vinted/ ; https://fluf.io/fr/support/plans-and-billing/ ;
  https://fluf.io/fr/crosslisting/vinted-to-leboncoin/ (404)
- https://apps.apple.com/gb/app/fluf-connect/id6751919515 ; https://apps.apple.com/fr/app/fluf-connect/id6751919515 ;
  https://apps.apple.com/us/app/fluf-connect/id6751919515 ; https://itunes.apple.com/lookup?id=6751919515&country=gb
  (et `country=fr`, `country=us`)
- https://play.google.com/store/apps/details?id=com.fluf.connect.mobile (hl=en_GB et hl=fr)
- https://chromewebstore.google.com/detail/eoagkkaoehjaeplamhpmgfpeidnejdjh
- https://uk.trustpilot.com/review/fluf.io ; https://www.trustpilot.com/review/fluf.io (par WebFetch ;
  curl : 403)
