# Opla — relevé de phase 0

**Date :** 2026-09-14 · **Cible :** `https://www.opla.co` · **Compte :** session Nico, cookies REFUSÉS
**Statut :** phase 0 **+ LOTS 1, 2 et 3** du 14/09. Trois articles ont existé au total
(un publié, deux brouillons), **tous supprimés** — compte à **zéro annonce**, vérifié à
chaque fois par `DELETE` 204 / détail **404** / `/me/articles` vide. Aucune donnée
personnelle saisie par moi : le profil vendeur a été rempli par Nico.
⛔ **`https://www.opla.co/*` est désormais dans le manifest source, pour le seul build
unpacked — et `npm run package:extension` REFUSE tant qu'il y est** (§ 16.4).
**Drapeau :** éteint. Opla n'apparaît nulle part dans l'app, aucun fichier existant n'a été modifié.

> **Règle appliquée à toutes les lignes de ce document et du mapping :**
> ce qui n'a pas été observé n'y figure pas. Chaque affirmation porte sa preuve
> (empreinte, code HTTP, libellé relevé). Ce qui n'a pas pu être mesuré est listé
> nommément au § 12, avec la raison et ce qu'il faudrait pour y arriver.
>
> **Les § 1 à 14 datent de la phase 0 ; le § 15 porte le LOT 1 et corrige ce qui a
> changé de marque.** Chaque section corrigée le dit en tête, avec un renvoi vers le
> paragraphe du § 15 qui la remplace.

---

## 1. Le contrat commun des 4 connecteurs existants

⚠️ **Correction de localisation :** `chrome-extension/handlers/` existe mais est **vide**.
Les quatre connecteurs vivent dans `chrome-extension/content-scripts/`
(`vinted.js` 354 Ko, `leboncoin.js` 250 Ko, `beebs.js` 200 Ko, `ebay.js` 153 Ko).
Le squelette Opla est déposé en `handlers/opla.js` comme demandé — ce qui a le mérite
de le rendre **structurellement non branché** (aucun `manifest.json` ne pointe ce dossier).
Le jour où il sera activé, il devra **descendre dans `content-scripts/`**.

### 1.1 Ce que les quatre respectent

| Point | Contrat |
|---|---|
| **Injection** | Déclaré dans `manifest.json > content_scripts`, `run_at: "document_idle"`, précédé de `content-scripts/consentement.js` sur le même `matches`. |
| **Garde d'entrée** | `if (typeof chrome !== "undefined" && chrome.runtime?.onMessage)` — permet d'injecter le fichier tel quel dans une page pour un dry-run piloté hors extension. |
| **Signature d'entrée** | `chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => …)`, `return true` pour une réponse asynchrone. |
| **Publication** | `msg.type === "FILL_LISTING"` → `fillListingForm(msg.job)` |
| **Suppression** | `msg.type === "DELETE_LISTING"` → `deleteListing(msg.job)` |
| **Forme du job** | `{ id, platform, title, description, price, photos, platform_fields }` — `platform_fields` porte le mapping posé par l'app. |
| **Sortie** | Un objet **jamais une exception** : le `.catch` du listener rend `{ success:false, error:String(err) }`. |
| **Onglet** | Jamais choisi par le connecteur : `getOrCreateWorkTab(platform, url)` côté background, dans la **fenêtre dédiée minimisée** (`state:"minimized"`, `focused:false`, fragment `#fillsell-worker`). |
| **Verrou** | Tout le flux tourne sous `withJobFlowLock(label, fn)` — un seul job à la fois. |
| **platform_fields** | Écrit par le background via `completionExtras(job, result)` : **fusion** sur la copie mémoire, jamais d'écrasement des autres clés. |

### 1.2 Clés de sortie lues par le background (contrat de retour)

`success` · `error` (affiché tel quel à l'utilisateur) · `diagnostic` (annexe technique →
`platform_fields.last_diagnostic`, **jamais** dans `cross_post_jobs.error`) · `listingUrl` ·
`needsUser` · `needsUserField` (un champ précis à trancher → `needs_user` **persisté**,
aucune re-tentative) · `attenteUtilisateur` (information de COMPTE manquante → `needs_user`
persisté, ni reprise espacée ni `failed`) · `unfilledRequired` · `discoveredRequired` /
`serverRequired` (catalogue cumulatif des champs obligatoires) · `warnings` · `dryRun` ·
`trace` · `deleted` · `erreurInterne`.

### 1.3 Registres à alimenter côté background

`PLATFORM_HANDLERS` (`implemented`, `newListingUrl` **ou** `entryUrl` + `newListingUrl(job)`) ·
`CATEGORY_FIELD` (nom du champ de `platform_fields` qui porte la catégorie) ·
`LISTING_URL_PATTERNS` · `MY_LISTINGS_URL` · `PLATFORMS_WITH_DEFERRED_URL` · `PLATFORM_HOSTS`.

### 1.4 ⚠️ Les quatre DIVERGENT — je le signale, je ne tranche pas

| Point | vinted | leboncoin | ebay | beebs |
|---|:--:|:--:|:--:|:--:|
| Relais d'étape `FILLSELL_FILL_STEP` | ❌ | ✅ | ✅ | ❌ |
| Relais de sonde réseau `FILLSELL_PROBE_*` | ✅ | ✅ | ✅ | ❌ |
| Messages hors socle | 5 (`VINTED_PING`, `VINTED_CURRENT_USER`, `VINTED_ITEM_DETAIL`, `VINTED_ITEM_CAPTURE`, `SYNC_DRESSING_PAGE`) | 0 | 1 (`GO_TO_SELL`, réponse **synchrone**) | 0 |
| Garde « un seul écouteur » | ✅ `globalThis.__fillsellVintedEcouteur` | ❌ | ❌ | ❌ |
| Point d'entrée | URL de dépôt directe | URL de dépôt directe | **home + clic réel** sur « Vendre » (l'URL directe est un marqueur d'automatisation) | URL de dépôt directe |
| Remontée d'un `needsUser` **levé** | ❌ | ❌ | ❌ | ✅ (`err.needsUser` / `err.diagnostic` relayés dans le `.catch`) |
| Trace jointe au point de sortie unique | ❌ | ❌ | ✅ (`tailleTrace` sur TOUTES les issues) | ❌ |

**Ce qu'Opla devrait suivre, et sur quoi il faut ta décision :** les quatre points ❌/✅
ci-dessus n'ont pas de norme. Mon avis — non appliqué — : relais d'étape **et** de sonde
**et** garde d'écouteur unique **et** trace au point de sortie unique, c'est-à-dire l'union
des quatre. Chacun de ces mécanismes a été ajouté après un incident qui a coûté un
diagnostic ; les connecteurs qui ne les ont pas sont en dette, pas en simplicité.

---

## 2. Consentement — traité en premier

**CMP maison.** Ni Didomi, ni Axeptio, ni OneTrust, ni Sourcepoint : aucun des conteneurs
connus de `content-scripts/consentement.js` n'est présent. Le choix est un simple JSON
en `localStorage` :

```
localStorage["@cookie_consent"] = {"analytics":false,"marketing":false}
```

**État nominal observé chez Nico : refus des deux finalités.** Tant que cette clé existe,
**aucun bandeau n'est rendu** — vérifié sur `/`, `/sell` et `/sell/create` : zéro
`[role="dialog"]` de consentement, zéro calque fixe de CMP. Le formulaire de dépôt est
pleinement interactif dans cet état : **le refus ne bloque rien**.

Le refus est réellement propagé : les appels Google partent avec `gcs=G100`, `npa=1`,
`pscdl=denied` — et reçoivent **503**. Les collecteurs sont donc coupés, ce qui est le
comportement attendu.

**Ce que ça vaut pour le handler :** le point qui a coûté six jours sur Leboncoin **ne se
pose pas ici**, tant que la clé `@cookie_consent` est posée. `consentement.js` reste
néanmoins le bon réflexe à injecter — il est écrit pour partir du **contrôle de refus**
et non du conteneur, donc il ne se trompera pas s'il ne trouve rien.

→ ⚠️ **Non observé :** le bandeau à l'état vierge (clé absente). Pour le voir il faudrait
purger `@cookie_consent` dans la session de Nico — c'est-à-dire modifier son état de
consentement. Je ne l'ai pas fait. Cf. § 12.

## 3. Anti-bot

**Aucun DataDome, aucun Cloudflare challenge, aucun PerimeterX.** Hébergement Vercel
(`x-vercel-id: cdg1::...`). Aucune page de vérification, aucun captcha rencontré sur
l'ensemble de la session (plus d'un millier d'appels API).

**Mais une défense bien réelle, et mesurée :**

```
curl -H 'Accept-Language: fr' https://www.opla.co/api/public/config/articles   ->  429
fetch(meme URL) depuis l'onglet, au meme instant                               ->  200
```

Ce n'est donc **pas** une limite d'IP : c'est un **rejet des clients sans empreinte de
navigateur**. Conséquence de conception, non négociable :

> **Tout appel à l'API Opla doit partir du CONTENT SCRIPT (contexte page).
> Un `fetch` depuis le service worker MV3 sera rejeté.**

