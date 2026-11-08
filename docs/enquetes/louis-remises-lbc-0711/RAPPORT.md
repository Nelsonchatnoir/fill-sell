# Louis (Amiral, Business) — remises Leboncoin bloquées — 07/11/2026 nuit (heure de Paris)

Message de Louis, 07/11 21:47 : « Je loupe des ventes, car mes annonces ne repartent pas sur LBC. Le 3e de la liste,
je l'ai enlevé moi-même du bon coin. » Aucun mail envoyé à Louis : c'est Nico qui lui écrit.
Sources : base de prod (lecture), journaux de get-pending-jobs, pages publiques Leboncoin lues depuis l'onglet de Nico
(lecture seule), centre d'aide officiel de Leboncoin (assistance.leboncoin.info, lu le 07/11).

## 0. Déblocage

### 0a. Le 3e (« Rangement Noir », fiche 1791020281283, remise cc247496) : EN LIGNE ET ACHETABLE
- Retenu par la série seule : « série louis-remises-lbc-0611 : tâche cc247496 (rang 5) tenue — attend_rang_1 » à chaque
  passage. Sa vendue 3297440551 était relevée disparue le 06/11 à 22:01 : la règle A ne la retenait pas.
- 22:18:53 : sortie de série (`scripts/reparations/20261107_louis_remise_noir_hors_serie.sql`, sauvegarde
  `_backup_0711_louis_remise_hors_serie`, inverse). 22:20:07 servie ; 22:21:02 déposée → **3304491516**, en ligne à
  22:21:13 ; page lue à 22:21:32 (« active », « Acheter », « Faire une offre ») et encore à 22:36:41 (« active »).
- Ce que le test prouve : même article, même contenu, même poste. Désactivé le 06/11 à 07:28, ancienne annonce affichée ;
  il passe aujourd'hui, ancienne annonce partie.

### 0b. Les 8 autres : pages publiques lues entre 22:19 et 22:21 — aucune achetable
Pour comparer, une annonce normale de Louis (3295761286) affiche « Acheter » et « Faire une offre ».

| Remise | Article | Ancienne annonce | Page publique |
|---|---|---|---|
| 18af38a2 (rang 1) | Noir et Rouge | 3297400164 | « Article vendu » (sold) |
| fdda158a (rang 2) | Adaptateurs Orange | 3298491503 | « Article vendu » (sold) |
| 886605bf (rang 6) | Blanc | 3280443604 | « Article vendu » (sold) |
| 951cc7fc (rang 7) | Noir et Gris | 3297299585 | « Article vendu » (sold) |
| 9e3f4b0a (rang 3) | Blanc et Vert Pomme | 3295743872 | achat en cours (pending) : bouton « Message » seulement |
| 6e6cd97d (rang 4) | Bleu et Bleu Ciel | 3295398035 | achat en cours (pending) |
| 1089e37e (rang 8) | Zombicide Jaune | 3298021777 | achat en cours (pending) |
| 7ef7d84f (rang 9) | Zombicide Orange | 3297234692 | achat en cours (pending) |

Rien déposé, rien retiré au point 0 : déposer avec l'ancienne annonce affichée aurait fait un 5e refus.

### 0c. Feu vert nommé de Nico (07/11 nuit) : les 4 « Article vendu » retirées par FillSell, une par une
Voir § Retraits ci-dessous.

## 1. Enquête — ce qui est prouvé

### Les 9 ventes : réelles
- Les 9 annonces portent la transaction Leboncoin sur leur page publique, et la vente est enregistrée dans FillSell :
  ventes 470065-470071 (enregistrées le 06/11 à 07:15) et 476032-476033 (06/11 à 19:11).
- Pages lues le 07/11 entre 22:19 et 22:21 : 4 « sold » (« Article vendu ») et 4 « pending ». Le Noir et Rouge est passé
  de « pending » (relevé de 17:42) à « sold » (page lue à 22:19).
- Certaines ventes sont anciennes et n'ont été lues qu'en rattrapage (relevé des 30 derniers jours) :
  - Blanc : vente du 03/10 à 21:01 ;
  - Noir et Gris : 30/10 à 17:05 ;
  - Adaptateurs : 31/10 à 10:27 ;
  - Noir : 31/10 à 11:15.
