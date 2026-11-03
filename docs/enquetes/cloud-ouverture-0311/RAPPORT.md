# FillSell Cloud — ouverture à tous : audit et correctifs (03/11/2026)

Heure de Paris partout. Audit en lecture seule (14:50 → 15:40), puis go de Nico (« tu codes, tu commites, tu pousses
et tu déploies toi-même ; tout automatique ; corriger la règle, pas le cas »). Commits 9e9bde4, 1a65445, 7c7748d, 01d22e2.

## 0. En bref
| Point | Fait | Prouvé | Reste |
|---|---|---|---|
| 0 — IP 94.194.94.233 | prolongée 30 j (4 $), échéance 04/12 13:57 | lu chez IPRoyal et en base | — |
| 1 — mémoire | cause trouvée, régies publicitaires bloquées dans le verrou, filet de redémarrage, flotte codée, capacité 4 → 7 | avant/après dans le même navigateur ; pic d'une vraie publication 1 384 Mo ; 0 OOM depuis | création de serveur coupée (go) |
| 2 — IP | achat, renouvellement, stock min., plafond, pare-feu dynamique, refus par plateforme, requalification | pare-feu appliqué seul (5 IP) ; 1ʳᵉ visite faite | achats coupés (go) ; solde 3,15 $ |
| 3 — retour sur l'extension | cloud_voie posé/retiré par la base, tous canaux ; app ; prendre_job enfin appelée | banc SQL 45/45, selftests ; prendre_job vue en prod (§ 10) | OTA 2.9.159 construite, envoi refusé par le garde-fou de la session ; get-pending-jobs (§ 6) |
| 4 — impayé | past_due/unpaid/incomplete = arrêt du Cloud (Stripe) | option-cloud 82 | — |
| 5 — place + attente | vente seulement avec place serveur ET IP ; liste d'attente, push + bandeau | cloud-place-attente 44 | OTA (même envoi) |
| 6 — marge | calcul § 9 | — | — |

## 1. L'audit (lecture seule) — ce qu'il a établi
- Pool : 7 IP, aucune attribuable à un nouvel essai ; rebut définitif ; aucun achat automatique ; renouvellement jamais appelé ;
  pare-feu des navigateurs figé au déploiement ; solde IPRoyal 7,15 $.
- Serveur : cx43 (8 vCPU, 16 Go), 19,79 € TTC/mois ; NAVIGATEURS_MAX 4 ; 2 OOM la nuit du 03/11 (02:26:55, 04:32:41) sans
  aucune tâche, plus celui du 02/11 18:51 ; aucune file au client N+1 ; aucun contrôle de place avant la vente ;
  cloud_postes.serveur jamais lu.
- Parcours : cloud_voie posé à la main seulement, jamais retiré ; impayé Stripe = Cloud vivant ; prendre_job jamais appelée
  (`/-cloud$/` face à « …-cloud · v0.6.164 ») ; Apple non soumis ; 0 abonnement Stripe.

## 2. Point 0 — IP 94.194.94.233 (id 1)
Commande IPRoyal 84458881 prolongée (plan 22, « 30 Days », 4 $) le 03/11 vers 15:45 : échéance 04/12/2026 13:57 (IPRoyal
12:57:45 UTC) ; solde 7,15 → 3,15 $. `cloud_ip_renouvelee(1, …)` → `cloud_ips.expire_le` = 04/12. Aucun autre achat.

## 3. Point 1 — la mémoire
### 3.1 La cause, prouvée
- Vidage du noyau de l'OOM de 02:26 : ~45 processus de rendu nés en rafale (pids 128988 → 129862), un processus de page de
  575 Mo tué. Le script de fond de l'extension n'y est pour rien : tas JS 12 Mo (Runtime.getHeapUsage, 03/11 16:00).
- Relevé des cibles DevTools (sans attache, toutes les 30 s, `etat/mesure-0311/echantillons.jsonl`) : l'onglet d'ACCUEIL
  Leboncoin, que l'extension rouvre pour ses lectures, porte 26 à 28 cadres de régies publicitaires (pubmatic, criteo,
  rubicon, doubleclick, indexww, 3lift, smartadserver, openx…) = un processus de rendu chacun.
- Même navigateur, à quelques minutes d'écart : onglet Leboncoin ouvert 16:01 → 16:13 = 26 cadres, 22 processus, 1,83 Go ;
  onglet fermé 16:13:28 = 0 cadre, 7 processus, 1,26 Go. La nuit, l'onglet reste ouvert (lectures < 5 min d'écart) et la
  page grossit à chaque rotation de publicité jusqu'au plafond (2 Go le 02/11, 3 Go le 03/11).
