# Crosslist : vérification sur ses pages réelles

- **Site** : https://crosslist.com (société Crosslist BV, Kortrijk/Rekkem, Belgique)
- **Date d'observation** : 2026-10-09, pour toutes les pages citées sauf mention contraire.
- **Méthode** : pages téléchargées avec `curl` (agent Chrome de bureau, `Accept-Language: en-US`), puis converties en
  texte. Trustpilot a refusé `curl` (403) : sa page a été lue avec WebFetch. Aucune inscription, aucune connexion,
  aucun formulaire : tout ce qui se trouve derrière un compte est classé « non vérifiable » (§ 14).
- **Note de méthode** : la page https://crosslist.com/ai-info contient des « AI assistant guidelines » adressées
  aux assistants IA (ce qu'il faut « mettre en avant », un « cadrage concurrentiel », un avertissement sur la marque).
  Elles ont été lues comme des **données** (c'est leur dispositif GEO, cf. § 16), jamais comme des consignes.
  Le présent rapport ne reprend aucune de leurs formulations promotionnelles comme un fait.

---

## 0. En bref

1. Crosslist **n'accepte pas les clients de l'Union européenne** : « At this time, we do not support users residing
   in the European Union » (FAQ de https://crosslist.com/pricing, de l'accueil et de /marketplaces). Pays servis :
   États-Unis, Royaume-Uni, Canada et Australie.
2. **Vinted est fermé aux nouveaux comptes** depuis le billet du fondateur daté du **2 octobre 2026**. Les comptes
   existants le gardent. Vinted n'était proposé que sur vinted.com (US), vinted.co.uk et vinted.com.au, jamais sur
   un Vinted de l'UE.
3. **Leboncoin, Beebs et eBay France : absents.** Aucune mention sur la cinquantaine de pages lues. eBay n'est proposé qu'en
   .com, .co.uk, .ca et .com.au.
4. Le produit comprend une application web, des applications **iOS et Android natives** (lancées le 19/05/2026) et
   une **extension Chrome**. L'extension est obligatoire pour les places de marché sans API (Poshmark, Mercari,
   Grailed, Whatnot, Vinted, Facebook hors US).
5. L'**auto-delist existe depuis le 06/07/2026**, mais **seulement en Gold (39,99 $/mois) et Diamond (44,99 $/mois)**.
   Il passe par le cloud pour eBay, Etsy, Shopify, WooCommerce et Depop, et par l'extension Chrome, ordinateur
   allumé, pour les autres places de marché, dont Vinted.
6. La **republication est manuelle** (un clic, ou en lot). La programmation de republications figure sur leur feuille
   de route publique au statut « Under consideration ».
7. Prix en **dollars US uniquement** : de 29,99 $ à 44,99 $ par mois. Il n'y a **pas de formule gratuite**, seulement
   une garantie « satisfait ou remboursé » de 3 jours, limitée à moins de 20 annonces. L'IA est une option à
   4,99 $/mois.
8. Notes publiques : **Trustpilot 4,5/5 (1 114 avis)**, **App Store US 4,7 (382 notes)**, **Google Play 4,2
   (114 avis, plus de 5 000 téléchargements)** et **Chrome Web Store 4,0 (30 notes, 20 000 utilisateurs)**.
   L'application iOS est **introuvable sur les App Store France, Allemagne, Pays-Bas et Irlande** (404).
9. Interface, site, documentation et fiches des stores sont **en anglais uniquement**.

Pour un revendeur français, Crosslist n'est pas une option aujourd'hui : il ne sert pas l'UE, n'a ni Leboncoin ni
Beebs, et ferme Vinted. Son contenu anglophone reste en revanche indexé (§ 16).

---

## 1. Plateformes supportées (liste exacte)

| Source (2026-10-09) | Liste citée |
|---|---|
| https://crosslist.com/ai-info (« Last updated September 28, 2026 ») | « Supported marketplaces eBay, Poshmark, Facebook Marketplace, Depop, Mercari, Grailed, Shopify, Etsy, Whatnot, WooCommerce, TikTok Shop » ; « Marketplace availability is region dependent » ; « Vinted is no longer available for new customers » |
| https://crosslist.com/marketplaces | 10 fiches : eBay, Poshmark, Facebook Marketplace, Depop, Mercari, Grailed, Shopify, Etsy, Whatnot, WooCommerce (pas de TikTok Shop, pas de Vinted) |
| FAQ de l'accueil https://crosslist.com/ | « eBay, Poshmark, Mercari, Depop, Etsy, Facebook Marketplace, Grailed, Whatnot, Shopify, and WooCommerce » (10) |
| https://crosslist.com/marketplaces/tiktok | « TikTok Shop Cross Listing » ; « Support for TikTok Shop and 11+ other integrations » |
| Billet Vinted https://crosslist.com/blog/vinted-cross-listing (02/10/2026) | « TikTok Shop is coming next, in the US and UK » |
| Feuille de route https://feedback.crosslist.com/en/roadmap | « Add TikTok Shops » au statut **Planned** (85 votes) |
| https://crosslist.com/llms.txt (périmé) | « eBay, Poshmark, Vinted, Facebook Marketplace, Depop, Mercari, Grailed, Shopify, Etsy, Whatnot, Starluv » |

**TikTok Shop : statut contradictoire.** La fiche marketing le présente comme disponible, alors que le billet du
02/10 et la feuille de route l'annoncent comme « à venir ». Les pages publiques ne permettent pas de trancher.

### Disponibilité par pays (documentation)

Source : https://docs.crosslist.com/knowledge-base/settings-and-preferences/uk-canada-australia. « A slash (/)
indicates the marketplace is not available in that country. »

| Place de marché | États-Unis | Royaume-Uni | Canada | Australie |
|---|---|---|---|---|
| eBay | .com | .co.uk | .ca | .com.au |
| Poshmark | .com | / | .ca | / |
| **Vinted** | **.com** | **.co.uk** | **/** | **.com.au** |
| Facebook | .com | .com | .com | .com |
| Depop | .com | .com | .com | .com |
| Mercari | .com | / | / | / |
| Grailed, Etsy, Shopify, Whatnot | .com | .com | .com | .com |

- **Vinted** : US, UK et Australie seulement, pour les comptes existants. Les nouveaux comptes ne peuvent ni le
  connecter ni en importer : « New accounts can't connect to Vinted or import from it ». Aucun Vinted de l'UE
  (vinted.fr, .be, .de…), ce qui est cohérent avec le refus des clients UE.
- **Leboncoin** : absent (0 mention).
- **Beebs** : absent (0 mention).
- **eBay France (ebay.fr)** : absent. Seuls .com, .co.uk, .ca et .com.au figurent au tableau.
- **Depop** : proposé. Le lier exige « Google Chrome on a desktop, have our Chrome extension installed, and be signed
  in to Depop » (https://docs.crosslist.com/knowledge-base/listing-management/linking-listings).

## 2. Application mobile iOS / Android

**Oui, en applications natives.** Elles ont été lancées le **19/05/2026** : « Crosslist Mobile is officially live! »
(https://feedback.crosslist.com/en/changelogs).

- iOS : https://apps.apple.com/us/app/crosslist/id6756124351. Version 0.4.8 du 24/09/2026, iOS 15.6 ou plus récent,
  langue « English » seulement, sous-titre « List. Sell. Everywhere. ».
- Android : https://play.google.com/store/apps/details?id=com.crosslist.app. Version 0.4.8, mise à jour le
  23/09/2026, « 5K+ Downloads », Android 7.0 ou plus récent.
- Ce qu'ils promettent : « Bulk import your existing inventory from any marketplace », « Post to 11+ marketplaces
  without ever opening a laptop », « no computer required »
  (https://crosslist.com/features/mobile-app). Côté FAQ : « includes all core functionality, except autodelisting
  for some marketplaces » (https://crosslist.com/).
- Limite documentée : « Signing in with Google or Apple on your marketplace accounts is not available on mobile »
  (https://docs.crosslist.com/knowledge-base/marketplaces/marketplaces-faq/marketplaces-faq).
- **Disponibilité par App Store**, page de la fiche testée le 2026-10-09 : US 200, GB 200, CA 200, AU 200, BE 200,
  et **FR 404, DE 404, NL 404, IE 404**. L'application n'est pas proposée sur ces App Store de l'UE.
- Google Play, fiche en `hl=fr&gl=FR` : on y voit « Partager » et « Ajouter à la liste de souhaits », mais **ni
  bouton « Installer » ni note**. Cela laisse penser que l'application n'est pas installable en France, sans le
  prouver (page vue sans être connecté).

## 3. Extension navigateur

**Oui : extension Chrome « Crosslist ».**
- Fiche : https://chromewebstore.google.com/detail/crosslist/knfhdmkccnbhbgpahakkcmoddgikegjl. On y lit « 20,000
  users », « 4.0 (30 ratings) », version 3.11.51, mise à jour le **6 octobre 2026**, langue « English », éditeur
  Crosslist BV, déclaré comme « Trader » au sens de l'UE (D-U-N-S 372785281).
- Rôle, selon la FAQ (https://crosslist.com/) : « Crosslist® is API-first whenever a marketplace supports it […].
  When an API isn't available for the workflow needed, Crosslist® uses a secure browser extension that runs inside
  your own browser so actions happen directly on your computer. » Sur le blog UK, la publication en arrière-plan se
  fait « by opening a single tab for each marketplace »
  (https://crosslist.com/blog/best-cross-listing-apps-uk).
- Navigateurs requis : « Chrome 111 (March 2023) (preferred browser), Safari 16.4, Firefox 128 »
  (https://docs.crosslist.com/service/support/system-requirements). La documentation ne nomme que le Chrome Web
  Store pour l'extension.

## 4. D'où l'on part

**Des deux.** On peut partir du **téléphone** (applications natives, photo prise sur place) ou de
l'**ordinateur** (application web app.crosslist.com et extension Chrome). En revanche, pour les places de marché
« extension », la détection des ventes et l'auto-delist **exigent un ordinateur allumé avec Chrome** :
« The Crosslist Chrome extension / A desktop browser session / Your computer and browser to periodically remain
active » (https://docs.crosslist.com/knowledge-base/sales/autodelist). Pour Vinted : « Simply leave your computer
open and Crosslist will continue posting in the background »
(https://docs.crosslist.com/knowledge-base/marketplaces/vinted/vinted-faq).

Le schéma est donc proche de celui de FillSell : un téléphone ou le web pour piloter, l'extension sur l'ordinateur
pour exécuter là où il n'y a pas d'API. Crosslist ajoute une voie API/cloud pour eBay, Etsy, Shopify, WooCommerce et
Depop.

## 5. Identification par photo / IA

**Oui, en option payante.**
- « Crosslist® uses AI to generate complete, ready-to-publish listings directly from your photos: titles,
  descriptions, categories, key attributes and even a market-optimal price are created automatically »
  (https://crosslist.com/features/create-listings-with-ai).
- **Création en lot par IA**, lancée le 31/08/2026 : « Upload your camera roll and let AI group your photos into
  separate items automatically » (https://crosslist.com/pricing ;
  https://docs.crosslist.com/knowledge-base/templates-and-automation/ai-bulk-create).
- Prix suggéré par l'IA : « Use AI to suggest the right price based on real-time market insights », avec la mention
  « Included in AI generation » (page tarifs).
- Retouche photo par IA (le blog UK la dit « Powered by Nano Banana »), génération d'images, et détourage
  « unlimited » inclus dans toutes les formules.
- **Option IA facturée 4,99 $/mois**, avec des crédits mensuels selon la formule : 200, 500, 1 000 ou 2 000. Les
  packs supplémentaires coûtent 4,99 $ les 500 et 8,99 $ les 1 000, et valent 90 jours. Coûts : 1 crédit par annonce
  générée, 2 par image générée ou retouchée, 1 par lot de 10 images regroupées
  (https://docs.crosslist.com/service/subscription/ai-credits).
- Avis public : sur Google Play, un utilisateur juge le prix proposé par l'IA peu fiable (« The AI plucks prices out
  of thin air »). Sur l'App Store US (20 juin), un autre écrit « the ai will get the size or brand wrong […] The price
  however I would not trust completely ». Ce sont des **avis individuels**, pas une mesure.

## 6. Import / synchronisation du stock existant

**Oui.**
- « Click the Import button […] select the marketplace where your listings are currently live […] Crosslist will
  automatically start syncing your inventory », avec un import « in batches (up to 100) or import all listings at
  once » (https://docs.crosslist.com/getting-started/cross-listing-existing-inventory).
- **Rattachement automatique à l'import**, activé par défaut : « Matching is based on the listing title and image. If
  a match is found, the existing Crosslist listing will be selected by default ». La personne peut décocher le
  rapprochement proposé, et on ne peut rattacher qu'une annonce par place de marché et par article
  (https://docs.crosslist.com/knowledge-base/listing-management/linking-listings).
- Liaison manuelle par l'URL de l'annonce.
- Import et export CSV à partir de Gold seulement (page tarifs).
- Pas de synchronisation automatique des modifications : « No, Crosslist® does not automatically sync or adapt your
  listings across marketplaces […] it often creates more problems than it solves ». À la place, une mise à jour en
  lot, déclenchée par la personne (https://crosslist.com/marketplaces).

## 7. Retrait automatique des copies après une vente (auto-delist)

**Oui, depuis le 06/07/2026, en Gold et Diamond uniquement** : « Note: Autodelist and Sales Analytics are available
on Gold and Diamond plans » (changelog). L'option est **désactivée par défaut** et s'active place de marché par place
de marché.

Tableau recopié de https://docs.crosslist.com/knowledge-base/sales/autodelist :

| Place de marché | Détection des ventes | Quantité | Action s'il reste du stock |
|---|---|---|---|
| eBay, Etsy, Shopify, WooCommerce | Cloud | Multi | Baisse la quantité |
| Depop | Cloud | Multi | Baisse la quantité |
| Whatnot | Extension Chrome | Multi | Baisse la quantité |
| Poshmark | Extension Chrome | Multi | Baisse la quantité |
| Mercari, Grailed | Extension Chrome | Unitaire | Republie |
| Facebook Marketplace | Extension Chrome | Unitaire | Aucune action |
| Vinted | Extension Chrome | Unitaire | Aucune action |

- Délais : « Sales are typically detected within 15 minutes. For Vinted specifically, detection can take up to
  30 minutes. »
- Limites citées : seules les annonces **liées** sont suivies (« Unlinked listings won't be detected ») ; « not
  supported for multi-variant listings » ; une vente saisie à la main ne déclenche rien ; une vente annulée n'est
  pas détectée.
- Variante de la page marketing https://crosslist.com/features/autodelisting : Depop et « Facebook Marketplace (US
  only) » y sont détectés par les serveurs, contre « Poshmark and all other marketplaces […] needs your desktop
  browser to be running ». Le billet Vinted du 02/10 présente l'auto-delist cloud de Facebook Marketplace et de
  Depop comme « already in beta ». Les trois sources ne disent pas exactement la même chose.
- Signalements publics (avis individuels) : sur l'App Store US (12 août), « double check that when you make a sale
  the item automatically delists—sometimes it stays listed ». Une autre note de l'App Store US (23 septembre) écrit
  « I delisted the item… but it was still there ».

## 8. Republication / relist automatique

- **Republication manuelle en un clic ou en lot** : « Crosslist will automatically delist and post your listings
  sequentially » ; « Crosslist will handle delisting from the relevant marketplaces before reposting the item,
  preventing duplicate listings » (https://docs.crosslist.com/knowledge-base/listing-management/relist-delist).
- **Pas de republication programmée** : « Ability to schedule listings for posting/relisting/updating » est au
  statut **Under consideration** (57 votes) sur https://feedback.crosslist.com/en/roadmap.
- **Seule republication automatique** : après une vente sur une place de marché à quantité unitaire (Mercari,
  Grailed), si du stock reste (§ 7). Jamais sur Vinted : « relisting sold items is not allowed ».
- Vinted : « Normally, Crosslist prevents this by first delisting your existing listing and then relisting it to
  avoid duplicates ». Si la personne republie elle-même sur Vinted, le lien est rompu et Vinted peut supprimer la
  nouvelle annonce comme doublon (FAQ Vinted).
- Mise à jour d'une annonce sans republication, depuis janvier 2026 (« Update listings », changelog du 14/01/2026).

## 9. Stock, ventes, statistiques

- Tableau de bord unique (« what is listed where »), étiquettes et filtres, modèles d'annonce, prix par place de
  marché, actions en lot. Tout cela est inclus dans toutes les formules (page tarifs).
- **Statistiques de ventes en Gold et Diamond uniquement** : onglets « Analytics », « Insights » et « Profit &
  Loss ». On y trouve le chiffre d'affaires, le bénéfice, la marge, les frais de la place de marché, le coût
  d'achat, l'expédition, les remboursements, une comparaison par place de marché et un export CSV
  (https://docs.crosslist.com/knowledge-base/sales/sales-analytics).
- Fiche de vente détaillée : prix, port encaissé, remboursement, « Cost of goods » (obligatoire, repris par défaut
  de la fiche), frais standard, frais d'expédition et frais de mise en avant
  (https://docs.crosslist.com/knowledge-base/sales/sales-tracking).
- Avis public (Google Play) : un utilisateur regrette que les statistiques ne soient pas dans toutes les formules
  (« Sales analytics should be included in all packages »).

## 10. Prix

Source : https://crosslist.com/pricing (titre de la page : « Crosslist Pricing & Plans | From $29.99/mo »).

| Formule | Prix mensuel | Nouvelles annonces/mois | Photos/annonce | Inclus en plus | Crédits IA (avec l'option 4,99 $/mois) |
|---|---|---|---|---|---|
| Bronze | 29,99 $ | 200 | 9 | fonctions de base | 200 |
| Silver | 34,99 $ | 500 | 9 | fonctions de base | 500 |
| Gold (« Most Popular ») | 39,99 $ | 1 000 | 15 | CSV, **auto-delist**, **statistiques** | 1 000 |
| Diamond | 44,99 $ | illimité | 24 | CSV, **auto-delist**, **statistiques** | 2 000 |

- Le quota porte sur les **fiches créées ou importées** : « Once added, list without limits ». Republier, retirer
  et publier ailleurs n'est pas plafonné.
- Engagement trimestriel : « -10% » ; annuel : « 2 months free ». Les montants exacts ne sont pas dans le HTML
  servi (ils sont calculés par JavaScript) et n'ont pas été relevés.
- **Devise** : dollars US seulement sur la page. Aucune mention de £, € ni d'une autre devise.
- **Pas de formule gratuite ni d'essai sans paiement** : « 3-day money-back guarantee on your first purchase, as long
  as you've created fewer than 20 listings ». Pour un abonnement annuel, « a small $9.99 processing fee applies ».
  Le remboursement se demande par le chat de l'application dans les 72 h. Un avis de l'App Store US (23 septembre)
  le dit à sa façon : « There is no option to TRY this app out ».
- Paiement par carte, Google Pay ou Apple Pay, via Stripe. L'application mobile est gratuite à télécharger, avec
  des achats intégrés (« Offers in-app purchases », fiche CWS).

## 11. Pays et langues

- Pays : « Crosslist® is currently available in the United States, the United Kingdom, Canada, and Australia. At
  this time, we do not support users residing in the European Union. » (FAQ, plusieurs pages.)
- Dans les CGU (« Last updated on September 28, 2026 », https://crosslist.com/terms-of-service), le droit belge
  s'applique et les tribunaux de Kortrijk sont compétents. Le service est « intended for professional and business
  use ». La clause d'éligibilité n'exclut pas l'UE en toutes lettres ; l'exclusion figure dans la FAQ.
- Langue : anglais seulement. On le voit à `<html lang="en">`, à l'absence de `hreflang`, à la langue « English »
  des fiches App Store et CWS, et à une documentation entièrement en anglais. Seule la fiche Google Play est
  traduite automatiquement en français (`hl=fr`).
- Réglages régionaux automatiques, par exemple poshmark.co.uk ou ebay.co.uk, et unités métriques (kg) pour le
  Royaume-Uni depuis janvier 2026.

## 12. Notes publiques

| Source | Note | Volume | Observé le | Remarque |
|---|---|---|---|---|
| Trustpilot https://www.trustpilot.com/review/crosslist.com | 4,5/5 | **1 114 avis** | 2026-10-09 (WebFetch ; curl 403) | profil « Claimed » depuis juillet 2022, Belgique ; 5★ 67 %, 4★ 25 %, 3★ 4 %, 2★ <1 %, 1★ 3 % |
| App Store US https://apps.apple.com/us/app/crosslist/id6756124351 | 4,7 | 382 notes | 2026-10-09 | v0.4.8 (24/09/2026) |
| App Store GB https://apps.apple.com/gb/app/crosslist/id6756124351 | 4,5 | 61 notes | 2026-10-09 | |
| App Store CA | 4,3 | 12 notes | 2026-10-09 | |
| App Store AU | 3,8 | 8 notes | 2026-10-09 | |
| App Store FR / DE / NL / IE | — | — | 2026-10-09 | page 404 (application non proposée) |
| Google Play https://play.google.com/store/apps/details?id=com.crosslist.app | 4,2 | 114 avis (110 sur téléphone) | 2026-10-09 | 5K+ téléchargements, mise à jour du 23/09/2026 |
| Chrome Web Store https://chromewebstore.google.com/detail/crosslist/knfhdmkccnbhbgpahakkcmoddgikegjl | 4,0 | 30 notes | 2026-10-09 | 20 000 utilisateurs, v3.11.51 (06/10/2026) |

Chiffres revendiqués par Crosslist lui-même, non vérifiables : « 50,000+ active sellers » et « 40M+ listings
created and published » (ai-info, accueil). Un autre de leurs fichiers, https://crosslist.com/llms.txt, donne
« 40,000+ active sellers, 15M+ listings created » et « Trustpilot […] 650+ reviews ».

## 13. Ce qu'ils font bien (honnêtement)

- **Une documentation publique, précise et franche** (https://docs.crosslist.com/). Elle donne les délais de
  détection (15 min, 30 min pour Vinted), les règles de quantité, ce qui passe par le cloud et ce qui passe par
  l'extension, et les limites (« Unlinked listings won't be detected », « cannot detect canceled sales »). C'est
  rare dans ce marché.
- **Une feuille de route publique avec votes et un journal des changements daté**
  (https://feedback.crosslist.com/en/roadmap, /changelogs).
- **Une architecture mixte : API et cloud quand la place de marché le permet** (eBay, Etsy, Shopify, WooCommerce,
  Depop), où l'ordinateur peut rester éteint, et extension pour le reste.
- **Des applications mobiles natives complètes**, avec la même liste de places de marché que le web et une
  synchronisation en temps réel annoncée.
- **Un modèle de prix lisible** : le quota porte sur les fiches créées, et republier ou retirer n'est pas plafonné.
  Quatre formules en escalier, quantités multiples, prix par place de marché.
- **Une IA bien outillée** : de la photo à l'annonce, regroupement d'un rouleau de photos en annonces, prix suggéré,
  retouche, détourage illimité.
- **Une communication transparente sur Vinted** : suspensions de 24 h « affect all automated software, without
  exception », un mode « brouillon » proposé aux comptes touchés, et ils écrivent qu'ils ne peuvent pas garantir
  l'absence de suspension.
- **Une forte preuve sociale** : 1 114 avis Trustpilot à 4,5, 382 notes App Store US à 4,7.
- **Un dispositif SEO/GEO industriel** (§ 16).

## 14. Ce qu'on ne peut pas vérifier sans compte

- Si l'inscription d'une personne résidant dans l'UE est **techniquement bloquée** (pays imposé, adresse, carte), ou
  seulement déconseillée par la FAQ.
- Si les **clients UE déjà inscrits** gardent l'accès.
- La **qualité réelle de l'IA** (titres, marques, tailles, prix) et sa vitesse.
- Si l'application mobile **publie vraiment sur les places de marché « extension »** (Poshmark, Mercari, Vinted…)
  sans ordinateur allumé, comme le dit « no computer required ». La documentation de l'auto-delist et la FAQ Vinted
  laissent penser le contraire pour ces places de marché.
- Le **mode brouillon Vinted** (« posting as drafts ») et son effet réel sur les suspensions.
- Le **contenu exact des statistiques** et la fiabilité de la détection des ventes.
- Les **montants exacts** des formules trimestrielles et annuelles.
- Le **statut réel de TikTok Shop** (§ 1).
- L'**installabilité de l'application Android en France** (la fiche FR n'affiche pas « Installer », vue sans
  connexion).
- Le **nombre réel d'utilisateurs actifs** : « 50,000+ » sur l'accueil, « 40,000+ » dans llms.txt.

## 15. Contradictions relevées sur leurs propres pages (2026-10-09)

| Sujet | Page A | Page B |
|---|---|---|
| TikTok Shop | /marketplaces/tiktok et /ai-info : disponible | billet du 02/10 : « coming next » ; feuille de route : « Planned » |
| Vinted | /ai-info : « no longer available for new customers » | /llms.txt : Vinted dans les places de marché prises en charge |
| Utilisateurs / annonces | accueil, ai-info : 50 000+ vendeurs, 40M+ annonces | llms.txt : 40 000+, 15M+ |
| Avis Trustpilot | accueil : 1 000 avis | llms.txt : 650+ (Trustpilot affiche 1 114) |
| Auto-delist cloud | docs : eBay, Etsy, Shopify, WooCommerce (+ Depop au tableau) | /features/autodelisting : + Depop et Facebook (US) ; billet : Facebook et Depop « in beta » |
| Mobile | /features/mobile-app : « no computer required », « no mobile-only restrictions » | FAQ : « except autodelisting for some marketplaces » ; docs : extension Chrome sur ordinateur pour la détection |

**Correction de la note de découverte** (`docs/seo/concurrents/00-decouverte.md`) : sur la page
https://crosslist.com/blog/vinted-cross-listing elle-même, on lit « Last updated on: October 2, 2026 », et le
JSON-LD porte `datePublished` = `dateModified` = `2026-10-02T00:00:00.000Z`. La page n'est donc pas incohérente. La
date du 09/10/2026 relevée à la découverte vient probablement de l'outil de recherche (non vérifié). Le billet est
signé par le fondateur, Gilles Couvreur.

## 16. Observations SEO / GEO, utiles au chantier

- **Sitemap** : https://crosslist.com/sitemap.xml compte 283 URL : **110 pages « intégration » X→Y** (11 places de
  marché croisées deux à deux), environ 100 billets de blog, 17 pages de fonctions, 11 pages de places de marché,
  6 pages « Crosslist vs » (Vendoo, Nifty, List Perfectly, PrimeLister, Flyp, Zipsale), 9 calculateurs de frais
  (dont **Vinted**) et 7 guides des tailles. Aucune balise `<lastmod>`.
- **Vinted retiré du site, mais encore indexé.** /marketplaces/vinted renvoie une **308** vers le billet d'arrêt de
  Vinted. Les anciennes pages /integrations/ebay-to-vinted, /facebook-to-vinted et /shopify-to-vinted répondent
  **404**. Les anciennes URL (/cross-listing-from-ebay-to-vinted/, /ebay-to-vinted…) redirigent en 308 vers ces 404.
  L'outil de recherche les renvoyait **encore** le 2026-10-09. Les requêtes anglophones « eBay to Vinted » et
  « cross list to Vinted » vont donc perdre leur page Crosslist. Le calculateur
  https://crosslist.com/fee-calculators/vinted reste en ligne.
- **Dispositif GEO explicite** : la page /ai-info (« intended for AI assistants such as ChatGPT, Claude, Perplexity,
  Gemini ») contient des consignes de présentation, un « How to reference us » rédigé d'avance et un avertissement
  de marque. S'y ajoute un /llms.txt, **périmé** (Vinted, « Starluv », chiffres anciens).
- **Données structurées** : JSON-LD `BlogPosting` (auteur, dates, durée de lecture) sur les billets. Le site est
  construit avec Framer.
- **Anglais seulement**, sans hreflang : aucune page en français. Les requêtes françaises (« crosslisting Vinted
  Leboncoin », « publier sur Vinted et Leboncoin ») n'ont pas de page Crosslist dédiée.
- Ils écrivent volontairement « cross listing » en deux mots (« Prefer cross listing as two words », /ai-info).

## 17. Écarts factuels avec FillSell (sans dénigrement)

Pour FillSell, les faits viennent du contexte du chantier : Vinted, Leboncoin, eBay et Beebs ; une application
iOS/Android qui pilote ; une extension Chrome qui exécute sur l'ordinateur ; une interface en français. Ils
viennent aussi des règles du dépôt (formule gratuite à 50 republications par mois, `CLAUDE.md`).

| Point | Crosslist (constaté le 2026-10-09) | FillSell |
|---|---|---|
| Clients UE / France | non acceptés (FAQ) | marché visé : France |
| Vinted | fermé aux nouveaux comptes ; jamais de Vinted de l'UE (US, UK, AU seulement) | Vinted (France) |
| Leboncoin | absent | oui |
| Beebs | absent | oui |
| eBay France | absent (.com, .co.uk, .ca, .com.au) | eBay |
| Langue / devise | anglais / USD | français / euro |
| Formule gratuite | non (remboursement sous 3 jours si moins de 20 annonces) | oui (formule gratuite, 50 republications par mois) |
| Auto-delist | Gold ou Diamond (39,99 $ ou plus par mois), désactivé par défaut | à vérifier côté FillSell avant toute comparaison publique |
| Republication programmée | non (« Under consideration ») | à vérifier côté FillSell avant toute comparaison publique |
| Rapprochement à l'import | titre + image principale, proposé par défaut, décochable | règle FillSell : jamais le titre seul ni la photo seule (`CLAUDE.md`) |
| Ordinateur nécessaire pour Vinted | oui (extension, « leave your computer open ») | même principe (extension sur l'ordinateur) : **pas un écart** |
| Application mobile native | oui (iOS, Android, depuis le 19/05/2026) | oui : **pas un écart** |

Les lignes « à vérifier » ne doivent pas servir d'argument tant que le comportement de FillSell n'est pas relu
dans le code ou dans le produit.

---

## Sources (toutes consultées le 2026-10-09)

| URL | Ce qui y a été relevé |
|---|---|
| https://crosslist.com/ | FAQ : pays, absence de l'UE, 10 places de marché, API d'abord puis extension, mobile « except autodelisting for some marketplaces », prix 29,99–44,99 $ |
| https://crosslist.com/ai-info | fiche pour assistants IA : 11 places de marché dont TikTok Shop, « not accepting EU customers », « Vinted is no longer available for new customers », chiffres revendiqués (« Last updated September 28, 2026 ») |
| https://crosslist.com/llms.txt | fichier périmé : Vinted et Starluv listés, 40 000+ vendeurs, 15M+ annonces, 650+ avis |
| https://crosslist.com/pricing | quatre formules, quotas, photos, Gold et Diamond = auto-delist et statistiques, option IA 4,99 $/mois, garantie 3 jours, USD |
| https://crosslist.com/marketplaces | 10 places de marché, pas de synchronisation automatique, plusieurs comptes par place de marché |
| https://crosslist.com/marketplaces/tiktok | « Support for TikTok Shop and 11+ other integrations » |
| https://crosslist.com/marketplaces/vinted | 308 vers /blog/vinted-cross-listing |
| https://crosslist.com/blog/vinted-cross-listing | arrêt de Vinted pour les nouveaux comptes, suspensions de 24 h, mode brouillon, TikTok Shop « coming next », auto-delist cloud en bêta (02/10/2026) |
| https://crosslist.com/blog/best-cross-listing-apps-uk | liste UK sans Vinted ; publication par un onglet par place de marché ; inconvénient reconnu : extension nécessaire pour l'auto-delist (mis à jour le 02/10/2026) |
| https://crosslist.com/features/mobile-app | « no computer required », mêmes places de marché que sur ordinateur |
| https://crosslist.com/features/create-listings-with-ai | de la photo à l'annonce complète, création en lot |
| https://crosslist.com/features/ai-powered-pricing | prix suggéré par l'IA |
| https://crosslist.com/features/autodelisting | détection par les serveurs (dont Depop et Facebook US) ou par l'extension ; Gold et Diamond |
| https://crosslist.com/terms-of-service | droit belge, tribunaux de Kortrijk, usage professionnel (28/09/2026) |
| https://crosslist.com/gdpr-compliance | page RGPD (16/01/2026) |
| https://crosslist.com/fee-calculators/vinted | calculateur Vinted toujours en ligne |
| https://crosslist.com/sitemap.xml | 283 URL, typologie |
| https://crosslist.com/integrations/ebay-to-vinted | 404 |
| https://docs.crosslist.com/knowledge-base/settings-and-preferences/uk-canada-australia | tableau des domaines par pays (Vinted : US, UK, AU) |
| https://docs.crosslist.com/knowledge-base/sales/autodelist | tableau cloud / extension, délais, limites, Gold et Diamond |
| https://docs.crosslist.com/knowledge-base/sales/sales-tracking | détection des ventes, champs d'une vente |
| https://docs.crosslist.com/knowledge-base/sales/sales-analytics | statistiques (Gold et Diamond) |
| https://docs.crosslist.com/knowledge-base/marketplaces/vinted/vinted-faq | captcha, doublons, 45 s par annonce, ordinateur ouvert |
| https://docs.crosslist.com/knowledge-base/listing-management/relist-delist | republication manuelle en lot ou à l'unité |
| https://docs.crosslist.com/knowledge-base/listing-management/linking-listings | rapprochement par titre et image ; Depop exige Chrome, l'extension et l'ordinateur |
| https://docs.crosslist.com/getting-started/cross-listing-existing-inventory | import et synchronisation par lots de 100 |
| https://docs.crosslist.com/service/subscription/ai-credits | crédits IA, packs, validité 90 jours |
| https://docs.crosslist.com/service/support/system-requirements | Chrome 111, Safari 16.4, Firefox 128, Android 7.0 |
| https://docs.crosslist.com/knowledge-base/marketplaces/marketplaces-faq/marketplaces-faq | pas de connexion Google ou Apple sur mobile |
| https://feedback.crosslist.com/en/changelogs | mobile le 19/05/2026, auto-delist et statistiques le 06/07/2026, création en lot par IA le 31/08/2026 |
| https://feedback.crosslist.com/en/roadmap | programmation « Under consideration », TikTok Shops « Planned », Vestiaire « Under consideration » |
| https://apps.apple.com/us/app/crosslist/id6756124351 (+ /gb, /ca, /au, /be, /fr, /de, /nl, /ie) | notes et volumes ; 404 en FR, DE, NL et IE |
| https://play.google.com/store/apps/details?id=com.crosslist.app | 4,2, 114 avis, 5K+ téléchargements ; fiche FR sans « Installer » |
| https://chromewebstore.google.com/detail/crosslist/knfhdmkccnbhbgpahakkcmoddgikegjl | 4,0, 30 notes, 20 000 utilisateurs, v3.11.51 du 06/10/2026 |
| https://www.trustpilot.com/review/crosslist.com | 4,5, 1 114 avis (lu par WebFetch) |
| https://finance.yahoo.com/sectors/technology/articles/crosslist-introduces-cross-listing-platform-154200801.html | communiqué du 28/04/2026, daté de Kortrijk, qui cite encore Vinted en exemple |
