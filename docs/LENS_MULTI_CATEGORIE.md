# Lens multi-catégorie — investigation et refonte (11/08/2026)

Point de départ : un utilisateur signale publiquement que le Lens « dit n'importe
quoi » sur des objets maison / bricolage. Vérification faite en base, **la
critique est fondée**.

---

## 1. Où vivent les prompts Lens

Un seul fichier, `supabase/functions/lens-analysis/index.ts`, et **un seul
constructeur de prompt** pour les deux modes :

| Mode | Déclencheur | Facturation | Écrit dans |
|---|---|---|---|
| `identify` | `body.mode === "identify"` | 0 Pépite, inclus dans le prix de publication | `lens_identify_cache` + `usage_logs` (feature `lens_identify`) |
| `full` | tout le reste (défaut) | `price_lens_overflow` = 6 Pépites | `usage_logs` (feature `lens`, `metadata.model = "per_scan"`) |

- `buildSystemPrompt(lang, platforms, countryName, photoCount, mode)` —
  `index.ts:167`. C'est la fonction unique ; le mode ne change pas de prompt, il
  active/désactive des blocs.
- Sélection du mode : `index.ts` dans `serve()`, `const mode = body?.mode === "identify" ? "identify" : "full"`.
- **Il n'y a pas de troisième prompt Lens.** Vérifié par recherche sur tout
  `supabase/functions/`. Les seuls autres prompts qui touchent au même objet
  métier sont :
  - `generate-listing/index.ts:599` (`resolve_aspects`) — prompt court qui
    **consomme** `attributs_visibles` produit par le Lens pour remplir les
    aspects eBay. Il ne voit aucune photo.
  - `deal-analysis/index.ts:278-295` — 4 prompts (`buy`, `price_advice`, `QA`,
    `score`). **Purement textuels, aucune photo** : hors périmètre Lens, mais ils
    produisent eux aussi une `categorie` (cf. incertitudes plus bas).

### Différences entre les deux modes (avant refonte)

| | `identify` | `full` |
|---|---|---|
| Outil `web_search` | non attaché | attaché (`web_search_20250305`) |
| Cache de prompt | non posé (mesuré inutile : 1 seul tour) | posé sur la dernière image |
| `max_tokens` | 1500 | 2500 |
| Champs de marché | absents du schéma **et** forcés à null dans le code (`CHAMPS_MARCHE`) | produits |
| Étapes du processus | 1, 1bis, 1ter, 2, 6, 7, 8 | + 3, 4, 5 |

### Prefill

Aucun prefill sur le chemin nominal. **Un seul** prefill assistant `"{"`, sur la
passe de réparation qui ne se déclenche que si le JSON n'a pas pu être parsé
(`index.ts`, bloc `PASSE DE RÉPARATION`). Cet appel n'a aucun outil attaché,
c'est ce qui rend le prefill sûr.

### Branche conditionnelle selon le type d'objet

**Aucune, avant cette refonte.** C'est le cœur du problème : le même schéma plat
était imposé à tous les objets. Les seules conditionnelles étaient `estIdentify`
(mode) et `lang` (langue) — jamais la nature de l'objet.

---

## 2. Le schéma imposé, et pourquoi il produisait des marques fausses

Le schéma de sortie était un **schéma de vêtement** :

```
titre, marque, modele, modele_source, matiere, couleur, etat_estime,
taille_estimee, categorie, description, confiance, notes, est_vendu,
prix_achat_reel, attributs_visibles
```

`attributs_visibles` était une **liste FERMÉE de 9 clés**, toutes textiles ou
cosmétiques : `nom_parfum, volume, teinte, reference_fabricant, taille_ecran,
capacite, hauteur, largeur, longueur`.

Conséquences mesurées :

1. **`marque` était un champ que le modèle se sentait obligé de remplir.** Rien
   dans le prompt ne disait que `null` était une bonne réponse. Pire, en mode
   `full`, l'étape 2 disait littéralement : « Si tu détectes une marque
   visuellement, tu DOIS faire une web search pour confirmer l'orthographe
   exacte » — une instruction qui **invite** à convertir un texte lu en marque
   réelle plausible.
