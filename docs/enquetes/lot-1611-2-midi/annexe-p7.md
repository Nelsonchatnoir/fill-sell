# Point 7 — Historique des ventes Beebs (noubliejamais, 2c89e573, Pro) — diagnostic en lecture seule

Lundi 16/11/2026, heure de Paris. Aucune écriture en base, aucun fichier du dépôt touché, aucun git qui écrit, aucune
requête vers Beebs. Fichiers de travail : `.tmp-terminal/p7/` (requêtes `q1.sql` … `q29.sql`, définitions de prod
copiées depuis `pg_get_functiondef` : `*.prod.sql`, démonstration `demo-rouge.mjs`). Arbre git : propre au départ ;
pendant l'enquête, un autre terminal modifie `package.json`, `src/App.jsx`, `src/cloud/*`, `src/entree/*` et crée `scripts/achat-formule-issue-vraie-selftest.mjs`, `src/cloud/issueAchatJournal.js` : pas touchés.

---

## 0. En bref

- **Aujourd'hui, aucune vente Beebs n'entre JAMAIS dans `ventes` par une lecture** : 0 vente Beebs relevée dans tout le
  parc (19 ventes Beebs, 12 comptes, toutes saisies ou déclarées ; 0 avec un numéro de commande — q17). La chaîne Beebs
  existante (`commandes_beebs_noter`) n'est PAS un import d'historique : c'est une PREUVE de vente posée sur une tâche
  FillSell publiée (même numéro de produit), pour retirer les copies ailleurs. Une commande dont le produit n'a pas de
  tâche FillSell = `sans_job` = rien, même interrupteur à 1. Rallumer `ventes_beebs_commandes` n'importerait donc
  RIEN de l'historique de noubliejamais (ses 6 produits sont inconnus de FillSell — q24).
- **« 5 commandes » = une coupe du lecteur, pas de Beebs** : la page « Ventes » est lue en UNE requête et porte les
  commandes complètes ; le lecteur n'en garde que 5 (`COMMANDES_DETAILS_MAX = 5`, `messagerie.js:89`, appliqué à
  TOUTES les commandes `messagerie.js:1538`), toujours les 5 plus récentes sur la voie « ventes » (aucune rotation).
  Prouvé : (a) faf5021a, lu par la voie messagerie (qui tourne), a montré 18 commandes distinctes (07/2023 → 02/2026)
  sur la MÊME page, 5 par passage, en boucle (q14) ; (b) démonstration sur le code actuel : 18 commandes sur la page,
  1 requête, 5 rendues (`demo-rouge.mjs`).
- **Le 403** : refus anti-robot de Beebs (DataDome) dans l'ONGLET Beebs de la personne, sur la requête de l'extension
  **0.6.186** (servie au Chrome Web Store) : `fetch("/fr/account/orders/list/seller", { headers: { RSC: "1" },
  cache: "no-store" })`. Pas un jeton, pas un cookie, pas le serveur. La forme qui passe (« la page comme une page »)
  est dans la 0.6.187+, jamais servie : 67 comptes Beebs sont en 0.6.186, la 0.6.191 attend son téléversement.
- **Il faut changer l'extension (0.6.192)** et ajouter une fonction serveur (migration). Le serveur ou l'app seuls ne
  peuvent pas lire Beebs (403 DataDome sur les serveurs, règle du 24/10 ; l'app n'a pas la session Beebs).
- **Un import d'historique peut être muet par construction** : source `releve` + date de commande de plus de 48 h ⇒ le
  déclencheur de notes `push_trg_ventes('releve')` sort à sa 1re ligne ; aucune écriture de tâche ni de fiche ⇒ ni
  retrait, ni job, ni mail.

---

## 1. Comment l'historique Vinted et Leboncoin est importé aujourd'hui

**Qui lit** : l'extension Chrome, dans un ONGLET de la plateforme (monde MAIN, cookies de la personne), jamais le service
worker ni le serveur (`background.js:21134-21136` : « Tout part d'un ONGLET de la plateforme … DataDome l'exige »).
Porte d'injection : `executerDansOngletPlateforme` (`background.js:21259`, garde 45 s).

**Quand** : `releverVentesQuotidien` (`background.js:21846`) après le relevé de stock quotidien, cadence 20 h
(`VENTES_CADENCE_MS`, `:21142`), plateformes `VENTES_PLATEFORMES = ["vinted","leboncoin","opla"]` + depop
(`:21139-21141`) — **pas Beebs**. Orchestration : `lancerReleveVentes` (`:21638`), fermée si `sync_multi_ouverte` est
fermé, sautée pour un compte Cloud (le poste Cloud relève).

**Quoi** :
- Vinted : `GET /api/v2/my_orders?type=sold&page=N&per_page=100` (`:21335`), puis le détail
  `/api/v2/transactions/{id}` (`:21390`) pour le numéro d'annonce, 64 par passage, 8 par injection.
- Leboncoin : `GET api.leboncoin.fr/api/consumergoods/proxy/v3/pages/transactions?created_at[lt]=<curseur>&limit=100&user_kind=seller`
  (`:21488`), pagination par date (keyset), jeton `luat` de la page ; le prix est en CENTIMES (÷100) ; détail
  `/v2/pages/transactions/<n°>` pour le numéro d'annonce (16 par passage) ; 403/429 arrête le paquet.

