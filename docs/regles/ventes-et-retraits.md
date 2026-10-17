# Ventes, signaux de vente, mails et notifications de vente, retraits

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 11/10 — une annonce vendue ne se signale qu'une fois (ex-L123-137)
- 08/10 — ventes prouvées automatiques (ex-L185-201)
- 08/10 — Vinted : la fiche et le signal suivent l'annonce en ligne (ex-L271-276)
- 06/10 — notifications push à chaque vente (ex-L296-303)
- 06/10 soir — un mail à chaque vente, jamais plafonné (ex-L304-316)
- 04/10 — retraits (ex-L359-363)
- 02/10 soir — ventes : annonce_id = la preuve (ex-L444-446)
- 16/10 — lire une vente : plateforme normalisée, marge % au prix > 0, « Sans plateforme », tri par date
- 16/10 soir — le prix d'une vente née d'un job ; jamais « vendu 0 € » (C1)

<!-- ex-CLAUDE.md L123-137 : 11/10 — une annonce vendue ne se signale qu'une fois -->
- **⛔ UNE ANNONCE VENDUE NE SE SIGNALE QU'UNE FOIS (11/10, Louis)** : le « doublon »
  de `push_ventes_a_envoyer` ne regardait que 3 jours et jamais le reçu → ventes traitées
  remailées 3 à 5 jours plus tard (fiche à quantité pointée sur une ANCIENNE annonce que le
  dressing revoit « sold »). Mig **20261011100000 APPLIQUÉE** (feu vert nommé) :
  `push_vente_deja_signalee` (reçu `ventes_operations` AVANT le signal, même commande ou
  même annonce déjà annoncée/déclarée, SANS fenêtre ; ⛔ eBay = la commande, jamais l'annonce ;
  Leboncoin : deux commandes = deux ventes) à la naissance de la note ET avant tout envoi.
  **Ventes à confirmer** (`ventes_a_decider`, `src/components/VentesADecider.jsx`, tête des
  bandeaux) : vente détectée et annoncée, non enregistrée, AVEC OU SANS téléphone ; « Remettre en
  vente » / « Ne pas remettre » = MÊME déclaration (check-listing-status → enregistrer_vente_declaree
  `p_remettre_en_vente` → remise `abandonnee`/`choix_personne`). Mail « Vendu » →
  `/app?ventes=a-decider`. ⛔ 0 appareil push dans le parc : binaire 2.9.62 jamais fabriqué.
  Rattrapage : 10 notes de Louis classées doublon (`_backup_1110_push_ventes_doublon`).
  Rapport `docs/enquetes/louis-ventes-remailees-1110/RAPPORT.md` ; selftest
  `selftest:vente-signalee-une-fois`, preuve `scripts/preuves/preuve-vente-signalee-une-fois.mjs`.

<!-- ex-CLAUDE.md L185-201 : 08/10 — ventes prouvées automatiques -->
- **⛔ VENTES PROUVÉES : AUTOMATIQUES DEPUIS LE 08/10 23:40 (GO de Nico)** : la
  vente sur preuve « sold » (GO du 28/09) n'avait tourné que de 16:42 à 16:46 le
  28/09 (appel retiré de get-pending-jobs par précaution ; cause mesurée de la
  latence = cron 17) ; du 28/09 au 08/10, une vente Vinted prouvée attendait le
  clic. Rétablie : cron SQL `ventes-prouvees-2min` (job 52, minutes impaires,
  `ventes_prouvees_tick` : index partiel, verrou, 25 / 4 s par passage, preuves
  postérieures à l'armement `ventes_prouvees_auto_depuis` = 08/10 23:40:01,
  vente par `enregistrer_vente_atomique` inchangée) — migrations
  **20261008233000** + **20261008233100 APPLIQUÉES** ; veille-cpu **v2** (alerte)
  et ops-digest **v35** lisent `ventes_prouvees_veille()`. Arriéré RATTRAPÉ le
  08/10 23:41-23:46 : 90 ventes, 24 comptes, 27 retraits armés, 5 questions
  Opla, **0 mail, 0 notification** (notes classées dans la transaction ;
  journal `_rattrapage_0810_ventes_prouvees`, inverse prêt). Restent : 5 « à
  vérifier » (rapport à blanc § 4) et les signaux « sold » sans preuve (jamais
  une vente). Vérifier : `select public.ventes_prouvees_veille();`,
  `ventes_prouvees_passages`. Rapport `docs/enquetes/ventes-prouvees-0810/RAPPORT.md`
  (§ 8) ; banc `npm run banc:ventes-prouvees`, selftest `selftest:ventes-prouvees`.

