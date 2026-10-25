# Balayage des lignes visibles en erreur sur les comptes actifs (dimanche 25/10/2026, vers 14:00 heure de Paris)

Le principe de Nico : la personne ne voit que ce qui demande vraiment un geste de sa part (connexion, choix qui lui revient). Le reste se clôt ou se rattrape seul, avec un état vrai.

**Méthode (lecture seule).**
- La base n'a été lue qu'en SELECT (`q.sh`).
- Les règles d'affichage ont été reconstituées en SQL : le « dernier job » de chaque écran, avec `distinct on` et le même tri que l'app (`created_at desc, id desc`).
- Le classement d'état a été réévalué hors ligne en important, sans rien écrire, les modules du dépôt : `_shared/etat-job.js`, `src/utils/shared.js`, `src/utils/publicationState.js`, `_shared/lbc-identite.js`, `_shared/lbc-forfait.js`, `_shared/vendeur-depop.js` et `_shared/attente-autre-boutique.js`.
- Les scripts de ce calcul sont dans le dossier scratchpad `agents2/` : `eval.mjs`, `final.mjs` et `sql/*.sql`.
- Aucun fichier du dépôt n'a été touché.

**Approximations, à garder en tête :**
- « masquée » (`vintedMasqueeMalgreJobs`) est lue sur `vinted_status in (hidden, draft)` sans sa garde de fraîcheur ;
- `republishActif` est supposé vrai (web, ou poste capable) ;
- Opla est supposée fermée pour tous, donc ses jobs sortent de la carte (StockTab.jsx:9217) ;
- trois choses ne sont pas simulées : Leboncoin fermé pour une adresse hors de France (`plateformesFermees`), les plateformes en pause et « extension à mettre à jour ».

**Légende :**
- **OBSERVÉ** : lu dans la base ou dans le code.
- **HYPOTHÈSE** : inférence, dite comme telle.

> **Références de lignes = commit HEAD d9e1819.** Pendant l’analyse, un AUTRE terminal modifiait le dossier partagé (StockTab.jsx +5 lignes vers la ligne 6022 ; background.js, LotPublication.jsx, get-pending-jobs, vintedSync.js… ; nouveaux fichiers lecture-fond.js et lecture-page-publique-selftest.mjs). Dans la copie de travail, les lignes de StockTab.jsx au-delà de 6022 sont décalées de +5. Rien de tout cela n’est de moi : je n’ai écrit que dans le scratchpad.

---

## 1. Ce que l'app montre comme erreur ou attention (règles exactes)

### Lecture commune du Stock
- **OBSERVÉ.** Le Stock lit tous les jobs du compte, sans fenêtre de temps, page par page (StockTab.jsx:8376-8413).
- Statuts lus (`STATUTS_LUS`, src/stock/jobsIncrementaux.js:18) : pending, processing, published, failed, needs_user, deleted, cancelled, dry_run_completed. Le statut `sold` n'est pas lu.
- Fiches : seulement `inventaire.fusionne_dans IS NULL` (App.jsx:3393).
- Les fiches « à vérifier » sont écartées des articles (App.jsx:3415-3417).
- Le « stock » est `statut = 'stock'` (App.jsx:3955).

### S1 — Pastille de la carte d'un article en stock (StockTab.jsx:9544-9637)

**Publications** (StockTab.jsx:9241-9248) :
- On prend les jobs `action = publish`, hors cancelled et dry_run_completed.
- On retient le plus récent par plateforme, selon `created_at` (9341-9345).
- S'il est `failed` :
  - pastille rouge « pas partie » (`echec`) ;
  - ou ambre « à régler » quand `jobActionRequise` (shared.js:190-207 : regex de connexion, anti-robot, adresse…) ;
  - code : 9348 et 9593-9603.
- S'il est `needs_user`, pastille ambre « à régler » (9353-9367, 9604-9613), sauf dans trois cas :
  - nature « en cours » (`last_diagnostic.quoi` vaut vinted_depot_incertain ou lbc_depot_incertain, shared.js:223-234) ;
  - Opla parquée et déjà autorisée (9362) ;
  - `attenteAutomatique` → gris « En pause » (9366, 9623-9626).
- Un `pending` dont **tous** les jobs attendent une connexion (`attente_session` et texte « En attente de ta connexion à… », StockTab.jsx:384-388) donne une pastille ambre « à régler » (9571-9574).
- ⚠ Les **republications ne comptent pas** dans ce « dernier job ». Une publication en échec que suit une republication réussie reste donc rouge (cas B3).

**Emplacement de republication** (prioritaire sur le reste) :
- Le job lu est la dernière republication, **tous statuts confondus, cancelled compris** (9243-9250).
- L'emplacement n'apparaît que si la fiche Vinted est republiable (`vinted_item_id`, ni disparue, ni vendue, ni masquée : 9254-9255, 9306).
- Le texte vient de `etapeRepublication` (StockTab.jsx:4984-5262) :
  - `needs_user` → ambre « À toi de jouer », ou « Hors ligne — republier » à l'étape deleted (5148-5186). **`attenteAutomatique` n'y est jamais consulté** ;
  - `failed` ou `cancelled` → bleu « Arrêtée », ambre « Hors ligne — arrêtée » (deleted) ou bleu « Plus en ligne » (404) (5099-5132) ;
  - `pending` avec une attente de connexion ou de boutique → ambre (5042-5069) ;
  - étape `recreated` ou `published` → l'emplacement se libère (5084-5089).
