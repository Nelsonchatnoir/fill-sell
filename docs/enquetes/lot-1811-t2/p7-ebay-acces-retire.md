> Annexe du rapport du lot T2 du 18/11 (docs/enquetes/lot-1811-t2/RAPPORT.md) : enquête de l'agent, copiée telle quelle,
> noms, pseudos et adresses remplacés par l'id8 du compte ou un repère (règle « données de clients »).

# Point 7 (18/11/2026) : accès eBay révoqué (`invalid_grant`), cause et reprise après reconnexion

Enquête en lecture seule : aucune écriture en base, aucun appel eBay, aucun déploiement. Heures de Paris.
Requêtes rejouées avec un fichier SQL à moi (`-f`), donc à l'abri du mélange de `_q.sql`.

## 0. En bref
- **La cause vient d'eBay, pas de FillSell.** eBay coupe le jeton de renouvellement quand le compte change son
  **pseudo** (identifiant de connexion) ou son **mot de passe**, quand la personne retire l'accès dans « Mon eBay », ou
  quand le service client d'eBay le retire. Source : eBay KB 5218, « User authentication invalidated unexpectedly ».
- **f5fab0e0 : le renommage du compte est PROUVÉ.** À 13:08:04 (GetUser), le compte s'appelait `<pseudo-18>`. À
  15:07, eBay montrait `<pseudo-19>` pour ses 5 annonces (lecture Browse avec le jeton applicatif). C'est le même compte
  eBay (même EIAS). Le premier renouvellement, à 15:06:07, a été refusé (`invalid_grant`).
- **Sur les 15 comptes révoqués aujourd'hui :**
  - renommage prouvé pour 2 ;
  - renommage exclu pour 2 (autre cause côté eBay : mot de passe, Mon eBay, service client) ;
  - aucune donnée pour les 11 autres.
- **Hypothèses côté FillSell écartées, preuves à l'appui** (§3).
- **Ce que FillSell fait mal autour de la révocation (la règle à corriger) :**
  1. Une tâche arrêtée sur le jeton ne repart jamais seule : elle n'a aucune source ré-armable. f5fab0e0 a dû la
     relancer à la main à 15:54.
  2. `ebay-oauth-callback` ne relance rien à la reconnexion.
  3. Un compte révoqué voit ses publications parquées « compte bien relié… à finir ». Ce message est faux.
  4. Un compte **renommé** est pris pour un « AUTRE compte eBay » : ses réglages sont effacés, et ses annonces passent
     pour celles d'un autre compte, ce qui bloque leur retrait (risque de double vente).
  5. La révocation n'est ni journalisée ni gardée (l'historique est effacé à la reconnexion).
  6. Une révocation périmée peut écraser une reconnexion toute fraîche.
- **Tâches bloquées aujourd'hui pour cette raison : 0.** Le correctif est préventif (détail au §4).

## 1. Les comptes révoqués (`ebay_accounts.revoked_at` non nul : 15 au 18/11 20:47 ; les « 14 » + <pseudo-17> à 17:29 aujourd'hui)

Où est tracé `invalid_grant` : seulement dans `ebay_accounts.revoked_at` / `revoked_reason='revoque_ou_expire'`
(écrit par `_shared/ebay-oauth.ts:316-321`), sans aucun log. La reconnexion **efface** cette trace : l'upsert
remet `revoked_at` à null (`ebay-oauth-callback/index.ts:97-98`). La trace survit aussi dans le `last_diagnostic`
`{etape:'jeton', quoi:'revoque'}` du job qui a déclenché le renouvellement, s'il y en avait un, et dans le log
`[ebay-api-worker] … <job>=jeton`. Rien dans `usage_logs`. C'est pourquoi f5fab0e0 (reconnectée) n'est pas dans la
liste.

Le « dernier renouvellement réussi » est `expires_at − 2 h`. Quand il vaut la connexion + 2 h, il n'y en a eu aucun.
La « révocation » est l'heure où FillSell l'a **constatée** (premier renouvellement refusé), pas l'heure où eBay a
coupé. Les heures 05:40 / 06:41 correspondent à une passe quotidienne de 04:41 UTC. Le délai mesure donc surtout le
temps de détection.

