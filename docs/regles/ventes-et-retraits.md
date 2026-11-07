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
- 06/11 — ⛔ un plugin Capacitor ne passe JAMAIS nu à travers une promesse : c'est un Proxy qui répond à `then` ;
  rendu par `.then(...)` ou une fonction `async`, il est pris pour une promesse et `await` ne rend plus la main sur
  un vrai téléphone (« X.then() is not implemented », rejet orphelin). pushVentes.js le faisait : aucun jeton ne se
  serait jamais enregistré avec le binaire 2.9. Règle : le module voyage dans une boîte (`{ p }`) ou derrière une
  façade sans `then` (`PluginPush`). Preuve avec le vrai @capacitor/core : `npm run selftest:push-plugin-proxy`.
  Le canal Android « Ventes » suit la langue de l'app (« Sales » en anglais, id `ventes` inchangé).

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
  binaires` (version de package.json depuis le 25/10 ; fichiers dans Téléchargements, `docs/push/CLES-NICO.md`) ;
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
- **Marge en %** (29/10, Nico — remplace « seulement si > 0 » du 16/10) : dès que le prix d'achat est CONNU, 0 €
  (gratuit) compris (`margePctVente`, `margeMoyenne`), IA comprise ; seul l'inconnu reste hors marge et fait dire
  « prix d'achat manquants ». NULL ≠ 0 tient toujours. Trace des prix écrits en lot : `usage_logs`
  `ventes_prix_achat_lot` (`docs/regles/mails-paiements-comptabilite.md`).
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
  `vente_vinted_article_inconnu`) si la vente a moins de 48 h (règle du 01/11, plus bas), jamais un retrait. Tout ou
  rien par commande (doute = rien, décision `en_doute`). Une
  vente déjà enregistrée pour un article (preuve de sa page) est ADOPTÉE, jamais doublée.
- Une commande PAYÉE (ni failed ni cancelled) prouve chaque article ; failed / cancelled jamais. La veille des comptes
  payants l'envoie tout de suite (`commandes_vinted_noter`) ; le relevé de nuit couvre tout le monde.
- UN mail par commande de moins de 24 h, qui liste TOUS ses articles (`push_ventes.articles`, push-ventes v12) ; plus
  ancienne : aucun mail.
- Prix : le montant par article de Vinted s'il existe ; sinon le total au prorata des prix d'annonce, centimes au plus
  grand reste, somme = total ; base manquante → parts égales (règle du 01/11, plus bas) ; total inconnu = NULL, jamais
  0 ; un prix saisi par la personne garde son prix.
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

## 18/10 — VENTES EN LOT ET PLUSIEURS EXEMPLAIRES : CONSTATS (lot 4.3 / 4.4, vérification en lecture seule, RIEN corrigé — décision Nico)
Rapport : `docs/enquetes/session-sans-nico-1810/lot4-ventes-lot-multi-exemplaires.md`.
- **Lot de N annonces dans UNE commande** : Vinted ✓ (0.6.123, `vente_vinted_lot_noter`) ; eBay ✓ une vente par ligne de
  commande (`ebay-ventes-sync` + `ebay_commande_appliquer`) ; Depop ✓ une ligne par annonce `STATUS_PURCHASED`
  (`depop.js:816-833`) ; **Leboncoin ✗** : une vente groupée (`bundle`) donne UNE ligne « lot » sans numéro d'annonce
  (`background.js:17729`), la veille des commandes écarte les lots (`:20526`), chaque annonce attend le clic — et la ligne
  « lot » (inventaire_id NULL) échappe à la garde anti-doublon de `enregistrer_vente_atomique` ; **Beebs ✗** : aucune vente
  Beebs relevée (`VENTES_PLATEFORMES` sans Beebs, `enregistrer_ventes_relevees` refuse `beebs`), les commandes Beebs ne vivent
  que dans `plateforme_commandes` (bêta) qui ne touche ni ventes ni fiches.
- **Quantité d'une ligne eBay** : `li.quantity` jamais lu, vente écrite `quantite = 1` au prix de la ligne (toutes unités) →
  marge fausse pour une ligne de 2 ; le stock reste juste par la quantité eBay. `ventes.quantite` vaut toujours 1 (une
  ligne par exemplaire, `enregistrer_vente_atomique` boucle `1..v_q`).
- **Fiche à plusieurs exemplaires** : garde serveur ✓ (`v_restant`, copies retirées seulement à 0 ; déclencheurs fiche et
  preuve ; lots Vinted `doute:plusieurs_exemplaires_sans_annonce`). **eBay ✗** : `ebay_commande_appliquer` ne regarde que la
  quantité eBay (`epuisee` → fiche vendue, quantité 0) et la publication API met toujours 1 exemplaire (`quantity: 1`),
  `annonce_ebay_aligne_quantite` recopie 1 sur la fiche : une fiche à 3 exemplaires publiée sur eBay passe entière à
  « vendu » à la première vente eBay. **Baisser la quantité eBay au lieu de retirer** : `reviserQuantiteAnnonce`
  (`ReviseInventoryStatus`) n'est lancée qu'à la main (`reviser_quantite_annonce`), jamais par une vente ailleurs → N reste sur
  eBay (survente possible). Leboncoin pro multi-unités : « reste ouvert » (mig 20261009190000) ; Depop : seule une annonce
  entièrement vendue est relevée.
- Pourquoi rien n'a été corrigé le 18/10 : chaque correctif touche `enregistrer_ventes_relevees` / `ebay_commande_appliquer`
  (fonctions de prod réécrites depuis `pg_get_functiondef`) ou le relevé des commandes Leboncoin/Beebs, et ne se prouve
  qu'avec de VRAIES ventes (lot Leboncoin, ligne eBay à 2, vente Beebs) — impossible sans Nico. À décider : (1) eBay
  `li.quantity` → `quantite` ; (2) Leboncoin `bundle` : lire les annonces du lot dans le détail de la commande ; (3) relevé
  des ventes Beebs (commandes `o.products[]` → ventes) ; (4) eBay : `ebay_commande_appliquer` tient compte de `i.quantite`
  et une vente ailleurs révise la quantité eBay (−1) au lieu de retirer.

## Règles (18/10 — ventes Beebs)
- **Une commande lue sur la page des ventes de Beebs est une vente prouvée** (`commandes_beebs_noter`) : rattachée par le
  numéro du produit SEULEMENT (deux jobs = doute, rien), preuve de la forme Depop (`ventes_prouvees_tick` → vente
  « beebs », copies retirées) ; commande annulée = preuve levée. Interrupteur `coin_config.ventes_beebs_commandes`
  (0 = fantôme : bilan `usage_logs ventes_beebs_commandes` seul). La 0.6.126 relit la page à la disparition d'une
  annonce Beebs (30 min au plus) — **une disparition seule ne vaut jamais vente**.
- Les 6 ventes Beebs déclarées et rangées « Ailleurs » (02 → 14/10) sont réparées en `beebs` (18/10, sans mail).
- **(18/10 après-midi, décision de Nico) Une vente DÉCLARÉE sur une carte Beebs est rangée « Beebs », jamais
  « Ailleurs »** — tout le parc (migration `20261018150000`, `enregistrer_vente_atomique` réécrite depuis la prod :
  `v_pf` seul change, `OR j.platform='beebs'`). Beebs ne donne aucune preuve lisible par l'extension ; la personne qui
  confirme sur SA carte Beebs dit où l'article est parti. Leboncoin, eBay, Vinted, Depop sans preuve : « Ailleurs »,
  comme avant. Retraits des autres copies, mails, push : inchangés (essai à blanc 7/7, 0 mail). Conséquence voulue :
  une preuve « vendu » arrivée plus tard sur une autre copie montre la carte « Déjà enregistrée » au lieu de se fermer en
  silence (même chose qu'une vente Beebs saisie depuis le Stock). Selftest `vente-declaree-beebs`.

## 18/10 soir — Comptes reliés : une vente, un compte, un mail (Louis)
- Règles complètes : `docs/regles/rapprochement-et-releves.md` § « UNE BOUTIQUE = UN COMPTE ». Point A tient : jamais un
  retrait sans VENTE prouvée — la vente de la fiche jumelle d'un compte relié en est une.
- **(18/10, 19:54) Une vente Vinted, un compte : la boutique du POSTE** (migration `20261018230000`, get-pending-jobs
  v265). Un compte peut avoir plusieurs postes ouverts sur des boutiques différentes (Louis : PC sur @neyenonie, VM sur
  @evat, boutique de son autre compte) ; la boutique lue PAR COMPTE (sonde réécrite à tour de rôle) ne suffit jamais.
  Chaque poste a SA boutique, datée par SA sonde (`profiles_identite_vinted_du_poste`, `vinted_boutique_du_poste()`,
  30 min) ; une commande lue par un poste ouvert sur la boutique d'un autre compte FillSell ne s'enregistre pas (veille
  `commandes_vinted_noter` et relevé) ; entre comptes reliés, une commande n'est enregistrée qu'une fois, chez le compte
  dont ce sont les articles (fiche ou dépôt), par SON circuit ; get-pending-jobs ne sert aucun job Vinted à ce poste.
  Vu en réel : 12 ventes de @evat en double (louis@ 18:39/19:03, louis-seller 19:08), 0 mail. Essai 23/23.

## ⛔ 20/10 soir — Un dépôt JAMAIS VU EN LIGNE n'est jamais « Plus en ligne — Vendue ? » (Sébastien ; rapport `docs/enquetes/urgences-2010/RAPPORT.md` § 1)
- Vu en ligne = la veille l'a lu en ligne (`vu_en_ligne_le`) OU un relevé du compte l'a vu « en ligne » / « vendue »
  (`job_jamais_vu_en_ligne()`). Jamais vu : un drapeau « plus en ligne » neuf est remplacé par
  `platform_fields.pas_encore_visible` (déclencheur `cross_post_jobs_vue_ou_pas_encore_visible`, tout écrivain) —
  l'app dit « Beebs vérifie ton annonce ». Jamais une question, jamais une vente, jamais un retrait.
- Toujours invisible après la grâce (72 h Beebs, 4 h ailleurs) et absent de deux relevés complets : ÉCHEC DE PUBLICATION
  (`trancher_publications_sans_lien`, dépôts avec ou sans lien, 14 derniers jours), publication rendue — ou clos sans
  rouge si l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié).
- Hors règle : une annonce vue en ligne puis disparue (la question d'avant), une preuve « sold », Vinted (sa preuve est
  le dressing), une recréation (republish, circuit « introuvable à confirmer »). Migration `20261020220000`.

## ⛔ 22/10 — Leboncoin : « Achat en cours » = vente ; un retrait en retard se dit (rapport `docs/enquetes/cinq-points-2210/RAPPORT.md` § 1-2)
- La transaction lue par le relevé Leboncoin (`transaction_status` : `pending` « Achat en cours », `sold` « Vendu » ;
  colonne `annonces_plateforme.transaction_plateforme`, extension ≥ 0.6.129, sinon la capture) est la PREUVE de vente
  sur le numéro EXACT : `leboncoin_transaction_noter` pose `sale_signal`/`sale_evidence` (source `transaction_leboncoin`,
  sans `unavailable_since`) sur LE job publié de ce compte ; `ventes_prouvees_tick` enregistre la vente « Leboncoin » ;
  retraits ailleurs ; jamais l'annonce Leboncoin retirée ; fiche déjà vendue, plusieurs exemplaires, deux jobs = rien.
  Seule une TRANSITION agit (déclencheur `annonces_plateforme_transaction_leboncoin`). Migration `20261022110000`.
- Achat annulé = lu `pending` puis EN LIGNE sans transaction : `vente_transaction_annulee_leboncoin` (vente née de la
  preuve seulement — jamais une saisie ; fiche au stock ; retraits en file arrêtés ; copies retirées → `remises_en_vente`).
  `sold` → sans transaction : rien n'est conclu. Interrupteur `coin_config.ventes_leboncoin_transaction`.
- Note de vente : « Vendu » (transaction terminée) = aucune note ni mail (`push_trg_job`) ; « Achat en cours » : règle
  du 06/10. Un rattrapage classe AUSSI les notes en attente des fiches touchées (une note du 21/10 est partie le 22/10).
- Retrait d'un article vendu en attente depuis plus de 24 h sans mur nommé : ligne « À régler » `en_retard`
  (`src/utils/retraitsBloques.js`), FillSell continue d'essayer. Beebs : une annonce « en cours de vérification » n'a
  AUCUN geste dans « Mes annonces » (vu le 22/10) et sa page est en 404 — ni supprimable ni achetable.
- Numéro de retrait manquant : get-pending-jobs (v267) le lit sur l'annonce que le relevé du compte a liée au DÉPÔT
  exact (`annonces_plateforme.job_id`), une seule vivante — jamais la fiche, le titre, le prix (règle du 11/09).

## 24/10 — Beebs, retrait eBay, rattrapage Leboncoin (rapport `docs/enquetes/lot-2410/RAPPORT.md`)
- **Les ventes Beebs se lisent dans les OBJETS commande** de la page « Ventes » (extension ≥ 0.6.132,
  `commandesDuFluxRsc`) : la carte d'une commande (OrderCard, composant client appelé par le serveur) reçoit
  `{ order: { id, status, created_at, products[] }, isSale }` et fabrique son lien dans le navigateur — le flux n'a
  AUCUN lien de commande (59 lectures fantômes, 0 commande vue). Renvois « $7b » et « $7b:props:… » suivis ; un achat
  (isSale false) n'est jamais une vente ; les liens restent lus en second. Le serveur accepte un numéro de commande
  dès 1 caractère (migration `20261024130000`) ; le rattachement reste le numéro de PRODUIT exact. Interrupteur
  `ventes_beebs_commandes` toujours à 0 : il ne s'allume qu'après des bilans fantômes de la 0.6.132 qui lisent de
  vraies commandes, sans fausse vente (décision de Nico).
- **Retrait eBay d'un compte relié par l'API** : s'il attend l'extension depuis 15 min, ou si le poste est muet, l'API
  le fait (`retraitAttendLePoste`, ebay-api-worker v93) — preuve GetItem avant/après comme toujours. Thierry, 23/10 :
  168782813446 terminée à 21:38.
- ⛔ **(24/10 nuit) Un retrait fait par l'API Trading close la publication d'origine**, comme l'extension
  (`cancelPublishAfterDelete`) et le retrait d'offre de notre API (`annulerSourceEbayRetiree`) : `cancelled`
  « Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente », `removed_by_user`, questions
  « Plus en ligne » levées (la lecture hors ligne d'avant est archivée). Avant, la publication restait `published` sur
  une annonce terminée et la veille eBay posait « Plus en ligne — Vendue ? » (13939a70 et 559613dd en portent la
  trace) : sur un article en stock, une fausse question à la personne. Après la preuve seulement (« déjà terminée » ou
  fin relue), sur le numéro EXACT (colonne ou lien, jamais deux numéros contraires), sur la fiche du retrait, jamais un
  titre ; une annonce qu'eBay dit vendue n'est jamais close ainsi (`_shared/ebay-retrait-trading.js`,
  ebay-api-worker v94, selftest `ebay-retrait-trading`). Premier cas : l'estampe en double de jocabroc8 (décision 4).
- **Rattrapage « Achat en cours » Leboncoin** (`scripts/reparations/20261022_leboncoin_achats_en_cours_existants.sql`) :
  rejoué le 23/10 à 22:54 (0.6.131 servie) — 4 ventes (fiches importées le jour même depuis des annonces déjà
  « Vendu » / « Achat en cours »), 0 mail. La règle n'agit qu'à une TRANSITION : une fiche créée APRÈS la lecture
  (import) ou une lecture de plus de 72 h attend ce script ou une décision de Nico (rapport, décisions).

## ⛔ 24/10 matin — Leboncoin : la lecture fraîche d'une vente non enregistrée (décision 7 de Nico ; rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 matin »)
- La règle « Achat en cours / Vendu » joue aussi quand un relevé RELIT le même état (lecture < 1 h, plus récente que
  la précédente, annonce vue en ligne dans les 24 h) et que le job Leboncoin publié de CE numéro, exactement, porte
  une fiche au stock sans preuve de vente : une fiche importée après la lecture, ou une lecture ancienne reprise par
  une extension récente, n'attend plus de script. Jamais sinon (aucune trace inutile).
- La preuve porte `sale_evidence.rattrapage` (`lecture_fraiche_2410`, première lecture de cet état = la plus ancienne
  trace de la règle pour cette annonce). **Aucune note — ni mail ni notification — pour une vente de plus de 24 h ou
  d'âge inconnu** (`push_trg_job`) ; « Vendu » : jamais de note (règle du 22/10).
- Migration `20261024150000` ; selftest `lbc-rattrapage-lecture-fraiche` ; essai `scripts/essais/20261024150000_essai.sql`.

## ⛔ 24/10 midi — un retrait Beebs « Vendu » est fait ; bilan Beebs détaillé (rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 midi »)
- Nos retraits Beebs choisissent « Vendu via une autre plateforme » (règle du 11/09) : Beebs passe l'annonce
  « Vendu » (plus achetable) et la GARDE dans « Mes annonces ». La preuve d'absence n'arrivait jamais : « Suppression
  envoyée… encore dans Mes annonces » à chaque passage, retraits « en retard » sans risque réel. Désormais (extension
  0.6.133, `update-job-status` v146) : la fiche produit du numéro EXACT (ld+json Product, sku = le numéro) qui dit
  `SoldOut` prouve le retrait (`preuve_retrait.source = 'page_produit'`) ; une annonce déjà vendue n'est jamais
  re-supprimée. InStock, une page en cache, un autre produit de la page, une réponse ≠ 200 : jamais une preuve.
- Les serveurs de Supabase ne lisent pas Beebs (403 anti-robot) : une preuve Beebs vient toujours d'un navigateur.
- Le bilan Beebs (`usage_logs` « ventes_beebs_commandes ») garde le détail de chaque commande (numéro, statut, classe,
  date ; par produit : verdict, job, fiche, titre) et l'extension du compte, en fantôme comme en écrit (migration
  `20261024160000`). L'interrupteur reste à 0 jusqu'au feu vert de Nico sur la liste.

## 24/10 soir — les ventes proches tiennent dans UN mail (lot « zéro blocage », A9 ; rapport `docs/enquetes/zero-blocage-2410/RAPPORT.md`)
- Les notes d'un même compte décidées dans le même passage de `push-ventes` partent dans UN mail (« N articles
  vendus ») ; deux au plus (enregistrées / à confirmer). Chaque vente garde sa réservation `vente:<id>` (index unique
  `email_logs_vente_unique`) : jamais deux mails pour une vente, jamais une vente sans mail (rien de parti → tout
  relâché ; tête déjà servie → les autres repartent entre elles). Une vente seule part comme avant, sans retard.
  `_shared/ventes-un-mail.js`, selftest `ventes-un-mail`. Une attente de regroupement entre passages (R2) n'est pas
  faite (gain estimé : 3 mails sur 47 ; elle retarderait tous les mails).
- Constaté le 24/10 : la règle du 06/10 « preuve récente » laisse des ventes Vinted SANS mail (alice.fournival : 9 sur
  10) — à trancher par Nico.

## 24/10 nuit — l'annulation d'une commande Vinted se voit en minutes, plus en heures (rapport `docs/enquetes/lot-2410-nuit/RAPPORT.md` § « Clôture »)
- Le relevé des commandes (10 min) qui voit une commande Vinted « annulee » retire la vente qu'elle portait
  (déclencheur `plateforme_commandes_vente_annulee_vinted`, migration 20261024235700) — même fonction que le relevé
  quotidien des ventes (vente_commande_annulee_vinted), qui ne refait rien ensuite (idempotent). La remise en vente est
  PROPOSÉE (carte « Vente annulée — Remettre en vente ? », 20261024234000), jamais automatique. 0 mail.
- **La carte vit dans « À régler »** (Nico, 24/10 22:20) : une ligne « Vente annulée — Remettre en vente ? » par vente
  proposée, comptée dans le badge « À régler » (`StockTab`, `nbVentesAnnulees`) ; plus de bandeau en tête de l'app.
- **Contenu de la remise** (20261024235800, appliquée le 24/10 à 22:54:14) : le job de remise garde le contenu du job
  vendu ; ce qui lui manque (titre, description, prix, photos) vient de la FICHE. Jamais une publication sans titre, sans
  prix ou sans photo (avant : le short de Nico, job 6c02755d, copié d'une republication du 26/09).
- **Remis en ligne directement sur la plateforme AVANT l'appui** (par le vendeur ou par la plateforme) : la proposition se
  ferme « déjà en vente » (`motif = deja_en_vente`), rien n'est republié. Preuves acceptées : l'annonce vendue revue ACTIVE
  par un relevé postérieur à l'annulation, une autre annonce en ligne de cette fiche (`annonces_plateforme`), une autre
  annonce Vinted active de la fiche. Jamais le titre.
- **Remise Vinted d'un article jamais publié depuis l'app** (importé du dressing puis republié par capture : aucun de ses
  jobs ne porte `categoryPath`, l'extension refusait « categoryPath absent », rien n'était publié — le short de Nico, job
  6c02755d) : `remise_en_vente_champs_capture` (migration 20261024235900) reprend catégorie, état, taille, marque, couleurs
  (isbn, matière) de la DERNIÈRE capture de l'annonce de cette fiche (`vinted_republish_captures.libelles`, même lecture
  que la recréation d'une republication) ; ce que porte le job vendu garde la main ; sans capture, comme avant.
  Écrite le 24/10 vers 23:05, feu vert de Nico à 23:10:07 (« Feux vert go », après l'avoir vue) ; application refusée par le
  mode auto de Claude Code (« Production Deploy ») — état final dans `docs/agents/etat-2026-10-01.md`.
- **Cible Vinted (Nico, 24/10 23:21)** : une vente Vinted ANNULÉE se remet en vente par le bouton « Republier » de Vinted
  (dans la conversation de la commande : même annonce, même contenu), jamais par une nouvelle annonce en plus. L'extension
  ne sait pas encore l'actionner (prochain lot : geste 0.6.142, job serveur, vrai test) ; 235900 n'est qu'un secours.
  Ne JAMAIS publier une nouvelle annonce Vinted ET laisser le « Republier » possible : doublon.
- **OUVERT (prochain lot)** : la notification push « Vente annulée » (Nico, 22:20) — elle passera par push-ventes.

## ⛔ 25/10 nuit — vente Vinted ANNULÉE : remise en vente par le bouton « Republier » de Vinted (décision de Nico du 24/10 23:21 ; rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 2)
- Jamais une nouvelle annonce en plus : l'annonce annulée revient par le geste « Republier » de Vinted (même annonce, mêmes
  photos). Relevé sur la vraie page : `POST /api/v2/transactions/<n>/reupload` ; la conversation porte
  `actions [{action: "reupload"}]`.
- Base (migration `20261025010000`, appliquée le 25/10 à 00:47) : `remises_en_vente_tick` crée, pour une vente Vinted
  annulée dont la remise est acceptée, UN job « publish » hors quota marqué `remise_par_republier {transaction_id,
  conversation_id, item_id}` ; sans numéro de commande → rien (`republier_commande_inconnue`).
- get-pending-jobs met ces jobs de côté et ne les sert qu'au poste qui déclare `vinted_republier_v1` (extension ≥ 0.6.142) ;
  ailleurs : « En attente de la mise à jour de l'extension FillSell (0.6.142) », dit une fois.
- Extension (`processRepublierVintedJob`, 0.6.142) : lit compte, conversation et dressing ; l'envoi est NOTÉ avant UN SEUL
  POST ; l'annonce née du geste est rattachée par son numéro ou ses photos, jamais par son titre ; un « Republier » déjà fait
  par le vendeur est détecté et rattaché ; refus, brouillon, lot, autre boutique, doute → question `republier_vinted`.
  La reprise d'un job figé ne rattache jamais un « Republier » par son titre.
- ⚠️ Le « Republier » remet l'annonce à SON prix Vinted : un test réel se fait sur une annonce à 999 € ou plus (règle des
  tests), ou sur décision nommée de Nico.

## 25/10 nuit — notification push « Vente annulée » PRÉPARÉE, non armée (point 3 ; rapport § 3)
- Migration `20261025040000` ÉCRITE, non appliquée (essai 19/19 en prod, annulé) : `push_annulations` (une note par
  annulation, clé user + commande ; droits serveur seulement), seulement les annulations NEUVES (après l'armement
  `coin_config.push_annulations_depuis`, moins de 24 h, au moins 6 min), relue avant l'envoi ; cron à part. push-ventes v14
  (non déployée) les envoie après les ventes, sans jamais retarder une vente. App : l'appui mène à « Ventes annulées »
  (type `vente_annulee`, jamais `vente`).
- Aucun push ne peut partir aujourd'hui : 0 appareil enregistré, aucun secret APNs/FCM en prod (ventes comprises) —
  décision de Nico avant d'armer.

## 25/10 nuit — une vente n'est jamais écrite deux fois (audit N7)
- VentesTab : verrou par ligne et relecture avant écriture (ligne et lot, par pages `lireToutesPages`) — un double appui
  ou une reprise après un envoi au sort inconnu écrivait la vente deux fois (af37fa49 : 64 lignes en double le 28/09 ;
  chaouidz 274893/274894 à 70 ms d'écart le 24/10).
- Réparation des 64 lignes LANCÉE le 25/10 à 08:55:46 (ordre de Nico, après un essai à blanc : 64 lignes, 24 articles,
  416,64 € comptés en trop, compte af37fa49 ; les 24 lignes gardées relues ; sauvegarde `_backup_2510_ventes_doublons`,
  inverse `20261025_ventes_en_double_INVERSE.sql` ; 0 mail lié).

## ⛔ 25/10 après-midi — UN RETRAIT SUR UNE ANNONCE DÉJÀ ABSENTE EST UN RETRAIT FAIT (règle de Nico ; rapport `docs/enquetes/import-publier-ailleurs-2510/RAPPORT.md`)
- L'issue d'une absence PROUVÉE est `deleted` (« Fait · retirée »), `error` NULL, l'erreur d'avant archivée, drapeau unique
  `platform_fields.deja_absente` { le, plateforme, numero, preuve, vente, pose_par } (`_shared/retrait-deja-absent.js`) —
  jamais `cancelled` ni `failed` (ils défont le « Oui » d'une fusion : `deja_vendu_retrait_echoue_defait`).
- Preuves, par NUMÉRO (jamais un titre) : Vinted — 3 lectures unanimes « introuvable/fermée/vendue », instantané « sold »,
  ou 2 relevés complets de SA boutique depuis la dernière vue ; Leboncoin, Depop, eBay — vue puis absente des 2 derniers
  relevés complets, 410 hors fenêtre de modération, fiche Depop 404 / STATUS_PURCHASED, eBay GetItem ≠ Active ; Beebs —
  JAMAIS par le relevé ni l'index : deux constats « page 404 » de l'extension à 6 h d'écart ET (vue en ligne, ou dépôt de
  plus de **7 jours** — 72 h avant le 25/10 : mesuré, une annonce jamais vue en ligne peut l'être jusqu'à 126 h après sa
  sortie de vérification).
- Partout : extension 0.6.144 (`processDeleteJob`), `update-job-status` v150 (étiquette sur les champs), `handler-watch`
  v131 (balayage des retraits ouverts), `ebay-api-worker` v98, `get-pending-jobs` v286 (ses six clôtures « déjà retiré »
  passent en `deleted`, jamais Beebs sur relevé). Réparé le 25/10 : 9 retraits ouverts (3 Leboncoin, 6 Vinted) + 2
  copies (`scripts/reparations/20261025_retraits_deja_absents.sql`, sauvegarde + inverse, 0 mail).
- Affichage (`src/utils/retraitsBloques.js`) : un retrait Beebs « en vérification » (ni achetable ni supprimable) est un
  mur à part, `verification_beebs`, en ambre, sans « risque de double vente ».
- ⛔ Question « retirer ? » gardée quand l'annonce est en ligne malgré un relevé « vendue » : Beebs 34209200 vue
  achetable le 25/10 15:12 alors que `annonces_plateforme.statut_plateforme` = vendue.

## ⛔ 26/10 après-midi — un retrait au lien faux retrouve l'annonce ; vue acheteur = connexion ; Beebs lu par la page (rapport `docs/enquetes/session-2610/RAPPORT.md` § A)
- Leboncoin : `/ad/<id>` et `/ad/x/<id>` mènent à une 404 (relevé réel 26/10) ; la forme qui s'ouvre est
  `/ad/<rayon réel>/<id>` (`_shared/annonce-lien.ts` `lienOuvrable` ; extension `lienLeboncoinOuvrable`). get-pending-jobs
  réécrit le lien d'un retrait avant de le servir ; une page 404 n'est jamais « une annonce intitulée 404 ».
- Retrait Leboncoin en vue acheteur (« Acheter / Faire une offre / Contacter ») = attente de connexion au compte qui a
  publié (`_shared/lbc-vue-visiteur.js`, update-job-status ; 0.6.147 « Connexion Leboncoin requise »), jamais un essai.
- Beebs : lecture par fetch refusée (DataDome) → la même page lue dans un cadre de même origine, même fonction (0.6.147).
  Une page 404 + absente de l'index ne prouve toujours pas un retrait.
- Canal coupé d'une publication : Leboncoin, l'adsubmit tranche avant toute reprise ; sinon reprise rapide sans
  tentative consommée (deux fois), puis le recul ordinaire.

## ⛔ 27/10 — une ligne « jamais mise en ligne » se referme quand le relevé retrouve l'article (GTA de BONCOIN ; rapport `docs/enquetes/jamais-en-ligne-2710/RAPPORT.md`)
- Le jugement « jamais vu en ligne » (`trancher_publications_sans_lien`, fin de relevé) tombe AVANT le rapprochement du
  même relevé (moteur du compte, minutes plus tard) : une annonce de la fiche lue par CE relevé n'y est pas encore
  rattachée. Rien ne revenait ensuite sur une ligne `failed`. Les « remises en published » du 10/10 au 21/10 étaient des
  relances (`erreurs_archivees.par = relance_manuelle`), jamais un rattrapage.
- **Règle** `depot_jamais_en_ligne_refermer` (mig `20261027100000`) — preuve exigée, même compte, même plateforme :
  même NUMÉRO que le dépôt en ligne → « publiée » avec son lien (close si une autre publication suit déjà l'annonce) ;
  autre annonce de la MÊME FICHE en ligne → close sans rouge « en ligne sous l'annonce … ». Jamais un titre, une photo,
  une fiche jumelle. Rien redéposé, retiré, vendu ; aucun quota, aucun mail.
- Appelée par les déclencheurs `annonces_plateforme_referme_depot_ins/_maj` (annonce en ligne apparue, ou rattachée à
  une fiche ; jamais une ligne relue à l'identique) et par `trancher_publications_sans_lien` à chaque relevé complet.
- **Motif** : aucune plateforme ne dit pourquoi → « Cette annonce est absente de tes annonces <plateforme> aux relevés
  complets du … et du …, et <plateforme> n'a donné aucun motif. » Plus jamais « refusée par sa modération / sa
  vérification » sans motif lu ; un vrai motif (adsubmit 4xx, `pas-de-rouge.js`) garde son texte.
- Selftest `selftest:jamais-en-ligne-referme` ; essai à blanc `scripts/essais/20261027100000_essai.sql` (26/26).

## 01/11 — une vente ancienne d'un article inconnu entre dans l'historique sans question (rapport `docs/enquetes/ventes-anciennes-inconnues-0111/RAPPORT.md`)
- La question « Article vendu sur Vinted que FillSell ne suit pas : s'il est en vente ailleurs hors FillSell, retire-le
  là-bas » (`usage_logs` `vente_vinted_article_inconnu`, posée par `vente_vinted_lot_eclater`, bloc D6) n'est posée que
  pour une vente RÉCENTE : date de vente connue et de moins de 48 h quand la commande est lue
  (`question_article_inconnu_due(vendu_le, lu_le)`, même fenêtre que la garde « vente récente prouvée » des mails).
  Plus ancienne ou sans date : la vente s'écrit comme avant (vente par article, décision `article_inconnu`), sans
  question. Jamais un retrait ; le mail par commande < 24 h est inchangé. Migration `20261101073000`.
- Aucun écran ne lit cette question (ni « À régler », ni badge, ni alerte) : c'est une trace serveur. Une vente sans
  fiche se voit dans la liste des ventes à sa date, et dans « Complète tes prix d'achat » (prix d'achat NULL).
- **Un lot découpé : chaque article reçoit sa part du prix du lot** (décision de Nico, 01/11 ; mig `20261101100000`,
  appliquée à 11:04). Quand le prorata est impossible (un article sans prix de base : ni montant Vinted, ni annonce, ni
  fiche), `vinted_lot_parts` répartit le reste du lot à PARTS ÉGALES entre ces articles, en centimes, un centime de plus
  aux premiers dans l'ordre de la commande (source `parts_egales`) : la somme est toujours le total du lot. Inchangé :
  montant Vinted, prorata, prix saisi gardé ; total inconnu (ou reste inconnu) = NULL. Essai à blanc sur le parc :
  1 537 prix déjà calculés identiques, 4 064 articles sans base auraient leur part.
- Les 34 lots de la nuit (the_closet72 27, PILOU 7) : `scripts/reparations/20261101_lots_vinted_parts_egales.sql`
  (09:54 ; 123 ventes, prix de la ligne « Lot » d'avant à parts égales ; sauvegardes `_backup_0111_lots_parts_egales_*`,
  inverse). CA revenu exactement : the_closet72 5 426,79 → 5 824,69 €, PILOU 16 627,97 → 16 719,27 €, nombre de ventes
  inchangé, aucune ligne « Lot » revenue. Les 470 autres lots déjà découpés à prix NULL du parc ne sont pas touchés.
  Selftest `selftest:lot-vinted-parts-egales [-- --prod]`.
- Réparation de la nuit du 01/11 : `scripts/reparations/20261101_questions_article_inconnu_anciennes.sql` (123
  questions → feature `vente_vinted_article_inconnu_ancienne`, texte retiré ; sauvegarde
  `_backup_0111_questions_article_inconnu`, inverse `…_INVERSE.sql`, 0 vente touchée, 0 mail). Selftest
  `selftest:question-article-inconnu-recente [-- --prod]` ; essai à blanc `scripts/essais/20261101073000_essai.sql` (15/15).

## ⛔ 03/11 — la plateforme dit que l'annonce n'existe plus : retrait FAIT, avec SES mots (rapport `docs/enquetes/six-points-0311/RAPPORT.md` § 1)
- Règle de Nico, toutes plateformes : supprimée, terminée ou retirée par la plateforme → `deleted` + `deja_absente`
  (règle du 25/10), et le motif donné par la plateforme gardé tel quel dans `deja_absente.motif_plateforme`
  (`dejaAbsente({ motifPlateforme })`). L'app le montre : barre « Déjà retirée par eBay : « … » Plus rien à retirer. »,
  fiche « Retirée par eBay : « … » » (`barresJobs.motifRetraitParPlateforme`).
- eBay (`_shared/ebay-retrait-trading.js`) : deux lectures concordantes, jamais une seule — GetItem du vendeur en échec
  DÉFINITIF nommé (`refusGetItemDefinitif` : aucune erreur passagère, jeton, quota, panne — `CODES_GETITEM_PASSAGERS`) ET
  vitrine Browse 404 / terminée / vendue (`annonceSupprimeeParEbay`). Vitrine qui la vend encore, ou muette : reporté.
  Publication d'origine close « Annonce supprimée par eBay (pas par le vendeur) — pas une vente » (jamais sur une vente).
- ⛔ Armement (migration `20261103140000_armer_retrait_rattachee_apres_vente`, feu vert de Nico, appliquée le 03/11 à
  13:52) : la MÊME fonction `cross_post_jobs_publie_sur_article_vendu` est aussi appelée AFTER INSERT (annonce insérée déjà
  publiée par un relevé) et AFTER UPDATE OF inventaire_id (re-pointée sur une fiche) : une annonce rattachée à un article
  déjà vendu arme son retrait tout de suite, avec toutes les gardes d'`armer_retrait_job_pour` (vente sur une AUTRE
  plateforme, annonce prouvée, jamais deux exemplaires vus par les relevés, `fillsell.sans_retrait`). Essai à blanc 5/5
  (`scripts/essais/20261103140000_essai.sql`), 30-43 ms par déclenchement. Inverse dans `supabase/rollbacks/`.
  ⛔ CONTREDITE le soir même (Nico : « un rattachement ne déclenche JAMAIS de retrait ») : retirée par la migration
  `20261103230000_rattachement_jamais_de_retrait` (appliquée le 03/11 soir) — section du 03/11 soir, en fin de fichier.

## 03/11 — une publication eBay close « absente, sans motif » est relue chez eBay (rapport § 4)
- La fonction SQL des relevés clôt « absente aux relevés complets … aucun motif » sans lire eBay quand la veille n'a pas
  de date de fin (veille très en retard : médiane 351 h le 03/11). ebay-api-worker `motiverDisparuesEbay` relit GetItem
  + vitrine (3 par passe, une passe sur cinq, 7 jours, 3 essais) et réécrit le message avec ce qu'eBay sait
  (`_shared/ebay-disparue-motif.js`) : en ligne du … au …, arrêtée depuis le compte eBay (motif choisi), supprimée par
  eBay (ses mots), remise en vente sous un autre numéro. Statut inchangé ; trace `platform_fields.motif_ebay`. Jamais sur
  une annonce touchée par un retrait FillSell. Diagnostic sans écriture : action `lire_getitem` (x-cron-secret).

## ⛔ 03/11 soir (Nico) — un rattachement ne déclenche JAMAIS de retrait ; une ressemblance n'est jamais retirée (rapport `docs/enquetes/retraits-a-tort-0311/RAPPORT.md`)
- Seule une vente prouvée, survenue APRÈS la mise en ligne de l'annonce, peut la retirer. Une annonce en ligne qui
  ressemble à un article déjà vendu devient un article à part (ou est « à vérifier ») : jamais retirée, jamais réunie à
  la fiche vendue. 8 retraits à tort le 03/11 (16:19-16:28, JEAN-LUC LASSARAT, Dylan Fontaine) par « Déjà vendu ? → Oui,
  c'est le même — retirer l'annonce » ; renverse, pour les ressemblances, la règle du 30/09 (« oui » = preuve de vente).
- App : `src/annonces/EcranDoublons.jsx` (`ressembleVendu` → « Annonce à vérifier », « La mettre dans mon stock » =
  « non » au serveur). La copie interrogée À LA VENTE du jour (`copie_non_prouvee`) garde « Oui, la retirer ».
  Selftest `ressemble-vendu-jamais-retire`.
- Serveur, migration `20261103230000_rattachement_jamais_de_retrait` (feu vert de Nico, APPLIQUÉE le 03/11 vers 21:00 ; banc
  `scripts/essais/20261103230000_banc.mjs` 28/28) : déclencheurs de 13:52 (`…_inseree_…`, `…_repointee_…`) retirés ;
  « publiée après la vente » = dépôt de FillSell seulement ; `armer_retrait_job_pour` refuse une annonce IMPORTÉE
  (source `releve` / `rattachement.import`) mise en ligne après la vente (`annonce_mise_en_ligne`, `vente_instant`,
  `vente_apres_mise_en_ligne`, trace `retrait_refuse_vente_avant_mise_en_ligne`) ; le dépôt de FillSell pour la fiche
  reste retiré même pour une vente vue en retard ; `inventaire_doublon_decider` : « oui » sur une fiche vendue dont
  l'autre a une annonce en ligne = article à part (`doublon_vendu_article_a_part`). Selftest `rattachement-jamais-de-retrait`.
- **Leboncoin : « Vendu » dès la PREMIÈRE lecture d'une annonce importée** (badge « Article vendu » d'une annonce
  encore en ligne : plusieurs exemplaires) = une vente d'avant le suivi, déjà dans l'historique par la page des
  transactions : jamais une vente du jour, jamais un retrait de copie. Seule une transition vue (lue sans « Vendu »,
  puis « Vendu ») date une vente. Une annonce déposée par FillSell n'est pas concernée. `check-listing-status` refuse la
  confirmation avec la raison (`_shared/lbc-vendu-avant-suivi.js`, selftest `lbc-vendu-avant-suivi`) ; la migration
  ci-dessus fait taire la règle de la transaction (`vendu_avant_suivi`) et écarte le drapeau de la veille avant écriture.

## Vente → retrait, et ventes Leboncoin (05/11, points 10, 10A, 12 — Louis)
- Un retrait armé par une vente PROUVÉE (la vente de la fiche porte le numéro de commande/transaction de la plateforme)
  est servi sans l'attente de 10 min (`_shared/retrait-vente-prouvee.js`, get-pending-jobs) ; le « Vendu » cliqué à la main
  garde ses 10 min (annulation). L'extension (0.6.174) passe un retrait avant toute autre tâche ; dans une file Leboncoin
  espacée (reprise prudente, délégation), les retraits d'abord. Aucune visite de plus.
- Le numéro d'annonce d'une vente Leboncoin se lit dans le DÉTAIL de la transaction
  (`/api/consumergoods/proxy/v2/pages/transactions/<n°>`, `item.id`), avant l'envoi, une fois par appareil, 16 au plus par
  passage, arriéré de 30 jours. Avec lui, enregistrer_ventes_relevees range la vente chez le compte relié qui POSSÈDE
  l'annonce (plus jamais « le premier qui relève »). Une vente groupée (bundle) n'est jamais rattachée.

## ⛔ 05/11 soir — VENDU QUELQUE PART = RETIRÉ PARTOUT (règle de Nico ; rapport `docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md`)
- Toutes plateformes ; les articles en plusieurs exemplaires et les séries ne sont JAMAIS concernés. Une pièce unique vendue
  ne laisse AUCUNE annonce vivante en silence : dépôt prouvé → retrait d'office (avec ou sans numéro : par le lien) ;
  sinon la question « Déjà vendu ? », dont le « Oui » retire L'ANNONCE MONTRÉE par son numéro et son lien — jamais le
  numéro d'un autre dépôt, jamais sur un titre seul (règles du 05/11 : `rattachement_confirme`, photo identique = preuve).
- Cas réel : le Doudou de nicolas.menar (vendu sur Vinted le 06/10) — dépôt Leboncoin 13627ae2 au numéro d'une AUTRE
  annonce (« Lot 2 doudous » 3267000921), l'annonce déposée 3274924341 sans retrait ni question ; Beebs d23190b7 (sans
  numéro) : question posée, jamais répondue. Le numéro vide n'est pas la cause.
- Migration `20261105240000_vendu_retire_partout` **PRÉPARÉE, NON APPLIQUÉE** (inverse dans `supabase/rollbacks/`) :
  `poser_questions_copies_non_prouvees` (chaque annonce relevée vivante qu'aucun dépôt publié ne porte sous SON numéro
  devient la question), `inventaire_doublon_decider` (le « Oui » retire l'annonce montrée), `armer_retrait_annonce_pour`
  (neuve, sur le seul geste de la personne). Preuve jetable `scripts/preuve-vendu-retire-partout.mjs` (72/72), selftest
  `vendu-retire-partout` (61/61). Une vente PASSÉE n'est reprise par aucun chemin automatique (voulu) : relance par la même
  fonction (question) ou `armer_retrait_job_pour` (dépôt prouvé), sur liste relue par Nico.

## 06/11 — Lot de Nico (11 points) : retraits, « Oui », ventes en série
Récit et preuves : `docs/enquetes/lot-0611/RAPPORT.md`.
- **Retrait Leboncoin, 410 dans la fenêtre de modération = attente, pas un essai** (point 11, Cédric GRIZSTYLE 1b7be2d6) :
  une annonce « désactivée » ou introuvable (410/404) est HORS LIGNE et clôt le retrait sans message (extension :
  `cloreRetraitDejaAbsent`, inchangé). Leboncoin ne distingue PAS la modération d'un retrait (même 410, même « Cette
  annonce est désactivée » ; le tableau de bord vendeur dit « active »), d'où la garde de l'extension : un 410 lu moins de
  2 h après le dépôt FillSell est « inconnu ». Ces lectures ne consomment plus d'essai (`_shared/lbc-retrait-moderation.js`,
  update-job-status) : pending, compteur de la base, relecture 15 min, bornée à 6 h ; la fenêtre passée le 410 clôt. Avant :
  les 5 essais (5/15/30/60 min) tombaient tous dans les 2 h → rouge « retire-la à la main ». Selftest `lbc-retrait-moderation`.
- **Un « Oui » arme le retrait quel que soit l'auteur légitime** (point 4) : la décision et ses gardes sont UNE fonction
  (`inventaire_doublon_decider_corps`, compte lu sur la QUESTION, jamais sur la session) ; deux entrées : l'app
  (`inventaire_doublon_decider`, la personne sur sa session, inchangée) et l'équipe sur ordre
  (`inventaire_doublon_decider_pour`, service seulement, auteur NOMMÉ écrit dans `preuves.repondu_par`, decide_par
  « utilisateur »). Jamais en se faisant passer pour la personne (claims). L'IA n'est pas un auteur de retrait.
  Migration `20261106100000` **APPLIQUÉE le 06/11** (feu vert nommé de Nico) ; banc jetable 30/30 ; prouvée sur un vrai cas
  à 12:07:12 (question 60621113 de Doudou : le « Oui » de l'équipe passe par l'entrée, la copie déjà retirée → « caduque »).
- **Lecture fraîche d'une vente Leboncoin** (point 8, Louis) : « déjà prouvée » = `sale_signal` sold AVEC `sale_evidence`
  du même numéro (le test de `leboncoin_transaction_noter`) ; un « Vendu » lu sur la page, sans preuve, n'arrête plus la
  preuve de la transaction. Migration `20261106110000` **APPLIQUÉE le 06/11 à 12:08** ; banc 11/11.
- **1 c, version étroite** (point 5) : `fiche_annonces_vivantes` n'écarte qu'une annonce Leboncoin sous transaction dont
  la vente est DÉJÀ enregistrée (reçu `ventes_operations` « annonce:leboncoin:<n°> »). Migration `20261106120000`
  **APPLIQUÉE le 06/11 à 12:07** (152 fiches de 1 à 0, aucune au seuil 2) ; ⛔ jamais avec la version large `20261105210000`. Preuve réelle :
  `scripts/essais/20261106120000_cas_reels.sql` ; banc 10/10.
- Retrait armé « par le circuit normal » hors session de la personne : `armer_retrait_annonce_pour(<annonce>, …, true)`
  après relecture de l'annonce (scripts `scripts/reparations/20261106_doudou_lbc_retraits.sql`) ; clôture d'un retrait
  « déjà absent » prouvé à la main : la clôture du serveur (`champsRetraitDejaAbsent` + `clotureCopie`), jamais un statut
  écrit seul (`scripts/reparations/20261106_retrait_lbc_cedric_clos.mjs`).

## ⛔ 06/11 après-midi — Leboncoin : remise en vente APRÈS la disparition (règle A, RETIRÉE le 06/11 soir — voir plus bas) ; jamais « published » refusée (règle B)
Décisions de Nico (complément du lot n° 2, séries de Louis, compte Amiral). Récit : `docs/enquetes/lot-0611/RAPPORT.md`.
- **Règle A — la remise en vente Leboncoin n'est déposée qu'une fois l'annonce vendue réellement hors ligne.** Avant :
  la vente (transaction « Achat en cours ») était enregistrée à 07:15 et la remise déposée à 07:22-07:29 alors que
  l'annonce vendue était encore « active » sur Leboncoin (elle le reste des jours sous transaction) ; Leboncoin refuse un
  dépôt identique à une annonce en ligne (contrôle automatique) → 7 dépôts jamais parus, « published » chez nous. Après :
  get-pending-jobs (avant la retenue de session) lit `annonces_plateforme` du numéro `remise_en_vente.annonce_vendue` ;
  tant qu'elle est `en_ligne`/`en_verification` sans `disparu_le`/`retiree_le`/`ignoree_le`, la tâche n'est PAS servie :
  pending, intacte, SANS message, aucune écriture ; elle part d'elle-même au premier poll après le relevé qui la voit
  partir. Aucune ligne relevée = inconnue = servie. `_shared/remise-en-vente-attente.js` ; selftest `remise-en-vente-attente`.
  « Transaction Leboncoin pending = vente payée » INCHANGÉ : la vente s'enregistre tout de suite, seule la remise attend.
  Autres plateformes vérifiées : Vinted, Beebs, Depop marquent l'annonce « vendue » et acceptent une annonce semblable ;
  eBay clôt l'annonce à la vente → la règle ne joue que sur Leboncoin (`PLATEFORMES_REMISE_APRES_DISPARITION`).
- **Règle B — un dépôt Leboncoin refusé à la modération ne reste jamais « published ».** Juge pur
  `_shared/depot-lbc-jamais-en-ligne.js`, TROIS preuves ensemble (une seule ne suffit jamais) : (1) numéro jamais vu par un
  relevé depuis le dépôt ; (2) deux relevés COMPLETS commencés après dépôt + 2 h, le premier dans les 24 h ; (3) page lue
  absente par la veille (`sale_signal` « unavailable ») après dépôt + 2 h. ⛔ Mesuré : les relevés seuls donnaient des
  faux (3 dépôts de jocabroc8 jamais relevés mais EN LIGNE). Effet : une remise en vente repart (pending, numéro du dépôt
  refusé gardé dans `depots_refuses_lbc`, puis règle A — jamais de doublon) ; toute autre publication passe « failed »
  avec un message vrai et la publication est rendue (`refund_publish_unconfirmed`). handler-watch, une fois par heure
  (minutes 48-50 UTC), `JUGER_LBC_JAMAIS_EN_LIGNE` : candidats des 120 derniers jours, imports du relevé écartés DANS la
  requête, page de 200 tournante à l'heure, 50 clôtures au plus, compare-and-set sur « published » et le numéro.
  ⚠ Premier passage (v168, 12:48) : rien jugé d'utile — 171 imports remplissaient une page de 200 non ordonnée et les
  dépôts prouvés (30/09-05/10) étaient hors d'une fenêtre de 30 jours ; corrigé en v169 (12:57). Selftest
  `depot-lbc-jamais-en-ligne`. Simulation sur tout le parc (06/11 13:00) : 4 dépôts, ceux déjà relus en 410.
- **Couples « vrais » (une fiche, deux annonces vivantes du même article sur une plateforme)** : l'annonce de trop se
  retire par une tâche de retrait qui la vise par SON numéro et SON lien (comme `armer_retrait_annonce_pour`, qui
  n'arme que les fiches vendues) ; gardes en base au moment d'écrire : fiche en stock, un seul exemplaire, non fusionnée,
  annonce vivante sans transaction, annonce GARDÉE vivante, aucun retrait ouvert ; lecture « en vente » de la page juste
  avant, écrite sur la tâche (`lecture_avant_retrait`). Script `scripts/reparations/20261106_couples_vrais_retraits.mjs`.

## ⛔ 06/11 soir — RÈGLE A RETIRÉE (décision de Nico) ; série « une par une » pour rattraper une rafale ; règle B gardée
- **La règle A ci-dessus est RETIRÉE** (get-pending-jobs, `_shared/remise-en-vente-attente.js` et son selftest supprimés) :
  une remise en vente Leboncoin part tout de suite après la vente, comme en octobre (06/10 Bleu Ciel et Gris 8 min après
  la vente, 09/10 Noir et Blanc 1 min, 10/10 Rouge et Bleu Ciel 2 min — toutes parues alors que l'annonce vendue était
  encore visible). La retenir tant que l'annonce vendue est visible la bloquait sans fin : Leboncoin garde l'annonce
  vendue affichée même après la réception. Le refus du 06/11 au matin venait de la RAFALE (7 ventes d'Amiral découvertes
  d'un coup après une restriction d'accès, 7 dépôts presque identiques en 7 minutes) — cas exceptionnel.
- **Règle B gardée** : un dépôt Leboncoin refusé à la modération n'est jamais « published ».
- **Rattraper une rafale = une SÉRIE posée par réparation** (`_shared/serie-un-par-un.js`, marqueur
  `platform_fields.serie_un_par_un = { serie, rang, intervalle_min, le }`, jamais posé tout seul) : get-pending-jobs ne
  sert qu'UNE tâche de la série à la fois ; la suivante attend que toutes les précédentes soient « published » ET vues en
  ligne après leur dépôt (veille `vu_en_ligne_le`, ou relevé complet commencé après le dépôt qui la voit vivante), et
  `intervalle_min` depuis le dépôt précédent ; une tâche « failed »/« needs_user » ou un dépôt refusé noté après le début
  de la série (règle B) ARRÊTE tout ; une tâche annulée sort de la série. Dépôt pas encore vu 45 min après : UN relevé
  « Mes annonces » demandé (`serveur:verif_redepot`, lecture seule), au plus un toutes les 45 min. Lecture ratée = tâches
  de série tenues (jamais une rafale). Le blocage d'accès Leboncoin du compte reste au-dessus de tout.
  Selftest `serie-un-par-un`.
- Jamais de texte ni de photos modifiés pour passer le contrôle des doublons de Leboncoin.

## ⛔ 07/11 — Une annonce VENDUE ne compte jamais comme « en ligne » (Louis ; rapport `docs/enquetes/lot-0711/RAPPORT.md` § 1, 8)
- Leboncoin garde « active » une annonce vendue (transaction « pending » / « sold »). Aucune garde « l'article est en ligne
  sous une autre annonce » ne la compte : `annonce_prise_par_une_vente()` (transaction lue, vente enregistrée, job
  « sold », job publié `sale_signal 'sold'`), dans `trancher_publications_sans_lien`, `depot_jamais_en_ligne_refermer`,
  `article_en_ligne_ailleurs` (migration 20261107140000, feu vert requis). Une clôture faite à tort se rejuge seule
  (`depots_clos_sur_annonce_vendue_rejuger`, à chaque relevé, 14 jours). Jamais « rien n'est vendu » sur une remise en
  vente (SQL `phrase_rien_vendu`, app `utils/rienVenduSurVente.js`).
- « Ventes annulées » : une proposition « Remettre en vente » se ferme seule quand la fiche quitte le stock ou qu'une
  fiche JUMELLE PROUVÉE (photos dHash ≤ 4, même boutique, apparue après la vente, jamais en ligne ensemble, une seule
  candidate, née d'un relevé ; jamais un titre) est vendue ou en ligne ; même garde avant toute création ; bouton « Ne
  pas remettre en vente » (migration 20261107150000, feu vert requis). Le rattachement de la jumelle (double fiche) reste
  à corriger (proposition au rapport).

## ⛔ 07/11 soir — RÈGLE A RÉTABLIE (décision de Nico : option A, feu vert)
- Leboncoin : une remise en vente n'est SERVIE qu'une fois son annonce vendue IDENTIQUE disparue (relevée disparue,
  retirée, ou plus relevée en ligne) — get-pending-jobs, `_shared/remise-en-vente-attente.js`, AVANT la série « une par
  une » (rang par rang, chacun après la disparition de sa vendue). Preuve : 4 remises de Louis déposées vendue affichée,
  toutes désactivées (410), dont une sans aucune marque. Seul Leboncoin refuse un dépôt identique (Vinted, Beebs, Depop
  marquent la vendue ; eBay la clôt).
- Une remise déjà close (cancelled / failed) ou publiée jamais vue depuis 2 h, vendue encore affichée, dépôt jamais vu,
  aucune autre annonce non vendue de la fiche en ligne → remise en attente (dépôt refusé archivé dans
  `depots_desactives_regle_a`), 3 fois au plus, 14 jours : handler-watch, un passage par quart d'heure.

## ⛔ 07/11 nuit — Remise Leboncoin : l'état de l'annonce vendue décide, ça se voit, et la vente close se retire (Louis ; rapport `docs/enquetes/louis-remises-lbc-0711/RAPPORT.md`)
- **Preuve (07/11)** : le 3e de Louis (vendue 3297440551 supprimée par lui) part dès qu'il sort de la série — 3304491516
  en ligne et achetable à 22:21 ; les 4 dépôts faits vendue affichée ont tous été désactivés (410). Leboncoin garde une
  vendue affichée des mois (111 « sold » vues vivantes en 3 jours, 48 publiées il y a plus de deux mois).
- **États de l'annonce vendue** (`_shared/remise-en-vente-attente.js`, `etatAnnonceVendue`, get-pending-jobs) : hors ligne
  / inconnue → servie tout de suite ; vente en cours (`pending`), vendue affichée (`sold`), à relire → retenue avec la
  raison écrite sur la tâche (`attente_annonce_vendue`, seulement quand elle change) ; affichée SANS transaction lue après
  la remise → l'article est toujours en vente : remise close « cancelled », message vrai, jamais déposée.
- **Visible et bornée** (`_shared/etat-job.js`, `src/utils/fileDesJobs.js`) : « En pause » avec la raison et le numéro ;
  après 48 h (`BORNE_ATTENTE_VENDUE_MS`) « À toi de jouer : supprime-la sur Leboncoin » (jamais pour « à relire »).
- **Relevés réguliers** : un compte dont une remise est retenue reçoit un relevé « Mes annonces » au plus toutes les
  60 min (`serveur:verif_redepot`, lecture seule, jamais s'il y en a un en file).
- **Série « une par une »** (`_shared/serie-un-par-un.js`) : un dépôt à la fois sur ce qui est RÉELLEMENT parti (en cours,
  ou déposé et pas encore vu) ; une tâche qui attend est SAUTÉE ; l'intervalle court depuis le dernier dépôt de la série ;
  `needs_user` n'arrête la série que sur un refus de la plateforme.
- **Vente close → FillSell retire l'annonce vendue → la remise part** (`decisionRetraitVendueClose`, handler-watch,
  interrupteur `RETIRER_VENDUES_CLOSES` — COUPÉ jusqu'au feu vert nommé de Nico) : transaction `sold` lue depuis 24 h au
  plus, annonce de la remise seulement, un retrait par annonce, 20 par passage ; ⛔ jamais pendant un achat en cours.
  Fait à la main pour Louis le 07/11 au soir sur feu vert nommé (4 annonces, une par une, page relue avant et après :
  `scripts/reparations/20261107_louis_retraits_vendues_closes.mjs`).
- Centre d'aide officiel de Leboncoin (lu le 07/11) : vendeur particulier — annulation automatique seulement sur
  disponibilité non confirmée (3 j) ou envoi non confirmé (72 h) ; paiement débloqué à la validation (acheteur, ou d'office
  sous 30 j) ; supprimer une annonce supprime ses options ; toute annonce est supprimée d'office au bout de deux mois.
  Vendeur Pro : rétractation de 14 jours après réception avant le paiement.
