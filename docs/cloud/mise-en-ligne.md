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
