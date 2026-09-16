# Opla — mapping exploitable

**Phase 0 du 2026-09-14 + LOT 1 du même soir** (cycle complet observé sur un article
réel, publié puis supprimé). Document compagnon de `docs/OPLA_RELEVE.md`.

Chaque ligne porte **d'où elle vient**. Trois niveaux de preuve, jamais mélangés :

| Marque | Sens |
|---|---|
| **✅ OBSERVÉ** | vu en session réelle, sur la page ou en réponse d'API. Utilisable. |
| **⚠️ DÉDUIT** | cohérent avec ce qui a été observé, mais jamais vérifié directement. À valider. |
| **⛔ NON OBSERVÉ** | inconnu. **Ne pas coder dessus.** |

---

## 0. Le contrat d'API, en entier

Tous ces appels sont **✅ OBSERVÉS** (code HTTP constaté en session réelle).

```
GET    /api/public/config/articles                  200   arbre complet (1014 noeuds)
GET    /api/public/config/params?category=<CODE>    200   config de CETTE categorie
GET    /api/config/params?locale=fr                 200   listes fermees + drapeaux
GET    /api/public/me                               200   { user: {...} }
GET    /api/public/me/articles?view=summary&limit=N 200   { articles: [...], nextCursor }
GET    /api/public/articles/<id>                    200   { article: {...} }   404 si absent

POST   /api/public/images/upload-url                200   -> { key, uploadUrl, method,
                                                              headers, expiresInSeconds }
PUT    <uploadUrl>                                  200   le blob image
POST   /api/public/me/articles                      201   creation  -> { article: {...} }
PATCH  /api/public/me/articles/<id>                 200   MISE A JOUR PARTIELLE
DELETE /api/public/me/articles/<id>                 204   suppression
```

⛔ C'est **`key`** (et pas `uploadUrl`) qui entre dans `images[]` du POST de création.

✅ **Tout ce cycle a été rejoué EN FENÊTRE RÉDUITE** (lot 2) : GET, présignature, PUT S3,
POST 201, PATCH 200, DELETE 204 — tous passés. **La voie API est insensible à l'état de
la fenêtre.**

⛔ **Deux pièges d'URL :**
- `/api/config/articles` (sans `public`) rend **404**, alors que `/api/config/params`
  (sans `public`) rend **200**. Le préfixe n'est pas symétrique : **le relire ici**.
- Tout appel doit partir du **content script** (contexte page). Un `fetch` du service
  worker MV3 est rejeté : mesuré, `curl` → **429** quand `fetch()` depuis la page → **200**.

## 1. Créer une annonce — le corps exact

**✅ OBSERVÉ** (capturé sur le dépôt réel du lot 1, `201 Created`) :

```json
POST /api/public/me/articles
{
  "title":       "<= 80 caracteres>",
  "description": "<= 2000 caracteres>",
  "priceCents":  1800,
  "images":      ["temp/<sellerId>/ima_<hash>.jpg", "..."],
  "category":    "SUMMER_DRESSES",
  "brand":       "Zara",
  "condition":   "good",
  "metadata":    { "sizes": ["M"], "colors": ["BLUE"], "materials": ["cotton"] },
  "asDraft":     true
}
```

| Règle | Marque |
|---|---|
| **Un champ vide ne s'envoie PAS** — on omet la clé, on ne met pas `""` ni `[]` | ✅ OBSERVÉ (brouillon sans description : clé absente) |
| **`categoriesPath` ne s'envoie PAS** — le serveur le calcule et le rend | ✅ OBSERVÉ |
| `"asDraft": true` → brouillon (`status: "draft"`). Absent → publication directe | ✅ OBSERVÉ |
| ⛔ **`asDraft` est un drapeau de CRÉATION SEULEMENT** — `PATCH {asDraft:false}` rend **400 `empty_patch`** | ✅ OBSERVÉ (lot 2) |
| ⛔ **`PATCH {status:"available"}` rend 403 `phone_verification_required`** — publier un brouillon exige un téléphone vérifié, alors que la création directe est passée sans | ✅ OBSERVÉ (lot 2) |
| `images[]` = **clés S3 `temp/…`**, jamais des URL, jamais des fichiers | ✅ OBSERVÉ |
| `priceCents` = **entier de centimes** | ✅ OBSERVÉ |
| `brand` = **texte libre** | ✅ OBSERVÉ |
| ⛔ **Publier un brouillon** (`draft` → `available`) | ⛔ NON OBSERVÉ |

