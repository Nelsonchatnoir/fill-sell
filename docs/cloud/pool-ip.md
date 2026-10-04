# FillSell Cloud — le pool d'adresses IP françaises

Conception du 04/10/2026, décisions finales de Nico le soir.
Branche `conception/cloud-option`. **Rien n'est appliqué, rien n'est acheté,
rien n'est déployé.**

Fichiers :
- règles pures, testées : `supabase/functions/_shared/cloud-pool.js`
  (`npm run selftest:cloud-pool`) ;
- mail de la veille : `supabase/functions/_shared/cloud-rappel-veille.js`
  (`npm run selftest:cloud-rappel-veille`), branché dans
  `supabase/functions/email-tunnel/index.ts` derrière une garde ;
- base : `supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt`,
  non appliquée, l'inverse est en tête du fichier ;
- contrat côté app : `src/utils/palier.js` (`cloudDuProfil`). `cloud_etat` rend
  exactement la même chose, vérifié sur 24 cas (§ 8).

## 0. En bref

**Phase 1 : la rotation, sans IP dédiée** (réglage `mode` = 1). C'est la phase
qui doit montrer si l'offre prend.
- **Pour démarrer** :
  - **5 IP en rotation**, soit **27 $ par mois (≈ 23 €)** ;
  - **un serveur Hetzner CX43**, 15,99 € HT par mois.
  - Avec T_max à 30 min, ce pool sert **20 comptes actifs** (5 groupes de 4).
  - Au-delà, les nouveaux essais attendent en file et une alerte part.
  - La taille du pool se règle par `cloud_pool_taille`.
- **Coût réel d'un essai de 7 jours**, à pool plein :
  - **0,31 à 0,33 €** dans un groupe de 4 comptes par IP ;
  - **1,24 à 1,34 €** pour un compte seul sur son IP ;
  - par client gagné, à 25 % de conversion : **1,24 à 1,32 €** (groupe de 4) ;
  - sont **mesurés** : l'IP, le CPU de la base et le trafic ; sont **estimés** :
    le serveur et le prix de l'instance de base (§ 2).
- **Un client payant**, toujours en rotation :
  - il coûte 1,32 à 1,44 € par mois dans un groupe de 4 ;
  - il rapporte 15,98 € nets par Stripe, il reste donc 14,54 à 14,66 € par mois.

**Le mail de la veille** :
- type `cloud_essai_veille`, ajouté à l'index des mails envoyés une seule fois,
  catégorie `support` ;
- créneau de J-2 à J-1 : il attend une place libre dans le plafond de 2 mails par
  24 h, puis à J-1 il part quoi qu'il arrive, toujours de jour ;
- sa ligne compte ensuite dans le plafond du jour (§ 4).

**Un seul essai par personne, carte obligatoire** :
- quatre verrous : le compte, l'appareil, le compte de plateforme, et l'empreinte
  de carte hachée ;
- un compte Free peut prendre l'option seule (§ 3).

**Phase 2 : IP dédiée** (`mode` = 2) : c'est la première conception, gardée en § 5.

## 1. Phase 1 — la rotation

### 1.1 La règle en cinq points

1. **Un compte à la fois par IP** : un bail (IP, compte, début, fin) et deux
   contraintes d'exclusion en base, une par IP et une par compte.
2. **Un petit groupe fixe par IP** : chaque IP a sa « maison », un groupe de
   comptes qu'elle sert à tour de rôle. Un compte garde son IP d'une session à
   l'autre.
3. **Une session au moins toutes les T_max minutes** pour chaque compte actif, et
   **tout de suite** dans trois cas : un retrait en attente, une republication
   dont l'annonce est déjà retirée, une vente constatée ailleurs.
4. **Jamais coupé au milieu d'un job** : le bail se prolonge, dans une limite
   fixée, et ne se termine qu'une fois sa réservation de job libérée ou terminée.
5. **Pool trop petit, alerte** : si le pool ne tient plus T_max, l'alerte part et
   les nouveaux essais attendent en file. Il n'y a jamais de trou silencieux.

### 1.2 Groupes et baux : ce que la base garantit

**`cloud_affinites`** : la maison d'un compte.
- La clé est le compte : un compte n'a qu'une IP maison.
- Le placement se fait sous un verrou unique (`cloud_rotation_rejoindre`), dans
  cet ordre :
  1. son ancienne maison, si elle a de la place ;
  2. l'IP la moins remplie ;
  3. une IP disponible mise en rotation, tant que `pool_taille` n'est pas atteint ;
  4. sinon `NULL` : le compte va en file.

