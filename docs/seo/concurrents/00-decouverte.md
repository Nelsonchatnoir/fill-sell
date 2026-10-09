# Concurrents de FillSell — découverte (étape 3.6, première passe)

Observation : **2026-10-09**. Lecture du web seule (WebSearch, WebFetch, curl). Aucun compte créé, aucune
connexion, aucun formulaire rempli. Sauf mention contraire, chaque fait vient de la page citée, lue le
09/10/2026. Les chiffres d'utilisateurs, de notes et de volumes publiés par les éditeurs sont
**leurs propres affirmations** : non vérifiés. Le seul chiffre tiers relevé est le nombre
d'utilisateurs affiché par le Chrome Web Store (CWS), lu le 09/10/2026.

Repère FillSell, mesuré par la même méthode : fiche CWS « FillSell — Cross-post »
(`chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm`) : **360 utilisateurs**,
mise à jour le 8 octobre 2026. Plateformes annoncées sur fillsell.app : Vinted, Leboncoin, eBay
et Beebs.

---

## 1. Les trois noms dictés par Nico

| Dicté | Vrai nom retenu | Certitude | Raisonnement |
|---|---|---|---|
| « Stoflow » | **StoFlow** — https://stoflow.com | **très forte (≈ 95 %)** | Le nom existe tel quel, et le domaine répond (200). Titre de la page : « StoFlow : vendez sur Vinted, eBay, Leboncoin, Etsy, Vestiaire ». C'est un outil français de crosslisting, et sa fiche CWS est active (mise à jour le 08/10/2026). `stockflow.fr` est un déstockeur de surstocks B2B, sans rapport. « StockFlow » sur l'App Store et Capterra est un logiciel d'inventaire générique, lui aussi sans rapport. |
| « Flipper » | **Flypr** — https://flypr.app (probable) | **moyenne (≈ 65 %)** | Aucun outil de revente ne s'appelle « Flipper ». `flipper.fr` est « Flipper AI », un assistant de documentation pour flippers (billards électriques), et `flippr.app` est un domaine à vendre. Flypr se prononce « flipeur » et se présente comme « l'outil des revendeurs (Vinted, Leboncoin, eBay) », avec un crosslisting sur 6 sites. Autres pistes, moins probables : **Flyp** (https://www.joinflyp.com, crosslister américain, ≈ 20 %), **FlipPulse** (extension Chrome de calcul de marge pour Vinted et Leboncoin, ≈ 10 %) et FlipperHelper (app iOS britannique de suivi de profit, faible). |
| « CleanZ » | **Clemz** — https://www.clemz.app (probable) | **moyenne (≈ 70 %)** | Aucun outil de revente ne s'appelle « CleanZ » ni « Cleanz ». `cleanz.fr` est un service de nettoyage de vitres à Paris, Cleanz24 une société de nettoyage en Inde, et « Cleazy » une app de pressing (App Store). Clemz est phonétiquement le plus proche : c'est l'extension française la plus installée pour automatiser un dressing Vinted (CWS : 10 000 utilisateurs). En revanche, Clemz ne fait **pas** de crosslisting. Autres pistes, faibles : Closo (≈ 10 %) et Klork (≈ 5 %). |

Pour Flypr et Clemz, il faut demander confirmation à Nico : une capture ou l'endroit où il les a vus
suffit à trancher.

---

## 2. Vue d'ensemble — priorités

