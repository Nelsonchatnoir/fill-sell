# Point 5 (16/11 après-midi) — Marc (thecloset72000) : retraits Beebs après la suppression groupée

Diagnostic en lecture seule, lu le 16/11/2026 entre 13:55 et 14:15 (heure de Paris). Rien d'écrit en base ni dans le
dépôt, aucun déploiement, aucune action sur une plateforme. Requêtes : fichiers de travail du 16/11, effacés en fin de bloc (leur texte est repris ci-dessous).
Journaux : Supabase `function_logs` / `function_edge_logs`. Les heures en `…Z` des champs sont en UTC (+1 h pour Paris).

Compte : `8ac5bbda-0947-4612-82fd-effdaa3ca84a`, extension **0.6.186** (BUILD_ID `2026-11-10T14:10:14Z+ba13a51`),
un seul poste (Chrome, battement 13:54).

---

## 0. En une phrase

Les retraits Beebs **ont bien été créés et tentés** dès 11:46. Ce n'est pas un blocage : c'est **la forme de la file**.
Un passage sert 100 tâches d'un coup, l'extension les fait toutes avant de redemander la file, et un retrait Beebs se
fait en **deux passages** (envoi, puis vérification au passage SUIVANT). Résultat : les 25 suppressions Beebs envoyées
entre 11:46 et 13:24 sont restées « en attente » jusqu'au passage suivant, à 13:29. À 13:30, elles ont toutes été
vérifiées « retirées ». Chaque premier passage Beebs bloque aussi l'extension 2 min 35 s pour rien, ce qui ralentit
Leboncoin et Depop.

---

## 1. Les tâches de retrait créées depuis 11:42

### 1.1 Les lots de suppression (journal `usage_logs`)

q19 (extrait) :

| lot | articles | annonces | de → à |
|---|---|---|---|
| f9d2d149 | 138 | 349 | 11:42:29 → 11:45:30 |
| fa5b7cf3 | 328 | 528 | 11:47:30 → 11:50:37 |
| 41bdd187 | 276 | 120 | 12:04:46 → 12:06:03 |
| 2ff69329 | 11 | 0 | 12:07:28 → 12:07:30 |
| b1e1887c | 1 | 0 | 13:02:13 |
| filet serveur (`suppression_article_filet_serveur`) | — | 106 | 12:04:46 → 13:02:13 |

**754 articles en 5 gestes.** Le lot est écrit à la racine de `metadata` (`metadata->>'lot'`), pas dans `extra`.

### 1.2 Les tâches par plateforme et par statut (lecture de 13:57)

q11 :
```
beebs     extension deleted     26
beebs     extension pending    111
beebs     extension processing   1
depop     extension deleted     24
depop     extension pending     44
ebay      api       deleted    274
ebay      extension cancelled  208   ← « Doublon : un retrait est déjà en cours pour cette annonce »
leboncoin extension deleted     30
leboncoin extension pending    104
vinted    extension deleted    255
vinted    extension pending     29   ← retenus par la garde de boutique (cf. § 2.5)
```
Les chiffres de Nico (Beebs 0/138, Vinted 136/284, Leboncoin 22/134, Depop 12/68) étaient justes au moment où il a
regardé (avant 13:30) ; ils ont avancé depuis. Toutes ces tâches ont `inventaire_id` NULL : la fiche est supprimée,
le lien tombe (ON DELETE SET NULL), c'est voulu (`App.jsx:6242-6245`).

### 1.3 Beebs : elles existent, et elles ont été tentées

Le chemin de suppression les a bien créées : `executerSuppression` arme un retrait pour **chaque** plateforme du plan,
Beebs compris (`src/App.jsx:6277-6286`), à partir de `buildDeletePlan` (`src/App.jsx:6056-6129`). Rien de spécial pour
Beebs (seule Opla est écartée, `App.jsx:6276`). 138 retraits Beebs créés entre 11:42:38 et 12:05:42, tous avec leur
lien (`n_sans_url = 0`).

Envois réels (q7, `platform_fields.beebs_suppression_envoyee.le`, converti en heure de Paris) :
11:46:34, 11:50:48, 11:54:56, 11:58:35, 12:02:46, 12:06:26, 12:10:08, 12:13:33, 12:20:22, 12:23:51, 12:27:11, 12:31:16,
12:34:26, 12:39:03, 12:42:18, 12:46:04, 12:50:20, 12:53:31, 12:56:46, 13:01:10, 13:05:16, 13:08:40, 13:11:46,
13:15:51, 13:20:45, 13:24:34 (puis 13:51:32 et 13:54:59).

