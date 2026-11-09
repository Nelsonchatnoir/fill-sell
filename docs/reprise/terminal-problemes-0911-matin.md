# Reprise — terminal « Problèmes », lot de Nico du 09/11 matin (4 points)

Suite de `docs/reprise/terminal-problemes-0911.md`. Heures de Paris. Lecture seule en prod (`db query --remote --read-only`)
sauf mention. Décision reçue en tête de lot : « avoir des créneaux » = module de republication ACTIF (validé tel que codé).

## Point 1 — xxewwer (Pro), « MediEvil Resurrection Platinum PSP » vendu sur Vinted sans retrait ailleurs

### Cause (prouvée en base)
- Vente 506586, `ventes_operations` « annonce:vinted:10722008876 », 09/11 00:47:41, job 6105a6e2 →
  `retraitsArmes 0, pendingRemoval 0` ; fiche 1789717142771002 (née du dressing Vinted le 18/09), quantité 1 → 0.
- Les deux autres annonces sont rattachées à la fiche par le **titre seul** :
  - eBay 377476217083 : dépôt synthétique dbbc5636, `rattachement auto / titre_exact` du 19/09 20:27, source releve ;
  - Leboncoin 3298682693 : dépôt de republication 28157afe (FillSell, 30/10 22:35) qui a **hérité** du rattachement
    `auto / titre_exact` du 19/09 de l'annonce d'origine 3264568992.
- `retrait_job_prouve` = faux pour les deux → aucun retrait d'office ; à la même seconde, le déclencheur de vente a
  posé **deux questions « Déjà vendu ? »** (`inventaire_doublons` copie_non_prouvee 3bc4484d Leboncoin, c3098554 eBay,
  statut proposee). Règles du 03/11 et du 05/11 (« vendu = retiré partout » : dépôt prouvé → retrait, sinon la question).
