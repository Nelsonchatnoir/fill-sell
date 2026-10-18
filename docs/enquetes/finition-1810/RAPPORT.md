# Chantier « finition » — 18/10/2026 (16:35 → soir, heure de Paris)

## Résumé (à lire en premier)

| Point | Statut | Preuve |
|---|---|---|
| 1. Régis — cause, règle, 2 annonces | **CLOS** | cause prouvée (99 brouillons en page 1 + redirection /member) ; 2 annonces en ligne une fois chacune (200), 9 copies en 404 ; défaut serveur des 7 min corrigé |
| 1. Régis — les 47 | **NON CLOS** (décidé) | lot 1 : Larousse en ligne une fois (10431938776 en 200, la 2e copie retirée par son numéro, 404 à 19:18) ; **46 retenues jusqu'à la 0.6.128** — décision de Nico (18/10 soir) : aucun relevé déclenché par le serveur |
| 2. Louis — transfert, règle, LBC partagé | **CLOS** | transfert 19/19 ; 32 annonces LBC de louis-seller, 0 chez le compte principal ; louis-seller en Business |
| 2. Louis — ventes « un compte, zéro doublon » | **CLOS** | 12 ventes de @evat en double (19:08) : règle en prod (migration 20261018230000, essai 23/23, get-pending-jobs v265) ; réparation exécutée à 20:31:53 (feu vert de Nico) : 0 doublon, 12 ventes chez louis-seller, 0 chez louis@, 0 mail, 0 push (§ 2.4) |
| 3. eBay ÷ 5 | **CLOS** | 156 → **27** questions sur la semaine rejouée (÷ 5,8), bancs sans IA |
| 4. Titre Vinted « symboles » | **CLOS** | 0 titre accepté changé sur 70 555 ; 5d993767 publié en réel (10431945873, 200) |
| 5. Leboncoin PRO poids | **NON CLOS** | correctif 0.6.128 prouvé sur maquette (26/26) ; preuve sur un vrai compte PRO pas faite (navigateur de la personne) |
| 6. Depop sans identifiant | **CLOS** | thibault 81188384 : numéro retrouvé seul (lien + dépôt, jamais le titre), DELETE 204 à 19:18, page Depop en 410 |
| 7. Relevés morts | **CLOS** (code) | RPC + écran « À régler », selftest ; vue dans l'app réelle à faire par Nico (aucune connexion à fillsell.app en automatisation) |

---

## 1. Régis (juchsregis@gmail.com, boutique Vinted asgarde67 = 31995881)

### 1.1 Pourquoi lui seul (prouvé)
- **La coupure touche tout le parc, sans se voir.** Sur 3 jours, chez tessy.galy, 111savagenow et xxewwer (les comptes
  qui republiaient sans souci), **153 républications réussies sur 154 ont eu un « canal coupé » pendant le job**, dont 113
  avec l'onglet sur `/member/<id>`, et les 153 ont été prouvées par la relecture du dressing (« recréation confirmée dans
  le dressing après coupure du canal »). Le code du site Vinted (relu le 18/10) envoie bien la page sur `/member/<vendeur>`
  après un dépôt réussi (`O = tr(N.id) … navigateToPage(O)`) et la laisse sur le formulaire en cas d'échec.
- **Ce qui diffère chez Régis : 99 brouillons.** Le dressing vu par son PROPRIÉTAIRE liste les brouillons d'abord. Relevé
  de 15:05 : page 1 = **96 annonces, toutes `draft`** ; les annonces actives commencent en page 2. Les trois comptes
  témoins ont **0 brouillon**. Or la relecture de l'extension (pré-vérification et ceinture) ne lisait que la page 1 :
  chez Régis, elle ne pouvait voir aucune copie.
- **Défaut serveur aggravant (tout le parc, corrigé)** : dans `update-job-status`, quand l'extension réécrivait le job avec
  un `deleted_at` déjà égal, `deleted_at_serveur` et `deleted_at_client` étaient posés sans marquer la modification, donc
  **effacés**. L'écriture suivante se croyait la première et datait le retrait de l'heure du serveur (short : 13:11:38 →
  13:18:45 ; bloc-feuillet : 14:13:46 → 14:20:44).
