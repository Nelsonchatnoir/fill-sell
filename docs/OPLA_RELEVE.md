# Opla — relevé de phase 0

**Date :** 2026-09-14 · **Cible :** `https://www.opla.co` · **Compte :** session Nico, cookies REFUSÉS
**Statut :** observation seule. Aucune publication, aucun brouillon, aucune donnée personnelle saisie.
**Drapeau :** éteint. Opla n'apparaît nulle part dans l'app, aucun fichier existant n'a été modifié.

> **Règle appliquée à toutes les lignes de ce document et du mapping :**
> ce qui n'a pas été observé n'y figure pas. Chaque affirmation porte sa preuve
> (empreinte, code HTTP, libellé relevé). Ce qui n'a pas pu être mesuré est listé
> nommément au § 12, avec la raison et ce qu'il faudrait pour y arriver.

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
| `POST /api/public/images/upload-url` | **URL présignée** pour une photo d'article | littéral de bundle — **NON appelé** |
| `POST /api/public/me/articles` | **création d'annonce** | littéral de bundle — **NON appelé, corps NON observé** |

Note : `/api/config/articles` (sans `public`) répond **404**. Le préfixe n'est pas
symétrique entre `params` et `articles` — ne pas le déduire, le relire ici.

⚠️ Le corps du `POST /me/articles` **n'a pas été observé** : le bundle est minifié et les
clés du payload n'y apparaissent pas en littéraux. Ce qu'on sait du modèle vient du
**GET** d'annonces publiques (§ 6.3), pas du POST. Cf. § 12.

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
| Description | `textarea` `maxlength=2000` `rows=3` | `main textarea` | seul `textarea` de la page | non vérifié |
| Catégorie | `button` -> modale | par **texte** `^Catégorie` | ⚠️ **texte seul** | oui |
| Marque | `button` -> modale de recherche | par **texte** `^Marque` | ⚠️ **texte seul** | non vérifié |
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
| Photos, Titre, Description, Catégorie, Marque, État, Prix | **toutes catégories** | oui (sauf Description/Marque, non vérifié) |
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
| Formats annoncés | **JPG, PNG, WEBP** |
| **Quota — CONTRADICTION DANS L'INTERFACE** | l'en-tête affiche **« Photo (0/20) »**, l'aide juste en dessous **« jusqu'à 10 images »**. Les deux textes sont rendus en même temps, sur le même écran. |
| Poids maximum | **non annoncé nulle part**, absent du DOM et des props React |
| Dimensions | non annoncées |
| Mécanisme d'envoi | `POST /api/public/images/upload-url` — **URL PRÉSIGNÉE** (littéral de bundle, non appelé). Stockage CloudFront `d2f61lx5s6m7uh.cloudfront.net`, clé `images/<userId>/<articleId>/<imageKey>.webp` — donc **conversion WebP côté serveur**. |
| Modération | l'article porte `moderatedImageKeys[]` : **les photos sont modérées une par une**. |
| Observé sur annonces publiques | 3, 4, 5 et 6 photos — jamais plus de 6 dans l'échantillon. |

⚠️ **Le quota n'est pas tranché** et ne peut pas l'être sans téléverser : 20 et 10 sont
tous deux affichés. Avant d'écrire la moindre boucle de photos, il faut trancher par la
mesure (cf. § 12). Prendre 10 par prudence serait un choix raisonnable — mais c'est un
choix, pas une observation.

## 9. Signaux de succès et d'échec

**Rien de tout ceci n'a été observé sur un dépôt réel** — aucune publication n'a eu lieu.
Ce qui suit est ce que la structure PERMET d'affirmer, et rien de plus.

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
`PLATFORMS_WITH_DEFERRED_URL` et prévoir la re-capture différée. Les autres valeurs de
`moderationStatus` (refus, en attente) **n'ont pas été observées** — seul `approved` l'a été.

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

**NON OBSERVÉ, et je dis pourquoi :** le compte de Nico n'a **aucune annonce**
(`GET /api/public/me/articles` → `articles: []`). Sans annonce à retirer, il n'y a ni
bouton à relever, ni requête à capturer, ni signal à mesurer.

Ce qui est **observé** et balise le chantier :
- Route de gestion : **`/account/listings`**.
- Route de modification : **`/sell/edit/:articleId`** — donc **la « republication » Opla
  est une MODIFICATION en place, pas un re-dépôt**. C'est une différence de fond avec
  Vinted (suppression + recréation) et ça simplifie beaucoup : pas de fenêtre de doublon,
  pas de frontière de suppression à surveiller.
- Route `/account/vacation` : un **mode vacances** existe — potentiellement une
  alternative de masse au retrait un par un.
- L'article porte `status` : le retrait passe probablement par un changement de `status`
  plutôt que par une suppression dure — **non vérifié**.

## 11. LA TABLE DES DIVERGENCES visible / minimisé

C'est le livrable que le brief désigne comme le plus précieux. Je le rends avec sa
limite en première ligne, parce que la limite est le résultat.

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

Liste franche. Rien de ce qui suit n'est dans le mapping.