**Pagination** : borne dure 40 pages (`VENTES_PAGES_MAX`, `:21191`) ; arrêt à la première page entièrement connue
(`:21363`, `:21518`) — les références déjà en base sont relues par pages de 1 000 (`refsVentesConnues`, `:21278`). Le 1er
passage d'un compte remonte donc tout l'historique (≤ 4 000 ventes), les suivants s'arrêtent à la 1re page connue.

**Comment les lignes arrivent dans `ventes`** : UNE porte, la RPC `enregistrer_ventes_relevees(p_platform, p_rows)`
(`envoyerVentesRelevees`, `:21296`). Définition de prod (`.tmp-terminal/p7/enregistrer_ventes_relevees.prod.sql`) :
- plateformes acceptées `vinted, leboncoin, ebay, opla, depop` — **Beebs refusée** (ligne 33) ;
- compte Cloud actif : rien n'est écrit depuis un autre poste (`ecriture_poste_hors_cloud`, l. 44) ;
- comptes reliés : une commande déjà chez le compte relié n'est jamais écrite deux fois (l. 78-106) ;
- une vente SUPPRIMÉE par la personne ne revient jamais (`ventes_supprimees`, l. 122-128) ;
- statut classé (`ventes_statut_classe`) : annulée / en cours = pas de vente (l. 130-193) ;
- fiche : par NUMÉRO d'annonce seulement (inventaire.vinted_item_id, annonces_plateforme, cross_post_jobs ;
  `rapprocher_classer` appelé avec un TITRE VIDE, bandes `job`/`job_clos` seules — l. 209-255) ;
- « même cession » : une vente saisie unique sur la même fiche est COMPLÉTÉE au lieu d'être doublée (l. 304-382) ;
- sinon `INSERT INTO ventes (…, source = 'releve', …) ON CONFLICT (user_id, plateforme_code, commande_ref) DO UPDATE`
  qui ne remplit que les cases vides (l. 384-413) ; index unique `ventes_commande_unique` (q19).
- Ce qu'elle ne fait JAMAIS : ni job, ni retrait, ni bascule de `inventaire.statut` (seul `prix_vente` d'une fiche DÉJÀ
  « vendu » et vide est complété, l. 450-458). En-tête du code : « ni job, ni retrait d'annonce, ni unité consommée, ni
  quota, ni e-mail, ni bascule de inventaire.statut » (`background.js:21128-21131`).

**Ce qui empêche push/mail sur l'historique** (q5, `.tmp-terminal/p7/push_trg_ventes.prod.sql`) : sur `ventes`, le
déclencheur `ventes_push_releve AFTER INSERT … WHEN (new.source = 'releve') EXECUTE FUNCTION push_trg_ventes('releve')`.
Sa 1re ligne : `if new.vendu_le is not null and new.vendu_le < now() - interval '24 hours' then return new; end if;`
(prod l. 13 ; migrations `20261105180000_mail_a_chaque_vente.sql:204`, `20261105220000…:210`). Une vente relevée de plus
de 24 h ne crée aucune note ⇒ ni push ni mail (`push-ventes` ne lit que `push_ventes`). ⚠️ Une ligne relevée SANS date
passe au test « plateforme suivie » et peut être notée : la date est obligatoire. ⚠️ Une ligne d'une autre source
(`NULL`, `manuel`…) part par `ventes_push_serveur` / `ventes_push_personne` : l'import doit garder `source = 'releve'`.
Les autres déclencheurs de `ventes` : `ventes_garde_annonce_de_la_vente` (annule un retrait en attente de 15 min sur la
plateforme de la vente — rien sans fiche liée), journaux de suppression. Aucun cron ne lit `ventes` pour écrire
(`email-tunnel` : récapitulatif supprimé le 06/10 ; `ventes_relevees_sans_annonce_rattacher` : Vinted seulement).
Effet de bord à connaître : `get-pending-jobs:15181` sert sans les 10 min d'attente un retrait de vente déjà armé
quand la fiche porte une vente avec `commande_ref` — d'où la règle « pas de fiche liée si un retrait l'attend » (§4).

Résultat chez noubliejamais (q10) : 832 ventes Leboncoin relevées (31/03/2023 → 09/11/2026), 887 Vinted relevées
(07/08/2023 → 02/11/2026), **0 vente Beebs**.

---

## 2. Le chemin Beebs actuel

