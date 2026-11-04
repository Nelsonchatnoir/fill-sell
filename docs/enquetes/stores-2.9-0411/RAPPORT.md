# Stores — fiches et abonnements pour le binaire 2.9 (04/11/2026)

Chantier lancé par Nico le 04/11/2026. Source de la grille : `docs/reprise/quotas-0311.md` (décisions finales du 03/11).
Ce fichier est la SEULE source des textes stores 2.9 : on colle d'ici, on ne réécrit pas ailleurs.
Comptes de caractères faits par script (limites : Apple sous-titre 30, mots-clés 100 octets, texte promo 170,
description 4 000 ; Google description courte 80, longue 4 000, nouveautés 500 ; abonnements Apple nom 30 /
description 45 ; Google nom 55, avantages 4 × 40).

## 1. État au 04/11/2026 (heure de Paris, en fin de journée)

### Google Play — FAIT
| Élément | Avant | Après | En ligne ? |
|---|---|---|---|
| Fiche FR — description courte | « Relève et publie tes annonces sur Vinted, Leboncoin, eBay, Beebs et Opla. » | § 3.2 | **Brouillon** : rien n'est parti à l'examen |
| Fiche FR — description longue | ancien texte (Opla citée, aucun mot sur Cloud, quotas, bordereaux) — annexe A | § 3.2 | **Brouillon** |
| Fiche EN — description courte | « Scan and post your listings on Vinted, Leboncoin, eBay, Beebs and Opla. » | § 3.2 | **Brouillon** |
| Fiche EN — description longue | ancien texte anglais (Opla) — annexe A | § 3.2 | **Brouillon** |
| Titre « FillSell », e-mail support@fillsell.app, site https://fillsell.app, confidentialité https://fillsell.app/legal | — | inchangés (valides, relus) | — |
| Premium (`app.fillsell.premium.standard`) — 4 avantages | « 400 pépites par mois », « Publication Vinted, LBC, eBay, Beebs », « Gestion du stock à la voix », « Analyse photo IA » | « Plus d'annonces IA chaque mois », « Plus de remontées chaque mois », « Retouche photo par IA », « Support par e-mail » | **OUI, tout de suite** (Google n'a ni brouillon ni examen pour les abonnements) — textes neutres, vrais aujourd'hui ET en 2.9 (choix de Nico) |
| Pro (`app.fillsell.pro.sub`) — 4 avantages | « 1200 pépites par mois », « Pour les gros volumes de revente », « Publication Vinted, LBC, eBay, Beebs », « Voix et analyse photo IA » | « Republication automatique », « Encore plus d'annonces et de remontées », « Retouche photo par IA », « Support prioritaire » | OUI |
| Business (`app.fillsell.business.sub`) — nom, avantages | nom « Business », aucun avantage | « FillSell Business » ; « Remontées sans limite » (vrai aujourd'hui : `quota_republication_business = 0`), « Republication automatique », « Le plus d'annonces chaque mois », « Support prioritaire » | OUI |
| Descriptions internes (invisibles des clients) des 3 formules | pépites | phrases neutres (§ 3.4) | — |
| Cloud (`app.fillsell.cloud.sub`) — avantages | aucun | « Tes annonces publiées, PC éteint », « Tout depuis ton téléphone », « Publie, remonte et retire 24 h/24 », « En option sur toutes les formules » | OUI (personne ne peut l'acheter : l'offre est cachée dans l'app) |
| Cloud — prix du forfait `cloud-monthly` | 20,00 € dans les 21 pays euro ; Monaco 23,99 € ; Saint-Marin et Vatican 19,99 € | **24,99 € TTC dans les 23 pays payés en euro** (21 pays euro + Monaco, Saint-Marin, Vatican), relu ligne par ligne | OUI — feu vert de Nico (04/11) ; « les changements de prix ne s'appliquent qu'aux nouveaux abonnés » (aucun abonné) |
| Cloud — offre d'essai | `cloud-trial-3d`, 7 jours, 175 pays, « n'ont jamais eu cet abonnement », active | inchangée (relue) | — |
| Prix Premium / Pro / Business | France 12,99 / 29,99 / 59,99 € | **inchangés** | — |

⚠️ Google — points relevés, NON touchés :
- L'offre d'essai Cloud s'appelle `cloud-trial-3d` (pas `cloud-trial-7d`) et dure 7 jours : c'est l'identifiant que le code attend
  (`OFFRE_ESSAI_CLOUD_GOOGLE`, `_shared/cloud-option.js`). Ne pas en créer une autre.
- Cloud hors pays euro : les prix restent la conversion de l'ancien 20 € (ex. Danemark 185 DKK, Gibraltar 16,99 GBP, ligne
  « Autres pays/régions (EUR) »). À reconvertir depuis 24,99 € si Nico le veut (l'outil « Set prices » de Google ajoute la TVA
  au montant saisi : 24,99 saisi = 29,99 € TTC en France — ne jamais l'utiliser pour les pays euro).
- Premium et Pro hors France ne sont pas au même prix (Premium : Allemagne 14,99 €, Belgique 15,99 € ; Pro : Allemagne
  35,99 €). Le prix affiché par l'app (12,99 / 29,99) n'est donc vrai qu'en France. Aucun changement fait (« aucun prix ne
  change ») : décision de Nico.
- Premium porte une offre `essai-7-jours` **inactive** depuis le 26/07 : laissée telle quelle.
- Abonnements Google : une seule langue (fr-FR). Un client anglophone lit les avantages en français.

### Apple (App Store Connect) — RELEVÉ SEULEMENT, rien de modifié
Nico a demandé d'arrêter Apple pour aujourd'hui (session App Store Connect expirée en cours de relevé, Nico absent).
Tout ce qui suit est prêt à coller ce soir (§ 2 et § 3).

| Élément | Relevé le 04/11 | À faire |
|---|---|---|
| Version | iOS **2.9** « À finaliser avant soumission » (créée le 03/11 à 23 h 51), 2.8 en ligne | coller § 3.1 dans la 2.9 |
| Langues | fr-FR, en-US | les deux |
| Description FR / EN | ancien texte (Opla citée, quotas d'avant) ; lien EULA Apple standard en fin de texte | § 3.1 (garde le lien EULA Apple + ajoute CGU/CGV FillSell) |
| Mots-clés FR | `revente,annonces,multiplateforme,brocante,friperie,inventaire,stock,marge,vinted,leboncoin,ebay,ia` | § 3.1 |
| Mots-clés EN | `reseller,crosslisting,crosspost,listing,inventory,profit,stock,flipping,marketplace,vinted,ebay,ai` | § 3.1 |
| Nouveautés, texte promo (2.9) | vides | § 3.1 |
| URL marketing / support | https://fillsell.app / https://fillsell.app | FR : https://fillsell.app + https://fillsell.app/faq ; EN : https://fillsell.app/en + https://fillsell.app/faq |
| Sous-titre FR / EN | « Assistant IA pour revendeurs » / « AI Inventory & Profit » | « Une annonce, 5 plateformes » / « One listing, 5 marketplaces » |
| Nom | en ligne FR « FillSell – Achat Revente » ; **dans la 2.9 (déjà modifié avant moi) FR « FillSell – Reseller App »** | ⚠️ à confirmer par Nico : le nom FR change avec la 2.9 |
| Confidentialité | https://fillsell.app/legal (FR et EN) | https://fillsell.app/legal#confidentialite / https://fillsell.app/legal?lang=en#confidentialite |
| Contrat de licence (EULA) | aucun contrat propre : EULA standard d'Apple (lien dans la description) | garder ; lien CGU ajouté dans la description |
| Groupe « FillSell Plan » — nom affiché | « FillSell Premium » (FR et EN, une copie « à soumettre » existe déjà) | « Formules FillSell » / « FillSell plans » (le groupe contient aussi Pro et Business) |
| Premium `app.fillsell.premium.standard` | APPROUVÉ ; FR « FillSell Premium / Publie partout, prix par IA, stock illimité. » ; EN « Fill & Sell Premium / List everywhere, AI pricing, unlimited stock. » ; 12,99 € | § 3.3 ; prix inchangé |
| Pro `app.fillsell.pro2.sub` (celui de l'app iOS) | APPROUVÉ ; « FillSell Pro / Accès illimité à toutes les fonctionnalités Pro » ; 29,99 € | § 3.3 |
| Business `app.fillsell.business.sub` | APPROUVÉ ; FR « Business / 3000 Pépites par mois pour vendre à grande échelle. » ; 59,99 € | § 3.3 |
| Cloud `app.fillsell.cloud.sub` (groupe « FillSell Cloud ») | **MISSING_METADATA** : FR seul « Cloud / Vos annonces publiées sans ordinateur, dans le cloud. » ; pas d'EN ; **pas de capture de revue** ; **aucune offre d'introduction** (l'essai 7 j n'a jamais été confirmé) ; **prix 20,00 €** (175 pays) | § 3.3 ; prix France 24,99 € (feu vert de Nico) ; offre d'intro « Gratuit, 1 semaine, tous pays, sans fin » ; capture de revue = écran d'achat Cloud du build 2.9 |
| Cloud — soumission | premier abonnement d'un nouveau groupe : Apple l'exige AVEC une version de l'app | **Prêt à soumettre au mieux, jamais sans binaire** : rattacher à la 2.9 (section « Achats intégrés et abonnements » de la version) une fois la capture posée |
| Bandeau du compte | « Paid Applications Schedule » mis à jour, à accepter par le titulaire du compte (Nico), sinon Apple bloque mises à jour, nouveaux achats intégrés et soumissions | Nico, menu Business — moi, je n'accepte aucun contrat |

Apple — hors champ, signalés : `app.fillsell.premium.sub` (« Fill & Sell Premium », Founder fermé : « Vocal illimité, Lens Pro,
prix en live, stock illimité ») et `app.fillsell.pro.sub` (doublon Pro inutilisé sur iOS) sont APPROUVÉS dans le même groupe :
iOS peut les proposer dans Réglages › Abonnements. Textes non touchés.

## 2. Ce soir, Apple (dans l'ordre)
1. Nico : se reconnecter à App Store Connect ; accepter le « Paid Applications Schedule » (Business) s'il bloque.
2. Version 2.9, fr-FR et en-US : sous-titre, mots-clés, texte promo, description, nouveautés, URL (§ 3.1) ; confidentialité
   dans « Informations sur l'app ».
3. Groupe « FillSell Plan » : nom affiché (§ 3.3). Premium, Pro (pro2), Business : nom + description FR/EN, notes de revue.
4. Cloud : localisations FR (tutoiement) + EN, nom du groupe Cloud FR/EN, prix France 24,99 € (Apple ajuste les autres pays),
   offre d'intro gratuite 1 semaine, note de revue ; capture de revue = écran d'achat Cloud pris sur le build 2.9 ; puis
   rattacher à la 2.9. Rien n'est soumis.

## 3. Les textes

### 3.1 App Store — version 2.9 (à coller ce soir)

#### fr-FR

**Sous-titre** (26 / 30)

```
Une annonce, 5 plateformes
```
**Mots-clés** (94 octets / 100)

```
revente,multiplateforme,republier,remonter,friperie,stock,marge,ia,vinted,leboncoin,ebay,depop
```
**Texte promotionnel (version 2.9 seulement, jamais sur la 2.8 en ligne)** (131 / 170)

```
Nouveau : FillSell Cloud. Tes annonces publiées, remontées et retirées sans ordinateur, tout depuis ton téléphone. 7 jours offerts.
```
**Nouveautés** (480 / 4000)

```
• FillSell Cloud : plus besoin d'ordinateur. Tes annonces sont publiées, remontées et retirées depuis nos serveurs, même PC éteint, et tu pilotes tout depuis ton téléphone. 7 jours offerts, en option sur n'importe quelle formule.
• Trois jauges claires : annonces, publications, remontées. Tu vois d'un coup d'œil ce qu'il te reste ce mois-ci.
• Le coût de chaque publication s'affiche avant de publier.
• Bordereaux Vinted inclus dès la formule Pro (Leboncoin et eBay : bientôt).
```
**URL** — marketing : https://fillsell.app · support : https://fillsell.app/faq · confidentialité (Informations sur l'app) : https://fillsell.app/legal#confidentialite

**Description** (3957 / 4000)

```
Tu revends sur Vinted, Leboncoin, eBay, Beebs ou Depop ? FillSell écrit tes annonces, les publie partout, range ton stock et retire les autres annonces dès qu'un article est vendu. Tout depuis ton téléphone.

UNE PHOTO, L'ANNONCE EST ÉCRITE
Prends ton article en photo : Lens reconnaît l'objet et sa marque, propose un état et un prix d'après des articles comparables, puis rédige le titre et la description. Tu relis et c'est prêt. Tu peux aussi dicter ton article.

UNE ANNONCE, CINQ PLATEFORMES
Tu remplis une seule fois. Chaque plateforme reçoit une annonce adaptée à ses rubriques : catégorie, taille, couleur, colis. S'il manque une info, l'app te la demande. Avant chaque publication, l'app t'affiche ce qu'elle utilisera de ta formule et ce qu'il te restera.

TON STOCK, RANGÉ EN UN APPUI
« Synchroniser » relit les annonces que tu as déjà en ligne et les range dans ton stock. Un même article présent sur plusieurs plateformes devient une seule fiche ; au moindre doute, FillSell te pose la question au lieu de deviner.

VENDU ICI, RETIRÉ LÀ-BAS
Sur Vinted et eBay, la vente s'enregistre toute seule ; sur Leboncoin, Beebs et Depop, tu la confirmes d'un appui. FillSell retire ensuite les autres annonces de l'article. Au moindre doute, il te demande d'abord « Déjà vendu ? ».

TES ANNONCES REMONTENT
Une remontée remet ton annonce en haut des résultats (ses vues et favoris repartent de zéro). Tu remontes en un appui, ou tu laisses la republication automatique s'en charger sur Vinted, Leboncoin, Beebs et Depop, les jours et au créneau que tu choisis, à un rythme humain.

TES BORDEREAUX VINTED
Avec Pro et Business, tu récupères ton bordereau Vinted dans l'app dès qu'il est prêt : plus qu'à l'imprimer. Leboncoin et eBay : bientôt.

TES CHIFFRES, SANS TABLEUR
Prix d'achat, prix de vente, marge, ventes par plateforme : tout reste à jour.

AVEC OU SANS ORDINATEUR
Sans le Cloud, l'extension Chrome gratuite publie, remonte et retire tes annonces depuis ton ordinateur, allumé avec Chrome ouvert. Éteint, rien n'est perdu : tout attend la prochaine ouverture.
Avec FillSell Cloud, plus besoin d'ordinateur : tout tourne sur nos serveurs, 24 h sur 24. Tu connectes tes plateformes depuis ton téléphone, et tes annonces partent même PC éteint. En option sur n'importe quelle formule, même gratuite. 7 jours offerts, une fois par personne.
Sur eBay France, FillSell publie par l'interface officielle d'eBay, avec ou sans le Cloud.

JAMAIS TON MOT DE PASSE
FillSell ne connaît ni ne garde jamais tes mots de passe : avec l'extension, tu restes connecté(e) dans ton navigateur ; avec le Cloud, tu te connectes toi-même sur la page de chaque plateforme, et seules tes sessions sont gardées, chiffrées.

LES FORMULES, PAR MOIS
• Free, pour démarrer : 5 annonces, 50 publications, 30 remontées.
• Premium, pour vendre plus : 40 annonces, 400 publications, 1 500 remontées, 5 retouches IA.
• Pro, pour que ça tourne tout seul : 120 annonces, 1 200 publications, remontées illimitées, republication automatique, bordereaux Vinted, 20 retouches IA.
• Business, pour publier sans compter : tout illimité, sauf Lens (600 par mois) et retouches IA (50 par mois).
1 annonce = une rédaction IA ou un scan Lens · 1 publication = une mise en ligne sur une plateforme · 1 remontée = une republication sur une plateforme. L'import, la synchro et les retraits ne comptent jamais.
Abonnements mensuels sans engagement, renouvelés automatiquement : tu les arrêtes quand tu veux dans les réglages de ton compte App Store. Le prix de chaque formule s'affiche dans l'app avant tout achat.

FillSell n'est affilié à aucune des plateformes citées, ni approuvé ni sponsorisé par elles.

Aide : https://fillsell.app/faq · support@fillsell.app
Confidentialité : https://fillsell.app/legal#confidentialite
Conditions d'utilisation (CGU et CGV) : https://fillsell.app/legal#cgu
Contrat de licence Apple (EULA) : https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```
#### en-US

**Sous-titre** (27 / 30)

```
One listing, 5 marketplaces
```
**Mots-clés** (100 octets / 100)

```
crosslisting,crosspost,relist,resell,reseller,inventory,profit,thrift,ai,vinted,ebay,depop,leboncoin
```
**Texte promotionnel (version 2.9 seulement, jamais sur la 2.8 en ligne)** (113 / 170)

```
New: FillSell Cloud. Your listings posted, bumped and removed with no computer, all from your phone. 7 days free.
```
**Nouveautés** (448 / 4000)

```
• FillSell Cloud: no computer needed. Your listings are posted, bumped and removed from our servers, even with your computer off, and you run it all from your phone. 7 days free, as an add-on to any plan.
• Three clear gauges: listings, publications, bumps. See at a glance what you have left this month.
• The cost of each publication is shown before you post.
• Vinted shipping labels included from the Pro plan (Leboncoin and eBay: coming soon).
```
**URL** — marketing : https://fillsell.app/en · support : https://fillsell.app/faq · confidentialité (Informations sur l'app) : https://fillsell.app/legal?lang=en#confidentialite

**Description** (3869 / 4000)

```
Do you resell on Vinted, Leboncoin, eBay, Beebs or Depop? FillSell writes your listings, posts them to all your marketplaces, keeps your stock in order and removes the other listings as soon as an item sells. You run it all from your phone.

ONE PHOTO, YOUR LISTING IS WRITTEN
Take a photo of your item: Lens recognises the object and its brand, suggests a condition and a price based on comparable items, then writes the title and the description. You check and it's ready. You can also dictate your item.

ONE LISTING, FIVE MARKETPLACES
Fill it in once. Each marketplace gets a listing adapted to its own fields: category, size, colour, parcel. If anything is missing, the app asks you. Before each publication, the app shows you what it will use from your plan and what you will have left.

YOUR STOCK, SORTED IN ONE TAP
"Sync" reads the listings you already have online and files them in your stock. The same item live on several marketplaces becomes a single card; if in doubt, FillSell asks you instead of guessing.

SOLD HERE, REMOVED THERE
On Vinted and eBay, the sale is recorded on its own; on Leboncoin, Beebs and Depop, you confirm it with one tap. FillSell then removes the item's other listings. If in doubt, it asks "Already sold?" first.

YOUR LISTINGS BUMP BACK UP
A bump puts your listing back at the top of the results (its views and favourites start from zero). Bump in one tap, or let automatic reposting do it for you on Vinted, Leboncoin, Beebs and Depop, on the days and in the time slot you choose, at a human pace.

YOUR VINTED SHIPPING LABELS
With Pro and Business, you get your Vinted shipping label in the app as soon as it is ready: all that's left is to print it. Leboncoin and eBay: coming soon.

YOUR NUMBERS, NO SPREADSHEET
Purchase price, sale price, margin, sales by marketplace: everything stays up to date.

WITH OR WITHOUT A COMPUTER
Without the Cloud, the free Chrome extension posts, bumps and removes your listings from your computer, on with Chrome open. Switched off, nothing is lost: everything waits for the next time it opens.
With FillSell Cloud, no computer needed: everything runs on our servers, 24/7. Connect your marketplaces from your phone, and your listings go out even with your computer off. An add-on to any plan, even the free one. 7 days free, once per person.
On eBay France, FillSell publishes through eBay's official interface, with or without the Cloud.

NEVER YOUR PASSWORD
FillSell never knows or keeps your passwords: with the extension, you stay signed in within your browser; with the Cloud, you sign in yourself on each marketplace's own page, and only your sessions are kept, encrypted.

PLANS, PER MONTH
• Free, to get started: 5 listings, 50 publications, 30 bumps.
• Premium, to sell more: 40 listings, 400 publications, 1,500 bumps, 5 AI touch-ups.
• Pro, so it all runs on its own: 120 listings, 1,200 publications, unlimited bumps, automatic reposting, Vinted shipping labels, 20 AI touch-ups.
• Business, to publish without counting: everything unlimited, except Lens (600 a month) and AI touch-ups (50 a month).
1 listing = one AI write-up or one Lens scan · 1 publication = one listing put online on one marketplace · 1 bump = one repost on one marketplace. Imports, syncs and removals never count.
Monthly subscriptions with no commitment, renewed automatically: cancel any time in your App Store account settings. The price of each plan is shown in the app before any purchase.

FillSell is not affiliated with, endorsed or sponsored by any of the marketplaces mentioned (Vinted, Leboncoin, eBay, Beebs, Depop).

Help: https://fillsell.app/faq · support@fillsell.app
Privacy: https://fillsell.app/legal?lang=en#confidentialite
Terms of use and sale: https://fillsell.app/legal?lang=en#cgu
Apple licence agreement (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```
### 3.2 Google Play — fiche principale (collée en brouillon le 04/11)

#### fr-FR

**Description courte** (76 / 80)

```
Une photo, une annonce, publiée sur Vinted, Leboncoin, eBay, Beebs et Depop.
```
**Nouveautés de la version (à coller dans la release 2.9, avec le binaire)** (480 / 500)

```
• FillSell Cloud : plus besoin d'ordinateur. Tes annonces sont publiées, remontées et retirées depuis nos serveurs, même PC éteint, et tu pilotes tout depuis ton téléphone. 7 jours offerts, en option sur n'importe quelle formule.
• Trois jauges claires : annonces, publications, remontées. Tu vois d'un coup d'œil ce qu'il te reste ce mois-ci.
• Le coût de chaque publication s'affiche avant de publier.
• Bordereaux Vinted inclus dès la formule Pro (Leboncoin et eBay : bientôt).
```
**Description longue** (3854 / 4000)

```
Tu revends sur Vinted, Leboncoin, eBay, Beebs ou Depop ? FillSell écrit tes annonces, les publie partout, range ton stock et retire les autres annonces dès qu'un article est vendu. Tout depuis ton téléphone.

UNE PHOTO, L'ANNONCE EST ÉCRITE
Prends ton article en photo : Lens reconnaît l'objet et sa marque, propose un état et un prix d'après des articles comparables, puis rédige le titre et la description. Tu relis et c'est prêt. Tu peux aussi dicter ton article.

UNE ANNONCE, CINQ PLATEFORMES
Tu remplis une seule fois. Chaque plateforme reçoit une annonce adaptée à ses rubriques : catégorie, taille, couleur, colis. S'il manque une info, l'app te la demande. Avant chaque publication, l'app t'affiche ce qu'elle utilisera de ta formule et ce qu'il te restera.

TON STOCK, RANGÉ EN UN APPUI
« Synchroniser » relit les annonces que tu as déjà en ligne et les range dans ton stock. Un même article présent sur plusieurs plateformes devient une seule fiche ; au moindre doute, FillSell te pose la question au lieu de deviner.

VENDU ICI, RETIRÉ LÀ-BAS
Sur Vinted et eBay, la vente s'enregistre toute seule ; sur Leboncoin, Beebs et Depop, tu la confirmes d'un appui. FillSell retire ensuite les autres annonces de l'article. Au moindre doute, il te demande d'abord « Déjà vendu ? ».

TES ANNONCES REMONTENT
Une remontée remet ton annonce en haut des résultats (ses vues et favoris repartent de zéro). Tu remontes en un appui, ou tu laisses la republication automatique s'en charger sur Vinted, Leboncoin, Beebs et Depop, les jours et au créneau que tu choisis, à un rythme humain.

TES BORDEREAUX VINTED
Avec Pro et Business, tu récupères ton bordereau Vinted dans l'app dès qu'il est prêt : plus qu'à l'imprimer. Leboncoin et eBay : bientôt.

TES CHIFFRES, SANS TABLEUR
Prix d'achat, prix de vente, marge, ventes par plateforme : tout reste à jour.

AVEC OU SANS ORDINATEUR
Sans le Cloud, l'extension Chrome gratuite publie, remonte et retire tes annonces depuis ton ordinateur, allumé avec Chrome ouvert. Éteint, rien n'est perdu : tout attend la prochaine ouverture.
Avec FillSell Cloud, plus besoin d'ordinateur : tout tourne sur nos serveurs, 24 h sur 24. Tu connectes tes plateformes depuis ton téléphone, et tes annonces partent même PC éteint. En option sur n'importe quelle formule, même gratuite. 7 jours offerts, une fois par personne.
Sur eBay France, FillSell publie par l'interface officielle d'eBay, avec ou sans le Cloud.

JAMAIS TON MOT DE PASSE
FillSell ne connaît ni ne garde jamais tes mots de passe : avec l'extension, tu restes connecté(e) dans ton navigateur ; avec le Cloud, tu te connectes toi-même sur la page de chaque plateforme, et seules tes sessions sont gardées, chiffrées.

LES FORMULES, PAR MOIS
• Free, pour démarrer : 5 annonces, 50 publications, 30 remontées.
• Premium, pour vendre plus : 40 annonces, 400 publications, 1 500 remontées, 5 retouches IA.
• Pro, pour que ça tourne tout seul : 120 annonces, 1 200 publications, remontées illimitées, republication automatique, bordereaux Vinted, 20 retouches IA.
• Business, pour publier sans compter : tout illimité, sauf Lens (600 par mois) et retouches IA (50 par mois).
1 annonce = une rédaction IA ou un scan Lens · 1 publication = une mise en ligne sur une plateforme · 1 remontée = une republication sur une plateforme. L'import, la synchro et les retraits ne comptent jamais.
Abonnements mensuels sans engagement, renouvelés automatiquement : tu les arrêtes quand tu veux dans Google Play, rubrique Abonnements. Le prix de chaque formule s'affiche dans l'app avant tout achat.

FillSell n'est affilié à aucune des plateformes citées, ni approuvé ni sponsorisé par elles.

Aide : https://fillsell.app/faq · support@fillsell.app
Confidentialité : https://fillsell.app/legal#confidentialite
Conditions d'utilisation (CGU et CGV) : https://fillsell.app/legal#cgu
```
#### en-US

**Description courte** (75 / 80)

```
One photo, one listing, posted to Vinted, Leboncoin, eBay, Beebs and Depop.
```
**Nouveautés de la version (à coller dans la release 2.9, avec le binaire)** (448 / 500)

```
• FillSell Cloud: no computer needed. Your listings are posted, bumped and removed from our servers, even with your computer off, and you run it all from your phone. 7 days free, as an add-on to any plan.
• Three clear gauges: listings, publications, bumps. See at a glance what you have left this month.
• The cost of each publication is shown before you post.
• Vinted shipping labels included from the Pro plan (Leboncoin and eBay: coming soon).
```
**Description longue** (3772 / 4000)

```
Do you resell on Vinted, Leboncoin, eBay, Beebs or Depop? FillSell writes your listings, posts them to all your marketplaces, keeps your stock in order and removes the other listings as soon as an item sells. You run it all from your phone.

ONE PHOTO, YOUR LISTING IS WRITTEN
Take a photo of your item: Lens recognises the object and its brand, suggests a condition and a price based on comparable items, then writes the title and the description. You check and it's ready. You can also dictate your item.

ONE LISTING, FIVE MARKETPLACES
Fill it in once. Each marketplace gets a listing adapted to its own fields: category, size, colour, parcel. If anything is missing, the app asks you. Before each publication, the app shows you what it will use from your plan and what you will have left.

YOUR STOCK, SORTED IN ONE TAP
"Sync" reads the listings you already have online and files them in your stock. The same item live on several marketplaces becomes a single card; if in doubt, FillSell asks you instead of guessing.

SOLD HERE, REMOVED THERE
On Vinted and eBay, the sale is recorded on its own; on Leboncoin, Beebs and Depop, you confirm it with one tap. FillSell then removes the item's other listings. If in doubt, it asks "Already sold?" first.

YOUR LISTINGS BUMP BACK UP
A bump puts your listing back at the top of the results (its views and favourites start from zero). Bump in one tap, or let automatic reposting do it for you on Vinted, Leboncoin, Beebs and Depop, on the days and in the time slot you choose, at a human pace.

YOUR VINTED SHIPPING LABELS
With Pro and Business, you get your Vinted shipping label in the app as soon as it is ready: all that's left is to print it. Leboncoin and eBay: coming soon.

YOUR NUMBERS, NO SPREADSHEET
Purchase price, sale price, margin, sales by marketplace: everything stays up to date.

WITH OR WITHOUT A COMPUTER
Without the Cloud, the free Chrome extension posts, bumps and removes your listings from your computer, on with Chrome open. Switched off, nothing is lost: everything waits for the next time it opens.
With FillSell Cloud, no computer needed: everything runs on our servers, 24/7. Connect your marketplaces from your phone, and your listings go out even with your computer off. An add-on to any plan, even the free one. 7 days free, once per person.
On eBay France, FillSell publishes through eBay's official interface, with or without the Cloud.

NEVER YOUR PASSWORD
FillSell never knows or keeps your passwords: with the extension, you stay signed in within your browser; with the Cloud, you sign in yourself on each marketplace's own page, and only your sessions are kept, encrypted.

PLANS, PER MONTH
• Free, to get started: 5 listings, 50 publications, 30 bumps.
• Premium, to sell more: 40 listings, 400 publications, 1,500 bumps, 5 AI touch-ups.
• Pro, so it all runs on its own: 120 listings, 1,200 publications, unlimited bumps, automatic reposting, Vinted shipping labels, 20 AI touch-ups.
• Business, to publish without counting: everything unlimited, except Lens (600 a month) and AI touch-ups (50 a month).
1 listing = one AI write-up or one Lens scan · 1 publication = one listing put online on one marketplace · 1 bump = one repost on one marketplace. Imports, syncs and removals never count.
Monthly subscriptions with no commitment, renewed automatically: cancel any time in Google Play, under Subscriptions. The price of each plan is shown in the app before any purchase.

FillSell is not affiliated with, endorsed or sponsored by any of the marketplaces mentioned (Vinted, Leboncoin, eBay, Beebs, Depop).

Help: https://fillsell.app/faq · support@fillsell.app
Privacy: https://fillsell.app/legal?lang=en#confidentialite
Terms of use and sale: https://fillsell.app/legal?lang=en#cgu
```
### 3.3 App Store — abonnements (à coller ce soir)

Nom affiché ≤ 30, description ≤ 45.

| Produit | fr-FR | en-US |
|---|---|---|
| `app.fillsell.premium.standard` | FillSell Premium — 40 annonces et 400 publications par mois | FillSell Premium — 40 listings and 400 publications a month |
| `app.fillsell.pro2.sub` | FillSell Pro — Republication auto et bordereaux Vinted | FillSell Pro — Auto reposting and Vinted shipping labels |
| `app.fillsell.business.sub` | FillSell Business — Tout illimité, sauf Lens et retouches IA | FillSell Business — Unlimited, except Lens and AI touch-ups |
| `app.fillsell.cloud.sub` | FillSell Cloud — Tes annonces publiées sans ordinateur | FillSell Cloud — Your listings posted, no computer needed |

Noms de groupes : « FillSell Plan » → FR « Formules FillSell », EN « FillSell plans » ; « FillSell Cloud » → FR « FillSell Cloud », EN « FillSell Cloud ».

Notes pour la revue (anglais, le relecteur lit l'anglais) :

- `app.fillsell.premium.standard`

  ```
  Monthly auto-renewable plan (group "FillSell Plan", level 2). Includes each month: 40 listings (one AI write-up or one Lens scan each), 400 publications (one listing put online on one marketplace), 1,500 bumps (one repost on one marketplace) and 5 AI photo touch-ups. Imports, syncs and removals never count. Where: Settings > Subscription > plans sheet. The price is shown before purchase; cancellation is managed in the App Store account settings.
  ```
- `app.fillsell.pro2.sub`

  ```
  Monthly auto-renewable plan (group "FillSell Plan", level 2). Includes each month: 120 listings, 1,200 publications, unlimited bumps, automatic reposting (the user picks days and a time slot), Vinted shipping labels retrieved in the app, and 20 AI photo touch-ups. Where: Settings > Subscription > plans sheet. The price is shown before purchase.
  ```
- `app.fillsell.business.sub`

  ```
  Monthly auto-renewable plan (group "FillSell Plan", level 1). Everything unlimited (listings, publications, bumps), except Lens (600 scans a month) and AI photo touch-ups (50 a month). Includes everything in Pro (automatic reposting, Vinted shipping labels). Where: Settings > Subscription > plans sheet. The price is shown before purchase.
  ```
- `app.fillsell.cloud.sub`

  ```
  FillSell Cloud is an optional add-on in its own subscription group, separate from the plans. It runs the user's marketplace tasks (posting, reposting, removing listings, reading sales) on FillSell servers, so no computer is needed. It can be taken on its own with the free plan or on top of any plan; it keeps the volumes of the user's plan. 1-week free trial for new subscribers (once per person). The user connects each marketplace from the in-app "Sign in" screen, which only shows that marketplace's own sign-in page. Cancel any time in the App Store account settings. Where: [À COMPLÉTER sur le build 2.9 : chemin exact de l’écran d’achat du Cloud]. A demo account with the offer visible is provided in the App Review information.
  ```

Cloud, offre d'introduction : Prix de l'abonnement › « Configurer une offre d'introduction » › tous les pays › début aujourd'hui › sans fin › **Gratuit** › **1 semaine** (le webhook reconnaît l'essai à `offerType = 1` + `FREE_TRIAL`).

### 3.4 Google Play — abonnements

En ligne depuis le 04/11 (textes neutres, vrais aujourd'hui et en 2.9) :

| Produit | Nom | Avantages | Description interne |
|---|---|---|---|
| `app.fillsell.premium.standard` | FillSell Premium | Plus d'annonces IA chaque mois · Plus de remontées chaque mois · Retouche photo par IA · Support par e-mail | Formule Premium mensuelle : plus d'annonces IA et de remontées chaque mois, retouche photo par IA, support par e-mail. |
| `app.fillsell.pro.sub` | FillSell Pro | Republication automatique · Encore plus d'annonces et de remontées · Retouche photo par IA · Support prioritaire | Formule Pro mensuelle : republication automatique, encore plus d'annonces et de remontées, retouche photo par IA, support prioritaire. |
| `app.fillsell.business.sub` | FillSell Business | Remontées sans limite · Republication automatique · Le plus d'annonces chaque mois · Support prioritaire | Formule Business mensuelle : remontées sans limite, republication automatique, le plus d'annonces chaque mois, support prioritaire. |
| `app.fillsell.cloud.sub` | FillSell Cloud | Tes annonces publiées, PC éteint · Tout depuis ton téléphone · Publie, remonte et retire 24 h/24 · En option sur toutes les formules | Option séparée des formules : publication, remontée et retrait des annonces depuis les serveurs FillSell, sans ordinateur. Essai 7 jours (offre cloud-trial-3d). |

Le jour du binaire 2.9 (grille à 3 jauges en service), remplacer les avantages par :

| Produit | Avantages 2.9 |
|---|---|
| `app.fillsell.premium.standard` | 40 annonces par mois · 400 publications par mois · 1 500 remontées par mois · 5 retouches IA par mois |
| `app.fillsell.pro.sub` | Republication automatique · Remontées illimitées · Bordereaux Vinted inclus · 120 annonces, 1 200 publications |
| `app.fillsell.business.sub` | Tout illimité · Sauf Lens : 600 scans par mois · Retouches IA : 50 par mois · Tout le Pro, support prioritaire |

Cloud : avantages inchangés le jour du binaire.

## 4. Captures d'écran à refaire avec le build 2.9 (les actuelles restent en place)

Google Play, 4 captures téléphone (fr-FR, relues le 04/11) :
1. « Une photo. Ta fiche est prête. » (Lens) — garder ; à reprendre seulement si l'écran a changé.
2. « Publie partout, en un geste. » — **à refaire** : liste des plateformes sans Depop, et pas de coût affiché avant publication
   (« Cette publication utilisera 1 annonce et 3 publications… »).
3. « Vendu ici, retiré partout. » — garder.
4. « Tout ton business, un seul écran. » — **à refaire** : affiche « Bonjour Nico » et des chiffres hors compte de démonstration.

À ajouter (nouveautés 2.9, compte de démonstration) :
5. Les formules avec les 3 jauges (annonces · publications · remontées).
6. FillSell Cloud : « sans ordinateur », 7 jours offerts, écran « Me connecter ».
7. Bordereau Vinted récupéré dans l'app (formule Pro).

App Store : non relues aujourd'hui (session expirée). Même série attendue (`docs/seo/hors-site/fiches-stores.md` § 5 signalait déjà
la 4ᵉ capture) ; à vérifier ce soir. Capture de revue du Cloud (obligatoire) : écran d'achat du Cloud sur le build 2.9.

## 5. Ce qui reste bloqué ou à décider
- **Apple, tout** : session expirée, Nico absent (sa consigne : « on verra ce soir »). Rien de modifié chez Apple.
- **Google, envoi de la fiche** : à l'étape « Avis » de la fiche, Google demande une « Déclaration relative aux éléments d'IA »
  (signaler ou non des éléments créés avec l'IA ; les textes ont été rédigés avec Claude). C'est une déclaration de Nico : je ne
  l'ai pas cochée, la fiche reste en brouillon. Au moment du binaire : fiche › Suivant › déclaration › Enregistrer, puis
  « Vue d'ensemble de la publication » › envoyer avec la release. (Publication gérée : désactivée — une fois approuvé, tout part.)
- **Cloud 24,99 € côté app et Stripe** : `CLOUD_PRIX_AFFICHE` (`src/utils/palier.js`) dit encore 20 € ; les conditions du Cloud
  (`src/cloud/conditionsCloud.js`, `src/cloud/textesLegaux.js`) disent 20 € ; le prix Stripe `price_1UMuLDQZRA77vrWJZfZh2IS4` est
  à 20 €. Les stores sont à 24,99 € en zone euro (Google fait ; Apple ce soir). Le prix affiché doit être le prix facturé :
  à aligner dans le binaire 2.9 (code) et chez Stripe (ordre de Nico). Je n'ai touché ni au code ni à Stripe.
- **Cloud et relecteurs** : `CLOUD_OFFER_ENABLED = false` et `CLOUD_OFFRE_TEMOINS` vide. Les textes 2.9 promettent le Cloud : il
  doit être visible au relecteur Apple/Google (compte de démonstration dans `CLOUD_OFFRE_TEMOINS`) et ouvert à la sortie.
- **Noms** : le nom FR de la 2.9 chez Apple est déjà « FillSell – Reseller App » (en ligne : « FillSell – Achat Revente ») —
  à confirmer par Nico. Google : titre « FillSell », inchangé.

## Annexe — les textes d'avant
- Google, descriptions FR et EN d'avant le 04/11 : identiques au corps des descriptions Apple de la 2.8 en ligne (sans la ligne
  EULA) — relisibles dans App Store Connect (version 2.8) tant que la 2.9 n'est pas sortie.
- Google, avantages d'avant : tableau du § 1.
- Source des textes : `textes.mjs` (brouillon de session) ; comptes refaits à chaque génération.