2. **Les attributs qui font le prix hors textile n'avaient nulle part où aller**
   (tension de batterie, capacité de stockage, dimensions, référence de pièce,
   complet oui/non, fonctionne oui/non).

Relevé en base, `inventaire`, 9 derniers jours :

| Titre | `marque` renvoyée | Ce que c'est réellement |
|---|---|---|
| Petit meuble de rangement en bois – 4 tiroirs | `Amazon` | un distributeur |
| Console de jeu portable VideoJet 2" écran TFT | `Ppc` | la description dit elle-même « marque VideoJet visible » — **contradiction interne** |
| Ancienne lampe mineur ARRAS | `arras` | la ville gravée |
| Poupée porcelaine (×4 lignes) | `cp international` | ni le fabricant, ni vérifiable |

À l'inverse, un niveau à bulle Milwaukee ressort correctement identifié, avec une
note honnête sur ce qui manque. **Le modèle en est capable : c'est le cadrage qui
l'en empêchait, pas la vision.**

---

## 3. Liste de catégories autorisée, et où elle était définie

Elle était **en dur dans la chaîne du schéma**, `index.ts:199` — pas dans une
constante, donc invisible à toute recherche par nom :

```
"Mode" | "High-Tech" | "Maison" | "Sport" | "Musique" | "Beauté" | "Collection"
| "Livres" | "Auto-Moto" | "Électroménager" | "Jouets" | "Autre"
```

### Source de vérité de `inventaire.type`, côté React

`inventaire.type` est **`text` nullable en base, sans contrainte** (vérifié :
`information_schema.columns`). La source de vérité est donc le **sélecteur de
l'app**, `src/App.jsx` (liste d'`<option>` du modal d'édition d'article) :

```
Mode · High-Tech · Maison · Électroménager · Jouets · Livres · Sport ·
Auto-Moto · Beauté · Musique · Collection · Multimédia · Jardin · Bricolage · Autre
```

(+ `Luxe`, marqueur legacy que le code écarte explicitement :
`(lensResult.categorie && lensResult.categorie !== 'Luxe')`.)

Les mêmes 15 valeurs sont reprises dans `src/utils/shared.js` :
`getTypeStyle()`, `CAT_TILE_COLORS`, `CAT_DEFAULT_ICONS`, `TYPE_LABELS_EN`, et
la détection automatique `detectType()`.

### L'écart trouvé

**`Bricolage` et `Jardin` existaient partout côté front — style, libellé EN,
couleur de tuile, icône, règle `detectType()` — mais étaient ABSENTS de
l'énumération du Lens.** Une perceuse ne pouvait donc pas être rangée
correctement par le Lens, quoi qu'il voie : elle finissait en `High-Tech` (la
règle `detectType` attrape `perceuse` avant, mais le Lens prime) ou en `Autre`.

C'est exactement la plainte de l'utilisateur, et ce n'était pas un problème de
prompt mais un trou dans une énumération recopiée à la main.

Second écart, plus discret : `normalizeCat()` (`src/App.jsx`) — utilisée pour le
délai de vente moyen par catégorie — renvoyait `Autre` pour `bricolage`,
`jardin` et `multimedia`. Ces trois types étaient donc fondus dans « Autre » dans
les stats, même quand l'utilisateur les avait choisis à la main. Corrigé.

---

## 4. Les deux points creusés sur demande

### 4.1 `marque_absente` : le drapeau est honnête, le prompt ne l'était pas

Vérification du code : `marque_absente` est **purement observationnel**. Il est
calculé APRÈS coup (`const marqueAbsente = !marqueBrute || ...`) et n'est écrit
que dans `usage_logs.metadata`. **Il ne remplit rien, ne corrige rien, et
`marque` n'est jamais réécrite.** Quand le drapeau est levé, `marque` est bien
`null` dans la réponse renvoyée au front.