- Seuls deux cas masquent l'emplacement :
  - `arret_utilisateur` ou `gel_livres_leve_le` (4993 ; publicationState.js:375-384) ;
  - le gel (5070) : bleu.

**Action principale « Régler »** (9753-9786) :
- Elle vise `republishAReprendre` : la **dernière republication en needs_user, quelle qu'elle soit** (src/utils/republication.js:97-104).
- Donc une attente automatique devient elle aussi « Régler ».

### S2 — Les lignes de « À régler » (StockTab.jsx:8960-9045)

- **« Annonces qui attendent ton geste »** = `attenteAction` (7315-7363) :
  - **le dernier job par (article, plateforme, action)**, pour publish et republish (`cleActivite` 4902, `activiteParCle` 7210-7222). Ici, **cancelled compte comme dernier job** : une annulation postérieure efface un échec ;
  - entre : `needs_user` hors `attenteAutomatique` (7329), ou `failed` ;
  - sortent : `arret_utilisateur` et le gel (7319), les attentes LBC identité, LBC forfait et vendeur Depop (7321-7325) ;
  - la fiche doit être en stock (7333) ;
  - le compte apparaît en 8941 et le texte en 9027-9029.
- **Cartes « une par compte »** (7172-7197) :
  - LBC nom et prénom (`attendIdentiteLbc` : quoi = lbc_escrow_identite) ;
  - LBC forfait pro (`attendForfaitLbc` : quoi = lbc_options_payant_seulement ou lbc_valider_et_payer, compte prouvé pro) ;
  - Depop vendeur (`attendVendeurDepop`) ;
  - condition : la fiche existe (stock ou vendue). Ces cartes n'ont pas de fenêtre de temps.
- **Retraits** (7139-7166 ; src/utils/retraitsBloques.js) :
  - on prend le dernier retrait par annonce ;
  - murs : connexion, compte bloqué, boutique, ordinateur éteint, et « en retard » (plus de 24 h sur un article vendu, 171-183) ;
  - la ligne d'un article vendu encore en ligne est **rouge**, sauf quand tous ses murs sont « boutique » ou « à retirer » (retraitsBloques.js:595-597) ;
  - les retraits `failed` ne s'affichent jamais.
