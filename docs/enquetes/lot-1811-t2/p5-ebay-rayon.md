> Annexe du rapport du lot T2 du 18/11 (docs/enquetes/lot-1811-t2/RAPPORT.md) : enquête de l'agent, copiée telle quelle,
> noms, pseudos et adresses remplacés par l'id8 du compte ou un repère (règle « données de clients »).

# Point 5 (18/11/2026) : 2f8b09d2, « aucun rayon eBay sûr »

Enquête en lecture seule. Rien n'a été écrit dans le dépôt, en base, chez eBay ni dans les fonctions. Les fichiers de travail sont dans `(dossier de travail vidé) `. Toutes les requêtes ont été relancées après la correction de `q.mjs`, qui crée désormais un fichier par appel.

## En bref

- **La table de correspondance n'est pas en cause.** `src/utils/ebayCategories.js` donne bien 🧥 + Homme → **57988** « Homme : vêtements › Manteaux, vestes et gilets ».
- **La cause est le genre de la copie eBay.** L'IA l'a deviné « Femme », alors que le vendeur a rangé l'article dans l'étagère Vinted **2551 « Hommes › … › Vestes coupe-vent »**. Les copies Beebs et Leboncoin du même lot sont parties en Homme et sont publiées.
- **Le blocage se fait en deux temps.**
  1. L'app pose 63862 « Femme : … › Manteaux, vestes et gilets », et sa propre vérification le refuse (`incoherent`).
  2. Le worker retire 63862 des suggestions d'eBay. Il demande ensuite le rayon le plus proche à l'IA, mais avec le genre « Femme ». L'IA écarte donc 57988, qui figurait pourtant dans la liste d'eBay (consigne « respecte le genre indiqué »). Résultat : aucun rayon, pause définitive.
