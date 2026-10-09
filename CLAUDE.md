## État de production au 08/10 — lire avant toute action

`docs/agents/etat-2026-10-01.md` (versions, crons, ce qui est ouvert ; sections
« 03/10 nuit — clôture Louis + marque + prix » et « 04/10 matin —
complément », « 04/10 fin de matinée — chantier Louis », « 04/10 soir —
incident CPU », « 04/10 nuit — six défauts clients » et « 05/10 — lot
terminal Problèmes » / « 05/10 après-midi » / « 06/10 » / « 06/10 soir » / « 06/10 nuit » / « 08/10 nuit — MULTI-SYNCHRO » / « 08/10 matin — boucles » / « 08/10 fin de matinée — SUJET CLOS » / « 08/10 après-midi — complément » / « 08/10 soir — fin du chantier multi-synchro » / « 08/10 nuit — Bebertdeals : remise en ligne Vinted » / « 08/10 nuit — VENTES PROUVÉES » / « 09/10 nuit — DEPOP » / « 09/10 fin de matinée — DEPOP : reprise complète » en fin ; reprises : `docs/reprise/terminal-depop-0910.md`, `docs/reprise/terminal-ventes-prouvees-0810.md`, `docs/reprise/terminal-bebertdeals-0810.md`, `docs/reprise/terminal-boucles-0810.md`, `docs/reprise/terminal-cloture-multi-synchro-0810.md`, `docs/reprise/terminal-complement-0810.md`, `docs/reprise/terminal-fin-multi-synchro-0810.md`) et
`docs/agents/consignes-2026-09-28.md` (règles), qui remplacent tout historique
contraire. Il se périme : `functions list`, `cron.job` et
`profiles.extension_build` font foi.

- **⛔ DEPOP POUR LE SEUL COMPTE DE NICO (09/10 nuit)** : base (mig 20261009020000,
  garde `depop_autorise` : drapeau `depop_ouvert` RESTÉ À 0 ou `beta_flags.depop` —
  Nico seul), moteur commun corrigé (9eab08f : « EUR » ≡ « EU », « Comme neuf » = très
  bon), serveur (gpj v224 : un job Depop ne va QU'au poste qui déclare `depop_acces`),
  extension **0.6.105** (hôte www.depop.com OPTIONNEL, « Autoriser Depop » ; zip
  `build/CWS-0.6.105-A-TELEVERSER/`), app (Depop « à venir », ouverte par
  `rpc depop_autorise`, fail-closed). ⛔ Toute liste de plateformes nomme Depop ou
  dit pourquoi (`selftest:depop-partout`) ; jamais de rayon Depop par libellé ;
  l'annonce « Scotch » 945704866 est CELLE DE NICO. Reprise :
  `docs/reprise/terminal-depop-0910.md` ; contrats réels : `docs/plateformes/depop/CARTOGRAPHIE.md` § 8.
  **09/10 fin de matinée** : `rapprochement` **v17** — l'identifiant d'un dépôt FillSell est
  rattaché AVANT le moteur v3 (prouvé en réel, motif `identifiant_avant_moteur`) ; mig
  **20261009100000 APPLIQUÉE** ; fiche en double 1791529881380 RÉPARÉE (inverse complet) ;
  mig **20261009110000 APPLIQUÉE** (GO nommé : sept déclencheurs retrait/relevé ouverts à
  Depop) ; get-pending-jobs **v227** (réponse « annonce partagée » tranchée = sortie de `choix`) ;
  **parcours réel VERT** (relevé, republication, retrait, croisé ; FIN relue : plus aucune
  annonce de test chez Depop, « Scotch » intacte) ; extension `02f9f67` (lecture Depop « réseau »
  reprise) prouvée en page, JAMAIS chargée, HORS du zip 0.6.105 (inchangé) ; **OTA 2.9.68 NON
  lancée** (dossier partagé sale + commits non poussés d'un autre terminal) ; push : Nico.
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
- **⛔ MULTI-SYNCHRO (08/10 nuit, règle de Nico du 07/10)** : un appui sur
  « Synchroniser » relève TOUTES les plateformes, le stock arrive DÉJÀ fusionné ;
  moteur v3 `_shared/rapprochement/` (jamais la photo seule, jamais le titre
  seul, jamais deux annonces d'une même plateforme — sauf la remise en ligne
  Vinted, ci-dessous ; « Annonce en double ? »
  hors du stock ; décisions de la personne définitives) ; fonction
  `rapprochement` (v15 au 08/10 nuit) : les empreintes manquantes partent PAR LA BASE
  (`rapprochement_v3_empreinter`, pg_net) et ne sont JAMAIS attendues dans la
  fonction — un fetch edge → edge est limité à 60/min, et le worker pg_net ne
  sert rien tant que la requête appelante n'a pas répondu (une fonction
  appelée par cron/trigger/script reste COURTE) ; `docs/multi-synchro.md`,
  reprise `docs/reprise/terminal-multi-synchro-0810.md`. Extension 0.6.104 :
  un onglet de travail n'est rendu qu'avec un content script qui répond, PARTOUT
  (`getOrCreateWorkTab`, la 0.6.103 jamais téléversée ne le faisait qu'à 2 endroits).
- **⛔ AUCUNE FICHE NE NAÎT D'UN RELEVÉ SANS DÉCISION v3 (08/10 après-midi)** :
  une fiche `releve_*` ne sort que de `rapprocher_importer` (moteur v3 ou la
  personne) — garde en base `inventaire_releve_par_decision` ; les imports du
  moteur portent `regle: rapprochement_v3` (504 d'avant tracés,
  `_backup_0810_regle_v3`) ; les fiches du dressing Vinted nées depuis la
  dernière passe sont jugées contre les imports au stock (`vinted_a_juger`,
  `rapprochement_comptes.vinted_juge_le`, 200 par passe). Migration
  **20261008130000 APPLIQUÉE** (08/10 11:18 UTC, feu vert nommé).
  Selftest `selftest:aucune-fiche-sans-v3` (`--prod` : la base).
- **⛔ FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED (08/10 soir, Nico)** : même
  règle que les imports — photo ET titre sans concurrent → la fiche Vinted se
  fond dans la fiche de la PERSONNE (gardée, l'identité Vinted la suit) ; doute
  → UNE question par fiche jugée, fiche Vinted hors du stock si non touchée ;
  jamais la photo seule ni le titre seul ; refus / fusion défaite définitifs
  (`_shared/rapprochement/fiches-main.js`, `rapprochement` v14 inerte sans la
  migration). Migration **20261008150000 APPLIQUÉE** (08/10 ~12:50 UTC, feu vert
  nommé ; corrige aussi la garde de boutique : 0 fusion déplaçant l'identité
  Vinted du 28/09 au 08/10, à la main comme par le moteur) ; rattrapage FAIT
  (9 fusions vérifiées sur photo, 80 questions, 0 fiche cachée ;
  `_backup_0810_fiches_main_*`). Selftest `selftest:fiche-main-vinted`.
- **⛔ REMISE EN LIGNE VINTED (08/10 nuit, Bebertdeals)** : une annonce Vinted
  SUPPRIMÉE puis republiée par la personne (nouvel identifiant) faisait une
  fiche neuve ; la fiche d'origine (copies, prix d'achat) restait en stock sur
  une annonce morte (1 025 fiches pour 403 articles ; copies Leboncoin
  d'articles déjà vendus ; « Plus en ligne — Vendue ? » posée sur l'annonce
  morte). `_shared/rapprochement/remises-en-ligne.js` : jamais en ligne
  ensemble + mêmes photos (≥ 2 à ≤ 4) + titre en accord fort, aucun conflit ni
  rival → la nouvelle se fond dans la PLUS ANCIENNE ; doute → question.
  Vente Vinted sans preuve « sold » sur une annonce remplacée : refusée
  (`enregistrer_vente_atomique`). Migration **20261008160000 NON APPLIQUÉE**
  (feu vert) ; drapeaux coin_config `rapprochement_remise_en_ligne` /
  `vente_garde_remise_en_ligne` posés à 0 ; rattrapage
  `scripts/reparations/20261008_remises_en_ligne_vinted.mjs`. Enquête
  `docs/enquetes/bebertdeals-0810/RAPPORT.md`. Selftest `selftest:remise-en-ligne-vinted`.
- **⛔ UNE REPUBLICATION DONT LA SUPPRESSION EST PARTIE VA AU BOUT (08/10, Louis)** :
  créneau fermé, plafond ou pause n'y changent rien (`retraitEngage`,
  `_shared/retenue-creneau.js`, `get-pending-jobs` v223) ; la remise en ligne
  n'a lieu que sur PREUVE de la suppression (extension). Migration
  **20261008140000 APPLIQUÉE** (08/10 11:20 UTC) : le balayage ne lance plus une
  republication qui ne peut pas finir dans le créneau (`republish_duree_estimee`).
  Extension **0.6.104** (BUILD_ID `2026-10-08T14:53:27Z+0cec9e6`, chargée chez
  Nico) : zip LIVRÉ (`build/CWS-0.6.104-A-TELEVERSER/` ; preuve de republication
  Beebs levée par Nico — option d, l'échec venait de la modération Beebs) ; un retrait Beebs ne se clôt plus « déjà retirée » pendant la modération
  (annonce jamais vue en ligne, dépôt < 72 h) ; handler-watch v94 relance une
  fois les tâches « sans démarrage » quand le poste a la 0.6.104 : preuve Beebs relue ~6 min par le background,
  aucun essai consommé sans preuve, relevé Beebs par le flux quand « Mes
  annonces » est peinte vide (`selftest:beebs-preuve-relue`).
  Selftest `selftest:republication-va-au-bout`.
- **⛔ BOUCLES (08/10 matin)** : une même décision ne s'écrit jamais en boucle
  (Nadège : 8 954 lignes, moteur v2 + job SANS article) ; `rapprochement` v12
  compte les passes qui n'écrivent rien (`rapprochement_comptes.passages`, en
  négatif) et s'arrête à 3 (ops-digest) ; un relevé automatique (veilleur,
  cron) a une cadence plancher par compte et plateforme ; une synchro ne vide
  jamais une marque. Migrations 20261008100000 / 101000 (RÉVISÉE : le veilleur
  vise la cause, aucun plancher) / 102000 APPLIQUÉES. Aucun quota sur l'import.
