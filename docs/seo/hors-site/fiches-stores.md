# Fiches App Store, Google Play et Chrome Web Store — textes prêts à coller (09/10/2026, nuit)

> Chantier SEO/GEO, partie hors site. **Nico colle lui-même** : rien n'a été changé dans les stores.
> Remplace la version du 09/10 au soir (audit détaillé des fiches actuelles : historique git de ce
> fichier, commit `ff6f8f2`). Règles tenues : français d'abord (tutoiement), « crosslisting » et
> Depop partout, aucune plateforme retirée le 10/10 nommée, aucun volume chiffré, éditeur unifié,
> la republication automatique dite **réservée aux abonnements qui la comprennent** sans palier nommé
> à côté (règle 2.3.2 d'Apple : dire ce qui demande un achat), vente enregistrée seule **seulement
> sur Vinted et eBay** (Leboncoin, Beebs, Depop : confirmation d'un appui — `site/donnees/plateformes.yml`).
> Comptes de caractères faits par script (`node docs/seo/hors-site/compter-fiches.mjs`), limites
> relues le 09/10 (sources en fin de fichier).

---

## 0. Quoi, où, et faut-il un nouveau binaire ?

| Store | Champ | Limite | Sans nouveau binaire ? | Quand le coller |
|---|---|---|---|---|
| App Store | Texte promotionnel | 170 | **Oui** — seul champ modifiable sur la version en ligne, sans examen | dès le 10/10 |
| App Store | Nom | 30 | **Non** — avec la prochaine version soumise (un build neuf) | au prochain binaire |
| App Store | Sous-titre | 30 | **Non** — idem | au prochain binaire |
| App Store | Description | 4 000 | **Non** — idem | au prochain binaire |
| App Store | Mots-clés | 100 octets | **Non** — idem | au prochain binaire |
| App Store | Nouveautés | 4 000 | **Non** — idem | au prochain binaire |
| Google Play | Titre | 30 | **Oui** — Play Console › Fiche principale, passe à l'examen | dès le 10/10 |
| Google Play | Description courte | 80 | **Oui** | dès le 10/10 |
| Google Play | Description longue | 4 000 | **Oui** | dès le 10/10 |
| Google Play | Nom du développeur | — | **Oui** — Play Console › Compte de développeur | dès le 10/10 |
| Chrome Web Store | Description détaillée | 16 000 | **Oui** — tableau de bord › Fiche, passe à l'examen | dès le 10/10 |
| Chrome Web Store | Nom de l'éditeur | — | **Oui** — tableau de bord › Compte | dès le 10/10 |
| Chrome Web Store | Nom de l'extension | 75 | **Non** — champ `name` du manifeste : un paquet neuf (0.6.107 ou plus) | au prochain paquet |
| Chrome Web Store | Résumé | 132 | **Non** — champ `description` du manifeste : idem | au prochain paquet |

⚠️ Les liens `fillsell.app/comment-ca-marche` et `fillsell.app/securite-des-comptes` n'existent
qu'**une fois le nouveau site en ligne** (fusion sur `main`) : coller les descriptions qui les
portent APRÈS cette mise en ligne, ou retirer ces deux lignes.

⚠️ **Republication automatique de Depop** : les textes ci-dessous disent l'automatique sur Vinted,
Leboncoin et Beebs (vrai aujourd'hui dans l'app). Le jour où le lot Depop la rend activable dans
l'app, remplacer la ligne marquée **[D2]** par sa variante (donnée sous chaque texte).

---

## 1. App Store (App Store Connect)

### Nom (30) — FR et EN

```
FillSell – Crosslisting
```

### Sous-titre (30)

FR :
```
Une annonce, 5 plateformes
```
EN :
```
One listing, 5 marketplaces
```

### Texte promotionnel (170)

FR :
```
Vinted, Leboncoin, eBay, Beebs et Depop dans une seule app : une photo, l'annonce est écrite, publiée où tu veux, et retirée ailleurs une fois vendue.
```
EN :
```
Vinted, Leboncoin, eBay, Beebs and Depop in one app: one photo and your listing is written, posted where you choose, and removed elsewhere once sold.
```

### Mots-clés (100 octets, sans espace, mots déjà dans le nom ou le sous-titre non répétés)

FR :
```
vinted,leboncoin,ebay,beebs,depop,achat,revente,republier,remonter,vendre,vetement,stock,marge,lot
```
EN :
```
vinted,leboncoin,ebay,beebs,depop,reseller,resell,relist,crosslist,inventory,profit,france,listing
```
Repli si Apple refuse les noms de plateformes (règle 2.3.7) — FR :
`revente,achat,republier,remonter,annonce,vendre,vetement,occasion,seconde,main,stock,marge,lens` ;
EN : `reseller,resell,relist,crosslist,crosspost,inventory,profit,margin,listing,secondhand,france,lens`.

### Description (4 000) — FR

```
Vinted, Leboncoin, eBay, Beebs et Depop. Une seule app.

FillSell est l'app de crosslisting (multi-publication) que tu pilotes depuis ton téléphone : tu écris ton annonce une fois, FillSell la publie sur les plateformes que tu coches, range tout ton stock au même endroit et retire les autres annonces quand l'article se vend.

UNE PHOTO, L'ANNONCE EST ÉCRITE
Prends l'article en photo : Lens reconnaît l'objet, lit la marque, propose un état et un prix à partir d'annonces comparables, puis rédige le titre et la description. Tu relis, tu corriges, tu publies.

UNE ANNONCE, CINQ PLATEFORMES
Tu remplis une fois. Chaque plateforme reçoit une annonce adaptée à ses rubriques : catégorie, taille, couleur, colis. S'il manque une info, l'app te la demande. Tout un lot ? Tu le publies d'un coup.

TOUT TON STOCK, IMPORTÉ EN UN APPUI
Un appui sur « Synchroniser » et tes annonces déjà en ligne sur Vinted, Leboncoin, eBay, Beebs et Depop arrivent dans ton stock, rangées. Un même article en ligne sur plusieurs plateformes devient une seule fiche ; au moindre doute, FillSell te pose la question au lieu de deviner. Gratuit et sans limite.

VENDU ICI, RETIRÉ LÀ-BAS
Quand Vinted ou eBay marque ton article vendu, FillSell enregistre la vente tout seul. Sur Leboncoin, Beebs et Depop, il te demande de confirmer d'un appui. Dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article. Au moindre doute sur une annonce, il te demande « Déjà vendu ? » avant d'y toucher.

TES ANNONCES REMONTENT
Republier, c'est retirer l'annonce puis la remettre en ligne : elle repart en haut des résultats, mais ses vues et ses favoris repartent de zéro. Tu remontes une annonce en un appui.
Avec les abonnements qui la comprennent, la republication automatique remonte aussi tes annonces toutes seules sur Vinted, Leboncoin et Beebs, les jours et au créneau que tu choisis, à un rythme humain, ordinateur allumé. Tu coupes tout d'un geste.

TA MARGE SE CALCULE TOUTE SEULE
Prix d'achat, prix de vente, marge, ventes par plateforme : tes chiffres sont à jour sans tableur. Un article dont tu ne connais pas le prix d'achat est écarté du calcul plutôt que compté comme gratuit. Ton stock n'a pas de limite d'articles, même sans abonnement. Export Excel, import Excel ou CSV.

TON TÉLÉPHONE DÉCIDE, TON ORDINATEUR EXÉCUTE
L'extension Chrome gratuite, installée une fois sur ton ordinateur, fait le travail sur Vinted, Leboncoin, Beebs et Depop : elle remplit les formulaires, relit tes annonces, repère tes ventes, retire et republie tes annonces, une à une, à un rythme humain. Pour que tes annonces partent, ton ordinateur doit être allumé avec Chrome ouvert ; éteint, rien n'est perdu : tout attend la prochaine ouverture de Chrome. Sur eBay France, une fois ton compte relié, FillSell publie par l'interface officielle d'eBay, même ordinateur éteint.

JAMAIS TON MOT DE PASSE
FillSell ne te demande jamais tes mots de passe Vinted, Leboncoin, Beebs ou Depop : tu restes connecté(e) à tes comptes dans ton navigateur, et l'extension travaille dans ces sessions. Pour Depop, tu autorises l'accès d'un clic dans l'extension. Pour eBay, tu relies ton compte depuis la page officielle d'eBay.

GRATUIT POUR COMMENCER
Sans carte bancaire, sans date de fin. Les abonnements mensuels sont sans engagement ; ce que comprend chacun et son prix s'affichent dans l'app avant tout achat. La retouche photo par IA et la republication automatique demandent un abonnement qui les comprend.

AUJOURD'HUI
Vinted France, Leboncoin, eBay France, Beebs et Depop, pour les vendeurs installés en France. App en français et en anglais.

FillSell n'est affilié à aucune des plateformes citées (Vinted, Leboncoin, eBay, Beebs, Depop), ni approuvé ni sponsorisé par elles. Leurs noms et marques appartiennent à leurs titulaires respectifs.

Comment ça marche : fillsell.app/comment-ca-marche
Tes comptes en sécurité : fillsell.app/securite-des-comptes
Une question ? support@fillsell.app
```

**[D2]** variante de la ligne de l'automatique, le jour où Depop y entre dans l'app :
`Avec les abonnements qui la comprennent, la republication automatique remonte aussi tes annonces toutes seules sur Vinted, Leboncoin, Beebs et Depop, les jours et au créneau que tu choisis, à un rythme humain, ordinateur allumé. Tu coupes tout d'un geste.`

### Description (4 000) — EN

```
Vinted, Leboncoin, eBay, Beebs and Depop. One app.

FillSell is the crosslisting (cross-posting) app you run from your phone: write your listing once, FillSell publishes it on the marketplaces you tick, keeps your whole stock in one place and removes the other listings once the item sells.

ONE PHOTO, YOUR LISTING IS WRITTEN
Take a photo of the item: Lens recognises it, reads the brand, suggests a condition and a price based on comparable listings, then writes the title and description. You check, you edit, you publish.

ONE LISTING, FIVE MARKETPLACES
Fill it in once. Each marketplace gets a listing adapted to its own fields: category, size, colour, parcel. If anything's missing, the app asks you. A whole batch? Publish it in one go.

YOUR WHOLE LIVE STOCK, IMPORTED IN ONE TAP
One tap on "Sync" and your listings already live on Vinted, Leboncoin, eBay, Beebs and Depop land in your stock, neatly filed. The same item live on several marketplaces becomes a single card; if in doubt, FillSell asks you instead of guessing. Free and unlimited.

SOLD HERE, REMOVED THERE
When Vinted or eBay marks your item as sold, FillSell records the sale for you. On Leboncoin, Beebs and Depop, it asks you to confirm with one tap. As soon as a sale is recorded, FillSell removes the item's other listings. If there's any doubt about a listing, it asks "Already sold?" before touching it.

YOUR LISTINGS BUMP BACK UP
Reposting means removing the listing and putting it back online: it goes back to the top of the results, but its views and favourites start from zero. Bump a listing with one tap.
With the subscriptions that include it, automatic reposting also bumps your listings back up on Vinted, Leboncoin and Beebs, on the days and in the time slot you choose, at a human pace, computer on. Switch it all off in one tap.

YOUR MARGIN WORKS ITSELF OUT
Purchase price, sale price, margin, sales by marketplace: your figures stay current without a spreadsheet. An item with an unknown purchase price is left out of the calculation rather than counted as free. No limit on your stock, even without a subscription. Excel export, Excel or CSV import.

YOUR PHONE DECIDES, YOUR COMPUTER DOES THE WORK
The free Chrome extension, installed once on your computer, does the legwork on Vinted, Leboncoin, Beebs and Depop: it fills in the forms, reads your listings, spots your sales, removes and reposts your listings — one at a time, at a human pace. For your listings to go out, your computer must be on with Chrome open; computer off, nothing is lost: everything waits for the next time Chrome opens. On eBay France, once your account is linked, FillSell publishes through eBay's official interface, even with your computer off.

NEVER YOUR PASSWORD
FillSell never asks for your Vinted, Leboncoin, Beebs or Depop passwords: you stay signed in to your accounts in your browser, and the extension works within those sessions. For Depop, you allow access with one click in the extension. For eBay, you link your account through eBay's official page.

FREE TO START
No credit card, no end date. Monthly subscriptions come with no commitment; what each one includes and its price are shown in the app before any purchase. AI photo touch-up and automatic reposting need a subscription that includes them.

TODAY
Vinted France, Leboncoin, eBay France, Beebs and Depop, for sellers based in France. The app is in French and English; listings for French marketplaces are written in French.

FillSell is not affiliated with, endorsed or sponsored by any of the marketplaces mentioned (Vinted, Leboncoin, eBay, Beebs, Depop). Their names and trademarks belong to their respective owners.

Website: fillsell.app/en
Questions? support@fillsell.app
```

**[D2]** EN : `With the subscriptions that include it, automatic reposting also bumps your listings back up on Vinted, Leboncoin, Beebs and Depop, on the days and in the time slot you choose, at a human pace, computer on. Switch it all off in one tap.`

### Nouveautés de la prochaine version (4 000 ; garder ≤ 500 pour Google Play)

FR :
```
• Depop rejoint FillSell : publie, synchronise et retire tes annonces Depop avec le reste de ton stock.
• Une notification quand FillSell enregistre une vente (à activer dans Réglages).
• Corrections et fiabilité.
```
EN :
```
• Depop joins FillSell: post, sync and remove your Depop listings along with the rest of your stock.
• A notification when FillSell records a sale (switch it on in Settings).
• Fixes and reliability.
```
(La notification de vente ne vaut que si le binaire publié est ≥ 2.9.62 ; sinon, retirer la ligne.)

---

## 2. Google Play (Play Console › Croissance › Présence sur le Store › Fiche principale)

### Titre (30)

```
FillSell – Crosslisting
```

### Description courte (80)

FR :
```
Vinted, Leboncoin, eBay, Beebs et Depop : une annonce, publiée sur chacune.
```
EN :
```
Vinted, Leboncoin, eBay, Beebs and Depop: one listing, posted to each.
```

### Description longue (4 000)

La même que l'App Store (§ 1), FR et EN, **avec la même ligne [D2]**.

---

## 3. Chrome Web Store (tableau de bord du développeur)

### Nom de l'extension (75) — manifeste, prochain paquet

```
FillSell — Crosslisting Vinted, Leboncoin, eBay, Beebs, Depop
```

### Résumé (132) — manifeste, prochain paquet

FR (le manifeste n'a qu'une langue tant qu'il n'y a pas de dossier `_locales`) :
```
Publie tes annonces FillSell sur Vinted, Leboncoin, Beebs et Depop, puis retire les autres une fois l'article vendu.
```
(eBay n'est pas dans le résumé : sur eBay, FillSell publie par l'interface officielle, sans l'extension.)

### Description détaillée — FR

```
L'extension Chrome de FillSell, l'app de crosslisting (multi-publication) que tu pilotes depuis ton téléphone. Tu prépares ton annonce une fois dans FillSell (iPhone, Android ou fillsell.app) ; l'extension la publie sur Vinted, Leboncoin, Beebs et Depop depuis ton ordinateur, dans tes propres sessions. Sur eBay France, FillSell publie par l'interface officielle d'eBay.

CE QUE FAIT L'EXTENSION
- Elle remplit le formulaire de dépôt de chaque plateforme, une annonce à la fois, à un rythme humain.
- Quand tu appuies sur « Synchroniser », elle relit tes annonces déjà en ligne : tout ton stock arrive dans FillSell, rangé. Gratuit et sans limite.
- Elle repère tes ventes. Quand Vinted ou eBay marque ton article vendu, FillSell enregistre la vente ; sur Leboncoin, Beebs et Depop, tu confirmes d'un appui. Puis FillSell retire les autres annonces de l'article. Au moindre doute, il te demande « Déjà vendu ? » avant d'y toucher.
- Elle republie tes annonces à la demande. Avec les abonnements qui la comprennent, elle les remonte aussi toutes seules sur Vinted, Leboncoin et Beebs, les jours et au créneau que tu choisis.

JAMAIS TON MOT DE PASSE
L'extension travaille dans les sessions où tu es déjà connecté(e) : FillSell ne te demande jamais tes mots de passe Vinted, Leboncoin, Beebs ou Depop. Pour Depop, tu autorises l'accès d'un clic dans l'extension. eBay France se relie depuis la page officielle d'eBay ; une fois relié, FillSell y publie même ordinateur éteint.

BON À SAVOIR
- Pour que tes annonces partent, ton ordinateur doit être allumé avec Chrome ouvert ; tant qu'il en reste à publier, l'extension empêche la mise en veille. Éteint, rien n'est perdu : tout attend la prochaine ouverture de Chrome.
- Elle travaille dans une fenêtre réduite, sans prendre la main sur ce que tu fais.
- Une seule extension FillSell par navigateur.
- Il te faut un compte FillSell : gratuit pour commencer, sans carte bancaire, puis des abonnements mensuels sans engagement (prix sur fillsell.app/tarifs).

Aujourd'hui : Vinted France, Leboncoin, eBay France, Beebs et Depop, pour les vendeurs installés en France.

FillSell n'est affilié à aucune des plateformes citées (Vinted, Leboncoin, eBay, Beebs, Depop), ni approuvé ni sponsorisé par elles.

Comment ça marche : https://fillsell.app/comment-ca-marche
Tarifs : https://fillsell.app/tarifs
Support : support@fillsell.app
```

**[D2]** : `- Elle republie tes annonces à la demande. Avec les abonnements qui la comprennent, elle les remonte aussi toutes seules sur Vinted, Leboncoin, Beebs et Depop, les jours et au créneau que tu choisis.`

### Description détaillée — EN (si une langue anglaise est ajoutée à la fiche)

```
The Chrome extension for FillSell, the crosslisting (cross-posting) app you run from your phone. Prepare your listing once in FillSell (iPhone, Android or fillsell.app); the extension publishes it on Vinted, Leboncoin, Beebs and Depop from your computer, within your own sessions. On eBay France, FillSell publishes through eBay's official interface.

WHAT THE EXTENSION DOES
- It fills in each marketplace's listing form, one listing at a time, at a human pace.
- When you tap "Sync", it reads the listings you already have online: your whole stock lands in FillSell, neatly filed. Free and unlimited.
- It spots your sales. When Vinted or eBay marks your item as sold, FillSell records the sale; on Leboncoin, Beebs and Depop, you confirm with one tap. Then FillSell removes the item's other listings. If there's any doubt, it asks "Already sold?" before touching anything.
- It reposts your listings on request. With the subscriptions that include it, it also bumps them back up by itself on Vinted, Leboncoin and Beebs, on the days and in the time slot you choose.

NEVER YOUR PASSWORD
The extension works within the sessions you are already signed in to: FillSell never asks for your Vinted, Leboncoin, Beebs or Depop passwords. For Depop, you allow access with one click in the extension. eBay France is linked through eBay's official page; once linked, FillSell publishes there even with your computer off.

GOOD TO KNOW
- For your listings to go out, your computer must be on with Chrome open; while listings are queued, the extension keeps the computer from going to sleep. Computer off, nothing is lost: everything waits for the next time Chrome opens.
- It works in a minimised window, without taking over what you are doing.
- One FillSell extension per browser.
- You need a FillSell account: free to start, no credit card, then monthly subscriptions with no commitment (prices at fillsell.app/en/pricing).

Today: Vinted France, Leboncoin, eBay France, Beebs and Depop, for sellers based in France. The extension's own panel is in French.

FillSell is not affiliated with, endorsed or sponsored by any of the marketplaces mentioned (Vinted, Leboncoin, eBay, Beebs, Depop).

Website: https://fillsell.app/en
Pricing: https://fillsell.app/en/pricing
Support: support@fillsell.app
```

---

## 4. Nom d'éditeur unifié : « FillSell »

| Store | Aujourd'hui | Geste | Possible ? |
|---|---|---|---|
| Google Play | un pseudonyme de studio | Compte de développeur › nom affiché : **FillSell** | oui, tout de suite (les mentions légales restent dans « À propos du développeur ») |
| Chrome Web Store | nom civil complet | Compte › nom de l'éditeur : **FillSell** | oui, tout de suite (adresse et téléphone restent : obligation UE) |
| App Store | nom civil (compte **individuel**) | — | **non** sans compte « organisation » : Apple l'exige d'une personne morale avec numéro D-U-N-S, et refuse les noms commerciaux d'un particulier. Le copyright « © 2026 FillSell » et le site du développeur fillsell.app restent la marque visible. |

---

## 5. Hors texte, à faire en même temps (rappel court)

- **Captures** : retirer celles qui montrent le prénom de l'équipe et des chiffres hors compte de
  démonstration (4ᵉ capture actuelle, App Store et Play) ; nouvelle série tirée de
  `site/medias/captures/` (compte de démonstration « Camille »), aux tailles exigées (App Store
  1320×2868, Google Play 1080×1920, Chrome Web Store 1280×800). Aucune capture ne montre la
  republication automatique avec un nom d'abonnement à côté.
- **Achats intégrés (App Store)** : retirer les anciens packs de crédits retirés de l'app en
  septembre et le doublon « Fill & Sell Premium » (vérifier d'abord qu'aucun abonné n'y reste).
- **Statut de commerçant (App Store)** : la fiche dit encore que le fournisseur « ne s'est pas
  identifié comme commerçant » ; Google Play et le Chrome Web Store déclarent FillSell professionnel.
- **Langue (App Store)** : la fiche affiche « Anglais » seulement : c'est le binaire (aucune
  localisation française déclarée dans le projet iOS) — chantier de l'app, prochain binaire.

---

## Sources (lues le 09/10/2026)

- App Store : champs et ce qui se change sans nouvelle version —
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information ;
  règles 2.3.2, 2.3.7, 2.3.10 — https://developer.apple.com/app-store/review/guidelines/ ;
  compte organisation — https://developer.apple.com/programs/enroll/
- Google Play : limites 30 / 80 / 4 000 — https://support.google.com/googleplay/android-developer/answer/9859152 ;
  règles de métadonnées — https://support.google.com/googleplay/android-developer/answer/9898842
- Chrome Web Store : nom ≤ 75 — https://developer.chrome.com/docs/extensions/reference/manifest/name ;
  résumé ≤ 132 — https://developer.chrome.com/docs/webstore/best-listing ;
  nom de l'éditeur — https://developer.chrome.com/docs/webstore/set-up-account
- Ce que fait l'app : `site/donnees/plateformes.yml` (vente enregistrée seule : Vinted, eBay ;
  republication automatique : Vinted, Leboncoin, Beebs, et Depop une fois le lot Depop en ligne) ;
  réservation de l'automatique aux abonnements Pro et Business : fonction `republish_planifiee_etat`
  (base de prod, lue le 09/10).