Chaque envoi s'est terminé pareil (journal `erreurs_archivees`) :
> « Suppression envoyée à Beebs, mais l'annonce est encore dans « Mes annonces » deux minutes après — vérification au
> prochain passage, rien d'autre n'est fait. Nouvel essai automatique (tentative 1/5), rien à faire. »

La tâche repasse en `pending`, avec un nouvel essai 5 min plus tard (`REPRISE_ESPACEE_DELAIS_MIN = [5, 15, 30, 60]`,
`chrome-extension/background.js:361`). Ce message était dans la colonne `error` : « aucun retrait tenté, aucune
erreur » est donc inexact. Le bon constat : **0 « retirée » avant 13:30**.

Vérifications (q7, `preuve_retrait.lu_le`) : de **13:30:13 à 13:50:11**, toutes concluent « absente » : bouton
« Supprimer » absent de la page, page de l'annonce HTTP 404, absente de l'index, liste « en ligne » 60/109 relue.

### 1.4 L'état exact des retraits Beebs de Marc (13:57)

- **26 retirées** : 25 envoyées puis vérifiées (13:30 → 13:50), plus 1 « déjà absente » (13:28:31).
- **3 envoyées, en attente de vérification** :
  - `a9d30708` : envoyée à 13:24:34, échéance 13:31:50 ; elle a manqué le passage de 13:29:47 de 2 minutes et attend
    donc le cycle suivant.
  - `e5109728` : envoyée à 13:51:32, échéance 13:58:49.
  - `7d0ec18e` : envoyée à 13:54:59, échéance 14:02:15.
- **1 en cours** (processing).
- **2 « Beebs l'examine encore »** (règle de modération, normale) :
  - `476ac549` : prochain essai à 16:36.
  - `34c6bba8` : antérieure au lot (créée le 15/11 à 00:47), prochain essai à 16:56.
- **≈107 jamais commencées** (`platform_fields = {}`), dont 19 déjà réservées par le cycle en cours.
- **Aucun échec, aucune question, aucun refus Beebs sur les retraits.** La seule trace « 403 » vient de la lecture de
  la page des VENTES Beebs (05:14 et 13:29, `ventes_beebs_lecture_echec`). Elle est sans lien : la vérification qui a
  suivi à 13:30 est passée.

---

## 2. Qui les sert, et ce qui les retient

### 2.1 Aucune règle de retenue Beebs n'a joué

