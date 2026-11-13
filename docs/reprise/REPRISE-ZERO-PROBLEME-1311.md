# Reprise — lot « zéro problème » (12-13/11/2026), terminal clos le 13/11 au soir

Récit complet : `docs/enquetes/zero-probleme-1211/RAPPORT.md` (une section par étape, puis une par réponse de Nico).
État de prod : `docs/agents/etat-2026-10-01.md` (lignes du 12 et du 13/11, en fin de fichier). Comptes par id8, heures de Paris.
Paiements : `docs/enquetes/zero-probleme-1211/paiements-1311.md` et `paiements-1311-suite.md` ; nuit du 13/11 :
`nuit-1311-plateforme-jamais-vue.md` ; étape 4 : `docs/enquetes/zero-probleme-1211/etape4/` (PLAN, DÉCISIONS de Nico, L0, L1).

## 1. Livré (tout est EN SERVICE, poussé sur main)
- **Étape 1 — argent et confiance** (12/11 soir) : un achat de test n'envoie jamais de mail à un client ; l'offre suit le
  canal qui facture ; changer de formule pendant l'essai ; « on te prévient la veille » vrai (premier envoi réel :
  d607ba20, 13/11 16:00:16).
- **Étape 2 — bloc 1** (13/11 ~01:00) : tailles par site, genre, état, catégories.
- **Étape 3 — bloc 3** (13/11 ~02:50) : retraits, ventes, adresse.
- **Étape 5 — promesses** (13/11 ~04:50) : descriptions, couleurs, remontées, bordereaux, relevés.
- **1re réponse de Nico** (13/11 matin) : nuit du 13/11 (plateforme choisie jamais vue connectée : correctif à la
  racine), formules « + Cloud » ouvertes partout (iPhone 08:49), migrations F1, 140000, 153000, 154000, 170500, scripts
  c7c382b7 et de63ca45.
- **2e réponse** (13/11 midi) : paiements audités sur les 3 canaux, une action réussie prouve la connexion, refus
  Leboncoin sans motif ; migrations 180000, 190000, 193000, 184500 ; Play vc38 (2.9.176) publiée.
- **3e réponse** (13/11 après-midi) : migrations 213000, 203000, M1 210000 (+ remplissage) ; 7 doubles (règle de Nico) ;
  « même objet » 25caeedd et ebdf29f0 ; essai 0.6.187 réussi sur le poste Cloud pilote de Nico ; Leboncoin mêmes photos
  (seuil mesuré, validé) et relance identique bloquée ; un abonnement par canal, remboursement Stripe, grâce Google,
  impayé, textes légaux.
- **4e réponse** (13/11 fin d'après-midi) : un abonné ajoute TOUJOURS le Cloud (une seule FORMULE à la fois, tous
  canaux ; verrou `selftest:cloud-en-plus-de-formule`, tableau `selftest:abonne-ajoute-le-cloud`) ; « en plus d'un
  forfait payant » rétabli (conditions art. 6, CGV art. 7) ; `charge.refunded` ajouté au webhook Stripe ; migration
  20261113224500 (alertes de l'orchestrateur vers support@, preuve « [TEST] » reçue 17:34:29).
- **5e demande** (13/11 soir) : couper le renouvellement d'un essai Cloud ne coupe plus rien, sur les 3 canaux ; plus
  aucun arrêt immédiat d'un essai (web compris) ; AUCUN rattrapage des essais arrêtés avant le déploiement (13/11 20:32 :
  cdf7007c, 8b457627, 7d22ae91 et les autres restent arrêtés, aucun script, aucun mail) ; filet de capacité de
  l'orchestrateur (une place à la fois). Règle écrite : `docs/regles/mails-paiements-comptabilite.md`, dernière section.
  Verrous `selftest:essai-renouvellement-coupe` et `selftest:cloud-filet-capacite`.
