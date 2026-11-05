# Lot « Ouverture du Cloud » (ordre de Nico, 05/11/2026 soir) — rapport point par point

Heures de Paris. Tout ce qui est écrit ici a été relu (console, base, serveur, code) au moment indiqué ; rien n'est
déduit d'une mémoire. Reprise : `docs/reprise/REPRISE-OUVERTURE-CLOUD-PHASE1.md`.

## Accès constatés au départ (05/11, 19:10-19:20)
- Stripe : le connecteur d'API n'ouvre QUE le mode réel (`acct_1TIT5gQZRA77vrWJ`, livemode) ; le tableau de bord n'est
  pas connecté dans le Chrome de Nico (page de connexion). Le mode test n'est donc joignable ni par l'API ni par l'écran
  tant que Nico ne s'est pas connecté lui-même (ou n'a pas posé une clé de test) — je ne me connecte jamais à sa place.
- App Store Connect : non connecté (page de connexion) — même règle.
- Google Play Console : connecté (NelsonCatStudio, développeur 8163945125173501051, app 4973021343170715891).
- Base de départ : 19 selftests Cloud et paiement VERTS (palier 83, cloud-pool 115, cloud-extension 98,
  cloud-orchestrateur, cloud-achat 41, cloud-textes-legaux 39, encart-cloud-bientot, offres-trois-jauges 124,
  cloud-prix-nom 50, paiement-stripe, option-cloud, cloud-ecrans 167, cloud-executant 49, cloud-voie 33,
  cloud-me-connecter 67, cloud-place-attente 44, achats-store-issue 42, stripe-un-paiement 10/10).

## Point 1 — essai de 7 jours
- **Google (lu dans la Play Console, 19:25)** : abonnement `app.fillsell.cloud.sub`, forfait `cloud-monthly`
  (mensuel, renouvellement automatique, 175 pays, mis à jour le 04/11 : « 1 ancien prix »), offre `cloud-trial-3d`
  ACTIVE : une seule phase « Essai gratuit — **7 jours** », éligibilité « Acquisition de nouveaux clients — N'ont jamais
  eu cet abonnement », 175 pays sur 175. L'identifiant garde « 3d » (un identifiant Google ne se renomme jamais) ; la
  durée est bien 7 jours. Prix du forfait : **24,99 EUR dans les 23 pays euro lus**, France comprise.
  Capture : `C:\Users\nicol\AppData\Local\Temp\claude-chrome-screenshots-10nIs2\screenshot-1793902474793-23.jpg`.

- **Apple (lu puis réglé dans App Store Connect, 19:37-19:50, Nico connecté)** : abonnement `app.fillsell.cloud.sub`
  (Apple ID 6819067675, groupe « FillSell Cloud » 22440194, niveau 1, 1 mois, état « Finaliser avant soumission »).
  Trouvé : prix **20,00 €** dans les pays euro, **AUCUNE offre d'introduction** (« Offres d'introduction (0) » : l'essai
  d'une semaine rempli le 04/10 n'avait jamais été confirmé). Fait :
  · offre d'introduction **« Gratuit la première semaine »**, 175 pays, du 05/11/2026 sans fin — confirmée ; capture
    `C:\Users\nicol\AppData\Local\Temp\claude-chrome-screenshots-10nIs2\screenshot-1793904206895-25.jpg` ;
  · prix recalculé sur la base **France 24,99 €** : les 25 pays euro à 24,99 € (Apple proposait 19,99 € au Monténégro,
    aligné à 24,99 € comme à 20 €), États-Unis 22,99 $, Canada 29,99 $ — confirmé puis relu (176 lignes, aucun pays euro
    hors 24,99 €) ; capture `C:\Users\nicol\AppData\Local\Temp\claude-chrome-screenshots-10nIs2\screenshot-1793904405642-26.jpg`.
  Reste pour la soumission (point 24) : nom d'affichage et description du groupe et de l'abonnement (FR, EN), capture
  d'écran de l'achat pour la relecture, notes de relecture ; puis « Ajouter pour vérification » avec la 2.9 (clic de Nico).
  ⚠ Bandeau ASC : le « Paid Applications Schedule » mis à jour doit être ACCEPTÉ par le titulaire du compte (Business) —
  accord juridique, geste de Nico ; sans lui, aucun nouvel achat intégré ne peut être soumis.
