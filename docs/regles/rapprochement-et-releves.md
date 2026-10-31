# Rapprochement, synchronisation et relevés

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 12/10 — rapprochement en tranches (ferreirasab) (ex-L38-45)
- 08/10 nuit — multi-synchro (ex-L202-215)
- 08/10 — aucune fiche ne naît d'un relevé sans décision v3 (ex-L216-224)
- 08/10 soir — fiche créée à la main face à une fiche Vinted (ex-L225-235)
- 08/10 nuit — remise en ligne Vinted (Bebertdeals) (ex-L236-249)
- 08/10 matin — boucles (ex-L264-270)
- 04/10 — relevés et fiches (Louis) (ex-L368-372)
- 03/10 — WebFetch n'est jamais une preuve de l'état d'une annonce Vinted (ex-L377-379)
- 03/10 — relevés (5 min sans progression) (ex-L380-383)
- ⛔ Règles définitives du 27/09 soir (synchronisation) (ex-L527-563)
- ⛔ Rattachement avant stock (07/10) (ex-L564-586)
- ⛔ Un relevé d'import ne part que sur « Synchroniser » (05/10) (ex-L587-611)

<!-- ex-CLAUDE.md L38-45 : 12/10 — rapprochement en tranches (ferreirasab) -->
- **⛔ 12/10 — RAPPROCHEMENT EN TRANCHES (ferreirasab)** — rapport `docs/enquetes/ferreira-cpu-1210/RAPPORT.md` : la passe
  dépassait les 2 s de CPU d'une fonction edge (3 082 nœuds) → elle se calcule EN TRANCHES reprises d'une invocation à l'autre
  (`_shared/rapprochement/tranches.js`, chantier `rapprochement_tranches`, mig **20261012120000 APPLIQUÉE**), budget 900 ms
  de CPU par invocation (max mesuré 822), mêmes décisions que la v19 (`scripts/preuves/preuve-rapprochement-tranches.mjs`, 7 comptes réels) ;
  ⛔ **la lecture est rangée par identifiant avant tout** (`ordonner`, passe.js : `rapprochement_v3_lire` n'a pas d'ORDER BY) ;
  ⛔ déploiement par le connecteur : aucun `\uXXXX` dans le source (rendu en caractères bruts). `rapprochement` **v22** servie
  depuis la branche `claude/rapprochement-cpu-timeout-0229m9` — ⛔ **à fusionner dans main avant tout déploiement de
  `rapprochement` depuis main** (sinon retour à la v19). Rattachements manuels de Nico du 12/10 rejugés (434/475 confirmés).

<!-- ex-CLAUDE.md L202-215 : 08/10 nuit — multi-synchro -->
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

<!-- ex-CLAUDE.md L216-224 : 08/10 — aucune fiche ne naît d'un relevé sans décision v3 -->
- **⛔ AUCUNE FICHE NE NAÎT D'UN RELEVÉ SANS DÉCISION v3 (08/10 après-midi)** :
  une fiche `releve_*` ne sort que de `rapprocher_importer` (moteur v3 ou la
  personne) — garde en base `inventaire_releve_par_decision` ; les imports du
  moteur portent `regle: rapprochement_v3` (504 d'avant tracés,
  `_backup_0810_regle_v3`) ; les fiches du dressing Vinted nées depuis la
  dernière passe sont jugées contre les imports au stock (`vinted_a_juger`,
  `rapprochement_comptes.vinted_juge_le`, 200 par passe). Migration
  **20261008130000 APPLIQUÉE** (08/10 11:18 UTC, feu vert nommé).
  Selftest `selftest:aucune-fiche-sans-v3` (`--prod` : la base).

<!-- ex-CLAUDE.md L225-235 : 08/10 soir — fiche créée à la main face à une fiche Vinted -->
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

<!-- ex-CLAUDE.md L236-249 : 08/10 nuit — remise en ligne Vinted (Bebertdeals) -->
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

<!-- ex-CLAUDE.md L264-270 : 08/10 matin — boucles -->
- **⛔ BOUCLES (08/10 matin)** : une même décision ne s'écrit jamais en boucle
  (Nadège : 8 954 lignes, moteur v2 + job SANS article) ; `rapprochement` v12
  compte les passes qui n'écrivent rien (`rapprochement_comptes.passages`, en
  négatif) et s'arrête à 3 (ops-digest) ; un relevé automatique (veilleur,
  cron) a une cadence plancher par compte et plateforme ; une synchro ne vide
  jamais une marque. Migrations 20261008100000 / 101000 (RÉVISÉE : le veilleur
  vise la cause, aucun plancher) / 102000 APPLIQUÉES. Aucun quota sur l'import.

<!-- ex-CLAUDE.md L368-372 : 04/10 — relevés et fiches (Louis) -->
- **Relevés et fiches (04/10, Louis)** : champs VIDES complétés depuis
  l'annonce (journal `inventaire_journal`) ; prix/poids suivis quand la
  plateforme change et que la fiche y était alignée, jamais propagés ;
  ⛔ jamais de poids lu sur l'estimation Leboncoin ; un seul champ
  `inventaire.poids_g` ; eBay relié = relevé par l'API (`ebay-releve-api`).