- Aucune fausse vente. Pas de doublon : aucune vente Leboncoin plus ancienne enregistrée pour ces fiches.

### Plusieurs exemplaires : oui pour la fiche, non pour l'annonce
- Les fiches sont en quantité 9 996 à 9 998 : de l'impression 3D à la demande.
- Mais chaque annonce Leboncoin ne se vend qu'une fois : une fois vendue, la page affiche « Article vendu » ou n'a plus
  de bouton d'achat.
- L'hypothèse « l'annonce reste achetable après une vente, la remise serait un doublon » est fausse pour ces 9 annonces.

### Motif des refus Leboncoin : NON LU (non prouvé)
- Les 11 dépôts refusés sont tous « Cette annonce est désactivée » (410) au 07/11 à 22:22 : les 7 du 06/11 au matin et
  les 4 de la série (3303702852 du 06/11 à 20:07, 3303792394 du 07/11 à 01:14, 3303867959 à 06:50, 3304017454 à 11:25).
- La page ne donne aucun motif, et le relevé « Mes annonces » ne liste pas les annonces refusées.
- Le motif est dans le mail « Votre annonce a été refusée » que Leboncoin envoie à Louis (mécanisme prouvé par l'essai
  du 30/10). Nous n'y avons pas accès.
- Ce qui est prouvé : les 4 dépôts faits avec l'ancienne annonce affichée ont été refusés, dont un sans marque SEB. Le
  même article est accepté une fois l'ancienne annonce partie (le 3e à 22:21, puis les retraits ci-dessous).

### Pourquoi le 3e n'est jamais parti alors que son annonce avait disparu : PROUVÉ (journal)
- La série tenait chaque rang derrière TOUS les rangs plus petits, publiés ET vus en ligne.
- Journal de cc247496, heure par heure, du 06/11 à 22:00 au 07/11 à 22:18 :
  - attend_extension_0.6.176 ;
  - puis rang_1, rang_2, rang_3, rang_4 « pas_encore_vu_en_ligne » : leurs dépôts avaient été désactivés, donc jamais vus ;
  - serie_arretee:9e3f4b0a (07/11, de 13 h à 17 h) ;
  - puis attend_rang_1 (de 17 h à 22:18) : le rang 1 était remis en attente de sa vendue (règle A).
- Une remise libre attendait donc derrière des remises bloquées, sans fin.

### Pourquoi aucun relevé Leboncoin depuis 17:42 : PROUVÉ (code et base)
- Le relevé quotidien se fait 20 h après le dernier relevé fini (`RELEVE_CADENCE_CRON_MS`). Le dernier datait de 17:42
  (« veilleur »), donc le suivant était prévu le 08/11 vers 13:42.
- Les relevés de la série (serveur:verif_redepot, toutes les 48 min jusqu'à 13:50) s'étaient arrêtés : depuis le retour
  de la règle A (vers 16:04), les rangs 1 à 4 étaient retenus AVANT la série, et plus aucun n'attendait d'être vu.

### Pourquoi 3304017454, noté « published », a été rebloqué : PROUVÉ, et c'était juste
- Déposé le 07/11 à 11:25 (rang 4). Jamais vu par les relevés de 12:14, 13:02, 13:50 et 17:42. Page en 410 le 07/11
  (et encore à 22:22).
- La règle du 07/11 (option A) remet en attente un dépôt « published » jamais vu depuis 2 h dont la vendue est encore
  affichée : remis en attente à 17:15, dépôt archivé dans `depots_desactives_regle_a`.
- Le « published » était faux : Leboncoin avait désactivé l'annonce.

## 2. Correction à la racine (tous les comptes) — code prêt, RIEN déployé
Règle : `docs/regles/ventes-et-retraits.md` § « 07/11 nuit ».
- **L'annonce d'origine encore achetable après une vente ⇒ aucune remise** (`etatAnnonceVendue` → `toujours_en_vente`) :
  - cas : l'annonce est affichée SANS transaction, lue APRÈS la création de la remise (vente annulée, ou plusieurs
    exemplaires sur une même annonce) ;
  - effet : la remise est close « cancelled » avec un message vrai, jamais déposée ;
  - une lecture plus ancienne que la remise vaut « à relire » : retenue et relevé demandé, jamais une clôture.