- **Stripe (lu en mode réel, lecture seule)** : produit `prod_VNfg9NASXvwpey`, seul prix actif
  `price_1UMuLDQZRA77vrWJZfZh2IS4` = **20,00 €**/mois, essai 7 j sur le prix (le prix 3 j est archivé). Le 24,99 € attend
  l'ordre de Nico (point 2). Le mode test n'est pas joignable (voir « Accès »).

## Point 14 — Depop : refus de ses capteurs sur le Cloud comparés au PC
- **Cloud** (enregistrement de fond de cloud-2, 04/11 18:35 → 05/11 18:00) : 151 × 403, tous non bloquants, sur
  `www.depop.com/vwdj/…` (scripts et `gs/ccm/collect`) et sur des pré-vols `OPTIONS` de `webapi.depop.com`
  (receipts, conversations, users/me, pictures) ; pages et API en 200 ; republications Depop 5/5 ; aucune glissière.
- **PC de Nico** (Chrome, IP de la maison, 05/11 19:30, lecture des ressources de la page d'accueil connectée) :
  `/vwdj/` (2 scripts) et `/vwdj/gs/ccm/collect` (×2) → **200** ; `webapi.depop.com` : 11 × 200, 2 × 202 (events).
- **Même adresse, sans navigateur** : `curl` depuis le PC → `/vwdj/` **200** (Cloudflare, CDG) ; `curl` depuis l'IP
  Hetzner NUE de cloud-2 → `/vwdj/` **403** ET page d'accueil **403** (Cloudflare).
- **Cause** : la réputation de l'ADRESSE, pas l'empreinte du navigateur (un `curl`, empreinte la plus pauvre, passe
  depuis l'IP de la maison). `/vwdj/` est une passerelle de mesure « first party » (chemin des balises Google servi par
  Depop derrière Cloudflare) avec une règle plus stricte que les pages : l'IP résidentielle de fournisseur (IP 42,
  Orange AS5511, vendue par IPRoyal) y prend 403, les pages passent ; une IP de centre de données (Hetzner) est refusée
  partout. Effet : aucun sur les gestes (Depop ne voit qu'une mesure d'audience absente, comme avec un bloqueur de
  pub) ; les pré-vols `OPTIONS` refusés par moments sont rejoués par la page (Depop 5/5).
- **Ce qui en découle** : (1) le pare-feu des navigateurs (sortie par le relais seulement) est vital — une sortie
  directe depuis Hetzner serait refusée par Depop ; (2) ces 403 ne doivent jamais compter comme signe anti-robot (c'est
  le cas : le verrou ne compte que les cadres `captcha-delivery`) ; (3) leur nombre par jour et par plateforme entre dans
  la mesure des coupures du point 11 ; (4) à revoir sur une autre IP du pool (autre fournisseur) quand l'AX42 arrive.

## Point 16 — mémoire par compte (cloud-2, compte de Nico, lecture seule, 05/11 19:20)
- Cgroup du navigateur, relevé toutes les 5 s de 10:14 à 15:43 (3 933 points, paliers de publication 1 et 2 compris) :
  mémoire totale médiane **1 060 Mo**, p95 1 216 Mo, max 1 357 Mo ; dont NON récupérable (anon + shmem) médiane
  **745 Mo**, p95 905 Mo, max 1 063 Mo ; cache de fichiers (récupérable) médiane 270 Mo ; 18 à 20 processus Chrome ;
  pointe vue par le noyau depuis le démarrage de 11:51 : 1 661 Mo.