- get-pending-jobs sert la file par `created_at` croissant (`supabase/functions/get-pending-jobs/index.ts:2825-2832`).
- L'extension met les retraits en tête, dans l'ordre stable (`chrome-extension/background.js:4826-4850`).
- Aucune règle n'a retenu Beebs :
  - pas de pause de plateforme ;
  - pas de session Beebs morte ;
  - pas de garde « une seule annonce hors ligne » (elle ne vise que les republications à l'étape « captured ») ;
  - pas de DataDome sur les retraits.
- Le journal de 13:29:47 ne cite que « 3 job(s) en attente programmée non servi(s) » : `a9d30708` et les deux en
  modération.

### 2.2 La vraie cause : un cycle de 100 tâches, et la vérification Beebs qui attend le cycle suivant

Les journaux get-pending-jobs du compte entre 11:40 et 14:05 ne montrent que **deux** passages qui distribuent :
```
11:44:09  → 134 job(s) distribué(s), 63 opération(s) Vinted retenue(s) par la garde de boutique
13:29:47  → 310 job(s) distribué(s), 49 opération(s) Vinted retenue(s) par la garde de boutique
```

1. **Le chiffre du journal est compté avant la réservation.** Celle-ci ne prend que les 100 premières tâches :
   `const servis = out.slice(0, 100);` puis `out = out.filter(j => idsPris.has(...))`
   (`get-pending-jobs/index.ts:16205-16215`). Vérifié : **exactement 100 tâches** touchées entre 11:44:09 et 13:29:40
   (`count(distinct job)` sur `update-job-status`). La réservation en cours confirme le cycle de 13:29 : 51 tâches
   encore réservées à 13:58 (19 Beebs, 14 Depop, 18 Leboncoin).
2. **Un cycle va jusqu'au bout avant tout nouveau passage.** La boucle de l'extension enchaîne les tâches servies une
   par une (`background.js:4876-4970`), sous le verrou. Le poll de 2 min (`config.js:14`) ne repart qu'à la fin. Le
   seul coupe-cycle, « un retrait né pendant le cycle », ne joue que si la tâche suivante n'est PAS un retrait
   (`background.js:4878`) : jamais ici. **Cycle 1 : 11:44:09 → 13:28:31, soit 104 min pour 100 tâches.**
3. **Un retrait Beebs se fait en deux passages.** Premier passage = envoi, puis 5 relectures de « Mes annonces » sur
   ~130 s (`chrome-extension/content-scripts/beebs.js:1122-1141`, boucle `[0, 10_000, 20_000, 40_000, 60_000]` ligne
   1125). Le 16/11, l'annonce y est toujours visible au bout de 2 min (**26 sur 26**). La tâche repart donc en
   `pending` avec un essai 5 min plus tard. Ce second passage ne peut venir que d'un NOUVEAU poll, donc après la fin
   du cycle : **1 h 44 plus tard** pour celles du premier cycle.
4. **Le premier passage Beebs coûte cher.** Durées mesurées (journaux `update-job-status`, cycle 1) :

   | tâche | durée |
   |---|---|
   | retrait Beebs, premier passage | 154 à 157 s |
   | vérification Beebs (second passage) | 24 à 35 s |
   | retrait Leboncoin, Depop ou Vinted | 9 à 16 s |
   | pause entre deux tâches (`config.js:22-23`) | 8 à 20 s |

   Les 27 Beebs du cycle 1 ont pris environ 70 des 104 minutes. Leboncoin et Depop, servis article par article entre
   deux Beebs, avancent au même pas lent : c'est la cause de « Leboncoin 22/134 ».
5. **Les tâches créées après 11:44:09** (le lot 2 à 11:47, le lot 3 à 12:04) n'étaient pas dans le cycle 1. Elles ont
   attendu 13:29, y compris les retraits Leboncoin ou Depop qui prennent 15 s.

Sur tout le parc (30 jours, q12-q13), la règle se confirme :

| | nombre | comptes |
|---|---|---|
| retraits Beebs prouvés au premier passage | 131 | 34 |
| retraits Beebs prouvés au passage suivant | 288 | 13 |

Délai d'un retrait prouvé au passage suivant : médiane 10 à 19 min selon la semaine, mais jusqu'à **10 h 36**
(semaine du 09/11) et **26 h 09** (semaine du 02/11) quand la file est longue. Le 16/11 : 1 au premier passage, 28 au
suivant.

### 2.3 Projection sans correctif

Hypothèse : l'ordinateur reste allumé et rien d'autre n'entre dans la file.

| étape | fin estimée | contenu |
|---|---|---|
| fin du cycle 2 | ≈ 15:05 | 19 Beebs × 2,6 min + ≈ 32 autres × 0,45 min |
| cycles 3, 4, 5 | ≈ 17:10, 19:05, 20:50 | 100 tâches chacun ; chacun commence par vérifier les Beebs envoyées au cycle d'avant |
| dernières vérifications Beebs | **≈ 21:00-21:30** | |
| fin de Leboncoin et Depop | **≈ 20:50** | |

**Aucune donnée à réparer** : rien n'est bloqué, tout est en `pending`, et la file repartira seule.

### 2.4 eBay : rien à faire

Les 274 annonces sont retirées par l'API. Les 208 tâches « Doublon » annulées (12:04-12:05) viennent du lot 3 : 104
armées par l'app et 104 par le filet serveur, sur des annonces eBay dont le retrait était déjà en cours depuis un
autre article des lots 1-2. Ces annonces eBay étaient donc rattachées à **deux fiches**. C'est sans effet ici, mais
c'est à garder en tête pour l'affichage : ne jamais compter ces doublons.

### 2.5 Vinted : 29 retraits attendent Marc

Les 29 retraits Vinted restants sont retenus par la garde de boutique (`retenue_serveur.motif =
boutique_origine_inconnue` ; journal « 49 opération(s) Vinted retenue(s) … boutique d'origine non prouvée »). Leur
colonne `error` est vide, mais l'app les classe en « retraits bloqués : boutique » (`src/utils/retraitsBloques.js:123`).
**À vérifier : que Marc les voit bien, alors que les fiches sont supprimées.** C'est la règle du 22/09 (ne jamais
retirer l'annonce d'autrui) : à ne pas lever sans décision.

---

## 3. La correction à la racine (vaut pour tous les comptes)

### F1 — Serveur seul, effet immédiat sur tout le parc : une tranche de retraits bornée en durée

- **Où :** `supabase/functions/get-pending-jobs/index.ts:16205`, aujourd'hui
  `const servis = out.slice(0, 100);`, devient `const servis = trancheDuCycle(out);`. Le module est nouveau et pur :
  `supabase/functions/_shared/tranche-cycle.js` (ES module sans import, Deno et Node), qui réutilise `ordreExtension`
  (`_shared/tete-de-file.js`).
- **Règle :**
  - Quand la file servie contient des retraits dont la durée estimée dépasse un budget (proposition : 15 min), le cycle
    ne porte QUE les premiers retraits qui tiennent dans le budget, au moins un. Les retraits restants passent au
    poll suivant (2 min au plus après la fin du cycle), toujours devant les publications.
  - Estimations, mesurées le 16/11 :

    | tâche | coût estimé |
    |---|---|
    | retrait Beebs sans `beebs_suppression_envoyee` (premier passage) | ≈ 170 s |
    | retrait Beebs déjà envoyé (vérification) | ≈ 40 s |
    | autre retrait | ≈ 25 s, pause comprise |

  - Sans retrait, ou si le total tient dans le budget : `out.slice(0, 100)` à l'identique. Les publications et
    republications ne changent pas (cadence intouchable).
  - L'ordre suit déjà `created_at` : les vérifications Beebs dues, les plus anciennes, passent naturellement en tête de
    la tranche suivante.
  - La ligne du journal dit combien de retraits restent pour la tranche suivante.
- **Effet attendu :** une suppression Beebs est vérifiée 5 à 20 min après son envoi (et non plus 1 h 45 à 6 h). Le
  compteur « retirées » suit en direct, et un lot créé pendant un cycle n'attend plus 1 h 45. Le débit total reste le
  même, à environ 2 min de poll près par tranche.
- **Coût à mesurer avant la prod** (règle CPU) : un passage d'exécution sur la file chargée de Marc dure 11,4 à
  12,5 s (`function_edge_logs`, 11:44:09 et 13:29:47). Pendant un gros lot, ces passages lourds viennent toutes les
  ~17 min au lieu de toutes les ~105 min, soit ~22 passages au lieu de ~4 sur 6 h. Cela reste sous le rythme d'un
  poste au repos (un poll toutes les 2 min).
- **Déploiement :** get-pending-jobs. Version et `verify_jwt` lus avant et après (v381, `verify_jwt` true à 14:00).
  Aucune migration. Aucune extension à téléverser.

### F2 — Extension 0.6.192, à décider : le premier passage Beebs n'attend plus 2 min dans l'onglet

- `chrome-extension/content-scripts/beebs.js:1122-1141` (`confirmerRetraitParMesAnnonces`).
- Une seule relecture juste après l'envoi : elle garde le cas « SoldOut / déjà absente », 31 % des retraits du parc.
  Sinon, retour immédiat « envoyée, vérification au prochain passage », sans attendre 130 s.
- Gain : ≈ 2 min par retrait Beebs, soit ≈ 3 h 30 sur les ≈ 108 restants de Marc. Moins de pages Beebs chargées
  aussi, ce qui est plus sûr face à l'anti-robot.
- Ce changement ne vaut qu'avec F1 : sans lui, la vérification reste repoussée au cycle suivant.
- Il demande une version d'extension, un passage au Chrome Web Store, puis la mise à jour du poste de Marc (il est en
  0.6.186).