- **Pas une restriction** : les pages /listing-restriction et /selling-restriction sont détectées au chargement du
  formulaire (avant tout retrait) ; chez Régis, les 11 dépôts ont tous abouti.

### 1.2 Le correctif (pour tous, sans toucher aux données des autres)
- **Un dépôt réussi se reconnaît par la présence réelle de l'annonce** (numéro inconnu, même titre, même boutique, mise
  en ligne pendant un de NOS envois), jamais par l'URL d'arrivée.
- **Côté serveur, servi au parc en 0.6.125 dès le déploiement** :
  - `get-pending-jobs` (règle resserrée à 19:1x, après le 1er essai réel — voir § 1.6) : sur un compte dont la page 1 est
    pleine de brouillons et dont l'extension est d'avant la 0.6.128, plus aucune recréation automatique après un essai ;
    seul un relevé fait par la personne (qui importe) peut la débloquer, sinon la question à 6 h ; tout autre compte est
    servi comme avant. (Version d'avant, remplacée : « aucune nouvelle recréation sans un **relevé complet** du dressing (toutes
    les pages) commencé ≥ 12 min après, demandé par le serveur (`serveur:verif_redepot`, la vérification avant redépôt que la base reconnaît) ; copie déjà au stock = la
    question ; 6 h sans relevé = la question honnête ;
  - **migration 20261018170000 (appliquée 17:03)** : quand ce relevé apporte la copie, la base la rattache à la fiche et
    clôt la republication ; une copie de plus part par le circuit de retrait, numéro exact (essai à blanc 11/11) ;
  - `update-job-status` : heure Vinted du retrait d'abord, repères jamais effacés, tous nos envois gardés.
- **Extension 0.6.128** : lecture du dressing qui saute les brouillons (jusqu'à 10 pages), seuil = heure Vinted du retrait ;
  `/member` ne conclut jamais à l'échec (`depot_incertain`, sans retentative). Rejeu du cas Régis : publié sur la copie au
  lieu d'un nouvel essai (selftest `recreation-vinted-0-6-128`, 63/63).

### 1.3 Ses 2 annonces (décision de Nico : garder la 1re copie)
- Réparation `scripts/reparations/20261018_regis_doublons_recreation.sql` (16:57, essai à blanc, sauvegarde, inverse) :
  fiches rattachées à 10427468367 (short) et 10428851595 (bloc-feuillet), jobs publiés ; **9 retraits** par numéro exact,
  exécutés par son extension de 16:58 à 17:02.
- **Page relue** : une seule annonce de chaque article en ligne (200), les 9 copies retirées en 404.

### 1.4 Le défaut des 7 min ailleurs (lecture seule, rien réparé)
- 60 retraits sur 8 032 (30 jours, 20 comptes) datés plus d'une minute trop tard ; 7 républications d'autres comptes ont
  eu plusieurs tentatives. **D'après le stock relevé, une seule garde une copie en double en ligne** :
  ornellaracano 0f8c3f6b (« Pull orange maille côtelée… ») — 10309363918 en plus de 10310269763. Les 6 autres
  (remialbertholl 81bf5d44, nadegemarcelin78 edd1e8c1 et 483049ef, ornellaracano b92e0880, lohanobert59 21a71cc8,
  2hyk6vg842 2d37ee4a) : aucune copie en double au stock.

### 1.5 Quota gratuit (50 républications)
- Le compteur compte **une fois par article** (exécutée ou en cours), jamais par essai ; un retrait n'est pas une
  republication. Régis : 49/50 = 2 publiées + 47 en attente ; les 11 essais et les 9 retraits n'ont rien consommé.

### 1.6 Les 47 — lot 1 (3) libéré à 18:24, puis arrêté (Larousse : une seule copie en ligne, prouvé à 19:18)
- **Larousse (ed7729dc)** : une-passe à 16:25:46 UTC, copie 10431938776 créée à 16:25:54, non reconnue par son extension
  (page 1 = brouillons) → **retenue par la garde serveur** (« en cours de vérification »), sans nouvel essai. ✓
- **Défaut de ma garde, trouvé en réel** : le relevé demandé par le serveur était d'abord écarté sans bruit (origine
  `serveur:verif_recreation` inconnue de `garde_releve_sans_geste`) — corrigé (`serveur:verif_redepot`, get-pending-jobs
  v263) ; puis le relevé automatique a tourné (18:56, 188/188) mais **n'importe aucun article neuf** (règle du 05/10) :
  la garde a conclu « aucune copie » et resservi la recréation à 18:58 → **2e copie 10432668983 (16:59:50 UTC)**.
  Arrêt immédiat des 3 jobs du lot 1 (19:04), puis réparation selon la décision de Nico (garder la 1re) : fiche et job
  sur 10431938776, retrait de 10432668983 armé par son numéro (19:08), **exécuté par son extension** : page relue à 19:18,
  10431938776 en 200, 10432668983 en 404. Règle resserrée (§ 1.2) et redéployée (get-pending-jobs v264, 19:15).
