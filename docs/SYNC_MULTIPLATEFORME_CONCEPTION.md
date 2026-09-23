# Synchronisation multiplateforme — conception révisée (17/09/2026)

## 0. Où en est le chantier du 27/08

Le document de conception du 27/08 **n'a été retrouvé ni dans le dépôt, ni
dans les mémoires, ni dans les artefacts** : seuls existent la mémoire des
arbitrages (Q1-Q7, drapeau d'exposition, lots) et le lot 0b livré
(`sync_gardes_declenchees`, ops-digest v16). Cette conception repart donc des
arbitrages et du code réel, et remplace le document perdu.

Ce qui existe :
- Vinted : sync du dressing (API wardrobe, upsert par `vinted_item_id`,
  jobs synthétiques, marquage des disparitions mono-compte, commande à
  distance `demander_sync_dressing`, cron opt-in, chien de garde des runs).
- Autres plateformes : rien de « sync ». Mais le **relevé** existe déjà à
  l'unité : `findListingLinkInPage` / `captureFromMyListings` (Leboncoin
  « mes-annonces », Beebs « my-adverts », eBay « sh/lst/active ») et le
  veilleur `checkPublishedListings` (état d'une annonce par URL).
- Lot 0b : `sync_gardes_declenchees` (refus des garde-fous, digest).

Arbitrages du 27/08 **toujours valables** : ebay.com hors périmètre ; imports
hors quota Free ; pas d'échappatoire « publier quand même » sur
already_published ; jobs synthétiques conservés (`listing_url` obligatoire,
jamais de `reservation_id`) ; seuils de rapprochement calibrés en dry-run.

Arbitrage **caduc** : « la republication reste Vinted, lecture seule
ailleurs ». Depuis ce lot, Leboncoin/Beebs/Opla se republient (retrait +
redépôt). Conséquence pour la sync : une annonce relevée sur Leboncoin peut
être **la nôtre** (job `publish`/`republish` `published`) ou **étrangère**
(déposée à la main) — et une annonce étrangère rapprochée d'un article devient
republiable ? **Non** : sans job de dépôt, pas de snapshot, pas de redépôt
(§ 3 du doc republication). Une annonce importée est **lecture seule** tant
qu'elle n'a pas été déposée par FillSell — et l'app le dit sur la carte.

## 1. Ce que « synchroniser » veut dire ailleurs que sur Vinted

| Plateforme | Source du relevé | Identifiant | Ce qu'on peut lire | Ce qu'on ne lit pas |
|---|---|---|---|---|
| Leboncoin | « Mes annonces » (compte part), pages | id `/ad/<cat>/<id>` | titre, URL, prix, statut (en ligne / désactivée) | description complète, photos (pas sans ouvrir chaque fiche — interdit en boucle) |
| Beebs | « Mes annonces » (`my-adverts`, `creating`) — filtre `?searchText` | id `/p/<id>` | titre, URL, prix, statut (en vérification / en ligne) | photos, description |
| eBay | Hub vendeur `sh/lst/active` (+ `unsold`, `sold` plus tard) | `/itm/<id>` | titre, URL, prix, quantité | description |
| Opla | API `GET /public/me/articles` (relevé lot 1 Opla) | `art_<id>` | tout (titre, prix, état, photos) | — |

Un « dressing » n'existe qu'à Vinted. Ailleurs, on relève **une liste
d'annonces**, pas des fiches complètes : la sync multiplateforme **n'importe
pas des articles**, elle **rapproche des annonces d'articles existants** et
propose l'import du reste (titre + prix + lien) comme fiches minimales, avec
le mot « à compléter ».

## 2. Modèle (lot 0c — migration `20260917223000_sync_multiplateforme_lot0c.sql`)

- `annonces_plateforme` : une ligne par (user, platform, listing_id) relevée :
  `titre`, `prix`, `url`, `statut_plateforme` (`en_ligne` / `en_verification`
  / `desactivee` / `vendue` / `inconnu`), `vu_le`, `disparu_le`,
  `inventaire_id` (NULL = non rapprochée), `job_id` (le dépôt FillSell qui
  la porte, s'il existe), `source_rapprochement` (`job` / `manuel` /
  `automatique`), `run_id`.
- `rapprochements` : journal des décisions (annonce ↔ article) : `decision`
  (`attache` / `ignore` / `import`), `par` (`utilisateur` / `job` / `auto`),
  `score`, `at`. Une annonce dont l'URL est celle d'un job FillSell est
  rapprochée **par le job**, sans question. Le reste est **toujours** proposé
  à l'utilisateur (jamais d'attachement automatique par titre — 36 % des
  articles ont un homonyme, leçon des URLs croisées).