| user (8) | pseudo à la connexion | site | connexion | dernier renouvellement OK | révocation constatée | délai | indice |
|---|---|---|---|---|---|---|---|
| 2ee21f45 | <pseudo-1> | ? | 11/09 16:23 | aucun | 19/09 13:51 | 7 j 21 h | — |
| 6aa1485c | <pseudo-2> | ? | 14/09 18:09 | aucun | 19/09 13:51 | 4 j 20 h | — (même seconde que le précédent : une passe groupée) |
| e847ef68 | <pseudo-3> | ? | 28/09 11:49 | aucun | 28/09 16:24 | 4 h 35 | job publish arrêté au jeton, puis abandonné |
| 52f28d53 | <pseudo-4> | ? | 07/10 15:40 | 08/11 05:40 | 09/11 05:40 | 32 j | — |
| 77ff2af1 | <pseudo-5> | US | 12/10 18:46 | 21/10 06:40 | 22/10 06:41 | 9 j 12 h | — |
| 00ca4ff3 | <pseudo-6> | Canada | 14/10 14:40 | aucun | 15/10 06:41 | 16 h | — |
| 7d83bc41 | <pseudo-7> | FR | 15/10 10:05 | aucun | 16/10 06:20 | 20 h | — |
| 9a365d8e | <pseudo-8> | FR | 17/10 10:02 | 17/10 12:05 | 18/10 06:41 | 20 h 39 | **pas renommé** (Browse 24/10 : <pseudo-8>) |
| fd7bf936 | <pseudo-9> | FR | 23/10 21:24 | 29/10 05:40 | 29/10 13:30 | 5 j 16 h | **RENOMMÉ** → <pseudo-10> (Browse, mêmes 9 annonces, dès le 03/11) |
| a3470a37 | <pseudo-11> | US | 26/10 02:46 | 26/10 05:41 | 26/10 23:00 | 20 h 14 | **RENOMMÉ** → <pseudo-12> (même EIAS, relié le 26/10 07:46 sur un 2e profil FillSell, bdbb36ef) |
| 90d11dae | <pseudo-13> | FR | 27/10 09:54 | aucun | 28/10 05:41 | 19 h 47 | — |
| 9f64d78e | <pseudo-14> | US | 27/10 11:23 | 29/10 05:41 | 29/10 23:50 | 2 j 12 h | — |
| 990472c9 | <pseudo-15> | FR | 03/11 07:54 | aucun | 04/11 04:10 | 20 h 15 | **pas renommé** (Browse 17/11 : <pseudo-15>) |
| 12f7b8c5 | <pseudo-16> | FR | 05/11 22:42 | 08/11 11:10 | 09/11 05:41 | 3 j 7 h | — |
| 010ff35b | <pseudo-17> | FR | 07/11 19:53 | 18/11 05:42 | 18/11 17:29 | 10 j 22 h | stampé sans aucun log : appelant inconnu |
| *f5fab0e0* | *<pseudo-18>* | FR | *16/11 13:08* | *aucun* | *16/11 15:06* | *1 h 58* | ***RENOMMÉ*** *→ <pseudo-19> ; reconnectée à 15:52* |

- **Reconnexions depuis la révocation : 0 pour les 15** (sinon `revoked_at` serait nul). Les connexions plus anciennes
  ne se comptent pas : un seul jeton est gardé, et les logs remontent au 11/11.
- **Autre trace : 6eb8400b (tech-tcg)** a été révoqué vers le 07/10 (2 retraits arrêtés au jeton, puis clos
  « retrait introuvable ») et s'est reconnecté le 25/10.
- **Profil des 15 :** 12 pseudos sur 15 ont la forme générée par eBay à l'inscription (`nom_1234`, `abc-0`), contre
  ~49 % chez les 243 comptes sains. Ce sont des comptes eBay neufs, qui personnalisent souvent leur pseudo. C'est un
  indice, pas une preuve.