Autrement dit : les 21 scans sur 134 marqués `marque_absente` sont les cas où le
modèle a **honnêtement** renvoyé null. Le bug n'est pas là.

**Le bug est dans les 113 autres** : rien ne distingue une marque lue d'une
marque attrapée. Et le constat structurel est celui-ci —

> `marque` était le SEUL champ d'identité sans aucun garde-fou serveur.
> `modele`, `modele_source`, `etat_estime` et `reference_fabricant` sont tous
> normalisés ou rejetés par `assainirSortie()`. `marque` traversait brute.

D'où le choix de traiter le problème en deux endroits : des interdictions
nommées dans le prompt (§2.3) **et** un plafond de confiance dans le code, parce
qu'« un modèle qui ignore la consigne une fois l'ignorera encore » (doctrine
déjà posée pour le MPN le 28/07).

### 4.2 Les 15 scans à `web_search_requests = 0` : dégradés, et facturés plein tarif

Relevé sur 7 jours, `feature = 'lens'` :

| | scans | coût moyen | sortie moyenne | `marque_absente` | échecs |
|---|---|---|---|---|---|
| `ws = 0` | **15** | **0,0152 $** | **693 tokens** | 6 / 15 (**40 %**) | 1 |
| `ws > 0` | 121 | 0,1001 $ | 1338 tokens | 15 / 121 (12,4 %) | 0 |

Trois choses :

1. **La cause.** `tool_choice` n'est pas positionné sur l'appel, il vaut donc
   `auto` par défaut : rien n'oblige le modèle à chercher. Le prompt dit
   « Toujours baser les prix sur une web search réelle », mais une consigne n'est
   pas une contrainte. `tours = 1` sur ces lignes confirme qu'il a répondu du
   premier coup sans jamais appeler l'outil.
2. **Le résultat est dégradé, et de façon mesurable.** 693 tokens de sortie,
   c'est exactement le calibre d'un `identify` (mesuré 641–804 sur 7 articles) :
   les champs de marché — `fourchette_marche`, `annonces_marche`, `conseils`,
   `vitesse_vente` — sont produits **sans aucune source**, ou vides. Et le taux
   de marque absente y est **3,2× plus élevé**.
3. **C'est donc autant un problème de facturation que de qualité.** L'utilisateur
   paie 6 Pépites pour « le prix du marché, sourcé ». Sur ces 15 scans il obtient
   une estimation sans source, à un coût d'API 6,5× inférieur, et rien ne le lui
   dit. Aucun code ne détecte le cas, aucun remboursement n'est déclenché.

