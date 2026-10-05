# FillSell Cloud — la MISE EN LIGNE, en une passe

**Seulement sur le feu vert de Nico, APRÈS le test complet** (`docs/cloud/test-complet.md`).
Depuis le dossier PRINCIPAL (`C:\Users\nicol\fill-and-sell`), jamais un worktree.
Un seul push sur main, une seule OTA. Chaque étape a sa relecture ; la moindre
différence arrête la passe (retour arrière en fin de page).

## 0. Avant (Nico)

- [ ] Saisies Apple / Google / Stripe faites (`docs/cloud/fiche-boutiques.md`).
- [ ] Textes de confidentialité et CGV validés (`docs/cloud/confidentialite.md`).
- [ ] DNS `cloud.fillsell.app` → IP du serveur (nuage gris).
- [ ] Pool : au moins 5 IP achetées et contrôlées (`outils/ip.mjs pool`).
- [ ] Décision sur le délai entre deux sessions (sinon : en continu).

## 1. Le code sur main

```bash
git checkout main && git pull --ff-only
git merge --no-ff origin/feat/cloud          # conflits : get-pending-jobs, App.jsx — garder les DEUX côtés
npm run selftest:palier && npm run selftest:cloud-pool && npm run selftest:cloud-ecrans \
  && npm run selftest:option-cloud && npm run selftest:cloud-extension && npm run selftest:cloud-achat \
  && npm run selftest:cloud-orchestrateur && npm run selftest:cloud-rappel-veille
node scripts/cloud/banc-sql-socle.mjs
npm run build:essai
```

## 2. La base (si le test ne l'a pas déjà fait)

```bash
npx supabase db query --linked -f supabase/migrations/20261004233000_option_cloud_paiements.sql
npx supabase migration repair --linked --status applied 20261004233000
#   select vault.create_secret('<64 car.>', 'cloud_empreinte_sel', 'sel des empreintes Cloud (HMAC)');
npx supabase db query --linked -f supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql
npx supabase migration repair --linked --status applied 20261005120000
```
Relecture : `select count(*) from pg_proc where proname like 'cloud\_%';` ; `select public.cloud_pool_etat();`

## 3. Le secret Stripe

```bash
npx supabase secrets set STRIPE_PRICE_CLOUD=price_1UMuLDQZRA77vrWJZfZh2IS4
npx supabase secrets list | grep STRIPE_PRICE_CLOUD
```

## 4. Les fonctions (verify_jwt JAMAIS changé)

```bash
node scripts/cloud/deployer-fonctions-cloud.mjs          # le plan : versions et verify_jwt lus en prod
node scripts/cloud/deployer-fonctions-cloud.mjs --go     # une par une, relue après, arrêt au premier écart
```
Les 7 fonctions des paiements (stripe-webhook, apple-iap-webhook,
google-play-webhook, validate-apple-receipt, validate-google-purchase,
cancel-subscription, create-checkout-session) + get-pending-jobs (poste_cloud)
+ email-tunnel (le mail de la veille, inchangé, derrière sa garde).

## 4 bis. Les deux événements du webhook Stripe (Claude, par l'API — JUSTE APRÈS l'étape 4)

Relu le 05/10 (`GET /v1/webhook_endpoints`) : l'endpoint
`we_1TNHq1QZRA77vrWJHXw51Svb` (→ `…/functions/v1/stripe-webhook`) ne reçoit que
`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
`customer.subscription.deleted`. Il manque `invoice.payment_failed` et
`invoice.payment_action_required` (échec de prélèvement à la fin de l'essai,
3D Secure attendu) : sans eux, un essai dont la carte est refusée ne se voit pas.

⛔ **Jamais avant le déploiement de la nouvelle `stripe-webhook`** (décision de
Nico du 05/10 — Nico ne les coche PAS dans le tableau de bord).
⚠️ À savoir AVANT de les ajouter (relu le 05/10) : la `stripe-webhook` en prod
(v56 = `main`) traite DÉJÀ ces deux événements depuis le 07/08 (« échec de
paiement notifié », commit 2fc6662 : mail au CLIENT selon la cause via
`email-tunnel` mode `payment_failed`, alerte à Nico, dédup par facture). Ils
n'ont jamais été cochés, donc ce chemin n'a jamais tourné. Les ajouter l'ALLUME
pour TOUTES les formules (Premium, Pro, Business), pas seulement le Cloud :
le premier client dont la carte échoue recevra ce mail. → Nico le confirme
explicitement avant ce geste.

1. Relire l'endpoint (lecture) : `GET /v1/webhook_endpoints/we_1TNHq1QZRA77vrWJHXw51Svb`
   — les 4 événements ci-dessus, `status: enabled`.
2. Relire que la fonction déployée est la NOUVELLE (`functions list` : version
   montée à l'étape 4, `verify_jwt: false` inchangé).
3. Mettre la liste COMPLÈTE (Stripe remplace la liste entière, on ne « coche » pas
   un par un) : `POST /v1/webhook_endpoints/we_1TNHq1QZRA77vrWJHXw51Svb` avec
   `enabled_events` = `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`, `invoice.payment_action_required` (connecteur Stripe
   `stripe_api_write`, compte `acct_1TIT5gQZRA77vrWJ`, mode réel).
4. Relire l'endpoint : les 6 événements, `status: enabled`. Puis, dans l'heure
   et le lendemain : `GET /v1/events?type=invoice.payment_failed` et les
   journaux de `stripe-webhook` (`[webhook] échec de paiement reçu`) — chaque
   événement livré doit avoir rendu 200 (`pending_webhooks` à 0). Une livraison
   en erreur répétée = retirer les deux événements (même appel, liste des 4) et
   prévenir Nico : Stripe désactive un endpoint qui échoue plusieurs jours.

Retour arrière : le même `POST` avec la liste des 4 d'origine.

## 5. Le serveur

`/srv/fillsell-cloud/.env` : `COMPTES_AUTORISES=` (vide = tous), `ALERTES_MAIL=1`,
`DOMAINE=cloud.fillsell.app` ; `bash serveur-cloud/outils/deployer.sh <ip> cloud.fillsell.app`.
Relecture : `https://cloud.fillsell.app/sante`.

## 6. Le drapeau

- `src/config/cloudOffer.js` : `CLOUD_OFFER_ENABLED = true` ; `CLOUD_TEMOINS` vide.
- `scripts/cloud-ecrans-selftest.mjs` : retirer les DEUX lignes du fil-piège
  (« le drapeau Cloud est BAISSÉ ») — et elles seules.
- Les textes validés (confidentialité, CGV) dans `src/pages/Legal.jsx`.
- Commit, **UN push** (Vercel), puis l'OTA depuis le dossier principal
  (`npm run build`, `npx @capgo/cli bundle upload …`), relecture de `build.json`.

## 7. Après

- Un achat réel de Nico sur le web (essai : rien n'est prélevé) → colonnes
  Cloud posées, IP attribuée, « Me connecter » ouvert ; puis arrêt de l'essai
  → repos, purge prouvée.
- `veille_cpu` toutes les 10 min pendant 2 h ; ops-digest du lendemain.

## Retour arrière

1. Drapeau : `CLOUD_OFFER_ENABLED = false`, un push, une OTA (plus personne ne
   voit l'offre ; les clients en cours gardent leur option).
2. Fonctions : redéployer la version précédente de main (`git revert` du merge,
   `deployer-fonctions-cloud.mjs --go`).
3. Base : l'INVERSE en tête de chaque migration — seulement si aucun client
   n'a encore payé (sinon on garde les colonnes).
