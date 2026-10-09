# Margeo (https://margeoapp.com) — vérification sur pièces

**Observé le 2026-10-09** (entre 13:00 et 13:25 UTC environ). J'ai seulement lu le web : pages publiques
(curl, WebFetch), les fichiers publics `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` et
`pricing.md`, le manifeste de la PWA, `/.well-known/assetlinks.json` et le JavaScript public de
l'application (`/app/assets/js/*.js`), lu sans être exécuté. J'ai aussi fait des recherches sur l'App
Store (API iTunes Search, FR et US), Google Play, le Chrome Web Store, Trustpilot, Product Hunt et TikTok.
Je n'ai créé aucun compte, fait aucune connexion ni rempli aucun formulaire (la page `/avis/` en contient
un : je n'y ai pas touché).

Sauf mention contraire, chaque citation vient de la page indiquée, lue le 09/10/2026. Les promesses de
Margeo sont **ses propres affirmations** : je ne les ai pas vérifiées en usage.

---

## 0. En une phrase

Margeo est une **application web (PWA)** française de **gestion d'achat-revente** : lots d'achat, stock,
ventes saisies à la main ou importées par CSV Vinted, marge nette, estimations micro-BIC/ACRE/DAC7,
factures et assistant IA textuel. Un fondateur seul la développe (Jules Bege, étudiant-entrepreneur,
micro-entrepreneur, lancement en 2024). Margeo **ne publie, ne crossliste, ne retire et ne republie
aucune annonce**, et le dit lui-même : « Margeo ne publie pas et ne synchronise pas automatiquement les
annonces » (https://margeoapp.com/llms.txt). Elle n'a **ni application native sur les stores, ni
extension de navigateur**, et **aucun avis public** à ce jour. C'est d'abord un **concurrent éditorial** :
son corpus SEO compte 566 URL dans le sitemap et occupe les requêtes « crosslisting France ».

---

## 1. Les points demandés, un par un

### 1.1 Plateformes prises en charge

Margeo **ne se connecte à aucune plateforme**. Le mot « plateforme » désigne chez elle **l'étiquette d'une
vente** que l'utilisateur enregistre, plus un barème de frais dans le simulateur.

| Plateforme | Ce que fait Margeo | Source |
|---|---|---|
| **Vinted** | Étiquette de vente intégrée, toujours placée en tête (`// Vinted toujours en premier`). C'est la seule plateforme avec un import : les **CSV de ventes Vinted Pro / porte-monnaie**. Aucune synchro en direct. | https://margeoapp.com/app/assets/js/platforms.js ; https://margeoapp.com/fonctionnalites/gestion-stock-revendeur |
| **Leboncoin** | Étiquette de vente intégrée + barème dans le simulateur. Aucun import. | https://margeoapp.com/app/assets/js/platforms.js ; https://margeoapp.com/ |
| **eBay (eBay France)** | Étiquette de vente intégrée + barème « eBay France » dans le simulateur. Aucun import. | idem |
| **Facebook Marketplace** | Étiquette de vente intégrée. | https://margeoapp.com/app/assets/js/platforms.js |
| **Main propre** | Étiquette de vente intégrée. | idem |
| **Beebs** | **Pas intégré.** On peut seulement l'ajouter comme « plateforme personnalisée » (« + Other platform… »). Beebs n'apparaît que dans un guide de niche (« Puériculture occasion Beebs »). | https://margeoapp.com/app/assets/js/platforms.js ; https://margeoapp.com/niches/revente-materiel-puericulture-beebs |
| Rakuten, Vestiaire Collective, Etsy | Barèmes de frais dans le simulateur de marge, rien de plus. | https://margeoapp.com/ (sélecteur « Plateforme ») |
| Depop | Cité dans `pricing.md` (« pour les vendeurs Vinted, eBay, Leboncoin, Rakuten, Vestiaire Collective, Depop et autres marketplaces ») et dans des articles de blog. Aucune fonction dédiée vue. | https://margeoapp.com/pricing.md |

Citation qui tranche : « Aucune plateforme n'est synchronisée en direct et Margeo ne fait pas de
cross-posting. » (https://margeoapp.com/fonctionnalites/gestion-ventes-vinted-leboncoin, « Mis à jour le
4 octobre 2026 »)

**Vinted : quels pays ?** La question ne se pose pas vraiment, puisque Margeo ne publie pas. L'import
porte sur les « exports CSV Vinted Pro/porte-monnaie » ; aucune page ne dit de quels pays Vinted ces
exports sont acceptés. Le blog couvre la France et la Belgique (plusieurs guides « Vinted Belgique »,
https://margeoapp.com/llms-full.txt) et les États-Unis en anglais.

**eBay FR** : seulement comme étiquette de vente et barème de frais (« eBay France » dans le simulateur).

### 1.2 Application mobile iOS / Android

**Aucune application native sur les stores au 09/10/2026.** Margeo est une PWA qu'on installe depuis le
navigateur : « Sur iPhone : Safari → Partager → Sur l'écran d'accueil. Sur Android : Chrome → Installer
l'application. » (https://margeoapp.com/fonctionnalites/application-hors-ligne-brocante)

- **App Store** : la recherche « margeo » (API iTunes Search, FR et US) ne renvoie aucune app de
  l'éditeur (https://itunes.apple.com/search?term=margeo&country=fr&entity=software).
- **Google Play** : `https://play.google.com/store/apps/details?id=com.margeo.app` répond **404
  « Introuvable »**, et la recherche « margeo » sur Play ne renvoie aucune app de l'éditeur.
- **Indice (déduction, non prouvée)** : `https://margeoapp.com/.well-known/assetlinks.json` déclare
  déjà le paquet Android `com.margeo.app`, avec des empreintes **fictives**
  (`"REMPLACEZ_MOI:fingerprint:de:la:cle:de:signature:play"`). Le manifeste de la PWA référence aussi
  une icône `play-icon-512.png`. Une app Android de type TWA semble donc préparée, mais elle n'est pas
  publiée.
- Les fiches Capterra que donne la recherche listent « Android (Mobile), iPhone (Mobile), iPad
  (Mobile) » parmi les plateformes. **Je n'ai pas pu le lire moi-même** (Capterra répond 403 à curl et
  à WebFetch). Il s'agit vraisemblablement de la PWA.

### 1.3 Extension navigateur

**Aucune.** La recherche « margeo » et « margeoapp » sur le Chrome Web Store renvoie **zéro résultat**.
J'ai contrôlé la méthode : la même recherche sur « fillsell » renvoie bien « FillSell — Cross-post »
(https://chromewebstore.google.com/search/margeo, lu le 09/10/2026). Le `robots.txt` interdit
`/extension/`, et `https://margeoapp.com/extension/` répond 404. Rien ne permet de dire qu'une extension
existe ou se prépare.

### 1.4 D'où l'on part (téléphone, ordinateur)

**Des deux**, avec la même PWA. Sur le téléphone : « Installable sur mobile comme une app native » et
« En brocante ou chez un grossiste, créez le pack depuis votre téléphone »
(https://margeoapp.com/fonctionnalites/gestion-stock-revendeur). Sur l'ordinateur, la page d'accueil
propose un bouton « Installer l'app sur mon ordinateur » (https://margeoapp.com/). Le **mode hors ligne**
(saisie, stock, simulation) est un argument central. L'IA et « certaines synchronisations marketplace
exigent une connexion » (https://margeoapp.com/fonctionnalites/application-hors-ligne-brocante).

### 1.5 Identification par photo / IA (titre, description, prix)

- **Pas d'identification par photo.** Les photos servent de **justificatifs** (achats, frais) : « Photos
  & justificatifs » (https://margeoapp.com/tarifs/). Le code de l'assistant
  (https://margeoapp.com/app/assets/js/pwa-ai.js) n'envoie que du texte. Je n'y ai vu aucun appel de
  vision.
- **IA textuelle** avec quatre outils, d'après les libellés de https://margeoapp.com/app/assets/js/i18n.js :
  « Estimer un prix — Prix de revente conseillé pour un article », « Analyser ma rentabilité »,
  « Résumé du mois » et « **Description de vente — Texte prêt pour Vinted / Leboncoin** ». La description
  part de champs que la personne **saisit** (nom, catégorie, état, plateforme, prix), pas d'une photo.
- Modèle : « IA illimitée (DeepSeek V4 Flash) » (https://margeoapp.com/tarifs/) ; « Modèle open-source,
  zéro rétention » (https://margeoapp.com/). Le code parle d'un proxy vers « Ollama Cloud ».
- Quotas : 3 messages IA par jour en Starter, illimités en Pro.
- **Connecteur MCP pour Claude** (Pro et Business) : « Il donne à Claude Desktop, Claude Code ou
  Claude.ai 38 outils pour lire et mettre à jour votre stock » (https://margeoapp.com/fonctionnalites/connecteur-mcp-claude).
  Le `llms.txt` annonce, lui, « 24 outils » : les deux pages du même site ne donnent pas le même chiffre.

### 1.6 Import / synchronisation du stock existant

**Pas d'import du stock existant ni de synchronisation.** Seules les **ventes** Vinted s'importent, par
CSV : « Margeo importe les lignes de vente des exports CSV Vinted Pro/porte-monnaie. […] L'export Vinted
n'inclut pas le coût d'achat du stock : il doit être saisi ou attribué séparément. Cette fonction n'est
pas une synchronisation en direct ni un import générique d'un inventaire existant. »
(https://margeoapp.com/pricing.md). Côté anglais : « Generic inventory CSVs are not imported »
(https://margeoapp.com/llms.txt). Il y a un export CSV / JSON sur tous les plans.

### 1.7 Retrait automatique des copies après une vente (auto-delist)

**Non.** Margeo recommande de le faire **à la main** : « Dès qu'un article se vend, passez-le en
"vendu" dans Margeo et délistez manuellement sur les autres plateformes. »
(https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026)

### 1.8 Republication / relist automatique

**Non.** Margeo présente même la republication automatique comme un risque : « "Vinted Bot" variants —
Republication auto — Suspension compte — À éviter » ; « Republication et messagerie auto interdites par
les CGU » (https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026). Son guide
anglais cite les CGU de Vinted, qui interdisent de « delete and re-list the same Item multiple times or
multiple Items in bulk » (https://margeoapp.com/en/blog/crosslisting-guide-resellers-2026/, sources
Vinted « accessed 22 September 2026 »). **Je n'ai pas relu moi-même les CGU de Vinted.**

### 1.9 Stock, ventes, statistiques

C'est le cœur du produit, et la partie la plus détaillée :

- **Lots (« packs ») → articles → ventes**, avec quatre statuts : « en attente, en stock, en envoi,
  vendu » (https://margeoapp.com/fonctionnalites/gestion-stock-revendeur).
- **Simulateur de marge avant achat** : prix d'achat du lot, revente estimée, port, plateforme, ACRE,
  versement libératoire. Il est utilisable **sans compte** sur la page d'accueil (https://margeoapp.com/).
- **Statistiques** : « chiffre d'affaires et nombre de ventes par plateforme, plus un bénéfice net
  global ». Le bénéfice net **n'est pas** ventilé par canal : « Elle ne ventile pas encore le bénéfice
  net en un total par canal » (https://margeoapp.com/fonctionnalites/assistant-ia-revendeur).
- **Fiscalité** : estimations micro-BIC, ACRE, versement libératoire, CFP, seuils DAC7 et franchise de
  TVA. Margeo ne transmet aucune déclaration : « Margeo ne la transmet pas à votre place »
  (https://margeoapp.com/).
- **Autres** : générateur de factures, rapports PDF (Business), multi-boutique (5 boutiques) et
  multi-utilisateurs (3 personnes) en Business, export CSV/JSON.

### 1.10 Prix (paliers, devise, essai gratuit)

Source : https://margeoapp.com/tarifs/ et https://margeoapp.com/pricing.md.

| Palier | Prix EUR | Prix USD (site EN) | Limites / contenu |
|---|---|---|---|
| **Starter** | 0 €, « gratuit à vie, sans carte bancaire » | $0 | 10 articles en stock, 3 packs, 5 simulations par mois, 3 messages IA par jour, mode hors ligne, export CSV/JSON, sans MCP |
| **Pro** | **7,99 €/mois** ou **69 €/an** (5,75 €/mois, −28 %) | $9.99/mois ou $69/an | Tout illimité, photos et justificatifs, fiscalité complète, factures, connecteur MCP |
| **Business** | **19,99 €/mois** | $24.99/mois | Pro + 5 boutiques, 3 utilisateurs, rapports PDF, support prioritaire, factures sans filigrane |

- **Essai** : « Essai gratuit de 15 jours sur Pro mensuel uniquement — carte bancaire requise, aucun
  débit pendant l'essai, un essai par compte. » Pas d'essai sur Business ni sur Pro annuel.
- **Remboursement** : « les abonnements mensuels sont satisfaits ou remboursés pendant 30 jours »
  (https://margeoapp.com/tarifs/).
- **TVA** : « Prix en euros TTC. TVA non applicable — article 293 B du CGI. » Paiement par Stripe
  (https://margeoapp.com/legal.html).
- **Historique** : un article de Friptadium du 5 août 2026 donnait un Starter à « 30 articles »
  (https://friptadium.com/blogs/actualites/margeo-avis-prix-calcul-marge-vinted). La limite est
  aujourd'hui de **10**.

### 1.11 Pays et langues

- Langues : « Français, Anglais » (https://margeoapp.com/llms-full.txt). L'application contient les
  dictionnaires `fr` et `en` (https://margeoapp.com/app/assets/js/i18n.js). Le sitemap compte 31 URL sous
  `/en/`.
- Marché : la France d'abord (fiscalité micro-BIC). Le blog couvre aussi la Belgique, en français, et
  les États-Unis et le Royaume-Uni, en anglais. Les tarifs existent en EUR et en USD.
- Hébergement : « Firebase Firestore (data centers en Europe), Cloudflare Pages pour le site et
  Cloudinary pour les photos » (https://margeoapp.com/a-propos/).

### 1.12 Notes publiques

| Où | Constat le 09/10/2026 | Source |
|---|---|---|
| **App Store / Google Play** | Aucune application, donc aucune note | voir 1.2 |
| **Chrome Web Store** | Aucune extension | voir 1.3 |
| **Trustpilot** | Profil revendiqué (avril 2026), **0 avis**, « Cette entreprise n'a pas encore reçu d'avis. » | https://fr.trustpilot.com/review/margeoapp.com (lu par WebFetch ; curl est bloqué par l'anti-robot) |
| **Product Hunt** | « 0 reviews », « 2 followers », publication datée d'il y a « 7mo » | https://www.producthunt.com/p/margeo |
| **Capterra** | Fiche existante (https://www.capterra.com/p/10038727/Margeo/), **illisible** pour moi (403) : note et nombre d'avis non vérifiés | — |
| **Page Avis du site** | « Pas d'avis inventés. […] Aucune note globale ne sera affichée tant qu'elle ne repose pas sur un volume suffisant » | https://margeoapp.com/avis/ |
| **TikTok @margeo.app** | Page publique lue par curl : `followerCount` 58, `videoCount` 0 | https://www.tiktok.com/@margeo.app |

---

## 2. Concurrent éditorial : le comparatif « crosslisting France 2026 »

Page : https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026. Elle est signée
« Par Jules Bege · Mis à jour le 2026-10-05 ».

Ce que la page affirme, mot pour mot :
- « Réponse directe : Aucun outil majeur ne crossliste Vinted et Leboncoin de façon officielle et
  conforme aux CGU ». En encadré : « Aucun outil ne crossliste Vinted + Leboncoin de façon officielle et
  conforme aux CGU. »
- « Vinted n'a pas d'API publique — aucun outil tiers ne peut publier automatiquement » ; « Leboncoin
  n'autorise pas le crosslisting automatisé ».
- « Tout outil qui prétend publier automatiquement sur Vinted viole les CGU et expose à une suspension
  de compte. »
- « Puisque le crosslisting automatique n'existe pas pour le marché français, voici le workflow le plus
  efficace » : copier-coller à la main, 8 minutes par article.
- Le tableau compare Vendoo, List Perfectly, Nifty, Flyp, Crosslist Magic, SellerAider, des
  « Extensions Chrome "Vinted tools" », la publication manuelle et Margeo. **Aucun crosslister français
  n'y figure.**

Les faits à mettre en regard :
1. **Margeo se contredit sur son propre site.** Un autre article du même auteur, mis à jour **le même
   jour** (2026-10-05), écrit : « Publication Vinted/Leboncoin → DokoSync, FlowDino ou Resell-io », et
   présente Flypr et StoFlow comme des outils qui « annoncent un crosslisting sur plusieurs
   plateformes ; StoFlow indique aussi que le stock est délisté après une vente »
   (https://margeoapp.com/blog/meilleur-app-revendeur-vinted-leboncoin, outils « consultées le
   4 octobre 2026 »). Ces outils sont donc connus de Margeo. Le comparatif « crosslisting » se protège par
   le qualificatif « de façon officielle et conforme aux CGU ».
2. **FillSell n'est cité nulle part** dans les pages lues : les deux comparatifs, le comparatif CRM
   Vinted, celui des assistants IA, le guide anglais du crosslisting, `llms.txt`, `llms-full.txt` et
   `pricing.md`. Une recherche `site:margeoapp.com FillSell` ne renvoie rien.
3. La phrase « aucun outil tiers ne peut publier automatiquement » sur Vinted est **fausse dans les
   faits** : FillSell, comme d'autres outils listés dans `00-decouverte.md`, publie sur Vinted par une
   extension qui agit dans la session de la personne. La question de la **conformité aux CGU** est
   distincte. Margeo la pose, et je ne la tranche pas ici. Le guide anglais de Margeo cite la clause des
   CGU de Vinted sur « delete and re-list […] multiple times or multiple Items in bulk » (voir 1.8) :
   c'est un point d'attention pour le discours de FillSell sur la republication.

---

## 3. Ce que Margeo fait bien (honnêtement)

- **Positionnement clair et honnête sur ses limites.** La page d'accueil a une section « Margeo n'est
  pas fait pour tout le monde » : « il ne publie pas vos annonces sur Vinted ou Leboncoin ». Les pages
  produit répètent « Aucune plateforme n'est synchronisée en direct ». La page Avis refuse d'afficher
  des notes non vérifiées.
- **Profondeur métier sur l'argent** : lots d'achat découpés en articles, simulateur avant achat
  utilisable sans compte, marge nette après commissions, port et cotisations, fiscalité française
  (micro-BIC, ACRE 2026, versement libératoire, CFP, DAC7, franchise de TVA) avec les sources officielles
  citées, factures. **Dans `src/` de FillSell, aucune occurrence de « DAC7 », « URSSAF » ni
  « micro-BIC »** (recherche du 09/10/2026 dans le dossier `fill-and-sell-seo`).
- **Mode hors ligne** pour la brocante. Il est mis en avant comme différenciant, et le code le confirme.
- **Gratuit utile sans carte**, prix bas (Pro 7,99 €), annuel à 69 €, remboursement sous 30 jours.
- **Machine SEO/GEO très travaillée**, la vraie force concurrentielle :
  - 566 URL dans le sitemap, dont 389 articles de blog ; dernière modification le 2026-10-05 ;
  - un bloc « Réponse directe » en tête de chaque page, des dates « Mis à jour le » et des sources
    officielles datées ;
  - `llms.txt` (18,8 Ko), `llms-full.txt` (192 Ko) et `pricing.md` conçus pour être lus par les LLM ;
  - un `robots.txt` qui invite explicitement les robots d'IA (« Margeo veut être cité par les LLMs ») ;
  - des calculateurs de frais gratuits (Vinted, Leboncoin, eBay France, Rakuten), un « Observatoire »
    des frais, des comparatifs « Margeo vs Vendoo / List Perfectly / Excel / Notion / Shopify ».
- **Connecteur MCP** (Claude) en Pro : une fonction rare dans la catégorie.

---

## 4. Ce qu'on ne peut pas vérifier sans compte

- Le fonctionnement réel de l'import CSV Vinted : formats acceptés, pays Vinted pris en charge, doublons.
- La qualité des estimations fiscales et du « bénéfice net global » sur de vraies données.
- La synchronisation hors ligne → en ligne : conflits, perte de données.
- La qualité des textes produits par « Description de vente » et des prix suggérés par l'IA.
- Le nombre réel d'utilisateurs ou d'abonnés : aucun chiffre public. L'objectif affiché est « 500
  utilisateurs en An 1, autofinancement dès 40 abonnés Pro » (https://margeoapp.com/a-propos/).
- Le contenu exact de la fiche Capterra (note, avis), bloquée en lecture automatique.
- La préparation d'une app Android : seul l'indice de `assetlinks.json` existe ; aucune date ni annonce.
- L'immatriculation : les mentions légales indiquent « micro-entrepreneur (SIRET en cours
  d'immatriculation) » (https://margeoapp.com/legal.html). Je n'ai pas consulté de registre.

---

## 5. Sources (toutes lues le 2026-10-09)

| URL | Ce qu'on y lit |
|---|---|
| https://margeoapp.com/ | Accueil, simulateur, plans, « ne publie pas », FAQ, bouton « Installer l'app sur mon ordinateur » |
| https://margeoapp.com/tarifs/ | Plans EUR, remboursement 30 jours, « DeepSeek V4 Flash » |
| https://margeoapp.com/pricing.md | Plans, essai 15 jours, import CSV Vinted (ventes seulement), USD |
| https://margeoapp.com/en/pricing/ | Plans USD ($9.99 / $24.99) |
| https://margeoapp.com/llms.txt | Résumé officiel : « ne publie pas et ne synchronise pas automatiquement les annonces » |
| https://margeoapp.com/llms-full.txt | Langues FR/EN, type PWA, hébergement |
| https://margeoapp.com/robots.txt | Invitation des robots d'IA, `/extension/` interdit |
| https://margeoapp.com/sitemap.xml | 566 URL, 389 articles de blog, 31 URL en anglais, dernière modification le 2026-10-05 |
| https://margeoapp.com/manifest.json | PWA, `start_url` `/app/`, icône `play-icon-512.png` |
| https://margeoapp.com/.well-known/assetlinks.json | Paquet `com.margeo.app`, empreintes fictives « REMPLACEZ_MOI » |
| https://margeoapp.com/fonctionnalites/gestion-stock-revendeur | Packs, quatre statuts, import CSV Vinted, PWA sur le téléphone |
| https://margeoapp.com/fonctionnalites/gestion-ventes-vinted-leboncoin | « Aucune plateforme n'est synchronisée en direct et Margeo ne fait pas de cross-posting » |
| https://margeoapp.com/fonctionnalites/assistant-ia-revendeur | IA sur les données, pas de bénéfice net par canal |
| https://margeoapp.com/fonctionnalites/application-hors-ligne-brocante | Installation de la PWA sur iPhone et Android, mode hors ligne |
| https://margeoapp.com/fonctionnalites/connecteur-mcp-claude | MCP, « 38 outils », Pro et Business |
| https://margeoapp.com/a-propos/ | Fondateur seul, 2024, hébergement, objectifs |
| https://margeoapp.com/avis/ | Aucune note affichée |
| https://margeoapp.com/legal.html | Éditeur micro-entrepreneur, TVA 293 B, Stripe |
| https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026 | « Aucun outil ne crossliste Vinted + Leboncoin… » (mis à jour le 2026-10-05) |
| https://margeoapp.com/blog/meilleur-app-revendeur-vinted-leboncoin | Cite DokoSync, FlowDino, Resell-io, Flypr et StoFlow comme outils de publication (mis à jour le 2026-10-05) |
| https://margeoapp.com/en/blog/crosslisting-guide-resellers-2026/ | Citation des CGU de Vinted sur la republication en boucle |
| https://margeoapp.com/niches/revente-materiel-puericulture-beebs | Beebs, seulement comme canal dans un guide |
| https://margeoapp.com/app/assets/js/platforms.js | Plateformes intégrées : Vinted, Leboncoin, eBay, Facebook Marketplace, Main propre, plus les plateformes personnalisées |
| https://margeoapp.com/app/assets/js/pwa-ai.js et https://margeoapp.com/app/assets/js/i18n.js | Quatre outils IA textuels, aucune vision ; dictionnaires FR et EN |
| https://itunes.apple.com/search?term=margeo&country=fr&entity=software | Aucune app Margeo (FR, et même recherche en US) |
| https://play.google.com/store/apps/details?id=com.margeo.app | 404 « Introuvable » |
| https://chromewebstore.google.com/search/margeo | Zéro résultat (contrôle : « fillsell » renvoie FillSell) |
| https://fr.trustpilot.com/review/margeoapp.com | 0 avis (lu par WebFetch) |
| https://www.producthunt.com/p/margeo | 0 avis, 2 abonnés |
| https://www.tiktok.com/@margeo.app | 58 abonnés, 0 vidéo (données de la page publique) |
| https://friptadium.com/blogs/actualites/margeo-avis-prix-calcul-marge-vinted | Article tiers du 5 août 2026 (Starter alors à 30 articles) |