### 3.2 Le correctif (9e9bde4, déployé 16:15)
- Les régies échouent dans le verrou DevTools du navigateur (`DOMAINES_PUBLICITE`, `BlockedByClient`, la même erreur qu'un
  bloqueur de publicité) : aucune option de lancement changée (empreinte figée 7a1cfa22 intacte), jamais une plateforme,
  DataDome (captcha-delivery, datadome.co) ni Google. Coupure : `BLOQUER_PUBLICITE=0`.
- Filet : un navigateur AU REPOS (aucun job en cours, aucun « Me connecter », ouvert depuis ≥ 30 min, au plus une fois par
  2 h) au-dessus de 80 % de son plafond est fermé proprement (coffre et session FillSell sauvegardés) et rouvert au tour
  suivant sur le même profil — aucune reconnexion. `MEMOIRE_REDEMARRAGE_MO` pour régler le seuil, 0 pour couper.
### 3.3 Mesuré après le correctif (relevés de 30 s, 16:16 → 17:24)
Médiane 0,77 Go, 90 % sous 0,95 Go, maximum 1,10 Go (Leboncoin ouvert : 0 cadre publicitaire, 9 processus au plus) ;
0 OOM. Avant : médiane 1,83 Go avec Leboncoin.
### 3.4 Pic d'une vraie publication, et réglage
- Republication Leboncoin réelle par le Cloud (§ 10), relevé toutes les 2 s : pic **1 384 Mo** (au retrait, 18:00:28),
  moyenne 1 028 Mo pendant la tâche ; pic du conteneur depuis son démarrage 1 417 Mo ; 0 OOM.
- Réglé à 18:07 sur cloud-1 : `MEMOIRE_NAVIGATEUR=2g` (41 % au-dessus du pic ; plafond du conteneur vivant abaissé par
  `docker update`, sans redémarrage) et `NAVIGATEURS_MAX` vide → capacité automatique ⌊(15 613 − 700) / 2 048⌋ = **7**
  (avant : 4). Même 7 navigateurs à leur plafond en même temps tiennent dans la mémoire du serveur. Sur un AX42 (64 Go) :
  31. Filet au repos : 80 % de 2 Go = 1 638 Mo. `.env` d'avant : `archives/0311-lot3/env-avant-capacite`.
### 3.5 Montée en charge (codée, coupée)
- `cloud_serveurs` + battement de chaque orchestrateur ; `cloud_comptes_du_serveur(nom)` attribue chaque compte au serveur
  vivant le plus libre (`cloud_postes.serveur` enfin lu ; réattribution si son serveur se tait 15 min) ;
  `cloud_places_libres()`. Vérifié en prod : cloud-1, capacité 4, 1 compte, vu chaque minute.
- Capacité automatique si `NAVIGATEURS_MAX` est vide : ⌊(mémoire de l'hôte − 700 Mo) / plafond d'un navigateur⌋.
- `flotte.js` : sous le seuil `cloud_places_seuil` (2), plan de création d'un serveur Hetzner (cpx42 fsn1 par défaut —
  cx43 en rupture), cloud-init, paquet par URL signée, DNS Cloudflare. DOUBLE interrupteur COUPÉ :
  `HETZNER_CREATION_AUTORISEE=1` (env) ET `cloud_serveurs_auto = 1` ; sinon le plan est journalisé à blanc.
  Manquent pour une création réelle : `HCLOUD_TOKEN` et `CLOUDFLARE_API_TOKEN` dans le `.env` du serveur, une clé SSH
  au projet Hetzner, le go.