- **Une remise part dès que l'annonce d'origine n'est plus en ligne** :
  - get-pending-jobs la sert au premier passage (règle A gardée pour une vendue réellement affichée) ;
  - un relevé « Mes annonces » est demandé au plus toutes les 60 min tant qu'une remise attend, pour que la disparition
    se voie. Avant, il fallait jusqu'à 20 h.
- **Une remise en attente ne bloque jamais les suivantes** : la série tient « un dépôt à la fois » sur ce qui est
  réellement parti, saute ce qui attend, compte l'intervalle depuis le dernier dépôt. Elle ne s'arrête plus sur une
  simple question (`needs_user`), seulement sur un refus.
- **Jamais bloquée en silence, bornée** :
  - la raison est écrite sur la tâche (`attente_annonce_vendue`, seulement quand elle change) ;
  - l'app dit « En pause : achat en cours / Leboncoin affiche encore ton annonce vendue n° … » ;
  - après 48 h : « À toi de jouer : … supprime-la sur Leboncoin » (etat-job.js, recopié dans l'extension 0.6.180).
- **Retrait par FillSell de la vendue une fois la vente close** : codé (handler-watch, `decisionRetraitVendueClose`),
  interrupteur `RETIRER_VENDUES_CLOSES` COUPÉ, puis ALLUMÉ le 08/11 (feu vert nommé, § Suite du 08/11).
  - Gardes : transaction « sold » lue depuis 24 h au plus, jamais « pending », annonce de la remise seulement, un
    retrait par annonce, 20 par passage.
  - Simulation en lecture sur tout le parc (07/11 à 22:56) : seules les remises de Louis attendent, et la règle
    n'aurait rien armé (4 achats en cours ; le Noir et Rouge était encore « pending » au relevé de 17:42, avant de passer
    « sold » sur sa page).
