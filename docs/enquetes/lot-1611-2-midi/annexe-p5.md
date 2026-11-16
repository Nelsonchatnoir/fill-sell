# Point 5 — contact.grizstyle (6e3d92b3) : 88 tâches en attente, sans message

Diagnostic en LECTURE SEULE, le 16/11/2026 vers 11:20 (heure de Paris). Rien d'écrit en base, aucun fichier du dépôt
touché, aucun déploiement. Requêtes : `.tmp-terminal/p5/q*.sql` (via `q.sh`, lecture seule) ; journaux des fonctions
edge lus avec l'outil de logs Supabase (lecture). Versions LUES : get-pending-jobs **v380** (verify_jwt true,
déployée le 16/11 10:25), handler-watch v209, update-job-status v204.

> Note de lecture : `q.sh` imprime les colonnes dans l'ordre ALPHABÉTIQUE de leur nom ; les extraits ci-dessous sont
> remis dans un ordre lisible.

---

## 0. En une phrase

**Sa file est EN PAUSE, à sa demande, depuis le mercredi 05/11 à 22:25:06** (`platform_settings.file_pause =
{"active":true,"depuis":"2026-11-05T21:25:06Z","par":"app"}`). Le serveur garde donc TOUT en file — publications
comme republications, dans le créneau comme en dehors. Ce n'est ni le créneau, ni une cadence de lot, ni Leboncoin,
ni la connexion. Le défaut, valable pour tout le parc : **la pause ne se dit presque jamais sur la ligne de la
tâche** (elle ne s'écrit que sur une republication qui portait EXACTEMENT « En file : … »), et comme elle passe
AVANT le bloc du créneau, le message « en attente de ton créneau » n'est jamais écrit non plus.

---

## 1. Les faits (SQL + journaux)

### 1.1 Les 88 tâches (q1, q24)
| Plateforme | Action | Source | Nb | Créées (Paris) | Lot | Message |
|---|---|---|---|---|---|---|
| Vinted | republish | manuel | 39 | 09/11 00:23:17 → 00:23:31 | b48252c0 (41 articles, 61 tâches) | aucun |
| Vinted | republish | auto | 1 | 06/11 19:00:04 | — | aucun |
| Leboncoin | republish | manuel | 22 | 09/11 00:23:16 → 00:23:31 | b48252c0 | aucun |
| Leboncoin | republish | auto | 1 | 08/11 19:00:09 | — | aucun |
| Leboncoin | publish | — | 24 | 09/11 00:30:34 → 00:30:59 | f4b78c17 (25 articles) | aucun |
| Vinted | publish | — | 1 | 09/11 00:30:40 | f4b78c17 | aucun |

Toutes `status='pending'`, `voie='extension'`, aucune `programmee` (`publication_programmee.actif = false`).
**Les 88 sont nées APRÈS la pause** (q21 : `nes_pendant_pause = 88`).

### 1.2 La pause (q4, q5, q6)
- `usage_logs` : `file_pause {"pause":true}` le **05/11 à 22:25:06** ; aucune reprise depuis.
- `profiles.platform_settings.file_pause = {"active":true,"depuis":"2026-11-05T21:25:06.989043+00:00","par":"app"}`.
- Deux minutes plus tard (05/11 22:27) il annule ses republications Leboncoin et Vinted en file (q10, q25 :
  « Annulée à ta demande »). Le 09/11 à 00:23 puis 00:30, il relance 61 republications et 25 publications **dans la
  file toujours en pause** — aucun écran ne le lui a dit avant le clic (§ 3.3).

### 1.3 Le serveur le constate à chaque passage (journaux de get-pending-jobs)
Toutes les 2 min, quand son PC est allumé :
```
[get-pending-jobs] userId=6e3d92b3-… : file EN PAUSE (geste de la personne) → 88 publication(s)/republication(s)
gardée(s) en file ; retraits et republications engagées servis
```
(extrait : `.tmp-terminal/p5/logs-1511.txt`, 200 lignes du 15/11.)

### 1.4 Ses heures de présence réelles (premier et dernier passage du poste, journaux, heure de Paris)
| Jour | Premier passage | Dernier passage | Créneau 18:30–19:45 couvert ? |
|---|---|---|---|
| 11/11 | 23:05 | 01:55 (12/11) | non |
| 12/11 | 23:10 | 00:57 (13/11) | non |
| 13/11 | 23:13 | 00:31 (14/11) | non |
| 14/11 | 20:20 | 01:37 (15/11) | non |
| 15/11 | **17:37** | 00:41 (16/11) | **OUI, en entier** |

Même constat dans `republish_creneaux` (q9) : 11, 12, 13, 14/11 → `statut 'manque'`, `_extension_absente`
(derniere_vue 23:35, 01:55, 00:57, 00:31) ; **15/11 → `extension_vue = true`**, `prevues 5`, `faites 0`,
note `_bloque_en_vol` (Vinted `en_vol 40`, Leboncoin `en_vol 23`). Les 09/11 et 10/11 (ancien créneau 19:00–22:00),
Chrome était aussi là (`extension_vue = true`) — rien n'est parti non plus. Le créneau a été déplacé de 19:00–22:00 à
18:30–19:45 (réglage « perso », Vinted et Leboncoin) entre le 10/11 et le 11/11.

**Le 15/11, le PC a couvert tout le créneau et rien n'est parti : c'est la pause, pas l'ordinateur.**

### 1.5 Poste, extension, connexions (q3)
- Un poste (`57d05687…`), Chrome, carte NVIDIA GTX 1660 (pas de machine virtuelle), extension **0.6.186**
  (build `2026-11-10T14:10:14Z+ba13a51`), dernier signe le 16/11 à 00:41.
- Vinted : session prouvée (`vinted_user_id 21977963`, login grizstyle, sonde 200).
- Leboncoin : `extension_sessions.leboncoin = true` au 14/11 23:21 mais la sonde rend `http 403` ; **aucun dépôt
  Leboncoin n'a jamais été fait par FillSell** pour ce compte (les 25 « published » Leboncoin sont des imports de
  relevé, `source = releve` — q12). À surveiller à la reprise (premier dépôt du compte).