- **⛔ VINTED : LA FICHE ET LE SIGNAL SUIVENT L'ANNONCE EN LIGNE (08/10, Louis)** :
  la synchro du dressing de l'extension collait la vente d'une ancienne annonce
  au job de la neuve et faisait reculer la fiche → « 🎉 Vendue » sur une annonce
  en ligne, vente et remise en double. Migrations 20261008110000 / 111000 /
  112000 : démenti par le dressing, recul seulement sur preuve, vente refusée sur
  une annonce en ligne ou remplacée, remise retenue, note de vente ignorée.
- **Servi** : extension **0.6.104 `0cec9e6` SERVIE** par le CWS (23 comptes le 09/10
  vers 01:00 ; zip rangé dans `build/anciens-zips/`, ajoutée à ALREADY_PUBLISHED) ;
  **0.6.105 (Depop) À TÉLÉVERSER** : `build/CWS-0.6.105-A-TELEVERSER/` (zip seul,
  BUILD_ID 2026-10-08T23:39:13Z+8f88cdd) ; 0.6.102 servie avant (b230ebe) ;
  **0.6.103 JAMAIS téléversée** ; jamais
  d'EXTENSION_MIN_BUILD sans décision de Nico ; **minimum serveur 0.6.81** (inchangé : forcer la MAJ = décision de
  Nico) ; web **2.9.67** (poussé le 08/10), OTA **2.9.67 servie** (08/10
  10:50, build 9d203ac) ; `get-pending-jobs` v229 (09/10, port + interdits Depop), `photo-empreinte` v3,
  `generate-listing` v113, `lens-analysis` v107, `avis-demande` v4,
  `deal-analysis` v42, `voice-transcribe` v46,
  `ebay-account` v16, `send-extension-link` v13 (`true`) ;
  `rapprochement` v17, `empreintes-urls` v5, `update-job-status` v132, `handler-watch` v95, `push-ventes` v9, `voice-intent` v155, `ops-digest` v35,
  `ebay-api-worker` v79, `ebay-releve-api` v4, `releve-completer` v2,
  `veille-cpu` v2, `ebay-ventes-sync` v5, `ebay-oauth-callback` v10, `ebay-notifications` v5,
  `email-tunnel` v72 et `stripe-webhook` v57 (`false`) ; migrations
  20261008020000 / 030000 / 040000 (multi-synchro) appliquées — ⚠️ depuis le 05/10 15:55,
  `invoice.payment_failed` / `payment_action_required` sont COCHÉS chez Stripe : le
  mail « paiement échoué » part au client, TOUTES formules ; migrations Cloud
  20261004233000 + 20261005120000 appliquées (reprise : `docs/cloud/REPRISE.md` § 0 bis). ⚠️ Le 30/09 22:52, le changement de `CRON_SECRET` a monté TOUTES
  les versions d'un cran sans changer le code.
- **Notifications push à chaque vente (06/10, binaire 2.9.62 / vc33)** : base
  appliquée (mig 20261006140000 + 150000, cron 34 `push-ventes-1min`),
  `push-ventes` v7 et `check-listing-status` v36 (`false`) ; le push reste
  inerte sans téléphone (la note, elle, porte aussi le MAIL de vente). Clés et binaires : `npm run
  binaires:2.9.62` (fichiers dans Téléchargements, `docs/push/CLES-NICO.md`) ;
  ⛔ jamais d'AAB sans `google-services.json`. Tout appel natif passe par
  `pushDisponible()` (binaires < 2.9.62 : rien). État : fin de
  `etat-2026-10-01.md` (« 06/10 après-midi »).
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
- **⛔ UNE REPUBLICATION NE BUTE JAMAIS SUR UNE VALEUR QUE SON ANNONCE PORTE
  (06/10 soir, dbz70)** : « EU N » ≡ « N » (jamais UK/US/IT/DE) — régression
  ca63277 (0.6.90) ; une valeur servie par le serveur n'atteint le formulaire
  qu'à une (re)capture (handler-watch recapture une fois) ; un remplissage
  lent mais vivant n'est jamais coupé (port de remplissage allumé pour un
  compte coupé à 5 min) ; une marque d'origine se reconnaît par son id.