**`cloud_baux`** — **jamais deux comptes en même temps sur la même IP**, battement
compris :
- exclusion par IP : `EXCLUDE USING gist (ip_id WITH =, tstzrange(debut, libre_le) WITH &&)`,
  avec `libre_le` = fin du bail + 1 min ;
- exclusion par compte : `EXCLUDE USING gist (user_id WITH =, tstzrange(debut, termine_le) WITH &&)` ;
- un seul bail actif par compte (index unique) ;
- ces contraintes demandent l'extension `btree_gist`, disponible sur le projet
  mais pas installée au 04/10.

`cloud_bail_ouvrir` refuse :
- un compte inactif ;
- un compte hors du groupe de l'IP ;
- une IP hors rotation ;
- tout chevauchement. Le banc l'a vérifié, même en écrivant directement dans la
  table.

### 1.3 T_max, sessions et priorités

Le nombre de comptes par IP compatible avec T_max (`cloud_groupe_effectif`, calcul
en entiers, identique en JS et en SQL) :

```
(g − 1) × (session + battement) ≤ (1 − marge) × T_max,   g ≤ groupe_max
session = (1 − marge) × T_max / (g − 1) − battement
```

Les réglages par défaut :
- **T_max** : 30 min ;
- **session minimale** : 5 min (le démarrage prend ~1 min, puis l'extension passe
  toutes les 2 min) ;
- **battement** entre deux comptes : 1 min ;
- **marge** pour les priorités et les prolongations : 20 % ;
- **groupe maximal** : 4 comptes, l'équivalent d'un foyer.

| T_max | comptes par IP | session de tour | attente maximale entre deux sessions |
|---|---|---|---|
| 15 min | 3 | 5 min | 12 min |
| 30 min | 4 | 7 min | 24 min |
| 60 min | 4 (plafond) | 15 min | 48 min |

La **première session** d'un compte dure 15 min : c'est le temps de se connecter
aux plateformes par la vue en direct.

**Les priorités**, lues chaque minute par `cloud_rotation_etat()` :
- un retrait en attente (`cross_post_jobs` avec l'action `delete`, statut
  `pending`) ;
- une republication à l'étape `deleted` : l'annonce est déjà retirée ;
- une priorité explicite posée par `cloud_priorite_demander`, pour une vente
  constatée ailleurs. Exemple : eBay vue par l'API (à brancher dans le worker eBay).

Quand une priorité arrive :
- le bail en cours sur la même IP passe en **fin douce** et se termine dès qu'il
  est sûr ;
- le compte prioritaire prend l'IP à la minute suivante ;
- il n'y a pas d'IP de secours en phase 1, l'affinité passe d'abord ;
- une priorité qui attend plus de 10 min déclenche une alerte.

**L'ordonnanceur** (`planifierRotation`, dans cloud-pool.js) tourne chaque minute
dans l'orchestrateur des navigateurs :
1. un appel à `cloud_rotation_etat()` ;
2. ses décisions : fin douce, fin, prolongation, ouverture.

Une simulation de 3 heures (4 comptes, 1 IP) donne zéro chevauchement et une
attente maximale de 24 min pour un T_max de 30 min.

### 1.4 Jamais coupé au milieu d'un job

Les fonctions s'accordent à la réservation de jobs qui existe déjà en prod :
- la table `jobs_reservations_extension` (migration 20260928130523) ;
- les fonctions `reserver_jobs_extension` et `ecrire_statut_job_extension`,
  relues en prod par `pg_get_functiondef` le 04/10 ;
- le `poste` d'un bail est la session FillSell du navigateur.

Le déroulé :
- **Fin douce**, 2 min avant la fin prévue : plus aucun job n'est pris.
- **Ce qui bloque la fin** (`cloud_bail_bloquants`, mêmes codes que `bloquantsBail`) :
  - `job_en_cours` : une réservation **commencée** sur ce poste. Elle ne finit
    qu'avec son job ;
  - `job_distribue` : une réservation distribuée, ni commencée ni expirée, tant
    qu'un passage de l'extension (2 min) n'a pas suivi la fin douce ;
  - `republication_en_vol` : une republication à l'étape `captured` ou `deleted`,
    jusqu'au plafond de prolongation.
