# Le relevé crée une 2e fiche pour une annonce qu'on a déjà — 27/10/2026

Demande de Nico (27/10, après le GTA) : trois imports en 14 jours ont créé une fiche alors que l'identifiant de
l'annonce, même plateforme, même compte, était déjà porté par une autre fiche. Heures de Paris.

## 1. Cause : une régression du 07/10, et une porte jamais gardée

- **Jusqu'au 07/10**, le relevé passait chaque annonce par `rapprocher_traiter_annonce`, qui la rattachait par
  l'identifiant d'un dépôt FillSell **publié** (`job`) **ou vendu/annulé** (`job_clos`, règle du 25/09).
- **07/10, `6d6e012`** (moteur v3, « rattachement avant stock ») : `rapprocher_releve` ne rattache plus rien lui-même,
  le moteur du compte compare photos et titres. `rapprocher_traiter_annonce` n'est plus appelée que par des outils de
  rattrapage manuels.
- **09/10, `70a1bfe`** : `rattacherParIdentifiant` (fonction edge `rapprochement`) remet l'identifiant avant le moteur —
  mais **seulement pour les dépôts publiés**, et seulement si la passe du moteur arrive la première.
- Les deux portes d'écriture n'ont jamais lu l'identifiant : `rapprocher_importer` (la seule qui crée une fiche
  « releve_* » : moteur, bouton « Importer » de la personne, rattrapages) et `rapprochement_attacher` (photo).

| Cas | Dépôt qui porte l'identifiant | Ce qui s'est passé | Cause |
|---|---|---|---|
| Nico, Depop `nvlsonchatnoir-roman-en-tres-bon-etat-30fa` | `6eef55a8` **publié**, fiche 1793009407689006 | « Importer » de la personne le 27/10 à 09:21:01, 20 s après le relevé → fiche 1793089261133 | porte jamais gardée (le moteur passe chaque minute) |
| XEWER, Leboncoin 3295236977 | `3b92d5ca` **vendu**, fiche 1792945124235 | import du moteur le 26/10 à 08:29 → fiche 1792999747010 | régression du 07/10 (dépôt clos) |
| Johan, Beebs 34209247 | `a385636d` **vendu**, fiche 1792585627450 | rattachée par la photo le 26/10 à 12:27 à 1792909660810 | régression du 07/10 (dépôt clos) |

## 2. Ce qui change (migration `20261027120000`, en attente du feu vert nommé de Nico)

- **`annonce_rattacher_par_identifiant`** : une annonce qu'un dépôt FillSell du compte désigne (même plateforme,
  `listing_designe`, non détaché ; le dépôt avant un job de suivi d'un relevé) rejoint la fiche de ce dépôt. Dépôt publié
  → son job ; clos sur fiche en stock → job de suivi ; clos sur fiche vendue → le dépôt clos. Rien retiré, redéposé ni
  marqué vendu. Une annonce que la personne a détachée de cette fiche n'y revient pas. Jamais un titre ni une photo.
- **`rapprocher_importer`** et **`rapprochement_attacher`** : la règle d'abord, le reste inchangé. Vaut pour toutes les
  plateformes relevées (Leboncoin, Beebs, eBay, Depop) ; Vinted a son identité (`vinted_item_id`) : 0 doublon au parc.
- **`fiche_releve_doublon_resorber`** : la même règle après coup. Seulement pour une fiche née d'un relevé ET intacte
  (en stock, aucune vente, aucune autre annonce, aucun job hors relevé ni en cours, rien saisi par la personne ; le prix
  posé à la naissance par l'import de la personne n'est pas une saisie). Le job de suivi de cette fiche est clos et
  détaché, l'annonce rejoint la fiche du dépôt par la règle, la fiche est absorbée (`fusionne_dans`, journal
  `inventaire_fusions`). Sinon : rien n'est écrit, la raison est rendue.
- Écran « Rattacher » : « Importer » sur l'annonce d'un dépôt dit où elle est allée (`ratFaitAttache`).
- Réparation `scripts/reparations/20261027_doublons_identifiant.sql` (4 sauvegardes, inverse) : la résorption passe sur
  chaque paire du parc.

## 3. Le parc entier

Annonces (hors Vinted) posées sur une fiche alors qu'un **dépôt FillSell** (pas un job de suivi) d'une **autre** fiche
vivante du même compte porte leur identifiant : **4**.

| Annonce | Fiche de l'annonce | Dépôt | Issue |
|---|---|---|---|
| Nico, Depop roman | 1793089261133, née du relevé, intacte | `6eef55a8` publié | **résorbée** |
| XEWER, Leboncoin 3295236977 | 1792999747010, née du relevé, **VENDUE**, vente 315890 | `3b92d5ca` vendu (vente 290670) | **à signaler** : la même vente est comptée deux fois |
| Johan, Beebs 34209247 | 1792909660810, **créée par Johan** le 25/10, 4 dépôts | `a385636d` vendu le 21/10 | **à signaler** : sans doute la doudoune revendue après la vente Beebs |
| afeef3c7, Leboncoin 3265366309 | 1787440274987007 (fiche Vinted) | dépôt annulé | **à signaler** : rattachée par la personne le 18/09 (décision définitive) |

En comptant aussi les jobs de suivi : 5 paires de plus, toutes du 18 au 22/09 (2 rattachements par la personne chez
afeef3c7, 1 Leboncoin et 1 eBay chez 39bfa95a — l'eBay 377453677328 déjà réparé le 01/10 —, 2 Opla, plateforme quittée).
Aucune depuis, hors les 3 cas.

## 4. Preuve : essai à blanc sur la prod (`scripts/essais/20261027120000_essai.sql`, ROLLBACK) — 18/18

- Réparation : Nico → l'annonce rejoint 1793009407689006 et son dépôt `6eef55a8` ; 1793089261133 absorbée ; `dc8dca7a`
  clos ; le dépôt intact. XEWER, Johan : à signaler, rien écrit. Parc : 4 paires, 1 résorbée, 3 signalées.
- Les trois cas rejoués : « Importer » de Nico → fiche d'origine, aucune fiche neuve ; import moteur XEWER → fiche vendue
  et son dépôt, aucun job neuf ; photo de Johan vers l'autre fiche → refusée, l'annonce rejoint la fiche de son dépôt.
- Sans dépôt : fiche neuve comme avant ; dépôt annulé sur fiche en stock : job de suivi publié ; détachée par la
  personne : la règle s'abstient. Coût : 7,9 ms par annonce sur le plus gros compte (4 418 jobs).
- Aucun retrait, aucun dépôt, aucune vente écrite, aucun mail. Inverse essayé : corps rendus au md5 près.
