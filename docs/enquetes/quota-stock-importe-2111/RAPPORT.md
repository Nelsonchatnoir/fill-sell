# 21/11/2026 nuit — le quota d'annonces comptait le stock importé, et l'IA écrivait à la place du vendeur (0c97dc8b)

Heures de Paris partout. Ordre de Nico (21/11, ~00:15) : le stock existant ne compte JAMAIS dans le quota d'annonces ;
le texte du vendeur fait foi ; corriger à la racine, recalculer, retirer la surcharge provisoire, un essai réel.

## 1. Cause prouvée — la garde de lecture du lot (19/11, 7f6c90e), pas le changement de 22:50
- 0c97dc8b (essai Pro + Cloud, cycle du 20/11 14:04) lance le 20/11 de 23:28 à 00:12 deux lots de 297 articles de son
  stock (233 imports Vinted, 58 Leboncoin), depuis son ordinateur (extension 19/11 b8a84d3 vivante, lots `cloud: true`).
- Chaque article Vinted sans description passe par la lecture de l'appli (`completerTexteDuVendeur` → extension de CET
  ordinateur, page publique). Elle n'a jamais répondu : **0** `lecture_fond` du poste b8a84d3 ; les 18 lectures du soir
  sont toutes de la copie Cloud (`-cloud`).
- La garde du 19/11 (`GARDE_LECTURE_MS` = 40 s, `LotPublication.jsx`) : passé 40 s, l'article était rendu AU MOTEUR SANS
  SA DESCRIPTION. **189** `lot_preparation_garde` issue « lecture » (42 s en moyenne), 23:29 → 00:11. Aucune demande de
  lecture d'origine n'était posée pour eux : la garde les sortait avant (13 demandes en tout, toutes lues par la copie
  Cloud en 10 à 40 s).
- Résultat : 128 générations `texte_vendeur_titre = true`, `texte_vendeur_description = false`, `vinted_sync` — TOUTES
  précédées d'une garde « lecture » (aucune sans) ; 119 fiches restées sans description (le texte de l'IA n'est jamais
  écrit sur la fiche). Les 23 gardes suivies d'une génération au texte du vendeur : la copie Cloud avait déjà posé la
  description sur la fiche, que generate-listing relit.
- Le lot du 20/11 22:50 (fenêtre de 6 lectures d'origine, rafale de 3) n'est pas la cause : il borne les lectures EN VOL
  ; la garde est du 19/11. Il ne l'a pas aggravée (avant : 10 lectures en vol, toutes à attendre leur créneau).
- Le quota : `quota_annonces_consommees` (règle du 10/11) n'exemptait que titre ET description du vendeur → les 128 ont
  compté : « Tu as utilisé tes 120 annonces » à 00:03 (186 à 00:36).

## Correctif (règle, tous les comptes)
- **Lot** (`regles.issueGardeLecture`) : à l'échéance de la lecture, un article IMPORTÉ dont le texte n'est pas en main
  passe à « Lecture de ton annonce d'origine » (la fenêtre la demande, la ligne dit le motif d'un échec et ses issues :
  Réessayer, Écrire, Retirer) — jamais le moteur. Il ne cède au moteur que revenu d'une lecture d'origine faite (la base
  fait foi). Un article sans annonce d'origine : comme avant. Le refus du serveur (ci-dessous) le renvoie attendre,
  moteur démonté ; au 3e refus la ligne le dit (« FillSell n'écrit pas ta description à ta place »).
- **generate-listing v151** : un article importé relu en base, sans sa description, dont l'annonce d'origine n'est pas
  lue (`lectureOrigineEnAttente`, la règle de get-pending-jobs) → **409 `texte_origine_non_lu`** avant le guichet et l'IA,
  rien de décompté, tracé (`usage_logs` « texte_origine_non_lu »). Un écran d'avant l'OTA lit le message
  (`generation_limit`). Inchangés : « Générer » demandé, « Écrire » / « Faire rédiger » posé sur la fiche, annonce lue
  sans texte, disparue, base illisible.
- **Photos** : le lot pose les photos d'origine même quand la sélection du moteur était déjà juste (point 6).

## 2. Ce qui est parti en ligne avec un texte de l'IA — RIEN (relu le 21/11 08:40)
- Ses publications depuis le 20/11 23:00 : **49 en ligne** (38 Vinted, 11 Beebs) et **296 en file** (147 Beebs, 149
  Leboncoin) : toutes portent SON texte. get-pending-jobs retient une publication dont l'annonce d'origine n'est pas lue
  et impose le texte du vendeur lu après la copie (`contenu_du_vendeur`) : 7 des 49 en ligne et 263 des 296 en file ont
  été corrigées ainsi au service. 5 republications Vinted (recréées depuis SA capture) : aucun texte de l'IA.
- Les 20 Vinted de 23:45 → 00:05 : les 21 articles Leboncoin publiés sur Vinted, texte du vendeur. Les 17 en attente de
  00:09 sont partis depuis, texte du vendeur (4 imposés au service).
- Hors 0c97dc8b (comptes ayant eu une garde « lecture » depuis le 19/11) : 8fd44622 ×4 en ligne, 52f5dc70 ×1 en ligne + 6
  en file dont la copie ne reprend pas le texte de la fiche — non regardés un par un (retouche de la personne possible) ;
  RIEN touché.

## 3-4. Le quota — migration 20261121010000 (feu vert de Nico, appliquée le 21/11 à 00:41)
- `quota_annonces_consommees` (même signature, droits postgres + service_role inchangés, md5 6e2f60f0… → 285a17df…) :
  une ligne `generate_listing` d'un article importé (`texte_vendeur_origine` = `vinted_sync` ou `releve_*`, avec
  `inventaire_id`) ne compte plus et n'ouvre pas la dédup 24 h. generate-listing ne présente plus ces articles au
  guichet (`stockImporte`), la ligne porte `stock_importe: true`. Preuve sur Postgres jetable 19/19
  (`PREUVE_PG=embarque node scripts/quotas/preuve-stock-importe.mjs`), inverse à l'octet près
  (`supabase/rollbacks/20261121010000_stock_importe_hors_quota_INVERSE.sql`).