- **La fin** (`cloud_bail_terminer`) est refusée tant qu'il reste un blocage.
  Elle libère ensuite les réservations jamais commencées de son poste (le job
  retourne dans la file) et pose le battement.
- **La prolongation** se fait par pas de 5 min, 30 min au plus. Au plafond :
  - l'alerte part ;
  - le bail **n'est toujours pas coupé** si un job tourne ;
  - le veilleur existant (`handler-watch`) finit par remettre en attente un job
    resté bloqué en traitement.

### 1.5 Taille du pool, et charge de la base

```
IP = ⌈N / g⌉ + réserve,   réserve = 10 %, au moins 1
```

N est le nombre de comptes actifs : essais en cours et comptes payants.

| N comptes actifs | T_max 15 (g = 3) | T_max 30 (g = 4) | T_max 60 (g = 4) |
|---|---|---|---|
| 10 | 5 IP · 27 $ | 4 IP · 21,60 $ | 4 IP · 21,60 $ |
| 20 | 8 IP · 43,20 $ | 6 IP · 32,40 $ | 6 IP · 32,40 $ |
| 25 | 10 IP · 54 $ | 8 IP · 43,20 $ | 8 IP · 43,20 $ |
| 50 | 19 IP · 102,60 $ | 15 IP · 81 $ | 15 IP · 81 $ |
| 100 | 38 IP · 205,20 $ | 28 IP · 151,20 $ | 28 IP · 151,20 $ |

**La taille du pool plafonne aussi la charge de la base** : à un instant donné, il
y a au plus **un poste allumé par IP**.
- Mesure du 04/10 au soir, par poste allumé : 14 à 20 requêtes/min et 0,1 à
  0,25 % du CPU d'une instance Small.
- 6 IP : 0,6 à 1,5 % ; 28 IP : 2,8 à 7 %.

**Serveurs** : un CX43 porte 15 à 25 navigateurs (estimé). Un seul suffit donc
jusqu'à 15 à 25 IP.

### 1.6 Départ, usure, signalement

**Un compte qui quitte** :
- les cas : essai non converti après la grâce, essai arrêté, essai refusé, option
  résiliée ;
- il sort de son groupe ;
- une **purge de compte** est demandée : profil de navigateur détruit, coffre
  vidé, session FillSell révoquée ;
- la preuve est relue par `cloud_purge_compte_manques` (version 2) ;
- **l'IP continue de servir les autres.**

**L'usure** : une IP sert au plus 8 comptes distincts (`comptes_distincts_max`).
Ensuite, elle ne prend plus de nouveau membre. Quand son groupe se vide, elle
n'est plus renouvelée et va au bout de sa période.

