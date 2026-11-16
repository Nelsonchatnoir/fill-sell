# P6 — joshua.sapone : boucle Beebs sans fin + table toscane (diagnostic en lecture seule)

Relevé du 16/11/2026, 11:15 → 12:40 heure de Paris. Prod lue (`functions list`) : update-job-status **v204**
(verify_jwt=false), get-pending-jobs **v380** (verify_jwt=true), handler-watch **v209** (verify_jwt=false).
Compte f8a94c06-51c5-4289-b434-8cc456e74c20 (Premium). Poste unique e5137ecd : Chrome, Mac (« AMD Radeon Pro 555 »,
MacBook Pro 2017), build `2026-11-10T14:10:14Z+ba13a51` = **0.6.186** (`profiles.extension_build` et
`extension_postes`), vu le 16/11 à 11:20.
Aucune écriture : ni base, ni fichier suivi, ni déploiement, ni plateforme. Requêtes et sorties : `q0.sql` … `q25.sql`,
`verrou-essai.mjs` dans ce dossier ; journaux des fonctions lus par `query_logs` (lecture seule).

## En bref

- **« 39 essais » n'est pas 39 pré-vols.** C'est le nombre d'entrées de `erreurs_archivees` (19 Ferragamo + 20 Versus),
  surtout des retenues de file (« En file… », « retenue levée… »). Les journaux comptent **18 pré-vols Beebs de ~5 min**
  (8 Ferragamo, 10 Versus) entre le 15/11 22:33 et le 16/11 10:39 : ≈ 90 min de Chrome occupé dans la nuit.
- **La lenteur vient du POSTE, pas des deux vestes.** Sur 30 jours, 900 pré-vols Beebs des 23 autres comptes : médiane
  **31 s**, max 84 s. Sur le poste de joshua (22 pré-vols) : médiane **173 s**, max 299 s. Même écart sur Leboncoin
  (médiane 105 s contre 26 s). Les deux vestes ne sont que les plus longues (marque, matière, couleur hors liste Beebs :
  2 à 3 recherches de plus dans les menus) et passent au-dessus du seuil de 210 s.
- **Le seuil est trop bas parce que la borne est la plus courte (300 s).** Le pré-vol est « trop lent » au-delà de
  0,7 × borne. Le port de remplissage (borne 10 min) n'est allumé que certains polls (étape « deleted » servie dans le même
  poll) : le Trench (277 s, borne 600 s) est passé, les deux vestes (292 s, 299 s, borne 300 s) non. L'extension promet
  que « le serveur reconnaît le texte, élargit la borne » : **le serveur ne l'élargit pas** (pas-de-rouge ne pose jamais
  `fill_borne_ms` pour `prevol_trop_lent`).
- **Pourquoi la boucle ne finit pas :** deux sorties possibles à chaque essai. Fini entre 210 et 300 s → « trop lent »,
  compté (3 reprises de 2 h, puis la personne). Au-delà de 300 s → l'envoi expire, l'extension l'avale en « illisible »
  (`pending`, +30 min, `error` NULL) : **rien ne le compte, rien ne le borne, rien ne le dit**. Versus : 5 échecs de ce
  type d'affilée (06:40 → 09:03). La boucle s'est arrêtée **par chance** (le dernier essai a fini à 299 s, pas 301 s).
- **Parc :** le seul chemin sans borne est ce pré-vol « non concluant » (Beebs, Leboncoin, Depop). Les reprises
  pas-de-rouge sont toutes bornées (aucune tâche ouverte au-delà de 4). 8 republications sont actuellement `pending` sur
  « illisible » (4 comptes) ; **une seule tourne en ce moment : la table toscane, ≈ 190 pré-vols depuis le 11/11**.