- **⛔ UN ÉCHEC QU'UNE EXTENSION CORRIGE REPART SEUL DÈS QUE LE POSTE L'A (06/10
  soir, Glowik)** : `_shared/relance-apres-maj.js` (une entrée par défaut :
  plateforme, action, début d'`error_technique.brut`, BUILD_ID qui corrige) ;
  handler-watch v89 relance UNE fois (geste « Relancer », marqueur
  `relance_apres_maj`) quand `profiles.extension_build` atteint ce build. Toute
  nouvelle extension qui corrige un arrêt « relancer » y ajoute son entrée.
- **⛔ Gratuit = 50 republications PAR MOIS** (05/10 soir, Nico ; plus « à vie ») :
  coin_config `quota_republication_free`, même cycle que `quota_annonces_free`
  (`debut_cycle_quotas` → `coin_wallets.next_grant_at`), compteur unique
  `quota_republication_free_etat` (exécutées + en file), mig 20261005173000.
- **05/10** : sessions de l'extension refusées depuis le 04/10 19:01 (403
  `_ts_ou_null`) → corrigé (mig 20261005090000) ; **remise en vente après
  une vente partielle** (file `remises_en_vente`, mig 20261005100000 ;
  cron 31 `remises-en-vente-5min` actif, GO de Nico) ; **eBay : la voie
  d'une annonce = sa création** (mig 20261005140000 ; un import n'est jamais
  « api ») ; **ORDER_CONFIRMATION** (`ebay-notifications`, 66 abonnés) ;
  **veille des commandes** Vinted/LBC (0.6.98, `veille_commandes_ouverte`) ;
  retrait bloqué par une connexion = « À régler », jamais soldé ; **palier unique**
  (`_shared/palier.js`, `palier_de`) ; Leboncoin VERROUILLE Courrier
  suivi et Colissimo au-delà de 400 € (tout essai à 999 € les montre).
- **⛔ Incident CPU 99 % (04/10, 12:22 et 17:40)** : compute Micro → Small
  (Nico) ; crons **27** (`*/10`) et **28** (`7-59/15`) relancés le soir sous
  mesure ; règle « tâche automatique mesurée, bornée » plus bas ; alerte
  `veille-cpu` (cron 29). Cron 30 (photos eBay, 663 fiches) fini et retiré.
- **Défauts clients (04/10 nuit)** : une vente supprimée par la personne ne
  revient plus au relevé (`ventes_supprimees`, mig 20261004220000) ;
  l'absence de marque part en « Sans marque » sans question
  (`_shared/marque-absente.js`, liste FERMÉE, jamais une vraie marque) et la
  marque du catalogue choisie est retenue (`platform_settings.vinted.
  marques_retenues`) ; le texte qui part est celui de la FICHE au moment de
  l'envoi (`src/publication/texteDeLaFiche.js`) ; ⛔ aucun format de colis
  deviné (seul `format_colis_source: 'manuel'` part ; poids de la fiche et
  transporteurs retenus `platform_settings.leboncoin.transporteurs` posés au
  service ; lot : sans poids, LBC/Beebs « à compléter ») ; prix/quantité des
  fiches modifiables en lot — les annonces en ligne ne suivent pas.