> ⚠️ **Le « cost_usd quasi nul (min 0.0000) »** relevé par Nico est un artefact
> de lecture : ce sont des lignes **antérieures au 08/08**, date d'introduction
> de `cost_usd`. Leur `cost_usd` est `null`, pas 0 (2 lignes sur les 15 ; 48 sur
> les 121 de l'autre groupe). Le vrai coût moyen d'un scan `ws = 0` est
> 0,0152 $. Le fond du constat tient, l'ordre de grandeur change.

**Ce point n'est PAS corrigé par cette livraison** — voir §6.

---

## 5. Ce qui a été livré

### 5.1 Observabilité (déployée en premier, volontairement)

Commit `23e5a4c`, déployé **avant** la refonte du schéma pour disposer de
quelques heures de mesure à l'ancien comportement.

Ajouté dans `usage_logs.metadata`, sur `lens` **et** `lens_identify` :
`famille`, `categorie`, `marque_nulle`, `confiance`, `nb_attributs`,
`titre_genere` (120 car. max).

- `lens_identify` est inclus volontairement : c'est le mode compris dans le prix
  de publication, donc celui qui alimente le plus d'articles d'inventaire.
- Ni photo, ni URL, ni description, ni notes, ni note utilisateur.
- **Aucune migration** : `usage_logs.metadata` est déjà `jsonb`. Rien à
  `GRANT`er — la règle du breaking change Supabase de mai 2026 ne s'applique
  qu'à une nouvelle table ou colonne, et il n'y en a pas.

### 5.2 Schéma à deux niveaux

**Socle commun** (inchangé dans ses noms, pour ne rien casser côté front) :
`titre`, `famille` *(nouveau)*, `categorie` *(désormais **dérivée**)*, `marque`,
`modele` + `modele_source`, `reference` *(nouveau, **miroir**)*, `couleur`,
`matiere`, `etat_estime`, `taille_estimee`, `confiance`, `notes`, `description`.

**Attributs spécifiques** : `attributs_visibles` devient un sac clé/valeur
**ouvert**, dont les clés utiles sont listées par famille dans le prompt.

Trois écarts assumés par rapport à la lettre du brief, chacun pour éviter deux
sources de vérité pour un même fait :

| Brief | Livré | Pourquoi |
|---|---|---|
| `etat` | `etat_estime` | nom existant, consommé par `ListingPreviewScreen`, `App.jsx`, `LensTab`. Le renommer casse le front pour rien. |
| `reference` demandée au modèle | `reference` **recopiée par le serveur** depuis `attributs_visibles.reference_fabricant` validé | `reference_fabricant` a déjà 3 paragraphes de règles et une validation serveur. Demander deux fois le même fait, c'est le faire diverger. |
| nouvel objet `attributs` | `attributs_visibles` ouvert | `assainirAttributsVisibles()` (front) et `resolve_aspects` (generate-listing) lisent déjà ce champ-là de façon générique. Un second sac aurait dédoublé le flux eBay. |

### 5.3 Familles → catégories : mapping explicite et exhaustif

17 familles, mappées **dans le code** (`FAMILLE_VERS_CATEGORIE`, `index.ts:113`),
jamais par correspondance de nom. `categorie` **n'est plus demandée au modèle** :
elle est dérivée. Deux champs libres censés s'accorder, c'est deux champs qui
finissent par se contredire — exactement ce qui s'est produit entre `marque` et
`description` sur la console VideoJet.

| famille | → `categorie` / `inventaire.type` |
|---|---|
| `mode`, `chaussures` | Mode |
| `bricolage` | **Bricolage** *(nouvellement atteignable)* |
| `jardin` | **Jardin** *(nouvellement atteignable)* |
| `electromenager` | Électroménager |
| `high_tech` | High-Tech |
| `mobilier`, `maison_deco` | Maison |
| `jouets` | Jouets |
| `collection` | Collection |
| `auto_moto` | Auto-Moto |
| `livres_medias` | Livres |
| `sport` | Sport |
| `musique` | Musique |
| `beaute` | Beauté |
| `puericulture` | **Autre** *(renvoi volontaire, tracé — voir plus bas)* |
| `autre` | Autre |

Deux familles ajoutées au-delà de la liste du brief :

- **`musique`** — obligatoire, sinon régression : la catégorie `Musique` existait
  dans l'ancienne énumération et serait devenue inatteignable.
- **`jardin`** — le type existe côté front avec sa règle `detectType`
  (tondeuse, débroussailleuse, tronçonneuse…) et n'était atteignable par aucun
  chemin Lens.

Renvois volontaires et tracés :

- **`puericulture` → `Autre`.** L'app n'a pas de type « Puériculture », et
  « Jouets » est faux pour une poussette. `detectType()` envoie déjà
  « poussette » sur `Autre` : on suit la convention existante plutôt que d'en
  inventer une. **Créer le type est une décision produit** (il change le
  sélecteur et les couleurs de stats) — cf. §6.
- **`Multimédia` reste hors d'atteinte du Lens** : il chevauche `High-Tech` et
  `Livres` sans frontière nette. Accessible à la main uniquement.
- Toute famille non reconnue retombe sur `autre` **avec un `console.warn` et un
  drapeau `famille_inconnue` dans `usage_logs`** — un slug inattendu ne peut pas
  vider silencieusement une catégorie.

### 5.4 Garde-fous serveur ajoutés

Le prompt seul ne suffit pas — l'étape 1bis interdisait déjà les valeurs déduites
depuis le 16/07 et la règle a été violée en prod.

- `assainirAttributs()` — clés normalisées en `snake_case` ASCII (40 car. max),
  valeurs bornées à 120 car., 20 clés max, nombres et booléens acceptés puis
  rendus en texte, et **28 formulations de « je ne sais pas » écartées**
  (`non renseigné`, `inconnu`, `N/A`, `?`, `aucun`…). Une clé refusée disparaît,
  elle n'est pas mise à `null`.
- `resoudreFamille()` — normalisation + 26 alias (`high-tech`, `meubles`,
  `outillage`, `bébé`…) pour qu'un simple tiret ne fasse pas basculer un article
  entier en « autre ».
- **Plafond de confiance dans le code** : sans marque **ni** référence lue,
  `confiance` ne peut pas dépasser `moyenne` ; famille non reconnue → `basse`.

### 5.5 Portée

Les règles §2.3 à §2.6 s'appliquent aux **deux modes** — la règle marque est une
seule chaîne, servie aux deux : une marque se lit sur des photos, la présence
d'un outil de recherche n'y change rien. Le mode complet ajoute seulement ce à
quoi l'outil a le droit de servir (vérifier l'orthographe d'une marque **déjà
lue**) et ce à quoi il n'a pas le droit de servir (aller chercher une marque non
lue ; remplacer une lecture par la marque réelle la plus proche).

