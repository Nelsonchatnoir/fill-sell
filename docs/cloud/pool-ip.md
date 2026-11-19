# FillSell Cloud — une IP française DÉDIÉE par compte

Décisions de Nico du **05/10/2026** (remplacent la « rotation » du 04/10).
Branche `feat/cloud`. **Rien n'est appliqué, rien n'est acheté, rien n'est déployé.**

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql` | le socle (pool, coffre, postes, verrous d'essai, entretien) — **NON appliqué**, inverse en tête, dépend de `20261004233000` |
| `supabase/functions/_shared/cloud-pool.js` | les règles pures, miroir de la SQL — `npm run selftest:cloud-pool` (104) |
| `scripts/cloud/banc-sql-socle.mjs` | la migration JOUÉE dans un vrai Postgres (PGlite) — 80 contrôles |
| `serveur-cloud/` | l'orchestrateur (navigateurs, coffre, « Me connecter », entretien) |

## 1. La règle

- **Une IP par compte, à lui seul**, pendant l'essai puis pendant l'abonnement.
  Elle est **réservée** (30 min) dès la préparation de l'essai, AVANT tout
  paiement, puis **attribuée** quand le paiement démarre l'essai (déclencheur sur
  `profiles`), et **reste la même** quand l'essai se transforme.
- **Essai non transformé** (après 2 jours de grâce) **ou option arrêtée** :
  l'IP part au **REPOS**. Le compte est purgé (navigateur et profil détruits,
  coffre vidé, session FillSell révoquée, identifiants du proxy changés — la
  preuve est exigée), puis l'IP **retourne au pool** une fois le repos fini et
  un contrôle frais passé (IP de sortie, pays, listes noires, Vinted / Leboncoin
  / eBay qui s'ouvrent). Ancien client compris (décision du 05/10).
- **Le même compte qui revient pendant le repos reprend SA propre IP** (aucun
  autre compte ne l'a vue).
- **Pool vide** : la préparation répond `pool_vide`, **rien ne s'ouvre** (ni
  essai ni paiement), la personne est inscrite en attente (`cloud_attente`) et
  l'alerte part. Un compte actif SANS IP (cas de course) déclenche une alerte
  immédiate `sans_place`.
- **Une IP signalée** (blocage avéré, 3 captchas en 24 h, compte restreint,
  liste noire, contrôles ratés) va au **rebut** : jamais réattribuée, jamais
  renouvelée ; son titulaire reçoit aussitôt une autre IP et garde ses connexions.
  ⛔ **(14/11, règle de Nico : « On ne jette JAMAIS une IP payée »)** plus aucun
  rebut AUTOMATIQUE : le contrôle d'entrée attend 2 min après la livraison et
  relit un écho vide (3 lectures) ; un contrôle qui reste douteux met l'IP en
  **quarantaine** (état `quarantaine`, colonne `cloud_ips.quarantaine`, migration
  `20261114090000`) : ni attribuée, ni renouvelée, recontrôlée à 15 min, 1 h, 4 h
  puis toutes les 12 h, de retour au pool dès qu'un contrôle passe ; après des
  échecs répétés sur 24 h, **signalée à Nico** (support@) avec la preuve, puis
  recontrôlée une fois par jour jusqu'à son échéance. Le rebut ne reste qu'un
  geste manuel de Nico (`cloud_ip_signaler`). Règles : `cloud-pool.js` § 4 bis ;
  verrou `npm run selftest:cloud-ip-quarantaine`.

## 2. La durée du repos — PROPOSÉE : 7 jours (réglage `cloud_repos_jours`)

Pourquoi 7 :
- c'est la **durée de vie mesurée des jetons Vinted** (26/09 : `access_token_web`
  et `refresh_token_web`, 7 jours). Après 7 jours, plus aucune session du compte
  précédent ne peut être vivante côté plateforme sur cette IP ;
- une IP résidentielle **change de main chez les opérateurs** en quelques jours :
  une IP qui passe d'un compte à un autre après une semaine de silence ressemble
  à une réattribution ordinaire ;
- le coût : 5,40 $ / 30 j = 0,18 $ par jour, soit **1,26 $ par départ**.
  14 jours (la conception du 04/10) doublait ce coût sans preuve d'un gain.
Le réglage se change sans migration : `insert into coin_config(key, value) values ('cloud_repos_jours', 14)`.

## 3. Contraintes d'exclusion, btree_gist

**Plus nécessaires.** L'exclusivité tient en une colonne et un index :
- `cloud_ips.user_id` = le titulaire (CHECK : présent ⇔ état attribué) → une IP
  ne sert jamais deux comptes ;
- `cloud_ips_un_titulaire` (index unique partiel sur `user_id`) → un compte n'a
  jamais deux IP ;
- `cloud_ips_une_reservation` (index unique partiel sur `reserve_pour`).
`btree_gist` **n'est pas installée** (le banc le vérifie). Plus de baux, plus
de groupes, plus de T_max.

## 4. Capacité et coûts (`cloud-pool.js` : `taillePoolCible`, `coutParEssai`, `margeParClient`, `capacite`)

**Taille du pool** (régime établi, λ essais/jour, c conversion, C clients, μ départs/jour) :
`C + ⌈λ·7 + λ(1−c)·2 + (λ(1−c)+μ)·7⌉ + sécurité`, sécurité = `λH + 1,65√(λH)`.
Exemple : λ = 1/j, c = 25 %, 10 clients, 0,1 départ/j → **28 IP (151,20 $ / mois)**.

**Un essai** (IP à 5,40 $ / 30 j, 0,86 €/$) :
| | jours d'IP | IP | navigateur + base (7 j) |
|---|---|---|---|
| non transformé | 16 (7 + 2 + 7) | 2,48 € | ≈ 0,19 € |
| transformé | 7 | 1,08 € | ≈ 0,19 € |

**Un client payant, par mois** : IP 4,64 €, serveur ≈ 0,80 € (CX43 à 15,99 € HT pour
~20 navigateurs — **estimé, à mesurer sur le serveur**), base ≈ 0,01 €.
Net Stripe 15,98 € → **marge ≈ 10,5 €** ; Apple / Google (15 %) 14,17 € net → ≈ 8,7 €.

**Serveur** : un navigateur en continu par compte actif (le délai entre deux
sessions n'étant pas tranché, voir § 5). Un CX43 (8 vCPU, 16 Go) ≈ 20 navigateurs
(estimé : 1,4 Go maximum par conteneur). 45 comptes → 3 serveurs.

**Base** : 0,1 à 0,25 % du CPU d'une Small par navigateur allumé (mesuré le 04/10).
100 comptes en continu → jusqu'à +25 % de CPU : c'est là que le délai entre
sessions comptera. Garde : au-dessus de 50 % (`veille_cpu`), l'orchestrateur ne
démarre plus rien, sauf une connexion qu'une personne attend.

## 5. Le délai entre deux sessions — NON TRANCHÉ

Étude d'un autre terminal en cours (`docs/agents/etude-delai-ventes-0510.md`).
Réglage `coin_config.cloud_delai_sessions_min` : **absent = navigateur en
continu** (exécution H24, détection des ventes continue) ; présent = une
session au plus tard toutes les N minutes, et tout de suite dès qu'un job
attend ou qu'une connexion est demandée. Jamais figé dans le code.

## 6. Un seul essai par personne — quatre verrous

1. **le compte** (`cloud_essai_debut` non nul = essai pris, tous canaux) ;
2. **l'appareil** (identifiant d'installation, haché) — vérifié à la préparation ;
3. **le compte de plateforme** — les comptes Vinted déjà relevés par l'extension
   (préparation) et chaque compte connecté depuis « Me connecter » (première
   connexion) ;
4. **la carte** (Stripe `card.fingerprint`, hachée) — au début de l'essai, par
   `stripe-webhook` : déjà vue → l'essai est annulé sur-le-champ, rien prélevé.
Un verrou qui refuse l'essai ne refuse pas l'option : elle se prend sans essai,
après une question claire. Les stores (Apple, Google) ne laissent pas choisir
l'offre : une semaine offerte par la boutique à un essai refusé n'est **pas
activée** chez nous (Cloud démarre au premier paiement réel), et l'écran le dit.

## 7. Alertes (support@ seulement, par la porte d'envoi unique)

Pool vide / presque vide ; compte actif sans IP (immédiate) ; capacité du
serveur atteinte ; purge incomplète ou en retard ; propositions de
renouvellement ou d'achat (**aucun achat sans le GO de Nico** : `IPROYAL_ACHATS_AUTORISES=0`).
Rappels au plus une fois par heure. Coupées par défaut (`ALERTES_MAIL=0`).

## 8. RGPD

Empreintes HMAC-SHA256 (sel du coffre-fort de la base), gardées 12 mois après
l'essai ; identités effacées à 12 mois dans les journaux ; connexions aux
plateformes chiffrées par l'orchestrateur (la base ne voit que du chiffré),
effacées au départ du compte. Texte à valider : `docs/cloud/confidentialite.md`.

## ⛔ 14/11/2026 (complément 3 de Nico) — le contrôle de santé sans eBay ; « grillée » n'est plus définitif
- Le contrôle de santé (`serveur-cloud/src/sante.js`, `cloud-pool.js` `PLATEFORMES_SANTE_CONTROLEES`) ne regarde que les
  plateformes qui passent RÉELLEMENT par l'IP du poste Cloud : Vinted, Leboncoin, Beebs, Depop. eBay en sort : sur le Cloud,
  la connexion eBay se fait dans le navigateur du téléphone du client, publications et retraits par l'API eBay côté serveur
  (ebay-api-worker). Un échec « ebay » d'avant ne compte plus (`codeSanteCompte`).
- « Grillée » (un échec relu une 2e fois) n'est plus définitive : recontrôlée à `quarantaineEspacementsMin` (15 min, 1 h,
  4 h, puis toutes les 12 h), en dernier dans `choisirIpASonder` ; un contrôle qui passe la remet SAINE (retour au pool,
  `sortie_grillee_le`, la trace d'avant dans `grillee_avant`) ; un échec la garde grillée (`recontroles` + 1). Tant qu'elle
  est grillée : jamais attribuée, jamais renouvelée, hors de la marge. Base : migration 20261114120000 (la garde
  « deja_grillee » de `cloud_ip_sante_noter` retirée ; banc `scripts/essais/20261114120000_banc.mjs`).
- Plus aucun mail pour une IP grillée sans client (journal `cloud_pool_alertes` seul, règle des mails à Nico du 14/11).
- Recontrôle à la demande : `docker compose exec -T orchestrateur node outils/controle-sante.mjs <ip_id> … [--sans-ecrire]`.
- Verrou : `selftest:ip-sante-sans-ebay`.

## ⛔ 19/11/2026 (demande de Nico : « aucune IP payée en trop ») — fin de compte, une IP par compte, renouvellement, alertes
Migration `20261119190000_cloud_ip_fin_de_compte` (inverse `supabase/rollbacks/…_INVERSE.sql`, banc
`scripts/essais/20261119190000_banc.mjs`) ; règles JS `cloud-pool.js` / `alertes-nico.js` ; verrou
`node scripts/cloud-ip-fin-de-compte-selftest.mjs`.
- **Grâce d'un essai fini** (`cloud_compte_synchroniser_pool`, miroir `graceDeFinEssai`) — décision de Nico du 19/11 :
  « pas de grâce pour un essai déjà annulé ni pour un compte payé puis résilié ». AUCUNE pour un essai arrêté ou au
  renouvellement coupé (`cloud_arret_fin_periode` : Apple et Google le gardent après l'expiration), ni pour une IP convertie
  (le compte a payé puis s'est arrêté) ; Stripe sans conversion (Stripe convertit à la fin même de l'essai : non converti =
  annulé) : `cloud_grace_stripe_heures` (absent = 2 h, message en retard) ; essai Apple ou Google non coupé : `cloud_grace_jours`
  (absent = 2 jours). Puis repos 7 jours, purge, contrôle, stock — chemin normal.
- **Adresse remplacée par IPRoyal** (même commande, remplacement gratuit d'une IP défectueuse) : la relecture horaire des
  commandes (`approvisionnement.relireCommandes`, une lecture par commande) la voit ; une IP libre reçoit la nouvelle adresse
  et ses identifiants (`cloud_ip_remplacee`, journal `remplacement`), sa santé est effacée, elle repasse le contrôle d'entrée
  puis la santé. Une IP attribuée n'est jamais changée seule (alerte). Avant le 19/11, rien ne relisait l'adresse.
- **Une IP par compte** : l'entretien lève la réservation d'un compte qui tient déjà une IP (journal `reservation`,
  `details.levee`) ; une IP réservée n'a plus de passe-droit au renouvellement (la 39, réservée au compte de Nico le 04/11).
- **Renouvellement** : une IP attribuée n'est renouvelée que si son compte vit à l'échéance (`cloud_ip_titulaires()` →
  `planDuJour({ titulaires })`, `titulaireFiniAvant`) ; lecture ratée = renouvelée (jamais couper un client sur un doute).
  Une commande IPRoyal se prolonge en entier (les IP sœurs avec elle).
- **Solde** : la projection de 14 jours ne compte que les IP de clients vraiment dues ; le mail dit les clients refusés faute
  d'IP et le montant à recharger (`couvertureSolde`).
- **Mails à Nico, un par incident** : `orchestrateur.achat_ip_solde` (achat refusé faute de solde : montant, clients refusés ;
  résolu par un achat réussi ou un solde qui couvre 14 jours) ; `orchestrateur.stock_ip_vide` (ni IP saine libre, ni livrée
  à contrôler, ni en route, même sans personne qui attend ; résolu quand une IP revient).
- **Vente** : serveur avec places mais aucune IP prête → `cloud_vente_etat.raison = 'ip_en_preparation'` (jamais
  « complet ») ; la préparation inscrit à la liste d'attente ; l'app dit « Une place se prépare : inscris-toi, tu es
  prévenu(e) dès qu'elle est prête ».
- **(19/11 ~14:00, décisions de Nico après la coupure du rachat à 13:17)** `coin_config cloud_ip_achat_sur_demande = 1`
  (script `scripts/reparations/20261119_cloud_ip_reglages.sql`) : un achat seulement pour un client qui attend VRAIMENT
  (inscrit sur la liste, ou essai de moins de 24 h ; `attenteVraie`) sans IP saine libre, UNE IP à la fois, jamais tant
  qu'un achat ou un contrôle d'entrée est en route, jamais pour remplacer une IP mauvaise (`achatSurDemande`) ; plus aucune
  IP achetée ni renouvelée d'avance (`cloud_ip_marge` ne reste que le jeu de la garde du nombre). Une IP suspecte ou grillée
  hébergeur / proxy / pays, ou refusée 3 fois au contrôle d'entrée, reste hors du pool et le journal la note
  (`ip_defectueuse`, une fois par adresse et par défaut). Rachat coupé : « client sans IP » part dès le réassort rapide
  (5 min), un mail par incident.
- **⛔ (19/11 soir, décision de Nico) Plus jamais d'intervention humaine sur les IP** : aucun mail « texte à coller au
  support » (l'ancienne alerte `orchestrateur.ip_a_remplacer` et `texteDemandeRemplacement` sont supprimées ; verrou
  `selftest:ip-sans-intervention-humaine`). Le remplacement, s'il existe, passe par l'API du fournisseur retenu ; le rachat
  reste coupé (`cloud_ip_achats_auto = 0`) jusqu'à la décision de Nico sur le fournisseur (opérateur français choisi à
  l'achat : Orange AS3215, SFR AS15557, Bouygues AS5410, Free AS12322).

## ⛔ 19/11/2026 soir (décisions de Nico) — contrôle AVANT toute attribution, sortie seule avant renouvellement
Migration `20261119230000_cloud_ip_controle_avant_attribution` (inverse `supabase/rollbacks/…_INVERSE.sql`, banc
`PREUVE_PG=embarque node scripts/essais/20261119230000_banc.mjs`, après 20261119190000 et 20261119200000) ; règles JS
`cloud-pool.js` ; orchestrateur `entretien.js`, `sante.js`, `verifications.js`, `iproyal.js` ; verrou
`npm run selftest:ip-controle-avant-attribution`.
- **Règle pragmatique** (Nico) : pas d'exigence d'IP de box. Refusées : hébergeur, proxy, pays ≠ France, plateforme qui ne
  s'ouvre pas (Vinted, Leboncoin, Beebs, Depop). **eBay n'entre jamais dans le contrôle** (publication par l'API, pas par
  l'IP du client). Le reste est accepté, quel que soit l'opérateur (il ne fait que l'ordre).
- **Attribution** (`cloud_ip_attribuer`, `cloud_ip_controlee_avant_attribution`, miroir `controleeAvantAttribution`) : une
  IP n'est donnée qu'avec un contrôle de santé « saine » de moins de 60 min (`cloud_controle_attribution_min`), postérieur
  à sa dernière libération (retour du repos) et à sa dernière livraison. Sinon le compte attend « une place se prépare » ;
  toutes les 5 min (même achats coupés), l'orchestrateur lit `cloud_ip_attendus()` et contrôle pour le premier compte son
  IP au repos, sa réservation, puis la meilleure disponible (`ipAControlerAvantAttribution`) ; « saine » écrite → le
  déclencheur `cloud_ips_zz_servir_actif_sans_ip` la donne ; un échec → la suivante. Jamais un achat pour ça.
- **Renouvellement d'une IP TENUE** (`controlerSortieAvantRenouvellement`, `sante.verifierSortie`) : dans les 4 jours avant
  l'échéance, la SORTIE seule lue à travers l'IP (ip-api, ipinfo — AUCUNE page de plateforme : jamais un robot sur l'IP d'un
  client), écrite par `cloud_ip_controle_renouvellement_noter`. Un échec RELU 30 min plus tard (`confirme`) ou un refus
  PROUVÉ → pas renouvelée (`planDuJour` : `sortie_echouee`, `refus_prouve_titulaire`) ; à l'échéance le client reçoit
  l'IP saine suivante, contrôlée juste avant. Un échec pas encore relu, une sortie illisible, une migration absente :
  renouvelée comme avant (jamais couper un client sur une lecture).
- **Grillée sur sa SORTIE = définitive** (`grilleeSurSortie`, `santeSuivante`) : hébergeur / proxy / pays relu deux fois →
  plus jamais saine, plus recontrôlée, ni attribuée ni renouvelée : elle expire (80, 81, 82, 88, 89). Grillée sur une
  plateforme seule : règle du 14/11 (revient dès qu'un contrôle passe).
- **Alerte au premier blocage** (`verifications.noterRefusIp`) : un accès restreint par une plateforme sur l'IP d'un compte
  → un mail tout de suite, une fois par IP et par plateforme (`orchestrateur.plateforme_arretee`, clé `ip:<id>|<plateforme>`).
- **Commande IPRoyal** (`iproyal.corpsCommande`) : chaque commande porte « Extra Requirements » = « French residential ISP
  only (Orange AS3215, SFR AS15557, Bouygues AS5410, Free AS12322), no hosting/datacenter ASN, IP located in France »
  (`product_question_answers`, question lue au catalogue `products[].questions[]`) ; sans la question, rien n'est acheté.
- **Rachat automatique** : rallumé seulement après le contrôle prouvé en production (essai réel sur l'IP 90), avec les 4
  règles d'achat (client qui attend vraiment, une IP à la fois, jamais pour remplacer une IP mauvaise, contrôle avant
  attribution).