| # | Non mesuré | Pourquoi | Ce qu'il faudrait |
|---|---|---|---|
| 1 | **Corps du `POST /me/articles`** (noms de champs, types, format exact) | aucun dépôt réel ; bundle minifié, les clés n'y sont pas en littéraux | un dépôt réel autorisé par Nico, sonde réseau branchée, sur un article jetable |
| 2 | **Messages d'erreur d'Opla** (champ vide, format refusé, photo trop lourde, catégorie incompatible) | **il n'y a aucune validation côté client** (mesuré : tout passe) ; les messages viennent du serveur, à la soumission | même dépôt réel, en provoquant chaque refus |
| 3 | **Quota de photos : 10 ou 20 ?** | les deux chiffres sont affichés simultanément dans l'interface ; rien dans le DOM ni les props React ne tranche | téléverser 11 puis 21 images sur un brouillon |
| 4 | **Poids/dimensions max d'une photo** | non annoncés nulle part | téléverser un fichier volumineux |
| 5 | **Mécanique d'envoi des photos** (presigned → PUT S3 → clé rendue ?) | endpoint connu par littéral, jamais appelé | un dépôt réel avec photo |
| 6 | **Chemin de RETRAIT** | le compte n'a **aucune** annonce (`articles: []`) | déposer un article jetable, puis le retirer |
| 7 | **Chemin de MODIFICATION** (`/sell/edit/:articleId`) | idem — pas d'article à éditer | idem |
| 8 | **Effet réel de `depositPaused: true`** | le drapeau était déjà à `true` et le formulaire s'ouvrait quand même | observer un dépôt pendant que le drapeau est à `true`, puis à `false` |
| 9 | **Valeurs de `moderationStatus` autres qu'`approved`** | seules des annonces publiées sont visibles publiquement | suivre un dépôt réel de bout en bout |
| 10 | **Fenêtre MINIMISÉE (état C)** | API d'extension indisponible, et pas de permission d'hôte Opla | cf. § 11.3 |
| 11 | **Bandeau de consentement à l'état vierge** | il faudrait purger `@cookie_consent`, donc modifier l'état de consentement de Nico | une session de test dédiée, ou son accord explicite |
| 12 | **Second palier de vérification** (`/account/verify/identity`, `/account/verify/phone`) | `idVerified:false`, `phoneVerified:false` — bloque-t-il le dépôt, ou seulement certains usages ? | franchir la porte de profil d'abord |
| 13 | **Glisser-déposer de photos** | non testé (l'`input[type=file]` suffira probablement) | test dédié |
| 14 | **Endpoint exact de recherche de marque** | passe par **Algolia** (app `TGB5B13MIB`), pas par `/api/public` | capturer le POST Algolia pendant une frappe |

**Le blocage de fond, en une phrase :** la porte de profil vendeur exige des **données
personnelles réelles** (nom, prénom, téléphone, adresse) que je ne remplis pas. Elle
ferme l'accès au dépôt, et donc aux points 1, 2, 5, 6, 7, 9 d'un seul coup. Tout le
reste de la phase 1 en dépend.

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
1. Le `POST` de création **n'a pas été observé**. La recommandation porte sur la voie,
   pas sur une implémentation prête : le lot 1 ci-dessous existe pour lever ça.
2. L'appel **doit partir du content script** (§ 3). Ce n'est pas un détail :
   c'est la contrainte qui décide de l'architecture.

**Forme retenue : hybride, et c'est volontaire.** Le content script reste nécessaire —
pour porter la session, pour lire la porte de profil, et pour détecter le blocage du
formulaire. Mais il n'automatise pas le formulaire : il **appelle l'API** depuis la page.
C'est un connecteur « à la Vinted » (API interne) plutôt qu'« à la Leboncoin » (DOM).

### 13.2 Découpage en lots proposé

| Lot | Contenu | Bloqué par |
|---|---|---|
| **0 — franchir la porte** | Nico remplit lui-même son profil vendeur Opla (nom, prénom, téléphone, adresse). Rien à coder. | **rien — c'est le préalable à tout** |
| **1 — observer UN dépôt réel** | Un article jetable, déposé à la main par Nico, sonde réseau branchée. On relève : corps du `POST /me/articles`, séquence des photos, forme du succès, identifiant rendu. Puis on provoque chaque erreur et on relève les messages. **Observation seule, zéro code de handler.** | lot 0 |
| **2 — mesurer l'état C** | Permission d'hôte `opla.co` en build **unpacked seulement**, sonde rejouée dans la fenêtre `#fillsell-worker` minimisée, table des divergences complétée. Peut se faire en parallèle du lot 1. | rien (build locale) |
| **3 — mapping applicatif** | Poser `oplaCategoryCode` dans `platform_fields` côté app : `categorieParMot` → arbre Opla, garde-fou de famille, correspondance `detectObjectIcon` (§ 14). Drapeau toujours éteint. | lot 1 (pour le nom exact des champs) |
| **4 — publication** | `handlers/opla.js` : `fillListingForm` par API, troncature 80/2000, prix en centimes, photos, preuve par identifiant. Enregistrement dans `PLATFORM_HANDLERS`, `CATEGORY_FIELD`, `LISTING_URL_PATTERNS`, `MY_LISTINGS_URL`, `PLATFORM_HOSTS`. | lots 1, 2, 3 |
| **5 — modération différée** | `PLATFORMS_WITH_DEFERRED_URL`, re-capture par `GET /me/articles`, lecture de `moderationStatus`. | lot 4 |
| **6 — retrait et modification** | `deleteListing`, puis `/sell/edit/:articleId` pour la republication **en place** (pas de suppression/recréation, donc pas de fenêtre de doublon). | lot 1, lot 4 |
| **7 — exposition** | Case Opla dans l'app, icône, drapeau levé. | tous |

**Ordre imposé par les faits :** rien au-dessus du lot 3 ne peut s'écrire honnêtement
tant que le lot 1 n'a pas eu lieu. Écrire le `POST` sans l'avoir vu passer, ce serait
reproduire exactement le faux « published » de Leboncoin.

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