- `vinted_sync_runs.platform` (défaut `'vinted'`) + index unique actif
  `(user_id, kind, platform)` : un run par plateforme, mêmes statuts, même
  chien de garde, même carte.

## 3. Lots

- **0c** (ce lot, migration à valider) : tables, colonne, RPC
  `demander_sync_plateforme(p_platform)` (même contrat que
  `demander_sync_dressing` : queued, TTL 6 h, un actif par plateforme).
- **1** : extension — commande distante par plateforme (`traiterCommandeSync`
  générique), relevé de « Mes annonces » page par page avec la liste des
  liens + titres + prix (`releverAnnoncesListe(tabId, platform)`), upsert
  `annonces_plateforme`, rapprochement par job (URL/id), marquage
  `disparu_le` des annonces connues non revues (règles mono-compte du 27/08 :
  jamais sur un relevé incomplet, jamais sous un autre compte).
- **2** : app — carte « Mes annonces Leboncoin / Beebs / eBay » (même carte
  que le dressing, un onglet par plateforme), liste des annonces **non
  rapprochées** avec trois gestes : « C'est cet article » (choix dans le
  stock), « Importer comme nouvel article », « Ignorer » ; badge « annonce
  importée, lecture seule » sur la carte.
- **3** : convergence avec la republication : une annonce rapprochée **par
  un job** est republiable (snapshot = ce job) ; une annonce importée ne l'est
  pas tant qu'elle n'a pas été redéposée par FillSell (bouton « Publier »
  proposera de la déposer à neuf, avec l'avertissement doublon : l'annonce
  d'origine reste en ligne, à retirer à la main ou via « Retirer » une fois
  rapprochée).
- **4** : veilleur unifié — `checkPublishedListings` lit `annonces_plateforme`
  en plus des jobs (les annonces rapprochées mais sans job entrent dans la
  détection de vente).

## 4. Guard-fous

- Aucune lecture en boucle des fiches (DataDome LBC, anti-bot Beebs) : listes
  seulement, une page à la fois, pause humaine entre pages.
- Jamais d'attachement automatique par titre. Jamais de suppression d'article.
- Marquage `disparu_le` sous les mêmes trois règles mono-compte que Vinted.
- Drapeau d'exposition : liste fermée (Nico, puis Ornella au lot LBC) —
  `profiles.beta_flags.inventaire_multi_pf` (colonne non modifiable par le
  client), comme arbitré le 27/08.

## 5. Textes (à poser avec le lot 2)

Landing / FAQ / onboarding : aujourd'hui « importe ton dressing Vinted » est
**vrai** et doit le rester tant que le lot 2 n'est pas livré. Les textes du
lot 2 : « FillSell lit tes annonces Vinted, Leboncoin, Beebs et eBay et les
rattache à ton stock — tu confirmes, il n'invente rien. »

---

## ⛔ VOIE 1 (brancher le dressing Vinted sur le moteur) — ABANDONNÉE LE 18/09/2026

**Décision de Nico, sur mesure. Ne pas la ressortir comme « le remède aux
alertes Vinted » : elle ne l'est pas.**

