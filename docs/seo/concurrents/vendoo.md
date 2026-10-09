# Vendoo : vérification sur ses pages réelles

- **Site** : https://vendoo.co (redirige vers https://www.vendoo.co/). Société Vendoo, Inc., Silver Spring (Maryland,
  États-Unis), soutenue par Y Combinator.
- **Date d'observation** : 2026-10-09 pour toutes les pages citées, sauf mention contraire.
- **Méthode** : pages téléchargées avec `curl` (agent Chrome de bureau), puis converties en texte. Le centre d'aide
  (Intercom, https://help.vendoo.co/en/) a été lu article par article, avec la date « Updated » de chaque article.
  Fiches des stores : API publique `itunes.apple.com/lookup` pour l'App Store, page Google Play, page Chrome Web
  Store. Trustpilot a refusé `curl` (403, « Verifying Connection ») : sa page a été lue avec WebFetch. Aucune
  inscription, aucune connexion, aucun formulaire. Tout ce qui se trouve derrière un compte est classé « non
  vérifiable » (§ 14).
- **Note de méthode (Vinted)** : la **page HTML** de /marketplaces contient une tuile « Vinted ». Une lecture
  textuelle de la page (WebFetch ou extraction brute) **la fait donc apparaître**. Pourtant, la feuille de style du
  site la masque (`.vinted-hide-comp-marketplaces{display:none}`) et un visiteur ne la voit pas. Détail au § 1.

---

## 0. En bref

1. **Vinted n'est pas pris en charge** d'après tout ce qu'un visiteur peut lire. L'article d'aide « Which
   marketplaces does Vendoo support? » (mis à jour le 09/07/2026) ne le nomme pas, et la recherche « vinted » du
   centre d'aide ne rend **aucun article**. Le site garde pourtant une **tuile Vinted masquée par CSS**, qui pointe
   vers /marketplaces/vinted-us (redirigé vers /marketplaces). On y trouve aussi un **calculateur de frais Vinted**
   (« United States, Canada, and the European Union ») et la mention de marque Vinted dans le pied de page.
   Rien ne dit quel pays Vinted serait visé, à part le nom de chemin « vinted-us ».
2. **Leboncoin, Beebs et eBay France : absents.** Aucune mention sur les pages lues, et 0 résultat pour
   « leboncoin » et « france » dans le centre d'aide.
3. Le produit comprend une application web, une **extension Chrome**, qui sert à publier sur les places de marché
   sans API, et des **applications iOS et Android**. Pour démarrer, il **faut l'ordinateur** : « you must use the
   computer to get started, because you cannot import from the mobile app ».
4. **Retrait automatique après une vente (« Sale Detection & Auto Delist »)** : il est **inclus dans toutes les
   formules**, mais toujours marqué **« BETA »** et limité à 5 ou 6 places de marché (eBay, Poshmark, Mercari, Depop,
   Whatnot, Etsy selon la page). Il demande un **ordinateur allumé**, connecté aux places de marché, avec « Vendoo
   actively running in an open browser tab ». Le balayage a lieu « Every ten minutes ». Rien n'est détecté depuis
   l'application mobile.
5. **Republication** : « Delist & Relist » se lance **à la main**, à l'unité ou en lot jusqu'à 240 annonces. Un
   rappel d'annonces anciennes (« Stale Listing Warning ») existe. Aucune page lue ne décrit de republication
   programmée.
6. **Prix en dollars US** : Starter **14,99 $**, Growth **29,99 $** et Pro **59,99 $** par mois, soit 12,49 $, 24,99 $
   et 49,99 $ par mois en annuel. Enterprise est sur devis. Les articles sont **illimités** dans toutes les formules.
   L'**essai gratuit dure 14 jours**, avec une **carte bancaire exigée**. L'IA (« AI Listing Enhancement ») n'est
   proposée qu'à partir de Growth.
7. **Notes publiques** : **App Store US 4,5/5 (2 831 notes)**, **Google Play 4,2/5 (749 avis, plus de 50 000
   téléchargements)**, **Chrome Web Store 3,5/5 (70 notes, 70 000 utilisateurs)** et **Trustpilot 4,2 (242 avis, dont
   22 % à une étoile)**. L'application iOS est **absente des App Store France et Allemagne** (0 résultat à la
   recherche).
8. Site, aide, extension et application iOS sont **en anglais uniquement** (App Store : `languageCodes = ["EN"]`).
   Le site a une section **/uk**, plus ancienne et incohérente avec le site principal (§ 15).

Pour un revendeur français, Vendoo ne couvre ni Vinted, ni Leboncoin, ni Beebs, et son application iOS n'est pas
publiée en France. C'est en revanche un acteur mûr (depuis 2017), qui pèse lourd en contenu anglophone (§ 16).