- **Table toscane :** ce n'est pas une table, c'est une **pizzeria à vendre 90 000 €** (« La Table Toscane », Riez) ;
  la rubrique Immobilier › Bureaux & Commerces est **celle de son annonce Leboncoin** (relevé), pas une règle de chez nous.
  Aujourd'hui elle échoue **après** la catégorie : `Élément introuvable: input[type="file"] (même après avance du wizard
  paginé)` (11:01, 160 s, 0.6.186). FillSell n'a jamais déposé une seule annonce Immobilier sur Leboncoin. La 0.6.191
  (attente du bloc de catégorie) ne corrigera vraisemblablement pas ce mur-là.

## 1. La lenteur du pré-vol Beebs

### 1.1 Les deux tâches

| | 3bb03a62 « Veste / manteau Salvatore Ferragamo » | cc0479d6 « Veste noire VERSUS » |
|---|---|---|
| Rayon Beebs | Mode › Femme › … › Vestes (femme) | Mode › Homme › … › Vestes (homme) |
| Champs | marque « Salvatore Ferragamo » (hors liste → Autre), couleur « Menthe » (absente des 31 couleurs, pas de « Autre »), matière « Polyester » (hors des 7 matières → Autre), taille « M / 38 » | marque « Versus Versace » (hors liste → Autre), matière « oo », taille « XL » |
| Pré-vols « trop lent » | 294 s, 249 s, 290 s, 292 s (borne 300 s) | 4 fois, dernier 299 s (borne 300 s) |
| Statut à 12:00 | `needs_user` depuis 08:33, `pas_de_rouge_reprises` = 3 | `needs_user` depuis 10:39, `pas_de_rouge_reprises` = 3 |
| Annonce | en ligne (`republish_step` = captured, rien retiré) | idem |

Sources : `q1`, `q2.out` (platform_fields complet de 3bb03a62), `q5`, `q6`, `q23` (catalogue Beebs des deux rayons).

### 1.2 Le poste, pas l'article (`q6`, `q15`, `q16`, `q17`)

| Pré-vol complet, 30 j | Autres comptes | joshua |
|---|---|---|
| Beebs | 900 pré-vols, 23 comptes : médiane 31 s, p90 44 s, max 84 s, 0 au-dessus du seuil | 22 pré-vols : médiane 173 s, p90 270 s, max 299 s, 2 au-dessus |
| Leboncoin | 1 837 pré-vols, 39 comptes : médiane 26 s, p90 45 s | 43 pré-vols : médiane 105 s, p90 135 s |

Sur son poste, la durée suit en partie le nombre de valeurs hors liste Beebs (warnings du dépôt, `q17`) : 0 hors liste
96–204 s ; 1 hors liste 108–199 s (Versus : 299 s, sa matière « oo » n'apparaît pas dans ces warnings) ; 2–3 (Trench,
Ferragamo) 277–292 s. Corrélation, pas preuve. Chaque valeur hors liste coûte, d'après le code, une ouverture de
menu (attente jusqu'à 2,5 s + frappe + attente jusqu'à 4 s), puis une seconde recherche « Autre » (0,3 s + frappe +
jusqu'à 4 s), parfois une troisième, et l'arbitrage IA (jusqu'à 6 s) : `content-scripts/beebs.js:4259-4335`
(`openPanelOptions`), `4347-4364` (`researchPanelFor`), `4433-4560` (`poserValeurSurChamp`). Sur un poste 5 à 6 fois plus
lent, cela fait ~40–60 s par valeur hors liste. Les pauses passent par un minuteur de Web Worker (`beebs.js:3164-3205`),
donc pas par le bridage des onglets cachés : le ralentissement est celui du poste (ou de Chrome sur ce Mac).
**Non prouvé étape par étape** : l'extension n'envoie pas la durée de chaque phase du pré-vol (`marquerPhase` existe,
`beebs.js:1554`, mais seul le nom de la phase part, pour le diagnostic de fenêtre). Le nommer exactement demande une
extension (voir § 3.4).

### 1.3 La borne, et pourquoi elle reste à 300 s

- Seuil « trop lent » : `chrome-extension/background.js:29806` (`PREVOL_PART_MAX_DE_LA_BORNE = 0.7`), `29807-29817`.
- Borne effective : `background.js:34097-34100` — port allumé → 10 min (`FILL_BORNE_MS`), ou `fill_borne_ms` du job
  (10–25 min) ; sinon 300 s (`FILL_BORNE_CLASSIQUE_MS`, `34069`).
- Le port est décidé par le serveur à chaque poll : `get-pending-jobs/index.ts:16376-16440`. Interrupteur général coupé
  (coin_config 0) ; allumé pour le compte si un job des 14 jours porte une coupure « Timeout: pas de réponse du content
  script » (`16429-16434`), ou si le poll sert une remise en ligne à l'étape `deleted` (`16418-16421`). D'où les bornes
  300 / 600 qui alternent chez joshua (`q6`). **Aucun des deux signaux ne voit un pré-vol « trop lent »**, et les
  expirations du pré-vol Beebs sont avalées par l'extension (§ 2) : elles n'écrivent jamais « Timeout » en base.
- Commentaire de l'extension, `background.js:29799-29804` : « le serveur reconnaît le texte, élargit la borne et reprend
  plus tard ». Côté serveur, `_shared/pas-de-rouge.js:699-713` (bloc « 0 sexies ») renvoie une reprise de 2 h **sans
  `pf`** : la borne n'est jamais élargie, chaque reprise rejoue le même mur. Vérifié sur le code actuel
  (`verrou-essai.mjs`) : `trop_lent reprises=0..2 → reprise/pending dans=120 pf=null`.
- Le remède existe déjà ailleurs : `_shared/recreation-bloquee.js:280-299` (cause `remplissage_borne_depassee`, Ciddjy
  07/11) pose `fill_borne_ms: 20 min`, lue par l'extension ≥ 0.6.177 (`BUILD_BORNE_ADAPTATIVE`, `recreation-bloquee.js:217`).
  Le poste de joshua (0.6.186) la lit.

## 2. Pourquoi la boucle n'a pas de fin

### 2.1 Chronologie (journaux des fonctions, heure de Paris)

Versus cc0479d6 — « servie » = lecture de `jobs_reservations_extension` par get-pending-jobs :

| Servie | Rapport | Durée | Rapport d'update-job-status |
|---|---|---|---|
| 00:38:45 | 00:43:41 | ~5 min | pas-de-rouge `prevol_trop_lent` → reprise (1) |
| 02:44:32 | 02:49:42 | 310 s | `→ pending` (non classé) |
| 03:20:32 | 03:26:11 | 339 s | `prevol_trop_lent` → reprise (2) |
| 05:26:32 | 05:32:08 | 336 s | `prevol_trop_lent` → reprise (3) |
| 07:32:33 | 07:40:12 | 459 s | `→ pending` |
| 08:10:32 | 08:15:48 | 316 s | `→ pending` |
| 08:46:33 | 08:51:41 | 308 s | `→ pending` |
| 09:22:33 | 09:27:42 | 309 s | `→ pending` |
| 09:58:32 | 10:03:43 | 311 s | `→ pending` |
| 10:34:33 | 10:39:44 | 311 s | `prevol_trop_lent` → **a_toi / needs_user** (299 s) |

Ferragamo 3bb03a62 : même schéma, 4 « trop lent » (22:33, 01:25, 04:43, 08:33 → needs_user) et 4 `→ pending` de
307 à 358 s (03:31, 04:07, 06:49, 07:58), plus un passage de 7 s à 07:20.

### 2.2 Les deux chemins

1. **Fini entre 210 et 300 s** → `rendreEchecPrevolTropLent` (`background.js:29819-29829`) → `failed` + texte « Contrôle
   avant retrait trop lent… » → update-job-status le reconnaît (`update-job-status/index.ts:4545-4548`,
   `prevolTropLentAPoser`) → pas-de-rouge (`pas-de-rouge.js:703-713`) → compteur `pas_de_rouge_reprises`
   (`update-job-status/index.ts:4671`, `4711-4712`) → 3 reprises de 2 h puis `needs_user` « relancer ». **Borné.**
2. **Au-delà de 300 s** → l'envoi au content script expire (« Timeout: pas de réponse du content script »), l'exception est
   avalée (`background.js:30587-30591`, simple `console.warn`), `resultatPrevol` reste null → branche « pas de preuve »
   (`background.js:30631-30642`) : `next_action_after` +30 min, `republish_prevol_formulaire.verdict = "illisible"`,
   `detail = "aucune preuve positive du formulaire"`, `updateJobStatus(…, "pending", { error: null })`. Côté serveur,
   un `pending` sans erreur ne passe par aucun classement (`update-job-status/index.ts:4595`). **Aucun compteur, aucune
   borne, aucun message** (l'erreur est même effacée). Même branche pour Leboncoin et Depop
   (`background.js:29972-29984`, `verdictPrevolRecreation` `29895-29907`).

Qui relance : personne de particulier — l'extension elle-même pose `next_action_after` +30 min et get-pending-jobs
re-sert la tâche à l'échéance (retenue « une seule annonce hors ligne » mise à part, voulue). handler-watch ne relance
pas un `needs_user` (il n'y pose que le décompte `needs_user_tick_le` / `needs_user_actif_ms`, toutes les 30 min :
`handler-watch/index.ts:2192-2330`) ; « Relancer » dans l'app remet `pas_de_rouge_reprises` à zéro
(`get-pending-jobs/index.ts:1568-1569`, `1617-1618`) et rouvre une série complète.

### 2.3 Sur tout le parc

- Reprises pas-de-rouge (toutes plateformes, tâches ouvertes) : 3 tâches à 3–4 reprises, aucune au-delà (`q18`). Les
  bornes existantes tiennent.
- Pré-vol « trop lent » depuis sa création (07/11) : joshua (2 Beebs) et jessica.alhiane (2 Leboncoin, publiées le
  07/11) — `q25`.
- Republications `pending` sur un pré-vol « illisible » (chemin non borné) : **8 tâches, 4 comptes** (`q10`, `q11`) —
  joshua 0a1cac7c (Leboncoin, Immobilier), labrunettedu44 ×5 (Leboncoin, photo non téléchargeable / wizard, poste vu le
  13/11, rien depuis), yoann.besak 28bce155 (Leboncoin, Duck Tales, traitée ce matin § 4 du rapport du 16/11),
  tiblancdeshaut 74dd7368 (Beebs, DataDome, 27/10). **Une seule tourne réellement aujourd'hui** (journaux des fonctions,
  24 h) : 0a1cac7c, ≈ 40 pré-vols par jour (38 le 11-12/11, 43 le 12-13/11, 42 le 13-14/11, 41 le 14-15/11, 23 le
  15-16/11 avec les retenues de nuit), soit ≈ 190 depuis le 11/11.
- Autres tâches qui reviennent souvent dans les journaux, **hors pré-vol** (non diagnostiquées ici, à regarder à part) :
  2d5313cf gaillardpaul17120 (Vinted, étape deleted, 17 retours `pending` en 24 h), ec747fae vintedsonia34 (retrait
  **Beebs** dont le message parle de « Vinted vérifie encore cette annonce » — incohérent), 8dc97e7f jessica.alhiane
  (Leboncoin, étape deleted), 95a53bfc raphael.goutte18 (Vinted, « accident de parcours », règle B6).

## 3. Proposition

### 3.1 Corriger la lenteur côté serveur (la borne), sans extension

- **A. Port allumé quand un pré-vol a été trop lent** — `get-pending-jobs/index.ts:16424-16435` : ajouter aux signaux
  de la requête bornée (14 j, `limit 1`) `platform_fields->pas_de_rouge->>motif.eq.prevol_trop_lent` et
  `platform_fields->republish_prevol_formulaire->>verdict.eq.trop_lent`. C'est la règle déjà décidée le 06/10 (« un
  remplissage lent mais vivant n'est jamais coupé ») appliquée au pré-vol : borne 10 min, seuil 420 s ; les 22 pré-vols
  de joshua (max 299 s) passent tous. Vaut pour tous les comptes, sans geste.
- **B. Tenir la promesse de l'extension** — `pas-de-rouge.js:703-713` : au premier « trop lent » d'un poste ≥
  `BUILD_BORNE_ADAPTATIVE` (0.6.177) dont la borne lue dans le texte est < 1 200 s, reprise **30 min** avec
  `pf: { fill_borne_ms: 20 * 60_000 }` (même champ que `remplissage_borne_depassee`). Le pré-vol et le redépôt passent
  alors par le port, borne 20 min (`background.js:34081-34095`). Ensuite seulement les reprises de 2 h, puis la personne.
  Les postes < 0.6.177 gardent le comportement d'aujourd'hui (le verrou `selftest:lot-0711-serveur` § 3 reste vert : il
  n'envoie pas de build).
- Facultatif (décision) : servir directement « Autre » pour une marque/matière Beebs connue hors liste (catalogue
  `platform_category_aspects`, `q23` : matières et couleurs complètes, marques tronquées à 60/200) — gain ~40–60 s par
  valeur sur ce poste, mais touche au contenu servi (et à l'ajout de la marque dans la description fait par beebs.js).

### 3.2 Borner la boucle (règle, tous les comptes)

- **C. Nouveau module pur `supabase/functions/_shared/prevol-non-concluant.js`** : reconnaît, dans le corps envoyé à
  update-job-status, un pré-vol de recréation **non concluant** : action republish, statut `pending`, `error` vide,
  `republish_step` ≠ `deleted`, `republish_prevol_formulaire.verdict` = `illisible` posé dans les 5 dernières minutes.
  Il rend `{ plateforme, detail, borneAtteinte }`, où `borneAtteinte` = Beebs, garde `prevol_formulaire_beebs` sans
  `duree_s`, détail « aucune preuve positive du formulaire » et `maintenant − processing_since` ≥ 0,9 × 300 s (c'est la
  signature exacte des 9 expirations relevées : 307–459 s après la prise).
- **D. update-job-status** (`index.ts:4545-4548` et condition `4595`) : nouveau drapeau `prevolNonConcluantAPoser` ;
  `brut` passé à `classerEchec` (`4672-4675`) = une phrase synthétique « Pré-vol de recréation non concluant (<pf>) :
  <détail> ». Le compteur est celui qui existe (`pas_de_rouge_reprises`, partagé avec `prevol_trop_lent` : la borne
  porte sur le total des essais inutiles). Trace `boucle_technique { signature: "prevol_non_concluant" }` pour
  l'ops-digest.
- **E. pas-de-rouge** : nouvelle branche `prevol_non_concluant`, placée **avant** `LBC_PHOTOS_NON_AFFICHEES_RE`
  (`pas-de-rouge.js:1145`) — sinon le détail Leboncoin « Élément introuvable: input[type=file] » est pris pour « Leboncoin
  n'a pas affiché l'ajout des photos » (vérifié, `verrou-essai.mjs`), faux pour la table toscane :
  - `borneAtteinte` → même traitement que « trop lent » (B : borne 20 min, puis 2 h) ;
  - sinon 3 reprises (30, 60, 120 min ; l'extension reprend déjà à 30 min, les suivantes s'espacent), puis
    `a_toi / needs_user`, source `relancer`, message vrai, par exemple :
    « FillSell n'arrive pas à vérifier, avant de retirer ton annonce, que le formulaire de Beebs se remplit jusqu'au bout
    sur ton ordinateur (4 essais, chacun a dépassé 5 min). Rien n'a été retiré : ton annonce est toujours en ligne.
    Relance d'un clic ci-dessous, de préférence ordinateur peu chargé ; si ça recommence, dis-le nous. »
  - Leboncoin rubrique **Immobilier** (voir § 4) : message dédié dès que la borne est atteinte (ou dès le premier
    passage, si Nico le décide).
- Bornes existantes relues : `prevol_trop_lent` 3 × 2 h puis la personne (`pas-de-rouge.js:709-713`) ;
  `lbc_photos_non_affichees` 3 × 15 min puis « relancer » (`1145-1156`) ; `refus_session_bonne` 3, 6, 10 min ; B6
  (`_shared/accident-avant-retrait.js:1-40`, Vinted, accident avant retrait : 5, 20, 60 min puis toutes les 3 h, **jamais
  un geste**, sentinelle à > 3). ⚠️ B6 est la seule règle qui refuse d'arrêter sur la personne : décider si le pré-vol
  non concluant suit B6 (file espacée sans fin, trace rouge pour nous) ou la règle du « trop lent » (needs_user
  « relancer » après 3 reprises). Je recommande la seconde : la cause n'est pas un accident passager (chez joshua, 18
  échecs identiques ; la table toscane, ~190).

### 3.3 Fonctions à redéployer (après selftests + suite complète)

- update-job-status (aujourd'hui v204, verify_jwt=false → `--no-verify-jwt`) : C, D, E, B (pas-de-rouge.js est
  embarqué).
- get-pending-jobs (v380, verify_jwt=true → sans drapeau) : A, et B/E par pas-de-rouge.js s'il l'importe (à vérifier au
  moment du lot).
- handler-watch (v209) : pas nécessaire ; seulement s'il importe pas-de-rouge.js (à vérifier).
- Réparation (script `scripts/reparations/`, sauvegarde + inverse, feu vert de Nico) : relancer 3bb03a62 et cc0479d6
  comme « Relancer », avec `fill_borne_ms` 20 min ; la table toscane suit § 4.

### 3.4 Côté extension (en une ligne)

Il faudrait une **0.6.192** pour : rendre l'expiration du pré-vol Beebs comme « trop lent » au lieu de l'avaler
(`background.js:30587-30591`), compter elle-même les pré-vols non concluants, et joindre au garde la durée de chaque phase
(`marquerPhase`) pour nommer l'étape lente — le serveur suffit pour arrêter la boucle et débloquer joshua.

## 4. La table toscane (0a1cac7c-f4c2-4c46-9b9f-8e63af30d08f)

- **Ce que c'est** : titre « à vendre – la table toscane – pizzeria à riez (04) – 90 000 », description « La Table
  Toscane, pizzeria … est à vendre … 30 couverts … appartement T2 ». Annonce Leboncoin d'origine
  `https://www.leboncoin.fr/ad/bureaux_commerces/3271304443`, publiée par la personne elle-même et **importée** par le
  relevé (job 4b736ee5, `handler_build = releve-annonces`, rattachement du 07/11 16:20). `lbcCategoryPath =
  ["Immobilier","Bureaux & Commerces"]` vient de `champs_repris_de_l_annonce` (« get-pending-jobs (annonce en ligne
  relevée — annonces_plateforme.capture) »), critères Immobilier repris (surface 70 m², DPE/GES vierges, « Restaurants &
  hotels », terrasse…). **La rubrique est juste ; aucune règle de catégorie de FillSell ne l'a choisie.** (`q12`, `q20`,
  `q21`)