- **Questions « Vendu, encore en ligne — retirer ? »** : jobs cancelled avec `pending_removal: true`, non reportés (App.jsx:3598-3610, rapporté par l'agent de lecture) ; c'est un choix de la personne.

### S3 — Le filtre « À régler » de la liste
- Code : `infoFiltre` (StockTab.jsx:7595-7612) et `etatPlateformes` (stockFiltres.js:233-297).
- Règle : le dernier état de chaque plateforme sur **publish et republish**, où `cancelled` **n'efface pas** l'ardoise (275-288).
- Deux défauts : les attentes automatiques y comptent, et un échec suivi d'une annulation y reste.

### S4 — La pastille ambre de l'onglet « Stock IA »
- Code : App.jsx:3433-3439, affichée en 8410-8412 et 10068-10070.
- Requête : `status = 'needs_user'` et `inventaire_id` non nul, limitée à 1000 lignes.
- Elle compte les **articles distincts**, sans aucun filtre :
  - attentes automatiques, plateforme écartée, `introuvable_a_confirmer` ;
  - articles vendus, fiches supprimées, retraits ;
  - murs de compte.
- **C'est la surface la plus « large ».**

### S5 — « Ta file » (FileDesJobs), groupe « À toi de jouer » (ambre)
- Règle : `etatJob` = A_TOI (etat-job.js:175-260), sur tous les jobs vivants (FileDesJobs.jsx via StockTab.jsx:12053-12058), y compris ceux des articles vendus ou supprimés.
- `failed` n'y apparaît jamais (`jobFini`, etat-job.js:160-166).
- Les attentes automatiques y sont bien en « En pause » (113-127).

### S6 — Suivi du lot
- La ligne en haut du Stock suit le lot le plus récent (`platform_fields.lot_publication`). Elle disparaît après 7 jours, ou 6 h après la fin du lot s'il ne reste aucun geste (StockTab.jsx:7676-7694).
- `suiviDuLot` garde le dernier job par plateforme et par article (regles.js:333-338).
- `etatJobLot` (regles.js:356-371) :
  - **tout `needs_user` devient « geste »**, sans consulter `attenteAutomatique` ;
  - **tout `failed` et tout `cancelled`** devient « À toi de jouer · pas parties » (SuiviLot.jsx:23 et 35), sauf trois cas : `arret_utilisateur`, une clôture « hors France », ou un `published_at`/`listing_url` présent.

### S7 — JobStatusModal (statut d'un article)
- Les lignes montrent le dernier job par plateforme, s'il est pending, processing, needs_user ou failed (StockTab.jsx:2258-2270).
- ⚠ La **bannière compte TOUS les jobs** de l'article (2171-2180) : un vieil échec déjà dépassé produit encore « Publication arrêtée — 1 est arrêtée » (2201-2224).
- `failed` s'y dit « À toi de jouer » (2245-2252).

### S8 — Écrans de l'agent de lecture, non relus ligne par ligne
- EcranSuivi : juste après une publication, `created_at` ≥ départ − 60 s (EcranSuivi.jsx:63-72). `failed` y donne une puce rouge « À toi de jouer ».
- `pisteJob` (barresJobs.js:185-193) : tout `needs_user` devient « échec action » (ambre).

### Pas d'autre canal
- Aucune notification ni aucun mail n'annonce un job en échec : les push ne parlent que des ventes.

### Drapeaux qui masquent ou neutralisent
- **Ceux qui masquent :**
  - `arret_utilisateur` et `gel_livres_leve_le` (partout) ;
  - `gel_livres_le` (neutre) ;
  - `lbc_hors_france` et `ebay_hors_france` (dans le lot seulement) ;
  - les sources automatiques de `needs_user` : introuvable_a_confirmer, ebay_site_etranger, plateforme_ecartee, build_min_requis, une boutique étrangère levable, une republication technique avant retrait (etat-job.js:69-74, 113-127). **Elles ne valent que dans la file, `attenteAction` et la carte des publications. Elles sont ignorées par l'emplacement de republication, l'onglet, le lot, pisteJob, JobStatusModal et le filtre** ;
  - `introuvable_404.verdict = disparue` et `annonce_disparue`, pour les republications seulement (shared.js:283-288).
- **Ce qui n'existe pas :** aucun drapeau générique de type « clos sans rouge », « masqué » ou « acquitté ».

---

## 2. Comptes actifs

**263 comptes** (OBSERVÉ, 25/10 vers 13:40).
- Définition : `profiles.extension_last_seen_at` de moins de 7 jours **ou** une ligne `usage_logs` de moins de 7 jours.
- Détail :
  - 137 comptes ont l'extension vue dans les 7 jours, et tous ont aussi des `usage_logs` ;
  - 261 comptes ont des `usage_logs` dans les 7 jours ;
  - les 163 `auth.users` connectés dans les 7 jours sont tous inclus.
- Sur 3 246 profils.

---

## 3. Lignes visibles aujourd'hui sur ces 263 comptes

### Vue d'ensemble
- Jobs ouverts de ces comptes (relu à 14:05) : 40 publications failed (10 sur fiche en stock, 30 sur un article vendu ou supprimé, donc **invisibles**), 47 publications + 31 republications + 2 retraits en needs_user, et environ 1 090 pending.
- **104 lignes visibles en erreur ou attention (ambre ou rouge), sur 35 comptes :**
  - **A : 78** ;
  - **A? : 8** (refus de modération, à trancher) ;
  - **B : 18** (12 comptes).
- **173 lignes visibles en NEUTRE** mais au libellé négatif :
  - **99 pastilles « Arrêtée »** (B6, 4 comptes) ;
  - **74 « Plus en ligne »** (N1, 10 comptes).
- Pastille de l'onglet Stock : 27 comptes, 73 articles, dont **10 articles portés par des lignes B**.

Lignes par surface (une ligne peut être sur plusieurs surfaces) :
- carte rouge « pas partie » : 10 ;
- carte ambre « à régler » : 44 ;
- « Annonces qui attendent ton geste » : 54 à compléter et 9 pas parties ;
- carte vendeur Depop : 15 ;
- carte LBC forfait : 1 ;
- emplacement de republication ambre « À toi de jouer » : 29 ;
- emplacement « Attend @boutique » : 9 ;
- pastille de l'onglet : 79 ;
- file « À toi de jouer » : 72 ;
- lot « geste » : 14 ;
- lot « À toi de jouer · pas parties » : 6.

### Catégories visibles (texte d'erreur normalisé × statut/plateforme/action, toutes)

| # | Classe | Lignes (comptes) | Statut / plateforme / action — texte | Exemples | Surfaces |
|---|---|---|---|---|---|
| 1 | A | 15 (3) | needs_user / depop / publish — « Depop demande de terminer ta configuration de vendeur… » | bf28f0c5, e0f3a9bf | carte, carte Depop, onglet, file, lot |
| 2 | A (ancien) | 13 (2) | needs_user / vinted / republish — « Connexion Vinted requise… » (créés les 13/09 et 17/09) | 6b8be705, 8fac51ed | emplacement ambre, attente, onglet, file |
| 3 | A (limite) | 9 (1) | pending / vinted / republish — `attente_boutique` (« Attend @… », depuis le 15/10) | 1de62061, ba28d824 | emplacement ambre |
| 4 | A | 8 (2) | needs_user / beebs / publish — « Connexion Beebs requise… » | 0d53f533, ba83968c | carte, attente, onglet, file, lot |
| 5 | A | 5 (2) | needs_user / depop / publish — « Depop attend ton autorisation… » | c04cd76a, 40e428de | carte, attente, onglet, file |
| 6 | A* | 4 (1) | needs_user / leboncoin / republish — « Connexion Leboncoin requise… » (14/10) | fadbb50f, 8ea6ab4e | emplacement, attente, onglet, file |
| 7 | A? | 3 (2) | failed / beebs / publish — « Beebs a refusé cette annonce à sa vérification… » | 99571727, f8054ba8 | carte ROUGE, attente |
| 8 | A? | 3 (2) | failed / beebs / publish — « Beebs n'a jamais mis cette annonce en ligne : trois jours après… » | 3b8d295f, 22362f3a | carte ROUGE, attente |
| 9 | A? / B3 | 3 (1) | failed / leboncoin / publish — « …refusée par sa modération… » (dont c3e07ca8 = B3) | 8e5d2ee4, db0a9ac9 | carte ROUGE, attente |
| 10 | A | 3 (1) | needs_user / ebay / publish — « eBay demande une mise à niveau de ton compte vendeur… » | 4ee9b283, 3b28a7a9 | carte, attente, onglet, file |
| 11 | A + B4 | 3 (3) | needs_user / ebay / publish — « Ton compte eBay est bien relié… pas encore vendre » (260e0730 = article VENDU : B4) | 08bc200e, 6212d106 | carte, attente, onglet, file |
| 12 | A | 3 (1) | needs_user / ebay / publish — « Ton compte eBay n'est pas encore prêt pour vendre… » | 93012c53, 7f97e131 | carte, attente, onglet, lot, file |
| 13 | **B2** | 3 (1) | needs_user / vinted / republish — « Republication en pause avant toute suppression… Motif : Connexion Vinted requise… » | 8970eacf, 2395e70e | emplacement ambre, onglet |
| 14 | A | 2 (1) | needs_user / depop / republish — « …indique les frais de port… » | 7b2e81e0, 2084dc4b | emplacement, attente, onglet, file |
| 15 | A | 2 (2) | needs_user / vinted / publish — « Connexion Vinted requise… » (24/10) | 14b95187, f8103a13 | carte, attente, onglet, file |
| 16 | A (ancien) | 2 (1) | needs_user / vinted / republish — « Ta republication attend que Vinted soit rouvert… » (22/08 et 13/09) | f1aa1d4a, a5d1f02e | emplacement, attente, onglet, file |
| 17 | A | 2 (2) | needs_user / vinted / republish — `prevol_negatif`, marque inconnue (« pago », « Paris 2024 ») | 770bed7f, 3730ef49 | attente, onglet, file (et emplacement) |
| 18 | **B1** | 2 (2) | needs_user / vinted / republish — `introuvable_a_confirmer` (« …FillSell attend le prochain relevé… ») | 22585563, c0b2d27f | emplacement AMBRE « À toi de jouer », onglet |
| 19 | **B7** | 2 (1) | cancelled / beebs / publish — « Arrêté à ta demande — tu as abandonné Beebs… » | 2f9133ff, ecc86d95 | lot « À toi de jouer · pas parties » |
| 20 | **B7** | 2 (1) | cancelled / depop / publish — « Cette publication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée… » | a3f3cb73, b8c36a6b | lot « pas parties » |
| 21 | **B7** | 2 (1) | cancelled / ebay / publish — « Arrêté à ta demande — tu as abandonné eBay… » | 130088e7, 080e9d39 | lot « pas parties » |
| 22 | **B8a** | 1 (1) | failed / leboncoin / publish — « Publication non confirmée : … jamais réussi à récupérer son lien » (07/09) | dca5a386 | carte ROUGE, attente |
| 23 | A | 1 | needs_user / beebs / publish — adresse d'envoi refusée (Réglages) | 88f51828 | carte, attente, onglet, file |
| 24 | A | 1 | needs_user / beebs / republish — « Beebs exige « Marque »… » | 0f568f3e | emplacement, attente, onglet, file |
| 25 | A | 1 | needs_user / depop / **delete** — autoriser Depop (article VENDU encore en ligne) | a8a3e2ae | onglet, file |
| 26 | **B5** | 1 | needs_user / depop / publish — « La publication n'a pas abouti après plusieurs essais… » (brut : « Session Depop illisible (réseau) », compte au mur vendeur) | e41ec2a1 | carte, attente, onglet, file |
| 27 | **B1** | 1 | needs_user / depop / publish — `plateforme_ecartee` (« En pause : tu as indiqué ne pas vendre sur Depop ») | e9e514e2 | carte grise, **onglet ambre** |
| 28 | A | 1 | needs_user / depop / republish — « Depop exige « Pour (Depop, enfants) »… » | 18d5cbb1 | emplacement, attente, onglet, file |
| 29 | **B5** | 1 | needs_user / ebay / publish — « n'a pas abouti… » (brut : brouillon refusé par eBay, « Photos » manquantes) | c64e5596 | carte, attente, onglet, lot, file |
| 30 | A | 1 | needs_user / ebay / publish — « Connecte ton compte eBay… » | 15c8258a | carte, attente, onglet, file |
| 31 | **B1** | 1 | needs_user / ebay / publish — `plateforme_ecartee` | ce5630d4 | carte grise, **onglet ambre** |
| 32 | A | 1 | needs_user / leboncoin / publish — « Valider et payer » (compte pro) | 6309dfcf | carte, carte forfait, onglet, file |
| 33 | A | 1 | needs_user / vinted / publish — ISBN à saisir | 578a6eb0 | carte, attente, onglet, file |
| 34 | A (urgent) | 1 | needs_user / vinted / republish, étape **deleted** (annonce RETIRÉE depuis le 20/10) — « Vinted exige « Modèle » » | dca41766 | attente, onglet, file |

Notes sur le tableau :
- Il n'y a que 34 catégories, pas 40 : elles sont toutes listées.
- « A (ancien) » : plus de 30 jours ; 15 lignes chez f1e0cd59 et b0cb8def.
- « A* » : voir B10, cause racine.

### Visibles en neutre mais au libellé négatif (emplacement de republication bleu)
- **B6 « Arrêtée » : 99 lignes, 4 comptes.**
  - 94 lignes chez **8c53f1b4**, issues de la remise à zéro du 15/08 : « Demande expirée : elle attendait depuis plusieurs semaines… » (67) et « File remise à zéro par FillSell… » (27). Elles ont **71 jours**.
  - Ces 94 fiches ont été **revues en ligne** (`vinted_status = 'active'`, `last_synced_at` postérieur au job). L'étape est captured pour 90 d'entre elles, a_capturer pour 4.
  - 4 lignes viennent du balayage de 72 h (comptes 8a2eba68 et 2189c4d8).
  - 1 ligne dit « Article vendu le … : cette republication n'a plus d'objet », alors que la fiche est de nouveau en stock (0059c0e3).
  - Exemples : af9a0890, 42806ebc.
- **N1 « Plus en ligne » : 74 lignes, 10 comptes.** Il s'agit du 404 lu à la capture. Dont **58 chez 7373c96c** : verdict du 17/10, puis les relevés Vinted du 24/10 ne revoient pas ces fiches… mais aucun `disparu_le` n'est posé.
  - La carte montre alors le logo Vinted « en ligne » **et** « Plus en ligne ». Incohérent, probablement vrai : c'est la question « vendue ou retirée ? » (A) qui devrait se poser.
  - 1 cas faux : 38e12adb, fiche revue en ligne après le verdict.

### Retraits et questions de retrait (lus à part)
- **Retraits ouverts : 19 lignes.**
  - A :
    - 333e23d4 : Vinted, connexion, depuis le 02/10 ;
    - c30bc3dc et fd6ed14c : Vinted, ordinateur éteint, articles vendus, depuis le 18/10 et le 22/10 ;
    - a8a3e2ae : autoriser Depop ;
    - 11bb6383 : autre boutique.
  - **B9** : 53cff028, Beebs, article vendu, depuis le 14/10. « Beebs garde cette annonce en vérification… ni visible ni achetable ».
    - La ligne passe **rouge** au-delà de 24 h (retraitsBloques.js:171-183, ton `echec` en 595-597), alors qu'aucune double vente n'est possible.
    - Seul geste offert : écrire au support Beebs.
- **Questions « retirer ? » (`pending_removal`) : 22 lignes.**
  - Par nature, c'est A (choix de la personne).
  - Mais **3 sont déjà réglées** selon les relevés :
    - 3b28727a (Beebs) : annonce disparue le 23/10 ;
    - 961dc2a4 (LBC) : annonce disparue le 23/10 ;
    - 29a1db8a (Beebs) : annonce vendue.
  - Plus 1 ligne Opla (942c0d14), alors qu'Opla n'est plus suivie.

---

## 4. Classement A / B, prédicats, état de clôture vrai, risques

### A — un vrai geste de la personne (78 lignes, 22 comptes)
- **Connexion** : Vinted 17, Beebs 8, Leboncoin 4, eBay à relier 1.
- **Autoriser Depop** : 6, dont 1 retrait d'article vendu.
- **Vendeur Depop** : 15.
- **Compte eBay à finir** : 8.
- **Choix d'une valeur** : 8 (ISBN, marque, frais de port, « Pour », « Modèle »).
- **Adresse Beebs** : 1.
- **Forfait Leboncoin pro** : 1.
- **Ouvrir l'autre boutique Vinted** : 9.

À garder, avec trois remarques de règle (pas de clôture) :
1. **Une ligne par article** pour un mur de compte : f1e0cd59 a 10 lignes « Connexion Vinted requise », de5b3625 en a 4 pour Leboncoin. La carte « une par compte » (comme Depop vendeur) suffirait.
2. **Ancienneté** : 15 lignes « Connexion Vinted » ont plus de 30 jours (depuis le 22/08 et les 13/09 et 17/09).
   - Côté Vinted chez ces deux comptes, plus aucun succès depuis le 13/09 et le 17/09 ; leurs relevés des 7 derniers jours sont `failed` ; la sonde dit `null` (HTTP 403).
   - Le mur est donc **vrai**.
3. **dca41766** : l'annonce est retirée de Vinted depuis le 20/10 et attend « Modèle ». C'est le seul cas « hors ligne ».

### A? — refus de modération ou « jamais mis en ligne » par la plateforme (8 lignes, 4 comptes)
- Lignes : Beebs 6 (99571727, f8054ba8, 1fc35133, 3b8d295f, 22362f3a, ef037533) et Leboncoin 2 (8e5d2ee4, db0a9ac9).
- Affichage : carte **rouge** « pas partie » et « À régler », **sans fin**.
- Vrai, mais il n'y a aucun geste précis : la plateforme ne dit pas pourquoi.
- **À trancher par Nico.**
  - **Proposition :** l'état vrai est « Pas en ligne sur X (refusée) ». La plateforme est de nouveau proposée par « Publier » (c'est déjà le cas). L'information reste dans le détail, sans rouge et hors de « À régler ».
