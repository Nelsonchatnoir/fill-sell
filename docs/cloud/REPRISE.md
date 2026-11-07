# FillSell Cloud — REPRISE (à lire EN ENTIER avant toute action)

## 07/11/2026 ~12:00 — compteur de places + liste d'attente (web, OTA) ; cloud.fillsell.app NON repointé
- **Compteur** (décision de Nico) : « 14 places restantes » sur les trois blocs d'offre de la feuille des formules
  (interrupteur, Free + Cloud, ajout à une formule) et sur l'étape Cloud de l'entrée. Le nombre = `places` de
  `cloud_vente_etat` (celui de la vente, renvoyé par `cloud_disponibilite_moi`, relu en prod : 14 pour un compte
  ordinaire, 12 ms la lecture) ; vente impossible (complet, aucune IP) = le bloc « Complet » à la place, jamais « 0 » ;
  relu seul une fois par minute, onglet visible, par `relectureBornee` (jamais setInterval ; HoteCloud garde sa lecture
  unique). Liste d'attente (existait depuis le 03/11) : « M'inscrire sur la liste d'attente » (un geste, sans payer)
  puis « Tu es sur liste d'attente (n° N) » ; prévenu(e) dans l'ordre par push-cloud-place (cron 5 min, place gardée
  24 h) ; jamais de paiement sans place (cloud_essai_preparer_moi). Code : src/cloud/useDisponibiliteCloud.js,
  InterrupteurCloud.jsx, textes.js, src/entree/useCloudEntree.js, EtapeCloud.jsx — tout web (OTA), rien de natif ;
  la notification elle-même n'arrive qu'aux binaires avec le module push (2.9.62+ ; en ligne : iOS 2.8, Android 2.9.10
  n'en ont pas) — les autres voient le bandeau « place libre » en ouvrant l'app dans les 24 h.
- ⚠ Écart connu : `places` compte les places SERVEUR ; l'IP n'entre que comme oui/non (`ip`). Pool relu le 07/11 :
  7 IP libres pour 14 places → sans achats d'IP, le compteur descend de 14 à 8 puis passe à « Complet » (pool_vide).
  Remède au choix de Nico : achats d'IP rallumés le jour de l'ouverture, ou `places` = min(places, IP attribuables)
  comme `cloud_attente_places_a_offrir` (migration à préparer, feu vert nommé).
- **cloud.fillsell.app** : PAS repointé. cloud-2 ne sert que `{$DOMAINE}` = cloud-2.fillsell.app (Caddyfile) : essai
  `curl --resolve cloud.fillsell.app:443:5.9.80.213` → poignée TLS refusée (code 000). Le serveur, lui, refuserait
  proprement un compte qui n'est pas à lui (jeton Supabase vérifié, puis attribution à CE serveur, connexion.js).
  Deux voies, décision de Nico : (a) ajouter `cloud.fillsell.app` au site du Caddyfile de cloud-2 (redémarrage de Caddy
  seul), puis A `cloud` → 5.9.80.213 (nuage gris), Caddy prend le certificat, relire `/sante` et `/connexion/ws` ;
  (b) supprimer l'enregistrement et retirer le repli `CLOUD_DOMAINE` de l'app. IPv4 de cloud-1 gardée jusque-là.

## 07/11/2026 10:35 — cloud-1 RETIRÉ ET SUPPRIMÉ (ordre de Nico) ; passe d'ouverture préparée
- Base 10:34:05 : `scripts/reparations/20261107_cloud1_retire.sql` (preuve Postgres jetable 13/13 :
  `PREUVE_PG=embarque node scripts/cloud/preuve-retrait-cloud1.mjs`) → cloud-1 `etat = 'retire'`, ligne d'avant dans
  `public._backup_0711_cloud1_serveur` ; relu : 0 compte, 0 job, cloud-2 « actif » 14 places. Inverse :
  `…_cloud1_retire_INVERSE.sql` (sans objet : le serveur n'existe plus).
- Hetzner 10:34:35 → 10:34:52 : serveur 168804683 (cx43) SUPPRIMÉ (SSH ne répond plus, relu) ; pas d'IP flottante, de
  volume ni d'instantané. **IPv4 178.105.24.16 GARDÉE** (« cloud-1-ipv4-gardee-dns-cloud-fillsell-app », ≈ 0,50 € HT/mois) :
  le DNS `cloud.fillsell.app` pointe encore dessus et l'app se replie sur `wss://cloud.fillsell.app` avec le jeton de
  session quand `cloud_serveur_moi` ne rend pas de domaine (`src/cloud/MeConnecterCloud.jsx:38`,
  `CLOUD_DOMAINE` de `src/config/cloudOffer.js`) : une IP rendue à Hetzner pourrait recevoir ces jetons. Restes, dans
  l'ordre : (1) Nico : Cloudflare › fillsell.app › DNS, enregistrement A `cloud` supprimé ou pointé sur 5.9.80.213 ;
  (2) code : repli `CLOUD_DOMAINE` retiré (src/ — avec un lot, pas pendant le travail du terminal PROBLÈMES) ;
  (3) puis IP gardée supprimée (Hetzner Cloud › Networking › Primary IPs).
- Les procédures « retour vers cloud-1 » plus bas n'ont plus d'objet. Ouverture automatique (décision du 07/11) :
  `docs/reprise/JOUR-OUVERTURE-CLOUD.md`, bloc du 07/11 (liste vidée AVANT l'interrupteur).

## 07/11/2026 10:20 — copie Cloud 0.6.176, nuit du compte de Nico relue (terminal Cloud)
- **Copie Cloud de l'extension = 0.6.176.44695** (`0.6.176-cloud`, BUILD_ID `2026-11-07T09:18:22Z+7eb60f6-cloud`), posée
  10:18:35 par `EXTENSION_SEULE=1 …/deployer.sh` (vidange vide, navigateur de Nico rouvert 10:18:42, coffre 4 plateformes,
  `profiles.extension_version` relu = 0.6.176.44695 à 10:18:50). Inverse : `archives/fillsell-cloud.crx` + `update.xml`
  (0.6.175.44618), `extension.ancienne` → `extension`, `docker compose restart orchestrateur`. Parc relu : 50 comptes en
  0.6.176, 36 en 0.6.175. ⚠ La vidange a dit « 0 tâche » alors qu'un pré-vol Leboncoin tournait (verdict écrit à
  10:18:34.9, navigateur fermé à 10:18:35.4) : un pré-vol (job encore `pending`) n'est pas vu par la vidange — sans
  dégât ici (rien n'est retiré avant le verdict), à regarder.
- **Republication Leboncoin 32e12d08 (Nico)** : « illisible » à 09:14, 09:46, 10:18 = ni anti-robot ni lecture ratée par
  hasard : ses 3 photos sont sur `images1.vinted.net`, que `urlToFile` (content script Leboncoin) lit SOUS LE CORS DE LA
  PAGE ; le CDN de Vinted ne répond `Access-Control-Allow-Origin` qu'à `https://www.vinted.fr` (relu au curl : rien pour
  `https://www.leboncoin.fr`) → « Failed to fetch » aux 6 essais → pré-vol « illisible » → +30 min, à l'infini (aucun
  essai consommé). RÈGLE, pas cas : depuis toujours, **0 job Leboncoin à photos Vinted publié** (32 annulés, 22 en
  attente, 5 comptes) ; le message promet un rapatriement qui n'existe pas (`photos_a_rapatrier = false`). Rien corrigé
  (rapport demandé) ; correctif à décider par Nico.
- **Signes anti-robot « de 03:00 »** = UN défi Beebs à **04:15:42** (heure de Paris ; 03:15 UTC) : `datadome_vu`
  (interstitiel) puis `verification_passee_seule` 5 s plus tard, compté deux fois par l'agent (datadome +
  vérification de l'appareil). Aucun job : visite de fond de la messagerie / des commandes Beebs (8 à 16 min).
- **Mémoire du compte** (cloud_charge_heures) : max 1 001 Mo (22h) → 1 314 (03h) → 1 197 (04h) → 1 334-1 338 de 07h à
  10h, non récupérable médian 720 → 1 010 → 800-910 : montée de chauffe après le redémarrage de 21:20 puis plateau dans la
  fourchette de référence (1,26-1,36 Go) ; pas de fuite visible sur 13 h (à relire sur 48 h).

## ⛔ ÉTAT DU CLOUD AU 06/11/2026 21:35 — l'enchaînement a–d est FAIT (décisions de Nico du 06/11 soir)
`SSH1` = `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16` (cloud-1) ; `SSH2` = `… root@5.9.80.213` (cloud-2).
- **cloud-2** (seul serveur qui sert) : orchestrateur **b381d51077ad** (21:08:43, « orchestrateur seul ») ; image Chrome
  **fillsell-chrome:61fb7ddd6e2a** (inchangée) ; copie Cloud de l'extension **0.6.175.44618** (`0.6.175-cloud`, BUILD_ID
  `2026-11-06T20:19:59Z+b381d51-cloud`, posée à 21:20, profil de Nico : seule la 0.6.175 installée) ; `.env` :
  `NAVIGATEURS_MAX=15`, `ENDURANCE=0`, `ENTRETIEN_POOL=1` (le pool est tenu par cloud-2 depuis 21:09:47),
  `IPROYAL_ACHATS_AUTORISES=1`, `ALERTES_MAIL=1`, `ENREGISTREMENT_FOND=0` (mode léger, rien sur le disque depuis 21:08:42),
  `ENREGISTREMENT_CONNEXIONS=0`. Déclare au battement `service.apte = true` (rendu « Mesa Intel(R) Graphics (RPL-S) »,
  `logiciel: false`). Agent **fillsell-mesure** actif depuis 21:13:43 (première ligne de `cloud_mesures` à 21:18:45).
  Sauvegardes : `archives/env-avant-0611-etape-c`, `archives/deploiement-env-avant-0611-etape-c` (61fb7ddd6e2a),
  `archives/fillsell-cloud.crx` + `update.xml` (0.6.169.44468), `/srv/fillsell-cloud/extension.ancienne`.
- **Base** : migrations **20261106210000** (mesures, 21:10:43) puis **20261106200000** (attribution, 21:11:28, APRÈS avoir
  lu `apte = true` — condition de Nico) appliquées et inscrites (`migration repair`), feux verts nommés de Nico.
  Relu : Nico sur cloud-2 (aucune origine notée), `cloud_places_libres()` = 14, `cloud_charge_heures` reçoit ses lignes.
- **cloud-1** : orchestrateur ARRÊTÉ depuis 19:27:43, `ENTRETIEN_POOL=0` (`archives/env-avant-0611-pool-vers-cloud2`) ;
  ne bat plus (vu 19:27:35) → jamais choisi. Retrait (« retire ») et suppression Hetzner : après l'observation, sur feu
  vert de Nico.
- **Compte de Nico** après les deux redémarrages : navigateur rouvert 21:08:50 puis 21:20:24, coffre repris du profil (4
  plateformes), 0 signe anti-robot ; la republication Leboncoin en attente (créée le 05/11) prise par la 0.6.175 à 21:28,
  reportée par la cadence à 22:00:35 (aucune attente anti-robot notée) — **à relire au prochain check** : sa publication.
- **À suivre** : l'extension du parc passe en 0.6.176 (terminal « Problèmes ») → la copie Cloud suit, en un geste
  (`EXTENSION_SEULE=1 bash serveur-cloud/outils/deployer.sh 5.9.80.213 cloud-2.fillsell.app`), pour que le compte de
  relecture Apple voie la même version que le parc. L'état de prod (`docs/agents/etat-2026-10-01.md`) reçoit ces lignes
  quand l'autre terminal aura commité ses modifications en cours de ce fichier.

## L'ENCHAÎNEMENT (décisions de Nico du 06/11 ~19:20) — pour l'histoire et les inverses
- **a. FAIT 19:27:43** — cloud-1 lâche le pool : `.env` sauvegardé, `ENTRETIEN_POOL=0`, orchestrateur ARRÊTÉ. Inverse :
  `.env` remis, `cd /srv/fillsell-cloud/deploiement && docker compose start orchestrateur`.
- **b. FAIT** — ordre des photos (3e7ec79) poussé par le terminal « Problèmes » ; suite complète **603/603** verte avec
  les deux travaux réunis ; lot Cloud b381d51 commité ; poussé par Claude sur ordre de Nico avec 173f5f6 du terminal
  « Problèmes » (`3e7ec79..b381d51`, son propre push avait été refusé par son garde-fou).
- **c. FAIT 21:08 → 21:19** — détail ci-dessus. Inverses : les deux `.env` remis + `docker compose up -d --no-deps
  orchestrateur` ; migrations : `supabase/rollbacks/<version>_…_INVERSE.sql` ; agent : `systemctl disable --now fillsell-mesure`.
- **d. FAIT 21:20** — `EXTENSION_SEULE=1 …/deployer.sh` (vidange vide, un redémarrage). Inverse : remettre
  `archives/fillsell-cloud.crx` + `update.xml`, `extension.ancienne` → `extension`, `docker compose restart orchestrateur`.
- **e. EN COURS** — la mesure tourne seule ; Claude la lit à chaque check news (requêtes ci-dessous).
- Après l'observation, sur feu vert de Nico : `cloud_serveurs` cloud-1 → « retire » (script de réparation + inverse, à
  écrire), puis suppression du serveur Hetzner ; premier utilisateur choisi, ajouté seul à `COMPTES_AUTORISES`.


## LA CHARGE SE MESURE EN RÉEL (décisions de Nico, 06/11 soir : plus d'essai synthétique, des utilisateurs ajoutés un par un)
- **Base de calcul = cloud-2 SEULEMENT** (correction de Nico, 06/11 ~19:20 : les mesures de cloud-1, autre machine, autre
  réglage, ne comptent pas) : un compte = **1,26 à 1,36 Go** (mémoire du conteneur), **pointe 1,66 Go** ; processeur
  0,033 fil en moyenne, pointes au plafond de 1,5 fil ; puce ≈ 0 % (0,57 s de rendu en 20 h).
- **NAVIGATEURS_MAX = 15 = la valeur de DÉPART**, l'objectif de Nico est **30** (15 ne couvrent pas le coût du serveur).
  15 comptes ≈ 19 à 20 Go (pointe 25 Go) sur 62 ; même si les 15 publient ensemble : 22,5 fils sur 32 ; ce qui n'a jamais
  été mesuré : la puce et l'écran X partagés par plusieurs vrais comptes, et plusieurs comptes à la même empreinte
  matérielle face à DataDome. À 30 : ≈ 38 à 41 Go (pointe 50 Go) — d'où la règle chiffrée ci-dessous.