- **Correctif de la règle (serveur, eBay par l'API, seulement après un refus).** Le genre qui sert au choix devient celui de l'article, dans cet ordre :
  1. le genre écrit dans le texte ;
  2. le genre choisi par la personne ;
  3. le public de l'étagère Vinted de la fiche, si le genre deviné le contredit.

  De plus, le rayon que notre correspondance donne avec ce genre est placé en tête des candidates. `REGLE_RAYON_VERSION` est relevée pour que la tâche en pause reparte seule.
- **Une seule fonction à redéployer : ebay-api-worker** (v135 lue, `verify_jwt` false, donc `--no-verify-jwt`). Aucune migration, aucune OTA, aucune extension.

## 1. La tâche bloquée

**La tâche** : `de2b3a54-fab4-476a-b0a8-06387fa4d540`, eBay par l'API, `publish`, créée le 17/11 à 22:28 (heure de Paris). Elle est en `needs_user`, source `ebay_rayon_a_notre_charge`, avec `rayon_rejoue.version = "2026-11-09"` (rejouée le 17/11 à 22:30).

**La fiche** : `inventaire` 1794948250785010 (`vinted_sync`), titre « Parka longue NikeLab ACG Gore‑Tex taille S kaki olive neuve avec étiquette ».
- `vinted_catalog_id` = 2551, et `attributs.categorie_vinted` = `{v: 2551, source: "vinted_detail"}`.
- Ni le titre ni la description ne nomment un genre : `genreDuTexte` renvoie null.

**Les copies du même lot (17/11, 22:28)** :

| Plateforme | Genre | Rayon | État |
|---|---|---|---|
| Beebs | `Homme` | « Mode › Homme › … › Manteaux (homme) » (`catalog_vinted`, confirmé) | publiée |
| Leboncoin | univers `Homme` | « Mode › Vêtements » | publiée |
| **eBay** | **`Femme`** | `ebayCategoryId` 63862, `ebayAspects.Département` « Femme » | en pause |

Pour eBay : `categorie_source` = `icone_non_confirmee` et `categorie_verification` = `{source_avant: "catalog_vinted", objet: "parka", verdict: "incoherent"}`.

**Ce que dit `categorie_journal`** (même compte, heure de Paris) :
- **22:27:30, vérification par l'app** : eBay, 1 candidate (Femme Manteaux) → `aucune`. Dans le même appel, Beebs, 1 candidate (Homme Manteaux) → `choisi`.
- **22:28:08 et 22:30:09, worker** : eBay, 9 candidates → `aucune` les deux fois.

**Où ça se passe** :
- **Le genre deviné.** `supabase/functions/_shared/redaction-plateformes.ts:102` (consigne eBay) demande de « trancher "Femme" ou "Homme" au moindre signal ». Chaque copie devine donc son genre de son côté.
- **La correspondance icône + genre → rayon.** `src/utils/ebayCategories.js:820-831` (`MODE["🧥"]` : Femme 63862, Homme 57988). Elle est appliquée par `src/utils/resolutionPublication.js` avec le genre de la copie.
- **Le refus par la vérification.** `src/utils/resolutionPublication.js:1764` pose `verdict: "incoherent"` et `categorie_source: "icone_non_confirmee"`.
- **Le choix après refus côté worker.** `supabase/functions/ebay-api-worker/index.ts:1515-1526`. On y trouve `suggestionsSansRefus(...)`, puis `choisirApresRefus(restantes, { titre, genre: pf.genre, ... })`, qui transmet **le genre deviné**. La consigne `SYSTEM_PLUS_PROCHE` (`supabase/functions/resolve-categorie/index.ts:126`) dit « Respecte le genre et l'âge indiqués ».
- **Les suggestions d'eBay** (titre complet) : `142562 Militaria`, `63862` (refusé), `63861 Robes`, **`57988 Homme : … Manteaux, vestes et gilets`**, `51933 Garçon Manteaux`, `134391 Skis`, `134426 Rugby`, `63864 Jupes`, `185083 Brassières`, `93328 Équipements de neige`.
- **La mise en pause.** `index.ts:776-778` (`aNotreCharge`), avec le message de `_shared/ebay-rayon-a-notre-charge.js:104`.

**Le mécanisme manquant.** La règle du 06/11 (point 4a) aligne le genre des autres copies sur le public Vinted (`copiesAuPublicChoisi`, `src/utils/rayonPublication.js:241-300`). Mais elle ne joue que si la personne choisit son rayon Vinted à l'écran. L'étagère d'une fiche synchronisée depuis Vinted, qui est aussi le choix du vendeur, n'aligne rien. Le worker, lui, ne lit pas cette étagère : `lireInventaire` (`index.ts:~1300`) lit seulement `titre` et `attributs`.

## 2. Les autres tâches dans le même état (tous comptes)

**Aujourd'hui, une seule tâche est en pause « chez nous » : celle de 2f8b09d2.**

Toute l'histoire des blocages de rayon et d'état eBay (13 tâches) :

| Groupe | Rayon de départ | Tâches | Comptes | Devenir |
|---|---|---|---|---|
| **A. Rayon de l'app refusé, aucune suggestion retenue** | Femme Manteaux 63862 (étagère Vinted 2551 Hommes, cause : genre) | 1 | 2f8b09d2 | en pause |
| | Jardin › Pots, jardinières 20518 (objet « aquarium », aucune étagère) | 1 | 010ff35b | annulée par la personne |
| | DVD, cinéma › DVD, Blu-ray 617 (« vhs », étagère 3048 Livres et médias › VHS) | 1 | 48dd94f7 | abandonnée |
| | Électroménager › Réfrigérateurs 71262 (« désodorisant », étagère 3516) | 1 | 13e274de | annulée |
| | Livres › Fiction 171228 (« cassette vhs », 20/10, avant la règle médias du 02/11) | 1 | 48dd94f7 | annulée |
| B. Hors famille | Jeux vidéo › Jeux 139973 (station de charge Joy-Con) | 1 | 40e1122e | abandonnée |
| C. Famille `livres_medias` sans rayon Livres (19-20/10, réglé le 02/11, v106) | | 2 | 48dd94f7 | annulées |
| D. État refusé (lit bébé 93391, neuf seulement ; réglé le 09/11) | | 3 annulées + 1 publiée en 58761 | 6e3d92b3 | réglé |
| E. Lot de vêtements (réglé le 09/11, en 260011) | | 1 publiée | 6e3d92b3 | réglé |

**Ce que ça montre.** Il n'y a ni rayon Vinted entier non couvert, ni seuil de confiance trop strict. Ce sont des objets à chaque fois différents. Le seul trait mécanique commun aux cas A : après le refus, les seules candidates sont les suggestions d'eBay pour le titre complet, choisies par l'IA avec le genre de la copie. Dans le cas 2f8b09d2, la bonne feuille était dans la liste et a été écartée à cause du genre.

**Ce que la même faille fait en amont, sans bloquer** (tâches eBay publish/republish, 60 jours, fiches avec une étagère Vinted Femmes ou Hommes) :
- **66 copies sur 981** ont un genre eBay contraire à l'étagère, sur **18 comptes** (dont 22 pour 48dd94f7).
- **56 sont publiées** dans le rayon de l'autre genre ; 9 sont annulées ; 1 est en pause (celle-ci).
- **Le vrai genre n'est pas toujours celui de l'étagère** :
  - étagère juste, eBay faux : la parka AQ3516 ; le jean slim Kenzarro (étagère Hommes, eBay Femme) ;
  - eBay juste, étagère fausse : la chemise Lacoste T39 (étagère Femmes, eBay Homme) ; le blazer New Look UK14 / FR42 (étagère Hommes, eBay Femme) ; le pull de la marque « Formen » (étagère Femmes, eBay Homme).
- **Conséquence** : faire primer l'étagère partout en amont demande une décision de Nico (voir § 7). Le correctif ci-dessous reste dans le seul cas où l'app a déjà refusé le rayon.
- Ces chiffres sont calculés par `(dossier de travail vidé) genre_vs_vinted.mjs` sur `(dossier de travail vidé) ebay_vcat.jsonl`.

**Preuve de cohérence.** Pour l'étagère 2551, les publications eBay déjà parties sont en 57988 (5 fois), 51933, 185702 et 185708.

## 3. Cause racine et correctif de la règle

**Cause racine.** Après un refus de l'app, le worker choisit le rayon avec le genre deviné de la copie, alors que c'est justement le genre qui faisait le rayon refusé. Le genre certain de l'article, c'est-à-dire l'étagère Vinted où le vendeur l'a rangé, n'est jamais consulté côté serveur. La correspondance icône + genre, elle, est juste.

### Nouveau module pur : `supabase/functions/_shared/ebay-genre-apres-refus.js`

Le texte complet est prêt dans `(dossier de travail vidé) propose/ebay-genre-apres-refus.js`. Il contient trois fonctions :
- **`genreApresRefus({ genre, titre, description, pf, etagere })`**, qui retient le genre dans cet ordre :
  1. le genre écrit dans le texte (`_shared/genre-du-texte.js`, règle du 30/10) ;
  2. un choix de la personne (`categorie_source: "choix_humain"`, `genre_du_choix`, `genre_aligne_sur_rayon`), qui est gardé ;
  3. le public de l'étagère Vinted (relevé) quand le genre deviné le contredit (adulte contre enfant, femme contre homme, vide ou « Mixte ») ;
  4. sinon, le genre d'avant, au caractère près.
- **`rayonDeLaCorrespondance({ icone, genre, refuses, idRefuse, correspondance })`** : la feuille que `getEbayCategoryId` / `getEbayCategoryPath` (icône + genre retenu) donnent, jamais un rayon refusé.
- **`avecCandidat(restantes, candidat)`** : place cette feuille en tête des candidates, sans doublon.

### `supabase/functions/ebay-api-worker/index.ts`

**1. Imports (vers la ligne 52)** :

```ts
import { genreApresRefus, rayonDeLaCorrespondance, avecCandidat } from "../_shared/ebay-genre-apres-refus.js";
import { brancheVinted, genreDeLEtagereVinted } from "../_shared/vinted-branche.ts";
import { getEbayCategoryId, getEbayCategoryPath } from "../../../src/utils/ebayCategories.js";
const correspondanceEbay = (i: string, g: string) => { const id = getEbayCategoryId(i, g); const chemin = getEbayCategoryPath(i, g); return id && chemin ? { id: String(id), chemin } : null; };
```

**2. `lireInventaire` (vers la ligne 1300)** : lire aussi la colonne, parce que 942 tâches eBay sur 2 794 en 60 jours n'ont qu'elle.

```ts
// avant
.select("titre, attributs")
// après
.select("titre, attributs, vinted_catalog_id")   // rendre { titre, attributs, vintedCatalogId }
```

**3. Appel de `resoudreCategorie` (ligne 665)** : faire voyager l'étagère et la description, comme `__userId`.

```ts
(pf as Record<string, unknown>).__categorieVinted = attributs?.categorie_vinted ?? (inv.vintedCatalogId ? { v: inv.vintedCatalogId, source: "vinted_colonne" } : null);
(pf as Record<string, unknown>).__description = job.description ?? "";
```

Les retirer ensuite, avec `__userId`. Faire de même dans `rejeuRayonRefuse` (vers la ligne 2094), pour que le rejeu à blanc juge comme la production.

**4. Bloc du rayon refusé (lignes 1515-1526).** Avant :

```ts
    if (refuses) {
      const restantes = suggestionsSansRefus(suggestions, refuses, mappee);
      …
        ? await choisirApresRefus(restantes, {
          titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
```

Après :

```ts
    if (refuses) {
      // (18/11, point 5 de Nico — 2f8b09d2) Le genre deviné de la copie est celui du rayon refusé : après le refus, le
      // genre est celui de l'ARTICLE (texte, choix, étagère Vinted du vendeur) ; le rayon de NOTRE correspondance avec ce
      // genre rejoint les candidates, en tête. _shared/ebay-genre-apres-refus.js.
      const pfx = pf as Record<string, unknown>;
      const cv = pfx.__categorieVinted as Record<string, unknown> | null;
      const etagere = genreDeLEtagereVinted(cv)
        ?? (cv?.source === "vinted_colonne" && brancheVinted(cv.v) ? { genre: brancheVinted(cv.v) as string, via: `étagère Vinted ${Number(cv.v)}` } : null);
      const gr = genreApresRefus({ genre: pf.genre as string | null, titre, description: String(pfx.__description ?? ""), pf: pfx, etagere });
      const parCorrespondance = rayonDeLaCorrespondance({ icone: pf.categorie_icone as string | null, genre: gr.genre, refuses, idRefuse: mappee, correspondance: correspondanceEbay });
      const restantes = avecCandidat(suggestionsSansRefus(suggestions, refuses, mappee), parCorrespondance);
      …
        ? await choisirApresRefus(restantes, {
          titre, genre: gr.genre, taille: pf.taille as string | null,
```

Dans le `return` « choisi », ajouter `genreApresRefus: gr.change ? gr : undefined` et le dire dans `detail`.

**5. Écriture du rayon retenu (lignes ~795-802).** Si `categorie.genreApresRefus?.change`, écrire `pf.genre` et `job.platform_fields.genre` avec le genre retenu, ainsi que la trace `genre_apres_refus: { avant, genre, source, via, le }`. Le Département suit déjà le rayon (`_shared/ebay-publication.ts:736-755`, `departementDuRayon`), et les aspects sont relus pour la nouvelle catégorie (`index.ts:880`).

### `supabase/functions/_shared/ebay-rayon-a-notre-charge.js:27`

```js
// avant
export const REGLE_RAYON_VERSION = "2026-11-09";
// après
export const REGLE_RAYON_VERSION = "2026-11-18";
```

Et dans `index.ts:346`, remplacer le texte figé « rejouée avec les règles du 09/11 » par la version.

### Documentation et package

- `docs/regles/plateformes.md`, section « ⛔ eBay — un trou de correspondance de rayon est à NOTRE charge » (ligne 953) : une puce « Après un refus, le genre est celui de l'article (texte › choix › étagère Vinted) ; cas 2f8b09d2 ; verrou `selftest:ebay-genre-apres-refus` ».
- `package.json` : ajouter `"selftest:ebay-genre-apres-refus": "node --import ./scripts/loader-ext.mjs scripts/ebay-genre-apres-refus-selftest.mjs"`. ⚠ `package.json` est déjà modifié par un autre terminal (`git status` : `cloud-relances`). Il faut un `git add` ciblé et ne rien committer qui lui appartienne.

### Ce que le correctif ne change pas

- Toute tâche sans refus de l'app (le bloc n'est pas atteint).
- Une fiche sans étagère Vinted, ou dont le genre est compatible avec elle.
- Le genre écrit dans le texte.
- Le choix de la personne.
- L'IA tranche toujours, et peut toujours répondre « aucune ».

