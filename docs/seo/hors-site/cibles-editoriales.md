# Cibles éditoriales hors site : où FillSell devrait figurer (09/10/2026)

> Chantier SEO/GEO FillSell, volet « hors site ». Rédigé le **2026-10-09 (soir)**.
> **Préparation seulement.** Rien n'a été envoyé, rempli, commenté, publié ni inscrit, et aucun
> compte n'a été connecté. Les pages ont été lues avec WebFetch, WebSearch et curl. Les sources
> Discourse (vint-aide, SurviveFrance) ont été lues en JSON public, Reddit par l'archive publique
> pullpush.io (reddit.com renvoie 403 à nos outils) et YouTube par les pages publiques.
> **Toutes les observations datent du 2026-10-09**, sauf mention contraire. Chaque fait porte son URL.
> Entrées lues : `PLAN.md`, `etat-des-lieux/05-reponses-ia.md`, `06-mots-cles-fr.md`,
> `06-mots-cles-en.md`, `03c-decisions-nico-0910.md` et `briefs/concurrents-matrice.md`.
> Formulations FillSell : `etat-des-lieux/03-fiche-de-verite.md` (lignes F-xx, § 0 bis, § 15, § 16).
> Le site n'est pas encore en ligne. Les liens proposés sont les **futures URL** de `PLAN.md` § 3.

---

## 0. L'essentiel

1. **Sur la soixantaine de pages, fils et vidéos relus, aucun ne nomme FillSell** (textes des pages,
   messages des fils, descriptions des vidéos). Cela inclut les pages que citent ChatGPT et les
   Aperçus IA de Google (rapport 05). Trois synthèses WebSearch faites
   pendant cette mission ne le citent pas non plus. L'une conclut : « Je n'ai pas trouvé d'outil de
   synchronisation confirmé pour Vinted, Leboncoin ou Beebs. »
2. **Quatre erreurs factuelles publiques sont corrigibles par un fait daté** :
   - **Margeo** : « Aucun outil ne crossliste Vinted + Leboncoin de façon officielle et conforme
     aux CGU. »
   - **vint-aide** : à la question « un crosslister pour la France ? », la seule réponse est « Il
     n'y en a pas à ce jour pour la Fr. »
   - **Seconde Main Mag** : l'article recommande Vendoo et Crosslist à des vendeurs français.
     Pourtant, l'aide UE de Vendoo ne liste pas Vinted, et Crosslist ne sert pas les résidents de
     l'UE.
   - **Relistly** : « no competitor covers Leboncoin either ».

   La phrase de **FLUF** (« the only crosslisting tool that supports both Vinted and Leboncoin
   for individual sellers ») est contredite de la même façon.
3. **Les cibles indépendantes les plus utiles** sont Seconde Main Mag (3 articles), Friptadium
   (5 pages, dont « vendre sur plusieurs plateformes sans se survendre », qui parle d'un outil de
   synchronisation **sans le nommer**) et SellingCurrently (EN, Europe). Les deux fils vint-aide
   sur le crosslisting en France et sur l'import Vinted → Beebs sont aussi prioritaires.
4. **La plupart des comparatifs sont écrits par des concurrents** : StoFlow, FlowDino, Relistly,
   DressKare, Vinteer, Fripio, VintedCRM, You-Sync, Revendor, Vinkit, List My Closet et Margeo.
   La probabilité d'y entrer est faible. Ils sont marqués ainsi et traités par un seul message
   factuel. StoFlow et Relistly restent les plus lus par ChatGPT (6 questions sur 10, rapport 05).
5. **Forums : la charte de vint-aide interdit « toute publicité pour un produit ».** On écrit
   d'abord aux modérateurs. Sur Reddit, les fils trouvés ont 5 à 10 mois : ils seront
   probablement archivés avant la mise en ligne du site. Mieux vaut répondre aux nouveaux fils,
   avec un modèle prêt (§ 6.6).
