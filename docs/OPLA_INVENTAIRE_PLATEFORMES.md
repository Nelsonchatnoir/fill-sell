# Opla — lot 4 (b) : inventaire des endroits qui listent les plateformes en dur

**Relevé du 2026-09-15. AUCUNE modification faite** — c'est une mesure, pas un
chantier. Objet : savoir combien d'endroits devraient changer avant d'en toucher
un seul, et lesquels sont bloquants.

---

## 1. Base de données — BLOQUANT, et c'est le seul vrai verrou

Deux contraintes `CHECK`, lues en prod le 15/09 (`pg_get_constraintdef`) :

| Table | Contrainte | Valeurs acceptées |
|---|---|---|
| `cross_post_jobs` | `cross_post_jobs_platform_check` | vinted, leboncoin, beebs, ebay, **vestiaire** |
| `platform_category_aspects` | `platform_category_aspects_platform_check` | vinted, leboncoin, beebs, ebay |

Tant qu'elles sont en l'état, **un job Opla ne peut pas être inséré** et aucun
champ Opla ne peut être catalogué. Tout le reste de cet inventaire est théorique
avant cette migration — d'où le lot 4 (a),
`supabase/migrations/20260915090000_opla_platform_check.sql`, **écrite et non
appliquée** (validation et déclenchement par Nico).

> `vestiaire` est déjà dans la liste de `cross_post_jobs` sans exister nulle part
> ailleurs : une valeur acceptée n'implique donc aucun code. Ouvrir la contrainte
> n'active rien.

## 2. Extension — le registre des handlers

| Fichier | Point | Nature |
|---|---|---|
| `background.js` | `PLATFORM_HANDLERS` (~l.352) | **le registre** : `{ implemented, newListingUrl }` par plateforme. C'est lui qui décide ce qui est traitable. |
| `background.js` | `NU_CHANNEL_BY_PLATFORM` (~l.1644) | où atterrit la réponse d'un needs_user (`vintedAspects`, `lbcAspects`…). **Miroir exact** de `src/tabs/StockTab.jsx` — les deux doivent dire la même chose, le bandeau du code le rappelle. |
| `background.js` | `probePlatformSessions(...)` (~l.8842) et ~l.8965 | listes littérales `["vinted","leboncoin","ebay","beebs"]` pour la sonde de session. |
| `manifest.json` | `host_permissions` + `content_scripts[].matches` | ⛔ **hors périmètre, geste de Nico.** `https://www.opla.co/*` y est pour le seul build unpacked ; `package:extension` refuse tout paquet qui le porte (cf. `scripts/hotes-livrables-cws.mjs`). |

## 3. Edge Functions — 3 fichiers, 5 endroits

| Fichier | Ligne | Forme |
|---|---|---|
| `get-pending-jobs/index.ts` | ~588 | `for (const pf of ["vinted","leboncoin","ebay","beebs"])` |
| `get-pending-jobs/index.ts` | ~2291 | `.in("platform", ["vinted","leboncoin","ebay","beebs"])` |
| `get-pending-jobs/index.ts` | ~2299 | même boucle que 588 |
| `resolve-categorie/index.ts` | 39 | `const PLATEFORMES = [...] as const` — **typé**, donc ajouter Opla change un type |
| `_shared/sale-orchestration.ts` | 35 | libellés, `vestiaire` compris |

## 4. Application React — 20 endroits, tous d'affichage sauf un

**Structurant (1)** : `src/tabs/StockTab.jsx` l.744 `NU_CHANNEL_BY_PLATFORM` —
miroir du background ; le désaligner casserait la boucle needs_user.

**Listes de plateformes traitées (5)** : `src/utils/stockFiltres.js` l.41
`PLATEFORMES_STOCK` · `src/utils/publicationState.js` l.134 `ORDRE_PLATEFORMES` ·
`src/components/ListingPreviewScreen.jsx` l.76 `PLATFORMS_DEFAULT` et l.5106 ·
`src/tabs/StockTab.jsx` l.1259 `RM_PLATFORMS`.

**Libellés / couleurs / logos, purement cosmétiques (14)** : `src/App.jsx`
l.1300, 6066, 6571, 6603 · `ListingPreviewScreen.jsx` l.59, 75, 2569, 4946, 5635 ·
`StatsTab.jsx` l.186 · `StockTab.jsx` l.7480 · `shared.js` l.46, 53 ·
`ExtensionReminderModal.jsx` l.53 · `stockFiltres.js` l.44.

**Deux cas particuliers** : `src/utils/childSizes.js` l.119
`MONTHS_OPEN_PLATFORMS` (règle métier de tailles enfant — Opla a ses propres
grilles, relevées au lot 0, donc à trancher, pas à copier) et
`src/utils/descriptionMentions.js` l.25 (liste de mots interdits dans les
descriptions : `opla` devra y entrer **comme mention à retirer chez les
concurrents**, ce qui est l'inverse d'un ajout de plateforme).

---

## Total et lecture

**≈ 31 endroits**, dont :
- **2 bloquants** (les contraintes SQL) ;
- **3 structurants** (`PLATFORM_HANDLERS`, les deux `NU_CHANNEL_BY_PLATFORM`) ;
- **~12 fonctionnels** (listes de traitement, serveur et app) ;
- **~14 cosmétiques** (libellés, couleurs, logos).

Ce que ça dit : il n'existe **aucune source unique** de la liste des plateformes.
Les deux `NU_CHANNEL_BY_PLATFORM` sont déjà signalés dans le code comme des
miroirs à tenir à la main. Avant d'ajouter une 5ᵉ plateforme pour de bon, la
question à trancher (Nico) est : on ajoute Opla aux 31 endroits, ou on crée
d'abord un registre partagé ? Je n'ai rien fait dans un sens ni dans l'autre.
