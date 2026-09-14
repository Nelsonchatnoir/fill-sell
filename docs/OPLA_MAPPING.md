# Opla — mapping exploitable

**Relevé du 2026-09-14.** Document compagnon de `docs/OPLA_RELEVE.md`.
Chaque ligne porte **d'où elle vient**. Trois niveaux de preuve, jamais mélangés :

| Marque | Sens |
|---|---|
| **✅ OBSERVÉ** | vu en session réelle, sur la page ou en réponse d'API. Utilisable. |
| **⚠️ DÉDUIT** | cohérent avec ce qui a été observé, mais jamais vérifié directement. À valider. |
| **⛔ NON OBSERVÉ** | inconnu. **Ne pas coder dessus.** |

---

## 1. Champ par champ

| Champ FillSell | Champ Opla | Type / format | Obligatoire | Preuve |
|---|---|---|---|---|
| `job.title` | `title` | texte, **tronquer à 80** | oui | ✅ `maxlength=80` sur l'input ; ✅ mesuré : 95 caractères **acceptés** en écriture programmatique → **tronquer nous-mêmes** |
| `job.description` | `description` | texte, **tronquer à 2000** | ⛔ non vérifié | ✅ `maxlength=2000` ; ✅ mesuré : 2050 **acceptés** → tronquer nous-mêmes |
| `job.price` | `priceCents` | **entier, en CENTIMES** | oui | ✅ observé sur annonces publiques (`priceCents: 1800` = 18,00 €) |
| `platform_fields.oplaCategoryCode` | `category` | code de **feuille** (`SUMMER_DRESSES`) | oui | ✅ 886 feuilles relevées, codes uniques — `docs/opla/categories.tsv` |
| — | `categoriesPath` | tableau des codes racine→feuille | ⚠️ déduit (présent en lecture ; envoyé ou recalculé ? inconnu) | ✅ observé en lecture |
| `platform_fields.etat` | `condition` | un des **5 codes** | oui | ✅ `docs/opla/conditions.txt` |
| `platform_fields.marque` | `brand` | **texte libre** | ⛔ non vérifié | ✅ schéma `brand: string` + sélecteur qui propose `Ajouter "<texte>"` |
| `platform_fields.taille` | `metadata.sizes[]` | tableau, code de la **grille de la catégorie** | **oui si la catégorie a une grille** | ✅ balayage des 886 feuilles — `docs/opla/categorie-grille.tsv` |
| `platform_fields.couleurs` | `metadata.colors[]` | tableau, **multi-valué** | **non** | ✅ libellé « Couleur (optionnel) » ; ✅ observé `["BROWN","CAMEL"]` |
| `platform_fields.matieres` | `metadata.materials[]` | tableau | **non** | ✅ libellé « Matière (optionnel) » ; ✅ observé dans `metadata` |
| `job.photos` | `images[]` | tableau de **clés** (chaînes) | oui | ✅ observé en lecture ; ⛔ mécanisme d'envoi NON observé |
| — | `shippingPriceCents` | **calculé par Opla** | — | ✅ 299 / 319 observés ; `minShippingCents: 299` en config. **Aucun champ « format du colis » dans le formulaire** — contrairement à Vinted et Leboncoin |
| — | `moderationStatus` | `approved` observé | — | ✅ ; ⛔ autres valeurs inconnues |
| — | `status` | `available` observé | — | ✅ ; ⛔ autres valeurs inconnues |

**⛔ Le corps exact du `POST /api/public/me/articles` n'a PAS été observé.** Les noms de
champs ci-dessus viennent du **GET** d'annonces publiques. Il est très probable que le
POST les reprenne, mais ce n'est pas prouvé — c'est le lot 1.

## 2. États — correspondance complète, 1 pour 1

C'est la seule liste qui tombe **parfaitement** sur la nôtre. ✅ OBSERVÉ des deux côtés.

| FillSell | Opla `condition` | Libellé Opla |
|---|---|---|
| Neuf avec étiquette | `new-with-tags` | Neuf avec étiquette |
| Neuf sans étiquette | `new` | Neuf sans étiquette |
| Très bon état | `like-new` | Très bon état |
| Bon état | `good` | Bon état |
| Satisfaisant | `fair` | **Correct** |

Seul le dernier libellé diffère. Aucune valeur orpheline d'un côté ni de l'autre.

## 3. Tailles — la règle, et le piège

⛔ **Un code de taille seul n'identifie pas une taille.** La liste plate de
`/api/config/params` contient **150 entrées pour 143 codes uniques** : `TAILLE_UNIQUE`,
`XS`, `S`, `M`, `L`, `XL`, `XXL` y figurent **deux fois**.