## 4. Le selftest verrou : `selftest:ebay-genre-apres-refus`

Le texte complet est prêt dans `(dossier de travail vidé) propose/ebay-genre-apres-refus-selftest.mjs`, dans le style de `scripts/ebay-rayon-a-notre-charge-selftest.mjs` (règles pures plus présence dans le source du worker). Il rejoue la vraie tâche : champs, les 10 vraies suggestions d'eBay, étagère 2551. Il vérifie :
1. étagère 2551 → Homme, genre « Femme » → « Homme », correspondance → 57988, en tête et sans doublon ;
2. ce qui prime et ce qui ne change pas : titre « femme », `choix_humain`, `genre_du_choix`, Bébé sous « Enfants », sans étagère, source non relevée, jamais le rayon refusé ;
3. le worker branché : import, `genre: gr.genre` à la place de `pf.genre`, `vinted_catalog_id` lu, `__categorieVinted`, version relevée, et `aRejouer` vrai pour de2b3a54.

**Résultats mesurés** :

| Situation | Résultat |
|---|---|
| Rouge avant, dépôt tel quel | **4/34**, exit 1 (module absent, worker non branché) |
| Module proposé seul, worker pas encore patché | parties 1 et 2 vertes (16/16), partie 3 rouge (7) : **16/23** |
| Vert après | attendu une fois les points 1 à 5 appliqués |