<!-- ex-CLAUDE.md L271-276 : 08/10 — Vinted : la fiche et le signal suivent l'annonce en ligne -->
- **⛔ VINTED : LA FICHE ET LE SIGNAL SUIVENT L'ANNONCE EN LIGNE (08/10, Louis)** :
  la synchro du dressing de l'extension collait la vente d'une ancienne annonce
  au job de la neuve et faisait reculer la fiche → « 🎉 Vendue » sur une annonce
  en ligne, vente et remise en double. Migrations 20261008110000 / 111000 /
  112000 : démenti par le dressing, recul seulement sur preuve, vente refusée sur
  une annonce en ligne ou remplacée, remise retenue, note de vente ignorée.

<!-- ex-CLAUDE.md L296-303 : 06/10 — notifications push à chaque vente -->
- **Notifications push à chaque vente (06/10, binaire 2.9.62 / vc33)** : base
  appliquée (mig 20261006140000 + 150000, cron 34 `push-ventes-1min`),
  `push-ventes` v10 et `check-listing-status` v37 (`false`) ; le push reste
  inerte sans téléphone (la note, elle, porte aussi le MAIL de vente). Clés et binaires : `npm run
  binaires:2.9.62` (fichiers dans Téléchargements, `docs/push/CLES-NICO.md`) ;
  ⛔ jamais d'AAB sans `google-services.json`. Tout appel natif passe par
  `pushDisponible()` (binaires < 2.9.62 : rien). État : fin de
  `etat-2026-10-01.md` (« 06/10 après-midi »).

