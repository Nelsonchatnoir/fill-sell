# Lot 18/11 soir — T3 : relances Cloud, réglage Google de l'essai, état des binaires

## 1. Mails automatiques (code prêt, NON déployé, migration NON appliquée : feu vert de Nico requis)
- Règles pures : `supabase/functions/_shared/cloud-relances.js` ; passage horaire dans `email-tunnel` (`relancesCloud`,
  derrière la relance des jobs, isolé) ; mise en page `mailRelanceCloud` (`emails-fillsell.ts`). Verrou :
  `selftest:cloud-relances` (neuf : rouge avant, vert après).
- (a) `cloud_relance_arret` : `cloud_arret_fin_periode = true`, fin de période (la plus tardive de `cloud_essai_fin` /
  `cloud_periode_fin`) dans les 72 h, une fois. Cas du jour : compte c7c382b7 (fin 19/11 18:18, déjà dans la fenêtre : partirait au
  premier passage de jour), compte 13e274de (21/11 00:39), compte 7d615168 (24/11 21:21). Le compte de Nico (08918381) est exclu (test).
- (b) `cloud_relance_essai` : trace `formule_cloud_issue` / `cloud_achat_issue` (annule, erreur, refuse, attente ; jamais
  « conditions refusées » = un choix) ou `checkout_abandon` Stripe d'une formule avec Cloud, 24 h à 7 jours avant, aucun
  essai démarré depuis, pas payant, une fois.
- Règles communes : au plus 2 mails / 24 h (lignes `email_logs`, tous types), jamais un compte de test (`estCompteDeTest`),
  de jour (8 h – 22 h Paris), catégorie `marketing` (désinscription respectée, lien dans le mail), réservation one-shot.
- Migration `20261118220000_email_logs_index_relances_cloud.sql` (+ INVERSE) : les deux types entrent dans
  `email_logs_one_shot_unique` ; `index_one_shot_types()` sert de GARDE (sans l'index, `relancesCloud` ne fait rien).
  Preuve sur base jetable : `node scripts/cloud/preuve-index-relances.mjs` (tout vert). Forme prod : `create unique index
  concurrently` → `drop index concurrently` → `rename`, puis la fonction, puis `migration repair`.
- Ordre de mise en prod après le feu vert : migration, `email-tunnel` (version et `verify_jwt` lus avant/après),
  `{"dry_run":true}` pour lire `relances_cloud`, puis laisser le cron.

## 1c. Les 7 personnes bloquées
Retrouvées par `cloud_essai_demandes` (essai permis) + traces d'issue ratée + conditions acceptées, essai jamais démarré.
Liste et texte montrés à Nico ; rien n'est parti.

## 2. Google : éligibilité de l'essai
Relu dans la Play Console (18/11) : `premium-cloud-trial-7d` et `pro-cloud-trial-7d` sont déjà sur « N'ont jamais eu
d'abonnement dans cette appli ». Rien modifié ; aucun prix ni autre offre touché. Business + Cloud : pas d'offre d'essai.

## 3. Binaires 2.9.209 (relevé 18/11)
- App Store : version 2.9.209, build 2611162010, **acceptée** (`PENDING_DEVELOPER_RELEASE`, publication manuelle).
- Play Console : 2.9.209 (vc40) **acceptée**, « Modifications prêtes à être publiées » (« Publier 1 modification »),
  dernière publication le 16/11. Rien publié.

## MISE À JOUR (18/11 nuit, décisions de Nico A à E)
- Migration appliquée, `email-tunnel` 106 → 107 (`verify_jwt` false, inchangé), essai à blanc lu : 1a prévus compte c7c382b7 et compte 13e274de le
  19/11 à 08:00 (Paris) ; compte 7d615168 entre dans la fenêtre le 21/11 au soir (créneau 22/11 08:00) ; 1b : aucun candidat.
- ENVOI RÉEL COUPÉ (`ENVOI_REEL_RELANCES_CLOUD = false`). 1b ignore les essais ratés d'avant le 16/11 22:00Z (mail de Nico).
- Binaires 2.9.209 PUBLIÉS : Play (code 40, disponible 18/11 23:01), App Store (`READY_FOR_SALE`).
- 1c : envoyé par Nico lui-même ; rien gardé ici.