---

## 1. Plateformes supportées (liste exacte)

| Source (2026-10-09) | Liste citée |
|---|---|
| Centre d'aide, « Which marketplaces does Vendoo support? » https://help.vendoo.co/en/articles/6260300-which-marketplaces-does-vendoo-support (mis à jour le 09/07/2026) | « eBay, Etsy, Poshmark, Mercari, Depop, Grailed, Facebook Marketplace, Shopify, Vestiaire Collective, and Whatnot (BETA) » (10) ; « all except for Facebook Marketplace, and Shopify are available on the Vendoo mobile app » |
| FAQ de l'accueil https://www.vendoo.co/ | « eBay, Poshmark, Facebook Marketplace, Mercari, Etsy, Depop, Shopify, Whatnot, Grailed, and Vestiaire Collective » (10) |
| https://www.vendoo.co/marketplaces : tuiles visibles | Shopify, Whatnot, Grailed, eBay, Depop, **Sellwild**, Poshmark, FBMP, Mercari, VC, Etsy |
| https://www.vendoo.co/marketplaces : tuile **masquée** | « Vinted » : `<a href="/marketplaces/vinted-us" class="vinted-hide-comp-marketplaces …">` ; la règle `.vinted-hide-comp-marketplaces{display:none}` est dans la feuille de style partagée du site |
| https://www.vendoo.co/faqs (texte ancien) | « eBay, Poshmark, Mercari, Etsy, Grailed, Depop, Shopify, Facebook Marketplace and Mercari » (Mercari cité deux fois) |
| Page Enterprise https://www.vendoo.co/enterprise/high-volume | « eBay, Poshmark, Grailed, Mercari, Shopify, Depop, Etsy, Vestiaire Collective or **Kidizen** » |
| App Store (description, version 3.2.8) | 8 places de marché : « eBay, Etsy, Poshmark, Mercari, Grailed, Depop, Vestiaire Collective (VC), Whatnot » |
| Chrome Web Store (fiche de l'extension) | « Connect and crosslist to 10+ third party marketplaces » ; plus bas : « Crosspost your items to 9 marketplaces » |
| Section UK https://www.vendoo.co/uk/faqs | « eBay, Depop, Etsy, Whatnot and Facebook Marketplace » |

**Vinted.**
- Il est absent de la liste du centre d'aide et des listes de l'accueil, de l'App Store et de la section UK.
- La recherche « vinted » sur https://help.vendoo.co/en/?q=vinted rend : « We couldn't find any articles for: vinted ».
- Indices d'un chantier ou d'un retrait, tous **invisibles** pour le visiteur :
  - la tuile masquée de /marketplaces ;
  - https://www.vendoo.co/marketplaces/vinted-us, qui renvoie vers /marketplaces ;
  - les grilles de logos de /cross-listing-app et /mobile-app, qui portent la classe `grin-no-vinted` ;
  - la grille de l'accueil, qui porte `grid-home-page-logos-vinted`.
- Éléments **visibles** :
  - le calculateur https://www.vendoo.co/vinted-fee-calculator (« available for sellers in the United States,
    Canada, and the European Union »), avec l'appel « Your Vinted listings can reach more buyers. Crosslist to 10+
    marketplaces with Vendoo » ;
  - la mention de marque « Vinted is a trademark of Vinted, Inc. » en pied de page.
- **Pays Vinted** : non documenté. Le chemin « vinted-us » est le seul indice.