- Prédicat : `j.status='failed' and j.action='publish' and j.error ~* '(a refusé cette annonce|jamais mis cette annonce en ligne|refusée par sa modération)'`, fiche en stock, dernier job publish de la plateforme.
- Clôture vraie : garder `failed` (c'est exact) et changer seulement l'affichage. Ou `cancelled` avec un motif « refusée par la plateforme ». **Jamais `published`.**
- Risque : la grâce Beebs de 72 h a produit de faux refus. Mesure de la migration non suivie `20261025120000_beebs_grace_7_jours.sql` : 18 annonces sur 31 jours sont devenues visibles 48 à 126 h plus tard.
  - Vérifié aujourd'hui : **aucune** des 40 publications `failed` des comptes actifs n'apparaît en ligne dans `annonces_plateforme` (même identifiant).
  - Une exception : c3e07ca8, dont l'article est en ligne sur Leboncoin sous une autre annonce (B3).

### B — de notre fait, déjà réglé ou obsolète (18 lignes visibles, 12 comptes) + B6 (99 neutres) + B9 et questions réglées

| Classe | Lignes | Ce qui est faux aujourd'hui | Prédicat (SQL sur `cross_post_jobs j`) | État vrai à poser | Risques |
|---|---|---|---|---|---|
| **B1** attente automatique montrée « À toi de jouer » | 4 visibles (22585563, c0b2d27f, e9e514e2, ce5630d4), plus les 3 de B2 | `etatJob` dit EN_PAUSE ; l'emplacement de republication (ambre) et l'onglet disent « à régler » | `j.status='needs_user' and (pf->>'needs_user_source' in ('introuvable_a_confirmer','ebay_site_etranger','plateforme_ecartee','build_min_requis') or (pf->>'needs_user_source'='boutique_etrangere' and pf#>>'{boutique_etrangere,motif}'='boutique_etrangere' and coalesce(btrim(pf#>>'{boutique_etrangere,article}'),'')<>'' and pf#>>'{boutique_etrangere,pose_par}' in ('extension (propriétaire lu sur la page exacte)','handler-watch (origine prouvée du job)','get-pending-jobs (publication, boutique de la fiche)','get-pending-jobs (identité prouvée)')) or (j.action='republish' and coalesce(pf->>'republish_step','') in ('','a_capturer','captured') and not pf ? 'deleted_at' and coalesce(pf->>'needs_user_source','') in ('','relancer') and (jsonb_typeof(pf->'republish_etat_indetermine')='object' or <texteTechnique(error, error_technique.brut)>)))` — `texteTechnique` reprend CANAL_RE et MOTIF_TECHNIQUE_RE sans MOTIF_PERSONNE_RE (etat-job.js:82-97) | **Aucune écriture** : l'état vrai, « En pause », existe déjà. Il faut aligner les surfaces sur `attenteAutomatique` | Une `plateforme_ecartee` reste réactivable par la personne : afficher « En pause », pas rien |
| **B2** faux mur « Connexion Vinted requise » | 3 (67a8b907 : 8970eacf, 2395e70e, 1d3f4101, depuis le 24/10) | Session prouvée vivante : sonde `vinted = true` (25/10 12:50) et succès Vinted jusqu'au 25/10 09:24. Trois reprises de handler-watch et une « relance support » ont buté sur le même mur. La file dit « En pause », la carte « À toi de jouer » | `j.status='needs_user' and j.action='republish' and coalesce(pf->>'republish_step','') in ('','a_capturer','captured') and j.error ~* 'Connexion (Vinted\|Leboncoin\|Beebs\|eBay\|Depop) requise' and coalesce((pf->>'reprises_apres_connexion_n')::int,0)>=3 and exists(select 1 from profiles p where p.id=j.user_id and p.extension_sessions->>j.platform='true') and exists(select 1 from cross_post_jobs x where x.user_id=j.user_id and x.platform=j.platform and x.created_at>coalesce((pf->>'reprise_apres_connexion_le')::timestamptz,j.created_at) and (x.status in ('published','deleted') or x.platform_fields->>'republish_step'='recreated'))` | `cancelled` avec un motif neutre (« republication non faite, rien n'a été retiré »), **seulement** si un relevé postérieur montre l'annonce en ligne. Sinon, needs_user affiché « En pause » | L'étape captured peut avoir supprimé l'annonce : une preuve d'annonce en ligne est exigée avant de clore. Le mur exact reste à diagnostiquer (onglet de travail resté ouvert ?) |
| **B3** échec dépassé par une réussite | 1 (c3e07ca8, f44b5917) | L'article est en ligne sur Leboncoin : republication publiée après, et 2 annonces « en_ligne » au relevé. La carte reste rouge, parce que la règle de la carte ignore les republications | `j.status='failed' and exists(select 1 from cross_post_jobs x where x.user_id=j.user_id and x.inventaire_id=j.inventaire_id and x.platform=j.platform and x.action in ('publish','republish') and x.status in ('published','sold') and x.created_at>j.created_at)` | Rien à écrire si la règle de la carte change. Sinon `cancelled`, motif « remplacée par une publication réussie » (preuve : le job publié postérieur) | — |
| **B4** publication d'un article vendu | 1 (260e0730, eBay, needs_user « compte à finir », 309d0787) | La fiche est `vendu`, pourtant le job reste « à toi de jouer » (onglet, file) | `j.action='publish' and j.status in ('needs_user','pending') and exists(select 1 from inventaire i where i.id=j.inventaire_id and i.statut='vendu')` | `cancelled`, « Arrêtée : article vendu » | Fiche à quantité > 1 : vérifier `quantite`. Ne jamais toucher un **retrait** (a8a3e2ae est un A) |
| **B5** panne de notre côté dite « relance-la » | 2 (e41ec2a1 Depop, c64e5596 eBay) | `pas-de-rouge` « inconnu_relancer → a_toi ». Brut réel : « Session Depop illisible (réseau) » (compte déjà au mur vendeur Depop) ; « brouillon refusé par eBay : Photos » (nos photos) | `j.status='needs_user' and j.action='publish' and pf->>'needs_user_source'='relancer' and j.error like 'La publication n''a pas abouti après plusieurs essais automatiques%'` | e41ec2a1 : requalifier vers le mur vendeur Depop (`last_diagnostic.quoi = depop_vendeur_a_configurer`), donc la carte de compte (A). c64e5596 : reprise automatique bornée (`pending` + `next_action_after`) une fois la cause photo corrigée, sinon `cancelled` neutre « pas partie, de notre fait ». **Jamais `published`** | Ne pas reprendre en boucle (la borne `pas_de_rouge_reprises` existe) |
| **B6** « Arrêtée » après nos propres annulations (neutre, visible) | 99 (4 comptes, dont 94 chez 8c53f1b4) | Rien n'a été retiré, l'annonce est revue en ligne, mais l'emplacement affiche « Arrêtée » depuis 71 jours | Dernière republication de la fiche : `j.action='republish' and j.status in ('failed','cancelled') and coalesce(pf->>'republish_step','') not in ('deleted','recreated') and not (pf ?\| array['arret_utilisateur','gel_livres_leve_le','gel_livres_le','annonce_disparue']) and coalesce(pf#>>'{introuvable_404,verdict}','')<>'disparue' and not exists(select 1 from cross_post_jobs y where y.user_id=j.user_id and y.inventaire_id=j.inventaire_id and y.action='republish' and y.created_at>j.created_at)`, fiche en stock, Vinted, non disparue, non masquée | **Aucune écriture.** État vrai : « ● En ligne ». La règle : `etapeRepublication` rend `null` pour un arrêt avant retrait, comme pour `arret_utilisateur` | Exiger la preuve « fiche revue active après le job » pour l'étape captured (94/94 l'ont aujourd'hui) |
| **B7** lot : l'abandon par la personne ou notre balayage de 72 h affichés « À toi de jouer · pas parties » | 6 (2f9133ff, ecc86d95, 130088e7, 080e9d39 ; a3f3cb73, b8c36a6b) | L'abandon est un choix déjà fait. La clôture de 72 h a été faite par nous | `j.action='publish' and j.status='cancelled' and (pf ? 'abandon_utilisateur' or j.error ~ '^Arrêté à ta demande' or j.error ~ '^Cette publication attendait une réponse depuis plusieurs jours')` | Abandon → « arrêtée » (`etatJobLot`). Clôture de 72 h → « Arrêtée » neutre | — |
| **B8a** dépôt jamais confirmé (notre capture) | 1 (dca5a386, LBC, 07/09) | Rouge depuis 7 semaines ; 236 succès Leboncoin du compte depuis (publications ou retraits) | `j.status='failed' and j.error ~* '(jamais réussi à récupérer son lien\|nous n''avons jamais eu son numéro)'`, fiche en stock | `failed` reste exact. Affichage : « Pas en ligne sur Leboncoin », sans rouge, plateforme reproposée | La preuve d'absence existe déjà (« deux relevés complets ») |
| **B9** retrait Beebs « en vérification » montré rouge | 1 (53cff028, 7373c96c, depuis le 14/10) | Pas achetable, donc aucune double vente possible. Aucun geste FillSell possible | `j.action='delete' and j.status in ('pending','processing','needs_user') and j.platform='beebs' and (pf ? 'retrait_en_attente_verification' or pf ? 'beebs_en_moderation' or j.error ~* '(Beebs (vérifie\|l''examine\|examine)\|en vérification\|pas encore visible sur Beebs)')` | Statut inchangé (pending, FillSell réessaie). Ton neutre « en attente de Beebs » | Repasser au rouge dès que l'annonce devient visible |
| **B10** question « retirer ? » déjà réglée | 3 (3b28727a, 961dc2a4, 29a1db8a) | Le relevé dit disparue le 23/10 ou vendue | `j.status='cancelled' and pf @> '{"pending_removal":true}' and not pf ? 'pending_removal_reporte_le' and exists(select 1 from annonces_plateforme ap where ap.user_id=j.user_id and ap.platform=j.platform and ap.listing_id=coalesce(nullif(btrim(j.platform_listing_id),''),annonce_id_job(j.platform,j.listing_url)) and (ap.disparu_le is not null or ap.statut_plateforme='vendue'))` | Lever `pending_removal`, motif « déjà retirée ou vendue » | « Disparue » n'est pas toujours « retirée » : confirmer par deux relevés |