- **Les 46 autres restent retenues** : avec son extension 0.6.125, aucune remise en ligne ne peut être prouvée sans
  « Synchroniser » à chaque article (ses 99 brouillons aveuglent sa relecture). Elles partiront avec la **0.6.128**
  (relecture qui saute les brouillons, prouvée sur son cas en selftest) — ou plus tôt si Nico accepte qu'un relevé
  importateur soit demandé par le serveur pour ce cas (contraire à la règle du 05/10 : à décider).

## 2. Louis — une boutique = un compte, comptes reliés, transfert @evat

### 2.1 Décisions de Nico (18/10)
- @evat (371531) = PERSO → louis-seller ; @neyenonie (247512093, Vinted PRO) + Leboncoin + Beebs PRO + eBay @plt-crea
  → louis@ (option B ; @neyenonie établie au compte principal par le registre : un seul pin).
- Fiches @evat qui ont aussi une copie Leboncoin/Beebs : **coupées en deux**, comptes **reliés** (une vente prouvée d'un
  côté retire les copies de l'autre). Bêta messages ouverte sur louis-seller. On ne dit rien à Louis : c'est l'app qui
  rend vrai le message de 17:15.

### 2.2 La règle (migration 20261018200000, essai à blanc 21/21)
- Registre `boutiques_plateforme` : une boutique Vinted d'un autre compte n'entre jamais au pin, n'est jamais confirmée,
  aucun article importé (`[boutique_a_confirmer][boutique_autre_compte]`), aucune vente enregistrée (0 mail).
- Leboncoin/Beebs/Depop/eBay : une annonce suivie en ligne par un autre compte n'est pas importée ; un compte eBay relié
  à un seul compte FillSell.
- Comptes reliés : une fiche vendue rend sa jumelle vendue, ses copies sont retirées (Point A : la vente de la jumelle
  vaut preuve) ; une vente annulée la rend disponible et annule ses retraits en file ; une commande déjà enregistrée sur
  l'autre compte ne l'est jamais deux fois ; une vente LBC dont l'annonce n'est suivie que par le compte relié lui
  appartient ; une conversation / une commande n'est copiée qu'une fois.
- App : « Ce navigateur est connecté à la boutique Vinted @x, déjà suivie par un autre compte FillSell… » (orange, sans
  bouton « c'est bien ma boutique ? ») ; bilan « N annonces … déjà suivies par un autre compte ».

### 2.2 bis Leboncoin partagé (complément de Nico, option B)
- Les deux comptes publient sur le MÊME compte Leboncoin (louis-seller depuis 18:26 : 32 jobs). Règle : chaque compte
  surveille ce qu'IL a publié, repéré par l'identifiant d'annonce ; le relevé de l'autre ne l'importe pas ; la vente
  s'enregistre chez le compte qui a publié (migration 20261018220000, essai 7/7). Le transfert de 18:25 n'a supprimé que
  les 323 jobs nés du relevé de 16:46 (sauvegarde relue : aucun dépôt réel de louis-seller touché).

### 2.3 Le transfert (essai à blanc 19/19 contrôles, inverse prouvé 25/25)
- 224 fiches @evat passent à louis-seller avec leur historique ; ses 212 fiches nues du jour cèdent la place ;
  **164 fiches, 322 annonces et 55 ventes Leboncoin retirées de louis-seller, sans aucun job** ; 695 ventes @evat en double
  retirées de louis@ (la copie de louis-seller est gardée : une vente, un compte) ; 195 fiches coupées en deux et reliées ;
  10 commandes et 9 conversations @evat passent à louis-seller ; 0 job, 0 notification créés.

### 2.4 Après le transfert : deux postes sur louis@ (vu en réel à 19:2x)
- **Ce qui est prouvé** : louis@ a DEUX postes — son PC (53269f05), ouvert sur @neyenonie, et sa VM (8632c049), ouverte
  sur **@evat**, la boutique désormais de louis-seller (dépôt relu par users/current à 18:41) ; louis-seller a les deux
  siens (44e23093, 74416e23), ouverts sur @evat. La boutique ouverte n'était connue que PAR COMPTE (sonde réécrite à tour
  de rôle par chaque poste), et le routage par poste (lot 6) ne jouait qu'à deux boutiques confirmées — louis@ n'en a plus
  qu'une depuis le transfert.
- **Conséquences** : (1) la veille de la VM a enregistré sur louis@ 2 commandes de @evat — 23326812434 (9 articles,
  18:37) et 23327856996 (3 articles, 19:02), articles « pas suivis », prouvés de @evat par leur page publique
  (/member/371531) — que louis-seller a enregistrées aussi à 19:08:35 : **12 ventes en double**, sans aucun mail ni push
  envoyé (push de louis-seller marqués « doublon ») ; (2) la VM a publié à 18:40 un article de @neyenonie (fiche PRO
  « Rangement Blanc et Noir », 9 998 exemplaires) **sur @evat** (job 56e8788c, 10432288057).
- **Règle (tout le parc ; rien ne change pour un compte dont aucun poste n'est ouvert sur la boutique d'un autre)** —
  migration **20261018230000** (appliquée 19:54, essai 23/23, inverse prouvé) et get-pending-jobs **v265** (19:54) :
  chaque poste a SA boutique, datée par SA sonde (0.6.125 comprise : déclencheur `profiles_identite_vinted_du_poste`) ;
  une commande lue par un poste ouvert sur la boutique d'un autre compte ne s'enregistre pas (veille et relevé) ; entre
  comptes reliés, jamais deux fois la même commande, une commande des articles du relié s'enregistre chez lui (son mail,
  ses retraits), son article publié n'est jamais importé ; aucun job Vinted n'est servi à un poste ouvert sur la
  boutique d'un autre compte (il reste en file pour le PC).