- **Retraits (04/10)** : jamais arrêtés sur un raté technique ni sur
  `/main/banned` (reprise 1 h, 3 h, 6 h jusqu'à la preuve) ; un retrait Vinted
  dont le numéro manque aux deux derniers relevés complets de sa boutique est
  clos « déjà retirée » (gpj) ; ⛔ une annonce Vinted « en vérification » PEUT
  être achetée (buste de Nico, 04/10) : essai toutes les 20 min, le texte le dit.
- **Boucles (04/10)** : 3ᵉ onglet muet / 4ᵉ canal coupé de suite →
  needs_user « relancer », `boucle_technique` en rouge dans l'ops-digest.
- **Cadence (04/10)** : plafond Premium **50**/jour ; tout changement de
  `coin_config` est daté et journalisé (`coin_config_journal`).
- **Relevés et fiches (04/10, Louis)** : champs VIDES complétés depuis
  l'annonce (journal `inventaire_journal`) ; prix/poids suivis quand la
  plateforme change et que la fiche y était alignée, jamais propagés ;
  ⛔ jamais de poids lu sur l'estimation Leboncoin ; un seul champ
  `inventaire.poids_g` ; eBay relié = relevé par l'API (`ebay-releve-api`).
- **Le dossier de l'extension de Nico se LIT dans Chrome** (03/10) :
  `Default/Secure Preferences`, `extensions.settings.pedhgegmgjkdcbdeinjnhdpemnpafpdp.path`
  (location 4 = non empaquetée) ; on copie le build DANS ce dossier, puis on
  relit `profiles.extension_build` après son « Recharger ».
- ⛔ **WebFetch n'est jamais une preuve de l'état d'une annonce Vinted** : il
  voit « Enlevé ! » sur des annonces en ligne (03/10). Seule la page vue dans
  le Chrome de la personne (ou un relevé) fait foi.
- **Relevés (03/10)** : 5 min sans progression = arrêt par handler-watch
  (`vinted_sync_runs.progres_le`, posé par la base ; « annonces » : la dernière
  ligne écrite compte ; liste encore en lecture : 10 min) ; le veilleur
  s'espace après un échec (1 h, 3 h, 6 h) — migration 20261003150000.
- **Marque (03/10 nuit)** : une réponse partagée atteint TOUTE plateforme qu'elle
  nomme (`moteur/reponsesPartagees.js`) ; la marque de la fiche n'est jamais
  redemandée ; ⛔ Vinted ne crée PLUS de marque libre (03/10) : marque exacte
  du catalogue, sinon une QUESTION, jamais « Sans marque » en silence.
  ⛔ Annonce de test : 999 € ou plus, jamais le tableau de Nico. **Republication** : âge et prix repris de L'annonce en ligne.
  Question « Marque » hors catalogue (`src/annonces/QuestionMarque.jsx`) : le
  pourquoi, « Sans marque » en un tap, recherche dans le catalogue Vinted
  (commande `CHERCHER_MARQUE`, 0.6.94) ; « Sans marque » jamais écrit sur la
  fiche. **Republication (0.6.94)** : l'annonce est RELUE avant tout retrait
  (`champs_lus_sur_l_annonce.lus`), la taille affichée l'emporte sur la copie
  (gpj v205). Exception de créneau : `creneau_exception` bornée, posée par
  réparation sur décision de Nico seulement.
- **Selftests** : 151 dans package.json + 37 scripts non câblés, 0 rouge (04/10). Morceaux 0.6.76/0.6.78 mis de côté le 28/09 :
  `scripts/lib/morceaux-mis-de-cote.mjs` (un morceau ne revient qu'avec sa
  preuve réelle — son test tombe sinon).
- **Sortie d'Opla (Nico)** : BASCULE LE 10/10 à 00:00 Paris, interrupteur
  coin_config `opla_sortie_le` (0 = désactivée) ; avant, Opla comme avant ;
  après, plus aucune publication ni republication Opla, synchro gardée pour
  les comptes reliés (`_shared/opla-sortie.js`). **Même instant : Depop pour tous**
  (mig 20261009230000 : `depop_autorise` lit `opla_sortie_le` ; republication
  auto Depop ouverte) ; l'app ne la montre qu'à une extension ≥ 0.6.106
  (`src/utils/basculeOplaDepop.js`), le site bascule seul (`src/utils/siteAvecDepop.js`).
- **⛔ FRAIS DE PORT DEPOP (09/10 soir, Nico : zéro friction)** : en France Depop
  ne fournit aucune étiquette, le vendeur fixe le port (0 à 99,99 €) — jamais
  deviné. Prix par défaut dans Réglages › Expédition
  (`platform_settings.depop.frais_port_defaut`, fusion seulement) ; le stepper
  et le lot le pré-remplissent et le DEMANDENT avant l'envoi (lot : une fois) ;
  feuille « Envoi suivi en France » (tarifs officiels Colissimo 01/04/2026 et
  Mondial Relay 15/06/2026, `src/utils/envoiSuiviFrance.js`, à revoir au
  01/01/2027) ; gpj **v228** pose le défaut sur tout job Depop sans port, sinon
  une republication (annonce importée) passe en needs_user AVEC le champ, avant
  tout retrait (`_shared/port-depop.js`). Selftest `selftest:port-depop`.
- **⛔ CATÉGORIES INTERDITES PAR DEPOP (09/10 soir, Nico)** : UNE table,
  `_shared/depop-interdits.js` (icône de `detectObjectIcon` → règle + citation
  officielle, centre d'aide en-gb lu le 09/10 : électrique/électronique —
  « Items that use electrical power (including batteries and solar power) are
  not allowed » —, puériculture). Appareils photo et montres classiques
  autorisés ; aucune catégorie de mode bloquée (sauf ⏱️ montres connectées,
  nommées par Depop) ; ambigus NON bloqués (`DEPOP_A_VERIFIER` : jeux en
  disque, DVD, horloges…). App : case Depop grisée avec la phrase ; lot :
  exclus de Depop seulement, comptés avant l'envoi (`lot/ExclusDepop.jsx`) ;
  gpj **v229** : filet sur tout job Depop qui dépose → needs_user, jamais servi.
  Selftest `selftest:depop-interdits`.
- **⛔ `platform_settings`** (02/10) : jamais d'update/PATCH de l'objet entier,
  toujours `rpc platform_settings_fusionner` ; la garde en base refuse le reste.
- **Ventes (02/10 soir)** : `ventes.annonce_id` = la preuve (numéro d'annonce) ;
  la même cession se FUSIONNE dans la vente saisie (la saisie prime), jamais
  deux ventes, jamais sur le titre (migration 20261002210000).
- **Crons coupés** : 17 `doublons-balayage-2min`, 22 `fusion-photo-lot-10min`
  (27 et 28 actifs, relancés bornés le 04/10 au soir).
- **Migrations** : jamais à la main. `db query --linked -f <fichier>` PUIS
  `migration repair --linked --status applied <version>`, relecture.
- **Données** : toute correction = requête dans `scripts/reparations/`
  (`git add -f`, `*.sql` est ignoré), sauvegarde avant, inverse prêt.
- **Publication en lot (03/10)** : livrée ; `docs/publication-en-lot.md` ;
  migration 20261003010000 (un arrêt ne repart jamais) appliquée.
- **Ouvert** : binaires **2.9.38** (AAB
  `build/AAB-A-TELEVERSER-2.9.38-vc32/`, iOS par Codemagic) ; ornellaracano
  307204072564, jocabroc8, carhoa : cf. l'état du 01/10 ; livre eBay de
  geronimo0550 (« Faire une offre » activé, non touché) et le reste : fin de
  l'état (« 03/10 soir — clôture »).

# FillSell — Instructions Claude

> **Jumeau de `AGENTS.md`** (lu par Codex), qui reprend toutes les règles
> ci-dessous + architecture, état des chantiers et glossaire (`supabase/AGENTS.md`,
> `src/AGENTS.md`, `docs/agents/*.md`). Une règle ajoutée ici se reporte là-bas,
> le même jour. ⚠️ Codex ne lit que ~32 Ko d'`AGENTS.md` : garder la racine
> sous cette taille, le détail va dans `docs/agents/`. Jamais d'`AGENTS.md` ni
> d'autre fichier annexe dans `chrome-extension/` : tout commit dans ce
> dossier impose de recaler `EXTENSION_LAST_COMMIT`, sinon `npm run build` échoue.

## ⛔ `supabase db push` est INTERDIT

Tant que la baseline n'est pas refaite, **ne jamais lancer `supabase db push`**
sur ce projet.

Les historiques de migrations divergent (audit du 26/09) : les 35 versions
distantes sans fichier ont été CAPTURÉES dans le dépôt, mais ~118 fichiers
locaux n'ont aucune trace dans l'historique distant (appliqués hors historique,
ou jamais appliqués). Un push rejouerait des migrations **non idempotentes**,
dont :
- un `cron.schedule('handler-watch-3min')` → job planifié **en double** ;
- un revert de grants → **soldes utilisateurs modifiés**.

Les migrations s'appliquent **une par une**, après vérification de leur effet
réel en prod. Interdits également tant que ce bandeau est là : `db reset`,
`db remote commit`.

⛔ **AVANT de réécrire une fonction SQL : partir de la définition EN PROD**
(`pg_get_functiondef`), jamais du dernier fichier du dépôt. Le 26/09, 22
fonctions tournaient dans une version qu'aucun fichier ne portait (correctifs
appliqués en direct, migrations « patch » par remplacement de texte). Elles
sont capturées dans `20260926235900_depot_suit_la_prod_capture_2609.sql` —
mais tout correctif appliqué en direct depuis recrée l'écart.

## Dossier de travail — UN SEUL, sans exception

- Le SEUL dossier de travail est `C:\Users\nicol\fill-and-sell\`. Il n'en
  existe pas d'autre : l'ancien worktree
  `C:\Users\nicol\fill-and-sell-chrome-extension\` a été SUPPRIMÉ le
  26/07/2026 (il a coûté une matinée : zip CWS du 24/07 parti sans le fix
  Beebs, deux extensions actives se disputant les jobs). Si un rapport, une
  mémoire ou un commentaire de code y fait encore référence, il est périmé —
  ne JAMAIS y rediriger Nico, ne jamais le recréer.
- Le build de l'extension est produit dans `build\extension\`.
  Le poste Nico charge la copie stable autorisée dans
  `C:\Users\nicol\FillSell-Extension-Nico` (Fable, 28/09).
- UNE SEULE extension FillSell active dans Chrome à la fois — jamais la
  version Web Store ET une unpacked ensemble : elles pollent les mêmes jobs,
  se les disputent, et `handler_build` en base ment sur qui a traité quoi.
  Avant un test unpacked : désactiver/retirer la version Web Store.
- Un push sur main ne déploie PAS l'extension. Le déploiement, c'est :
  `npm run package:extension` (qui refuse tout paquet non traçable), puis
  téléverser `build\fillsell-extension-<version>-cws.zip` sur la fiche
  Chrome Web Store, ET cliquer « Envoyer pour examen ». Tant que ces trois
  gestes ne sont pas faits, les utilisateurs tournent sur l'ancien code —
  vérifiable par `profiles.extension_build` / `cross_post_jobs.handler_build`.
- ⛔ **Jamais d'OTA envoyée depuis un worktree** (04/10) : `npx @capgo/cli
  bundle upload` part du dossier principal SEULEMENT. Capgo hache octet par
  octet les sources natives des plugins dans `node_modules` : dans un
  worktree Windows (`core.autocrlf`), `patch-package` avait écrit des lignes
  CRLF dans `@capgo/native-purchases` — même version, même code — et l'OTA
  2.9.46 a déclenché une fausse alerte « native changes ». `.gitattributes`
  force désormais `patches/*.patch` en LF. Une alerte Capgo se vérifie dans
  `app_versions.native_packages` avant tout retour en arrière
  (`docs/agents/pieges.md`, Déploiement).

## ⛔ RÈGLES DÉFINITIVES DU 27/09 SOIR (synchronisation) — jumelles d'AGENTS.md § 4

- **Un titre n'est JAMAIS une preuve d'identité** : ni pour rattacher une
  annonce, ni pour fusionner des fiches automatiquement, ni pour retirer. Le
  doute devient la question « Est-ce le même article ? » / « Déjà vendu ? ».
  (Louis duplique ses articles sur Beebs — mêmes titres, articles différents :
  deux annonces à vendre retirées à tort le 27/09.)
- **Deux annonces sur la même plateforme sont deux exemplaires.** Une vente ne
  retire que les copies de CET exemplaire sur les AUTRES plateformes, liées
  par une preuve (`retrait_job_prouve` : dépôt FillSell, identifiant, import,
  geste de la personne ; jamais une fusion automatique, SAUF par photo
  identique — 06/10). Une copie encore en ligne non prouvée devient la
  question « Déjà vendu ? » (`inventaire_doublons.motif = 'copie_non_prouvee'`,
  une par copie) : « Oui, la retirer » arme le retrait par
  `armer_retrait_job_pour`, « Non » n'est jamais reposé (06/10, Nico).
- **Aucun verdict sur un relevé incomplet** (refusée, disparue, vendue) ; un
  relevé incomplet est repris seul.
- **Un champ manquant se demande** (choix fermés en français), il ne se
  relance jamais en boucle.
- ⛔ **L'annonce d'une AUTRE fiche n'est jamais un « déjà en ligne »** (09/10
  soir, Louis) : ni à la publication, ni à la remise en vente ; la ressemblance
  ne retient jamais une fiche à plusieurs exemplaires ; aucun refus ne renvoie
  à une question introuvable (garde `jumeau_en_ligne` retirée, mig
  20261009233000, `selftest:annonce-autre-fiche-jamais-jumeau`).
- **Un rayon introuvable se DEMANDE, il ne grise jamais une plateforme**
  (03/10, Nico, cas Louis « adaptateurs Seb » grisé sur Beebs) : seul un
  interdit écrit de la plateforme (`prohibited`) grise la case, avec sa
  raison ; « notre résolution n'a rien trouvé » = la question « rayon à
  choisir » (porte : `publication/plateformes.js` `categorieFermee` ; question :
  fin de `resolutionPublication`), au stepper comme au lot.
- **Republier une annonce importée est normal** ; « import ≠ publication » ne
  concerne que le comptage (quotas, statistiques).
- **Un relevé tient en 5 minutes** (03/10, Nico) : un relevé qui ne progresse
  plus rend la place aux autres relevés et aux jobs ; un relevé lent qui
  AVANCE n'est jamais coupé ; un arrêt ne conclut JAMAIS rien (ni vendu, ni
  disparu, ni effacé) et laisse sa raison dans les journaux, jamais à l'écran.

## ⛔ RATTACHEMENT AVANT STOCK (07/10, Nico)

« Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché de
tout ce que l'utilisateur a déjà. » Cas Corinne (07/10 : 449 → 551 articles
pour ~350 réels). Détail, mesures, rattrapage : `docs/rattachement-avant-stock.md`.
- une annonce relevée (Leboncoin, Beebs, eBay, Opla) est classée par le
  MOTEUR SERVEUR (`rapprochement_avancer`, fonction edge `rapprochement`,
  `verify_jwt = false` + `x-cron-secret`), jamais dans l'extension :
  identifiant FillSell ou même photo qu'UN seul article d'une autre
  plateforme → rattachée ; tout autre candidat (titre, homonyme, faisceau,
  photo ambiguë) → PROPOSITION HORS du stock (écran de rattachement,
  « Annonces à vérifier » dans À régler) ; aucun candidat → créée, une fois
  TOUTES les annonces du compte classées (regroupement photo entre
  plateformes) ;
- il attend la fin de TOUS les relevés du compte (Vinted d'abord) ; un relevé
  qui finit ou s'arrête le réveille (`trg_rapprochement_fin_run`) ; filet :
  cron `rapprochement-1min` (ne part que s'il y a un compte en retard) ; il va
  au bout sans nouveau geste ;
- remplace « on crée, et on demande » (27/09) : plus jamais deux articles côte
  à côte pour un doute. Veto « type d'objet » (`titre_types_objet`) ;
- `pause_releves` (07/10) : pause d'un compte par plateforme ; listée dans
  l'ops-digest (rouge au-delà de 24 h) — jamais oubliée.

## ⛔ UN RELEVÉ D'IMPORT NE PART QUE SUR « SYNCHRONISER » (05/10, Nico)

Cas Marine (inscrite 18:28, partie 19:13 ; `docs/enquetes/marine-0510/RAPPORT.md`) :
trois relevés et deux reprises lancés tout seuls, aucun Vinted abouti, un faux
« le défaut est chez nous ». Désormais :
- relevé d'import = **geste** (`bouton`, `bouton_distant`, `app`, et leur
  `:redemande`) ; plus de premier relevé serveur ni de reprise automatique
  (extension 0.6.99 `REPRISE_AUTOMATIQUE_RELEVE = false`, handler-watch
  `RELANCE_AUTOMATIQUE_RELEVE = false`, garde `garde_releve_sans_geste`) ;
- la **veille** gardée pour les ventes et les retraits (`cron`, `veilleur`,
  `serveur:retrait_*`, `serveur:verif_redepot`, `serveur:quotidien_api`)
  n'importe RIEN et ne s'affiche jamais dans l'app ;
- le relevé est pris **au démarrage, sous le verrou**, le service worker reste
  éveillé, chaque requête est bornée ;
- chaque fin se dit par sa **situation** (`situationFinReleve`), jamais par le
  texte brut ; « Connecte-toi à X sur ton ordinateur » quand c'est ça ;
- ⛔ **un refus de « Synchroniser » n'est JAMAIS un cul-de-sac** (06/10, Nico ;
  cas nerema75, 75 appuis refusés en silence) : chaque refus mène au geste qui
  débloque. « Boutique à confirmer » ouvre `src/stock/ConfirmationBoutique.jsx`
  (« Ajouter @x à mes boutiques » / « Ce n'est pas ma boutique » →
  « Connecte-toi à ta boutique Vinted sur ton ordinateur »), synchro relancée
  sans second appui ; JAMAIS une boutique rattachée sans ce clic. Mesure :
  `usage_logs.feature = 'confirmation_boutique'`. Aucun plafond de boutiques
  par palier n'existe (06/10).

## ⛔ TÂCHE AUTOMATIQUE OU RELECTURE EN BOUCLE : MESURÉE, BORNÉE (04/10)

Le 04/10, la base a saturé deux fois (12:22 et 17:40, CPU 99 %) : app et web
bloqués sur l'écran de chargement pour TOUT LE MONDE. Causes : deux crons
ajoutés le matin (27 `ebay-releve-api`, 28 `releve-completer`) qui
travaillaient pour tous les comptes et réécrivaient chaque annonce, même
inchangée (chaque écriture déclenche `annonce_vers_fiche`) ; et des écrans qui
relisaient la base à cadence fixe, onglet caché compris, sans ralentir quand
elle peinait (tout l'historique des jobs toutes les 20 s, 7 requêtes toutes
les 30 s).

Toute nouvelle tâche automatique (cron, trigger, boucle de fonction edge) ou
relecture côté client (app, extension) :
- est **mesurée en CPU AVANT la mise en prod** : un passage manuel, le CPU lu
  avant et pendant (métriques `/customer/v1/privileged/metrics` ou table
  `veille_cpu`) et `pg_stat_statements` ; le chiffre va dans le rapport ;
- ne vise que les **comptes actifs** : `comptes_actifs(7)` (extension ou
  session de l'app vues dans les 7 jours) ;
- travaille par **lots bornés** (comptes, écritures, durée par passage) et
  **n'écrit jamais une ligne inchangée** ;
- côté client, passe par `src/utils/relectureBornee.js` : onglet visible
  seulement, une lecture à la fois, attente doublée sur erreur ou lenteur.
  **Jamais de `setInterval` qui relit la base, jamais de relecture en
  boucle.**

Alerte : `veille-cpu` (cron `veille-cpu-2min`) prévient support@fillsell.app
au-delà de 70 % pendant 10 min, au plus une fois par heure, puis au retour
sous 50 %. L'ops-digest affiche le maximum des 24 h.

## Format des réponses

Toujours mettre le contenu des réponses textuelles dans un bloc de code (``` ```) pour faciliter le copier-coller. Diagnostics, rapports, récapitulatifs, listes de changements — tout doit être dans un bloc.

## Git
- **Migrations Supabase** : appliquées en prod une par une (comportement normal et irréversible), et TOUJOURS inscrites dans l'historique : `db query --linked -f <fichier>` puis `migration repair --linked --status applied <version>` (règle du 01/10).
- **Code applicatif** (React, Edge Functions, extension Chrome) : commit et push **directement sur `main`**, plus de branche feature ni de PR (consigne 2026-07-21). Toujours build/vérifier avant de push — le push tient lieu de validation.
- Déployer les Edge Functions concernées quand elles changent (cf. section dédiée).

### ⛔ UN SEUL PUSH SUR `main` PAR LOT (consigne 2026-09-18, payée deux fois)

« Fichier par fichier » veut dire **commits**, JAMAIS déploiements. Les commits
restent séparés pour la lisibilité — ils **partent ensemble**.

Un push = un déploiement Vercel = **tous les chunks renommés**. Le 18/09, six
pushs en dix minutes (dont quatre déploiements en trente-trois secondes) ont
mis la prod à l'écran blanc : chaque onglet ouvert pointait sur des fichiers
qui venaient d'être supprimés. Le code était bon, le build vert.

Empiler les commits en local, vérifier, puis pousser **une fois**. Un fichier
neuf à sortir avant son câblage reste un COMMIT séparé dans le MÊME push.

### ⛔ ÉCRAN BLANC : LE BUILD AVANT LE CODE

Ordre de diagnostic, non négociable — une demi-journée perdue le 11/09 et une
autre le 18/09 pour avoir cherché dans les fichiers d'abord :

1. **l'empreinte du build** — en bas de la page Réglages, ou
   `curl https://fillsell.app/build.json` : elle dit quel commit tourne
   vraiment chez la personne (jamais `-dirty` depuis le 01/10 : `npm run
   build` REFUSE un arbre sale — Vercel comme OTA — et nomme les fichiers ;
   `package.json` et `package-lock.json` montent ENSEMBLE ; simple
   vérification de compilation : `npm run build:essai`, jamais servi) ;
2. **un rechargement forcé** — si l'écran revient, c'était un chunk périmé et
   il n'y a rien à corriger dans le code ;
   ⛔ **blanc MÊME après rechargement, pour tout le monde : le CDN** (01/10,
   22:22). Demander l'entrée COMME un navigateur, avec `Origin` :
   `e=$(curl -s https://fillsell.app/app | grep -o 'assets/index-[^"]*.js'); curl -s -o /dev/null -w '%{http_code}
' -H 'Origin: https://fillsell.app' https://fillsell.app/$e`
   — 404 ici et 200 sans `Origin` = Cloudflare garde un 404 pris au
   déploiement (une heure). Aucun code en cause ; remède : renommer l'entrée
   (toute modification exécutée de `src/main.jsx`), UN push, puis relire.
   Cause du 01/10 : deux pushs à deux minutes (code, puis docs) ;
3. **l'état du déploiement Vercel** (READY ou ERROR) ;
4. **alors seulement**, ouvrir un fichier.

⚠️ Un écran blanc n'est pas forcément une exception de rendu : avec `lazy()` +
`<Suspense fallback={null}>`, un 404 sur un chunk rend exactement le même écran
vide qu'un crash, **et le build est vert dans les deux cas**. Depuis e67aae3 la
garde `vite:preloadError` (src/main.jsx) recharge une fois toute seule — un
écran blanc qui SURVIT à ça, alors oui, c'est du code.

## Déploiement des Edge Functions

### ⛔ LE GESTE, AVANT TOUT DÉPLOIEMENT — UNE LIGNE, À COPIER

```
npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
```

**On lit l'état RÉEL avant, on le relit après.** Un déploiement sans
`--no-verify-jwt` remet `verify_jwt` à `true` : le cron ou le webhook tombe en
401, en silence, et personne ne le voit avant que les jobs s'empilent.
C'est ce geste qui a évité de casser le cron `ebay-api-worker-2min` le
18/09 — la fonction tourne en `false` et **ne figurait pas** dans la liste
ci-dessous, qui était la seule source consultée jusque-là.

### LA RÈGLE — C'EST L'APPELANT QUI DÉCIDE, PAS LA LISTE

Une liste se périme à chaque fonction ajoutée : c'est exactement comme ça que
le trou d'`ebay-api-worker` est né. La question n'est jamais « est-elle dans la
liste ? » mais **« qui l'appelle, et cet appelant a-t-il une session
Supabase ? »** :

| L'appelant | verify_jwt | Ce que la fonction doit faire |
|---|---|---|
| pg_cron / pg_net (trigger) | **false** | garde `x-cron-secret` obligatoire |
| Webhook externe (Stripe, Apple, Google, eBay) | **false** | vérifier la signature de l'émetteur |
| Lien public, redirection OAuth | **false** | jeton dans l'URL, jamais rien d'implicite |
| App ou extension (JWT utilisateur) | **true** (défaut) | rien, la plateforme garde |
| DEUX appelants dont un sans session | **false** | garde maison à deux branches |

⛔ `verify_jwt: false` n'est JAMAIS « pas d'authentification » : c'est
« l'authentification est faite par la fonction elle-même ». Une fonction en
`false` sans garde propre est une porte ouverte.

Commande : `supabase functions deploy <nom> --no-verify-jwt`

### L'ÉTAT RELEVÉ LE 18/09/2026 — 33 fonctions en `verify_jwt: false` sur 57

Relevé par `functions list`, pas recopié. Il se périme : le geste ci-dessus
fait foi, pas ce tableau.

⚠️ **Relevé du 01/10/2026 : 49 fonctions actives, 24 en `false`.**
`send-batch-notifications` et `send-chantier-zip` **n'existent plus en
prod**. Liste à jour : `docs/agents/architecture.md`.

**Appelées par pg_cron / pg_net (`x-cron-secret`)** — `cron.job` le prouve :
`ebay-api-worker` (*/2) · `republish-auto-sweep` (*/3) · `handler-watch` (*/3)
· `beebs-lien` (*/5) · `email-tunnel` (9h + horaire, **et** le trigger
`handle_new_user`) · `ops-digest` (8h50) · `republish-purge` (3h40) ·
`lens-temp-purge` (3h50 — jamais de purge côté client : un client ne voit que
SON scan, c'est ce qui effaçait les photos d'articles avant le 15/09) ·
`empreintes-urls` (appelée par `fusion_photo_tick`, cron 20 chaque minute) ·
(`stripe-recalage-1er-du-mois`, one-shot du 01/10 : SUPPRIMÉE le 03/10) ·
`doublons-balayage` (cron 17, **INACTIF depuis le 28/09** ; déclarée
`verify_jwt = false` dans `config.toml`).