**Priorité 1** (concurrent direct majeur, à vérifier en détail à l'étape suivante) : 8 outils.
**Priorité 2** (secondaire, à suivre) : 6 outils. **Priorité 3** : simple mention.

| P | Outil | URL | Catégorie | Marché | Plateformes (annoncées) | Forme | CWS (09/10) |
|---|---|---|---|---|---|---|---|
| 1 | **StoFlow** | https://stoflow.com | crosslisting FR | France | Vinted, Leboncoin, eBay, Vestiaire, Etsy, Opla (bêta), AbeBooks (bêta) | extension + tableau de bord web + « mode cloud » | 175 utilisateurs, MAJ 08/10/2026 |
| 1 | **FlowDino** | https://www.flowdino.com | crosslisting FR | France | Vinted, Leboncoin, eBay, Etsy, Vestiaire, **Beebs**, Whatnot (bêta), Opla (bêta) | extension + web ; Shopify / WooCommerce / PrestaShop | 326 utilisateurs, MAJ 07/10/2026 |
| 1 | **Flypr** | https://flypr.app | crosslisting FR | France | Vinted, Leboncoin, eBay, Grailed, Selency, Vestiaire | extension (annoncée) + web | fiche introuvable |
| 1 | **Klork** | https://klork.app | crosslisting FR | France | Vinted → Leboncoin, eBay, Depop, Vestiaire | extension + espace web | 585 utilisateurs, MAJ 08/10/2026 |
| 1 | **Redrip** | https://www.redrip.app | crosslisting FR (Vinted ↔ Leboncoin) | France | Vinted, Leboncoin | extension + web | 1 000 utilisateurs, MAJ 08/10/2026 |
| 1 | **FLUF Connect** | https://fluf.io | crosslisting international | Royaume-Uni probable, pages FR | 60+ canaux revendiqués, dont Vinted, Leboncoin, Vestiaire, eBay, Depop | **apps iOS/Android** + web + extension + API | non relevé |
| 1 | **Crosslist** | https://crosslist.com | crosslisting international | Belgique (Kortrijk) ; US/UK/CA/AU | eBay, Poshmark, Depop, Etsy… ; **Vinted fermé aux nouveaux comptes, clients UE refusés** | web + mobile + extension | non relevé |
| 1 | **Clemz** | https://www.clemz.app | outil Vinted seul | France | Vinted | extension | 10 000 utilisateurs, MAJ 08/10/2026 |
| 2 | Reposter | https://reposter.io | crosslisting FR (LBC ↔ Vinted) | France (probable) | Leboncoin, Vinted | service web (pas d'extension annoncée) | — |
| 2 | Relistly | https://relistly.io | crosslisting international (Europe) | Europe (24 pays + UK, CH, NO) | 18 marketplaces dont Vinted ; Leboncoin « bientôt » ou listé, selon la section | extension + web | 39 utilisateurs (Relistly Bridge), MAJ 12/08/2026 |
| 2 | DressKare | https://dresskare.com | outil Vinted (+ dépôt-vente) | France (Lyon) | Vinted, Shopify ; Vestiaire et Leboncoin contradictoires selon les pages | extension + web | 971 utilisateurs, MAJ 09/10/2026 |
| 2 | Vendoo | https://vendoo.co | crosslisting international | US | eBay, Poshmark, Mercari, Etsy, Depop, Vestiaire… ; **pas de Vinted** dans sa FAQ | web + apps mobiles | — |
| 2 | List Perfectly | https://listperfectly.com | crosslisting international | US (support officiel US) | 14 marketplaces, dont Vinted | web + extension | — |
| 2 | Margeo | https://margeoapp.com | gestion stock / compta revendeur | France | suivi Vinted, Leboncoin, eBay… (**ne publie pas**) | web / PWA | — |

---

## 3. Fiches — priorité 1

### StoFlow — https://stoflow.com (dicté « Stoflow »)
- **Existe, actif** : site en ligne. Fiche CWS « StoFlow : vendez sur Vinted, Leboncoin, eBay, Etsy et
  Vestiaire » en version 1.54.0, mise à jour le 8 octobre 2026. Développeur indiqué sur le CWS : STOKODE
  (Pontault-Combault, 77). Le CWS affiche **175 utilisateurs**.
- **Ce qu'il fait** : il présente une fiche publiée sur 5 marketplaces, un stock synchronisé et le
  retrait des autres annonces après une vente (« Un produit vendu est retiré de toutes les autres
  marketplaces », dès le plan gratuit). S'y ajoutent une republication Vinted/Leboncoin (plan Pro,
  jusqu'à 200 par jour), un détourage IA, une rédaction IA, une messagerie IA qui négocie au-dessus d'un
  prix plancher, du « Smart Pricing » et une relance des favoris. Le plan Pro ouvre un « mode cloud » :
  les comptes tournent sur des serveurs en France pendant que l'ordinateur est éteint.
- **Plateformes par plan** : Gratuit = Vinted et Leboncoin ; Starter = + eBay France ; Pro =
  + Vestiaire et Opla (bêta) ; Business = + Etsy, AbeBooks (bêta) et eBay dans 9 pays. Ni Beebs ni Depop.
- **Prix (TTC/mois)** : Gratuit à 0 € (100 produits, 2 marketplaces), Starter à 14,99 €, Pro à 29,99 €,
  Business à 79,99 €.
- **Fondateur** : « Matthias », ingénieur et gérant de la friperie « Shop Ton Outfit ». Le site affiche
  « 100 % Hébergé en France ».
- **SEO** : le blog est actif. « Meilleur logiciel de crosslisting en 2026 » a été publié le 23/07/2026
  et mis à jour le 06/10/2026 : il compare 13 outils et **ne cite pas FillSell**. Un autre article
  s'intitule « Crosslisting : vendre sur plusieurs marketplaces ». StoFlow est sans doute le concurrent
  éditorial le plus direct sur « crosslisting » en français.
- Sources : https://stoflow.com/ ;
  https://stoflow.com/blog/meilleur-logiciel-crosslisting-2026 ;
  https://chromewebstore.google.com/detail/stoflow-vendez-sur-vinted/mbckhfhfapmdgfidjjpkpnaafnckeipg

### FlowDino — https://www.flowdino.com
- **Existe, actif** : fiche CWS « FlowDino - Gestion Multi Plateformes » en version 1.4.13, mise à jour
  le 7 octobre 2026, **326 utilisateurs**. Développeur indiqué sur le CWS : un particulier domicilié dans
  l'Aisne (02). Le site affiche « © 2025 ». Une app Shopify existe aussi (lancement indiqué : 14/04/2026),
  ainsi qu'une extension WordPress.
- **Ce qu'il fait** : le titre du site dit « Automatisez vos annonces sur Vinted, Leboncoin, Etsy, eBay,
  Vestiaire Collective, Beebs, Whatnot & Opla ». Il publie, renouvelle et booste sur 8 plateformes, retire
  l'article partout après une vente et synchronise le stock avec Shopify, WooCommerce et PrestaShop. Côté
  IA : textes, mannequin virtuel et fond, tags Etsy. Il propose aussi des messages aux favoris et un
  échange de vues et de favoris.
- **Le plus proche de FillSell par les plateformes** : c'est le **seul autre outil vu qui annonce Beebs**
  (« Beebs est maintenant stable, il sera facturé à partir du 1/10 »). Aucune app mobile n'est annoncée.
- **Prix** : Gratuit (50 articles, sans carte bancaire), Premium à 19,99 €/mois, Pro à 49,99 €/mois,
  essai de 14 jours. La fiche Shopify affiche d'autres prix (Starter à 7,99 $/mois, gratuit à
  200 articles) : à recouper.
