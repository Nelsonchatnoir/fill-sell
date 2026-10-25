# Audit : le parcours d'entrée « j'importe mon Vinted et je publie ailleurs »

- **Date** : dimanche 25/10/2026. Relevés en base faits entre 13:40 et 14:05 (heure de Paris). Lecture seule : code et `SELECT`, aucune écriture, aucun navigateur.
- **Version auditée** : `main` à `d9e1819`, c'est-à-dire le web servi (`https://fillsell.app/build.json` → `2026-10-25T10:22:55Z+d9e1819`). Fonctions edge : `get-pending-jobs` v282 (déployée le 25/10 à 12:10), `generate-listing` v124, `update-job-status` v149 (`verify_jwt=false`).
- **Extensions du parc** (comptes vus depuis moins de 7 jours, `profiles.extension_version`) : 0.6.128 ×58, 0.6.141 ×46, 0.6.131 ×27, 0.6.143 ×1, autres ×5.
- **Numéros de ligne** : ceux de `d9e1819`. Pendant l'audit, un autre terminal modifiait des fichiers sans les committer (§ 10). Ces modifications ne sont ni servies ni décrites ici.
- **Convention** : *observé* = lu dans le code ou mesuré en base. *Hypothèse* = déduit, à vérifier.

---

## 1. L'essentiel

1. **L'import ne rapporte ni texte, ni couleur, ni rayon** (observé, code). Le relevé du dressing (`GET /api/v2/wardrobe/{id}/items`, 96 par page) n'a pas ces champs. L'extension écrit elle-même dans `inventaire` par PostgREST : aucune fonction SQL ni fonction edge ne transforme les pages. Arrivent seulement : le titre, le prix, les photos (adresses du CDN Vinted), la marque, et `attributs` {taille, état, marque} avec la source `vinted_liste`.
2. **La plupart des fiches importées sont incomplètes** (mesuré). Sur 74 828 fiches Vinted vivantes :
   - 87,0 % n'ont pas de description ;
   - 86,1 % n'ont pas de couleur ;
   - 90,2 % n'ont pas de `vinted_catalog_id`.

   Sans description : 72,1 % chez les comptes actifs, 65,4 % chez les comptes payants. Chez les comptes arrivés depuis moins de 30 jours, 19,7 % seulement des fiches importées ont une description.
3. **Une fiche Vinted sans description ne peut pas partir sans lecture** (observé, code). Depuis le 22/10 (point 8), une fiche Vinted dont le texte fait moins de 2 mots ne s'ouvre ni au stepper ni au lot tant que son annonce d'origine n'est pas « lue ».
   - Le seul lecteur qui fonctionne en prod est le pont page → extension (`FETCH_VINTED_ITEM`).
   - Il lit un article à la fois, et seulement sur un ordinateur où Chrome a l'extension et un onglet fillsell.app ouvert.
   - Il doit répondre en 12 s (stepper) ou 25 s (lot) ; au-delà, la réponse est ignorée.
4. **La lecture de fond par l'extension n'a jamais rien lu** (observé, code et base). Cela vaut pour toutes les versions de 0.6.130 à 0.6.143.
   - Cause : `restRequest` (`background.js:13486-13487`) rend `null` pour tout appel autre que GET qui ne demande pas `Prefer: return=representation`.
   - Or `rpc/lectures_origine_en_attente` est appelée sans cet en-tête : la liste reçue est vide, rien n'est lu, et aucune trace n'est écrite (`usage_logs.lecture_origine_echec` : 0 ligne).
   - Même cause, deux autres effets : `file_etat_poste` est toujours lue « ni pause ni synchro », et `lectureOrigineDemandeeRecente` rend toujours faux.
5. **35 demandes de lecture Vinted sont ouvertes** (base), sur 6 comptes.
   - 29 viennent d'un compte Pro : son lot du 24/10 (18:58 à 19:01) les a laissées en « Lecture de ton annonce d'origine », et aucune n'a été lue depuis.
   - L'une d'elles a pourtant sa description (446 caractères) dans une capture de republication valide du 24/10 à 22:16. Rien ne la recopie sur la fiche.
6. **Les messages promettent un départ qui n'aura pas lieu** (observé, code).
   - Stepper et lot : « elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue ».
   - Stock : « Ils partiront… Rien à faire ».
   - En réalité, aucun job n'est créé pour ces fiches. Une fois la lecture faite, il faut cliquer à nouveau.
7. **Une demande de lecture peut rester ouverte pour toujours** (observé, code).
   - Le stepper et le lot ne ferment jamais la demande qu'ils ont posée, même quand ils lisent eux-mêmes la description.
   - Le lecteur du Stock (`useLecturesOrigine`) ne la ferme que s'il trouve un texte.
   - Conséquence : une annonce Vinted sans description chez la vendeuse ne sort jamais de l'état « en lecture ».
8. **Une demande récente retient toute la file du compte** (observé, code ; `get-pending-jobs` v282, depuis le 25/10 à 12:10).
   - Une demande Vinted de moins de 15 min retient toutes les publications et republications du compte (extension ≥ 0.6.130), pour que la lecture passe devant.
   - Cette lecture n'arrive jamais (point 4).
   - Une seule demande a été posée depuis 12:10, sur un compte sans tâche en file : l'effet n'est pas observé, mais il découle directement du code.
9. **Une lecture qui répond trop tard perd la description** (observé, code). Après le délai, l'app n'écoute plus. Le background fait quand même la lecture et écrit les attributs, mais jamais la description.
   - Exemple probable (*hypothèse*) : demande à 12:44:39 le 25/10, attributs `vinted_detail` écrits à 12:47:55, description toujours vide.
10. **La base a déjà des descriptions que les fiches n'ont pas** (mesuré).
    - 3 377 fiches vivantes sans description ont leur texte dans une capture de republication `valide`.
    - 2 939 de ces captures ont moins de 30 jours.
    - 2 626 d'entre elles passent le contrôle « même article » de l'app (titre et prix).

---

## 2. Mesures en base (25/10, vers 13:45)

**Population.** `inventaire.origine = 'vinted_sync'`. C'est la vraie valeur : 108 202 lignes sur 392 comptes. Les autres origines :

| Origine | Lignes |
|---|---:|
| `releve_ebay` | 6 302 |
| `releve_leboncoin` | 4 206 |
| (vide) | 3 510 |
| `releve_opla` | 1 839 |
| `releve_beebs` | 1 078 |
| `transfert_boutique_1810` | 195 |
| `releve_depop` | 18 |

**Définitions.**
- **Vivante** : `statut = 'stock'` et `disparu_le IS NULL`. Cela comprend 331 fiches fusionnées (0,4 %).
- **Couleur** : la vraie clé est `attributs.couleur.v`. Elle est présente sur 12 353 fiches Vinted. Il existe aussi `couleur2` (2 698).
- **Rayon** : la colonne `vinted_catalog_id`, plus la clé `attributs.categorie_vinted` (1 772 fiches).
- **Comptes actifs** : `profiles.extension_last_seen_at` de moins de 7 jours.
- **Comptes payants** : `palier_de()` rend `premium`, `pro` ou `business`. Le calcul : `is_business`, puis `is_pro`, puis `is_premium OR is_comped`. La même règle est dans `_shared/palier.js`. Les comptes offerts sans palier payant ne pèsent rien ici : les segments F et G sont identiques.
- **30 jours** : `inventaire.created_at` de moins de 30 jours.

