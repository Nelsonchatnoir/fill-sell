# P4 — Republications Leboncoin « pending » jamais parties (diagnostic, lecture seule)

Relevé du 16/11/2026, 07:30 → 07:50 heure de Paris. Prod : get-pending-jobs v378, handler-watch v208 (lus par
`functions list`, déployés le 15/11 20:50). Aucune écriture : ni fichier suivi, ni base, ni déploiement. Fichiers de
travail (SQL, sorties, scripts de rejeu) : `C:\Users\nicol\fill-and-sell\.tmp-terminal\p4\`.

## En bref

- **Deux des trois tâches ont la même cause** : « Duck Tales » (yoann.besak) et « caisse à vin » (ornellaracano). Une
  règle de get-pending-jobs les écarte à chaque passage, toutes les 2 min, sans rien écrire sur la tâche : elle attend
  que les photos de la fiche soient « rapatriées » chez FillSell. Or ces photos sont sur le CDN de Vinted, et le
  rapatriement de handler-watch exclut Vinted par construction (décision de Nico du 06/09). Personne ne rapatrie donc
  ces photos : l'attente ne se lève jamais, rien ne la plafonne et rien ne la dit.
- **La troisième a une autre cause** : « table toscane » (joshua.sapone). Elle EST prise par la file, toutes les ~33 min
  depuis le 11/11. Son pré-vol Leboncoin échoue à chaque fois sur « Catégorie : ni suggestion ni sélecteur manuel
  trouvés » (rubrique Immobilier > Bureaux & Commerces, extension 0.6.186). L'extension la reporte de 30 min, sans
  plafond et sans message (`error` reste NULL). L'annonce reste en ligne, rien n'est retiré.
- **Cadence (créneaux, plafonds, paliers, quotas) : hors de cause** pour les trois. Pause et retenue « hors ligne » sont
  levées.
- **Autres comptes touchés par la cause commune : aucun.** Je l'ai rejouée sur les 183 tâches `pending` de plus de 48 h
  de tous les comptes (toutes plateformes, publications et republications) : seules ces deux tâches en relèvent.

## 1. Les trois tâches

Les trois extensions interrogent bien la file : `profiles.extension_last_seen_at` le 16/11 entre 07:37 et 07:43, build
`2026-11-10T14:10:14Z+ba13a51` (0.6.186) sur un poste réel chacune. Les trois comptes reçoivent aussi d'autres tâches
Leboncoin :

| Compte | Republications LBC publiées (25 j) | Dernière |
|---|---|---|
| yoann.besak | 10 | 08/11 13:22 |
| ornellaracano | 8 | 14/11 15:08 |
| joshua.sapone | 42 | 16/11 02:32 |

### 1a. yoann.besak — job `28bce155-277c-447a-a2a7-03387bf57bd5` « Duck Tales Game Boy »

**État de la tâche**
- Statut : republish leboncoin `pending`, voie extension, créée le 31/10 17:10 (15,6 jours). Étape `republish_step = captured`, annonce 2907654748.
- Message affiché : « En file : ta republication passera à son tour… ». Il est périmé : la retenue hors ligne l'a posé, puis l'a levé le 01/11 11:23 (`retenue_levee_le`). Depuis, plus aucune trace sur la tâche.
- Copie : 2 photos, chez nous (`…/rehosted/1793442894335010/…_watch_0/1.jpg`), `photo_option = original`.

**État de la fiche** (1793442894335010)
- Origine `vinted_sync`, 3 photos, toutes sur `images1.vinted.net`.
- `photos_lues_le` = 14/11 21:55 : la capture Beebs, plus récente que `contenu_le` (31/10 11:40).
- `inventaire.photos_a_rapatrier` oscille : `true` à un relevé, `false` à 07:45:37.

### 1b. ornellaracano — job `f2bd4ee7-78ed-4035-a544-1bc43f32728f` « Caisse à vin en bois Château Lagrange… »

**État de la tâche**
- Statut : republish leboncoin `pending`, créée le 07/11 08:41 (9,0 jours). Étape `republish_step = a_capturer` : jamais servie, même pas capturée.
- `error` NULL, aucun `erreurs_archivees`, aucun `next_action_after`. Le seul `journal_etapes` est la création.
- Copie : 2 photos chez nous (`rapatrie-fiche/1790174128565/…`).

**État de la fiche** (1788463964366007)
- Origine `vinted_sync`, 3 photos, toutes `images1.vinted.net`.
- `photos_lues_le` = 15/11 09:41 (capture LBC), plus récente que `contenu_le` (23/09).
- `photos_a_rapatrier` = `false` à 07:45:37 (balayage de handler-watch).

**Règle exacte qui écarte 1a et 1b**, à chaque passage :
1. `supabase/functions/get-pending-jobs/index.ts:3221-3224` : les candidats de « le contenu du vendeur part tel quel » sont toute publication ou republication hors republication Vinted, sauf si le retrait est engagé. 1a et 1b y entrent.
2. `index.ts:3273-3281` appelle `contenuAImposer`, qui renvoie `photos_a_rapatrier`. La tâche entre alors dans `retenus` et `aRapatrier`, puis `continue`, **sans aucune écriture sur la tâche**.
3. `supabase/functions/_shared/contenu-fiche.js:326-331` : la copie est `original`, la fiche a plus de photos qu'elle (3 > 2) et ces photos ont été lues après la copie. Si toutes ne sont pas `photoChezNous` (`/storage/v1/object/public/`), on pose `out.photos_a_rapatrier = true`.
4. `index.ts:3340-3343` retire la tâche de `out` et journalise « N publication(s) en attente de la lecture de l'annonce d'origine (ou du rapatriement de ses photos) ». Puis `index.ts:3345-3346` pose `inventaire.photos_a_rapatrier = true`.

**Preuves**
- **Journaux de la fonction** (`function_logs`, 15/11 08:00 → 16/11 08:00) : à CHAQUE poll, toutes les 2 min, `userId=d4047663… : 1 publication(s) en attente de la lecture de l'annonce d'origine (ou du rapatriement de ses photos)`. Même ligne pour `f8aa02a5…`. Ces deux comptes n'ont qu'une tâche `pending` chacun : c'est donc bien elle.
- **Pas l'autre branche** (`lectureOrigineEnAttente`) : celle-ci écrirait `attente_lecture_origine` et un message (`index.ts:3253-3263`), et aucune des deux tâches ne porte ce marqueur.
- **Rejeu** sur les données réelles (`rejeu.mjs`, qui importe le vrai `_shared/contenu-fiche.js`) :

```
job 28bce155 (leboncoin republish) fiche vinted_sync
  photos fiche=3 (chez nous: 0) / copie=2 ; contenu_le=2026-10-31 10:40 UTC ; photos_lues_le=2026-11-14 20:55 UTC
  contenuAImposer → photos_a_rapatrier=true
  handler-watch : photos externes=3, rapatriables (hors Vinted)=0
