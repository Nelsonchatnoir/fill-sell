# FillSell Cloud — REPRISE (à lire EN ENTIER avant toute action)

Mis à jour le **05/10/2026, 13:40** (terminal Cloud). Remplace, pour la
suite, le REPRISE du prototype (`C:\Users\nicol\fillsell-cloud-proto\REPRISE.md`,
qui garde l'histoire du 26/09 et ses mesures).

## 0. En une phrase

L'option **« Sans ordinateur »** (FillSell Cloud, 20 € TTC/mois, essai 7 jours
avec carte, ouverte au Free) fait tourner NOTRE extension dans un navigateur
**steel-browser** hébergé chez **Hetzner**, un par compte, qui sort par une **IP
française dédiée** (IPRoyal). Tout le code est sur la branche **`feat/cloud`**
(poussée). **Rien n'est en prod** : drapeau `cloudOffer` à `false`, aucune
migration appliquée, aucune fonction déployée, aucun serveur créé, aucune IP
achetée (05/10 13:40 : les trois jetons sont posés, le PLAN est vert, le `--go`
attend que Nico le lance lui-même, § 4.2). Nico est le SEUL témoin (écran B du test, dans l'app).

## 1. Où est tout

- Branche **`feat/cloud`** (worktree **`C:\Users\nicol\fill-and-sell-feat-cloud`**,
  créé le 05/10 à 13:20 parce que `fill-and-sell-cloud` porte `fusion/cloud-main`) —
  poussée, canonique, partie d'`origin/main` 5d6a0e9. Ce worktree n'a PAS de
  `npm ci` (PC à court de mémoire) : son `node_modules` ne contient que `terser`,
  `jszip` et leurs 19 dépendances, copiés de `fill-and-sell-cloud` — de quoi
  lancer `lancer-serveur-test.mjs` (build de l'extension Cloud compris), pas les
  selftests ni `npm run build`.
- Branche LOCALE **`fusion/cloud-main`** (worktree `C:\Users\nicol\fill-and-sell-cloud`, NON poussée, ⛔ on n'y touche pas : elle
  porte les commits non poussés du terminal Problèmes) = `main` local du 05/10
  (47700b1) + `feat/cloud`, conflits résolus, **179/179 selftests verts**.
  Elle se refait en une commande (§ 4.1) : c'est un brouillon de la fusion.
- `docs/cloud/` : `pool-ip.md`, `paiements-option-cloud.md`, `test-complet.md`,
  `mise-en-ligne.md`, `fiche-boutiques.md`, `confidentialite.md` (FINALE),
  **`nico-telephone.md`** (gestes de Nico, coûts), ce fichier.
- Base : `supabase/migrations/20261004233000_option_cloud_paiements.sql` puis
  `20261005120000_cloud_socle_ip_dediee.sql` (NON appliquées ; inverse en tête).
- Serveur : `serveur-cloud/` — **commande unique** `outils/lancer-serveur-test.mjs`.
- Extension Cloud : `scripts/cloud/build-extension-cloud.mjs` (11 patchs à ancre
  unique sur `chrome-extension/` commité, jamais modifié).
- App : `src/cloud/` (achat, « Me connecter », écrans, **textes légaux**),
  `src/config/cloudOffer.js` (drapeau, témoins = Nico, `CLOUD_TEXTES_LEGAUX`).
- Secrets (hors dépôt) : `C:\Users\nicol\fillsell-cloud-proto\secrets.env` —
  les trois jetons **posés et vérifiés en lecture le 05/10** : `HCLOUD_TOKEN`
  (projet fillsell-cloud, 0 serveur) ; `IPROYAL_API_TOKEN` (compte du prototype,
  solde 20,00 $, ISP Dedicated › 30 Days › France à **4,00 $**, achat minimum 1) ;
  `CLOUDFLARE_API_TOKEN` (valide, zone fillsell.app accessible, « DNS : Modifier »
  sur cette zone seule, **expire le 12/10**). État du test (sans secret) :
  `cloud-test-etat.json` à côté (absent tant que `--go` n'a pas tourné).

## 2. Décisions de Nico (05/10)

1. IP dédiée par compte ; **repos de l'IP : 7 jours** (validé).
2. 20 € TTC partout.
3. Délai entre deux sessions : réglage `coin_config.cloud_delai_sessions_min`,
   absent = en continu. Non figé.
4. **Rappels de fin d'essai Stripe : coupés** (Nico, dans le tableau de bord, le
   05/10 au soir). Notre mail de la veille reste tel quel derrière sa garde et
   part à la mise en ligne.
5. **Écran du test : B, dans l'app** — Nico dans `CLOUD_TEMOINS` ET
   `CLOUD_OFFRE_TEMOINS`, lui seul ; aucun autre compte ne voit rien.
6. Apple, Google, Stripe (tableau de bord) : Nico, avec `fiche-boutiques.md`.
   ⛔ Dans Stripe, NE PAS cocher `invoice.payment_failed` /
   `invoice.payment_action_required` (Claude les ajoute par l'API à la mise en
   ligne, étape 4 bis).

## 3. Les tests (05/10, tout vert)

```
npm run selftest:palier              83
npm run selftest:cloud-pool          104
npm run selftest:cloud-ecrans        171
npm run selftest:cloud-achat         30 (témoins = Nico seul, tout autre id refusé)
npm run selftest:cloud-textes-legaux 39 (nouveau : faits relus dans le code, /legal baissé puis levé)
npm run selftest:cloud-orchestrateur 20 (dont « socle absent »)
npm run selftest:option-cloud · cloud-rappel-veille · cloud-extension 19
node scripts/cloud/banc-sql-socle.mjs 80
# AVANT toute OTA — la preuve qu'un compte ordinaire voit l'app servie à l'identique :
node scripts/cloud/preuve-identite-compte-ordinaire.mjs --version <n° lu sur le canal Capgo>
```
Batterie complète sur `fusion/cloud-main` : **179/179 selftests verts** (05/10).
Preuve d'identité contre `main` (la base de la fusion) : **708 scènes identiques
octet pour octet** (Free/Premium/Pro/Business/sans compte, fr/en, téléphone/
ordinateur ; feuille des formules, mur de l'extension, carte d'installation,
étape d'entrée, page /extension, Réglages › Abonnement, /legal), palier
identique, aucune requête Cloud, contrôle négatif vert (pour Nico, ça diffère).
Contre la version SERVIE (OTA 2.9.53, 4859311) : **ÉCHEC attendu** — 8 fichiers
de l'app du lot Problèmes pas encore servis partiraient avec l'OTA (§ 4.1).
⚠️ `npm run build:essai` NON relancé le 05/10 (lourd ; le terminal Problèmes
tournait, 1,3 Go libres) : à faire avant l'OTA.

## 4. Ce qui reste (dans l'ordre)

### 4.1 L'écran B sur l'iPhone de Nico — BLOQUÉ par le lot Problèmes

Le dossier principal porte le lot du terminal Problèmes, **non poussé et non
servi** (26 commits au 05/10 12:45, dont des écrans de l'app : colis Vinted au
lot, carte « Prêt » sans rayon…). Une OTA depuis `main` maintenant les enverrait
à tout le monde. Ordre :
1. le terminal Problèmes clôt son lot (push + SA propre OTA, ou décision de Nico
   de les envoyer ensemble) ;
2. **la base** (dire à Nico AVANT, GO) : l'écran B LIT les colonnes et fonctions
   Cloud — sans `20261004233000` (colonnes + `cloud_etat_moi`) et
   `20261005120000` (`cloud_essai_preparer_moi`, `cloud_coffre_etat_moi`), la
   lecture échoue et l'écran ne montre RIEN, même à Nico. Effet sur les autres
   comptes, relu : colonnes nulles ajoutées à `profiles` (droits par colonne :
   personne ne peut les écrire), un déclencheur qui ne s'éveille que sur les
   colonnes Cloud, l'index `email_logs_one_shot_unique` refait avec un type de
   plus (même liste + `cloud_essai_veille`), 10 tables `cloud_*` fermées,
   aucun cron. Sans le sel `cloud_empreinte_sel` au vault, la préparation
   d'essai refuse (rien ne s'ouvre) ;
3. dans le dossier PRINCIPAL : `git merge --no-ff origin/feat/cloud` (conflits :
   `src/utils/palier.js` = le ré-export de main + la section Cloud de
   feat/cloud, qui importe aAuMoins / palierDuProfil / droitsDuPalier de
   `_shared/palier.js` ; `package.json` = les deux listes ; `get-pending-jobs`
   s'auto-fusionne : main + les 3 blocs `poste_cloud`, vérifier
   `git diff main -- supabase/functions/get-pending-jobs/index.ts`) ;
4. 179+ selftests, `npm run build:essai`, puis
   `preuve-identite-compte-ordinaire.mjs --version <canal>` → **IDENTIQUE** ;
5. version montée (package.json + lock), commit, UN push, `npm run build`,
   `npx @capgo/cli bundle upload --channel production --bundle <v> --path dist`,
   relecture du canal. Rien d'autre : ni fonction, ni drapeau.

### 4.2 Le serveur — GO de Nico donné (05/10), `--go` à lancer PAR NICO

`node serveur-cloud/outils/lancer-serveur-test.mjs` (PLAN, lecture seule) :
**VERT le 05/10 à 13:35**, aucun blocage — cx43 fsn1 15,99 € HT = 19,19 € TTC/mois
(0,0307 € TTC/h) + IPv4 0,60 € TTC/mois ; IP ISP Dedicated France 30 j **4,00 $**
(sous le plafond de 8 $), sans renouvellement automatique ; DNS
`cloud.fillsell.app` sans enregistrement, posé par le jeton Cloudflare.

- Correctif 1e78cfb : le PLAN refusait parce qu'IPRoyal liste des « questions »
  (exigences en texte libre, accès multi-appareils, IP neuves au renouvellement).
  Ce sont des OPTIONS : la commande du prototype #83578416 est partie sans réponse
  (`questions_answers: []`). Laissées vides ; seule une question marquée
  obligatoire arrête l'achat.
- ⛔ **Le `--go` a été REFUSÉ à Claude par le classifieur** (transaction réelle :
  serveur + achat d'IP), malgré le GO écrit de Nico. **Rien n'a été créé ni
  acheté : coût engagé 0.** Nico le lance lui-même, dans Git Bash (20 à 40 min ;
  reprise sans rien racheter si on relance la même commande) :
  ```
  cd /c/Users/nicol/fill-and-sell-feat-cloud && node serveur-cloud/outils/lancer-serveur-test.mjs --go
  ```
  Puis Claude relit `cloud-test-etat.json` (serveur, commande, IP, mesure) et les
  contrôles. Si IPRoyal refuse l'achat pour l'identité non vérifiée, la commande
  s'arrête sur « commande IPRoyal refusée (HTTP …) », serveur créé, rien acheté.
- IP du prototype : la commande #83578416 (ISP Dedicated, France) court jusqu'au
  **26/10** (renouvellement coupé par Nico). Le `--go` en achète une NEUVE ;
  la reprendre (`--commande=83578416`, 0 $) serait une décision de Nico.
- Hetzner : accord de traitement des données accepté par Nico (05/10).

Ensuite : mesure de RAM → `NAVIGATEURS_MAX`. Avant le socle en base,
l'orchestrateur dit `socle_absent` une fois et ne réessaie que toutes les 10 min
(2 appels refusés par 10 min ; CPU de la base relevé avant : 6,5 %, max 26 % sur
l'heure).

### 4.3 Le test complet (`test-complet.md`) — sur le GO de Nico

Prérequis : le terminal Problèmes a FINI sur le compte de Nico (deux exécutants
sur le même compte = test illisible) — le vérifier : son transcript n'écrit
plus, son lot est poussé, et `cross_post_jobs` du compte de Nico n'a plus de
`pending`/`processing` venant de son extension ; puis l'extension de bureau de
Nico en pause. Session **0ba8903a** posée au coffre, révoquée juste après.

### 4.4 La mise en ligne (`mise-en-ligne.md`) — sur GO, en une passe

Dont l'étape **4 bis** (les deux événements Stripe, par l'API, juste après la
nouvelle `stripe-webhook`) : ⚠️ la `stripe-webhook` en prod (v56) traite DÉJÀ
ces événements depuis le 07/08 (mail au client, alerte) sans les avoir jamais
reçus — les cocher allume ce mail pour TOUTES les formules : confirmation de
Nico avant. Les textes légaux partent avec le drapeau (`CLOUD_TEXTES_LEGAUX`).

**05/10, 13:40 — les textes montrés à Nico, EN ATTENTE DE SA VALIDATION** (rien
n'est coché). Relus dans le code DÉPLOYÉ (`functions download` : stripe-webhook
v56 → `_shared/payment-notify.ts` → email-tunnel v69, `mailPaiementEchoue` de
`_shared/emails-fillsell.ts`), rendus par Deno (16 variantes) :
- un seul mail client pour Premium, Pro, Business (et Cloud : `feat/cloud` ne
  change que le nom du plan dans l'alerte à Nico) ; objet « Ton paiement n'a pas
  abouti » / « Your payment didn't go through » ; il varie par cause (3ds,
  carte refusée, carte expirée, autre), contexte (souscription / renouvellement)
  et langue ; aucun montant ; une facture = un mail au plus (dédup
  `payment_failed:<facture>`) ; facture de montée de palier : ni mail ni alerte ;
- à trancher par Nico avant de cocher : le pied du mail ANGLAIS reste en
  français (« Une question ? Écris-nous… », « Mentions légales · Confidentialité ») ;
  une fin d'essai Cloud ratée arrive en `subscription_cycle`, donc rédigée
  « renouvellement » (« Ton abonnement reste actif pour l'instant, le paiement
  sera retenté automatiquement… ») ; un 3D Secure en renouvellement dit aussi
  « retenté automatiquement » alors que seule la validation du client le débloque.

## 5. Garde-fous

- `cloudOffer` à `false` ; témoins = Nico SEUL (`NICO_USER_ID`) ; tout autre
  identifiant refusé (selftest).
- Jamais changer un `verify_jwt` (le script de déploiement le vérifie).
- Aucun achat IPRoyal hors de `lancer-serveur-test.mjs --go` (1 IP, plafond 8 $,
  sans renouvellement) ; orchestrateur `IPROYAL_ACHATS_AUTORISES=0`,
  `ALERTES_MAIL=0`, `COMPTES_AUTORISES` = Nico.
- Pause des démarrages au-dessus de 50 % de CPU de la base.
- Trois verrous contre la fuite de l'IP du serveur.
- Annonces de test à 999 € ou plus, retirées à la fin.
- PC de Nico : rien de lourd pendant qu'un autre terminal travaille.

## 6. Points d'attention connus

- `get-pending-jobs` : prod **v216 = `main` local du 05/10** (relu par
  `functions download`). Au merge, ne garder de `feat/cloud` que les blocs
  `poste_cloud`.
- **Google Play, relu le 05/10 (lecture seule)** : `app.fillsell.cloud.sub` ›
  `cloud-monthly` actif (175 pays) › offre `cloud-trial-3d` **active, 175/175
  pays, « Essai gratuit — 7 jours », éligibilité « Acquisition de nouveaux
  clients › N'ont jamais eu cet abonnement »**. Conforme.
- **Stripe, relu le 05/10** : endpoint `we_1TNHq1QZRA77vrWJHXw51Svb`, 4 événements.
- **IPRoyal** = IPRoyal Services FZE LLC (Émirats arabes unis) : transfert hors
  UE (clauses contractuelles types, dites dans la confidentialité 4.8).
- Android : le greffon d'achat choisit la 1re offre du forfait.
- Apple : 1er abonnement du groupe soumis AVEC une version de l'app ; compte de
  démonstration du relecteur dans `CLOUD_OFFRE_TEMOINS` le moment venu.
- L'identifiant d'appareil est local : un verrou faible seul, fort avec les trois autres.
- Beebs : non promis (DataDome le 26/09).
- L'extension Cloud se construit depuis `chrome-extension/` du commit déployé
  (0.6.97 du lot Problèmes, encore en essais réels le 05/10).