<!-- ex-CLAUDE.md L377-379 : 03/10 — WebFetch n'est jamais une preuve de l'état d'une annonce Vinted -->
- ⛔ **WebFetch n'est jamais une preuve de l'état d'une annonce Vinted** : il
  voit « Enlevé ! » sur des annonces en ligne (03/10). Seule la page vue dans
  le Chrome de la personne (ou un relevé) fait foi.

<!-- ex-CLAUDE.md L380-383 : 03/10 — relevés (5 min sans progression) -->
- **Relevés (03/10)** : 5 min sans progression = arrêt par handler-watch
  (`vinted_sync_runs.progres_le`, posé par la base ; « annonces » : la dernière
  ligne écrite compte ; liste encore en lecture : 10 min) ; le veilleur
  s'espace après un échec (1 h, 3 h, 6 h) — migration 20261003150000.

<!-- ex-CLAUDE.md L527-563 : ⛔ Règles définitives du 27/09 soir (synchronisation) -->
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


<!-- ex-CLAUDE.md L564-586 : ⛔ Rattachement avant stock (07/10) -->
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


<!-- ex-CLAUDE.md L587-611 : ⛔ Un relevé d'import ne part que sur « Synchroniser » (05/10) -->
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


## ⛔ UNE ANNONCE N'APPARTIENT JAMAIS À DEUX FICHES (15/10 soir, Louis — Nico)
- Le lien d'un job SUIT son identifiant, à l'INSERT comme à l'UPDATE (`cross_post_jobs_lien_suit_identifiant`,
  mig 20261015190000) : identifiant rendu au dépôt (Leboncoin `lbc_depot`), sinon l'identifiant ; un lien d'une
  autre annonce est remplacé (ou vidé : l'extension le retrouve PAR L'IDENTIFIANT). Cause du cas Louis : lien
  retrouvé par le TITRE (24/09, 0.6.66) puis identifiant réel du dépôt posé sans que le lien suive.
- Une annonce portée par plusieurs fiches se tranche SEULE avant toute question (`_shared/annonce-partagee.js`,
  fonction `rapprochement-ia` mode `annonces_partagees`, cron 53) : identifiants → photos (capture en taille
  réelle) → IA (Haiku, exclusion au texte, « même » seulement sur photo) ; fiche VENDUE parmi les candidates =
  la personne décide ; décision appliquée par `annonce_partagee_attribuer` (defaire_croisement_annonce) ; une
  republication capturée sur la mauvaise annonce est RECAPTURÉE. get-pending-jobs retient le geste
  (« ton annonce est intacte ») et ne pose la question qu'après « incertain » (filet : 30 min).

## 15/10 soir (3) — identité par les photos de NOTRE copie (cascade identifiant → photos → IA)
- **Dépôt sans numéro rattaché par le relevé** (`_shared/depot-sans-numero.js`, beebs-lien v14) : annonce du compte
  reliée à rien, vue après le dépôt, non numérotée avant lui, aux photos de la COPIE envoyée (trancherParPhotos,
  une seule « même », les autres « autre »), appariement mutuel → numéro posé (`lien_par_photos`), URL seulement si
  en ligne. Jamais titre/prix/date. Remplace la règle du 29/09 « identifiant seul ». 1re passe : nicolas.menar ×3.
- **Recréation « peut-être déjà partie »** (`jugerCandidates`, gpj + handler-watch) : une seule candidate aux photos
  de notre copie (pas celles de la fiche : la personne poste avec les siennes) = notre dépôt → rattachée, aucun
  redépôt (camille.ferren 3288747290). Doute : la question, comme avant.
- **Numérotée avant le dépôt** (`numeroteeAvantLeDepot`, Beebs seulement — mesuré : 0 inversion réelle sur 314 966
  paires ; Leboncoin non monotone) : une annonce de numéro inférieur à une annonce vue avant le dépôt ne peut pas
  être ce dépôt (Joe0410 : 33911255 « Polo Scott » du 06/09).
- **Titre du job aligné sur l'annonce prouvée** (`_shared/titre-aligne.js`, handler-watch v110+, Leboncoin) : même
  numéro, même fiche, photos identiques → le titre des jobs devient le titre en ligne (`titre_aligne`), le job arrêté
  par « Contradiction d'identité » repart ; le titre de la fiche n'est jamais touché. Au recâblage,
  `rapprocher_recabler_job` emporte le titre de l'annonce visée (mig 20261015210000).