<!-- ex-CLAUDE.md L304-316 : 06/10 soir — un mail à chaque vente, jamais plafonné -->
- **⛔ UN MAIL À CHAQUE VENTE, JAMAIS PLAFONNÉ (06/10 soir, Nico)** : mig
  20261006180000 ; même note et même décision que le push (doublon, rattrapage
  de masse, vente déclarée, vente ancienne = rien ; job : vente récente < 24 h ;
  plateforme suivie = relevé < 24 h) ; `push-ventes` envoie le mail (type
  `vente:<note>`, support, réservation, index `email_logs_vente_unique`) ;
  garde v6 « vente RÉCENTE prouvée » avant tout envoi (Vinted : annonce vue en
  ligne hier ou aujourd'hui, ou publiée < 48 h ; jamais déjà vue vendue un jour
  précédent — 6 mails partis à tort entre 16:58 et 17:03 le 06/10 ; v7 : une
  note qui porte sa date de vente < 48 h — commande lue — est sa propre preuve). Le
  récap « ventes du jour » est SUPPRIMÉ ; AUCUN mail automatique n'est retenu
  par un plafond (lien de l'extension : double appui < 60 s seulement).
  Preuves : `scripts/push/preuve-mails-ventes.mjs` (transaction annulée),
  `scripts/push/essai-mail-vente.mjs` (boîte hoosslocal seulement).

<!-- ex-CLAUDE.md L359-363 : 04/10 — retraits -->
- **Retraits (04/10)** : jamais arrêtés sur un raté technique ni sur
  `/main/banned` (reprise 1 h, 3 h, 6 h jusqu'à la preuve) ; un retrait Vinted
  dont le numéro manque aux deux derniers relevés complets de sa boutique est
  clos « déjà retirée » (gpj) ; ⛔ une annonce Vinted « en vérification » PEUT
  être achetée (buste de Nico, 04/10) : essai toutes les 20 min, le texte le dit.

<!-- ex-CLAUDE.md L444-446 : 02/10 soir — ventes : annonce_id = la preuve -->
- **Ventes (02/10 soir)** : `ventes.annonce_id` = la preuve (numéro d'annonce) ;
  la même cession se FUSIONNE dans la vente saisie (la saisie prime), jamais
  deux ventes, jamais sur le titre (migration 20261002210000).

## 15/10 soir (3) — retrait eBay par la voie qui marche
- Un retrait eBay d'un compte RELIÉ (jeton non révoqué) arrêté faute de session eBay dans Chrome passe en voie API
  (ebay-api-worker v86, `_shared/ebay-retrait-trading.js`) : GetItem avant (même numéro, vendeur = compte relié,
  active ; déjà vendue → on le dit ; terminée → rien à faire ; autre compte → question), EndFixedPriceItem / EndItem,
  GetItem après = preuve. Compte NON relié : aucune voie serveur, le mur dit aussi « relie ton compte eBay ».
- Retrait Beebs sans numéro : une annonce « non reliée » numérotée avant le dépôt ne le bloque plus (voir
  rapprochement-et-releves.md) ; deux relevés complets concluent comme avant.

## 16/10 — lire une vente : plateforme, marge %, « Sans plateforme », tri
Une seule source, `src/utils/ventesStats.js` (selftest `selftest:ventes-stats`) ; les écrans n'agrègent rien
eux-mêmes. Rapport : `docs/enquetes/refonte-ecrans-1610/RAPPORT.md`.
- **Plateforme** = libellé normalisé (`plateformeVente`, miroir de `plateforme_normalisee`) : « Vinted »,
  « vinted », « Vinted␣ » sont UNE plateforme ; le libellé corrigé par la personne prime sur `plateforme_code`
  (aucun déclencheur ne le recalcule) ; un texte libre inconnu garde sa ligne à lui.
- **Marge en %** : seulement si le prix d'achat est > 0 (`margePctVente`, `margeMoyenne`) — à 0 €, « prix d'achat
  à 0 € » sans %, hors moyenne, IA comprise ; le bénéfice en euros reste compté. NULL ≠ 0 tient toujours.
- **Ventes par plateforme** : ligne « Sans plateforme » toujours présente ; Σ lignes = revenu de la période.
- **Ordre** : date de vente décroissante, puis enregistrement, puis id ; sans date en dernier (`trierVentes`,
  appliqué dans `App.jsx` à ce qui descend vers l'onglet Ventes).


## 16/10 soir — le prix d'une vente née d'un job ; jamais « vendu 0 € » (C1)
Cas : 128 notes de vente sans prix depuis le 06/10 (republications Vinted : `price` NULL), 45 mails « vendu 0 € »
(17 comptes ; 26 mails à 14 comptes sur 7 jours), dont 9 avec un bénéfice négatif. Les lignes `ventes` avaient leur prix.
- **Une règle, une fonction** : `prix_vente_du_job` (migration 20261016221000) — vente ENREGISTRÉE (son reçu
  `ventes_operations` : la transaction relevée ou le prix confirmé par la personne ; ⛔ jamais pour eBay, une annonce en
  quantité se vend plusieurs fois) > prix lu à la vente (`detected_price`) > prix du job > dernier prix publié
  (`prix_recreation`, puis `republish_snapshot.prix`) > prix de la fiche du MÊME compte ; chaque source > 0, sinon la
  suivante ; aucune → NULL (inconnu). Un 0 n'est jamais un prix de vente annoncé (`_prix_ou_null`, miroir de
  `prixLisible`). Même ordre que le bandeau (`prixParDefautDuBandeau`).
- **La note naît avec ce prix** (`push_trg_job`) ; **une note de job décidée annonce la vente enregistrée**
  (`push_ventes_a_envoyer`). Une panne du calcul garde le prix d'avant : la note n'est jamais perdue.
- **Le mail n'écrit un montant que s'il est > 0** (`prixVenteConnu`, `_shared/push-envoi.ts`, même règle que la
  notification) : prix inconnu → « vendu » sans montant, sans bénéfice ; jamais « 0 € » (sous 0,50 € : centimes).
  Un prix de vente connu donne un mail identique à l'octet à celui d'avant.
- **Réparer une note née sans prix** : `scripts/reparations/20261016_ventes_prix_zero.sql` (après la migration) — colonne
  `prix` seule, sauvegarde `_backup_1610_ventes_prix_zero`, aucun mail ni push renvoyé (push_ventes n'a aucun
  déclencheur ; statut / mail_statut intacts). Preuves : `npm run selftest:ventes-prix-inconnu [-- --prod]`,
  `scripts/preuves/preuve-ventes-prix-inconnu.mjs`.
- **Appliquées le 17/10** (feu vert nommé) : migration vers 09:04 (42/42 rejouées sur la prod), réparation à 09:05 —
  127 notes, 0 mail (`email_logs` 287 → 287). ⛔ La note 2348 est EXCLUE du script (consigne de Nico : 14 € en base,
  12 € selon le vendeur) : elle reste sans prix tant que Nico n'a pas tranché ; ne pas la « réparer » d'office.

## 17/10 — une commande Vinted annulée : ce que la base doit dire (point 12 ; rapport `docs/enquetes/dix-points-1710/RAPPORT.md` § 12)
- Vinted dit `failed` pour une commande annulée (4 cas sur 4) et garde l'annonce d'origine « sold » des jours après :
  ce « sold » n'est plus une vente. `vente_commande_annulee_vinted` (mig **20261017140000, appliquée le 17/10 à 14:41**)
  rend la fiche au stock ET pose l'état d'annonce du relevé (`closed`, ou `active` si revue en ligne après la vente),
  tracé dans `inventaire_journal` ; le reçu effacé reste dans la trace `vente_retiree` (`recus`).
- Le relevé du dressing ne repasse plus « vendu » une fiche dont la vente de CETTE annonce a été retirée pour commande
  annulée, tant que l'annonce n'a pas été revue en ligne et qu'aucune vente n'est écrite (garde de
  `inventaire_vendu_vinted_par_la_vente`, mig **20261017141000, appliquée le 17/10 à 14:42**) ; job vivant, import pur,
  écriture serveur : inchangés.
- ⛔ Jamais une annulation tenue pour vraie sans le statut Vinted de SA commande (relevé `failed` ou vérification sur le
  compte) : le 17/10, une vraie vente (144011-144014, Louis) a été retirée sur la foi d'un mail attribué sans numéro de
  commande, puis remise à l'identique (`scripts/reparations/20261017_louis_lot_b_remise_ventes.sql`, 0 mail).
- Le relevé des ventes laisse sa trace : une ligne `usage_logs` `releve_ventes` par passage (lues, bilan, statuts inconnus,
  détails ratés) et l'onglet « Annulées » de Vinted lu en observation (extension 0.6.123). Selftests
  `vente-vinted-annulee-statut`, `dressing-garde-commande-annulee`, `vente-vinted-annulee`.

## 17/10 — une vente Vinted en lot = une vente par article (point 11, Louis ; rapport `docs/enquetes/dix-points-1710/RAPPORT.md` § 11)
- La COMMANDE Vinted est l'unité de vente ; sa composition = les numéros EXACTS de `transaction.order.item_ids` (ou
  `item_id`), lus par la session du vendeur (`vinted_commandes_articles`) ; le titre « Lot N articles » ne choisit que
  quoi relire, jamais une identité.
- Une vente PAR ARTICLE (`commande_ref` '<ref>:<article>', comme eBay). Chaque article qui a une fiche passe vendu par le
  circuit normal (`enregistrer_vente_atomique`, ou fiche vendue → `inventaire_vendu_retire_ses_copies`) et ses copies
  PROUVÉES partent. Un article inconnu de FillSell = vente sans fiche + question (`usage_logs`
  `vente_vinted_article_inconnu`), jamais un retrait. Tout ou rien par commande (doute = rien, décision `en_doute`). Une
  vente déjà enregistrée pour un article (preuve de sa page) est ADOPTÉE, jamais doublée.
- Une commande PAYÉE (ni failed ni cancelled) prouve chaque article ; failed / cancelled jamais. La veille des comptes
  payants l'envoie tout de suite (`commandes_vinted_noter`) ; le relevé de nuit couvre tout le monde.
- UN mail par commande de moins de 24 h, qui liste TOUS ses articles (`push_ventes.articles`, push-ventes v12) ; plus
  ancienne : aucun mail.
- Prix : le montant par article de Vinted s'il existe ; sinon le total au prorata des prix d'annonce, centimes au plus
  grand reste, somme = total ; base manquante = NULL, jamais 0 ; un prix saisi par la personne garde son prix.
- Une ligne « lot » d'avant la règle est relue une fois (`lots_v1`, 30 jours, extension 0.6.123), puis réparée par
  `scripts/reparations/20261017_ventes_vinted_en_lot.sql` (sauvegardes, inverse, 0 mail). Interrupteur `coin_config`
  `ventes_vinted_lot_depuis` (0 = règle coupée). Migration 20261017120000 ; selftests `vente-vinted-en-lot`,
  `releve-ventes-trace`.

## 18/10 — une commande échouée, annulée ou remboursée n'est JAMAIS une vente (règle de Nico ; migration 20261018000000)
- Sur aucune plateforme, chez aucun compte, quelle que soit la date de la commande : `vente_commande_annulee_vinted` n'a
  plus de date-charnière (le 13/10 du 15/10 est retiré). Une vente née d'une PREUVE (relevé, ou annonce FillSell close
  « vendue » sur son numéro) est retirée, tracée (`ventes_supprimees`, `usage_logs vente_retiree` avec les reçus), la
  fiche revient au stock avec l'état d'annonce du relevé, le job est clos (ou republié s'il a été revu en ligne) ; seule
  une vente SAISIE à la main reste, signalée une fois (`vente_saisie_jamais_retiree`). Aucun mail.
- Les COPIES retirées à cause de cette vente reviennent par les jobs normaux : chaque retrait `deleted` d'une autre
  plateforme armé par `vente_article_serveur` à l'instant de la vente (± 2 min), dont le dépôt est `cancelled`, donne une
  ligne `remises_en_vente` sur ce dépôt (marqué `vente_annulee_remise`) ; `remises_en_vente_tick` crée la publication
  avec SES gardes (déjà en vente, plafond du palier, poste absent, plateforme en pause, jamais un débit ; restant =
  quantité de la fiche). Jamais un dépôt direct depuis la règle.
- `ventes_statut_classe` : Vinted `canceled` / `cancelled` et eBay `refunded` sont des annulations (en plus de `failed`,
  `fully_refunded`, `cancelled`). Leboncoin, Depop, Opla inchangés.
- Les trois définitions d'avant sont gardées dans `_backup_1810_fonctions_commande_annulee` ; l'inverse
  (`supabase/rollbacks/20261018000000_…`) les rejoue et relit les md5. Essai à blanc généré
  (`scripts/essais/20261018000000_generer.mjs` → `_essai.sql`, 14/14 le 18/10, ROLLBACK).
- Passe sur le parc (18/10) : les trois ventes « signalées, antérieures à la règle » (108583 casque VR, 125191 BlazBlue,
  167304 pull Mango — les seules) retirées par `scripts/reparations/20261018_ventes_commandes_failed.sql`
  (sauvegardes `_backup_1810_ventes_failed_*`, inverse, 0 mail : 101 → 101) ; les 3 copies de 125191 (Leboncoin, eBay,
  Beebs) en file de remise en vente. La vente eBay saisie signalée le 10/10 (`vente_saisie_commande_annulee`) reste :
  une saisie n'est jamais retirée.
- Note 2348 de Louis (puzzle Vilainous) : montant 12 € (décision de Nico) sur la vente 181210 et la note
  (`scripts/reparations/20261018_note_2348_louis_12_euros.sql`, sauvegarde `_backup_1810_note_2348`, inverse, 0 mail).
- Selftests : `commande-annulee-jamais-vente`, `vente-vinted-annulee` (point 8 réécrit : plus de date-charnière).
