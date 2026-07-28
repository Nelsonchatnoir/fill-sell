# Audit avant implémentation — le mode `identify` de `lens-analysis`

**Date : 28/07/2026.** Aucune ligne de `lens-analysis` n'a été modifiée. Ce
document est une décision à prendre, pas un livrable de code.

**Le principe audité** : `identify` = le scan Lens actuel **sans recherche
web**. Mêmes photos, même prompt, même modèle ; on retire l'outil
`web_search_20250305` et les deux étapes du prompt qui s'en servent (validation
d'orthographe de marque, estimation de prix). Il serait **inclus dans le prix de
publication (3 Pépites)**, le scan complet restant à 6 Pépites avec l'estimation
de prix.

---

## Méthode — ce qui a réellement été exécuté

Deux Edge Functions **jetables** ont été déployées le temps de l'audit, puis
**supprimées** (`lens-probe`, `lens-probe-text` — vérifié par
`list_edge_functions` après coup) :

- `lens-probe` rejoue à l'identique le code de `lens-analysis` v56 (même modèle
  `claude-haiku-4-5`, `max_tokens` 2500, `temperature` 0, mêmes images par URL,
  même `cache_control` sur la dernière image, même boucle `pause_turn`), avec un
  interrupteur `mode: full | identify` et un interrupteur `cache: true | false`.
  Elle ne débite **aucune Pépite** et n'écrit **rien** en base.
- `lens-probe-text` rejoue l'étape 3 de `generate-listing` (rédaction d'annonce)
  en lui passant **les prompts plateformes lus verbatim** dans
  `supabase/functions/generate-listing/index.ts` — pas une paraphrase.

Les **prompts** du mode identify sont ceux de la prod, à deux paragraphes près :
les étapes 2 (validation marque) et 3 (estimation prix) sont remplacées par leur
version « sans web ». Les étapes 1, 1bis, 4 à 8, le schéma JSON et la règle
absolue de format sont **identiques au caractère près**.

Les **photos** sont de vraies photos d'utilisateurs, prises dans le bucket
`listing-photos` — les fichiers `raw/`, jamais les `enhanced/` retouchés par GPT
Image. Sept articles, choisis pour couvrir les cas demandés :

| Cas | Article | Pourquoi |
|---|---|---|
| `patagonia` | Sweat à capuche Patagonia gris | marque courante, **étiquette parfaitement lisible** (`patagonia`, W's L / M's M, Uprisal) |
| `zara` | Robe midi rose motif ondulé | marque courante, étiquette lisible mais **taille ambiguë** (EUR S / USA S / MEX 26) |
| `volcom` | Casquette Volcom beige | étiquette de marque lisible, **pas de taille** (O/S) |
| `cyrillus` | Bottines enfant cuir marron | **aucun texte de marque** : le logo est seulement moulé dans la semelle |
| `momcozy` | Tire-lait M5 double | **marque peu connue**, hors textile, packaging très lisible |
| `gshock` | Montre Casio G-Shock noire | **hors textile**, marque connue, modèle à trouver |
| `montre` | Montre Omega « Antichoc » vintage or 18K | **pièce rare**, poinçons (Ω OMEGA, 18K 0.750, SWISS MADE) |

Plus deux variantes du même test **privées de la photo d'étiquette**
(`patagonia_sansetiq`, `zara_sansetiq`), pour isoler ce que la recherche web
rattrape quand la marque n'est écrite nulle part.

Chaque article est passé une fois en `full` et une fois en `identify`, le même
jour, sans note utilisateur, dans le même ordre de photos. **18 appels API au
total**, plus 12 rédactions d'annonce. Coût total de l'audit : ≈ 0,75 €.

> **Limite honnête** : une passe par article. `temperature: 0` réduit la
> variance mais ne l'annule pas — un modèle qui appelle un outil serveur n'est
> jamais strictement déterministe. Les écarts ponctuels de formulation ci-dessous
> ne doivent pas être sur-interprétés ; les écarts **structurels** (prix, modèle)
> se répètent, eux, sur tous les cas.

---

## 1. L'inventaire des champs — PHOTO ou WEB ?

Ce qu'une annonce doit contenir pour partir sur les quatre plateformes, tel que
le code le produit réellement (`PLATFORM_CFG` de `generate-listing`, registre
`docs/required-fields-coverage.md`, gardes de `ListingPreviewScreen`).

