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
- Session perdue ou compte restreint = UNE ligne dans « À régler » (`compte_plateforme` ; règle `src/utils/alertesCompte.js`,
  écran `src/stock/EcranAlertesCompte.jsx`) : plateformes regroupées (« Connecte-toi à Vinted et Leboncoin »), restriction
  Vinted lue dans le diagnostic d'un job vivant (« Compte restreint jusqu'au JJ/MM »), jamais sur `null` (session jamais
  vérifiée), ni durée, ni mot technique, ni émoji. Masquable par plateforme (`platform_settings.alertes_compte.masquees`,
  écrit par `platform_settings_fusionner` seulement ; le masque tombe de lui-même quand la session revient ; une restriction
  reste masquée jusqu'à sa date de fin) ; interrupteur global Réglages › Préférences › Alertes de compte
  (`alertes_compte.desactivees`, actif par défaut). Lecture bornée (10 min, onglet visible, `demarrerRelecture`), jamais un
  `setInterval` ; le verdict de session est celui de `utils/sessionsPlateformes.etatSession` (le même que le reste de
  l'app). Aucun mail, aucun push. Selftest `alertes-compte` (21).