- Photos : les trois annonces portent la MÊME prise de vue (vérifié à l'œil, fiche / eBay / Leboncoin) — mais ce compte
  a répondu **« Non » 5 fois sur des photos identiques** (Wii Sports eBay+LBC, Red Dead LBC, coffre LBC, Spider-Man LBC
  — vérifié : même photo que la fiche vendue) : il vend plusieurs exemplaires photographiés une fois. Ses 21 réponses :
  16 « Oui », 5 « Non », en 0 à 8 h, en journée. Ici, question posée à 00:47 : elle attendait sa réponse.
- **Ce qui manquait (ROUGE)** : le mail de vente parti à 00:47:58 (`push_ventes` 9559, `mail_statut envoye`, pas
  d'appareil push) n'en disait RIEN — push-ventes passait `retraitsACliquer: 0` codé en dur. La question attendait dans
  « À régler » que la personne ouvre l'app ; l'article restait en vente sur eBay et Leboncoin.

### Classement
- Absence de retrait d'office : **fonctionnement normal** (lien par le titre, plusieurs exemplaires prouvés chez ce compte).
- Silence du mail de vente : **rouge confirmé** (la question existe, la personne n'en est pas avertie).

### Décision de Nico (09/11 matin) : **attendre la réponse de la personne** pour MediEvil (rien répondu à sa place).

### Correctif (la règle, tous les comptes)
- `push-ventes` (`annoncesEncoreEnLigne`) : le mail d'une vente (et de son groupe, et le récapitulatif d'une rafale) lit
  les questions « Déjà vendu ? » OUVERTES des fiches vendues de ce mail (lecture seule, bornée, une lecture ratée = le
  mail d'avant) et les passe au gabarit.
- `_shared/emails-fillsell.ts` (`texteDejaVendu`, `dejaVendu`, `URL_DEJA_VENDU`) : « Attention : 2 annonces de cet
  article sont encore en ligne (Leboncoin et eBay). FillSell ne sait pas si c'est le même exemplaire, alors il ne les
  retire pas sans toi. Réponds à « Déjà vendu ? » dans FillSell : « Oui » les retire tout de suite, pour ne pas vendre
  deux fois. » + bouton « Répondre à « Déjà vendu ? » » (`/app?ventes=deja-vendu`). Sans question ouverte : le mail
  d'avant, à l'octet (selftest contre 72d0135).
- App : `/app?ventes=deja-vendu` → onglet Stock → écran « Déjà vendu ? » ouvert une fois les questions lues
  (`src/utils/lienDejaVendu.js`, App.jsx, StockTab.jsx ; aucune lecture en base de plus).
- Selftest `selftest:deja-vendu-mail` (31/31). Simulation du mail MediEvil (non envoyé) rendue en local.
- Prod : push-ventes à déployer (version lue avant/après) ; app web au push, mobile à la prochaine OTA.

### Balayage de toutes les ventes depuis le 18/09 (fiches vendues pièce unique, annonce vivante ailleurs vue ≤ 3 j avant la vente ou après)
Requête : fiches `vendu` non fusionnées, une vente de quantité 1, aucune annonce en quantité ; annonces relevées vivantes
d'une autre plateforme (hors Opla, hors Leboncoin sous transaction) et dépôts FillSell vus en ligne. 67 lignes brutes,
dont faux positifs écartés à la main (annonce vendue elle-même, dépôt Beebs jamais sorti de l'examen avec son retrait en
attente, retrait déjà fait). Reste :
- **Question « Déjà vendu ? » ouverte, annonce vue en ligne après la vente** (circuit : la réponse de la personne ; le mail
  le dira désormais pour les ventes à venir) :
  - xxewwer — MediEvil (Vinted, 09/11 00:47) : eBay 377476217083 (vue 08/11 21:30), Leboncoin 3298682693 (vue 08/11 14:59).
  - nicolas.menar — Doudou Simba (Vinted, 23/10) : Beebs 33906212 (vue 05/11 22:02), question 5005bc61 ; Doudou Mickey
    (Vinted, 25/10 19:28) : Leboncoin 3275108417 (vue 08/11 21:10, question 1ac4f80b), Beebs 34035659 (vue 06/11 23:04,
    question 0bb9ad34). Ouvertes depuis 2 semaines.
  - josephinecerni — Vanity Agnès B (10/10) : Leboncoin 3280338353 (vue 09/11 07:45), question d15f54f9.
  - boncoin59300 — Bburago Ferrari 430 (eBay, 08/11 18:58) : Beebs 32778995 et 33108552 (vues 07/11), questions 2e91e0e4,
    eebd9a44 (ses Vinted et Leboncoin ont leur retrait en file).
  - labouquinerie85 — « The artist » Leboncoin 3273117939 (vue pour la dernière fois le 07/10), « Voyage à l'intérieur »
    Leboncoin 3263338050 (dernière vue 28/10) : questions ouvertes, annonces plus relevées depuis.
- **Annonces rattachées APRÈS la vente** (règle du 03/11 : un rattachement ne retire jamais ; « Vendu, encore en ligne »
  attend la personne dans À régler ; décision de Nico du 05/11 : rien d'office) : 44310spgl (blouse, Beebs 34274006),
  beautyandthedress ×3 (Leboncoin), benjamin.ployer ×7 (Leboncoin, rattachées le 04/11 pour des ventes du 14 au 27/10),
  jeanluclassarat916 ×2, manon.simon14, mataich67 ×2, sos.cuisine.valenciennes.
- **Rattachées AVANT la vente par photo (prouvées), vente d'un chemin d'avant le 05/11, jamais retirées** :
  - boncoin59300 — Doudoune Zara (rattachée le 24/10, vendue le 30/10) : Beebs 33034796 (vue 07/11) — « Plus tard »
    au rapport du 05/11 (décision de Nico).
  - **nicolas.svobodny (Nico)** — Short de bain Quiksilver (rattaché le 26/10 11:13, vente 309266 du 26/10 21:10,
    1 €, « Vinted » sans code, sans `ventes_operations`) : Leboncoin 3294658005 (vue 09/11 07:40) et Beebs 34229358
    (vue 09/11 05:56). À Nico de dire si la vente est réelle (1 €).
- **« Non » de la personne** : xxewwer ×5 (autres exemplaires) — rien.
- Aucun dépôt FillSell prouvé en ligne après une vente sans retrait ni question (les 3 candidats étaient des faux positifs).

## Point 2 — jessica.alhiane (Premium), Leboncoin : « vente détectée jamais enregistrée »

### Faits (base)
- Fiches 1794077239905 (« ⚡️ Câble USB-C … (Unité ou Lot) », Leboncoin 3178619102) et 1794077239778 (« Boîte en métal
  vintage », 3234168813) : **importées par le relevé** le 07/11 à 19:47 (`origine releve_leboncoin`, tâches d'import
  d47ea135 / 048091f2 publiées à l'heure de création) — compte créé le 07/11 à 17:51. Pas publiées par FillSell.
- Leurs ventes datent de **juillet** : 20/07 08:40 (commande 349375855) et 17/07 06:25 (commande 348857560), entrées dans
  l'historique comme ventes anciennes (ventes 491407, 491408, source releve) le 07/11. Le relevé du 09/11 01:58 lit les deux
  annonces `en_ligne`, `statut_brut active`, transaction `sold` : le badge « Article vendu » d'une vente d'AVANT le suivi
  (`leboncoin_vendu_avant_suivi`). « Unité ou Lot » : l'annonce vend plusieurs unités.
- 12 republications (6 lots, 08/11 17:06 → 09/11 01:47) closes « Republication annulée : ton annonce Leboncoin est vendue
  (la page affiche « Article vendu ») » : l'EXTENSION relit la page avant tout retrait (`republish_etat_reel.state` sold)
  → échec → `pas-de-rouge` A4 « annonce_vendue ». Rien retiré.
- Parc, 14 jours : 21 annulations « vendue » à la republication, 2 comptes (Jess 2 fiches, jeanluclassarat916 4 fiches),
  **toutes sur un badge d'avant le suivi** ; aucune vente réelle lue à la republication.

### Classement
- « La vente a eu lieu pendant le suivi » : **non** (ventes de juillet, déjà dans l'historique). Pas de vente à enregistrer.
- **Rouge confirmé** : la règle de Nico (08/11, migration 20261108142000 ; 09/11, 20261109010000 : badge d'avant le suivi
  = jamais une vente, la republication part) ne couvrait que le verdict du serveur, pas la relecture de la page par
  l'extension → refus à tort et message faux (« ton annonce est vendue »).

### Correctif (tous les comptes)
- `_shared/badge-vendu-avant-suivi.js` : la règle (miroir de la CTE `avant_suivi` de `republication_annonce_partie`).
- get-pending-jobs : une republication Leboncoin servie, pas encore retirée, dont l'annonce porte le badge d'avant le suivi
  part marquée (`platform_fields.badge_vendu_avant_suivi`, RPC `leboncoin_vendu_avant_suivi`, 10 par passage, rien écrit).
- Extension **0.6.184** : sur une tâche marquée, « sold » lu sur la page = annonce en ligne → la republication continue ;
  à l'étape du retrait, « sold » ne prouve JAMAIS un retrait pour elle (seule une page morte) — sinon on redéposerait à
  côté de l'annonce encore en ligne.
- pas-de-rouge A4 : une extension plus ancienne arrêtée sur le badge marqué → « Republication pas encore partie : … vente
  d'avant ton arrivée sur FillSell — ce n'est pas une vente … Rien n'a été retiré » (motif `badge_vendu_avant_suivi`).
- Demande de Nico (vente lue PENDANT le suivi à la republication) : la republication se clôt comme avant ET update-job-status
  pose sur l'annonce publiée du même numéro le signal de la veille (`sale_signal` sold, compare-and-set) → circuit des
  ventes détectées tout de suite (Ventes à confirmer, mail, retraits ailleurs à l'enregistrement, republication refusée par
  la base). Le déclencheur `cross_post_jobs_lbc_vendu_avant_suivi` écarte toujours un badge d'avant le suivi.
- Selftest `selftest:badge-vendu-avant-suivi-republication` (32/32).
- Ce qui reste : déployer get-pending-jobs + update-job-status ; Nico téléverse la 0.6.184 ; Jess (et jeanluclassarat916)
  relancent leurs republications depuis l'app une fois l'extension à jour (rien relancé à leur place).

## Point 3 — contact.grizstyle (Pro), eBay : 2 publications arrêtées sur NOTRE correspondance de rayons

### Faits (base, voie API, 09/11 00:30, needs_user « relancer »)
- 8a589633 « Lit bébé Sauthon … » (Très bon état) : rayon 93391 « Bébé, puériculture › Lits, équipements d'intérieur ›
  Lits, matelas, berceaux » ; eBay n'y accepte que « Neuf » (`etats_ebay` lus) ; la reprise automatique avec la
  proposition d'eBay retombe sur 93391 → « Change l'icône ou le genre de l'article ».
- 1a983338 « Lot femme M/L T40 – Last Queen + Neo Noir » (Neuf avec étiquette) : rayon de l'app 63861 « Robes » refusé
  par la vérification (Lens : « lot de deux vêtements »), aucune des 9 suggestions d'eBay retenue (toutes un type) →
  « Aucune catégorie eBay sûre … Change l'icône ou le genre ».
- eBay France (arbre relevé `src/utils/arbres/ebayFeuilles.js`) n'a pas de rayon « lots » pour les vêtements ; il a
  « Tenues, ensembles » (Femme 260011, Fille 156801, Garçon 156790, Bébé 260024 ; rien pour Homme). Le parent du lit a
  une feuille « Autres » (58761).
- La règle du 09/11 « qui peut lever le refus » (`_shared/ebay-refus-compte.js`) ne voit que les réponses d'eBay : ces
  deux arrêts tombaient AVANT tout appel à eBay (source « relancer » posée par défaut par le déclencheur).
- Parc : 3 publications eBay arrêtées sur un rayon ou un état (ces 2, + nicolas.menar « Catégorie eBay à confirmer »,
  choix de la personne, non touché).

### Classement : **rouge confirmé** (trou de NOTRE correspondance renvoyé au client).

### Correctif (tous les comptes) — `_shared/ebay-rayon-a-notre-charge.js`, ebay-api-worker
- État réel : quand le rayon refuse l'état, un rayon voisin de la même branche qui l'accepte (« Autres » du parent, puis
  au-dessus, jamais une autre racine), vérifié chez eBay (conditions), AVANT la reprise avec la proposition d'eBay ; rien
  ne l'accepte → la publication se clôt (cancelled) avec la règle d'eBay dite vraie, rien à faire.
- Lot de vêtements sans rayon sûr → « Tenues, ensembles » du genre (jamais le choix de la personne, jamais Homme).
- Trou restant (aucun rayon sûr) → `needs_user_source = ebay_rayon_a_notre_charge` : « En pause — FillSell s'en occupe »
  (etat-job, fileDesJobs FR/EN, FileDesJobs, cause-blocage NOUS/categorie, copie de l'extension régénérée).
- Rejeu : `rayonsANotreChargeRejouer` (à chaque passage, 20 au plus, compare-and-set) rejoue une fois par version des
  règles les publications arrêtées sur un rayon ou un état, SANS `ebayCategorieAttente` (sinon la relance prendrait
  « Manteaux, vestes et gilets » à l'aveugle) — les 2 de grizstyle repartent seules au déploiement.
- Selftest `selftest:ebay-rayon-a-notre-charge` (42/42) ; selftests eBay existants verts.
- Ce qui reste : déployer ebay-api-worker ; vérifier au premier passage le rayon retenu pour le lit (58761 si eBay y
  accepte l'occasion, sinon clos « eBay n'accepte que du neuf ») et pour le lot (260011).

## Point 4 — josephinecerni : option B (créneaux du lot manuel) vérifiée

### Les deux tâches parties après le déploiement (get-pending-jobs v354 déployée à **06:29:12**, lue dans `functions list`)
- 1c72f570 (Leboncoin, lot 77b7bf38) : `journal_etapes` — prise à l'étape du retrait (« captured » → processing) à
  06:24:30, annonce retirée à 06:24:48 (`deleted_at`) : AVANT le déploiement. Servie après, à l'étape « deleted » (06:31:51)
  → redéposée 06:32:42.
- 094216d4 (Beebs, même lot) : prise à l'étape du retrait à **06:27:01** (avant le déploiement, par la version d'avant),
  relecture « Mes annonces » 06:29:36, retrait prouvé 06:30:23 dans ce même passage ; servie après, à l'étape « deleted »
  (06:34:09) → redéposée 06:35:11.
- Classement : **fonctionnement normal** pour les deux — une annonce déjà retirée est menée au bout (exemption « étape
  deleted » de la règle, voulue : jamais une annonce laissée hors ligne jusqu'au créneau). Le rapport de 06:3x n'en citait
  qu'une parce que la seconde a été redéposée à 06:35, après sa rédaction.

### Le lot à 10:00
- 07:48 : lot 77b7bf38 retenu — en attente Vinted 217, Leboncoin 225, Beebs 205 ; publiées depuis 06:29 : les 2 ci-dessus.
- Attendu à 10:00 (créneau 10:00–22:00, modules actifs) : service au rythme du manuel par plateforme (2 min, pause 2 h toutes
  les 50 par plateforme, quotas), l'automatique en pause tant que le lot est en file. À constater après 10:00 (lecture) :
  `select platform, count(*) filter (where published_at >= '2026-11-09 10:00+01'), max(published_at) from cross_post_jobs
  where bulk_batch_id = '77b7bf38-a031-4264-9918-8ed13cad9ac0' group by 1;`

## Suite, commit, déploiements
- Suite complète (première tentative en arrière-plan arrêtée par Claude Code, mémoire du poste saturée ; relancée au premier
  plan sur décision de Nico) : 652 selftests, 08:31 → 08:55, 1 rouge `titre-symboles-vinted` (garde de la lecture du job
  dans update-job-status, que j'avais élargie) → lecture rendue intacte, numéro lu à part ; avant cela, 2 gardes de
  structure rouges corrigées (`caracteres-invisibles` : le marquage du badge passe AVANT le nettoyage des invisibles ;
  `beebs-retrait-preuve` : compte aussi la forme `etatProuveAbsence(...) && job.platform !== "beebs"`).
  `cloud-orchestrateur` : vert seul (simulation 23/23 en 303 s — il dépassait seulement une borne de 300 s). Après la
  retouche : les 162 selftests qui lisent update-job-status ou get-pending-jobs rejoués, verts.
