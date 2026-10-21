# Urgences du 20/10 soir — trois correctifs (Sébastien, sécurité, Louis)

Heures de Paris. Essais en base : `scripts/essais/20261020200000_essai.sql` (18/18), `20261020220000_essai.sql`
(27/27, rejeu symétrique), `20261020_reparations_essai.sql` (6/6, inverses compris) — tous en ROLLBACK.
Selftest : `npm run selftest:urgences-2010` (46 contrôles).

## 1. Fausses « Annonces plus en ligne — Vendue ? » (Sébastien, Pro)

**Cause.** Les 13 dépôts Beebs du 20/10 (09:10 → 11:13) ont bien été CRÉÉS : la preuve du dépôt de l'extension
(`preuve_identifiant_beebs`, méthode « avant/après ») a vu chaque numéro apparaître dans « En cours de vérification »
juste après le clic (ex. 34201113 à 09:10:09). Depuis, aucun relevé Beebs ne les a vus — ni « en ligne », ni « en
vérification » (les relevés lisent 35 à 37 annonces, toutes en ligne) — et leur page publique répond 404 (lue le 20/10
≈ 22:20 ; leurs voisines en ligne répondent 200). Les 37 autres du même lot sont en ligne. Conclusion : retirées ou
refusées par Beebs à sa vérification, jamais vendues ; le motif exact n'est lisible que dans la session Beebs de
Sébastien (pas lue : compte client).
La veille de l'extension lit le LIEN de chaque dépôt publié — le lien Beebs est posé dès le numéro (déclencheur
`cross_post_jobs_lien_numero_beebs`, 30/09). 404 deux fois à 2 h d'écart → `unavailable_since` + `sale_signal
'unavailable'` → la question. Rien ne demandait si l'annonce avait déjà été vue en ligne. La règle du 09/10 (« un dépôt
jamais vu en ligne est un échec de publication, jamais une vente ») ne couvrait que les dépôts SANS lien, et Beebs
n'était jamais jugé (27/09).

**Correctif (règle, tout le parc)** — migration `20261020220000_jamais_vue_en_ligne_jamais_vendue` :
- `job_jamais_vu_en_ligne()` : ni la veille (`vu_en_ligne_le`), ni un relevé du compte (`en_ligne` / `vendue`, sous un
  identifiant du dépôt ou rattaché à lui) ne l'a vu ;
- déclencheur `cross_post_jobs_vue_ou_pas_encore_visible` : un drapeau « plus en ligne » NEUF (jamais une preuve
  « sold ») sur un dépôt jamais vu en ligne est remplacé par `platform_fields.pas_encore_visible` — quel que soit
  l'écrivain (extension, fonctions edge). Le marqueur s'efface quand la veille ou un relevé voit l'annonce. Vinted hors
  règle (sa preuve est le dressing) ;
- `trancher_publications_sans_lien` : nouvelle boucle des dépôts AVEC lien jamais vus (14 derniers jours, 25 par
  relevé) — toujours invisible après la grâce (**72 h Beebs**, 4 h ailleurs) et absent de deux relevés complets →
  échec de publication (motif, publication rendue), ou clos sans rouge si l'article est en ligne ailleurs ;
- app : « Beebs vérifie ton annonce avant de la mettre en ligne » (message existant) pour un dépôt qui porte le marqueur.

Inchangé : une annonce vue en ligne puis disparue (question d'avant — 6 alertes eBay de Sébastien vues le 19/10 17:20,
disparues 22:51, restent), une preuve « sold », Vinted.

**Réparation** `scripts/reparations/20261020_sebastien_beebs_pas_encore_visibles.sql` (sauvegarde
`_backup_2010_sebastien_beebs_jobs`, inverse) : les 13 (9 questions posées, 4 en attente de la 2e lecture) reçoivent
l'état de la règle ; aucune vente, aucun retrait, aucun push.

## 2. Sécurité : trois fonctions SECURITY DEFINER sans contrôle d'identité

**Cause.** `spend_coins_for_generate(uuid, bigint)`, `spend_coins_for_lens(uuid, boolean)` et
`fiche_completer_photos_capture(bigint, text, jsonb)` faisaient confiance à leurs arguments ; l'accès anon a été retiré
le 20/10 à 20:31 (`20261020183150`), authenticated restait libre d'agir pour un autre compte ou sur la fiche d'un autre.

**Appelants (tous retrouvés).** App et extension : aucun appel direct. `generate-listing` et `lens-analysis` appellent
les deux `spend_coins_*` par leur client service_role, avec l'utilisateur du jeton. `fiche_completer_photos_capture` :
le déclencheur `annonce_capture_complete_fiche` (écritures de l'extension sous la session du propriétaire, ou
service_role), le cron `rattrapage_photos_ebay_tick` (désarmé, sans jeton) et deux scripts de réparation (sans jeton).
Aujourd'hui, 0 annonce rattachée à la fiche d'un autre compte.

**Correctif** — migration `20261020200000_securite_2010_controle_identite` : sous un jeton autre que service_role,
l'utilisateur (et la fiche) doivent être ceux de `auth.uid()`, sinon erreur 42501. service_role et sans jeton :
inchangés. Corps réécrits depuis la prod, droits inchangés. Essai 18/18 (refus, soi-même, service_role, sans jeton,
écriture d'annonce par le déclencheur, droits).

**Reste.** `generate-listing` lit la fiche `inventaire_id` du corps de la requête par service_role SANS filtre
`user_id` (titre et description d'une fiche d'un autre compte lisibles par un compte connecté) : hors de ce lot, à
décider.

## 3. Louis : Leboncoin « pas en vente » sur le 2e compte, dépôts en doublon

**Cause (vérifiée).** louis-seller et louis@ (comptes reliés du 18/10) publient sur le MÊME compte Leboncoin : leurs
relevés lisent la même boutique (376 / 381 à 461 annonces). Règle du 18/10 (option B) : chaque compte ne suit que ce
qu'il a publié ; le relevé de louis-seller écarte les annonces publiées par louis@ (2 566 lignes `compte_relie:leboncoin`)
— d'où 137 annonces Leboncoin chez lui. « Rattachement par identifiant 0 » n'est pas une panne : ce compteur vaut 0 en
dur depuis le 07/10 (le rattachement se fait dans la fonction `rapprochement`).
La panne : les 195 fiches coupées en deux le 18/10 portent leur copie Leboncoin chez louis@ (fiche jumelle) ; chez
louis-seller, la fiche disait « pas publiée » sur Leboncoin, et la garde « une fiche, une annonce par plateforme » ne
voyait pas la jumelle. Louis a publié en lot (19/10 12:58 → 20/10 15:41) : **223 dépôts Leboncoin, dont 170 sur une fiche
jumelle déjà en ligne** — 55 jugés « refusés par la modération » le 20/10 (06:14, 15:11, 16:37 ; motif faux pour 54 :
Leboncoin a refusé le doublon), 75 jamais apparus (en attente du jugement), **40 EN LIGNE en double**. Les 53 autres
(fiches sans jumelle) sont de vraies nouvelles annonces : 50 en ligne, aucune ne ressemble à une annonce de louis@
(titre, photo). Beebs, Depop, eBay : comptes distincts (aucune annonce commune).

**Correctif (règle)** — migration `20261020210000_comptes_relies_boutique_partagee` :
- `boutique_partagee_compte_relie()` : une boutique est PARTAGÉE quand un relevé a déjà écarté une annonce du compte
  relié sur cette plateforme (`compte_relie:<pf>`) ; jamais Vinted ;
- `jumelle_occupe_plateformes()` : la fiche jumelle y est en ligne (relevé du compte relié) ou en file / publiée ;
- `spend_coins_and_publish` : refus `already_published` + `compte_relie` AVANT tout débit ; déclencheur
  `cross_post_jobs_refus_relance_jumelle_en_ligne` : aucune relance d'un dépôt terminé ;
- `trancher_publications_sans_lien` (migration du point 1) : un dépôt refusé parce que la jumelle est en ligne est clos
  sans rouge (« déjà en ligne sous l'annonce X de ton compte relié, rien à refaire ») — les 75 en attente le seront ;
- app : `copies_fiches_jumelles()` → plateforme occupée (lot, stepper, filtre « Pas encore »), logo atténué et
  « En ligne sur Leboncoin via ton compte FillSell relié » sur la carte. Vide pour tout autre compte.

**Réparation** `scripts/reparations/20261020_louis_seller_lbc_doublons_relie.sql` (sauvegarde
`_backup_2010_louis_seller_lbc_echecs`, inverse) : les 54 échecs à jumelle en ligne → clos avec le vrai motif ; aucune
unité, aucun job, rien republié. Le 55e (jumelle pas en ligne) reste en échec.

**Doublons en ligne (rien supprimé)** : `doublons-leboncoin-louis-2010.csv` — 40 lignes : annonce de louis-seller,
annonce de louis@, même article (fiches jumelles), toutes deux vues en ligne par les relevés du 20/10 22:19 et 22:41.