**Webhooks externes** (l'émetteur n'a pas de session) : `stripe-webhook` ·
`apple-iap-webhook` · `google-play-webhook` · `ebay-account-deletion` ·
`ebay-oauth-callback` (redirection eBay).

**Appel public assumé** : `email-desinscription` (le lien des emails ; un
`verify_jwt` à true le rendrait inopérant et bloquerait toute campagne) ·
`apple-subscription-status` · `apple-notification-history`.

**Font leur PROPRE garde** : `resolve-categorie` (deux appelants : l'app avec
JWT, le worker eBay avec `x-cron-secret`) · `voice-intent` (Bearer + getUser
maison, pour maîtriser sa réponse 401/CORS) · `update-job-status` ·
`check-listing-status`.

**One-shots déployés à la main** : aucun en prod au 01/10 (les
`send-<prénom>-<date>` sont interdits, cf. plus bas). (`send-chantier-zip` et `check-early-adopter` —
stubs 410 — ont été SUPPRIMÉES de la prod le 26/09/2026 : 0 appel en 30 jours
de journaux, 0 cron, 0 fonction SQL, 0 ligne de code.)
(`send-relance` a été SUPPRIMÉE de la prod le 20/09/2026 — jeton en clair dans
un fichier gitignoré, campagnes toutes parties, aucun appelant.)