- Sources : https://www.flowdino.com/ ;
  https://chromewebstore.google.com/detail/flowdino-gestion-multi-pl/iealfioknccembacfpjgodhoehdmggak ;
  https://apps.shopify.com/flowdino-gestion-multiplatef

### Flypr — https://flypr.app (dicté « Flipper », correspondance probable)
- **Existe**. **Activité incertaine** : les articles du blog vont du 24/03/2026 au 18/04/2026, puis plus
  rien. Le site ne donne aucun lien vers une fiche CWS, et la recherche « flypr » sur le CWS ne renvoie
  rien le 09/10/2026.
- **Ce qu'il fait** : il se présente comme « Le cockpit des revendeurs FR », avec stock, bénéfice net en
  temps réel, publication sur 6 sites (Vinted, Leboncoin, eBay, Grailed, Selency, Vestiaire) via une
  extension Chrome, un agent IA de messagerie et de négociation, et un export URSSAF. Le retrait
  automatique après une vente n'est pas décrit.
- **Prix** : Gratuit (4 produits, 2 plateformes), Starter à 6,90 €/mois, Pro à 12,90 €/mois, Business à
  29,90 €/mois, avec 1 mois offert.
- **Fondateur** : solo, « Nicolas ». Le site est « construit en France ».
- Source : https://flypr.app/ ; https://flypr.app/blog

### Klork — https://klork.app
- **Existe, actif** : fiche CWS « Klork — Publie ton dressing Vinted partout », **585 utilisateurs**,
  mise à jour le 8 octobre 2026. Développeur : un particulier de Gironde (33).