L'étape 3 (estimation de prix) construit désormais sa requête dans cet ordre :
référence fabricant → marque + modèle → type d'objet + attributs. Et
explicitement : une marque `null` n'est pas une raison de sauter la recherche.

### 5.6 Non-régression

- **Textile** (97 articles sur 190 sur 7 jours) : les étapes 1, 1bis, 1ter, 6, 7,
  8 sont **inchangées mot pour mot**, y compris toute la logique `etat_estime`,
  `taille_estimee`, `couleur` et `modele_source`. `mode` et `chaussures` sont
  deux familles distinctes qui mappent toutes deux sur `Mode`.
- **Les 9 clés de l'ancien sac fermé sont toutes conservées et réparties** —
  `nom_parfum`/`volume`/`teinte` (beaute), `reference_fabricant` (universelle),
  `taille_ecran`/`capacite` (high_tech), `hauteur`/`largeur`/`longueur`
  (mobilier, maison_deco, autre). Aucune n'est perdue : la résolution des aspects
  eBay en dépend.
- **Résultats à l'ancien schéma** : `VERSION_PROMPT` est bumpée
  (`2026-08-11-familles`), donc les entrées de `lens_identify_cache` produites
  par l'ancienne version ne sont plus jamais relues (la clé de cache inclut la
  version). Aucun crash au rendu possible. Les brouillons persistés lisent tous
  en `??` / `||`.
- **Points de consommation vérifiés** : `LensTab.jsx` (badges),
  `App.jsx:5035-5137` (ajout au stock / vente), `ListingPreviewScreen.jsx`
  (`lensVal` par champ, `assainirAttributsVisibles`, `photoAnalysis`),
  `generate-listing` (`resolve_aspects`). L'extension Chrome ne lit **aucun**
  champ Lens. `famille` et `reference` sont des champs neufs que personne ne lit
  encore : ajout non cassant.

### 5.7 Coût