✅ **La règle sûre**, mesurée sur les 886 feuilles :

```
1. GET /api/public/config/params?category=<CODE_FEUILLE>
2. pas de cle `sizes` dans la reponse  ->  pas de champ Taille, ne rien envoyer
3. cle `sizes` presente                ->  champ Taille OBLIGATOIRE ;
                                           choisir DANS CETTE LISTE, jamais ailleurs
```

C'est ce que fait le site lui-même à chaque changement de catégorie. Table figée de
secours : `docs/opla/categorie-grille.tsv` (+ `grilles-tailles.tsv`).

| Grille | Tailles | Feuilles | Contenu |
|---|---:|---:|---|
| G0 | 0 | 489 | pas de champ Taille |
| G1 | 14 | 209 | `TAILLE_UNIQUE, XXS → 8XL` |
| G2 | 29 | 102 | `0M → 36M`, `2Y → 16Y` |
| G3 | 37 | 85 | `14 → 50` (pointures) |
| G4 | 70 | **1** (`BRAS`) | `TAILLE_UNIQUE, XS → XXL` + `75A → 115G` |

⛔ **Ne jamais déduire la grille de la branche.** Contre-exemples mesurés :
`BELTS`/`GLOVES` (femme) → G1 · `SOCKS_GIRLS_NEW`/`TIGHTS_GIRLS_NEW` → **G3** ·
`HATS_GIRLS_NEW`/`CAPS_BOYS_NEW` → **G2** mais `GLOVES_GIRLS_NEW` → **G0** ·
`SPORT_*_GLOVES` → G1 au milieu d'un rayon Sport en G0 ·
bijouterie homme → G0 alors que le reste de `MEN_ACC_*` est en G1.

## 4. Catégories

- **Arbre complet** : `docs/opla/categories.tsv` — 1014 nœuds, 886 feuilles, 5 niveaux,
  **codes tous uniques**. Empreinte `d0ceda69abcf359e`, confrontée au live. ✅
- **Seules les feuilles sont sélectionnables.** ✅
- Chemin : `PARENT > ENFANT`, séparateur ` > ` **espaces compris**. ✅
- Nommage **mixte FR/EN** (`MAISON`, `FAIT_MAIN` vs `WOMEN_ROOT`, `TOYS_AND_GAMES`) :
  ⛔ ne jamais fabriquer un code par convention.
- **62 % des feuilles (550/886) sont sous une racine genrée** (`WOMEN_ROOT` 204,
  `MENS` 124, `CHILDREN_NEW` 222). ✅
  → **Le genre est indispensable pour résoudre une catégorie.** `detectObjectIcon`,
  aveugle au genre, ne peut pas trancher seul. Même mur que « Genre requis » eBay.

## 5. Couleurs, matières

- Couleurs : **35**, `docs/opla/colors.txt` (`code|hex|libellé`). ✅ empreinte vérifiée.
- Matières : **65**, `docs/opla/materials.txt`. ✅ empreinte vérifiée.
- Les deux sont **identiques pour toutes les catégories** (vérifié sur
  `SUMMER_DRESSES` et `MAISON_DECO_VASES`). ✅
- Les deux sont **facultatives** (libellé « (optionnel) »). ✅
- `colors` est **multi-valué**. ✅

## 6. Marque

✅ **Champ libre.** Pas de liste fermée, pas d'identifiant. Le sélecteur propose
`Ajouter "<votre texte>"`.
Moteur : **Algolia** (app `TGB5B13MIB`), pas `/api/public`.

⚠️ Le référentiel est **pollué par les vendeurs** : la recherche « nik » rend
`nike`, `Nike Jordan`, `Nike Air`, `Nike Air Max`, `Nike running`, `Nike air force 1`,
`Nike x Nocta`, `NIKKIE`, `nike dunk low`, `nike air Jordan` — casse incohérente,
doublons manifestes.
→ **Recommandation :** préférer toujours une suggestion existante à la création d'une
entrée neuve. Ne pas contribuer au bruit.

## 7. Photos

| Point | Valeur | Preuve |
|---|---|---|
| Contrôle | `input#sell-photo-new` — **seul id stable du formulaire** | ✅ |
| Types | `accept="image/*"`, `multiple` | ✅ |
| Formats annoncés | JPG, PNG, WEBP | ✅ |
| Quota | **⛔ CONTRADICTOIRE** : en-tête « Photo (0/20) », aide « jusqu'à 10 images » | ✅ les deux textes observés simultanément |
| Poids max | ⛔ non annoncé | — |
| Envoi | `POST /api/public/images/upload-url` → **URL présignée** | ⚠️ littéral de bundle, **jamais appelé** |
| Stockage | CloudFront, `images/<userId>/<articleId>/<clé>.webp` → **conversion WebP serveur** | ✅ |
| Modération | `moderatedImageKeys[]` — **photo par photo** | ✅ |