- **Ce qu'il fait** (fiche CWS) : il « sauvegarde ton dressing Vinted et publie tes annonces en 1 clic
  sur Leboncoin, Depop, Vestiaire Collective et eBay ». Le formulaire de chaque marketplace se remplit
  seul, avec un export en lot et une file d'attente visible. Il gère plusieurs comptes Vinted et propose
  un « Relister » qui supprime puis republie l'annonce. Tout se passe « dans TON navigateur, sans jamais
  te demander les mots de passe ». La page d'accueil se résume à un slogan, « Sauvegarde ton dressing et
  republie partout en 1 clic ». Prix non vus.
- Sources : https://chromewebstore.google.com/detail/klork-%E2%80%94-publie-ton-dressi/gcjfkpapmjmflgnadggedomnocfheagf ;
  https://klork.app/

### Redrip — https://www.redrip.app
- **Existe, actif** : fiche CWS « Vinted Assistant - Reposte vos annonces en un clic sur Vinted et
  Leboncoin », **1 000 utilisateurs**, mise à jour le 8 octobre 2026. Le site affiche « Made in France »
  et « Since 2021 ». Développeur indépendant : « Antoine ».
- **Ce qu'il fait** : il publie les articles Vinted sur Leboncoin en un clic et republie
  automatiquement sur les deux plateformes. Il répond aux messages par IA (9 langues), télécharge les
  bordereaux en lot et envoie des offres aux favoris. Il revendique « 850k articles republiés » et
  « +2 000 vendeurs ».
- **Prix** : un plan gratuit permanent (50 republications et 10 publications Leboncoin par mois), puis
  5,99 €, 11,99 € et 19,99 €/mois.
- **SEO** : il a des articles « Multi-listing : vendre sur Vinted et Leboncoin en même temps (2026) » et
  « Publier ses annonces Vinted sur Leboncoin en 1 clic ».
- Sources : https://www.redrip.app/ ;
  https://www.redrip.app/blog/multi-listing-vinted-leboncoin/ ;
  https://chromewebstore.google.com/detail/redrip/ljefajifldflgjhipnfabbhjbbhnhoho

### FLUF Connect — https://fluf.io
- **Existe, actif.** Les prix sont en livres sterling et le site cite Gumtree : le Royaume-Uni est
  probablement son marché d'origine (déduction). Il a une section en français (« FLUF Connect France »).
- **Ce qu'il fait** : il se décrit comme « Seller Operating System across 60+ Channels », avec des
  annonces IA, une synchronisation du stock, de la republication, des offres, de la retouche d'images et
  des prix intelligents. Il cite parmi les canaux Vinted, Leboncoin, Vestiaire, eBay, Depop, Facebook
  Marketplace, Wallapop, Subito, Kleinanzeigen et Marktplaats. Sa page française précise que la
  republication couvre Vinted, eBay, Vestiaire et Depop, et que **Leboncoin n'a que le crosslisting et la
  synchro du stock**.
- **Le plus proche de FillSell par la forme** : il propose des **apps iOS et Android** (« snap a photo »)
  en plus du web, d'une extension, d'une API, de webhooks et d'un serveur MCP.
- **Prix** : les chiffres se contredisent. On lit « 7 jours pour 1 £, puis dès 9 £/mois » ailleurs que
  « Growth 19 £ / Seller 99 £ / Super Seller 299 £ ». À recouper.
- **SEO** : il publie des pages françaises par trajet (« Leboncoin vers Vinted », « Vinted vers
  Vestiaire »), « Vendre sur plusieurs plateformes » et « Logiciel de crosslisting ». C'est un concurrent
  éditorial direct sur les requêtes de trajet.
- Sources : https://fluf.io/ ; https://fluf.io/fr/vendre-plusieurs-plateformes/ ;
  https://fluf.io/crosslisting/leboncoin-to-vinted/ ; https://fluf.io/fr/logiciel-crosslisting/

### Crosslist — https://crosslist.com
- **Existe, actif.** Crosslist BV a son siège à Kortrijk, en Belgique. Sa page d'information indique
  « **Crosslist is currently not accepting EU customers** » et « **Vinted is no longer available for new
  customers** ». Le billet « Why We're Discontinuing Vinted for New Users » est daté de publication le
  09/10/2026, avec une date de mise à jour antérieure (02/10/2026) : métadonnées incohérentes.