- Variante plus douce : ne raccourcir l'attente que quand d'autres retraits attendent derrière.

### Faire partir ses retraits Beebs

- **Avec F1 déployé :** rien à écrire. Ses ≈ 110 retraits Beebs sont `pending`. Les tranches suivantes les servent
  d'elles-mêmes, vérifications dues d'abord. Le cycle en cours (100 tâches servies à 13:29:47, version d'avant) ira à
  son terme vers 15:05. Les tranches bornées prennent le relais au poll suivant.
- **Aucun script de réparation n'est utile** : une « relance » ne ferait rien de plus, les tâches sont déjà en file.
- Script esquissé, seulement si Nico veut voir l'avancement de CE lot dans le nouvel affichage (§ 4) :
  `scripts/reparations/20261116_marc_retraits_marque_lot.sql`
  - sauvegarde `_backup_1611_marc_retraits_lot (id, platform_fields)` ;
  - `platform_fields = platform_fields || jsonb_build_object('lot_suppression', <lot>)`, appliqué :
    - aux tâches `user_id = 8ac5bbda…`, `action = 'delete'`, `status in ('pending','deleted')`, sans la clé ;
    - avec le lot pris par fenêtre de `created_at`, qui ne se chevauchent pas : 11:42:29-11:45:31 → f9d2d149,
      11:47:30-11:50:38 → fa5b7cf3, 12:04:46-12:06:04 → 41bdd187 ;
    - doublons eBay annulés exclus ;
    - écriture comparée sur le statut (jamais une tâche `processing`).
  - Inverse : `platform_fields - 'lot_suppression'` (jamais une restauration entière, qui effacerait la progression).

---

## 4. L'affichage « après une suppression groupée : retirées / en cours, par plateforme »

### 4.1 Relier les retraits au lot

- **Aujourd'hui, c'est impossible proprement :**
  - le lot n'est que dans `usage_logs` (`metadata.lot`, par article) ;
  - les tâches de retrait perdent `inventaire_id` à la suppression ;
  - leur `platform_fields` vaut `{}` (`src/App.jsx:6281`) ;
  - relier par l'heure seule est fragile : un retrait de vente peut tomber dans la fenêtre.
- **Proposition :**
  - au point d'insertion `src/App.jsx:6278-6282`, poser `platform_fields: lot ? { lot_suppression: lot } : {}`. Le
    `lot` arrive déjà en paramètre (`App.jsx:6239`, `6189`). La suppression d'un seul article reste inchangée ;
  - le filet serveur (trigger `inventaire_arme_retraits_avant_suppression`) n'a pas le lot. Ses retraits sont presque
    toujours des doublons annulés, donc sans effet.
- Les clés inconnues de `platform_fields` sont gardées partout où elles sont réécrites (`{...pf}` ; `pfAPersister`,
  `get-pending-jobs/index.ts:466`, n'enlève que la copie servie).

### 4.2 Les données à lire

- **Calcul côté serveur**, au même endroit que l'avancement des republications : get-pending-jobs, appel
  `plafond_only`, `index.ts:1085-1142`. Une clé de plus dans la réponse : `avancement_retraits`.
- **Lecture bornée :**
  - `cross_post_jobs` du compte (RLS) avec `action = 'delete'`, `created_at` des 72 dernières heures,
    `platform_fields->lot_suppression` non nul ;
  - colonnes : `platform`, `status`, `error`, `created_at`, la clé de lot, `beebs_suppression_envoyee`,
    `beebs_en_moderation`, `retenue_serveur`, `next_action_after`, `retrait_doublon_de` ;
  - lecture par pages de 1 000, 5 au plus (le lot de Marc tient en moins de 1 000 lignes).
- **Règle pure** dans un nouveau module `supabase/functions/_shared/avancement-retraits.js`. Par lot (deux lots à
  moins de 30 min d'écart = une même « suppression du 16/11 à 11:42 ») et par plateforme :

  | catégorie | ce qu'elle compte |
  |---|---|
  | retirées | `deleted` |
  | en vérification | `pending` + suppression envoyée |
  | chez Beebs (modération) | `beebs_en_moderation` |
  | en file | `pending` sans marque, ou `processing` |
  | à toi | `needs_user`, `failed`, retenue boutique |
  | jamais comptées | `cancelled` + `retrait_doublon_de` |

  En option, la fin estimée au rythme constaté (comme `avancement-republication.js`).
- **Tolérance :** une lecture ratée donne `null`, et l'app n'affiche rien de plus.

### 4.3 Où l'afficher

1. **« Ta file »**, `src/components/FileDesJobs.jsx` : un bloc `AvancementRetraits`, frère de
   `AvancementRepublication` (même forme : logo, ligne de texte, barre ; lignes 55-90, rendu ligne 447). Il est
   nourri par `useRetenuesRepublication` (lignes 161-176), qui appelle déjà `plafond_only` toutes les 60 s. Il suffit
   d'y lire `data.avancement_retraits`.
2. **La fin de la suppression**, `src/stock/SuppressionLot.jsx:104-111` et la phrase de `phraseBilanSuppressionLot`
   (`src/stock/reglesSuppressionLot.js:62-80`) : « 723 retraits en file (une annonce à la fois) — suis-les dans « Ta
   file » » et un bouton « Suivre les retraits » qui ouvre la file (`setFileOuverte`, `StockTab.jsx:13274`).
3. **Le Stock** : tant qu'un lot a des retraits ouverts, une ligne courte dans le bandeau de la file. Pas de prop
   neuve au Stock (règle du Stock) : la donnée vient de la même lecture.

Exemple de texte, sur l'état de Marc à 13:57 :
```
Retraits de ta suppression du 16/11 à 11:42 · 754 articles
eBay       274 retirées · terminé
Vinted     255 retirées · 29 attendent ta boutique Vinted
Leboncoin   30 retirées · 104 en file
Depop       24 retirées · 44 en file
Beebs       26 retirées · 3 envoyées, vérification en cours · 2 en vérification chez Beebs · 107 en file
Une annonce à la fois, ton ordinateur allumé. Fin estimée : vers 21 h.
```

---

## 5. Le selftest « verrou » proposé

Nom : `scripts/retraits-lot-cycle-borne-selftest.mjs`, lancé par `npm run selftest:retraits-lot-cycle-borne`.

1. **Modules présents** : `_shared/tranche-cycle.js` et `_shared/avancement-retraits.js`. ROUGE aujourd'hui : absents.
2. **Règle pure de la tranche :**
   - file sans retrait, ou retraits sous le budget : résultat identique à `out.slice(0, 100)` (publications et
     republications intactes) ;
   - lot de Marc reconstitué (138 Beebs, 134 Leboncoin, 68 Depop, article par article) : la tranche ne porte que des
     retraits, au moins un, dans l'ordre de `created_at`, sous le budget plus un premier passage Beebs ;
   - un Beebs déjà envoyé compte comme une vérification (≈ 40 s) ;
   - les vérifications dues sont devant les nouveaux envois.
3. **Simulation du cycle**, avec les durées mesurées le 16/11 : poll 2 min, cycle jusqu'au bout, Beebs 155 s puis
   reprise à +5 min, vérification 35 s, autres 13 s, pause 14 s. Avec la règle actuelle (100 tâches), le délai entre
   envoi et « retirée » d'un retrait Beebs dépasse 90 min : la simulation retrouve les 104 min mesurées. Avec la
   tranche :

   | contrôle | seuil |
   |---|---|
   | délai maximal envoi → « retirée » | ≤ 30 min |
   | délai médian | ≤ 15 min |
   | première Beebs « retirée » après le début du lot | ≤ 20 min |
   | durée totale | ≤ 1,15 × la durée d'aujourd'hui |

4. **Câblage**, contrôlé dans le texte des fichiers :
   - `get-pending-jobs/index.ts` réserve `trancheDuCycle(out)`, et non plus `out.slice(0, 100)` ;
   - `App.jsx`, `executerSuppression`, pose `lot_suppression` quand `lot` est donné ;
   - `FileDesJobs.jsx` lit `avancement_retraits`.

   ROUGE aujourd'hui.
5. **Avancement**, sur un échantillon ayant la forme de l'état de Marc à 13:57 :

   | plateforme | attendu |
   |---|---|
   | Beebs | 26 retirées, 3 en vérification, 2 chez Beebs, 107 en file, 1 en cours |
   | Vinted | 255 retirées, 29 à toi |
   | eBay | 274 retirées, les 208 doublons jamais comptés |
   | Leboncoin | 30/134 |
   | Depop | 24/68 |

   Deux lots à moins de 30 min d'écart sont fusionnés, et la phrase est attendue telle quelle.

Puis, avant le commit : `selftest:tete-de-file`, `selftest:suppression-lot`, `selftest:file-des-jobs`,
`selftest:retrait-beebs-verification` et la suite complète.

---

## 6. Ce qui demande une décision de Nico

1. **F1** (serveur) : le principe d'une tranche bornée en durée quand des retraits sont en file, et la valeur du budget
   (15 min proposées). Le CPU sera mesuré avant la prod.
2. **F2** (extension 0.6.192) : supprimer ou raccourcir l'attente de 2 min dans l'onglet Beebs après l'envoi. Il faut
   un CWS et la mise à jour du poste de Marc.
3. **Affichage** : la marque `lot_suppression` sur les retraits, `avancement_retraits` dans « Ta file », la phrase de
   fin de suppression et la ligne dans le Stock. Marquer ou non le lot déjà fait de Marc (script esquissé § 3).
4. **Marc** : rien à réparer, ses retraits partent seuls. Lui dire ou non où ils en sont : aucun mail sans ordre.
5. **Constats annexes :**
   - 29 retraits Vinted retenus par la garde de boutique (origine non prouvée) : vérifier qu'il les voit et peut
     répondre ;
   - 104 annonces eBay rattachées à deux fiches chacune (doublons de retrait annulés), à regarder si Nico le souhaite.