- Le compteur est CALCULÉ : tous les comptes sont recalculés par la seule réécriture. Instantané avant :
  `scripts/reparations/20261121_recalcul_quota_stock_importe_SAUVEGARDE.json` (44 comptes, cycle en cours).
- Bloqués EN CE MOMENT à tort (avant → après) : 0c97dc8b Pro 186 → 0 (sans sa surcharge : bloquée) ; 8fd44622
  Premium 40/40 → 0 ; 4cfb7afe Free 6/5 → 0 ; 2f4383e9 5/5 → 0 ; e9980760 5/5 → 0 ; 56881318 5/5 → 0 ; 0f3800cd 5/5 → 0 ;
  116a51bb 5/5 → 4. Encore à 5/5 : 6f41de45 (5 vraies créations — juste).
- Ont heurté un mur « annonces » depuis le 02/09 alors que la règle corrigée leur laissait de la place (mesure à
  l'instant du blocage, palier d'aujourd'hui) : 38 comptes, dont 53efea05 ×16, afeef3c7 ×10, f175c284 ×10, 19785fd7 ×10,
  5f704c61 ×8, 4cfb7afe ×7, 379aa8a7, bd380fbf, 2f8b09d2 ×6, bf85d176, 116a51bb, 5e78a731 ×5, 8fd44622, a3002ab6,
  a6f2ed97, e25ff459, 6eb8400b, 9148e867 ×4, puis 6a7595b1, fc37c75e, 4248ce4a, 6c2ad0d7, 6f41de45, 7373c96c, 7e1a0836,
  975fe2c6, a962a59e, c867ffe9 ×2-3, et c22c5429, 0909a787, cdf7007c, 68e350f0, e991fc5e, eacbe32c, ed4d2d4e, 4920948d,
  b245e854 ×1. Aucun mail envoyé (feu vert de Nico).

## 5. La surcharge de 0c97dc8b — retirée (21/11 08:33)
- `scripts/reparations/20261121_quota_annonces_0c97dc8b_retire.sql` (gardes : migration passée, décompte < 120 ;
  sauvegarde `_backup_2111_quota_0c97dc8b`, inverse `…_INVERSE.sql`). Relu : palier Pro, plafond **120**, consommées
  **0** → 120 annonces disponibles (ses 74 générations de la nuit ne comptent pas : stock importé).

## 6. 22 retouches pour un quota Pro de 20
- Le lot ne posait les photos d'origine que s'il changeait la sélection du moteur : sinon la retouche par défaut des
  paliers payants (`ia_light`) partait — 22 retouches non demandées (23:28 → 23:32, ses articles Leboncoin).
- Le dépassement : la course du guichet de retouche (compté avant, ligne posée après la retouche ; 3 préparations à la
  fois) — les retouches 20, 21 et 22 sont parties quand 19 étaient comptées. Corrigé à la source pour le lot (photos
  d'origine toujours) ; la course elle-même reste possible à l'unité avec plusieurs onglets — à décider (réservation
  atomique = migration). Ses 22 retouches restent comptées (à décider par Nico : les lui rendre ?).

## Essai réel (21/11 08:39, compte de Nico f44b5917, prod : generate-listing v151 + la migration)
- Session à usage unique (API d'administration), révoquée ; 4 fiches TEST (999 €, « ne pas acheter »), supprimées.
- A, import Vinted au texte lu : 200, la copie Vinted reprend le texte mot pour mot, compteur 0 → 0 (`stock_importe`).
- B, import Vinted au texte pas encore lu : **409 texte_origine_non_lu**, rien rédigé, fiche intacte, 0 → 0.
- C, import Vinted, choix « Faire rédiger » : 200, rédigé, fiche jamais écrite, 0 → 0.
- D, création neuve : 200, rédigée, compteur **0 → 1**.
- Le lot à l'écran (garde → « Lecture de ton annonce d'origine ») : prouvé par selftest, pas joué dans un navigateur
  (aucune lecture lente reproductible sur une fiche TEST). Arrive au web au push, au mobile à la prochaine OTA.

## 21/11 matin — décisions de Nico (points 1 à 3)

### Point 1 — les 22 retouches de 0c97dc8b rendues (09:58)
- `scripts/reparations/20261121_retouches_rendues_0c97dc8b.sql` : les 22 lignes `photo_retouche` (20/11 23:28 → 23:32)
  restent (coût, télémétrie) et portent `metadata.hors_quota` (« retouche_non_demandee_lot ») ; sauvegarde
  `_backup_2111_retouches_0c97dc8b`, inverse `…_INVERSE.sql`. Relu : 0 retouche consommée sur 20.

### Point 2 — la retouche réservée avant l'appel image (migration 20261121120000, feu vert de Nico)
- `reserver_retouche` (service_role seulement) : verrou par compte, compte, refuse au quota, sinon pose la ligne
  « réservée » ; generate-listing complète la même ligne à la fin. `retouches_consommees` = le décompte unique (quotas_etat
  aussi) : livrées + réservées en cours ; jamais une rendue, ni une réservation sans suite depuis 10 min.
- Preuve sur Postgres jetable 13/13 : 3 réservations simultanées à 19/20 → une seule passe ; inverse à l'octet près.
- Les vraies retouches demandées comptent comme avant (livrées, règle du 01/10).

### Point 3 — les copies sans le texte de la fiche, une par une
- **52f5dc70** (5 fiches) : la « description » de la fiche est `$17b` / `$17d` — la RÉFÉRENCE d'un texte du flux Next.js
  de la page Vinted, que `lireFluxNextVinted` (extension ≤ 0.6.195) ne résolvait pas (lecture « page », extension du
  poste, 20/11 23:15 → 23:23). Un seul « mot » : l'IA a rédigé à la place du vendeur. Le vrai texte du vendeur n'a
  JAMAIS été lu — « repartir avec le texte de la fiche » partirait avec `$17d` : elles sont donc RETENUES jusqu'à une vraie
  lecture, puis repartent avec le texte du vendeur imposé au service (contenuAImposer).
  · En file (6, attendent aussi sa connexion Leboncoin / Beebs au Cloud) : Mug Molly Hatch (Leboncoin af797a9b, Beebs
    b652060d), Parka Terres Salines (Beebs e29ab778, Leboncoin c8a737cb), Nike Air Max Dn (Leboncoin 61ad9b47, Beebs
    15c4ebac). 2 eBay en « À régler » (79c35f5b, fd524835).
  · En ligne (1) : eBay « Mug Molly Hatch x Anthropologie Dog Mug Doodle vintage vibe's » — https://www.ebay.fr/itm/880138201156
    — en ligne : « Mug Molly Hatch x Anthropologie aux motifs de chien stylisés. Blanc avec décors graphiques de style
    vintage. Neuf avec é… » (IA) ; fiche : `$17b` (pas un texte). Rien retiré ni republié.
- **8fd44622** (4 fiches, lot du 19/11 17:19 → 17:32) : la lecture d'origine a échoué 3 fois par fiche (copie Cloud,
  « onglet_indisponible », 14:23 → 15:27) puis la garde du lot du 19/11 a envoyé les articles au moteur sans leur texte
  (texte_vendeur_description = false) : la cause couverte par le correctif de la nuit (attente de la lecture d'origine,
  motif sur la ligne, refus du serveur). Le texte de la fiche N'EST PAS celui du vendeur non plus : c'est la copie
  Leboncoin rédigée par l'IA, posée sur la fiche sans marqueur ni journal (chemin d'écriture non prouvé). En ligne, eBay :
  · « Geographical Norway » — https://www.ebay.fr/itm/407375028015 — en ligne : « Vêtement Geographical Norway taille M en
    très bon état. Pièce de qualité, prête à être portée. » ; fiche : « Vêtement Geographical Norway, taille M. Article en
    très bon état. Remise en main propre ou envoi possible. »
  · « Doudoune Puma » — https://www.ebay.fr/itm/407375028601 — en ligne : « Doudoune Puma en taille M. Article neuf sans
    étiquette. Envoi rapide et soigné. » ; fiche : « Doudoune Puma, taille M. Article neuf sans étiquette. Remise en main
    propre ou envoi possible. »
  · « Veste polaire réversible Columbia » — https://www.ebay.fr/itm/407375028972 — en ligne : « Veste polaire réversible
    Columbia en taille XS. Pièce pratique et polyvalente, à porter au quotidien ou en couches pour… » ; fiche : « Veste
    polaire réversible Columbia en taille XS. Très bon état, prête à porter. Remise en main propre ou envoi possible. »
  · « Hoodies "Indiana Est. 1816" » — https://www.ebay.fr/itm/407375034126 — en ligne : « Hoodie Gildan de couleur bleu
    marine avec l'inscription « Indiana Est. 1816 » imprimée sur la poitrine. Coupe classique… » ; fiche : « Hoodie Gildan
    de style casual avec inscription « Indiana Est. 1816 ». Taille S. Très bon état, porté peu de fois. »
  · Leurs 4 copies Leboncoin (en ligne) portent le texte de la fiche — un texte de l'IA, pas celui du vendeur.