**Leboncoin** : absent (0 résultat d'aide). **Beebs** : absent. **eBay France** : non documenté. Les articles eBay
renvoient à « ebay.com ». La FAQ de https://www.vendoo.co/faqs, « Can I Use Vendoo Outside of the United States? »,
répond : « global access to the marketplaces themselves is limited and might not be available everywhere. You might
not be able to actually list to the U.S. marketplaces depending upon your location ».

**Whatnot** : la page UK revendique « Vendoo is the only crosslisting tool integrated with Whatnot ». Le centre
d'aide le marque « (BETA) ».

**Shopify** : supplément de 9,99 $ par mois depuis le 15/10/2025, facturé par Shopify (« connecting Vendoo to your
Shopify store will include a $9.99 monthly charge, billed directly through Shopify », accueil et /marketplaces).

## 2. Application mobile iOS / Android

- **Oui, les deux.**
  - App Store : https://apps.apple.com/us/app/vendoo-a-sellers-best-friend/id1612168777, « Vendoo: A Seller's Best
    Friend », version 3.2.8 du 30/09/2026, sortie le 29/03/2022, gratuite, iOS 15.1 ou plus.
  - Google Play : https://play.google.com/store/apps/details?id=co.vendoo.mobile, mise à jour le 29/09/2026.
- Fonctions de l'application, d'après https://help.vendoo.co/en/articles/9299090-can-i-use-vendoo-from-my-phone-or-tablet
  (mis à jour le 28/09/2026) : « Creating Drafts, Importing (for some marketplaces), Photo Editing & Background
  Removal, Listing & Crosslisting, Inventory Management, Custom Labels, Delist/Relist (Individual), Mark As Sold &
  Multi-Delist, Accessing Analytics ».
- Absent de l'application : « AI Descriptions, Bulk Delist/Relist, Sale Detection and Auto Delist, CSV Download,
  Stale Listing Warning System, Facebook Marketplace, and Shopify ».
- L'import depuis le mobile n'existe que pour eBay et Etsy : « On the mobile app, importing is available from eBay
  and Etsy » (https://help.vendoo.co/en/articles/6260276-how-to-import-your-items-in-vendoo).
- Revendication marketing : « The only Crosslisting Mobile App » (accueil) et « it's the only crosslisting tool with
  a dedicated app » (https://www.vendoo.co/free-crosslisting-app). D'autres concurrents ont aussi des applications
  natives (cf. crosslist.md) : c'est une affirmation de leur part, pas un fait vérifié.

## 3. Extension navigateur

- **Oui, une extension Chrome.** « Vendoo Crosslist Extension v3 »,
  https://chromewebstore.google.com/detail/mnampbajndaipakjhcbbaihllmghlcdf : version 3.1.10, mise à jour le
  26/09/2025, 1,32 Mio, « English (United States) », 70 000 utilisateurs.
- Son rôle, d'après https://help.vendoo.co/en/articles/6260307-is-the-vendoo-website-secure-is-vendoo-safe :
  - « We have a Google Chrome extension that simply opens a new tab for you on the marketplaces behind the scenes,
    essentially doing a hidden "copy and pastes" to list items » ;
  - « For eBay and Etsy, we store an access token » : ces deux plateformes passent par leur API.
- L'ancienne extension « vendoo-marketplace-lister » (pookjkafopllbpneacklecbjmgbccile), encore liée par
  https://help.vendoo.co/en/articles/6260306-how-do-i-access-the-vendoo-google-chrome-extension, n'a **plus de
  fiche** sur le Chrome Web Store (page vide, titre « Chrome Web Store »).
- Plateforme : « use a modern browser, such as Google Chrome » (article auto-delist). Aucune mention d'Edge, de
  Firefox ou de Safari.

## 4. D'où l'on part

- **L'ordinateur d'abord** : « the best Vendoo experience is on the computer with the Vendoo Chrome Extension… In
  fact, you must use the computer to get started, because you cannot import from the mobile app or mobile website »
  (article 9299090, 28/09/2026).
- Parcours de démarrage, d'après https://help.vendoo.co/en/articles/6260267-get-started-with-vendoo-create-an-account-download-the-extension-connect-your-marketplaces
  (mis à jour le 07/10/2026) :
  1. créer un compte ;
  2. installer l'extension Chrome et l'application mobile ;
  3. connecter les places de marché depuis l'ordinateur (« If your computer is not already logged in to the
     marketplace, Vendoo will prompt you to sign in »).
- Ensuite, le téléphone sert à créer des brouillons, publier, gérer le stock et marquer « vendu ». La détection des
  ventes reste sur l'ordinateur (§ 7).

## 5. Identification par photo / IA

- **« AI Listing Enhancement »**, https://help.vendoo.co/en/articles/12578441-ai-listing-enhancement (mis à jour le
  14/10/2025) :
  - « Vendoo will generate polished, SEO-optimized descriptions and automatically fill your listing fields » ;
  - on y saisit **du texte** : « enter any details you would like included in your description… brand, condition,
    size, measurements, and any flaws » ;
  - l'outil remplit ensuite les champs : « The AI Listing Enhancement tool enters the brand, title, category, size,
    and more! ».
- **Photo** : aucune page lue ne décrit une identification de l'objet **à partir de la photo**. Les fonctions photo
  documentées sont le détourage PhotoRoom (0, 300 ou 1 500 détourages selon la formule) et un éditeur (recadrage,
  luminosité, contraste, filtres ; https://www.vendoo.co/mobile-app).
- **Prix** : aucune suggestion de prix par IA n'est documentée. L'ancien « eBay Price Checker » a été **retiré** :
  « The Vendoo community was sent a message on October 11, 2024, explaining that the eBay Price Checker has been
  removed from the Vendoo form » (https://help.vendoo.co/en/articles/9985847-…).
- Disponibilité : formules **Growth et Pro** seulement (https://www.vendoo.co/pricing), et **pas sur mobile** (« AI
  Descriptions » figure dans la liste des absences de l'article 9299090).

## 6. Import / synchronisation du stock existant

- Import des **annonces actives** seulement : « At this time, you can only import active listings (sold listings and
  drafts will not appear as eligible to import » (https://help.vendoo.co/en/articles/6760021-can-i-import-sold-items).
- **Une seule plateforme** : « Bulk Importer » (https://help.vendoo.co/en/articles/6260276-…, 07/10/2026).
- **Plusieurs plateformes** :
  - fonction « **Import & Merge** (In BETA) » ;
  - sinon, la méthode documentée consiste à importer depuis UNE plateforme, puis à marquer l'article « listed »
    ailleurs **en collant l'URL de l'annonce** : « change the listing status of this item to "listed" by pasting the
    URL to the active listing » (https://help.vendoo.co/en/articles/6746641-…, 07/10/2026).
  - Avertissement de l'article : « do not import the same items from different marketplaces ».
- Défaut connu, documenté par l'éditeur : « duplicate listings appear in their Vendoo inventory after importing
  (specifically after importing from eBay). The Vendoo team is working to resolve this issue »
  (https://help.vendoo.co/en/articles/6760022-why-are-duplicates-appearing-when-i-import). Un outil « Duplicate
  Finder » figure dans la nouvelle navigation
  (https://help.vendoo.co/en/articles/16091202-what-changed-in-vendoo-2026, 29/07/2026).
- **Un compte par plateforme** : « Vendoo is currently designed to connect to a singular account per marketplace »
  (https://help.vendoo.co/en/articles/6260283-…). Pour en changer, il faut se déconnecter puis se reconnecter.
- Enterprise : import « from a CSV file, document, your inventory system ».

## 7. Retrait automatique des copies après une vente (auto-delist)

Source : https://help.vendoo.co/en/articles/8047348-sale-detection-auto-delist, mis à jour le 07/10/2026.

- **Oui**, à activer plateforme par plateforme : « Vendoo detects your sales and automatically delists your items
  from the remaining marketplaces as they sell! ».
- **Statut BETA** : « Keep in mind this feature is in BETA, for now ».
- **Plateformes concernées : liste instable selon la page.**
  - Même article, plus haut : « eBay, Poshmark, Mercari, Depop, and WhatNot ».
  - Même article, plus bas : « eBay, Poshmark, Mercari, WhatNot, Etsy and Depop ».
  - https://www.vendoo.co/pricing : « Poshmark, eBay, Mercari, Depop, Whatnot, and Etsy ».
  - https://help.vendoo.co/en/articles/8833508-why-aren-t-my-sales-being-detected : 5 plateformes, sans Etsy.
- **Ordinateur obligatoire** :
  - « Your computer must be turned on and connected to the marketplaces » ;
  - « ensure that Vendoo is actively running in an open browser tab » ;
  - « You will want to disable sleep mode for best results » ;
  - « Vendoo does not detect sales on the mobile app » (article 8833508).
- **Fréquence** : « Every ten minutes, Vendoo will "scan" your connected marketplaces for sales ».
- **Limites écrites** :
  - multi-quantité : « Vendoo will not automatically delist the item unless it is your last unit available » ;
  - « You cannot exclude marketplaces or items from only the delist process » ;
  - multi-comptes : « Not yet. For now, Vendoo will detect sales from the marketplace you are currently connected
    to » ;
  - l'acheteur US seulement pour un cas eBay : « the location of the buyer (U.S. only) ».
- **Poshmark** : quand une offre bloque le retrait, Vendoo modifie l'annonce pour l'annuler : « We do this by
  automatically editing the listing and changing the size, which cancels the existing offer ».
- **Échec** : « you will see a red warning symbol… Then, you will delist the items individually ».
- Sur les autres plateformes (Facebook Marketplace, Grailed, Shopify, Vestiaire), il faut marquer l'article
  « vendu » à la main. Le retrait sur les autres copies suit alors ce geste : « just mark your item as sold in Vendoo
  and our software will do the rest! » (fiche Chrome Web Store).

## 8. Republication / relist automatique

- « **Delist & Relist** » : « it entirely deletes your listing from a marketplace and creates a brand-new listing…
  with a new URL » (https://help.vendoo.co/en/articles/6260292-…, 07/10/2026).
- Elle se fait à l'unité ou en lot (« up to 240 items at once »). Sur mobile, elle se fait à l'unité seulement.
- Elle est **déclenchée par l'utilisateur**. Aucune page lue ne décrit de republication programmée ou automatique.
- Un rappel existe, le « Stale Listing Warning » : « Vendoo will remind you to relist your stale items »
  (https://help.vendoo.co/en/articles/6260291-…). Le nombre de jours se règle, et un bandeau jaune s'affiche.
- Autres automatismes, dans la section « Automations » : « Send Offers », « Auto Offers » et « Marketplace Sharing »
  (Poshmark, Depop, Grailed), en formule Pro.
- Argument chiffré, non vérifiable : « Vendoo users who regularly Delist & Relist their stale inventory make 33% more
  sales » (accueil).

## 9. Stock, ventes, statistiques

- **Analytique** : « revenue, profit, volume, and top-selling brands and categories across all reselling
  marketplaces ». Elle se filtre par période (jour, semaine, mois, trimestre, année, période libre) et se découpe par
  plateforme, avec le prix de vente moyen (ASP). Elle couvre aussi les ventes hors Vendoo : « even if you sell in
  person » (https://help.vendoo.co/en/articles/6260264-vendoo-business-analytics).
- Pour des chiffres justes, il faut saisir les détails de vente : « This item appears with a yellow warning symbol as
  it is pending sales details » (article auto-delist).
- **Outils de stock** : étiquettes personnalisées, export CSV de l'inventaire et des ventes, multi-quantité et
  variantes, modèles d'annonces, « Duplicate Finder ».
- Accessible sur mobile : analytique, stock et étiquettes.

## 10. Prix

Source : https://www.vendoo.co/pricing, devise **$** (dollars US, devise non nommée sur la page).

| Formule | Mensuel | Annuel (prix par mois) | Contenu principal |
|---|---|---|---|
| Starter | 14,99 $ | 12,49 $ | « Unlimited Items, All Marketplaces, Sale Detection and AutoDelisting, Listing Templates, Importing, Delist & Relist, Analytics, Mobile app iOS and Android » ; 0 détourage |
| Growth (« Recommended ») | 29,99 $ | 24,99 $ | en plus : « AI Listing Enhancement », « Bulk Actions: Manage up to 240 listings at once », 300 détourages PhotoRoom |
| Pro | 59,99 $ | 49,99 $ | en plus : « Auto Send Offers on 6+ marketplaces », « Marketplace Sharing: Poshmark, Depop & Grailed », 1 500 détourages, « Listing Videos » |
| Enterprise | sur devis | sur devis | « businesses creating over 1,000 new monthly listings » ; « 3 Users Included ($27 Additional Seats) » ; travail fait « semi-manually » par l'équipe Vendoo (https://www.vendoo.co/enterprise/high-volume) |

- **Essai** : « Try Vendoo Free for 14 Days » ; « a valid payment method is required to activate your trial » ;
  « Your subscription will automatically begin on day 14 ».
- **Remboursement** : « Once your trial ends and you're billed, the charge is non-refundable ».
- **Moyens de paiement** : « Vendoo currently accepts all major credit cards ». La taxe de vente de l'État
  américain s'ajoute.
- **Supplément Shopify** : 9,99 $ par mois (§ 1).
- **Ancienne grille encore en ligne** : https://www.vendoo.co/uk/pricing affiche des formules **à quota d'articles, en
  livres sterling**. Il y a une formule gratuite, « FREE plan £0, 5 items », puis Simple, Plus et Pro de 16,99 £ à
  59,99 £ par mois pour 125 à 600 articles. Deux tableaux s'y contredisent, et une grille en dollars de 8,99 $ à
  149,99 $ s'y ajoute. L'aide parle encore d'un « Item Counter » mensuel et d'« Add-Ons »
  (https://help.vendoo.co/en/articles/6260309-…, 6260301-…). **La grille en vigueur pour un nouveau client ne peut
  être confirmée qu'à l'inscription** (§ 14).

## 11. Pays et langues

- **Marché principal : les États-Unis.** « Trusted by 81,000+ Resellers in The US » (https://www.vendoo.co/pricing).
- **Royaume-Uni** : une section https://www.vendoo.co/uk (« The Best Crosslisting Tool for UK Sellers »). Le site
  déclare des balises `hreflang` en-us / en-gb / x-default. Une page de confidentialité « privacy-statement-europe »
  figure au sitemap.
- **Hors États-Unis** : « You can use Vendoo from anywhere in the world to draft listings… However, global access to
  the marketplaces themselves is limited » (https://www.vendoo.co/faqs).
- **App Store** : l'application est publiée aux États-Unis, au Royaume-Uni et au Canada. Elle est **absente en France
  et en Allemagne** : `lookup?id=1612168777&country=fr` et `country=de` rendent 0 résultat.
- **Google Play** : la page web s'affiche avec `gl=FR`, mais la disponibilité réelle par pays n'est pas vérifiable
  depuis le web.
- **Langue : anglais uniquement.** Site, centre d'aide (une seule locale « en »), extension (« English (United
  States) ») et application iOS (« EN »). La description française de Google Play (« Le logiciel incontournable pour
  les revendeurs en ligne ! ») est la traduction affichée par le store. Rien n'indique une interface en français.

## 12. Notes publiques

Relevé le 2026-10-09.

| Source | Note | Volume | Détail |
|---|---|---|---|
| App Store US (`itunes.apple.com/lookup?id=1612168777&country=us`) | **4,52/5** | **2 831 notes** | version 3.2.8 du 30/09/2026 |
| App Store GB | 2,87/5 | 15 notes | — |
| App Store CA | 3,14/5 | 7 notes | — |
| Google Play (https://play.google.com/store/apps/details?id=co.vendoo.mobile) | **4,2/5** (4,18) | **749 avis** | « 50K+ » téléchargements ; mise à jour le 29/09/2026 |
| Chrome Web Store (extension v3) | **3,5/5** | **70 notes** | 70 000 utilisateurs ; v3.1.10 du 26/09/2025 |
| Trustpilot (https://www.trustpilot.com/review/vendoo.co, lu avec WebFetch) | **TrustScore 4,2** (« Great ») | **242 avis** | 5★ 71 %, 4★ 4 %, 3★ 1 %, 2★ 2 %, **1★ 22 %** ; dernier avis le 06/10/2026 |

L'accueil affiche des badges Trustpilot et Google, ainsi que des avis liés à Trustpilot, sans note agrégée.

## 13. Ce qu'ils font bien (honnêtement)

- **Ancienneté et échelle** : logiciel en construction depuis 2017, « more than 60 employees », Y Combinator
  (https://www.vendoo.co/about). L'éditeur revendique 81 000 utilisateurs et 78 millions d'annonces créées.
- **Couverture américaine large** : 10 plateformes, dont Whatnot (rare chez les concurrents) et Vestiaire Collective.
  eBay et Etsy passent par leur API officielle.
- **Application mobile bien notée aux États-Unis** : 4,5/5 sur 2 831 notes, mise à jour fin septembre 2026. Elle
  couvre déjà la création, la publication, le stock et l'analytique.
- **Articles illimités dès 14,99 $**, auto-delist inclus dans la formule d'entrée, prix affichés et lisibles, remise
  annuelle.
- **Outillage de revendeur complet** :
  - republication en lot jusqu'à 240 annonces ;
  - rappel d'annonces anciennes ;
  - multi-quantité et variantes ;
  - étiquettes et export CSV ;
  - détourage PhotoRoom et vidéos d'annonce ;
  - offres automatiques et partage Poshmark, Depop et Grailed.
- **Aide très fournie et entretenue** : 10 rubriques, 61 articles de FAQ, plusieurs articles mis à jour le
  07/10/2026. Les limites y sont **écrites franchement** : BETA, ordinateur allumé, doublons à l'import eBay, un
  compte par plateforme.
- **Support humain** mis en avant : « Live Customer Support 7 Days a Week » dans les formules annuelles. Il existe
  aussi un groupe Facebook et des démonstrations hebdomadaires.
- **Offre Enterprise « faite pour vous »**, où l'équipe Vendoo publie et retire à la place du client.

## 14. Ce qu'on ne peut pas vérifier sans compte

- L'état réel de **Vinted** dans le produit (tuile masquée « vinted-us ») : bêta privée, projet ou ancien
  connecteur ?
- La connexion d'un compte **eBay France** ou eBay UK, et la publication depuis la France.
- La **grille tarifaire** proposée à l'inscription : formules « Unlimited » en dollars, ou grille britannique à quota
  d'articles et formule gratuite (§ 10). Même question pour la durée et les conditions de l'essai depuis l'Europe.
- La qualité de l'**IA** (« AI Listing Enhancement ») et l'éventuel usage de la photo.
- Le **délai réel** de l'auto-delist (balayage « toutes les dix minutes » annoncé) et son taux d'échec.
- Le fonctionnement d'« **Import & Merge** » (BETA) : rapprochement automatique ou manuel, et sur quels critères.
- La **disponibilité de l'application Android** sur le Google Play français.
- Les chiffres marketing : 81 000 utilisateurs, 78 millions d'annonces, « +180 % de taux d'écoulement », « +33 % de
  ventes ».

## 15. Contradictions relevées sur leurs propres pages (2026-10-09)

- **Nombre de plateformes** :
  - « 10+ marketplaces » (accueil, tarifs) ;
  - « over 8 marketplaces » (bloc mobile de l'accueil) ;
  - « 9 marketplaces » (Chrome Web Store) ;
  - 8 dans l'App Store.
  - Sellwild figure sur /marketplaces mais pas dans l'aide. Kidizen figure sur la page Enterprise et le menu UK,
    mais pas dans l'aide.
- **Utilisateurs et annonces** :
  - « 81,000+ » sur l'accueil, contre « 40,000+ Users Across the Globe » sur /uk ;
  - « 78 Million Listings » sur l'accueil, contre « Over 26,000,000 items » sur /about et « +26 » ou « +30 Million »
    sur /uk.
- **Plateformes couvertes par l'auto-delist** : 5 ou 6 selon le passage (§ 7).
- **Formule gratuite** :
  - essai de 14 jours avec carte bancaire (/pricing) ;
  - « you can get started on the free plan. It is a free trial unlimited in duration » (/uk/faqs) ;
  - « register for a free Vendoo account… you will get access to test the software for free » (aide, 07/10/2026).
- **Articles** : « Unlimited Items » (/pricing), alors que l'aide mentionne un « Item Counter » mensuel et des
  articles inutilisés « lost at the end of each billing cycle ».

## 16. Observations SEO / GEO, utiles au chantier

- **Sitemap** : https://www.vendoo.co/sitemap.xml compte 134 URL, chacune avec `<lastmod>`. On y trouve :
  - **10 pages comparatives** « Vendoo vs » : List Perfectly, OneShop, Flyp, ResellKit, Crosslist, PrimeLister,
    SellerAider, Nifty, Crosslist Magic, Voolist ;
  - **10 calculateurs de frais**, dont **Vinted** ;
  - des pages par place de marché ;
  - une **section /uk** de 22 URL, dont 4 pages de remerciement aux noms factices (« dolor-quia-voluptate-vitae »…),
    avec ses propres pages par place de marché.
- **Vinted travaillé en SEO sans être pris en charge** : le calculateur Vinted (US, Canada, UE) se place sur les
  requêtes « Vinted fees » et renvoie vers « Crosslist to 10+ marketplaces ».
- **Pas de dispositif GEO explicite** : /llms.txt et /ai-info répondent 404. Le fichier robots.txt autorise tout.
- **Données structurées** : sur l'accueil, un script ajoute un JSON-LD `FAQPage` **côté client, au chargement**.
  Il n'est donc pas dans le HTML servi.
- **Site Webflow**, dernière publication le « Wed Oct 07 2026 ». Le blog est sur un sous-domaine
  (https://blog.vendoo.co).
- **Anglais seulement**, hreflang en-us / en-gb : aucune page en français. Sur les requêtes françaises
  (« crosslisting Vinted Leboncoin », « logiciel multi-plateformes revendeur »), Vendoo n'a pas de page dédiée.

## 17. Écarts factuels avec FillSell (sans dénigrement)

Pour FillSell, les faits viennent du contexte du chantier : Vinted, Leboncoin, eBay et Beebs ; une application
iOS/Android qui pilote ; une extension Chrome qui exécute sur l'ordinateur ; une interface en français.

| Point | Vendoo (constaté le 2026-10-09) | FillSell |
|---|---|---|
| Vinted | non pris en charge (aide, recherche d'aide) ; tuile masquée « vinted-us » | Vinted (France) |
| Leboncoin, Beebs | absents | pris en charge |
| eBay France | non documenté ; eBay.com dans l'aide | eBay pris en charge |
| Langue | anglais seulement | français |
| App iOS en France | absente de l'App Store FR | app iOS/Android, marché visé : France |
| Point de départ | ordinateur obligatoire pour démarrer et importer | le téléphone pilote, l'extension exécute sur l'ordinateur |
| Auto-delist | BETA ; 5 ou 6 plateformes US ; ordinateur allumé et onglet Vendoo ouvert ; balayage toutes les 10 min | retrait des copies après une vente (cf. règles du dépôt) |
| Import multi-plateformes | une plateforme, puis « mark as listed » par URL, ou « Import & Merge » en BETA ; doublons connus à l'import eBay | rapprochement des annonces relevées avant l'entrée en stock (cf. règles du dépôt) |
| IA | description et champs à partir du texte saisi, à partir de Growth (29,99 $) ; pas de suggestion de prix (Price Checker retiré en 2024) | — (à documenter côté FillSell) |
| Republication | manuelle (unité ou lot de 240) + rappel | republication (cf. règles du dépôt) |
| Prix | 14,99 $ à 59,99 $ par mois, essai de 14 jours avec carte | formule gratuite (50 republications par mois) et formules payantes |

## Sources (toutes consultées le 2026-10-09)

- https://www.vendoo.co/ — accueil (FAQ, chiffres, Shopify 9,99 $, mentions de marques)
- https://www.vendoo.co/pricing — formules, essai, remboursement
- https://www.vendoo.co/marketplaces — tuiles visibles + tuile Vinted masquée
- https://cdn.prod.website-files.com/5f622c6681d34140afb9d542/css/vendoo-website.webflow.shared.fbd0e1212.min.css — règle `.vinted-hide-comp-marketplaces{display:none}`
- https://www.vendoo.co/marketplaces/vinted-us — redirige vers /marketplaces
- https://www.vendoo.co/vinted-fee-calculator — calculateur Vinted (US, CA, UE)
- https://www.vendoo.co/faqs — FAQ (hors États-Unis, plateformes, extension)
- https://www.vendoo.co/mobile-app — application, 8 plateformes, détection des ventes sur mobile
- https://www.vendoo.co/free-crosslisting-app — essai de 14 jours
- https://www.vendoo.co/enterprise/high-volume — Enterprise, Kidizen, 3 utilisateurs
- https://www.vendoo.co/about — 2017, 60 salariés, YC, 26 millions d'articles
- https://www.vendoo.co/uk, https://www.vendoo.co/uk/pricing, https://www.vendoo.co/uk/faqs — section UK
- https://www.vendoo.co/sitemap.xml, https://www.vendoo.co/robots.txt, https://www.vendoo.co/llms.txt (404), https://www.vendoo.co/ai-info (404)
- https://help.vendoo.co/en/articles/6260300-which-marketplaces-does-vendoo-support (09/07/2026)
- https://help.vendoo.co/en/?q=vinted — 0 article
- https://help.vendoo.co/en/articles/6260267-get-started-with-vendoo-create-an-account-download-the-extension-connect-your-marketplaces (07/10/2026)
- https://help.vendoo.co/en/articles/9299090-can-i-use-vendoo-from-my-phone-or-tablet (28/09/2026)
- https://help.vendoo.co/en/articles/12578441-ai-listing-enhancement (14/10/2025)
- https://help.vendoo.co/en/articles/9985847-why-was-the-ebay-price-checker-removed-from-vendoo-where-is-the-ebay-price-checker-on-the-vendoo-form
- https://help.vendoo.co/en/articles/8047348-sale-detection-auto-delist (07/10/2026)
- https://help.vendoo.co/en/articles/8833508-why-aren-t-my-sales-being-detected (09/07/2026)
- https://help.vendoo.co/en/articles/6260276-how-to-import-your-items-in-vendoo (07/10/2026)
- https://help.vendoo.co/en/articles/6746641-i-already-have-items-listed-on-multiple-marketplaces-do-i-import-twice (07/10/2026)
- https://help.vendoo.co/en/articles/6760021-can-i-import-sold-items
- https://help.vendoo.co/en/articles/6760022-why-are-duplicates-appearing-when-i-import
- https://help.vendoo.co/en/articles/6260283-how-do-i-connect-vendoo-to-multiple-accounts-on-the-same-marketplace
- https://help.vendoo.co/en/articles/6260292-how-to-use-vendoo-s-delist-relist-feature (07/10/2026)
- https://help.vendoo.co/en/articles/6260291-vendoo-s-stale-inventory-system
- https://help.vendoo.co/en/articles/6260264-vendoo-business-analytics
- https://help.vendoo.co/en/articles/6260307-is-the-vendoo-website-secure-is-vendoo-safe
- https://help.vendoo.co/en/articles/6260306-how-do-i-access-the-vendoo-google-chrome-extension
- https://help.vendoo.co/en/articles/6260309-how-does-the-item-counter-work-and-what-is-considered-a-new-item
- https://help.vendoo.co/en/articles/6260301-what-is-the-purpose-of-each-add-on-feature
- https://help.vendoo.co/en/articles/6260308-what-is-the-refund-policy
- https://help.vendoo.co/en/articles/16091202-what-changed-in-vendoo-2026 (29/07/2026)
- https://apps.apple.com/us/app/vendoo-a-sellers-best-friend/id1612168777 (page 429 avec curl ; données lues par https://itunes.apple.com/lookup?id=1612168777&country=us, puis country=gb, ca, fr, de)
- https://play.google.com/store/apps/details?id=co.vendoo.mobile&hl=en_US&gl=US
- https://chromewebstore.google.com/detail/mnampbajndaipakjhcbbaihllmghlcdf
- https://chromewebstore.google.com/detail/pookjkafopllbpneacklecbjmgbccile — ancienne extension, plus de fiche
- https://www.trustpilot.com/review/vendoo.co — lu avec WebFetch ; `curl` refusé (403)
