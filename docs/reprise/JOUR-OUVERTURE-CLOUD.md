# Jour d'ouverture de FillSell Cloud — la liste, dans l'ordre (décision j de Nico, 05/11/2026)

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