- **Mesure continue** : agent `fillsell-mesure` de l'hôte (lecture seule ; relevé toutes les 30 s, une ligne toutes les
  5 min dans `public.cloud_mesures`) : par compte, mémoire (médiane, max, non récupérable), processeur (fils), puce (moteur
  de rendu de SON processus graphique, fdinfo i915), bridage, oom, et les **SIGNES ANTI-ROBOT** de la fenêtre, lus dans le
  journal de l'orchestrateur : `datadome` (un défi DataDome qui s'ouvre : `datadome_vu`), `verification_appareil`,
  `glissiere`, `restriction`, `blocage` (le journal ne garde que 8 caractères d'un compte : les vues comptent par ce préfixe).
  **Lire à chaque check news** :
  `select * from cloud_charge_heures order by heure desc limit 24;` (par heure : hôte, mémoire par compte, signes, jobs du
  Cloud faits / ratés / annulés, durée médiane et p95) ;
  `select * from cloud_charge_comptes where jour = (now() at time zone 'Europe/Paris')::date;` (compte par compte : signes
  par catégorie, mémoire, processeur, puce, jobs) ; `select * from cloud_passage_30;` (la règle ci-dessous).
- **Alerte de capacité** (support@, `ALERTES_MAIL=1`, une alerte puis un rappel au plus toutes les 6 h) : dès qu'UN taux
  atteint **65 %** (`coin_config.cloud_capacite_alerte_pct`, absent = 65) — comptes servis / NAVIGATEURS_MAX (10 sur 15),
  mémoire utilisée de l'hôte, processeur ou puce moyens sur 5 min. Elle renvoie à « Ajouter un serveur » (plus bas).

## PASSER DE 15 À 30 COMPTES SUR UN SERVEUR — la règle chiffrée (Nico, 06/11 soir ; vue `cloud_passage_30`)
Toutes les conditions, sur les 7 DERNIERS jours de mesure ; l'orchestrateur lit la vue une fois par heure et, quand TOUTES
sont réunies, l'alerte le dit à support@ (un rappel au plus par 24 h). **Nico décide** ; alors `NAVIGATEURS_MAX=30` et un
redémarrage de l'orchestrateur à un moment sans tâche.
1. **Comptes** : au moins **10 vrais comptes** servis en même temps sur **80 %** des fenêtres de 5 min.
2. **Durée** : au moins **1 900 fenêtres** de 5 min (≈ 6,6 jours sur 7).
3. **Mémoire** : projetée à 30 comptes = mémoire utilisée + (30 − comptes ouverts) × 95e centile de la mémoire maximale
   d'un compte, au 95e centile des fenêtres, **≤ 70 %** de la mémoire totale ; jamais moins de **6 Gio** disponibles.
4. **Processeur** : p95 de l'hôte × 30 / comptes ouverts, au 95e centile des fenêtres, **≤ 60 %**.
5. **Puce** : la même projection pour le rendu 3D, **≤ 60 %**.
6. **Jobs** : au moins **100** jobs du Cloud, ratés (failed, needs_user) **≤ 5 %**, durée p95 d'un job **≤ 200 s**
   (référence du compte de Nico sur cloud-2, 06/11 : médiane 58 s, p95 100 s, 1 échec sur 58).
7. **Bridage** : médiane par compte ≤ celle de la RÉFÉRENCE **+ 0,10**.
8. **Anti-robot, ZÉRO hausse** : **aucune restriction ni aucun blocage** sur les 7 jours, et signes anti-robot par compte
   et par jour **≤ ceux de la RÉFÉRENCE**. La référence = les fenêtres à 1-3 comptes (30 jours gardés), au moins
   **7 compte-jours** ; sans elle, la condition est NON.
Les projections (3, 4, 5) ne lisent que les fenêtres à 10 comptes ou plus. Preuve sur Postgres jetable :
`PREUVE_PG=embarque node scripts/cloud/preuve-mesures-charge.mjs` (29/29, dont chaque refus).

## AJOUTER UN SERVEUR (quand l'alerte de capacité tombe) — rien ne s'achète sans l'accord écrit de Nico
1. **Choisir** (Robot, lecture : `GET /order/server_market/product`) une enchère Hetzner disponible tout de suite, comme
   cloud-2 : Intel AVEC puce intégrée (i5/i7/i9 de 12e-13e génération, UHD 770 ; JAMAIS un « F », qui n'a pas de puce ; pas
   de carte graphique dédiée), ≥ 64 Go, ≥ 20 fils, FSN1 ou NBG1, facturée à l'heure avec plafond. Règle de Nico (30/10) :
   tout vérifier sur CE produit (puce listée, Ubuntu 24.04 par installimage, prix, IPv4 1,70 € HT) et le dire AVANT de commander.
2. **Commander** sur accord écrit de Nico : `POST /order/server_market/transaction` avec `test=true`, puis réelle (clé SSH
   `fillsell_cloud_ed25519`). Nom : cloud-N (le suivant), domaine `cloud-N.fillsell.app` (A → l'IP, nuage gris ; le jeton
   Cloudflare de `secrets.env` a expiré le 12/10 : un jeton neuf ou l'enregistrement posé par Nico).
3. **Installer** comme cloud-2 (`docs/enquetes/beebs-cloud-0411/RAPPORT.md` § 15-16) : système de secours → installimage
   Ubuntu 24.04 → `serveur-cloud/deploiement/gpu/preparer-poste-gpu.sh` (sortie HDMI forcée, Xorg, Mesa ; `glxinfo` doit
   nommer la puce Intel).
4. **Déployer** : `SERVEUR_NOM=cloud-N bash serveur-cloud/outils/deployer.sh <ip> cloud-N.fillsell.app` → `.env` FERMÉ
   (aucun compte, pas d'entretien du pool), pare-feu, agent de mesure. Poser : `NAVIGATEUR_GPU=1`, `GPU_GROUPES` (groupes
   video et render de l'hôte), `NAVIGATEURS_MAX=15`, `ENTRETIEN_POOL=0` (cloud-2 tient le pool), `ALERTES_MAIL=1`,
   `ENDURANCE=0`, `ENREGISTREMENT_FOND=0`, `ENREGISTREMENT_CONNEXIONS=0` ; `docker compose up -d --force-recreate orchestrateur`.
5. **Qualifier, sans aucune plateforme** : `docker compose exec -T orchestrateur node outils/essai-me-connecter.mjs
   00000000-0000-4000-8000-000000000000 /tmp/verification --verifier` (profil jetable, proxy mort) → WebGL = la puce Intel,
   jamais SwiftShader ; l'outil écrit `etat/rendu-serveur.json` → au battement suivant, `cloud_serveurs.details.service.apte`
   = true. Sans cette preuve, la base ne lui attribue AUCUN compte (règle du 06/11).
6. **Ouvrir** : `COMPTES_AUTORISES` (liste, un par un) selon Nico. Les comptes de cloud-2 y restent (jamais déplacés tant
   que cloud-2 vit et les sert) ; les nouveaux vont au serveur apte le plus libre. Lire `cloud_charge_heures` des deux.

## 06/11/2026 soir — ce qui a mené à ce plan (essai de charge arrêté, facture Hetzner, cloud-1)
- **Essai de charge** (17:37 → 18:26) ARRÊTÉ par Nico : la page de charge animée (18 % de la puce par faux navigateur,
  0 % pour un vrai compte) ne mesurait rien de réel ; puis plus d'essai du tout (décision de 18:45) : la charge se mesure
  en réel. Chiffres : `docs/cloud/ESSAI-CHARGE-CLOUD2.md` § 6. cloud-2 relu à 18:26 = son état de 17:37.
- **Facture Hetzner récurrente** (API Cloud `/pricing` + API Robot, 06/11 vers 17:40 ; aucune facture lue) : cloud-1 cx43
  15,99 € HT + IPv4 0,50 € HT = **16,49 € HT / 19,79 € TTC** par mois ; cloud-2 enchère 3104939 194,00 € HT (0,3109 €/h,
  plafond lu à la commande) + IPv4 1,70 € HT = **195,70 € HT / 234,84 € TTC** ; total **212,19 € HT / 254,63 € TTC**.
  Rien d'autre (IPv6, pare-feu, trafic gratuits). Le jeton Cloud ne voit que le projet « fillsell-cloud ».
- **cloud-1** (cce5eba, Chromium sans puce) ne servait personne et tenait l'entretien horaire du pool (achats IPRoyal
  autorisés). ⛔ Le piège de `cloud_serveur_choisir` (cloud-2 muet 15 min → comptes partis sur cloud-1, qui ne les sert
  pas, et ils y restaient) : corrigé à la racine (migration 20261106200000 + déclaration au battement, ci-dessus).
  Pool : 8 IP vivantes, IP 42 de Nico jusqu'au 04/12 18:08, premières échéances le 29/11.
- **Orchestrateur** : depuis 61fb7dd, aucun commit dans `serveur-cloud/src` avant le 06/11 soir ; ceux du 06/11 soir
  (déclaration du service, rendu, alerte de capacité) partent par le « mode orchestrateur seul ». Copie Cloud de
  l'extension : 0.6.169-cloud (figée sur d426d23), parc en 0.6.175.

## ⛔ 06/11/2026 soir — DÉCISION DE NICO : cloud-2 EST LE SERVEUR DE L'OUVERTURE (à lire EN PREMIER)
- **L'AX42 et cloud-3 sont ABANDONNÉS pour l'instant** (AX42-1 annulée par Hetzner, délai de plusieurs semaines ;
  AX42-2 à 187,30 € HT/mois refusé ; rien commandé). `docs/cloud/ESSAI-AX42.md` et les scripts
  `20261106_cloud_essai_ax42_*` restent pour plus tard. **Rien n'attend plus un nouveau serveur, ni la soumission Apple.**
- **cloud-2** = enchère Hetzner 3104939, 5.9.80.213, `cloud-2.fillsell.app`, Intel i9-13900 (32 fils), 62 Gio, UHD 770
  (Chrome par la vraie puce, recette validée le 05/11 : `docs/enquetes/beebs-cloud-0411/RAPPORT.md` § 15-16), facturé à
  l'heure, **195,70 € HT/mois au plus** ; capacité automatique 30 comptes (règle des 2 Gio réservés). Server Auction
  relue le 06/11 17:09 (Robot) : AUCUNE offre avec puce intégrée et ≥ 24 fils ne bat son coût par compte.
- **Ordre des comptes servis** (`COMPTES_AUTORISES` de cloud-2, jamais vide) : 1. compte de relecture Apple
  test@fillsell.app (d6a9e726, déjà dans la liste) ; 2. le compte de Nico (f44b5917, déjà servi : IP 42) ; 3. les 3 à 5
  utilisateurs choisis par Nico (identifiants ajoutés UN par UN sur son ordre). Le compte de relecture Google
  (953c1ca6) est aussi dans la liste.
- (TRANCHÉ par Nico le 06/11 soir : voir le bloc « ENCHAÎNEMENT » en tête ; ce qui suit est l'état lu avant.)
  **À trancher par Nico AVANT le premier utilisateur choisi** (réglages d'ESSAI encore en place sur cloud-2, lus le 06/11) :
  `ENREGISTREMENT_FOND=1` et `ENREGISTREMENT_CONNEXIONS=1` (enregistrement des requêtes : à couper pour de vrais
  utilisateurs ?), `ALERTES_MAIL=0`, `ENTRETIEN_POOL=0` (le pool d'IP — purges, contrôles, alertes — est tenu par
  cloud-1, qui bat encore avec une capacité de 7 sans servir personne : le garder pour le pool, ou le retirer
  (`cloud_serveurs` « retire » + `ENTRETIEN_POOL=1` sur cloud-2) ; tant qu'il bat, un compte peut y être attribué si
  cloud-2 manque de battement 15 min) ; orchestrateur de cloud-2 = `61fb7ddd6e2a` (les correctifs serveur postérieurs ne
  sont pas déployés dessus : relire `git log 61fb7dd..HEAD -- serveur-cloud` avant l'ouverture).
- **Essai de charge** de cloud-2 : lancé le 06/11 17:37, ARRÊTÉ par Nico à 18:25 (page synthétique) ; plus d'essai, la
  charge se mesure en réel : `docs/cloud/ESSAI-CHARGE-CLOUD2.md` § 6 et le bloc « ENCHAÎNEMENT » en tête.
- L'ouverture elle-même = l'interrupteur `coin_config.cloud_offre_ouverte` (06/11 soir : plus de drapeau dans l'app).

## ⛔ 04/11/2026 soir → 05/11 18:00 — ESSAI « RECETTE DE PROD » SUR cloud-2 (machine à vraie puce) (à lire EN PREMIER)
Détail et état : `docs/enquetes/beebs-cloud-0411/RAPPORT.md` § 15.
- cloud-2 = enchère Hetzner 3104939 (5.9.80.213, i9-13900, UHD 770), Ubuntu 24.04 + Google Chrome officiel par la puce,
  `ENTRETIEN_POOL=0` (cloud-1 garde le pool), `ENREGISTREMENT_FOND=1`, `ENREGISTREMENT_CONNEXIONS=1`, achats d'IP coupés.
- Pendant l'essai, cloud-1 ne sert PERSONNE (`COMPTES_AUTORISES` = compte inexistant ; jamais vide). ⛔ Ne jamais lui rendre
  Nico avant l'INVERSE de la bascule (coffre restauré d'abord), sinon il purgerait les sessions de son profil.
- Retour : `docker compose stop orchestrateur` sur cloud-2 → `20261104_cloud_essai_gpu_bascule_nico_INVERSE.sql` (:ip_neuve)
  → cloud-1 `COMPTES_AUTORISES=f44b5917-…` + orchestrateur relancé. Machine rendue sur ordre de Nico seulement
  (`POST /server/3104939/cancellation`, `cancellation_date=now`).
- `cloud_ip_achats_auto = 0` : un achat d'IP = `acheter-une-ip.mjs --acheter --accord-ecrit="…"` sur accord écrit de Nico.

## ⛔ 04/11/2026 après-midi — RÉPARATION, INTERRUPTEUR DES VISITES, POINTS 2-3 (à lire EN PREMIER)
Détail : `docs/enquetes/beebs-cloud-0411/RAPPORT.md` § 8 à 10.
- Compte de Nico remis comme avant 12:23 (14:05) : IP 39, profil d'avant (empreinte 7a1cfa22), coffre refait
  (`outils/restaurer-coffre-profil.mjs`) ; Vinted et Depop relus sans erreur à 14:08 ; Leboncoin : glissière de 11:02 à résoudre.
- Visites de contrôle Beebs COUPÉES pendant tout le chantier : `coin_config.cloud_visites_controle_beebs = 0` (déployé
  8e91ac1, 14:17). Le refus Beebs de l'IP 40 n'est PAS noté (il déclencherait une visite) — à noter après le chantier.
- Points 2-3 (codés, banc) : la purge de l'entretien ne touche JAMAIS un compte actif ; `effacer-plateforme` garde
  `datadome` ; lecteur PDF intégré réactivé (`REGLAGES_PDF`, empreinte → **091d90b32056e8dd**, EMPREINTE_AUTORISEE) ;
  enregistrement complet (cookies envoyés/reçus, réponses DataDome masquées, chaque mouvement).
- ÉTAT 15:16 : orchestrateur **cce5eba**, copie Cloud inchangée (0.6.169-cloud +d426d23.p8f33110), empreinte
  **091d90b32056e8dd** (EMPREINTE_AUTORISEE). Compte de Nico sur l'**IP 41** (88.151.56.82, IPRoyal 87495735, jamais vue par
  Beebs) pour l'essai unique ; 39 disponible (retour après l'essai : `20261104_cloud_ip_essai_beebs_nico_INVERSE.sql`, avec
  41) ; 40 disponible (refus Beebs non noté). Les scripts de réparation du jour restent sur le poste (ajout refusé par le
  garde-fou de la session).

## ⛔ 04/11/2026 — BEEBS : CE QUI DÉCLENCHE LE BLOCAGE, CADENCE DE FOND, VUE BUREAU (à lire EN PREMIER)
Détail : `docs/enquetes/beebs-cloud-0411/RAPPORT.md`.
- Le point 6 du bloc du 03/11 est FAUX : Beebs a été résolu le 03/11 18:40 (« Résoudre », filtre anti-pubs actif), puis
  re-bloqué le 04/11 02:45 (glissière, onglet de travail), « restreint » au « Résoudre » de 08:14.
- Filtre anti-pubs : ÉCARTÉ (1er blocage 15 h avant lui ; réussites avec lui). Cause : le rythme de robot des lectures de
  fond (messagerie toutes les 12 min pile, relevé quotidien 13 pages en 65 s, onglet caché 25 min) + un « Résoudre » qui
  présentait un téléphone sur un Chrome Linux de bureau.
- Corrigé (Beebs seulement) : `RYTHME_BEEBS_CLOUD` (copie Cloud de l'extension, moyennes inchangées) ; « Me connecter »
  et « Résoudre » de Beebs dans une VRAIE fenêtre de bureau de 500 px, à la souris (`vueBureau.js`), requêtes enregistrées
  dans `etat/essais/` ; zoom sur la glissière dans l'APP seulement (`zoom: true`, actif à la prochaine OTA).
- ⛔ Jamais `Emulation.setDeviceMetricsOverride` ni `Page.captureScreenshot` avec `clip` pendant « Me connecter » d'une page
  à cadre DataDome : mesuré au banc, la souris arrive décalée dans le cadre (rapport § 6).
- Achat d'une IP par le pool : `docker compose exec -T orchestrateur node outils/acheter-une-ip.mjs [--acheter]` ;
  contrôle d'entrée tout de suite (sinon l'entretien horaire) : `… node outils/controle-entree.mjs <ip_id>`.
- ÉTAT 04/11 12:25 : orchestrateur **8f33110**, copie Cloud **0.6.169-cloud** `…+d426d23.p8f33110-cloud` (sans la 0.6.170 :
  `node scripts/cloud/build-extension-cloud.mjs --extension=d426d23`). IP du compte de Nico : **id 40, 81.181.237.207**
  (IPRoyal 87481742, 4 $, échéance 04/12) ; id 39 (176.103.182.215) au repos, refus Beebs non prouvé. Beebs remis à zéro
  (navigateur, coffre, état ; réparation `20261104_cloud_beebs_ip_neuve_nico.sql` + INVERSE ; blocage clos, sauvegarde
  `archives/0411-beebs/`) → l'app propose « Me connecter » Beebs. Vinted, Depop connectés ; Leboncoin : glissière de
  11:02 (messagerie, avant le déploiement) à résoudre par Nico.
- L'ESSAI UNIQUE : le « Me connecter » Beebs de Nico, enregistré dans `etat/essais/beebs-…-connexion.jsonl`. Aucun autre
  essai Beebs ; aucune autre IP.
- ⛔ INCIDENT 04/11 12:25 (corrige la ligne « Vinted, Depop connectés » ci-dessus) : `cloud_ip_liberer` (réparation de
  12:23) a mis l'IP 39 au repos — le chemin d'un compte qui PART — et l'entretien l'a PURGÉE : profil de Nico détruit
  (neuf : p-f44b5917-4a22e14524a7), coffre vidé (Vinted, Leboncoin, Depop, Beebs perdus ; ne reste que la session
  FillSell), réservation de l'IP 2 levée (visite de contrôle Beebs à 12:25). ⛔ JAMAIS `cloud_ip_liberer` pour changer
  l'IP d'un compte actif. Profil d'avant : `archives/0411-beebs/p-principal-avant.tgz` (12:08, sans le cache).
- Essai 13:40 : 403 dès la 1re requête (0 cookie, profil neuf), vérification de l'appareil ratée AVANT tout geste,
  glissière, « Accès temporairement restreint » (13 s). Même suite qu'au « Résoudre » de 08:14 en mode téléphone.
  Aucune IP payée n'a jamais vu Beebs (ids 1 à 6, 39, 40 : toutes l'ont vu).

## ⛔ 03/11/2026 soir — AUDIT + CORRECTIFS POUR L'OUVERTURE À TOUS (à lire EN PREMIER)
Détail : `docs/enquetes/cloud-ouverture-0311/RAPPORT.md`. Commits 9e9bde4, 1a65445, 7c7748d, 01d22e2.
- Mémoire : cause des OOM = accueil Leboncoin et ses ~28 cadres de régies publicitaires. Régies bloquées dans le verrou
  (`DOMAINES_PUBLICITE`, comme un bloqueur de pub ; empreinte inchangée) + filet (redémarrage propre au repos > 80 % du
  plafond). Après : médiane 0,77 Go, max 1,10 Go au repos ; pic d'une vraie republication Leboncoin 1 384 Mo ; 0 OOM.
- Réglage cloud-1 (18:07) : `MEMOIRE_NAVIGATEUR=2g`, `NAVIGATEURS_MAX` vide → capacité AUTOMATIQUE 7 (avant 4).
- Prise atomique : prendre_job vue en prod pour le poste Cloud (job 062f992c, 18:00:07) — update-job-status v168.
- Orchestrateur **01d22e2** (cloud-1), copie Cloud de l'extension inchangée (0.6.169-cloud). Déployer : plus besoin de
  `DESTINATIONS_PROXY` (pare-feu DYNAMIQUE : `etat/proxys-permis.txt` + unité systemd `fillsell-pare-feu-maj.path`) ;
  depuis un arbre propre (`C:\Users\nicol\fs-deploiement-cloud`, worktree détaché, si l'arbre partagé est sale) :
  `bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app` — jamais pendant une tâche en cours.
- Base : migrations 20261103201000 (flotte), 202000 (IP), 203000 (voie, place, attente) — APPLIQUÉES (par un essai
  enveloppé que le `COMMIT;` de la 203000 a validé : rapport § 11). Crons `cloud-voies-5min`, `push-cloud-place-5min`.
- Pool : ids 1, 2, 3, 4 « disponible » avec refus Beebs NON PROUVÉ (requalification automatique : une visite légère par
  heure, l'id 2 réservée à Nico jamais visitée) ; id 39 = Nico (03/12). id 1 prolongée au 04/12. Solde IPRoyal 3,15 $.
- FEUX VERTS DE NICO (03/11 soir) :
  - achat ET renouvellement automatiques des IP : **ALLUMÉS** 18:47 (`cloud_ip_achats_auto` 1, `cloud_ip_renouvellement_auto`
    1, `IPROYAL_ACHATS_AUTORISES=1` sur cloud-1), plafond **60 $ / mois** ; solde rechargé par Nico : 33,15 $. Un achat ne
    part que si le stock d'IP attribuables à un essai passe sous `cloud_ip_stock_min` (2) — plan du 03/11 : 0 à acheter ;
  - lot de départ : **NON pour l'instant** (les 3 IP disponibles suffisent aux tests) — acheter juste avant l'ouverture ;
  - création automatique de serveurs : **COUPÉE**, plus tard (`HETZNER_CREATION_AUTORISEE` absent, `cloud_serveurs_auto` 0) ;
  - OTA 2.9.159 : **servie** 03/11 ~18:45 (dist/ = 7c7748d vérifié) ; comptes sans Cloud : 708 écrans identiques.
  - Migrations : plus JAMAIS d'« essai à blanc » sur la prod — base jetable, puis application réelle explicite.
- ⛔ CE QUI RESTE AVANT L'OUVERTURE À TOUS :
  1. get-pending-jobs (terminal qui la tient) : (a) ne plus rien servir au poste Cloud quand `cloud_voie` est faux
     (grâce d'essai) ; (b) pour un compte `cloud_voie`, ne plus servir au PC les lectures que le Cloud fait déjà (relevés
     d'annonces, de ventes, messagerie, sondes) — même compte de plateforme vu depuis deux IP.
  2. Apple : soumettre l'abonnement Cloud (`app.fillsell.cloud.sub`, offre d'intro 1 semaine à confirmer).
     ⛔ PRIX : **24,99 € / mois sur TOUS les canaux** (décision de Nico, 03/11 soir ; essai 7 j inchangé), au lieu de
     20 €. Rien changé dans les boutiques le 03/11 : le nouveau prix se pose AVEC LA REFONTE DES PALIERS (Apple :
     prix de `app.fillsell.cloud.sub` et ses 25 pays euro ; Google : `cloud-monthly` ; Stripe : un prix neuf à 24,99 €).
     Le prix Stripe à 20 € (`price_1UMuLDQZRA77vrWJZfZh2IS4`, 0 abonné) s'archive À CE MOMENT-LÀ, pas avant.
     Marge à 24,99 € : `docs/enquetes/cloud-ouverture-0311/RAPPORT.md` § 9 bis.
  3. Vrai paiement de test (Stripe d'abord), en DERNIER, quand tout le reste est en place.
  4. Lot d'IP juste avant l'ouverture (proposé : 10 IP = 29,40 $).
  5. Le drapeau : `CLOUD_OFFER_ENABLED` reste à false ; l'ouvrir = une OTA + `coin_config.cloud_offre_ouverte` = 1.
     ⛔ Dans la MÊME OTA, le prix affiché passe à 24,99 € (aujourd'hui « 20 € » : `CLOUD_PRIX_AFFICHE` de
     `src/utils/palier.js`, lu par `src/cloud/textes.js`, `PRIX_AFFICHE` et `prixTtcEur` de `supabase/functions/_shared/cloud-pool.js`), et seulement
     quand les trois boutiques portent le nouveau prix (refonte des paliers) — jamais un prix affiché différent du prix
     facturé. Le prix Stripe à 20 € s'archive à ce moment-là.
  6. Beebs du compte de Nico « à résoudre » depuis le 03/11 01:25 (« Résoudre la vérification » dans l'app).
- `cloud_voie` n'est PLUS posé par script : la base le tient (`cloud_etat().actif`). Ne plus l'écrire à la main.
- OTA 2.9.159 SERVIE (envoyée par Claude sur autorisation de Nico, 03/11 soir).
- Relevés en cours sur cloud-1 (lecture seule, bornés) : `etat/mesure-0311/echantillons.jsonl` (30 s, jusqu'au 04/11
  22:00 environ).

## ⛔ 02/11/2026 22:05 — NAVIGATEUR À 3 GO ; ONGLETS SANS TÂCHE FERMÉS ; CLOUD d426d23 + EXTENSION 0.6.169-cloud (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 26 (diagnostic, mesures avant / après).
- Diagnostic : fenêtres propres (2 : steel + la fenêtre de travail ; jamais « minimisée » — pas de gestionnaire de
  fenêtres), aucun freinage (steel coupe les freins d'arrière-plan), aucune accumulation (chaque déploiement relance le
  conteneur). Mais la MÉMOIRE : 1,16 à 1,9 Go sur 2 Go, OOM noyau à 18:51:52 (page de 406 Mo tuée pendant le retrait
  Leboncoin de Nico).
- Plafond du navigateur **3 Go** depuis 20:37:33 (`docker update`, sans redémarrage ; `.env` `MEMOIRE_NAVIGATEUR=3g`).
- Copie Cloud : onglets de travail Leboncoin, Beebs, Depop **fermés** après 5 min sans tâche (fin de cycle, sous le
  verrou) ; la tâche suivante en rouvre un ; Vinted reste ouvert. ⛔ Jamais `chrome.tabs.discard` dans le Cloud : la page
  s'y recharge à la même seconde (essai 02b1390, 21:36:47 — abandonné).
- Orchestrateur **d426d23** déployé 21:42:09 (file vide ; 02b1390 à 21:09:39 avant lui), copie Cloud **0.6.169-cloud**
  (BUILD_ID `2026-11-02T20:41:27Z+d426d23-cloud`) ; navigateur rouvert 21:42:17, empreinte 7a1cfa22 inchangée.
- Déployer (jamais pendant une tâche en cours) :
  `DESTINATIONS_PROXY="176.103.182.215:12323" bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app`
  ⚠️ deployer.sh ne reconstruit la copie Cloud que si `build/extension-cloud/` manque : `node scripts/cloud/build-extension-cloud.mjs` d'abord.
- Mesuré (§ 26.3) : au repos ≈ 1,0 Go (avant 1,2-1,9 Go) ; pic d'un relevé Leboncoin 1,67 Go ; aucun OOM depuis.
- Mesure (lecture seule, bornée) : `bash /srv/fillsell-cloud/archives/0211-nuit/mesure-memoire.sh <secondes>`.

## ⛔ 02/11/2026 19:35 — REPUBLICATIONS FAITES PAR LE CLOUD ; CLOUD 7d2a82e + EXTENSION 0.6.168-cloud ; OTA 2.9.157 (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 25.
- Republications (18:44 → 19:24) : Vinted 18:48, Leboncoin 19:04 (2e essai), Depop 19:13, Beebs « Primark » 19:23 — toutes
  par le Cloud ; Beebs « TEST » en pause (annonce en modération chez Beebs, rien retiré).
- Orchestrateur **7d2a82e** déployé 19:30:38 (inclut 3345cf8 : glissière d'onglet de travail confirmée avant « Résoudre »),
  copie Cloud de l'extension **0.6.168-cloud** (depuis HEAD ; Leboncoin « dépôt interrompu » réglé à la racine). Navigateur
  rouvert 19:30:51, empreinte 7a1cfa22 inchangée, IP 176.103.182.215.
- OTA **2.9.157** servie (la 2.9.156 était un dist/ de build:essai « dirty » — remplacée). Extension du parc **0.6.168**
  dans `build/CWS-0.6.168-A-TELEVERSER/` (contient la 0.6.167).

## 02/11/2026 17:50 — TEST DE NICO : 5 PUBLICATIONS FAITES (4 PAR LE CLOUD, eBay PAR L'API) ; OTA 2.9.155 (bloc précédent ; mis à jour par le bloc de 19:35 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 24. Le bloc 16:50 en dessous reste l'état du Cloud.
- 17:14 → 17:21 : eBay (ebay-api-worker), Vinted, Leboncoin, Beebs, Depop (copie Cloud `…dd69fbb-cloud`) en ligne ; le
  PC de Nico n'a rien pris (son poste ne polle plus depuis le 01/11 15:27). D'abord retenues par le réglage « Publication
  programmée » (créneau du matin), éteint par Nico vers 17:13.
- Fausse alerte Leboncoin de 16:55 (défi DataDome sur UNE requête, rien à glisser à 16:59) → règle corrigée
  (`verifications.js` : glissière d'onglet de travail CONFIRMÉE — une page, une lecture, 3 min — avant « Résoudre »),
  commitée **3345cf8, À DÉPLOYER après les republications de Nico** (jamais pendant une tâche) :
  `DESTINATIONS_PROXY="176.103.182.215:12323" bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app`.
- **OTA 2.9.155** servie (17:48) : écrans de suivi d'un compte Cloud (« FillSell Cloud la prend à son tour »,
  « FillSell Cloud actif »), publication programmée dite sur « Publication lancée », état « vérification en cours ».

## 02/11/2026 16:50 — UN NAVIGATEUR, UNE IP, LES 5 PLATEFORMES (l'état du Cloud ; mis à jour par le bloc de 17:50 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 23. Ce bloc remplace, pour l'état, tous les blocs du 02/11 en
dessous (gardés pour l'histoire) : il n'y a PLUS de navigateur isolé (décision de Nico, 02/11 soir).

### Navigateur (serveur cx43 Hetzner, Falkenstein, cloud.fillsell.app ; orchestrateur 08e2f0b, déployé 16:27:39)
- UN navigateur par compte (`fs-nav-<compte>`, profil `p-f44b5917-60c90d1101a8`), extension Cloud 0.6.164-cloud
  (BUILD_ID 2026-11-01T23:02:16Z+dd69fbb-cloud, inchangée).
- IP **176.103.182.215** (pool id 39, IPRoyal 87284262), **prolongée à 30 jours** le 02/11 15:55 (4 $) : échéance
  **03/12/2026 14:09**. 81.181.239.136 (id 3) : rebut (grillée pour Beebs), payée jusqu'au 29/11, non utilisée, hors du
  pare-feu. Pare-feu des navigateurs : 176.103.182.215:12323 seulement.
- Langues d'un vrai Chrome français : `fr-FR, fr, en-US, en` → Accept-Language `fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7`.
  Empreinte FIGÉE **7a1cfa22decada93** (`EMPREINTE_AUTORISEE=7a1cfa22decada93`, accord de Nico ; l'ancienne 73cbe209).
- Coffre : Vinted, Leboncoin, Depop connectées ; **Beebs « à résoudre »** (glissière DataDome au premier passage du
  principal, 16:28:52 ; session gardée) ; eBay par l'API seulement.
- get-pending-jobs sert au poste Cloud les plateformes CONNECTÉES au coffre (inchangé) : Beebs le sera dès « Résoudre ».
- Déployer (jamais pendant une tâche en cours) :
  `DESTINATIONS_PROXY="176.103.182.215:12323" bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app`
- Outils (sans aucune plateforme / une lecture) : `outils/echo-navigateur.mjs <user>` (IP, langues, empreinte, JA4) ;
  `outils/lecture-simple.mjs <user> <plateforme>` (accueil + compte lu ; une vérification n'est jamais forcée).
- Archives (600) : `/srv/fillsell-cloud/archives/0211-soir/` — profil principal d'avant, profil isolé (retiré du disque),
  `.env` d'avant. Réparations : `scripts/reparations/20261102_cloud_un_navigateur_nico.sql` (+ inverse),
  `…_cloud_beebs_isole_vers_principal_nico.mjs` (inverse dans son en-tête).

### État à 16:50 (aucune publication, aucun retrait, aucune tâche créée)
- Vinted passe (130 × 200) · Leboncoin passe (accueil 200, compte lu 200) · Depop passe (114 × 200) · **Beebs : à
  résoudre** (« Résoudre la vérification » dans l'app) · eBay : API en ordre (`ebay-api-worker` en succès).
- Ce que Nico fait : app quittée puis rouverte ; Réglages › Abonnement › FillSell Cloud → Beebs « Résoudre la
  vérification », la glissière ; puis son test (annonce ≥ 999 €). Republication eBay : aucune (règle du 17/09).
- IPRoyal le 02/11 : 11,20 $ + prolongation 4 $ = **15,20 $** ; **solde 7,15 $**. Aucun autre achat. Poste de Nico : ARRÊT.

### IP grillées pour Beebs (ne plus jamais les y essayer)
81.181.239.136 · 185.134.192.253 · 185.134.194.88 · 176.103.180.12 · 80.12.178.102 · 94.194.94.233 · 188.126.31.118.

## 02/11/2026 15:05 — ÉTAT COMPLET DU CLOUD ; BEEBS : CAUSE PROUVÉE ; POINT 3 EN ATTENTE (bloc précédent ; remplacé par le bloc de 16:50 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 20 à 22.11. Ce bloc remplace, pour l'état, les blocs du 02/11
en dessous (gardés pour l'histoire).

### Beebs : cause prouvée
- Le profil français du matin envoyait `Accept-Language: fr-FR,fr;q=0.9` (deux langues, jamais vu chez un vrai Chrome
  français) → DataDome de Beebs : « Accès temporairement restreint » à chaque visite (11:45, 12:23, 12:37, 13:02, 13:49).
- Avec les langues d'un vrai Chrome français (`fr-FR, fr, en-US, en` → `fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7`) : **Beebs
  passe** (14:37-14:39, navigateur isolé, compte vérifié 200). TLS / HTTP/2 hors de cause (identiques au vrai Chrome 156,
  tunnel CONNECT sans intermédiaire). Autres écarts connus, non corrigés : « Chromium » sans « Google Chrome »,
  WebRTC sans candidat.
- **Plus aucune visite de Beebs sans l'accord de Nico.**

### Navigateurs (serveur cx43 Hetzner, Falkenstein, cloud.fillsell.app ; orchestrateur 7f3ba62)
- PRINCIPAL (`fs-nav-<compte>`) : IP **81.181.239.136** (pool id 3, jusqu'au 29/11 21:00), empreinte FIGÉE
  **73cbe2096d286336** (langues fr-FR, fr — le même écart, non corrigé), extension Cloud 0.6.164. Vinted, Leboncoin,
  Depop connectés et actifs (lectures 200 le 02/11 après-midi ; Gants de ski republiés sur Leboncoin 12:24:31). Beebs
  y est FERMÉE (plateforme isolée).
- ISOLÉ Beebs (`fs-nav-<compte>-beebs`, profil `p-f44b5917-beebs-isole`, sans extension, 1536×864, 4 cœurs, langues de
  vrai Chrome FR) : IP **176.103.182.215** (pool id 39, **24 h, expire le 03/11 14:09**), empreinte
  **a20440298a88a528**. Session Beebs de Nico dans ce profil (pas au coffre) ; l'app la lit dans
  `platform_settings.beebs.cloud_isole`. Ne tourne que pendant « Me connecter » Beebs. Les TÂCHES Beebs n'y passent pas
  encore (point 3).
- `/srv/fillsell-cloud/.env` : `NAVIGATEUR_ISOLE_BEEBS_IP=39`, `EMPREINTE_AUTORISEE=a20440298a88a528` (seule l'isolée).
- Déployer (jamais pendant une tâche en cours) :
  `DESTINATIONS_PROXY="81.181.239.136:12323,176.103.182.215:12323" bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app`

### IP grillées pour Beebs (ne plus jamais les y essayer)
81.181.239.136 · 185.134.192.253 · 185.134.194.88 · 176.103.180.12 · 80.12.178.102 · 94.194.94.233 · 188.126.31.118
(et toutes les IP des essais du 30/10). Pool : 94.194.94.233 (id 1, 04/11), 185.134.194.88 (id 2, 29/11),
185.134.192.253 (id 4, rebut, 02/12), 176.103.180.12 (id 5, 03/11), 80.12.178.102 (id 6, 03/11) : libres, non utilisées.
IPRoyal le 02/11 : 4 + 2,60 + 2,60 + 2,00 = **11,20 $** ; recharge de Nico 15 $ ; **solde 11,15 $**.

### En attente
- ~~OTA de la partie app de 7f3ba62~~ → **servie dans la 2.9.154** (OTA de l'autre terminal, 546063a ; canal production
  relu par le terminal Cloud à 15:20 = 2.9.154 ; src/cloud identique à 7f3ba62).
- **Point 3 (décision de Nico)** — proposition :
  1. Garder Beebs dans le navigateur isolé et **prolonger 176.103.182.215 à 30 jours** (plan 30 jours : 4 $ ≈ 3,70 €,
     sur le solde) AVANT le 03/11 14:09 — même IP que la session établie (en changer referait passer la vérification).
  2. Ne PAS toucher au principal tant que Vinted, Leboncoin, Depop passent : un changement de langues en pleine session
     est exactement ce qui a cassé Beebs ce matin, et Leboncoin y vit sur un ancien cookie DataDome de confiance.
     Préparer l'alignement (fr-FR, fr, en-US, en) derrière `EMPREINTE_AUTORISEE`, à ne lancer qu'au premier signe d'un
     refus, une plateforme à la fois.
  3. Mettre les tâches Beebs en service dans l'isolé : copie de l'extension limitée à Beebs + un poste « Beebs seul »
     servi par get-pending-jobs (le principal n'en reçoit jamais) — travail à faire, avec l'autre terminal pour
     get-pending-jobs. Coût par compte : une 2e IP (4 $/mois) et ≈ 1,3 Go de mémoire (le cx43 sert alors ≈ 5 comptes
     au lieu de 10).
  4. Pour les NOUVEAUX comptes : naître avec les langues d'un vrai Chrome français (aucun changement en cours de
     session) → un seul navigateur, une seule IP, Beebs compris.
- Poste de Nico : ARRÊT. Aucun autre achat.

## ⛔ 02/11/2026 14:30 — BEEBS : UN SEUL ESSAI « LANGUES » EN COURS, PUIS ARRÊT (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 22.9 et 22.10.
- Diagnostic : TLS / HTTP/2 des navigateurs Cloud identiques au vrai Chrome 156 (aucun intermédiaire : tunnel CONNECT) ;
  écarts : Accept-Language, « Chromium » sans « Google Chrome », WebRTC sans candidat ; IP IPRoyal = blocs loués.
- Navigateur isolé (Beebs) : langues fr-FR, fr, en-US, en ; IP **176.103.182.215** (id 39, 24 h, même bloc loué que
  176.103.180.12) ; empreinte a20440298a88a528 (`EMPREINTE_AUTORISEE`). Principal : 81.181.239.136, 73cbe209.
- IP grillées pour Beebs : 81.181.239.136, 185.134.192.253, 185.134.194.88, 176.103.180.12, **80.12.178.102 (isolé,
  13:49)**, 94.194.94.233, 188.126.31.118. Après l'essai : ARRÊT — pas de 2e IP, pas de Chrome officiel, pas d'OVH sans
  accord de Nico.
- Déployer avec `DESTINATIONS_PROXY="81.181.239.136:12323,176.103.182.215:12323"`. IPRoyal : solde 11,15 $.

## ⛔ 02/11/2026 13:40 — NAVIGATEUR ISOLÉ DE BEEBS PRÊT ; PRINCIPAL SUR 81.181.239.136 (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 22.8. Les blocs 13:10 et 12:55 en dessous : l'IP de 24 h ne sert
plus (rendue au pool, expire le 03/11) ; le reste vaut.
- Principal : **81.181.239.136** (pool id 3), empreinte 73cbe209 ; Beebs y est fermée (plateforme isolée).
- Beebs : navigateur ISOLÉ (`fs-nav-<compte>-beebs`, profil `p-<compte>-beebs-isole`, empreinte b384dad7, sans extension),
  sortie **185.134.194.88** (`NAVIGATEUR_ISOLE_BEEBS_IP=2` dans `/srv/fillsell-cloud/.env`) — ⚠️ IP déjà vue par Beebs le
  30/10 : décision de Nico attendue avant l'essai. Ne s'ouvre que par « Me connecter » Beebs.
- Déployer avec `DESTINATIONS_PROXY="81.181.239.136:12323,185.134.194.88:12323"`. Jamais pendant une tâche en cours.
- IPRoyal : solde 0,75 $ ; dépensé le 02/11 : 6,60 $.

## ⛔ 02/11/2026 13:10 — BEEBS : LE NAVIGATEUR CLOUD EST REPÉRÉ ; IP DE 24 H À REMPLACER AVANT LE 03/11 12:54 (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 22.7. Le bloc 12:55 en dessous reste valable (empreinte figée).
- Test propre de Nico (13:02) : Beebs effacée partout, IP neuve d'une autre plage (176.103.180.12), première requête →
  403 + vérification de l'appareil, jamais la page de connexion. Conclusion de Nico : le navigateur Cloud lui-même est
  repéré par Beebs. **Arrêt : pas d'autre IP.** Beebs n'a ni session ni ligne au coffre (« à connecter »).
- IP du compte : **176.103.180.12** (IPRoyal 87277471, 24 h, **expire le 03/11 12:54**) → décision de Nico attendue
  (revenir sur 185.134.194.88 ou 81.181.239.136, valides jusqu'au 29/11, ou prolonger). Pare-feu : déployer avec
  `DESTINATIONS_PROXY="81.181.239.136:12323,185.134.192.253:12323,176.103.180.12:12323"` (+ la prochaine IP).
- IPRoyal du 02/11 : 6,60 $ (≈ 6,1 €) ; solde 0,75 $.

## ⛔ 02/11/2026 12:55 — BEEBS BLOQUÉ DUR PAR DATADOME DEPUIS LE PROFIL FRANÇAIS ; IP REMPLACÉE ; EMPREINTE FIGÉE (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 22. Le bloc 11:35 en dessous reste valable.

- **Empreinte du navigateur FIGÉE** (règle de Nico) : `profils/<profil>/.empreinte-navigateur` = **73cbe2096d286336**
  (lancement + session, jamais le proxy). Une empreinte différente n'ouvre plus le navigateur sans
  `EMPREINTE_AUTORISEE=<nouvelle>` dans l'environnement de l'orchestrateur — accord écrit de Nico, cas par cas.
- **IP du compte de Nico : 185.134.192.253** (IPRoyal 87277315, 4 $, échéance 02/12/2026, pool id 4). L'ancienne
  81.181.239.136 au rebut (`blocage_anti_robot`, payée jusqu'au 29/11). ⚠️ Déployer avec
  `DESTINATIONS_PROXY="81.181.239.136:12323,185.134.192.253:12323"` (le pare-feu des navigateurs n'ouvre QUE ces sorties).
  Solde IPRoyal : 3,35 $ (sous le seuil de 5 $).
- **Beebs** : « Accès temporairement restreint » à chaque visite depuis le passage en français (11:45, 12:23 cookie
  neuf, 12:37 IP neuve, première visite) ; glissière auparavant. Cause la plus probable : l'appareil a changé de langue
  d'un coup (profil jugé falsifié). Essai proposé à Nico, en attente de son « OK langue » : la langue seule remise en
  en-US, une visite. Ne PAS racheter d'IP ; ne pas déconnecter Beebs sans son accord.
- **Leboncoin** : résolu à 11:45:30 (lecture 200, sans glissière) ; Gants de ski republiés à 12:24:31 (annonce
  3300861757) après la coupure de 11:57 (déploiement pendant la tâche — ne plus redéployer pendant un « processing »).
- `outils/oublier-datadome.mjs <user> <plateforme>` : le cookie DataDome d'UNE plateforme, navigateur et coffre.
- OTA **2.9.152** servie (lien « Changer de compte » sur une plateforme connectée).

## ⛔ 02/11/2026 11:35 — « RÉSOUDRE LA VÉRIFICATION », PROFIL FRANÇAIS, COMPTEUR BEEBS (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 21. Les blocs 01:00 et 22:40 en dessous restent valables.

### La règle (serveur-cloud/src/verifications.js — produit, toujours active)
- Une vérification anti-robot n'arrête que SA plateforme (inchangé) ; l'app la lit dans
  `platform_settings.<plateforme>.cloud_verification` : **a_resoudre** (glissière → bouton « Résoudre la vérification »,
  bandeau Cloud et ligne de « Me connecter ») · **restreint** (t=bv, refus sans glissière, pause Leboncoin de l'app →
  aucun bouton, UN essai au bout de 24 h) · **revenue** (revenue < 30 min après résolution, ou refus juste après la
  glissière → arrêtée, aucun bouton, alerte support).
- « Résoudre » = la vue de « Me connecter » en mode `resoudre` : la page où la vérification s'est affichée (referer sur
  le site, sinon une page du compte), lue SANS réseau ; la glissière faite, UNE lecture d'accès (au plus deux). Passée :
  coffre connecté, verrou rouvert, tâches libérées, pause Leboncoin de l'app levée (reprise prudente 6 h).
- Seule la page de résolution passe le verrou (exception par cadre + le service worker de la plateforme ; jamais
  l'extension, jamais eBay). Jamais de résolution automatique. Les tâches retenues portent le message du Cloud.
- Blocages : `etat/endurance/blocages.json` (chemin d'origine gardé). Essai de 48 h (ENDURANCE=1) : n'en garde que le journal.

### Le navigateur Cloud parle français (navigateur.js)
- `--lang`, `intl.accept_languages` fr-FR,fr, fuseau Europe/Paris, `/etc/chromium.d/fillsell-langue` (LANGUAGE, LANG),
  `fr.pak` (chromium-l10n de la même version, `/srv/fillsell-cloud/etat/chromium-locales/`, posé par deployer.sh).
- Vu à 11:31 : fr-FR / fr-FR, fr / Intl fr / Europe/Paris / « 02/11/2026 11:00:00 ».
- ⚠️ Conteneur recréé quand son lancement change (empreinte `fillsell.lancement`) ; les fichiers de verrou du profil
  partent à chaque démarrage d'un conteneur arrêté (sinon : session steel HTTP 500).

### État à 11:35
- Orchestrateur **e54bf35** ; OTA **2.9.151** servie ; migration Depop du journal appliquée.
- **Leboncoin (04:57) et Beebs (05:15) : à résoudre** — glissières de la nuit (Leboncoin : API messagerie 403 ; Beebs :
  veille des commandes 403). Vinted et Depop tournent. Tâche Leboncoin c5c2a2c6 en attente, avec le message du Cloud.
- Compteur 11:32 : Vinted 11,8 h, Depop 11,8 h, Beebs 5,0 h (remise à zéro de Beebs seule, depuis 00:15:48), Leboncoin 0 h.
- Poste de Nico : ARRÊT. Aucun achat.

### À relire au retour (sans boucle)
- Après le geste de Nico : `docker compose logs orchestrateur | grep resolution_`, `blocages.json`, la tâche c5c2a2c6,
  `platform_settings.leboncoin.blocage_acces.leve_le`.
- Défaut ouvert (hors Cloud, non touché) : le message de pause Leboncoin d'un PC promet un bouton « Leboncoin remarche »
  qui n'existe pas dans l'app.

## ⛔ 02/11/2026 01:00 — PREMIER ESSAI RÉEL : 3 REPUBLICATIONS FAITES PAR LE CLOUD, LEBONCOIN EN PAUSE (à lire EN PREMIER)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 20. Le bloc 22:40 en dessous reste valable (règle « connecté =
compte lu »).

### Ce qui s'est passé
- 22:54:06 : glissière DataDome Leboncoin dans l'onglet de travail (API 403, 31 s après la connexion vérifiée) → la
  règle d'alors arrêtait TOUT l'exécutant, sans rien dire à l'app : les 4 republications de 23:01 jamais prises.
- Corrigé (810419b, déployé 23:40) : **un blocage n'arrête que SA plateforme** (verrou, onglets fermés, coffre « en
  vérification », session gardée ; « Me reconnecter » la rouvre) ; l'app affiche un bandeau quand l'exécutant est arrêté
  ou muet (OTA à venir : 2.9.150) ; les 48 h ne comptent que les heures de marche.
- Beebs : la copie Cloud de l'extension ne voyait pas ses jetons (posés sans « Secure » : `chrome.cookies.getAll` ne les
  rend pas dans Chromium 156). Corrigé (f525610) : lecture par adresse. Copie Cloud **2026-11-01T23:02:16Z+dd69fbb-cloud**
  (source dd69fbb, 0.6.164 ; la 0.6.165 du parc n'y est PAS).

### Résultat des 4 republications (« Gants de ski Quechua »)
- Vinted **23:42:40** (10629454888) · Depop **23:49:27** · Beebs **00:40:03** (34280542) — par le Cloud.
- Leboncoin : **en attente**, retenue par la règle Leboncoin de l'app (« Accès temporairement restreint » depuis 22:54 :
  tout Leboncoin en pause, un essai automatique au bout de 24 h, ou « Leboncoin remarche »). Décision de Nico.
- eBay : jamais republié (règle de l'app depuis le 17/09) ; la feuille ne le dit pas (amélioration proposée).

### État à 01:00
- Navigateur rouvert à chaque déploiement (dernier : 01:15) ;
  verrou : les 4 plateformes ouvertes ; aucune plateforme en vérification (`blocages.json` : Leboncoin débloqué 23:55:07
  par « Me reconnecter »).
- Coffre de Nico : Vinted, Leboncoin, Beebs, Depop connectés (vérifiés). Poste de Nico : ARRÊT. Aucun achat.
- Sauvegardes : `_backup_0111_cloud_faux_connectes`, `_backup_0111_cloud_lbc_verification` (+ inverses dans
  `scripts/reparations/`).
- **OTA 2.9.150** sur production (01:00, build 2026-11-01T23:59:20Z+1e7c943) : bandeau de l'exécutant arrêté.
- Orchestrateur **41edf7a** (01:15) : compteur des 48 h juste — Vinted 1,6 h, Beebs 1,7 h, Depop 1,7 h, Leboncoin 0 h
  (pause de l'app depuis 22:54) à 01:17. Les heures Beebs 22:55 → 00:15 comptent alors que l'extension ne la joignait
  pas : remise à zéro propre possible sur décision de Nico.

### À relire au retour (sans boucle)
- `docker compose exec -T orchestrateur node outils/endurance-bilan.mjs` : heures comptées par plateforme, blocages.
- `blocages.json` : toute nouvelle plateforme en vérification (et sa cause).
- Leboncoin : `profiles.platform_settings.leboncoin.blocage_acces` (pause de l'app, essai du 02/11 vers 22:54).

## 01/11/2026 22:40 — FAUX « CONNECTÉ » CORRIGÉS, ESSAI DE 48 H REMIS À ZÉRO (bloc précédent ; la suite est le bloc de 01:00 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 19. Essai de connexion de Nico depuis l'app (21:00 → 21:23) :
Leboncoin et Depop faussement « connectés » (cookie seul), Beebs + Google refusé par notre liste, effacer muet dans
« Écrire », eBay « à relier » alors que l'API est reliée. Tout corrigé à la racine (6eb3802), OTA **2.9.149**.

### La règle (Nico, 01/11) : « connecté » = le compte LU par le serveur
- Cookies présents = seulement le déclencheur ; le serveur lit le compte dans la page de connexion revenue sur le site
  (`serveur-cloud/src/plateformes.js`, `expressionLectureCompte`). Hors du site : rien n'est lu.
- Compte lu → « vérifié », la page RESTE ouverte (étape du téléphone, code) jusqu'à « J'ai fini ».
- L'app quittée (lire un SMS, un courriel) : la page attend 5 min (`REPRISE_MS`), l'app la reprend au retour.
- Une sauvegarde ordinaire ne relève plus jamais une plateforme non vérifiée ; une plateforme non connectée n'a aucune
  session dans le profil (purge à chaque ouverture du navigateur et à la fin d'un « Me connecter » raté).
- eBay : uniquement l'API (« Relié par l'API eBay », aucun bouton) ; le navigateur Cloud intercepte toujours eBay et Opla.

### État à 22:40
- Orchestrateur **6eb3802** (déployé 22:28:26) ; navigateur rouvert 22:28:33 ; verrou `permises = [vinted]`.
- Coffre de Nico : **Vinted seul** (+ session FillSell). Leboncoin et Depop remis à « non connecté » à 22:28
  (`scripts/reparations/20261101_cloud_faux_connectes_nico.sql`, inverse `…_INVERSE.sql`, orchestrateur ARRÊTÉ pour
  l'un comme pour l'autre). Vinted vraiment connecté : compte 250623918 lu par l'extension Cloud à 21:26:46 (200).
- Essai de 48 h **remis à zéro à 22:28:49** (`outils/endurance-remise.mjs`) : il part de la première connexion
  VÉRIFIÉE (`connexion_verifiee` dans `etat/endurance/mesures.jsonl`) ; chaque plateforme a son heure de départ.
  Bilan : `docker compose exec -T orchestrateur node outils/endurance-bilan.mjs` (`debut_48h`, `fin_prevue`,
  `plateformes_verifiees`).
- Poste de Nico : ARRÊT (dernier signe 15:27:53). Aucun achat. Aucun essai réel de ma part sur une plateforme.

### Ce que Nico refait (app à jour 2.9.149 : la quitter complètement puis la rouvrir)
Réglages › Abonnement › FillSell Cloud › « Connecter mes plateformes », puis :
1. **Vinted** « Me reconnecter » : rien à taper ; « compte vérifié » en quelques secondes → « J'ai fini ».
2. **Leboncoin** : se connecter ; le SMS du téléphone peut se lire hors de l'app (revenir dans les 5 min) ; « compte
   vérifié » ET plus rien à faire sur la page → « J'ai fini ».
3. **Beebs** : « Continuer avec Google » jusqu'au bout ; retour sur Beebs ; « compte vérifié » → « J'ai fini ».
4. **Depop** : se connecter ; « compte vérifié » → « J'ai fini ».
5. **eBay** : rien ; la ligne doit dire « Relié par l'API eBay ».
Si une page reste sur « Termine les étapes demandées par … » alors que tout est fini : le journal porte
`connexion_compte_non_lu` {http, motif} — lire avant toute autre action.

### À relire au retour (sans boucle)
- `usage_logs` de Nico : `cloud_connexion_verifiee`, `cloud_connexion_reprise`, `cloud_connexion_fin`.
- Journal de l'orchestrateur : `connexion_verifiee`, `connexion_compte_non_lu`, `connexion_retour_declare`,
  `connexion_navigation_refusee`, `connexion_en_attente` / `connexion_reprise`, `sessions_purgees`.
- En attente du feu vert nommé de Nico : `supabase/migrations/PROPOSITION_20261101_cloud_connexions_depop.sql.txt`
  (Depop absent de la contrainte de `cloud_connexions` : ses connexions n'y laissent aucune ligne ; sans effet sur le
  coffre ni sur les 48 h).
- Google : depuis l'essai Beebs du 01/11, le profil Cloud de Nico garde sa session Google (pages de connexion seules
  joignables) ; à effacer seulement sur sa demande.

## 01/11/2026 19:35 — LE VRAI PRODUIT EN PLACE, ESSAI DE 48 H SUR LE COMPTE DE NICO (bloc précédent ; la suite est le bloc de 22:40 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 18. Décision de Nico (01/11) : toute la mise en place codée,
l'essai de 48 h sur le vrai produit, son compte seul, son poste sur ARRÊT, rien pour les autres, aucun achat.

### Où en est l'essai
- **20:12 : OTA 2.9.148** — « Connecter mes plateformes » ne faisait rien sur iPhone (écran ouvert DERRIÈRE la page
  Réglages) : portail sur `document.body`, traces du clic et des erreurs dans `usage_logs` (`cloud_me_connecter_*`,
  `cloud_connexion_*`), carte aux quatre plateformes. Rapport § 18.5. Pour le relire : `select feature, metadata,
  created_at from usage_logs where user_id = '<Nico>' and feature like 'cloud_%' order by created_at desc`.
- **Prêt depuis 19:35** ; il attend le seul geste de Nico : Réglages › Abonnement › FillSell Cloud › « Connecter mes
  plateformes ». Puis Vinted, Leboncoin, Beebs, Depop l'un après l'autre, glissière résolue par lui, « J'ai fini ».
  Les 48 h partent de sa première connexion (heure lue dans `cloud_connexions`).
- **Au retour de Nico, lire** (sans boucle) :
  - `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16`, puis
    `cd /srv/fillsell-cloud/deploiement && docker compose exec -T orchestrateur node outils/endurance-bilan.mjs` ;
  - `etat/endurance/arret.json` : le premier blocage, s'il y en a eu un ;
  - `cloud_connexions` et `cloud_coffre` de Nico ; ses tâches `handler_build like '%-cloud%'` ; ses relevés.
  - Coût réel : 0 € de plus (cx43 déjà payé au mois, 19,79 € TTC ; IP 81.181.239.136 déjà payée jusqu'au 29/11).
- **Arrêt automatique au premier blocage** (`src/endurance.js`, `ENDURANCE=1`) : DataDome bloqué, glissière dans un
  onglet de travail, vérification qui dure plus de 3 min, ou tâche refusée par l'anti-robot. Navigateur fermé, plus
  aucune ouverture tant que `etat/endurance/arret.json` existe.
- **Fin de l'essai (sur décision de Nico)** :
  - `npx supabase db query --linked -f scripts/reparations/20261101_cloud_essai48h_nico_INVERSE.sql` (drapeau baissé,
    IP au repos, rotation remise) ;
  - `COMPTES_AUTORISES=00000000-0000-0000-0000-000000000000` dans `/srv/fillsell-cloud/.env`, puis
    `docker compose up -d --force-recreate orchestrateur`.

### Le serveur `fillsell-cloud-1` (cx43, 178.105.24.16, `cloud.fillsell.app`) — réinstallé à neuf le 01/11
- Avant d'effacer : 27 captures → `fillsell-cloud-proto/archives-ancien-serveur/essais-3010/` ; `COFFRE_CLE` v2 →
  `secrets.env` (empreintes identiques). Rebuild Ubuntu 24.04 fini à 17:55, même IP ; socle `outils/installer-serveur.sh`.
- Déployé : **56d7428** (orchestrateur), extension Cloud 0.6.164-cloud (BUILD_ID 2026-11-01T18:00:51Z+dd69fbb).
  Pour redéployer : `DESTINATIONS_PROXY="81.181.239.136:12323" bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app`.
- `.env` (aucun secret ici) : `COMPTES_AUTORISES` = Nico, `ENDURANCE=1`, `MEMOIRE_NAVIGATEUR=2g`, `NAVIGATEURS_MAX=4`,
  `IPROYAL_ACHATS_AUTORISES=0`, `ALERTES_MAIL=0`, `COFFRE_CLE_VERSION=2`, `IMAGE_CHROME` vide (moteur steel).
- Navigateur = steel-browser v0.5.4 épinglé, lancé mot pour mot comme l'essai du § 17, plus `persist`. Fuseau
  Europe/Paris (lu par steel via le proxy, comme l'essai réel ; l'« UTC » du § 17 venait de la vérification sans
  réseau), langue en-US.
- Pare-feu des navigateurs : sortie vers 81.181.239.136:12323 seulement ; preuve `etat/pare-feu.json` exigée.
- **Deux verrous des plateformes** : une plateforme non connectée n'est jamais visitée.
  - L'interception DevTools de l'orchestrateur a arrêté 3 pages à 18:54-18:56 (`ERR_BLOCKED_BY_CLIENT`).
  - La garde de la copie Cloud de l'extension couvre `fetch`, les onglets et les fenêtres.
  - Journal du navigateur : 0 réponse d'une plateforme avant toute connexion.

### Base, fonctions, app
- Migration **20261101180000** (`profiles.cloud_voie`, feu vert nommé de Nico), appliquée et inscrite ; inverse
  `supabase/rollbacks/20261101180000_cloud_voie_drapeau_INVERSE.sql` (après le retour de get-pending-jobs).
- `get-pending-jobs` **v318** (`verify_jwt` vrai) : drapeau levé = l'ordinateur ne reçoit plus aucune tâche Vinted,
  Leboncoin, Beebs, Depop (`_shared/cloud-voie.js`, `selftest:cloud-voie`).
- Compte de Nico : `cloud_voie = true` (seul compte), IP 81.181.239.136 `attribuee_client`, `coin_config.cloud_ip_rotation = 0`
  (sauvegarde `_backup_0111_cloud_essai48h`).
- OTA **2.9.147** : bandeau « reconnecte-toi » (`src/cloud/BandeauCloudReconnexion.jsx`, témoin seul), bouton
  « Connecter mes plateformes ».

### Reste (ensuite, pas avant la fin des 48 h)
- Offres, essai gratuit, landing : APRÈS les 48 h (Nico).
- Avant un 2e compte : répartition des comptes entre serveurs (§ 17.2), langue fr-FR à mesurer à part, et la preuve
  d'identité des OTA Cloud à refaire (outil du 05/10 obsolète : il compare App.jsx à la fusion).
- Les relevés de l'ORDINATEUR d'un compte au drapeau levé ne sont pas coupés (seules les tâches le sont) : sans
  conséquence tant que le poste de Nico est sur ARRÊT.

## 01/11/2026 16:10 — steel-browser CHEZ NOUS : ÇA PASSE (bloc précédent ; la suite est le bloc de 19:35 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 17 (essai, ancien serveur, plan de serveurs) ; page de
décision : `DECISION-0111.md` § 0.

### L'essai (feu vert écrit de Nico, 01/11)
- **Machine** : Hetzner Cloud cpx42 neuf (n° 173977992, nbg1), créé à 15:51:13, **supprimé à 16:04** avec son pare-feu
  (n° 11943520). Coût réel : **0,13 € TTC** (1 heure entamée).
- **Navigateur** : steel-browser v0.5.4 publié (`ghcr.io/steel-dev/steel-browser@sha256:b5bd99de…`), Chromium
  156.0.8078.73 de Debian, le même numéro que Steel loué.
  - Avec écran (Xvfb), `SKIP_FINGERPRINT_INJECTION=true`, publicités non bloquées, aucun résolveur, ni langue ni fuseau
    réglés (UTC, en-US).
  - **3D logicielle activée comme Steel loué**, par deux réglages de lancement. Nico l'a choisi : publié tel quel, la
    3D est coupée.
- **Conditions** : pare-feu de sortie vers 81.181.239.136:12323 seulement (vérifié) ; profil neuf ; « Me connecter » de
  production ; extension 0.6.164.
- **Résultat** : **Leboncoin FORMULAIRE** ; **Beebs GLISSIÈRE** (ID d1a81187-ceed-0a2c-f76f-c8d7001fb40d).
- **Outil** : `essai-me-connecter-steel.mjs --instance=http://127.0.0.1:<port>` (tunnel SSH) ; lanceur hors dépôt
  `fillsell-cloud-proto/essai-steel-oss-0111.mjs` ; images dans `essai-steel-oss-0111/variante-webgl/`.
- **Poste de Nico** : sur ARRÊT ; réveillé de 15:27:53 à 15:28:16 (sonde et messagerie), muet avant, pendant et après
  l'essai (relu à 16:02 et 16:04).

### Ancien serveur `fillsell-cloud-1` : GARDÉ (consigne de Nico : modèle en rupture)
- **Modèle et prix** : Hetzner Cloud cx43 (8 vCPU, 16 Go, 160 Go, fsn1), 178.105.24.16, **19,79 € TTC/mois**
  (15,99 + IPv4 0,50 € HT). Le cx43 est en rupture à fsn1, nbg1 et hel1 (relu à 16:09).
- **Ce qu'il contient d'unique** :
  - `COFFRE_CLE` v2 : elle ne protège que la ligne « fillsell » du coffre de Nico ;
  - `TICKETS_CLE`, régénérable ;
  - 27 captures des essais du 30/10 ;
  - le profil Chrome de Nico.
  Tout le reste est dans le dépôt, dans `secrets.env` ou dans Supabase (empreintes comparées).
- **Proposé, attend le feu vert** : copier les captures hors dépôt, puis réinstaller à neuf (`rebuild` Ubuntu 24.04).
  L'IP est gardée. Ensuite, nouvelle `COFFRE_CLE` et ligne du coffre de Nico effacée par un script de réparation.
  Il devient le serveur de production des abonnés 1 à 10.

### Plan de serveurs (§ 17.2), si l'endurance de 48 h passe
- **1–10** : cx43 réinstallé, 6,62 € par abonné à 10.
- **11–22** : + cpx32 (disponible) par tranche de 6.
- **23–50** : cx43 + AX42 dédié, 7,41 € à 50, + 58,80 € une fois ; les cpx32 sont rendus et leurs abonnés migrés de
  nuit (≈ 2 min de coupure, même IP).
- Ce qui reste par abonné à 50 : **+ 6,99 € (Stripe), + 3,09 € (Apple)**.
- **À construire avant le 11e abonné** : la répartition des comptes entre serveurs (un orchestrateur sert aujourd'hui
  tout le monde, une seule adresse `cloud.fillsell.app`).
- **Plan B (France)** : OVHcloud VPS-3 (6 vCores, 12 Go, 14,69 € TTC) pour les petits paliers ; OVHcloud RISE-M
  (64 Go, 119,99 € TTC + 119,99 € une fois, Gravelines et Roubaix en stock « 1H-high ») en dédié. Rien n'y est essayé :
  le même essai à 0,40 € d'abord.

### Ce qui attend Nico
1. Feu vert séparé : **endurance 48 h** (≈ 6,46 € TTC de cpx42, ou 0 € sur le cx43 réinstallé).
2. Feu vert : réinstallation à neuf de `fillsell-cloud-1` (et copie des captures).
3. Rien d'autre n'est acheté ni lancé. Steel loué : seulement pour des essais.

## 01/11/2026 15:45 — STEEL LOUÉ = ESSAIS SEULEMENT (bloc précédent ; l’essai chez nous est fait, bloc de 16:10 au-dessus)
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 16 ; page de décision mise à jour : `DECISION-0111.md`.
Rien n'est acheté.

### Décisions de Nico (01/11)
- **Rythme** : celui de l'extension (veille des commandes toutes les 10 min, ventes détectées 24 h/24).
- **Steel loué à la minute** : seulement pour tester (≈ 15,5 € par utilisateur = perte).
- **Calculs** : sur ce que Nico touche par abonné Cloud, **14,40 € par Stripe, 10,50 € par Apple** (frais et URSSAF
  déduits), plus jamais sur 20 €. Coûts TTC, sans récupération de TVA.
- **Poste de Nico : sur ARRÊT jusqu'à la fin des essais Cloud**, volontairement ; son compte ne sert qu'aux tests.
  - Ne pas lui demander de le rallumer.
  - Il compte comme muet ; le relire en base avant chaque essai (dernier signe figé depuis le 01/11 à 15:03:59).

### Ce qui est établi (§ 16)
- **Steel loué face à notre Chrome Hetzner du 30/10** : navigateur, langue et fuseau, fenêtre, lancement, IP et passé
  différaient.
  - Steel loué : 81.181.239.136, jamais utilisé par nos Chrome Linux.
  - Notre Chrome : environnement brûlé par les 403.
  - Steel loué a peut-être en plus une « furtivité avancée » non documentée, qu'on ne peut pas exclure.
- **steel-browser (logiciel libre, Apache 2.0, v0.5.4)** :
  - Chromium de Debian, une session par instance ;
  - par défaut sans écran et AVEC injection d'empreinte → à lancer avec `CHROME_HEADLESS=false` et
    `SKIP_FINGERPRINT_INJECTION=true` ;
  - la version louée ajoute : concurrence, furtivité avancée, résolveur, proxys, coffre, fichiers, enregistrements.
  - Déjà utilisé chez nous du 05/10 au 30/10 (image du 05/10), **bloqué** le 30/10 sur l'ancien serveur et les IP
    usées. Jamais essayé sur une machine neuve avec l'IP qui passe.
- **Coût de steel-browser chez nous** (serveur + IP, TTC par utilisateur) :
  - cx43 plein : **6,62 €** (rentable dès 3 abonnés Stripe ou 4 Apple) ; mais **cx43 et cx53 sont en rupture** (API,
    15:30) ;
  - cpx42 (disponible) : 13,04 € à 10 ;
  - AX42 plein : 8,35 € (dès 13 / 21) ;
  - enchère i7-7700 64 Go : 9,18 € à 20.
- Seules voies avec une marge sur les deux canaux : steel-browser chez nous ; Windows AX42 sans RDS (+ 0,78 € côté Apple).

### Prochain essai proposé (UN seul, attend le feu vert écrit de Nico)
- **Machine** : Hetzner Cloud **cpx42** neuf (8 vCPU, 16 Go, nbg1), à l'heure, supprimé après.
- **Navigateur** : steel-browser épinglé par son empreinte (15:36 : `sha256:b5bd99de…`), avec écran, injection coupée,
  aucun résolveur, ni langue ni fuseau réglés.
- **Conditions** : IP 81.181.239.136, profil neuf, « Me connecter » de production, extension 0.6.164.
  - L'outil `essai-me-connecter-steel.mjs` doit d'abord recevoir une option « adresse de l'instance » : rien codé
    pour l'instant.
- **Ordre** : pare-feu (sortie vers le proxy seulement), vérification et essai à blanc sur proxy mort, base relue
  (poste muet), puis une ouverture Leboncoin, puis Beebs ; on s'arrête si c'est bloqué.
- **Coût** : 0,27 € TTC (2 h), 0,40 € TTC au plus (3 h).
- **Si ça passe** : endurance 48 h (≈ 6,46 € TTC), sur feu vert. **Si c'est bloqué** : Cloud en pause (Windows AX42
  seulement après une réponse écrite de Hetzner sur la RDS).

### État
- Ancien serveur `fillsell-cloud-1` (cx43) : la machine est toujours en marche chez Hetzner (relu par l'API à 15:30),
  orchestrateur arrêté. Elle n'a pas été touchée.
- IP, Steel, Shadow : inchangés (bloc 15:20 ci-dessous).

## 01/11/2026 15:20 — ESSAI STEEL FAIT (bloc précédent ; la suite est le bloc de 15:45 au-dessus)
Détail : dépôt `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 15 ; la page de décision :
`docs/enquetes/machine-cloud-3010/DECISION-0111.md`. Rien n'est acheté.

### Verdict de l'essai Steel (15:07:01 → 15:08:06, un seul essai)
- Conditions : session `30f8e35b` (région `iad`, 62 s, 0 crédit, rendue), copie Cloud 0.6.164 (HEAD e48cefb), profil
  neuf, déguisement de Steel coupé, aucun résolveur, IP 3 81.181.239.136 (commande 87004978, fin le 29/11 à 21:00).
- **Leboncoin : FORMULAIRE.** « Vérification de l'appareil » à 5 s, effacée seule ; formulaire à 12 et 25 s.
- **Beebs : GLISSIÈRE.** ID e8e40fab-f085-827a-3451-ade3199d07e2.
- Lecture : Linux en centre de données n'est pas condamné ; c'est NOTRE Chrome Linux de Hetzner qui est repéré (brûleurs
  du 05/10 au 30/10). Un seul essai : la tenue dans la durée n'est pas prouvée.
- Images et bilan : `fillsell-cloud-proto/essai-steel-3010/`. Le lanceur refuse un second essai (`bilan.json` existe).

### Poste de Nico
- Muet côté serveur : impossible dans ses règles (aucun drapeau par compte ; en créer un = redéployer get-pending-jobs
  pour tout le parc ; l'extension lance aussi ses propres alarmes). Un geste : extension sur ARRÊT dans
  `chrome://extensions`.
- Vérifié en base : dernier signe 15:03:59, dernière écriture 15:04:05. Seul le relevé eBay de 15:07:06 a bougé, et il
  vient de la tâche planifiée serveur `ebay-messagerie-20min` (API eBay).
- **Extension de Nico sur ARRÊT, volontairement, jusqu'à la fin des essais Cloud** (Nico, 01/11 15:40 : son compte ne sert qu'aux tests ; ne pas l'attendre). À la remise en MARCHE,
  relire en base : `profiles.extension_last_seen_at` qui avance, jobs et messagerie qui reprennent. Requête :
  dernier signe, jobs `processing`, `cross_post_jobs` (created/published/last_checked/vu_en_ligne),
  `vinted_sync_runs`, `messagerie_releves.dernier_le`, `usage_logs` après l'heure de remise.

### La décision (page DECISION-0111.md), en bref (TTC par utilisateur, face aux 20 €)
- **Steel 24 h/24** : 69 à 83 € → exclu.
- **Steel à la demande + ronde de 10 min** (liste des commandes Vinted et LBC, rythme de la veille de l'extension) :
  ≈ 15,5 € en moyenne, 18 € pour 9 utilisateurs sur 10 ; 0 € de coût fixe. Ventes détectées 24 h/24. Il faut une
  ronde de moins de 1 min 30 s.
- **Mac mini** : licence macOS bloquante (§ 3.A, 2.I, 2.J).
- **Windows + carte** (Hetzner 3093130, centron, Azure spot, AX42) : 9,7 à 15,6 € sans RDS, 20,6 à 26,6 € avec RDS
  (lecture prudente) ; coût fixe 152 à 572 €/mois.
- **Shadow** : 29,86 €, écarté par Nico.
- **Recommandation : (a) Steel, à la demande, avec une ronde de 10 min.**
  - Prochain essai : endurance de 48 h, compte de Nico seul : profil Steel persistant, connexion faite par Nico dans le
    vrai écran « Me connecter » servi sur son PC, rondes de 10 min.
  - Coût : **1,06 € TTC au plus** (0,99 $), ≈ 0,54 € attendu ; IP déjà payée ; aucun abonnement.
  - À préparer d'abord : un outil local, l'enregistrement des sessions Steel coupé, les conditions de Steel lues.
  - Repli : (d) pause ; (c) seulement après une réponse écrite de Hetzner ou de centron sur la RDS.
- **En attente du feu vert écrit de Nico** sur la voie et sur l'essai. Rien n'est lancé.

### État inchangé
- Ancien serveur `fillsell-cloud-1` : orchestrateur arrêté. Aucun serveur loué. Shadow résilié par Nico
  (renouvellement le 30/11).
- IP : fixe 1 (fin le 04/11 à 13:57), fixe 2 et IP 3 (fin le 29/11), sans renouvellement ; solde IPRoyal 7,35 $ (relu
  le 31/10).
- Steel : copie Cloud 0.6.164 chez Steel (identifiant dnankhhfellobiobloopcjgkdioblpjd).

---

Mis à jour le **05/10/2026, 16:40** (terminal Cloud n° 3, Nico absent, GO
écrit pour les six étapes). Remplace, pour la suite, le REPRISE du prototype
(`C:\Users\nicol\fillsell-cloud-proto\REPRISE.md`, qui garde l'histoire du 26/09).

## 0. En une phrase

L'option **« Sans ordinateur »** (FillSell Cloud, 20 € TTC/mois, essai 7 jours
avec carte, ouverte au Free) fait tourner NOTRE extension dans un navigateur
**steel-browser** hébergé chez **Hetzner**, un par compte, qui sort par une **IP
française dédiée** (IPRoyal). **Depuis le 05/10 16:00, le code est dans `main`**
(fusion 7b9771c) et **servi** (web + OTA **2.9.56**) — drapeau `cloudOffer` à
`false`, Nico SEUL témoin (écran B) : pour tout autre compte, l'app est
identique à la 2.9.55 (preuve § 0 bis). Le socle est en base (deux migrations),
le mail « paiement échoué » est en ligne pour TOUTES les formules (événements
Stripe cochés). Le serveur de test tourne sur `main` ; le test complet s'est
arrêté à la page de connexion Vinted : la suite exige Nico (ses identifiants).

**Pour un NOUVEAU terminal** : lire le § 0 bis (ce qui est fait, ce qui reste,
les refus). Travailler dans le dossier PRINCIPAL (`main`) : la branche
`feat/cloud` et son worktree sont PÉRIMÉS (tout est fusionné ; ne plus y
commiter). Ce qui reste, dans l'ordre : (1) le sel des empreintes au vault
(**Nico**, refusé au classifieur, § 0 bis) ; (2) le test complet avec Nico
(connexions depuis l'écran B, puis publication / republication / retrait, § 0 bis
« Pour finir le test ») ; (3) la mise en ligne (`mise-en-ligne.md`, sur GO).

## 0 bis. Le 05/10, 15:35 → 16:40 — les six étapes du GO de Nico

| Étape | Fait ? | Preuve |
|---|---|---|
| 1. Fusion `feat/cloud` → `main` b38d842 | **FAIT** | merge 7b9771c (conflits palier.js, package.json ; get-pending-jobs et App.jsx auto-fusionnés, relus : main + les 3 blocs `poste_cloud`) ; **188/188 selftests** ; preuve d'identité contre **2.9.55** (4efb8b8) : **IDENTIQUE, 32 contrôles, 708 scènes octet pour octet**, palier identique, aucune requête Cloud |
| 2. Mail « paiement échoué » en ligne | **FAIT** | `email-tunnel` v69 → v70 → **v71**, `stripe-webhook` v56 → **v57**, `verify_jwt` false relu avant/après (`deployer-fonctions-cloud.mjs --seulement`) ; code téléchargé = dépôt ; `selftest:paiement-echoue` vert ; **14 mails FR du parc identiques octet pour octet** au code de prod d'avant (`scripts/cloud/mails-fr-identiques.mjs --avant b38d842 --apres-dossier <téléchargé>`) ; événements Stripe cochés (liste ci-dessous) |
| 3. Migrations 20261004233000 + 20261005120000 | **FAIT** (sel : NON) | appliquées (`lock_timeout` 5 s) et inscrites (`repair`) ; 39 fonctions `cloud_*`, 10 tables (RLS, 0 droit client), 4 fonctions « _moi » ouvertes aux connectés, 0 à `anon`, index des mails 15 types, aucun cron ; 0 ligne `profiles` touchée ; sauvegarde/inverse `scripts/reparations/20261005_cloud_socle_*` ; CPU base : avant 3,8–8,8 % (≈ 5 %), après max 9,7 %, moyenne 4,9 % |
| 4. Serveur redéployé depuis `main` | **FAIT** | 7452e23 puis 34c915e (3 correctifs, ci-dessous) ; extension **0.6.98-cloud** ; contrôles verts ; `NAVIGATEURS_MAX=8`, achats IPRoyal 0, alertes mail 0, compte de Nico seul (relus dans `.env`) ; aucun achat |
| 5. OTA écran B + /legal en anglais | **FAIT** (relecture web : NON) | `/legal` lit `?lang=en|fr`, le pied des mails anglais y mène (2dc260c, `selftest:legal-langue` 9, rouge sur l'ancienne page) ; **UN push** `326b3a0..7452e23` ; build `2026-10-05T14:00:19Z+7452e23` ; **Capgo production = 2.9.56** (checksum compatible, aucune alerte native) |
| 6. Test complet (compte de Nico) | **PARTIEL** | voir « Le test » ci-dessous : socle, IP, navigateur, écran « Me connecter » jusqu'à la page Vinted ; connexion et gestes = Nico |

**⚠️ Le push de la fusion est parti AVANT ma preuve** : le terminal Problèmes,
qui travaillait encore dans le dossier principal, a commité `326b3a0` (docs) à
15:40:54 par-dessus ma fusion locale 7b9771c (15:40:25) et l'a poussée — le web
a servi la fusion dès 13:41:11Z. La preuve (708 scènes, 15:45) est venue après,
verte. Leçon : vérifier qu'aucun autre terminal n'écrit dans le dossier
principal avant d'y fusionner.

**Stripe, endpoint `we_1TNHq1QZRA77vrWJHXw51Svb` (relu par l'API, mode réel)** —
AVANT : `checkout.session.completed`, `customer.subscription.deleted`,
`customer.subscription.updated`, `invoice.paid`. APRÈS (15:55, relu à 16:35) :
les mêmes + `invoice.payment_failed` + `invoice.payment_action_required`,
`status: enabled`. ⚠️ Le mail client part désormais pour TOUTES les formules.
**Aucun mail parti pour un vrai client** jusqu'à 16:34 : `email_logs`
`payment_failed:%` = 0, `ops_paiement_echoue` = 0 (base de départ : 0, ce chemin
n'avait jamais tourné). À relire demain : `select email_type, sent_at from
email_logs where email_type like 'payment_failed:%'` et les journaux de
`stripe-webhook` (`[webhook] échec …`). Retour arrière : la liste des 4.

**L'ordre a été changé, et pourquoi** : `email-tunnel` a été déployé AVANT les
migrations, mais `stripe-webhook` APRÈS : la nouvelle version lit
`profiles.cloud_canal` et écrit `is_cloud` dans `recomputeStripeFlags` ; sans la
colonne, le recalcul des abonnements de TOUS les clients Stripe aurait échoué.
Pour un client sans Cloud, elle écrit `is_cloud = false` : le déclencheur
`profiles_cloud_pool` s'éveille, `cloud_compte_synchroniser` rend « rien »
(aucune IP), coût négligeable.

**Refus du classifieur (NON contournés)** :
- 15:5x, pose du sel au vault (`vault.create_secret(…, 'cloud_empreinte_sel', …)`,
  valeur tirée en base, jamais affichée) : « Permission for this action was
  denied by the Claude Code auto mode classifier. Reason: [Secret-Store Writes]. »
  → **Nico** (une ligne SQL, éditeur Supabase) :
  `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cloud_empreinte_sel', 'sel des empreintes Cloud (HMAC)');`
  Sans lui : `cloud_hacher` refuse, donc la préparation d'un ESSAI refuse et la
  note du compte de plateforme à la première connexion échoue (l'option offerte
  et la connexion elle-même fonctionnent).
- 16:02, relecture du déploiement web après le push (`curl
  https://fillsell.app/build.json` en boucle, puis l'entrée avec et sans
  `Origin`) : « Permission for this action was denied by the Claude Code auto
  mode classifier. Reason: [Out-of-Place Publication]. » → **à relire par Nico
  ou le prochain terminal** : `curl -s https://fillsell.app/build.json` doit dire
  `+7452e23` (ou le commit de la REPRISE si poussé après), et l'entrée
  `assets/index-*.js` doit rendre 200 avec `Origin: https://fillsell.app`.

**Le test (16:06 → 16:34, compte de Nico seulement)** :
- IP 84458881 entrée au pool (`ip.mjs ajouter`, identifiants au vault par la
  fonction) → **mise au REBUT à tort** par son contrôle d'entrée (Vinted et
  Leboncoin « bloque ») : le motif des murs contenait « datadome », or les deux
  sites chargent ce script sur leurs pages OUVERTES. Prouvé par une lecture de
  diagnostic par la même IP (vrais titres, menus). Corrigé (91511bb,
  `verdictPage`, test) ; réparation `20261005_cloud_ip1_rebut_a_tort.sql` (inverse
  prêt) ; contrôle refait : Vinted ok, Leboncoin ok, eBay ok, sortie FR → disponible.
- Nico en option OFFERTE (`20261005_cloud_test_nico_offert.sql`, 16:14:12) → IP
  attribuée par le déclencheur → **navigateur ouvert 18 s après** (16:14:30),
  session FillSell fabriquée (0dd913f4), extension Cloud au serveur 2 s plus
  tard ; `profiles.extension_build` de l'ordinateur de Nico INCHANGÉ (b7b756c).
- Écran « Me connecter » (page autonome, ticket 15-20 min, Chrome du poste) :
  **deux défauts trouvés et corrigés** — le module de la page visait `/client.js`
  (503) : aucun bouton ne répondait (2e029c7) ; Vinted redirige désormais
  `/member/signup/select_type` → `/member/register/select_type`, refusé par la
  garde, page renvoyée **4 à 5 fois par seconde sans fin** (100 refus en 15 s) →
  « register » permis + arrêt au 5e refus en 20 s avec message et alerte
  `connexion_boucle` (34c915e). Après correctif : page Vinted au format
  téléphone **8 s** après le clic, gestes rejoués (pays, « Cookies requis
  uniquement », « Se connecter » → « Bienvenue ! Continuer avec Google / Apple /
  Facebook / e-mail »). **Arrêt ici : les identifiants sont ceux de Nico.**
- **RAM réelle** du navigateur de Nico (extension 0.6.98-cloud qui tourne) :
  592 Mo à l'ouverture, **650–660 Mo au repos**, **966 Mo** écran de connexion
  ouvert ; hôte 1,4 Go utilisés sur 15,6. Mesure outil (profil neuf, accueils) :
  pic **971 Mo** (802 avec 0.6.96) → NAVIGATEURS_MAX proposé 10 (NON appliqué : 8).
- CPU de la base pendant le test : max 7,7 %, moyenne 4,6 %. Aucun job de Nico
  créé ni pris ; aucun job traité par le Cloud.
- **Fin** (16:31:34) : inverse appliqué (Nico sans option, colonnes à NULL) →
  navigateur fermé (16:32:31), purge prouvée à l'entretien (16:33:46) : profil
  détruit, coffre 0, cookies 0, session 0dd913f4 révoquée, identifiants du proxy
  renouvelés chez IPRoyal ; **IP au repos jusqu'au 12/10 16:31** (Nico la
  reprend s'il revient avant). La session 0ba8903a « gardée pour le test » n'a
  PAS été utilisée ni révoquée (l'orchestrateur fabrique la sienne).

**Pour finir le test (avec Nico, sur son iPhone)** : (a) le sel au vault (ci-dessus) ;
(b) `npx supabase db query --linked -f scripts/reparations/20261005_cloud_test_nico_offert.sql` ;
(c) Nico : app 2.9.56 › Réglages › Abonnement › « Connecter Vinted et
Leboncoin » (écran B ; ou un ticket : `docker compose exec -T orchestrateur node
outils/ticket.mjs f44b5917-bccc-4431-ba41-f40571a2ed18 20`) ; (d) gestes sur une
annonce de test à 999 €+ (publication, republication, retrait ; `handler_build`
en `…-cloud`), vérifiés dans le Chrome de Nico ; (e) l'inverse
`…_nico_offert_INVERSE.sql`. Pendant (b)→(e), l'extension de bureau de Nico
devrait être en pause : sinon les deux postes se disputent ses jobs Vinted/LBC.

**Coût réellement engagé par ce terminal : 0 €** (aucun achat ; serveur déjà
facturé à l'heure ≈ 0,66 € TTC/jour ; IPRoyal 16 $ de solde inchangé).

## 1. Où est tout

- Branche **`feat/cloud`** (worktree **`C:\Users\nicol\fill-and-sell-feat-cloud`**,
  créé le 05/10 à 13:20 parce que `fill-and-sell-cloud` porte `fusion/cloud-main`) —
  poussée, canonique, partie d'`origin/main` 5d6a0e9. Ce worktree n'a PAS de
  `npm ci` à la racine (PC à court de mémoire) : son `node_modules` ne contient
  que `terser`, `jszip` et leurs 19 dépendances, copiés de `fill-and-sell-cloud`
  — de quoi lancer `lancer-serveur-test.mjs` (build de l'extension Cloud compris)
  et les selftests sans dépendance (paiement-echoue, option-cloud,
  cloud-rappel-veille, paiement-stripe, imports-epingles), pas `npm run build`.
  `serveur-cloud/node_modules` : `npm ci` léger (supabase-js, ws ; 9 Mo) pour
  `node --test serveur-cloud/tests/*.test.mjs` (20/20).
- Branche LOCALE **`fusion/cloud-main`** (worktree `C:\Users\nicol\fill-and-sell-cloud`, NON poussée, ⛔ on n'y touche pas : elle
  porte les commits non poussés du terminal Problèmes) = `main` local du 05/10
  (47700b1) + `feat/cloud`, conflits résolus, **179/179 selftests verts**.
  Elle se refait en une commande (§ 4.1) : c'est un brouillon de la fusion.
- `docs/cloud/` : `pool-ip.md`, `paiements-option-cloud.md`, `test-complet.md`,
  `mise-en-ligne.md`, `fiche-boutiques.md`, `confidentialite.md` (FINALE),
  **`nico-telephone.md`** (gestes de Nico, coûts), ce fichier.
- Base : `supabase/migrations/20261004233000_option_cloud_paiements.sql` puis
  `20261005120000_cloud_socle_ip_dediee.sql` (NON appliquées ; inverse en tête).
- Serveur : `serveur-cloud/` — **commande unique** `outils/lancer-serveur-test.mjs`.
- Extension Cloud : `scripts/cloud/build-extension-cloud.mjs` (11 patchs à ancre
  unique sur `chrome-extension/` commité, jamais modifié).
- App : `src/cloud/` (achat, « Me connecter », écrans, **textes légaux**),
  `src/config/cloudOffer.js` (drapeau, témoins = Nico, `CLOUD_TEXTES_LEGAUX`).
- Secrets (hors dépôt) : `C:\Users\nicol\fillsell-cloud-proto\secrets.env` —
  les trois jetons **posés et vérifiés en lecture le 05/10** : `HCLOUD_TOKEN`
  (projet fillsell-cloud, 0 serveur) ; `IPROYAL_API_TOKEN` (compte du prototype,
  solde 20,00 $, ISP Dedicated › 30 Days › France à **4,00 $**, achat minimum 1) ;
  `CLOUDFLARE_API_TOKEN` (valide, zone fillsell.app accessible, « DNS : Modifier »
  sur cette zone seule, **expire le 12/10**). État du test (sans secret) :
  `cloud-test-etat.json` à côté (§ 4.2).

## 2. Décisions de Nico (05/10)

1. IP dédiée par compte ; **repos de l'IP : 7 jours** (validé).
2. 20 € TTC partout.
3. Délai entre deux sessions : réglage `coin_config.cloud_delai_sessions_min`,
   absent = en continu. Non figé.
4. **Rappels de fin d'essai Stripe : coupés** (Nico, dans le tableau de bord, le
   05/10 au soir). Notre mail de la veille reste tel quel derrière sa garde et
   part à la mise en ligne.
5. **Écran du test : B, dans l'app** — Nico dans `CLOUD_TEMOINS` ET
   `CLOUD_OFFRE_TEMOINS`, lui seul ; aucun autre compte ne voit rien.
6. Apple, Google, Stripe (tableau de bord) : Nico, avec `fiche-boutiques.md`.
   ⛔ Dans Stripe, NE PAS cocher `invoice.payment_failed` /
   `invoice.payment_action_required` (Claude les ajoute par l'API à la mise en
   ligne, étape 4 bis, sur GO de Nico).
7. **Mail « paiement échoué »** (05/10 après-midi) : GO pour tout corriger
   (pied anglais, fin d'essai à part, 3D Secure vers la page Stripe, aucun geste
   promis qui n'existe pas) — fait sur `feat/cloud`, § 4.5. Déploiement et
   cochage : GO de Nico.
8. **Serveur de test** (05/10 après-midi) : transaction autorisée par Nico, UNE
   fois — cx43 Falkenstein, UNE IP France ISP Dedicated 30 j à 4 $ sans
   renouvellement, DNS `cloud.fillsell.app`. Rien d'autre (pas de 2ᵉ serveur,
   pas de 2ᵉ IP, pas de reprise de #83578416).

## 3. Les tests (05/10, tout vert)

```
npm run selftest:palier              83
npm run selftest:cloud-pool          104
npm run selftest:cloud-ecrans        171
npm run selftest:cloud-achat         30 (témoins = Nico seul, tout autre id refusé)
npm run selftest:cloud-textes-legaux 39 (nouveau : faits relus dans le code, /legal baissé puis levé)
npm run selftest:cloud-orchestrateur 20 (dont « socle absent »)
npm run selftest:option-cloud · cloud-rappel-veille · cloud-extension 19
npm run selftest:paiement-echoue     315 (05/10 : mail « paiement échoué », § 4.5)
node scripts/cloud/banc-sql-socle.mjs 80
# AVANT toute OTA — la preuve qu'un compte ordinaire voit l'app servie à l'identique :
node scripts/cloud/preuve-identite-compte-ordinaire.mjs --version <n° lu sur le canal Capgo>
```
Batterie complète sur `fusion/cloud-main` : **179/179 selftests verts** (05/10).
Preuve d'identité contre `main` (la base de la fusion) : **708 scènes identiques
octet pour octet** (Free/Premium/Pro/Business/sans compte, fr/en, téléphone/
ordinateur ; feuille des formules, mur de l'extension, carte d'installation,
étape d'entrée, page /extension, Réglages › Abonnement, /legal), palier
identique, aucune requête Cloud, contrôle négatif vert (pour Nico, ça diffère).
Contre la version SERVIE (OTA 2.9.53, 4859311) : **ÉCHEC attendu** — 8 fichiers
de l'app du lot Problèmes pas encore servis partiraient avec l'OTA (§ 4.1).
⚠️ `npm run build:essai` NON relancé le 05/10 (lourd ; le terminal Problèmes
tournait, 1,3 Go libres) : à faire avant l'OTA.

## 4. Ce qui reste (dans l'ordre)

> **05/10 16:40** : § 4.1 (fusion, migrations, OTA), § 4.2 (redéploiement) et § 4.5
> (mail en ligne, événements cochés) sont FAITS — voir § 0 bis. Le texte ci-dessous
> est gardé pour l'histoire ; le § 4.3 (test complet) reste, avec Nico.

### 4.1 L'écran B sur l'iPhone de Nico — après la fin du terminal Problèmes

**Relu le 05/10 à 15:20** : le lot Problèmes est **POUSSÉ et SERVI** —
`origin/main` = `main` local = **b38d842** (package 2.9.55, extension
**0.6.98**, CWS à téléverser selon sa reprise), web `build.json` =
`2026-10-05T13:07:43Z+b38d842`, OTA 2.9.55 faite (mémoire du terminal
Problèmes, à relire sur le canal Capgo). ⚠️ `fusion/cloud-main` (e5ee242, base
47700b1) est donc PÉRIMÉE : la fusion se refait contre `origin/main` b38d842
(point 3), la preuve « IDENTIQUE » se fait contre **2.9.55** (ou ce que dit le
canal). Le terminal Problèmes travaillait encore sur le compte de Nico : la
fin se vérifie (§ 4.3), elle ne se suppose pas. Ordre :
1. le terminal Problèmes a clos son lot (fait côté push et OTA le 05/10 ;
   vérifier qu'il n'écrit plus et que le compte de Nico est calme) ;
2. **la base** (dire à Nico AVANT, GO) : l'écran B LIT les colonnes et fonctions
   Cloud — sans `20261004233000` (colonnes + `cloud_etat_moi`) et
   `20261005120000` (`cloud_essai_preparer_moi`, `cloud_coffre_etat_moi`), la
   lecture échoue et l'écran ne montre RIEN, même à Nico. Effet sur les autres
   comptes, relu : colonnes nulles ajoutées à `profiles` (droits par colonne :
   personne ne peut les écrire), un déclencheur qui ne s'éveille que sur les
   colonnes Cloud, l'index `email_logs_one_shot_unique` refait avec un type de
   plus (même liste + `cloud_essai_veille`), 10 tables `cloud_*` fermées,
   aucun cron. Sans le sel `cloud_empreinte_sel` au vault, la préparation
   d'essai refuse (rien ne s'ouvre) ;
3. dans le dossier PRINCIPAL : `git merge --no-ff origin/feat/cloud` (conflits :
   `src/utils/palier.js` = le ré-export de main + la section Cloud de
   feat/cloud, qui importe aAuMoins / palierDuProfil / droitsDuPalier de
   `_shared/palier.js` ; `package.json` = les deux listes ; `get-pending-jobs`
   s'auto-fusionne : main + les 3 blocs `poste_cloud`, vérifier
   `git diff main -- supabase/functions/get-pending-jobs/index.ts`) ;
4. 179+ selftests, `npm run build:essai`, puis
   `preuve-identite-compte-ordinaire.mjs --version <canal>` → **IDENTIQUE** ;
5. version montée (package.json + lock), commit, UN push, `npm run build`,
   `npx @capgo/cli bundle upload --channel production --bundle <v> --path dist --delta` (toujours delta, 06/11),
   relecture du canal. Rien d'autre : ni fonction, ni drapeau.

### 4.2 Le serveur de test — CRÉÉ, DÉPLOYÉ, PRÊT (05/10, 15:10 Paris)

Transaction autorisée par Nico (décision 8), lancée par Claude le 05/10 à
14:57 (le classifieur l'avait refusée à 13:35, il l'a laissée passer après
l'autorisation écrite). **État réel** :

| | |
|---|---|
| Serveur | Hetzner `fillsell-cloud-1` (id 168804683), **cx43, fsn1 (Falkenstein)**, IPv4 **178.105.24.16** (+ IPv6, les deux `auto_delete`), créé 12:57:44 UTC ; seul serveur du projet, aucun volume, pare-feu `fillsell-cloud` (22/80/443), clé SSH `~/.ssh/fillsell_cloud_ed25519` (sur le PC de Nico) |
| IP de test | IPRoyal commande **84458881** — ISP Dedicated, France, 30 jours, quantité 1, **sans renouvellement** (passée avec `auto_extend: false`, aucune question) ; IP **94.194.94.233** (sortie vue : FR, Paris), port 12323 ; échéance **04/11/2026 12:57 UTC** ; identité IPRoyal non vérifiée : l'achat est passé quand même |
| DNS | `cloud.fillsell.app` A → 178.105.24.16, nuage GRIS (Cloudflare, TTL 60) ; TLS obtenu par Caddy |
| Déployé | commit **920c2fa** de `feat/cloud` (orchestrateur `fillsell-orchestrateur:920c2fa064a3`, navigateur `fillsell-navigateur:920c2fa064a3`) ; extension Cloud **0.6.96-cloud** (`chrome-extension/` de feat/cloud) |
| Contrôles | ✓ `https://cloud.fillsell.app/sante` `{"ok":true,"serveur":"cloud-1","navigateurs":0}` · ✓ caddy + orchestrateur `running` · ✓ pare-feu FILLSELL-NAV · ✓ navigateur SANS proxy : rien (code 000) · ✓ par l'IP de test : sortie 94.194.94.233 (FR, Paris) |
| Mesure | UN navigateur allumé (compte fictif, profil neuf détruit, accueil Vinted puis Leboncoin) : **pic 802 Mo, moyenne 679 Mo** (limite 1400m) ; hôte 15 614 Mo → **NAVIGATEURS_MAX proposé : 13** ((15 614 − 2 048) / (802 × 1,3)) ; **NON appliqué** : le `.env` du serveur garde `NAVIGATEURS_MAX=8` (le test n'en allume qu'un) |
| Garde-fous (relus dans `/srv/fillsell-cloud/.env`, chmod 600) | `IPROYAL_ACHATS_AUTORISES=0` · `ALERTES_MAIL=0` · `COMPTES_AUTORISES=f44b5917…` (Nico seul) · `CPU_PAUSE_AU_DESSUS=50` · clés Supabase, coffre, tickets, jeton IPRoyal posés, jamais affichés |
| Base | l'orchestrateur a dit `socle_absent` (planificateur 13:08:29, entretien 13:09:24 UTC) puis ne réessaie que toutes les 10 min : 2 appels refusés / 10 min. CPU de la base : 4,9 % avant, 5,8 % après (max 11 % sur 30 min) |

**Coût réellement engagé** : IP **4,00 $** (solde IPRoyal 20 → 16 $) ; serveur
facturé à l'heure depuis 12:57 UTC : 0,0307 € TTC/h + IPv4 0,60 € TTC/mois
(≈ 0,66 € TTC par jour, plafond 19,79 € TTC/mois) ; Cloudflare 0 €. Supprimer
le serveur arrête tout (Hetzner, `DELETE /servers/168804683`) — décision de Nico.

**Trois défauts trouvés au premier déploiement, corrigés et commités** (le
`--go` a été relancé deux fois, sans rien racheter) : `COPY --chmod` exige
BuildKit, absent du docker.io d'Ubuntu 24.04 (a32e712) ; l'orchestrateur parlait
l'API Docker 1.43, Docker 29 exige 1.44 au minimum → redémarrage en boucle
(88cdaa6, tests orchestrateur 20/20) ; `docker compose ps|exec` après coup sans
`VERSION_ORCHESTRATEUR` → `deploiement/.env` écrit par deployer.sh (920c2fa).
Plus l'affichage du lieu Hetzner (07608a4, sans effet sur le serveur).

**À relire dans `C:\Users\nicol\fillsell-cloud-proto\cloud-test-etat.json`**
(aucun secret) : `serveur` (id, ip, type ; `lieu` absent de ce fichier, c'est
fsn1), `ip_test` (commande 84458881, ip, port, `expire_le`), `deploye` (sha,
domaine, `controles_ok: true`), `mesure` (pic, moyenne, `navigateurs_max_propose`,
`profil_detruit: true`). Relancer `node serveur-cloud/outils/lancer-serveur-test.mjs`
(sans `--go`) = le PLAN en lecture : il doit dire « 1 serveur — repris » et
« cloud.fillsell.app → 178.105.24.16 (= le serveur) ».

Sur le serveur : `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16`, puis
`cd /srv/fillsell-cloud/deploiement && docker compose logs --tail 50 orchestrateur`.

**Ce qui reste pour le serveur** (nouveau terminal) : après la fusion,
REDÉPLOYER depuis le dossier principal (même commande `--go`, rien n'est
racheté) pour embarquer l'extension **0.6.98** (main b38d842) et le code fusionné ; puis, au
test complet : `docker compose exec orchestrateur node outils/ip.mjs ajouter
84458881` (après les migrations). Décider `NAVIGATEURS_MAX` (8 ou 13) avant
d'ouvrir à d'autres comptes. L'IP du prototype #83578416 (jusqu'au 26/10) n'est
PAS reprise (décision de Nico).

### 4.3 Le test complet (`test-complet.md`) — sur le GO de Nico

Prérequis : le terminal Problèmes a FINI sur le compte de Nico (deux exécutants
sur le même compte = test illisible) — le vérifier : son transcript n'écrit
plus, son lot est poussé, et `cross_post_jobs` du compte de Nico n'a plus de
`pending`/`processing` venant de son extension ; puis l'extension de bureau de
Nico en pause. Session **0ba8903a** posée au coffre, révoquée juste après.

### 4.4 La mise en ligne (`mise-en-ligne.md`) — sur GO, en une passe

Dont l'étape **4 bis** (les deux événements Stripe, par l'API, juste après la
nouvelle `stripe-webhook`) : ⚠️ la `stripe-webhook` en prod (v56) traite DÉJÀ
ces événements depuis le 07/08 (mail au client, alerte) sans les avoir jamais
reçus — les cocher allume ce mail pour TOUTES les formules : GO de Nico avant.
Les textes légaux partent avec le drapeau (`CLOUD_TEXTES_LEGAUX`).

### 4.5 Le mail « paiement échoué » — CORRIGÉ sur `feat/cloud`, NON DÉPLOYÉ, événements NON cochés

GO de Nico le 05/10 après-midi : « on corrige tout, texte nickel dans tous les
cas ». Fait le 05/10 (commits 26772fa, cd069a3, acce21a, b4240ae) :
- **pied du gabarit dans la langue du mail** (`_shared/email-template.ts`,
  `textesPied`) : tout mail anglais finissait en français. Français octet pour
  octet inchangé (14 rendus comparés à HEAD : bienvenue, comment ça marche, lien
  de l'extension, relances 1 et 2, résiliation, ventes, gabarit nu) ; anglais :
  seul le pied change. Liens du pied relus : `/legal#mentions` et
  `/legal#confidentialite` existent (`src/pages/Legal.jsx`) ; limite connue :
  /legal choisit sa langue par `localStorage.fs_lang` (français par défaut), un
  lecteur anglais qui n'a jamais réglé l'app en anglais la voit en français
  (correctif possible plus tard : `?lang=en`, dans l'app → OTA) ;
- **règles et textes** : `_shared/paiement-echoue.js` (pur, testé), mis en page
  par `mailPaiementEchoue` (`_shared/emails-fillsell.ts`). Trois contextes :
  souscription, renouvellement, **fin d'essai** (Cloud : « Ton essai FillSell
  Cloud est terminé et le paiement n'a pas abouti »). **Détection de la fin
  d'essai sur les données de Stripe** : `facture.billing_reason ===
  'subscription_cycle'` ET `abonnement.trial_end` non nul ET une ligne de la
  facture dont `period.start` = `trial_end` (à 60 s près) — facture et
  abonnement RELUS par l'API dans `stripe-webhook` ;
- **chaque geste promis existe** : souscription → bouton vers l'app (une
  facture réglée hors de Checkout n'ouvre PAS l'abonnement : `is_premium` et
  `stripe_customer_id` ne se posent que sur `checkout.session.completed`) ;
  renouvellement et fin d'essai → `hosted_invoice_url` d'une facture `open`
  (« Régler la facture » / « Valider le paiement » pour un 3D Secure) ; pas de
  page réglable → aucun bouton, « réponds à ce mail » ; « Stripe retentera le
  paiement le … » seulement si `next_payment_attempt`, jamais pour un 3D Secure
  ni une carte expirée ; « reste actif » seulement au renouvellement et si
  l'abonnement est `active`/`past_due` ; « mets à jour ton moyen de paiement
  depuis l'app » SUPPRIMÉ (le portail n'existe que sur le web, sous « Mes
  factures ») ;
- **bogue trouvé en passant** : l'événement arrive au format `2026-03-25.dahlia`
  (relevé du 24/09), sans `payment_intent` : la cause fine (carte refusée,
  expirée) ne se lisait JAMAIS. `stripe-webhook` relit désormais la facture par
  le SDK (2023-10-16) ;
- **ordre de mise en ligne** : `email-tunnel` AVANT `stripe-webhook`
  (`deployer-fonctions-cloud.mjs`), un ancien `email-tunnel` rendrait une fin
  d'essai en « souscription » ;
- **preuves** : `npm run selftest:paiement-echoue` (315 : règles, 24 variantes
  fr/en, cas sans lien, rendu par le vrai gabarit, câblage webhook → notify →
  tunnel) ; `cloud-rappel-veille` 35, `option-cloud` 58, `paiement-stripe` 21,
  `imports-epingles` verts ; `deno check` : email-tunnel 0 erreur (= HEAD),
  stripe-webhook 34 (HEAD 32 : les deux nouveaux appels `stripe.invoices` /
  `stripe.subscriptions` sur un SDK chargé en `?no-check`, même famille).

⛔ Rien de déployé (email-tunnel v69 et stripe-webhook v56 tournent toujours),
rien de coché chez Stripe. Reste, sur GO de Nico : déploiement (avec la mise en
ligne Cloud, ou seul : `email-tunnel` puis `stripe-webhook`, même `verify_jwt`
= false), PUIS cocher les deux événements par l'API (étape 4 bis), puis un
« Send test event » → alerte « compte introuvable » = câblage prouvé.
Fusion : `origin/main` b38d842 n'a touché AUCUN de ces fichiers (ni `serveur-cloud/`, ni
`scripts/cloud/`) depuis la base commune 5d6a0e9 — pas de conflit attendu sur ce lot.

## 5. Garde-fous

- `cloudOffer` à `false` ; témoins = Nico SEUL (`NICO_USER_ID`) ; tout autre
  identifiant refusé (selftest).
- Jamais changer un `verify_jwt` (le script de déploiement le vérifie).
- Aucun achat IPRoyal hors de `lancer-serveur-test.mjs --go` (1 IP, plafond 8 $,
  sans renouvellement) ; orchestrateur `IPROYAL_ACHATS_AUTORISES=0`,
  `ALERTES_MAIL=0`, `COMPTES_AUTORISES` = Nico.
- Pause des démarrages au-dessus de 50 % de CPU de la base.
- Trois verrous contre la fuite de l'IP du serveur.
- Annonces de test à 999 € ou plus, retirées à la fin.
- PC de Nico : rien de lourd pendant qu'un autre terminal travaille.
- Échéances : jeton Cloudflare jusqu'au **12/10** ; IP de test 84458881 jusqu'au
  **04/11** (sans renouvellement : elle s'éteint seule) ; serveur facturé à
  l'heure tant qu'il existe (≈ 0,66 € TTC/jour) — le supprimer = décision de Nico.
- Aucun 2ᵉ serveur, aucune 2ᵉ IP, aucune reprise de #83578416 sans nouvelle
  décision de Nico (décision 8).

## 6. Points d'attention connus

- `get-pending-jobs` : prod **v216 = `main` local du 05/10** (relu par
  `functions download`). Au merge, ne garder de `feat/cloud` que les blocs
  `poste_cloud`.
- **Google Play, relu le 05/10 (lecture seule)** : `app.fillsell.cloud.sub` ›
  `cloud-monthly` actif (175 pays) › offre `cloud-trial-3d` **active, 175/175
  pays, « Essai gratuit — 7 jours », éligibilité « Acquisition de nouveaux
  clients › N'ont jamais eu cet abonnement »**. Conforme.
- **Stripe, relu le 05/10** : endpoint `we_1TNHq1QZRA77vrWJHXw51Svb`, 4 événements.
- **IPRoyal** = IPRoyal Services FZE LLC (Émirats arabes unis) : transfert hors
  UE (clauses contractuelles types, dites dans la confidentialité 4.8).
- Android : le greffon d'achat choisit la 1re offre du forfait.
- Apple : 1er abonnement du groupe soumis AVEC une version de l'app ; compte de
  démonstration du relecteur dans `CLOUD_OFFRE_TEMOINS` le moment venu.
- L'identifiant d'appareil est local : un verrou faible seul, fort avec les trois autres.
- Beebs : non promis (DataDome le 26/09).
- L'extension Cloud se construit depuis `chrome-extension/` du commit déployé :
  le serveur porte aujourd'hui **0.6.96-cloud** (feat/cloud) ; la 0.6.98 du lot
  Problèmes n'y sera qu'après la fusion et un redéploiement (§ 4.2).
- Docker sur le serveur : **29.1.3** (Ubuntu 24.04, paquet docker.io), sans
  buildx/BuildKit — pas de `COPY --chmod` ni `RUN --mount` dans les Dockerfiles ;
  API Docker de l'orchestrateur épinglée en 1.44 (`src/docker.js`).

## 29/10 (lot C partie 6) — prérequis : prise atomique en un appel, coffre à trousseau
- **`prendre_job(p_user, p_poste, p_job, p_build)`** (migration 20261030100000, service_role seulement) : controler puis
  pending → processing dans UNE transaction, SEULEMENT depuis « pending » (ferme le trou « deux exécutants d'un même
  poste » de l'ancien chemin). Les trois RPC existantes et l'extension : inchangées (md5 relus). Preuve de concurrence
  sur Postgres 17 jetable : `scripts/cloud/preuve-prendre-job-concurrente.mjs` (200 jobs, 16 connexions : 0 double ;
  extension + Cloud en même temps : 0 double ; gardes arrêt / lecture d'origine conservées).
- **Coffre** (`serveur-cloud/src/coffre.js`) : AES-256-GCM, clé hors base, et désormais un TROUSSEAU — chaque ligne se
  lit avec la clé de SA version (`COFFRE_CLES_ANCIENNES` « version:base64,… »), l'écriture prend la courante : une
  rotation ne rend plus rien illisible. Test : `serveur-cloud/tests/orchestrateur.test.mjs` (rotation).
- Restent à Nico : le sel `cloud_empreinte_sel` (vault), la sauvegarde de `COFFRE_CLE`.
## 30/10 (lot D partie 2) — FillSell Cloud posé : rotation d'IP, conditions, exécutant, Depop (rapport `docs/enquetes/lot-d-3010/RAPPORT.md`)
- **Cadre de Nico (30/10, non rediscuté)** : produit séparé 20 €/mois par canal, 7 jours offerts avec carte une fois
  par personne, Free possible, quotas du palier ; mur de conversion (jamais le Cloud reproposé, le palier supérieur) ;
  exécutant H24 sur Hetzner ; un bouton « Me connecter » par plateforme (page de connexion seule) ; **IP françaises EN
  ROTATION au départ** (remplace « IP dédiée par compte » du 05/10) ; fournisseur isolé dans UN module ; alerte de solde
  bas ; jamais d'achat sans accord ; jamais plus vite que l'extension ; visible UNIQUEMENT sur le compte de Nico.
- **Fait (code)** :
  - `serveur-cloud/src/fournisseurIp.js` : LE module fournisseur (proxyPour, solde, verifierSolde). Rotation :
    résidentiel IPRoyal si `IPROYAL_RESI_UTILISATEUR`/`IPROYAL_RESI_MOT_DE_PASSE` (session collante par compte et par
    tranche `ROTATION_HEURES`, pays FR, passerelle geo.iproyal.com:12321 — ⚠ port à ouvrir dans
    `pare-feu-navigateurs.sh` le jour où il sert) ; sinon les IP françaises du pool (rendez-vous par compte et tranche).
    ⚠ L'API résidentielle n'est PAS activée sur le compte IPRoyal (« residential_api_not_enabled ») : trafic à acheter
    (6,25 $/Go, plan 15) = accord de Nico. Aujourd'hui : 1 IP, 94.194.94.233 (commande 84458881, fin 04/11 13:57).
    Solde lu 10,60 $ ; alerte sous `IPROYAL_SOLDE_ALERTE` (5 $), une fois par jour, sans achat.
  - Migration `20261030130000_cloud_conditions_executant_rotation` (feu vert NOMMÉ de Nico requis) : `cloud_ip_rotation`,
    comptes servis sans IP attribuée, plus de « pool_vide » en rotation ; `cloud_cgu_version` / `cloud_cgu_acceptee_le`
    + `cloud_cgu_accepter_moi` ; `cloud_executant_moi`. Essai à blanc vert (6 groupes). Inverse dans `supabase/rollbacks/`.
  - Depop au Cloud (plateformes.js, copie Cloud de l'extension avec l'accès d'hôte, get-pending-jobs). Fournisseurs de
    connexion limités à leurs pages de CONNEXION (plus google.com / facebook.com / apple.com en entier).
  - Coffre : une connexion faite qui lâche passe `connecte = false` (« À reconnecter » à l'écran).
  - Prise de job : un poste Cloud prend par `prendre_job` (update-job-status) ; une écriture « processing » suivante
    n'est permise qu'à l'exécution qui a pris le job (processing_since).
  - Jamais plus vite : une plateforme connectée au Cloud n'est servie qu'au poste Cloud tant qu'il est vivant (< 5 min),
    les autres restent à l'ordinateur (get-pending-jobs).
  - App : drapeau PAR COMPTE (`profiles.beta_flags.cloud`, listes écrites en dur VIDES), écran « Me connecter » avec
    l'état de l'exécutant et « À reconnecter », conditions d'utilisation (`src/cloud/conditionsCloud.js`, version dans
    `config/cloudOffer.js`) en case obligatoire AVANT toute carte (`ConditionsCloudModale.jsx`), page
    `/conditions-cloud` (connecté + témoin seulement, noindex). Paiement Cloud : 403 `offre_fermee` hors témoins
    (`coin_config.cloud_offre_ouverte` ouvre à tous), 409 `conditions_a_accepter`.
- **Sel** `cloud_empreinte_sel` posé au vault le 30/10 à 10:37 (valeur tirée en base, jamais affichée) ; HMAC prouvé.
- **Reste / à Nico** : voir le rapport du lot D (Stripe en mode test : clés de test à créer ; prix ce soir).

## ⛔ 30/10/2026 13:38 — ÉTAT COMPLET APRÈS LE LOT D (à lire EN PREMIER)

Aucun secret ici : les identifiants vivent dans `secrets.env` (ce dossier) et dans `/srv/fillsell-cloud/.env` (serveur).
Le récit détaillé : dépôt `docs/enquetes/lot-d-3010/RAPPORT.md` ; l'état de prod : `docs/agents/etat-2026-10-01.md`
(section « 30/10 — lot D ») ; la même reprise est dans le dépôt, `docs/cloud/REPRISE.md` (fin du fichier).

### 1. Où est tout
- Code : dépôt `C:\Users\nicol\fill-and-sell`, branche `main` (lot D : c09148e → 76093c0 → eda2c2e → 683aa23 → 3d00e71 →
  b482d76, tout poussé). Plus aucun travail dans ce dossier prototype.
- Serveur : Hetzner `fillsell-cloud-1` (cx43, Falkenstein), IP 178.105.24.16, `cloud.fillsell.app` ;
  `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16`, dossier `/srv/fillsell-cloud`, déployé sur **3d00e71**
  (`bash serveur-cloud/outils/deployer.sh 178.105.24.16 cloud.fillsell.app` depuis un arbre propre).
- Base : Supabase `tojihnuawsoohlolangc`. Migrations du lot D appliquées (feux verts de Nico) : `20261030120000`
  (lecture d'origine plafonnée) et `20261030130000` (conditions, exécutant, rotation, Depop au coffre) ; inverses
  dans `supabase/rollbacks/`.

### 2. Fait et prouvé (30/10)
- Partie 1 : boucle de la lecture d'origine arrêtée (0 relecture ratée depuis 10:27) ; canal Google effacé à l'arrêt
  (BONCOIN + 6 jetons morts nettoyés, sauvegarde `_backup_3010_canal_google_mort`) ; MRR par canal ; republications
  retenues pour une autre boutique dites ; OTA **2.9.137** envoyée.
- Cloud : sel `cloud_empreinte_sel` au vault ; `COFFRE_CLE` tournée en **version 2** (rotation prouvée en vrai :
  écrite clé 1 → relue par le trousseau → rechiffrée clé 2 → ancienne clé retirée ; la clé a été donnée UNE fois à
  Nico, elle n'est écrite nulle part ailleurs) ; module fournisseur d'IP unique (`serveur-cloud/src/fournisseurIp.js`,
  rotation, alerte de solde bas, aucun achat) ; purge par compte à l'arrêt (≤ grâce 2 j + 1 h) ; historique des IP par
  session ; conditions d'utilisation (case obligatoire, version + date, page `/conditions-cloud` témoins seuls, texte
  à valider) ; écrans (exécutant, « à reconnecter », 4 plateformes) ; drapeau PAR COMPTE `beta_flags.cloud` ;
  paiement Cloud fermé hors témoins (`coin_config.cloud_offre_ouverte`) et sans conditions acceptées ; prise de job
  atomique pour le poste Cloud ; une plateforme connectée au Cloud n'est servie qu'à lui (jamais deux exécutants).
- Selftests : suite complète 498 en 5 morceaux, 0 rouge (30/10 12:46 → 13:04) ; serveur 38/38.

### 3. Les IP
| | IP | Commande IPRoyal | Fin | Renouvellement |
|---|---|---|---|---|
| IP fixe 1 (pool id 1) | 94.194.94.233 | 84458881 (ISP dédiée FR) | **04/11/2026 13:57** | aucun |
| IP fixe 2 (pool id 2) | 185.134.194.88 | 86965910 (ISP dédiée FR, 4 $) | **29/11/2026 11:37** | aucun |
| Résidentiel FR | passerelle geo.iproyal.com:12321 | 86970189 (1 Go, 6,25 $) — sous-utilisateur dédié | — | aucun |
- Rotation : `coin_config.cloud_ip_rotation = 1` ; un compte garde la même IP du pool pendant 24 h, puis change.
- Résidentiel : **coupé** (`BEEBS_RESIDENTIEL` absent = 0) ; 0,041 Go utilisés par les mesures (≈ 10 Mo par page Beebs
  avec un profil neuf). S'il sert un jour : trafic Beebs SEUL (relais du navigateur).
- Solde revendeur IPRoyal lu par l'API : **0,35 $** — la recharge de 15 $ faite par Nico n'y apparaît pas (question
  ouverte). L'alerte « solde bas » part dans le journal du serveur (mails d'alerte coupés).

### 4. Le navigateur Cloud = Google Chrome officiel (depuis 30/10 12:45)
- Image `serveur-cloud/navigateur-chrome/` (Chrome 156, écran Xvfb, fr-FR, Europe/Paris), conteneur recréé à chaque
  ouverture, profil gardé dans `profils/<id>/chrome`.
- Extension Cloud installée par **stratégie d'entreprise** (`politique.json`, `ExtensionInstallForcelist`) : CRX3
  signé de la clé de la copie Cloud (sur le serveur seul : `/srv/fillsell-cloud/cle-extension-cloud.pem`, 600),
  servi en local par `relais.mjs` (127.0.0.1:3129) ; `DeveloperToolsAvailability = 1` obligatoire (sinon « Not
  allowed » au pilotage). Proxy : relais local 127.0.0.1:3128, les identifiants ne vont jamais à Chrome.
- Repli possible : `NAVIGATEUR_MOTEUR=steel` dans `.env` (ancien Chromium steel-browser).
- Pare-feu : sortie des navigateurs limitée aux ports 12321, 12323, 12324 ; aucun DNS.

### 5. Mesures Leboncoin et Beebs (accès direct, 30/10)
| Navigateur | Sortie | Beebs `/fr/auth` | Leboncoin |
|---|---|---|---|
| Vrai Chrome Windows (PC de Nico, profil vierge) | IP fixe 1 | **passe** | — |
| Vrai Chrome Windows | IP fixe 2 | **passe** (deux fois) | **passe** |
| Chrome officiel du serveur | IP fixe 1 | glissière (11:48) puis **bloqué** (12:37) | **bloqué** |
| Chrome officiel du serveur | IP fixe 2 | **bloqué** | **bloqué** |
| Chrome officiel du serveur | résidentielle FR, neuve à chaque essai | **bloqué** ×4 (SwiftShader, GL Mesa, sans WebGL, écran 1536×864) | — |
| Chromium steel (ancien) | IP fixes 1 et 2 | **bloqué** | **bloqué** (passait le 05/10) |
| « Me connecter » (Chrome, format téléphone) | IP du pool | **bloqué** | **bloqué** |
- Vinted et Depop : pages de connexion servies normalement (« Me connecter » prouvé, 13:07).
- **Causes établies** : ni l'IP (un vrai Chrome passe par les mêmes IP), ni le type d'IP (résidentiel bloqué aussi),
  ni langue, fuseau, en-têtes ou Chrome/Chromium : l'**environnement du serveur** (Linux sans carte graphique : rendu
  SwiftShader / Mesa, ou pas de WebGL). Beebs et Leboncoin ont le même anti-robot (DataDome), durci au fil des essais
  de la journée : plus de glissière, blocage d'emblée.
- Corrigé : pages de connexion Cloud de Leboncoin (`/compte/part/mes-annonces` → auth.leboncoin.fr/login) et de Beebs
  (`/fr/auth`) — les anciennes rendaient des 404.
- Piste restante (décision de Nico) : une machine à **vraie carte graphique**, à mesurer avant tout engagement.
  Demande de partenariat Beebs en brouillon, NON envoyée : `docs/cloud/beebs-demande-partenariat.md`.
- Outils de mesure (dans le conteneur orchestrateur) : `node outils/essai-chrome.mjs <id IP|residentiel> <url>`,
  `node outils/essai-page-connexion.mjs <id IP> <url>` (Chromium), `node outils/diagnostic-navigateur.mjs <id IP>`.
  ⚠ Chaque essai sur Beebs / Leboncoin abîme la réputation de l'environnement : n'en faire qu'avec un but précis.

### 6. Stripe
- `STRIPE_PRICE_CLOUD` posé (30/10 12:29) = `price_1UMuLDQZRA77vrWJZfZh2IS4` (actif, 20 €/mois, essai 7 jours, relu
  chez Stripe ; empreinte du secret vérifiée).
- **Test réel À FAIRE avec Nico** (son compte, essai de 7 jours, puis arrêt) :
  1. au moment du test seulement : `npx supabase db query --linked -f scripts/reparations/20261030_cloud_nico_offert_vers_essai_stripe.sql`
     (Nico quitte l'option offerte ; le drapeau témoin reste) ;
  2. Nico, dans l'app : FillSell Cloud › « Essayer 7 jours » › case des conditions › carte (page Stripe) ;
  3. vérifier : abonnement Stripe `trialing`, `cloud_essai_debut` posé, empreinte de carte notée, navigateur rouvert ;
  4. Nico : « Arrêter l'option » ; vérifier : abonnement annulé, aucune facture payée, données Cloud effacées à
     l'entretien suivant (purge par compte) ;
  5. si besoin de revenir à l'option offerte : `…_offert_vers_essai_stripe_INVERSE.sql`.

### 7. Compte de Nico
- `beta_flags.cloud = true` (seul témoin), option **offerte** (`cloud_canal = offert`), navigateur Cloud **actif**
  sous Chrome, extension qui interroge sa file. Inverse complet : `scripts/reparations/20261030_cloud_nico_temoin_offert_INVERSE.sql`.
- **À faire par Nico** : « Me connecter » Vinted puis Depop (Réglages › Abonnement › FillSell Cloud), puis écrire
  « connecté ». Ensuite (Claude) : sur chaque plateforme connectée, publication, republication, retrait, relevé et
  vente à 999 € avec preuve ; puis le test Stripe (§ 6).

### 8. Garde-fous (inchangés)
- Compte de Nico SEUL (`COMPTES_AUTORISES`, drapeau par compte) ; aucun autre compte sans GO explicite.
- Aucun mail à un utilisateur ; alertes du serveur coupées (`ALERTES_MAIL=0`).
- Achats IPRoyal : `IPROYAL_ACHATS_AUTORISES=0` ; aucun achat ni renouvellement sans accord écrit de Nico.
- Aucun résolveur de captcha, aucun service tiers de contournement (ni Web Unblocker ni Web Scraper API) : une
  vérification se passe par l'utilisateur dans « Me connecter ».
- Le Cloud ne va jamais plus vite que l'extension (mêmes plafonds, cadences, gardes).
- Annonces de test à 999 € ou plus, retirées à la fin.
- Migration = feu vert nommé de Nico + inverse ; jamais `db push`.
- Jamais un secret dans un fichier du dépôt, un commit, un journal ou un rapport (la clé du coffre comprise).
- Heure de Paris lue en base (`now() at time zone 'Europe/Paris'`), jamais estimée.

---


## ⛔ 30/10/2026 19:05 — L'APRÈS-MIDI DU 30/10 ET LA DÉCISION SHADOW (à lire EN PREMIER, avant le bloc 13:38)

Aucun secret ici : les identifiants (Robot Hetzner `ROBOT_USER` / `ROBOT_PASSWORD` compris) vivent dans `secrets.env`
du dossier prototype, nulle part ailleurs. Récit détaillé : dépôt `docs/enquetes/machine-cloud-3010/RAPPORT.md`
(§ 0 à 10) ; état de prod : `docs/agents/etat-2026-10-01.md` (fin de la section Cloud du 30/10).

### 1. Décision de Nico : essai sur Shadow Neo Pro, souscrit le 30/10
- Machine : **Shadow Neo Pro** (Shadow Pro) — 8 vCores, 16 Go, NVIDIA RTX 2000 Ada 16 Go, Windows 11, en France.
  Prix lu le 30/10 : 39,99 € HT/mois + Always On (prix non publié) ; ≈ 9 utilisateurs estimés (à mesurer).
- Souscrite par Nico le 30/10 (c'est lui qui paie ; Claude ne saisit aucune carte).
- À verser au dossier dès qu'ils existent : l'accord écrit de Shadow pour notre usage (les CGV soumettent à
  autorisation préalable un usage « dans le cadre de prestations commerciales ») et le prix d'Always On.

### 2. Règle de Nico (30/10) : avant toute commande, tout vérifier sur le modèle précis
- Avant de commander quoi que ce soit (serveur, option, IP, abonnement) : vérifier que TOUT ce dont on a besoin est
  disponible sur CE modèle précis (système, options, pilote, prix, facturation, mode de commande), le dire à Nico,
  et seulement ensuite commander. Origine : le serveur 3100515 commandé sans que Windows y soit proposé (§ 3).

### 3. Ce qui s'est passé depuis 13:38 (heure de Paris)
| Heure | Machine | Sortie | Leboncoin | Beebs |
|---|---|---|---|---|
| 14:55 | Hetzner Cloud **neuf** cx23 (Linux, sans carte graphique : SwiftShader) | **IP neuve** 188.126.31.118 | **BLOQUÉ** (ID c3cab590-0498-2687-d793-11d590fb0528) | **BLOQUÉ** (ID 9c5aa7bd-d47f-0dc0-9deb-8042be941ecc) |
| 15:37 / 15:44 | **PC Windows de Nico** (AMD Radeon, Chrome 156 officiel), piloté comme en production | IP fixe 2 | **GLISSIÈRE**, passable par l'utilisateur (ID 4cfef139-485c-1f90-bcf8-8397cd7f72d2) | **FORMULAIRE** : passe |
| 17:45 | Serveur dédié **Linux à vraie puce Intel** (Hetzner 3100515, i7-8700, UHD 630, bureau XFCE) | IP fixe 2 | **BLOQUÉ** (ID ebf12780-b17b-ba28-1b82-2280a120d092) | **BLOQUÉ** (ID 0e7e1178-e551-e993-55c2-4be09b648f1c) |
- **13:53:11** : orchestrateur de l'ancien serveur arrêté (ordre de Nico). Plus aucune visite de plateforme depuis
  cette machine ni par les IP du pool.
- **Hetzner Cloud neuf** `fillsell-cloud-2` : créé à 14:48 à Helsinki (cx43 indisponible partout), supprimé à 14:58.
  Coût ≈ 0,01 €.
- **IP 3** : IPRoyal commande 86978813, 188.126.31.118, 4 $, fin le 29/11, sans renouvellement. Elle reste HORS du
  pool et n'y entre jamais : DataDome la cite. Solde IPRoyal : 15,35 $ avant l'achat, **11,35 $** après.
- **PC de Nico** : outil `serveur-cloud/outils/essai-me-connecter-pc.mjs`, « Me connecter » de production par CDP
  (format téléphone, tactile émulé), extension Cloud chargée par `Extensions.loadUnpacked`, relais vers l'IP fixe 2.
- **Serveur dédié 3100515** (94.130.142.25, place de marché ; l'EX44 n'était plus commandable) : commandé à 16:48.
  Robot a ensuite refusé Windows : « For this server type Windows cannot be used ». **Erreur de Claude** : le détail
  du produit, lu avant la commande, n'offrait que « Rescue system ». Essai fait sous Linux sur ordre de Nico : Ubuntu
  24.04, bureau XFCE, français, heure de Paris, Chrome officiel avec son lecteur PDF, extension 0.6.160 par
  stratégie, relais vers l'IP fixe 2. Vérification hors réseau réussie à 17:44 (WebGL « ANGLE (Intel, Mesa Intel(R)
  UHD Graphics 630 (CFL GT2), OpenGL 4.6) », 1920×1080, Europe/Paris, fr-FR, 5 plugins PDF). Essai bloqué.
  **Résilié à 17:48**, après effacement du disque de la configuration, de la clé de signature de l'extension et des
  profils. Coût ≈ 0,15 € HT.

### 4. Ce que ça prouve, et le doute sur l'IP fixe 2
- Ce n'est pas l'usure de l'ancien serveur : machine neuve, IP neuve, profil neuf, aucune visite avant → bloqué.
- Ce n'est pas le pilotage : le même « Me connecter » de production passe sur le PC Windows.
- Une vraie puce ne suffit pas sous Linux en centre de données.
- **Ce qui passe : Windows sur du vrai matériel.**
- **Doute sur l'IP fixe 2** (185.134.194.88) : bloquée le matin depuis l'ancien serveur, glissière à 15:37 depuis le
  PC, puis bloquée à 17:45 depuis le serveur Linux. Sa réputation a pu baisser entre-temps : le blocage de 17:45
  n'est pas entièrement imputable à la machine. L'essai Shadow sortira donc par une **IP NEUVE** (4 $, achat sur
  accord écrit de Nico), jamais par l'IP fixe 2 ni par 188.126.31.118.

### 5. AX42 + Windows Server : étudiée SANS commande (repli)
- Machine : AMD Ryzen 7 PRO 8700GE, puce Radeon 780M (même famille que le PC de Nico), 64 Go, Falkenstein ou Helsinki.
- Prix Robot : 97,30 € HT/mois (0,1559 €/h), + 49 € de mise en service (la page publique annonce 99 €), + IPv4 1,70 €.
- Windows : listé sur la page AX42 (options « Windows Server 2025 Standard » ou « Datacenter »). Standard 8 cœurs :
  **27,90 € HT/mois, facturé au mois civil complet**. L'option se commande **uniquement dans l'interface Robot, par
  Nico** (absente de l'API). Licences RDS par utilisateur en sus si besoin (SPLA).
- Premier mois ≈ 176 € HT (≈ 211 € TTC), au-dessus du plafond de 150 € fixé par Nico. Échec le premier jour : ≈ 78 € HT
  perdus (mise en service + Windows du mois + quelques heures).
- Risques : **le pilote AMD ne vise pas officiellement Windows Server** (sans pilote : rendu logiciel, donc bloqué) ;
  **aucun écran branché** (écran virtuel à prévoir). Contrôle hors réseau de la puce obligatoire avant toute visite.
- Résiliation d'un serveur dédié : Robot `POST /server/<n>/cancellation` avec `cancellation_date=now` (fin
  immédiate ; la mise en service n'est pas remboursée).

### 6. Code poussé sur `main` depuis 13:38 — RIEN déployé (Cloud arrêté)
- **Plus aucune visite automatique d'une plateforme non connectée** (`7e49884`) : la sonde de la copie Cloud ne part
  que si le cookie de connexion existe ; le contrôle d'entrée des IP ne passe plus que par ipinfo.io
  (`plateformes: { visite: 'aucune' }`).
- **Les deux correctifs « Me connecter »** (`c932ce3`) : (1) « Me connecter » n'adopte plus et ne ferme plus les
  onglets déjà ouverts (`ouverteParLaConnexion`, `openerId` exigé) ; (2) Beebs n'est plus dite « connectée » pour un
  simple visiteur (jeton Firebase anonyme), dans l'orchestrateur et dans la copie Cloud.
- **Le verrou du relais** (`4c9f968`) : une plateforme n'est joignable par le navigateur que si elle est connectée
  (coffre `plateformes_connectees`) ou pendant son « Me connecter » ; sinon 403, sans aucune connexion vers la
  plateforme. Port de contrôle 3130, jeton tiré à chaque ouverture. Couvre aussi relevés, ventes et messagerie.
- **Le moteur Chrome sur vraie machine** (`88f0713`, `9376300`) : `NAVIGATEUR_GPU=1` (coupé par défaut) — le conteneur
  Chrome de production dessine sur l'écran du bureau de l'hôte par la vraie puce (`/dev/dri`, socket X, ANGLE sur
  OpenGL, plus de SwiftShader) ; `deploiement/gpu/preparer-poste-gpu.sh` ; `outils/essai-me-connecter.mjs --verifier`
  (contrôle hors réseau : profil jetable, proxy mort, WebGL d'une page about:blank). C'est le moteur Linux : sous
  Windows, il faudra un moteur natif.
- **Outils Windows** : `outils/essai-me-connecter-pc.mjs` (`--verifier`, `--a-blanc`, `--seulement=`, `--reprendre`) ;
  Chrome 156 ignore `--load-extension` → `Extensions.loadUnpacked` par `--remote-debugging-pipe` +
  `--enable-unsafe-extension-debugging` (sur une machine dédiée, la stratégie d'entreprise reste possible) ;
  `deploiement/windows/acces-ssh.ps1` (OpenSSH par clé publique seule, collé UNE fois en PowerShell administrateur).
- Autres commits : `decebaa`, `0feb4a9`, `1396d19`, `e4a7f87`, `a99676b` (docs). Suite complète 499 selftests,
  0 rouge ; serveur 45/45.

### 7. Prochaines étapes (Shadow Neo Pro)
1. Nico installe l'application Shadow sur son PC, ouvre la machine UNE fois et colle le script d'accès fourni par
   Claude. Il ne se connecte à aucune plateforme. À vérifier d'abord : Shadow ne donne probablement aucun accès
   entrant ; prévoir alors un tunnel sortant vers notre serveur (plan, rapport § 4) au lieu de `acces-ssh.ps1` seul.
2. **Vérification HORS RÉSEAU** (proxy mort, profil jetable) : WebGL doit nommer la NVIDIA RTX 2000 Ada (ni
   SwiftShader ni « Microsoft Basic Render »), y compris flux Shadow fermé (Always On) ; écran, fr-FR, Europe/Paris,
   lecteur PDF. Sinon : arrêt sans aucune visite.
3. **IP neuve** (accord écrit de Nico, 4 $).
4. **Essai UNIQUE** en conditions de production, personne sur le flux : « Me connecter » Leboncoin
   (`/compte/part/mes-annonces`) puis Beebs (`/fr/auth`), une ouverture chacune. Verdicts : formulaire = PASSE ;
   glissière = PASSE AVEC VÉRIFICATION (Nico la passe) ; « Accès temporairement restreint » = BLOQUÉ. Preuves :
   capture, heure lue en base, renderer WebGL, ID DataDome.
5. Si ça passe : moteur Windows natif de l'orchestrateur (poste distant ; plus jamais le Chrome Linux), déployé avec
   le verrou du relais et les deux correctifs « Me connecter », testés → « machine prête » → Nico se connecte une
   seule fois (Vinted, Depop, Leboncoin avec la glissière, Beebs) → tests à 999 € (publication, republication,
   retrait, relevé, vente) → quelques jours à cadence normale → capacité mesurée (`NAVIGATEURS_MAX`).
6. Si c'est bloqué : aucun nouvel essai depuis cette machine ; résiliation ; replis à présenter à Nico (AX42 +
   Windows avec plafond relevé ; mini-PC, mais la licence Windows 11 interdit l'hébergement commercial).

### 8. État à cet instant
- Ancien serveur `fillsell-cloud-1` (178.105.24.16) : orchestrateur **arrêté** depuis 13:53:11 ; ne PAS lancer
  `deployer.sh`. Le § 7 du bloc 13:38 (« navigateur Cloud actif ») est donc dépassé.
- Aucun serveur dédié, aucun serveur d'essai en cours.
- IP : fixe 1 94.194.94.233 (fin 04/11 13:57) ; fixe 2 185.134.194.88 (fin 29/11, usée par les essais du 30/10) ;
  IP 3 188.126.31.118 (hors pool, fin 29/11). Aucun renouvellement. Solde 11,35 $.
- Robot Hetzner : accès webservice dans `secrets.env` ; conseillé à Nico de changer ce mot de passe (il a été collé
  dans le terminal).
- Stripe : test des 7 jours toujours en attente du mot « Stripe » de Nico (deux contrôles dépendent de
  l'orchestrateur, arrêté).
- Garde-fous inchangés (bloc 13:38 § 8), plus : aucun résolveur de captcha, aucun service de déblocage, aucun outil
  de maquillage d'empreinte ; de vraies machines, un vrai Chrome ; c'est l'utilisateur qui passe une vérification
  dans « Me connecter ». Nico ne se connecte qu'une fois, sur la machine retenue, après un essai propre.

### 9. 30/10 21:34 — Shadow essayé : passe avec glissière, trop cher avec Always On
Détail : `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 12.
- **Essai unique** (21:02, application de Nico ouverte et réduite, option A) : Leboncoin GLISSIÈRE (ID
  f4a0ed58-c78a-1a71-7414-32cb20dcf9b3), Beebs GLISSIÈRE (ID 3241bdd1-8417-22f5-24a5-0be98b935c6c), IP neuve
  81.181.239.136.
- **Always On : 208,99 €/mois**, lu dans le Manager et non activé. Sans Always On, la machine s'éteint dès que
  l'application se ferme. Recommandation : pas de Shadow en production ; cible AX42 + Windows Server (non essayée,
  décision de Nico).
- **Accès à la machine : RETIRÉ le 30/10 à 22:02** (Shadow écarté par Nico).
  - Sur la machine : `retirer.ps1` exécuté en tâche SYSTEM détachée.
  - Sur le relais : compte `shadowtun` supprimé, sshd en `LogLevel INFO`.
  - Pour mémoire, la méthode : SSH local + tunnel sortant `-R 127.0.0.1:2222`. Chrome se lance dans la session ouverte
    par une tâche planifiée interactive, jamais depuis la session SSH (session 0).
- **Exigences de Nico (21:16)** : glissière et connexion faites par l'utilisateur depuis l'app, en direct. Voir ce qui
  existe et ce qui manque (§ 12) ; rien à coder sans sa validation.
- IP : 81.181.239.136 ajoutée (fin 29/11, hors pool) ; solde IPRoyal 7,35 $.