## 2. Champ par champ

| Champ FillSell | Champ Opla | Format | Obligatoire | Marque |
|---|---|---|---|---|
| `job.title` | `title` | texte, **tronquer à 80 nous-mêmes** | **oui** | ✅ |
| `job.description` | `description` | texte, **tronquer à 2000 nous-mêmes** | **NON** | ✅ (absente des messages d'obligation) |
| `job.price` | `priceCents` | entier centimes, **≤ 100000** | **oui** | ✅ |
| `platform_fields.oplaCategoryCode` | `category` | code de **feuille** | **oui** | ✅ |
| `platform_fields.marque` | `brand` | texte libre | **oui** | ✅ (« La marque est obligatoire. ») |
| `platform_fields.etat` | `condition` | un des **5 codes** | **oui** | ✅ |
| `platform_fields.taille` | `metadata.sizes[]` | code de la grille de la catégorie | **oui si grille** | ✅ |
| `platform_fields.couleurs` | `metadata.colors[]` | tableau, multi-valué | non | ✅ |
| `platform_fields.matieres` | `metadata.materials[]` | tableau | non | ✅ |
| `job.photos` | `images[]` | clés S3, **1 à 20** | **oui, ≥ 1** | ✅ |
| — | `shippingPriceCents` | **calculé par Opla** | — | ✅ |
| — | `categoriesPath` | **calculé par Opla** | — | ✅ |

> ⛔ **`maxlength` ne protège rien.** Mesuré : un titre de 95 caractères et une
> description de 2050 sont **acceptés** en écriture programmatique (setter natif).
> **Le handler tronque lui-même**, sinon le serveur reçoit du hors-format.

## 3. ⛔⛔ LA GARDE QUI N'EXISTE QUE CHEZ NOUS

**✅ OBSERVÉ, et c'est le point le plus important du mapping :**

| Envoyé | Réponse serveur |
|---|---|
| `category: "CATEGORIE_QUI_NEXISTE_PAS"` | **200 — accepté et écrit** |
| `metadata.sizes: ["75A"]` sur une robe (grille G1) | **200 — accepté et écrit** |

> **Le serveur ne valide NI la catégorie, NI la taille contre la grille.**
> Une faute de mapping ne rend pas d'erreur : elle produit une annonce **silencieusement
> morte** — catégorie inexistante, invisible en navigation et en recherche, et
> « publiée » de notre point de vue. Aucun code HTTP ne préviendra.
>
> **Avant tout envoi, vérifier nous-mêmes :**
> 1. `category` existe dans `docs/opla/categories.tsv` **et** c'est une **feuille** ;
> 2. si `?category=<CODE>` rend `sizes`, alors `metadata.sizes[0]` **appartient à cette
>    liste** ; s'il n'en rend pas, **ne pas envoyer `sizes` du tout**.

✅ **C'EST ÉCRIT ET TESTÉ** — `chrome-extension/content-scripts/opla-prevol.js`, pur (aucune
requête, aucun DOM), prouvé par `node scripts/opla-prevol-selftest.mjs` : **30 contrôles
verts** contre le référentiel relevé, dont la catégorie inexistante, le nœud
intermédiaire, la taille de la mauvaise grille et les **codes de taille partagés entre
deux grilles** (`XS` valide sur une robe ET sur un soutien-gorge, `XXS` sur la robe
seulement, `75A` sur le soutien-gorge seulement — un test naïf « le code existe-t-il
dans la liste plate ? » accepterait les trois).

Un pré-vol qui échoue ⇒ **le job NE PART PAS**, il remonte `needs_user` avec un motif
distinct d'un refus plateforme (`opla_categorie_inconnue`, `opla_taille_hors_grille`,
`opla_prix_trop_bas`…).