- Correctif (cause non couverte) : extension **0.6.196** (référence résolue, jamais écrite) ; `descriptionIllisible`
  (serveur et app : ni texte ni lecture) ; réparation des 8 fiches `$xx` (52f5dc70 ×5, 35ab6f0f ×2, d87570eb ×1) :
  `scripts/reparations/20261121_description_reference_vinted.sql` (fiche sans description, lecture redemandée ;
  sauvegardes, inverse). La copie Cloud de l'extension garde l'ancien lecteur jusqu'à son redéploiement (accord de Nico).
- ⚠ Complément (11:2x) : la fusion des attributs (`inventaire_attributs_avant_update` → `inventaire_attributs_fusion`) ne
  RETIRE JAMAIS une clé — « attributs - 'description_source' » n'avait rien retiré. 6 fiches (52f5dc70 ×5, d87570eb ×1)
  gardaient leur marqueur de lecture daté : get-pending-jobs les aurait crues lues (description vide = rien chez le vendeur)
  et laissé partir les 6 publications de 52f5dc70 avec le texte de l'IA (elles attendaient encore sa connexion Cloud : rien
  n'est parti). Corrigé par `scripts/reparations/20261121_description_reference_vinted_marqueur.sql` : marqueur REMPLACÉ
  (même source, rang égal) par un marqueur sans date (« reference_a_relire ») ; relu : les 6 fiches « non lues », en
  attente. RÈGLE pour toute réparation : un attribut de fiche se remplace (même rang ou plus), il ne se retire pas.