## 4. Point 2 — les IP
- Stock minimum `cloud_ip_stock_min` = 2 IP disponibles attribuables à un essai (≥ 10 j de vie).
- Achat (une commande de N IP, catalogue lu : produit 9 « ISP Dedicated », plan 22 « 30 Days », lieu 25 France,
  `auto_extend: false`) et renouvellement des IP attribuées (`prolonger()` enfin appelée), avec registre de toute dépense
  (`cloud_ip_commandes`, inscrite AVANT l'appel), plafond mensuel `cloud_ip_budget_mensuel_usd` = 60, alerte (sans mail) si
  le solde ne couvre pas. TRIPLE garde, tout coupé : `IPROYAL_ACHATS_AUTORISES=0` (env), `cloud_ip_achats_auto = 0`,
  `cloud_ip_renouvellement_auto = 0`.
- Pare-feu des navigateurs DYNAMIQUE : l'orchestrateur écrit `etat/proxys-permis.txt` ; l'unité systemd
  `fillsell-pare-feu-maj.path` rejoue iptables (une transaction). Prouvé le 03/11 17:00 : 5 IP appliquées sans déploiement.
- Refus PAR PLATEFORME (`cloud_ips.refus`) : un blocage anti-robot note un refus sur sa plateforme ; le rebut global est
  réservé aux causes prouvées (contrôle d'entrée, liste noire, sortie non conforme, compte restreint). L'attribution
  prend d'abord les IP sans refus. ids 3 et 4 : rebut → disponible avec refus Beebs non prouvé ; ids 1 et 2 : refus Beebs
  non prouvé (liste « grillées » de REPRISE).
- Requalification automatique : une visite de contrôle légère par heure au plus (une page d'accueil, navigateur jetable à
  l'apparence du produit, aucun geste). Passe ou glissière = refus levé ; restreint = prouvé (revisité à 14 j) ;
  indéterminé = revisité à 24 h. 1ʳᵉ visite : IP 4 (185.134.192.253), 16:59, « indéterminé » (30 s, 12 échantillons,
  page www.beebs.app) — la preuve ne gardait pas l'état de la page : corrigé (01d22e2, état final en booléens). L'id 2
  (réservée à Nico jusqu'au 29/11) n'est jamais visitée.
- Prix IPRoyal lus le 03/11 (ISP Dedicated France 30 j) : 1 = 4 $ ; 3 ou 5 = 3 $ l'unité ; 10 ou 20 = 2,94 $ l'unité.

## 5. Point 3 — arrêt du Cloud → retour sur l'extension
- UNE règle en base : `cloud_voie = cloud_etat(compte).actif`, appliquée par `cloud_compte_synchroniser` (déclencheur des
  colonnes Cloud : Stripe, Apple, Google, offert) et par le cron `cloud-voies-5min` (fins d'essai sans écriture) ; une
  ligne n'est écrite que si le drapeau change. Compte de Nico : reste vrai.
- À l'arrêt : la marque `attente_verification_cloud` des tâches en attente part ; get-pending-jobs (qui ne lit que
  `cloud_voie`) les rend à l'extension.
- App : « FillSell Cloud est arrêté » (Reprendre / installer ou ouvrir l'extension) ; `cloud_voie` relu au retour au
  premier plan (au plus toutes les 2 min), derrière la porte de l'offre.
- update-job-status v168 : `estPosteCloud` reconnaît « …-cloud · v0.6.x » → prendre_job appelée pour le poste Cloud.

## 6. Ce qui relève de get-pending-jobs (autre terminal — décrit, pas fait)
1. Le poste Cloud reçoit les tâches de ses plateformes connectées sans lire `cloud_voie` : pendant la grâce (navigateur
   rouvert pour finir un job), il peut en prendre de nouvelles. La réservation par poste empêche tout doublon. Correctif :
   ne rien servir au poste Cloud quand `cloud_voie` est faux.
2. Lectures en double PC + Cloud (audit, point 14) : relevés d'annonces, de ventes, messagerie, sondes faits par les deux
   postes d'un compte Cloud, même compte de plateforme vu depuis deux IP. Correctif : pour un compte `cloud_voie`, ne
   servir ces lectures qu'au poste Cloud (get-pending-jobs) ; l'extension du PC n'a rien à changer si la base ne lui
   donne plus rien.

## 7. Point 4 — impayé
`litAbonnementStripe` : un abonnement Cloud n'est vivant qu'en `active` / `trialing`. Fin d'essai dont le paiement échoue,
échéance refusée (`past_due`), `unpaid`, `incomplete` : `is_cloud` faux → `cloud_voie` faux → tâches rendues à l'extension,
navigateur fermé ; facture réglée → rouvert. Apple (DID_FAIL_TO_RENEW) et Google (ON_HOLD, IN_GRACE_PERIOD) coupaient
déjà (testé). stripe-webhook v63.

## 8. Point 5 — place avant la vente, liste d'attente
- `cloud_essai_preparer_moi` refuse « complet » sans place serveur (`cloud_places_libres`) ET IP attribuable ;
  `cloud_disponibilite_moi` pour l'app : le bouton d'achat (Stripe, Apple, Google) n'apparaît que si la vente est possible,
  sinon « Complet pour le moment / Être prévenu(e) ».
- Liste d'attente explicite (`cloud_attente`) ; quand une place se libère, les premiers inscrits (autant que de places)
  reçoivent un push (fonction `push-cloud-place` v1, `verify_jwt` false, garde `x-cron-secret`, cron
  `push-cloud-place-5min` qui ne part que s'il y a quelqu'un à prévenir) et un bandeau ; place gardée 24 h. Aucun mail.

## 9. Point 6 — la marge (calcul, aucune action)
Hypothèses : 20 € TTC ; URSSAF 25,6 % de l'encaissé ; Stripe en franchise de TVA (aucune TVA collectée ni récupérée,
règle « coûts TTC ») : frais 1,5 % + 0,25 € + Billing 0,7 % ; Apple et Google retiennent la TVA (20 %) puis 15 % de
commission. IP 4 $ (ou 2,94 $ par lot de 10) à 0,86 €/$ (taux du code, à relire). Densité mesurée § 3.3 : plafond de 2 Go
par navigateur → 7 clients sur 16 Go, 31 sur un AX42 ; cx43 gardé + la combinaison la moins chère (cpx32, cpx42, AX42 avec
installation amortie 24 mois). Supabase : passage Small → Medium (+45 $) au-delà de ~50 comptes (mesure du 04/10).
Essais : conversion 30 %, un essai non converti coûte ≈ 2,94 € (IP tenue 16 j sur 30 + place 7 j), amorti sur 6 mois de
vie d'un client.

| Clients | Coût / client (IP 4 $ → 2,94 $) | Encaissé net | Marge Stripe | Marge Apple / Google | Prix min. Stripe | Prix min. Apple / Google |
|---|---|---|---|---|---|---|
| 10 | 11,08 → 9,97 € | Stripe 14,19 € ; stores 10,54 € | + 3,11 → + 4,22 € | − 0,54 → + 0,57 € | 15,70 → 14,15 € | 21,03 → 18,91 € |
| 30 | 9,27 → 8,15 € | idem | + 4,92 → + 6,04 € | + 1,27 → + 2,39 € | 13,18 → 11,64 € | 17,59 → 15,47 € |
| 100 | 8,72 → 7,60 € | idem | + 5,47 → + 6,59 € | + 1,82 → + 2,94 € | 12,42 → 10,87 € | 16,54 → 14,42 € |

- Conversion 15 % au lieu de 30 % : marge Stripe − 1,6 à − 1,9 € ; Apple / Google passent sous zéro à 10 et 30 clients
  (IP à 4 $).
- Si la TVA devient due côté Stripe (franchise dépassée) : encaissé net ≈ 11,71 € (HT 16,67 €).
- Le solde IPRoyal est une avance (prépayé), pas un coût : 3,15 $ aujourd'hui, à recharger avant tout achat.
- Leviers : IP par lots de 10 (− 0,9 €/client) ; Stripe plutôt que les stores (+ 3,65 €/client) ; prix stores à 25 € ;
  AX42 dès ~15 clients ; essais sur IP « au repos » ou plus courts (3 j) ; onglet Leboncoin de travail sur une page sans
  publicité (extension, prochaine version) ; lectures de fond de get-pending-jobs mises en cache (base).

### 9 bis. À 24,99 € par mois (décision de Nico, 03/11 soir : tous canaux, essai 7 j inchangé — prix posé avec la refonte des paliers)
Mêmes hypothèses et mêmes coûts qu'au § 9 (les coûts ne dépendent pas du prix ; les prix minimum non plus). Encaissé net
par client : **Stripe 17,79 €** (24,99 − frais 0,80 − URSSAF 6,40) ; **Apple / Google 13,17 €** (24,99 ÷ 1,2 × 0,85 =
17,70 reversés, − URSSAF 4,53). Soit + 3,60 € (Stripe) et + 2,63 € (stores) par client par rapport à 20 €.

| Clients | Coût / client (IP 4 $ → 2,94 $) | Marge Stripe | Marge Apple / Google | Marge Stripe, conversion 15 % | Marge stores, conversion 15 % |
|---|---|---|---|---|---|
| 10 | 11,08 → 9,97 € | + 6,71 → + 7,83 € | + 2,09 → + 3,20 € | + 4,86 → + 6,25 € | + 0,24 → + 1,63 € |
| 30 | 9,27 → 8,15 € | + 8,52 → + 9,64 € | + 3,90 → + 5,02 € | + 6,89 → + 8,28 € | + 2,27 → + 3,66 € |
| 100 | 8,72 → 7,60 € | + 9,07 → + 10,19 € | + 4,45 → + 5,57 € | + 7,55 → + 8,94 € | + 2,93 → + 4,32 € |

- À 24,99 €, chaque canal est rentable dès 10 clients, même à 15 % de conversion (Apple / Google : de justesse à 10 clients
  avec des IP à 4 $, + 0,24 €).
- Prix minimum rentable : inchangés (§ 9) — 24,99 € dépasse le minimum des stores dans tous les cas relevés, sauf le cas
  le plus défavorable (10 clients, conversion 15 %, IP à 4 $ : minimum 24,54 €).
- Si la TVA devient due côté Stripe : encaissé net ≈ 14,69 € (HT 20,83 €).
- Rien changé chez Stripe, Apple ni Google : le prix Stripe à 20 € (0 abonné) sera archivé avec la refonte des paliers.

## 10. Essai réel unique (Leboncoin, 03/11, décision de Nico : « mes anciennes annonces sont des cobayes »)
- Premier choix refusé par la garde des 24 h (« TEST FillSell 30/10 », republiée le 02/11 19:04 : `cadence_24h`) — rien
  forcé. Retenue : « TEST FillSell — Paris 2024 » (inventaire 1793009594578, 999 €, en ligne depuis le 26/10, jamais
  republiée), par `spend_coins_and_republish` sous l'identité de Nico (la fonction du bouton de l'app). Un seul essai.
- Job 062f992c : capturé 17:57 par la copie Cloud (`…d426d23-cloud · v0.6.169`) ; **18:00:07 « pris par l'exécutant
  Cloud (prendre_job, atomique) »** puis « → processing » (journal d'update-job-status v168, aucun 409) ; retiré 18:00:49 ;
  redéposé 18:06:25 → annonce Leboncoin **3301737349**, publiée. L'attente entre capture et retrait = espacement des
  republications (900 s Leboncoin, 354 s parc), respecté.
- Mémoire : § 3.4.

## 11. Incident : trois migrations appliquées par l'essai « à blanc »
Vers 16:37, l'essai enveloppé `BEGIN; A; B; C; SELECT …; ROLLBACK;` a APPLIQUÉ les migrations 20261103201000,
20261103202000 et 20261103203000 : la 203000 portait son propre `COMMIT;`. Contenu = celui prévu (testé avant sur
Postgres jetable : A 28/28, B 36/36, C 45/45) ; relu en prod aussitôt (tables, crons, ids 1 à 4, Nico `cloud_voie` vrai),
historique réparé (`migration repair`), aucune erreur d'orchestrateur ni de cron. L'orchestrateur 9e9bde4 a tourné ~20 min
sur le nouveau schéma avant 1a65445 (sans effet relevé). Règle posée : `docs/regles/base-supabase-et-fonctions.md`.
Inverses : `supabase/rollbacks/2026110320{1,2,3}000_*_INVERSE.sql` (C, puis B, puis A).

## 12. En prod (03/11)
- Migrations 20261103201000, 20261103202000, 20261103203000 ; crons `cloud-voies-5min`, `push-cloud-place-5min`.
- Fonctions : update-job-status v168, stripe-webhook v63, push-cloud-place v1 (toutes `verify_jwt` false, comme avant) ;
  get-pending-jobs v327 non touchée.
- cloud-1 : orchestrateur 01d22e2, copie Cloud de l'extension inchangée (0.6.169-cloud, d426d23), unités systemd du
  pare-feu ; sauvegardes `/srv/fillsell-cloud/archives/0311-{memoire,lot2,lot3}/` (profil + `.env`, 600).
- App : OTA 2.9.159 construite (`dist/`, `2026-11-03T16:22:32Z+7c7748d`) — envoi Capgo REFUSÉ par le garde-fou
  « Production Deploy » de la session ; le canal reste 2.9.158.
- coin_config : `cloud_ip_stock_min` 2, `cloud_ip_budget_mensuel_usd` 60, `cloud_ip_achat_max` 10,
  `cloud_ip_achats_auto` 0, `cloud_ip_renouvellement_auto` 0, `cloud_ip_refus_revisite_jours` 14, `cloud_places_seuil` 2,
  `cloud_serveurs_auto` 0, `cloud_serveur_type` 0 (cpx42), `cloud_serveur_lieu` 0 (fsn1).