## ⛔ 17/10 — BEEBS : « MES ANNONCES » NON PEINTE — LE FLUX TRANCHE SUR SA LISTE, LE MUR SE NOMME (Ornella)
- La vérification anti-robot de Beebs (DataDome, servie SOUS l'adresse de la liste : 403, captcha-delivery) s'écrit `[anti_robot]`,
  le renvoi vers /fr/auth `[pas_connecte]` : jamais « 0 annonce », jamais un compte vide.
- Page non peinte : le flux de « Mes annonces » tranche si ses deux onglets sont lus et que la liste « en ligne » est ENTIÈRE et tenue
  par l'index (`jugerFluxMesAnnoncesBeebs`) — le compteur de Beebs n'a pas à égaler l'index (une annonce retirée y reste des heures :
  5 contre 7 le 16/10) ; tronquée (> 60) : compteur = index ; « en vérification » : les connues entrent au relevé, une inconnue est
  comptée, jamais inventée. Le verdict `[flux] … → …` est TOUJOURS écrit dans le run (extension 0.6.123). `selftest:beebs-flux-mes-annonces`.

## 18/10 — Relevés morts sans alerte ; session perdue ou compte restreint : la personne est prévenue (lot 4, session sans Nico)
- Un relevé est MORT quand : compte actif (extension vue depuis moins de 24 h), plateforme déjà relevée avec succès,
  aucun `done` depuis 7 jours, quelque chose à surveiller (Vinted : toujours ; ailleurs : un dépôt publié ou une annonce
  relevée vivante), plateforme non écartée, jamais Opla, dernier run ≠ `cancelled`. Fonction `releves_morts_veille(p_jours,
  p_limite)` (migration 20261018010000, STABLE, service_role, LECTURE SEULE — rien n'est relancé ni clos) : cause probable lue
  dans l'erreur du dernier run (boutique à confirmer, session fermée, mur anti-robot, panne jamais reprise) ; filet du chien
  de garde (`running` sans progrès > 1 h, `queued` > 7 h — attendu 0/0). Lue par `ops-digest` (v36) : section « Relevés
  morts sans alerte » (rouge au-delà de 21 j), compteur `releves_morts` dans l'objet. Enquête du 17/10 : Lohan — boutique à
  confirmer (02 → 16/10) puis session Vinted fermée, revenu de lui-même le 17/10 14:34 ; Rui — session Vinted fermée depuis
  le 11/09 (dormant, rien relancé) ; un refus d'appui n'écrit aucun run et une session fermée fait échouer le cron chaque
  jour en silence : c'est ce que la veille rend visible. Le relevé reste un GESTE (règle du 05/10) : rien n'est relancé
  d'office.
- (23/10, Sébastien) « Connecte-toi à X » seulement si FillSell ne peut VRAIMENT plus y travailler : eBay relié par l'API
  n'est jamais jugé sur la sonde ebay.fr de Chrome (`ebayApi`, `etatEbayApi`) — son seul mur est le lien lui-même
  (`relier_api`, « Reconnecte ton compte eBay », jamais masquable) ; une plateforme écartée (« je ne vends pas sur X ») ou
  sans aucune tâche ni fiche (`plateformesUtilisees`) ne lance aucune alerte. Rejeu du 23/10 sur 174 comptes : 26 alertes
  → 5 (6 eBay reliés par l'API, 4 écartées, 14 jamais utilisées ; 3 liens API cassés de comptes qui vendent sur eBay).
- Session perdue ou compte restreint = UNE ligne dans « À régler » (`compte_plateforme` ; règle `src/utils/alertesCompte.js`,
  écran `src/stock/EcranAlertesCompte.jsx`) : plateformes regroupées (« Connecte-toi à Vinted et Leboncoin »), restriction
  Vinted lue dans le diagnostic d'un job vivant (« Compte restreint jusqu'au JJ/MM »), jamais sur `null` (session jamais
  vérifiée), ni durée, ni mot technique, ni émoji. Masquable par plateforme (`platform_settings.alertes_compte.masquees`,
  écrit par `platform_settings_fusionner` seulement ; le masque tombe de lui-même quand la session revient ; une restriction
  reste masquée jusqu'à sa date de fin) ; interrupteur global Réglages › Préférences › Alertes de compte
  (`alertes_compte.desactivees`, actif par défaut). Lecture bornée (10 min, onglet visible, `demarrerRelecture`), jamais un
  `setInterval` ; le verdict de session est celui de `utils/sessionsPlateformes.etatSession` (le même que le reste de
  l'app). Aucun mail, aucun push. Selftest `alertes-compte` (21).

## ⛔ 18/10 soir — UNE BOUTIQUE = UN COMPTE FILLSELL ; COMPTES RELIÉS (Louis, décisions de Nico)
- Registre serveur `boutiques_plateforme` (platform, compte_ref → user_id ; rempli avec les boutiques Vinted d'un seul
  pin ; une boutique déjà chez plusieurs comptes n'est pas attribuée d'office). Une boutique d'un autre compte : jamais
  ajoutée au pin, jamais confirmée, aucun article importé (`[boutique_a_confirmer][boutique_autre_compte]`), aucune vente
  enregistrée (`enregistrer_ventes_relevees` → motif `boutique_autre_compte`, 0 mail). Leboncoin/Beebs/Depop/eBay : une
  annonce déjà suivie en ligne par un autre compte n'est pas importée (`sync_import_ecartes` motif `autre_compte:<pf>`) ;
  un compte eBay relié à un seul compte FillSell (index unique).
- **Comptes reliés** (`comptes_lies`, même personne, posé par décision de Nico) et **fiches jumelles**
  (`fiches_liees_comptes`) : une fiche vendue rend sa jumelle vendue ; la vente prouvée de la jumelle vaut preuve
  « Point A » pour armer les retraits de ses copies (`vente_prouvee_fiche_liee`) ; une vente annulée rend la jumelle
  disponible et annule ses retraits en file. Entre comptes reliés : une commande déjà enregistrée sur l'autre compte ne
  l'est jamais deux fois ; une vente Leboncoin/Depop/eBay dont l'annonce n'est suivie que par le compte relié lui
  appartient ; une conversation ou une commande n'est copiée qu'une fois. Migration `20261018200000`, essai 21/21.
- **Relevés morts** : une boutique non surveillée depuis plus de 24 h à cause d'une session fermée (preuve = le run, pas
  la sonde) est la première ligne de « À régler » avec le seul geste « Se reconnecter » (RPC `surveillance_releves()`,
  migration `20261018190000`, selftest `surveillance-releves`). La veille ne compte plus deux fois une annonce.
- **Leboncoin partagé entre deux comptes reliés** (décision de Nico, option B — Louis) : chaque compte surveille ce
  qu'IL a publié. Une annonce appartient au compte dont un job l'a publiée (identifiant d'annonce) ; le relevé de
  l'autre compte ne l'importe pas (`sync_import_ecartes` motif `compte_relie:<pf>`), une vente sur elle ne s'enregistre
  que chez lui (un mail, retraits de SES copies). Sans job, la règle d'avant tient. Migration `20261018220000` (essai 7/7).
- **La fiche jumelle occupe la plateforme d'une boutique PARTAGÉE** (20/10 soir, Louis ; rapport
  `docs/enquetes/urgences-2010/RAPPORT.md` § 3) : boutique partagée = un relevé a déjà écarté une annonce du compte
  relié sur cette plateforme (`compte_relie:<pf>`), jamais Vinted. La jumelle y est en ligne ou en file → la fiche est
  « déjà en ligne » sur cette plateforme pour les deux comptes : `spend_coins_and_publish` refuse (`already_published`
  + `compte_relie`, avant tout débit), aucune relance (déclencheur), l'app la montre occupée (`copies_fiches_jumelles()` :
  logo atténué, ni lot, ni stepper, ni « Pas encore ») ; un dépôt refusé pour ce doublon est clos sans rouge. L'annonce
  reste celle du compte qui l'a publiée (option B inchangée). « Rattachement par identifiant 0 » dans le message d'un
  relevé est un compteur à 0 en dur depuis le 07/10 : le rattachement réel est dans `rapprochement`. Migration `20261020210000`.

## 22/10 soir — boutique partagée, alertes tenues (rapport `docs/enquetes/lot-2210-soir/RAPPORT.md` § 3 et 5)
- Un relevé qui voit l'annonce du COMPTE RELIÉ dans la boutique commune rafraîchit la présence (vu, en ligne) chez le
  compte qui l'a publiée — jamais une vente, un prix, un titre (`annonces_plateforme_un_compte`).
- Une nouvelle alerte « plus en ligne » est tenue (`cross_post_jobs_zz_alerte_tenue`) : article en republication →
  écartée ; remplacé par sa propre republication → clos sans question ; jumelle du compte relié en ligne → close
  « remplacée par l'annonce de ton compte relié » (constat) ou à confirmer (veille) ; déjà démentie par un relevé → à
  confirmer. Une vente prouvée (`sold`) passe toujours. `constater_absences_releve` ignore un article en republication ;
  `inventaire.disparu_le` n'est jamais posé pendant une republication Vinted.
- Leboncoin (extension 0.6.130) : un 410 d'une annonce publiée il y a moins de 2 h (modération) = « inconnu », jamais
  mémorisé ; `/ad/<id>` se lit `/vi/<id>.htm`. Beebs : un retrait clos sans preuve puis revu en ligne est réarmé
  (`retraits_beebs_rearmer_revus`, 3 fois au plus).

## 23/10 soir — « remplacée par le compte relié » entre boutiques DISTINCTES (décision de Nico ; rapport `docs/enquetes/lot-2210-soir/RAPPORT.md` § « 23/10 soir (2) »)
- Deux comptes reliés qui ont chacun leur boutique (Louis : louis@ et louis-seller sur Beebs). Une question
  « vendue ? » (hors Vinted) se ferme, remplacée et pas vendue, seulement si tout est prouvé :
  - la fiche liée (`fiches_liees_comptes`, comptes reliés), jamais un titre ;
  - son annonce sur la même plateforme est déposée par FillSell et vue en ligne par un relevé de moins de 48 h ;
  - elle est apparue après la dernière fois que l'ancienne a été vue en ligne : jamais deux annonces en même temps ;
  - l'ancienne manque à un relevé complet de son compte fait après la question, et n'a jamais été revue depuis ;
  - aucune trace de vente, une seule unité de chaque côté, aucune republication engagée.
- Sinon, la vraie question reste posée. La boutique partagée garde sa règle (branche 3 de l'alerte tenue).
- Le dépôt mort est clos et l'annonce qui le remplace est nommée (`copie_remplacee_par_compte_relie`,
  règle `boutiques_distinctes_2310`). Aucun retrait, aucune vente, aucun mail.
- Quand : à la fin de chaque relevé d'annonces, pour le compte relevé et ses comptes reliés
  (`releve_clos_leve_alertes_disparues` → `questions_remplacees_par_compte_relie` → `remplacee_par_compte_relie`).
- Migration `20261023150000`.

## 24/10 matin — remise en ligne par le vendeur : fiches en double (jocabroc8 ; rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 matin »)
- ⛔ **La règle « remise en ligne Vinted » du 08/10 n'a jamais été branchée** (migration 20261008160000 jamais
  appliquée, interrupteurs absents) : chaque remise en ligne faite par le vendeur (suppression puis recréation) fait
  une fiche neuve ; l'annonce morte garde « vendue ? » ; les annonces vivantes d'un même objet se répartissent sur
  plusieurs fiches (risque de vente double). Le fichier du 08/10 réécrit `rapprochement_v3_lire`,
  `rapprochement_v3_appliquer` et `enregistrer_vente_atomique` à leur état du 08/10 : **jamais l'appliquer tel quel** —
  reconstruire sur les corps EN PROD, essai à blanc, mesure du parc, feu vert nommé de Nico.