- Dernière livraison : commits 899307d + d33c7f9 ; web d33c7f9 ; **OTA 2.9.186** ; orchestrateur cloud-2
  **d33c7f97f4ee** ; 15 fonctions (versions dans l'état de prod). Suite complète 749/749 (8 morceaux, copie fusionnée LF).
  Avant : 9fbf9e2 + 23ef826 (OTA 2.9.185, un abonné ajoute toujours le Cloud).
- **Extension 0.6.187** : zip prêt, seul livrable à téléverser :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.187-A-TELEVERSER\fillsell-extension-0.6.187-cws.zip`
  (BUILD_ID 2026-11-13T13:27:42Z+9856e10). Les AAB vc37 et vc38 (publiées) sont rangées dans `build/AAB-PERIMES/`.

## 2. Étape 4 — comptes hors France (décisions de Nico : `etape4/DECISIONS-NICO-1311.md`)
- **L0 EN SERVICE** (13/11 ~09:55) : aucune tâche eBay close pour un compte hors France (attente `ebay_site_etranger`,
  « Ton site eBay arrive bientôt, rien n'est perdu », reprise seule à l'ouverture du site) ; jamais ebay.fr pour un
  compte étranger (orienté vers l'API). Migration 20261113184500 (attente jamais expirée) appliquée.
- **M1 APPLIQUÉE** (20261113210000, table `comptes_plateformes` + remplissage 226 eBay / 234 Vinted).
- **L1 EN SERVICE** (écrivains et lecteurs du site de chaque compte, fonctions déployées depuis 3a32eab).
  Questions de L1 encore ouvertes pour Nico (`etape4/L1.md` § 7) : sites sans marketplace Inventory → EBAY_US en anglais ?
  `compte` eBay = EIASToken ? Vinted hors euro : devise et domaine NULL tant que non relevés ? Leboncoin / Beebs sans ligne ?
- **Suite : L2** (ContexteSite résolu une fois par tâche, M2 `ebay_item_aspects_sites` — base jetable d'abord, puis feu
  vert explicite de Nico), puis L3, L4 (eBay UK de bout en bout ; **prévenir Nico quand L4 est prêt, sans écrire à
  c7c382b7** — c'est Nico qui envoie le mail pour son accord), L5 (app, OTA), L6 (pilote c7c382b7 puis UK, BE, US,
  DE/AT, IT). Plan et estimations : `etape4/PLAN.md`.

## 3. Ce qui reste ouvert, et pourquoi
| Sujet | Pourquoi ce n'est pas fait | Quand / comment |
|---|---|---|
| Essai réel Android (essai gratuit, testeur de licence) | demande un téléphone Android avec un compte testeur | quand Nico a le téléphone en main |
| Essai des abonnés boutique (semaine offerte à un abonné App Store / Google Play) | demande le prochain binaire : `_shared/offre-essai-abonne.js` prêt et INACTIF, `signer-offre-boutique` NON déployée, `ESSAI_ABONNE_BINAIRE_MIN = null` | au prochain binaire iOS / Android |
| Essai réel du point 1c (un abonné ajoute le Cloud, par un vrai achat) | Stripe en mode test ne prouve rien (le webhook ignore `livemode: false`) ; un achat Sandbox demande TestFlight sur iPhone ; aucune connexion à l'app de production depuis l'automatisation | sur l'iPhone de Nico (TestFlight, identifiant Sandbox) : Réglages › Abonnement › FillSell Cloud › « Essayer 7 jours gratuits » ; preuve : journal `[garde-abonnement] … permis (cloud_en_plus)`, `cloud_canal` apple, palier gardé, aucune alerte « Deux abonnements » |
| 6 retraits Leboncoin des doubles | tâches `delete` en file depuis le 13/11 13:45 (6f6630d6 pour 53efea05 ; e87da1b8, 93cc3482, c629b9e1, 0f5e7c42, f83bc173 pour fc37c75e) : elles partent quand l'extension du vendeur est en ligne | relire leur statut ; ne rien relancer à la main |
| 2 refus Leboncoin inexpliqués | aucune famille connue ne les explique (veille : `scripts/lbc-refus-familles.prod.sql`) | relire la veille ; une nouvelle famille = une question à Nico |
| 785352fe (deux formules : Premium App Store + Pro par carte) | aucun mail (décision de Nico) ; Premium App Store ACTIF, renouvellement automatique, échéance **30/11 à 18:32** | **le 28/11 : relire et prévenir Nico s'il est toujours actif** (Apple reprélève le 30/11) ; rien annulé ni remboursé sans son accord |
| Essais réels de la 1re réponse non faits | lecture des ventes Beebs d'Ornella (demande la 0.6.187 chez elle, donc après le Web Store) ; cartographie de la modification Depop ; H3, H5, J2, K2 | après la publication de la 0.6.187 |
| 641fb37e | 2e réarmement SUSPENDU (il relancerait une tâche arrêtée par la garde `recreation_bloquee`) : `docs/enquetes/zero-probleme-1211/en-attente/rearmement-mange-641fb37e.patch` | décision de Nico |
| `empreintes-urls` dépasse son temps de calcul (546) | préexistant (vu le 12/11 : rafales de 100 des appelants SQL) ; rien de cassé | décision de Nico (rapport du terminal « Problèmes » du 12/11) |
| Questions PAY3 | (1) le Cloud seul proposé seulement à un abonné PAYANT (un compte gratuit reste orienté vers les packs) ; (2) une carte « FillSell Cloud seul » dans la fenêtre d'offres pour une formule d'un autre canal ? ; écran : une formule Stripe + un Cloud seul Stripe voit encore les cartes « + Cloud » (un clic propose la formule sans Cloud, rien n'est prélevé ; 0 compte aujourd'hui) | décision de Nico |
| support@ reçoit les alertes de l'orchestrateur | voulu (elles étaient perdues depuis le 01/11) : ~16 à 20 par jour | à régler (seuils) si c'est trop |
| **Solde IPRoyal bas** | $5.15 ; l'orchestrateur alerte : 16 $ de dépenses prévues sur 14 jours (4 achats d'IP), « recharger d'au moins 11 $ » ; aucune IP en renouvellement automatique (14 commandes « Subscription : Off »), les IP sont payées sur le solde, rechargé par la carte ****9699 | recharge = décision et geste de Nico (argent) ; première expiration le 25/11, puis 3 le 29/11 |
| Accusé de réception d'une résiliation sur le web | depuis le 13/11 soir, arrêter un essai sur le web n'envoie plus de mail (« aucun mail ») ; l'ancien mail d'arrêt servait d'accusé sur support durable (art. L215-1-1 du code de la consommation) | décision de Nico : garder un accusé pour le web ? |
| Verrou de carte (second essai refusé) | annule encore l'abonnement tout de suite (ce n'est pas un arrêt demandé par la personne) | confirmer avec Nico |
| Abonné qui a arrêté l'essai de son Cloud | `changer-formule` répond `essai_cloud_en_cours` jusqu'à la fin de l'essai + 1 jour | confirmer avec Nico |
| Essai réel de la règle « renouvellement coupé » | pas faisable depuis l'automatisation (appareil ou connexion à l'app de production) | Sandbox sur l'iPhone de Nico : couper le renouvellement d'un essai Cloud ; attendu : Cloud actif jusqu'à la fin, `cloud_arret_fin_periode` vrai, aucun mail, message dans l'app |

## 4. Copies de travail des agents
Toutes intégrées dans main puis retirées (wt-pay, wt-det, wt-lbc, wt-cloud, wt-e4l1, wt-e2*, wt-pay2, wt-lbc2,
wt-pay3, wt-alerte, wt-renouv, wt-capa et les copies d'intégration wt-int*) : rien n'est resté hors du dépôt. Le brouillon de session
(scratchpad) disparaît avec le terminal ; ce qui devait durer a été copié dans `docs/enquetes/zero-probleme-1211/`.
Les autres copies listées par `git worktree list` (`.claude/worktrees/agent-*`, `fill-and-sell-cloud`, `-feat-cloud`,
`-lot-e`, `-paiements-cloud`, `-seo`, `-apercu-marketing`, `fs-deploiement-cloud`, `wt-lf`, `avant-7c28985`)
appartiennent à d'autres terminaux : non touchées.

## 5. Règles de la session à garder
- Aucun mail à un client sans « envoie » de Nico ; rien chez Stripe sans son ordre ; rien annulé ni remboursé sans son accord.
- Chaque migration : base jetable, sauvegarde + inverse + lecture avant / après, puis feu vert explicite.
- Ne jamais relancer une tâche dont le `needs_user_source` est une garde volontaire ; ne jamais toucher à `EXTENSION_MIN_BUILD`.
- Essai Cloud : seul le poste de Nico est touché, jamais celui d'un client Cloud.