### Champs communs aux quatre plateformes

| Champ | Vinted | LBC | eBay | Beebs | Source réelle |
|---|:--:|:--:|:--:|:--:|---|
| Photos | ✅ req | ✅ req | ✅ req | ✅ req | **utilisateur** |
| Titre | ✅ req | ✅ req | ✅ req | ✅ req | **PHOTO** |
| Description | ✅ | ✅ | ✅ | ✅ | **PHOTO** |
| **Prix** | ✅ req | ✅ req | ✅ req | ✅ req | **WEB** (ou saisi) |
| Catégorie | ✅ req | ✅ req | ✅ req | ✅ req | **PHOTO** |
| État | ✅ req | selon cat. | ✅ req | ✅ req | **PHOTO** |
| Marque | ⚪ | ⚪ | ✅ aspect | ⚪ | **PHOTO** |
| Taille / pointure | ✅ req (mode) | ✅ req (chauss.) | ✅ aspect | ✅ req (mode) | **PHOTO** (étiquette) |
| Couleur | ⚪ | — | ✅ aspect | ⚪ | **PHOTO** |
| Matière | ⚪ | ⚪ | ✅ aspect | ⚪ | **PHOTO** |
| Genre / univers | ✅ req | ✅ req (mode) | ✅ req | ✅ req (mode) | **PHOTO** + déduction |

### Champs spécifiques