- Relevé de l'orchestrateur toutes les 10 min sur toute la durée (04/11 18:44 → 05/11 19:11, 151 points) : médiane
  **874 Mo**, p95 1 035 Mo, max 1 136 Mo. À 19:20 : 930 Mo sur un plafond de 2 Gio.
- **Capacité estimée de l'AX42 (64 Go)**, en gardant ~4 Go pour le système, l'orchestrateur et Caddy : par la
  mémoire seule, ~30 comptes si chacun garde 2 Gio réservés (aucun débordement possible), ~45 comptes au p95 réel
  (1,25 Go). La puce graphique (Radeon 780M, mémoire prise sur la RAM) et le processeur (8 cœurs / 16 fils contre 32
  fils sur cloud-2) ne sont PAS mesurés : c'est l'essai de charge, qui attend l'AX42 (non fait, comme demandé).

## Point 9 — une plateforme rouverte repart tout de suite (serveur Cloud, codé et prouvé par selftests, NON déployé)
- Causes lues dans le code : (1) `verifications.resolue()` sortait sans rien faire quand AUCUN blocage du Cloud n'était
  ouvert — la pause de messagerie née d'un simple 403 (Beebs, 05/11 02:48:44) n'était donc jamais levée ; (2) une
  « Vérification de l'appareil » passée SEULE (DataDome répond `view: "redirect"` à son /interstitial/) n'était vue par
  personne hors de l'essai (le relevé des cadres d'une minute la rate : elle dure 2 à 4 s) ; (3) les tâches espacées par
  l'anti-robot (`blocage_antirobot`, `next_action_after`) attendaient leur heure même après un « Résoudre » réussi.
- Correctif (la règle, pour tous les comptes Cloud) :
  · `serveur-cloud/src/relanceTaches.js` : une plateforme rouverte relance ses tâches — seules les attentes marquées
    anti-robot / vérification sont levées (jamais une attente de cadence, de créneau ou de quota : la cadence est
    intouchable), état d'avant gardé (`relance_apres_verification.avant`), compare-and-set sur pending ; puis l'extension
    est réveillée (`__fillsellVerrouCloud.relancer()`, copie Cloud) au lieu d'attendre son alarme de 2 min ;
  · `verifications.resolue()` lève pauses et relance MÊME sans blocage ouvert ; `verifications.verificationPassee()` ;
  · `enregistrementFond.js` : un MODE LÉGER toujours actif (rien écrit sur le disque, seules les requêtes DataDome
    suivies) qui lit l'issue de chaque /interstitial/ — `redirect` → la plateforme est traitée comme rouverte ;
    `captcha` n'est jamais une preuve.
- Preuves : `serveur-cloud/tests/ouverture-cloud.test.mjs` (dans `selftest:cloud-orchestrateur`, 156/156) — issue lue,
  mode léger sans écriture ni Runtime/Page, relance limitée aux attentes anti-robot, `resolue()` sans blocage ouvert.
  Preuve réelle : au prochain « Résoudre » ou à la prochaine vérification passée seule sur cloud-2, après déploiement
  (journal `verification_passee_seule`, `taches_relancees`).

## Point 11 — le relais IP (serveur Cloud, codé et prouvé par selftests, NON déployé)
- Avant : un échec du tunnel vers le proxy amont rendait 502 à Chrome (ERR_TUNNEL_CONNECTION_FAILED) au premier coup ;
  aucun compteur ; aucune IP de secours.
- Correctif (`serveur-cloud/navigateur-chrome/relais.mjs`) : RÉESSAI SUR PLACE, 3 tentatives en moins de 3 s (0,4 s
  puis 1,2 s), seulement sur une panne passagère (connexion coupée, refusée, muette ; 502/503/504 du proxy), jamais sur
  un refus net (403, 407) ; COMPTEURS par jour (heure de Paris) et par plateforme : `echecs` (rendus à Chrome),
  `reprises` (sauvés par le réessai), `secours` — exposés dans `/etat` du relais et notés CHAQUE HEURE par
  l'orchestrateur dans `etat/coupures-relais.jsonl` (une ligne par compte, 7 jours).