- **Réparation** (feu vert de Nico, 18/10 soir) : `scripts/reparations/20261018_louis_ventes_vinted_doublons.sql` —
  essai à blanc (ROLLBACK, `scripts/essais/20261018_louis_ventes_vinted_doublons_essai.sql`) : 12 retirées, 12 gardées,
  0 push, aucune trace gardée ; **exécutée à 20:31:53** : 12 ventes, 12 reçus, 12 questions retirés de louis@, 12 lignes
  de commande en « compte_relie » (sauvegardes `_backup_1810_louis_vdv_*`, inverse
  `20261018_louis_ventes_vinted_doublons_INVERSE.sql`). **Preuve relue** : 0 commande sur les deux comptes, 12 ventes chez
  louis-seller, 0 chez louis@, 0 trace de suppression, 0 mail, 0 push nés de la réparation.
- **La règle en réel** : la sonde date chaque poste de louis@ — PC 53269f05 = @neyenonie (19:57), VM 8632c049 = @evat
  (20:25). À 20:31:40, une vraie commande de @evat (23331768469, 10 articles) s'est enregistrée chez louis-seller seul,
  sur ses fiches (vente_par_annonce), UN mail (vente:2851) ; rien chez louis@.
- L'annonce 10432288057 (article PRO de louis@ publié sur @evat) **reste en ligne telle quelle** (décision de Nico) : sa
  vente s'enregistre chez louis@, qui l'a publiée.