- Dernière republication Vinted réussie : 02/11 23:11 (q10). 03 → 05/11 : PC éteint aux créneaux ; depuis le 05/11
  22:25 : la pause.

---

## 2. Réponses

### a) Pourquoi AUCUN message

**Où s'écrit « en attente de ton créneau »** (serveur seulement, au passage d'EXÉCUTION du poste) :
- texte : `supabase/functions/_shared/retenue-creneau.js:41` (`messageRetenueCreneau`, republication auto) et
  `supabase/functions/_shared/lot-manuel-creneau.js:91` (`messageRetenueLotCreneau`, lot manuel de plus de 10 articles) ;
- écriture : `supabase/functions/get-pending-jobs/index.ts:8873` (garde `!includeProcessing && !includeNeedsUser`),
  lot manuel `:8889-8911`, automatique `:8930-8952` (texte `:8946`, écriture `:8949`) — **seulement sur les tâches encore dans `out`** à cet endroit,
  à la transition (texte différent) ;
- app : traduction `src/utils/messagesServeur.js:205`, raison « créneau » `src/utils/fileDesJobs.js:99`,
  `supabase/functions/_shared/etat-job.js:287` ; copie extension `chrome-extension/etat-job.js:705`.

**La condition qui l'exclut pour lui** : la pause est jugée BIEN AVANT, `get-pending-jobs/index.ts:3062-3104` :
- `:3069` `filePause = estFileEnPause(psProfil)` → vrai ;
- `:3083-3087` toutes ses tâches (`jobRetenuParPause`, `_shared/file-pause.js:29`) sortent de `out` → le bloc du
  créneau (`:8873`) ne les voit jamais ;
- `:3092-3099` le texte de la pause (`MESSAGE_REPUBLICATION_EN_PAUSE`, `_shared/file-pause.js:59`) ne s'écrit que si
  `j.action === "republish" && j.error === MESSAGE_EN_FILE` — ses republications sont nées avec `error = null`
  (après la pause) et ses publications ne sont jamais concernées → **0 écriture, à chaque passage**.