| Champ | Plateforme | Source réelle |
|---|---|---|
| `modele` | Vinted (requis High-Tech, prouvé par le 400 f69e319c), eBay (aspect) | **PHOTO si imprimé**, sinon **WEB** |
| `stockage` / capacité | Vinted (requis Téléphones/Tablettes), eBay | **PHOTO** (`attributs_visibles.capacite`) |
| Simlockage | Vinted | défaut déterministe extension (« Non ») |
| `format_colis` | Leboncoin | déduction (type d'objet) |
| Type / Produit / Univers | Leboncoin | **pré-rempli par LBC depuis le titre** |
| `age` (tranche d'âge) | Beebs (requis jouets) | déduction |
| Aspects obligatoires eBay (Nom de parfum, Volume, MPN, dimensions…) | eBay | **PHOTO** (`attributs_visibles`) + `EBAY_ASPECT_DEFAULTS` + `resolve_aspects` |

### Le partage qui décide de tout

**Un seul champ d'annonce dépend réellement du web : le PRIX.** Tout le reste —
titre, description, catégorie, état, marque, taille, couleur, matière, genre,
attributs eBay — se lit sur la photo ou se déduit de ce qui s'y lit. Deux
dépendances secondaires, plus faibles qu'annoncé dans le prompt :

- **l'orthographe de la marque** : l'étape 2 du prompt prod exige une recherche
  web pour « confirmer l'orthographe exacte ». Sur les 9 tests, cette recherche
  n'a **jamais rien corrigé** (§2) ;
- **le nom de modèle exact** quand il n'est pas imprimé sur l'objet. C'est la
  seule perte réelle et documentée (§4) — et elle est moins fiable qu'on ne
  croit, y compris **avec** le web.

⚠️ **Point bloquant à connaître** : `ListingPreviewScreen.jsx:3979` refuse de
publier si `price` est vide ou `< 1 €` (garde posée le 13/07 après le job
`3d194668` parti à `price=NULL`). Un identify qui ne renvoie **aucun** prix
n'empêche donc pas de faire une annonce, mais **impose une saisie manuelle du
prix** avant publication. C'est une décision produit, pas un obstacle technique
— voir la recommandation en fin de document.

---

## 2. Le test réel — tableau des écarts

Sept articles, chaque champ tel que renvoyé par les deux modes.
`=` valeurs identiques · `≈` équivalent après normalisation par
`generate-listing` · `≠` écart réel.

### 2.1 Les champs qui remplissent l'annonce

| Article | Champ | Scan complet (6 Pép.) | Identify (vision seule) | |
|---|---|---|---|:--:|
| patagonia | marque | Patagonia | Patagonia | = |
| | taille | M | M | = |
| | matière | Coton/Polyester | Coton mélangé | ≈ |
| | état | Bon | Bon | = |
| | catégorie | Mode | Mode | = |
| | modèle | null | null | = |
| zara | marque | Zara | Zara | = |
| | taille | **EUR S** | **S** | ≠ *(identify meilleur — « EUR S » n'existe pas dans la liste fermée Vinted)* |
| | matière | Coton | Coton mélangé | ≈ |
| | état | Très bon | Bon état | ≠ |
| | catégorie | Mode | Mode | = |
| volcom | marque | Volcom | Volcom | = |
| | taille | null | null | = |
| | matière | Coton/Polyester | Coton | ≈ |
| | modèle | Stone Vented Adjustable Cap | null | ≠ |
| | catégorie | Mode | Mode | = |
| cyrillus | marque | Cyrillus | Cyrillus | = *(logo moulé, aucun texte)* |
| | taille | null | null | = |
| | matière | *Leather* | Cuir | ≈ *(full répond en anglais)* |
| | modèle | Desert Boots | null | ≠ |
| | catégorie | Mode | Mode | = |
| momcozy | marque | Momcozy | Momcozy | = |
| | modèle | M5 | M5 | = |
| | matière | Silicone, plastique | Silicone/Plastic | ≈ |
| | état | Neuf avec étiquette | Très bon | ≠ |
| | catégorie | Beauté | Beauté | = |
| gshock | marque | Casio | Casio | = |
| | modèle | **G-Shock GD-100** ❌ | null | ≠ *(voir §4 : la valeur web est FAUSSE)* |
| | matière | Résine | Résine | = |
| | catégorie | High-Tech | Mode | ≠ |
| montre | marque | Omega | Omega | = |
| | modèle | Antichoc | null *(mais « Antichoc » est dans le titre)* | ≠ |
| | matière | Acier inoxydable | Métal (acier/alliage) | ≈ |
| | catégorie | **Musique** ❌ | High-Tech | ≠ *(le scan complet classe une montre en « Musique »)* |
| | attributs | `reference_fabricant: "Poinçons de contrôle qualité visibles au dos…"` ❌ | null | ≠ *(full injecte une phrase dans un champ MPN eBay)* |

**Bilan sur les champs d'annonce :**

| Champ | Verdict |
|---|---|
| **marque** | **7/7 identiques.** Y compris logo-seul (Cyrillus), marque obscure (Momcozy) et poinçon d'orfèvre (Omega). La recherche web n'a corrigé **aucune** orthographe. |
| **taille** | **7/7 exploitables**, dont 1 où identify est meilleur (Zara). |
| **catégorie** | 5/7 identiques ; sur les 2 écarts, identify est au moins aussi juste (une montre en « Musique » côté full). |
| **état / matière** | écarts purement lexicaux — `generate-listing` les rabat sur les listes fermées des plateformes, résultat identique dans les deux cas (§3). |
| **modèle** | **4 pertes sur 7.** Seule vraie régression. À nuancer fortement (§4). |
| **attributs_visibles** | bruité dans les deux modes ; le seul contenu franchement dangereux vient du scan **complet** (phrase libre dans un aspect eBay). |

### 2.2 Les prix — l'écart est là

| Article | Complet | Identify | Écart | Recherches web |
|---|---:|---:|---:|---:|
| patagonia | 55 € | 55 € | **0 %** | 2 |
| volcom | 18 € | 18 € | **0 %** | 2 |
| montre | 320 € | 280 € | −12 % | 2 |
| momcozy | 145 € | 180 € | +24 % | 2 |
| cyrillus | 35 € | 45 € | +29 % | 4 |
| gshock | 45 € | 65 € | +44 % | 7 |
| zara | 18 € | **45 €** | **+150 %** | 2 |

Identify est **systématiquement optimiste** (6 écarts sur 7 vers le haut), et
l'optimisme se propage : `verdict` passe de `moyen` à `bon` sur Zara, Cyrillus
et G-Shock, `score` de 5 à 7. C'est le seul poste où l'absence de web fait une
différence structurelle.

### 2.3 Sans la photo d'étiquette — ce que le web rattrape

| Article | Mode | Marque | Recherches | Résultat |
|---|---|---|---:|---|
| patagonia sans étiquette | complet | Patagonia | 1 | logo P-6 reconnu |
| patagonia sans étiquette | identify | Patagonia | 0 | **identique** |
| zara sans étiquette | complet | **null** | **8** | 8 recherches, `confiance: basse`, 22 € |
| zara sans étiquette | identify | **null** | 0 | **même conclusion**, 28 € |

**La recherche web n'identifie pas une marque invisible.** Elle confirme une
marque déjà lue. Sur la robe sans étiquette, le scan complet a brûlé
**8 recherches** (≈ 0,08 $ de frais fixes, plus les tokens re-facturés à chaque
itération) pour arriver exactement où identify arrive gratuitement : `marque =
null`, `confiance = basse`.

---

## 3. La description — les deux versions, l'une sous l'autre

Rappel de mécanique, parce qu'il change la lecture de cette section :
**`generate-listing` n'envoie AUCUNE photo au modèle qui rédige l'annonce.** Il
lui envoie un contexte texte (`itemContext`, ligne 711) fait de la marque, du
titre, du type et de **la description produite par le Lens**. La qualité du
texte d'annonce est donc exactement la qualité de la description Lens — c'est le
maillon qu'on teste ici.

Longueur moyenne des descriptions Lens : **244 caractères en complet, 247 en
identify**. Aucune perte de matière.

### Exemple 1 — Patagonia (marque courante, étiquette lisible)

```
DESCRIPTION LENS — SCAN COMPLET
Sweatshirt à capuche Patagonia gris en bon état. Logo Patagonia visible sur la
poitrine. Étiquette intérieure présente. Pas de taches ni de déchirures
apparentes.

DESCRIPTION LENS — IDENTIFY
Sweatshirt Patagonia gris chiné avec logo brodé sur la poitrine. Étiquette
intérieure visible avec composition textile. État général bon, pas de défaut
majeur visible.
```

```
ANNONCE VINTED — DEPUIS LE SCAN COMPLET
Titre : Patagonia Hoodie Gris
Super sweatshirt à capuche Patagonia gris en bon état! 🌟 Le logo iconique est
bien visible sur la poitrine, et l'étiquette intérieure est présente. Pas de
taches ni de déchirures — juste un classique intemporel prêt à partir ✨ Envoi
rapide! 📦
champs : taille null · matiere Coton · couleur Gris · etat Bon état ·
         marque Patagonia · genre Homme

ANNONCE VINTED — DEPUIS L'IDENTIFY
Titre : Sweatshirt Patagonia gris chiné logo brodé
Super sweatshirt Patagonia en gris chiné ! 🌟 Logo brodé sur la poitrine, un
classique incontournable de la marque. L'étiquette intérieure est bien visible
avec la composition textile complète. Bon état général, aucun défaut majeur —
prêt à être porté ! ✨ Envoi rapide et soigné 📦
champs : taille null · matiere Coton · couleur Gris · etat Bon état ·
         marque Patagonia · genre Homme
```

**Champs plateformes identiques au caractère près.** Les deux textes se valent.

### Exemple 2 — Casio G-Shock (hors textile, modèle à trouver)

```
DESCRIPTION LENS — SCAN COMPLET (7 recherches web)
Montre digitale G-Shock GD-100 avec boîtier et bracelet en résine noire.
Affichage digital avec rétroéclairage LED. Résistance à l'eau 200m, résistance
aux chocs. Fonctions : chronomètre, alarme, heure universelle, calendrier. État
d'usage avec signes d'usure mineurs visibles sur le bracelet et le boîtier.

DESCRIPTION LENS — IDENTIFY
Montre G-Shock Casio noire avec boîtier et bracelet en résine. Affichage hybride
analogique-numérique. Bracelet noir avec boucle de sécurité. État général bon,
quelques traces d'usure visibles sur le boîtier et le bracelet.
```

⚠️ **Le scan complet a tort.** La montre en photo est une **GA-2100**
(lunette octogonale, aiguilles + LCD, « PROTECTION » en bas de boîtier). Le
scan complet, après **sept** recherches web, l'annonce en « GD-100 », un modèle
**purement digital** — et enchaîne en décrivant un « affichage digital » qu'elle
n'a pas, avec une liste de fonctions qu'il n'a pas lues mais déduites du mauvais
modèle. Identify dit « analogique-numérique » : **c'est la bonne description**.

```
ANNONCE VINTED — DEPUIS LE SCAN COMPLET
Titre : Casio G-Shock GD-100 montre digitale noire
Montre digitale Casio G-Shock GD-100 avec boîtier et bracelet en résine noire ⌚✨
Caractéristiques:
• Affichage digital avec rétroéclairage LED
• Résistance à l'eau 200m
• Résistance aux chocs
• Fonctions: chronomètre, alarme, heure universelle, calendrier
État: Bon état d'usage avec quelques traces d'usure mineurs sur le bracelet et
le boîtier — totalement fonctionnelle! 🌟
Envoi rapide et soigné 📦
champs : modele « G-Shock GD-100 » ❌ · matiere Résine · couleur Noir

ANNONCE VINTED — DEPUIS L'IDENTIFY
Titre : Montre Casio G-Shock noire analogique-numérique
Montre G-Shock Casio authentique en noir 🖤✨
Caractéristiques:
• Boîtier et bracelet en résine robuste
• Affichage hybride analogique-numérique
• Bracelet noir avec boucle de sécurité
• Design iconique G-Shock
État: Bon état général avec quelques traces d'usure visibles sur le boîtier et
le bracelet — tout à fait normal pour ce type de montre sportive.
Envoi rapide et soigné 📦 N'hésite pas si tu as des questions!
champs : modele « G-Shock » · matiere Résine · couleur Noir
```

Le scan complet remplit le champ `modele` de Vinted/eBay — **avec une valeur
fausse**. Identify le laisse générique. Une annonce moins précise se corrige ;
une annonce fausse revient en litige.

### Exemple 3 — Omega Antichoc (pièce rare)

```
DESCRIPTION LENS — SCAN COMPLET
Montre vintage Omega Antichoc avec boîtier carré et bracelet hexagonal intégré
en acier. Cadran doré avec index bâtons. Lunette sertie de cristaux. Mouvement
visible sur le dos du boîtier avec poinçons de contrôle de qualité. État d'usure
visible : patine du cadran, rayures sur le bracelet, cristal légèrement terni.
Fonctionne mais nécessite probablement un service.

DESCRIPTION LENS — IDENTIFY
Montre vintage Omega Antichoc avec boîtier carré orné de cristaux de strass
autour du cadran. Bracelet en métal avec motif hexagonal. Cadran doré avec index
bâtons. Mécanisme visible, aiguilles présentes. Boîtier arrière gravé avec
poinçons de contrôle (triangle, 0.750, 18K). État d'usure visible : rayures sur
le bracelet, patine du boîtier, cristaux partiellement endommagés.
```

Identify **lit le poinçon d'or** (`0.750`, `18K`) et l'écrit dans l'annonce. Le
scan complet, lui, se contente de « poinçons de contrôle de qualité » — il a
regardé le web au lieu de regarder la photo. Sur une montre en or, c'est
l'information qui fait le prix.

```
ANNONCE LEBONCOIN — DEPUIS LE SCAN COMPLET
Titre : Montre vintage Omega Antichoc boîtier carré bracelet hexagonal acier
Montre vintage Omega Antichoc avec boîtier carré et bracelet hexagonal intégré
en acier. Cadran doré avec index bâtons. Lunette sertie de cristaux. Mouvement
visible sur le dos du boîtier avec poinçons de contrôle de qualité. État d'usure
visible : patine du cadran, rayures sur le bracelet, cristal légèrement terni.
Fonctionne mais nécessite probablement un service. Remise en main propre ou
envoi en petit colis.

ANNONCE LEBONCOIN — DEPUIS L'IDENTIFY
Titre : Montre Omega Antichoc vintage boîtier carré strass bracelet hexagonal
Montre vintage Omega Antichoc. Boîtier carré orné de cristaux de strass autour
du cadran. Bracelet en métal avec motif hexagonal. Cadran doré avec index
bâtons. Mécanisme visible, aiguilles présentes. Boîtier arrière gravé avec
poinçons de contrôle (triangle, 0.750, 18K). État d'usure visible : rayures sur
le bracelet, patine du boîtier, cristaux partiellement endommagés. Envoi possible
ou remise en main propre.
```

**Réponse à la question 3 : oui, le texte tient — et sur 2 des 3 exemples, la
version identify est la meilleure des deux.** La description ne dépendait pas du
web : elle dépend de la lecture des photos, et retirer la recherche rend au
modèle son attention.

---

## 4. Ce qu'on perd — franchement

### 4.1 Le prix. C'est la vraie perte, et elle est unilatérale

Sans web, le prix est une estimation de mémoire. Elle est **optimiste dans 6 cas
sur 7** et l'écart peut atteindre **+150 %** (robe Zara : 45 € contre 18 € au
marché). Conséquence en chaîne : `verdict` et `score` remontent artificiellement,
donc l'écran « bonne affaire » ment. Un identify qui affiche 45 € sur une robe
qui part à 18 € produit une annonce qui ne se vend pas — et l'utilisateur ne sait
pas pourquoi.

### 4.2 Le modèle exact — perte réelle, mais le web n'est pas la solution

4 pertes sur 7 (`volcom`, `cyrillus`, `gshock`, `montre`). Sur ces quatre :

- **Volcom « Stone Vented Adjustable Cap »** et **Cyrillus « Desert Boots »** :
  des appellations marketing, pas des valeurs de listes fermées. Vinted et eBay
  ne demandent `modele` que sur l'électronique — aucune de ces deux valeurs
  n'entre dans un champ de formulaire.
- **Omega « Antichoc »** : identify le met dans le **titre** (« Montre Omega
  Antichoc vintage… »), simplement pas dans le champ `modele`. L'information
  n'est pas perdue, elle est mal rangée.
- **G-Shock « GD-100 »** : **faux**, on l'a vu.

Et le point qui doit peser dans la décision : **la recherche web ne stabilise
pas le modèle**. Le même utilisateur a scanné la **même montre** (même main,
même alliance, même GA-2100) trois fois, à chaque fois avec le scan complet :

| Date | Mode | Modèle annoncé | Prix suggéré |
|---|---|---|---|
| 19/07 (prod) | complet | **GA-2100** ✅ | 120 € |
| 26/07 (prod) | complet | « digitale », pas de modèle | 55 € |
| 28/07 (ce test) | complet, 7 recherches | **GD-100** ❌ | 45 € |

Trois scans payants, trois réponses, un facteur **2,7×** sur le prix. Ce qu'on
achète à 6 Pépites, ce n'est pas une vérité de marché : c'est une opinion
recalculée à chaque fois. Ça ne disqualifie pas le scan complet — ça relativise
beaucoup ce que l'identify perd.

### 4.3 Ce qu'on ne perd pas

- La marque : **7/7**, y compris logo-seul, marque obscure et poinçon.
- La taille lue sur étiquette : **7/7**.
- La description : **égale ou meilleure**.
- Les attributs eBay : le scan complet est le seul des deux à avoir produit une
  valeur inutilisable (phrase libre dans `reference_fabricant`).
- L'identification quand rien n'est écrit : **strictement identique** (§2.3).

### 4.4 Défauts communs aux deux modes, à ne pas mettre sur le dos d'identify

- **Fuite de langue** : le prompt FR produit parfois un titre/description en
  anglais (identify sur `momcozy` ; **complet** sur `cyrillus` et `montre`). Bug
  préexistant, aucune instruction « réponds en français » dans le prompt.
- **`etat_estime` non normalisé** : « Bon » / « bon » / « Bon état » / « Très
  bon » selon les appels, dans les deux modes. Sans effet : `generate-listing`
  rabat sur les listes fermées.
- **`categorie` fantaisiste** : une montre classée « Musique » — côté scan
  complet.

---

## 5. Le coût — mesuré, pas estimé

Tarifs Haiku 4.5 : 1 $/MTok entrée, 5 $/MTok sortie, écriture de cache ×1,25,
lecture de cache ×0,1, web search 0,01 $/recherche. Change 1 € = 1,08 $.
Chiffres relevés dans les `usage` renvoyés par l'API sur les 7 articles.

| Article | Mode | Tours | Rech. | Entrée | Cache écrit | Cache lu | Sortie | Coût |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| patagonia | complet | 1 | 2 | 50 | 27 526 | 22 180 | 761 | **0,056 €** |
| zara | complet | 1 | 2 | 50 | 21 905 | 24 800 | 878 | **0,050 €** |
| volcom | complet | 1 | 2 | 50 | 21 291 | 24 388 | 814 | **0,049 €** |
| cyrillus | complet | 1 | 4 | 50 | 36 758 | 29 444 | 939 | **0,087 €** |
| momcozy | complet | 1 | 2 | 50 | 27 101 | 25 034 | 865 | **0,056 €** |
| gshock | complet | 1 | 7 | 64 | 60 051 | 114 890 | 1 337 | **0,151 €** |
| montre | complet | 1 | 2 | 43 | 24 206 | 10 019 | 908 | **0,052 €** |
| **Moyenne scan complet** | | | **3,0** | | | | | **0,072 €** |
| patagonia | identify | 1 | 0 | 6 195 | 0 | 0 | 743 | **0,0092 €** |
| zara | identify | 1 | 0 | 7 251 | 0 | 0 | 800 | **0,0104 €** |
| volcom | identify | 1 | 0 | 7 251 | 0 | 0 | 641 | **0,0097 €** |
| cyrillus | identify | 1 | 0 | 7 251 | 0 | 0 | 743 | **0,0102 €** |
| momcozy | identify | 1 | 0 | 7 251 | 0 | 0 | 785 | **0,0103 €** |
| gshock | identify | 1 | 0 | 7 251 | 0 | 0 | 762 | **0,0102 €** |
| montre | identify | 1 | 0 | 7 900 | 0 | 0 | 804 | **0,0110 €** |
| **Moyenne identify (sans cache)** | | | **0** | | | | | **0,0101 €** |

> **Un identify coûte 0,010 € — un septième d'un scan complet (0,072 €).**
> La fourchette est aussi beaucoup plus serrée : 0,0092 – 0,0110 € contre
> 0,049 – 0,151 €. Sans recherche web, le coût devient **prévisible** : un seul
> tour, un seul jeu d'images facturé une seule fois, pas de frais fixes.
> Latence : **9 s en moyenne contre 16 s**.

### Le cache de prompt — confirmation demandée

**Confirmé, et mesuré.** En mode identify, chaque article a été passé deux fois,
avec et sans le marqueur `cache_control` :

| Article | Avec cache (prod actuelle) | Sans cache | Écart |
|---|---|---|---|
| zara | écrit 7 215, **lu 0** → 9 055 tok facturés | 7 251 tok facturés | **+24,9 % d'entrée** |
| gshock | écrit 7 215, **lu 0** → 9 055 tok | 7 251 tok | +24,9 % |
| montre | écrit 7 864, **lu 0** → 9 866 tok | 7 900 tok | +24,9 % |
| **Moyenne, coût total de l'appel** | **0,0118 €** | **0,0101 €** | **+16,4 %** |

`cache_read_input_tokens = 0` sur **7 appels identify sur 7**. Le préfixe est
écrit à 1,25× et **jamais relu** : il n'y a qu'un tour, et le tour suivant
n'existe pas. Ton raisonnement est exact au chiffre près : +25 % sur l'entrée
facturée, +16 % sur le coût de l'appel, pour zéro bénéfice.

> **Le `cache_control` doit être retiré en mode identify.** Concrètement : ne
> poser le marqueur sur la dernière image que lorsque l'outil `web_search` est
> attaché à la requête.

Bonne nouvelle au passage sur le travail de cet après-midi : en mode **complet**,
le cache **est** relu massivement — 10 019 à 114 890 tokens lus par scan, tous
dans un seul appel HTTP. Le mécanisme n'est pas celui décrit dans
`LENS_COST.md` (les relances `pause_turn` : aucune n'a été déclenchée ici) mais
les **itérations internes de l'outil serveur**, qui relisent le préfixe à 0,1×
au lieu de le re-facturer plein tarif. Sur le G-Shock, ces 114 890 tokens lus
auraient coûté 0,115 $ sans cache, ils en coûtent 0,011 $. Le gain est réel, il
est simplement ailleurs qu'écrit.

### Effet sur la marge de la publication à 3 Pépites

Coût actuel d'une génération d'annonce `original` : ≈ 0,010 € (mesuré le 28/07,
cf. `LENS_COST.md` §6). Ajouter un identify le porte à **≈ 0,020 €**.

| Option | Prix payé (tarif gros conso., 0,033 €/Pép.) | Coût aujourd'hui | Coût avec identify | Marge |
|---|---:|---:|---:|---:|
| original (3 Pép.) | 0,10 € | 0,010 € | **0,020 €** | **80 %** |
| ia_light (12 Pép.) | 0,40 € | 0,056 € | 0,066 € | 84 % |
| ia_advanced (35 Pép.) | 1,17 € | 0,195 € | 0,205 € | 82 % |

Au tarif du pack d'entrée (0,05 €/Pépite), la publication `original` rapporte
0,15 € pour 0,020 € : **marge 87 %**. **Le modèle tient**, y compris dans
l'hypothèse la plus défavorable.

---

## 6. Le garde-fou

Identify serait « inclus » : **aucune Pépite débitée à l'appel**, donc rien
n'empêche de le lancer en boucle sans jamais publier. Exactement la situation des
quatre fonctions traitées cet après-midi — même remède, même helper.

### Calibrage sur les maxima réels (hors comptes de test)

| Mesure | Max réel/user/jour | p95 | Moyenne |
|---|---:|---:|---:|
| Scans Lens | **16** | 10 | 2,9 |
| Articles publiés (`cross_post_jobs`) | 1 | 1 | — |

### Proposition — deux étages

**Étage 1 — le plafond anti-boucle**, identique aux quatre autres fonctions :

```ts
import { appelAutorise, loggerAppelIA, tokensDe } from "../_shared/usage-guard.ts";

// Seuil 100/24 h. Le maximum réel observé toutes analyses confondues est 16/j.
// Un utilisateur ne l'atteindra jamais ; seule une boucle le peut.
if (!(await appelAutorise(adminClient, user.id, "lens_identify", 100))) {
  console.warn(`[lens-analysis] garde-fou identify atteint pour ${user.id}`);
  return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, ... });
}
```

100 identifies = **1 €/jour/utilisateur** au pire absolu. Comptage sur
`usage_logs` (aucune migration), erreur de lecture ⇒ on laisse passer, log en
échec ⇒ l'appel répond quand même. Mêmes trois principes que `usage-guard.ts`.

**Étage 2 — l'idempotence, qui rend la boucle inutile** : mémoriser le résultat
par **jeu de photos** (hash trié des URLs) pendant 24 h, dans le `metadata` de la
ligne `usage_logs`. Re-cliquer sur « Analyser » avec les mêmes photos renvoie le
résultat mémorisé **sans appel API**. Ça coûte une lecture, ça supprime le cas
d'abus le plus probable — qui n'est pas un script malveillant mais un utilisateur
qui re-clique parce que le résultat ne lui plaît pas.

Les deux étages sont indépendants et cumulables. L'étage 1 seul suffit à couvrir
le risque financier ; l'étage 2 améliore aussi l'expérience.

---

## Verdict et recommandation

**L'idée tient.** Le seul champ d'annonce qui dépendait du web est le prix ; tout
le reste se lit sur la photo, et se lit aussi bien — parfois mieux — sans
recherche. Sept articles, un écart de marque : zéro. Un identify coûte 0,010 €,
soit un septième d'un scan complet, en 9 secondes au lieu de 16.

Trois décisions à prendre avant de coder :

1. **Le prix.** Recommandation : **identify ne renvoie pas de prix** (`null`
   sur `prix_vente_suggere`, `fourchette_*`, `vitesse_vente`, `score`,
   `verdict`). Deux raisons. La bonne : sans donnée marché, le chiffre est faux
   dans un sens connu (+24 % à +150 %) et il contamine le verdict. La
   commerciale : si l'identify inclus donne un prix crédible, plus personne ne
   paie 6 Pépites pour le scan complet — **le prix est exactement ce qui reste à
   vendre**. L'utilisateur saisit son prix (le champ est déjà là, déjà
   éditable), ou paie le scan complet pour l'obtenir. À défaut, deuxième choix :
   renvoyer le prix mais l'afficher explicitement comme « estimation sans
   vérification marché », et ne **jamais** en tirer un verdict.
2. **Le `cache_control`.** À retirer sur ce mode — mesuré à +16 % de coût pour
   rien. Le poser uniquement quand `web_search` est attaché.
3. **Le garde-fou.** `appelAutorise(..., "lens_identify", 100)` + idempotence par
   jeu de photos.

Deux corrections indépendantes repérées en chemin, à traiter à part car elles
touchent le **scan complet** en production :

- `reference_fabricant` peut recevoir une phrase libre (« Poinçons de contrôle
  qualité visibles au dos (triangle, chiffres partiellement lisibles) ») au lieu
  d'une référence imprimée, alors que le prompt l'interdit explicitement. Cette
  valeur est injectée comme contexte dans `resolve_aspects`
  (`ListingPreviewScreen.jsx:3555` → `generate-listing:413`), qui alimente des
  aspects eBay acceptant la **saisie libre** : une phrase peut donc finir dans
  « Numéro de pièce fabricant ».
- Aucune instruction de langue dans le prompt : titres et descriptions
  ressortent parfois en anglais sur des articles français.
