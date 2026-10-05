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