L'app, elle, sait la pause dans le Stock (bandeau « Ta file est en pause à ta demande » + « Reprendre »,
`src/tabs/StockTab.jsx:10144-10150`) et dans « Ta file » (`ctxBarres.filePause`, `StockTab.jsx:9370` →
`etat-job.js:249`). Mais les écrans qui n'ont pas `filePause` dans leur contexte — l'écran « Publication lancée »
(`src/publication/EcranSuivi.jsx:133`), le suivi du lot (`src/publication/lot/SuiviLot.jsx`, `regles.js:613`
`etatJob(j)` sans contexte) — disent « En file », et la base (que lisent l'ops et Nico) ne dit rien.

**Sur tout le parc** (q16, q17, q19, q21, q26 — 16/11 11:19) :
- **Comptes en pause : 4 ont des tâches en attente → 158 tâches retenues par la pause, dont 120 SANS AUCUN TEXTE
  (76 %)**, 19 avec « En pause à ta demande », 19 avec un autre texte (relevé Leboncoin). **93 des 158 sont nées
  pendant la pause** (lancées sans que l'écran le dise).

  | Compte | Pause depuis (Paris) | En attente | Sans texte | « En pause à ta demande » | Nées pendant la pause |
  |---|---|---|---|---|---|
  | 7b9d8a71 | 30/10 14:59 | 60 | 22 | 19 | 0 |
  | **6e3d92b3 (grizstyle)** | **05/11 22:25** | **88** | **88** | 0 | **88** |
  | d9a805cc | 06/11 13:26 | 5 | 5 | 0 | 0 |
  | 5c438b36 | 10/11 14:00 | 5 | 5 | 0 | 5 |
  | 581767bb | 26/10 13:59 | 0 | — | — | — |
- **Tâches retenues par le créneau** (auto, ou lot manuel > 10 articles, module actif, annonce pas retirée) :
  589 portent bien « en attente de ton créneau » ; **76 n'ont aucun texte**, dont **68 à cause d'une pause**
  (grizstyle 63, un autre compte 5) ; le reste : 3 tâches nées après le dernier passage du poste (transitoire) et
  5 tâches d'ac19c8c9 à l'étape `captured` (poste allumé seulement pendant son créneau 08:00–10:00 — autre cas,
  hors de ce point).

→ Le correctif doit viser **la pause qui ne se dit pas**, pour tous les comptes, pas le créneau.

### b) Pourquoi les 24 publications Leboncoin et la publication Vinted neuves attendent
- **La pause de la file, et rien d'autre aujourd'hui.** Le journal le dit à chaque passage (§ 1.3).
- Ce n'est PAS le créneau de republication : la règle du lot (`_shared/lot-manuel-creneau.js`,
  `estRepublicationManuelle`) ne touche que les **republications** ; les publications ne sont pas programmées
  (`programmee` absent, `publication_programmee.actif = false`, bloc `get-pending-jobs:3106` et suivantes).
- Ce n'est PAS une cadence anti-robot de lot de publications : il n'en existe pas pour les publications (seules
  les règles « un seul Leboncoin à la fois » `get-pending-jobs:8967` et suivantes, et la publication programmée,
  désactivée chez lui).
- Ce n'est PAS une file Leboncoin bloquée : aucune tâche Leboncoin en `processing`, aucune n'a été servie.
- Ce n'est PAS la connexion ni l'extension : poste à jour (0.6.186), passages toutes les 2 min quand le PC est
  allumé, session Vinted prouvée.

**Ce qui se passera à la reprise** (règles inchangées) : les 25 publications partent tout de suite (Leboncoin une à
la fois) ; les 61 republications du lot b48252c0 (41 articles > 10) et les 2 automatiques ne partent que dans le
créneau 18:30–19:45 (règle du 09/11, option B), au rythme habituel. Avec un PC éteint à cette heure 4 soirs sur 5,
elles attendront encore → point c. Risque à surveiller : premier dépôt Leboncoin jamais fait (sonde `http 403`).

### c) PC jamais allumé pendant le créneau : ce qui existe, ce qui manque
**Existe** :
- le balayage SQL (`republish_planifiee_sweep`) note chaque créneau : `republish_creneaux.statut = 'manque'`,
  `sautes._extension_absente {derniere_vue, leve_le}` ;
- Réglages › Republication automatique › (plateforme) : « Active · dernier créneau manqué » et l'avis
  « <jour>, 18:30–19:45 : rien n'est parti, Chrome était fermé. » (`src/components/RepublicationPlanifiee.jsx:452-453`,
  `:538-561`) ; l'historique « Chrome était fermé de … à … » (`:282-288`).