6. **Écartés** :
   - **josephtorregrossa.com**, parce que la boutique du site vend des comptes eBay. Une
     association d'image est à trancher par Nico.
   - les comparatifs américains (le public n'est pas servi) ;
   - le dépôt GitHub vinted2beebs (on ne fait pas de promotion dans les tickets) ;
   - les vidéos TikTok de 2023.
7. **Rien ne part avant trois conditions** (§ 1) : la page liée est en ligne, la liste des
   plateformes a été tranchée (Depop, D1) et Nico a donné son accord message par message.

---

## 1. Règles d'envoi (à lire avant tout message)

### 1.1 Quand

- **Après la mise en ligne** de chaque page liée. Un lien en 404 annule le message.
- **Une seule relance**, 15 jours plus tard, et seulement si elle apporte un fait nouveau.
- **Un seul message par site**, même si plusieurs pages sont concernées. On les liste toutes dans
  ce message.

### 1.2 Ce que les messages disent, et ne disent jamais

Ces règles viennent de `03c` et de la fiche § 15-16.

- **Plateformes** : on écrit « Vinted (France), Leboncoin, eBay (France), Beebs et Depop ».
  - Depop n'y figure que si D1 est rempli le jour de l'envoi : Depop ouverte à tous, extension
    avec Depop servie par le Chrome Web Store, OTA 2.9.68 ou plus.
  - Sinon, on retire Depop de chaque message. Les passages concernés sont marqués **[D1]**.
- **Opla** n'apparaît nulle part. **Aucun chiffre** de quota, de plafond ni de taille de lot.
- **Republication automatique** :
  - on ne la cite qu'avec `{REPUB_AUTO}` ;
  - version A : « Vinted, Leboncoin, Beebs et Depop » ; version B : « Vinted, Leboncoin et
    Beebs » ;
  - jamais avec un palier écrit à côté, et jamais avec eBay.
  - **Les messages ci-dessous évitent le sujet**, sauf Friptadium (§ 6.3).
- **Vente et retrait** : on reprend la formulation sûre, F43 et F44.
  - Quand Vinted ou eBay marque l'article vendu, FillSell enregistre la vente tout seul.
  - Sur Leboncoin et Beebs, un appui suffit pour la confirmer.
  - Dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article. Au moindre
    doute, il demande « Déjà vendu ? ».
  - **Depop ne figure pas** dans « marque l'article vendu » tant qu'aucune vente Depop n'a été
    vue en réel (P3).
- **Ordinateur** : il doit être allumé avec Chrome ouvert pour Vinted, Leboncoin, Beebs **[et
  Depop — D1]**. eBay relié publie par l'interface officielle d'eBay, même ordinateur éteint (F09,
  F31). On le dit franchement, car cela rend service à l'auteur.
- **Interdits** :
  - « officiel », « conforme aux CGU », « approuvé », « partenaire » ;
  - « sans risque », « temps réel », « illimité » (sauf pour le stock et l'import) ;
  - « le seul » sans la date et le périmètre (« parmi les 14 outils relus le 9 octobre 2026 ») ;
  - tout adjectif sur un concurrent.
  - On écrit ce que FillSell fait, pas ce que l'autre rate.
  - Un fait sur un concurrent n'est cité qu'avec sa source et sa date.
- **Transparence** : chaque message s'ouvre par « FillSell est notre produit » (ou « I work on
  FillSell »).
- **Signature** : « L'équipe FillSell — fillsell.app », sans nom. Un nom de l'équipe demande
  l'accord de Nico. L'adresse d'expédition est **[à choisir par Nico]**.
- **Prix** : seulement « Gratuit pour commencer (0 €, sans carte) ; Premium 12,99 €, Pro
  29,99 €, Business 59,99 € par mois, sans engagement » (F58).

### 1.3 Contreparties

- **Par défaut : aucune.** Les messages le disent quand c'est utile.
- **Contreparties possibles**, chacune sur décision de Nico, écrite en clair dans le message :
  - (a) un accès de test offert pour vérifier les faits, sans condition de mention ;
  - (b) une affiliation : FillSell n'en a pas aujourd'hui à notre connaissance, ce serait un
    chantier séparé ;
  - (c) un emplacement payant affiché comme tel, par exemple la catégorie « Small Business
    Listings » de SurviveFrance (§ 4.3).
- **Jamais** :
  - un lien payé sans `rel="sponsored"` ou `rel="nofollow"` ;
  - un échange de liens (« Link to me and I'll link to you ») ;
  - un faux avis ou un avis rédigé à la place d'un client.
  - Source : politiques anti-spam de Google, section « Link spam »,
    https://developers.google.com/search/docs/essentials/spam-policies (mise à jour du
    2026-08-28 UTC, lue le 09/10/2026).
- **Créateurs vidéo** : tout contenu promotionnel « à titre onéreux » doit porter la mention
  « publicité » ou « collaboration commerciale » (loi n° 2023-451 du 9 juin 2023, art. 5).
  - Source secondaire : note de la Direction des affaires juridiques de Bercy,
    https://www.economie.gouv.fr/node/3222759, lue le 09/10/2026.
  - **Le texte officiel est à relire sur Légifrance** avant toute collaboration.
  - Un avantage offert (un accès gratuit, par exemple) se signale aussi par prudence.

### 1.4 Forums et réseaux

- **vint-aide** : la charte (https://www.vint-aide.com/guidelines, lue le 09/10/2026) dit :
  « Toute publicité pour un produit ou un autre communauté est strictement interdite ».
  - On écrit d'abord aux modérateurs (§ 6.5).
  - Sans leur accord : **rien**.
- **Reddit** :
  - il faut un compte, donc c'est un geste de Nico ;
  - la règle générale archive un fil au bout de 6 mois, sauf si les modérateurs ont désactivé
    l'archivage ; on vérifie avant ;
  - les règles des subreddits n'ont pas été lues (403) ;
  - une seule réponse par fil, utile même sans FillSell ;
  - la mention « je travaille sur FillSell » est obligatoire ;
  - pas de copier-coller d'un fil à l'autre.
- **Groupes Facebook** (« Vinted Professionnel », groupes Beebs) : ils sont fermés et n'ont pas
  été lus. On n'y intervient que si Nico en est membre, et selon la charte du groupe.

### 1.5 Bloc factuel commun (à coller sous chaque message si l'auteur veut vérifier)

**FR**
> FillSell (fillsell.app) est une app iPhone, Android et web, accompagnée d'une extension Chrome.
> - **Publication** : on remplit une annonce une fois, puis FillSell la publie sur les plateformes
>   cochées : Vinted (France), Leboncoin, eBay (France), Beebs **[et Depop — D1]**. Chaque site
>   reçoit une version adaptée (catégorie, taille, colis).
> - **Synchronisation** : un appui sur « Synchroniser » importe les annonces déjà en ligne.
>   L'import est gratuit et sans limite.
> - **Ventes** : quand Vinted ou eBay marque l'article vendu, la vente s'enregistre seule. Sur
>   Leboncoin et Beebs, un appui suffit pour la confirmer.
> - **Retrait** : dès qu'une vente est enregistrée, FillSell retire les autres annonces de
>   l'article. Au moindre doute, il demande « Déjà vendu ? ».
> - **Comptes** : FillSell ne demande jamais les mots de passe Vinted, Leboncoin, Beebs ou Depop.
>   L'extension travaille dans la session déjà ouverte, une annonce après l'autre, à un rythme
>   humain. Pour eBay, le compte se relie par la page officielle d'eBay.
> - **Ordinateur** : il doit être allumé avec Chrome ouvert pour Vinted, Leboncoin, Beebs **[et
>   Depop]**. eBay relié publie même ordinateur éteint.
> - **Prix** : gratuit pour commencer, sans carte. Premium 12,99 €, Pro 29,99 €, Business
>   59,99 € par mois, sans engagement.
> - FillSell n'est affilié à aucune de ces plateformes.

**EN**
> FillSell (fillsell.app/en) is an iPhone, Android and web app with a Chrome extension.
> - **Publishing**: you fill in a listing once, then FillSell publishes it on the marketplaces you
>   tick: Vinted (France), Leboncoin, eBay (France), Beebs **[and Depop — D1]**. Each site gets a
>   version adapted to its own fields.
> - **Sync**: one tap on "Sync" imports your listings that are already live. Importing is free and
>   unlimited.
> - **Sales**: when Vinted or eBay marks the item as sold, the sale is recorded on its own. On
>   Leboncoin and Beebs, one tap confirms it.
> - **Delisting**: as soon as a sale is recorded, FillSell removes the item's other listings. If
>   in doubt, it asks "Already sold?".
> - **Accounts**: FillSell never asks for your marketplace passwords. The extension works in your
>   own signed-in session, one listing at a time. eBay is linked through eBay's official page.
> - **Computer**: it must be on with Chrome open for Vinted, Leboncoin, Beebs **[and Depop]**.
>   Linked eBay publishes even with the computer off.
> - **Pricing**: free to start, no card. Premium €12.99, Pro €29.99, Business €59.99 a month, no
>   commitment.
> - The app is available in English; the Chrome extension is in French.
> - FillSell is not affiliated with any of these marketplaces.

---

## 2. Tableau de synthèse

Légende :
- **Concurrent** : **D** = concurrent direct (publie sur des places de marché) ; **I** = indirect
  (outil Vinted, CRM, marge) ; **—** = indépendant.
- **Probabilité** d'obtenir une mention ou une correction : H = haute, M = moyenne, F = faible.
- **Priorité** : P1 = d'abord, P2 = ensuite, P3 = si le temps le permet.

| # | Cible | Type | Langue | Concurrent | Ce qui manque | Prob. | Prio. | Contact public |
|---|---|---|---|---|---|---|---|---|
| 1 | Seconde Main Mag : « Cross-listing Vinted, Leboncoin, eBay » (28/05/2026) | média de niche | FR | — | recommande Vendoo et Crosslist, qui ne servent pas la France pour Vinted ; FillSell absent | M | **P1** | contact@secondmainmag.com |
| 2 | Seconde Main Mag : « Outils CRM Vinted 2026 » (08/06/2026) | média de niche | FR | — | Crosslist et List Perfectly cités comme crosslisters ; FillSell absent | M | **P1** (même message que 1) | idem |
| 3 | Margeo : « Comparatif applications crosslisting France 2026 » (mis à jour le 05/10/2026) | comparatif | FR | I (marge) | « Aucun outil ne crossliste Vinted + Leboncoin… » ; FillSell absent | F à M | **P1** | ceo@margeoapp.com |
| 4 | Friptadium : « Vendre sur plusieurs plateformes… sans se survendre » (10/08/2026) | blog d'un grossiste | FR | — | parle d'un outil de synchronisation **sans le nommer** | M | **P1** | contact@friptadium.com |
| 5 | Friptadium : « Top 10 outils d'automatisation Vinted 2026 » (04/06/2026) | classement | FR | — | aucun crosslister français ; Vendoo classé 10e | M | **P1** (même message que 4) | idem |
| 6 | Friptadium : « Où vendre ses vêtements de seconde main » (mis à jour le 28/09/2026), « Vendre sur Depop depuis la France » (12/08/2026), « Beebs : avis » (05/08/2026) | guides | FR | — | conseillent plusieurs canaux sans dire comment ; FillSell absent | M | **P1** (même message que 4) | idem |
| 7 | vint-aide : « Recherche crosslister FR » (10/02/2026) | forum | FR | — | « Il n'y en a pas à ce jour pour la Fr. » | M (via les modérateurs) | **P1** | modérateurs (MP) ; charte : pas de publicité |
| 8 | vint-aide : « Beebs : importation annonces depuis Vinted » (dernier message le 27/07/2026) | forum | FR | — | « la fonction n'est plus disponible depuis environ un an » ; des vendeurs abandonnent Beebs | M (via les modérateurs) | **P1** (même demande que 7) | idem |
| 9 | vint-aide : « Importer son dressing sur LBC » (47 messages, dernier le 21/08/2026) et « Concernant Beebs » (36 messages) | forum | FR | — | outils maison, aucun outil Vinted + Leboncoin + Beebs | F | P2 (même demande que 7) | idem |
| 10 | StoFlow : « Meilleurs outils de vente multi-plateformes 2026 » (mis à jour le 06/10/2026) | comparatif | FR | **D** | 13 outils, FillSell absent ; cité par ChatGPT dans 6 questions sur 10 | F | P2 | support@stoflow.com |
| 11 | Relistly : matrice « Which Crosslisting Tools Support Vinted? » (vérifiée le 02/09/2026) et page Leboncoin | comparatif | EN | **D** | « no competitor covers Leboncoin either » ; FillSell absent | F | P2 | support@relistly.io |
| 12 | SellingCurrently : « Vinted Alternatives in Europe 2026 » (mis à jour le 21/08/2026) | guide indépendant (affiliation déclarée) | EN | — | Leboncoin absent de la liste ; seul FLUF est cité pour le crosslisting | F à M | P2 | partnerships@sellingcurrently.com |
| 13 | YouTube Felix Beauregard : « J'ai testé 50 outils Vinted… » (02/08/2026), source d'un Aperçu IA | vidéo | FR | — | aucun outil multi-plateforme | F | P2 | onglet À propos ; Instagram indiqué en description |
| 14 | Resell Vinted (Vinke) : « Vinted vs eBay vs Leboncoin » (02/05/2026) et « Meilleurs outils Vinted » (mis à jour le 01/08/2026) | blog (affiliation déclarée) | FR | — | évoque un outil de crosslisting sans le nommer | F à M | P2 | X ou Facebook « resellvinted » ; e-mail des mentions légales encore entre crochets |
| 15 | YouTube Keyran Dawsell : « Les meilleurs outils externes pour l'achat-revente Vinted » (28/06/2026) | vidéo (codes promo) | FR | — | 4 outils Vinted, aucun crosslister | F | P3 | Instagram et Discord en description |
| 16 | YouTube Paul Vernat : « Publier 150 annonces par heure sur Vinted » (16/01/2026) | vidéo | FR | — | Vinted seul | F | P3 | Linktree en description |
| 17 | SurviveFrance : « Anyone used LeBonCoin recently to sell an item? » (5 527 vues, dernier message le 29/07/2026) | forum d'expatriés | EN | — | aucun outil | F | P3 | admin d'abord ; catégorie payante « Small Business Listings » |
| 18 | The Local France : « Leboncoin: Everything you need to know » (12/10/2023) | média d'expatriés | EN | — | article ancien, sans Vinted ni outil | F | P3 | news@thelocal.fr |
| 19 | FLUF : « Crosslist from Vinted to Leboncoin » (29/05/2026) | page d'outil | EN | **D** | « the only crosslisting tool that supports both Vinted and Leboncoin for individual sellers » | F | P3 | https://fluf.io/contact |
| 20 | Comparatifs d'outils Vinted écrits par leurs éditeurs (§ 5) | comparatifs | FR/EN | **I** ou **D** | FillSell absent partout | F | P3 | voir § 5 |
| 21 | Reddit r/vinted_france, r/vinted (§ 4.5) | fils | FR/EN | — | fils anciens, souvent proches de l'archivage | F | P3 (nouveaux fils plutôt) | compte de Nico |
| 22 | L'Essentiel de l'Éco : « Achat-revente sur Vinted : les conseils des revendeurs qui en vivent » (15/06/2025) | presse | FR | — | outils de sourcing seulement | F | P3 | redaction@lessentieldeleco.fr |

---

## 3. Fiches : médias, guides et blogs indépendants (FR)

### 3.1 Seconde Main Mag (cibles 1 et 2) — P1

**Éditeur**
- « Stefan, éditeur personne physique non-professionnelle », directeur de la publication.
- Le média existe depuis avril 2026. Ses articles sont « rédigés avec l'assistance de modèles
  d'intelligence artificielle, relus par la rédaction ».
- Source : https://secondmainmag.com/mentions-legales/ (dernière mise à jour 26/04/2026).

**Contact**
- **contact@secondmainmag.com** (mentions légales).
- La page méthodologie invite les corrections : « Si vous identifiez une erreur factuelle dans
  l'un de nos articles, contactez-nous » (https://secondmainmag.com/methodologie/).

**Pourquoi c'est une cible.** ChatGPT lit secondmainmag sur Q1, Q2, Q3, Q6 et Q7 (rapport 05
§ 3.1 et § 5.1). C'est le seul « média » du sujet qui se dit indépendant.

| Page | Titre, date, auteur | Ce qu'elle dit aujourd'hui |
|---|---|---|
| https://secondmainmag.com/cross-listing-vinted-leboncoin-ebay-2026/ | « Cross-listing Vinted, Leboncoin, eBay : publier partout sans risque en 2026 », 28/05/2026, Stefan ; aucune date de mise à jour | Outils nommés : **Vendoo** et **Crosslist** (« services payants, environ 10-20 €/mois »), Google Sheets, Notion. Phrases citées : « Vinted interdit explicitement les annonces en double » ; « Vinted n'interdit pas de publier le même article sur une autre plateforme » ; Leboncoin « n'interdit pas explicitement le cross-listing dans ses CGU ». **Ni FillSell, ni Beebs, ni Depop.** |
| https://secondmainmag.com/outils-crm-vinted-2026-automatiser-ventes/ | « Outils CRM Vinted 2026 : automatiser et piloter son dressing vendeur », 08/06/2026 | Vintedge, VintedCRM, **Crosslist** (« environ 20-30 €/mois »), **List Perfectly**. **FillSell absent.** |
| https://secondmainmag.com/algo-vinted-2026-republication-doublons-visibilite/ | « Algo Vinted 2026 : pourquoi vos annonces tombent en bas et comment relancer », 10/05/2026 | Républication : supprimer l'original avant de republier ; « outils tiers » non nommés. **FillSell absent.** |

**Erreur utile à signaler**, faits relus le 09/10/2026 (matrice § 2.1 et § 2.2, rapport 06-EN § 3) :
- **Crosslist** : « we do not support users residing in the European Union »
  (https://crosslist.com/pricing). Son billet « Why We're Discontinuing Vinted for New Users »,
  daté du 02/10/2026, annonce la fin de Vinted pour les nouveaux comptes
  (https://crosslist.com/blog/vinted-cross-listing).
- **Vendoo** : son centre d'aide UE (mis à jour le 30/03/2026) liste eBay, Etsy, Depop, Whatnot
  et Facebook Marketplace, **sans Vinted**
  (https://help.vendoo.co/eu/en/articles/8856209-which-marketplaces-does-vendoo-support).
- **List Perfectly** : « supports U.S. marketplaces only » (https://listperfectly.com/faq/).

**Probabilité : M.** Le média invite les corrections factuelles et produit beaucoup. Mais il
n'avait encore mis aucun article à jour au 09/10, et il signale ses liens d'affiliation.

**Message** : § 6.1.

### 3.2 Friptadium (cibles 4, 5 et 6) — P1

**Éditeur**
- Friptadium, grossiste de vêtements de seconde main au kilo.
- Thibault, cofondateur, signe les articles.
- Le site déclare un lien d'affiliation (ControlResell) et un partenariat avec DressKare dans son
  classement, « sans effet sur le classement ».

**Contact**
- **contact@friptadium.com** (https://friptadium.com/pages/contact).
- Il y a aussi WhatsApp et un forum avec une catégorie « Outils & logiciels ».

**Pourquoi c'est une cible.**
- Ce n'est pas un éditeur d'outil.
- Ses articles décrivent exactement le besoin de FillSell, sans nommer d'outil.
- Il occupe les requêtes « plusieurs plateformes », « Beebs », « Depop » et « outils Vinted ».

| Page | Date | Ce qu'elle dit aujourd'hui |
|---|---|---|
| https://friptadium.com/blogs/actualites/vendre-plusieurs-plateformes-sans-se-survendre | 10/08/2026, Thibault | Règle : « une pièce vendue quelque part se retire partout, tout de suite ». Au gros volume, un outil de synchronisation « automatise ce retrait », **sans nom**. Leboncoin et Beebs ne sont pas cités. **FillSell absent.** |
| https://friptadium.com/blogs/actualites/meilleurs-outils-automatisation-vinted-2026 | 04/06/2026 (événements cités jusqu'au 27/09/2026) | Top 10 : ControlResell, DressKare, Le Troc Futé, Bleam, Clemz, Dotb, VintedCRM, Vinteer, Vintex, **Vendoo** (« cross-listing sur 11 places de marché »). Crosslist est cité comme « non disponible dans l'UE ». **FillSell absent.** |
| https://friptadium.com/blogs/actualites/ou-vendre-vetements-seconde-main-plateformes | 10/08/2026, mis à jour le 28/09/2026 | « rien n'empêche d'en combiner plusieurs, à condition de bien gérer son stock pour ne pas vendre deux fois la même pièce ». Beebs et Depop sont couverts. Aucun outil. |
| https://friptadium.com/blogs/actualites/vendre-sur-depop-guide-avis | 12/08/2026 | Conseille Vinted et Depop ensemble, « sans indiquer comment ». Aucun outil. |
| https://friptadium.com/blogs/actualites/beebs-avis | 05/08/2026 | Beebs aux côtés de Vinted. Rien sur l'import. Aucun outil. |

**Erreur utile à signaler** : Vendoo n'a pas Vinted dans son aide UE (voir § 3.1).

**Probabilité : M.** Le site est très actif et met ses pages à jour. Il travaille avec des
affiliés : une demande d'affiliation est possible, et la réponse relève de Nico (§ 1.3).

**Message** : § 6.3.

### 3.3 Resell Vinted (Vinke) (cible 14) — P2

**Éditeur**
- « Vinke, revendeur Vinted et fondateur de Resell Vinted » (https://resellvinted.fr/about/).
- Le site déclare des liens d'affiliation et des codes promo.
- Les mentions légales (https://resellvinted.fr/disclaimer/) sont **un modèle non rempli** :
  « E-mail : [contact@resellvinted.fr] », entre crochets. Cette adresse n'est donc pas fiable.

**Contact** : comptes X et Facebook « resellvinted » (pied de page), TikTok @vinke_tv (données
structurées de la page À propos).

| Page | Date | Ce qu'elle dit aujourd'hui |
|---|---|---|
| https://resellvinted.fr/blog/vinted-vs-ebay-vs-leboncoin-ou-revendre/ | 02/05/2026 | « rien ne vous empêche de jouer sur plusieurs tableaux » ; parle d'un outil de crosslisting **sans le nommer** ; rien sur la double vente. |
| https://resellvinted.fr/blog/meilleurs-outils-automatiser-business-vinted/ | 22/04/2026, mis à jour le 01/08/2026 | ResellTrack, dotB, Vinteer, ConvertLabel, V-Tools ; aucun crosslister. |

**Probabilité : F à M.** Le site vit de l'affiliation.

**Message** : § 6.4 (version DM courte).

### 3.4 Presse, plus tard (cible 22 et pistes)

- **L'Essentiel de l'Éco**, « Achat-revente sur Vinted : les conseils des revendeurs qui en
  vivent ».
  - Denis Mayet, 15/06/2025.
  - URL : https://lessentieldeleco.fr/2431-achat-revente-sur-vinted-les-conseils-des-revendeurs-qui-en-vivent/
  - Outils cités : Souk et Vinz.
  - Contacts publics : redaction@lessentieldeleco.fr, contact@lessentieldeleco.fr
    (https://lessentieldeleco.fr/contact/).
  - L'article est ancien : il s'agit de proposer un sujet, pas de corriger une page.
  - **P3, probabilité F.** Message : § 6.11.
- **Le Parisien Guide d'achat**, « Vendre ses vêtements sur Vinted ou Leboncoin : les astuces pour
  que ça parte vite ».
  - 19/02/2026. Il sort 10e sur « double vente vinted leboncoin » (Brave, rapport 06-FR).
  - URL : https://www.leparisien.fr/guide-shopping/mode-soins/mode/vendre-ses-vetements-sur-vinted-ou-leboncoin-les-astuces-pour-que-ca-parte-vite-19-02-2026-6HZSO7IFEBESLIXBLKIR5Q2IQA.php
  - Rubrique commerciale. Contact non relevé. **P3, F.**
- **Les Numériques**, « “102 articles sur Vinted en un jour” : elle utilise ChatGPT et génère
  685 € ».
  - 16/09/2025.
  - URL : https://www.lesnumeriques.com/intelligence-artificielle/102-articles-sur-vinted-en-un-jour-elle-utilise-chatgpt-et-genere-685-n242491.html
  - Contact non relevé (la page contact répond 410). **P3, F.**
- **Piste à instruire** : la presse d'actualité (Siècle Digital, Fashion Network). Elle demande
  une décision de Nico : un porte-parole nommé ? Non instruite ici.

---

## 4. Fiches : forums, fils et anglophones

### 4.1 vint-aide.com (cibles 7, 8 et 9) — P1, par les modérateurs

**Le forum**
- « Forum d'entraide pour Vinties », créé le 28/05/2024 : https://www.vint-aide.com/about.json
- Il compte 205 participants actifs sur 30 jours.
- On contacte les modérateurs par message privé. L'adresse de contact est vide dans `about.json`.
- **Charte** : publicité interdite (§ 1.4).

**Pourquoi.** Ce forum ressort dans Google et Brave sur « importer annonce vinted sur le bon
coin », « transferer annonce vinted sur beebs » et « synchroniser vinted et beebs » (rapport 06-FR,
annexe B). ChatGPT lit aussi le fil 3616 (rapport 05, Q3).

| Fil | Créé / dernier message | Statut | Ce qu'il dit |
|---|---|---|---|
| https://www.vint-aide.com/t/recherche-crosslister-fr/3616 | 10/02/2026 / 11/02/2026 | ouvert, 4 messages, 130 vues | Question : un crosslister « fonctionnel de la France » pour dupliquer le dressing Vinted sur eBay ; Vendoo et Crosslist Magic seraient « uniquement accessibles UK ou US ». Réponse : « Il n'y en a pas à ce jour pour la Fr. » Puis « si j'utilise un vpn ? » / « je ne sais pas. Essaie ». |
| https://www.vint-aide.com/t/beebs-importation-annonces-depuis-vinted/2009 | 07/06/2025 / 27/07/2026 | ouvert, 14 messages, 2 184 vues | 27/07/2026 : « la fonction n'est plus disponible depuis environ un an […] perso j'ai abandonné » ; « bon j'abandonne aussi alors ». |
| https://www.vint-aide.com/t/importer-son-dressing-sur-lbc/752 | 27/10/2024 / 21/08/2026 | ouvert, 47 messages, 3 907 vues | Un membre propose une extension libre (GitHub) Vinted → Leboncoin, « pas totalement automatisé ». |
| https://www.vint-aide.com/t/concernant-beebs/736 | 21/10/2024 / 07/02/2026 | ouvert, 36 messages, 2 504 vues | 07/02/2026 : « L'importation est-elle revenue ? » / « Non. Perso j'ai abandonné ». |
| https://www.vint-aide.com/t/public-restrictions-pour-activite-automatisee-21-07-2026/4512 | 23/07/2026 / 09/10/2026 | ouvert, 195 messages, 5 373 vues | **À ne pas toucher** : c'est le fil des restrictions pour « activité automatisée ». Une intervention d'un outil y serait mal reçue. |

**Probabilité : M.**
- Les modérateurs refuseront peut-être.
- Une réponse factuelle à « Il n'y en a pas à ce jour pour la Fr. » a de bonnes chances d'être
  acceptée si elle est signée et non commerciale.
- Le fil 4512 montre que les restrictions préoccupent beaucoup le public.

**Message** : § 6.5.

### 4.2 Reddit (cible 21) — P3 ; viser les nouveaux fils

**Lecture.** reddit.com renvoie 403 à nos outils. On a lu l'archive publique
https://api.pullpush.io (titres, dates, textes de départ). Les nombres de commentaires y sont
ceux de la capture, pas ceux d'aujourd'hui.

| Fil | Date | Sujet | Utilité pour FillSell | Fenêtre de réponse |
|---|---|---|---|---|
| r/vinted_france 1sibuhy « Crosslist France » | 11/04/2026 | « Pour les resellers en France / Europe : vous utilisez quoi comme outils ? » ; c'est un post d'éditeur concurrent | forte sur le fond, faible sur la forme (post promotionnel d'un autre) | archivage probable vers le 11/10/2026 |
| r/vinted_france 1spx6yn « Est-ce qu'on devrait pas se mettre à Leboncoin ? » | 19/04/2026 | point de vue d'acheteur | faible | vers le 19/10/2026 |
| r/vinted_france 1srzjwy « 2000+ articles entre Vinted et LBC — comment vous gérez les expéditions ? » | 21/04/2026 | expéditions, pas annonces | faible (FillSell ne fait pas les étiquettes) | vers le 21/10/2026 |
| r/vinted_france 1tivl7u « Avis sur alternative à Vinted » | 20/05/2026 | compte banni ; cherche « Rakuten, eBay, Beebs… » | moyenne (vendre ailleurs **en plus**) ; sujet sensible (bannissement) | vers le 20/11/2026 |
| r/vinted_france 1p8zadc « Avis sur Beebs » | 28/11/2025 | 0 vue en 48 h sur Beebs | moyenne (Vinted + Beebs ensemble) | probablement déjà archivé |
| r/vinted 1l46zq2 « How can I easily repost my listings on Vinted » | 05/06/2025 | public surtout britannique | faible (le Royaume-Uni n'est pas servi) | archivé probablement |
| r/vinted 1wc62ml (rapport 05, Q8) | — | non lu : absent de l'archive publique | — | — |

**Fils de 2024 sur le crosslisting depuis la France**, signe d'une demande récurrente mais
archivés :
- 1hh3wxk « Crosslisting tool for vinted Europe? » (18/12/2024) ;
- 1cq4za9 et 1cq4xva « Crosslisting from vinted in EU (France) » (12/05/2024).

**Conclusion.** Il vaut mieux répondre aux **nouveaux** fils du même type que relancer des fils
mourants. Modèles : § 6.6.

### 4.3 Anglophones en France et en Europe (cibles 12, 17 et 18)

**SellingCurrently, cible 12 (P2)**

| Champ | Contenu |
|---|---|
| Page | « Vinted Alternatives in Europe 2026: 7 Platforms Compared », https://sellingcurrently.com/vinted-alternatives-europe-2026 |
| Auteur, dates | Constantin R. T. ; publié le 07/05/2026, mis à jour le 21/08/2026 |
| Ce qu'elle compare | Depop, Wallapop, Kleinanzeigen, Marktplaats, Vestiaire Collective, eBay, Rebelle/Momox |
| Ce qui manque | **Leboncoin absent**. Un encart partenaire cite **FLUF Connect** pour « List once, sell on Vinted, eBay and Depop ». FillSell absent. |
| Éditeur | « independent reference site » (https://sellingcurrently.com/about) ; financé en partie par l'affiliation, ce que le site déclare |
| Contact | **partnerships@sellingcurrently.com** (https://sellingcurrently.com/partnerships) |
| Atout | La page partenariats dit viser les citations des moteurs de réponse (ChatGPT, Perplexity) : c'est une cible GEO |
| Probabilité | F à M (le site attend sans doute une affiliation) |
| Message | § 6.9 |

**SurviveFrance, cible 17 (P3)**

| Champ | Contenu |
|---|---|
| Fil | « Anyone used LeBonCoin recently to sell an item? », https://www.survivefrance.com/t/anyone-used-leboncoin-recently-to-sell-an-item/37315 |
| Activité | créé le 06/11/2021, dernier message le 29/07/2026, 25 messages, 5 527 vues, ouvert |
| Charte | « Don't post spam » ; une catégorie **« Small Business Listings »** est réservée à l'auto-promotion payante (« self promotion package », sur demande à l'admin) : https://www.survivefrance.com/categories.json |
| Démarche | demander à l'admin, ou prendre l'emplacement payant affiché comme tel (contrepartie transparente, décision de Nico) |
| Message | § 6.10 |

**The Local France, cible 18 (P3)**

| Champ | Contenu |
|---|---|
| Page | « Leboncoin: Everything you need to know about France's biggest sales website », 12/10/2023, https://www.thelocal.fr/20231012/leboncoin-everything-you-need-to-know-about-frances-biggest-sales-website |
| Ce qu'elle dit | Leboncoin seul ; ni Vinted ni outil |
| Contact | **news@thelocal.fr** (indiqué sur la page) |
| Démarche | proposer un sujet daté 2026 (vendre en France en anglais), pas une correction |
| Message | § 6.10 |

**Écarté** : Complete France, « Secondhand shopping: From baby clothes to smartphones »
(18/02/2021), https://www.completefrance.com/living-in-france/integration/guide-to-secondhand-websites-in-france-8307942/
L'article est trop ancien et le contact de la rédaction n'est pas affiché.

---

## 5. Comparatifs écrits par des concurrents (marqués) — P2 / P3

Ces pages servent l'éditeur qui les écrit. La probabilité d'y entrer est **faible**. Elles comptent
pourtant pour le GEO : StoFlow et Relistly sont cités par ChatGPT dans 6 questions sur 10
(rapport 05). Les pages de FillSell les citeront de toute façon, avec leur date (`PLAN.md` § 2).
On envoie **un seul message factuel par éditeur**, sans relance et sans échange de liens.

| Page | Éditeur, dates | Ce qu'elle dit / ce qui manque | Contact | Message |
|---|---|---|---|---|
| https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026 (« Crosslisting France 2026 : 4 apps comparées, verdict ») | Jules Bege, fondateur de Margeo ; JSON-LD publié le 15/06/2026 (rapport 05) ; mis à jour le 05/10/2026 | « Aucun outil ne crossliste Vinted + Leboncoin de façon officielle et conforme aux CGU » ; « Non crosslistables officiellement en 2026 : Vinted + Leboncoin ensemble » ; « Leboncoin n'autorise pas le crosslisting automatisé ». Compare Vendoo, List Perfectly, Nifty, Flyp, Crosslist Magic, SellerAider. **2e sur Bing** (rapport 05 § 3.3). **I** (suivi de marge). **P1** pour la correction. | **ceo@margeoapp.com** (https://margeoapp.com/a-propos/, /legal) | § 6.2 |
| https://stoflow.com/blog/meilleur-logiciel-crosslisting-2026 | Matthias, fondateur ; 23/07/2026, mis à jour le 06/10/2026 | 13 outils (Vinkit, ControlResell, You-Sync, Vinteer, VintedCRM, Bleam, List Perfectly, Crosslist, Closo, Vendoo, FLUF Connect, DressKare, Reposter), « aucun outil n'est noté ni classé ». FillSell et Beebs absents. **D.** | support@stoflow.com (https://stoflow.com/support) | § 6.7 |
| https://relistly.io/guides/crosslisting-tools-that-support-vinted et https://relistly.io/integrations/leboncoin | Relistly ; matrice « verified 2 September 2026 » | Matrice : Relistly, Vendoo, List Perfectly, Crosslist, Voolist, Nifty, Flyp. Page Leboncoin : « Relistly is the only mainstream crosslister that reaches any EU classifieds at all — no competitor covers Leboncoin either. » ; Leboncoin y est « coming soon » chez Relistly. **D.** | support@relistly.io (https://relistly.io/support) | § 6.8 |
| https://fluf.io/crosslisting/vinted-to-leboncoin/ | FLUF ; date affichée 29/05/2026 | « FLUF Connect is the only crosslisting tool that supports both Vinted and Leboncoin for individual sellers. » **D.** | https://fluf.io/contact | § 6.8 |
| https://www.flowdino.com/blog/meilleur-logiciel-crosslisting-2026 | équipe FlowDino ; 10/08/2026 | Compare Vendoo, List Perfectly, Crosslist et FlowDino ; envoie les vendeurs Depop vers les « solutions américaines ». **D.** | contact@flowdino.com | § 6.7 |
| https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/logiciel-vinted-lequel-choisir-2026 | Gregory Giovannone ; 01/04/2026, mis à jour le 08/10/2026 | 7 outils Vinted Pro (DressKare 1er) ; Fripio est le seul cité pour Leboncoin. **I.** | support@dresskare.com (mentions légales) | § 6.7 |
| https://www.vinteer.io/blog/meilleur-outil-vinted | équipe Vinteer ; 04/02/2026, mis à jour le 11/09/2026 | 12 outils, dont V-Storm (« cross-post vers Leboncoin »). **I.** | contact@vinteer.io | § 6.7 |
| https://fripio.app/blog/comparatif-outils-vinted-2026 | Stefan, fondateur de Fripio (homonyme de l'éditeur de Seconde Main Mag, lien non établi) ; 19/03/2026, mis à jour le 04/07/2026 | 7 extensions ; **invite les éditeurs cités à signaler une inexactitude**. **I.** | contact@fripio.app | § 6.7 |
| https://vintedcrm.com/ressources/meilleur-outil-vinted/ | équipe VintedCRM ; 21/02/2026 (offres relues le 22/09/2026) | VintedCRM, Vinteer, DressKare, Clemz ; aucun crosslister. **I.** | contact@vintedcrm.com | § 6.7 |
| https://you-sync.fr/blog/comparatif-outils-gestion-vinted-2026 (lu par ChatGPT, Q4) | cofondateur de You-Sync ; 24/07/2026, mis à jour le 22/09/2026 | Bleam, Clemz, Vintex, DoTB, DressKare, Vinteer, VintedCRM, You-Sync. **I.** | contact@you-sync.fr (mentions légales) | § 6.7 |
| https://revendor.app/fr/compare/best-vinted-seller-tools (cité par ChatGPT, Q4) | Revendor ; relevé le 23/09/2026 | Revendor, Dotb, Clemz, Bleam, VintedCRM, Grow Bot. **I.** | Discord seulement | non (pas de canal écrit) |
| https://vinkit.co/blog/extensions-chrome-vinted-gratuites | fondateur de Vinkit ; 02/06/2026 | 5 extensions, toutes pour Vinted seul. **I.** | formulaire /contact (non rempli) | § 6.7 |
| https://www.listmycloset.com/blog/best-crosslisting-app-for-vinted/ | List My Closet ; 20/08/2026 | Vendoo, Crosslist, List My Closet, Zipsale ; Crosslist dit « popular with European sellers ». **D.** Public américain ou britannique. | aucun | non (hors public servi) |

---

## 5 bis. Créateurs vidéo (cibles 13, 15 et 16) — P2 / P3

Pages publiques YouTube lues le 09/10/2026. Les dates sont celles de `publishDate`.
- **Contacts** : on n'a relevé que les liens que les créateurs publient eux-mêmes dans leurs
  descriptions. L'e-mail professionnel éventuel de l'onglet « À propos » est derrière un captcha
  et n'a pas été relevé.
- **Ces chaînes vivent de codes promo et d'affiliation.** Sans contrepartie, la probabilité est
  faible. Toute contrepartie relève de Nico et se signale dans la vidéo (§ 1.3).

| Vidéo | Chaîne | Date, vues | Ce qu'elle couvre | Lien avec FillSell |
|---|---|---|---|---|
| « J'ai testé 50 outils Vinted : Voici les 5 qui rapportent vraiment », https://www.youtube.com/watch?v=ADD5TpVxXQU | Felix Beauregard (https://www.youtube.com/@felixbeauregard) | 02/08/2026, 5 431 vues | Mannequins IA, détourage, groupes Discord ; aucun outil multi-plateforme. **Source de l'Aperçu IA de Google sur Q4** (rapport 05). | Le crosslisting et la double vente ne sont pas traités. |
| « La méthode Claude pour vendre plus et plus cher sur Vinted », https://www.youtube.com/watch?v=DW9_pToYKfg | idem | 19/07/2026, 7 847 vues | Parle de « la publication et la republication automatique des annonces ». | Lens tourne sur Claude Haiku 4.5 d'Anthropic (F15) : c'est une accroche juste. |
| « Les meilleurs outils externes pour l'achat-revente Vinted », https://www.youtube.com/watch?v=MbRjPh2nStE | Keyran Dawsell (https://www.youtube.com/@KeyranDawsell) | 28/06/2026, 1 973 vues | Vtools, Kops, Vintedge et Resell Track, avec codes promo. | Aucun crosslister. |
| « Ma Méthode pour Publier 150 Annonces par Heure sur Vinted ! », https://www.youtube.com/watch?v=JqcmLWltP_E | Paul Vernat (https://www.youtube.com/@PaulVernat) | 16/01/2026, 3 384 vues | Restockr. Paul Vernat est cité par l'Aperçu IA de Google sur Q4. | Vinted seul. |
| « 8 astuces pour vendre PLUS VITE sur Vinted », https://www.youtube.com/watch?v=lmQGKpuIjSU | Bartorico (https://www.youtube.com/@Bartorico) | 07/01/2025, 146 698 vues | Profil, prix, photos, relance, messages aux favoris. | Ancienne, forte audience ; seulement si une nouvelle vidéo se prépare. P3. |

**TikTok** : non relu, car TikTok n'est pas lisible par nos outils.
- Les deux vidéos des SERP du rapport 06-FR datent de **2023** (date tirée de l'identifiant de la
  vidéo) et ne sont pas retenues : `@jimmyyresell/video/7312142738974182689` (13/12/2023) et
  `@dim.vintage/video/7184091768558718214` (02/01/2023).
- Les reels Instagram de FillSell remontent déjà sur C2 (rapport 05).

**Message** : § 6.12.

---

## 5 ter. Écartés, et pourquoi

| Page | Raison |
|---|---|
| josephtorregrossa.com : « Beebs vs Vinted » (11/01/2026), « Achat revente Beebs » (11/01/2026), « Leboncoin ou Vinted », « Vendre sur eBay ou Vinted » | La boutique du site a une collection « acheter-un-compte-ebay » (https://josephtorregrossa.com/collections/acheter-un-compte-ebay, relevée le 09/10/2026). C'est une association d'image risquée : **à ne solliciter que sur décision de Nico**. L'e-mail de contact est personnel ; on ne le reproduit pas (page https://josephtorregrossa.com/pages/contact). |
| crosslist.com/blog/vinted-cross-listing (02/10/2026) | Page d'un concurrent sur son propre retrait. Aucune action, mais le fait se cite dans nos pages. |
| Comparatifs américains (3dsellers, nifty.ai, voolist, closo, resylr, crosslist.com/blog, G2, Capterra) | Public américain que FillSell ne sert pas (rapport 06-EN § 0). |
| Paste Magazine, « 9 Essential Fashion Apps for Reselling Your Wardrobe » | Article ancien (Tradesy, Threadflip), public américain. |
| github.com/ValentinGratz/vinted2beebs (tickets) | Dépôt d'un développeur : aucune promotion dans les tickets. |
| community.ebay.com (fils « cross linking with vinted ») | Forum d'eBay.com ; FillSell ne sert qu'eBay France. |
| topdowntrading.co.uk, BoldBreaks (YouTube, Royaume-Uni) | Royaume-Uni, non servi. |
| combak.co/blog/leboncoin-vs-vinted (Tom Rouchy, 02/06/2026, mis à jour le 01/09/2026) | Conseille de **choisir une** plateforme ; comparateur de reconditionné, hors sujet. |
| Blog officiel de Beebs (« Beebs ou Vinted ») | 403 au 09/10/2026, non relu. Une démarche vers Beebs serait un **partenariat**, pas une cible éditoriale : décision de Nico. Ne jamais écrire « partenaire » sans accord écrit. |
| Annuaires (G2, Capterra, GetApp, AlternativeTo, WebCatalog) | Inscription avec compte, donc geste de Nico ; hors du périmètre éditorial (rapport 05 § 8 P2-3). |

---

## 6. Messages proposés

> Avant chaque envoi :
> 1. vérifier que les URL liées répondent 200 ;
> 2. appliquer [D1] ;
> 3. relire les faits concurrents du jour ;
> 4. obtenir l'accord de Nico.
>
> Les crochets `[ ]` sont à remplir ou à retirer.

### 6.1 Seconde Main Mag (FR) — cibles 1 et 2

**À** : contact@secondmainmag.com
**Objet** : Cross-listing Vinted, Leboncoin, eBay (28/05/2026) — deux précisions factuelles

> Bonjour,
>
> FillSell est notre produit : nous vous écrivons à ce titre, et votre page méthodologie invite à
> signaler une erreur factuelle.
>
> Votre article « Cross-listing Vinted, Leboncoin, eBay : publier partout sans risque en 2026 »
> (28/05/2026) cite Vendoo et Crosslist. Pour un vendeur qui vit en France, trois faits relevés le
> 9 octobre 2026 changent la donne :
> - **Crosslist** : « we do not support users residing in the European Union »
>   (crosslist.com/pricing). Depuis le 2 octobre 2026, il n'ouvre plus Vinted aux nouveaux
>   comptes (crosslist.com/blog/vinted-cross-listing).
> - **Vendoo** : son aide UE (mise à jour le 30/03/2026) liste eBay, Etsy, Depop, Whatnot et
>   Facebook Marketplace, sans Vinted (help.vendoo.co/eu/en/articles/8856209).
> - **List Perfectly**, cité dans « Outils CRM Vinted 2026 », indique « supports U.S.
>   marketplaces only » (listperfectly.com/faq).
>
> Des outils servent aujourd'hui ce trajet depuis la France. FillSell publie une annonce sur
> Vinted (France), Leboncoin, eBay (France), Beebs [et Depop]. Dès qu'une vente est enregistrée,
> il retire les autres annonces de l'article, et au moindre doute il demande « Déjà vendu ? ».
> D'autres éditeurs couvrent une partie du trajet, chacun d'après sa propre page : Redrip et
> Reposter (Vinted et Leboncoin), StoFlow (Vinted, Leboncoin, eBay).
>
> Les détails, avec leurs limites (ordinateur allumé avec Chrome pour Vinted, Leboncoin, Beebs) :
> - https://fillsell.app/crosslisting
> - https://fillsell.app/fonctions/ventes-et-retraits
> - https://fillsell.app/alternative/crosslist
>
> Aucune contrepartie n'est demandée ni proposée. Si une démonstration vous aide à vérifier, nous
> pouvons vous ouvrir un accès de test, sans condition de mention. [option : décision de Nico]
>
> Bien à vous,
> L'équipe FillSell — fillsell.app

### 6.2 Margeo (FR) — cible 3, correction factuelle

**À** : ceo@margeoapp.com
**Objet** : « Aucun outil ne crossliste Vinted + Leboncoin » — une précision datée

> Bonjour,
>
> FillSell est notre produit, et nous savons que Margeo et FillSell ne font pas le même métier.
>
> Votre comparatif « Crosslisting France 2026 » (mis à jour le 05/10/2026) affirme : « Aucun outil
> ne crossliste Vinted + Leboncoin de façon officielle et conforme aux CGU ». Votre FAQ répond
> « Non » à « Crosslisting Vinted + Leboncoin fiable en 2026 ? ».
>
> La partie « aucun outil ne crossliste » ne correspond plus aux faits publics. Plusieurs outils
> publient aujourd'hui la même annonce sur Vinted et Leboncoin, chacun d'après sa propre page :
> - FillSell : Vinted (France), Leboncoin, eBay (France), Beebs [et Depop] ;
> - Redrip et Reposter : Vinted et Leboncoin ;
> - StoFlow : Vinted, Leboncoin, eBay France.
>
> La question de la conformité aux conditions de chaque plateforme est distincte. Nous ne la
> tranchons pas à votre place. FillSell ne se dit ni officiel, ni approuvé, ni partenaire d'aucune
> plateforme.
>
> Ce que fait FillSell, et que vos lecteurs peuvent vérifier :
> - l'extension Chrome dépose l'annonce par le formulaire du site, dans la session de la personne,
>   une annonce à la fois ;
> - aucun mot de passe n'est demandé ;
> - un compte eBay relié passe par l'interface officielle d'eBay ;
> - dès qu'une vente est enregistrée, les autres annonces de l'article sont retirées, et au
>   moindre doute l'app demande « Déjà vendu ? ».
>
> Les détails et les limites :
> - https://fillsell.app/securite-des-comptes
> - https://fillsell.app/comment-ca-marche
> - https://fillsell.app/tarifs
>
> Une formulation exacte serait par exemple : « Des outils publient aujourd'hui sur Vinted et
> Leboncoin ; leur conformité aux conditions de chaque plateforme reste à apprécier. »
>
> Aucune contrepartie n'est demandée.
>
> Bien à vous,
> L'équipe FillSell — fillsell.app

### 6.3 Friptadium (FR) — cibles 4, 5 et 6

**À** : contact@friptadium.com
**Objet** : « Vendre sur plusieurs plateformes sans se survendre » — l'outil de synchronisation
que l'article ne nomme pas

> Bonjour Thibault,
>
> FillSell est notre produit. Votre article « Vendre sur plusieurs plateformes en même temps : la
> méthode pour ne jamais se survendre » (10/08/2026) pose la bonne règle : « une pièce vendue
> quelque part se retire partout, tout de suite ». Il ajoute qu'au gros volume, un outil de
> synchronisation « automatise ce retrait », sans en nommer un.
>
> C'est exactement ce que fait FillSell, sur les plateformes que vous citez dans « Où vendre ses
> vêtements de seconde main » :
> - publication sur Vinted (France), Leboncoin, eBay (France), Beebs [et Depop] ;
> - quand Vinted ou eBay marque l'article vendu, la vente s'enregistre seule ; sur Leboncoin et
>   Beebs, un appui la confirme ;
> - les autres annonces de l'article sont alors retirées, et au moindre doute l'app demande
>   « Déjà vendu ? ».
>
> Pour être complet, la limite : l'ordinateur doit rester allumé avec Chrome ouvert pour Vinted,
> Leboncoin, Beebs [et Depop]. eBay relié publie même ordinateur éteint.
>
> Deux pages de votre site pourraient aussi en profiter :
> - « Vendre sur Depop depuis la France » conseille Vinted et Depop ensemble, sans dire comment
>   [D1] ;
> - « Beebs : avis » : sur le forum vint-aide, des vendeurs disent que l'import Vinted → Beebs
>   « n'est plus disponible depuis environ un an » (27/07/2026).
>
> Une précision pour votre top 10 : Vendoo (10e, « cross-listing sur 11 places de marché ») ne
> liste pas Vinted dans son aide UE, mise à jour le 30/03/2026
> (help.vendoo.co/eu/en/articles/8856209).
>
> Les détails :
> - https://fillsell.app/fonctions/ventes-et-retraits
> - https://fillsell.app/crosslisting/vinted-beebs
> - https://fillsell.app/crosslisting/vinted-depop [D1]
> - https://fillsell.app/tarifs
>
> Aucune contrepartie n'est proposée dans ce message. Si vous travaillez avec des affiliés,
> dites-le-nous : nous vous répondrons clairement. [décision de Nico ; toute affiliation est
> déclarée par l'éditeur]
>
> Bien à vous,
> L'équipe FillSell — fillsell.app

*Variante avec `{REPUB_AUTO}`, si Nico veut parler de la republication* : ajouter « FillSell
republie aussi tes annonces tout seul sur {REPUB_AUTO}, aux jours et au créneau choisis,
ordinateur allumé ». Pas de palier, pas d'eBay, et version B tant que D2 n'est pas vérifié.

### 6.4 Resell Vinted (FR, message privé court) — cible 14

> Bonjour Vinke,
>
> FillSell est notre produit. Dans « Vinted vs eBay vs Leboncoin : où revendre ? » (02/05/2026),
> vous évoquez un outil de crosslisting sans le nommer.
>
> FillSell publie une annonce sur Vinted (France), Leboncoin, eBay (France), Beebs [et Depop]. Il
> retire les autres annonces dès qu'une vente est enregistrée, et demande « Déjà vendu ? » au
> moindre doute. C'est gratuit pour commencer.
>
> Les détails : https://fillsell.app/crosslisting et
> https://fillsell.app/comparatif/meilleures-applications-crosslisting (méthode et sources
> datées).
>
> Aucune contrepartie dans ce message. Si vous fonctionnez par affiliation, dites-le-nous et nous
> vous répondrons clairement.
>
> L'équipe FillSell

### 6.5 vint-aide (FR) — cibles 7, 8 et 9

**Étape 1 : message privé aux modérateurs** (rien n'est publié sans leur réponse)

> Bonjour,
>
> Nous travaillons sur FillSell, une app de publication sur plusieurs plateformes. Nous lisons
> vint-aide et respectons votre charte (« pas de publicité »). C'est pourquoi nous vous demandons
> avant de répondre.
>
> Deux fils posent une question factuelle à laquelle la réponse publiée n'est plus exacte :
> - « Recherche crosslister FR » (10/02/2026) : « Il n'y en a pas à ce jour pour la Fr. » ;
> - « Beebs : importation annonces depuis Vinted » (27/07/2026) : des membres abandonnent Beebs
>   faute d'import.
>
> Nous proposons une réponse courte, signée « FillSell (éditeur) », qui cite **plusieurs** outils
> et pas seulement le nôtre, sans lien si vous préférez. Si vous refusez, nous n'écrirons rien.
>
> Merci de votre temps,
> L'équipe FillSell

**Étape 2 : réponse prête pour le fil 3616**, seulement avec l'accord des modérateurs

> Bonjour, une mise à jour pour ceux qui tomberaient sur ce sujet. Transparence : je travaille sur
> FillSell, un de ces outils.
>
> Depuis la France, il existe aujourd'hui des outils qui publient une annonce Vinted sur d'autres
> plateformes, chacun d'après sa propre page :
> - Redrip et Reposter (Vinted ↔ Leboncoin) ;
> - StoFlow (Vinted, Leboncoin, eBay) ;
> - FlowDino (Vinted, Leboncoin, eBay, Beebs, Etsy, Vestiaire) ;
> - FillSell (Vinted, Leboncoin, eBay, Beebs [et Depop]).
>
> Les outils américains cités plus haut (Vendoo, Crosslist) ne servent pas la France pour Vinted.
> Un VPN n'y change rien : Crosslist écrit ne pas servir les résidents de l'UE.
>
> Avant de choisir, vérifiez deux points :
> - que l'outil retire les autres annonces quand l'article se vend ;
> - qu'il ne demande pas votre mot de passe.
>
> [Lien seulement si les modérateurs l'acceptent : https://fillsell.app/crosslisting/vinted-ebay]

**Réponse prête pour le fil 2009 (Beebs)**, même condition

> Transparence : je travaille sur FillSell. Pour ceux qui veulent garder Beebs malgré la
> disparition de l'import : des outils permettent de publier les mêmes articles sur Vinted et
> Beebs depuis un seul stock. FlowDino et FillSell le font, chacun d'après sa page. Quand
> l'article se vend, l'annonce de l'autre site est retirée ; sur Beebs, la vente se confirme d'un
> appui.
>
> [Lien si accepté : https://fillsell.app/crosslisting/vinted-beebs]

### 6.6 Reddit (FR et EN) — modèles pour les nouveaux fils

Geste de Nico, avec son compte, après lecture des règles du subreddit.

**FR** (fil du type « vous utilisez quoi pour vendre sur Vinted et Leboncoin en même temps ? ») :

> Transparence : je bosse sur FillSell, donc je ne suis pas neutre. Quelques repères, quel que
> soit l'outil :
> 1. Vérifie qu'il **retire les autres annonces** quand l'article se vend. C'est là que se jouent
>    les doubles ventes.
> 2. Vérifie qu'il ne demande **pas ton mot de passe** Vinted ou Leboncoin.
> 3. Vérifie les **plateformes réellement servies depuis la France**. Crosslist ne sert pas
>    l'UE ; l'aide UE de Vendoo ne liste pas Vinted.
>
> En France, Redrip et Reposter font Vinted + Leboncoin, et StoFlow ajoute eBay. FillSell fait
> Vinted, Leboncoin, eBay, Beebs [et Depop], avec une app iPhone/Android ; l'ordinateur doit
> rester allumé avec Chrome pour Vinted, Leboncoin et Beebs. Comparatif avec méthode et sources :
> https://fillsell.app/comparatif/meilleures-applications-crosslisting

**EN** (r/vinted ou r/reselling, seulement si le demandeur vend **depuis la France**) :

> Disclosure: I work on FillSell. If you sell from France, check three things in any tool:
> 1. it removes your other listings when the item sells;
> 2. it never asks for your marketplace password;
> 3. it actually serves French residents. Crosslist says it doesn't serve EU residents, and
>    Vendoo's EU help page doesn't list Vinted.
>
> FillSell covers Vinted France, Leboncoin, eBay.fr, Beebs [and Depop]:
> https://fillsell.app/en/compare/best-crosslisting-apps

### 6.7 Comparatifs écrits par des concurrents (FR) — StoFlow, FlowDino, DressKare, Vinteer, Fripio, VintedCRM, You-Sync, Vinkit

Un seul envoi par éditeur, sans relance.

**Objet** : [titre de la page] — un outil que la liste ne contient pas

> Bonjour,
>
> FillSell est notre produit. Nous vous écrivons parce que votre page « [titre] » ([date]) se
> présente comme un panorama ([« ne désigne pas un gagnant » chez StoFlow / « invite les éditeurs
> cités à signaler une inexactitude » chez Fripio]).
>
> FillSell n'y figure pas. Les faits, si vous jugez utile de l'ajouter :
> - publication sur Vinted (France), Leboncoin, eBay (France), Beebs [et Depop] ;
> - app iPhone et Android, plus une extension Chrome ;
> - quand Vinted ou eBay marque l'article vendu, la vente s'enregistre seule ; sur Leboncoin et
>   Beebs, un appui la confirme ;
> - les autres annonces de l'article sont ensuite retirées ;
> - gratuit pour commencer, puis Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois ;
> - limite : ordinateur allumé avec Chrome pour Vinted, Leboncoin, Beebs [et Depop].
>
> Sources : https://fillsell.app/comment-ca-marche et https://fillsell.app/tarifs.
>
> Notre propre comparatif cite votre outil avec la date et la source de chaque fait :
> https://fillsell.app/comparatif/fillsell-vs-[outil].
>
> Nous ne proposons ni échange de liens ni contrepartie.
>
> L'équipe FillSell — fillsell.app

### 6.8 Relistly et FLUF (EN) — deux corrections d'exclusivité

**Relistly**, à support@relistly.io

> Hello,
>
> Disclosure: FillSell is our product. Your Leboncoin page
> (relistly.io/integrations/leboncoin, read on 9 October 2026) says: "no competitor covers
> Leboncoin either."
>
> For accuracy: FillSell publishes to Leboncoin today, alongside Vinted France, eBay.fr, Beebs
> [and Depop]. Other tools also list Leboncoin, each according to its own pages: Redrip,
> Reposter, StoFlow and FLUF Connect.
>
> Details: https://fillsell.app/en/platforms/leboncoin. Your matrix
> (crosslisting-tools-that-support-vinted, verified 2 September 2026) may want the same update.
>
> No link exchange or anything else requested.
>
> The FillSell team

**FLUF**, par le formulaire https://fluf.io/contact (rempli par Nico seulement)

> Hello,
>
> Disclosure: FillSell is our product. Your page "Crosslist from Vinted to Leboncoin"
> (fluf.io/crosslisting/vinted-to-leboncoin/, dated 29 May 2026) says: "FLUF Connect is the only
> crosslisting tool that supports both Vinted and Leboncoin for individual sellers."
>
> As of 9 October 2026, other tools serve individual sellers on both: FillSell, Redrip, Reposter
> and StoFlow, each according to its own pages. Details:
> https://fillsell.app/en/crosslisting/vinted-leboncoin
>
> No request beyond accuracy.
>
> The FillSell team

### 6.9 SellingCurrently (EN) — cible 12

**À** : partnerships@sellingcurrently.com
**Objet** : Vinted Alternatives in Europe 2026 — Leboncoin, and a France-based crosslisting option

> Hello,
>
> Disclosure: FillSell is our product.
>
> Your guide "Vinted Alternatives in Europe 2026" (updated 21 August 2026) compares seven
> platforms but leaves out **Leboncoin**, France's largest classifieds marketplace. That gap
> matters to readers selling from France.
>
> For readers who want to sell on several platforms from France, FillSell publishes one listing
> to Vinted France, Leboncoin, eBay.fr, Beebs [and Depop]. It removes the item's other listings
> once a sale is recorded, and never asks for marketplace passwords. The limit: the computer must
> be on with Chrome open for Vinted, Leboncoin and Beebs.
>
> Pricing is public: free to start, then €12.99, €29.99 and €59.99 a month.
>
> Details:
> - https://fillsell.app/en/crosslisting
> - https://fillsell.app/en/platforms/leboncoin
> - https://fillsell.app/en/pricing
>
> We have no affiliate programme today [à confirmer par Nico], so this is a factual suggestion
> only.
>
> The FillSell team

### 6.10 Expatriés (EN) — SurviveFrance (cible 17) et The Local (cible 18)

**SurviveFrance, message privé à l'admin**

> Hello,
>
> Disclosure: I work on FillSell, an app that publishes second-hand listings to Leboncoin, Vinted
> France, eBay.fr and Beebs.
>
> The thread "Anyone used LeBonCoin recently to sell an item?" keeps getting replies (latest
> 29 July 2026). Would a short, clearly disclosed reply be acceptable there, or should we use your
> Small Business Listings package instead?
>
> Either way, we won't post anything without your OK.
>
> Thanks,
> The FillSell team

**The Local France**, à news@thelocal.fr, comme proposition de sujet

> Hello,
>
> Your Leboncoin explainer (12 October 2023) still ranks for English-speaking readers in France.
> In 2026, many of them also sell on Vinted France and eBay.fr [where eBay dropped final value
> fees for private sellers on 1 September 2026 — à garder seulement après lecture de la page
> officielle d'eBay].
>
> If you plan an update on selling second-hand in France in English, we can share how resellers
> list on several French marketplaces at once. Disclosure: FillSell is our product.
>
> Our guide: https://fillsell.app/blog/sell-on-leboncoin-in-english. No request for a link.
>
> The FillSell team

⚠️ Avant d'envoyer ce message :
- **lire la page officielle d'eBay** sur les frais des particuliers. Le fait est repris d'une
  synthèse WebSearch et du rapport 06-FR § G4, pas encore lu à la source ;
- ne jamais écrire « tu écris en anglais, l'annonce part en français » : ce parcours n'est pas
  vérifié (rapport 06-EN § 1).

### 6.11 L'Essentiel de l'Éco (FR) — proposition de sujet, cible 22

**À** : redaction@lessentieldeleco.fr

> Bonjour,
>
> Votre enquête « Achat-revente sur Vinted : les conseils des revendeurs qui en vivent »
> (15/06/2025) décrivait les outils de sourcing. Depuis l'été 2026, la question des revendeurs a
> changé :
> - vendre le même stock sur Vinted, Leboncoin, eBay et Beebs sans le vendre deux fois ;
> - avec des restrictions Vinted pour « activité automatisée » signalées depuis le 21/07/2026 sur
>   les forums de vendeurs.
>
> Nous éditons FillSell, un de ces outils. Nous pouvons expliquer le fonctionnement, ses limites
> et ce qu'il ne fait pas, et vous orienter vers des sources indépendantes.
>
> Fiche : https://fillsell.app/comment-ca-marche. Aucune contrepartie.
>
> L'équipe FillSell

### 6.12 Créateurs vidéo (FR) — Felix Beauregard, Keyran Dawsell, Paul Vernat

> Bonjour [nom de la chaîne],
>
> FillSell est notre produit. Dans « [titre] » ([date]), vous passez en revue les outils Vinted.
> Un sujet n'y est pas : vendre le même stock sur Vinted, Leboncoin, eBay, Beebs [et Depop] sans
> double vente.
>
> FillSell part d'une photo :
> - Lens, qui tourne sur Claude Haiku 4.5 d'Anthropic, rédige titre, description et prix ;
> - l'app publie sur les plateformes cochées ;
> - quand l'article se vend, elle retire les autres annonces.
>
> Si le sujet vous intéresse pour une prochaine vidéo, nous vous ouvrons un accès pour tester.
> [option, décision de Nico : si la vidéo en parle après cet accès, la mention « collaboration
> commerciale » ou « produit offert » s'applique (§ 1.3)]
>
> Présentation : https://fillsell.app/comment-ca-marche ; IA : https://fillsell.app/fonctions/lens
>
> L'équipe FillSell

---

## 7. Ordre proposé (après la mise en ligne)

| Semaine | Envois | Prérequis |
|---|---|---|
| S1 | Margeo (§ 6.2) · Seconde Main Mag (§ 6.1) · Friptadium (§ 6.3) · modérateurs de vint-aide (§ 6.5, étape 1) | `/crosslisting`, `/fonctions/ventes-et-retraits`, `/securite-des-comptes`, `/tarifs`, `/comment-ca-marche`, `/alternative/crosslist`, `/crosslisting/vinted-beebs` en ligne ; D1 tranché |
| S2 | Relistly et FLUF (§ 6.8) · SellingCurrently (§ 6.9) · StoFlow, FlowDino, Fripio (§ 6.7) | `/en/*` correspondants ; `/comparatif/*` en ligne |
| S3 | Resell Vinted (§ 6.4) · créateurs vidéo (§ 6.12, si Nico choisit une contrepartie) · admin de SurviveFrance (§ 6.10) | décisions de Nico sur les contreparties |
| En continu | Reddit (§ 6.6) sur les nouveaux fils · autres comparatifs de concurrents (§ 6.7) · The Local et L'Essentiel de l'Éco | — |

**Suivi** : tenir un tableau avec les colonnes suivantes : cible, date d'envoi, réponse, page
modifiée le, FillSell cité (oui/non), lien (`rel`). Le panel IA du rapport 05 se refait chaque
mois : on regarde si les pages corrigées remontent dans les citations.

---

## 8. Limites et non vérifié

- **Reddit** : contenu lu par l'archive pullpush.io, pas sur reddit.com (403). Nombres de
  commentaires figés à la capture. L'archivage réel et les règles des subreddits ne sont pas
  vérifiés.
- **Groupes Facebook** (« Vinted Professionnel » ; groupes Beebs 1307944133243403 et
  865530781041905, rapport 06-FR annexe B) : fermés, non lus.
- **TikTok** et e-mails professionnels des chaînes YouTube : non lus.
- **Le Parisien, Les Numériques** : métadonnées lues par curl. Contacts de rédaction non relevés.
- **Blog de Beebs** : 403 au 09/10/2026.
- **Les phrases citées des concurrents** peuvent changer d'ici l'envoi : à relire le jour même.
  StoFlow déclare déjà des domaines Depop dans son extension (matrice § 3).
- **Frais eBay des particuliers** au 01/09/2026 : non lus à la source.
- **Seconde Main Mag et Fripio** : leurs éditeurs signent tous deux « Stefan ». Aucun lien entre
  les deux n'est établi ici.
- **Faits FillSell** : ils dépendent de l'état de la production le jour de l'envoi (D1, D2, P1,
  P3 de `03c`). La base n'a pas été interrogée.

---

## Annexe — Sources consultées (toutes le 2026-10-09)

**Médias et blogs**
- Seconde Main Mag :
  - https://secondmainmag.com/cross-listing-vinted-leboncoin-ebay-2026/
  - https://secondmainmag.com/outils-crm-vinted-2026-automatiser-ventes/
  - https://secondmainmag.com/algo-vinted-2026-republication-doublons-visibilite/
  - https://secondmainmag.com/mentions-legales/
  - https://secondmainmag.com/methodologie/
  - https://secondmainmag.com/stefan/
  - https://secondmainmag.com/sitemap-0.xml
- Friptadium :
  - https://friptadium.com/blogs/actualites/vendre-plusieurs-plateformes-sans-se-survendre
  - https://friptadium.com/blogs/actualites/meilleurs-outils-automatisation-vinted-2026
  - https://friptadium.com/blogs/actualites/ou-vendre-vetements-seconde-main-plateformes
  - https://friptadium.com/blogs/actualites/vendre-sur-depop-guide-avis
  - https://friptadium.com/blogs/actualites/beebs-avis
  - https://friptadium.com/pages/outils
  - https://friptadium.com/pages/contact
- Resell Vinted :
  - https://resellvinted.fr/blog/vinted-vs-ebay-vs-leboncoin-ou-revendre/
  - https://resellvinted.fr/blog/meilleurs-outils-automatiser-business-vinted/
  - https://resellvinted.fr/about/
  - https://resellvinted.fr/disclaimer/
  - https://resellvinted.fr/privacy/
- Joseph Torregrossa :
  - https://josephtorregrossa.com/blogs/vinted/beebs-vs-vinted-quelle-est-la-meilleure-plateforme-pour-bebe-en-2026
  - https://josephtorregrossa.com/blogs/vinted/achat-revente-beebs-guide-pour-parents-revendeurs-en-2026
  - https://josephtorregrossa.com/ (collections)
  - https://josephtorregrossa.com/pages/contact
- Combak : https://www.combak.co/blog/leboncoin-vs-vinted
- L'Essentiel de l'Éco :
  - https://lessentieldeleco.fr/2431-achat-revente-sur-vinted-les-conseils-des-revendeurs-qui-en-vivent/
  - https://lessentieldeleco.fr/contact/
- Le Parisien Guide d'achat et Les Numériques : URL au § 3.4.

**Anglophones**
- SellingCurrently :
  - https://sellingcurrently.com/vinted-alternatives-europe-2026
  - https://sellingcurrently.com/about
  - https://sellingcurrently.com/partnerships
- The Local France : https://www.thelocal.fr/20231012/leboncoin-everything-you-need-to-know-about-frances-biggest-sales-website
- AirSelli : https://blog.airselli.com/en/2026/03/25/leboncoin-for-foreigners/ (transitaire de colis, écarté)
- Complete France : https://www.completefrance.com/living-in-france/integration/guide-to-secondhand-websites-in-france-8307942/
- SurviveFrance :
  - https://www.survivefrance.com/t/37315.json
  - https://www.survivefrance.com/guidelines
  - https://www.survivefrance.com/categories.json

**Comparatifs de concurrents**
- Margeo :
  - https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026
  - https://margeoapp.com/en/blog/crosslisting-guide-resellers-2026/
  - https://margeoapp.com/a-propos/
  - https://margeoapp.com/legal
- StoFlow : https://stoflow.com/blog/meilleur-logiciel-crosslisting-2026 ; https://stoflow.com/support
- FlowDino : https://www.flowdino.com/blog/meilleur-logiciel-crosslisting-2026 ; https://www.flowdino.com/contact
- Relistly :
  - https://relistly.io/guides/crosslisting-tools-that-support-vinted
  - https://relistly.io/integrations/leboncoin
  - https://relistly.io/compare/vendoo-alternative-europe
  - https://relistly.io/support
- FLUF : https://fluf.io/crosslisting/vinted-to-leboncoin/
- DressKare : https://dresskare.com/blog-pages/blog-vendeur-pro-seconde-main/logiciel-vinted-lequel-choisir-2026 ; https://dresskare.com/mentions-legales
- Vinteer : https://www.vinteer.io/blog/meilleur-outil-vinted
- Fripio : https://fripio.app/blog/comparatif-outils-vinted-2026 ; https://fripio.app/about
- VintedCRM : https://vintedcrm.com/ressources/meilleur-outil-vinted/
- You-Sync : https://you-sync.fr/blog/comparatif-outils-gestion-vinted-2026 ; https://you-sync.fr/mentions-legales
- Revendor : https://revendor.app/fr/compare/best-vinted-seller-tools
- Vinkit : https://vinkit.co/blog/extensions-chrome-vinted-gratuites
- List My Closet : https://www.listmycloset.com/blog/best-crosslisting-app-for-vinted/

**Forums et vidéos**
- vint-aide :
  - https://www.vint-aide.com/t/3616.json
  - https://www.vint-aide.com/t/2009.json
  - https://www.vint-aide.com/t/752.json
  - https://www.vint-aide.com/t/736.json
  - https://www.vint-aide.com/t/4512.json
  - https://www.vint-aide.com/guidelines
  - https://www.vint-aide.com/about.json
- Reddit, archive publique : https://api.pullpush.io/reddit/search/submission/?ids=1sgwt2n,1lrdyry,1wc62ml,1jd80q8,1p8zadc,1iogp9t,1l46zq2,1ngqr48 ; les identifiants 1sibuhy, 1sqp6as, 1spx6yn, 1srzjwy, 1qs93yy, 1tdflzq, 1s08clg et 1tivl7u ; les recherches par sous-forum.
- YouTube :
  - https://www.youtube.com/watch?v=ADD5TpVxXQU
  - https://www.youtube.com/watch?v=DW9_pToYKfg
  - https://www.youtube.com/watch?v=1x5wI8PV4mM
  - https://www.youtube.com/watch?v=MbRjPh2nStE
  - https://www.youtube.com/watch?v=JqcmLWltP_E
  - https://www.youtube.com/watch?v=lmQGKpuIjSU
  - https://www.youtube.com/watch?v=i7xeOMyMTWs
  - pages de résultats YouTube (`hl=fr&gl=FR`)

**Règles**
- Google, politiques anti-spam : https://developers.google.com/search/docs/essentials/spam-policies (mise à jour du 2026-08-28)
- Bercy, note de la Direction des affaires juridiques sur la loi du 9 juin 2023 : https://www.economie.gouv.fr/node/3222759

**Faits concurrents repris** de `briefs/concurrents-matrice.md` (revérifiés le 09/10 entre 15:34
et 15:40, puis entre 17:27 et 17:40) et de `06-mots-cles-en.md` :
- crosslist.com/pricing ; crosslist.com/blog/vinted-cross-listing ;
- help.vendoo.co/eu/en/articles/8856209 ;
- listperfectly.com/faq.