**Une IP signalée** (mêmes critères qu'en phase 2, § 5.4) :
- elle va au rebut ;
- son bail finit dès que c'est sûr ;
- son **groupe est relogé** ailleurs ;
- les membres gardent leur profil et leur coffre : ils changent de maison, ils ne
  quittent pas le service.

### 1.7 Renouvellement en rotation (`planDuJourRotation`)

- Une IP en rotation **qui a des membres** est toujours renouvelée, avec une
  décision à 3 jours de l'échéance.
- Une IP vide est renouvelée tant qu'on reste sous `pool_taille`. En surplus, elle
  expire.
- Une IP au rebut, ou usée et vide, n'est jamais renouvelée.
- Le cron commande ce qui manque pour atteindre `pool_taille`, **jamais
  au-delà**. La taille est un réglage de Nico ; une alerte lui dit quand la
  relever.

### 1.8 Le risque propre à la rotation

Une plateforme voit plusieurs comptes passer par la même IP, jamais en même temps.
Ce qui limite le risque :
- des petits groupes, 4 comptes au plus, comme un foyer ;
- toujours les mêmes comptes ensemble ;
- une IP résidentielle ;
- une usure bornée ;
- Beebs hors du Cloud : DataDome bloque tout l'environnement depuis le 26/09.

Si une plateforme relie des comptes d'un même groupe, la réponse est la phase 2 :
il suffit de passer `mode` à 2, la conception est prête.

## 2. Le coût réel d'un essai (7 jours, rotation)

Calculé par `coutEssaiRotation` et `tableauCoutsRotation`. Un navigateur ne tourne
que pendant un bail. Un compte dans un groupe de g comptes paie donc 1/g de l'IP,
1/g d'une place de serveur et 1/g d'un poste en base.

| Poste | Valeur | Statut |
|---|---|---|
| IP | 5,40 $ pour 30 jours (commande réelle #83578416), à 0,86 € le dollar : **1,08 € pour 7 jours** | **mesuré** (taux de change à relire) |
| Trafic | 2,0 Mo/min en activité, 0,3 à 0,5 Mo/min presque au repos (mesure du 26/09 : 195 Mo pour 97 min, sur 13 sessions). Une IP occupée en continu consomme 13 à 86 Go par 30 jours, au plus ~76 Go en rotation (occupée 7/8 du temps), sous les **100 Go** d'IPRoyal | **mesuré** |
| Base | 14 à 20 requêtes/min, 40 à 140 ms de calcul par minute, **0,1 à 0,25 % du CPU** d'une instance Small par poste. La Small coûte ≈ 15 $ par mois (docs Supabase, *compute-and-disk*), soit **0,003 à 0,008 € pour 7 jours** | CPU **mesuré**, prix de l'instance relevé |
| Serveur | Hetzner CX43 à **15,99 € HT par mois** pour **15 à 25 navigateurs**, soit **0,15 à 0,25 € pour 7 jours** par place | **estimé** : le prix vient du coordinateur, non revérifié (page Hetzner dynamique) ; la capacité n'est pas mesurée |
| Carte | Enregistrement par SetupIntent : la carte est enregistrée **sans être débitée**, donc **aucune commission de transaction**. Le filtrage Radar des SetupIntents est coupé par défaut. S'il est activé, il est « facturé par tentative de confirmation », sans montant publié sur la page lue | **0 €** (sources au § 9) |
| Mail de la veille | un e-mail Resend, compris dans le forfait | négligeable |

**Le coût d'un essai**, à pool plein (fourchette due au serveur et à la base) :

| Comptes par IP | T_max 15 | T_max 30 | T_max 60 | Coût d'un essai |
|---|---|---|---|---|
| 1 (seul) | possible, en continu | possible, en continu | possible, en continu | **1,24 – 1,34 €** |
| 2 | session de 11 min | 23 min | 47 min | **0,62 – 0,67 €** |
| 3 | session de 5 min | 11 min | 23 min | **0,41 – 0,45 €** |
| 4 | **impossible** (3 min < 5 min) | session de 7 min | 15 min | **0,31 – 0,33 €** |

Le coût d'un essai ne dépend que de la taille du groupe. T_max dit seulement
quelle taille de groupe est possible.

**Par client gagné** :

| Comptes par IP | conversion 10 % | 25 % | 40 % |
|---|---|---|---|
| 1 | 12,40 – 13,40 € | 4,96 – 5,36 € | 3,10 – 3,35 € |
| 2 | 6,20 – 6,70 € | 2,48 – 2,68 € | 1,55 – 1,68 € |
| 3 | 4,10 – 4,50 € | 1,64 – 1,80 € | 1,02 – 1,13 € |
| 4 | 3,10 – 3,30 € | 1,24 – 1,32 € | 0,77 – 0,83 € |

Ces chiffres supposent un **pool plein** :
- un pool à moitié vide coûte deux fois plus par essai ;
- le pool de départ (5 IP et un serveur, ≈ 39 € par mois) se paie même sans
  aucun essai.

**Un client payant**, par mois, en rotation :
- il coûte 1,32 à 1,44 € dans un groupe de 4, et 5,30 à 5,74 € seul sur son IP ;
- sur 20 € TTC (16,67 € HT), il reste :
  - **15,98 €** par Stripe (1,5 % + 0,25 € + 0,7 % pour Stripe Billing) ;
  - **14,17 €** par Apple ou Google à 15 % ;
  - **11,67 €** par Apple à 30 %.

## 3. Éligibilité et essai unique, carte obligatoire

**Qui peut prendre l'option** (palier.js, commit 0de5b5c ; `cloud_etat`,
`c_exige_un_palier = false`) :
- un compte Free peut la prendre seule, et garde ses quotas Free ;
- résilier la formule n'arrête pas l'option ;
- **un arrêt pendant l'essai** (`cloud_essai_arreter`, appelé par le flux d'arrêt,
  qui annule aussi l'abonnement d'essai) agit tout de suite : rien n'est facturé,
  la fin est ramenée à l'instant de l'arrêt, et le compte sort ;