Hors affichage, mais à clore par hygiène : **30 publications `failed` sur des articles vendus ou supprimés.** Aucune surface ne les montre (S1 et S2 exigent une fiche en stock).

---

## 5. Les règles qui fabriquent du B (causes racines)

1. **L'emplacement de republication ignore `attenteAutomatique`**, et ne libère pas l'emplacement après une annulation de notre fait.
   - `etapeRepublication` : StockTab.jsx:5099-5132 et 5148-5186.
   - `republishAReprendre` : republication.js:97-104 ; il devient « Régler » via StockTab.jsx:9759 et 9774.
   - Effets : B1, B2, B6.
2. **La pastille de l'onglet** (App.jsx:3433-3439) compte tous les `needs_user`, sans la règle de « À régler » : automatiques, articles vendus, retraits, fiches supprimées. Effets : B1, B4.
3. **Lot, pisteJob et EcranSuivi** ne passent pas par `etatJob`. Code : regles.js:356-371, barresJobs.js:185-193, SuiviLot.jsx:23 et 35. Effets : B1, B7.
4. **Bannière de JobStatusModal** (StockTab.jsx:2171-2180) : elle compte tous les jobs, au lieu du dernier par plateforme (2258-2270). Elle peut ressusciter un vieil échec.
5. **Le « dernier job » de la carte ne regarde pas les republications** (StockTab.jsx:9241-9248, 9341-9348). Effet : B3. Le filtre de liste (stockFiltres.js:275-288) ne laisse pas une annulation effacer l'ardoise.
6. **La reprise sur preuve de handler-watch** (handler-watch/index.ts:3588-3640) ne relance que si `profiles.extension_sessions[platform] === true` et que la sonde est fraîche (3603-3608).
   - OBSERVÉ, de5b3625 : des relevés Leboncoin `done` chaque jour du 15/10 au 22/10, une sonde à `null`, et 4 républications « Connexion Leboncoin requise » du 14/10 jamais relancées. Elles sont redevenues vraies le 23/10 (relevé `absente`).
   - OBSERVÉ, comptes actifs : 27 des 137 comptes à extension active ont une sonde Vinted à `null`.
   - Inversement, la borne de 3 reprises (3632-3638) arrête la boucle mais laisse le faux mur affiché (B2).
   - **HYPOTHÈSE** : utiliser aussi « relevé `done` » et « job publié après » comme preuve de session.