- **Leboncoin partagé** : 32 annonces publiées par louis-seller (18:28 → 19:08), toutes avec leur numéro, 0 suivie par le
  compte principal, 0 écartée (aucun relevé LBC n'a tourné depuis) ; le premier relevé LBC de louis-seller (cette nuit,
  ou « Synchroniser ») les rattachera — à relire : `annonces_plateforme` de 447d920c sur ces 32 numéros.

## 3. eBay ÷ 5
- Rejeu reproductible `scripts/bancs/zero-friction/rejeu-ebay.mjs` (catégorie lue dans `categorie_journal`) :
  **156 affichées → 27** (vraies 139 → 27), central = pessimiste → **÷ 5,8**.
- Leviers sans IA : « Longueur de la robe » n'est plus traitée comme une mesure + règle du texte (banc 12/13) ; une valeur
  connue (défaut sûr, réponse IA déjà reçue) est reposée si la personne n'a pas touché le champ (plateforme 54/54) ; aucune
  question avant le pré-calcul de catégorie ; une décoration murale ne prend plus l'icône de son motif ; issue
  `plateforme_decochee` distincte.
- Restent 27 : dimensions réelles de décorations murales (13), style/matière absents du texte (8), tailles hors grille (2),
  objets inconnus (3), robe sans texte (1). À décider : « House de couette » → « Couette » posé par la règle du texte.

## 4. Titre Vinted « trop de symboles »
- `_shared/titre-symboles-vinted.js` + même règle dans l'extension 0.6.128 : « — » → « - », « … » retirés, « – » collé à un
  symbole → « - », suite ≥ 3 symboles réduite, marque masquée. Mesure : **0 titre accepté changé sur 70 555**.
- Servi par get-pending-jobs (publication et republication) ; un refus « symboles » repart une fois en mode strict
  (pas-de-rouge, règle 7 de questions-tranchées). Le job 5d993767 repartira seul au passage de handler-watch.

## 5. Leboncoin PRO — poids du colis
- Cause : la sonde des critères attendait 4 s ; le formulaire PRO les rend plus tard et n'a pas la case livraison →
  remplissage sauté, verdict qui ne reposait que l'état. Correctif 0.6.128 : sonde 15 s sur le PRO, seconde passe sans
  sonde, verdict qui repose toute valeur du job présente dans la liste (jamais hors liste). Trouvé en plus : le canal
  générique cherchait le champ par `label[for]` seul.
- **Preuve sur un vrai compte PRO du parc : pas faite** — elle demande de piloter le navigateur de la personne. Preuve sur
  maquette du formulaire PRO (le vrai `leboncoin.js` en vm, critères à 9 s et 17 s) : poids posé, « Valider et payer »
  jamais cliqué (selftest `lbc-pro-poids` 26/26). Serveur : un mur « paiement » d'un passage précédent ne déclasse plus
  la question (b1b9bb68).

## 6. Depop — retrait sans identifiant
- **Prouvé en réel (19:18)** : retrait 81188384 de thibault — numéro retrouvé par get-pending-jobs (slug du lien,
  `depop_product_id` du dépôt, « jamais par le titre »), DELETE HTTP 204, vérification 404 ; page publique en 410.
- L'identifiant n'a jamais manqué : `thard_733-jean-bonobo-…` contient « _ », refusé par la règle de lecture des liens
  (serveur, SQL, extension). Corrigé partout ; un retrait sans identifiant le retrouve seul par son lien puis par son dépôt
  (slug + `depop_product_id`), jamais par le titre (migration 20261018180000, essai 8/8).