- **une fois payée**, l'option tourne jusqu'à `cloud_periode_fin`, puis le
  paiement retire `is_cloud` à l'échéance.

**Le parcours** :
1. L'app appelle **`cloud_essai_preparer_moi(appareil)`**. Les refus tombent
   **avant** la saisie de la carte : compte inconnu, essai déjà pris, appareil
   déjà vu. L'empreinte de l'appareil est hachée en base ; la valeur brute ne sort
   jamais, pas même vers Stripe.
2. La carte est enregistrée sans débit (SetupIntent).
3. Le flux de paiement appelle **`cloud_essai_ouvrir(compte, card.fingerprint)`**,
   qui revérifie tout et ajoute la carte.

**Les quatre verrous** (index unique sur `(nature, empreinte)`) :
- le compte ;
- l'appareil ;
- la **carte**, hachée ;
- le compte de plateforme, relevé par notre propre navigateur à la première
  connexion. S'il a déjà servi à l'essai d'un autre compte, l'essai est refusé sur
  le champ.

Les refus arrivent dans le même ordre en SQL et en JS : `compte_inconnu`,
`deja_client`, `essai_deja_pris`, `palier_requis` (interrupteur coupé),
`appareil_inconnu`, `appareil_deja_vu`, `carte_absente`, `carte_deja_vue`,
`compte_plateforme_deja_vu`. Un essai encore en file qu'on arrête compte comme
pris.

**RGPD** :
- seulement des empreintes HMAC-SHA256, avec un sel gardé dans le coffre-fort
  de la base (secret `cloud_empreinte_sel`) ;
- finalité : empêcher l'abus de l'essai gratuit (intérêt légitime), à écrire dans
  la politique de confidentialité ;
- les empreintes sont gardées **12 mois après l'essai**, puis effacées par le cron ;
- les identités sont effacées à 12 mois dans le journal des IP et des purges ;
- les baux sont gardés 30 jours ;
- à la suppression d'un compte, `user_id` passe à vide ;
- le sel ne change jamais, sauf en cas de fuite.

## 4. Le mail de la veille

**Qui le reçoit** (`cloud-rappel-veille.js`) : un compte dont l'essai a démarré,
n'est ni arrêté, ni déjà payé, ni fini, et qui n'a pas encore été prévenu.

**Ce qu'il dit**, en français ou en anglais (`profiles.lang`) :
- la date de fin en heure de Paris, par exemple « mardi 13 octobre à 18h00 » ;
- que **20 € par mois seront prélevés sur la carte enregistrée**, avec les 4
  derniers chiffres si le flux de paiement les fournit ;
- comment arrêter (Réglages → Abonnement) : l'arrêt est immédiat et rien n'est
  facturé ;
- que la formule FillSell n'est pas concernée.

**Pas de lien de désinscription** : c'est une information de facturation
(catégorie `support`). Il part même chez quelqu'un qui s'est désinscrit des
actualités, et le mail l'explique.

**Le créneau et le plafond** — Nico : ce mail compte dans les 2 mails par jour de
notre initiative.
- **De J-2 à J-1** (48 h à 24 h avant la fin) : il part au premier passage horaire
  de jour où la personne a reçu **moins de 2 mails sur 24 h glissantes**. On
  compte toutes les lignes de `email_logs`, comme le fait envoi-ponctuel.
- **À partir de J-1** : il part **quoi qu'il arrive**, au premier passage de jour.
  Entre J-1 et la fin de l'essai, il y a toujours au moins 14 heures de jour.
- **Toujours de jour**, de 8 h à 22 h, heure de Paris. Si l'heure est illisible, le
  mail ne part pas.
- **Il compte ensuite** : sa ligne dans `email_logs` bloque le marketing du jour,
  puisque le plafond d'envoi-ponctuel compte toutes les lignes des 24 h.
- **Un seul, à vie** : type `cloud_essai_veille`, envoyé en mode `reservation`.
  La proposition SQL ajoute ce type à l'index `email_logs_one_shot_unique` (§ 9
  du fichier SQL) :
  - la définition en prod a été relue le 04/10 (14 types) ;
  - au moment d'appliquer, la liste est relue, le type y est ajouté, et l'index est
    reconstruit à l'identique dans la même transaction ;
  - l'opération peut être rejouée sans effet, le banc l'a vérifié.