- **Sites :** les sites étrangers sont sur-représentés (US 3/20, Canada 1/1, contre France 7/215).

### f5fab0e0 (f5fab0e0), minute par minute le 16/11 (logs edge `function_logs`)
- 13:04 : inscription FillSell.
- 13:06:14 : `ebay-oauth-start`.
- 13:08:03 : callback, jetons obtenus (access 7 200 s, refresh 47 304 000 s, `env=production`). GetUser renvoie
  `<pseudo-18>`, EIAS lu, site France ; `comptes_plateformes` est écrit (« inseree ») à 13:08:04 ;
  `ebay_voie_api=true` ; abonnement ORDER_CONFIRMATION.
- 13:08 → 13:32 : statut, checklist, `activer_politiques`, création de la livraison, du paiement et des retours.
- 14:15:33 → 14:18:15 : 5 publications par l'API, réussies avec le jeton d'accès de 13:08 (aucun renouvellement).
  `ebay_vendeurs_annonces` les note sous **<pseudo-18>** (pseudo lu en base).
- 14:16 → 15:04 : statut / checklist / livraison mise à jour (rien vers l'endpoint de jeton).
- 15:01:43 : `ebay-releve-api` voit « 5 en ligne » ; le jeton d'accès est encore valable jusqu'à 15:08:03.
- 15:05:35 : création du job e9b08d45 (publish).
- **15:06:07** : `ebay-api-worker` « e9b08d45=jeton ». Le jeton d'accès expire à 15:08:03 ; avec la marge de 120 s, c'est
  le **tout premier** renouvellement depuis la connexion. eBay répond `invalid_grant`, `revoked_at` est posé, et le job
  passe en needs_user « eBay a retiré l'accès… puis relance », **sans source**.
- **15:07** : `releve-completer` lit les 5 annonces par Browse (jeton applicatif). Vendeur : **<pseudo-19>**. Le
  renommage est donc fait entre 13:08:04 et 15:07.
- 15:51:24 : `ebay-oauth-start`.
- 15:52:42 : callback. GetUser renvoie `<pseudo-19>`, et le log dit « AUTRE compte eBay que le précédent
  (@<pseudo-18> → @<pseudo-19>) — politiques, état vendeur et lieu d'expédition remis à zéro ». Or la ligne
  `comptes_plateformes` de 13:08 (clé = EIAS) est **égale** à l'EIAS écrit à 15:52, et aucune 2e ligne n'existe. C'est
  donc le même compte, renommé : un **faux positif**.
- 15:53:28 → 15:53:49 : elle re-choisit à la main les 3 politiques effacées.
- **15:54:17 : relance MANUELLE** de e9b08d45 (`erreurs_archivees[].par = "relance_manuelle"`), publiée à 15:56:22.
  La reprise n'a pas été automatique.
- Reste en base aujourd'hui : les 5 annonces de 14:16-14:18 sont toujours notées vendeur `<pseudo-18>` dans
  `ebay_vendeurs_annonces`. Le relié est maintenant `<pseudo-19>`, donc `annonceDUnAutreCompte` (worker
  `index.ts:4288-4300`, utilisé au retrait `:2730`) les prend pour celles d'un autre compte. **Un retrait après une
  vente ailleurs serait refusé** avec un message faux : risque de double vente sur ces 5 annonces en ligne.

## 2. Le code (fichier:ligne)
- **Pas de verrou** contre deux renouvellements simultanés (`_shared/ebay-oauth.ts:288-326`).
  - C'est sans danger pour eBay : le renouvellement ne renvoie pas de nouveau refresh_token, eBay ne le fait pas
    tourner. Preuve : 47 des 54 comptes reliés avant octobre renouvellent encore avec leur refresh_token d'origine, et
    227 des 243 l'ont fait ces 2 derniers jours, alors que 9 fonctions le renouvellent en parallèle.
  - `refresh_token` n'a qu'**un seul** écrivain : le callback (`ebay-oauth-callback/index.ts:92`). Aucun « jeton écrasé
    par un plus ancien » n'est possible.
- **À l'arrivée d'`invalid_grant`** (`ebay-oauth.ts:315-323`) :
  - `revoked_at` est posé, `access_token` vidé, **sans aucun log** ; le `error_description` d'eBay est jeté ;
  - tout autre 400/401 (`invalid_client`, `invalid_scope`…) est AUSSI traité comme une révocation (`:316`) ;
  - les écritures (`:309` et `:317-321`) ne filtrent que sur `user_id`. Un renouvellement lancé avec l'ANCIEN
    refresh_token, lu avant une reconnexion, peut donc re-révoquer la connexion neuve.
- **Ce que deviennent les jobs :**
  - `ebay-api-worker/index.ts:4590-4597` : publish/republish/delete → `needs_user` « … reconnecte-le dans les
    Paramètres, puis relance. », **sans `needs_user_source`**. Seule `refresh_echoue` renvoie en pending.
  - `index.ts:4568-4574` → `_shared/ebay-releve-compte.ts:192-217` : une publication suivante d'un compte révoqué donne
    `usable=false` et `aFinir=null` (`ebay-voie.ts:93-94` renvoie null si révoqué). Elle est parquée
    `ebay_compte_a_finir` avec `MESSAGE_EBAY_COMPTE_A_FINIR` (`ebay-voie.ts:46-49`), « Ton compte eBay est bien relié
    à FillSell… » : **faux**.
  - Nouvelles tâches pendant la révocation : le trigger `cross_post_jobs_voie_ebay` (corps lu en prod) laisse
    `voie='extension'` (`v_ok = revoked_at IS NULL`). Un client Cloud passe ensuite « ebay_a_relier_cloud »
    (handler-watch, levé seul tous les 15 min), les autres passent par le mur extension « ebay_connexion_requise ».
- **À la reconnexion** (`ebay-oauth-callback/index.ts`) :
  - l'upsert remet `revoked_at`/`revoked_reason` à null (`:97-98`, `:125`), et réécrit `connected_at` ;
  - il compare l'identité « pseudo OU EIAS différent ⇒ autre compte » (`:112-115`) : un renommage efface donc les
    politiques, l'état vendeur et le lieu d'expédition (`:116-119`) ;
  - **aucun ré-armement** des tâches. Le seul appel est indirect, dans `rouvrirPublicationsEbayHorsFrance` quand
    `n > 0` (`_shared/ebay-reouverture.ts:76`).
  - La reprise ne dépend donc que d'un geste dans l'app : `ebay-account` `statut`/`checklist`/politiques
    (`ebay-account/index.ts:319-322, 488-491, 601-604, 830`) appellent `rearmerJobsEbayConnexionSiUtilisable`. Celui-ci
    ne relance que `ebay_connexion_requise` et `ebay_compte_a_finir` (`ebay-voie.ts:43`, `:215-249`).
  - Une tâche arrêtée au jeton (sans source) reste donc **bloquée pour toujours** : il faut une relance manuelle.
  - `relireComptesEbayAFinir` (`worker index.ts:252-296`) ne relit que `ebay_compte_a_finir`, et saute les comptes
    révoqués (`:276`).

## 3. Cause : ce qui est prouvé, ce qui ne l'est pas
- **Prouvé (f5fab0e0, puis a3470a37 et fd7bf936)** : un renommage du compte eBay, même EIAS, précède le refus du
  renouvellement. eBay documente ce cas comme cause de révocation (KB 5218 : « If a user changes their eBay member
  log-in name or the password »).
- **Non-renommage prouvé** pour 9a365d8e et 990472c9. Leur cause est un autre geste côté eBay (mot de passe, Mon eBay,
  service client), que nos données ne permettent pas de distinguer.
- **Écarté par les données :**
  - Deux renouvellements concurrents : pas de rotation (voir §2).
  - refresh_token écrasé : un seul écrivain.
  - Scope : les 15 ont exactement `invalid_grant`, pas `invalid_scope`.
  - Sandbox/production mélangés : tous les callbacks loguent `env=production`, et 227 comptes renouvellent
    normalement.
  - Suppression de compte eBay : 1 seul effacement par `ebay-account-deletion` depuis septembre, et les 15 lignes
    existent.
  - 2e consentement :
    - le même compte eBay n'est relié qu'à une seule paire de profils (a3470a37/bdbb36ef), et c'est un renommage ;
    - f5fab0e0 n'a fait qu'un seul consentement avant 15:06 ;
    - des comptes qui ont fait deux callbacks à quelques minutes d'écart (le 18/11 encore) restent sains.
  - Limite eBay de jetons : aucun signe.
- **Ce qui donnerait la preuve pour les 11 autres :**
  - le `error_description` d'eBay et un log au refus (correctif C) ;
  - la comparaison EIAS/pseudo journalisée à leur reconnexion (correctif A) ;
  - ou, pour ceux qui ont des annonces, une lecture Browse (jeton applicatif, lecture seule) du vendeur actuel d'une
    annonce.

## 4. Les tâches bloquées aujourd'hui, et la reprise automatique
**Recensement du 18/11 ~20:45.**
- Tâches arrêtées au jeton (`last_diagnostic.etape='jeton'`) encore ouvertes : **0**. Il y en a eu 4 depuis
  septembre : e847ef68 (abandonnée), 6eb8400b ×2 (closes), f5fab0e0 (relancée à la main).
- Tâches ouvertes des 15 comptes révoqués : **1**. 00ca4ff3, un retrait `voie='extension'` en pending depuis le 14/10,
  « En attente de ta connexion à eBay dans Chrome » : article vendu, annonce peut-être encore en ligne. Ce n'est pas
  une attente de jeton (voie extension, compte Canada), mais c'est à signaler à Nico.
- Pour comparer : `ebay_connexion_requise` ×2 (un compte jamais relié, depuis le 04/11), `ebay_a_relier_cloud` ×1
  (jamais relié, 16/11), `ebay_compte_a_finir` ×6 (4 comptes reliés). Les règles existantes lèvent déjà ces attentes à
  la liaison.

**Correctif proposé (règle pour tous les comptes ; cadence de republication intacte : eBay est hors republication
depuis le 17/09, et on remet seulement en file ce qui attendait la reconnexion).**

### A. Nouveau module pur `supabase/functions/_shared/ebay-reconnexion.js`
- `memeCompteEbay(avant, identite)` :
  - si l'**EIAS** est connu des deux côtés, il décide : même EIAS = même compte, `renomme = pseudo différent` ;
  - le pseudo ne compte que si l'EIAS manque d'un côté ;
  - rien de connu → `null`.
- `ecritureJetonRefuse(job, { motif, detail })` (pure) :
  - `revoque` / `non_connecte` → `needs_user`, avec `needs_user_source = SOURCE_EBAY_CONNEXION_REQUISE` (ré-armable,
    même bouton « Connecte ton compte eBay » dans l'app, `StockTab.jsx:481`) et la marque
    `ebay_acces_retire: { le, motif }` ;
  - message : « eBay a coupé l'accès de FillSell à ton compte eBay — cela arrive quand on change son pseudo ou son mot
    de passe eBay, ou qu'on retire l'accès depuis « Mon eBay ». Reconnecte-le dans Réglages › Mes plateformes › eBay :
    cette tâche repartira toute seule. Rien n'a été envoyé à eBay. » (plus de « puis relance ») ;
  - `refresh_echoue` → `pending`, comme avant ;
  - autres motifs → `needs_user` sans source (comportement d'avant).

### B. `ebay-oauth-callback/index.ts`
1. **`:108-121` (identité)**
   - Avant : `if (memePseudo === false || memeEias === false) { …remise à zéro… }`
   - Après :
     - `const id = memeCompteEbay(a, identite); if (id.meme === false) { …remise à zéro (inchangée)… }` ;
     - si `id.renomme`, on journalise « même compte eBay (EIAS), pseudo renommé @x → @y : réglages gardés » ;
     - après l'upsert, `ebay_vendeurs_annonces.vendeur` passe de l'ancien pseudo au nouveau, pour les seules annonces
       eBay de ce user (lots de 100, ligne inchangée jamais réécrite).
   - Le select `:110` lit aussi `revoked_at, revoked_reason` (pour la trace).
2. **Après la ligne `:159` et avant `return retour("ok")` `:186` (reprise)**
   - `const n = await rearmerJobsEbayConnexionSiUtilisable(admin, userId)` : best-effort, jamais bloquant.
   - Log : `[ebay-oauth-callback] reconnexion … : n tâche(s) eBay reparties seules`.
   - `usage_logs` reçoit une ligne `feature 'ebay_reconnexion'`, avec `{ revoque_le, motif, meme_compte, renomme }`
     (table existante, aucune migration).
   - Pas de nouvel import pour le bundle : `ebay-voie.ts` est déjà tiré par `ebay-reouverture.ts`.

### C. `_shared/ebay-oauth.ts:307-325` (`obtenirAccessToken`)
- Les deux `update` portent `.eq("refresh_token", compte.refresh_token)`, et la révocation porte en plus
  `.is("revoked_at", null).select("user_id")`. Un renouvellement périmé ne peut plus révoquer ni écraser une
  reconnexion neuve.
- Seul `json.error === "invalid_grant"` révoque.
  - Tout autre 400/401 est une faute de NOTRE requête ou de nos identifiants : motif `refresh_refuse`, ligne intacte,
    job en needs_user « Jeton eBay indisponible (…) », sans boucle.
  - Aujourd'hui, un `invalid_client` révoquerait les 243 comptes d'un coup.
- Log `console.warn("[ebay-oauth] accès refusé par eBay user=… : invalid_grant « <error_description, 120 car.> » (relié le …)")`.
- `usage_logs` reçoit une ligne `feature 'ebay_acces_refuse'`, avec `{ description, connecte_le, pseudo,
  appelant }`. C'est l'historique que l'upsert efface aujourd'hui (aucun jeton n'y figure).

### D. `ebay-api-worker/index.ts`
- **`:4590-4597`** : `const w = ecritureJetonRefuse(job, { motif: jeton.motif, detail: jeton.detail })`, puis
  `job.platform_fields = w.platform_fields`, puis
  `marquer(admin, job, { status: w.status, error: w.error }, { etape: "jeton", … })`.
- **`:4568-4574`** :
  - `etatCompteEbayApiFrais` (`ebay-releve-compte.ts:217`) renvoie en plus `revoque: ligne?.revoked_at != null` ;
  - si `!usable && revoque`, on pose `ecritureJetonRefuse(job, { motif: "revoque" })` au lieu de « compte à finir » ;
  - on garde les 2 appels `await etatCompteEbayApiFrais(admin, env, (j|job).user_id)` que verrouille
    `selftest:ebay-compte-a-finir`.
- **Filet, si le callback échoue** : une passe bornée relance les needs_user `ebay_connexion_requise` portant
  `ebay_acces_retire`, quand le compte n'est plus révoqué et que `connected_at` est postérieur à la marque.
  - Elle passe par `rearmerJobsEbayConnexionSiUtilisable` (donc seulement si le compte est prêt).
  - Lots de 100 ; aucune lecture si aucune tâche n'est marquée.
- **Reste à trancher par Nico :** `rearmerJobsEbayConnexionSiUtilisable` exige un compte « prêt » (3 politiques), y
  compris pour un **retrait**. Avec B.1, un compte renommé garde ses politiques et repart aussitôt. Un vrai changement
  de compte attend que ses politiques soient choisies. Faut-il laisser partir les retraits sans politiques ?

### E. Réparation de données (proposée, NON faite)
- `scripts/reparations/` : les 5 lignes `ebay_vendeurs_annonces` de f5fab0e0 passent de `<pseudo-18>` à
  `<pseudo-19>`, avec sauvegarde `_backup_1811_ebay_vendeur_renomme` et script inverse. Sans cela, un retrait de ces 5
  annonces en ligne est refusé à tort (« autre compte »).
- Même cas latent pour fd7bf936 (9 annonces notées <pseudo-9>) s'il se reconnecte : B.1 le traitera.

## 5. Selftest « verrou » proposé : `selftest:ebay-reconnexion-reprise`
- **Commande :** `"selftest:ebay-reconnexion-reprise": "node --import ./scripts/loader-ext.mjs scripts/ebay-reconnexion-reprise-selftest.mjs"`.
- **Style :** celui de `scripts/ebay-a-relier-cloud-selftest.mjs` (fonctions pures importées, plus structure lue dans
  les sources). Pseudos fictifs, aucun nom de compte (`selftest:donnees-clients`).
- **A. Identité :**
  - même EIAS, `pseudo_auto_1234` → `maboutique78` : `meme=true`, `renomme=true` (avant : « AUTRE compte ») ;
  - EIAS différents : `meme=false` ;
  - EIAS inconnu d'un côté et même pseudo : `true` ;
  - rien de connu : `null`.
- **B. Écriture :**
  - `revoque` donne une source ∈ `SOURCES_EBAY_REARMABLES` (import de `_shared/ebay-voie.ts`), un message sans
    « puis relance » qui contient « toute seule » ;
  - `refresh_echoue` donne `pending`.
- **C. Simulation, avec un faux `admin` en mémoire, de `rearmerJobsEbayConnexionSiUtilisable` :**
  - job écrit par `ecritureJetonRefuse`, compte révoqué : 0 job relancé ;
  - compte reconnecté (`revoked_at` null, 3 politiques, état vendeur prêt) : le job passe `pending`, `voie='api'`,
    source retirée, `ebay_connexion_resolue_le` posé ;
  - un job sorti de `needs_user` entre-temps n'est pas touché.
- **D. Structure :**
  - le callback appelle `rearmerJobsEbayConnexionSiUtilisable(admin, userId)` APRÈS l'upsert et AVANT
    `return retour("ok")` ;
  - plus de `memePseudo === false || memeEias === false` ;
  - `ebay-oauth.ts` : les deux updates portent `.eq("refresh_token", compte.refresh_token)`, seul `invalid_grant`
    révoque, et `[ebay-oauth] accès refusé` est logué ;
  - worker : `ecritureJetonRefuse(` apparaît dans la branche jeton et dans le parcage d'un compte révoqué, et plus aucun
    « puis relance » dans la branche jeton.
- **Rouge avant :** `_shared/ebay-reconnexion.js` est absent, donc l'import échoue, et les assertions D sont fausses.
  **Vert après.**
- **Régression à reprendre dans le même lot :** `scripts/ebay-changer-compte-selftest.mjs:31` teste le texte exact
  `if (memePseudo === false || memeEias === false) {`. Il passera au rouge avec B.1 : remplacer par
  `if (id.meme === false) {` (l'intention, « comparer avant d'écrire, remettre à zéro si autre compte », reste
  vérifiée). `selftest:ebay-compte-a-finir` (2 appels à `etatCompteEbayApiFrais`) et `selftest:ebay-refus-compte`
  (décision du mur avant `const jeton = await obtenirAccessToken(admin, job.user_id);`) restent verts si D garde ces
  lignes.

## 6. Déploiement (lu par `npx supabase functions list` le 18/11 ~20:50)

Fonctions modifiées directement :

| fonction | version actuelle | verify_jwt | commande |
|---|---|---|---|
| ebay-oauth-callback | v27 | false | `--no-verify-jwt` (garde = state HMAC) |
| ebay-api-worker | v135 | false | `--no-verify-jwt` (cron, garde maison) |

`_shared/ebay-oauth.ts` (C) n'agit que dans les fonctions qui le regroupent et renouvellent un jeton. Chacune garde
l'ancien comportement tant qu'elle n'est pas redéployée :

| fonction | version actuelle | verify_jwt |
|---|---|---|
| ebay-account | v44 | **true** |
| ebay-messagerie | v21 | false |
| ebay-notifications | v20 | false |
| ebay-releve-api | v22 | false |
| ebay-ventes-sync | v24 | false |
| remise-ordre-photos-ebay | v10 | **true** |
| handler-watch | v210 | false |
| get-pending-jobs | **v386** | **true** |

- handler-watch et get-pending-jobs tirent `ebay-site.ts`, qui renouvelle aussi un jeton.
- get-pending-jobs est en v386, alors que l'état du 17/11 dit 385 : à relire avant tout déploiement.
- On relit la version et `verify_jwt` AVANT et APRÈS chaque déploiement.

**Aucune migration** (`usage_logs` existe ; on réutilise la source `ebay_connexion_requise`). La réparation E se fait
par `scripts/reparations/`. Pas d'OTA ni d'extension. Option app, facultative : `EbayCompteSection` peut dire la même
cause probable sur « à reconnecter ».

Sources : eBay KB 5218 « User authentication invalidated unexpectedly »
(https://developer.ebay.com/support/knowledge-base/5218) ; eBay « OAuth best practices »
(https://developer.ebay.com/api-docs/static/oauth-best-practices.html, cité par la recherche, page non lisible
directement).

## 7. Implémentation (18/11, soir) : A, B, C, D codés, E préparé (non joué)

Rien n'est commité ni déployé, rien n'est écrit en base, aucun appel eBay.

**Fichiers neufs :**
- `supabase/functions/_shared/ebay-reconnexion.js` : la règle pure (`memeCompteEbay`, `verdictRenouvellement`,
  `descriptionEbaySure`, `ecritureJetonRefuse`, `repriseApresReconnexionDue`) et un seul geste en base, borné
  (`renommerVendeurAnnoncesEbay`).
- `scripts/ebay-reconnexion-reprise-selftest.mjs`.
- `scripts/reparations/20261118_ebay_vendeur_renomme_f5fab0e0{_SAUVEGARDE,,_INVERSE}.sql` (ignorés par `*.sql` :
  il faudra `git add -f`).

**Fichiers modifiés :**
- `_shared/ebay-oauth.ts` : `obtenirAccessToken`, à partir de la ligne 311.
- `_shared/ebay-releve-compte.ts` : `revoque`.
- `ebay-oauth-callback/index.ts` : lignes 126, 152, 192, 199.
- `ebay-api-worker/index.ts` : filet `:326`, appel `:4538`, parcage d'un compte révoqué `:4667`, branche jeton `:4702`.
- `scripts/ebay-changer-compte-selftest.mjs`.

**Écarts par rapport au §4 :**
- Le filet ne re-parque PAS « compte à finir » un compte reconnecté mais pas prêt. La règle du 14/11 (jamais un
  parcage sur un état non relevé) est verrouillée par `selftest:ebay-compte-a-finir` et
  `selftest:ebay-retours-obligatoires`. Une telle tâche garde le message « reconnecte » jusqu'à ce que le compte soit
  prêt : question pour Nico, avec la décision D.
- `etatCompteEbayApiFrais` relit la ligne quand son propre renouvellement vient d'être refusé.
- `obtenirAccessToken` ne re-révoque pas une connexion neuve : si la reconnexion a eu lieu pendant le renouvellement,
  il rend `refresh_echoue` (en file).

**Résultats :**
- Verrou : rouge avant (57 échecs, sortie `verrou-avant.txt`), vert après (58/58, `verrou-apres.txt`).
- 55 selftests eBay du package.json : 55 verts.
- `selftest:donnees-clients` vert.
- `deno check` : callback 0 erreur, ebay-account 0, worker 1 seule erreur, qui existait déjà (ligne 179 = ligne 164
  de HEAD, zone non touchée).
- `eslint` des fichiers JS neufs : 0.