- Même chose sur Leboncoin (l'estampe de jocabroc8 : trois fiches pour trois dépôts successifs du vendeur).
- `vinted_remise_en_ligne` / `vinted_retraits_successifs` exigent l'ancienne annonce « closed » : une annonce SUPPRIMÉE
  par le vendeur reste « active » + `disparu_le` — l'échange d'identité Vinted de `inventaire_fusionner_pour` ne joue
  pas. Pour fusionner à la main, la fiche GARDÉE est celle qui porte l'identité Vinted vivante.
- Une fusion décidée par Nico avec preuve photo se trace `utilisateur:photo_go_nico_<JJMM>` (30/09, 09/10, 24/10) ; les
  annonces mortes sont closes avant : « Annonce remplacée par ta remise en ligne (nouvelle annonce …) — ce n'est pas
  une vente » (`scripts/reparations/20261024_jocabroc8_fiches_en_double.sql`).

## ⛔ 24/10 midi — la remise en ligne Vinted est BRANCHÉE (feu vert 1 de Nico ; rapport `docs/enquetes/lot-2410/RAPPORT.md` § « 24/10 midi »)
- Migration `20261024170000` : la règle du 08/10 reportée sur les corps EN PROD du 24/10 (garde md5, chaque ligne des
  trois fonctions centrales conservée — selftest `remise-en-ligne-reconstruite`). Le fichier `20261008160000` ne doit
  JAMAIS être appliqué (sa garde md5 l'arrêterait de toute façon).
- Gardes : même compte, même boutique Vinted, jamais deux annonces en ligne ensemble, ancienne absente d'un relevé
  complet et jamais vue vendue, décisions de la personne définitives ; quantité / tâche en cours / fiche touchée /
  deux exemplaires → la question ; **vente en cours** (commande, preuve de vente en attente, achat en cours Leboncoin)
  → rien (ni fusion, ni question).
- Interrupteurs armés le 24/10 à 11:53 : la passe normale juge les remises en ligne NOUVELLES ; la garde de vente
  refuse une vente Vinted sans preuve sur une annonce remplacée.
- Rattrapage du stock existant : SEULEMENT les fusions certaines (`scripts/reparations/20261024_remises_en_ligne_rattrapage.mjs`,
  sauvegarde du compte avant) ; les cas douteux du stock (903 au 24/10) ne sont pas posés en masse. Un compte par
  appel, par petits lots au premier plan (le 24/10, un lot de 26 a été arrêté par le système, mémoire du poste).
- **La boutique doit être celle DU COMPTE** (`20261024180000`) : une boutique inscrite à un autre compte FillSell
  (registre du 18/10, `boutique_vinted_autre_compte`, la fonction même de la garde de la base) → ni fusion, ni question
  (`boutiques_differentes`). La base refusait déjà la fusion, mais une question pouvait être posée sur une boutique qui
  n'est pas la sienne.
- **Défaire un ÉCHANGE Vinted** (`20261024190000`, `inventaire_defusionner_pour`) : la fiche gardée lâche aussi son
  annonce avant que chacune reprenne la sienne. Sinon la garde du 08/10 (`inventaire_vinted_suit_annonce_en_ligne`,
  une fiche ne recule jamais sur une annonce plus ancienne) la retient et l'index unique bloque : du 08/10 au 24/10,
  692 des 696 échanges ne pouvaient plus se défaire, ni par « Défaire la fusion » ni par script. Toute
  réparation de masse : **essayer son inverse à blanc AVANT de l'appliquer**.
- L'inverse d'un compte (`20261008_remises_en_ligne_vinted_INVERSE.sql`) défait les fusions, rouvre les jobs Vinted
  clos et les questions que ces fusions ont closes « caduque » (lues dans `_backup_0810_remise_doublons`).
  Selftest `remise-en-ligne-boutique-et-defusion`.
- Rattrapage du stock TERMINÉ le 24/10 (26 comptes). Le lanceur n'envoie que les fusions acceptées TELLES QUELLES
  (motif NULL : aucune question créée à l'écriture) et sans aucune trace de vente sur leurs fiches (vente, note de
  vente, commande, job vendu ou signal `sold`, achat en cours Leboncoin ; `unavailable` n'est pas une vente). Une
  boutique Vinted non confirmée sur le compte : la base refuse la fusion (`[boutique_a_confirmer]`), rien ne change.

## ⛔ 25/10 nuit — « FillSell attend le prochain relevé » tranche, et le relevé est DEMANDÉ (point 1b de Nico ; rapport `docs/enquetes/nuit-2510/RAPPORT.md` § 1b)
- Une pause « introuvable à confirmer » (republication arrêtée AVANT tout retrait : la plateforme n'a pas rendu l'annonce)
  se tranche au relevé, sur l'annonce EXACTE du job (`_shared/introuvable-a-confirmer.js`) :
  - l'absence se compte depuis la **DERNIÈRE VUE** de l'annonce : deux relevés complets de SA boutique sans elle, dont au
    moins un commencé après la première lecture ratée → close (« n'est plus en ligne… FillSell n'a rien retiré ») ;
  - la page lue « Article vendu » à la lecture de CETTE pause (`republish_etat_reel` = sold) → close avec le message de la
    vente ; relevée vendue après la lecture → close ; relevée en ligne après la lecture → la republication repart seule ;
  - un `disparu_le` d'AVANT la lecture ne clôt jamais seul ; relevés et traces lus sur `FENETRE_TRACE_MS` (14 j) avant la
    première lecture — la même borne pour les deux.
- **Le relevé attendu, handler-watch le demande** (déclencheur `serveur:introuvable_a_confirmer`) : au plus un toutes les
  6 h par compte et plateforme (aucun relevé commencé, demandé, en file ou en cours depuis 6 h), seulement à un poste vu
  depuis moins de 10 min, Vinted seulement si la boutique ouverte dans Chrome est celle de l'annonce. ⛔ Tout nouveau
  déclencheur serveur de relevé d'import entre dans `releve_est_veille()` (migration) : sans cela
  `garde_releve_sans_geste` l'avale EN SILENCE (RETURN NULL, aucune erreur) — d'où le `.select("id")` après l'insertion.
- Preuve du 25/10 : 8 pauses → 5 closes au premier passage (01:36, exactement le rejeu), un relevé Leboncoin demandé à
  01:36, fait à 01:40, la pause tranchée à 01:42. Selftest `introuvable-a-confirmer` (83 cas, dont les cas réels du 24/10).

## 26/10 après-midi — la synchro après « Réinitialiser » (rapport `docs/enquetes/session-2610/RAPPORT.md` § B)
- Une plateforme dont la session est « inconnue » n'est plus exclue si un relevé passé a lu des annonces ; seul un
  « déconnecté » prouvé ou une plateforme jamais utilisée restent dehors. Une sonde muette (403) garde l'état connu
  avec sa date (extension 0.6.147, `sonde_muette`).
- Stock vide = pas de cadence anti-rafale (app `stock_empty`, extension `stockVideCadence`, serveur : migration préparée).
- « Rapprochement : terminé » seulement quand tous les relevés de la vague sont arrivés.
- La « dette Beebs » (un dépôt sans numéro) ne doit retenir que les annonces apparues après lui (migration préparée,
  essai annulé : 10/10 Beebs réimportées après « Réinitialiser »).
- Deux fiches déjà rangées ne sont jamais comparées en mode normal (doublon de Louis, licorne) : question proposée,
  non codée (rapport § B5).

## 26/10 (soir) — la première synchro part seule ; le relevé serveur eBay importe (décisions de Nico)
- **Première synchro automatique** (Azizak Shop : extension active, Vinted connecté, jamais touché « Synchroniser » →
  0 fiche) : au passage de l'extension (get-pending-jobs), un compte inscrit depuis 15 jours au plus
  (coin_config.premiere_synchro_auto_jours), avec au moins une plateforme choisie connectée et AUCUNE synchro demandée
  jamais (déclencheur bouton|bouton_distant|app), reçoit sa première synchro par les MÊMES RPC que le bouton
  (demander_sync_dressing, demander_sync_plateforme) — une fois par compte, tracée usage_logs « premiere_synchro_auto ».
  coin_config.premiere_synchro_auto = 0 coupe tout. La règle du 05/10 (la veille n'importe rien) reste vraie pour les
  relevés de veille : seule la PREMIÈRE synchro, demandée comme par le bouton, change. Rattrapage : la même règle prend
  les 14 inscrits des 15 derniers jours (extension vue, jamais synchronisés) à leur prochain passage.
- La carte « Installe l'extension » ne parle que si la base confirme l'absence (jamais pendant la lecture, jamais sur
  une lecture illisible) ; la capacité se relit, bornée (relectureBornee, stock vide, 10 min) ; plus de carte montée
  cachée dans la variante « ligne ».
- **Relevé serveur eBay (API)** (Julian Boissel : 14 annonces lues à 09:30, plan {creer: 14}, 0 fiche) : la règle de
  Nico — le relevé serveur passe par le même rapprochement et le même import que « Synchroniser ». Le moteur décidait
  déjà « créer » ; rapprochement_v3_fiche_de refusait hors geste. Exception APPLIQUÉE le 26/10 à 16:53 (feu vert de
  Nico ; migration 20261026171000, md5 14dab1677b7b47c3fd77bbe20640aec2, inverse dans supabase/rollbacks/) : un relevé « serveur:quotidien_api » / « serveur:lecture_origine »
  d'un compte eBay relié vaut un geste pour ses annonces eBay ; releve_est_geste inchangée. Rattrapage fait à 16:54
  (scripts/reparations/20261026_import_ebay_api.sql, sauvegarde _backup_2610_import_ebay_api) : 13 comptes actifs,
  281 annonces, 276 rattachées (Julian : 14 fiches).
- **Jamais d'import sur un relevé ancien** : un rattrapage d'annonces orphelines lues il y a plus de 20 h pose d'abord un
  relevé NEUF (« serveur:quotidien_api », lecture seule chez eBay) ; le moteur n'importe que ce qui est en ligne ce
  jour-là (un article vendu depuis ne renaît pas en stock). Connexion eBay révoquée = rien. Appliqué aux comptes
  inactifs le 26/10 à 17:23 (oui de Nico ; scripts/reparations/20261026_releve_ebay_inactifs.sql, 11 comptes).
- La dette Beebs bornée et la cadence serveur sur stock vide (§ 26/10 après-midi, « migration préparée ») : migration
  20261026150000 APPLIQUÉE le 26/10 à 17:10 (feu vert nommé de Nico).

## ⛔ 27/10 — l'identifiant d'annonce fait foi AVANT toute fiche (Nico/Depop, XEWER/Leboncoin, Johan/Beebs ; rapport `docs/enquetes/doublons-identifiant-2710/RAPPORT.md`)
- Une annonce relevée qu'un dépôt FillSell de CE compte, sur CETTE plateforme, désigne (job publish/republish publié,
  vendu ou annulé, non détaché ; `listing_designe`) rejoint la fiche de ce dépôt — jamais une fiche neuve, jamais une
  autre fiche par la photo. Le dépôt passe avant un job de suivi d'un relevé. Règle `annonce_rattacher_par_identifiant`
  (mig `20261027120000`), à l'entrée des DEUX portes : `rapprocher_importer` (seule porte d'une fiche « releve_* » :
  moteur, « Importer » de la personne, rattrapages) et `rapprochement_attacher` (rattachement par la photo).
- Dépôt publié → l'annonce prend son job ; clos sur fiche en stock → job de suivi (règle du 25/09) ; clos sur fiche
  vendue → le dépôt clos, rien retiré ni redéposé. Une annonce que la personne a détachée de cette fiche n'y revient pas.
- Cause (07/10, `6d6e012`) : le moteur v3 a remplacé `rapprocher_traiter_annonce` (identifiant publié OU clos, 25/09) ;
  `70a1bfe` (09/10) n'a remis que les dépôts publiés, avant la passe seulement.
- Après coup : `fiche_releve_doublon_resorber` absorbe (fusionne_dans + `inventaire_fusions`) une fiche née d'un relevé
  ET intacte ; sinon rend la raison (« à signaler ») — jamais une fiche avec vente, autre annonce ou job en cours.
- Selftest `selftest:releve-identifiant-avant-fiche` ; essai `scripts/essais/20261027120000_essai.sql` (18/18).

## 29/10 (lot B 4.2) — la garde anti-doublon d'une remise en ligne ne cite plus une annonce sans rapport (tiblancdeshaut)
- **Cas** : sweat GAP (c9fe1ee1, Beebs) : « 2 annonces apparues depuis le retrait » = un sac Michael Kors et un pantalon de
  ski, déposés AVANT le retrait mais vus pour la première fois par un relevé après (aucun relevé entre le 26/10 12:21 et
  le 28/10 08:15). Même défaut Leboncoin (« Service à thé » 1660ea94, 08/10).
- **Règle** (`_shared/recreation-deja-partie.js` trierCandidatesDepuisRetrait, `_shared/depot-coupe-tranche.js`) : une
  candidate est ÉCARTÉE — jamais rattachée — si (1) elle a été VUE AVANT le retrait : son numéro figure dans une liste
  « Mes annonces » lue par nos dépôts Beebs avant `deleted_at − 15 min` (heure du poste), ou Leboncoin la dit mise en
  ligne (`publiee_le`) avant `deleted_at − 5 min` (horloges serveur ; mesuré : notre redépôt est toujours en ligne ≥ 3,4 min
  après le retrait) ; (2) son numéro est celui qu'un autre job du compte a confirmé sur une AUTRE fiche
  (platform_listing_id, new_platform_listing_id, preuve_identifiant_beebs.id, lbc_depot.adsubmit.id) ; (3) sa ligne
  (inventaire_id, job_id, proposition) désigne une autre fiche. Même fiche : reste candidate. Les écartées et leur motif
  partent dans `recreation_verifiee` / `recreation_deja_partie.ecartees`. Jamais sur le titre.
- La règle « vue avant le retrait » ne vaut que pour une remise en ligne (repère `deleted_at` serveur), jamais pour un
  dépôt coupé `depot_deja_parti` (repère = fin de l'essai, heure du poste).
- Selftests : `recreation-deja-partie` (§ 6-7), `depot-coupe-tranche` (§ 10-11).

## ⛔ 31/10 (lot F, Johan) — une annonce remise en ligne sur la MÊME plateforme est une question, jamais une fiche neuve
- Deux annonces d'une même plateforme de relevé aux mêmes photos (≥ 2 quasi identiques), titre proche sans conflit, ni lot
  ni quantité > 1, **jamais vues par le même relevé** (`run_id` différents) = une succession (l'une a remplacé l'autre ;
  prix, description ou photos ajoutées peuvent changer). `moteur.js` (`succession`, étape 5) : l'annonce ouverte part en
  `a_verifier` (motif `remise_en_ligne_meme_plateforme`) vers la fiche d'origine (un nœud F d'abord, puis la plus
  ancienne), HORS du stock. Avant : « trois annonces sur la même photo » = « vendeur de lots » → `creer` → fiche en double
  au stock (12 chez Johan le 30/10).
- Inchangé : deux annonces vues par le même relevé = deux exemplaires (« Annonce en double ? » pour une paire, rien pour
  trois et plus) ; la republication v23 (tout identique, prix compris) reste rattachée automatiquement.
- La couverture : pour deux annonces successives, la première photo de l'une est aussi comparée à la deuxième de l'autre
  (photo ajoutée en couverture à la remise en ligne).
- ⛔ (31/10, décision 7b de Nico : REFUSÉ) Une succession prouvée avec un PRIX CHANGÉ n'est JAMAIS rattachée
  automatiquement : la question posée au vendeur reste (`rapprochement_republication_prouvee` inchangée).

## ⛔ 31/10 (décision 7a de Nico) — pendant une republication engagée, l'ancienne annonce n'est jamais datée disparue
- « Tant qu'une republication est engagée, à TOUTES ses étapes (« captured » comprise), l'ancienne annonce ne doit jamais
  être datée disparue ni marquée hors ligne par un relevé. » Engagée = `republication_engagee` : étape `captured` ou
  `deleted`, ou retrait engagé (`deleted_at`, suppression envoyée), statut pending/processing/needs_user. `a_capturer`
  n'est pas engagée (rien ne peut être retiré à cette étape) — c'est voulu.
- Existait depuis le 22/10 (migration 20261022200000) : la garde dans `constater_absences_releve` (date disparue +
  « Vendue ? »), le déclencheur `cross_post_jobs_alerte_tenue` (efface tout signal neuf : veilleur, relevé, dépôt sans
  lien) et `inventaire_disparu_garde_republication` (sync dressing Vinted, doublée côté extension) — cherchée par FICHE.
- Comblé le 31/10 (migration **20261031150000**, inverse dans `supabase/rollbacks/`) : la même garde cherchée aussi par le
  NUMÉRO de l'annonce visée (`republication_engagee_numero` : colonne, `old_platform_listing_id`, instantané,
  `vinted_item_id`, lien) — une annonce visée rattachée à une autre fiche (doublon, défusion) est protégée aussi.
  582 / 582 republications engagées retrouvées par leur numéro à l'application.
- Une synchro demandée pendant qu'une annonce est entre retrait et recréation attend la fin de la republication
  (« Ta synchro attend une remise en ligne ») : deuxième ceinture, inchangée.
- Ouvert, à décider par Nico : une republication `published` à l'étape `recreated` dont la recréation n'est pas encore
  confirmée est hors garde (Johan, 29/10 : « Vendue ? » posé sur les NOUVELLES annonces, levé par handler-watch).