**Le cadre légal** :
- **CJUE, 5 octobre 2023, C-565/22 (Sofatutor)** : le consommateur doit être
  informé « de manière claire, compréhensible et explicite », **au moment de la
  conclusion** du contrat, que la prestation deviendra payante après la période
  gratuite. Sinon, un second droit de rétractation s'ouvre au passage au payant.
  - **Prérequis** : l'écran d'essai et sa confirmation doivent afficher
    « 7 jours gratuits, puis 20 €/mois le <date>, arrêt en un geste ».
- **Code de la consommation, article L215-1 (loi Chatel)** : il impose de
  prévenir 1 à 3 mois avant le terme d'un contrat à **durée déterminée** reconduit
  tacitement. Il ne s'applique pas tel quel à un essai de 7 jours.
  - **Aucun texte français trouvé n'impose un rappel à J-1** : c'est de la loyauté
    et une bonne pratique.
- **Réseaux de cartes** (sources secondaires) :
  - Visa (avril 2020) : un rappel électronique avec un lien d'annulation avant le
    premier prélèvement ;
  - Mastercard (septembre 2022) : pour un essai de **plus de 7 jours**, un rappel
    entre 3 et 7 jours avant la fin. Notre essai fait 7 jours tout juste ;
  - le préréglage `mastercard` (de J-4 à J-3) est prêt si l'essai s'allonge.

**Le code** :
- un module pur et son selftest (35 contrôles) ;
- le branchement dans **email-tunnel**, sur l'appel horaire existant
  (`job_relaunch`). Il est isolé comme le récapitulatif des ventes : une panne
  n'empêche jamais la relance des jobs ;
- **la garde** : une lecture séparée de `profiles` avec les colonnes `cloud_*`.
  Tant que la proposition n'est pas appliquée, cette lecture échoue et **rien ne
  part**. La réponse le dit (`veille_cloud.garde`) ;
- `{"job_relaunch":true,"dry_run":true}` montre qui recevrait le mail, sans rien
  envoyer ;
- `deno check` passe. **Rien n'est déployé.**

## 5. Phase 2 — IP dédiée (conception gardée, `mode` = 2)

### 5.1 Cycle de vie d'une IP

```
achetee ─contrôle─▶ disponible ─essai─▶ attribuee_essai ─paie─▶ attribuee_client
   │                    ▲  │ (rotation : mettre_en_rotation ─▶ rotation)    │ résilié
   ▼ contrôle raté      │  └──────────────client payant─────────────────────▶│
 rebut ◀── signalée     └── sortie (quarantaine finie, purge prouvée,        ▼
   │      (tout état)        contrôle frais) ◀──────────── quarantaine ◀─ non converti
   ▼
 expiree (fin de période non renouvelée)  ⛔ jamais sous un titulaire, jamais un rebut renouvelé
```

### 5.2 Attribution et libération

L'attribution (`cloud_ip_attribuer`) se fait d'un seul bloc :
- un verrou par compte, puis `FOR UPDATE SKIP LOCKED` ;
- un seul titulaire par IP, et un index unique : jamais deux IP pour un compte ;
- **jamais une IP qui expire pendant l'essai** : elle doit couvrir les 7 jours
  d'essai, 2 jours de grâce et 1 jour de marge ;
- l'ordre de choix :
  1. le même compte reprend sa propre IP en quarantaine ;
  2. sinon, l'IP dont l'échéance est la plus proche ;
  3. à échéance égale, la moins usée ;
- 6 comptes au plus par IP.

À la libération, l'IP passe en quarantaine et la purge se fait tout de suite.

### 5.3 Quarantaine de 14 jours et purge prouvée

Pourquoi 14 jours :
- c'est deux fois la durée de vie mesurée des jetons de connexion Vinted (7 jours) ;
- cela laisse le temps aux signaux tardifs d'arriver ;
- un essai non converti occupe ainsi l'IP 23 jours, moins que les 30 jours d'une
  IP neuve qu'on abandonnerait.

**La purge** :
- elle détruit le profil du navigateur et vide le coffre ;
- elle révoque la session FillSell ;
- elle change l'empreinte de navigateur et les identifiants du proxy ;
- sa preuve (version 1) est relue par `cloud_purge_manques`.