| Segment | Fiches | Comptes | Sans description | Sans couleur | Sans `vinted_catalog_id` | Sans rayon (colonne ni attribut) | Sans les trois |
|---|---:|---:|---:|---:|---:|---:|---:|
| A. Toutes | 108 202 | 392 | 96 884 (89,5 %) | 95 849 (88,6 %) | 99 541 (92,0 %) | 99 258 (91,7 %) | 92 776 (85,7 %) |
| B. Vivantes | 74 828 | 387 | 65 127 (87,0 %) | 64 437 (86,1 %) | 67 474 (90,2 %) | 67 345 (90,0 %) | 61 659 (82,4 %) |
| C. Créées en 30 j (toutes) | 34 152 | 171 | 28 034 (82,1 %) | 27 521 (80,6 %) | 30 760 (90,1 %) | 30 528 (89,4 %) | 26 010 (76,2 %) |
| D. Créées en 30 j, vivantes | 24 404 | 165 | 18 849 (77,2 %) | 18 454 (75,6 %) | 21 364 (87,5 %) | 21 266 (87,1 %) | 17 011 (69,7 %) |
| E. Comptes actifs, vivantes | 19 672 | 105 | 14 174 (72,1 %) | 13 185 (67,0 %) | 14 040 (71,4 %) | 13 958 (71,0 %) | 11 371 (57,8 %) |
| F. Comptes payants, vivantes | 10 102 | 41 | 6 603 (65,4 %) | 5 378 (53,2 %) | 5 618 (55,6 %) | 5 539 (54,8 %) | 4 540 (44,9 %) |
| H. Actifs et payants, vivantes | 7 414 | 34 | 4 518 (60,9 %) | 3 319 (44,8 %) | 3 056 (41,2 %) | 2 988 (40,3 %) | 2 492 (33,6 %) |
| I. Actifs, créées en 30 j, vivantes | 13 059 | 91 | 9 518 (72,9 %) | 9 046 (69,3 %) | 10 337 (79,2 %) | 10 264 (78,6 %) | 7 889 (60,4 %) |
| J. Gratuits actifs, vivantes | 12 258 | 71 | 9 656 (78,8 %) | 9 866 (80,5 %) | 10 984 (89,6 %) | 10 970 (89,5 %) | 8 879 (72,4 %) |

Une description d'un seul mot compte pour « insuffisante » selon la règle (`texteSuffisant`) : seulement 25 fiches de plus que les fiches sans description (96 909 contre 96 884).

**Où la description existe déjà** (fiches vivantes sans description, soit 65 126) :
- Dans une capture de republication `vinted_republish_captures` `valide` qui porte `payload.natif.description` : 3 377 fiches (97 comptes). 2 939 ont une capture de moins de 30 jours ; parmi elles, 2 626 passent le contrôle « même article » de `completerTexteDuVendeur` (titre identique, prix à 0,005 € près).
- Dans le relevé d'une autre plateforme (`annonces_plateforme.capture.description`) : 0 fiche. Ce chemin est épuisé ; 1 542 fiches ont une annonce ailleurs, mais sans texte capturé.
- `annonces_plateforme` n'a aucune ligne `platform='vinted'` : l'import Vinted n'y écrit rien.

**Premiers relevés des comptes arrivés depuis moins de 30 jours** (134 comptes) :
- Premier relevé réussi (`done`) : 82 comptes, 20 253 fiches créées.
- Premier relevé échoué (`failed`) : 47 comptes, dont 44 sur « `[cause403] session_absente` — aucune session Vinted dans Google Chrome / Microsoft Edge / ce navigateur ».
- Expiré : 4. Annulé : 1.
- 118 comptes sur 134 ont réussi au moins un relevé dans les 30 jours (5,5 relevés en moyenne).

**Le parcours des comptes arrivés depuis moins de 30 jours** (111 comptes dont le premier import Vinted a moins de 30 jours) :
- 28 137 fiches importées, dont 5 545 (19,7 %) ont une description aujourd'hui.
- 81 comptes ont créé au moins un job de publication ailleurs ; 77 ont au moins une annonce publiée ailleurs.
- 6 647 fiches importées ont un job de publication ailleurs.
- 58 de ces comptes sont encore actifs ; 14 sont payants.

**Jobs FillSell de publication ailleurs, pour des fiches `vinted_sync`.** Les jobs de suivi posés par les relevés (`platform_fields.source='releve'` ou `rattachement`) sont exclus.