L'idée : faire écrire à la synchro du dressing ses résultats dans
`annonces_plateforme`, et lever la garde `v_pf NOT IN ('leboncoin','beebs',
'ebay','opla')` de `rapprocher_releve`, pour que Vinted passe par le même
moteur que les quatre autres. Le gain attendu : récupérer par l'identifiant
les annonces republiées sous un NOUVEL id, que le veilleur a prises pour des
disparitions.

**LE CHIFFRE QUI L'A TUÉE : ZÉRO.** Classement des 2 326 alertes Vinted
actives (jobs `published`), le 18/09 :

| catégorie | n | comptes |
|---|---|---|
| article marqué disparu par la synchro | 887 | 33 |
| même annonce, jamais revue depuis l'alerte | 552 | 24 |
| pending (pas encore une alerte) | 509 | 37 |
| vente, hors périmètre | 262 | 63 |
| **article VIVANT sous une AUTRE annonce** | **0** | **0** |
| autre statut · article absent | 12 · 3 | |

Aucun article n'est vivant sur Vinted sous un identifiant différent de celui
de son job. Le rattachement par identifiant n'a donc **rien** à récupérer, et
le faisceau non plus : ces annonces ne sont pas dans « Mes annonces », c'est
précisément pour ça qu'elles sont en alerte.

**Ce que voie 1 reste :** une unification de plomberie (un moteur, un écran,
une file de rattachement pour les cinq plateformes). Légitime, mais c'est un
autre débat, et il coûte un paquet CWS. Si elle revient, que ce soit pour ce
motif-là — pas pour les alertes.

**Le vrai sujet, lui, est ailleurs :** sur les 887 « disparues » hors soupçon
de vente, **887 n'ont AUCUNE vente enregistrée en face** (33 comptes). Deux
sources indépendantes disent que l'annonce n'est plus là, et rien ne dit ce
qu'elle est devenue. Voir le bandeau « Vendue ? » et la revue en lot des
disparus (App.jsx) — l'outil existe, c'est la file qui n'est pas traitée.

## 6. Import automatique, budget et rattrapage (23/09/2026)

- **Le corps du moteur est unique** : `rapprocher_traiter_annonce(annonce, vus,
  import_ouvert, rattrapage, second_releve_requis)` applique les bandes
  notification → job → certain → propose → aucune → import. `rapprocher_releve`
  (le relevé de l'extension) et `rapprocher_rattraper` (service_role, sur ce
  qui est déjà en base) l'appellent tous les deux. Le 19/09, une réécriture de
  `rapprocher_releve` repartie d'un corps de la veille avait fait disparaître
  l'import automatique pendant quatre jours (0 import, ~2 000 lignes « aucune »
  par jour, le stock d'un nouvel inscrit sans Vinted vide) ;
  `npm run selftest:moteur-rattachement` et le DO de la migration
  `20260923180000_import_auto_retabli_rattrapage.sql` vérifient la chaîne.
- **Import automatique** (point F du 18/09, inchangé) : interrupteur
  `coin_config.import_auto_ouvert = 1` · `statut_plateforme = 'en_ligne'` ·
  une ligne « aucune » d'un run précédent. Le geste (`rapprocher_importer`)
  porte la garde du jumeau (titre inclus → proposition, jamais d'import).
- **Budget** : le rôle `authenticated` a `statement_timeout = 8 s` ; la boucle
  s'arrête à 70 % et rend `restantes`, ce qui est fait est commité.
  L'extension rappelle (≤ 12 tours) ; une ancienne reprend au relevé suivant,
  les annonces les moins évaluées d'abord.
- **Rattrapage** : `select rapprocher_rattraper(<user>, 'leboncoin')` simule
  (défaut) ; `p_simulation := false` écrit. Idempotent : rattachée ou ignorée
  = jamais réexaminée ; proposition identique = ni réécrite ni rejournalisée.
- **Alarme quotidienne de l'extension** : relève aussi une plateforme SANS
  dépôt dès qu'une annonce relevée y attend son rattachement — sinon le
  « deuxième relevé » n'arrivait jamais pour un compte sans Vinted.