**Pour sortir de quarantaine**, il faut en plus un contrôle de moins de 24 h :
- l'IP et le pays attendus ;
- aucune liste noire ;
- Vinted, Leboncoin et eBay qui s'ouvrent.

L'IP d'un ancien client n'est jamais remise dans le pool.

**Coût par essai** (IP seule) : 3,56 € pour un essai non converti, 1,08 € pour un
essai converti.

**Taille du pool** : `⌈λ(T + (1−c)(G+Q))⌉ + ⌈λH + z√(λH)⌉`. Par exemple, à 2 essais
par jour et 25 % de conversion : 43 IP, soit 232 $ par mois. `taillePoolCible`
recalcule le tableau complet.

### 5.4 Mise au rebut — critères mesurables (valables dans les deux phases)

- **Blocage anti-robot** : il ne compte que si au moins 2 autres IP passent la
  même plateforme dans les 24 h. Sinon, c'est l'environnement qui bloque (cas de
  Beebs) : la plateforme est fermée au Cloud et aucune IP n'est jetée.
- **Captchas** : 3 sur la même plateforme en 24 h.
- **Compte restreint** : dès le premier.
- **Liste noire publique.**
- **Contrôles de sortie ratés** : 3 de suite.
- **Contrôle d'entrée raté** : on demande le remplacement à IPRoyal.

Une IP au rebut n'est jamais attribuée ni renouvelée. Si IPRoyal la relivre un
jour, elle entre directement au rebut.

## 6. IPRoyal — achat et renouvellement (les deux phases)

**Les règles** :
- une commande par IP, car le remplacement et le remboursement sont limités à un
  par commande ;
- l'échéance est toujours relue chez IPRoyal ;
- une commande expirée ne peut plus être prolongée : la décision se prend avant ;
- `auto_extend` activé pour les IP en service, comme filet de sécurité, et coupé
  pour celles en surplus ;
- le jeton d'API est un secret de fonction (`IPROYAL_API_TOKEN`) ; les URL des
  proxys vont dans le coffre-fort de la base.

**Vérifié le 04/10/2026** :
- **Prix** : le prix public « dès » est 2,70 $ par IP pour 30 jours ; le **prix
  France mesuré** est de 5,40 $.
  https://iproyal.com/static-residential-proxies/
- **API** : `POST /orders` (avec `auto_extend`), `GET /orders/{id}` (`expire_date`,
  statuts), `POST /orders/{id}/extend` (`proxies[]`), `toggle-auto-extend`,
  `calculate-pricing`.
  https://docs.iproyal.com/proxies/isp/api/orders
- **Identifiants** : `change-credentials`.
  https://docs.iproyal.com/proxies/isp/api/proxies
- **Remplacement** : sous 24 h, un par commande, moins de 500 Mo consommés.
  https://help.iproyal.com/en/articles/7222815-if-the-proxies-i-purchased-don-t-work-do-you-offer-a-replacement
- **Remboursement** : sous 24 h ou 72 h selon le cas, moins de 500 Mo consommés.
  https://help.iproyal.com/en/articles/7222126-what-is-your-refund-policy-for-isp-proxies
- **Trafic** : 100 Go par proxy et par 30 jours.
  https://help.iproyal.com/en/articles/12094903-what-is-the-fair-usage-policy
- **Prolongation** : le temps restant s'ajoute et l'IP reste la même ; une commande
  expirée ne se prolonge plus.
  - https://help.iproyal.com/en/articles/7222566-can-i-extend-the-30-days-plan-for-a-longer-period
  - https://help.iproyal.com/en/articles/7222107-how-long-can-you-use-the-same-ip-address
  - https://docs.iproyal.com/proxies/datacenter/dashboard/extending-an-order

**Non vérifié** :
- les remises par quantité pour la France ;
- le délai de livraison ;
- le remplacement par l'API ;
- si les 5,40 $ incluent la TVA ;
- le choix d'un opérateur français ;
- ce que devient une IP expirée ;
- le taux dollar-euro.

## 7. Alertes, et ce que voit l'utilisateur

**Les alertes immédiates**, par mail à support@ comme veille-cpu (journal
`cloud_pool_alertes`) :
- pool vide ou presque vide ;
- en rotation : plus aucune place libre alors qu'un essai attend en file ;
- T_max dépassé ;
- priorité en attente depuis plus de 10 min ;
- bail bloqué au plafond de prolongation ;
- IP expirée alors qu'un compte l'utilise ;
- client payant sans place ;
- purge en retard de plus d'une heure.