### 2.1 Où vivent la lecture et `ventes_beebs_commandes`
- **Lecteur** : `lecteurCommandesBeebs(suivies, detailsMax, priorite, attendues)` (`messagerie.js:1388`), envoyé dans
  l'onglet Beebs. Il lit `GET /fr/account/orders/list/seller` (`:1456`, `:1484`), cherche les objets commande
  `{ order: { id, status, created_at, products[], amount, computed_buyer_payin }, isSale }` dans le flux de la page
  (`commandesDuFluxRsc`, `:1424` ; un achat `isSale:false` n'est jamais une vente), relit la page d'une commande
  incomplète (`/fr/account/orders/<id>`, `:1561`).
- **Deux voies l'appellent** :
  1. « ventes » : `lireVentesBeebsSiDue` (`background.js:25518`) — à une disparition d'annonce Beebs, ou (0.6.187+) une
     lecture d'entretien par 24 h ; 30 min au moins entre deux ; appelle le lecteur avec `priorite = null`
     (`:25540`) ⇒ toujours les 5 PREMIÈRES commandes.
  2. « messagerie » bêta (`background.js:25692-25765`) — avec une rotation (`commandesLues`) : chaque passage lit 5
     commandes différentes ; remplit `plateforme_commandes` et appelle aussi `noterVentesBeebs`.
- **Envoi** : `lignesVentesBeebs` (`background.js:25362`) — `{ ref, statut, date, produits[], montant?, prix_produits?,
  devise? }`, **sans titre**, **10 au plus** (`:25379`) → RPC `commandes_beebs_noter` (`:25383`).
- **Serveur** : `commandes_beebs_noter(p_rows, p_user, p_lecture)` (prod : `.tmp-terminal/p7/commandes_beebs_noter.prod.sql` ;
  dépôt : `supabase/migrations/20261113140000_ventes_beebs_cinq_gardes.sql`, appliquée le 13/11 — q1).

### 2.2 L'interrupteur « fantôme »
`coin_config.ventes_beebs_commandes = 0` depuis le 18/10 12:22 (q2). Lu l. 41 de la prod (`… = 1`, absent = 0,
fail-closed). À 0 : la fonction calcule tous les verdicts mais n'écrit RIEN sur les tâches (pas de `sale_signal`, pas
de preuve, pas d'annulation défaite) ; seul le bilan `usage_logs ventes_beebs_commandes` est écrit (l. 238-241). À 1 :
elle pose `sale_signal = 'sold'` + `sale_evidence.source = 'commande_beebs'` sur la tâche Beebs **publiée** du numéro
exact (l. 200-213) ; le cron `ventes_prouvees_tick` (toutes les 2 min) enregistre alors la vente
(`enregistrer_vente_atomique` : vente sans `commande_ref`, `annonce_id` = numéro) et retire les copies ailleurs.
**Elle n'écrit jamais dans `ventes` elle-même.**

### 2.3 Ce que veut dire `sans_job`
Prod l. 170-177 : aucun job Beebs `published` (publish/republish) de ce compte ou d'un compte relié ne porte EXACTEMENT
ce numéro de produit, et aucun job `sold` non plus ⇒ `sans_job`, rien n'est fait (même à 1). Pour noubliejamais, les
6 produits (34068909, 19802264, 9258216, 31518358, 19802402, 31917500) n'ont ni job, ni annonce relevée, ni vente (q24) :
ce sont des ventes anciennes, d'avant FillSell ou hors FillSell. Les autres verdicts : `avant_suivi` (commande plus
ancienne que la tâche, l. 194), `deja_vendue`, `doute`, `date_inconnue`, `fiche_deja_vendue`.

### 2.4 Pourquoi seulement 5 commandes (et la plus ancienne au 02/10)
Bilans de noubliejamais (q7), tous en 0.6.186, identiques le 13/11 12:43, le 16/11 03:21 et 04:07 :
`recues 5, produits 6, sans_job 6, requetes 1, mode fantome` — commandes 1710582 (02/10/2026, 2 produits), 1653819
(09/05), 1641271 (22/04), 1626133 (29/03), 1563060 (06/01/2026), toutes `SELLER_PAID`.
- `requetes 1` : la liste seule a été lue ; les 5 commandes étaient complètes dans la liste.
- La coupe : `aLireBeebs = ids … .slice(0, detailsMax)` (`messagerie.js:1538`) s'applique à TOUTES les commandes, même
  complètes (qui ne coûtent aucune requête) ; `detailsMax = COMMANDES_DETAILS_MAX = 5` (`:89`). Puis `lignesVentesBeebs`
  coupe à 10 (`background.js:25379`) et le serveur à 10 (`LIMIT 10`, migration `:377`).
- La voie « ventes » n'a pas de rotation (`priorite = null`) : toujours les 5 premières de la page (les plus récentes).
  « La plus ancienne au 02/10 » = la plus récente des 5 ; la plus ancienne lue est le 06/01/2026.
- Preuve que la page en porte plus : faf5021a (voie messagerie, rotation) — q14 : passages de 01:08 à 07:10 le 10/11,
  5 commandes chacun, **18 commandes distinctes** (1591935 du 12/02/2026 → 679585 du 18/07/2023), puis la boucle
  recommence (même page, `requetes 1`).
- Démonstration sur le code actuel (`node .tmp-terminal/p7/demo-rouge.mjs`) :
  ```
  commandes sur la page : 18 ; rendues par le lecteur : 5 (ok=true, requêtes=1, fetch=1) ; COMMANDES_DETAILS_MAX=5
  lignes envoyées à commandes_beebs_noter : 5 ; champ titre dans une ligne : false
  historique rendu par le lecteur : NON (champ absent)
  ```
- **Inconnu à ce jour** : la page porte-t-elle TOUTES les commandes d'une boutique, ou une première page (défilement,
  « voir plus ») ? Aucun relevé ne le dit (aucune pagination n'a jamais été lue, aucune taille de liste n'est tracée).
  Indices : faf5021a 18 commandes sur 3 ans dans une seule page ; 6 comptes plafonnés à 5 (q15). Pour une boutique depuis
  2021, il faut le MESURER (§4.6) avant de dire « tout l'historique ».