## 7. Relevés morts
- RPC `surveillance_releves()` (migration 20261018190000, essai vert, 15 ms) : une boutique non surveillée depuis plus de
  24 h à cause d'une session fermée devient la **première ligne de « À régler »**, rouge, avec le seul bouton « Se
  reconnecter ». La veille ne compte plus deux fois une annonce (lesmillesetunepepite Leboncoin : 430 → 217).

## Statut final, livraison, ce qui reste à Nico

### Livraison (lue après chaque geste)
- **Commits** : 4c3c5a6 (code, docs, selftests, extension 0.6.128, app 2.9.103), 73f7a77 (EXTENSION_LAST_COMMIT =
  2026-10-18T16:21:21Z, sans chrome-extension/), 492f753 (migration 20261018210000 + lot 1 de Régis), puis la doc finale.
- **Fonctions** (déployées depuis le dépôt commité, 18:2x, verify_jwt lus avant/après, inchangés) : update-job-status
  v143 → v144 (false), get-pending-jobs v261 → v262 (true), handler-watch v119 → v120 (false), generate-listing v120 →
  v121 (true), ebay-api-worker v90 → v91 (false), beebs-lien v14 → v15 (false), rapprochement-ia v9 → v10 (false),
  ia-banc-deduction v6 → v7 (false). Journaux depuis : 0 erreur, 0 réponse 5xx. Puis get-pending-jobs v263
  (`serveur:verif_redepot`), **v264** (19:15, garde Régis resserrée ; 23 appels en 200, 0 erreur) et **v265** (19:54,
  poste ouvert sur la boutique d'un autre compte), verify_jwt true avant/après.
- **Migrations** (inverses dans `supabase/rollbacks/`, essais dans `scripts/essais/`) : 20261018170000 (17:03),
  20261018200000, 20261018180000, 20261018190000 (18:23), 20261018210000 (18:2x — 180000, écrite avant 200000, avait
  effacé la condition des comptes reliés dans `armer_retrait_job_pour` ; relu : les deux correctifs y sont),
  20261018220000 (18:52, Leboncoin partagé, essai 7/7), **20261018230000** (19:54, une vente Vinted un compte, essai 23/23).
- **Extension 0.6.128** : `build\CWS-0.6.128-A-TELEVERSER\fillsell-extension-0.6.128-492f753-cws.zip` (seul zip du dossier,
  BUILD_ID `2026-10-18T16:26:21Z+492f753`, 37 entrées, 556 Ko). **Manifeste relu : identique à la 0.6.127 hors version,
  aucune permission nouvelle, même liste de fichiers.** La 0.6.127 est rangée dans
  `build\CWS-PERIMES\CWS-0.6.127-JAMAIS-TELEVERSEE-CONTENUE-DANS-0.6.128\` (la 0.6.128 la contient).
- **Selftests** : 364 avant → **374/374** après (suite complète relancée avant chaque commit, la dernière à 19:5x) ;
  `build:essai` vert ; eslint : aucune erreur nouvelle.

### Ce qui reste à Nico
- Décidé le 18/10 soir : réparation des 12 doublons faite ; Régis attend la 0.6.128 (aucun relevé serveur) ;
  l'annonce 10432288057 reste.
- Téléverser `build\CWS-0.6.128-A-TELEVERSER\fillsell-extension-0.6.128-492f753-cws.zip` **après l'acceptation de la
  0.6.126** (la 0.6.127 n'est plus à téléverser), puis « Envoyer pour examen ».
- À décider (expliqué à Nico le 18/10, rien changé sans son accord) : « House de couette » → « Couette » posé par la règle du texte eBay (valeur fausse) ; ajouter l'issue
  `plateforme_decochee` aux bilans SQL (`questions_publication_bilan`, `champs_requis_veille`) ; l'éclaireur de
  handler-watch relance encore sur un mur Leboncoin périmé (hors périmètre).