7. **`pas-de-rouge`, branche « inconnu → relancer → à toi »** (\_shared/pas-de-rouge.js, vers 1081-1092, update-job-status ; rapporté par l'agent de lecture). De plus, `attenteAutomatique` ne traite le technique que pour les républications (etat-job.js:119-125). Effet : B5.
8. **Les balayages SQL `trancher_publications_sans_lien` et `fail_publish_without_listing_url`** écrivent `failed` (rouge sans fin) pour un dépôt jamais vu en ligne. Effets : B8a, A?.
   - La grâce Beebs de 72 h a fabriqué de faux refus.
   - La correction à 7 jours existe en fichier non suivi : `supabase/migrations/20261025120000_beebs_grace_7_jours.sql`. Son application n'a pas été vérifiée ici.
9. **La remise à zéro du 15/08 et le balayage de 72 h de handler-watch** (handler-watch:1887-1889 et 2040-2050, selon l'agent) posent `cancelled` sans marqueur neutre. L'app n'a que `arret_utilisateur` pour taire une annulation. Effets : B6, B7.
10. **Les publications d'un article vendu** ne sont pas toutes annulées par le flux de vente. Effet : B4, observé sur 1 cas ; la cause n'a pas été tracée.
11. **Retraits « en retard »** (retraitsBloques.js:171-183, ton 595-597) : ils ne distinguent pas une annonce non achetable (Beebs en vérification). Effet : B9.
12. **Les questions `pending_removal`** (App.jsx:3598-3610) ne regardent pas le relevé de la plateforme (disparue ou vendue). Effet : B10.

**Ordre de grandeur :** une fois les règles 1 à 5 alignées sur `etatJob`, sans écrire une seule ligne de données, disparaîtraient **B1, B2, B3, B6 et B7 (≈ 113 lignes visibles, dont 99 neutres)**. Il resterait à clore par script (sauvegarde et inverse, `scripts/reparations/`, feu vert de Nico) : **B4, B5, B10, et selon décision A?/B8a**.