⛔ **Ne pas coder de boucle photos avant d'avoir tranché 10 vs 20.**

## 8. Ce que le handler doit lire AVANT de pousser

```
1. GET /api/config/params?locale=fr
   -> features.depositPaused === true   =>  plateforme en pause (cf. platform_health)
                                            ⛔ effet reel NON caracterise (lot 1)

2. Sur /sell/create, chercher un ancetre du formulaire dont
   getComputedStyle(...).pointerEvents === "none"
   -> present  =>  FORMULAIRE DESACTIVE (profil vendeur incomplet)
                   => attenteUtilisateur, JAMAIS un remplissage

3. GET /api/public/me  ->  user.idVerified / user.phoneVerified
   ⚠️ effet sur le depot NON caracterise
```

### ⛔ Le piège qui ferait perdre une semaine

Le formulaire est enveloppé dans `div.pointer-events-none.opacity-50` tant que le profil
vendeur est incomplet. **`element.click()` et le setter natif traversent
`pointer-events: none`** — j'ai rempli des champs et ouvert des modales sur un formulaire
**désactivé**, sans la moindre erreur.

> Un handler naïf remplirait donc un formulaire mort en croyant réussir, et n'échouerait
> qu'à la soumission — ou pire, réussirait à moitié. **C'est exactement le faux
> « published » de Leboncoin, en pire.**
>
> D'où la règle : sur Opla, **`pointer-events: none` sur un ancêtre EST un verdict** —
> le seul de tout le relevé. Il se lit par `getComputedStyle`, donc **il marche en
> fenêtre minimisée**. L'`opacity-50` qui l'accompagne, elle, ne doit **jamais** servir
> de verdict (règle du 14/09).

Détection correcte — on cherche l'ancêtre **le plus haut** qui pose la propriété :

```js
function oplaFormulaireDesactive() {
  let n = document.querySelector('main input[maxlength="80"]');
  let poseur = null;
  while (n && n !== document.body) {
    if (getComputedStyle(n).pointerEvents === 'none') poseur = n;
    n = n.parentElement;
  }
  return poseur;   // non nul  =>  formulaire desactive
}
```

## 9. Enregistrement dans les registres du background

⚠️ **À ne poser qu'au lot 4.** Rien de ceci n'est écrit aujourd'hui.

```js
PLATFORM_HANDLERS.opla = { implemented: true,
                           newListingUrl: "https://www.opla.co/sell/create" };
CATEGORY_FIELD.opla     = "oplaCategoryCode";
PLATFORM_HOSTS.opla     = "opla.co";
MY_LISTINGS_URL.opla    = "https://www.opla.co/account/listings";
LISTING_URL_PATTERNS.opla = /https:\/\/www\.opla\.co\/product\/art_[0-9a-f]{32}/i;   // ✅ forme observee
PLATFORMS_WITH_DEFERRED_URL.add("opla");   // ⚠️ si la moderation differe la mise en ligne — a confirmer
```

## 10. Correspondance `detectObjectIcon`

`docs/opla/correspondance-icones.tsv` — 180 règles, 158 icônes, passées **une par une**
contre les 886 titres de feuilles.

| Classe | Règles |
|---|---:|
| NET (1–6 feuilles) | 94 |
| AMBIGU (> 6) | 28 |
| SANS ÉQUIVALENT (0) | 58 |

⚠️ **C'est une proposition, pas une observation.** Méthode par titre de feuille, avec
deux angles morts nommés au § 14 du relevé. À reprendre à la main (lot 3).

### Articles que FillSell ne pourra PAS publier sur Opla

Trous **réels** du catalogue, vérifiés en parcourant l'arbre — à griser à la source,
sur le modèle de `_shared/beebs-interdits.js`, **jamais** à envoyer pour échouer ensuite :

- **Meubles** (canapé, fauteuil, chaise, armoire, commode) — aucun rayon.
- **Gros électroménager** (réfrigérateur, micro-onde, lave-linge, grille-pain).
- **Ordinateurs, écrans, téléviseurs, imprimantes, claviers, souris, drones** —
  `ORDINATEURS_ACCESSOIRES` ne contient que des **accessoires**.
- **Instruments de musique adultes** — seul `MUSICAL_NEW` les mentionne, sous **Jeux et jouets**.
- **Vélos adultes** (seul « Vélos pour enfant »), **scooters**, **pneus**, **sièges auto**,
  **trottinettes** (seuls protections, pièces et casques existent).
- **Enceintes et montres connectées** — seuls les accessoires existent.