## ⛔ ENVOYER UN MAIL — UNE SEULE LIGNE, JAMAIS UNE FONCTION

**Claude ne déploie plus JAMAIS de fonction edge pour envoyer un mail.**
Le 23/09, les portes d'envoi étaient passées de 19 à **35** en trois jours :
une fonction `send-<prénom>-<date>` par mail, destinataire en dur,
`verify_jwt = false`, jeton maison (`fs2026batch`), jamais commitée, jamais
supprimée. **Trente et une ont été supprimées ce jour-là** après vérification
(0 cron, 0 fonction SQL, 0 trigger, 0 ligne de code ne les nommait).

LA LIGNE, à exécuter en SQL — c'est tout :

```sql
select public.envoyer_mail_ponctuel(
  p_destinataires := '[{"email":"qui@exemple.fr","user_id":"<uuid ou null>","variables":{"prenom":"Marie"}}]'::jsonb,
  p_sujet         := 'Bonjour {{prenom}}',
  p_html          := '<p>Le texte, en HTML.</p>',
  p_type          := 'un_type_parlant',     -- obligatoire, il atterrit dans email_logs
  p_categorie     := 'support',             -- 'support' (réponse à quelqu'un) | 'marketing' (campagne)
  p_simulation    := true                   -- true = rien ne part, on lit le verdict
);
-- puis, TOUT DE SUITE (net._http_response se purge) :
select status_code, content from net._http_response where id = <l'id rendu ci-dessus>;
```

