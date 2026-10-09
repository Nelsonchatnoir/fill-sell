# Fiche de faits — Depop (marché France et anglophones de l'UE, 09/10/2026)

> Sert à écrire `/plateformes/depop` et `/en/platforms/depop`, le trajet `/crosslisting/vinted-depop`
> (et `/en/crosslisting/vinted-depop`), `/fonctions/republication`, `/fonctions/synchronisation`,
> `/fonctions/ventes-et-retraits`, `/securite-des-comptes`, le comparatif et l'article
> `comment-calculer-profits-vinted` (« frais Depop justes et datés », `PLAN.md` § 3).
> Observé le **2026-10-09, entre 17:15 et 18:45 (heure de Paris)**. Lecture seule : aucune connexion à un
> compte (Depop, FillSell ou autre), aucun SQL, aucun commit, aucun déploiement, aucune action publique.
> Rien n'a été écrit hors de ce fichier.
>
> **Décisions de Nico du 09/10 (elles priment sur la fiche de vérité F54 « ne pas nommer Depop ») :**
> Depop est présentée PARTOUT (publication, synchronisation, retrait des copies à la vente, republication
> automatique) ; ton offensif ; seule limite : **rien que l'app ne fasse au moment de la mise en ligne**.
> Cette fiche dit donc, pour chaque promesse Depop, ce que le code fait AUJOURD'HUI et ce qui doit être
> vrai le jour du GO (§ 13.1 et § 13.4). **Point bloquant : la republication AUTOMATIQUE Depop n'existe
> pas dans le code au 09/10 (§ 13.4)** — le texte est prêt, il ne se publie qu'après vérification.

## 0. Méthode et limites (à lire avant de citer quoi que ce soit)

| Source | Lue ? | Remarque |
|---|---|---|
| **Centre d'aide officiel** `depophelp.zendesk.com` | **oui** : API publique en lecture du centre d'aide (`/api/v2/help_center/en-gb/articles.json`), **166 articles**, corps complet, avec la date de dernière modification du texte (`edited_at`) | Le centre d'aide n'existe qu'en **anglais** : locales `en-gb` et `en-us` seulement (`/api/v2/help_center/locales.json`, lu le 09/10) ; `en-us` ne rend aucun article. Aucune page d'aide française. |
| **Conditions d'utilisation** (*Terms of Service*), article d'aide 360001773148 | **oui**, texte intégral, toutes les versions archivées dans la page | Version en vigueur : « These terms take effect on 6 October 2026 » ; versions antérieures dans la même page : 22/07/2026, 29/03/2026, « Effective until 28 March 2026 », « until 23 February 2025 », « until 3 November 2024 ». |
| Salle de presse officielle `news.depop.com` | **oui** (rachat par eBay, suppression des frais UK / US / Australie) | Communiqués datés. |
| Site `www.depop.com` (dont `/fr/`) | **non** | **HTTP 403** à toute lecture automatique (Cloudflare), le 09/10. Une capture Wayback a été tentée une fois : 429, puis outil refusé. **Aucun contournement** (consigne : jamais de requête répétée contre un anti-robot). |
| Référentiels publics Depop relevés par FillSell (`docs/plateformes/depop/`, relevé du 08/10 depuis une page depop.com) | **oui** (fichiers du dépôt) | Constantes du formulaire, catalogue, grilles de tailles : **[MESURÉ]**, pas un texte d'aide. |
| Blogs d'éditeurs (Closo, Size.ly, Margeo, Crosslist, Vendoo…) vus dans les moteurs | survolés | **Jamais une preuve d'un fait sur Depop.** Plusieurs se contredisent sur les frais hors UK/US. Non cités. |
| Code FillSell | **oui**, en lecture : worktree `seo-crosslisting` (8fa7007) ET `main` (d1b7ac1, 09/10 16:05, = `origin/main`), via `git show main:…` | Le dossier principal `C:\Users\nicol\fill-and-sell` n'a été que lu (git), jamais écrit. Ses modifications non commitées (autre terminal : 0.6.107, `EcranDoublons.jsx`, trois migrations du 09/10 soir) ne touchent ni Depop ni la republication (lu par `git diff`). |

**Étiquettes** : **[OFF]** texte officiel Depop lu le 09/10 · **[PRESSE-OFF]** communiqué de la salle
de presse Depop · **[MESURÉ]** relevé par FillSell sur depop.com (référentiel public ou compte de Nico),
documenté dans `docs/plateformes/depop/` · **[CODE]** code FillSell, fichier et ligne · **[INTERNE]**
document de reprise, jamais publiable comme un fait sur Depop.

**Vocabulaire officiel Depop (anglais, aucune version française officielle lue)** — à garder tel quel
entre parenthèses quand on traduit :
- *Selling fee* (frais de vente), *payment processing fee* (frais de paiement), *Marketplace fee*
  (frais acheteur, UK/US seulement), *Boosted Listings* / *boosting fee* (mise en avant payante),
  *Depop Payments* (Stripe, UK/US/Australie), *Depop Protection*, *Depop Shipping* (étiquettes,
  UK/US/Australie), *Selling Hub*, *Bulk Listing*, *Top Seller*, *Vacation Mode*, *Bundles*,
  *Make Offer*, *Repop*.
- Société : « Depop Limited, registered in England and Wales under company number 08316342 »,
  1 More London Place, Londres. Représentant UE (DSA) : « Depop Ireland Limited », Dublin.

---

## 1. La plateforme en bref

| Fait | Étiquette | Source (lue le 09/10/2026) |
|---|---|---|
| « Depop is a fashion marketplace with a global community » ; accessible par l'app ou le site. | [OFF] | CGU § 1 — https://depophelp.zendesk.com/hc/en-gb/articles/360001773148-Terms-of-Service |
| Âge minimum : 13 ans. Usage professionnel permis : « You can use Depop for business purposes » (le vendeur pro est un « Business User »). | [OFF] | CGU § 4 |
| **eBay a racheté Depop** : rachat annoncé le 17/02/2026 (« for approximately $1.2 billion in cash », vendu par Etsy), **finalisé le 30/07/2026**. Depop garde sa marque : « Is Depop being rebranded as eBay? No. » ; comptes non fusionnés ; « There are no planned changes to fees or payments at this time. » | [PRESSE-OFF] [OFF] | https://news.depop.com/company-news/ebay-to-acquire-depop-from-etsy/ (17/02/2026) ; https://news.depop.com/company-news/ebay-completes-acquisition-of-depop/ (30/07/2026) ; https://depophelp.zendesk.com/hc/en-gb/articles/43972530939665-eBay-to-acquire-Depop-FAQ (30/07/2026) |
| Volume : « annual gross merchandise sales (GMS) of approximately $1 billion in 2025 ». | [PRESSE-OFF] | communiqué du 17/02/2026 (lien ci-dessus) |
| Fondée en 2011, siège à Londres, bureau à New York, ≈ 500 salariés. | [PRESSE-OFF] | « About Depop » du communiqué du 03/07/2026 (lien § 5) |
| Interface du compte de test FillSell (France, euros) : **en anglais même sous `/fr/`**. | [MESURÉ] [INTERNE] | `docs/plateformes/depop/CARTOGRAPHIE.md` (en-tête, § 7) |

## 2. Frais

### 2.1 Vendeur en France (et dans toute la zone euro) : **10 % de frais de vente** [OFF]

Source unique : « Seller fees and charges », texte modifié le **21/07/2026**
(https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges).

- « Sellers outside of the UK, US and AUS — Depop Selling fees — 10% on all sales »
- « The selling fee is charged on the item sale price (excluding taxes) and, if you haven't used a
  Depop Shipping label, the shipping cost. » (En France, aucune étiquette Depop n'existe — § 4 — :
  le port entre donc dans la base des 10 %.)
- « The selling fee applies to sellers outside of the UK, US, or AUS and selling in a currency other
  than GBP, USD, or AUD. »
- Frais de paiement : « Sellers outside of the United Kingdom, United States and Australia will pay a
  payment processing fee via PayPal. PayPal's fee may vary depending on your location and PayPal
  account setup ». (Barème PayPal : **non lu**, ne pas chiffrer.)
- Prélèvement : par PayPal, « the Selling fee and PayPal's payments processing fee are then deducted as
  separate charges from your PayPal account ».