Les seuils se calculent à partir du rythme d'essais mesuré. L'ops-digest de 8h50
lit `cloud_pool_etat()`.

**Côté utilisateur, jamais un écran cassé** : l'essai attend en file, et son
compteur de 7 jours ne démarre qu'avec une place (`cloud_essai_moi` donne la
position). Le message :

> Ton ordinateur Cloud se prépare. Ton essai de 7 jours commencera dès qu'il est
> prêt, en général en moins de 24 h. On te prévient par notification et par e-mail.

## 8. Ce qui a été vérifié

**`npm run selftest:cloud-pool`** : **203 contrôles**, tout est vert. Il relit
aussi la proposition SQL et palier.js, et vérifie qu'ils disent la même chose
sur :
- les durées, le palier exigé, les défauts des réglages ;
- les codes des preuves et des blocages ;
- les motifs de bail et les contraintes d'exclusion ;
- le refus sans carte et l'index des mails envoyés une seule fois.

**`npm run selftest:cloud-rappel-veille`** : **35 contrôles**, tout est vert.

**Banc SQL hors dépôt, 117 contrôles** : la proposition a été jouée dans un
Postgres en mémoire (PGlite, avec pgcrypto et btree_gist). Des bouchons
remplacent auth, le coffre-fort, `cross_post_jobs`, `jobs_reservations_extension`
(avec les colonnes de prod) et `email_logs` (avec l'index de prod à 14 types).
Ce qui a été vérifié :
- appliquée deux fois de suite, puis annulée par l'inverse, puis rejouée ;
- la rotation et les baux, y compris l'exclusion quand on écrit la table à la main ;
- les blocages, les priorités, l'arrêt, la purge, la conversion, le signalement,
  l'entretien ;
- la phase 2 ;
- **`cloud_etat` = `cloudDuProfil` sur 24 cas**, dont Free avec essai, essai
  arrêté, option payée avec arrêt prévu ;
- les codes des preuves, identiques en SQL et en JS ;
- l'index des mails envoyés une seule fois ;
- les droits d'accès.

**Non éprouvé** : la concurrence réelle entre deux connexions, car PGlite n'en a
qu'une. Elle est tenue par les contraintes et les verrous.

## 9. Questions ouvertes pour Nico, et sources

**Questions** :
1. **T_max** : 30 min (4 comptes par IP, proposé) ou 15 min (3 comptes, sessions
   de 5 min) ?
2. **Taille de départ** : 5 IP pour 20 comptes, d'accord ?
3. **Grâce de 2 jours** après la fin de l'essai : on la garde ?
4. **Mail de la veille** : de J-2 à J-1 (ta décision), ou le préréglage Mastercard
   (de J-4 à J-3) si l'essai s'allonge ?
5. **TVA** : 20 € TTC, ou FillSell est-il en franchise ? Et le même prix sur Apple
   et Google ?
6. **Beebs** : on le laisse hors du Cloud ?
7. **Le coffre des connexions** : il vit dans la base ou chez l'orchestrateur ?

**Sources des frais et du cadre**, lues le 04/10/2026 :
- Stripe, frais de carte : https://stripe.com/fr/pricing (cartes de l'EEE :
  1,5 % + 0,25 €)
- Stripe Billing : https://stripe.com/fr/billing/pricing (0,7 %)
- Stripe, SetupIntent (enregistre une carte sans la débiter) :
  https://docs.stripe.com/payments/paymentintents/lifecycle
- Stripe, Radar sur les SetupIntents (coupé par défaut, facturé par tentative
  s'il est activé) : https://support.stripe.com/questions/radar-for-setup-intents
- Google Play : https://support.google.com/googleplay/android-developer/answer/112622
- Apple : https://developer.apple.com/app-store/small-business-program/
- Supabase, prix de l'instance Small : https://supabase.com/docs/guides/platform/compute-and-disk
- CJUE C-565/22 : https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=celex:62022CJ0565
- Article L215-1 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000034072591/
- Visa : https://www.verifi.com/visa-update-subscription-merchant-free-trial-offers.html
- Mastercard :
  - https://www.chargebackgurus.com/blog/mastercard-subscription-rules
  - https://solidgate.com/blog/mastercard-rules-on-negative-billing/