`p_destinataires` accepte une liste : un envoi ou mille, même chemin, même
journal. `{{cle}}` est remplacé par `variables` **par personne**.

**Toujours lancer en `p_simulation := true` d'abord**, lire le verdict, puis
relancer à `false`. Et commencer par SON adresse.

**Pièce jointe** (26/09, envoi-ponctuel v3) : clé optionnelle DANS le
destinataire, jamais au niveau de l'appel —
`{"email":"…","pieces_jointes":[{"nom":"ventes.pdf","base64":"…"}]}`.
`support` seulement ; pdf, csv, png, jpg ; 3 pièces et 5 Mo au plus par
personne. Une pièce illisible REFUSE le mail (jamais un mail parti sans sa
pièce) ; la simulation rend le nom et le poids. Un gros base64 se met dans un
fichier `.sql` lancé par `npx supabase db query --linked -f`, jamais collé à la
main. Un export porte des données personnelles : `build/exports/` (ignoré par
git), JAMAIS un bucket Storage (les deux existants sont PUBLICS). PDF des
ventes d'un compte : `node scripts/emails/export-ventes-pdf.mjs --user <uuid>`.

CE QUE LA PORTE GARANTIT, et qu'aucune des 31 ne garantissait :
- clé de service exigée (lue dans le **vault**, secret `service_role_key`,
  jamais écrite en clair) — **aucun jeton en dur nulle part** ;
- `verify_jwt = true` ET garde maison : un JWT d'utilisateur ordinaire est
  signé par le projet, il ne suffit donc pas — seule la clé de service passe ;
- passage obligé par `envoyerEmail()` (`_shared/desinscription.ts`) :
  désinscription respectée, ligne `email_logs`, échecs dans
  `email_log_echecs`, en-tête List-Unsubscribe One-Click sur tout marketing ;
- `type` et `categorie` **obligatoires, sans défaut** ;
- **plafond de 2 mails par personne et par 24 h** sur le `marketing`. Il compte
  toutes les lignes `email_logs` de la personne sur 24 h glissantes, quel que
  soit le type : « deux mails par jour » se juge depuis SA boîte de réception,
  pas depuis nos catégories. Un `support` n'est **jamais** plafonné.

⛔ **UN TYPE ONE-SHOT ENTRE DANS L'INDEX, LE JOUR MÊME.** Un type envoyé une
fois par personne et absent de `email_logs_one_shot_unique` repartira en
doublon sans que rien ne le signale (bug du welcome, 03/08). Cf. la section
`email_logs` plus bas.

Les fonctions `send-*` qui RESTENT, et pourquoi : `send-extension-link`
(appelée par l'app, `verify_jwt` true), `send-bug-report` (idem). Plus rien
d'autre au 01/10 (`send-batch-notifications` n'existe plus en prod). Le
compte vivant se lit par le geste, jamais ici :
`npx supabase functions list | grep -o '"slug":"send-[^"]*"' | wc -l`.

⚠️ **DEUX ÉCARTS CONNUS, NON CORRIGÉS — à trancher, pas à patcher en passant :**
- `update-job-status` et `check-listing-status` portent dans leur propre
  en-tête « verify_jwt reste à true / peut rester au défaut : l'appel porte
  toujours un JWT user » — et tournent pourtant en **false**. Le code et la
  prod ne disent pas la même chose. Les deux font leur garde maison, donc rien
  n'est ouvert ; mais l'un des deux textes est faux.
- `tiktok-event` était listé ici et **n'existe plus** parmi les 57 fonctions
  actives. Retiré de la liste le 18/09.