- IP DE SECOURS : le relais sait l'essayer après les réessais (`PROXY_SECOURS`), mais elle est COUPÉE. Décision de Nico
  requise : une IP de secours PARTAGÉE entre comptes relierait ces comptes aux yeux des plateformes (le contraire de
  l'IP dédiée) ; une IP de secours PAR compte double le coût des IP (4 $/mois chacune). Proposition : décider sur la
  mesure — si les coupures restantes après réessai dépassent quelques-unes par jour et par compte, une IP de secours
  par compte payant, prise dans le stock et rendue au repos après usage.
- Preuves : test réel en local avec un faux proxy amont (coupure puis 502 puis 200 → tunnel ouvert, 1 reprise
  comptée ; 407 → une seule tentative, 1 échec ; 503 permanent → 3 tentatives puis 502).

## Point 12 — une mise à jour ne coupe rien en cours (serveur Cloud, codé et prouvé par selftests, NON déployé)
- Avant : `docker compose up -d` (deployer.sh) → SIGTERM → l'orchestrateur fermait tous les navigateurs sur-le-champ,
  quelle que soit la tâche en cours (une republication coupée entre retrait et remise en ligne restait hors ligne 45 min
  à 2 h). Seule garde : la règle humaine « jamais pendant une tâche en cours ».
- Correctif : `serveur-cloud/src/vidange.js` — à l'arrêt, chaque extension passe en VIDANGE (plus aucune nouvelle tâche
  prise : `__fillsellVerrouCloud.drainer`, le passage de la file est sauté), l'orchestrateur attend la fin des tâches
  « processing » (une tâche figée depuis plus de 45 min ne compte pas : elle relève de la reprise) puis des « Me
  connecter » ouverts, au plus `DRAIN_MAX_S` (600 s), puis ferme comme avant ; `stop_grace_period` 3 min → 12 min
  (au-dessus de la vidange). La copie de l'extension, elle, se met déjà à jour seule « au premier moment sûr ».
- Preuves : tests de la vidange (tâche finie au 3e relevé → 10 s d'attente ; tâche qui ne finit pas → rendue au bout du
  délai avec alerte ; rien d'ouvert → rien attendu ; délai d'arrêt du conteneur au-dessus).

## Point 10 — l'heure de chaque étape d'une republication (05/11 21:15 ; migration PRÉPARÉE, NON APPLIQUÉE)
- Déjà fait par l'autre terminal (28eb107, 743f7f6, 05/11) : la position de la barre se lit en base — même chiffre sur la
  carte du Stock, dans la file, la feuille ; posée dès l'affichage, jamais remise à zéro, jamais en recul. Rien retouché.
- Manquait : l'HEURE de chaque étape. La base ne gardait que la dernière (processing_since repart à chaque essai ;
  deleted_at et recreated_at viennent de l'horloge du poste ; rien ne disait quand la tâche avait été prise).