- **Ce qu'il fait** : un crosslisting sur 11 à 12 marketplaces (eBay, Poshmark, Depop, Mercari, Grailed,
  Etsy, Facebook, Shopify, Whatnot, TikTok Shop…), avec web, app mobile complète et extension. Il
  revendique plus de 15 millions d'annonces en janvier 2026. Le prix, cité par des tiers, est de
  29,99 $/mois (Bronze).
- **Pourquoi en priorité 1** : c'est le poids lourd du référencement anglophone sur « crosslisting » et
  « Vinted crosslisting », avec des centaines de pages « How to cross list from Vinted to X ». Il se
  retire de Vinted et de l'UE : son contenu reste indexé, mais son produit n'est plus une option pour un
  revendeur français.
- Sources : https://crosslist.com/ai-info ; https://crosslist.com/blog/vinted-cross-listing ;
  https://crosslist.com/blog/best-cross-listing-apps-uk

### Clemz — https://www.clemz.app (dicté « CleanZ », correspondance probable)
- **Existe, actif** : fiche CWS « Clemz - automatisez votre dressing », **10 000 utilisateurs**, mise à
  jour le 8 octobre 2026. Développeur : SASU Clemz, Paris. Le pied de page du site dit « Fait avec ♥️ à
  Montpellier ». Le site revendique « Plus de 9 000 utilisateurs ».
- **Ce qu'il fait** : il automatise un dressing **Vinted** : republication, messages aux favoris,
  échanges de vues et de favoris, sauvegardes (« Réimportez-les en cas de ban »), bordereaux, édition en
  lot, factures et comptabilité. **Pas de crosslisting**, et Leboncoin n'est pas mentionné.
- **Prix** (page tarifs) : Tiroir à 8,99 €, Placard à 14,99 €, Dressing à 24,99 €, Entrepôt à 34,99 €
  (49,99 € avant remise), essai d'un mois.
- **Pourquoi en priorité 1** : Nico l'a nommé, et il a la plus grosse base installée vue sur le CWS dans
  la niche Vinted. C'est la référence à laquelle un revendeur Vinted compare tout outil.
- Sources : https://www.clemz.app/fr ; https://www.clemz.app/fr/pricing ;
  https://chromewebstore.google.com/detail/clemz-automatisez-votre-d/kjpggncklgopkhbfpohiaomjpljkbifg

---

## 4. Fiches — priorité 2

- **Reposter** — https://reposter.io : publication et remontée automatiques sur Leboncoin et Vinted,
  publication dans plusieurs villes, assistant de messagerie. Transfert LBC ↔ Vinted « en 1 clic » :
  statut ambigu, entre « En cours » et « Disponible ». C'est un **service web** (tableau de bord
  app.reposter.io) qui critique les extensions Chrome. Facturation au crédit : 10 crédits pour 10 €/mois,
  jusqu'à 500 crédits pour 50 €/mois. Il se déclare « indépendant » et non affilié à LBC France SAS,
  Adevinta ni Vinted UAB. Revendique « +1M publications » (non vérifié).
- **Relistly** — https://relistly.io : crosslisting « Europe-first », 18 marketplaces dont Vinted
  (24 pays). Leboncoin et Kleinanzeigen sont à la fois listés et marqués « coming soon » selon la
  section, et Beebs est absent. Prix : 14, 29 et 49 €/mois ; Business à 89 € « bientôt ». **Signes de
  lancement récent** : témoignages marqués « placeholders », « Early-access pricing », extension
  « Relistly Bridge » à 39 utilisateurs sur le CWS. Sources : https://relistly.io/ ;
  https://relistly.io/guides/best-vinted-crosslisting-app
- **DressKare** — https://dresskare.com : logiciel de dépôt-vente et de revente Vinted (Lyon) : fiches
  par IA, publication et republication en masse, CRM et facturation des déposants, marketplace de
  déposants, formation « DressKool ». Son article « Multiposter sur Vinted, Vestiaire Collective et
  Leboncoin » (20/07/2026) annonce les trois plateformes, mais sa page d'accueil ne cite que Vinted et
  Shopify. Prix : Éco à 9,90 €, Essentiel à 39 €, Pro à 69 € (FAQ). CWS : 971 utilisateurs, mise à jour le
  09/10/2026. Sources : https://dresskare.com/ ;
  https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/multiposter-vinted-vestiaire-leboncoin