⚠️ Une seule borne n'est pas observée : le **prix plancher à 1,00 €**. Opla accepte
0,50 €. Ce plancher est à nous, pour qu'une erreur de conversion ne parte pas en ligne
(c'est exactement ce qui est arrivé le 14/09). **Valeur à confirmer par Nico.**

## 4. Ce que le serveur refuse — et comment le lire

**✅ OBSERVÉ** (provoqué par `PATCH` sur un brouillon jetable) :

```
PATCH {"priceCents": 200000}  ->  400
{"error":"price_too_high","maxCents":100000,
 "message":"Le prix maximum autorisé sur Opla est de 1000 €. Ajuste ton prix pour publier ton article."}

PATCH {"condition":"nimporte-quoi"}  ->  400
{"error":"[{\"code\":\"invalid_value\",
            \"values\":[\"new-with-tags\",\"new\",\"like-new\",\"good\",\"fair\"],
            \"path\":[\"condition\"], \"message\":\"Invalid option: ...\"}]"}
```

- Le refus de prix porte un **code machine** (`price_too_high`) et le plafond
  (`maxCents`) → diagnostic direct, et **pré-vol** : tout article > **1000 €** est
  **impubliable sur Opla**, à écarter avant d'ouvrir quoi que ce soit.
- Le refus de schéma (forme Zod) nomme le champ fautif dans `path` et **énumère
  l'admissible** dans `values` → de quoi se corriger tout seul.

### Messages de validation côté client (aucune requête ne part)

**✅ OBSERVÉ**, verbatim, sur `main div.bg-red-50` (sans `role`, sans `aria-live`) :

```
Une image est requise au minimum.
Le titre est obligatoire.
La catégorie est obligatoire.
La marque est obligatoire.
L'état est obligatoire.
Le prix est obligatoire.          (aussi rendu pour un prix a 0)
Le prix ne peut pas dépasser 1000€.
```

## 5. États — correspondance complète, 1 pour 1 ✅

| FillSell | Opla `condition` | Libellé Opla |
|---|---|---|
| Neuf avec étiquette | `new-with-tags` | Neuf avec étiquette |
| Neuf sans étiquette | `new` | Neuf sans étiquette |
| Très bon état | `like-new` | Très bon état |
| Bon état | `good` | Bon état |
| Satisfaisant | `fair` | **Correct** |

Aucune valeur orpheline d'un côté ni de l'autre.

## 6. Tailles — la règle, et le piège ✅

⛔ **Un code de taille seul n'identifie pas une taille** : 150 entrées pour 143 codes
uniques (`TAILLE_UNIQUE`, `XS`, `S`, `M`, `L`, `XL`, `XXL` figurent **deux fois**).

```
1. GET /api/public/config/params?category=<CODE_FEUILLE>
2. pas de cle `sizes`  ->  pas de champ Taille, NE RIEN envoyer dans metadata.sizes
3. cle `sizes`         ->  Taille OBLIGATOIRE, choisir DANS CETTE LISTE, jamais ailleurs
```

Table figée de secours : `docs/opla/categorie-grille.tsv` (886 lignes, empreinte
`34db6508a83fd1d3` confrontée au live) + `grilles-tailles.tsv`.

| Grille | Tailles | Feuilles | Contenu |
|---|---:|---:|---|
| G0 | 0 | 489 | pas de champ Taille |
| G1 | 14 | 209 | `TAILLE_UNIQUE, XXS → 8XL` |
| G2 | 29 | 102 | `0M → 36M`, `2Y → 16Y` |
| G3 | 37 | 85 | `14 → 50` (pointures) |
| G4 | 70 | **1** (`BRAS`) | `TAILLE_UNIQUE, XS → XXL` + `75A → 115G` |

⛔ **Ne jamais déduire la grille de la branche.** Contre-exemples mesurés :
`BELTS`/`GLOVES` → G1 · `SOCKS_GIRLS_NEW`/`TIGHTS_GIRLS_NEW` → **G3** ·
`HATS_GIRLS_NEW`/`CAPS_BOYS_NEW` → **G2** mais `GLOVES_GIRLS_NEW` → **G0** ·
`SPORT_*_GLOVES` → G1 au milieu d'un rayon en G0 · bijouterie homme → G0 quand le
reste de `MEN_ACC_*` est en G1.

## 7. Catégories ✅

- `docs/opla/categories.tsv` — 1014 nœuds, 886 feuilles, 5 niveaux, **codes tous
  uniques**. Empreinte `d0ceda69abcf359e`, confrontée au live.
- **Validation croisée (lot 1)** : le `categoriesPath` rendu par le serveur à la
  création — `WOMEN_ROOT > WOMENS > DRESSES > SUMMER_DRESSES` — est **identique**, code
  pour code, à la chaîne de parents du fichier.
- **Seules les feuilles sont sélectionnables.**
- Nommage **mixte FR/EN** : ⛔ ne jamais fabriquer un code par convention.
- **62 % des feuilles (550/886) sont sous une racine genrée** → **le genre est
  indispensable** pour résoudre une catégorie ; `detectObjectIcon`, aveugle au genre, ne
  peut pas trancher seul. Même mur que « Genre requis » eBay.

## 8. Couleurs, matières, marque ✅

- Couleurs **35** (`colors.txt`), matières **65** (`materials.txt`) — empreintes vérifiées.
- **Identiques pour toutes les catégories**, et **toutes deux facultatives**.
- `colors` est **multi-valué** ; l'interface le confirme (bouton « Valider (n) »).
- **Marque : champ LIBRE**, moteur **Algolia** (app `TGB5B13MIB`), pas `/api/public`.
  Référentiel **pollué par les vendeurs** (`nike`, `Nike Air`, `nike dunk low`…).
  → **Toujours préférer une suggestion existante** à la création d'une entrée neuve.

## 9. Photos ✅

```
1. POST /api/public/images/upload-url
        {"contentType":"image/jpeg","ext":"jpg","prefix":"articles"}   -> 200 + URL presignee
2. PUT  <URL presignee>   (le blob)                                    -> 200
3. la cle "temp/<sellerId>/ima_<hash>.jpg" entre dans images[] du POST de creation
```

| Point | Valeur | Marque |
|---|---|---|
| **Quand** | **à la SÉLECTION**, pas à la publication | ✅ |
| **Quota** | **20** (pas 10 : l'aide de l'état vide ment) | ✅ |
| **Au-delà de 20** | **silencieusement tronqué, aucun message** — compter soi-même | ✅ |
| Minimum | **1** (« Une image est requise au minimum. ») | ✅ |
| Poids max côté client | **aucun** — 52,5 Mo passés | ✅ |
| Ré-encodage | le client **convertit en JPEG** (52,5 Mo → 736 Ko) | ✅ |
| Formats | JPG/PNG/WEBP annoncés mais **non contrôlés** : GIF et SVG passent, **non convertis**, avec un `contentType: image/jpeg` incohérent | ✅ |
| Contrôle DOM | `input#sell-photo-new` — **seul id stable du formulaire** | ✅ |
| Retrait d'une vignette | `button.absolute.right-1.top-1`, une par vignette | ✅ |

→ **N'envoyer que du JPEG/PNG/WEBP, et jamais plus de 20.**

## 10. Les trois chemins ✅

| Chemin | Opla | Signal à retenir |
|---|---|---|
| **Publication** | `POST /me/articles` → **201** | **l'`id` rendu** (`art_<32 hex>`). Jamais la redirection `/sell/published`, jamais un délai. |
| **Republication** | `PATCH /me/articles/<id>` → **200** | **mise à jour PARTIELLE** : n'envoyer que ce qui change. Pas de suppression/recréation, donc **pas de fenêtre de doublon**. |
| **Retrait** | `DELETE /me/articles/<id>` → **204** | **le 404 sur `GET /articles/<id>`**, pas le 204. |

⛔ **Le chemin DOM de la modification est MORT** : « Enregistrer » ne déclenche aucune
requête, ni par `click()`, ni en appelant le `onClick` React directement. Reproduit sur
deux articles. La republication **doit** passer par l'API.

**Retrait ≠ dépublication.** Le menu `button[aria-label="Actions"]` offre les deux :
« Publier plus tard » repasse l'annonce en `draft` (**réversible**), « Supprimer »
l'efface (**irréversible**, avec modale de confirmation maison).

## 11. Ce que le handler doit lire AVANT de pousser

```
1. GET /api/config/params?locale=fr  ->  features.depositPaused
   ⚠️ etait a TRUE pendant tout le lot 1 et le depot a QUAND MEME abouti.
      Ne bloque donc pas la creation. Ce qu'il gouverne reste inconnu.

2. Sur /sell/create : un ancetre du formulaire en pointer-events:none
   -> formulaire DESACTIVE (profil vendeur incomplet) -> attenteUtilisateur

3. Pre-vol de prix : priceCents > 100000  ->  article IMPUBLIABLE sur Opla
4. Pre-vol de categorie et de taille : cf. section 3 (le serveur ne valide pas)
```

### ⛔ Le piège de la porte de profil

Tant que le profil vendeur est incomplet, le formulaire est enveloppé dans
`div.pointer-events-none.opacity-50`. **`element.click()` et le setter natif traversent
`pointer-events: none`** : on remplit un formulaire mort sans la moindre erreur.

> Sur Opla, **`pointer-events: none` sur un ancêtre EST un verdict** — le seul du relevé.
> Il se lit par `getComputedStyle`, donc **il vaut en fenêtre minimisée**.
> L'`opacity-50` qui l'accompagne ne doit **jamais** servir de verdict.

```js
function oplaFormulaireDesactive() {
  let n = document.querySelector('main input[maxlength="80"]');
  let poseur = null;
  while (n && n !== document.body) {
    if (getComputedStyle(n).pointerEvents === 'none') poseur = n;  // garder le PLUS HAUT
    n = n.parentElement;
  }
  return poseur;   // non nul => formulaire desactive
}
```

## 12. Enregistrement dans les registres du background

⚠️ **À ne poser qu'au lot 4.** Rien de ceci n'est écrit aujourd'hui.

```js
PLATFORM_HANDLERS.opla = { implemented: true,
                           newListingUrl: "https://www.opla.co/sell/create" };
CATEGORY_FIELD.opla       = "oplaCategoryCode";
PLATFORM_HOSTS.opla       = "opla.co";
MY_LISTINGS_URL.opla      = "https://www.opla.co/account/listings";
LISTING_URL_PATTERNS.opla = /https:\/\/www\.opla\.co\/product\/art_[0-9a-f]{32}/i;   // ✅ forme observee
PLATFORMS_WITH_DEFERRED_URL.add("opla");   // ✅ justifie : moderationStatus "pending" a la creation
```

## 13. Correspondance `detectObjectIcon`

`docs/opla/correspondance-icones.tsv` — 180 règles, 158 icônes, passées **une par une**
contre les 886 titres de feuilles. NET 94 · AMBIGU 28 · SANS ÉQUIVALENT 58.

⚠️ **C'est une proposition, pas une observation.** Méthode par titre de feuille, avec
deux angles morts nommés au § 14 du relevé. À reprendre à la main (lot 3).

### Articles que FillSell ne pourra PAS publier sur Opla

Deux causes, à traiter toutes les deux **à la source** (modèle `_shared/beebs-interdits.js`) :

**(a) Prix > 1000 €** — refus serveur `price_too_high`. ✅ OBSERVÉ.

**(b) Trous réels du catalogue**, vérifiés en parcourant l'arbre :
- **Meubles** (canapé, fauteuil, chaise, armoire) — aucun rayon.
- **Gros électroménager** (réfrigérateur, micro-onde, lave-linge, grille-pain).
- **Ordinateurs, écrans, téléviseurs, imprimantes, claviers, souris, drones** —
  `ORDINATEURS_ACCESSOIRES` ne contient que des **accessoires**.
- **Instruments de musique adultes** — seul `MUSICAL_NEW`, sous **Jeux et jouets**.
- **Vélos adultes**, **scooters**, **pneus**, **sièges auto**, **trottinettes**.
- **Enceintes et montres connectées** — seuls les accessoires existent.