job f2bd4ee7 (leboncoin republish) fiche vinted_sync
  photos fiche=3 (chez nous: 0) / copie=2 ; contenu_le=2026-09-23 14:35 UTC ; photos_lues_le=2026-11-15 08:41 UTC
  contenuAImposer → photos_a_rapatrier=true
  handler-watch : photos externes=3, rapatriables (hors Vinted)=0
job 0a1cac7c (leboncoin republish) fiche releve_leboncoin
  photos fiche=3 (chez nous: 3) / copie=3 → photos_a_rapatrier=false (pas concernée)
```

### 1c. joshua.sapone — job `0a1cac7c-f4c2-4c46-9b9f-8e63af30d08f` « table toscane – pizzeria à Riez – 90 000 »

**État de la tâche**
- Statut : republish `pending`, créée le 10/11 20:44 (5,5 jours), `republish_step = captured` le 11/11 09:39.
- Rubrique `lbcCategoryPath = ["Immobilier","Bureaux & Commerces"]`.
- `error` NULL, `next_action_after` = 16/11 08:04.
- `republish_prevol_formulaire` = `{verdict: "illisible", detail: "Catégorie: ni suggestion ni sélecteur manuel trouvés."}` à 07:34. `gardes.prevol_formulaire_recreation` : verdict `illisible`, 108 s.

**Elle EST servie**
- Le 11/11 puis le 15/11 au soir, la garde « une seule annonce hors ligne par plateforme » la retient tour à tour. Cette garde est voulue, elle se lève à chaque retour (journaux « retrait 0a1cac7c (leboncoin) RETENU — 1 annonce(s) déjà hors ligne… », puis « retenue levée sur 0a1cac7c »).
- Entre deux retenues, elle part au pré-vol : `[update-job-status] … job=0a1cac7c… → pending` toutes les ~33 min, du 12/11 20:32 sans discontinuer jusqu'au 16/11 07:34 (≈ 40 par jour).

**Règle qui la renvoie**
- `chrome-extension/background.js:29895-29907` (`verdictPrevolRecreation`) : pas de preuve de pré-vol, donc `illisible`.
- `background.js:29972-29984` : `next_action_after` +30 min, `updateJobStatus(…, "pending", { error: null })`. Aucun compteur, aucun plafond, aucun message.

**Côté extension**
- Le bloc de catégorie Leboncoin regardé une seule fois après 1,5 s est corrigé dans 0.6.191 (`content-scripts/leboncoin.js:3946-3964`, commit 84a8d8f, « parka » du même compte). Il est maintenant attendu jusqu'à 20 s, la fenêtre est rendue visible et le titre redit.
- 0.6.191 n'est pas encore sur le Chrome Web Store : le zip `build/CWS-0.6.191-A-TELEVERSER/` attend d'être téléversé. Joshua tourne en 0.6.186.
- ⚠️ Non prouvé que 0.6.191 suffise pour une rubrique **Immobilier**. L'échec est systématique depuis 4 jours, alors que la parka n'échouait que par moments. 0.6.191 dira ce que la page montrait.

## 2. La cause commune et pourquoi elle ne se lève jamais

**Deux règles se contredisent :**
- `contenuAImposer` (22-23/10) suppose qu'une photo de fiche hors stockage FillSell sera rapatriée par handler-watch (commentaire de `contenu-fiche.js:312-316` : « on attend leur rapatriement (handler-watch) »).
- handler-watch ne rapatrie que les CDN **hors Vinted** :
  - `handler-watch/index.ts:7071` filtre par `estCdnPlateformeHorsVinted` (`_shared/photos-rapatriement.ts:217-230` : « Vinted reste EXCLU du rapatriement de masse — décision Nico du 06/09 »). Pour une fiche dont les photos externes sont toutes Vinted, `externes` est vide et rien n'est rapatrié.
  - `index.ts:7113-7150` la sort quand même de la file (`photos_a_rapatrier = false`, « dans tous les cas »).
  - Le « filet » (`index.ts:7174`) ne lit que les origines `releve_*` ; une fiche `vinted_sync` n'y entre jamais.
- Deux minutes plus tard, get-pending-jobs repose le drapeau et retient de nouveau la tâche : la boucle est infinie (flag vu `true` puis `false` ce matin).

**Aucune issue n'existe** :
- les photos de la fiche ne seront jamais chez nous ;
- la copie ne change pas tant qu'elle attend ;
- `photos_lues_le` ne fait qu'avancer avec les relevés ;
- le plafond « lecture d'origine épuisée » (30/10, lot D, `index.ts:3311-3339`) ne couvre que la branche `lectureOrigineEnAttente`. La branche photos n'a ni plafond, ni délai : `ATTENTE_PHOTOS_APRES_LECTURE_MS` = 24 h existe dans `contenu-fiche.js:98`, mais seulement pour l'autre branche.

**Règles de Nico enfreintes** :
- 15/11 : « toute retenue VOULUE se voit sur la tâche (marqueur + message) ; une retenue sans écriture n'est admise que pour le passage en cours » ;
- 10/11 : « un lot prêt ne se quitte jamais en silence » ;
- 11/11 : « une photo suffit, seul 0 photo bloque » ; la copie a 2 photos valides.

Le même trou existe pour toute photo d'un autre hôte devenue **morte** (404) : handler-watch échoue, sort la fiche de la file, et get-pending-jobs la remet. Seul le filet horaire réessaie, sans fin. Même schéma dans `_shared/capture-corrigee.js:144` (`photosDeLaFicheALaRecreation` → `attendre`, republication Vinted, fiche `releve_*`) si la fiche porte des photos Vinted après une fusion.

**Autres comptes** : rejeu de `contenuAImposer` sur toutes les tâches `pending` de plus de 48 h (`q14.sql` + `rejeu2.mjs`). 183 tâches entrent dans le champ de la règle ; 2 sont retenues par `photos_a_rapatrier` (les deux ci-dessus), 0 autre.

**Les 55 republications Leboncoin `pending` de plus de 48 h (tous comptes), et ce qui les retient :**

| Compte | Nb | Créées (Paris) | Âge | Étape | Poste vu (Paris) | Ce qui les retient |
|---|---|---|---|---|---|---|
| tiblancdeshaut (7b9d8a71) | 19 | 26/10 10:19-10:24 | 20,9 j | captured | 16/11 07:26, 0.6.186 | « En pause : l'annonce n° … n'est plus dans ta liste » (introuvable, dit) |
| yoann.besak (d4047663) | 1 | 31/10 17:10 | 15,6 j | captured | 16/11 07:40, 0.6.186 | **cause commune** (photos Vinted) |
| audreyakim (013a8d5f) | 1 | 01/11 14:49 | 14,7 j | captured | 05/11 20:44, 0.6.172 | introuvable (dit), poste éteint depuis le 05/11 |
| recrutementgroupezk704 (7373c96c) | 1 | 02/11 08:00 | 14,0 j | a_capturer | 02/11 09:05, 0.6.165 | « Leboncoin jamais piloté depuis une machine virtuelle » (dit) |
| labrunettedu44 (d9a805cc) | 5 | 02/11 13:31 | 13,8 j | captured | 13/11 13:55, 0.6.186 | poste éteint depuis le 13/11 (pas la cause commune au rejeu) |
| dsjhdhayoub (90d11dae) | 2 | 03/11 23:32 | 12,3 j | deleted + captured | 15/11 16:39, 0.6.169 | 7cecc29c retirée, « reprise après interruption » ; l'autre retenue derrière (dit) |
| ornellaracano (f8aa02a5) | 1 | 07/11 08:41 | 9,0 j | a_capturer | 16/11 07:43, 0.6.186 | **cause commune** (photos Vinted) |
| contact.grizstyle (6e3d92b3) | 23 | 08/11 19:00 → 09/11 00:23 | 7,5 j | a_capturer | 16/11 00:41, 0.6.186 | file EN PAUSE par la personne (journal × 213 : « 88 gardée(s) en file ») |
| joshua.sapone (f8a94c06) | 1 | 10/11 20:44 | 5,5 j | captured | 16/11 07:42, 0.6.186 | **cause distincte** : pré-vol catégorie Immobilier illisible, boucle de 30 min |
| jessica.alhiane (010ff35b) | 1 | 13/11 10:58 | 2,9 j | **deleted** | 15/11 17:49, 0.6.186 | annonce retirée, remise en ligne servie le 15/11 16:49, poste éteint depuis |

À noter, hors sujet P4 :
- **jessica.alhiane** a une annonce hors ligne depuis le 13/11 (étape `deleted`) : elle attend le poste.
- **contact.grizstyle** : ses 23 lignes en pause ont `error` NULL, et non « En pause à ta demande ». La règle du 31/10 ne réécrit que les lignes qui portaient « En file ».

## 3. Correctif à la racine (tous les comptes) — proposé, rien n'est appliqué

**A. Ne jamais attendre un rapatriement que personne ne fera.**
- Dans `_shared/contenu-fiche.js:326-332` (`contenuAImposer`), on n'attend que si chaque photo non `photoChezNous` est rapatriable par le serveur, c'est-à-dire un CDN de plateforme hors Vinted, le même prédicat que `estCdnPlateformeHorsVinted`.
- Ce prédicat est à mettre dans un module JS pur partagé, par exemple `_shared/hotes-photos.js`, importé à la fois par `photos-rapatriement.ts` et par `contenu-fiche.js`, pour qu'il n'y ait qu'une liste d'hôtes.
- Sinon, la copie part avec SES photos (≥ 1) et on trace `contenu_du_vendeur.photos_non_rapatriables`.
- Même garde dans `_shared/capture-corrigee.js:144` (`attendre`).

**B. Jamais sans fin, jamais muet.**
- Dans `get-pending-jobs/index.ts:3278-3281`, une retenue pour photos écrit un marqueur `attente_photos_fiche {depuis}` et un message (« Mise en ligne de tes photos… »), une fois par état.
- Au-delà de `ATTENTE_PHOTOS_APRES_LECTURE_MS` (24 h, constante déjà là), la copie part telle quelle avec `photos_attente_epuisee`. Ce filet couvre aussi une photo morte sur Beebs, eBay ou ailleurs.
- La branche « lecture d'origine » a déjà son plafond ; c'est la symétrie qui manque.

**C. Question pour Nico** (avant tout code) : faut-il, à la place de A, rapatrier de façon CIBLÉE les photos Vinted d'une fiche qu'une tâche attend ?
- Ce serait une exception bornée à la décision du 06/09, qui portait sur le volume : seulement les fiches de `attendues`, `handler-watch/index.ts:7120-7133`.
- Ainsi la 3ᵉ photo Vinted partirait sur Leboncoin.
- Le serveur sait lire le CDN Vinted : `republish-capture-photos` le fait déjà (« item=10463646467 ok=4 », 15/11).
- Sans décision, A + B suffisent : la règle du 11/11 dit qu'« une photo suffit ».

**D. Pour le pré-vol « illisible » sans fin (1c)** : règle distincte, sur décision de Nico.
- Compter les verdicts `illisible` d'affilée (`gardes.prevol_formulaire_recreation`).
- Au N-ième, dire la cause sur la tâche (needs_user ou message), toujours avant tout retrait.
- Côté serveur, c'est possible sans nouvelle extension : handler-watch lit `republish_prevol_formulaire`.
- Le fond (catégorie Immobilier) se vérifiera en 0.6.191.

**Pour faire partir les trois tâches :**
- **28bce155 et f2bd4ee7** : aucune réparation de données. Dès que A (ou B) est déployé dans get-pending-jobs et `_shared`, elles sont servies au poll suivant ; les deux postes sont actifs.
  - 28bce155 part au pré-vol avec ses 2 photos, déjà rapatriées. Son état est ramené à « Bon état », l'état confirmé de la fiche (`raisons: ["etat"]` au rejeu).
  - f2bd4ee7 passe d'abord par la capture. Son annonce 3280753166 était en ligne au relevé du 15/11.
  - Le message périmé « En file… » de 28bce155 sera réécrit au passage.
  - ⚠️ Doute à trancher par Nico, sans action : la fiche Vinted de f2bd4ee7 (« Caisse de rangement en bois vintage déco », 3 photos) et l'annonce Leboncoin (« Caisse à vin… Château Lagrange 2005 », 2 photos) sont décrites différemment. Rattachement `auto, import` du 23/09. Si C est retenu, on poserait 3 photos Vinted sur l'annonce Leboncoin : à confirmer que c'est le même objet.
- **0a1cac7c** : téléverser 0.6.191 sur le Chrome Web Store (zip déjà prêt), puis relire son prochain pré-vol. S'il échoue encore sur la catégorie Immobilier, ouvrir un correctif dédié dans le content script, avec le relevé de page que 0.6.191 rapporte.

**Selftest « verrou » proposé : `selftest:photos-attente-rapatriable`** (`scripts/photos-attente-rapatriable-selftest.mjs`). Il serait rouge sur le code actuel et vert après A + B.
1. Copie Leboncoin `republish`, 2 photos chez nous, et fiche `vinted_sync` à 3 photos `images1.vinted.net` lues après la copie : `contenuAImposer` ne renvoie pas `photos_a_rapatrier` et n'impose pas de photos. *Rouge aujourd'hui* : renvoie `true`.
2. Même cas avec 2 photos Beebs + 1 Vinted : pas d'attente. *Rouge aujourd'hui.*
3. Photos Beebs ou eBay seules : `photos_a_rapatrier` reste `true`. Non-régression des cas `contenu-du-vendeur-selftest.mjs:208` et `:358`.
4. Cohérence des deux côtés : pour chaque hôte d'une table de cas, « contenuAImposer attend » ⇒ « le prédicat de handler-watch le rapatrie ». La lecture du code vérifie que `rapatrieUneFiche` et `contenu-fiche.js` importent le même prédicat. *Rouge aujourd'hui* : listes séparées.
5. `photosDeLaFicheALaRecreation` avec photos Vinted : pas d'`attendre`. *Rouge aujourd'hui.*
6. Lecture de `get-pending-jobs/index.ts` : la branche `photos_a_rapatrier` écrit un marqueur (`attente_photos_fiche`) et compare à `ATTENTE_PHOTOS_APRES_LECTURE_MS` ; au-delà, elle n'ajoute plus la tâche à `retenus`. *Rouge aujourd'hui.*
7. Rejeu des deux cas réels, anonymisés (formes de 28bce155 et f2bd4ee7) : la tâche n'est plus retenue.

Puis la suite complète, avant le commit.

## SQL et sorties (dans `.tmp-terminal/p4/`)

| Fichier | Contenu |
|---|---|
| `q1.sql` | les tâches LBC ouvertes des 3 comptes |
| `q2.sql`, `q2b.sql`, `q2.out` | `platform_fields` complets |
| `q4.sql` | profils : last seen, build, `extension_postes` |
| `q5.sql` | historique des tâches sur 25 j, par compte, plateforme, action et statut |
| `q12.sql`, `q12.out` | entrées de la règle, reconstruites ligne à ligne depuis `pg_get_functiondef` de `fiches_contenu_vendeur` et `jobs_contenu_origine` |
| `q14.sql`, `q14.out` | les 183 tâches `pending` de plus de 48 h |
| `q16.sql` | le drapeau `photos_a_rapatrier` |
| `rejeu.mjs` | rejeu des 3 tâches (`node --import ./scripts/loader-ext.mjs .tmp-terminal/p4/rejeu.mjs .tmp-terminal/p4/q12.out`) |
| `rejeu2.mjs`, `rejeu2.out` | rejeu de tout le parc |

Journaux : outil MCP `query_logs` (`function_logs`), fenêtres du 10-11/11, 12-13/11 et 15-16/11.