- Preuve en prod : les 2 fiches de 35ab6f0f relues à 11:16 par la copie Cloud 0.6.196 (déployée par Opus-1 à 10:58) —
  leur vrai texte (« Veste militaire vintage INDUYCO taille 48… », « ✨ATTENTION MANQUE UN BOUTON… ») est sur la fiche.

## 21/11 midi — décisions de Nico (Cloud fermé, Beebs de 0c97dc8b, fiches de 8fd44622)

### 1. cloud-2 fermé aux nouveaux à 11:20:31 — un compte ne fige plus jamais la capacité
- Cause : `signesGraves` (serveur-cloud/src/flotte.js) comptait `restriction_ou_blocage` dès qu'UN compte portait un signe
  de plateforme dans la fenêtre (11:20:31 : 0c97dc8b, `blocage 1, datadome 3` — un captcha Beebs) ; bloqué 24 h, capacité
  figée aux 18 servis (atteignable 40). Le blocage revenait aussi par le détail SQL (somme des signes, sans compte ni IP) et
  par `grave_le` relu au démarrage ; le collecteur rangeait « verification_revenue » en « blocage ».
- Correctif (6a2f326) : seuls mémoire / processeur / puce / oom, ou PLUSIEURS comptes bloqués sur PLUSIEURS IP dans la
  même fenêtre (`plusieurs_comptes_bloques`) ; le détail SQL ne compte plus ; un blocage gardé sans vraie raison serveur
  n'est pas repris au démarrage (`graveAReprendre`, `raisons_graves` déclarées) ; collecteur : `verification_revenue` →
  `glissiere`. Verrous : `selftest:cloud-capacite-paliers` (10/10 ; le test 9 rejoue la ligne réelle — rouge sur l'ancien
  code), `selftest:cloud-orchestrateur` 242/242. Levée : redéploiement de l'orchestrateur par Opus-1 (feu vert de Nico).