### 2.5 D'où vient le 403
q7 : `ventes_beebs_lecture_echec` du 16/11 09:11 : `{"http":403,"motif":"http_403","build":"2026-11-10T14:10:14Z+ba13a51","detail":""}`
= extension **0.6.186** (`docs/regles/extension-et-versions.md:378`). Son lecteur (`git show ba13a51:chrome-extension/messagerie.js`, l. 1447) :
`fetch("/fr/account/orders/list/seller", { credentials: "include", headers: { RSC: "1", Accept: "*/*" }, cache: "no-store" })`.
- C'est DataDome (anti-robot de Beebs) qui refuse **cette forme** de requête par moments, dans l'onglet de la personne,
  avec ses cookies : ni jeton manquant, ni session absente (une session absente renvoie vers la connexion, pas 403), ni
  appel serveur. Constat du 13/11 (`messagerie.js:1446-1455`) : 34 refus sur 11 comptes du 10 au 12/11, tous sur cette
  liste, quand la même famille de pages lue par un fetch simple passait 1 448 fois sur 1 448. Correctif écrit dans la
  0.6.187 (la page lue comme un document, sans en-tête RSC ni cache coupé ; un refus coupe 6 h, 24 h si récidive —
  `issueLectureVentesBeebs`, `background.js:25442`).
- **Ce correctif n'a jamais atteint les postes** : 0.6.187 → 0.6.191 jamais servies au Chrome Web Store ; la 0.6.191
  attend (`build/CWS-0.6.191-A-TELEVERSER/`, `docs/agents/etat-2026-10-01.md:5588`). Comptes Beebs par version (q16) :
  **67 en 0.6.186**, le reste plus ancien. La 0.6.186 n'a pas la pause 6 h : elle relit toutes les 30 min au plus.
- Tous comptes, 30 jours (q8, q17) : **79 refus 403 sur 17 comptes** (du 10/11 01:25 au 16/11 09:11) — 0.6.185 : 11 refus
  / 7 comptes ; 0.6.186 : 60 / 15 ; copie Cloud : 8 / ≤ 3 comptes. Le 16/11 : 3 refus, 3 comptes.
- La copie **Cloud** (0.6.191, forme document) reçoit aussi un 403 avec DataDome présent (f44b5917, 16/11 07:01, q9 :
  `"diag":{"datadome":true,…},"forme":"document","etape":"liste"`) : l'adresse IP d'un centre de données. La forme
  « document » réduit les refus, elle ne les supprime pas.
- Volume Beebs (q17) : 127 comptes avec des tâches Beebs en 60 j (116 avec une annonce publiée) ; 32 comptes ont écrit
  1 117 bilans `ventes_beebs_commandes` en 30 j, **tous « fantome »** ; 13 comptes ont vu au moins une commande ; 18
  comptes ont un échec de lecture tracé (210 traces).

---

## 3. Ce que contient une commande Beebs lue