- **Vendoo** — https://vendoo.co : crosslister américain (web et apps mobiles) : eBay, Poshmark,
  Mercari, Etsy, Depop, Facebook, Shopify, Whatnot, Grailed, Vestiaire. **Vinted absent de la liste
  prise en charge** : il n'apparaît que dans les mentions de marques déposées. Gros éditeur de contenu
  comparatif, avec un blog UK.
- **List Perfectly** — https://listperfectly.com : crosslister américain. Billet du 10/04/2026 :
  « You can crosslist to Vinted with any List Perfectly plan », mais le support officiel ne couvre que les
  États-Unis (« officially built, tested, and supported for use in the United States », cité par
  StoFlow). Leboncoin absent. Source :
  https://listperfectly.com/selling/vinted-marketplace-supported-in-list-perfectly/
- **Margeo** — https://margeoapp.com : application web (PWA) française d'achat-revente : stock par lot,
  simulateur de marge, micro-BIC, DAC7, assistant IA, connecteur Claude (MCP) en Pro. Elle **ne publie
  pas** (« il ne publie pas vos annonces sur Vinted ou Leboncoin »). Prix : gratuit, Pro à 7,99 €/mois,
  Business à 19,99 €/mois. **Concurrent éditorial** : son article « Comparatif applications crosslisting
  France 2026 », signé par le fondateur, Jules Bege, affirme « Aucun outil ne crossliste Vinted +
  Leboncoin de façon officielle et conforme aux CGU ». C'est une affirmation que FillSell, StoFlow,
  FlowDino, Klork et Redrip contredisent dans les faits. Sources : https://margeoapp.com/ ;
  https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026

---

## 5. Priorité 3 — mentions

### Outils Vinted seuls (extensions d'automatisation, France surtout)
| Outil | URL | Une ligne | CWS (09/10/2026) |
|---|---|---|---|
| Dotb | https://dotb.io | Extension Vinted : republication, messages aux favoris, agents IA, sauvegarde cloud. Prix de 6,99 à 24,99 € HT/mois. Revendique 14 312 vendeurs. Développeur sur le CWS : Paris (la marque affiche « Dotb, Inc. »). | 10 000 utilisateurs, MAJ 07/10 |
| Bleam | https://bleam.app/fr | Extension et app mobile Vinted : republication, favoris, négociation IA 24 h/24, CRM. Essai de 14 jours. Développeur à Lille. | 10 000 utilisateurs, MAJ 07/10 |
| Vintex | https://vintex.app/fr | Extension et tableau de bord « seconde main » : republication, messagerie unifiée, bordereaux, multi-comptes. Plan gratuit. Revendique 7 000 vendeurs et 22 pays. | 7 000 utilisateurs, MAJ 15/09 |
| Vinkit | https://vinkit.co | « CRM Vinted et bot Vinted » : republication, CRM, comptabilité. Adresse du développeur aux États-Unis sur le CWS. | 799 utilisateurs, MAJ 30/03 |
| Fripio | https://fripio.app | Extension Vinted **en préparation**, sur liste d'attente. Très actif en contenu SEO : comparatifs « alternative Clemz », « Fripio vs Vinteer »… | — |
| ControlResell | https://controlresell.com/fr | « OS » pour revendeurs, **cloud** et apps iOS/Android. Vinted et Shopify en service ; eBay, Leboncoin, Vestiaire, Depop, Etsy, Facebook et TikTok « bientôt ». De 29,99 à 119,99 €/mois. | — |
| Resela | https://resela.app | « Bot de Vinted con IA » : publication par photo, republication. Marché espagnol (page en espagnol). | — |
| Reboost | (CWS) | Republie des annonces Leboncoin et Vinted (suppression puis recréation), paiement au crédit. | 44 utilisateurs, MAJ 05/03 |
| VintHelper | non vérifiée | Extension Vinted (republication, favoris, offres) citée par un annuaire. Domaine `vinthelper.com` sans réponse le 09/10/2026. | — |