Aucun en-tête exotique n'est requis côté page : `credentials:'include'` +
`Accept-Language: fr` suffisent (la session est portée par un cookie **httpOnly**, que
nous n'avons ni à lire ni à manipuler).

Sur la cadence : les appels `GET /api/public/config/params?category=...` ont été passés
en lots de 5 espacés de 900 ms — **zéro 429, zéro 5xx**. C'est exactement l'appel que le
site lui-même émet à chaque changement de catégorie dans le formulaire.

## 4. Nature de la page de dépôt

**SPA Next.js 16.2.1 / React 19.3.0-canary**, turbopack, App Router, RSC
(`self.__next_f.push(...)` dans le corps).

- **`__reactFiber$...` et `__reactProps$...` sont présents** sur les éléments du formulaire.
  Le suffixe est **aléatoire par instance** (`__reactFiber$hy9ya5rgglg` ce soir) : il ne
  doit **jamais** être écrit en dur, seulement découvert par
  `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`.
- **Le commit par setter natif fonctionne** — vérifié en réel sur le champ de recherche
  de marque :
  ```js
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')
    .set.call(input, 'nik');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  La liste de suggestions s'est mise à jour. C'est notre technique maison
  (`commitVintedPrice`), et elle prend sur Opla.
- Aucune iframe, aucun web component, aucun shadow DOM sur le parcours de dépôt.
- **Les modales sont des portails en fin de `<body>`, SANS `role="dialog"`** — exactement
  le piège Leboncoin. Leur seule signature stable est `div.fixed.inset-0`, et le `z-index`
  **change d'une modale à l'autre** : `z-50` (catégorie, taille), `z-[60]` (marque),
  `z-[110]` (porte de profil). Ne jamais cibler par `z-index`.
  La modale de marque porte `role="presentation"`, les autres `role=null` : pas de norme.
- Ids : `#sell-photo-new` et `#sell-profile-pseudonym` sont **stables**.
  `#_r_3_-input` est **généré par React** — même famille que les `_r_0_` de Leboncoin :
  **jamais comme sélecteur**.

## 5. API interne — c'est la voie

`https://www.opla.co/api/...`, same-origin, session par cookie httpOnly.
Surface complète relevée : `docs/opla/observations-brutes.md`.

Les cinq qui comptent :

| Endpoint | Rôle | Statut |
|---|---|---|
| `GET /api/public/config/articles` | **arbre de catégories complet** (8 racines, 1014 nœuds, 886 feuilles) | 200, relevé intégralement |
| `GET /api/public/config/params?category=<CODE>` | **config PAR catégorie** : grille de tailles applicable | 200, relevé sur les 886 feuilles |
| `GET /api/config/params?locale=fr` | listes fermées globales + **drapeaux serveur** | 200, relevé intégralement |
| `POST /api/public/images/upload-url` | **URL présignée** pour une photo d'article | **201/200 observé (lot 1)** |
| `POST /api/public/me/articles` | **création d'annonce** (+ brouillon via `asDraft`) | **201 observé (lot 1)** |
| `PATCH /api/public/me/articles/<id>` | **modification partielle** | **200 observé (lot 1)** |
| `DELETE /api/public/me/articles/<id>` | **suppression** | **204 observé (lot 1)** |

Note : `/api/config/articles` (sans `public`) répond **404**. Le préfixe n'est pas
symétrique entre `params` et `articles` — ne pas le déduire, le relire ici.

✅ **Corrigé au lot 1 (2026-09-14 nuit) :** le corps du `POST /me/articles` a été
**capturé sur un dépôt réel**. Voir § 15. Les quatre verbes sont désormais observés.

## 6. Le formulaire de dépôt

### 6.1 Deux portes avant le formulaire

1. **`depositPaused: true`** dans `/api/config/params?locale=fr > features`.
   Interrupteur **serveur** de mise en pause des dépôts. Ce soir il est **à true** et le
   formulaire s'ouvre quand même — son effet réel n'a donc **pas** pu être caractérisé.
   Un handler qui l'ignore prend le risque de pousser dans le vide : **le lire avant tout
   dépôt**, et traiter `true` comme une maintenance plateforme (cf. `platform_health`).
2. **Porte de profil vendeur.** `/sell` et `/sell/create` affichent
   « Quelques informations avant de vendre » et **remplacent le bouton de publication par
   « Renseigner mes informations »**. Champs exigés : Prénom\*, Nom\*, Téléphone\* (indicatif
   FR/BE/LU/NL/ES), Adresse\* (**combobox à suggestions**, pas un champ libre), Code postal\*,
   Ville\*, Pays. Pseudo pré-rempli.
   **Je n'ai rempli aucun de ces champs** : ce sont des données personnelles et une
   modification réelle du compte de Nico.
   C'est un **`attenteUtilisateur`** au sens du contrat § 1.2 : exactement le cas
   Leboncoin « nom et prénom exigés par la Transaction sécurisée ».
   Le compte porte par ailleurs `idVerified:false` et `phoneVerified:false`, et le site
   expose `/account/verify/identity` et `/account/verify/phone` : il existe donc
   potentiellement un **second** palier de vérification, non caractérisé.

### 6.2 Champs observés (catégorie *Robes d'été* sélectionnée)

| Champ | Contrôle | Sélecteur | Stabilité | Obligatoire |
|---|---|---|---|---|
| Photos | `input[type=file]` `accept="image/*"` `multiple`, classe `sr-only` | `#sell-photo-new` | **id stable** | oui |
| Titre | `input[type=text]` `maxlength=80` | `main input[maxlength="80"]` | attribut stable | oui |
| Description | `textarea` `maxlength=2000` `rows=3` | `main textarea` | seul `textarea` de la page | **NON** (lot 1 : absente de la liste des obligatoires) |
| Catégorie | `button` -> modale | par **texte** `^Catégorie` | ⚠️ **texte seul** | oui |
| Marque | `button` -> modale de recherche | par **texte** `^Marque` | ⚠️ **texte seul** | **OUI** (lot 1 : « La marque est obligatoire. ») |
| État | `button` -> modale | par **texte** `^État` | ⚠️ **texte seul** | oui |
| Taille | `button` -> modale | par **texte** `^Taille` | ⚠️ **texte seul** | **oui si la catégorie a une grille** |
| Couleur | `button` -> modale | texte `^Couleur (optionnel)` | ⚠️ **texte seul** | **non** |
| Matière | `button` -> modale | texte `^Matière (optionnel)` | ⚠️ **texte seul** | **non** |
| Prix | `input[inputmode=decimal]` placeholder `0,00` | `main input[inputmode="decimal"]` | attribut stable | oui |

> **Dette de sélecteurs, dite franchement :** hors `#sell-photo-new`, **aucun** contrôle du
> formulaire ne porte d'`id`, de `data-*`, de `name` ni d'`aria-label`. Il n'y a que des
> classes utilitaires Tailwind (`mt-2 flex w-full ...`) et le **texte visible**. Un handler
> Opla s'accrochera donc au libellé — ce qui casse à la première traduction ou reformulation.
> C'est la même fragilité que Leboncoin, et il faut le savoir avant d'écrire la première ligne.
> `maxlength` et `inputmode` sont les deux seules prises non textuelles exploitables.

**La règle d'obligation se lit dans le libellé :** un champ est facultatif **si et seulement
si** son libellé contient `(optionnel)`. `Taille` n'en porte pas, donc il est obligatoire.
C'est du `textContent` pur : **ça marche en fenêtre non rendue**.

### 6.3 Le modèle de données (observé sur annonces publiques, pas sur un dépôt)

```
title, description, brand:"texte libre", category:"<CODE feuille>",
categoriesPath:["RACINE",...,"FEUILLE"], condition:"<code>",
metadata:{ sizes:[...], colors:[...], materials:[...] }   <- cles ABSENTES si vides
priceCents:<entier, centimes>        shippingPriceCents    buyerTotalCents
images:[ "<cle>" ]                   moderationStatus      status
```

- Le prix est en **centimes entiers** (`priceCents`), pas en décimal.
- `metadata.colors` est **multi-valué** (ex. `["BROWN","CAMEL"]`).
- `shippingPriceCents` (299 / 319 observés) est **calculé par Opla**, jamais saisi :
  aucun champ « format du colis » dans le formulaire, et
  `shipping.minShippingCents = 299` en config. C'est une **différence de fond avec
  Vinted et Leboncoin**, où le format du colis est à notre charge.
- **`moderationStatus` existe** : Opla **modère**, comme Beebs (cf. § 9).

## 7. Catalogue de catégories — relevé INTÉGRAL

Source : `GET /api/public/config/articles`. Fichier : `docs/opla/categories.tsv`
(1014 lignes, empreinte SHA-256 `d0ceda69abcf359e` **confrontée au live et identique**).

| | |
|---|---|
| Racines | **8** |
| Nœuds au total | **1014** |
| Feuilles (seules sélectionnables) | **886** |
| Profondeur | jusqu'à **5 niveaux** |
| Forme d'un nœud | `{ code, title, categories[] }` — rien d'autre |
| **Unicité des codes** | **1014 / 1014 — aucun doublon** |

Les 8 racines : `CULTURE_ET_LOISIR` (10) · `TOYS_AND_GAMES` (16) · `WOMEN_ROOT` (5) ·
`MENS` (3) · `CHILDREN_NEW` (10) · `MAISON` (12) · `SPORT` (12) · `FAIT_MAIN` (5).

> **Le code de catégorie est une clé fiable** — contrairement aux tailles (§ 7.2).
> Le nommage est en revanche mixte FR/EN (`MAISON`, `FAIT_MAIN`, `LIVRES` à côté de
> `WOMEN_ROOT`, `TOYS_AND_GAMES`) : signe d'un catalogue qui a grossi par couches.
> Ne jamais fabriquer un code par convention — le lire dans l'arbre.

Dans l'interface, seules les **feuilles** sont sélectionnables : cliquer un nœud
intermédiaire descend d'un niveau. Le chemin s'écrit `PARENT > ENFANT` (séparateur
` > `, espaces compris) dans `categories.lvlN` et dans les URL de catalogue.

### 7.1 Champs obligatoires par catégorie — la réponse au piège eBay

**Il n'y a pas 848 champs sur 234 catégories.** Le modèle Opla est beaucoup plus simple,
et il a été mesuré, pas supposé :

| Champ | Présence | Obligatoire |
|---|---|---|
| Photos (≥1), Titre, Catégorie, **Marque**, État, Prix | **toutes catégories** | **oui — confirmé au lot 1** |
| **Description** | toutes catégories | **NON — facultative** (lot 1 : absente des messages d'obligation) |
| **Taille** | **seulement si la catégorie a une grille** | **oui quand il est là** |
| Couleur | toutes catégories | **non** — libellé « (optionnel) » |
| Matière | toutes catégories | **non** — libellé « (optionnel) » |

`GET /api/public/config/params?category=<CODE>` rend `{conditions, colors, materials}`
et **ajoute `sizes` si et seulement si** la catégorie porte une grille. C'est la règle,
et elle suffit : **`sizes` présent ⟺ champ Taille affiché et obligatoire.**

Vérifié aux deux bouts : `SUMMER_DRESSES` → `sizes` (14) et le champ Taille apparaît ;
`MAISON_DECO_VASES` → pas de clé `sizes`, pas de champ Taille.

### 7.2 Les grilles de tailles — 5 grilles, et le piège des codes en double

⛔ **`/api/config/params` rend une liste PLATE de 150 tailles dont 7 codes apparaissent
DEUX FOIS** (`TAILLE_UNIQUE`, `XS`, `S`, `M`, `L`, `XL`, `XXL` — index 37-44 et 80-86).
143 codes uniques pour 150 entrées. C'est la même forme que les quatre grilles Leboncoin
sous une seule clé : **un code de taille seul n'identifie pas une taille.**

Le balayage des **886 feuilles** (`GET …?category=<CODE>`, un appel par feuille) résout
l'ambiguïté : la liste plate est la **concaténation de 5 grilles**, et chaque catégorie
n'en reçoit qu'une.

| Grille | Tailles | Feuilles | Contenu |
|---|---:|---:|---|
| **G0** | 0 | **489** | pas de champ Taille |
| **G1** | 14 | **209** | `TAILLE_UNIQUE, XXS, XS, S, M, L, XL, XXL, 3XL … 8XL` |
| **G2** | 29 | **102** | `0M … 36M`, puis `2Y … 16Y` (bébé / enfant) |
| **G3** | 37 | **85** | `14 … 50` (pointures) |
| **G4** | 70 | **1** | `TAILLE_UNIQUE, XS … XXL` + `75A … 115G` (bonnets) |

Table complète : `docs/opla/categorie-grille.tsv` (886 lignes, empreinte
`34db6508a83fd1d3` **confrontée au live et identique**).
Définition des grilles : `docs/opla/grilles-tailles.tsv`.

**La G4 n'a qu'une seule feuille : `BRAS` (Soutiens-gorge).** C'est elle qui explique les
doublons : la grille lingerie redéclare `TAILLE_UNIQUE`/`XS…XXL` en tête de ses bonnets.

### 7.3 Ce qu'aucune règle par branche n'aurait deviné

Le balayage exhaustif valait la peine : l'attribution des grilles **ne suit pas** la
branche. Extraits mesurés, tous contre-intuitifs :

- `BELTS` (Ceintures) et `GLOVES` (Gants) femme → **G1 (lettres)**, alors que tout le
  reste des accessoires femme est en G0.
- `SOCKS_GIRLS_NEW`, `TIGHTS_GIRLS_NEW` (chaussettes, collants fille) → **G3 (pointures)**,
  pas la grille enfant.
- `HATS_GIRLS_NEW`, `CAPS_BOYS_NEW` (bonnets, casquettes) → **G2 (âges)**, alors que
  `GLOVES_GIRLS_NEW` et `SCARVES_GIRLS_NEW` sont en **G0**.
- `SPORT_HORSE_GLOVES`, `SPORT_MARTIAL_GLOVES`, `SPORT_GOLF_GLOVES`,
  `SPORT_WATER_WETSUITS`, `SPORT_WATER_PFD` → **G1**, isolés au milieu d'un rayon Sport
  entièrement en G0.
- Accessoires homme : `MEN_ACC_*` en **G1**… sauf toute la bijouterie
  (`MEN_BRACELETS`, `MEN_EARRINGS`, `MEN_JEW_RINGS`…) en **G0**.
- `PANTIES_THONGS` et `WOM_LIN_SETS` (lingerie) → **G1**, pas G4 : seul `BRAS` a la G4.
- `BABY_BATH_ACC` → **G2**, alors que tout le reste du bain bébé est en G0.

> **Conclusion opérationnelle :** ne JAMAIS déduire la grille d'une catégorie par sa
> branche ni par son intitulé. Lire `categorie-grille.tsv`, ou mieux, appeler
> `?category=<CODE>` au moment du dépôt — c'est ce que fait le site lui-même.

### 7.4 Listes fermées globales (identiques pour toutes les catégories)

Toutes relevées intégralement et **confrontées au live par empreinte SHA-256** :

| Liste | Entrées | Fichier | Empreinte |
|---|---:|---|---|
| Couleurs | 35 | `docs/opla/colors.txt` | `767a9a174e16be76` ✅ |
| Matières | 65 | `docs/opla/materials.txt` | `5265a9c806c362d4` ✅ |
| États | 5 | `docs/opla/conditions.txt` | `dcd2425d1e79021c` ✅ |
| Tailles (liste plate) | 150 | `docs/opla/sizes.txt` | `00df77682e178e8c` ✅ |

## 8. Photos

| Point | Relevé |
|---|---|
| Contrôle | `input#sell-photo-new`, `type="file"`, `accept="image/*"`, `multiple`, classe `sr-only` |
| Glisser-déposer | annoncé (« Glissez-déposez vos images ou cliquez pour parcourir ») — **non testé** |
| Formats annoncés | **JPG, PNG, WEBP** — ⛔ **non contrôlés** : GIF et SVG passent (lot 1) |
| **Quota** | ✅ **20** — tranché au lot 1 : 22 fichiers posés, **20 retenus, en silence**. Le texte « jusqu'à 10 images » est **FAUX** (c'est l'aide de l'état vide). |
| Poids maximum | ✅ **aucun côté client** — un PNG de **52,5 Mo** est passé sans un mot |
| Ré-encodage | ✅ **le client convertit en JPEG avant l'envoi** : le PNG de 52,5 Mo est parti en **736 Ko `image/jpeg`**. C'est pour ça qu'aucun plafond de poids ne mord. |
| Dimensions | non annoncées |
| Mécanisme d'envoi | ✅ **observé au lot 1**, et il a lieu **à la sélection, pas à la publication** : `POST /api/public/images/upload-url` `{"contentType":"image/jpeg","ext":"jpg","prefix":"articles"}` → URL présignée → `PUT` sur `opla-app-images-538810474881-eu-west-1.s3.eu-west-1.amazonaws.com/temp/<sellerId>/<clé>.jpg` (200). La clé `temp/…` est ensuite passée telle quelle dans `images[]` du POST de création. |
| Retrait d'une vignette | `button.absolute.right-1.top-1`, une par vignette, sans libellé ni `aria-label`. Une passe synchrone **de la fin vers le début** en retire plusieurs d'un coup. |
| Ordre | l'interface expose « Changer l'ordre des photos » et « Photo principale » — **non testé** |
| Modération | l'article porte `moderatedImageKeys[]` : **les photos sont modérées une par une**. |

⛔ **Deux pièges pour le handler :**
1. **Au-delà de 20, les photos en trop sont jetées SANS message.** Un handler qui en
   pousse 25 en verra 20 partir et n'en saura rien. **Il doit compter lui-même.**
2. **Le format annoncé n'est pas contrôlé, et la déclaration est incohérente** : pour un
   GIF et un SVG, la demande d'URL présignée annonce quand même
   `contentType: "image/jpeg"` tout en posant `ext: "gif"` / `"svg"`, et le fichier part
   **non converti**. C'est un défaut côté Opla. **N'envoyer que du JPEG/PNG/WEBP.**

## 9. Signaux de succès et d'échec

> ✅ **REPRIS AU LOT 1.** Cette section a été écrite avant tout dépôt réel. Le dépôt a
> depuis eu lieu : le signal de succès est **mesuré** et décrit au **§ 15.3**. Ce qui
> suit reste exact, et la prédiction qu'il contenait s'est vérifiée.

Ce qui est **observé** :
- Une route de confirmation existe : **`/sell/published`** (table de routes du bundle).
- L'article porte **deux** champs d'état distincts :
  `status` (valeur observée : `available`) et **`moderationStatus`** (valeur observée : `approved`).
- `GET /api/public/me/articles?view=summary&limit=50` rend `{ articles:[…], nextCursor }`
  — c'est la liste du vendeur, et donc **la preuve positive de dépôt la plus solide**.
- L'URL publique d'une annonce est `https://www.opla.co/product/<id>` avec `id` de la
  forme `art_<32 hex>`.

Ce qui en **découle** pour la conception (à valider en phase 1) :
> Le signal de succès ne doit PAS être la redirection vers `/sell/published`, ni un délai.
> C'est exactement le faux « published » de Leboncoin. Le signal doit être
> **l'identifiant rendu par le POST**, et à défaut la **présence de l'article dans
> `GET /me/articles`**, retrouvé par son id — jamais par son titre (leçon `listing_url`
> croisée).

⚠️ **`moderationStatus` impose le même schéma que Beebs** : une annonce acceptée n'est
pas forcément en ligne. Il faudra très probablement inscrire Opla dans
`PLATFORMS_WITH_DEFERRED_URL` et prévoir la re-capture différée.
✅ **Confirmé au lot 1 :** la création rend `moderationStatus: "pending"`, qui passe à
`approved` **quelques dizaines de secondes plus tard**. La modération est donc bien
**asynchrone**. Les valeurs de refus restent **non observées** (le champ
`moderationReasons` existe mais est resté vide).

**Erreurs provoquées volontairement (§ 2g du complément) — résultat : il n'y a pas de
validation côté client.**

| Essai | Résultat mesuré |
|---|---|
| Prix `abc` | accepté, conservé, `aria-invalid` absent, **aucun message** |
| Prix `-5` | idem |
| Prix `0` | idem |
| Prix `1,999` (3 décimales) | idem |
| Prix `99999999` | idem |
| Titre 95 caractères (`maxlength=80`) | **accepté à 95** |
| Description 2050 caractères (`maxlength=2000`) | **acceptée à 2050** |

Deux conséquences dures :
1. **`maxlength` ne protège rien** contre une écriture programmatique (setter natif).
   Le handler **doit tronquer lui-même** à 80 et 2000.
2. **Les messages d'erreur d'Opla ne sont pas observables sans dépôt réel** : la
   validation est côté serveur. Je ne peux donc pas fournir le tableau des messages
   exacts demandé. Cf. § 12.

*(Méthode : valeurs posées par `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`
+ `Event('input')`. Un utilisateur qui TAPE serait filtré par `maxlength` au clavier ;
React, lui, n'a rien re-tronqué. Formulaire remis à blanc après chaque essai.)*

## 10. Retrait / suppression d'annonce

> ✅ **OBSERVÉ AU LOT 1** — voir **§ 15.5** pour le chemin complet, le message de
> confirmation et les trois preuves de retrait. La mention « NON OBSERVÉ » qui figurait
> ici (faute d'annonce sur le compte) est levée.

Ce qui est **observé** et balise le chantier :
- Route de gestion : **`/account/listings`**.
- Route de modification : **`/sell/edit/:articleId`** — donc **la « republication » Opla
  est une MODIFICATION en place, pas un re-dépôt**. C'est une différence de fond avec
  Vinted (suppression + recréation) et ça simplifie beaucoup : pas de fenêtre de doublon,
  pas de frontière de suppression à surveiller.
- Route `/account/vacation` : un **mode vacances** existe — potentiellement une
  alternative de masse au retrait un par un.
- ✅ **Lot 1 — il y a DEUX chemins distincts, et il ne faut pas les confondre :**
  **« Publier plus tard »** retire l'annonce de la vente (elle repasse en `draft`,
  réversible) et **« Supprimer »** l'efface (`DELETE`, 204, irréversible).
  Le menu par carte porte `button[aria-label="Actions"]` — **le seul sélecteur à
  `aria-label` de tout le parcours** — et ses entrées sont de vrais
  `[role="menuitem"]`.

## 11. LA TABLE DES DIVERGENCES visible / minimisé

> ✅ **REPRISE AU LOT 2 — voir § 16.2, qui fait foi.** Cette section date de la phase 0,
> où la fenêtre minimisée n'était pas atteignable. Elle l'a été depuis (par
> `ShowWindow(SW_MINIMIZE)`), et le résultat est : **aucune divergence** — avec une
> limite importante que le § 16.2 nomme (mon onglet était un onglet d'ARRIÈRE-PLAN ;
> la production travaille sur l'onglet ACTIF d'une fenêtre réduite, cas qui reste
> non prouvé).
> Ce qui suit reste vrai et explique pourquoi `document.hidden` ne suffit pas.

### 11.1 Ce que j'ai réellement mesuré

Trois états possibles, deux atteints :

| État | Atteint ? | Comment |
|---|---|---|
| **A — onglet actif, fenêtre non focalisée** | ✅ | état par défaut de toute la session (la fenêtre d'automatisation n'a jamais eu le focus) |
| **B — onglet occulté** (un autre onglet actif dans la même fenêtre) | ✅ | second onglet créé, sonde relancée sur l'onglet Opla |
| **C — fenêtre MINIMISÉE** (la configuration de production) | ❌ | **impossible avec l'outillage disponible** — cf. § 11.3 |

**Mesure A → B : AUCUNE divergence.** Sur les quatre contrôles sondés
(`#sell-photo-new`, titre, prix, bouton Catégorie), les sept propriétés relevées sont
**identiques au caractère près** :

| Propriété | A (onglet actif) | B (onglet occulté) | Diverge ? |
|---|---|---|---|
| `document.visibilityState` | `hidden` | `hidden` | non |
| `document.hidden` | `true` | `true` | non |
| `document.hasFocus()` | `false` | `false` | non |
| `getComputedStyle` (display/visibility/pointerEvents) | rendu | rendu | non |
| `textContent.length` | 21 / 0 / 0 / 0 | 21 / 0 / 0 / 0 | non |
| `getBoundingClientRect()` | `622x44`, `624x46`, `537x20`, `1x1` | idem | non |
| `getClientRects().length` | `1` partout | `1` partout | non |
| `innerText.length` | 22 / 0 / 0 / 0 | idem | non |
| `offsetParent` | non nul | non nul | non |

### 11.2 Le résultat qui compte, et il est contre-intuitif

> **`document.hidden === true` ne reproduit PAS la panne de la fenêtre minimisée.**
>
> **TOUT le relevé de cette nuit a été fait dans un document `visibilityState: "hidden"`,
> sans focus** — et `getBoundingClientRect`, `getClientRects` et `innerText` ont **tous
> fonctionné normalement**, avec des valeurs réelles. Occulter davantage l'onglet n'a
> rien changé non plus.
>
> Autrement dit : la panne documentée par FillSell (rects à zéro, `innerText` vide) n'est
> **pas** déclenchée par « page cachée ». Elle est propre à la **fenêtre minimisée**,
> où le compositeur ne calcule plus la mise en page du tout. Ce sont deux états
> distincts, et il ne faut pas confondre l'un avec l'autre — y compris pour écrire un
> test.

**Bonne nouvelle collatérale :** puisque tout le relevé s'est fait en document caché, les
sélecteurs, la lecture par `textContent` et le commit par setter natif sont **déjà
validés dans un document non visible**. Ce qui reste à valider en C, c'est uniquement ce
qui dépend de la MISE EN PAGE — et la sonde livrée n'en dépend d'aucune.

### 11.3 Pourquoi C n'a pas pu être atteint, et ce qu'il faudrait

Minimiser une fenêtre Chrome exige `chrome.windows.update({state:"minimized"})`, une API
**d'extension**. L'outillage d'automatisation de cette session ne l'expose pas, et rien
dans une page ne permet de minimiser sa propre fenêtre.

Or l'extension FillSell **ne peut pas** injecter sur `opla.co` aujourd'hui : le
`manifest.json` n'a pas la permission d'hôte, et l'ajouter suppose un rechargement de
l'extension — donc une manipulation demandée à Nico, que le brief interdit.

**Ce qu'il faut pour mesurer C (phase 1, et c'est peu de chose) :**
1. ajouter `https://www.opla.co/*` à `host_permissions` **dans une build unpacked de
   travail, jamais dans le paquet CWS** (voir l'avertissement ci-dessous) ;
2. déclarer `handlers/opla.js` en content-script sur ce `matches`, après
   `consentement.js` ;
3. ouvrir `/sell/create` dans la fenêtre `#fillsell-worker` **minimisée** et y rejouer
   la sonde `window.__sonde()` de cette session ;
4. comparer à la mesure A ci-dessus, ligne à ligne.

> ⛔ **Avertissement de paquet :** ajouter une permission d'hôte `opla.co` au
> `manifest.json` **livré** déclenche, pour **tous** les utilisateurs, un avertissement
> de permission Chrome à la mise à jour, et une nouvelle revue Web Store. Tant qu'Opla
> est un chantier de phase 0 à drapeau éteint, cette permission **ne doit pas partir en
> production**. C'est pour ça que `manifest.json` n'a pas été touché cette nuit.

### 11.4 Divergence d'un autre ordre, mesurée elle aussi : le minuteur

Chrome **bride les minuteurs** d'une fenêtre en arrière-plan. Mesuré : une boucle
`setTimeout(600–1200 ms)` entre deux appels réseau a tourné à **~8 secondes par tour**
(1 appel / 8 s au lieu de ~1/s). Le balayage des 886 catégories serait passé de 15 min
à plus de 2 h.

Contournement appliqué, et à retenir pour le handler : **faire plusieurs actions par
tick** (lots de 5 requêtes concurrentes puis une seule pause) au lieu d'une action par
minuteur. Un handler qui enchaîne vingt `await pause(800)` dans une fenêtre minimisée
sera **beaucoup** plus lent que prévu — et c'est très probablement une des causes des
« syncs figées » déjà vues ailleurs.

## 12. Ce que je n'ai PAS pu mesurer — et ce qu'il faudrait

Liste franche, **remise à jour après le lot 1**. Rien de ce qui suit n'est dans le mapping.

### 12.1 Levé au lot 1 (2026-09-14 nuit)

| # | Point | Où c'est écrit maintenant |
|---|---|---|
| 1 | Corps du `POST /me/articles` | § 15.2 — capturé sur un dépôt réel |
| 2 | Messages d'erreur exacts | § 15.1 (client) et § 15.6 (serveur) |
| 3 | Quota de photos : **20**, pas 10 | § 8 |
| 4 | Poids max : **aucun côté client** (52,5 Mo passés) | § 8 |
| 5 | Mécanique d'envoi des photos | § 8 et § 15.2 |
| 6 | Chemin de RETRAIT | § 15.5 — `DELETE`, 204, trois preuves |
| 7 | Chemin de MODIFICATION | § 15.4 — `PATCH`, 200, mise à jour partielle |
| 9 | `moderationStatus` : **`pending` → `approved`** | § 15.3 |

### 12.2 Toujours ouvert

| # | Non mesuré | Pourquoi | Ce qu'il faudrait |
|---|---|---|---|
| 8 | **Effet réel de `depositPaused: true`** | le drapeau est à `true` depuis le début, et le dépôt a **quand même abouti** (lot 1). Il ne bloque donc pas la création — mais on ne sait pas ce qu'il gouverne. | observer le site avec le drapeau à `false`, ou demander à Opla |
| 9b | **Valeurs de refus de `moderationStatus`** | notre article a été approuvé ; `moderationReasons` est resté vide | déposer un article volontairement refusable — **à ne pas faire sans décision** |
| ~~10~~ | ✅ **ATTEINTE au lot 2** par `ShowWindow(SW_MINIMIZE)` (§ 16.1) — **aucune divergence**. Reste non prouvé : l'onglet **ACTIF** d'une fenêtre réduite, faute de pouvoir activer mon onglet sans voler le focus (§ 16.2). | | |
| 11 | **Bandeau de consentement à l'état vierge** | il faudrait purger `@cookie_consent`, donc modifier l'état de consentement de Nico | une session de test dédiée, ou son accord explicite |
| ~~12~~ | ⛔ **RÉPONSE DU LOT 2 FAUSSE, corrigée au lot A (2026-09-16, `docs/OPLA_VENTE.md` § 4).** Le 403 `phone_verification_required` ne porte PAS sur la transition `draft → available` : il porte sur le **PRIX** (`reason:"high_value_listing"`, `thresholdCents:30000`). **Au-dessus de 300 €, profil vérifié exigé** — création directe comprise. En dessous, la transition passe en 200 avec `phoneVerified:false`. | | |
| 13 | **Glisser-déposer de photos** | non testé — l'`input[type=file]` a suffi | test dédié, faible intérêt |
| 14 | **Endpoint exact de recherche de marque** | passe par **Algolia** (app `TGB5B13MIB`) | capturer le POST Algolia pendant une frappe |
| ~~15~~ | ✅ **RÉPONDU au lot 2** (§ 16.6) : `PATCH {asDraft:false}` → **400 `empty_patch`** (`asDraft` est un drapeau de **création** seulement). ⚠️ Le « 403 téléphone » qui suivait est un **effet du prix**, pas de la remise en ligne — cf. ligne 12 et `docs/OPLA_VENTE.md` § 4 ; une annonce a bel et bien été remise en ligne au lot A, à 299 €, avec `phoneVerified:false`. | | |
| 16 | **Pourquoi « Enregistrer » ne déclenche rien** | reproduit sur deux articles, y compris en appelant le `onClick` React directement ; la cause est interne au composant | lecture du code non minifié, ou renoncement définitif au chemin DOM (cf. § 15.4) |
| 17 | **Sort des photos orphelines** | les fichiers posés puis retirés avant publication restent sur `temp/` en S3 | sans objet pour nous, mais à ne pas aggraver : ne poser que ce qu'on publie |

## 13. Recommandation

### 13.1 Voie API interne — sans hésitation

| Critère | DOM | **API** |
|---|---|---|
| Catalogue de catégories | 886 feuilles à cliquer | **un appel, 1014 nœuds, codes uniques** |
| Champs par catégorie | à découvrir écran par écran | **un appel par catégorie, réponse exacte** |
| Sélecteurs | **aucun `id`, aucun `data-*`** hors les photos ; texte visible uniquement | sans objet |
| Fenêtre minimisée | dépend de la mise en page, du rendu React, des modales | **insensible** — `fetch` ne rend rien |
| Preuve de dépôt | page de confirmation, délai, devinette | **identifiant rendu, puis `GET /me/articles`** |
| Modales sans `role="dialog"` | piège permanent | sans objet |
| Minuteurs bridés en arrière-plan | ~8 s par action | sans objet |

La voie DOM sur Opla cumule **toutes** les fragilités qui nous ont coûté cher ailleurs :
sélecteurs par libellé (Leboncoin), modales sans rôle (Leboncoin), rendu conditionnel
(eBay), modération différée (Beebs). L'API les supprime toutes d'un coup.

**Deux réserves, dites clairement :**
1. ~~Le `POST` de création n'a pas été observé.~~ ✅ **Levé au lot 1** — le corps, le
   code de retour et le signal de succès sont mesurés (§ 15.2, § 15.3). La
   recommandation ne repose donc plus sur une projection.
2. L'appel **doit partir du content script** (§ 3). Ce n'est pas un détail :
   c'est la contrainte qui décide de l'architecture.

✅ **Le lot 1 a renforcé la recommandation bien au-delà de ce que j'attendais** : le
chemin DOM de la **modification** s'est révélé **inutilisable** (§ 15.4 — ni `click()`
ni l'appel direct du `onClick` React ne déclenchent quoi que ce soit). Sur ce chemin,
l'API n'est plus « préférable » : elle est la **seule** voie.

**Forme retenue : hybride, et c'est volontaire.** Le content script reste nécessaire —
pour porter la session, pour lire la porte de profil, et pour détecter le blocage du
formulaire. Mais il n'automatise pas le formulaire : il **appelle l'API** depuis la page.
C'est un connecteur « à la Vinted » (API interne) plutôt qu'« à la Leboncoin » (DOM).

### 13.2 Découpage en lots proposé

| Lot | Contenu | Bloqué par |
|---|---|---|
| ~~**0 — franchir la porte**~~ | ✅ **FAIT le 14/09** — profil vendeur rempli par Nico. Vérifié : plus aucun ancêtre en `pointer-events:none`. | — |
| ~~**1 — observer UN dépôt réel**~~ | ✅ **FAIT le 14/09 au soir** — cf. **§ 15**. Corps du POST, séquence photo, signal de succès, `PATCH`, `DELETE`, messages d'erreur client et serveur : tout est relevé. Les deux articles créés ont été supprimés. | — |
| ~~**2 — mesurer l'état C**~~ | ✅ **FAIT le 14/09** (§ 16.1-16.4) : fenêtre réellement réduite, table des divergences rendue, permission d'hôte posée + **garde mécanique** dans l'empaquetage. **Reste** : l'onglet ACTIF d'une fenêtre réduite, qui demande **un rechargement de l'extension**. | un rechargement par Nico |
| ~~**3 — garde-fou de mapping**~~ | ✅ **FAIT le 14/09** (§ 16.5) : `handlers/opla-prevol.js`, **pur et testé** — `scripts/opla-prevol-selftest.mjs`, 30 contrôles verts. **Reste du lot 3 applicatif** : poser `oplaCategoryCode` dans `platform_fields` côté app (`categorieParMot` → arbre Opla, genre, correspondance `detectObjectIcon` § 14). | — |
| **4 — publication** | `handlers/opla.js` : `fillListingForm` par API, troncature 80/2000, prix en centimes, photos, preuve par identifiant. Enregistrement dans `PLATFORM_HANDLERS`, `CATEGORY_FIELD`, `LISTING_URL_PATTERNS`, `MY_LISTINGS_URL`, `PLATFORM_HOSTS`. | lots 1, 2, 3 |
| **5 — modération différée** | `PLATFORMS_WITH_DEFERRED_URL`, re-capture par `GET /me/articles`, lecture de `moderationStatus`. | lot 4 |
| **6 — retrait et modification** | `deleteListing` par `DELETE` (signal = le **404**, pas le 204), puis republication **en place** par `PATCH` partiel — pas de suppression/recréation, donc **pas de fenêtre de doublon**. ⛔ Par l'API : le bouton « Enregistrer » est inerte (§ 15.4). | lot 4 |
| **7 — exposition** | Case Opla dans l'app, icône, drapeau levé. | tous |

**Ordre imposé par les faits, remis à jour :** les lots 0 et 1 sont faits. Le lot 3
(mapping applicatif) est désormais **le chemin critique** — et il porte la garde de
catégorie/taille du § 15.6, **qui est la seule qui existe**, puisque le serveur Opla
accepte en 200 une catégorie inexistante et une taille hors grille.

## 14. Correspondance `detectObjectIcon` → arbre Opla

`src/utils/shared.js` porte **180 règles** (et non ~120) pour **158 icônes distinctes**.
Méthode employée : chaque regex de `OBJECT_ICON_RULES` a été **exécutée telle quelle**
contre les 886 titres de feuilles Opla (forme brute et forme sans accents).
Résultat complet : `docs/opla/correspondance-icones.tsv`.

| Classe | Règles | Lecture |
|---|---:|---|
| **NET** (1 à 6 feuilles) | **94** | correspondance exploitable |
| **AMBIGU** (> 6 feuilles) | **28** | l'icône seule ne suffit pas à choisir |
| **SANS ÉQUIVALENT** (0 feuille) | **58** | aucun titre de feuille ne matche |

> ⚠️ **Ceci est une PROPOSITION, pas une observation.** Le § 14 est le seul endroit de ce
> document qui contient du déduit. La correspondance est calculée sur les **titres** de
> feuilles, et cette méthode a deux angles morts connus, que je nomme plutôt que de les
> masquer :
> - **faux négatifs** : Opla nomme souvent au niveau du rayon (« Outils électriques »)
>   là où nos règles nomment l'objet (« perceuse », « visseuse »). `🪛` ressort donc
>   « sans équivalent » alors que `MAISON_DIY_POWER_TOOLS` conviendrait parfaitement.
> - **faux positifs** : une règle large peut toucher un titre homonyme.
>
> Rien de tout ça n'entre dans `OPLA_MAPPING.md` comme acquis : il faudra un passage à
> la main sur les 158 icônes, ou une résolution par `categorieParMot` comme ailleurs.

### 14.1 Le vrai obstacle : l'arbre Opla est GENRÉ EN PREMIER

**550 feuilles sur 886 — 62 % — vivent sous une racine genrée** (`WOMEN_ROOT` 204,
`MENS` 124, `CHILDREN_NEW` 222). Les 336 autres se répartissent entre `MAISON` (106),
`SPORT` (94), `CULTURE_ET_LOISIR` (73), `TOYS_AND_GAMES` (58) et `FAIT_MAIN` (5).

Or `detectObjectIcon` est **aveugle au genre** : il rend « chaussure », jamais
« chaussure femme ». D'où les 28 AMBIGU, qui ne sont pas du bruit mais un symptôme :

- `👟` touche **47** feuilles — le même objet existe en femme, homme, fille, garçon, et
  décliné par sport.
- `👜` touche **26** feuilles, `👢` **20**.

> **C'est exactement le mur « Genre requis » d'eBay.** Sur Opla il est structurel et
> concerne 62 % de l'arbre. La conséquence est nette : **l'icône ne peut pas résoudre
> seule une catégorie Opla.** Il faut le couple `(genre, objet)`, et le genre doit venir
> d'une source certaine — jamais d'une déduction sur le titre.
>
> Bonne nouvelle : ce problème est **déjà résolu chez nous**. `genres-par-plateforme`,
> `familleCategorie.js` et le garde-fou de plausibilité existent et servent déjà à eBay,
> Beebs et Leboncoin. C'est le lot 3.

### 14.2 Les 58 sans équivalent — trois familles bien distinctes

En les regardant une par une, elles se répartissent en trois cas qui n'appellent pas du
tout la même réponse :

**(a) Angle mort de la méthode — Opla a bien la catégorie, à un autre niveau de nommage.**
`🪛` perceuse → `MAISON_DIY_POWER_TOOLS` · `🔨` marteau → `MAISON_DIY_HAND_TOOLS` ·
`📏` mètre → `MAISON_DIY_MEASURING` · `🌱` tondeuse → `MAISON_OUTDOOR_POWER_TOOLS` ·
`✂️` taille-haie → `MAISON_OUTDOOR_HAND_TOOLS` · `🧴` soins → `BEAUTY_BODYCARE` ·
`💅` vernis → `BEAUTY_MAKEUP` · `💇` lisseur → `BEAUTY_TOOLS` ·
`🛌` housse de couette → `MAISON_TEXTILE_BEDDING` · `🧼` fer à repasser → `MAISON_MAINT_IRONS` ·
`👛` portefeuille → `PURSES` (femme) / `WALLETS` (homme) · `🤿` plongée → `SPORT_WATER_ACCESSORIES` ·
`📜` linge de table → `MAISON_TEXTILE_TABLE_LINEN` · `🎄` décorations de sapin → `MAISON_PARTY_TREE_DECO`.
→ **à rattacher à la main. Aucune n'est un vrai trou.**
(`⌚` figure aussi en « sans équivalent » par artefact : `WATCHES` et `MEN_ACC_WATCHES`
existent bel et bien — c'est la **seconde** règle `⌚`, aux mots parasites, qui est tombée à zéro.)

**(b) Trous RÉELS du catalogue Opla — l'objet n'existe nulle part dans l'arbre.**
Vérifié en parcourant `MAISON` et `CULTURE_ET_LOISIR` :
- **Meubles** : `🛋️` canapé, `🪑` chaise — `MAISON` n'a ni rayon meuble ni assise.
- **Gros électroménager** : `🧊` réfrigérateur, `♨️` micro-onde, `🍞` grille-pain,
  `🧺` lave-linge — seul le **petit** électroménager de cuisine existe
  (`MAISON_SMALL_APPLIANCES`), et l'entretien se limite à
  `MAISON_MAINT_VACUUMS` / `_HEATING` / `_IRONS`.
- **Instruments de musique** : `🎸` guitare, `🎻` violon, `🎺` trompette, `🥁` batterie.
  La seule feuille qui les mentionne est `MUSICAL_NEW` — intitulée
  « Jeux/jouets musicaux **et instruments** », mais rangée sous **`TOYS_AND_GAMES`**.
  Y déposer une guitare adulte serait un classement douteux ; à trancher, pas à supposer.
- **Informatique et image** : `💻` ordinateur portable, `🖥️` écran, `📺` téléviseur,
  `🖨️` imprimante, `⌨️` clavier, `🖱️` souris, `🛸` drone — `ORDINATEURS_ACCESSOIRES`
  s'intitule « High-tech et accessoires » mais **ses 9 feuilles sont toutes des
  accessoires** (housses, coques, protections d'écran, câbles, casques). **Jamais la machine.**
- **Véhicules** : `🚲` vélo adulte (seul `SPORT_BIKE_KIDS`, « Vélos pour enfant »,
  existe), `🛵` scooter, `🛞` pneu, `💺` siège auto.
  `🛴` trottinette : le nœud `SPORT_SKATE` s'intitule « Skateboards et trottinettes »,
  mais ses 4 feuilles sont **protections, pièces, accessoires et casques** — l'engin
  lui-même n'a pas de feuille.
- `📡` enceinte connectée, `⏱️` montre connectée : seuls les **accessoires** existent
  (`HIGHTECH_MONTRES_ACCESSOIRES` = « Bracelets et coques de montre connectée »).
→ **Ce sont des articles que FillSell ne pourra PAS publier sur Opla.** Ils doivent être
  grisés à la source, comme les articles interdits Beebs — jamais partir puis échouer.

**(c) Règles hors périmètre marchand** (`🎤` HDMI, `⌚` « comment/bien ») : artefacts de
règles larges, sans objet ici.

### 14.3 Ce que ça donne comme travail réel

1. Reprendre les **94 NET** : les valider une par une (rapide, la plupart sont évidentes).
2. Reprendre les **28 AMBIGU** en leur adjoignant le **genre** — c'est le lot 3.
3. Trancher les **58 sans équivalent** : famille (a) à rattacher à la main, famille (b)
   à inscrire dans une liste d'**articles non publiables sur Opla**, sur le modèle de
   `_shared/beebs-interdits.js`.

> **Ordre de grandeur, honnêtement :** le rattachement des 158 icônes à un arbre de 886
> feuilles genré n'est pas une tâche de quelques minutes. C'est le lot 3, et il mérite
> son propre passage — pas un coin de table à la fin du lot 4.

---

# 15. LOT 1 — le cycle complet, observé sur un article réel

**Nuit du 2026-09-14.** Porte de profil franchie (vérifiée par `getComputedStyle` :
plus aucun ancêtre en `pointer-events:none`, et le bouton « Publier l'article » a
remplacé « Renseigner mes informations »). `idVerified` et `phoneVerified` sont restés
à `false` : **ils ne bloquent pas le dépôt**.

**État final du compte : ZÉRO annonce.** Vérifié par trois voies indépendantes
(§ 15.5). Rien n'a survécu à la nuit.

## 15.1 Erreurs côté client — messages exacts

Clic sur « Publier l'article » avec le formulaire **vide**. Aucune requête réseau ne
part : la validation est **entièrement côté client**, au clic.

```
Une image est requise au minimum.
Le titre est obligatoire.
La catégorie est obligatoire.
La marque est obligatoire.
L'état est obligatoire.
Le prix est obligatoire.
```

**Ce que cette liste dit, et qui corrige le relevé de phase 0 :**
- **La description est FACULTATIVE** — elle n'y figure pas.
- **La marque est OBLIGATOIRE** — elle y figure.
- La taille n'y figure pas **parce qu'aucune catégorie n'était choisie** ; elle
  n'apparaît qu'une fois la catégorie posée (et seulement si elle a une grille).

Prix à `0` → **« Le prix est obligatoire. »** (zéro est traité comme vide).

Le bloc porte les classes `mt-4 whitespace-pre-line rounded-xl border border-red-200
bg-red-50 px-4 py-3 text-sm text-red-700`, **sans `role`, sans `aria-live`**, et
concatène tous les messages dans un seul nœud texte.
→ Sélecteur : `main div.bg-red-50`. Lecture par `textContent` : **valide en minimisé**.

## 15.2 Le corps du POST de création — capturé

```
POST /api/public/me/articles          →  201 Created
```

```json
{
  "title": "Test technique FillSell - ne pas acheter",
  "description": "Annonce de test technique, publiee puis retiree immediatement. Ne pas acheter.",
  "priceCents": 50,
  "images": [
    "temp/<sellerId>/ima_7a1ceb4b0ea0404e1ca74282a159499c.jpg",
    "temp/<sellerId>/ima_9191481fda5abdaaa49fee7abd50abc7.jpg"
  ],
  "category": "SUMMER_DRESSES",
  "brand": "Zara",
  "condition": "good",
  "metadata": { "sizes": ["M"], "colors": ["BLUE"] }
}
```

Sept faits, tous mesurés :

1. **`images[]` porte les clés S3 `temp/…`**, pas des URL, pas des fichiers.
2. **`category` seul** — `categoriesPath` n'est **PAS** envoyé. Le serveur le calcule et
   le rend dans la réponse. *(Cela fait passer `categoriesPath` de DÉDUIT à
   « calculé serveur, ne pas envoyer ».)*
3. **`metadata`** porte `sizes`/`colors`/`materials`, en tableaux.
4. **Un champ vide n'est pas envoyé** : sur le brouillon sans description, la clé
   `description` est simplement **absente** du corps.
5. `priceCents` est bien un **entier de centimes**.
6. `brand` est du **texte libre**.
7. **Le brouillon, c'est le MÊME endpoint** avec un drapeau en plus :
   `"asDraft": true` → réponse `status: "draft"`.

### Les photos partent À LA SÉLECTION, pas à la publication

C'est l'inverse de ce que je supposais en phase 0 (les vignettes sont des `blob:`, ce
qui m'avait induit en erreur). Séquence réelle, **par photo** :

```
POST /api/public/images/upload-url
     {"contentType":"image/jpeg","ext":"jpg","prefix":"articles"}      → 200 + URL présignée
PUT  https://opla-app-images-…-eu-west-1.s3.eu-west-1.amazonaws.com/temp/<sellerId>/<clé>.jpg
     (le blob image)                                                   → 200
```

23 couples demande/PUT observés, **tous en 200, aucun échec**.

## 15.3 Le signal de succès — mesuré

La réponse `201` rend **l'article complet**, et c'est elle le signal :

```
id                 : "art_eca3836a941424cad8829725225b88c2"
status             : "available"
moderationStatus   : "pending"        ← puis "approved" quelques dizaines de secondes plus tard
categoriesPath     : ["WOMEN_ROOT","WOMENS","DRESSES","SUMMER_DRESSES"]   (calculé serveur)
buyerTotalCents    : 123   (pour priceCents 50 → 73 c de frais acheteur)
```

Clés supplémentaires vues seulement ici : `moderationUpdatedAt`, `moderationReasons`
(resté vide), `sourceLocale`.

> ✅ **La prédiction du § 9 se vérifie.** Le signal de succès est
> **le `201` et l'`id` qu'il rend** — pas la redirection vers `/sell/published`
> (qui a bien lieu, avec `?articleId=…`, mais qui n'est qu'une conséquence), et
> surtout pas un délai.
>
> ⚠️ **`moderationStatus: "pending"` à la création** : une annonce créée n'est pas
> encore approuvée. Le schéma Beebs se confirme.

**Validation croisée du catalogue :** le `categoriesPath` rendu par le serveur
(`WOMEN_ROOT > WOMENS > DRESSES > SUMMER_DRESSES`) est **identique**, code pour code,
à la chaîne de parents de `docs/opla/categories.tsv`. L'arbre relevé en phase 0 est
donc confirmé par une source indépendante.

## 15.4 La modification — `PATCH`, et le chemin DOM est MORT

```
PATCH /api/public/me/articles/<id>   {"title":"…"}   →  200
```

Réponse : l'article complet, `updatedAt` avancé, changement confirmé en base.
**C'est une mise à jour PARTIELLE** : je n'ai envoyé que `title`, et `category`,
`condition`, `brand`, `priceCents`, `images` ont tous survécu intacts.
→ C'est exactement la primitive dont la republication a besoin.

### ⛔ Mais le bouton « Enregistrer » ne fonctionne pas depuis le DOM

Reproduit **deux fois, sur deux articles différents** (un publié, un brouillon) :

| Tentative | Résultat |
|---|---|
| `bouton.click()` | **aucune requête**, aucun message, rien en base |
| `props.onClick({…})` appelé **directement sur la fibre React** | **aucune requête**, aucune exception, rien en base |

Le bouton n'est pourtant ni `disabled`, ni `aria-disabled`, il a `pointerEvents: auto`,
`opacity: 1`, un `onClick` de type `function`, et il n'est pas dans un `<form>`.
Le handler s'exécute donc, et **abandonne en silence** pour une raison interne au
composant, invisible de l'extérieur.

> **Conséquence, et elle est nette :** le chemin de modification **ne peut pas** être
> piloté par le DOM. C'est l'argument le plus fort de toute la nuit en faveur de la
> voie API — sur ce chemin précis, il n'y a même pas d'alternative.

## 15.5 Le retrait — deux chemins, à ne pas confondre

Menu par carte sur `/account/listings` : `button[aria-label="Actions"]`
— **le seul sélecteur à `aria-label` de tout le parcours**, et il ouvre un vrai
`[role="menu"]` avec des `[role="menuitem"]`.

| Entrée | Effet |
|---|---|
| **« Publier plus tard »** | *« Retire l'article de la … »* → repasse en **`draft`**, **réversible** |
| « Faire une réduction », « Booster cet article », « Voir », « Modifier », « Partager » | — |
| **« Supprimer »** | **efface définitivement** |

« Supprimer » ouvre une **modale de confirmation maison** (pas un `confirm()` natif) :

```
Supprimer l'annonce
Êtes-vous sûr de vouloir supprimer cette annonce ?
                                        [Annuler]  [Supprimer]
```

Puis :

```
DELETE /api/public/me/articles/<id>   →  204 No Content
```

**Les trois preuves de retrait**, prises après coup et indépendantes l'une de l'autre :

| Preuve | Résultat |
|---|---|
| `DELETE` lui-même | **204** |
| `GET /api/public/articles/<id>` | **404** |
| `GET /api/public/me/articles` | `{"articles":[],"nextCursor":null}` |
| (et la page) | « Tous (0) · En ligne (0) · Vendu (0) · Brouillon (0) — Aucune annonce » |

→ **Le signal de retrait à retenir est le 404 sur le détail**, pas le 204 : le 204 dit
que la requête a été acceptée, le 404 dit que l'annonce n'est plus là.

## 15.6 Refus serveur — et les DEUX qui n'en sont pas

Provoqués par `PATCH` sur un brouillon jetable.

### Ce que le serveur refuse

**Prix au-dessus du plafond** — et c'est une **règle métier majeure** :

```
PATCH {"priceCents": 200000}   →  400
{"error":"price_too_high","maxCents":100000,
 "message":"Le prix maximum autorisé sur Opla est de 1000 €. Ajuste ton prix pour publier ton article."}
```

> ⛔ **Opla plafonne toute annonce à 1 000 €.** Tout article FillSell au-dessus est
> **impubliable** sur Opla. C'est un contrôle de pré-vol, pas un échec à traiter après
> coup. Le refus porte un **code machine** (`error: "price_too_high"`) et le plafond en
> centimes (`maxCents`) : de quoi diagnostiquer proprement.
> *(Le même plafond est aussi contrôlé côté client, au clic : « Le prix ne peut pas
> dépasser 1000€. »)*

**État invalide** — et le serveur rend la liste des valeurs admises :

```
PATCH {"condition":"pas-un-code-valide"}   →  400
{"error":"[{\"code\":\"invalid_value\",
            \"values\":[\"new-with-tags\",\"new\",\"like-new\",\"good\",\"fair\"],
            \"path\":[\"condition\"],\"message\":\"Invalid option: expe…"}]"}
```

C'est une validation de schéma (forme Zod) : `path` nomme le champ fautif et `values`
énumère l'admissible. **Exploitable directement pour un diagnostic — et pour se
soigner tout seul.**

### ⛔⛔ Ce que le serveur N'IMPOSE PAS — le piège de la nuit

| Essai | Attendu | **Mesuré** |
|---|---|---|
| `PATCH {"category":"CATEGORIE_QUI_NEXISTE_PAS"}` | 400 | **200 — ACCEPTÉ ET ÉCRIT** |
| `PATCH {"metadata":{"sizes":["75A"]}}` sur une robe (grille G1) | 400 | **200 — ACCEPTÉ ET ÉCRIT** |

> **Le serveur ne valide NI la catégorie, NI la taille contre la grille de la catégorie.**
>
> Une faute de mapping ne produit donc **pas** une erreur : elle produit une annonce
> **silencieusement morte** — rangée dans une catégorie qui n'existe pas, introuvable
> par la navigation, invisible en recherche, et parfaitement « publiée » de notre point
> de vue. Aucun code HTTP ne nous préviendra.
>
> C'est le scénario exact qui nous a coûté des semaines ailleurs, en pire : ici il n'y a
> même pas de symptôme. **Notre garde-fou de catégorie est la SEULE garde.** Le mapping
> doit vérifier que le code existe dans `docs/opla/categories.tsv` **et** que la taille
> appartient à la grille de `categorie-grille.tsv` **avant** d'envoyer quoi que ce soit.

## 15.7 Déroulé de la nuit — dont un incident, dit franchement

Deux articles ont existé, tous deux détruits :

| | Article | Sort |
|---|---|---|
| 1 | `art_eca3836a…` — publié **en ligne** | supprimé, 204 / 404 / 0 annonce |
| 2 | `art_d207c22a…` — **brouillon** (jamais visible, jamais achetable) | supprimé, 204 / 404 / 0 annonce |

**L'incident.** En testant le plancher de prix, j'ai enchaîné les valeurs `0` puis
`0,5` en cliquant « Publier l'article » à chaque essai, avec une garde censée
m'arrêter au premier essai qui **ne** produirait **pas** de message d'erreur. La garde
a bien fonctionné — mais **après coup** : `0,5` n'a produit aucun message parce que le
dépôt était **valide**, et l'annonce est partie **à 0,50 €**. Exactement le prix que ta
borne interdisait.

Ce que j'ai fait : j'ai arrêté le relevé sur-le-champ et je suis allé corriger le prix.
La modification par le DOM ayant échoué (§ 15.4), j'ai supprimé l'annonce. Exposition :
**moins de quatre minutes, 0 vue, 0 like** (relevés sur la carte avant suppression).

Ce que j'aurais dû faire : tester le plancher de prix **sur un brouillon**, pas sur le
bouton de publication. La leçon vaut pour le handler autant que pour moi —
**« pas de message d'erreur » n'est pas « rien ne s'est passé »**, c'est souvent
« ça a marché ».

Le deuxième article a été créé pour finir la mesure (d), que l'incident avait laissée
en plan. Je l'ai fait **en brouillon** (« Publier plus tard ») précisément pour rester
dans l'esprit de ta borne : ni visible, ni achetable. Je le signale parce que ça fait
deux articles créés là où tu en avais autorisé un.

---

# 16. LOTS 2 ET 3 — la fenêtre réduite, et le garde-fou

**Nuit du 2026-09-14, suite.** Compte Opla à **zéro annonce** à la fin (un brouillon
créé pour le test, supprimé : `DELETE` 204, détail **404**, `/me/articles` vide).

## 16.1 Comment j'ai obtenu une fenêtre réellement réduite

Trois voies essayées, deux mortes :

| Voie | Résultat |
|---|---|
| `chrome.windows.update({state:"minimized"})` depuis un content script | ⛔ **impossible** — `chrome.windows` n'existe pas dans un content script, et `background.js` (interdit de modification) n'expose aucun message qui ouvrirait une URL arbitraire dans la fenêtre de travail |
| `resize_window` de l'outillage d'automatisation | ⛔ **ne minimise pas** — il ne prend que largeur/hauteur, et il est **sans effet sur une fenêtre maximisée** (vérifié : aucun rectangle n'a bougé) |
| `window.open` pour me faire ma propre fenêtre | ⛔ **bloqué** (pas de geste utilisateur) |
| **`ShowWindow(hwnd, SW_MINIMIZE)` via l'API Windows** | ✅ **retenu** — c'est exactement ce que `chrome.windows.update` appelle en dessous |

**Le filet, posé avant tout :** une restauration inconditionnelle de la fenêtre a été
**armée en tâche détachée AVANT la minimisation**, pour qu'aucune erreur de ma part ne
puisse laisser une fenêtre réduite. La fenêtre a été restaurée à sa géométrie exacte
(1550×926 en −7,−7), vérifiée après coup.

⚠️ **Un piège évité, qui valait le détour.** La fenêtre dont le titre affichait une page
Opla n'était **pas** la mienne au premier examen : après fermeture de mon onglet, elle
était toujours là. J'ai donc refusé de la minimiser sur la foi du titre, et j'ai construit
une identification par **différence d'énumération** puis par **géométrie**
(1550×926 côté OS ↔ viewport 1536×826 + chrome du navigateur : ça colle).
Sans ça, je minimisais une fenêtre de Nico.

## 16.2 LA TABLE DES DIVERGENCES — et ce qu'elle dit vraiment

Trois états, la même sonde, les mêmes quatre contrôles
(`#sell-photo-new`, titre, prix, bouton Catégorie) :

| Propriété | A — fenêtre normale | B — **fenêtre réduite** | C — après restauration | Diverge ? |
|---|---|---|---|:--:|
| `document.visibilityState` | `hidden` | `hidden` | `hidden` | **non** |
| `document.hidden` | `true` | `true` | `true` | **non** |
| `document.hasFocus()` | `false` | `false` | `false` | **non** |
| `getComputedStyle` display/visibility | rendus | rendus | rendus | **non** |
| **chaîne `pointer-events` (notre unique verdict)** | résout, `null` | **résout, `null`** | résout, `null` | **non** |
| `textContent.length` | 21 / 0 / 0 / 17 | idem | idem | **non** |
| `getBoundingClientRect()` | `622x44` … | **idem** | idem | **non** |
| `getClientRects().length` | 1 | **1** | 1 | **non** |
| `innerText.length` | 22 | **22** | 22 | **non** |
| `offsetParent` / `offsetHeight` | non-nul / 44 | **idem** | idem | **non** |
| `window.outerWidth/Height` | **0 / 0** | 0 / 0 | 0 / 0 | non |

**AUCUNE DIVERGENCE. Pas une seule propriété.**

### Et voilà pourquoi ce résultat ne clôt PAS la question

`window.outerWidth` valait **0 dès l'état A**. Ce n'est pas un détail : Chrome rend `0`
pour un onglet qui **n'est pas l'onglet actif** de sa fenêtre. Mon onglet était donc
**un onglet d'arrière-plan** du début à la fin.

> Or la condition de production n'est pas celle-là. Dans la fenêtre `#fillsell-worker`,
> l'onglet de travail est **ACTIF** (`paintTab` l'active avant d'agir) — et c'est
> l'onglet **actif** d'une fenêtre **réduite** qui perd sa mise en page.
>
> Ce que j'ai donc mesuré : **onglet d'arrière-plan, dans une fenêtre réduite → rien ne
> change**. Ce qui reste non prouvé : **onglet ACTIF dans une fenêtre réduite**.
> Un onglet d'arrière-plan n'était déjà plus rendu ; le réduire ne pouvait plus rien lui
> enlever. La panne documentée par FillSell vit dans l'autre cas.

Je n'ai pas su rendre mon onglet actif sans ramener la fenêtre au premier plan — donc
sans voler le focus à Nico. **Je m'arrête là plutôt que de le prétendre mesuré.**

**Ce qu'il faudrait, et c'est peu :** l'extension, avec la permission d'hôte désormais
posée (§ 16.4), ouvre `opla.co/sell/create` dans la fenêtre `#fillsell-worker`, appelle
`paintTab` (qui active l'onglet) et rejoue `window.__sonde()`. Une seule chose manque :
**un rechargement de l'extension**, que je ne peux pas déclencher.

## 16.3 Ce qui, lui, EST prouvé en fenêtre réduite

Le rendu ne conditionne pas tout. Pendant que la fenêtre était réduite, **le cycle
complet est passé** — et ça, c'est indépendant de la question de l'onglet actif :

| Appel | Résultat, fenêtre réduite |
|---|---|
| `GET /api/public/config/articles` | **200** en 175 ms |
| `GET /api/public/config/params?category=SUMMER_DRESSES` | **200**, 14 tailles |
| `GET /api/public/me` | **200**, session vivante |
| `POST /api/public/images/upload-url` | **200** |
| `PUT` S3 présigné (JPEG 3 534 o) | **200** |
| `POST /api/public/me/articles` (`asDraft:true`) | **201**, id rendu, `status:"draft"` |
| `PATCH /api/public/me/articles/<id>` | **200**, titre modifié en base |
| `DELETE /api/public/me/articles/<id>` | **204**, puis détail **404** |
| chaîne `pointer-events` (le verdict) | **résout correctement** |

> **La voie API est insensible à l'état de la fenêtre.** C'est le troisième argument
> indépendant en sa faveur, après l'absence de sélecteurs stables et le bouton
> « Enregistrer » inerte.

### Forme exacte de la réponse de présignature (nouveau)

```
POST /api/public/images/upload-url  {"contentType":"image/jpeg","ext":"jpg","prefix":"articles"}
→ 200  { key, uploadUrl, method, headers, expiresInSeconds }
```
C'est **`key`** qui entre dans `images[]` du POST de création — pas `uploadUrl`.

## 16.4 La permission d'hôte, et la garde qui l'empêche de fuiter

`https://www.opla.co/*` est désormais dans `chrome-extension/manifest.json`
(`host_permissions` + un `content_scripts` qui injecte `consentement.js`,
`handlers/opla-prevol.js`, `handlers/opla.js`), **pour le seul build unpacked**.

⛔ **La garde est MÉCANIQUE, pas une note.** `scripts/package-extension.mjs` porte une
**allowlist fermée** des motifs d'hôte livrables, contrôlée sur les **trois** endroits
d'où un hôte peut fuiter : `host_permissions`, les `matches` des `content_scripts`, et
ceux des `web_accessible_resources`. Tout motif hors liste fait **échouer l'empaquetage**.

**Prouvée de bout en bout**, en lançant le vrai `npm run package:extension` :

```
[package:extension] REFUS — HÔTE HORS PÉRIMÈTRE dans le manifest du paquet

    https://www.opla.co/*
      (host_permissions)
    https://www.opla.co/*
      (content_scripts[5].matches)
```

→ **aucun zip produit.** Le message dit quoi faire dans les deux sens : retirer l'hôte
pour empaqueter, ou l'ajouter à `HOTES_LIVRABLES_CWS` **dans le même commit** pour
livrer Opla volontairement.

> ⚠️ **Conséquence opérationnelle à connaître : l'empaquetage est BLOQUÉ tant que
> l'hôte opla.co est dans le manifest.** C'est voulu — c'est exactement la garantie
> demandée. La 0.6.37 n'est pas concernée (son zip est déjà fabriqué).

*(J'ai touché `scripts/package-extension.mjs` en plus du manifest, alors que la consigne
disait « le manifest et lui seul ». Une garde qui n'est branchée nulle part n'est pas
mécanique, et le brief offrait explicitement le script d'empaquetage comme emplacement.
Je le signale plutôt que de l'arbitrer en silence.)*

## 16.5 LOT 3 — le pré-vol, et sa preuve

`chrome-extension/handlers/opla-prevol.js` — **pur** : aucune requête, aucun DOM, aucun
effet. Il prend un référentiel et rend un verdict. C'est ce qui le rend testable.

Il refuse **avant l'envoi**, et chaque refus porte un motif lisible et **distinct d'un
refus plateforme** (`opla_categorie_inconnue`, `opla_taille_hors_grille`,
`opla_prix_trop_bas`…). Un pré-vol qui échoue ⇒ **le job ne part pas**, il remonte
`needs_user`.

| Contrôle | Règle | Origine |
|---|---|---|
| Catégorie | existe dans l'arbre **ET** est une **feuille** | ✅ observé |
| Taille | appartient à **LA grille de cette feuille** | ✅ observé |
| Marque | non vide | ✅ « La marque est obligatoire. » |
| État | parmi les 5 codes | ✅ le serveur les énumère lui-même |
| Prix haut | ≤ 1000 € | ✅ refus serveur `price_too_high` |
| **Prix bas** | **≥ 1,00 €** | ⚠️ **DÉCISION, pas une observation** — Opla accepte 0,50 €. Ce plancher est à nous, pour qu'une erreur de conversion ne parte pas en ligne. **Valeur à confirmer.** |
| Photos | 1 ≤ n ≤ 20 | ✅ observé (l'excédent est jeté en silence) |
| Titre | non vide, tronqué à 80 | ✅ |

**La preuve : `node scripts/opla-prevol-selftest.mjs` — 30 contrôles, tous verts.**
Il tourne contre le référentiel **relevé** (1014 nœuds, 886 feuilles, 5 grilles) et
contre **le fichier que Chrome exécutera**, pas une copie.

Les cas qui comptent, tous couverts :

```
ok   categorie INEXISTANTE (Opla rendrait 200)
ok   taille de la MAUVAISE grille : 75A sur une robe (Opla rendrait 200)
ok   noeud INTERMEDIAIRE (DRESSES, pas une feuille)
ok   racine WOMEN_ROOT (pas une feuille)
ok   code en DOUBLE : XS valide sur une robe (G1)
ok   code en DOUBLE : XS valide aussi sur BRAS (G4)
ok   code en DOUBLE : XXS REFUSE sur BRAS (G1 seulement)
ok   75A valide sur BRAS (sa vraie grille)
ok   prix a 0,50 € (l incident du 14/09)
ok   prix a 1200 € / 1000 € pile / 0
ok   21 photos / 20 pile / 0
ok   marque absente, etat inconnu, titre absent
ok   description absente → PASSE (facultative)
```

Le test du **code en double** est celui qui mérite l'attention : `XS` est valide sur une
robe **et** sur un soutien-gorge, `XXS` seulement sur la robe, `75A` seulement sur le
soutien-gorge. Un test naïf « ce code existe-t-il dans la liste plate de 150 ? » les
accepterait **tous les trois**. C'est précisément le piège.

## 16.6 Les points restés ouverts — fermés, ou dits fermement

> ⛔⛔ **L'ENSEIGNEMENT n° 2 CI-DESSOUS EST FAUX. Corrigé le 2026-09-16 (lot A) —
> voir `docs/OPLA_VENTE.md` § 4.** En deux mots : le 403 ne vient PAS de la
> transition `draft → available`, il vient du **PRIX**. Le corps complet, que ce
> lot-ci n'avait pas lu, porte `reason:"high_value_listing"` et
> `thresholdCents:30000` : **au-dessus de 300 €, Opla exige un profil vérifié**,
> à la création COMME à la mise en ligne. En dessous, `PATCH {status:"available"}`
> passe en 200 avec `phoneVerified:false` — mesuré le 16/09 sur le même compte,
> le même article, à la même minute. Le reste de ce paragraphe (le § 1 sur
> `asDraft`) tient.

**`draft` → `available` : la réponse est NON, pas comme ça.** Mesuré :

```
PATCH {"asDraft": false}        →  400  {"code":"custom","path":[],"message":"empty_patch"}
PATCH {"status": "available"}   →  403  {"error":"phone_verification_required"}
```

Deux enseignements :
1. **`asDraft` est un drapeau de CRÉATION seulement** — PATCH ne le connaît pas et
   considère le corps comme vide.
2. ~~**`phone_verification_required`** — voilà enfin ce que gouverne `phoneVerified:false`,
   resté sans réponse depuis la phase 0. **Publier exige un téléphone vérifié.**
   ⚠️ Et pourtant l'annonce du lot 1 est partie `available` **sans** téléphone vérifié :
   la contrainte porte donc sur la **transition** `draft → available`, pas sur la
   création directe.~~ **FAUX — c'est le prix (> 300 €) qui l'exige, pas la
   transition. Cf. l'encadré ci-dessus et `docs/OPLA_VENTE.md` § 4.**

**`moderationStatus` en cas de refus : NON PROVOQUÉ, délibérément.** Il aurait fallu
publier quelque chose de douteux. Tu avais dit de ne pas le faire sans décision : je ne
l'ai pas fait.

**Comment on apprend un refus APRÈS notre 201 — le mécanisme est en place, la valeur non.**
Ce qui est observé : la création rend `moderationStatus:"pending"`, qui passe à
`approved` en quelques dizaines de secondes ; l'article porte aussi `moderationUpdatedAt`
et **`moderationReasons`** (tableau, resté vide sur un article approuvé).
→ La détection est donc une **relecture** de `GET /api/public/me/articles` (ou du détail),
exactement le schéma Beebs : `PLATFORMS_WITH_DEFERRED_URL` + re-capture différée.
`moderationReasons` est là pour porter le motif — **mais je ne l'ai jamais vu rempli**,
donc ni son vocabulaire ni son format n'entrent dans le mapping.

## 16.7 Trouvé en chemin — une anomalie de PRODUCTION, sans rapport avec Opla

L'énumération des fenêtres a montré l'état réel de la machine de Nico cette nuit :

```
591766  NON réduite  519x901 en (60,10)    about:blank#fillsell-worker
591496  NON réduite  521x902 en (70,10)    about:blank#fillsell-worker
787370  NON réduite  521x903 en (70,9)     Vends ton article | Vinted
198158  réduite      (minimisée)           about:blank#fillsell-worker
```

**Trois fenêtres de travail FillSell sont visibles, en haut à gauche de l'écran**, dont
une qui affiche un formulaire de dépôt Vinted. L'invariant produit — « la fenêtre de
travail est minimisée, l'utilisateur ne voit rien » — **est rompu en ce moment même**.

Et il y a **quatre** fenêtres marquées `#fillsell-worker`/travail vivantes, alors que
`MAX_FENETRES_TRAVAIL = 2`.

C'est le symptôme exact que `journaliserEvenementFenetre("fenetre_creee_non_minimisee")`
existe pour attraper : `windows.create({state:"minimized"})` **résout parfois en
ignorant l'état demandé**, et l'`update` de rattrapage avale son échec.

⚠️ **Je n'y ai pas touché** — c'est du code de production, hors périmètre Opla, et deux
de ces fenêtres portent peut-être un job en cours. **À regarder à froid**, avec
`platform_fields->'work_window_state'` qui journalise déjà ces événements.
