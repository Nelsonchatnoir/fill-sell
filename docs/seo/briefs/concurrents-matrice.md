# Matrice des concurrents — prête pour les pages comparatives (09/10/2026, mise à jour du soir : Depop)

> **FillSell est notre produit.** Cette matrice sert à écrire les pages `vs-<outil>`, `alternative-<outil>`
> et le classement (PLAN.md § 3). Elle ne se publie pas telle quelle.
> Données structurées : `docs/seo/briefs/concurrents.yml` (15 outils × 16 critères, chaque valeur avec
> sa source, sa date et son niveau ; YAML lisible en `JSON_SCHEMA`, vérifié par `js-yaml`).
> Observé le **2026-10-09**. Lecture du web seule : aucun compte, aucune connexion, aucun formulaire.
> Sources : les 14 fiches `docs/seo/concurrents/*.md` + `00-decouverte.md` ; FillSell :
> `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (références F-xx) **et les décisions de Nico du 09/10,
> qui priment**. Revérifications personnelles le 09/10 : **15:34-15:40** (prix, plateformes, mobile, § 2.1)
> et **17:27-17:40** (Depop chez les 14 outils, § 2.2).

---

## 0. Changements du 09/10 soir (à lire d'abord)

**Ce qui a changé**

1. **Critère « depop » ajouté** pour les 15 outils (`plateformes.depop` dans le YAML : valeur, publication,
   import, retrait, republication, pays, sources, date, niveau ; domaines Depop des extensions en niveau
   `deduit`). Pages officielles des 14 concurrents retéléchargées et relues entre 17:27 et 17:40 ; paquets
   publics de 12 extensions relus (manifestes). Tableau : § 1.3.
2. **Ligne FillSell refaite selon les décisions de Nico** (niveau `decision_nico`) :
   - cinq plateformes : Vinted, Leboncoin, eBay, Beebs, **Depop** (ouverte le 10/10) — publication,
     synchronisation, retrait des copies à la vente, republication ;
   - **republication automatique sur Vinted, Leboncoin, Beebs et Depop, à tous les paliers** ; eBay n'a pas
     de republication (inutile chez eBay) et on n'en parle pas ;
   - **plus aucun chiffre de quota ni de plafond** de FillSell (retirés du YAML et du rapport : le volume
     mensuel d'annonces IA du Gratuit, le décompte par scan, les volumes mensuels de republication par
     palier, le plafond quotidien) ;
   - **Opla retiré** de la ligne FillSell et de tous les tableaux de ce rapport (les bêtas de cette
     plateforme chez StoFlow, FlowDino et Klork restent dans le YAML comme données sources, avec la règle
     « jamais reprise sur le site ») ; plus aucune mention d'Opla ailleurs dans ce rapport.
3. **Classement recalculé** avec les **mêmes critères et les mêmes poids** (Depop compte dans C1 comme
   « autre place de marché ouverte », règle inchangée). Seule FillSell bouge : **86 → 89** (C1 21 → 23 avec
   Depop, C5 9 → 10 avec l'automatique à tous les paliers). Aucune note de concurrent ne change (Depop était
   déjà compté dans leurs « autres »). Le script de calcul redonne à l'identique les chiffres de 15:40 avec
   les anciennes notes (contrôle). Nouvelles variantes : **« Vendeur Depop »** et **« sans Beebs ni
   Depop »** (§ 5.4).
4. **Ton** : § 6.2 ajoute des formules offensives, chacune avec le fait daté qui la porte, et une version de
   repli quand elle dépend de la republication automatique Depop.

**⚠️ Trois décisions ne sont PAS encore dans le code (lu le 09/10 dans le dépôt principal, HEAD `d1b7ac1`,
lecture seule ; la base de production n'a pas été interrogée — `coin_config` fait foi)**

| Décision de Nico | État dans le code au 09/10 | Si c'est encore vrai le jour de la mise en ligne |
|---|---|---|
| Depop ouverte à tous le 10/10 | `depop_ouvert` resté à 0 ; Depop servie au seul compte bêta de Nico (migration `20261009020000`) ; extension 0.6.105 à téléverser | ne pas publier Depop ; FillSell 89 → 87 |
| Republication automatique à tous les paliers | la passe planifiée arrête les comptes hors Pro et Business (`IF v_palier NOT IN ('pro', 'business')`, migration `20261008140000`) ; fiche de vérité F39 : Pro et Business | ne pas écrire « tous les paliers » ; FillSell → 88 (86 si Depop n'est pas ouverte non plus) |
| Republication automatique Depop (« avec la bascule ») | `republish_planifiee_plateformes()` ne contient pas Depop ; la migration Depop dit « la republication Depop est manuelle » | **pas encore active** : garder le texte prêt, prendre les formules de repli |

**Le geste unique pour Depop dans la republication automatique** : retirer `depop` de
`outils[fillsell].criteres.republication.plateformes_auto` dans le YAML ; dans ce rapport, chaque passage qui
en dépend porte la marque **[R-DEPOP]** (`grep -n "R-DEPOP"`) et le § 6.2 donne sa version de repli. **Aucun
score ne change** : C5 ne compte que Vinted et Leboncoin.

---

**Niveaux** (colonne `niveau` du YAML) : `verifie` = lu sur une page officielle de l'éditeur ou sa fiche de
store ; `deduit` = manifeste d'extension, code servi, calcul (pas une promesse de l'éditeur) ;
`non_verifiable` = sans compte, ou pages officielles contradictoires ; `fiche_de_verite` = FillSell (code +
prod) ; `decision_nico` = FillSell, décision du 09/10 à constater en production le jour de la mise en ligne.
Les chiffres des éditeurs (utilisateurs, délais, précision) sont leurs propres affirmations.

---

## 1. La matrice en un coup d'œil

### 1.1 Plateformes et forme

| Outil | Vinted | Leboncoin | eBay | Beebs | Depop | Autres | App native | Extension | Départ | Ordinateur éteint |
|---|---|---|---|---|---|---|---|---|---|---|
| **FillSell** (F-xx + décisions) | France | oui | eBay.fr (API si relié) | **oui** | **oui, depuis la France** (10/10) | — | **iOS + Android** | Chrome (CWS) | téléphone ou web ; l'extension exécute | eBay relié seulement |
| StoFlow | oui (France déduite) | oui | eBay France dès Starter ; 9 pays en Business | non | non annoncé (domaines au manifeste) | Vestiaire, Etsy (+ AbeBooks bêta) | non (« en cours ») | Chrome, Firefox, Edge, Brave | web (ordi ; téléphone en Pro) | **oui en Pro** (cloud) |
| FlowDino | oui (23 domaines au manifeste) | oui | oui (fenêtre eBay) | **oui** (« stable », facturé depuis le 1/10) | **non** (renvoie Depop aux outils américains) | Etsy, Vestiaire (+ Whatnot bêta) ; Shopify, Woo, PrestaShop | non | Chrome | ordinateur | non |
| Flypr ¹ | oui | oui | oui | non | non | Grailed, Selency, Vestiaire | non | .zip hors CWS | web, publication sur l'ordi | non |
| Klork | source (pas de publication vers Vinted) | oui | ebay.fr | annoncé, activé par compte | **oui** (guide) | Vestiaire (+ Whatnot, Grailed) | non | Chrome | ordinateur | non (« Bientôt ») |
| Redrip | oui (~25 pays) | oui (France) | non | non | non (« pas eBay ni Depop ») | — | non | Chromium | ordinateur | non |
| FLUF Connect | 19 pays dont FR | crosslisting seul (le reste contradictoire) | 17+ sites dont FR | non | **oui, complet** (pays non précisé) | 60+ annoncées | **iOS + Android** (fiche App Store en anglais) | Chrome | téléphone ou ordi | partiel (eBay, Depop, Etsy, Shopify ; relist Vinted depuis l'app) |
| Crosslist | **fermé aux nouveaux comptes** ; jamais l'UE | non | .com/.co.uk/.ca/.com.au | non | oui, **hors UE** | 10 places de marché US | iOS + Android, **absente en France** | Chrome | les deux | partiel (API) |
| Clemz ² | oui (26 domaines) | non | non | non | non | — | non | Chrome | ordinateur ou Android (Quetta) | non |
| Reposter | option payante à prix non public | **cœur** | non | non | non | — | non (PWA) | **aucune** (serveur) | navigateur | **oui** (identifiants confiés) |
| Relistly | oui (Europe) | **« coming soon »** | API (FR non nommé) | non | **oui, 24 pays européens** | 13 places de marché européennes | non (PWA) | .zip / CWS 39 utilisateurs | ordinateur | eBay seulement |
| DressKare | oui | non (« Bientôt ») | non | non | non | boutique Shopify | non (PWA) | Chrome | téléphone + ordi | non |
| Vendoo | **non** | non | eBay (.com) | non | oui, **États-Unis** | 10 places de marché US | iOS + Android, **absente en France** | Chrome | ordinateur pour démarrer | eBay/Etsy (API) |
| List Perfectly | vinted.com « Lite » | non | eBay US | non | **Depop US seulement** | 14 places de marché US | non | Chrome, Edge | ordinateur | non |
| Margeo | ne publie pas | ne publie pas | ne publie pas | non | ne publie pas | — | non (PWA) | non | les deux | sans objet |

¹ correspondance probable de « Flipper » (≈ 65 %). ² correspondance probable de « CleanZ » (≈ 70 %). Voir § 4.

### 1.2 Fonctions comparables

| Outil | IA photo → annonce | Import du stock en ligne | Regroupement d'un même article | Retrait auto des copies | Republication | Stock / marges |
|---|---|---|---|---|---|---|
| **FillSell** | objet, marque, état, **prix (annonces comparables)**, titre, description ; tous paliers | Vinted, LBC, eBay, Beebs, **Depop** sur « Synchroniser », sans quota | **auto (photos ET titre), doute = question** | tous forfaits ; vente seule sur Vinted, eBay et Depop, confirmée d'un appui sur LBC/Beebs ; copies prouvées, sinon « Déjà vendu ? » | manuelle et **automatique par créneaux, à tous les paliers** ; Vinted, LBC, Beebs, Depop [R-DEPOP] | stock sans limite, marge (prix d'achat inconnu exclu), Excel |
| StoFlow | détourage, reconnaissance, titre, description, prix ; rédaction affichée en Pro/Business | Vinted, LBC, eBay, Etsy | à la main (« non liées ») | dès Free, auto ou après feu vert | auto dès Pro (Vinted, LBC, 200/jour) | 100 à 2 000 produits ; compta FEC (Pro+) |
| FlowDino | titre, description, mannequin, fond ; **pas de prix** | Vinted, LBC, eBay, Etsy (borné) | non décrit | par l'extension ; annonces publiées avec FlowDino | tâches planifiées | ventes, bénéfice net ; 50 à 15 000 articles |
| Flypr | annoncée, contradictoire | CSV | non décrit | **non annoncé** | Vinted seul | profit, fiscalité FR |
| Klork | non ouverte (Studio dans le code) | dressing Vinted ; Depop et autres annoncés (contradictoire) | par identifiant Vinted | **Business (35 €)** seulement ; Depop compris | manuelle (Pro/Business), Depop compris ; auto « Bientôt » | marges par plateforme |
| Redrip | non (IA de texte) | lecture locale au navigateur | lien au transfert | Vinted ↔ LBC, auto | **auto 24/7 dès le gratuit** (Vinted, LBC) | non |
| FLUF | marque, catégorie, état, titre, description, fourchette de prix (anglais par défaut) | oui, tous canaux, Depop compris | **par photos, avec confirmation** | 60-90 min ; LBC contradictoire | auto dès Pro (Vinted, Depop… ; pas LBC) | profit, Xero/QuickBooks |
| Crosslist | option 4,99 $ : titre, description, prix | oui | titre + image, décochable | Gold/Diamond (39,99 $+) ; Depop par le cloud | manuelle | Gold/Diamond |
| Clemz | non (« Bientôt ») | dressing Vinted | sans objet | sans objet | manuelle, fonction phare | compta, factures ; pas de marge |
| Reposter | non | LBC | groupe LBC → Vinted | non documenté | LBC, multi-villes | audience seulement |
| Relistly | annoncée (titres, descriptions, prix) | oui, Depop compris | non décrit | tous paliers ; annonces publiées par Relistly | auto dès Growth (29 €) ; Depop non nommé | marge en Growth |
| DressKare | oui dès Actif (19 €), prix inclus | Vinted, Excel, Shopify | sans objet | Shopify ↔ Vinted seulement | auto dès Éco | compta URSSAF/TVA |
| Vendoo | texte → champs (Growth+) ; pas de prix | oui (BETA pour fusionner) | BETA | BETA, 5-6 plateformes US (Depop compris) | manuelle | analytique |
| List Perfectly | 1 à 6 photos → titre, description ; pas de prix | eBay, Mercari, Poshmark | Smart Import (bêta), revue humaine | Pro Plus (99 $+) | manuelle | SKU, analytics |
| Margeo | non | ventes Vinted (CSV) | sans objet | non | non | **cœur** (fiscalité FR) |

### 1.3 Depop chez les 14 outils (relu le 09/10, 17:27-17:40)

| Outil | Depop | Publication | Import | Retrait après une vente | Republication | Pays / accès depuis la France | Niveau | Source principale |
|---|---|---|---|---|---|---|---|---|
| **FillSell** | **oui** (ouverte le 10/10) | oui (extension) | oui (« Synchroniser ») | oui : vente lue sur Depop = copies retirées ; vente ailleurs = annonce Depop retirée | manuelle ; automatique avec la bascule [R-DEPOP] | France, euros | decision_nico | décision de Nico ; `docs/plateformes/depop/CARTOGRAPHIE.md` § 8 (dépôt principal) |
| FLUF Connect | **oui, complet** | oui | oui (Inventory Sync) | oui (Order Sync ; 60-90 min selon le plan) | **auto dès Pro (29 £)** | non précisé ; navigateur inutile une fois connecté | verifie | fluf.io/integrations/ ; /support/connect-depop/ |
| Klork | **oui** | oui (guide « Publier sur Depop ») | annoncé (non vérifiable) | détection des pages Vendues puis « Depop → suppression » ; auto en Business (35 €) | « Relister » manuel ; auto « Bientôt » | aucun pays nommé ; interface Depop en français prise en charge | verifie (code servi) | klork.app/guides/publier-depop ; /vendu-et-maintenant ; /relister |
| Relistly | **oui** | oui | oui | oui, ~15 min, annonces publiées par Relistly | « auto-relist » en Growth (29 €), Depop non nommé | **24 pays européens** | verifie | relistly.io/integrations/depop ; /pricing |
| Crosslist | oui, **hors UE** | oui | oui | cloud, Gold/Diamond (39,99 $+) | manuelle | US, UK, CA, AU ; « we do not support users residing in the European Union » | verifie | crosslist.com/pricing ; docs…/autodelist ; docs…/uk-canada-australia |
| Vendoo | oui, **États-Unis** | oui | oui | BETA, onglet ouvert | manuelle | États-Unis (+ section UK) ; app absente en France | verifie | help.vendoo.co (6260300, 8047348) ; vendoo.co/pricing |
| List Perfectly | **Depop US seulement** | oui (US) | oui (US) | Pro Plus (99 $+) | manuelle | « Depop UK and other regional versions are not supported » | verifie | listperfectly.com/faq/ |
| StoFlow | **non annoncé** | — | — | — | — | — (`/pour/depop` = 404 ; www.depop.com et webapi.depop.com déclarés par l'extension 1.54.0, rôle inconnu) | verifie (+ deduit) | stoflow.com/pricing ; /sitemap.xml ; manifeste |
| FlowDino | **non** | — | — | — | — | son comparatif : « si vous vendez principalement sur […] Depop, les solutions américaines couvrent mieux ces plateformes » | verifie | flowdino.com/blog/meilleur-logiciel-crosslisting-2026 |
| Redrip | **non** | — | — | — | — | « Redrip couvre Vinted et Leboncoin […] mais pas eBay ni Depop » | verifie | redrip.app/blog/vinted-bot-meilleurs-outils-2026/ |
| Flypr | non | — | — | — | — | « Six plateformes » sans Depop | verifie | flypr.app/faq |
| Clemz | non | — | — | — | — | Vinted seulement | verifie | clemz.app/documentation/faq |
| Reposter | non | — | — | — | — | 0 occurrence | verifie | reposter.io |
| DressKare | non | — | — | — | — | « Multiplateformes : Bientôt » | verifie | dresskare.com/prix |
| Margeo | ne publie pas | — | — | — | — | Depop cité comme public visé, sans fonction | verifie | margeoapp.com/pricing.md |

**À retenir** : pour un revendeur **qui réside en France**, seuls **FillSell, FLUF, Klork et Relistly**
gèrent Depop. Crosslist, Vendoo et List Perfectly gèrent Depop, mais ne servent pas la France (UE refusée,
États-Unis, Depop US seulement). Parmi les quatre, **FillSell est le seul qui fait aussi Leboncoin complet
et Beebs** ; FLUF fait Depop plus profondément (offres, commandes, sans ordinateur) mais n'a ni Beebs ni
Leboncoin complet ; Klork ne publie pas vers Vinted ; Relistly n'a ni Leboncoin ni Beebs.

### 1.4 Prix (relus le 09/10) et accès

| Outil | Paliers mensuels (devise) | Annuel | Gratuit / essai |
|---|---|---|---|
| **FillSell** | Gratuit 0 · Premium 12,99 · Pro 29,99 · Business 59,99 (EUR) | non | Gratuit permanent sans carte ; pas d'essai |
| StoFlow | Free 0 · Starter 14,99 · Pro 29,99 · Business 79,99 (EUR TTC) | 12,5 / 25 / 66,67 | Free permanent ; pas d'essai ; 14 j remboursés |
| FlowDino | **par site** : 7,99 · 14,99 · 29,99 · 44,99 (EUR) ; FAQ : « 19,99 / 49,99 » (contradiction) | « jusqu'à -20 % » | 14 jours sans carte |
| Flypr | 0 · 6,90 · 12,90 · 29,90 (EUR) | -20 % | gratuit à vie ; 1 mois offert |
| Klork | 0 · 15 · 35 · 69 « Bientôt » (EUR) | 150 / 350 / 690 € par an | gratuit permanent ; pas d'essai |
| Redrip | 0 · 5,99 · 11,99 · 19,99 (EUR) | 4,99 / 9,99 / 16,66 | gratuit permanent |
| FLUF | 9 £ · 29 £ · « Custom » (GBP ; App Store FR : 9 €, 29 €, 349 €) | 59 £ / 199 £ par an | 7 jours pour 1 £ ; pas de gratuit |
| Crosslist | 29,99 · 34,99 · 39,99 · 44,99 (USD) + IA 4,99 $ | 2 mois offerts | « 20 free listings », remboursé 3 jours |
| Clemz | 8,99 · 14,99 · 24,99 · 34,99 (49,99 barré) (EUR) | -16 % | 1 mois d'essai ; pas de gratuit |
| Reposter | crédits : 10 € (10) · 20 € (50) · 30 € (100) · 50 € (500) | non | 10 publications offertes |
| Relistly | 14 · 29 · 49 · 89 « coming soon » (EUR) | 11 / 24 / 41 | 14 jours sans carte |
| DressKare | 9,90 · 19 · 39 · 69 (EUR TTC) | non vu | 7 jours sans carte |
| Vendoo | 14,99 · 29,99 · 59,99 (USD) | 12,49 / 24,99 / 49,99 | 14 jours, **carte exigée** |
| List Perfectly | 29 · 49 · 69 · 99 / 149 / 249 (USD) | non | contradictoire (« 100 free listings » / « No ») |
| Margeo | 0 · 7,99 · 19,99 (EUR) | 69 € / an (Pro) | 15 jours sur Pro mensuel, carte requise |

### 1.5 Notes publiques (relues le 09/10, 15:36, sauf mention)

| Outil | Chrome Web Store | Stores mobiles | Trustpilot |
|---|---|---|---|
| **FillSell** | 5,0 (1 avis), 360 utilisateurs | App Store FR 5,0 (3 notes) ; Play 500+ | non relevé |
| StoFlow | 3,2 (6), 175 | — | aucune page |
| FlowDino | 5,0 (6), 326 | — | aucune page (JSON-LD du site : 4,8/150 sans source) |
| Klork | 5,0 (3), 585 | — | aucune page |
| Redrip | 4,4 (26), 1 000 | — | 0 avis |
| FLUF | 4,5 (10), 1 000 | App Store GB 5,0 (10), FR 0 ; Play 5,0 (10), 1 k+ | 4,6 (33) |
| Crosslist | 4,0 (30), 20 000 | App Store US 4,7 (382) ; Play 4,2 (114) | 4,5 (1 114) |
| Clemz | 4,8 (147), 10 000 | — | aucune page |
| Relistly | aucune note, 39 | — | 2 avis (3,8) |
| DressKare | 4,6 (11), 971 | Shopify 5,0 (5) | 0 avis |
| Vendoo | 3,5 (70), 70 000 | App Store US 4,5 (2 830) ; Play 4,2 (749) | 4,2 (242) |
| List Perfectly | 4,1 (22), 9 000 + bêta 4,4 (29), 4 000 | — | non vérifiable |
| Flypr, Reposter, Margeo | aucune fiche | — | 404 / 404 / 0 avis |

Règle de publication : jamais de note dans le JSON-LD (ARCHITECTURE.md § 5) ; dans le texte, toujours avec
le nombre d'avis et la date. Les échantillons de FillSell (1 avis CWS, 3 notes App Store) ne permettent
aucune comparaison de qualité.

---

## 2. Revérifications du 09/10

### 2.1 15:34-15:40 — ce qui portera les comparaisons

| Fait | Résultat | Source relue |
|---|---|---|
| StoFlow : plateformes par plan (Free Vinted + LBC ; Starter + eBay France ; Pro + Vestiaire ; Business + eBay 9 pays, Etsy, AbeBooks bêta), prix 0 / 14,99 / 29,99 / 79,99 € TTC, annuel 12,5 / 25 / 66,67 € | **confirmé** | https://stoflow.com/pricing |
| StoFlow : eBay « disponible à partir du plan Starter », OAuth | **confirmé** | https://stoflow.com/pour/ebay |
| StoFlow : app mobile « en cours de construction », non publiée ; App Store FR : 0 résultat | **confirmé** | https://stoflow.com/docs/aide/faq ; API iTunes |
| StoFlow : Beebs absent ; pas d'essai sur les plans payants | **confirmé** (0 occurrence sur 3 pages) | idem |
| FlowDino : Beebs dans le titre, la FAQ, le JSON-LD ; bandeau « Beebs est maintenant stable, il sera facturé à partir du 1/10 » | **confirmé** (accueil et /pricing) | https://www.flowdino.com/ ; /pricing |
| FlowDino : prix par site 7,99 / 14,99 / 29,99 / 44,99 € ; « Premium 19,99 / Pro 49,99 » dans la FAQ de l'accueil | **confirmé, contradiction toujours en ligne** | idem |
| FlowDino : aucune app (App Store FR 0) | **confirmé** | API iTunes |
| Flypr : 6 plateformes, 6,90 / 12,90 / 29,90 €, « app mobile native sur la roadmap » | **confirmé** | https://flypr.app/pricing ; /faq |
| Flypr : activité — sitemap 131 URL au 2026-04-18 ; API `…railway.app` : 404 « Application not found » | **confirmé à 15:38** (pas une preuve de fermeture) | https://flypr.app/sitemap.xml |
| Flypr : absent du Chrome Web Store | **non revérifiable par moi** (résultats de recherche chargés en JavaScript) ; repris de la fiche | https://chromewebstore.google.com/search/flypr |
| Klork : 15 / 35 / 69 € ; prix de lancement 12 / 29 € terminé le 01/10/2026 ; Beebs activé par compte | **confirmé** dans le code servi (page rendue en JS) | https://klork.app/assets/index-BPuJ8r4x.js |
| Redrip : 0 / 5,99 / 11,99 / 19,99 € ; ni eBay ni Beebs sur l'accueil | **confirmé** | https://www.redrip.app/ |
| FLUF : 9 £ / 29 £ / Custom, « 7 days for £1 » ; Leboncoin = crosslisting seul dans le tableau ; Beebs absent | **confirmé** | https://fluf.io/pricing/ ; /integrations/ |
| FLUF : app iOS présente sur l'App Store FR (v2.9, 0 note, langue EN) | **confirmé** | API iTunes (lookup FR) |
| FLUF : « FLUF Connect is the only crosslisting tool that supports both Vinted and Leboncoin » | **confirmé, toujours en ligne** | https://fluf.io/crosslisting/vinted-to-leboncoin/ |
| **Crosslist arrête Vinted pour les nouveaux inscrits** : billet « Why We're Discontinuing Vinted for New Users (Existing Users Stay) », daté du 2026-10-02 | **confirmé** | https://crosslist.com/ai-info ; https://crosslist.com/blog/vinted-cross-listing |
| Crosslist : « we do not support users residing in the European Union » ; app absente de l'App Store FR | **confirmé** (relu à nouveau entre 17:27 et 17:40) | https://crosslist.com/pricing ; API iTunes |
| Crosslist : pas de formule gratuite | **précisé** : « get 20 free listings with our 3-day money-back guarantee » | https://crosslist.com/pricing |
| Clemz : 8,99 / 14,99 / 24,99 / 34,99 € (49,99 barré), essai 1 mois | **confirmé** | https://www.clemz.app/fr/pricing |
| Reposter : 10 € / 20 € / 30 € / 50 € pour 10 / 50 / 100 / 500 crédits ; ni eBay ni Beebs | **confirmé** | https://reposter.io/ |
| Relistly : 14 / 29 / 49 € (Business 89 € « coming soon »), essai 14 jours ; Leboncoin « coming soon » ; Beebs absent | **confirmé** | https://relistly.io/pricing ; /integrations/leboncoin ; /llms.txt |
| DressKare : 9,90 / 19 / 39 / 69 € ; « Multiplateformes : Bientôt » | **confirmé** | https://dresskare.com/prix |
| Vendoo : 10 plateformes, Vinted absent de l'aide ; 14,99 / 29,99 / 59,99 $ ; essai avec carte ; app absente en France | **confirmé** | https://help.vendoo.co/en/articles/6260300-… ; /pricing ; API iTunes |
| List Perfectly : 29 / 49 / 69 / 99+ $ ; « Vinted (LITE) » ; « supports U.S. marketplaces only » | **confirmé** | https://listperfectly.com/pricing ; /faq/ |
| Margeo : « ne publie pas et ne synchronise pas automatiquement les annonces » ; 0 / 7,99 / 19,99 € | **confirmé** | https://margeoapp.com/llms.txt ; /tarifs/ |
| Chrome Web Store, les 13 fiches ; App Store (FR/US) | **confirmés** | fiches CWS ; API iTunes |
| Trustpilot, Google Play, Firefox Add-ons, Shopify App Store | **non revérifié** (repris des fiches du même jour) | — |

### 2.2 17:27-17:40 — Depop

| Fait | Résultat | Source relue (le 2026-10-09) |
|---|---|---|
| FLUF : ligne Depop du tableau des capacités = Crosslisting, Inventory Sync, Auto-Relisting, Offer Management, Order Sync « Yes » | **confirmé** | https://fluf.io/integrations/ |
| FLUF : « Automated relisting is available on Depop, Designer Wardrobe, eBay, Etsy… — included from Pro upwards » | **confirmé** | https://fluf.io/integrations/ |
| FLUF : Depop se connecte depuis le téléphone ; « You do not need to keep a browser open after connecting » | **confirmé** | https://fluf.io/support/browser-extension-help/ ; /support/connect-depop/ |
| Klork : guide « Publier sur Depop » ; « Klork scanne les pages Vendues de Depop, eBay, Leboncoin et Vestiaire […] tu confirmes toujours avant » ; « Depop → suppression » ; « Relister » sur Depop | **confirmé** dans le code servi | https://klork.app/assets/GuidesPage-D1dY1zKN.js (pages /guides/publier-depop, /vendu-et-maintenant, /relister) |
| Klork : « Klork sauvegarde depuis Vinted, Leboncoin, eBay, Depop, Vestiaire Collective… » | **confirmé** (annonce ; usage non vérifiable) | https://klork.app/assets/LandingPage-w6A9IekR.js |
| Relistly : « connects Depop for sellers in 24 European countries, imports your existing Depop listings […] with auto-delisting » | **confirmé** | https://relistly.io/integrations/depop |
| Crosslist : Depop « Cloud-based » dans l'auto-delist ; Depop .com dans les 4 pays servis ; UE refusée | **confirmé** | docs.crosslist.com (autodelist ; uk-canada-australia) ; crosslist.com/pricing |
| Vendoo : « Sale Detection and Auto Delisting for Poshmark, eBay, Mercari, Depop, Whatnot, and Etsy » | **confirmé** | https://www.vendoo.co/pricing ; help.vendoo.co/…8047348 |
| List Perfectly : « Depop U.S. is supported » / « Depop UK and other regional versions are not supported » | **confirmé** | https://listperfectly.com/faq/ |
| Redrip : « Redrip couvre Vinted et Leboncoin, dans les deux sens, mais pas eBay ni Depop » | **confirmé** | https://www.redrip.app/blog/vinted-bot-meilleurs-outils-2026/ |
| FlowDino : 0 occurrence de Depop (accueil, /faq, /pricing, llms.txt) ; son comparatif renvoie Depop aux « solutions américaines » | **confirmé** | flowdino.com ; /blog/meilleur-logiciel-crosslisting-2026 |
| StoFlow : 0 occurrence de Depop (accueil, /pricing, FAQ, plan du site) ; /pour/depop = 404 | **confirmé** | stoflow.com |
| Flypr, Clemz, Reposter, DressKare : 0 occurrence de Depop sur les pages officielles relues | **confirmé** | voir YAML |
| Margeo : Depop cité comme public (« pour les vendeurs […] Depop »), aucune fonction | **confirmé** | https://margeoapp.com/pricing.md |
| Manifestes (paquets publics) : `depop.com` déclaré par StoFlow 1.54.0, Klork 2.3.531, FLUF 2.356, Crosslist 3.11.51, Relistly 1.3.14, Vendoo 3.1.10, List Perfectly 1.0.188.2 ; absent de FlowDino 1.4.13, Redrip 11.999.173, Clemz 1.32.1, DressKare 0.1.325, Flypr 1.4.1 | **deduit** | paquets du Chrome Web Store ; flypr.app/flypr-extension.zip |

**Aucune contradiction** avec les fiches du matin sur Depop. Seul fait nouveau : la phrase de List Perfectly
(Depop US seulement) et le renvoi de FlowDino vers les outils américains.

---

## 3. Outil par outil

Pour chaque outil : ce qu'il fait bien · ce que FillSell fait et pas lui · ce qu'il fait et pas FillSell.
Faits comparables seulement ; le détail sourcé est dans le YAML.

### StoFlow — stoflow.com (Stokode SARL, 77)
- **Fait bien** : 7 marketplaces avec une grille claire par plan (eBay 9 pays, Vestiaire, Etsy) ; **mode
  cloud livré en Pro** (Vinted, LBC, Vestiaire ordinateur éteint, pilotable du téléphone) ; Free utile
  (Vinted + LBC, 100 produits, retrait après vente inclus), annuel, 14 j remboursés.
- **FillSell et pas lui** : apps iOS/Android publiées ; **Beebs et Depop** (StoFlow : ni l'un ni l'autre
  annoncé) ; eBay dès le Gratuit ; stock sans limite d'articles ; regroupement automatique (StoFlow : liaison
  à la main) ; republication automatique sur Leboncoin, Beebs et Depop [R-DEPOP], sans palier requis
  (StoFlow : Vinted et LBC, à partir de Pro) ; app FR + EN.
- **Lui et pas FillSell** : Vestiaire, Etsy, eBay hors France ; ordinateur éteint pour Vinted/LBC ;
  Firefox ; prix annuels ; messagerie IA, FEC, plusieurs comptes par marketplace.
- **À surveiller** : son extension déclare déjà `www.depop.com` et `webapi.depop.com` (rôle inconnu) — Depop
  peut arriver chez StoFlow sans préavis : revérifier avant toute phrase « StoFlow ne fait pas Depop ».
- **Concurrent éditorial n° 1** sur « crosslisting » en français (comparatif de 13 outils sans FillSell).

### FlowDino — flowdino.com (entrepreneur individuel, 02)
- **Fait bien** : la couverture la plus large vue en France côté sites français, **Beebs compris** ; modules
  Shopify/WooCommerce/PrestaShop ; IA visuelle dès le gratuit, essai 14 j sans carte.
- **FillSell et pas lui** : apps mobiles ; **Depop** (FlowDino : non, et son propre comparatif envoie les
  vendeurs Depop vers les outils américains) ; prix proposé par l'IA ; eBay par l'API ; import gratuit sans
  limite ; regroupement ; retrait des copies importées prouvées ; un forfait pour toutes les plateformes.
- **Lui et pas FillSell** : Etsy, Vestiaire (+ Whatnot bêta) ; Vinted hors France (manifeste, déduit) ;
  modules boutique ; mannequin/fond dès le gratuit ; échange de vues, réponses aux favoris, bordereaux ;
  essai, annuel, 7,99 € pour un seul site.
- **Attention** : FillSell **n'est pas seul** sur Beebs. Ne jamais écrire « le seul outil Beebs ».

### Flypr — flypr.app (dicté « Flipper », ≈ 65 %)
- **Fait bien** : contenu FR très fourni (fiscalité, URSSAF, DAC7) ; Grailed, Selency, Vestiaire ; prix bas.
- **FillSell et pas lui** : apps mobiles et extension sur le Chrome Web Store ; Beebs et Depop ; retrait des
  copies ; reprise des annonces en ligne ; republication LBC, Beebs et Depop ; activité démontrée.
- **Lui et pas FillSell** : Grailed, Selency, Vestiaire ; fiscalité FR intégrée ; 6,90 € d'entrée.
- **Statut** : hors classement (activité non démontrée).

### Klork — klork.app (micro-entreprise, 33)
- **Fait bien** : plateformes de mode (Depop et Vestiaire documentés, guides détaillés : SKU natif Depop,
  boost « Promote ») ; 1 article = 1 crédit ; page sécurité qui dit ce que l'outil refuse.
- **FillSell et pas lui** : apps mobiles ; départ depuis une photo ; publication sur Vinted ; eBay par
  l'API ; retrait auto dans tous les forfaits (Klork : Business 35 €) ; **republication automatique, Depop
  compris** [R-DEPOP] (Klork : « Bientôt », plan Entreprise à 69 €).
- **Lui et pas FillSell** : Vestiaire (+ Whatnot, Grailed annoncés) ; multi-comptes Vinted dès le gratuit ;
  offres aux intéressés (Depop compris), messagerie centralisée ; annuel ; MCP.
- **Depop des deux côtés** : Klork est le concurrent le plus proche de FillSell **sur l'ensemble Vinted +
  Leboncoin + eBay.fr + Beebs + Depop** — mais Vinted n'y est qu'une source et Beebs s'active compte par
  compte. Ne pas écrire « Klork n'a pas Depop » ni « Klork n'a pas Beebs ».

### Redrip — redrip.app (développeur indépendant)
- **Fait bien** : prix d'entrée le plus bas (gratuit permanent, 5,99 €) ; transfert Vinted ↔ LBC dans les
  deux sens avec retrait auto ; automatisation Vinted complète.
- **FillSell et pas lui** : **eBay, Beebs et Depop** (« pas eBay ni Depop », dit Redrip) ; apps mobiles ; IA
  photo avec prix ; stock hébergé ; regroupement d'annonces publiées sans l'outil ; marges.
- **Lui et pas FillSell** : Vinted dans 20+ pays ; offres et messages aux favoris, réponses IA en 9 langues ;
  site en 8 langues ; 5,99 €. Republication automatique dans le gratuit : **égalité** seulement si celle de
  FillSell est bien ouverte à tous les paliers à la mise en ligne, sinon avantage Redrip.
- **Fait utile** : le comparatif de Redrip renvoie le crosspost « Vinted + eBay + Depop » vers Crosslist —
  qui ne sert pas les résidents de l'UE.

### FLUF Connect — fluf.io (FLUF LTD, Londres)
- **Fait bien** : **le modèle le plus proche de FillSell** (app native + extension) ; couverture très large
  et datée ; **Depop complet** (synchro, commandes, offres, republication automatique, sans ordinateur une
  fois connecté) ; doublons regroupés par photos avec confirmation ; Trustpilot 4,6 (33).
- **FillSell et pas lui** : Beebs ; Leboncoin complet (import, retrait, republication) ; **republication
  automatique sur Leboncoin et Beebs en plus de Vinted et Depop** [R-DEPOP], sans palier requis (FLUF : à
  partir de Pro, 29 £, et jamais Leboncoin) ; gratuit permanent ; prix en euros ; français de bout en bout.
- **Lui et pas FillSell** : dizaines de plateformes, Vinted 19 pays, eBay 17+ sites ; Depop et une partie
  du travail sans ordinateur ; offres, Xero/QuickBooks, API ; 9 £ d'entrée ; preuve publique.
- **Positionnement** : « l'app de crosslisting pilotée depuis le téléphone » n'est **pas exclusive** à
  FillSell. Ce qui l'est (vu le 09/10) : **app native + extension + Vinted France, Leboncoin complet,
  eBay.fr, Beebs et Depop, en français et en euros**.

### Crosslist — crosslist.com (Crosslist BV, Belgique)
- **Fait bien** : documentation franche ; architecture API/cloud + extension (Depop par le cloud) ; apps
  natives ; forte preuve sociale.
- **FillSell et pas lui** : servir un résident de France ; Vinted France, LBC, Beebs, eBay.fr, **Depop depuis
  la France** ; gratuit, euros, français ; app sur l'App Store FR ; republication automatique.
- **Lui et pas FillSell** : places de marché US/UK ; création en lot par IA ; détection cloud.
- **Fait daté à utiliser** : Vinted fermé aux nouveaux comptes (02/10/2026), UE non servie. Base de la page
  `alternative/crosslist`.

### Clemz — clemz.app (dicté « CleanZ », ≈ 70 %)
- **Fait bien** : profondeur Vinted ; 10 000 utilisateurs, 4,8 sur 147 avis ; livraisons fréquentes.
- **FillSell et pas lui** : crosslisting (LBC, eBay, Beebs, Depop) et retrait des copies ; apps mobiles ; IA
  photo ; gratuit permanent ; marges ; republication automatique.
- **Lui et pas FillSell** : offres, messages aux favoris ; factures PRO, CRM ; 1 à 10 dressings ; 5 langues.
- **Statut** : hors classement crosslisting.

### Reposter — reposter.io (éditeur non identifié aujourd'hui)
- **Fait bien** : exécution serveur (ordinateur éteint) ; profondeur Leboncoin ; assistant de messagerie.
- **FillSell et pas lui** : eBay, Beebs, Depop, Vinted sans option ; **aucun mot de passe confié** (Reposter
  demande e-mail, mot de passe, téléphone — à écrire tel qu'il le documente, sans qualifier de risque) ;
  apps mobiles ; IA photo ; retrait documenté ; ventes, marges.
- **Lui et pas FillSell** : ordinateur éteint, LBC compris ; multi-villes ; réponse aux acheteurs.

### Relistly — relistly.io (Paid In Full Dev., Amsterdam)
- **Fait bien** : 18 places de marché annoncées, 13 en service, **Depop dans 24 pays européens** ;
  transparence sur Leboncoin (« coming soon ») ; offre simple, essai 14 j.
- **FillSell et pas lui** : Leboncoin ; Beebs ; apps mobiles ; retrait des copies importées ; regroupement ;
  gratuit permanent ; republication automatique sans palier requis (Relistly : Growth, 29 €).
- **Lui et pas FillSell** : 13 places de marché, Vinted et Depop multi-pays ; annuel, essai ; outils gratuits.
- **À contredire par un fait** : « no competitor covers Leboncoin either » (relistly.io/integrations/leboncoin).

### DressKare — dresskare.com (Lyon)
- **Fait bien** : dépôt-vente de bout en bout ; centre d'aide honnête ; connecteur Shopify.
- **FillSell et pas lui** : crosslisting LBC/eBay/Beebs/Depop avec retrait ; apps mobiles ; gratuit.
- **Lui et pas FillSell** : dépôt-vente, sourcing, formation ; Shopify ; compta URSSAF/TVA ; mannequins IA.

### Vendoo — vendoo.co (Vendoo, Inc., États-Unis)
- **Fait bien** : acteur mûr, app US très notée ; Depop avec détection des ventes (BETA).
- **FillSell et pas lui** : Vinted, LBC, Beebs, eBay.fr ; **Depop depuis la France, en euros** ; app sur
  l'App Store FR ; français, gratuit ; IA photo avec prix ; republication automatique.
- **Lui et pas FillSell** : places de marché US ; republication en lot de 240, multi-quantité, vidéos.

### List Perfectly — listperfectly.com (États-Unis)
- **Fait bien** : catalogue US large ; Smart Import avec revue humaine ; illimité dans toutes les formules.
- **FillSell et pas lui** : la France (Vinted FR, LBC, Beebs, eBay.fr) ; **Depop hors États-Unis** (« Depop
  UK and other regional versions are not supported ») ; apps mobiles ; retrait auto dans tous les forfaits ;
  gratuit, euros, français.
- **Lui et pas FillSell** : places de marché US ; code-barres, SKU, étiquettes QR, sous-comptes.

### Margeo — margeoapp.com (micro-entrepreneur)
- **Fait bien** : profondeur sur l'argent ; honnêteté (« ne publie pas ») ; hors ligne.
- **FillSell et pas lui** : publier, republier, retirer sur Vinted, Leboncoin, eBay, Beebs, Depop ; reprendre
  les annonces ; IA photo ; apps mobiles.
- **Lui et pas FillSell** : fiscalité (micro-BIC, ACRE, DAC7, TVA), factures, simulateur, hors ligne, 7,99 €.
- **À contredire par un fait daté** : « Aucun outil ne crossliste Vinted + Leboncoin de façon officielle et
  conforme aux CGU » (comparatif du 2026-10-05) — la publication existe ; la question des CGU ne se tranche
  pas dans nos pages.

---

## 4. Incertitude de correspondance (noms dictés par Nico)

| Dicté | Retenu | Certitude | Autres pistes | Conséquence |
|---|---|---|---|---|
| « Flipper » | **Flypr** (flypr.app) | **≈ 65 %** | Flyp (joinflyp.com, ≈ 20 %) ; FlipPulse (≈ 10 %) | Ne pas publier `vs-flypr` avant confirmation par Nico. |
| « CleanZ » | **Clemz** (clemz.app) | **≈ 70 %** | Closo (≈ 10 %) ; Klork (≈ 5 %) | Clemz ne fait pas de crosslisting : si Nico pensait à un crosslister, ce n'est pas Clemz. |

---

## 5. Classement « meilleures applications de crosslisting en France (2026) »

### 5.1 Méthode (à publier en tête de page)

- « FillSell est notre produit. » Grille écrite **avant** de noter ; chaque note renvoie à un fait daté.
- FillSell est noté avec ses limites lues dans son code et les décisions de Nico (à constater en
  production le jour de la mise en ligne) ; les concurrents sur leurs pages publiques (déclarations, non
  testées). Cette **asymétrie** peut jouer dans les deux sens : elle se dit dans la page.
- **Éliminatoires** (un outil qui en échoue un est cité « hors classement », avec la raison) :
  1. sert, de façon documentée, un revendeur qui réside en France → exclut **Crosslist** (UE non servie ;
     Depop .com hors UE), **List Perfectly** (« U.S. marketplaces only », Depop US seulement) et
     **Vendoo** (places de marché américaines, app absente de l'App Store FR, ni Vinted ni Leboncoin) ;
  2. publie sur au moins deux places de marché → exclut **Clemz**, **DressKare**, **Margeo** ;
  3. activité démontrée au 09/10/2026 → exclut **Flypr**.

### 5.2 Critères et pondération (total 100, inchangés)

| Id | Critère | Poids | Grille (résumé ; texte complet dans le YAML) |
|---|---|---|---|
| C1 | Plateformes utiles en France | 25 | Vinted FR 7 (source ou option non publique 4) · Leboncoin 7 · eBay.fr 4 (site FR non nommé 2) · Beebs 3 (activé par compte 1) · autres ouvertes, **Depop compris** : 1-2 → 2, 3+ → 4 |
| C2 | Éviter la double vente | 20 | 20, moins 4 si palier ≥ 30 € requis, 4 si seulement les annonces publiées/liées par l'outil, 4 si plateformes partielles, 2 si confirmation requise sur une partie ; non documenté = 5 |
| C3 | Reprendre son stock existant | 10 | import complet 5 / partiel 3 / local 2 + regroupement automatique avec question 5 / à la main 2 / lien ou non vérifié 1 |
| C4 | Créer l'annonce depuis une photo | 10 | photo → objet, texte, prix à l'entrée 10 ; palier élevé ou reconnaissance non décrite 8 ; sans prix 6 ; texte seul 3 ; +1 retouche dès l'entrée ; -1 IA en anglais par défaut |
| C5 | Republication | 10 | manuelle (4 / 3) + automatique (4 dès l'entrée / 3 au palier ≥ 29 € ou plan non écrit / 0) + Vinted et LBC couverts (2 / 1) |
| C6a | App mobile native | 5 | iOS + Android en France 5 · PWA 2 · navigateur tiers 1 |
| C6b | Ordinateur éteint | 5 | toutes 5 · Vinted et LBC sur palier payant 4 · quelques plateformes (API) 1-2 |
| C7 | Prix et accès | 10 | gratuit permanent 3 (essai 1) + premier palier utile ≤ 15 € 4 / ≤ 30 € 3 / ≤ 60 € 2 / inconnu 2 + euros 1 + annuel 1 + essai ou remboursement 1 |
| C8 | Confiance et preuve publique | 5 | aucun mot de passe confié et éditeur identifié 2 (un seul 1) + ≥ 1 000 utilisateurs ou ≥ 20 avis 2 (300-999 : 1) + activité récente 1 |
| E | Largeur hors France (variante) | 0 | FLUF 5, Relistly 4, StoFlow 3, FlowDino 3, Klork 3, Redrip 1, **FillSell 1** (Depop, depuis la France seulement ; 0 avant), Reposter 0 |
| D | **Depop pour un revendeur en France (variante, nouveau)** | 0 | publication 2 + import 1 + retrait après vente 1 + republication 1 (0,5 si annoncée au palier sans nommer Depop) ; 0 si l'outil ne sert pas un résident de France sur Depop. FillSell 5, FLUF 5, Klork 5, Relistly 4,5, les autres 0 |

### 5.3 Notes (pondération de base)

| Rang | Outil | C1 /25 | C2 /20 | C3 /10 | C4 /10 | C5 /10 | C6a /5 | C6b /5 | C7 /10 | C8 /5 | **Total** | à 15:40 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **FillSell** | **23** | 18 | 10 | 10 | **10** | 5 | 1 | 8 | 4 | **89** | 86 |
| 2 | FLUF Connect | 22 | 16 | 10 | 9 | 7 | 5 | 2 | 7 | 5 | **83** | 83 |
| 3 | StoFlow | 20 | 16 | 7 | 9 | 8 | 2 | 4 | 10 | 3 | **79** | 79 |
| 4 | FlowDino | 23 | 12 | 3 | 7 | 9 | 1 | 0 | 7 | 4 | **66** | 66 |
| 5 | Relistly | 13 | 16 | 5 | 8 | 7 | 2 | 1 | 8 | 3 | **63** | 63 |
| 6 | Redrip | 14 | 16 | 3 | 3 | 10 | 1 | 0 | 9 | 4 | **60** | 60 |
| 7 | Klork | 20 | 10 | 4 | 3 | 4 | 2 | 0 | 7 | 4 | **54** | 54 |
| 8 | Reposter | 11 | 5 | 4 | 3 | 9 | 2 | 5 | 5 | 1 | **45** | 45 |

Hors classement : Flypr, Crosslist, List Perfectly, Vendoo, Clemz, DressKare, Margeo (raisons au § 5.1).

**D'où viennent les 3 points de FillSell** : C1 +2 (Depop = une « autre place de marché ouverte », 2 points,
comme pour n'importe quel concurrent) ; C5 +1 (automatique « dès l'entrée » au lieu de « palier ≥ 29 € »).
**Les deux dépendent de l'état de la production le jour de la mise en ligne** :

| Cas le jour de la mise en ligne | FillSell (base) | Ordre |
|---|---|---|
| Depop ouverte à tous ET automatique à tous les paliers | **89** | FillSell · FLUF 83 · StoFlow 79 |
| Depop ouverte, automatique en Pro et Business seulement (état du code au 09/10) | 88 | inchangé |
| Automatique à tous les paliers, Depop non ouverte | 87 | inchangé |
| Ni l'une ni l'autre (état du code au 09/10) | 86 | inchangé |
| Republication automatique Depop absente, le reste acquis | 89 | inchangé — **aucune note n'en dépend** |

### 5.4 Sensibilité : la tête selon le profil (recalculée)

| Variante | Poids changés | Ordre (score sur 100) | à 15:40 |
|---|---|---|---|
| Base | — | **FillSell 89** · FLUF 83 · StoFlow 79 · FlowDino 66 | FillSell 86 · FLUF 83 · StoFlow 79 |
| **Ordinateur éteint prioritaire** | C6b 20, le reste réduit | **StoFlow 79,0** · FillSell 78,2 · FLUF 76,2 · Relistly 56,0 | StoFlow 79,0 · FLUF 76,2 · FillSell 75,7 |
| Petit budget | C7 27,5 | **FillSell 87,4** · StoFlow 83,0 · FLUF 80,3 · FlowDino 67,9 | FillSell 84,8 · StoFlow 83,0 · FLUF 80,3 |
| **Plus de plateformes européennes** | base × 0,85 + E 15 | **FLUF 85,5** · FillSell 78,6 · StoFlow 76,1 · Relistly 65,5 | FLUF 85,5 · StoFlow 76,1 · FillSell 73,1 |
| Vendeur sans Beebs | Beebs retiré de C1 | **FillSell 88,7** · FLUF 86,0 · StoFlow 81,7 · FlowDino 65,7 | FLUF 86,0 · FillSell 85,5 · StoFlow 81,7 |
| Vendeur sans Beebs ni Depop (nouveau) | Beebs et Depop retirés de C1 | **FillSell 86,5** · FLUF 86,0 · StoFlow 81,7 | — |
| **Vendeur Depop** (nouveau) | base × 0,85 + D 15 | **FillSell 90,6** · FLUF 85,5 · StoFlow 67,1 · Relistly 67,0 · Klork 60,9 | — |

Sensibilités qui comptent (calculées, à dire dans la page) :
- **Europe** : si l'on ne compte pas Depop comme largeur (E = 0 pour FillSell), FillSell 75,6 et **StoFlow
  repasse devant** (76,1).
- **Sans Beebs ni Depop** : la tête tient à **un demi-point** et **seulement** si la republication
  automatique est à tous les paliers ; sinon FillSell 85,5 et **FLUF devant** (86,0).
- **Vendeur Depop** : si Depop n'est pas ouverte à la mise en ligne, la variante ne se publie pas (FillSell
  74,0, FLUF premier).
- **Ordinateur éteint** : StoFlow reste premier, mais l'écart tombe à **0,8 point** (contre 3,3).

**Lecture honnête** : avec les décisions de Nico, **FillSell arrive premier dans 5 profils sur 7** (base,
petit budget, sans Beebs, sans Beebs ni Depop — de justesse —, vendeur Depop) et **deuxième dans les deux
autres** (ordinateur éteint : StoFlow ; largeur européenne : FLUF). L'écart de base passe de 3 à **6 points**
sur FLUF ; il ne repose plus sur Beebs seul (sans Beebs, FillSell reste devant). Mais **les 3 points gagnés
sont conditionnels** (tableau du § 5.3) : la page publie la grille, les sous-notes, les variantes, et
la date à laquelle l'état de FillSell a été constaté.

### 5.5 Où FillSell gagne, où il perd désormais (faits)

**Gagne**
- **Vinted France + Leboncoin + eBay.fr + Beebs + Depop** : parmi les 14 outils relus le 09/10, **FillSell est
  le seul qui annonce la publication sur les cinq**. Klork les nomme aussi, mais Vinted n'y est qu'une source
  (pas de publication vers Vinted) et Beebs s'active compte par compte ; FLUF n'a pas Beebs et son tableau
  des capacités ne donne à Leboncoin que la publication ; FlowDino n'a pas Depop ; Relistly n'a ni Leboncoin ni Beebs. Toujours avec la
  date et le périmètre (« parmi les 14 outils comparés le 9 octobre 2026 »), jamais « le seul » tout court.
- **Depop depuis la France** : seuls 4 outils le font pour un résident de France (FillSell, FLUF, Klork,
  Relistly). Crosslist refuse l'UE, List Perfectly ne gère que Depop US, Vendoo est américain, Redrip et
  FlowDino ne font pas Depop.
- **Republication automatique la plus large côté France** : Vinted, Leboncoin, Beebs et Depop [R-DEPOP],
  sans palier requis. Personne d'autre n'automatise **Leboncoin et Depop** ensemble : FLUF (Vinted, Depop… ;
  pas Leboncoin ; dès 29 £), Redrip (Vinted, Leboncoin), StoFlow (Vinted, Leboncoin ; dès 29,99 €), Relistly
  (dès 29 € ; pas Leboncoin), Klork (« Bientôt »).
- **App iOS/Android publiée en France + extension**, en français et en euros (FLUF : même forme, mais fiche
  App Store en anglais, IA en anglais par défaut, prix du site en livres, sans Beebs ni Leboncoin complet).
- **Retrait des copies dans tous les forfaits**, copies importées prouvées comprises, « Déjà vendu ? » au lieu
  de deviner (Klork 35 €, Crosslist 39,99 $, List Perfectly 99 $, Relistly et FlowDino : annonces publiées par
  l'outil seulement).
- **Regroupement d'un même article** jamais sur la photo seule ni le titre seul ; **prix proposé par l'IA**
  (FlowDino, Vendoo, List Perfectly : non) ; import sans quota, stock sans limite d'articles.

**Perd**
- **Ordinateur éteint** : seulement eBay relié ; **Depop aussi demande l'ordinateur** (FLUF et Crosslist font
  Depop côté serveur). StoFlow reste premier sur ce profil.
- **Largeur** : 5 plateformes, Depop depuis la France seulement ; FLUF des dizaines, Relistly 18 (Depop dans
  24 pays). Pas Vestiaire, Etsy, Grailed, Whatnot.
- **Profondeur Depop** : FLUF gère aussi les offres et les commandes Depop, Klork les offres ; chez FillSell,
  Depop est neuf (ouverture du 10/10) et **aucune vente Depop réelle n'a encore été prouvée de bout en bout**
  (structure de la vente lue sur une annonce publique vendue).
- **Vinted hors de France** : non publié (Redrip, Clemz, FLUF, FlowDino, Relistly visent plusieurs pays).
- **Prix** : aucun prix annuel, aucun essai des paliers payants ; Gratuit limité en volume d'annonces
  rédigées par l'IA (chiffre jamais publié) ; retouche photo IA absente du Gratuit (FlowDino l'offre).
- **Navigateurs** : Chrome seulement annoncé.
- **Preuve publique** : 360 utilisateurs CWS, 1 avis, 3 notes App Store.
- **Fonctions de vendeur** absentes : offres et messages aux favoris, négociation, messagerie unifiée,
  bordereaux, fiscalité, plusieurs comptes Vinted simultanés.

### 5.6 « Le meilleur selon ton cas » (proposition de bloc pour la page)

- Tu vends sur Vinted, Leboncoin, eBay, Beebs **et Depop**, depuis la France et ton téléphone → FillSell
  (notre produit).
- Tu vends **Depop dans plusieurs pays** et tu veux que ça tourne sans ordinateur → FLUF Connect (en
  anglais, prix en livres, sans Beebs).
- Tu veux que ça tourne **ordinateur éteint** et tu vends aussi sur Vestiaire ou Etsy → StoFlow (plan Pro).
- Tu vends dans **plusieurs pays européens** sur beaucoup de plateformes → FLUF Connect ou Relistly.
- Tu ne fais que **Vinted ↔ Leboncoin** avec un petit budget → Redrip.
- Tu es un gros vendeur **Leboncoin** multi-villes → Reposter (identifiants confiés au service).
- Tu ne vends que sur Vinted et veux tout automatiser sur ce site → Clemz (pas de crosslisting).
- Tu veux surtout **compter tes marges et ta fiscalité** → Margeo (ne publie pas).

---

## 6. Pour la rédaction des pages

### 6.1 Règles

- **Décisions de Nico (09/10)** : plateformes présentées partout = Vinted, Leboncoin, eBay, Beebs, Depop ;
  l'ancienne cinquième plateforme n'apparaît nulle part, même pour décrire un concurrent ; **jamais de palier
  écrit à côté de la republication automatique** ; eBay et republication : on n'en parle pas ; **aucun
  chiffre de quota ni de plafond de FillSell** ; ton offensif, comparatifs à notre avantage, faits vrais et
  datés, aucun dénigrement.
- **Jamais de nombre de plateformes** (« cinq plateformes ») : règle du 02/10 de la fiche de vérité, toujours
  valable — on les nomme.
- **Fausses exclusivités à contredire par un fait daté** : FLUF (« the only crosslisting tool that supports
  both Vinted and Leboncoin ») ; Relistly (« no competitor covers Leboncoin either ») ; Margeo (« Aucun outil
  ne crossliste Vinted + Leboncoin… ») ; Vendoo (« The only Crosslisting Mobile App »).
- **À ne jamais écrire côté FillSell** : « le seul outil Beebs » (FlowDino), « la seule app de crosslisting »
  (FLUF, Crosslist, Vendoo), « publication illimitée en gratuit », « retrait automatique partout », « temps
  réel », « essai gratuit », « Depop dans le monde entier », « Depop ordinateur éteint », Edge, Cloud,
  « Pro / Business » ou tout palier à côté de la republication automatique.
- **Formulation sûre de la vente** (fiche F43-F44, étendue à Depop) : « Quand Vinted, eBay ou Depop marque
  ton article vendu, FillSell enregistre la vente et retire tes autres annonces. Sur Leboncoin et Beebs, il te
  demande de confirmer d'un appui. »
- **Toujours dater** les faits concurrents (« relevé le 9 octobre 2026 sur fluf.io/integrations ») ; les prix,
  les plateformes et les notes changent vite (StoFlow déclare déjà Depop dans son extension).
- **Pages prioritaires** : `alternative/crosslist` (UE non servie, Vinted fermé, Depop hors UE) ;
  `vs-fluf-connect` (premier sur la largeur européenne, deuxième de la base, le plus complet sur Depop) ; `vs-stoflow` (premier ordinateur éteint) ; `vs-flowdino` (Beebs partagé, pas Depop) ; `vs-klork`
  (le plus proche sur les cinq plateformes) ; `vs-flypr` et `vs-clemz` seulement après confirmation de Nico.

### 6.2 Formules qui frappent — chacune avec le fait qui la porte (à relire le jour de la publication)

| Formule | Fait qui la porte (relevé le 09/10/2026) | Condition |
|---|---|---|
| « Vinted, Leboncoin, eBay, Beebs et Depop. Une seule app. » | ligne FillSell ; aucun nombre de plateformes | Depop ouverte à tous |
| « Le seul des outils que nous avons comparés le 9 octobre 2026 qui publie à la fois sur Vinted, Leboncoin, eBay, Beebs et Depop. » | § 1.1 et § 1.3 (14 outils, pages officielles) | Depop ouverte ; revérifier Klork (Vinted source) et FLUF (Beebs) le jour J ; toujours avec la date et le lien vers la méthode |
| « Ton stock republie tout seul sur Vinted, Leboncoin, Beebs et Depop. » [R-DEPOP] — **repli** : « …sur Vinted, Leboncoin et Beebs. » | décision de Nico ; plateformes_auto | republication automatique Depop active ; sinon le repli |
| « Leboncoin et Depop dans la même app, republication automatique comprise. Chez FLUF, le tableau des capacités ne donne à Leboncoin que la publication ; chez Relistly, Leboncoin est « coming soon » ; Redrip ne fait pas Depop. » [R-DEPOP] — **repli** : « Leboncoin et Depop dans la même app. » + la même comparaison | fluf.io/integrations ; relistly.io/integrations/leboncoin ; redrip.app/blog/vinted-bot-meilleurs-outils-2026 | idem ; ton factuel, sans adjectif sur le concurrent |
| « Tu vends depuis la France ? Crosslist ne sert pas les résidents de l'UE, List Perfectly ne gère que Depop US. FillSell publie sur Depop depuis la France, en euros. » | crosslist.com/pricing ; listperfectly.com/faq | Depop ouverte |
| « Vendu sur Vinted, eBay ou Depop ? FillSell retire tes autres annonces. Sur Leboncoin et Beebs, un appui suffit. » | F43-F44 ; décision de Nico (Depop) | Depop ouverte ; idéalement une vente Depop réelle prouvée avant |
| « Le retrait des copies est inclus dans tous les forfaits. Ailleurs, il faut Business chez Klork (35 €), Gold chez Crosslist (39,99 $), Pro Plus chez List Perfectly (99 $). » | klork.app/pricing ; crosslist.com/pricing ; listperfectly.com/faq | — (concerne le retrait, pas la republication) |
| « Une photo, et l'annonce est écrite, prix compris. » (FlowDino, Vendoo, List Perfectly ne proposent pas de prix) | F15-F21 ; fiches concurrentes | — |
| « Une vraie app iPhone et Android, en français. » + en comparatif : « StoFlow, FlowDino, Klork, Relistly : pas d'app sur l'App Store. » | API iTunes (App Store FR, 0 résultat pour les quatre) ; Google Play repris des fiches (StoFlow : « ni sur l'App Store ni sur le Play Store ») | relire l'App Store le jour J (StoFlow construit la sienne) |

Interdits de ton (cadre légal de la publicité comparative) : pas d'adjectif dépréciatif sur un concurrent,
pas de « pire », « dépassé », « arnaque » ; comparer des caractéristiques essentielles et vérifiables, avec
la date et la source accessibles (lien vers la méthode du classement).

## 7. Ce qui n'a pas pu être vérifié

- Tout ce qui est derrière un compte : délais réels de retrait, modes cloud (StoFlow, Klork « Bientôt »),
  Beebs chez FlowDino et Klork en usage, **Depop chez Klork en usage (import, retrait)**, **pays Depop servis
  par FLUF** (non précisé), **republication Depop chez Relistly** (« auto-relist » sans liste de plateformes),
  **rôle des domaines Depop dans l'extension StoFlow**, qualité des IA, prix réellement facturés.
- Trustpilot, Google Play, Firefox Add-ons, Shopify App Store : repris des fiches du même jour, non relus.
- Absence de Flypr sur le Chrome Web Store : page de recherche chargée en JavaScript (repris de la fiche).
- **Côté FillSell** : la base de production n'a pas été interrogée (aucune requête SQL dans ce chantier) —
  `depop_ouvert`, `republish_planifiee_*` et les paliers de la republication automatique se lisent dans
  `coin_config` et les fonctions de prod le jour de la mise en ligne ; l'état du code cité au § 0 vient du
  dépôt principal (HEAD `d1b7ac1`, lecture seule) ; note Google Play et Trustpilot non relevées.