- Lots (*bundles*) hors UK/US : frais Depop **par article** ; « both Depop fees and PayPal fees apply
  per item » (https://depophelp.zendesk.com/hc/en-gb/articles/360017585774-Bundles, 17/06/2026).
- Remboursement de la vente : les frais sont annulés ; hors UK/US/Australie avec PayPal, il faut ouvrir
  un ticket au support (même article « Seller fees and charges »).
- Mise en avant payante (*Boosted Listings*) : « Sellers outside of the UK and US: Boosting fee 8% »
  (même article). **Disponibilité réelle du Boost en France : non vérifiée** (l'article *Boosted
  Listings* ne décrit que UK/US 12 % et Australie 8 %).

### 2.2 Suppression des frais de vente ailleurs (dates officielles) [PRESSE-OFF]

| Marché | Frais de vente supprimés | Frais acheteur (*Marketplace fee*) | Source |
|---|---|---|---|
| Royaume-Uni | « removal of the 10% selling fee for new listings created from 20th March onwards » (2024) | « up to 5% of the item purchase price » + « a fixed amount of up to £1 », « from 15th April 2024 » | https://news.depop.com/company-news/evolving-our-fee-structure-with-zero-selling-fees-on-depop/ (21/03/2024) |
| États-Unis | « from today onwards » = **15/07/2024** (nouvelles annonces) | jusqu'à 5 % + jusqu'à 1 $, « from July 18th 2024 » | https://news.depop.com/company-news/depop-removes-selling-fees-in-the-united-states-evolves-fee-structure/ (15/07/2024) |
| Australie | à partir du **22/07/2026** (ventes en AUD) | article australien distinct | https://news.depop.com/company-news/depop-makes-selling-free-in-australia-helping-people-earn-more-from-fashion-resale/ (03/07/2026) |
| **France / UE** | **non** : 10 % au 09/10/2026 (§ 2.1) | **aucun** dans le texte (§ 2.3) | « Seller fees and charges » (21/07/2026) |

### 2.3 Acheteur en France [OFF]

- « What is the Marketplace fee? » (texte du 21/07/2026) : le prix payé comprend l'article, le port, la
  TVA ou taxes, et « The Marketplace fee (if you are located in the UK or US) ». Le frais n'est appliqué
  qu'aux achats « in the UK and the US in either GBP (£) or USD ($) ».
  → **Aucun frais acheteur Depop n'est décrit pour un acheteur situé en France.**
  https://depophelp.zendesk.com/hc/en-gb/articles/21752555753361-What-is-the-Marketplace-fee
- Paiement acheteur hors UK/US/Australie : PayPal, ou carte « as a guest » via PayPal
  (« you don't need a PayPal account to buy and sell on Depop » — mais le vendeur, lui, doit relier un
  compte PayPal, § 3). https://depophelp.zendesk.com/hc/en-gb/articles/360001772668-Using-PayPal-on-Depop

### 2.4 Repère pour l'article « calculer ses profits » (faits officiels, datés)

| Plateforme | Ce que paie le vendeur particulier en France | Source |
|---|---|---|
| Vinted | « Vinted n'applique aucun frais de vente » (frais côté acheteur) | `plateforme-vinted.md` § 2.1 (help/26) |
| Depop | **10 %** du prix hors taxes **+ port** (pas d'étiquette Depop en France) **+ frais PayPal** (variables) | § 2.1 |

Écrire « au 09/10/2026, d'après la page officielle mise à jour le 21/07/2026 ». Ne jamais écrire
« Depop est gratuit pour les vendeurs » sans « au Royaume-Uni, aux États-Unis et en Australie ».

## 3. Pays, compte vendeur, paiement

| Fait | Étiquette | Source |
|---|---|---|
| Paiement : « All items purchased on Depop must be paid for using Depop Payments via Stripe or PayPal. No other payment methods are allowed. » | [OFF] | CGU § 8 |
| « PayPal can only be used to make or receive payment on Depop outside of the United Kingdom, United States and Australia. » → **en France, le vendeur encaisse par PayPal.** | [OFF] | CGU § 8.8 ; « Using PayPal on Depop » (13/08/2026) |
| Pour mettre en vente : « You have an active PayPal account, and it is linked to your Depop account if you're outside the UK, US, or Australia. » | [OFF] | https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item (11/09/2026) |
| Constaté : tant que PayPal (ou Stripe) n'est pas relié, Depop **enregistre l'annonce en brouillon** et exige « Add payment info » (`canSell` faux). | [MESURÉ] 08/10, compte de Nico | `CARTOGRAPHIE.md` § 8 |
| Paiement « out-of-app » = « a serious breach of the Terms of Service ». | [OFF] | CGU § 8.9 |
| Devise : celle des réglages du téléphone ; changer de devise ne vaut que pour les nouvelles annonces (« you'll need to re-list them »). | [OFF] | https://depophelp.zendesk.com/hc/en-gb/articles/360001791287-How-do-I-change-the-currency-of-my-items (11/09/2026) |
| **Liste officielle des pays où l'on peut vendre : aucune trouvée.** Vendre depuis la France est possible : textes « Sellers outside of the UK, US and AUS » (§ 2.1), article « EPR in France » (« Selling to buyers in France? »), DAC7 pour les résidents UE ; et parcours réel FillSell sur un compte français en euros (09/10). La liste de localisation du formulaire compte 237 entrées dont FR — elle ne prouve rien sur l'ouverture à la vente. | [OFF] [MESURÉ] | § 2.1 ; § 12 ; `docs/plateformes/depop/brut/listing-location-countries.json` ; `docs/reprise/terminal-depop-0910.md` |
| Audience UE déclarée au titre du DSA : « the average monthly active recipients of Depop in the European Union was **approximately 280k** » (01/02/2026 → 31/07/2026). | [OFF] | https://depophelp.zendesk.com/hc/en-gb/articles/13057572688273-EU-Digital-Services-Act (« Last updated: 28th September 2026 ») |
| API Depop : « Our API is not currently open to the public » (accès sur demande, business@depop.com) ; « We also work closely with crosslisting tools via API connection. » | [OFF] | https://depophelp.zendesk.com/hc/en-gb/articles/4411154329233-Selling-as-a-charity-or-business (24/09/2026) |

## 4. Envoi (vendeur en France) [OFF]

| Fait | Source |
|---|---|
| « If you're a seller located outside the US or UK, you can use your preferred method to ship the item to your buyer wherever they are. » | https://depophelp.zendesk.com/hc/en-gb/articles/360001771988-How-to-ship-Worldwide (11/09/2026) |
| Suivi obligatoire en pratique : « Always use a tracked shipping method » ; « it is always your responsibility to send items tracked and keep your receipt ». CGU § 9 : fournir « valid proof of tracked shipping ». | idem ; CGU § 9 |
| Prix du port : fixé par le vendeur à l'annonce ; international en option (« Tap Worldwide and toggle on ») ; estimer selon taille et poids. | « How to ship - Worldwide » |
| « most sellers ship within 2 days » (conseil, pas un délai imposé hors US). | idem |
| **Étiquettes Depop (*Depop Shipping*) et *Depop Protection* pour vendeurs : UK, US, Australie seulement.** « If you're a seller based outside of the UK, US or Australia, Depop Protection is not available. » | https://depophelp.zendesk.com/hc/en-gb/articles/360001845367-Depop-Protection-for-sellers (06/10/2026) |
| Formulaire (compte français) : prix de port national **obligatoire** (strictement inférieur à 100), international facultatif ; **aucun poids ni format de colis** demandé. | [MESURÉ] `CARTOGRAPHIE.md` § 3 |

## 5. Public (chiffres officiels, datés — à citer avec leur périmètre)

| Chiffre | Périmètre et date | Source |
|---|---|---|
| « 7 million active buyers, nearly 90% of which are under the age of 34, and more than 3 million active sellers » | **monde**, « As of December 31, 2025 » | https://news.depop.com/company-news/ebay-to-acquire-depop-from-etsy/ (17/02/2026) |
| « approximately 56 million registered users » | **monde**, inscrits (pas actifs), communiqué du 03/07/2026 | https://news.depop.com/company-news/depop-makes-selling-free-in-australia-helping-people-earn-more-from-fashion-resale/ |
| « approximately 280k » destinataires actifs mensuels moyens | **Union européenne**, 01/02 → 31/07/2026 | DSA (lien § 3) |
| Public décrit par Depop : « a younger, fashion-forward, and sustainability-conscious audience » ; eBay : « highly-engaged Gen Z and Millennial customer base » | qualitatif | « Selling as a charity or business » ; communiqué du 30/07/2026 |
| **Nombre d'utilisateurs en France : aucun chiffre officiel.** | — | — |

⚠️ Écart à ne jamais masquer : ≈ 280 000 actifs mensuels dans **toute l'UE** pour Depop, contre
31 millions déclarés par Vinted (`plateforme-vinted.md` § 1). Depop est un **débouché en plus**, pas un
marché de masse en France. Les gros chiffres (7 M, 56 M) sont **mondiaux** : toujours le dire.

## 6. Catégories fortes

- Départements du catalogue : Homme (*Menswear*), Femme (*Womenswear*), Enfants (*Kidswear*), « Tout le
  reste » (*Everything else*) ; 322 rubriques proposées par le formulaire web. [MESURÉ] `CARTOGRAPHIE.md` § 1
- Attributs propres à Depop (référentiel public relevé le 08/10) [MESURÉ] :
  - *Source* : Vintage, Preloved, Reworked / Upcycled, Custom, Handmade, Deadstock, Designer, Repaired ;
  - *Age* : Modern, 00s, 90s, 80s, 70s, 60s, 50s, Antique ;
  - *Style* (extraits actifs) : Streetwear, Y2K, Grunge, Gorpcore, Western, Skater, Goth, Boho, Preppy,
    Minimalist, Coquette, Cottage, Utility, Biker, Rave, Avant Garde…
- Beauté : seuls les produits **neufs** sont acceptés (`brand_new`) pour bain/corps, parfum, cheveux,
  maquillage, ongles, soins. [MESURÉ] ; « opened or used cosmetics » = motif de retrait [OFF].
- **Aucune statistique officielle de ventes par catégorie** : écrire « mode, vintage, streetwear » comme
  ce que le catalogue de Depop met en avant (attributs ci-dessus), jamais comme un classement chiffré.

## 7. Règles des annonces [OFF sauf mention]

### 7.1 Photos, vidéo, texte

- **App** : « Add up to four photos and one video » ; **web** : « Add up to eight photos » ;
  « Describe your item, using up to five hashtags » ; catégorie, prix du port, marque et état requis.
  — https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item
- **Pas de champ titre** : le texte de l'annonce est la description seule (Depop fabrique un intitulé
  d'affichage). Description limitée à **1 000 caractères** (constante du formulaire). [MESURÉ]
  `CARTOGRAPHIE.md` § 3 et § 8. L'aide conseille d'ailleurs « Start with a title » DANS la description
  (« Tips for describing your item », 10/09/2025).
- Photos originales seulement : « your listing will be removed if you use stock images »
  (« Selling on Depop », 05/06/2026) ; « Photographs are the DNA of Depop » (« What are 'stock images'? »).
- Guide de la communauté : « Never use stock photos or copied listings » ; « Avoid misleading titles and
  irrelevant hashtags ». — https://depophelp.zendesk.com/hc/en-gb/articles/360026370634-Community-Guidelines
- Marque exacte : « accurate brand names » ; ajouter une marque non vendue « can hurt your listing's
  exposure » (« Improving the search ranking », 21/08/2026). Sans marque : option « Other » du formulaire
  (identifiant `unbranded`). [MESURÉ]
- Prix suggéré par Depop (modèle d'apprentissage, trois stratégies : *Likely to sell*, *Balanced*,
  *Less likely*) — https://depophelp.zendesk.com/hc/en-gb/articles/8579600880529-How-to-price-your-item

### 7.2 Retrait d'une annonce par Depop

Motifs usuels (« Why has my listing been removed? », 11/09/2026) : contrefaçon, cosmétique ouvert ou
utilisé, « an item that was not in your possession », « a spam post, or an item described using
irrelevant hashtags », image qui n'appartient pas au vendeur, « **a post promoting sales outside of
Depop** ». CGU § 7.2 : interdit de « Link to any third party websites, apps or platforms ».
→ **Une annonce Depop ne nomme jamais Vinted, Leboncoin, Beebs ou eBay.**

### 7.3 Outils officiels de Depop pour publier beaucoup

- *Listing on web* : *Bulk Listing*, brouillons multiples, modèles, modifications en lot, import par
  modèle Google Sheet / CSV — https://depophelp.zendesk.com/hc/en-gb/articles/8608273715217-Listing-on-web
- « Listing Migration Tool » de Depop : cité seulement dans le règlement de deux jeux-concours (février et
  avril 2026), **aucune page d'aide** — ne pas en parler.

## 8. Classement et visibilité [OFF]

« How Depop ranks search results and recommends listings » (21/08/2026) :
- pertinence (description, marque, catégorie, couleur…), **popularité** (« views, likes and adds to
  bag »), pays du vendeur (« We mainly show you listings from the country set in your preferences »),
  habitudes de l'acheteur, informations vendeur, Boost, respect des règles ;
- **ancienneté** : « **Newer items get a slight edge, but this counts for much less than factors like
  relevance** » ;
- « Other than Boosted Listings, we don't offer sellers a higher ranking in exchange for payment ».
  — https://depophelp.zendesk.com/hc/en-gb/articles/9422984899985-How-Depop-ranks-search-results-and-recommends-listings

Conséquence pour la republication (retirer puis recréer) : l'annonce neuve gagne le **léger** avantage de
la nouveauté, mais repart de zéro sur la popularité (vues, likes, ajouts au panier de l'ancienne).
C'est le texte de Depop : ne jamais promettre « en tête des résultats ».

*Boosted Listings* : frais seulement si l'acheteur a vu l'annonce boostée et achète sous 28 jours ;
UK/US 12 %, Australie 8 %, hors UK/US 8 % (§ 2.1). —
https://depophelp.zendesk.com/hc/en-gb/articles/10110299060753-Boosted-Listings (24/07/2026)

## 9. Vie d'une annonce et de la boutique [OFF]

- **Annonces inactives** : « Your items will become inactive if you haven't used the app for 28 days or
  more. » Elles redeviennent actives « after you log in or open your Depop app » (jusqu'à une heure).
  — « Why has my listing been removed? » (11/09/2026). **Si l'usage par le site ou par FillSell compte
  comme « utiliser l'app » : non vérifié** (§ 16).
- *Vacation Mode* : pause des achats pendant 7 jours, désactivation automatique ensuite.
  — https://depophelp.zendesk.com/hc/en-gb/articles/12267530258833-Vacation-Mode (22/04/2026)
- *Make Offer* : le vendeur a 14 jours pour accepter, refuser ou contrer ; « you can't send offers on
  items outside your country » ; l'offre n'inclut pas le port.
  — https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer (30/07/2026)
- *Bundles* : remise en pourcentage ou port groupé, réglés par le vendeur (§ 2.1 pour les frais).
- Vente : « We'll notify you by email and in the app once you sell. » (« Selling on Depop »).
- Brouillons partagés entre l'app et le site ; copie d'une annonce existante (« Copy listing »).
- *Repop* : un acheteur peut remettre en vente un article acheté sur Depop, fiche pré-remplie.
- Aucune durée de vie maximale d'une annonce n'est écrite dans les pages lues.

## 10. Ce que disent les CGU de Depop sur les outils tiers et le crosslisting

### 10.1 La clause, mot pour mot [OFF]

CGU, version « take effect on 6 October 2026 », § 7.2 « You may not use the Service to: » :

> « Modify, interfere with, intercept, disrupt or hack the Service, mine data, scrape or crawl the
> Service, including any internal software capabilities used to offer our Service (e.g. an application
> programming interface), or use any bots or other third party software on the Service. **You may
> simultaneously list your items for sale on other platforms and/or marketplaces (each an Alternative
> Platform) via third party cross-listing platforms, as long as you:**
> - **Fully comply with our Terms of Service.**
> - **Remove the item from Depop promptly in the event the item sells on an Alternative Platform.**
> - **Accept full responsibility in the event your item sells on both Depop and an Alternative Platform,
>   including refunding a buyer if the item is no longer available.** »

Source : https://depophelp.zendesk.com/hc/en-gb/articles/360001773148-Terms-of-Service

**Ancienneté** : la même phrase figure dans TOUTES les versions archivées de la page, jusqu'à la plus
ancienne (« Effective until 3 November 2024 »). Elle n'est donc pas nouvelle.

Autres clauses du même § 7.2 utiles à la page sécurité : « Test, circumvent, monitor or breach the
security measures of our Service » ; « Collect any data from the Service other than in accordance with
the Terms of Service » ; « Create more than one Account, unless we agree otherwise » ; « Link to any
third party websites, apps or platforms ».

### 10.2 Lecture pour nos textes (constat, pas un avis juridique)

- Depop est la **seule** des cinq plateformes dont les conditions **nomment et permettent** le
  crosslisting par des outils tiers — sous trois conditions. Citable tel quel, avec le lien.
- La même phrase interdit « bots or other third party software on the Service ». Les deux coexistent :
  **ne jamais écrire** « Depop autorise FillSell », « approuvé / partenaire / conforme aux CGU de Depop ».
  Écrire : « Les conditions de Depop permettent de proposer ses articles ailleurs via un outil de
  crosslisting, à condition de retirer l'annonce Depop quand l'article se vend ailleurs. C'est ce que
  fait FillSell. » (+ lien).
- La condition n° 2 (retirer promptement de Depop) est **exactement** le retrait automatique de FillSell
  (§ 13.2) : point d'appui commercial, citable.

### 10.3 Sanctions prévues [OFF]

CGU § 7.3 : retrait de contenu, retrait temporaire ou définitif du droit d'utiliser le service et/ou
suppression du compte, action en justice, signalement aux autorités. CGU § 14 : suspension possible
« based on a risk or reasonable belief » d'une violation ; sommes non versées retenues jusqu'à 180 jours
après une suspension (§ 8.10).

### 10.4 Protections techniques constatées [MESURÉ, 08/10]

`webapi.depop.com` appelé hors navigateur : **403**, non contourné ; Cloudflare devant le site ; script
anti-fraude **Sift** sur la page de mise en vente ; aucun captcha ni 429 sur ~25 appels espacés.
(`CARTOGRAPHIE.md` § 6.) Ne jamais en tirer « indétectable » ni « sans risque ».

## 11. Rachat par eBay : ce que l'on peut dire

- « eBay completes acquisition of Depop » — 30/07/2026 [PRESSE-OFF] ; FAQ officielle du même jour [OFF].
- Rien ne change pour les vendeurs « at this time » (frais, règles, comptes séparés, marque gardée).
- Pour FillSell : Depop et eBay restent **deux plateformes, deux comptes**. Ne jamais écrire « Depop
  (groupe eBay) passe par l'API eBay » ni laisser croire qu'un compte eBay relié couvre Depop.

## 12. Fiscalité et obligations (utile au blog) [OFF]

- **DAC7** : « Sellers who make over €2000, or sell 30 or more items in a calendar year, and who reside
  in an EU member state, will be reportable » ; « this doesn't necessarily mean you need to pay tax ».
  — https://depophelp.zendesk.com/hc/en-gb/articles/19653371452049-Reporting-income-in-the-EU-DAC7
- **REP / EPR France** : concerne le vendeur qui utilise des **emballages neufs** ou vend des créations
  neuves ; pas celui qui ne vend que de la seconde main dans des emballages réutilisés.
  — https://depophelp.zendesk.com/hc/en-gb/articles/6497240376593-Extended-Producer-Responsibility-EPR-in-France (22/07/2026)

---

## 13. FillSell et Depop — d'après le CODE (lu le 09/10, `main` d1b7ac1)

### 13.0 Comment FillSell travaille sur Depop

| Fait | Réf. |
|---|---|
| **Par l'extension Chrome, dans la session Depop de la personne**, depuis un onglet www.depop.com : le connecteur appelle les mêmes adresses que le formulaire « Sell » de Depop, avec le jeton de la session ouverte par la personne. Hors navigateur, Depop répond 403 : rien n'est contourné. FillSell ne demande pas le mot de passe Depop. | [CODE] `chrome-extension/content-scripts/depop.js` l. 1-40 ; `CARTOGRAPHIE.md` § 8 |
| **Pas d'API Depop** : l'API partenaire de Depop n'est pas publique (§ 3) et FillSell ne l'utilise pas. | [OFF] [CODE] |
| Accès www.depop.com **optionnel** dans l'extension : un clic « Autoriser Depop » (une fois, révocable). Sans ce clic, l'extension n'a ni l'accès ni le code Depop, et le serveur ne lui confie aucun travail Depop. | [CODE] `background.js` l. 11015-11050 ; `get-pending-jobs` v227 (« un job Depop ne va qu'au poste qui déclare `depop_acces` ») ; `Legal.jsx` l. 264-268 |
| Compte Depop **en euros** seulement : un compte rattaché à un pays hors zone euro est arrêté avec « FillSell ne publie sur Depop qu'en euros » (zone euro : 20 pays dont FR, BE, DE, IT, ES, NL…). | [CODE] `depop.js` l. 207, 455-459 |
| Compte vendeur à configurer chez Depop (PayPal relié) : sinon « Depop demande de terminer ta configuration de vendeur… » — jamais confondu avec une déconnexion. | [CODE] `depop.js` l. 97-100, 461-464 |
| Une requête à la fois, pauses entre les pages d'une liste ; une lecture qui échoue « réseau » est relancée deux fois, **jamais une écriture** (correctif `02f9f67`, dans 0.6.106, pas dans le zip 0.6.105). | [CODE] `depop.js` l. 52, 113-127 ; [INTERNE] `terminal-depop-0910.md` |
| Ordinateur allumé, Chrome ouvert, extension active, session Depop ouverte : **tout** ce qui touche Depop passe par là (publication, relevé, ventes, retraits, republication). Ordinateur éteint : tout attend. | [CODE] (aucune voie serveur Depop) |

### 13.1 État de livraison au 09/10 — ce qui doit être VRAI le jour du GO

| Couche | État lu au 09/10 | Pour que Depop soit « ouverte à tous » |
|---|---|---|
| Base | `coin_config.depop_ouvert = 0` ; accès bêta du seul compte de Nico (`depop_autorise`, garde sur 5 tables) | `depop_ouvert = 1` (décision ; aucun code) |
| Extension servie (Chrome Web Store) | **0.6.104** (sans Depop) ; 0.6.105 (Depop, zip prêt) et 0.6.106 (Depop + `02f9f67` + Vinted hors de France) **non publiées** ; 0.6.107 en cours dans un autre terminal | une version ≥ 0.6.105 **servie** par le Web Store (examen Google : délai non maîtrisé) |
| App web | servie depuis `11b421d` (09/10) : contient l'app Depop (`8f88cdd`), fermée par `depop_autorise` | rien (s'ouvre avec le drapeau) |
| App mobile (OTA) | **2.9.67** servie (build `9d203ac`, 08/10) : **ne contient pas** l'app Depop (`8f88cdd` n'en est pas ancêtre, vérifié par git) ; OTA 2.9.68 non lancée à la clôture du terminal Depop | OTA ≥ 2.9.68 servie |
| Republication automatique Depop | **absente** (§ 13.4) | développement + réglage + preuve réelle |

Vérifications à faire par Nico avant de publier (lecture seule, aucune n'a été lancée ici) :
`select key, value from coin_config where key in ('depop_ouvert','republish_planifiee_actif') or key like 'republish_planifiee_pf_%';`
`select public.republish_planifiee_plateformes();` · version servie sur la fiche du Web Store et
`profiles.extension_build` · version OTA servie (Capgo).

### 13.2 Ce que FillSell fait sur Depop (code au 09/10)

| Fonction | Ce qui est vrai | Réf. |
|---|---|---|
| **Publication** | Depop est une case de la publication (jamais cochée d'office : `PLATEFORMES_JAMAIS_PRECOCHEES = ['depop']`). L'extension monte les photos, crée l'annonce, puis la **relit** chez Depop (statut « en vente ») avant de la dire publiée. Réponse perdue pendant la création → vérification de la boutique avant tout nouvel envoi (jamais d'annonce en double). | [CODE] `stockFiltres.js` ; `depop.js` l. 447-566 |
| **Annonce au format Depop** | La copie Depop dérive de la copie Vinted (Lens ne rédige pas Depop à part) : **pas de titre envoyé**, description ≤ 1 000 caractères coupée au dernier mot entier, hashtags au-delà de 5 retirés (les premiers restent) — ce qui est coupé est dit. Rubrique Depop choisie **par identifiant** (jamais par libellé) ; introuvable → « rayon à choisir ». | [CODE] `src/utils/depopPublication.js` l. 1-60 ; `depopCategories.js` ; [MESURÉ] `RATTACHEMENT.md` |
| **Tailles, état, marque, couleurs** | Taille dans la grille EU de Depop (« EUR 38 » ≡ « EU 38 », moteur commun) ; hors grille → question. État dans les 5 états Depop (« Comme neuf » = très bon). Marque cherchée dans la liste Depop ; absente → « Other » (comme le formulaire) ; introuvable ou ambiguë → question. 2 couleurs au plus. Genre exigé pour un article enfant → question. Beauté d'occasion → refus expliqué. | [CODE] `depop.js` l. 283-375 ; `depop-tailles.js` ; commit `9eab08f` |
| **Port et prix** | Prix en euros (≥ 1). Frais de port Depop **demandés à la personne** (« Depop ne calcule rien : tu expédies comme tu veux, avec suivi ») — jamais devinés. Seul le **port national** est envoyé : FillSell n'active pas l'envoi international (*Worldwide*). | [CODE] `depop.js` l. 315-320, 497-525 |
| **Photos** | 8 au plus (règle du formulaire web) ; celles en trop ne partent pas et c'est dit (avertissement `depop_photos_plafond`). | [CODE] `depop.js` l. 54, 553-556 |
| **Synchroniser** | Sur appui seulement : relève les annonces **en vente** de la boutique Depop connectée ; le moteur serveur (rapprochement v3) les range avec le reste du stock : identifiant d'un dépôt FillSell d'abord, puis même photo **et** titre en accord ; doute → question hors du stock ; aucune fiche ne naît sans décision. | [CODE] `depop.js` l. 655-670 ; `background.js` l. 14057-14062 ; `_shared/rapprochement/moteur.js` l. 43 ; `rapprochement` v17-v18 |
| **Ventes Depop** | Une annonce publiée par FillSell est relue sur son identifiant exact : statut `STATUS_PURCHASED` = **preuve positive** → `sale_evidence` exacte → la vente s'**enregistre seule** (cron « ventes prouvées », toutes les 2 min) et arme le retrait des copies **prouvées** ailleurs. Une annonce disparue (404) n'est **jamais** une vente. Le relevé des ventes de la boutique (« vendues ») remplit en plus l'historique. | [CODE] `background.js` l. 11173-11202, 19990-20015, 17030-17075 ; mig 20261008233100 + `enregistrer_ventes_prouvees` (sale_evidence toute plateforme) |
| **Retrait de l'annonce Depop quand l'article se vend ailleurs** | Après une vente **enregistrée** (Vinted, eBay ou Depop : seule ; Leboncoin et Beebs : après l'appui de la personne), le retrait de la copie Depop **prouvée** est armé ; l'extension supprime puis **vérifie** (fiche relue en 404). Jamais par titre ; jamais l'annonce d'un autre compte Depop ; une annonce déjà vendue sur Depop n'est pas supprimée. Copie non prouvée → « Déjà vendu ? ». | [CODE] `depop.js` l. 568-630 ; mig 20261009020000 (`enregistrer_vente_atomique`, boucle des copies, générique) ; mig 20261009110000 |
| **Republication manuelle** | **Existe** : d'un appui, comme Leboncoin et Beebs — suppression puis recréation (« rien n'est retiré sans copie complète ; une suppression partie va au bout ») ; la nouvelle annonce reste rattachée à la même fiche. | [CODE] `src/utils/republication.js` (`PLATEFORMES_REPUBLIABLES` = toutes sauf eBay) ; `background.js` l. 23514-23517 ; mig 20261009020000 (`spend_coins_and_republish` accepte 'depop'), 20261009100000 |
| **Republication automatique** | **N'existe pas** (§ 13.4). | — |
| **E-mail / notification de vente** | Même chemin que les autres plateformes une fois la vente enregistrée (« aucun mail vendu avant une vente enregistrée », mig 20261009160000). Non éprouvé sur une vraie vente Depop. | [CODE] [INTERNE] |

### 13.3 Ce qui a été prouvé en réel, et ce qui ne l'a pas été [INTERNE]

Prouvé le 09/10 (compte de Nico, extension 0.6.105 `f59c1c2`, annonces de test à 999 €, toutes
retirées, « FIN » relue chez Depop) — `docs/reprise/terminal-depop-0910.md` :
relevé (aucune fiche neuve) ; **publication** (POST 201, relue « en vente ») ; **republication**
manuelle (suppression 204 → 404, recréation 201 → « en vente », rattachée à la même fiche) ; **retrait**
(204 → 404) ; publication croisée rattachée par identifiant.

**Non prouvé** : une **vraie vente** Depop de bout en bout (on ne vend pas : la forme d'une annonce
vendue a été lue sur une annonce publique d'un autre vendeur) ; le retrait d'une copie Depop déclenché
par une vente réelle ailleurs ; le parcours sur 0.6.106 (seul 0.6.105 a tourné) ; la durée de vie du
jeton de session Depop.

### 13.4 Republication AUTOMATIQUE Depop : ce que fait le code, ce qui manque

Nico annonce qu'elle arrive avec la bascule du 10/10. **Au 09/10 (main d1b7ac1, poussé), elle n'existe
pas.** Preuves :

| Pièce | Ce qu'elle contient | Réf. |
|---|---|---|
| Liste serveur du module « republication planifiée » (créneaux) | `republish_planifiee_plateformes()` = `['vinted', 'leboncoin', 'beebs', 'opla']` — jamais redéfinie depuis | `supabase/migrations/20260918200100_republication_planifiee_multi_fonctions.sql` l. 51-54 |
| Interrupteur par plateforme | `republish_planifiee_pf_<pf>` dans `coin_config`, **fail-closed** (clé absente = fermée). Posées : vinted, leboncoin, beebs, opla. **Aucune clé `depop`.** Sans elle, `spend_coins_and_republish(p_source => 'auto', p_platform => 'depop')` répond `plateforme_fermee`. | mig 20260918200000 l. 144-147 ; mig 20261009020000 (définition de `spend_coins_and_republish`, bloc « L'AUTO S'OUVRE AUX QUATRE PLATEFORMES ») |
| Migration Depop | « ni republication PLANIFIÉE Depop (republish_planifiee_* inchangées : la republication Depop est manuelle) » | mig 20261009020000 l. 35-38 |
| App | `PLATEFORMES_PLANIFIEES = ['vinted', 'leboncoin', 'beebs', 'opla']` ; tables `NOMS`, `GESTE`, `REMONTE_LE_FIL` sans Depop | `src/hooks/useRepublicationPlanifiee.js` l. 30-33 ; `src/components/RepublicationPlanifiee.jsx` l. 56-84 |
| Bascule du 10/10 | handler-watch coupe seulement `republish_planifiee_pf_opla` (1 → 0). **Rien n'allume Depop.** | `supabase/functions/handler-watch/index.ts` l. 1626-1639 |

Ce qui est **déjà prêt** et servirait tel quel : sélection des annonces candidates générique hors Vinted
(`republish_planifiee_candidats(p_user, p_reglage, p_platform)` : annonces portées par un job FillSell
publié avec son lien, photos sur le stockage FillSell) ; table `republish_creneaux` qui accepte 'depop'
(CHECK + garde `depop_autorise`) ; durée estimée par défaut (`republish_duree_estimee`, 300 s hors
Beebs/Leboncoin) ; extension qui sait republier Depop (manuel prouvé) ; une suppression partie va au bout.

Ce qui **manque** (aucun n'est fait, rien n'a été modifié ici) :
1. migration : ajouter `'depop'` à `republish_planifiee_plateformes()` (à écrire depuis la définition EN
   PROD, `pg_get_functiondef`) et poser `coin_config.republish_planifiee_pf_depop = 1` (journalisé) ;
2. l'état et le réglage (`republish_planifiee_etat_multi`, `republish_planifiee_regler`) ne doivent
   montrer ni accepter Depop qu'aux comptes `depop_autorise` (sinon la garde de `republish_creneaux`
   refuse l'écriture et l'écran casse) — à vérifier dans le code serveur avant d'ajouter Depop à la liste ;
3. app : `PLATEFORMES_PLANIFIEES`, `NOMS`, `GESTE` (« Retrait puis redépôt » / « Remove then repost »),
   `REMONTE_LE_FIL` pour Depop, puis web + OTA ;
4. extension ≥ 0.6.105 servie, `depop_ouvert = 1` ;
5. **une preuve réelle** : un créneau automatique Depop sur le compte de Nico (annonce de test ≥ 999 €,
   retirée ensuite) ;
6. **palier** : dans le code, la republication par créneaux est réservée aux paliers **Pro et Business**
   (balayage : `republish_palier(...) NOT IN ('pro','business')`, mig 20261008140000 ;
   `spend_coins_and_republish` : `IF NOT palier_au_moins(v_user, 'pro')` → refus `auto_reserve_pro`,
   mig 20261009020000 l. 2253-2254 ; l'app affiche « Réservée au plan Pro »,
   `RepublicationPlanifiee.jsx` l. 358 et 727). La décision « elle
   existe à tous les paliers » ne correspond pas au code au 09/10 : **nos textes ne nomment aucun
   palier, mais ne doivent pas non plus écrire « gratuit », « sur tous les forfaits » ou « inclus »
   à côté de la republication automatique** tant que le code n'a pas changé. (Vrai pour les quatre
   plateformes, pas seulement Depop.)

**Si un seul de ces points n'est pas vrai au GO : publier sans Depop dans la liste « republication
automatique » (un geste, § 13.7) et le dire à Nico.** La republication **manuelle** Depop, elle, peut
être dite (« republier d'un appui »).

### 13.5 Ce qui demande un geste de la personne

Se connecter à Depop dans Chrome · cliquer « Autoriser Depop » une fois dans l'extension · avoir un
compte vendeur Depop configuré (PayPal relié) · cocher Depop à la publication · donner ses frais de port
Depop et répondre aux questions (taille hors grille, marque introuvable, genre enfant, rayon) · appuyer
sur « Synchroniser » · trancher « Est-ce le même article ? » et « Déjà vendu ? » · confirmer une vente
Leboncoin ou Beebs (la copie Depop est retirée ensuite) · republier d'un appui · expédier le colis
(avec suivi) et le marquer « expédié » chez Depop.

### 13.6 Limites à dire (ou à ne jamais contredire)

Ordinateur allumé avec Chrome ; compte Depop en euros ; port national seulement ; pas de vente Depop
« en temps réel » (aucun délai promis) ; une à une, à un rythme humain ; le retrait suit une vente
**enregistrée** et ne vise que les copies **prouvées** ; les annonces Depop importées (non déposées par
FillSell) ne sont pas candidates à la republication par créneaux (code § 13.4) ; aucune API Depop.

### 13.7 La liste « republication automatique » : une donnée, retirable d'un geste

Aujourd'hui `site/donnees/plateformes.yml` porte `depop: ouverte: false` (raison « ouverte au seul compte
de Nico (09/10) ») et n'a **aucun champ** de republication. Forme proposée (à poser par l'agent qui tient
`site/`, pas ici) :

```yaml
# site/donnees/plateformes.yml — une ligne par plateforme
  - id: depop
    ouverte: true                 # au GO seulement (§ 13.1)
    republication_auto: false     # → true quand § 13.4 est vrai et prouvé ; eBay : absent, jamais affiché
```

Les textes n'écrivent jamais la liste en dur : un jeton (`{{republication_auto}}`) rendu par le build
depuis la donnée — FR « Vinted, Leboncoin, Beebs et Depop », EN « Vinted, Leboncoin, Beebs and Depop » ;
avec Depop à `false` : « Vinted, Leboncoin et Beebs ». Aucune phrase ne compte les plateformes
(« quatre plateformes », « 4/4 ») et aucune image ne la fige (captures et vidéo : une variante sans la
ligne Depop du module de republication doit exister tant que § 13.4 n'est pas prouvé).

### 13.8 Points de friction FillSell ↔ textes de Depop (constat, à trancher par Nico)

| Ce que fait FillSell [CODE] | Ce que disent les textes de Depop [OFF] | Conséquence pour nos textes |
|---|---|---|
| L'extension agit sur depop.com dans la session de la personne, par les adresses internes du site (§ 13.0). | CGU § 7.2 : pas de « bots or other third party software on the Service », ni d'usage de « internal software capabilities … (e.g. an application programming interface) » ; **mais** crosslisting « via third party cross-listing platforms » permis sous conditions. | Citer la clause entière (§ 10.1). Jamais « autorisé / partenaire / conforme ». Jamais « bot ». Écrire « dans ta session, à un rythme humain ». |
| Retrait de l'annonce Depop après une vente enregistrée ailleurs (§ 13.2). | « Remove the item from Depop promptly in the event the item sells on an Alternative Platform. » | **Point d'appui** : citable, c'est la condition de Depop. Ne pas promettre « instantané ». |
| Republication = supprimer puis recréer (§ 13.2). | Classement : « Newer items get a slight edge » ; la popularité (vues, likes, ajouts au panier) compte davantage. | Promettre une annonce **neuve**, jamais « en tête » ni « Boost gratuit ». Dire que les likes de l'ancienne annonce ne suivent pas. |
| « Synchroniser » relit la boutique Depop (§ 13.2). | CGU : pas de « mine data, scrape or crawl ». | Écrire « FillSell relit **tes** annonces », jamais « extrait », « aspire », « scrape ». |
| La description Depop dérive de la copie Vinted (§ 13.2). | Retrait d'une annonce « promoting sales outside of Depop » ; interdit de « Link to any third party websites, apps or platforms ». | **À vérifier par Nico** : aucune copie générée ne mentionne une autre plateforme (non vérifié ici). |
| Annonces inactives après 28 jours sans « utiliser l'app » (§ 9). | Texte officiel ambigu pour un usage par le site. | Ne pas promettre « tu n'ouvres plus jamais Depop ». Question ouverte (§ 16). |

### 13.9 Formulations sûres (dans le cadre des décisions de Nico)

**Pages produit, tutoiement (FR)** — à relire contre § 13.1 et § 13.4 le jour du GO :
1. « Vinted, Leboncoin, Beebs, eBay et Depop : tu remplis ton annonce une fois, FillSell la publie sur
   chaque plateforme que tu coches. »
2. « Depop sans prise de tête : pas de titre, cinq hashtags, la grille de tailles EU, l'état et la marque
   de la liste Depop — FillSell met ton annonce au format Depop, tu n'as plus qu'à relire. »
3. « Appuie sur « Synchroniser » : ta boutique Depop rejoint ton stock, rangée avec tes annonces Vinted,
   Leboncoin, Beebs et eBay. Un article, une fiche — et au moindre doute, FillSell te pose la question. »
4. « Vendu sur Depop ? FillSell enregistre la vente et retire les annonces reliées à cet article sur tes
   autres plateformes. Vendu ailleurs ? Ton annonce Depop est retirée. C'est précisément ce que les
   conditions de Depop demandent. »
5. « Republication automatique sur {{republication_auto}} : tu choisis tes jours et tes heures, FillSell
   republie tes annonces les plus anciennes. » (jeton § 13.7 ; jamais de palier, jamais « gratuit »)
6. « Republie une annonce Depop d'un appui : FillSell la retire, la recrée, et la garde sur la même
   fiche. »
7. « Ton téléphone pilote, ton ordinateur exécute : sur Depop, FillSell travaille dans ta session, sur
   ton Chrome, à un rythme humain. »
8. « Depop, c'est 7 millions d'acheteurs actifs dans le monde, dont près de 9 sur 10 ont moins de
   34 ans (chiffres Depop au 31/12/2025). Ton vintage et ton streetwear y ont leur public. »
9. Comparatif (à re-vérifier contre `concurrents-matrice.md` le jour du GO) : « Au 09/10/2026, aucun
   autre outil de notre comparatif ne publie à la fois sur Vinted, Leboncoin, Beebs, eBay et Depop —
   FillSell le fait, depuis une vraie app iPhone et Android. »

**Pages EN (anglophones en France / UE)** :
1. "Vinted, Leboncoin, Beebs, eBay and Depop: fill in your listing once, FillSell posts it to every
   marketplace you tick."
2. "Depop-ready in one go: no title, five hashtags, EU sizes, Depop's own condition and brand lists —
   FillSell formats your listing for Depop, you just check it."
3. "Tap Sync and your Depop shop joins your stock, grouped with your Vinted, Leboncoin, Beebs and eBay
   listings. One item, one record — and when in doubt, FillSell asks you."
4. "Sold on Depop? FillSell records the sale and takes down the linked listings on your other
   marketplaces. Sold elsewhere? Your Depop listing comes down. That's exactly what Depop's terms ask
   cross-listers to do."
5. "Automatic relisting on {{republication_auto}}: pick your days and hours, FillSell relists your
   oldest listings."
6. "Your phone gives the orders, your computer does the work: on Depop, FillSell works inside your own
   session, in your Chrome, at a human pace."
7. "Depop has 7 million active buyers worldwide, nearly 9 in 10 under 34 (Depop figures, 31 Dec 2025)."

**Blog (vouvoiement)** : « Depop prélève 10 % de frais de vente aux vendeurs basés hors du Royaume-Uni,
des États-Unis et de l'Australie — donc en France — sur le prix hors taxes et les frais de port, plus les
frais PayPal (page officielle mise à jour le 21/07/2026). Au Royaume-Uni et aux États-Unis, ces frais
ont été supprimés en 2024 ; en Australie, le 22/07/2026. »

### 13.10 Depop chez les concurrents (pour les comparatifs, d'après `concurrents.yml`, relevé du 09/10)

| Outil | Depop | Ce qui lui manque face à FillSell (faits) | Ce qu'il fait mieux sur Depop (à dire) |
|---|---|---|---|
| FLUF Connect | oui | Beebs : non | Depop **sans ordinateur** (cloud/API, « partiel ») |
| Crosslist | oui | Vinted fermé aux nouveaux comptes, jamais l'UE ; Leboncoin, Beebs : non ; app absente en France | Depop par API/cloud |
| Vendoo, List Perfectly | oui (US) | Vinted France, Leboncoin, Beebs : non | — |
| Klork | oui (guide) | publie pas vers Vinted ; Beebs « annoncé » ; pas d'app native | — |
| Relistly | oui | Leboncoin « coming soon », Beebs : non | — |
| StoFlow | déclaré au manifeste, non annoncé | — | — |
| FlowDino, Redrip, Reposter, Clemz, DressKare, Margeo, Flypr | non | — | — |

Honnêteté exigée : plusieurs concurrents traitent Depop **ordinateur éteint** (API partenaire) ; FillSell
non. Ne jamais écrire « le seul à faire Depop » ni « Depop même ordinateur éteint ».

## 14. Dix faits citables sur Depop (courts, exacts, sourcés — lus le 09/10/2026)

1. **Les conditions de Depop permettent le crosslisting** : « You may simultaneously list your items for
   sale on other platforms […] via third party cross-listing platforms », à condition de retirer
   l'article de Depop « promptly » s'il se vend ailleurs. — CGU en vigueur au 06/10/2026,
   https://depophelp.zendesk.com/hc/en-gb/articles/360001773148-Terms-of-Service
2. **En France, vendre sur Depop coûte 10 %** du prix (hors taxes) **et du port**, plus les frais PayPal.
   — https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges (21/07/2026)
3. **Les frais de vente ont disparu au Royaume-Uni (20/03/2024), aux États-Unis (15/07/2024) et en
   Australie (22/07/2026)** — pas dans l'Union européenne. — salle de presse Depop (§ 2.2)
4. **En France, le vendeur est payé par PayPal** : « PayPal can only be used […] outside of the United
   Kingdom, United States and Australia » ; un compte PayPal relié est exigé pour mettre en vente.
   — CGU § 8.8 ; « How to list an item »
5. **Une annonce Depop n'a pas de titre** : tout tient dans la description, avec **5 hashtags au plus** ;
   8 photos sur le site, 4 photos et 1 vidéo dans l'app. — « How to list an item » (11/09/2026) ;
   [MESURÉ] pour l'absence de titre
6. **La nouveauté ne pèse pas lourd** : « Newer items get a slight edge, but this counts for much less
   than factors like relevance ». — « How Depop ranks search results » (21/08/2026)
7. **eBay possède Depop depuis le 30/07/2026** (rachat ≈ 1,2 Md$ annoncé le 17/02/2026) ; Depop garde
   sa marque, ses comptes et ses frais. — news.depop.com ; FAQ officielle (30/07/2026)
8. **7 millions d'acheteurs actifs, près de 90 % de moins de 34 ans, plus de 3 millions de vendeurs
   actifs** dans le monde au 31/12/2025. — communiqué du 17/02/2026
9. **Hors Royaume-Uni, États-Unis et Australie, pas d'étiquette Depop ni de *Depop Protection* pour le
   vendeur** : on expédie par le transporteur de son choix, **avec suivi**. — « How to ship - Worldwide »
   (11/09/2026) ; « Depop Protection for sellers » (06/10/2026)
10. **Une annonce qui renvoie vers une autre plateforme peut être retirée** (« a post promoting sales
    outside of Depop »). — « Why has my listing been removed? » (11/09/2026)

En réserve : ≈ 280 000 actifs mensuels moyens dans l'UE (DSA, fév.–juil. 2026) · annonces inactives
après 28 jours sans utiliser l'app · *Vacation Mode* 7 jours · produits de beauté neufs seulement ·
DAC7 : plus de 2 000 € ou 30 ventes par an · *Top Seller* : 50 nouvelles annonces par mois, 4,5 de note
(seuils UK/US en £/$) · centre d'aide en anglais seulement.

## 15. Pièges : ce qu'il ne faut PAS affirmer

**Sur Depop**
- « Depop sans frais de vente » / « 0 % de commission » pour un vendeur en France (vrai seulement UK,
  US, Australie) ; un frais acheteur Depop en France (non décrit) ; un barème PayPal chiffré.
- « Étiquettes Depop », « *Depop Shipping* », « *Depop Protection* », « *Depop Payments* », Klarna,
  « *Depop Balance* » pour un vendeur en France.
- « Des millions d'acheteurs Depop en France » : les chiffres massifs sont **mondiaux** ; l'UE compte
  ≈ 280 000 actifs mensuels. Toujours dire « dans le monde » et la date.
- « Depop est en français » (centre d'aide en anglais ; interface vue en anglais sous `/fr/`).
- Un classement chiffré des catégories ; « Depop, la plateforme n° 1 du vintage ».
- « Depop interdit les outils de crosslisting » (faux) **comme** « Depop autorise / valide FillSell »
  (faux) : citer la clause entière.
- « L'API Depop » comme si elle était ouverte (« not currently open to the public »).
- « Depop appartient à eBay, donc FillSell publie sur Depop par l'API eBay » (faux).
- Conseiller de citer Vinted / Leboncoin / Beebs / eBay dans une annonce Depop, d'ouvrir plusieurs
  comptes Depop, de vendre des cosmétiques entamés.

**Sur FillSell et Depop**
- **Tout Depop avant le GO** (§ 13.1 : `depop_ouvert`, extension ≥ 0.6.105 servie, OTA ≥ 2.9.68).
- **« Republication automatique sur Depop » avant que § 13.4 soit vrai ET prouvé** — utiliser le jeton.
- Un palier à côté de la republication automatique (décision) — **et** « gratuit », « tous les
  forfaits », « inclus » (le code la réserve à Pro et Business au 09/10).
- Tout chiffre de quota ou de plafond (décision) ; les limites techniques internes (pages du relevé,
  cadence du veilleur) ne se publient jamais.
- « Depop même ordinateur éteint », « dans le cloud », « via l'API officielle de Depop ».
- « En temps réel », « instantané », un délai chiffré de détection de vente.
- « FillSell retire tout, partout, tout seul » : le retrait suit une vente **enregistrée** et vise les
  copies **prouvées** ; Leboncoin et Beebs attendent un appui ; doute → « Déjà vendu ? ».
- « Remonte tes annonces en tête de Depop », « Boost gratuit » (texte officiel : « slight edge ») ;
  « garde tes likes ».
- « Toutes tes annonces Depop, même importées, republiées automatiquement » (le module ne vise que les
  annonces portées par un dépôt FillSell).
- « Vendu sur Depop : enregistré tout seul » présenté comme **éprouvé** : le code le fait, aucune vraie
  vente Depop n'a encore été observée (§ 13.3). Le dire sans « prouvé », ou le prouver d'abord.
- « Envoi international Depop » (FillSell n'envoie que le port national).
- « Compte Depop britannique / américain » (refusé : euros seulement).
- Logo Depop sur les pages du site : nom en texte + « FillSell n'est affilié à aucune de ces
  plateformes ». Dans les captures et la vidéo : la tuile **telle que l'app la dessine**
  (`src/components/platform-logos/DepopIcon.jsx` : mot « depop » blanc sur rouge `#FF2300`, dessin
  maison) — jamais le logo officiel téléchargé.
- **Opla** : jamais nommée, nulle part (pas même « Depop remplace Opla »).
- « Bot », « robot », « indétectable », « sans risque », « zéro risque de bannissement ».

## 16. Non vérifié — à relire avant publication

- Le site `www.depop.com` (dont `/fr/`) : 403, rien lu (page d'accueil, blog, mentions en français).
- La disponibilité du Boost (*Boosted Listings*) pour un vendeur en France (frais de 8 % listés « outside
  of the UK and US », mais l'article Boost ne parle que de UK/US/Australie).
- Le barème PayPal applicable à une vente Depop en France.
- Si l'usage du site ou de FillSell évite le passage des annonces en « inactives » après 28 jours.
- La liste des hashtags interdits (servie à un compte connecté seulement) ; le poids maximal d'une photo ;
  la vidéo ; le plafond de prix côté serveur. [MESURÉ « à vérifier »]
- Le comportement de l'anti-fraude Sift face à des publications faites par l'extension ; un seuil de débit.
- Une vraie vente Depop de bout en bout dans FillSell ; le retrait d'une copie Depop après une vraie
  vente ailleurs ; le parcours sur 0.6.106.
- Qu'aucune copie Depop générée ne mentionne une autre plateforme.
- Côté prod (lecture seule, à faire par Nico) : `depop_ouvert`, les clés `republish_planifiee_pf_%`,
  `republish_planifiee_plateformes()`, la version d'extension servie, la version OTA servie.
- Les chiffres de la matrice concurrents pour Depop (relevé du 09/10, à rafraîchir au GO).

## 17. Requêtes servies (rappel de `06-mots-cles-fr.md` / `06-mots-cles-en.md`)

FR : « vendre sur depop », « outil depop », « vinted depop », « vinted depop cross lister »,
« cross listing depop and vinted ». EN : « crosslist vinted to depop », « vinted to depop »,
« depop crosslister », « depop sold same item twice ». Ces requêtes étaient **exclues** au 09/10 matin
(Depop fermée, F54) ; la décision de Nico les rouvre. Aucun indice Trends relevé pour Depop.
Les sections 2 (frais), 7 (format d'annonce), 10 (CGU et crosslisting) et 13 (FillSell) y répondent.

## 18. Sources (toutes consultées le 2026-10-09)

Officielles Depop — centre d'aide (date = dernière modification du texte, `edited_at`) :
- https://depophelp.zendesk.com/hc/en-gb/articles/360001773148-Terms-of-Service — CGU, en vigueur le 06/10/2026 (texte du 06/10/2026), versions archivées incluses
- https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges (21/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/21752555753361-What-is-the-Marketplace-fee (21/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001772668-Using-PayPal-on-Depop (13/08/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item (11/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360020435158-Tips-for-describing-your-item (10/09/2025)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001773188-Why-has-my-listing-been-removed (11/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/9422984899985-How-Depop-ranks-search-results-and-recommends-listings (21/08/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360050410093-Improving-the-search-ranking-of-your-items (21/08/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/10110299060753-Boosted-Listings (24/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001771988-How-to-ship-Worldwide (11/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360009418014-Selling-on-Depop (05/06/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001845367-Depop-Protection-for-sellers (06/10/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/13057572688273-EU-Digital-Services-Act (28/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/4411154329233-Selling-as-a-charity-or-business (24/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/43972530939665-eBay-to-acquire-Depop-FAQ (30/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/19653371452049-Reporting-income-in-the-EU-DAC7 (15/12/2025)
- https://depophelp.zendesk.com/hc/en-gb/articles/6497240376593-Extended-Producer-Responsibility-EPR-in-France (22/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/12267530258833-Vacation-Mode (22/04/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer (30/07/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360017585774-Bundles (17/06/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/8608273715217-Listing-on-web (04/11/2025)
- https://depophelp.zendesk.com/hc/en-gb/articles/360026574274-What-are-stock-images (12/05/2025)
- https://depophelp.zendesk.com/hc/en-gb/articles/360026370634-Community-Guidelines (21/05/2025)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001791287-How-do-I-change-the-currency-of-my-items (11/09/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/360001792067-What-is-a-Top-Seller (05/06/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/8579600880529-How-to-price-your-item (26/02/2026)
- https://depophelp.zendesk.com/hc/en-gb/articles/12803766422289-Repop (10/11/2025)
- https://depophelp.zendesk.com/api/v2/help_center/locales.json (locales `en-gb`, `en-us`)

Officielles Depop — salle de presse :
- https://news.depop.com/company-news/ebay-to-acquire-depop-from-etsy/ (17/02/2026, dateline 18/02/2026)
- https://news.depop.com/company-news/ebay-completes-acquisition-of-depop/ (30/07/2026)
- https://news.depop.com/company-news/evolving-our-fee-structure-with-zero-selling-fees-on-depop/ (21/03/2024)
- https://news.depop.com/company-news/depop-removes-selling-fees-in-the-united-states-evolves-fee-structure/ (15/07/2024)
- https://news.depop.com/company-news/depop-makes-selling-free-in-australia-helping-people-earn-more-from-fashion-resale/ (03/07/2026)

Non lisibles le 09/10 : https://www.depop.com/fr/ et https://www.depop.com/fr/blog/how-does-depop-work/ (403).

Internes (code et documents, lecture seule) :
- `docs/plateformes/depop/CARTOGRAPHIE.md`, `RATTACHEMENT.md`, `attributs.json`, `brut/listing-location-countries.json`
- `docs/reprise/terminal-depop-0910.md` ; `docs/agents/etat-2026-10-01.md` (sections Depop du 09/10) ; `main:docs/reprise/terminal-soir-0910.md`
- `chrome-extension/content-scripts/depop.js` ; `chrome-extension/background.js` (l. 10252, 11015-11202, 14057-14062, 16696, 17030-17075, 19990-20015, 23514-23517) ; `chrome-extension/manifest.json` (0.6.106)
- `main:src/utils/republication.js`, `main:src/utils/stockFiltres.js`, `main:src/utils/depopPublication.js`, `main:src/hooks/useRepublicationPlanifiee.js`, `main:src/components/RepublicationPlanifiee.jsx`, `main:src/components/platform-logos/DepopIcon.jsx`, `main:src/App.jsx` (l. 2424-2634, 3487-3489), `main:src/pages/Legal.jsx` (l. 264-268)
- `main:supabase/migrations/20261009020000_depop_plateforme_base.sql`, `20260918200000_republication_planifiee_multi_socle.sql`, `20260918200100_republication_planifiee_multi_fonctions.sql`, `20260926235900_depot_suit_la_prod_capture_2609.sql` (`republish_planifiee_candidats`), `20261008140000_republication_finit_dans_son_creneau.sql`, `20260928143457_point_b_ventes_automatiques_rejeu.sql`, `20261008233100_ventes_prouvees_automatiques.sql`, `20261009130000_vinted_preuve_page.sql`
- `main:supabase/functions/republish-auto-sweep/index.ts`, `main:supabase/functions/handler-watch/index.ts` (l. 1626-1639), `supabase/functions/_shared/rapprochement/moteur.js` (l. 43)
- `docs/seo/briefs/concurrents.yml`, `concurrents-matrice.md` ; `docs/seo/PLAN.md` § 1.8 ; `site/donnees/plateformes.yml`

## 19. Hors périmètre, signalé à Nico

- La description de l'extension (manifeste 0.6.106 / 0.6.107, donc la fiche du Web Store) dit encore
  « Publie automatiquement vos annonces FillSell sur Vinted, Leboncoin, Beebs et eBay » : sans Depop.
- La fiche de vérité (`03-fiche-de-verite.md` F24, F54) et `06-mots-cles-*` disent encore « ne pas nommer
  Depop » : périmées par la décision du 09/10, à mettre à jour par leur propriétaire.
- Republication par créneaux réservée à Pro et Business dans le code, alors que la décision dit « tous les
  paliers » (§ 13.4, point 6) : à trancher (code ou texte).
