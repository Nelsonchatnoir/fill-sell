# List Perfectly : vérification sur ses pages réelles

- **Site** : https://listperfectly.com (List Perfectly, Inc., Arizona, États-Unis)
- **Date d'observation** : 2026-10-09, pour toutes les pages citées sauf mention contraire.
- **Méthode** : pages téléchargées avec `curl` (agent Chrome de bureau), puis converties en texte. Les citations
  sont recopiées de ce texte, en anglais. Sources lues : le site officiel (accueil, tarifs, paliers Pro Plus,
  plateformes, FAQ, contact, chronologie, conditions d'utilisation, billets), le centre d'aide public
  (help.listperfectly.com), la page d'installation de l'extension (app.listperfectly.com/version/), les deux
  fiches Chrome Web Store, et la recherche App Store (API iTunes) et Google Play.
  Les deux paquets publics de l'extension (CRX servis par Google) ont été téléchargés : seul leur `manifest.json`
  a été extrait et lu, pour connaître les domaines sur lesquels l'extension agit. Aucun code n'a été exécuté.
  Aucune inscription, aucune connexion, aucun formulaire : tout ce qui se trouve derrière un compte est classé
  « non vérifiable » (§ 14).

---

## 0. En bref

1. **Le support officiel ne couvre que les États-Unis.** FAQ : « At this time, List Perfectly supports U.S.
   marketplaces only ». Les conditions d'utilisation (§ U, mises à jour le 17/09/2025) disent : « The Services are
   intended for use in the United States ». La page contact précise : « As long as you sell in USD currency on a
   marketplace based in the USA, you can use List Perfectly. »
2. **Vinted, oui, mais seulement vinted.com.** Vinted est arrivé en janvier 2026 (chronologie) et le billet du
   10/04/2026 l'ouvre à toutes les formules. La page tarifs le classe pourtant « **Lite** » : publication et retrait
   oui, **détection des ventes non**, donc pas de retrait automatique déclenché par une vente Vinted. Le manifeste
   de l'extension, en version stable comme en bêta, n'autorise que `*.vinted.com` et `*.vinted.net`. **vinted.fr
   n'y figure pas.**
3. **Leboncoin, Beebs et eBay France sont absents** : aucune mention sur les pages lues, aucun de ces domaines dans
   les manifestes. Pour eBay, le manifeste ne connaît que `ebay.com` et `ebay.ca`.
4. **Aucune application mobile native.** Rien sur l'App Store US ni sur Google Play. Le mobile passe par un
   navigateur (« List Perfectly Mobile works from any browser »), pour les brouillons, les images et les outils de
   prix. Le crosslisting exige l'**extension Chrome/Edge sur ordinateur**. On part donc de l'ordinateur.
5. **La personne clique elle-même sur « publier ».** C'est un choix assumé (billet du 29/05/2026) : « List
   Perfectly does not automatically publish listings to Vinted or other marketplaces on behalf of the reseller ».
6. **Le retrait automatique (« Auto Delist ») est réservé à Pro Plus**, à partir de 99 $/mois. Il passe par
   l'extension, sur un appareil allumé, et ne joue que si la quantité vaut 1. La détection des ventes commence en
   Pro (69 $/mois).
7. **Prix en dollars US, facturés au mois** : Simple 29 $, Business 49 $, Pro 69 $, Pro Plus 99, 149 ou 249 $.
   Annonces et crosslisting sont illimités dans toutes les formules ; seules l'IA, le détourage et les scans
   ont des quotas. Il n'y a pas de formule gratuite : « 100 free listings » et une garantie « satisfait ou
   remboursé » de 5 jours, carte exigée à l'inscription.
8. **Notes publiques** : Chrome Web Store, version stable **4,1/5 (22 notes, 9 000 utilisateurs)** et version bêta
   **4,4/5 (29 notes, 4 000 utilisateurs)**. Aucune fiche App Store ou Google Play. Trustpilot : aucune page
   trouvée (non vérifiable).
9. Site, centre d'aide et fiches Chrome Web Store sont **en anglais uniquement** (`lang="en-US"`).

Pour un revendeur français, List Perfectly n'est pas une option officielle. Le support se limite aux États-Unis,
l'extension ne vise que vinted.com, et Leboncoin, Beebs et eBay.fr sont absents. Ses contenus anglophones sur
Vinted restent en revanche indexés (§ 15).

---

## 1. Plateformes supportées (liste exacte)

Les pages officielles se contredisent sur la liste. Voici chaque source telle qu'elle est.

| Source (lue le 2026-10-09) | Liste citée |
|---|---|
| https://listperfectly.com/platforms/ | « Cross-list to 14 marketplaces » : eBay, Poshmark, Mercari, Depop, Grailed, Vestiaire Collective, Etsy, Facebook Marketplace, Instagram, Shopify, Whatnot, **Listing Party** (leur propre communauté, « Exclusive community platform for List Perfectly members »), **Vinted** (« European marketplace for secondhand fashion », lien vers `https://www.vinted.com`), Reverb |
| https://listperfectly.com/pricing (« All Marketplace Access ») | « Depop, eBay, Etsy, Facebook, Grailed, Mercari, Poshmark, Vestiaire Collective, Vinted (LITE) », plus « Shopify, Instagram, Listing Party Crosslisting Support » |
| https://listperfectly.com/faq/ (« Which marketplaces are supported? ») | « eBay, Poshmark, Mercari, Depop, Etsy, Facebook Marketplace, Grailed, Vestiaire Collective, Whatnot —plus Crosslisting support to Shopify and Instagram » (sans Vinted ni Reverb) |
| Centre d'aide, article du 11/09/2025 https://help.listperfectly.com/en/articles/12263549-which-marketplaces-are-supported | même liste sans Whatnot, Vinted ni Reverb (article non mis à jour) |
| Centre d'aide, « New: Reverb and Background Update » (« Updated this week », dateModified 2026-10-06) https://help.listperfectly.com/en/articles/17318042-new-reverb-and-background-update | « Reverb is now a supported marketplace » |
| Manifeste de l'extension stable 1.0.188.2 (CRX public, id `flpmljgbaphneikdjhmekdpiamkejfon`) | domaines : ebay.com, ebay.ca, etsy.com, etsy.ca, poshmark.com, poshmark.ca, mercari.com, depop.com, grailed.com, vestiairecollective.com, facebook.com, instagram.com, shopify.com / myshopify.com, whatnot.com, **vinted.com**, reverb.com, plus des restes : kidizen.com, tradesy.com |
| Manifeste de l'extension bêta 2.0.189.7 (id `cfglgfaclpncclmjbbdhkhpnfbapoahp`) | Vinted : `*.vinted.com`, `*.vinted.net` seulement ; aucun leboncoin, beebs, ebay.fr, ebay.co.uk, ebay.de |

**Statut de Vinted** :
- Chronologie https://listperfectly.com/about-us/timeline/ : « January, 2026 — Vinted Supported ».
- Billet du **10/04/2026**
  https://listperfectly.com/selling/vinted-marketplace-supported-in-list-perfectly/ : « You can crosslist to
  Vinted with any List Perfectly plan: Simple, Business, Pro, or Pro Plus » ; « Vinted is included with no extra
  fees ».
- Page tarifs : « Lite marketplaces — Vinted. Crosslist to and delist from Lite marketplaces on every plan. What
  they don't support is automatic sales detection — a sale on a Lite marketplace isn't detected, so it won't
  trigger Auto Delist for your other listings. Mark the item sold to close those out. »
- Billet du **29/05/2026**
  https://listperfectly.com/selling/list-perfectly-vinted-integration-compliant-crosslisting/ : « Other services
  have pulled back from Vinted and canceled their integration after Vinted tightened access around automated or
  unauthorized integration workflows. List Perfectly customers can keep moving because List Perfectly was built
  differently from the start. »
- **Pays de Vinted** : aucune page ne nomme de pays. Les pages officielles ne lient que `www.vinted.com`, la règle
  générale est « U.S. marketplaces only », et le manifeste n'a que `vinted.com`. Le billet du 10/04 cite bien des
  chiffres européens (« One of the largest fashion platforms in markets like the UK and France »), mais comme
  contexte de marché, sans promettre de support.

**Leboncoin** : absent, aucune mention, pas dans les manifestes. **Beebs** : absent, idem. **eBay France** : absent.
La FAQ dit « eBay U.S. is supported / eBay Italy is not supported », la page contact « if you are selling on Ebay
Canada we are unable to support that channel », alors que le manifeste contient pourtant `ebay.ca`.

---

## 2. Pays et langues

- FAQ https://listperfectly.com/faq/ et centre d'aide (26/12/2025)
  https://help.listperfectly.com/en/articles/11106082-can-i-use-list-perfectly-outside-the-united-states :
  « List Perfectly is a U.S.-based company headquartered in Phoenix, Arizona, and our platform is officially
  built, tested, and supported for use in the United States. » / « You are welcome to try List Perfectly from other
  countries » / « We cannot guarantee performance, compatibility, or support quality outside the U.S. » / « Depop
  UK and other regional versions are not supported ».
- CGU https://listperfectly.com/tos/ (« Updated: 9/17/2025 »), § U « GEOGRAPHIC AVAILABILITY; INTERNATIONAL USE » :
  « The Services are intended for use in the United States. » ; « By using the List Perfectly Services, Users in
  the European Union understand and consent to the processing of personal information in the United States. »
  Droit applicable : Californie.
- Contact https://listperfectly.com/contact/ : « At this time List Perfectly fully supports USA based marketplaces
  and shops. As long as you sell in USD currency on a marketplace based in the USA, you can use List Perfectly. » ;
  « We have plans to expand internationally in the near future ».
- Fiche Chrome Web Store : « Non-trader — This developer has not identified itself as a trader. For consumers in
  the European Union, please note that consumer rights do not apply to contracts between you and this developer. »
- **Langue** : anglais seulement. Le site est en `lang="en-US"`, sans `hreflang`. Les fiches Chrome Web Store
  indiquent « Languages: English » (bêta) et « English (United States) » (stable).
- **Adresses** : Phoenix, AZ (FAQ ; CGU : « 428 E Thunderbird Rd #519, Phoenix, AZ 85022 ») ; Scottsdale, AZ
  (Chrome Web Store : « 7014. E Camelback Rd. Suite 1452 »).

---

## 3. Application mobile, extension, d'où l'on part

- **Extension** : oui, Chrome et Edge.
  - Version stable « **List Perfectly Multi-Channel** » :
    https://chromewebstore.google.com/detail/list-perfectly-multi-chan/flpmljgbaphneikdjhmekdpiamkejfon
    (version 1.0.188.2, mise à jour le 6 octobre 2026).
  - Version bêta « List Perfectly Multi-Channel - BETA » :
    https://chromewebstore.google.com/detail/list-perfectly-multi-chan/cfglgfaclpncclmjbbdhkhpnfbapoahp
    (version 2.0.189.7, mise à jour le 9 octobre 2026).
  - Description : « Copy listings from and to multiple marketplaces » ; « Requires a List Perfectly account ».
  - Liens d'installation : https://app.listperfectly.com/version/ (« List Perfectly extension must be installed on
    Google Chrome or Microsoft Edge »).
- **Application mobile native** : aucune trouvée. La recherche App Store US (API iTunes, termes « list perfectly »
  et « listperfectly ») ne renvoie aucune application de l'éditeur. La recherche Google Play
  (https://play.google.com/store/search?q=list%20perfectly&c=apps) n'en renvoie pas non plus : on y voit Vendoo,
  Crosslist ou PrimeLister, pas List Perfectly.
- **Mobile par navigateur** : page tarifs, « List Perfectly Mobile — Access your List Perfectly listings from your
  mobile device on any browser » ; billet du 20/07/2026
  https://listperfectly.com/tips/how-to-enable-your-list-perfectly-extension-in-google-chrome/ : « List Perfectly
  Mobile works from any browser, including iPhone and Android. »
- **D'où l'on part : l'ordinateur.**
  - FAQ « Can I crosslist on my phone? » : « You can create drafts, manage images, and use pricing tools on any
    mobile browser. Crosslisting and other extension-based actions require a device that supports browser
    extensions (desktop/laptop, Chromebook, or Surface Pro). »
  - Exigences minimales (FAQ) : « A desktop/laptop running a modern OS (Windows, macOS, or Chromebook). Google
    Chrome (or a Chromium-based browser) with the List Perfectly extension. »
  - Guide d'accueil (25/08/2026)
    https://help.listperfectly.com/en/articles/11465703-list-perfectly-onboarding-guide : « Browser extensions do
    not work on mobile devices. »
- **Mode de publication** :
  - FAQ : « The extension opens those sites and helps move your data into each form so you can review and
    publish. »
  - Billet du 29/05/2026 : « The reseller reviews. The reseller decides. The reseller hits publish. »
  - Nouveauté d'octobre 2026, « Background Update » (aide, dateModified 2026-10-06) : « Update your live listings
    (price, quantity, title, images, description, SKU, condition) without opening a new tab for each marketplace. »

---

## 4. Identification par photo / IA (titre, description, prix)

- **Listing Assistant** :
  - Accueil : « AI-powered Listing Assistant creates a listing from just a few photos! » ; « Creates titles,
    descriptions, keywords/tags, and item specifics » ; « Customizable tone ».
  - Billet du 03/04/2026
    https://listperfectly.com/selling/boost-your-sales-with-100-free-listings-using-list-perfectlys-listing-assistant/ :
    « Create listings from 1 to 6 images » ; « Automatically fill titles, descriptions, and item specifics ».
  - Paliers Pro Plus : « Effortlessly create complete listings using just images or titles ».
- **Quotas d'IA** (« AI Generated Listings », par mois) : Simple 25, Business 50, Pro 200, Pro Plus 1 000, 2 500
  ou 5 000. Les quotas sont remis à zéro « on the 1st of each month » (FAQ).
- **Code-barres** : « Listing Assistant - Barcode scans — Scan and instantly pull in product details ». Quotas : 25,
  50, 100, puis 1 000 à 5 000 par mois.
- **Prix** : outils de recherche, pas de prix proposé automatiquement d'après les pages lues.
  - « Google Lens Pricing Tool — From a single click utilize the Google Lens pricing tool to take your image and
    run it through Google Lens to gain insights. »
  - « eBay Pricing Lookup — From a single click from your listing lookup comps on eBay. »
  - Accueil : « Pricing research and information while listing with tools like Google Lens, chatGPT AI, and
    Barcode Lookup. »
- **Photos** : détourage par PhotoRoom (25, 50, 1 500, puis 3 000 à 15 000 par mois), 30 images par annonce,
  « Auto Image Re-Size » au format carré.
- **Instructions IA personnalisées** : « Custom AI Prompt Templates », en Pro Plus seulement.

---

## 5. Import et synchronisation du stock existant

- **Single Click Import** :
  - Tarifs : « Connect your shop and with one click import your entire inventory. This feature is currently
    available on ebay, Mercari, and Poshmark. » Non inclus en Simple, inclus à partir de Business.
  - FAQ : « one-click import (From: eBay, Poshmark, Mercari, more coming soon) ».
- **Smart Import** (bêta, guide d'accueil du 25/08/2026) :
  - « Smart Import scans your connected marketplaces and helps determine which listings belong to the same item ».
  - Comparaison sur « Titles / Prices / Photos / Item details ».
  - Filtres « Needs review / Auto-matched / Single / Confirmed », avec un pourcentage de correspondance.
  - Revue des doublons sur une même plateforme, avec le choix « Delete » qui « Ends that copy on the marketplace ».
  - « Draft and sold listings are not collected » ; « A rescan currently collects everything again » ; « The import
    runs on List Perfectly's systems, so you can close your browser ».
  - Vinted figure parmi les places de marché à connecter : « eBay, Poshmark, Mercari, Etsy, Depop, Vinted, And
    more ».
  - Comme le dit le guide lui-même, « Nothing is being approved for you » : la personne confirme chaque
    correspondance.
- **Link Existing Listings** (Business et au-delà) : « You'll see a "Link" option next to any marketplace item with
  an Item ID that isn't yet in your List Perfectly catalog. »
- **Crosslisting direct sans import** : FAQ « Marketplace → Marketplace (Direct Crosslisting) … Trade-off: …
  you won't have centralized inventory management features ».
- **Synchronisation continue** : aucune page ne décrit de relevé périodique côté serveur. La détection des ventes
  dépend de la navigation (§ 6).

---

## 6. Retrait automatique des copies après une vente (auto-delist)

- **Formules** :
  - FAQ : « All Plans: … manually mark items as sold or end listings ».
  - « Pro Plan: Includes Sales Detection, which alerts you when an item sells so you can manually mark it sold or
    end the listings on other marketplaces. »
  - « Pro Plus Plan: Adds Auto Delist to Sales Detection — when a sale is detected, the extension will
    automatically end the item on your connected marketplaces. »
- **Fonctionnement** (FAQ « How does Auto Delist work? ») :
  - « It works with eBay, Etsy, Poshmark, Mercari, Facebook Marketplace, Depop, Grailed, Shopify, and Vestiaire
    Collective. » Vinted n'est pas dans la liste.
  - « Auto Delist runs through the List Perfectly Extension on your device. »
  - Conditions : « Pro Plus Plan / Device on and running the extension / Marketplaces connected through the
    Connection Wizard / Linked catalog with correct marketplace item IDs / Sales Detection turned on ».
  - Limite : « Auto Delist only works when the listing quantity is set to 1. »
- **Détection des ventes** (FAQ) : « When the extension is active and you're browsing supported marketplaces while
  signed in, it can detect sales events and add them to your Sales & Analytics. If something is missed (older
  orders or platforms you didn't visit recently), you can: Use Send to Sales on a listing ».
- **Vinted** : « Lite », vente non détectée, donc aucun retrait automatique déclenché par une vente Vinted (page
  tarifs, § 1).
- **Shopify** : la FAQ dit « Shopify is not currently supported by Automatic Sales Detection or Auto Delist »,
  alors que la même FAQ le cite parmi les places de marché d'Auto Delist. C'est une contradiction interne.
- La définition de la page tarifs diffère aussi : « Auto Delist — Automatically delist items from other
  marketplaces when you mark them as sold in List Perfectly. »

---

## 7. Republication / relist

- **Delist / Relist** :
  - Tarifs : « Delist and relist your active listings with the click of a button ». Selon le tableau, absent en
    Simple, relist en lot seulement en Business, complet en Pro et Pro Plus.
  - FAQ : « Relist/Boost: Create a fresh copy (or refresh) on a marketplace to regain visibility. You control
    titles, prices, and photos before relisting. »
- **Stale Listings** (Pro Plus) : « Get alerts when a listing is going stale. Update, relist, or remove it before
  it loses visibility. »
- **Republication programmée ou automatique** : aucune mention sur les pages lues. Le billet du 29/05/2026 pose
  qu'ils ne publient jamais à la place de la personne.
- **Poshmark** : automatisations dédiées.
  - « Poshmark Sharing », en Pro.
  - « Poshmark Auto Offers & Follow Backs », en Pro Plus : « Automatically send offers to likers ».

---

## 8. Stock, ventes, statistiques

- **Catalogue** : « Your personal inventory system for organizing, tracking, and managing all your listings in
  one place. »
- **Ventes** :
  - « Sales Analytics Dashboard — Access to sales and analytics dashboard to view insights from detected sales or
    manually added sales. » À partir de Business.
  - Export CSV à partir de Business.
- **Outils de stock** :
  - « SKU Generator » ; « Inventory Labels » avec codes QR (Pro et au-delà) ; « Pick List » ; « Issue Finder ».
  - « Custom Marketplaces » pour suivre des ventes locales ou sur des plateformes non prises en charge.
- **Multi-quantité** : « Sales subtract from the main listing's quantity and tie back to that one record » (FAQ).
- **Comptes** :
  - Plusieurs boutiques sur une même plateforme (« Multi Store Support ») à partir de Business.
  - Sous-comptes d'équipe en Pro Plus : 1, 4 ou 9 selon le palier.
- **Champs transmis** (aide « Subscription Plans », 27/05/2026) :
  - Simple : photos, titre, description et prix seulement.
  - Business : ajoute marque, couleur, taille, quantité, SKU.
  - Pro et Pro Plus : ajoutent mots-clés, PDSF, code-barres, état, poids et dimensions d'expédition.

---

## 9. Prix (au 2026-10-09)

Source : https://listperfectly.com/pricing et https://listperfectly.com/pro-plus-plan/features-and-tiers/

| Formule | Prix | IA / mois | Scans / mois | Détourages / mois | Points marquants |
|---|---|---|---|---|---|
| Simple | 29 $/mois | 25 | 25 | 25 | crosslisting illimité ; titre, description, prix seulement ; pas d'import (tableau) |
| Business | 49 $/mois | 50 | 50 | 50 | import, multi-boutiques, statistiques de ventes, CSV, relist en lot |
| Pro | 69 $/mois | 200 | 100 | 1 500 | détection des ventes, Mark Sold et End Listing, partage Poshmark, Shopify |
| Pro Plus palier 1 | 99 $/mois | 1 000 | 1 000 | 3 000 | **Auto Delist**, Stale Listings, 1 sous-compte |
| Pro Plus palier 2 | 149 $/mois | 2 500 | 2 500 | 7 500 | 4 sous-comptes |
| Pro Plus palier 3 | 249 $/mois | 5 000 | 5 000 | 15 000 | 9 sous-comptes |

- **Devise** : dollar US (« $ »), aucune autre devise affichée.
- **Engagement** : facturation au mois (« Subscription is billed monthly »), aucun tarif annuel publié, « There's
  no annual contract ».
- **Paiement** : « Credit cards, debit cards, and PayPal ».
- **Message commercial** : « All-Inclusive Pricing. Zero Add-Ons. Zero Surprises. » ; « Unlimited Crosslisting &
  Listings Included in Every Plan at No Extra Cost ».
- **Essai** :
  - FAQ, première réponse : « Yes! New members get 100 free listings plus a 5-day money-back guarantee. »
  - FAQ, plus bas : « Do you offer a free trial? No. We require a credit card (or PayPal) at sign-up. We offer a
    5-day or up to 100 listings money-back guarantee (whichever comes first). »
  - Les deux réponses figurent sur la même page.
  - Décompte (billet du 03/04/2026) : « Each marketplace counts as one listing ».
- **Promotion** : code « LP30 », « 30% off any plan on your first month » (billet du 29/05/2026 ; validité actuelle
  non vérifiée).
- **Changement de formule** : la montée prend effet tout de suite, au prorata ; la descente aussi, sans
  remboursement (FAQ).

---

## 10. Notes publiques (relevées le 2026-10-09)

| Source | Note | Volume | Détail |
|---|---|---|---|
| Chrome Web Store, version stable | **4,1/5** | **22 notes** | 9 000 utilisateurs ; version 1.0.188.2 du 6 octobre 2026 ; « The publisher has a good record with no history of violations » |
| Chrome Web Store, version bêta | **4,4/5** | **29 notes** | 4 000 utilisateurs ; version 2.0.189.7 du 9 octobre 2026 |
| App Store (US) | aucune fiche | — | recherche par l'API iTunes : aucune application de l'éditeur |
| Google Play | aucune fiche | — | recherche Play : aucune application de l'éditeur |
| Trustpilot | **non vérifiable** | — | `curl` refusé (403 « Verifying Connection »). WebFetch rend 404 sur `trustpilot.com/review/listperfectly.com` et sur `/review/www.listperfectly.com`. Deux recherches web n'ont trouvé aucune page Trustpilot pour List Perfectly. Il n'y en a probablement pas, mais ce n'est pas prouvé. |

---

## 11. Ce qu'ils font bien (honnêtement)

- **Ancienneté et largeur du catalogue US.**
  - Chronologie depuis 2015, lancement public en avril 2019 (« first-ever company to offer crosslisting to
    Poshmark »).
  - 14 places de marché US, dont des niches (Vestiaire Collective, Grailed, Reverb, Whatnot) ; Reverb ajouté cette
    semaine.
- **Lisibilité de l'offre.** Annonces et crosslisting illimités dans toutes les formules ; les seules limites sont
  des quotas annoncés (IA, détourage, scans).
- **Deux façons de travailler**, présentées clairement : de place de marché à place de marché sans import, ou via
  le catalogue.
- **Smart Import** : rapprochement entre plateformes avec revue humaine.
  - Filtres « Needs review / Auto-matched / Single », pourcentage de correspondance, fusion manuelle, revue des
    doublons sur une même plateforme.
  - Import exécuté côté serveur, navigateur fermé possible.
  - C'est proche, dans l'esprit, du « rattachement avant stock » de FillSell.
- **Outils annexes complets** : IA à partir de 1 à 6 photos, code-barres, détourage PhotoRoom, Google Lens et
  comparables eBay, SKU, étiquettes QR, liste de préparation, alertes d'annonces « stale », multi-quantité,
  sous-comptes avec permissions.
- **Posture de conformité explicite.** La personne publie elle-même et ne donne jamais ses mots de passe (« We
  never ask for your marketplace passwords or user IDs »). Ils s'en servent pour expliquer qu'ils gardent Vinted
  quand d'autres outils l'ont abandonné.
- **Accompagnement humain et communauté.**
  - « Real human support, every day! Including weekends and holidays », support « in-house », jamais externalisé.
  - Séances d'accueil quotidiennes en direct (Listing Party), « Customer Support 411 » en semaine.
- **Contenu abondant** : 314 billets dans `post-sitemap.xml`, dont 3 sur Vinted (10/04, 05/05 et 29/05/2026).
  Plusieurs FAQ sont rédigées en questions-réponses, faciles à reprendre par les moteurs et les IA.
- **Extension à jour.** Deux canaux, stable et bêta, mis à jour cette semaine. Fiche Chrome « good record with no
  history of violations ».

---

## 12. Écarts factuels avec FillSell (sans dénigrement)

| Point | List Perfectly (source) | FillSell |
|---|---|---|
| Pays servis | support officiel États-Unis seulement (CGU § U, FAQ) | France |
| Vinted | vinted.com seulement (manifeste) ; « Lite » : vente non détectée, pas d'Auto Delist déclenché par Vinted | Vinted France |
| Leboncoin, Beebs | absents | pris en charge |
| eBay | ebay.com (et ebay.ca au manifeste) ; « eBay Italy is not supported » | eBay France |
| Application mobile | aucune application native ; navigateur mobile pour brouillons, images et prix | applications iOS et Android ; le téléphone pilote |
| Point de départ | ordinateur (extension obligatoire pour crosslister) | téléphone ; l'ordinateur exécute |
| Publication | la personne clique « publier » sur chaque place de marché | — |
| Retrait automatique | Pro Plus seulement (99 $ et plus), appareil allumé, quantité 1, hors Vinted | — |
| Langue, devise | anglais, dollar US | français, euro |
| Droits des consommateurs UE | fiche Chrome : « Non-trader … consumer rights do not apply » | — |

Les cases « — » ne sont pas comparées ici : ce rapport ne vérifie que List Perfectly.

---

## 13. Contradictions relevées sur leurs propres pages

1. **Essai gratuit** : « Does List Perfectly offer free trials? Yes! » puis « Do you offer a free trial? No. »,
   sur la même FAQ.
2. **Liste des plateformes** : 14 sur /platforms (avec Listing Party et Reverb), 9 sur /pricing (Vinted « LITE »,
   sans Whatnot ni Reverb), 9 dans la FAQ (sans Vinted ni Reverb), 8 dans l'aide du 11/09/2025.
3. **Formule Simple** :
   - Le tableau met « Mark Sold ✗ », « Import Existing Listings ✗ », « Delist / Relist ✗ ».
   - La carte Simple affiche pourtant « Mark sold ».
   - La FAQ dit « All plans include: … Import & Crosslist; Delist / Relist & Update; Mark Sold (unlimited) ».
   - Le billet du 25/09/2025 annonce l'import « available for new customers on all plans ».
4. **Shopify et Auto Delist** : Shopify est cité parmi les places de marché d'Auto Delist, puis déclaré « not
   currently supported by Automatic Sales Detection or Auto Delist ».
5. **Définition d'Auto Delist** : « when you mark them as sold in List Perfectly » (tarifs) contre « When a sale
   is detected, the extension ends that item's listings » (FAQ).
6. **Contact** : « Chat or email us anytime » (accueil) contre « Phone or chat service is not available at this
   time » (contact).
7. **eBay Canada** : « unable to support » (contact), alors que `ebay.ca` figure dans le manifeste.
8. **Adresse** : Phoenix (FAQ, CGU) et Scottsdale (Chrome Web Store).

---

## 14. Ce qu'on ne peut pas vérifier sans compte

- Le comportement réel de l'extension sur un compte Vinted européen. Le manifeste n'autorise pas vinted.fr, mais
  aucun essai n'a été fait.
- La qualité réelle du Listing Assistant (justesse des titres, descriptions et caractéristiques) et de Smart Import
  (taux de bonnes correspondances).
- La fiabilité et le délai de la détection des ventes et d'Auto Delist, qui dépendent de la navigation et d'un
  appareil allumé.
- Ce que transmet exactement « Background Update », et sur quelles places de marché.
- La validité actuelle du code LP30, les taxes appliquées, et l'existence d'un tarif annuel hors site.
- Le nombre de clients : seuls les 9 000 + 4 000 utilisateurs Chrome sont publics, avec un recoupement possible
  entre les deux.
- La note Trustpilot (§ 10).
- Le contenu derrière la connexion : catalogue, tableau de bord des ventes, « Connection Wizard ».

---

## 15. Remarques SEO / GEO (constats)

- Site WordPress avec Yoast SEO Premium 24.5 (en-tête de la page 404). Pas de `llms.txt` (404) ; `robots.txt`
  rend 404 (nginx).
- Trois billets Vinted en 2026 (10/04, 05/05, 29/05), en anglais, centrés sur « crosslist to Vinted ». Aucun ne
  précise le pays. Une requête anglophone « crosslist Vinted » peut donc remonter List Perfectly devant un
  francophone, sans que l'outil serve la France.
- Une FAQ structurée en questions-réponses courtes, sur le site et sur le centre d'aide Intercom, couvre « Can I use
  List Perfectly outside the United States? ». Une IA qui la lit peut répondre correctement que l'outil est limité
  aux États-Unis.

---

## 16. Sources (toutes lues le 2026-10-09)

| URL | Ce qui y a été relevé | Date de la page |
|---|---|---|
| https://listperfectly.com/ | IA à partir de photos, Auto Sales Detection & Delist, support 24/7/365, 100 annonces offertes | — |
| https://listperfectly.com/pricing | formules, prix, tableau des fonctions, Vinted « Lite », mobile par navigateur | — |
| https://listperfectly.com/pro-plus-plan/features-and-tiers/ | paliers Pro Plus 99, 149 et 249 $ | — |
| https://listperfectly.com/platforms/ | « Cross-list to 14 marketplaces », lien vinted.com | — |
| https://listperfectly.com/faq/ | Auto Delist, détection des ventes, États-Unis seulement, mobile, essai, paiement | — |
| https://listperfectly.com/contact/ | « sell in USD currency on a marketplace based in the USA », pas de téléphone ni de chat | — |
| https://listperfectly.com/about-us/ | fondatrices, mission | — |
| https://listperfectly.com/about-us/timeline/ | Vinted en janvier 2026, Whatnot en octobre 2025, lancement en avril 2019 | — |
| https://listperfectly.com/tos/ | § U, usage aux États-Unis ; droit californien ; consentement des utilisateurs UE | 17/09/2025 |
| https://listperfectly.com/selling/vinted-marketplace-supported-in-list-perfectly/ | Vinted dans toutes les formules | 10/04/2026 |
| https://listperfectly.com/selling/list-perfectly-vinted-integration-compliant-crosslisting/ | « does not automatically publish » ; d'autres outils ont quitté Vinted ; code LP30 | 29/05/2026 |
| https://listperfectly.com/selling/what-to-sell-on-vinted-reseller-tips/ | stratégie Vinted, sans pays | 05/05/2026 |
| https://listperfectly.com/selling/boost-your-sales-with-100-free-listings-using-list-perfectlys-listing-assistant/ | 1 à 6 images, décompte des 100 annonces | 03/04/2026 |
| https://listperfectly.com/tips/list-perfectly-one-click-import-unlimited/ | import en un clic, « all plans » pour les nouveaux clients | 25/09/2025 |
| https://listperfectly.com/tips/how-to-enable-your-list-perfectly-extension-in-google-chrome/ | extension sur ordinateur seulement, mobile par navigateur | 20/07/2026 |
| https://help.listperfectly.com/en/articles/11465703-list-perfectly-onboarding-guide | Smart Import (bêta), Connection Wizard, Vinted connectable | 25/08/2026 |
| https://help.listperfectly.com/en/articles/11828301-list-perfectly-subscription-plans | champs transmis par formule, paliers | 27/05/2026 |
| https://help.listperfectly.com/en/articles/17318042-new-reverb-and-background-update | Reverb, Background Update, nom « List Perfectly Multi-Channel » | 06/10/2026 |
| https://help.listperfectly.com/en/articles/11106082-can-i-use-list-perfectly-outside-the-united-states | États-Unis seulement | 26/12/2025 |
| https://help.listperfectly.com/en/articles/12263549-which-marketplaces-are-supported | liste de 8 places de marché (article ancien) | 11/09/2025 |
| https://help.listperfectly.com/en/articles/12263585-can-i-crosslist-on-my-phone | crosslisting sur ordinateur seulement | 11/09/2025 |
| https://help.listperfectly.com/en/articles/12263546-how-does-list-perfectly-s-automatic-sales-detection-work | détection des ventes par la navigation | 11/09/2025 |
| https://app.listperfectly.com/version/ | liens Chrome Web Store stable et bêta, Chrome ou Edge | — |
| https://chromewebstore.google.com/detail/list-perfectly-multi-chan/flpmljgbaphneikdjhmekdpiamkejfon | 4,1/5, 22 notes, 9 000 utilisateurs, v1.0.188.2, « Non-trader » | mise à jour du 06/10/2026 |
| https://chromewebstore.google.com/detail/list-perfectly-multi-chan/cfglgfaclpncclmjbbdhkhpnfbapoahp | 4,4/5, 29 notes, 4 000 utilisateurs, v2.0.189.7 | mise à jour du 09/10/2026 |
| CRX public (clients2.google.com), `manifest.json` des deux identifiants ci-dessus | domaines autorisés : vinted.com seulement ; ni leboncoin, ni beebs, ni ebay.fr | 2026-10-09 |
| https://itunes.apple.com/search?term=list+perfectly&entity=software&country=us | aucune application de l'éditeur | 2026-10-09 |
| https://play.google.com/store/search?q=list%20perfectly&c=apps | aucune application de l'éditeur | 2026-10-09 |
| https://www.trustpilot.com/review/listperfectly.com | 403 avec `curl`, 404 avec WebFetch : non vérifiable | 2026-10-09 |
| https://listperfectly.com/post-sitemap.xml | 314 billets, dont 3 sur Vinted | 2026-10-09 |