- **État** : `pending`, étape `captured` depuis le 11/11 09:39, annonce en ligne, `error` NULL,
  `next_action_after` 16/11 11:31. Dernier pré-vol : 16/11 11:01, 160 s, verdict `illisible`, détail
  `Élément introuvable: input[type="file"] (même après avance du wizard paginé)`. Le matin (annexe p4, 07:34) le détail
  était « Catégorie : ni suggestion ni sélecteur manuel trouvés » : selon les passages, elle tombe à la catégorie
  (bloc lu trop tôt, fenêtre minimisée — ce que corrige la 0.6.191) ou **après**, faute d'atteindre la page des photos.
- **Ce qui échoue après la catégorie** : `advanceWizardTo` (`content-scripts/leboncoin.js:5678-5698`) clique « Continuer »
  3 fois au plus en ne remplissant que la description et le prix (`remplirEtapeAvantPhotos`, `5709-5733`). Le parcours
  Immobilier de Leboncoin demande vraisemblablement ses critères (surface, type d'activité…) avant les photos : la page
  ne passe pas, `input[type=file]` n'apparaît jamais (`leboncoin.js:3069-3072`). **Non vérifié sur la vraie page** :
  FillSell n'a jamais déposé d'annonce Immobilier (2 tâches en tout dans l'histoire du parc, aucune publiée — `q14`).
- **La 0.6.191** (zip prêt : `build/CWS-0.6.191-A-TELEVERSER/fillsell-extension-0.6.191-cws.zip`, pas encore sur le
  Chrome Web Store ; joshua en 0.6.186) attend le bloc de catégorie jusqu'à 20 s (commit 84a8d8f). Elle supprime l'échec
  « catégorie », pas l'échec « photos » déjà observé en 0.6.186 : **elle ne la corrigera vraisemblablement pas**.
- **Côté serveur** : (1) la borne C/D/E l'arrête au 4ᵉ pré-vol avec un message vrai au lieu de ~40 par jour ;
  (2) au choix de Nico, une règle « Leboncoin Immobilier : FillSell ne sait pas encore » (get-pending-jobs ne la sert
  plus ; `needs_user` tout de suite : « FillSell ne sait pas encore republier une annonce de la rubrique Immobilier de
  Leboncoin (son formulaire est différent). Rien n'a été retiré : ton annonce est toujours en ligne. Tu peux la remonter
  toi-même sur Leboncoin. ») ; (3) savoir la remplir demande un relevé du vrai formulaire Immobilier › Bureaux &
  Commerces (compte de Nico, annonce de test ≥ 999 € — possible rubrique payante ou modérée, non vérifié), puis une
  extension.

## 5. Selftest « verrou » proposé

`scripts/prevol-boucle-bornee-selftest.mjs`, script `selftest:prevol-boucle-bornee` (`node scripts/…`, comme
`selftest:lot-0711-serveur`). Contrôles :

1. « Trop lent » 292 s / borne 300 s, build 0.6.186, reprises 0 → reprise ≤ 30 min **avec** `pf.fill_borne_ms = 1 200 000`.
   *Rouge aujourd'hui* (`verrou-essai.mjs` : `pf=null`, 120 min).
2. Même texte, borne 1 200 s déjà → pas de nouvel élargissement, 2 h ; reprises 3 → `a_toi`, `relancer`. Build < 0.6.177
   ou absent → comportement d'aujourd'hui (non-régression de `selftest:lot-0711-serveur` § 3).
3. `prevolNonConcluant()` : Beebs `illisible` sans `duree_s`, « aucune preuve… », 310 s après `processing_since` →
   `borneAtteinte` ; Leboncoin `illisible` avec détail → non concluant ; `at` périmé, étape `deleted`, statut ≠ pending
   ou `error` présent → null. *Rouge* : module absent.
4. `classerEchec` sur la phrase synthétique : reprises 0, 1, 2 → reprise 30/60/120 ; 3 → `a_toi / needs_user /
   relancer`, message contenant « toujours en ligne » et le nom de la plateforme, **jamais** « n'a pas affiché l'ajout
   des photos » (le détail input[type=file] ne doit pas être volé par `LBC_PHOTOS_NON_AFFICHEES_RE`). *Rouge*.
5. Rejeu de la nuit de Versus (T, I, T, T, I, I, I, I, I, T ; T = trop lent, I = expiration) à travers la même mécanique
   de compteur qu'update-job-status : `needs_user` au plus tard au 4ᵉ pré-vol, et dès le 2ᵉ la borne est 20 min (le
   pré-vol de 292 s passe sous 0,7 × 1 200 s). *Rouge* : aujourd'hui 10 pré-vols.
6. Rejeu de la table toscane : 23 rapports `illisible` → `needs_user` au 4ᵉ, message Immobilier si la règle est décidée.
   *Rouge*.
7. get-pending-jobs (A) : la liste des signaux du port contient `prevol_trop_lent` (test de chaîne sur le filtre, ou
   fonction pure extraite). *Rouge*.

Suite complète à relancer avant le commit (règle du dépôt) ; à surveiller : `selftest:pas-de-rouge`,
`selftest:lot-0711-serveur`, `selftest:lbc-photos-non-affichees`.

## 6. Ce qui demande une décision de Nico

1. Sortie de la boucle « pré-vol non concluant » : `needs_user` « relancer » après 3 reprises (recommandé, comme le
   « trop lent ») ou file espacée sans fin façon B6 (24/10) ?
2. Leboncoin Immobilier : arrêter tout de suite avec « FillSell ne sait pas encore » (recommandé, 0 dépôt Immobilier
   réussi dans l'histoire), ou faire le relevé du formulaire (compte de Nico, test ≥ 999 €) puis une 0.6.192 ?
3. Feu vert pour la réparation des trois tâches de joshua (script, sauvegarde, inverse) après le correctif.
4. Facultatif : servir « Autre » d'avance pour une marque/matière Beebs connue hors liste.
5. Téléverser la 0.6.191 reste utile (parka et autres catégories), mais ne réglera pas la table toscane.
