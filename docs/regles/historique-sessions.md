# Historique des sessions (ex-CLAUDE.md, état de production daté)

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- « État de production au 08/10 » (en-tête et liste des sections de l'état) (ex-L1-11)
- 15/10 soir — mission de clôture (1 → 14) (ex-L12-22)
- 15/10 jour — clore tous les points (ex-L23-30)
- 15/10 nuit — reprise en main (P1-0 → P11) (ex-L31-37)
- 12/10 nuit — clôture A1 → A11 (Morgane) (ex-L46-58)
- 11/10 nuit — lot Louis (fin) (ex-L70-78)
- 11/10 soir — lot de dix points (ex-L79-93)
- 11/10 fin d'après-midi (Louis) — boutique, ancienneté, quota (ex-L94-104)
- 11/10 midi — lot unique (ex-L113-122)
- 05/10 — lot du jour (sessions extension, remise en vente, eBay, veille des commandes, palier) (ex-L333-342)
- Ouvert (binaires 2.9.38, comptes en suspens) (ex-L455-460)

<!-- ex-CLAUDE.md L1-11 : « État de production au 08/10 » (en-tête et liste des sections de l'état) -->
## État de production au 08/10 — lire avant toute action

`docs/agents/etat-2026-10-01.md` (versions, crons, ce qui est ouvert ; sections
« 03/10 nuit — clôture Louis + marque + prix » et « 04/10 matin —
complément », « 04/10 fin de matinée — chantier Louis », « 04/10 soir —
incident CPU », « 04/10 nuit — six défauts clients » et « 05/10 — lot
terminal Problèmes » / « 05/10 après-midi » / « 06/10 » / « 06/10 soir » / « 06/10 nuit » / « 08/10 nuit — MULTI-SYNCHRO » / « 08/10 matin — boucles » / « 08/10 fin de matinée — SUJET CLOS » / « 08/10 après-midi — complément » / « 08/10 soir — fin du chantier multi-synchro » / « 08/10 nuit — Bebertdeals : remise en ligne Vinted » / « 08/10 nuit — VENTES PROUVÉES » / « 09/10 nuit — DEPOP » / « 09/10 fin de matinée — DEPOP : reprise complète » / « 11/10 — une vente signalée une fois » / « 11/10 midi — LOT UNIQUE » / « 11/10 après-midi — POIDS LEBONCOIN » / « 11/10 fin d'après-midi — BOUTIQUE, ANCIENNETÉ, QUOTA » / « 11/10 soir — LOT DE DIX POINTS » / « 11/10 nuit — LOT LOUIS (fin) » / « 11/10 nuit — DEPOP COMME OPLA » / « 12/10 nuit — CLÔTURE » / « 15/10 nuit — REPRISE EN MAIN » / « 15/10 jour — CLORE TOUS LES POINTS » / « 15/10 soir — MISSION DE CLÔTURE » en fin ; reprises : `docs/reprise/terminal-depop-0910.md`, `docs/reprise/terminal-ventes-prouvees-0810.md`, `docs/reprise/terminal-bebertdeals-0810.md`, `docs/reprise/terminal-boucles-0810.md`, `docs/reprise/terminal-cloture-multi-synchro-0810.md`, `docs/reprise/terminal-complement-0810.md`, `docs/reprise/terminal-fin-multi-synchro-0810.md`) et
`docs/agents/consignes-2026-09-28.md` (règles), qui remplacent tout historique
contraire. Il se périme : `functions list`, `cron.job` et
`profiles.extension_build` font foi.


<!-- ex-CLAUDE.md L12-22 : 15/10 soir — mission de clôture (1 → 14) -->
- **⛔ 15/10 soir — MISSION DE CLÔTURE (1 → 14)** — état : `docs/agents/etat-2026-10-01.md` § « 15/10 soir », rapport
  `docs/enquetes/cloture-1510-soir/RAPPORT.md` : migs **20261015150000 / 160000 / 170000 / 180000 APPLIQUÉES** ;
  gpj **v249**, uj **v136**, hw **v108**, rapprochement **v26**, **rapprochement-ia** (nouvelle, `false`, cron 53
  `rapprochement-ia-2min`, interrupteur coin_config `rapprochement_ia_actif`) ; ⛔ **une lecture « plus en ligne »
  n'est jamais un verdict** (pause, relevé qui tranche : `_shared/introuvable-a-confirmer.js`) ; ⛔ **l'IA ne répond
  qu'aux doutes « Est-ce le même article ? »** (Haiku, miniatures, un verdict par paire, 1 €/compte/passage, jamais le
  titre seul, jamais deux annonces d'une plateforme, jamais chez un compte qui a dit « Non, deux exemplaires ») ;
  ⛔ **Leboncoin/Beebs/Depop = une annonce hors ligne à la fois** ; ⛔ **un push de notes seules ne reconstruit pas le
  site** (`vercel.json` ignoreCommand) ; ⛔ **Cloudflare ne garde plus jamais un 404 sous /assets/** (Cache Response
  Rule « Assets : jamais un 404 en cache » : no-store, BYPASS) ; OTA/web **2.9.93** ;
  extension **0.6.113 À TÉLÉVERSER** (`build/CWS-0.6.113-A-TELEVERSER/`).

<!-- ex-CLAUDE.md L23-30 : 15/10 jour — clore tous les points -->
- **⛔ 15/10 jour — CLORE TOUS LES POINTS (A → H, C-bis, P16 → P18)** — état : `docs/agents/etat-2026-10-01.md` § « 15/10 jour » :
  migs **20261015100000 / 110000 / 120000 / 130000 / 140000 APPLIQUÉES** ; gpj **v247**, uj **v135**, hw **v106**,
  stripe-webhook **v59**, empreintes-urls **v7**, rapprochement **v25** (moteur v23) ; ⛔ **republication d'une même
  plateforme = une fiche seulement si TOUT est identique** (photos ≥ 2 à ≤ 2, titre, description, prix ; ni lot ni
  quantité > 1 ; jamais chez une personne qui a répondu « Non, deux exemplaires » ; la base revérifie) ; ⛔ **une
  plateforme à deux annonces sur une fiche vendue = « Déjà vendu ? » pour chacune**, jamais le silence, jamais un retrait
  d'office ; ⛔ un échec PASSAGER d'empreinte (429, 5xx, réseau) n'est jamais noté illisible ; ferreirasab rejouée :
  896 → 428 questions ; OTA/web **2.9.92** ; extension **0.6.112 À TÉLÉVERSER** (`build/CWS-0.6.112-A-TELEVERSER/`).

<!-- ex-CLAUDE.md L31-37 : 15/10 nuit — reprise en main (P1-0 → P11) -->
- **⛔ 15/10 nuit — REPRISE EN MAIN (P1-0 → P11)** — rapport `docs/enquetes/reprise-1410/RAPPORT.md`, journal
  `journal-reprise.md` : migs **20261015000000** (« Vendue » jamais une boucle), **010000** (commande Vinted annulée →
  stock), **020000** (tête de file) APPLIQUÉES ; gpj **v245** (⛔ toute lecture `.in()` de masse par
  `_shared/par-lots.ts` ; garde de boutique = Vinted SEULE ; module auto en pause = jobs auto retenus) ; hw **v104**
  (reprise sur preuve des pauses techniques avant retrait ; dépôts mis de côté à tort repris par paquets + disjoncteur) ;
  OTA/web **2.9.88** ; extension **0.6.111 À TÉLÉVERSER** (`build/CWS-0.6.111-A-TELEVERSER/`). Louis : PRO = @neyenonie,
  PERSO = @evat. rapprochement v22 : DÉJÀ dans main (vérifié 15/10, l'avertissement ci-dessous est périmé).

<!-- ex-CLAUDE.md L46-58 : 12/10 nuit — clôture A1 → A11 (Morgane) -->
- **⛔ 12/10 nuit — CLÔTURE (A1 → A11, Morgane)** — rapport `docs/enquetes/cloture-1210/RAPPORT.md` : plus de plafond à 20
  (seule limite le quota, dit avant de lancer ; lot réel de 21 sur Depop) et vrai bouton « Choisir des articles à publier » ;
  ⛔ **un rayon que la plateforme n'accepte plus est choisi par le moteur** (`_shared/rayon-refuse-moteur.js`, feuilles seulement,
  handler-watch débloque les jobs en pause — l'Horloge de Louis est repartie seule) ; disjoncteur = échec DU COMPTE seul
  (mig **20261012090000 APPLIQUÉE**) ; remise en ligne ratée : sortie de file, ou protection DITE si la cause est le compte ;
  ⛔ **jamais un retrait d'article vendu en silence** (murs « boutique » nommée / « ordinateur », bandeau prioritaire) ;
  roue visible 320 → 1920 ; ⛔ **chaque notification Apple/Google a sa décision** (`_shared/notifications-stores.js`,
  journal `stores_notifications_journal` mig **20261012100000 APPLIQUÉE**, borné à 2 s, JAMAIS bloquant ; inconnu = alerte ;
  Ciddjy réparé) ; compteur Depop du popup (serveur) ; champs Leboncoin remplis seuls, jamais une question sans choix ;
  « noël » n'est pas un objet ; ⛔ **un livre ne part jamais sur Vinted sans ISBN, ni sans le dire** (`vintedExigeUnIsbn`,
  ISBN lu sur les photos `_shared/isbn-ia.ts`, « Ce livre n'a pas d'ISBN ») ; eBay « compte à finir » = lien direct.
  gpj **v241**, hw **v102**, gl **v117**, rc **v15**, worker **v85**, webhooks Apple **v37** / Google **v28** ;
  OTA **2.9.86** ; push `0a1ff78` ; extension INCHANGÉE : **0.6.110 BONNE À TÉLÉVERSER**. Selftests 285/285.

<!-- ex-CLAUDE.md L70-78 : 11/10 nuit — lot Louis (fin) -->
- **⛔ 11/10 nuit — LOT LOUIS (fin)** — rapport `docs/enquetes/lot-louis-1110/RAPPORT.md` : **la ligne du
  créneau suit le réglage** (mig **20261011180000 APPLIQUÉE** : Vinted @evat figé depuis 14:15, fin déplacée
  12–14 → 23:59 ; 4 republications parties seules dès 17:18) ; **un attribut distinctif écarte la paire
  d'office** (couleur, nombre, taille, dimension ; mig **20261011190000 APPLIQUÉE**, `rapprochement` **v19** ;
  Louis 18 questions → 0, parc 2 154 → 1 975) ; ⛔ **logo texte en dégradé italique : marge EN EM ≥ .25em**
  (le « l » de fillsell.app était coupé ; `selftest:marque-italique-entiere`, cartes de partage régénérées) ;
  **en-tête de l'app à trois groupes** (`.tb-left` / `.header-centre` / `.tb-right`, côtés à part égale :
  profit centré sur « Lens ») — roue des réglages hors écran ≤ 375 px PRÉEXISTANTE, non corrigée. OTA
  **2.9.84** ; selftests **273/273** ; push `1dc13d2`. Passation Depop : `PASSATION.md` § 4 du même dossier.

<!-- ex-CLAUDE.md L79-93 : 11/10 soir — lot de dix points -->
- **⛔ 11/10 soir — LOT DE DIX POINTS** — rapport `docs/enquetes/lot-1110-soir/RAPPORT.md` :
  **poids Leboncoin FACULTATIF** (« Laisser Leboncoin estimer » par défaut / « Saisir le poids », choix retenu
  `platform_settings.leboncoin.poids_choix` ; la règle « jamais servie sans poids » de la v234 est RETIRÉE) ;
  ⛔ **stock et ventes lus EN ENTIER** par pages (PostgREST coupe à 1 000 sans erreur : 18 comptes, 9 267 fiches
  invisibles) — tout `.in()` de masse par lots de 400 (`utils/parLots.js`) ; ⛔ **pré-vol de RECRÉATION avant tout
  retrait** Leboncoin/Depop (ext. 0.6.109, capacité `prevol_recreation_v1`) + filet serveur server_400 pour les anciens
  postes ; ⛔ **un relevé ne gèle que SA plateforme** (30 min max) ; identité = sonde, relevé OU capture ; pause
  « introuvable » sous identité illisible levée quand la bonne boutique est vue ; compte-gouttes équitable ;
  ⛔ **couleur jamais une question à la publication** (IA photo `resolve_couleur`, generate-listing **v116**, repli
  « Multicolore » ; republication sans IA) ; **aucune marque → « Sans marque »**, réponse « marque » rangée sur
  l'article (`attributs.marque_vinted`) ; boutique Vinted relue juste avant le dépôt (0.6.109). Mig **20261011170000
  APPLIQUÉE** (prix de recréation d'une vente prouvée / à confirmer). gpj **v237** ; OTA **2.9.83** ; extension
  **0.6.110 À TÉLÉVERSER** (`build/CWS-0.6.110-A-TELEVERSER/`, BUILD_ID `2026-10-11T14:31:05Z+a3c5aef` ; la 0.6.109
  est TOMBÉE au test réel : « Quitter » introuvable en fenêtre de travail étroite → bouton-icône aria-label, corrigé ;
  numéro 0.6.109 brûlé, dossier dans CWS-PERIMES). Test réel 11/10 : rapport du lot, § « Test réel ». Selftests 270/270.

<!-- ex-CLAUDE.md L94-104 : 11/10 fin d'après-midi (Louis) — boutique, ancienneté, quota -->
- **⛔ 11/10 fin d'après-midi (Louis)** — rapport `docs/enquetes/louis-republication-boutique-quota-1110/RAPPORT.md` :
  **une publication Vinted (remise en vente comprise) ne part que sur la boutique de sa fiche** (gpj **v235**,
  `verifierBoutiquePublicationVinted` ; article sans boutique chez un compte à plusieurs boutiques = question fermée
  « Boutique Vinted », jamais un défaut) ; l'annonce partie sur @evat (https://www.vinted.fr/items/10327294017) est
  LAISSÉE, Nico décide ; 47 imports rattachés à leur boutique (`_backup_1110_boutique_imports_vinted`).
  **Ancienneté** : Vinted lit déjà la date de l'annonce (`listed_at_guess`) ; Leboncoin importé = date réelle
  (`annonces_plateforme.publiee_le`, mig **20261011151000 APPLIQUÉE**, extension **0.6.108 À TÉLÉVERSER**
  `build/CWS-0.6.108-A-TELEVERSER/`, embarque la 0.6.107) ; Beebs/Depop : aucune date lue → inchangés.
  **Quota par compte** : `quotas_par_compte` + `quota_annonces_compte` (mig **20261011150000 APPLIQUÉE**) ;
  Louis = 1 000/mois ; retirer : `delete from public.quotas_par_compte where user_id = '…';`. OTA **2.9.82**.
  Search Console : « Valider la correction » lancé pour les deux problèmes uploadDate.

<!-- ex-CLAUDE.md L113-122 : 11/10 midi — lot unique -->
- **⛔ LOT UNIQUE DU 11/10 (midi)** — rapport `docs/enquetes/lot-1110/RAPPORT.md` :
  **A5** signal de vente Vinted refusé en 403 depuis le 09/10 (~12:00 : déclencheur aux droits de l'appelant →
  `_ts_ou_null`) → fiches « vendu » sans ligne ; **mig 20261011120000 APPLIQUÉE** (definer + garde
  `inventaire_0_vendu_vinted_par_la_vente`), rattrapage 37 ventes / 14 « Vendue ? », 0 mail ;
  ⛔ tout déclencheur aux droits de l'appelant n'appelle QUE des fonctions ouvertes à authenticated
  (`selftest:declencheurs-droits -- --prod`). **A2** Opla : **mig 20261011130000 APPLIQUÉE**, A3/A4 du 02/10
  RÉVOQUÉS — plus AUCUNE action Opla (job né ou relancé = clos, aucun relevé, aucune question) ; 31 jobs clos.
  **A3** gpj **v233** : republication retenue par une autre à 'deleted' = non servie, motif écrit ;
  `pfAPersister` (rien de servi n'est figé en base). **A1/A4** app. OTA **2.9.80** ; handler-watch v96 ;
  extension **0.6.107** À TÉLÉVERSER (`build/CWS-0.6.107-A-TELEVERSER/`).

<!-- ex-CLAUDE.md L333-342 : 05/10 — lot du jour (sessions extension, remise en vente, eBay, veille des commandes, palier) -->
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

<!-- ex-CLAUDE.md L455-460 : Ouvert (binaires 2.9.38, comptes en suspens) -->
- **Ouvert** : binaires **2.9.38** (AAB
  `build/AAB-A-TELEVERSER-2.9.38-vc32/`, iOS par Codemagic) ; ornellaracano
  307204072564, jocabroc8, carhoa : cf. l'état du 01/10 ; livre eBay de
  geronimo0550 (« Faire une offre » activé, non touché) et le reste : fin de
  l'état (« 03/10 soir — clôture »).