Le prompt système passe de ~11 000 à ~15 800 caractères en `identify` FR
(≈ +1 300 tokens d'entrée). En `identify` il n'y a pas de cache de prompt : cela
porte le coût mesuré de ~0,0101 € à ~0,0115 € par appel, soit **+13 %**. Le
plafond global journalier de 3 000 identifies passe donc de ~30 € à ~34 €.
En mode complet, le prompt est **dans le préfixe caché** : le surcoût est
quasi nul dès le second tour.

---

## 6. Ce qui reste ouvert — rien ne doit être codé là-dessus sans décision

1. **`tool_choice` sur `web_search` (§4.2).** Le correctif évident est de forcer
   l'outil, mais je n'ai **pas** vérifié empiriquement que `tool_choice` est
   accepté avec un outil **serveur** `web_search_20250305` sur Haiku 4.5 — la
   documentation que j'ai consultée décrit `tool_choice` pour les outils
   *définis par le client*, et ne le documente pas pour les outils serveur.
   **C'est une incertitude, pas une recommandation.** Trois options, par ordre de
   risque croissant : (a) journaliser le cas et rembourser tout ou partie des
   6 Pépites quand `web_search_requests = 0` — sûr, immédiat ; (b) rejouer une
   fois l'appel quand la recherche n'a pas eu lieu ; (c) forcer `tool_choice`,
   après un test réel sur un scan jetable. **À trancher par Nico.**
2. **Créer le type `Puériculture`** côté front (sélecteur, `getTypeStyle`,
   `CAT_TILE_COLORS`, `CAT_DEFAULT_ICONS`, `TYPE_LABELS_EN`, `normalizeCat`,
   `detectType`). Décision produit : ça change un écran utilisateur et les
   couleurs de stats. Aujourd'hui `puericulture` → `Autre`, tracé.
3. **`deal-analysis` produit aussi une `categorie`** (4 prompts textuels,
   `index.ts:278-295`), tout comme `voice-parse` / `voice-intent`. Ces chemins
   n'ont **pas** été alignés sur les familles : ils ne voient aucune photo et
   sortaient du périmètre du brief. Reste à vérifier s'ils souffrent du même trou
   `Bricolage`/`Jardin`. **Non vérifié.**
4. **`CAT_COLORS_MAP`** (`src/App.jsx`) semble être du code mort — défini, jamais
   référencé. Non touché, non supprimé : à confirmer avant nettoyage.
5. **La règle de cohérence `marque` ↔ `description`** est une consigne de prompt,
   pas une vérification serveur : la contradiction VideoJet resterait
   théoriquement possible. Un contrôle serveur supposerait de parser la
   description en langage naturel — disproportionné tant que la télémétrie n'a
   pas montré que le cas persiste. **À réévaluer sur les données post-fix.**

---

## 7. Comment vérifier que ça a marché

Les lignes d'avant le fix ont `famille = null`, celles d'après l'ont renseignée.

```sql
-- Taux de marque nulle et confiance, par famille, avant/après
WITH excluded AS (
  SELECT unnest(ARRAY['hoosslocal@gmail.com']) AS email
)
SELECT
  COALESCE(metadata->>'famille', '(avant fix)') AS famille,
  count(*)                                                        AS scans,
  round(100.0 * count(*) FILTER (WHERE (metadata->>'marque_nulle')::bool) / count(*), 1) AS pct_marque_nulle,
  count(*) FILTER (WHERE metadata->>'confiance' = 'haute')        AS confiance_haute,
  round(avg((metadata->>'nb_attributs')::int), 1)                 AS attributs_moyens,
  count(*) FILTER (WHERE metadata->>'famille_inconnue' = 'true')  AS familles_non_reconnues
FROM public.usage_logs u
LEFT JOIN auth.users au ON au.id = u.user_id
WHERE u.feature IN ('lens', 'lens_identify')
  AND u.created_at AT TIME ZONE 'Europe/Paris' > now() - interval '3 days'
  AND au.email NOT IN (SELECT email FROM excluded)
GROUP BY 1
ORDER BY scans DESC;
```

Ce qu'on attend : `pct_marque_nulle` **en hausse** sur `mobilier`, `maison_deco`,
`bricolage`, `collection` — une marque nulle est le résultat correct sur ces
familles-là. Et `familles_non_reconnues` à 0 ; sinon, le slug émis est à ajouter
aux alias.