### Gestion de stock / comptabilité pour revendeurs (ne publient pas)
| Outil | URL | Une ligne |
|---|---|---|
| Vinteer | https://www.vinteer.io | Back-office Vinted et TikTok Shop : ventes, marges, stock, factures, exports comptables. Revendique « +3840 vendeurs ». 29 et 49 €/mois. Leboncoin, eBay et Vestiaire « à venir ». CWS : 1 000 utilisateurs, MAJ 06/10. |
| VintedCRM | https://vintedcrm.com | CRM Vinted : ventes, stock, factures, bordereaux. Extension de republication en option. Pro à 29 € HT/mois. Développeur à Bordeaux. Gros producteur de contenu (« logiciel gestion Vinted », « meilleur outil Vinted »). CWS : 426 utilisateurs, MAJ 09/10. |
| You-Sync | https://www.you-sync.fr | Lit les mails Vinted transférés et « ne touche jamais à ton compte ». Ventes, marges, seuils DAC7. Gratuit jusqu'à 20 ventes par mois, puis 12,90 et 24,90 €/mois. |
| Revendly | (CWS) | « Assistant Vinted : republier, relancer, booster ». Connecteur d'une application web. CWS : 45 utilisateurs, MAJ 06/10. |
| FlipPulse | (CWS) | Calcul de marge et détection de « pépites » sur Vinted et Leboncoin (côté achat). Version 1.0.4, MAJ 30/09. Nombre d'utilisateurs non affiché. |

### Crosslisting international — autres
| Outil | URL | Une ligne |
|---|---|---|
| Closo | https://closo.co | Américain. Crosslister gratuit sur 6 marketplaces, dont **Vinted** (via extension), plus un marché de gros (palettes) et un « Liquidators OS ». Abonnements dès 8 $/mois. |
| Flyp | https://www.joinflyp.com | Américain (San Francisco). Crosslister « Poshmark, eBay, Mercari, Depop, FB, Etsy, & Vinted » et bot Poshmark. Gratuit 100 jours, puis 9 $/mois. |
| Nifty | https://nifty.ai | Américain (ex-Auto Posher). Automatisation cloud et crosslisting : Poshmark, eBay, Mercari, Depop, Etsy, Whatnot. Pas de Vinted. |
| PrimeLister | https://www.primelister.com | Américain (adresse dans le Delaware). « 10,000+ US resellers ». Poshmark, eBay, Mercari, Depop, Etsy, Facebook, Grailed, Shopify. Vinted cité seulement dans la mention de marque. |
| SellerAider | https://selleraider.com | Crosslister et outil « Grow ». Marché UK selon un comparatif tiers. Une page française existe (« site comme Vinted »). Fripio le crédite de plus de 15 marketplaces, dont Vinted : non confirmé sur sa page d'accueil. |
| OneShop | https://oneshop.com | Américain (Inventory Systems, Inc.). Bots Poshmark, Mercari, Depop et eBay. Le pied de page affiche « © 2024 ». L'annuaire YC le marque **inactif** : activité douteuse. |
| CrossLister | https://crosslister.co | Petit crosslister (« © 2023 »). Aucune marketplace nommée sur l'accueil. Activité non démontrée. |
| Voolist | https://www.voolist.com | Crosslister américain (eBay, Poshmark, Depop, Etsy, Shopify). Vinted « en cours d'ajout » selon Relistly. |
| MassSell | (CWS) | Préremplit Vinted, Leboncoin, eBay et Selency depuis une fiche MassSell (« vous relisez et publiez vous-même »). 7 utilisateurs, MAJ 23/09. |
| Sylia | (CWS) | « Créer et dupliquer tes ventes sur Vinted, LeBonCoin, eBay et Delcampe ». 24 utilisateurs, MAJ 29/07. |

### Autres (hors produit, mais présents sur les requêtes)
- **Friptadium** — https://friptadium.com : vend des box de vêtements à revendre et publie un blog
  d'avis sur les outils (Clemz, Vinteer, VintedCRM, Vintex, « bot Vinted »). C'est un concurrent
  éditorial sur les requêtes « avis + outil ».