À faire ensuite : la suite complète, plus `selftest:ebay-rayon-a-notre-charge` et `selftest:rayon-refuse-ebay`. Le premier vérifie la version de façon générique, sans valeur figée, donc relever la version ne le casse pas.

## 5. Comment les tâches bloquées repartent

**Il existe déjà une reprise automatique.** `rayonsANotreChargeRejouer` (`index.ts:336-352`) tourne à chaque passage du worker. Elle reprend les tâches `needs_user` eBay API dont l'étape est `categorie` ou `condition`, filtrées par `aRejouer`, c'est-à-dire dont la version diffère. Elle retire `ebayCategorieAttente` et la source, passe la tâche en `pending`, et le fait au plus 20 fois par passage, en écriture conditionnée au statut lu.

**Il faut relever `REGLE_RAYON_VERSION`.** C'est indispensable : de2b3a54 porte déjà la version `2026-11-09`.

**Une seule tâche sera rejouée**, de2b3a54 (requête faite : `needs_user` eBay en étape `categorie` ou `condition`). Une seule fois, sans boucle. Si l'IA refusait encore, la tâche resterait « chez nous » avec la nouvelle version.

**Preuve possible avant l'effet.** L'action en lecture seule `rejeu_rayon_refuse` (`index.ts:2074`) peut être lancée sur `["de2b3a54-…"]` une fois la règle déployée. Résultat attendu : `{issue: "rayon", id: "57988", source: "suggestion_apres_refus"}`. Pour la voir avant que la tâche reparte, il faut deux déploiements : la règle d'abord, la version ensuite. Sinon, la reprise part au premier passage après le déploiement.

