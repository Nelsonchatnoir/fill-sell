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