| Jour | Jobs | Fiches | Comptes | Via un lot | Fiches sans description aujourd'hui |
|---|---:|---:|---:|---:|---:|
| 17/10 | 51 | 29 | 2 | 50 | 0 |
| 18/10 | 160 | 100 | 3 | 158 | 0 |
| 19/10 | 931 | 363 | 5 | 915 | 4 |
| 20/10 | 556 | 258 | 7 | 550 | 0 |
| 21/10 | 495 | 337 | 4 | 471 | 4 |
| 22/10 | 110 | 57 | 3 | 103 | 0 |
| 23/10 | 40 | 30 | 4 | 29 | 0 |
| 24/10 | 201 | 95 | 8 | 188 | 0 |
| 25/10 (jusqu'à 14:00) | 49 | 36 | 3 | 47 | 0 |

Le volume baisse après le 22/10 (règle « annonce d'origine d'abord »). C'est une corrélation, pas une cause prouvée : aucun journal ne compte les articles laissés en phase « origine ».

**Lectures d'origine** (`lectures_origine_demandees`) : il n'y a que des lignes `vinted`.
- **Ouvertes** : 35, sur 6 comptes, posées entre le 23/10 21:36 et le 25/10 12:44. Aucun essai (`essais = 0`).
- **Fermées** : 49, sur 8 comptes. Elles ont toutes une description aujourd'hui.
  - 44 ont été fermées par `lecture_origine_faite` (`essais = 1`, chemin du lecteur du Stock).
  - 5 ont été fermées sans passer par la RPC (`essais = 0`, toutes le 25/10 à 10:50:39, compte `447d920c`).

**Jobs `pending` portant `attente_lecture_origine`** : 0 à 13:50. Aucun job des 10 derniers jours n'en garde la trace, car la marque s'efface quand l'annonce est lue.

**`usage_logs`** : `lecture_origine_echec` = 0 ligne depuis toujours. Cette trace n'existe que depuis la 0.6.143, et un seul poste l'a.

---

## 3. A — L'import du dressing

### A1. Le geste

- **Web, sur l'ordinateur.** La carte `VintedDressingSync` (`src/tabs/StockTab.jsx:2922`) envoie `demanderSyncDressing()` (`src/utils/vintedSync.js:158`). C'est un `postMessage {__fillsellCmd:'SYNC_DRESSING'}`.
  - `content-scripts/fillsell-auth.js:141` le relaie avec `declencheur:'bouton'`.
  - `background.js:1683` : `syncDemandeeLocale = Date.now()`, puis `syncDressingVinted({declencheur:'bouton'})`. La réponse est immédiate ; la progression se lit dans `vinted_sync_runs`.
- **Téléphone, ou canal direct muet.**
  - `demander_sync_dressing` (RPC) met une demande en file (`vinted_sync_runs`, `queued`, déclencheur `bouton_distant`).
  - L'extension la réclame à son prochain poll (`syncDressingUnlocked`, prise `queued → running`, `background.js:18875-18899`).
  - Repli automatique : si le canal direct ne répond pas en 10 s, la demande part par la file (`SYNC_REPLI_FILE_MS`, `src/annonces/synchroniser.js:33`).
- **Ce que voit la personne.**
  - Le bouton : « Synchroniser mes annonces Vinted » (carte) ou « Synchroniser » (ligne).
  - Pendant le relevé : « Synchronisation en cours… » ou « En cours », « Démarrage… », puis « X articles sur N » ou « X articles lus ».
  - Sans extension : « Installe l'extension FillSell sur ton ordinateur pour synchroniser tes annonces. »
  - Ordinateur muet : « Ton ordinateur ne répond pas. Ouvre Chrome avec l'extension FillSell pour lancer la synchro. »
  - Cadence : « Synchronisation récente : tu pourras relancer un peu plus tard. » (15 min après un relevé `done`, `SYNC_MANUAL_COOLDOWN_MS`).

### A2. Avant de lire (`syncDressingVinted`, `background.js:18774` ; `syncDressingUnlocked`, `background.js:18858`)

- **Verrou.** Le relevé prend `withJobFlowLock("sync-dressing")` (`background.js:2553`). C'est une file d'attente simple (FIFO), sans délai maximal : toute lecture de détail demandée pendant le relevé attend la fin du relevé (voir B3).
- **Reprise.** Un run `running` est repris ; un run `incomplete` de moins de 2 h est rouvert ; sinon un run neuf est créé (`POST vinted_sync_runs`, `Prefer: return=representation`).
- **Cron.** Le cron n'inaugure jamais un premier relevé (« la première sync est un geste explicite »). Il attend 20 h entre deux relevés.
- **Garde d'identité.** Pour un nouveau compte sans boutique connue, la boutique ouverte dans Chrome est adoptée (`profiles.vinted_sync_pin` = `{v:2, boutiques:[{…, source:'premiere_sync'}]}`, `background.js:19496-19512`). Une autre boutique arrête le run en `failed` « `[boutique_a_confirmer]` … », et l'app pose la question (A6).
- **Relevés automatiques.** Ils n'importent rien (`releveEstUnGeste` côté extension, `releve_est_geste` et le déclencheur `inventaire_ecarte_import_sync` côté base). Seuls les gestes `bouton`, `bouton_distant` et `app` créent des fiches.

### A3. La lecture d'une page (`content-scripts/vinted.js`)

- `SYNC_DRESSING_PAGE` (`vinted.js:603`) appelle `lirePageDressing(page, userId)` (`vinted.js:1144`) : `GET /api/v2/wardrobe/{userId}/items?page=N&per_page=96` (`vinted.js:1155`).
- **Champs gardés par article** (`vinted.js:1190-1227`) : `vinted_item_id`, `titre`, `url`, `prix` (`price.amount`), `devise`, `marque` (`it.brand`), `taille` (`it.size`), `etat` (`it.status`), `vues`, `favoris`, `statut` (`active`, `draft`, `sold`, `closed`, `reserved`, `hidden`), `photos[]` (`full_size_url`), `photo_ts` (date de la plus ancienne photo).
- **Ni description, ni couleur, ni `catalog_id`.** L'en-tête du fichier interdit de boucler sur l'endpoint d'édition pour aller les chercher (`vinted.js:1128-1133`).
- **Pilotage par le background** (`background.js:19588-19750`) :
  - 60 s par page, avec une reprise sur une navigation neuve si le canal se coupe.
  - Pause de 4 à 9 s entre deux pages.
  - Au plus 40 pages, soit 3 840 articles (`SYNC_MAX_PAGES`, `background.js:13535`).
  - Une page vide « menteuse » est relue 3 fois au plus (6 fois par run), puis le run se clôt `incomplete`.

### A4. L'écriture (`enregistrerArticlesDressing`, `background.js:20142-20590`)

**Lectures préalables.**
- Les fiches existantes : `inventaire?user_id=…&vinted_item_id=in.(…)` (`id, vinted_item_id, first_seen_at, statut, origine, photos, prix_vente`).
- Les jobs Vinted `published`/`sold` : pour rattacher une annonce déjà publiée par FillSell, par son numéro seulement, jamais par le titre.
- Les republications à l'étape `deleted` : leur recréation n'est pas importée.

**Fiche non-sync déjà identifiée.** Elle ne reçoit qu'un PATCH léger (identité et compteurs) : `vinted_item_id`, `vinted_view_count`, `vinted_favourite_count`, `vinted_status`, `last_synced_at`, `disparu_le = NULL`, `attributs` de la liste, `prix_vente` s'il est vide, `listed_at_guess`, `vinted_account_id`.

**Upsert principal** : `POST inventaire?on_conflict=user_id,vinted_item_id` avec `Prefer: resolution=merge-duplicates,return=minimal` (`background.js:20503`). En cas de refus du lot, il est rejoué ligne par ligne (`:20512`).

| Colonne | Valeur écrite |
|---|---|
| `id` | L'existant, ou `Date.now()*1000+i` |
| `user_id` | Le compte de la session |
| `titre` | `title`, ou « Article Vinted » |
| `prix_vente` | Comble un prix vide, jamais sur un article vendu |
| `statut` | `stock` ↔ `vendu`, règle asymétrique : jamais `vendu → stock` |
| `marque` | `brand` |
| `photos` | Adresses du CDN Vinted, sauf si la fiche porte déjà des photos à nous |
| `plateforme` | `'vinted'` |
| `origine` | `'vinted_sync'` |
| `vinted_item_id`, `vinted_view_count`, `vinted_favourite_count`, `vinted_status` | Tels que lus |
| `listed_at_guess` | Date de la plus ancienne photo |
| `first_seen_at`, `last_synced_at` | Dates du relevé |
| `disparu_le` | `NULL` |
| `attributs` | `{taille, etat, marque}` avec la source `vinted_liste` (`attributsDepuisListe`, `:20120`) |
| `vinted_account_id` | La boutique observée |

- **Volontairement absents** : `description` (commentaire « VOLONTAIREMENT absente de ce payload »), `vinted_catalog_id`, la couleur, `prix_achat` (NULL = inconnu).
- **Autres écritures** :
  - `vinted_listing_snapshots` : un relevé par article et par jour (prix, vues, favoris, statut), `:20541`.
  - `cross_post_jobs` : un job de suivi synthétique par article actif nouveau (`platform='vinted'`, `action='publish'`, `status='published'`, `listing_url`, `platform_listing_id`, `handler_build '… · sync-dressing'`), `:20560-20579`.
  - `vinted_sync_runs` : `items_vus`, `items_crees`, `items_maj`, `page_suivante`, `total_pages`, `total_entries`.
  - Rien dans `annonces_plateforme` (mesuré : 0 ligne `vinted`).
- **Déclencheurs en base sur `inventaire`** (définitions lues en prod) :
  - `inventaire_ecarte_import_sync` (BEFORE INSERT/UPDATE) :
    - boutique non confirmée → exception `[boutique_a_confirmer]` ;
    - boutique suivie par un autre compte → `[boutique_a_confirmer][boutique_autre_compte]` ;
    - brouillon, article sans photo, annonce d'un compte relié, ou relevé automatique en cours → ligne écartée (`sync_import_ecartes`, `RETURN NULL`).
    - Tentatives sur 30 jours : `compte_relie:leboncoin` 6 831 (2 comptes), `brouillon` 1 852 (48 comptes), `compte_relie:depop` 351, `sans_photo` 144…
  - `inventaire_attributs_fusion_trg` : fusion par priorité de source (manuel > vinted_detail > capture > vinted_liste > lens).
  - `enforce_inventory_limit` : sans effet depuis le 04/09.
  - `inventaire_rattache_recreation_vinted`, `inventaire_reconcilie_jumelle_vinted`, `inventaire_releve_garde_textes` : ce dernier refuse qu'un PATCH venu de `chrome-extension://` écrase un titre ou une description non vides.

### A5. Ce qui peut échouer à l'import

| Cas | Effet | Ce que lit la personne |
|---|---|---|
| Aucune session Vinted dans le navigateur (cause n° 1 : 44 premiers relevés sur 47 échoués en 30 jours) | `failed`, « `[cause403] session_absente` » | Encart d'échec qui demande de se connecter à Vinted |
| 401 ou 403 en cours de lecture | `interrupted`, curseur gardé | « Synchronisation mise en pause par Vinted après N articles. Vérifie que tu es bien connecté à Vinted dans ce navigateur, puis réessaie un peu plus tard — la reprise repart là où elle s'est arrêtée. » |
| Page vide ou canal coupé après au moins un article lu | `incomplete`, reprise automatique armée | « Synchronisation incomplète : X articles lus sur les N annoncés par Vinted. Vinted a cessé de répondre en cours de lecture. Ce qui a été lu est bien à jour et rien n'a été marqué « plus en ligne » — relance la synchronisation, elle repartira là où elle s'est arrêtée. » |
| Autre boutique dans Chrome | Rien n'est importé | « Ce navigateur est connecté au dressing @x que ce compte ne suit pas encore. Rien n'a été importé — c'est bien ta boutique ? » |
| Boutique d'un autre compte FillSell | Rien n'est importé | `texteBoutiqueAutreCompte` (« … déjà suivie par un autre compte FillSell. Rien n'a été importé… ») |
| Plus de 3 840 articles | `incomplete` (« garde-fou anti-boucle ») | Texte « incomplète » ci-dessus |

### A6. La fin du relevé

- « Annonces Vinted synchronisées — X articles importés, Y mis à jour. »
- Puis l'accroche (`accrocheVisible`, `StockTab.jsx:4379-4397`) : « Ces annonces ne vivent que sur Vinted. Publie-les aussi sur Leboncoin, eBay et Beebs. » Elle mène à la grille des articles.
- Le repli « En savoir plus » dit : « On lit tes annonces en ligne (titre, prix, photos, vues, favoris) et on les rattache à ton stock : un article, une fiche. Rien n'est publié, modifié ni supprimé. » et « Les articles importés arrivent avec un prix d'achat à compléter — sans lui, aucune marge ne peut être calculée. »
- **Rien ne dit que les textes ne sont pas importés.**

---

## 4. B — Obtenir la description, la couleur et le rayon plus tard

`completerTexteDuVendeur` (`src/publication/texteDuVendeur.js:121-245`) est appelée avant d'ouvrir le moteur, par le stepper comme par le lot. `aCompleter` (`:46-50`) vaut vrai si la description est vide, ou si c'est une fiche `vinted_sync` sans `vinted_catalog_id`. Les sources sont essayées dans l'ordre B1 → B2 → B3 (→ eBay).

### B1. Le relevé d'une autre plateforme (`annonces_plateforme.capture`)

- `lireReleves` (`:75-85`) lit les annonces non disparues de la fiche (8 au plus). `choisirDescriptionEnLigne` prend la plus récente encore en ligne.
- `completerFiche` (`:89-93`) écrit `{description, attributs.description_source = releve_<pf>}`, mais seulement si la fiche n'a pas encore de description (filtre `.or(description.is.null,description.eq.)`).
- Côté extension, `reporterCaptureSurArticle` complète aussi une fiche vide au moment du relevé.
- **Mesuré : 0 fiche Vinted vivante sans description n'a un tel relevé avec texte.** Pour un nouvel utilisateur qui n'importe que Vinted, ce chemin n'existe pas.

### B2. La capture de republication (`vinted_republish_captures`)

- Conditions (`:149-180`) :
  - `verdict='valide'` ;
  - `captured_at` de moins de 30 jours ;
  - même titre (comparé sans espaces de bord) ;
  - même prix (à 0,005 € près), ou prix inconnu d'un côté.
- Écritures, en une seule mise à jour : `attributs` (`attributsDepuisVinted`, source `capture`), `vinted_catalog_id` s'il manque, et `description` si elle est vide.
- **Une capture n'existe qu'après une republication Vinted** : un nouvel utilisateur n'en a pas.
- **Observé : le déclencheur `capture_vers_inventaire_attributs_trg`** (AFTER INSERT/UPDATE OF libelles, définition prod) recopie sur la fiche `taille`, `etat`, `couleur`, `couleur2`, `isbn`, `colis` et `marque` (si vide), mais **ni la description ni le rayon**. D'où les 3 377 fiches du § 2 dont le texte est en base sans être sur la fiche.

### B3. Le pont page → extension (`FETCH_VINTED_ITEM`)

**La chaîne :**
1. App : `lireDetailVintedParExtension(id, delaiMs)` (`texteDuVendeur.js:96-105`). Elle pose l'écoute (`ecouterDetailArticleVinted`, `vintedSync.js:248`), envoie `demanderDetailArticleVinted` (`vintedSync.js:243`, `postMessage {__fillsellCmd:'FETCH_VINTED_ITEM'}`) et rend `null` au bout de `delaiMs`.
   - Délais : 12 s au stepper (`DELAI_DETAIL_VINTED_MS`, `:41`) et au lecteur du Stock ; 25 s au lot (`LotPublication.jsx:525`).
2. Relais : `fillsell-auth.js:129-140` envoie `chrome.runtime.sendMessage` et renvoie `__fillsellItemDetail` à la page.
3. Background : `background.js:1696-1724` → `fetchVintedItemDetail` (`:14935`) → `withJobFlowLock("fetch-vinted-item")` (`:2553`, FIFO sans délai) → `lireDetailVintedSousVerrou` (`:14943`).
   - Il ouvre l'onglet de travail sur `{origine Vinted}/items/{id}`, puis envoie `VINTED_ITEM_DETAIL` au content script (`vinted.js:611`).
   - Le content script appelle `capturerAnnonceVinted` (`vinted.js:1763`), qui appelle `lireDetailArticle` (`vinted.js:1236`) : `GET /api/v2/item_upload/items/{id}`, l'endpoint du formulaire d'édition, que seule la propriétaire peut lire.
   - Les référentiels (catalogues, tailles, couleurs) servent à traduire les identifiants en libellés, et la page de l'annonce sert à prouver la boutique.
4. Retour dans le background : avant de répondre, il patche `inventaire?vinted_item_id=eq.{id}` avec `attributs` (`attributsDepuisDetail`, `:20128`) : `couleur`, `couleur2`, `etat`, `marque`, `categorie_vinted`, `isbn`, source `vinted_detail`, borné à 4 s. **Il n'écrit jamais la description, ni `vinted_catalog_id`.**
5. Retour dans l'app (`texteDuVendeur.js:186-215`) :
   - les attributs sont écrits via `attributsDepuisVinted`, avec `description_source` seulement si un texte existe ;
   - la `description` est écrite si elle était vide ;
   - `vinted_catalog_id` est écrit s'il manquait.

**Ce qui peut échouer** (dans chaque cas, l'app reçoit `null` ou un échec) :
- **(a) Pas d'extension dans ce navigateur** : application mobile Capacitor, autre navigateur, page ouverte ailleurs que sur l'ordinateur. `extDetailOk` est faux (`StockTab.jsx:5953-5958`, version annoncée ≥ 0.5.0) : aucune lecture, note `vinted_sans_extension`.
- **(b) Verrou de flux occupé au-delà de 12 s ou 25 s** : une publication en cours, un cycle de jobs, une republication, ou le relevé du dressing lui-même. L'app abandonne, mais la demande reste dans la file de l'extension et s'exécute plus tard (voir (g)).
- **(c) Pont mort.** L'onglet fillsell.app est resté ouvert pendant une mise à jour de l'extension : l'ancien script tombe dans `catch { /* extension rechargée : sans conséquence */ }` (`fillsell-auth.js:145`) et avale la commande. La page croit toujours l'extension présente (`extDetailOk` reste vrai), donc chaque lecture attend son délai complet. Constat de l'autre terminal le 25/10 entre 13:38 et 13:45 (commentaire de son diff non commité) ; je ne l'ai pas vérifié moi-même.
- **(d) Le compte Vinted ouvert dans Chrome n'est pas propriétaire de l'annonce** (plusieurs boutiques) : l'endpoint d'édition refuse.
- **(e) Session Vinted absente (401) ou anti-robot (403).**
- **(f) L'annonce n'a pas de description chez Vinted** : réponse `success` sans texte, et l'app note `vinted_echec`. Le libellé est trompeur : ce n'est pas un échec.
- **(g) Réponse tardive** : le background écrit les attributs, l'app n'écoute plus, et la description est perdue (cas observé, § 8).

### B4. La lecture d'origine demandée et retenue par le serveur

- **Demande.**
  - `demanderLectureOrigine` (`src/publication/lectureOrigine.js:61-68`) appelle `rpc demander_lecture_origine(p_fiche)` (définition prod).
  - La RPC fait un upsert dans `lectures_origine_demandees (user_id, inventaire_id, plateforme, demandee_le, faite_le, essais)`. Une demande n'est réarmée que si elle était faite, ou si elle a plus de 15 min.
  - Pour Vinted, elle rend `{reason:'lecture_par_l_extension'}`. Pour Leboncoin, Beebs, Depop et eBay, elle pose un relevé `vinted_sync_runs` (`kind='annonces'`, `declencheur='serveur:lecture_origine'`).
- **La règle** : `lectureOrigineEnAttente` (`supabase/functions/_shared/contenu-fiche.js:121-152`), partagée par l'app et le serveur.
  - Vinted : on attend tant que la description fait moins de 2 mots.
  - L'attente cesse dans trois cas : `descriptionLueLe` existe, ou `origineLueLe` existe, ou la fiche a disparu de Vinted (`disparu_le`).
  - **Il n'y a aucune limite de durée pour Vinted.**
- **Deux lectures de cette règle :**
  - **Serveur** : `fiches_contenu_vendeur` calcule `description_lue_le` comme le plus récent de `attributs.description_source.at` et de `inventaire_journal` (champ `description`). `origine_lue_le` vaut `max(lectures_origine_demandees.faite_le)`.
  - **App** : `attenteLectureOrigine` (`lectureOrigine.js:39-58`) ne prend que `attributs.description_source.at` (`:55`) et la `faite_le` de la demande. L'app est donc plus stricte que le serveur (écart sans effet mesuré).
- **Les lecteurs :**
  - **Extension, lecture de fond.** `lireAnnoncesOrigineEnAttente` (`background.js:2629-2670`) et `lectureOrigineDemandeeRecente` (`:2624-2628`) sont appelées dans le poll (`:3341-3345` avant la boucle des tâches, `:3556` après). Elles lisent au plus 3 articles par cycle, espacés de 8 à 20 s, sous le verrou déjà tenu.
    - Elles écriraient les attributs et la description (si vide), puis fermeraient la demande « avec ou sans texte » (`:2666`).
    - **En prod, elles ne lisent jamais rien**, à cause du défaut ci-dessous.
  - **App, lecteur du Stock.** `useLecturesOrigine` (`lectureOrigine.js:75-122`), monté par `StockTab.jsx:5952` :
    - il relit `rpc lectures_origine_en_attente` toutes les 60 s quand l'onglet est visible ; `maxMs` = 15 min est le plafond de l'attente quand la base peine, pas une durée de vie ;
    - si `extensionVinted` est vrai, il lit un article à la fois (8 à 20 s d'écart, 12 s de délai), **20 au plus par montage** (`:92`) ;
    - il **ne ferme la demande que si une description a été trouvée** (`if (res?.source)`, `:112`).

**Le défaut de `restRequest`** (observé). `background.js:13448-13489` pose par défaut `Prefer: return=minimal` (`:13460`), puis :

```js
const prefer = String(init.headers?.Prefer ?? "");
if (init.method && init.method !== "GET" && !prefer.includes("return=representation")) return null;
```
(`:13486-13487`)

Conséquence : tout POST vers une fonction SQL sans `return=representation` reçoit `null`, même si la fonction a rendu des lignes. Introduit avec `lireAnnoncesOrigineEnAttente` par `241b456` (0.6.130, 22/10 soir). Présent à l'identique dans la copie 0.6.141 (`scratchpad/bg_0141.js:13400`) et dans `d9e1819` (0.6.143).

**Tous les appelants `restRequest("rpc/…")` du background :**

| Ligne | RPC | `return=representation` ? | Usage du résultat | Conséquence |
|---|---|---|---|---|
| 1270 | `noter_formats_colis_beebs` | non | `nouveaux: Number(n) \|\| 0` | La fonction s'exécute (les formats sont notés) ; seul le compte rendu est faux (toujours 0). Pas d'effet visible connu. |
| 2592 | `file_etat_poste` | non | `r?.pause`, `r?.synchro_demandee` | Toujours faux. Entre deux tâches, ni une pause posée dans l'app après le service de la file, ni une synchro demandée depuis un autre appareil (file `queued` de moins de 10 min) n'arrêtent le cycle. Seul le clic local (`syncDemandeeLocale`) marche. La pause reste appliquée par `get-pending-jobs` au poll suivant. |
| 2625 | `lectures_origine_en_attente` (`lectureOrigineDemandeeRecente`) | non | `.some(…)` | Toujours faux : la lecture ne passe jamais « devant la file ». |
| 2633 | `lectures_origine_en_attente` (`lireAnnoncesOrigineEnAttente`) | non | Boucle de lecture | `null`, puis `[]` : aucune lecture, aucune trace, aucune demande fermée. |
| 2666 | `lecture_origine_faite` | non | Aucun (fonction sans retour) | Sans effet, et jamais atteint. |
| 21093 | `palier_de` | oui | Chaîne du palier | Correct. |
| 21302 | `` `rpc/${nom}` `` (`rpcMessagerie`) | oui | Lignes | Correct. |
| 28087 | `platform_settings_fusionner` | oui | — | Correct. |

Les RPC appelées par `fetch` direct lisent elles-mêmes `res.json()` et ne sont pas touchées : `rapprocher_releve` (`:17624`), `enregistrer_ventes_relevees` (`:18232`), `commandes_vinted_noter` (`:21048`), `spend_coins_and_republish` (`:28114`).

---

## 5. C — Le clic : de « Publier » au job créé

### C1. À l'unité (le stepper)

1. **Carte du Stock** : bouton « Publier partout » (`src/stock/regles.js:93`), ou menu « Publier » avec la ligne « Sur Leboncoin, eBay… ». Il appelle `publierArticle(item, d)` (`StockTab.jsx:9645-9652`).
   - Si tout est déjà en ligne, ou si une autre lecture est en cours (`detailFetchId`), **le clic ne fait rien, sans message**.
   - eBay seul par l'API : `publierAvecDetail`.
   - Extension jamais vue : écran d'accroche (`ExtensionPitchScreen`), puis « Continuer ».
   - Sinon, un rappel d'extension peut s'afficher, puis « Continuer ».
2. **`publierAvecDetail`** (`StockTab.jsx:5980-6031`) :
   - Fiche non importée et rien à compléter : le stepper s'ouvre directement (`:5999`).
   - Sinon, le bouton devient « Récupération… » et se désactive (`:9784`). L'app appelle `completerTexteDuVendeur` (12 s), puis `attenteLectureOrigine`.
   - **Si la fiche attend sa lecture** : `demanderLectureOrigine` est appelée sans attendre la réponse, et une bulle s'affiche 7 s (`montrerNoteDetail`, `:5976-5979`, rendue `:12025-12030`). La fonction s'arrête là : **le stepper ne s'ouvre pas et aucun job n'est créé** (`:6016-6020`). La bulle dit :
     > « En cours de lecture de ton annonce d'origine Vinted (texte, photos, état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue. »
   - Sinon, le stepper s'ouvre, éventuellement avec une note : « La description Vinted sera récupérée quand l'extension sera à jour — tu peux la compléter à la main en attendant. » ou « La description Vinted n'a pas pu être récupérée cette fois — les photos sont là, tu peux compléter le texte à la main. » Ces deux notes sont rares sur une fiche Vinted, puisqu'une description vide déclenche l'attente.
3. **Le stepper** (`ListingPreviewScreen` en variante « nouvelle », `src/publication/StepperNouveau.jsx`) :
   - Écran 1 « Où publier ? » : « Coche au moins une plateforme », « Rédiger l'annonce · N plateformes ».
   - Écran 2 « Vérifier » : « Rédaction en cours… », « Réessayer la rédaction », « Continuer · N questions ». La rédaction passe par `generate-listing`, puis `spend_coins_for_generate` (quota d'annonces : refus `quota_annonces_atteint` 402, et la fenêtre des offres s'ouvre).
   - Écran 3 « Confirmer » : `ctaLabel()`.
   - Au clic, `supabase.rpc("spend_coins_and_publish", {p_photo_option, p_jobs: rows})` (`ListingPreviewScreen.jsx:10850`). En variante « nouvelle », une plateforme refusée `already_published` est retirée et l'appel est relancé une fois.
   - Erreurs affichées : « Le serveur a refusé la publication (…). Rien n'a été décompté — réessaie dans un instant. », la fenêtre de quota (`insufficient_coins`), le message de pause de la plateforme (`platform_paused`), `messageRefusPublication` (`already_published`), ou le `message` du serveur tel quel.
   - **Le moteur ne revérifie pas la lecture d'origine au clic** : la barrière est à l'ouverture, puis au serveur (D).

### C2. En lot (`src/publication/lot/LotPublication.jsx`)

0. **Entrée.** « Publier plusieurs articles », « N articles pas encore partout », bouton « Publier N articles », avec la note « Tu choisis ensuite les plateformes : rien ne part avant ta confirmation. » (`StockTab.jsx:11735-11760`).
1. **Écran 1 « Où les publier ? »**
   - Boutons : « Lecture de tes articles… », « Coche au moins une plateforme », « Ton quota du mois est utilisé », « Continuer avec N articles » (quand le quota ne couvre pas tout), « Préparer N annonces » ; avec « Rien ne part encore : on prépare, tu vérifies. »
   - Quotas d'annonces (`coin_config`) : gratuit 5, Premium 40, Pro 120, Business 300 par cycle. Tous les prix sont à 0, donc `spend_coins_and_publish` ne débite rien.
2. **Écran 2 « Avant l'envoi » — `preparer()`** (`:466`). Les articles déjà complets vont directement au moteur ; les autres passent d'abord par la lecture.
   - **Lecture** (`:508-559`) : un seul lecteur. Pour Vinted, 8 à 20 s d'écart depuis la fin de la lecture précédente, puis 25 s de délai. La ligne dit « Lecture de ta description sur Vinted, au rythme de tes dépôts… » (`TEXTE_LECTURE`, `:112`).
   - Puis `attenteLectureOrigine`. **Si l'article attend** : `demanderLectureOrigine`, phase `origine`, étiquette « Lecture de ton annonce d'origine », et le même texte « En cours de lecture… elle partira… » sous l'article, sans indicateur de chargement (`:551-555`).
   - Les autres articles passent par `montage` → `redaction` → `verification` → `pret` ou `questions` (3 moteurs en même temps, `PREPARATIONS_SIMULTANEES`).
   - **Phases et étiquettes** (`LIBELLE_PHASE`, `:92`) :

     | Phase | Étiquette |
     |---|---|
     | `attente` | En attente |
     | `lecture` | Ta description… |
     | `montage` | Lecture… |
     | `redaction` | Rédaction… |
     | `verification` | Vérification… |
     | `pret` | Prêt |
     | `questions` | À toi de jouer |
     | `quota` | Reste au stock |
     | `rien` | Ne part pas |
     | `erreur` | Pas préparé |
     | `retire` | Retiré du lot |
     | `envoi` | Envoi… |
     | `envoye` | En file |
     | `refuse` | À toi de jouer |
     | `origine` | Lecture de ton annonce d'origine |

   - **Bouton** (`:1018-1035`) :
     - Pendant la préparation (articles en `attente`, `lecture`, `montage`, `redaction` ou `verification`) : « Préparation… X sur N » désactivé, avec « Tu peux déjà répondre ci-dessous dès qu'une question apparaît. »
     - Puis : « Réponds aux questions pour envoyer » (désactivé s'il n'y a aucun article prêt), « Envoyer les N prêts (M annonces) », ou « Envoyer M annonces » ; avec « L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre. »
   - **Relecture des articles en `origine`** (`:731-756`) : toutes les 60 s quand l'onglet est visible, jusqu'au début de l'envoi. Elle ne fait que vérifier `attenteLectureOrigine` ; elle ne lit rien elle-même.
3. **Envoi** (`envoyerUnParUn`, `:774-816`) : « Mise en file… X sur N », avec « Garde cet écran ouvert quelques secondes. »
   - Pour chaque article prêt : `m.publier()` (le même `spend_coins_and_publish` que le stepper, avec la marque `platform_fields.lot_publication`), puis une attente de 10 s au plus (`:788`).
   - Sinon : phase `refuse`, « Le serveur n'a pas confirmé — rien n'a été créé pour cet article. » (`:809`).
   - Après coup : `bulk_batch_id`.
4. **Écran 3 « C'est parti »** : « N annonces en file » ou « Rien n'est parti ».
   - Bloc « Laissés de côté — rien n'est perdu ».
   - Le bouton « Ouvrir » n'existe que pour `questions`, `retire`, `refuse` et `erreur` (`:1647`) : **pas pour `origine`**.
   - Bouton « Retour au stock », avec « Tu suis le lot en haut de ton Stock. »

### C3. Ce que vérifie `spend_coins_and_publish` (définition prod)

Dans l'ordre :
1. `auth.uid()` existe, sinon `unauthorized`.
2. `p_photo_option` vaut `original`, `ia_light` ou `ia_advanced`.
3. 1 à 5 jobs (`invalid_jobs`).
4. Une plateforme en pause (`platform_health.paused`) : `platform_paused`, avec les messages en français et en anglais.
5. `inventaire_id` présent (`missing_inventaire_id`).
6. Pas de job vivant ni publié (sans retrait fait) sur la même fiche et la même plateforme (`already_published`).
7. Pas de fiche jumelle d'un compte relié occupant la plateforme (`already_published` + `compte_relie`).
8. Prix lus dans `coin_config` (`price_not_configured`) ; débit si le prix dépasse 0 (aujourd'hui toujours 0), et `insufficient_coins`.
9. INSERT `cross_post_jobs` (`status='pending'`, `title`, `description`, `price`, `photos`, `platform_fields`, `reservation_id`). Un `unique_violation` rend `already_published` et rembourse.
10. Mise à jour de `inventaire.photos` avec la liste la plus longue (jamais une liste plafonnée par Leboncoin).
11. `coin_ledger` et `usage_logs` (`publish`).

**La RPC ne vérifie ni la lecture d'origine, ni l'extension.** Les variables `v_ext_seen` et `v_ebay_api_seul` sont calculées mais jamais utilisées.

---

## 6. D — Côté serveur, un job pour une fiche dont l'origine n'est pas lue

**Règle « le contenu du vendeur part tel quel »** (`supabase/functions/get-pending-jobs/index.ts:2508-2637`, à chaque poll de l'extension, hors popup) :
- **Candidats** : les `publish` et `republish`, sauf les republications Vinted (recréées depuis la capture) et les republications dont le retrait est engagé.
- La fonction appelle `fiches_contenu_vendeur` (`:2531`, au plus 200 fiches distinctes par poll, `:2529`), puis `lectureOrigineEnAttente` (`:2553`).
- **En attente** :
  - le job reste `pending` et sort de la liste servie ;
  - `platform_fields.attente_lecture_origine = {depuis, plateforme, manque, pose_par}` et `error = messageLectureOrigine(…)` sont écrits une seule fois (`:2558-2563`) ;
  - pour Leboncoin, Beebs, Depop et eBay, un relevé est demandé (`:2619-2632`) ; **pour Vinted, rien n'est demandé côté serveur** : le serveur compte sur `lireAnnoncesOrigineEnAttente`, qui ne lit rien (B4).
- **Lue** : la marque est effacée et `error = null`. `contenuAImposer` peut alors imposer la description, l'état ou les photos de la fiche.
- **Côté app**, le job s'affiche dans « En file » (`_shared/etat-job.js:226`, `src/utils/fileDesJobs.js:194-200`) : « En cours de lecture de ton annonce d'origine Vinted (texte, photos, état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue ».
- **Durée** : aucune limite pour Vinted. L'attente cesse à la première de ces conditions :
  - une description d'au moins 2 mots ;
  - `description_lue_le` ;
  - `faite_le` ;
  - `disparu_le`.
- **Plafond de 200 fiches** (observé, code) : au-delà de 200 fiches distinctes dans un même poll, les jobs des fiches suivantes n'ont pas de ligne dans `ficheDe`. Ils passent par `if (!f) continue;` (`:2551`) et sont servis sans contrôle d'origine ce cycle.
- **État mesuré à 13:50** : 0 job retenu. Les barrières de l'app (stepper, lot) empêchent aujourd'hui la création de ces jobs.

**« La lecture passe devant la file »** (`:6758-6782`, v282, depuis le 25/10 à 12:10) :
- Condition : une demande `lectures_origine_demandees` Vinted non faite, `essais < 3`, posée il y a moins de 15 min, pour une extension ≥ 0.6.130 sans pause anti-robot.
- Effet : `out = out.filter(passeAvantLaSynchro)` (`:6776`). Toutes les publications et republications du compte sont retenues ce cycle ; seuls les retraits et les republications déjà retirées partent. Le compteur est renvoyé dans `lectures_origine_devant`.
- Comme l'extension ne lit pas (B4), **la file du compte est gelée pendant 15 min après chaque demande**, sans message particulier sur les jobs : ils affichent seulement « En file : elle partira à son tour ».
- Dans un lot, chaque article qui passe en `origine` repose une demande. Les annonces envoyées à la fin de ce même lot attendent donc au moins 15 min après la dernière demande.
- `essais` ne monte que par `lecture_origine_faite`. Une demande jamais lue ne sort donc jamais du critère `essais < 3` : seule la fenêtre de 15 min la borne.
- Une seule demande depuis 12:10 (compte `53efea05`, 12:44:39), sans tâche en file : effet non observé.

---

## 7. E — Les attentes sans issue ou sans message (conditions exactes)

| # | Où | Condition | Ce que voit la personne | Issue réelle |
|---|---|---|---|---|
| E1 | Stepper | Fiche `vinted_sync` dont la description fait moins de 2 mots ; pas de `attributs.description_source.at`, pas de `faite_le`, pas de `disparu_le` ; et la lecture B3 échoue (cas a à g) ou ne trouve pas de texte | « Récupération… » jusqu'à 12 s, puis la bulle de 7 s « En cours de lecture… elle partira avec TON contenu dès que… », et le stepper ne s'ouvre pas | Aucun job. Chaque nouveau clic refait la même chose (et pose une nouvelle lecture côté extension). Seule issue manuelle : taper une description dans « Modifier l'article » (`App.jsx:9163`, qui pose `description_source = manuel`). Aucun message ne le propose. |
| E2 | Stepper | Clic sur « Publier partout » d'un autre article pendant `detailFetchId` (au plus 12 s, plus les lectures en base) | Rien | Clic ignoré sans message (`StockTab.jsx:9646`, `:6000`). |
| E3 | Lot, écran 2 | Au moins un article en `attente`, `lecture`, `montage`, `redaction` ou `verification` | « Préparation… X sur N » désactivé | Les lectures Vinted sont l'une après l'autre : environ 8 à 20 s d'écart, plus jusqu'à 25 s chacune, soit 45 s au plus par article sans texte. *Estimation tirée des constantes* : environ 18 s par article si l'extension répond, environ 39 s sinon, donc 40 articles ≈ 12 à 26 min avant de pouvoir envoyer. Impossible d'envoyer les articles déjà prêts plus tôt. |
| E4 | Lot, écran 2 | Tous les articles restants sont en `origine` (sur téléphone ou sans extension, c'est le cas dès la lecture) | Tuiles 0 / 0 / 0 ; bouton « Réponds aux questions pour envoyer » désactivé, alors qu'aucune question n'est affichée ; sous chaque article, « Lecture de ton annonce d'origine » | Personne ne lit (la relecture de 60 s ne fait que vérifier). Sortie : « Quitter ». |
| E5 | Lot, écran 3 | Article resté en `origine` à l'envoi | Dans « Laissés de côté — rien n'est perdu » : « … elle partira avec TON contenu dès que… », sans bouton « Ouvrir » | Aucun job : rien ne partira de lui-même. |
| E6 | Stock, bandeau | Toute ligne de `lectures_origine_en_attente` : demande ouverte de moins de 7 jours, ou job retenu | « N articles : lecture de leur annonce d'origine », puis « Ils partiront avec TON texte, TOUTES TES photos et TON état dès que l'annonce d'origine aura été lue (…). Rien à faire. » | Aucun départ pour les demandes sans job. Le bandeau compte aussi des demandes déjà satisfaites mais jamais fermées (cas `53efea05` : texte de 526 caractères, 2 jobs créés), jusqu'à 7 jours. |
| E7 | Stock, lecteur | `useLecturesOrigine` : plus de 20 lectures par montage, ou annonce sans texte chez Vinted | Le bandeau d'E6 reste | Le lecteur s'arrête en silence après 20 essais ; une annonce sans texte n'est jamais fermée (`:112`). Il ne lit que si l'onglet Stock est affiché, visible, et que l'extension est dans ce navigateur. |
| E8 | Serveur, file | Job `publish` ou `republish` non-Vinted d'une fiche Vinted sans texte (créé avant le 22/10, ou par un chemin sans barrière) | « En file » : « En cours de lecture… dès que l'extension… l'aura lue » | Retenu sans limite : la lecture par l'extension ne se fait jamais (B4). Aucun job dans ce cas aujourd'hui. |
| E9 | Serveur, v282 | Demande Vinted de moins de 15 min, non faite, extension ≥ 0.6.130 | Les jobs du compte restent « En file : elle partira à son tour » | Toute la file publications et republications est retenue 15 min après chaque demande, pour une lecture qui n'a pas lieu. |
| E10 | Extension, entre deux tâches | Pause posée dans l'app pendant un cycle, ou « Synchroniser » depuis un autre appareil pendant un long cycle | La synchro demandée au téléphone attend ; « Ton ordinateur ne répond pas… » au bout de 3 min | `file_etat_poste` est lue nulle : le cycle va jusqu'au bout. La pause ne s'applique qu'au poll suivant ; la synchro distante passe au poll suivant. |
| E11 | Pont | Réponse au-delà de 12 ou 25 s (verrou tenu par une publication, une republication, ou le relevé du dressing qui vient d'être lancé) | Comme E1 ou E4 | La lecture est faite quand même plus tard par le background (attributs écrits), mais la description est perdue. |
| E12 | Pont | Onglet fillsell.app ouvert avant une mise à jour de l'extension | Comme E1, E3 ou E4, avec le délai complet à chaque fois | Commande avalée (`fillsell-auth.js:145`) ; la page n'est pas prévenue. |
| E13 | Lot, envoi | `m.publier()` ne finit pas en 10 s (`:788`) | « Le serveur n'a pas confirmé — rien n'a été créé pour cet article. » | *Hypothèse de risque* : si la RPC aboutit après 10 s, un job existe malgré le message. Un nouvel essai serait refusé (`already_published`). |

Attentes bornées et dites (pour mémoire) :
- le repli du relevé par la file à 10 s ;
- « Ton ordinateur ne répond pas… » à 3 min ;
- le filet de 45 s en phase `verification` ;
- 60 s par page de dressing ;
- 45 s par requête REST (`REST_DELAI_MAX_MS`).

La durée de la rédaction (`generate-listing`) n'a pas été auditée ici.

---

## 8. Cas observés en base

- **Compte `ed4d2d4e`** (Pro, extension 0.6.131, vue la dernière fois le 24/10 à 22:45) :
  - **Le lot.** Le 24/10, 29 demandes ont été posées entre 18:58:40 et 19:01:05 (articles passés en `origine`). Le lot `f51d2e21` est parti entre 19:05:53 et 19:06:28 : 35 Leboncoin, 35 eBay, 30 Beebs, tous `published`.
  - **Les 29 articles en `origine`** ont toujours une description vide ; 28 n'ont jamais été lus.
  - **L'article 29, fiche `1791733456931000`** :
    - attributs `vinted_detail` écrits le 24/10 à 22:15:30 (couleur, couleur2, marque, catégorie) ;
    - capture de republication `valide` le 24/10 à 22:16:47, avec **446 caractères de description** et `catalog_id` 221 ;
    - la fiche est pourtant toujours sans texte et sa demande toujours ouverte, parce que le déclencheur de capture ne recopie pas la description (B2).
- **Compte `53efea05`** (payant, extension 0.6.141) :
  - **Fiche `1792780708414005`** : demande le 24/10 à 13:54:41, description lue à 13:54:58 (526 caractères, `description_source` = `vinted_detail`), 2 jobs créés ensuite. La demande n'a jamais été fermée : elle compte dans le bandeau du Stock (E6).
  - **Fiche `1792928353086006`** : demande le 25/10 à 12:44:39. Attributs `vinted_detail` écrits à 12:47:55 (couleur, couleur2, categorie_vinted ; ni taille ni état en `vinted_detail`). Description vide, `vinted_catalog_id` NULL.
  - *Hypothèse la plus probable* : la lecture a été faite par le background après l'abandon de l'app, et la description a été perdue (E11). Autre lecture possible : annonce sans texte avec un rayon déplacé (seul `catalog_id_depot` serait présent).
- **Compte `447d920c`** : 5 demandes closes le 25/10 à 10:50:39 sans passer par `lecture_origine_faite` (`essais = 0`). *Hypothèse* : réparation par script.

---

## 9. Hypothèses et questions ouvertes (pour Nico)

**Hypothèses à vérifier :**
- **H1.** La fiche `1792928353086006` est un cas de description perdue par réponse tardive. À confirmer par la trace de la 0.6.143 ou par l'horodatage du poll.
- **H2.** La baisse du volume publié ailleurs depuis le 22/10 vient de la barrière « origine d'abord ». Aucun journal ne compte aujourd'hui les articles laissés en `origine` (stepper ou lot).
- **H3.** Vinted accepte-t-il une annonce sans description ? Non vérifié. Si oui, les annonces sans texte restent bloquées pour toujours (E1, E7).

**Questions de règle (rien n'est implémenté) :**
- **Q1.** Une lecture faite par le stepper ou le lot doit-elle fermer la demande qu'ils ont posée ? Une lecture réussie sans texte doit-elle fermer comme le prévoit l'extension (« lue = close, avec ou sans texte ») ?
- **Q2.** Le déclencheur `capture_vers_inventaire_attributs` doit-il aussi recopier la description et le rayon d'une capture `valide` sur une fiche vide ? Cela concerne 3 377 fiches et 97 comptes.
- **Q3.** Le message d'attente doit-il cesser de promettre un départ (« elle partira… », « Rien à faire ») tant qu'aucun job n'existe, et proposer la saisie dans « Modifier l'article » ?
- **Q4.** Le lot doit-il permettre d'envoyer les articles prêts pendant que d'autres sont encore en lecture, et proposer « Ouvrir » sur un article en `origine` ?
- **Q5.** La retenue « la lecture passe devant » (v282) doit-elle rester active tant que l'extension servie ne sait pas lire en fond ?

---

## 10. Travaux en cours vus dans l'arbre de travail (non commités, pour information)

À 14:06, un autre terminal avait modifié, sans committer :
- `chrome-extension/background.js` : notamment `restRequest`, qui rend désormais le résultat de tout `rpc/…` (`appelRpc`), « 0.6.144 — Louis ».
- `chrome-extension/content-scripts/fillsell-auth.js` : le pont survit à une mise à jour, nouvelle commande `FETCH_VINTED_PUBLIC`, signal `__fillsellPontMort`.
- `src/publication/texteDuVendeur.js` : le pont est sondé en 1,5 s ; la page publique de l'annonce est lue d'abord, le formulaire d'édition seulement en repli.
- `src/utils/vintedSync.js`, `src/publication/lot/LotPublication.jsx`, `lot.css`, `src/tabs/StockTab.jsx`, `supabase/functions/get-pending-jobs/index.ts`.
- Nouveau fichier : `supabase/functions/_shared/lecture-fond.js`.

Rien de tout cela n'est servi. Cet audit décrit `d9e1819`, la version en prod.