**Manque** :
1. Seul le DERNIER créneau est dit, jamais la répétition (« 4 soirs sur 5 »), ni les heures où le PC est
   réellement allumé, ni une proposition de déplacer le créneau. Rien hors des Réglages (Stock, « À régler »).
2. Le 15/11, l'avis dirait « rien n'est parti. Le créneau est resté bloqué derrière une republication en vol »
   (`RepublicationPlanifiee.jsx:565-566`, note `_bloque_en_vol` du balayage) : **faux motif** — c'est la pause.
   Le balayage SQL ne lit pas `file_pause` (q27) ; il crée une republication auto par plateforme (06/11, 08/11) qui
   reste retenue par la pause, puis « bloque en vol » chaque créneau suivant.
3. Aucune trace en base des heures de présence (seuls `extension_last_seen_at` et `extension_postes[poste].le /
   vivant_depuis` — un instant, pas un historique). Les journaux edge les ont, l'app non.

**Réglage du créneau dans l'app** : Réglages › Republication automatique › Vinted / Leboncoin › « Créneau de
republication » (`src/reglages/ReglagesPage.jsx:348` → `RepublicationPlanifieeReglages`,
`src/components/RepublicationPlanifiee.jsx:1379-1395` ; préréglages matin/midi/soir `:123-127`, « Personnalisé »
avec deux champs heure ; `persoValide` exige `a > de` `:1208` → **un créneau ne peut pas passer minuit**).

**Proposition** (le créneau est le réglage de la personne ; la cadence — durée, jours, plafonds, rythme — ne bouge
pas) : voir D5 ci-dessous.

---

## 3. Plan de correctif (d)

### D1 — Serveur : la pause se DIT sur chaque tâche qu'elle retient (règle, tout le parc)
- **Nouveau module pur `supabase/functions/_shared/pause-dite.js`** (PAS dans `file-pause.js` : ce fichier est recopié
  à l'octet dans `chrome-extension/etat-job.js` par `scripts/gen-etat-job-extension.mjs:15-22` — le toucher
  obligerait à une nouvelle extension). Il importe `jobRetenuParPause` / `MESSAGE_REPUBLICATION_EN_PAUSE`
  (file-pause.js), `MESSAGE_EN_FILE` (retenue-hors-ligne.js:64), `messageRetenueCreneau` / `messageRetenuePause`
  (retenue-creneau.js), `messageRetenueLotCreneau` (lot-manuel-creneau.js) :
  ```js
  export const MESSAGE_PUBLICATION_EN_PAUSE =
    "En pause à ta demande : ta publication partira quand tu reprendras ta file.";
  // Les textes d'ATTENTE que la pause remplace (jamais un texte qui explique autre chose : relevé, connexion, question…).
  function texteDAttente(job) { /* null, "", MESSAGE_EN_FILE, messageRetenueCreneau(pf), messageRetenuePause(pf),
                                    messageRetenueLotCreneau(pf), l'autre texte de pause */ }
  /** Le texte à écrire sous la pause, ou null (pas retenu, déjà dit, ou texte explicatif à garder). */
  export function texteSousPause(job) {
    if (!jobRetenuParPause(job)) return null;
    const msg = job.action === "republish" ? MESSAGE_REPUBLICATION_EN_PAUSE : MESSAGE_PUBLICATION_EN_PAUSE;
    if (String(job.error ?? "") === msg) return null;
    return texteDAttente(job) ? msg : null;
  }
  /** À la reprise : le texte qui remplace celui de la pause (« En file » pour une republication, rien pour une publication). */
  export function texteApresReprise(job) { … }
  ```
- **`get-pending-jobs/index.ts:3090-3101`** : remplacer le filtre `aDire` (`republish` + `MESSAGE_EN_FILE` seulement)
  par `texteSousPause(j)` sur `out0` ; deux mises à jour au plus (publications, republications),
  `.in("id", ids.slice(0, 200)).eq("status", "pending")`, à la TRANSITION seulement (le texte diffère) → ses 88
  lignes en un passage, puis 0 écriture ; la ligne de journal dit le nombre écrit.