- Règle (migration `20261105230000_journal_etapes_republication.sql`, inverse dans `supabase/rollbacks/`) : un
  déclencheur BEFORE `zz_journal_etapes_republication` (nommé pour passer APRÈS les 25 déclencheurs BEFORE de la prod)
  note dans `platform_fields.journal_etapes` chaque passage d'étape (`republish_step` ou statut) d'une republication, à
  l'heure du SERVEUR, quel que soit l'écrivain (ordinateur, Cloud, fonctions, crons) ; 30 entrées au plus ; le journal
  est tenu par la base (une copie ancienne ou un objet neuf écrits par un client ne l'effacent ni ne le réécrivent).
- Affichage (web au push ; app avec le binaire 2.9) : dans « Ta file », sous la barre « En cours » et sur chaque ligne,
  « En file 20:58 · Prise 21:01 · Copie faite 21:02 · Ancienne retirée 21:05 · De retour en ligne 21:11 » — heures
  PASSÉES de Paris (depuisQuand), jamais promises. Sans journal (avant la migration), les horodatages déjà écrits
  (created_at, captured_at, deleted_at, recreated_at / published_at) : les heures se voient dès ce push.
- Preuves : `node scripts/preuve-journal-etapes-republication.mjs` — Postgres jetable avec les définitions de PROD de
  reserver_jobs_extension, controler_job_extension, ecrire_statut_job_extension, prendre_job : 21/21 (prise ordinateur
  et Cloud notées, battement sans entrée, journal forgé ignoré, objet neuf sans journal → historique gardé, état FINAL
  noté après un autre déclencheur, borne 30, ordre des déclencheurs de prod, coût mesuré 8 µs par écriture, inverse) ;
  `npm run selftest:heures-etapes-republication` (22). À appliquer sur feu vert NOMMÉ de Nico.

## Point 7 — serveur plein au moment du paiement (05/11 21:35 ; fonction de paiement NON déployée — jour d'ouverture)
- Relu en prod (lecture seule) : la PRÉPARATION (`cloud_essai_preparer_moi`, appelée par l'app AVANT Stripe, l'App
  Store ou Google Play) refuse « complet » quand il n'y a plus de place serveur (`cloud_vente_etat` : capacité des
  serveurs vivants − comptes servis − places gardées), inscrit sur la liste d'attente, et sinon RÉSERVE une IP 30 min
  (`cloud_param('reservation_min')`) qui compte comme place prise. Le trou : la page de paiement Stripe restait ouverte
  24 h (défaut de Stripe) — payable longtemps après que la place était partie.
- Correctif (`_shared/cloud-option.js`, `parametresCheckoutCloud`) : la session Checkout du Cloud EXPIRE 31 min après sa
  création (minimum de Stripe : 30 min) ; une page expirée ne se paie plus, la personne repasse par l'app et la place est
  relue. create-checkout-session n'a pas une ligne de plus (le paramètre vient du module partagé) : la non-régression
  des paliers reste verte (12/12).
- Le reste, déjà tenu : un paiement dans la dernière minute, ou un achat Apple / Google après la réservation, donne un
  compte actif sans place → l'écran dit « Ton FillSell Cloud démarre » puis, après 10 min, « plus long que prévu,
  l'équipe est prévenue » (63effea), et l'orchestrateur alerte (« Capacité atteinte : N compte(s) attendent un
  navigateur », « compte(s) Cloud actif(s) SANS IP »), avec l'alerte « Places Cloud sous le seuil » de la flotte.
- Preuves : `npm run selftest:option-cloud` (expiration à 31 min, bornes de Stripe) ; banc Stripe en mode test, parcours
  5 (Stripe accepte les paramètres EXACTS de production, une page expirée n'a plus de lien de paiement) — à passer avec
  la Stripe CLI autorisée.

## (Phase 2, point 19 — premières lectures, faites pendant la suite des selftests) Formats lus dans App Store Connect, 05/11 19:51
- Fiche de la version 2.9 (ASC, « Gestionnaire des visuels », langue Anglais (États-Unis)) : OBLIGATOIRE = « iPhone avec
  Dynamic Island (écran moyen) », écrans 6,1 ou 6,3 pouces — captures **1179 × 2556 ou 1206 × 2622** (portrait ; ou le
  paysage), 10 au plus ; aperçus vidéo **886 × 1920** (ou 1920 × 886), 3 au plus. FACULTATIF : iPhone avec Dynamic
  Island (grand écran), iPhone avec Face ID (grand écran : 1242 × 2688, 1284 × 2778 ; 4 captures déjà là, venues d'une
  version précédente), **iPhone Duo** (nouvel appareil : ASC invite à charger des visuels adaptés), iPhone avec bouton
  principal, iPad 13 pouces, Apple Watch. Nouveau : un « En-tête » de page produit et ses « Résultats de recherche ».
  À compléter en phase 2 : tailles exactes iPhone Duo et iPad (sections repliées), durée et format des aperçus vidéo
  (aide Apple liée depuis la page).
