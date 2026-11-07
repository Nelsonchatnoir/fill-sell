# Jour d'ouverture de FillSell Cloud — la liste, dans l'ordre (décision j de Nico, 05/11/2026)

## ⛔ 07/11/2026 soir — PROCÉDURE DU JOUR J EXÉCUTÉE PAR CLAUDE SEUL, sur « on ouvre » de Nico (prime sur la suite)
Préalables (relus avant de commencer, sinon on s'arrête) : les deux stores ont approuvé 2.9.164 et Nico l'a publiée ;
migration 20261107180000 appliquée (FAIT 07/11 17:08, feu vert nommé) et orchestrateur « marge + garde en nombre +
capacité mesurée » sur cloud-2 (FAIT 07/11 17:11, acb9a561b5e1 ; avant b381d51077ad) — relus le jour J ;
`main` propre et poussé ; aucune tâche « processing » sur cloud-2. Chaque étape : geste → vérification → la moindre
différence = retour arrière de l'étape et arrêt. Heures de Paris notées au fur et à mesure dans docs/cloud/REPRISE.md.
1. **Fonctions de paiement, une passe** (autorisations nommées du 07/11 : create-checkout-session, stripe-webhook,
   apple-iap-webhook, cancel-subscription, validate-google-purchase ; puis, OUI de Nico du 07/11 ~17:00 : email-tunnel,
   google-play-webhook, get-pending-jobs ; validate-apple-receipt déjà en v40, jamais redéployée ici) :
   a. **`main` à jour SEULEMENT** (ordre de Nico) : `git fetch origin` puis `git status -sb` = `## main...origin/main`
      sans « ahead » ni « behind », `git status --short supabase/functions` vide. Sinon : arrêt.
   b. Versions et verify_jwt des 8 lues et notées AVANT (`npx supabase functions list`).
   c. **get-pending-jobs n'est jamais écrasée** (redéployée par PROBLÈMES le 07/11 : règle A, Ciddjy…) :
      `npx supabase functions download get-pending-jobs --use-api` dans un dossier vide du scratchpad, puis comparaison
      avec `supabase/functions/get-pending-jobs` et les `_shared` qu'elle importe. Identique à `main` → elle n'est PAS
      redéployée (déjà à jour). Différente → arrêt, diff montré à Nico et à PROBLÈMES ; rien n'est déployé pour elle.
   d. `node scripts/cloud/deployer-fonctions-cloud.mjs` (plan), puis `--go --seulement
      email-tunnel,stripe-webhook,apple-iap-webhook,google-play-webhook,validate-google-purchase,cancel-subscription,create-checkout-session`
      (+ `get-pending-jobs` seulement si c. l'a permis). Le script garde l'ordre de sa liste (email-tunnel en tête).
   Vérif : versions et verify_jwt relus APRÈS (version +1, verify_jwt inchangé pour chacune), 15 min de journaux sans
   erreur, Stripe `pending_webhooks` 0. Retour : redéployer chaque fonction depuis `914b1e5` avec le même verify_jwt
   (§ 1) ; get-pending-jobs n'est jamais touchée par ce retour.
2. **IP automatiques** : `cloud_ip_achats_auto` = 1. Le paiement par carte est DÉJÀ en service depuis le 07/11 17:12
   (choix de Nico : `cloud_ip_paiement_carte` = 1, `cloud_ip_carte_id` = 410814 = carte …9699 fin 2029-04 ; l'autre
   …9699, id 441087, fin 2031-12, n'est PAS celle de Nico). Vérif : au plus 5 min après, journal `reappro_rapide` : stock = marge (3) +
   inscrits, garde en nombre respectée, entretien `carte.mode` = « carte » ; aucune alerte « garde ». Retour :
   `cloud_ip_achats_auto` = 0. (Le 07/11 17:12 la garde lit 8 IP vivantes pour une borne de 4 : les 7 IP libres
   suffisent, aucun achat avant qu'elles soient attribuées ou expirées.)
3. **cloud-2 ouvert à tous** : liste `COMPTES_AUTORISES` vidée (geste exact plus bas, « Ordre du jour J » 3). Vérif :
   journal `demarrage` « comptes_autorises: tous », `details.service.comptes` = tous, navigateur de Nico rouvert.
   Retour : archive `.env`, `up -d --no-deps --force-recreate orchestrateur`.
4. **Interrupteur** `cloud_offre_ouverte` = 1. Vérif : `cloud_vente_etat` d'un compte ordinaire = vente possible,
   places = min(serveur, IP) ; l'offre visible dans un navigateur isolé. Retour : la clé à 0.
5. **OTA 2.9.164 en `--delta`** (§ 7 ; numéro au-dessus du canal). Vérif : canal relu, `build.json` du bundle = commit.
   Retour : bundle précédent remis sur `production`.
6. **Grille trois jauges** = 1 (§ 4). Vérif : quotas_etat et écran. Retour : 0.
Puis 2 h de surveillance (§ 8) : ventes, places, IP achetées, alertes support@.

## ⛔ 07/11/2026 — DÉCISIONS DE NICO ET PASSE PRÉPARÉE (rien allumé) — prime sur la suite de ce fichier
Décisions (07/11 ~10:28) : toute personne qui paie le Cloud a sa place AUTOMATIQUEMENT, dans la limite des places du
serveur, sans liste tenue à la main ; aucun régime spécial pour les abonnés au-delà de 400 publications (les nouveaux
quotas valent pour tous quand la grille s'allume) ; achats d'IP COUPÉS, rallumés avant le 8e client Cloud (pool relu le
07/11 : 7 IP libres) ; cloud-1 RETIRÉ (base « retire » 10:34, serveur Hetzner supprimé 10:34:52) ; RGPD Hetzner : rien.
Déjà fait, relu le 07/11 : prix Stripe 24,99 € actif / 20 € archivé ; Apple Cloud APPROVED 24,99 € ; Google
`cloud-monthly` actif 24,99 €, essai 7 j.
- **Le piège qui impose l'ordre** : la vente (`cloud_vente_etat` → `cloud_places_libres()`, relue en prod le 07/11) ne
  compte que les places des serveurs aptes ; elle ne lit JAMAIS `COMPTES_AUTORISES`. Allumer l'offre avec une liste
  sur cloud-2 = une personne hors liste paie, sa place est comptée, et le serveur ne lui ouvre jamais de navigateur.
  Donc : **liste vidée AVANT l'interrupteur**, et l'interrupteur coupé AVANT toute remise d'une liste. Liste vide =
  « tous » partout (`config.js`, `connexion.js:179`, `postes.js:294`, `flotte.js:85` déclare `comptes: 'tous'`).
- **Ordre du jour J** (après l'approbation des deux stores, feu vert « on ouvre » de Nico) :
  1. fonctions de paiement (§ 1 plus bas) ;
  2. binaires publiés par Nico (§ 6) ; OTA ≥ 2.9.164 en `--delta` (§ 7) ;
  3. **cloud-2 ouvert à tous** (aucune tâche « processing » : la vidange attend 10 min au plus) :
     `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@5.9.80.213 'cp -p /srv/fillsell-cloud/.env /srv/fillsell-cloud/archives/env-avant-ouverture-$(date +%Y%m%d-%H%M) && sed -i "s/^COMPTES_AUTORISES=.*/COMPTES_AUTORISES=/" /srv/fillsell-cloud/.env && cd /srv/fillsell-cloud/deploiement && docker compose up -d --no-deps --force-recreate orchestrateur'`
     Vérifier : journal `demarrage` → `"comptes_autorises":"tous"` ; au battement suivant
     `cloud_serveurs.details->'service'->>'comptes'` = `tous` et `apte` = true ; navigateur de Nico rouvert ;
     `/sante` ok. Retour : remettre l'archive `.env` (liste `f44b5917…,953c1ca6…,d6a9e726…`, relue le 07/11),
     même commande `up -d --no-deps --force-recreate` — et SEULEMENT après l'interrupteur coupé (étape 4 inverse).
  4. **l'interrupteur** :
     `insert into public.coin_config (key, value) values ('cloud_offre_ouverte', 1) on conflict (key) do update set value = 1, updated_at = now();`
     (`npx supabase db query --linked --yes -f <fichier>` ; le déclencheur coin_config_trace garde l'avant/après).
     Vérifier : `cloud_vente_etat` d'un compte ordinaire = `vente_possible` true, `places` = min(places serveur, IP
     attribuables) — 6 le 07/11 (migration 20261107170000) ; l'offre visible dans
     un navigateur ISOLÉ (jamais la session de Nico). Retour : la même clé à 0 (l'offre disparaît ; les clients gardent
     leur option).
  5. grille trois jauges = 1 APRÈS l'OTA (§ 4), même jour ;
  6. (décision de Nico du 07/11 après-midi) LE JOUR MÊME de l'ouverture : solde IPRoyal rechargé, plafond 100 $, puis
     `cloud_ip_achats_auto` = 1 (§ 3) — rien n'est acheté d'avance : l'entretien horaire achète quand le stock passe sous
     le stock visé (stock_min 2 + inscrits en attente).
- **Limite** : `NAVIGATEURS_MAX=15` sur cloud-2 (places = 14 + Nico) ; au-delà, la vente répond « complet » et propose
  la liste d'attente (jamais un paiement sans place) ; l'alerte de capacité part à 65 % (10 comptes).
- **Compteur « N places restantes »** (07/11, web) : depuis la migration 20261107170000 (APPLIQUÉE 13:41, feu vert de
  Nico), il montre min(places serveur, IP attribuables) — le même chiffre que la vente et la liste d'attente (6 le 07/11).

Une étape à la fois, depuis le dossier PRINCIPAL `C:\Users\nicol\fill-and-sell` (jamais un worktree), sur `main` à jour
et propre (`git status` relu : dossier partagé). Chaque étape : le geste, la VÉRIFICATION, le RETOUR ARRIÈRE. La moindre
différence à une vérification arrête la passe : on revient en arrière sur l'étape, on ne passe pas à la suivante.
Heures de Paris. Rien de cette liste ne se fait sans le feu vert de Nico DU JOUR (« on ouvre »).
Remplace, pour l'ouverture, `docs/cloud/mise-en-ligne.md` (05/10 : prix 20 €, branche feat/cloud fusionnée depuis).

## État relu le 05/11 à 21:30 (à RELIRE le jour même : rien ici ne vaut sans relecture)
- Fonctions en prod (`npx supabase functions list`) : stripe-webhook v64 (verify_jwt false), apple-iap-webhook v42
  (false), google-play-webhook v35 (false), validate-apple-receipt v35 (true), validate-google-purchase v15 (true),
  create-checkout-session v64 (true), cancel-subscription v48 (true), email-tunnel v77 (false), get-pending-jobs v333
  (true), update-job-status v174 (false).
- `coin_config` : `grille_trois_jauges` 0, `cloud_ip_achats_auto` 0, `cloud_ip_budget_mensuel_usd` 60,
  `cloud_ip_renouvellement_auto` 1, `cloud_ip_stock_min` 2, `cloud_places_seuil` 2, `cloud_serveurs_auto` 0.
- Stripe (réel) : prix Cloud `price_1UYWNmQZRA77vrWJZIWshl1B` 24,99 €/mois, essai 7 j ; secret `STRIPE_PRICE_CLOUD`
  rebranché dessus ; ancien prix 20 € archivé ; webhook réel : `invoice.payment_failed` et
  `invoice.payment_action_required` DÉJÀ cochés (relu le 05/11) — rien à cocher ce jour-là.
- App : `CLOUD_OFFER_ENABLED = false` (`src/config/cloudOffer.js`) ; seul témoin = compte portant
  `profiles.beta_flags.cloud = true` (Nico ; le compte de démo des relecteurs quand il existe).
- OTA : canal `production` = 2.9.160 (relu le 04/11) ; prochaine = la première au-dessus du binaire 2.9 publié.
- cloud-2 (5.9.80.213, cloud-2.fillsell.app) : serveur Cloud déployé le 05/11 (61fb7dd), `COMPTES_AUTORISES` limité
  (Nico, + le compte de démo).

## 0. La veille (Nico)
- [ ] Apple : la version 2.9 et l'abonnement « FillSell Cloud » APPROUVÉS, sortie MANUELLE (« Publier manuellement
      cette version ») → statut « En attente de publication par le développeur ». « Paid Applications Schedule » signé.
      (06/11 : contrat accepté à 10:2x, actif jusqu'au 13/04/2027 ; abonnement Cloud SOUMIS SEUL à 10:37, « En attente
      de vérification » — `docs/enquetes/ouverture-cloud-0511/PRET-A-SOUMETTRE-0611.md`.)
- [ ] Google : la release 2.9 de production APPROUVÉE en « publication gérée » (Vue d'ensemble de la publication :
      « Modifications prêtes à être publiées »), déclaration IA faite.
- [x] Textes légaux (CGV art. 7 avec « Territoire : France », CGU 3.9, confidentialité 4.7/4.8 — `src/cloud/textesLegaux.js`)
      PUBLIÉS sur /legal le 06/11 (ordre de Nico : `CLOUD_TEXTES_LEGAUX = true`, l'offre reste fermée). Reste : accord de
      sous-traitance Hetzner conclu (`docs/cloud/confidentialite.md` § 4).
- [ ] Place : `select public.cloud_places_libres();` ≥ le nombre de clients attendus le premier jour (sinon commander
      le 2e serveur AVANT) ; pool d'IP : `select public.cloud_pool_etat();` (attribuables ≥ `cloud_ip_stock_min`).
- [ ] Banc Stripe en mode test vert (`node scripts/stripe-test/parcours-cloud-test.mjs`, rapport
      `build/parcours-cloud-test.json`) et suites : `npm run selftest:paiements-non-regression`,
      `selftest:option-cloud`, `selftest:paiement-echoue`, `selftest:cloud-voie`, `selftest:cloud-ecrans`,
      `selftest:cloud-orchestrateur`, `selftest:succes-achat`.

## 1. Les fonctions de paiement, en une passe (décision f : « déployées le jour de l'ouverture, en une fois »)
Ce qu'elles portent (code sur `main`, prouvé en mode test, NON déployé) : un « off » de boutique pendant l'essai
l'arrête ; un 2e canal n'écrase plus un Cloud vivant ; Stripe refuse un 2e abonnement pendant un essai boutique ; le mail
d'impayé ne dit plus « reste actif » à un Cloud ; la page de retour Stripe dit le produit acheté ; (point 7) la page de
paiement Stripe du Cloud expire avec la réservation de la place (30 min) ; ⚠ create-checkout-session porte AUSSI c3a4aff
(04/11 : Cloud 24,99 €, nom, conditions 2026-11-04).
- Geste : `node scripts/cloud/deployer-fonctions-cloud.mjs` (le PLAN : versions et verify_jwt lus en prod, rien
  déployé) → relire que chaque verify_jwt du plan = la liste ci-dessus → `node scripts/cloud/deployer-fonctions-cloud.mjs --go`
  (email-tunnel, stripe-webhook, apple-iap-webhook, google-play-webhook, validate-apple-receipt,
  validate-google-purchase, cancel-subscription, create-checkout-session, get-pending-jobs ; une par une, relue après,
  arrêt au premier écart).
- Vérification : chaque version +1, verify_jwt inchangé ; 15 min de journaux sans erreur
  (`[webhook]`, `[checkout]`, `validate-*`) ; Stripe : `GET /v1/events?limit=20` — chaque événement livré rendu 200
  (`pending_webhooks` 0) ; un renouvellement Premium/Pro/Business du jour relu en base (palier inchangé).
- Retour arrière : redéployer la version d'avant de CHAQUE fonction touchée depuis le dépôt à l'état `914b1e5`
  (fichiers de la fonction + `_shared`), avec le MÊME verify_jwt ; puis relire versions et journaux.

## 2. Le serveur Cloud ouvert à tous
- Geste : sur cloud-2, `/srv/fillsell-cloud/.env` : `COMPTES_AUTORISES=` (vide = tous) ; `ALERTES_MAIL=1` ;
  `bash serveur-cloud/outils/deployer.sh 5.9.80.213 cloud-2.fillsell.app` quand aucune tâche n'est « processing »
  (la vidange attend jusqu'à 10 min de toute façon).
- Vérification : `https://cloud-2.fillsell.app/sante` ; le compte de Nico : 4 plateformes et FillSell connectés, file qui
  avance ; `select public.cloud_places_libres();` cohérent.
- Retour arrière : remettre `COMPTES_AUTORISES` d'avant, redéployer.

## 3. L'achat automatique des IP (décision d : plafond 100 $/mois, alerte à 80 %, arrêt net au plafond)
- Geste : `update public.coin_config set value = 100, updated_at = now() where key = 'cloud_ip_budget_mensuel_usd';`
  puis `update public.coin_config set value = 1, updated_at = now() where key = 'cloud_ip_achats_auto';`
  (`npx supabase db query --linked -f <fichier>` ; le déclencheur coin_config_trace garde l'avant/après).
- Vérification : relire les deux clés ; à l'entretien horaire suivant, le journal de l'orchestrateur (`entretien`) montre
  le plan d'achat sous la triple garde ; l'alerte « 80 % » ne part qu'au seuil (une fois par mois).
- Retour arrière : `cloud_ip_achats_auto` = 0 (le plafond peut rester à 100).
- (07/11) AVANT : recharger le solde IPRoyal (21,15 $ relus le 07/11 = 5 IP à 4 $). Depuis la migration 20261107170000,
  les places affichées et vendues = min(places serveur, IP attribuables) : sans IP, « Complet » et liste d'attente ; les
  inscrits comptent dans le stock visé, l'entretien horaire achète pour eux (une IP livrée puis contrôlée = une place).
  Coût IPRoyal (07/11) : 4 $/IP/30 j à l'unité ; 7 IP 21 $, 14 IP 41,16 $, 30 IP 88,20 $ par commande groupée.
- (07/11) Avant l'OTA ou le binaire qui porte la restauration du Cloud : `npx supabase functions deploy
  validate-apple-receipt` (version et verify_jwt true lus avant/après ; v39 le 07/11).

## 4. La grille à trois jauges — ⛔ À FAIRE APRÈS L'ÉTAPE 7, PAS ICI (ordre de Nico du 06/11 : « elles s'allument avec
##    le binaire, pas avant »)
- L'interrupteur est lu par le serveur (quotas_etat) ET par l'écran (web, OTA, binaire) : levé avant la sortie des
  binaires et de l'OTA, les règles de quotas changeraient sous un écran qui montre encore l'ancienne grille (l'OTA
  2.9.160 servie aujourd'hui ne porte pas la grille). On le lève donc juste APRÈS l'étape 7 (OTA servie), le même jour.
- Geste : `update public.coin_config set value = 1, updated_at = now() where key = 'grille_trois_jauges';`
- Vérification : `quotas_etat` lu sous le compte de Nico (publications, annonces, Lens) ; l'écran des formules montre les
  trois jauges (web, puis app après l'OTA).
- Retour arrière : la même clé à 0.

## 5. Le drapeau de l'offre (web au push)
- Geste : `src/config/cloudOffer.js` : `CLOUD_OFFER_ENABLED = true` (les textes légaux sont déjà publiés depuis le
  06/11 : `CLOUD_TEXTES_LEGAUX = true`, le selftest cloud-textes-legaux exige aujourd'hui l'offre FERMÉE — l'adapter) ; `scripts/cloud-ecrans-selftest.mjs` : retirer les DEUX lignes du
  fil-piège « le drapeau Cloud est BAISSÉ », elles seules ; `npm run selftest:cloud-ecrans`,
  `selftest:cloud-textes-legaux`, `npm run build:essai` ; commit, UN push (Vercel).
- Vérification : `curl https://fillsell.app/build.json` = le commit du push ; `/legal` montre CGV art. 7, CGU 3.9,
  confidentialité 4.7/4.8 ; un compte ordinaire (navigateur ISOLÉ) voit l'interrupteur « Sans ordinateur » et le prix
  24,99 €/mois avec l'essai de 7 jours.
- Retour arrière : `CLOUD_OFFER_ENABLED = false`, un push (plus personne ne voit l'offre ; les clients gardent l'option).

## 6. La sortie des binaires 2.9 (Nico)
- Geste : Apple — App Store Connect › FillSell › 2.9 › « Publier cette version » ; Google — Play Console › Vue
  d'ensemble de la publication › « Publier les modifications ».
- Vérification : la fiche App Store et la fiche Play montrent 2.9 (jusqu'à 24 h pour tous les pays) ; l'abonnement
  « FillSell Cloud » s'achète depuis l'app (essai 7 j) ; `validate-apple-receipt` / `validate-google-purchase` : achats
  relus en base (`cloud_canal`, `cloud_essai_debut`).
- Retour arrière : pas de retrait d'une version publiée ; le drapeau (étape 5) et l'OTA d'avant (étape 7) cachent l'offre.

## 7. L'OTA (après la sortie des binaires)
- Geste : `docs/agents/pieges.md` § Déploiement, pas à pas : lire le canal (`npx @capgo/cli channel list`), numéro = le
  premier au-dessus du binaire 2.9 publié ET de 2.9.160, `npm run build` (arbre propre), `npx @capgo/cli bundle upload
  --channel production --bundle <version> --path dist`, relire le canal.
- Vérification : le canal sert le nouveau numéro ; sur le téléphone de Nico (binaire 2.9), après un passage en fond :
  `build.json` de l'app = le commit ; l'offre Cloud visible ; les trois jauges.
- Retour arrière : remettre le bundle précédent sur le canal `production` (Capgo), relire.

## 8. Les deux premières heures
- `veille_cpu` toutes les 10 min ; journaux des fonctions de paiement ; `select count(*) from profiles where is_cloud`
  et les postes créés (`cloud_postes`) : chaque nouveau client a son poste en moins de 3 min (sinon l'écran dit « plus
  long que prévu, l'équipe est prévenue » et l'alerte « Capacité atteinte » / « SANS IP » part) ; places libres ≥ seuil.
- Le lendemain : ops-digest, coupures du relais (`etat/coupures-relais.jsonl`), dépenses IP du mois.