**Les 4 cas A non liés au genre** (aquarium, désodorisant, deux VHS) ont été annulés par leurs vendeurs. Il n'y a rien à rejouer.

## 6. Déploiement

**Une seule fonction : `ebay-api-worker`.**
- Lu le 18/11 vers 22:00 : **v135, `verify_jwt` false**, mise à jour du 15/11 à 09:45.
- ⚠ `docs/agents/etat-2026-10-01.md` dit « 133 » pour ce déploiement de 09:45 : écart de numérotation à relire avant d'agir.
- Commande : `npx supabase functions deploy ebay-api-worker --no-verify-jwt`. Il est appelé par le cron, avec sa propre garde.
- Relire la version et `verify_jwt` avant et après.

**Pas besoin de redéployer** `resolve-categorie` (v33, false), `get-pending-jobs` (v386, true), `update-job-status` (v206, false) ni `handler-watch` (v210, false). Aucune autre fonction n'importe les modules modifiés.

**Taille du paquet.** Le worker importe en plus `_shared/vinted-branche.ts` (297 Ko, déjà servi par `opla-completion`) et `src/utils/ebayCategories.js` (59 Ko, sans import). La règle elle-même coûte O(1) par refus, mais il faut mesurer le CPU et le démarrage à froid du worker avant et après (consigne « CPU mesuré avant la prod »). Si c'est trop lourd, on peut générer une petite table du seul genre par étagère (la constante `BRANCHE`).