- **FlipStudio** — https://flipai.studio : photos et annonces IA pour Vinted, Depop et eBay, sans
  gestion de stock.
- **Choppy** (CWS) : alertes Vinted et Leboncoin côté acheteur.

---

## 6. Constats utiles pour la suite (SEO/GEO)

1. **Le crosslisting français existe bel et bien.** StoFlow, FlowDino, Flypr, Klork, Redrip,
   Reposter, FLUF et DressKare publient vers Vinted et Leboncoin, parfois au-delà. L'affirmation de
   Margeo (« aucun outil ne crossliste Vinted + Leboncoin ») est donc fausse dans les faits. FillSell
   n'y est pas cité.
2. **Beebs** n'est annoncé que par **FlowDino**, en plus de FillSell. **Aucun outil vu ne combine une
   app mobile native et l'exécution par l'extension sur l'ordinateur, sur Vinted, Leboncoin et Beebs.**
   FLUF (apps mobiles, Vinted, Leboncoin) et Bleam ou ControlResell (apps mobiles, Vinted seul ou cloud)
   sont les plus proches par la forme.
3. **Le retrait des Américains** : Crosslist n'accepte plus de clients UE et ferme Vinted aux nouveaux
   comptes (billet du 09/10/2026). List Perfectly n'assure qu'un support officiel aux États-Unis. Vendoo,
   Nifty et PrimeLister n'ont pas Vinted. Leur contenu anglophone reste pourtant indexé sur « Vinted
   crosslisting ».
4. **Les concurrents éditoriaux en français** : StoFlow (« meilleur logiciel crosslisting 2026 », mis à
   jour le 06/10), FLUF (pages par trajet en français), Redrip (« multi-listing Vinted Leboncoin »),
   Margeo (« comparatif crosslisting France »), Fripio et VintedCRM (comparatifs « meilleur outil
   Vinted »), Friptadium (avis). Ce sont ces pages qui occupent aujourd'hui les requêtes visées.
5. **Visibilité de FillSell (signal faible)** : la recherche `"FillSell" Vinted Leboncoin` de l'outil de
   recherche utilisé n'a renvoyé aucune page FillSell le 09/10/2026. En revanche, fillsell.app est
   ressorti sur une requête descriptive (« application achat revente multi-plateformes Vinted eBay
   Leboncoin publier »). Les deux comparatifs concurrents lus (StoFlow et Margeo) ne citent pas
   FillSell.
6. **Base installée sur le CWS (seul chiffre tiers)** : les outils Vinted seuls dominent, avec Clemz,
   Dotb et Bleam à 10 000 et Vintex à 7 000. Les crosslisters français sont petits : Redrip à 1 000,
   Klork à 585, FlowDino à 326, StoFlow à 175, FillSell à 360. La catégorie est jeune et aucun leader
   n'est installé.

## 7. Méthode et limites

- Recherches web (outil de recherche intégré, résultats centrés sur les États-Unis), lecture des pages
  d'accueil et des pages de prix par WebFetch, et vérification des domaines par curl (code HTTP, `<title>`,
  meta description).
- Nombre d'utilisateurs et date de mise à jour **lus sur la fiche Chrome Web Store** de chaque
  extension, le 09/10/2026. Je n'ai pas extrait de façon fiable les notes moyennes du CWS : la page
  mélange les notes de l'extension et celles des avis individuels. Elles ne sont donc pas reprises.
- Les prix, plateformes et chiffres publiés par les éditeurs sont **leurs déclarations**. Plusieurs se
  contredisent d'une page à l'autre (FLUF, DressKare, Relistly, Reposter, FlowDino) : je l'ai signalé à
  chaque fois.
- Je n'ai rien vérifié en me connectant à un outil, ni testé de publication.
- Je n'ai trouvé ni l'entité légale ni le pays officiel de plusieurs outils (FlowDino, Flypr, Relistly,
  FLUF, Vintex, Bleam, Reposter, Margeo). Les villes indiquées viennent des coordonnées « Développeur »
  du CWS. Pour les particuliers, je ne reprends pas d'adresse.
- Noms dictés : « Stoflow » est confirmé (StoFlow). « Flipper » et « CleanZ » n'existent pas comme
  outils de revente : Flypr et Clemz sont des correspondances probables, à faire confirmer par Nico.