- **`get-pending-jobs/index.ts:3073-3081`** (reprise, 24 h) : remettre aussi `MESSAGE_PUBLICATION_EN_PAUSE` → `null`
  (une publication en file n'a pas de texte), comme `MESSAGE_REPUBLICATION_EN_PAUSE` → `MESSAGE_EN_FILE`. Au passage
  suivant hors créneau, le bloc `:8873` écrit « en attente de ton créneau » (déjà à la transition).
- **`src/utils/messagesServeur.js`** (près de `:85`) : traduction anglaise du nouveau texte.
- **Déploiement** : `get-pending-jobs` seule (v380 → v381), `verify_jwt` **true** (appelée par l'extension avec
  session) — lire version et verify_jwt avant et après. **Aucune migration.** Aucune extension.
- **Selftest existant à adapter dans le même commit** : `scripts/lot-f-3110-selftest.mjs:261-265` épingle l'ancien
  filtre (`j.action === "republish" && j.error === MESSAGE_EN_FILE`) — il passera rouge ; la règle s'élargit, elle ne
  disparaît pas (« lignes concernées seulement », 200 au plus).

### D2 — App : les écrans qui ignorent la pause
- `src/publication/EcranSuivi.jsx:133` (`ctxBarre`) et le suivi du lot (`src/publication/lot/SuiviLot.jsx`,
  `regles.js:613` `etatJob(j)` sans contexte) reçoivent `filePause` via `useEtatFile`
  (`src/stock/etatFile.js`, relecture bornée 60 s, déjà utilisée par le Stock).
- Sans cela, D1 seul afficherait sur ces écrans « En pause : nouvel essai automatique » (une tâche `pending` avec un
  texte = motif `essai`, `_shared/etat-job.js:324`) — faux. Ne PAS toucher `etat-job.js` (copie extension).

### D3 — App : dire la pause AVANT le clic (décision de Nico sur le texte et le geste)
93 des 158 tâches retenues par une pause sur le parc ont été lancées PENDANT la pause. Proposition : la feuille de
republication (`StockTab.jsx:7084` `lancerRepublicationLot` et sa feuille), l'envoi du lot de publication
(`LotPublication.jsx`) et la publication à l'unité lisent `file_etat` ; en pause, une ligne « Ta file est en pause à
ta demande depuis le 05/11 : ce que tu envoies attendra ta reprise » + « Reprendre ma file » (`basculer(false)`).

### D4 — Réglages › Republication automatique : le vrai motif
`RepublicationPlanifiee.jsx` `synthese()` (`:376-580`) : file en pause → ligne « Active · ta file est en pause » et
avis en premier « Ta file est en pause à ta demande : rien ne part, même dans ton créneau » + « Reprendre », AVANT
`blocage` / `manque` (aujourd'hui : « bloqué derrière une republication en vol », faux). État lu par
`useEtatFile` dans `ReglagesPage.jsx`. App seule, pas de SQL.
(Optionnel, décision de Nico car c'est le moteur du créneau : que `republish_planifiee_sweep` note
`_file_en_pause` au lieu de `_bloque_en_vol` — migration, réécrite depuis `pg_get_functiondef`. Non nécessaire si D4.)

### D5 — Point c : « ton ordinateur est éteint pendant ton créneau » (décision de Nico)
1. **Détection, avec ce qui existe** : module pur `_shared/creneau-hors-presence.js` sur `republish_creneaux` —
   au moins 3 des 5 derniers créneaux d'une plateforme `statut 'manque'` avec `_extension_absente` jamais levée
   (Chrome fermé du début à la fin). grizstyle : 4 sur 5 (11 → 14/11).
2. **Heures de présence** (pour proposer une heure) : `extension_postes[poste].heures_vues` = 14 jours × 24 heures
   (heure de Paris), posé dans la MÊME écriture que le passage du poste (`get-pending-jobs/index.ts:1243`,
   `patchPoste`) — aucune écriture de plus, aucune migration (jsonb), ~500 octets par poste.
3. **Ce que l'app dit** (Réglages, avis de la plateforme ; et une ligne du Stock « À régler » qui ouvre les Réglages) :
   « Ton créneau 18:30–19:45 : ton ordinateur était éteint 4 soirs sur les 5 derniers. Il est allumé d'habitude de
   23:00 à 00:30. » + « Changer mon créneau » (ouvre « Créneau de republication »), éventuellement pré-rempli :
   MÊME durée, MÊMES jours (cadence inchangée). Ce sont des faits passés (heures constatées) — pas une estimation.
   Limite : un créneau ne passe pas minuit (`:1208`) ; chez grizstyle la présence régulière (23:00–00:30) ne
   contient pas 75 minutes avant minuit → proposer 22:45–23:59 serait hors de sa présence habituelle : plutôt
   ouvrir le réglage sans pré-remplir (à trancher).
4. La pause passe avant : file en pause → on dit la pause (D4), jamais le créneau.
5. Aucun mail (un mail = ordre de Nico).

---

## 4. Selftests « verrou »

### `selftest:file-pause-dite` (nouveau, `scripts/file-pause-dite-selftest.mjs`) — ROUGE aujourd'hui, VERT après D1+D2
1. `_shared/pause-dite.js` existe et exporte `texteSousPause`, `texteApresReprise`, `MESSAGE_PUBLICATION_EN_PAUSE`
   (rouge aujourd'hui : module absent).
2. **Rejeu grizstyle** : 25 publications + 63 republications `pending`, `error null`, pause active → 88 textes
   (aujourd'hui, la règle `:3092-3094` en donne 0).
3. **Rejeu 7b9d8a71** : 22 sans texte → écrits ; 19 « En pause à ta demande » → rien ; 19 « En pause, rien n'a été
   retiré : l'annonce Leboncoin n° … » → gardés (texte explicatif).
4. Textes d'attente remplacés : « En file : … », `messageRetenueCreneau`, `messageRetenueLotCreneau`.
   Jamais : un retrait, une tâche `processing`, une republication `deleted` ou suppression envoyée.
5. Reprise : republication → `MESSAGE_EN_FILE`, publication → `null`.
6. Structure de `get-pending-jobs` : le bloc pause appelle `texteSousPause`, borne 200, `.eq("status","pending")`,
   et il est AVANT le bloc du créneau (`indexOf`) ; la reprise traite les deux textes.
7. App : `EcranSuivi.jsx` `ctxBarre` porte `filePause` ; suivi du lot idem ; `messagesServeur.js` traduit le texte.
8. `selftest:aucune-estimation` reste vert (aucune heure dans les textes).

### `selftest:creneau-hors-presence` (nouveau, après décision D5)
Rejeu grizstyle (créneaux 11 → 15/11, heures 23:00–00:30) → « 4 sur 5 », présence dite, aucune proposition qui
passe minuit ; un compte dont le PC couvre son créneau → rien ; file en pause → la pause d'abord.

### À relancer
`lot-f-3110` (adapté), `lot-2210-soir`, `etat-job`, `file-des-jobs`, `lot-manuel-creneau`,
`republication-retenue-dite`, `creneau-remplace-les-sautes`, `aucune-estimation`, puis la suite complète.

---

## 5. Ce qui demande une décision de Nico
1. **Le cas grizstyle** : rien à réparer en base, et ne PAS reprendre sa file à sa place (c'est son geste). Lui dire
   que sa file est en pause depuis le 05/11 22:25 et qu'il suffit de « Reprendre » (Stock) — par mail seulement sur
   ordre (`envoyer_mail_ponctuel`, simulation d'abord). Même question pour 7b9d8a71, d9a805cc, 5c438b36.
2. **D1** (écrire la pause sur les publications aussi) — recommandé.
3. **D3** : texte et geste avant le clic (avertir seulement, ou proposer « Reprendre et envoyer »).
4. **D4 optionnel SQL** (motif `_file_en_pause` dans le balayage) : touche le moteur du créneau.
5. **D5** : seuil (3 sur 5 ?), lieu (Réglages + Stock), proposition pré-remplie ou non, créneau qui passe minuit
   (non géré aujourd'hui). La cadence elle-même n'est pas touchée.

## 6. Fichiers de travail
`.tmp-terminal/p5/q0.sql` … `q28.sql`, `logs-1511.txt` (journaux du 15/11), ce rapport.