**⚠ Arbre partagé.** Le worker importe `src/utils/shared.js` (`index.ts:71`). Ce fichier est en ce moment modifié par un autre terminal (`git status` du 18/11 vers 22:00 : 21 lignes ajoutées, 7 retirées, non committées, avec `get-pending-jobs/index.ts`, `lot-manuel-creneau.js`…). Déployer ebay-api-worker depuis cet arbre embarquerait ce travail en cours. Il faut déployer seulement quand `src/utils/shared.js` est propre (commité par son auteur), ou attendre.

**Rien d'autre** : aucune migration, aucune OTA, aucune extension, aucun mail, rien chez Stripe.

## 7. À trancher par Nico (hors correctif)

- **Faire primer l'étagère Vinted de la fiche en amont**, dans l'app, comme `copiesAuPublicChoisi` le fait pour un choix à l'écran.
  - Concerné : 66 copies eBay en 60 jours sur 18 comptes, dont 56 publiées dans le rayon de l'autre genre.
  - Mais l'étagère n'est pas toujours juste : chemise Lacoste T39, blazer New Look FR42, pull Formen. La décision du 06/11 (point 4a) se limitait au choix fait à l'écran.
- **Les 4 cas A sans rapport avec le genre** (aquarium, désodorisant, VHS) : piste non prouvée.
  - Les suggestions d'eBay sur le titre complet n'apportent rien d'utile (aquarium → sacs, bijoux, écharpes).
  - Notre arbre relevé n'a aucune feuille aquarium (0 sur 3 913) et une seule feuille « désodorisant », qui est fausse (Animalerie › Chiens).
  - Une seconde demande de suggestions à eBay sur le mot de l'objet (« aquarium ») serait la suite logique. Non vérifié : il n'y a aucun jeton d'application disponible sans en créer un.
- **Détail de coût** : chaque nouvelle tâche « chez nous » est rejouée une fois deux minutes après sa pause, parce que `rayon_rejoue` est encore absent. Cela fait un appel IA et un appel eBay de plus. Sans gravité.

## 8. Implémentation (18/11 vers 22:15, sur l'ordre du coordinateur)

Rien n'a été commité, déployé ni écrit en base.

**Fichiers touchés** :
- **Nouveau** : `supabase/functions/_shared/ebay-genre-apres-refus.js` (`genreContredit`, `etagereDeLaFiche`, `genreApresRefus`, `rayonDeLaCorrespondance`, `avecCandidat`).
- **Nouveau** : `scripts/ebay-genre-apres-refus-selftest.mjs`.
- **Modifié** : `supabase/functions/ebay-api-worker/index.ts`, en éditions ciblées seulement : imports après la ligne 52, trace du rejeu avec la version, `__etagere` et `__description` autour de `resoudreCategorie`, genre écrit avec le rayon retenu, type `Categorie`, `lireInventaire` qui lit `vinted_catalog_id`, bloc du rayon refusé, `rejeuRayonRefuse`.
- **Modifié** : `supabase/functions/_shared/ebay-rayon-a-notre-charge.js`, avec `REGLE_RAYON_VERSION` = `"2026-11-18"`.

**Verrou** :
- Rouge avant, sur les copies HEAD des fichiers (`git show`) : 4/32.
- Vert après : 32/32.

**Selftests** :
- Les 54 `selftest:*ebay*` sont verts, dont `ebay-rayon-a-notre-charge` (42/42) et `rayon-refuse-ebay`.
- Les 9 autres selftests qui lisent les fichiers touchés sont verts aussi.

**Contrôles** :
- `deno check` : une seule erreur, déjà présente à HEAD (ligne 164 de HEAD, `plateformesEnRepriseTechnique`), sans lien avec ce lot.
- `eslint` sur les deux nouveaux fichiers : propre.

**Poids** : le paquet grossit de 339 Ko (`vinted-branche.ts` 275 Ko, `ebayCategories.js` 55 Ko). Import mesuré sous Deno : environ 7 ms. Il n'existait pas de source plus légère : le chemin Vinted n'est stocké que sur 524 des 3 072 fiches eBay qui ont un identifiant d'étagère (17 %), et pas sur celle du cas.