**Objet de la page « Ventes »** (code de beebs.app relu le 23/10, `docs/enquetes/lot-2410/RAPPORT.md:66-72`) :
`{ order: { id, status, created_at, products[], amount, computed_buyer_payin, … }, isSale }`. Champs que le lecteur
sait sortir (`messagerie.js:1542-1554`) : `id`, `status`, `status_updated_at`, `created_at`, `carrier_id/name`,
`total_price`, `amount` (montant pour le VENDEUR, jamais `computed_buyer_payin` = ce que paie l'acheteur), `currency`,
`buyer` (prénom, initiale — jamais envoyé au serveur des ventes), `shipping` (suivi), `products[] { id, title, price,
image }` (10 au plus). Aucune adresse, aucun téléphone.

**Exemples réels en base** :
- Bilans (q7, q22) : numéro, statut brut, date, numéros de produit (ex. 1710582, 02/10/2026 08:35 UTC, SELLER_PAID,
  produits 34068909 + 19802264). Pas de titre ni de prix (0.6.186 ne les envoie pas).
- `plateforme_commandes` (bêta, 19 commandes Beebs sur 2 comptes, q13) : titre, montant, annonce, date, ex.
  `faf5021a | 1575649 | terminee | SELLER_PAID | Support de rangement Blanc et Noir pots… | 12.00 | EUR | 22204993 | 26/01/2026 10:05`,
  `447d920c | 1723956 | livree | DELIVERED | 5 articles | 10.50 | EUR | 09/11/2026`.
  Le montant y vient de `total_price` en premier (normaliseur `messagerie.js:802-841`) : ces valeurs sont en EUROS.
- Statuts vus : SELLER_PAID (la quasi-totalité), DELIVERED, IN_DELIVERY, LABEL_PRINTED, CANCELLED. Classement serveur
  `beebs_commande_classe` (prod q6) : payée/en cours/livrée = « vente », CANCELLED = « annulée », litige/retour = rien.
  État « terminée » côté extension (`etatCommandeBeebs`, `messagerie.js:785`) : `APPROVED_BY_BUYER`, `SELLER_PAID*`.
- **Frais** : jamais lus (Beebs ne les donne pas dans l'objet relu) ⇒ `frais_plateforme` NULL (inconnu), jamais inventé.
- ⚠️ **Unité de `amount` non prouvée** : `total_price` est en euros (10.50, 24.00) ; `amount` n'a jamais été lu sur une
  vraie commande (0.6.186 ne l'envoie pas). Le selftest l'imagine en centimes (`"amount":1200` pour 12 €,
  `beebs-commandes-flux-rsc-selftest.mjs:84-90`). Piège identique à Leboncoin (prix en centimes). À trancher sur les
  premiers bilans fantômes (§4.6) : jamais un prix deviné.

**Historique complet ?** Aucune API de commandes Beebs n'est connue du dépôt : la seule lecture est la page
`/fr/account/orders/list/seller` (document Next.js / flux RSC). Autres appels Beebs connus : `api.beebs.app/chats/v3`
(messagerie, en-tête `authorization` = jeton Firebase du cookie `access_token`, `messagerie.js:1675-1700`),
`/fr/account/orders/<id>` (détail, bordereau), `/fr/account/my-adverts` (relevé du stock), `/fr/p/<id>` (fiche
publique). Aucun `page=`, `before=`, curseur ni `api.beebs.app/orders` n'a jamais été relevé. Si Beebs pagine les
ventes, ce sera soit dans le flux (props `hasMore/next…` près de la liste), soit par un appel client (probablement
`api.beebs.app`, même jeton que la messagerie) : à établir (§4.6, étape 0).

---

## 4. Plan d'implémentation

### 4.1 Principe : deux domaines qui ne se croisent jamais
- **Circuit vivant** (existant, inchangé) : commande dont le produit porte une tâche Beebs FillSell dont le suivi a
  commencé AVANT la commande ⇒ `commandes_beebs_noter` (preuve, retraits des copies, mail si < 24 h). Interrupteur
  `ventes_beebs_commandes`.
- **Historique** (nouveau) : toute autre commande TERMINÉE (pas de tâche, ou commande antérieure à toute tâche du
  numéro) ⇒ une ligne dans `ventes`, `source = 'releve'`, `plateforme_code = 'beebs'`, sans rien d'autre.
  Interrupteur NEUF `ventes_beebs_historique` (0 = fantôme).
  Une même commande ne peut ainsi jamais être comptée par les deux (verrou au §5).

### 4.2 Extension 0.6.192 (obligatoire)
`chrome-extension/messagerie.js` — `lecteurCommandesBeebs` :
- 5e paramètre `options = { historique: false, max: 500 }`. En mode historique, en plus de `commandes` (inchangé,
  5 détails au plus), il rend `historique` = TOUTES les commandes complètes de la liste (`parListe`, `isSale !== false`),
  500 au plus, champs du contrat seulement (`id, status, created_at, amount, total_price, currency, products[{id, title,
  price}]` — aucun acheteur, aucun suivi), et `liste_total`, `incompletes`, `marqueurs_pagination` (clés `hasMore,
  has_more, next, nextPage, next_cursor, total, total_count, page, last_page` trouvées près de la liste : mesure seule).
  **Aucune requête de plus** : la liste est déjà lue (1 requête). Une commande incomplète attend son tour de détail
  (rotation `priorite`, 5 au plus par lecture, comme la messagerie).
- Pagination : SEULEMENT quand elle est prouvée (étape 0 / premiers bilans) : pages suivantes ≤ 10 par lecture, 2 à
  4 s entre deux, arrêt à la 1re page entièrement connue (comme Vinted/Leboncoin), arrêt net au 1er 403/429 (aucune
  seconde requête), curseur gardé dans `chrome.storage.local` pour la lecture suivante.

`chrome-extension/background.js` :
- `lireVentesBeebsSiDue` (`:25518`) passe `{ historique: true }` ; la voie messagerie (`:25765`) aussi.
- Nouveau `importerHistoriqueVentesBeebs(token, cmd, voie)` appelé juste après `noterVentesBeebs`, SEULEMENT si
  `cmd.ok` : `rpc ventes_beebs_historique_noter` par paquets de 100 (5 paquets au plus par lecture), arrêt au 1er
  refus de la RPC. Aucun minuteur, aucune alarme, aucun `setInterval` : la cadence reste celle de la lecture (30 min au
  moins, entretien 24 h, pause 6 h/24 h après un refus).
- Lignes : `{ ref, statut, date, montant?, total?, devise?, produits: [{ id, titre, prix? }] }`.
- `manifest.json` 0.6.192, `npm run package:extension` → `build/CWS-0.6.192-A-TELEVERSER/` ; la 0.6.191 part dans
  `build/CWS-PERIMES/` (la 0.6.192 la contient). **Un seul zip à téléverser.**

### 4.3 Serveur : migration `2026111X_ventes_beebs_historique` (esquisse)
Pas de réécriture de `enregistrer_ventes_relevees` (fonction partagée par 5 plateformes : risque de régression Vinted,
Leboncoin, eBay, Depop) ; une fonction dédiée, qui reprend ses gardes à l'identique.

```sql
INSERT INTO coin_config (key, value) VALUES ('ventes_beebs_historique', 0) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ventes_beebs_historique_noter(p_rows jsonb, p_lecture jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' SET statement_timeout TO '20s' AS $$
DECLARE v_user uuid := auth.uid(); v_ecrit boolean; v_comptes uuid[]; v_row jsonb; v_ref text; v_statut text;
        v_date timestamptz; v_ids text[]; v_id text; v_cle text; v_prix jsonb; v_inv bigint; v_titre text; v_n int;
        c jsonb := '{}'::jsonb;  -- compteurs par verdict
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF public.ecriture_poste_hors_cloud(v_user) THEN RETURN jsonb_build_object('motif','compte_cloud'); END IF;
  v_ecrit := coalesce((SELECT value FROM coin_config WHERE key = 'ventes_beebs_historique'), 0) = 1;  -- fail-closed
  v_comptes := ARRAY[v_user] || coalesce((SELECT array_agg(CASE WHEN l.user_a = v_user THEN l.user_b ELSE l.user_a END)
                                            FROM comptes_lies l WHERE v_user IN (l.user_a, l.user_b)), '{}');
  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows,'[]')) LIMIT 200 LOOP
    v_ref := btrim(coalesce(v_row->>'ref',''));            -- '^[A-Za-z0-9_-]{1,80}$' sinon forme_inconnue
    v_statut := upper(btrim(coalesce(v_row->>'statut',''))); -- TERMINÉE seulement :
    --   SELLER_PAID% / APPROVED_BY_BUYER ; CANCELLED = annulee ; le reste = en_cours (repris à une lecture suivante)
    v_date := public._ts_ou_null(v_row->>'date');            -- NULL = date_inconnue, rien écrit
    IF v_date > now() - interval '48 hours' THEN /* trop_recente : laissée au circuit vivant */ CONTINUE; END IF;
    -- devise ≠ EUR : prix NULL (jamais converti) ; montant réparti par public.beebs_commande_prix (existante)
    -- numéros de produit '^[0-9]{6,}$', 10 au plus ; v_n = leur nombre
    FOREACH v_id IN ARRAY v_ids LOOP
      v_cle := CASE WHEN v_n = 1 THEN v_ref ELSE v_ref || ':' || v_id END;   -- une vente par produit (règle des lots)
      -- (a) déjà chez un compte relié (même commande) → autre_compte
      -- (b) supprimée par la personne : ventes_supprimees (commande v_ref/v_cle, ou annonce v_id sans commande) → supprimee
      -- (c) une vente Beebs porte déjà ce numéro (annonce_id = v_id, tous comptes reliés) → deja
      -- (d) DOMAINE DU CIRCUIT VIVANT : une tâche Beebs de ce numéro EXACT dont le suivi
      --     least(created_at, published_at) <= v_date → suivie (jamais ici)
      -- (e) fiche par NUMÉRO EXACT seulement (annonces_plateforme.listing_id, cross_post_jobs.platform_listing_id ;
      --     jamais un titre) ; gardée seulement si UNE fiche, statut 'vendu', aucune vente Beebs dessus, aucun retrait
      --     (action 'delete') en attente/en cours ; une seule vente saisie Beebs sans commande sur cette fiche à pièce
      --     unique = « même cession » : complétée (cases vides seulement), jamais doublée ; sinon v_inv := NULL
      --     (vente sans fiche, comptée « sans_fiche ») — une fiche « stock » n'est JAMAIS liée ni changée.
      IF v_ecrit THEN
        INSERT INTO ventes (user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le, plateforme, plateforme_code,
                            commande_ref, source, releve_le, devise, frais_plateforme, selling_fees, inventaire_id,
                            quantite, statut, annonce_id)
        VALUES (v_user, v_titre, (v_prix #>> ARRAY[v_id,'prix'])::numeric, /* prix_achat : de la fiche, NULL = inconnu */ NULL,
                NULL, (v_date AT TIME ZONE 'Europe/Paris')::date, v_date, 'beebs', 'beebs', v_cle, 'releve', now(), 'EUR',
                NULL, 0, v_inv, 1, 'vendu', v_id)
        ON CONFLICT (user_id, plateforme_code, commande_ref) WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
        DO NOTHING;                                            -- aucune ligne inchangée réécrite
      END IF;
    END LOOP;
  END LOOP;
  -- bilan : mode (ecrit/fantome), recues, produits, aurait_ecrit/creees, deja, suivie, supprimee, autre_compte,
  --         trop_recente, en_cours, annulees, date_inconnue, forme_inconnue, sans_fiche, fiche_liee, montant_total,
  --         plus_ancienne, plus_recente, liste_total, marqueurs_pagination (p_lecture), 20 premières commandes en détail
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v_user, 'ventes_beebs_historique', <bilan>);
  RETURN <bilan>;
END $$;
REVOKE ALL ON FUNCTION public.ventes_beebs_historique_noter(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ventes_beebs_historique_noter(jsonb, jsonb) TO authenticated;
```
Ce que la fonction n'écrit JAMAIS (vérifié par le verrou) : `cross_post_jobs`, `inventaire` (sauf `prix_vente` vide
d'une fiche DÉJÀ vendue, comme `enregistrer_ventes_relevees`), `push_ventes`, `email_logs`, `remises_en_vente`,
`annonces_plateforme`. Ventes d'avant : rien ne change ; Vinted/Leboncoin/eBay/Depop : rien ne change.

Inverse (`supabase/rollbacks/…_INVERSE.sql`) : `DROP FUNCTION` + clé `coin_config` retirée ; données : les ventes
`plateforme_code = 'beebs' AND source = 'releve'` (0 aujourd'hui, q17) — une suppression faite par `db query` (rôle
postgres) ne passe pas par `ventes_suppression_trace` (seulement `authenticated`) : elles ne sont pas marquées
« supprimées par la personne » et reviendraient à une relecture. Essai sur base JETABLE (banc comme
`scripts/essais/20261113140000_banc.mjs`), feu vert, puis `db query --linked -f` + `migration repair`.

### 4.4 Rapprochement avec les fiches
Numéro de produit EXACT seulement (annonces_plateforme / cross_post_jobs du compte et de ses comptes reliés). Jamais un
titre, jamais un prix. Deux fiches pour un numéro = doute ⇒ vente sans fiche. Une vente sans fiche reste une vente au
tableau de bord (les ventes `releve` sans fiche sont déjà lues par `src/App.jsx` / `src/utils/tableauStats.js`, comme
les 887 ventes Vinted relevées). Une fiche « stock » dont le numéro porte une vieille commande Beebs : ni liée ni
changée (compteur `fiche_en_stock`, à montrer à Nico : c'est peut-être un article vendu jamais retiré ailleurs).

### 4.5 Le 403
- Livrer enfin la lecture « document » (0.6.187+) : la 0.6.192 la contient.
- L'import n'ajoute aucune requête à la 1re page (la liste déjà lue sert les deux circuits).
- Un refus (403, 429, page de vérification) : rien n'est envoyé au serveur pour l'historique, AUCUNE seconde requête,
  pause 6 h / 24 h si récidive (règle existante `issueLectureVentesBeebs`), marque « lecture due » gardée 24 h au plus,
  une trace par lecture (`ventes_beebs_lecture_echec`). Pages suivantes (si pagination) : même règle, curseur gardé.
- Option app (déploiement web, non indispensable) : sous Beebs, « Beebs bloque la lecture de tes ventes pour
  l'instant ; FillSell réessaie seul après HH:MM » d'après la dernière trace (`pause_jusqu`).
- À traiter dans le même lot (constat annexe) : sur la copie Cloud, la lecture des ventes Beebs échoue
  `onglet_indisponible` toutes les ~31 min, une trace à chaque fois (13e274de : essai 46 le 16/11 10:50 ; c7c382b7 ;
  126 traces sur 3 comptes depuis le 14/11 — q8, q9) : sans correctif, les comptes Cloud n'auront jamais leur historique.

### 4.6 Sortir du mode fantôme — critère de preuve
Étape 0 (avant le code, décision de Nico) : établir la pagination de la page « Ventes » — lecture du code public de la
page dans le Chrome de Nico (son compte : « Pas encore de ventes », mais le code de la liste dit comment elle charge la
suite), ou à défaut les `marqueurs_pagination` / `liste_total` des premiers bilans fantômes de la 0.6.192.

`ventes_beebs_historique` passe à 1 (feu vert nommé de Nico) quand, sur les bilans fantômes 0.6.192 d'au moins 3
comptes à ≥ 5 commandes (noubliejamais 2c89e573, d71db658, faf5021a, 39bfa95a, ebdf29f0, c385e244 — q15) :
1. `liste_total` ≥ le nombre de commandes déjà vues (faf5021a : 18) ; et soit aucun marqueur de pagination, soit la
   pagination suivie jusqu'au bout (la plus ancienne commande lue de noubliejamais remonte vers 2021-2022 ; si elle
   reste en 2026, l'historique est INCOMPLET : pas d'allumage, on le dit) ;
2. dates lues à 100 %, `forme_inconnue` = 0, `doute` = 0 ;
3. unité du prix tranchée : `amount` comparé à `total_price` et à la somme des prix des produits sur les mêmes
   commandes (rapport ≈ 1 : euros ; ≈ 100 : centimes ⇒ correctif avant allumage) ; prix lus ≥ 95 % ;
4. 0 ligne de moins de 48 h, 0 commande en double avec le circuit vivant (verdict `suivie` cohérent avec
   `commandes_beebs_noter` sur les mêmes numéros), 0 `supprimee` réécrite ;
5. Nico relit la liste d'un compte (nombre et montant total) et dit oui.
Après l'allumage : les ventes arrivent à la lecture suivante (≤ 24 h, entretien) ; contrôle q17 (`g_ventes_beebs_parc`
en `releve`), q5 (aucune note `push_ventes` créée pour ces lignes), `email_logs` inchangé.

L'interrupteur existant `ventes_beebs_commandes` (circuit vivant) est une décision À PART : 57 commandes lues en
fantôme, 0 doute, 0 forme inconnue (q21) ; mais aucun bilan 0.6.187+ (prix lus) n'existe encore. Coût du fantôme
constaté : eacbe32c, commande 1724984 du 12/11 18:25 (LABEL_PRINTED), produit 34305236 : verdict `aurait_prouve`, la
tâche est encore `published`/`unavailable`, la fiche encore en STOCK, aucune vente (q22) — une vraie vente Beebs non
enregistrée, copies peut-être encore en ligne ailleurs.

---

## 5. Le selftest « verrou » proposé : `npm run selftest:ventes-beebs-historique`
`scripts/ventes-beebs-historique-selftest.mjs` (+ banc jetable `scripts/essais/<version>_banc.mjs`). Rouge sur le code
actuel, vert après :
1. **Lecteur** (site simulé comme `beebs-commandes-flux-rsc-selftest.mjs`, page « Ventes » de 18 commandes complètes,
   forme de faf5021a) : en mode historique, 18 commandes rendues avec titre, prix, date, en 1 requête ; `commandes`
   (détails) toujours ≤ 5. **Rouge aujourd'hui** : 5 rendues, pas de champ `historique` (`demo-rouge.mjs`, sortie §2.4).
2. **Autonomie** : le lecteur reconstruit depuis son seul texte rend les mêmes 18 (règle `lecteurs-autonomes`).
3. **background.js** : `importerHistoriqueVentesBeebs` n'est appelée que si `cmd.ok` ; jamais sur 403/429/vérification ;
   aucun `setInterval`, aucune alarme ni requête Beebs de plus ; lignes sans champ acheteur ; paquets de 100.
   Rouge aujourd'hui : fonction absente.
4. **Migration** (texte) : interrupteur fail-closed ; date obligatoire et ≥ 48 h ; statuts terminés seulement ;
   `source = 'releve'` ; `ON CONFLICT … DO NOTHING` ; aucun `UPDATE cross_post_jobs`, aucun `UPDATE inventaire` hors
   `prix_vente` vide d'une fiche vendue, aucun `INSERT` dans `push_ventes` / `email_logs` / `remises_en_vente` ; garde
   `ventes_supprimees`, comptes reliés, poste Cloud ; rapprochement sans titre ; le seuil 48 h ≥ le seuil 24 h de
   `push_trg_ventes('releve')` relu dans la dernière migration qui la définit. Rouge aujourd'hui : fichier absent.
5. **Banc jetable** (jamais la prod) : 18 commandes → 18 ventes `releve`, 0 note `push_ventes`, 0 `email_logs`, 0 tâche
   ni fiche changée ; rejeu → 0 ligne neuve ; vente supprimée par la personne → jamais recréée ; commande de 30 h → refusée ;
   produit d'une tâche suivie avant la commande → `suivie`, 0 vente (la commande reste au circuit vivant) ; vente saisie
   Beebs unique sur la fiche → complétée, pas doublée ; fantôme → 0 écriture + bilan.
Non-régression à relancer : `ventes-beebs-commandes`, `ventes-beebs-cinq-gardes`, `ventes-beebs-lecture-due`,
`beebs-commandes-flux-rsc`, `lecteurs-autonomes`, `beebs-bilan-detail-commandes`, `mail-a-chaque-vente`,
`ventes-un-mail`, `releve-ventes-trace`, `vente-une-seule-fois`, puis la suite complète.

---

## 6. Risques
- **Pagination inconnue** : sans l'étape 0, une grosse boutique n'aurait que sa 1re page ; le bilan dit toujours la plus
  ancienne commande lue — jamais « tout l'historique » sans preuve.
- **Unité de `amount`** (euros ou centimes) non prouvée : erreur ×100 possible (piège Leboncoin). Tranché en fantôme.
- **Doublons** : séparés par construction du circuit vivant (§4.1) et des ventes saisies sur une fiche liée ; reste un
  cas indétectable sans titre : une vente Beebs saisie à la main SANS fiche ni numéro (19 ventes Beebs dans le parc,
  0 chez noubliejamais) — jamais rapprochée sur un titre (règle) : signalé, pas corrigé.
- **DataDome** : l'import n'ajoute pas de requête ; la pagination, si elle existe, en ajoute — bornée, arrêt au 1er refus.
- **Statistiques** : le chiffre d'affaires de ces comptes monte d'un coup (ventes anciennes) : voulu, à dire.
- **Cloud** : `onglet_indisponible` à corriger, sinon pas d'historique pour les 8 comptes Cloud.
- **Versions** : rien ne marche avant le téléversement de la 0.6.192 et sa mise à jour chez les clients.

## 7. Ce qui demande une décision de Nico
1. Feu vert 0.6.192 (lecture complète + import ; contient la lecture sans 403 de la 0.6.187+) — elle remplace la 0.6.191
   à téléverser.
2. Étape 0 : lire le code public de la page des ventes Beebs dans son Chrome (son compte) pour la pagination, ou
   attendre les mesures des bilans fantômes.
3. Historique = commandes TERMINÉES (SELLER_PAID, APPROVED_BY_BUYER) de plus de 48 h, en silence (aucun mail, aucune
   notification) — y compris une vente récente sans tâche FillSell (Vinted/Leboncoin, eux, notent une vente relevée
   de moins de 24 h : « un mail à chaque vente » du 05/11). Silence proposé.
4. Fiche « stock » dont le numéro porte une vieille commande Beebs : vente sans fiche + compteur (proposé), ou question
   à la personne ?
5. Feu vert de la migration après le banc jetable ; puis allumage de `ventes_beebs_historique` sur le critère du §4.6.
6. À part : allumer `ventes_beebs_commandes` (circuit vivant) après les bilans 0.6.192 ; et le cas eacbe32c
   (commande 1724984 du 12/11, fiche encore en stock).