### 2. Beebs de 0c97dc8b à 11:19 — une GLISSIÈRE DataDome, pas un blocage d'accès (rien changé)
- Journal de l'orchestrateur (extrait lu par Opus-1) : 11:05:51 vérification d'appareil (« interstitial ») passée SEULE à
  11:05:53 (`verification_passee_seule`, lecture http 200) ; 11 publications Beebs ; 11:19:00 `datadome_vu` défi
  **captcha** ; 11:19:10 Beebs arrêtée pour ce compte (`verification_revenue`, nature vue « glissiere », verrou + coffre),
  captcha revu toutes les ~40 s jusqu'à 11:22. Un blocage d'accès aurait été `t=bv` → « bloque » : absent. Aucun autre
  compte n'a de signe de 11:00 à 11:40. Pas de capture d'écran : aucun outil en lecture seule sur un navigateur client.
- Deux causes : (a) l'IP 76 (72.9.173.132, AS2914 NTT America, organisation TELUS, classée **hébergeur**) : 26 signes DataDome
  pour 22 publications Beebs en 72 h ; l'IP 87 (Orange) : 7 pour 74 ; (b) l'orchestrateur a compté la vérification passée
  SEULE à 11:05 comme une « résolution » : la glissière de 11:19 est devenue « redemandée juste après » → Beebs arrêtée
  sans bouton « Résoudre » pour la cliente (`verifications.js` : « revenue » n'exclut que « confirmation »).
- Proposé (rien fait) : lui donner l'IP Orange **94** (81.22.142.8, Beebs ouverte au dernier contrôle ; pas la 99 :
  Beebs et Leboncoin 403 « datadome_bloque » le 20/11), la 76 repart au stock pour un compte sans Beebs (aucun achat) ;
  elle aura très probablement UNE glissière à résoudre au premier passage sur chaque plateforme (nouvelle IP, mêmes
  cookies, mêmes sessions). Et ne plus compter une vérification passée seule comme une résolution.

### 3. 8fd44622 — fiches vidées, texte du vendeur remis une fois lu
- `scripts/reparations/20261121_texte_ia_fiches_8fd44622.sql` (11:4x) : 4 fiches sans description, marqueur « à relire »,
  lecture redemandée ; relu : non lues. Sauvegardes `_backup_2111_texte_ia_8fd44622`, `_backup_2111_lecture_8fd44622`.
- eBay (4, API) : fonction `remise-texte-vendeur-ebay` v1 (verify_jwt true, clé de service seulement, simulation par
  défaut) + `scripts/reparations/20261121_texte_vendeur_ebay_8fd44622.mjs` : à 11:4x, les 4 → `texte_pas_encore_lu` (rien
  touché). À relancer avec `--executer` dès que les 4 fiches sont lues (une seule description réécrite, sur place).
- Leboncoin (4) : leur prochaine republication part avec le texte lu (contenuAImposer, règle existante, verrou
  `selftest:texte-vendeur-en-ligne-2111`).
- Le mug de 52f5dc70 (eBay 880138201156) a été publié par l'EXTENSION : l'API eBay ne le modifie pas — à décider.