- Selftests :
  - `remise-en-vente-attente` (dont les 9 lignes réelles de Louis et la règle de retrait) ;
  - `serie-un-par-un` (dont le cas réel du rang 5) ;
  - `etat-job` (états, phrases, borne, copie de l'extension) ;
  - `file-des-jobs`.

## 3. Lint
- `eslint.config.js` : `.claude/worktrees` ignoré (chaque worktree d'agent est une copie complète du dépôt).
- `npm run lint` va maintenant au bout (2 min) au lieu de planter. Il signale 1 052 erreurs et 513 avertissements, tous
  ANCIENS : aucun dans les fichiers de ce lot (lint de ces fichiers seuls : propre).

## Retraits (feu vert nommé de Nico, 07/11 nuit) — Louis, 4 annonces « Article vendu » seulement

### Preuve avant tout retrait (lecture seule)
- **État lu chez Leboncoin** : les 4 pages publiques portent `transaction_status` « sold » et le badge « Article vendu »,
  lu juste avant chaque retrait (lecture écrite sur la tâche, `lecture_avant_retrait`). Les annonces de Louis sont
  celles d'un **particulier** (`owner.type` « private »).
- **Règles officielles de Leboncoin** (centre d'aide, articles lus le 07/11) :
  - « Vendeur particulier : comment annuler une transaction ? » (360010025359, mis à jour le 07/11) : la transaction
    n'est annulée automatiquement que dans deux cas, disponibilité non confirmée sous 3 jours et envoi non confirmé
    sous 72 h. La suppression d'une annonce n'en fait pas partie ; une annulation se fait depuis l'onglet Transactions.
  - « Vendeur particulier : quand vais-je recevoir mon paiement ? » (4417741146642) et « … étapes d'une vente avec la
    Transaction sécurisée et la livraison » (360009934580) : l'argent est gardé jusqu'à la confirmation de réception, ou
    jusqu'au déblocage automatique (au plus tard 30 jours) ; une fois la transaction validée, il est versé au
    porte-monnaie.
  - « Comment supprimer mon annonce ? » (360000179269) et sa version Pro (360000033559) : supprimer une annonce supprime
    ses options. Toute annonce est supprimée d'office au bout de deux mois.
  - La page d'une annonce supprimée cite elle-même parmi ses causes : « Le bien a déjà été vendu et l'annonceur a
    supprimé son annonce ».
- **Non documenté par Leboncoin** : le sens exact de la valeur « sold ». Elle est lue comme la vente validée, pour deux
  raisons : la page dit « Article vendu », et « pending » (achat en cours) la précède. Quoi qu'il en soit, aucune règle
  publiée ne lie l'annulation ni le paiement à l'annonce : ils dépendent de la transaction.
- Les 4 achats en cours (3295743872, 3295398035, 3298021777, 3297234692) n'ont pas été touchés. Le script les refuse
  nommément.

### Chemin suivi
- Étape 0 (22:45:28) : les 4 remises sont tenues (`exige_version` 9.9.9 dans leur marqueur de série), pour qu'aucune ne
  parte avant la relecture de la page (`…_tenue.sql`).
- Pour chaque annonce :
  1. page relue « active / sold » ;
  2. tâche de retrait par son numéro et son lien (`…_retrait_<n°>.sql`, gardes en base) ;
  3. l'extension de Louis la supprime (identité vérifiée par l'URL et le titre, confirmation de Leboncoin) ;
  4. la base note l'annonce retirée ;
  5. page relue en 410 ;
  6. la remise sort de sa série (`…_liberer_<n°>.sql`) et part seule au passage suivant ;
  7. le nouveau dépôt est relu sur sa page.
- Script : `scripts/reparations/20261107_louis_retraits_vendues_closes.mjs` ; sauvegarde
  `_backup_0711_louis_retraits_vendues` ; inverse `…_INVERSE.sql`.

| Article | Ancienne annonce | Relue avant | Retirée | Relue après | Nouvelle annonce | En ligne et achetable |
|---|---|---|---|---|---|---|
| Blanc | 3280443604 | 22:45:35 active, sold | 22:46:16 (411b8693) | 22:46:32 : 410 | 3304500026 (déposée 22:48:54) | 22:49:33 « Acheter », « Faire une offre » |
| Noir et Gris | 3297299585 | 22:49:40 active, sold | 22:50:16 (3589c49f) | 22:50:25 : 410 | 3304501154 (déposée 22:52:58) | 22:53:22 « Acheter », « Faire une offre » |
| Adaptateurs Orange | 3298491503 | 22:53:28 active, sold | 22:54:16 (be182c98) | 22:54:32 : 410 | 3304502209 (déposée 22:56:56) | 22:57:15 « Acheter », « Faire une offre » |
| Noir et Rouge | 3297400164 | 22:57:15 active, sold | 22:58:15 (82ab4d5c) | 22:58:21 : 410 | 3304503201 (déposée 23:01:0x) | 23:01:15 « Acheter », « Faire une offre » |

Relecture à 23:00:36 : 3304491516, 3304500026, 3304501154 et 3304502209 toujours actives. Louis a 5 articles revenus en
vente le 07/11 au soir. Les 4 achats en cours n'ont pas été touchés.

## Feux verts à donner (Nico)
1. **Déployer le point 2** : get-pending-jobs (v350 → suivante, `verify_jwt` true) et handler-watch (v184 → suivante,
   `--no-verify-jwt`, avec `RETIRER_VENDUES_CLOSES` encore COUPÉ). Ce déploiement apporte :
   - la série qui saute ce qui attend ;
   - la raison visible, et la borne de 48 h ;
   - le relevé horaire tant qu'une remise attend ;
   - la clôture « toujours en vente ».

   L'app suit au push (web) ; le mobile suit à l'OTA. L'extension 0.6.180 est à téléverser en même temps : elle ne fait
   que recopier l'état des tâches.
2. **Allumer la règle « vente close → FillSell retire l'annonce vendue → la remise part »** pour tous les comptes
   (`RETIRER_VENDUES_CLOSES = true`, puis redéployer handler-watch). Elle a été prouvée à la main sur les 4 de Louis
   (§ Retraits).
3. **Les 4 achats en cours de Louis** (3295743872, 3295398035, 3298021777, 3297234692) : rien à faire. Ils partiront
   d'eux-mêmes dès que leur vente sera close et leur annonce retirée, soit par Louis, soit par la règle 2 une fois
   allumée.