(`send-merine-reply` a été supprimée en prod le 28/07/2026 — un one-shot en
`verify_jwt = false` que plus rien n'appelait.)

**Numéros de version** : ne JAMAIS écrire un numéro de version de fonction
(rapport, STATUS.md, commentaire, commit) sans l'avoir lu dans
`npx supabase functions list`. Les compteurs ne se suivent pas d'une fonction
à l'autre (voice-transcribe v36 quand voice-intent est v148) — un numéro
« déduit » est faux.

### ⛔ JAMAIS D'IMPORT DISTANT FLOTTANT — TOUJOURS UNE VERSION ÉPINGLÉE

`https://esm.sh/@supabase/supabase-js@2` suit **toutes** les 2.x publiées, y
compris celle qui casse. Le 23/09, `@2` a résolu vers 2.117.1, dont la
dépendance `@supabase/functions-js@2.117.1` rend **404** sur esm.sh (le paquet
n'y a jamais été publié). Mesuré en direct : `2.117.1 → 404`, `2.117.0 → 200`.
Effet : **plus aucune fonction edge important supabase-js ne pouvait être
déployée** — 48 fichiers, c'est-à-dire à peu près tout le serveur. Découvert
par hasard, en déployant autre chose ; personne n'aurait rien vu jusqu'au
premier déploiement d'urgence.

Une dépendance flottante, c'est **une panne de déploiement décidée par
quelqu'un d'autre, un jour qu'on ne choisit pas**. On épingle tout :
`@supabase/supabase-js@2.117.0`, `std@0.168.0`, `stripe@12.18.0`,
`@peculiar/x509@1.9.0`, `imagescript@1.3.0`.

Le contrôle qui l'empêche de revenir, y compris dans un fichier neuf :
```
npm run selftest:imports-epingles
```
Il échoue sur toute importation distante sans version complète (`@2` compte
comme flottant) et sur toute version qui s'écarte de celle qu'on a éprouvée.
**Pour changer de version** : bouger `VERSIONS_ATTENDUES` dans
`scripts/imports-epingles-selftest.mjs`, un `sed` sur `supabase/functions/`,
relancer le test. Une ligne, pas quarante-six.

⚠️ **Pas d'import map partagé, et c'est un choix** : on ne peut pas le PROUVER
sans déployer (`deno check` résout côté client, c'est le bundler du serveur qui
tranche à la livraison, et la CLI n'a pas de `--dry-run`). Un import map non
éprouvé déplacerait le risque d'un cran, jusqu'au premier déploiement pressé.

## Trigger handle_new_user

Le trigger pg_net appelle email-tunnel via le header `x-cron-secret`, dont la valeur se lit par `public.cron_secret()` (vault, secret `cron_secret`) — jamais écrite dans le dépôt.
Ne pas utiliser de query param ni de header `Authorization` dans pg_net — seul le header custom fonctionne.

## Secret de cron — dans le vault et l'environnement, jamais dans le dépôt (30/09)

Le secret `x-cron-secret` protège toutes les fonctions en `verify_jwt = false`
appelées par pg_cron / pg_net. Depuis le 30/09 il n'est écrit NULLE PART dans le
dépôt (l'ancienne valeur, sur GitHub depuis juin, a été changée le 30/09) :

- côté base : vault, secret `cron_secret`, lu par `public.cron_secret()` (SECURITY
  DEFINER, fermée à anon/authenticated). Les commandes `cron.job` et les
  fonctions pg_net construisent l'en-tête par
  `jsonb_build_object('x-cron-secret', public.cron_secret())` ;
- côté fonctions : variable `CRON_SECRET` (`supabase secrets set`), y compris
  `_shared/payment-notify.ts` ;
- dans les migrations historiques, la valeur est remplacée par
  `__CRON_SECRET_DU_VAULT__` : ces fichiers ne se rejouent jamais tels quels.

⛔ Une rotation change les DEUX au même moment (vault + `CRON_SECRET`), puis
on relit `cron.job_run_details` ET les codes HTTP (`net._http_response`) des
crons suivants : un cron « succeeded » peut cacher un 401. Procédure :
`docs/ROTATION_CRON_SECRET.md`. Un nouveau cron ou trigger pg_net n'écrit
JAMAIS la valeur : il appelle `public.cron_secret()`.

## Premium detection

Règle métier (2026-07-25) : **résilié/expiré = plus premium, partout**. Depuis le 05/10, UN SEUL calcul du palier : `supabase/functions/_shared/palier.js` (l'app : `src/utils/palier.js` le ré-exporte ; les fonctions edge l'importent) et, en SQL, `palier_de(uuid)` / `palier_au_moins(uuid, text)`. Ordre : business, puis pro, puis premium (`is_premium OR is_comped`), sinon free ; les paliers s'emboîtent (business ⇒ pro ⇒ premium). ⛔ Jamais un drapeau seul (`is_pro !== true`) : un Business offert sans is_pro (ornellaracano) se voyait refuser la republication auto.
- `is_premium`/`is_pro` = source de vérité, maintenus par les 4 flux de paiement (stripe-webhook/recomputeStripeFlags, apple-iap-webhook, validate-apple-receipt, google-play-webhook).
- `is_comped` = premium offert sans abonnement actif (décision explicite, posé à la main).
- Ne JAMAIS traiter `is_founder` ni la présence d'`apple_original_transaction_id`/`google_purchase_token` comme signal premium : ces marqueurs survivent à la résiliation (bug « premium fantôme » corrigé le 25/07). `is_founder` reste un marqueur de prix legacy (9,99 €) pour l'affichage tarifaire uniquement.
- Pour tout statut d'abonnement, vérifier la SOURCE (dashboard/API Stripe, Apple, Google) — jamais les colonnes locales seules.

## apple-iap-webhook

Les users promus manuellement sans passer par le flow IAP n'auront jamais d'`apple_original_transaction_id` tant qu'ils ne renouvellent pas via l'app. Sans `appAccountToken` dans le payload Apple, impossible d'identifier l'utilisateur.

## Supabase migrations

Toute nouvelle table dans le schéma public nécessite :
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nouvelle_table TO authenticated;
```

## email_logs — tout nouveau type one-shot DOIT entrer dans l'index

L'unicité de `email_logs` est portée par l'index PARTIEL
`email_logs_one_shot_unique` sur `(user_id, email_type)`, limité à une liste
FERMÉE de types nommés : `welcome`, `how_it_works`, `blast_relaunch_aout`,
`blast_founder`, `founder_plan`, `voice_conversion`.

Règle à respecter AVANT d'ajouter un type d'email :
- **Type one-shot** (un seul envoi par utilisateur, à vie) → l'ajouter au
  `WHERE ... IN (...)` de l'index par migration idempotente, SINON il
  repartira en doublon comme le welcome (bug du 03/08) et rien ne le
  signalera à l'écriture.
- **Type récurrent** (plusieurs lignes légitimes par utilisateur, ex.
  `job_pending_relaunch` et son cooldown 72 h) → ne PAS l'ajouter à l'index ;
  sa protection anti-doublon doit vivre ailleurs (réservation dédiée type
  `job_relaunch_log`, jamais une dédup lue-puis-écrite).
- Toute lecture d'`email_logs` côté fonction doit être PAGINÉE
  (`.order().range()`) : la table dépasse le millier de lignes et PostgREST
  tronque à 1000 sans prévenir.
- Les échecs d'insert sont journalisés dans la table `email_log_echecs` et
  remontés dans l'**ops-digest de 8h50** du lendemain (en plus de `log_echecs`
  dans la réponse et des logs, qui n'ont pas de lecteur quotidien). Deux
  gravités dans le digest : `23505` = un doublon d'envoi vient de partir
  (type one-shot oublié dans l'index — enquêter le jour même) ; autre code =
  ligne de dédup perdue (l'utilisateur reste renvoyable, reposer la ligne).

## Prix d'achat : VIDE ≠ ZÉRO (règle posée le 03/08)

`inventaire.prix_achat` **NULL = inconnu** → l'article n'entre dans **AUCUN**
calcul de marge, de bénéfice, de total investi ni de moyenne.
`prix_achat = 0` = **article gratuit assumé** (don, lot offert) → il compte
normalement. Ne JAMAIS écrire 0 pour dire « je ne sais pas » : ça produit une
marge de 100 % sur du vent, indétectable ensuite.

- Source unique : `src/utils/comptabilite.js` (prixAchatConnu, comptabilisables,
  totalInvesti, totalMarge, margeUnitaire). Tout nouveau calcul passe par là.
- Ne jamais réintroduire `parseFloat(x) || 0`, `?? 0` ou `Number(x ?? 0)` sur un
  prix d'achat.
- ⚠️ Piège JS : `isNaN(null) === false`. Un `.filter(x => !isNaN(x))` laisse
  donc passer les valeurs nulles comme des zéros — filtrer explicitement.
- `prix_achat_inconnu = true` (bouton « je ne sais plus ») vaut un prix absent :
  exclu des calculs, mais on ne repose plus la question.
- Le **chiffre d'affaires** ne se filtre jamais : il est vrai même sans prix
  d'achat.
- Les 346 lignes historiques à `prix_achat = 0` sont ambiguës et n'ont pas été
  converties. Les 3 dénominateurs divergents de « marge % » (prix de vente,
  prix d'achat, COGS) sont une dette connue, à ne pas unifier sans décision.

## Queries Supabase analytics

- Toujours utiliser `AT TIME ZONE 'Europe/Paris'`.
- Toujours exclure les emails de test via un CTE `excluded` avec `unnest(ARRAY[...])`.

## pg_net

`net._http_response` se purge automatiquement. Vérifier le statut immédiatement après l'appel.
