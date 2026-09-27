> **Jumeau de `CLAUDE.md`** (lu par Claude Code). Ce fichier-ci est lu par Codex :
> il reprend TOUTES les règles de `CLAUDE.md` et ajoute l'architecture, l'état des
> chantiers et le glossaire. Une règle ajoutée à l'un se reporte dans l'autre, le
> même jour. Complètent celui-ci : `supabase/AGENTS.md`, `src/AGENTS.md`, et
> les références `docs/agents/*.md` (§ 8 : quoi lire avant quelle tâche).

# FillSell — passation pour agent de code

Tout ce qu'il faut pour travailler sur FillSell **sans casser la production** et
sans l'historique des conversations. Rédigé le 27/09/2026. Les sections 7
(état) et les chiffres se périment : **la base de prod et `git log` font foi,
jamais ce fichier**. Heures : toujours Europe/Paris.

Langue du projet : français partout (code, commentaires, commits, messages
utilisateur). Nico = le fondateur, seul décideur.

---

## 0. Les dix interdits (à lire même si tu ne lis rien d'autre)

1. **Jamais `supabase db push`**, ni `db reset`, ni `db remote commit` (§ 3.4).
2. **Jamais de migration de données, de trigger ou d'index sans GO nommé de
   Nico**, et jamais sans avoir montré le rejeu annulé (§ 3.4).
3. **Un seul push sur `main` par lot** : chaque push redéploie Vercel et
   renomme tous les chunks (§ 3.5).
4. **Jamais redéployer une fonction edge sans relire `verify_jwt` avant et
   après** (§ 3.4).
5. **Jamais envoyer un mail sans l'ordre explicite de Nico**, et jamais par une
   fonction edge : une seule porte SQL (§ 5).
6. **Jamais retirer une annonce vivante** sans geste explicite de l'utilisateur
   ou vente prouvée ; jamais « vendue » / « disparue » sur une seule lecture (§ 4).
7. **Jamais deviner** une catégorie, une taille, un rattachement : preuve
   certaine ou question à l'utilisateur (§ 4).
8. **Jamais réparer à la main** ce que l'app doit faire seule : corriger la
   cause (§ 4).
9. **Jamais de secret dans un fichier, un commit, un rapport** (§ 2.6).
10. **Jamais se connecter à fillsell.app (ni à une plateforme) dans un
    navigateur automatisé** qui partage le profil de Nico : ça tue sa session
    et celle de son extension (`docs/agents/pieges.md`, « Navigateur et sessions »).

---

## 1. Le produit en une page

FillSell aide les **vendeurs français d'occasion** à vendre sur plusieurs
plateformes à la fois. Trois pièces :

- **L'app** (`src/`, React 19 + Vite) : web sur `fillsell.app` (Vercel) et
  mobile iOS / Android via **Capacitor** (`app.fillsell.app`), mise à jour à
  chaud par **OTA Capgo**.
- **L'extension Chrome** (`chrome-extension/`, Manifest V3) : c'est ELLE qui
  exécute les dépôts, retraits, republications et relevés, dans une fenêtre
  de travail minimisée et invisible, avec la session de l'utilisateur sur
  chaque plateforme. Elle interroge le serveur (`get-pending-jobs`) et rend
  ses verdicts (`update-job-status`). Publiée sur le Chrome Web Store (CWS).
- **Le serveur** (`supabase/`) : Postgres (RLS, triggers, RPC), ~50 fonctions
  edge Deno, pg_cron + pg_net.

Plateformes : **Vinted**, **Leboncoin** (comptes particulier ET pro, routes
différentes), **eBay** (voie extension ET voie API officielle : un compte
relié par OAuth publie par l'API), **Beebs**, **Opla**.

Fonctions : **Lens** (identification par photo, prix) ; **génération
d'annonce** par IA et dictée (`voice-*`) ; **publication croisée** (une fiche
de `inventaire` → un job par plateforme dans `cross_post_jobs`) ;
**republication** (retrait + redépôt, Opla : modification en place), manuelle
ou auto par créneaux ; **retrait des copies après vente** ; **relevés**
(import des annonces déjà en ligne, rattachées sur preuve) ; comptabilité,
stats, import/export Excel.

**Paliers** (prix mensuels) : Gratuit, **Premium 12,99 €**, **Pro 29,99 €**,
**Business 59,99 €**. Depuis le 02/09 : **quotas par palier** (annonces,
republications, retouches photo). Les valeurs font foi dans la table
`coin_config` (repli : `COIN_CONFIG_FALLBACK` dans
`src/components/ConversionModal.jsx` — ex. annonces/mois 5 / 40 / 120 / 300).
⛔ Vocabulaire : on dit **quotas**, JAMAIS « pépites » (l'ancienne monnaie ;
les tables `coin_*` survivent, masquées, et ne prouvent aucun droit).
Paiement : Stripe (web), Apple IAP, Google Play.

**FillSell Cloud** (en cours, prototype local hors dépôt) : faire tourner
l'extension dans un navigateur cloud (Steel) sortant par une IP française
(IPRoyal), pour les vendeurs sans ordinateur (§ 7).

---

## 2. Architecture

### 2.1 Un seul dossier de travail

- Le SEUL dossier de travail est `C:\Users\nicol\fill-and-sell\`. L'ancien
  worktree `C:\Users\nicol\fill-and-sell-chrome-extension\` a été **supprimé**
  le 26/07/2026 (zip CWS parti sans un correctif, deux extensions actives se
  disputant les jobs). Toute référence à ce chemin est périmée : ne jamais y
  renvoyer, ne jamais le recréer.
- L'extension non empaquetée se charge dans Chrome depuis
  `C:\Users\nicol\fill-and-sell\build\extension\` (produit par
  `npm run build:extension`). Aucun autre chemin.
- **UNE SEULE extension FillSell active dans Chrome à la fois** (jamais la
  version Web Store ET une non empaquetée : elles pollent les mêmes jobs et
  `handler_build` ment sur qui a traité quoi).
- Le prototype cloud vit hors dépôt (`C:\Users\nicol\fillsell-cloud-proto\`) :
  ce n'est pas un dossier de travail du dépôt.

### 2.2 Carte du dépôt (détail : `docs/agents/architecture.md`)

- `src/` app React (monolithe `src/App.jsx`, onglets `tabs/`, stepper
  `publication/`, relevés et doublons `annonces/`, calculs `utils/comptabilite.js`)
  — règles : `src/AGENTS.md`.
- `chrome-extension/` SOURCE de l'extension MV3 (`background.js` = service
  worker et handlers, `content-scripts/` par plateforme) — règles :
  `docs/agents/extension.md`.
- `supabase/functions/` ~48 fonctions edge + `_shared/` (modules souvent
  importés AUSSI par `src/`) ; `supabase/migrations/` ; `supabase/config.toml`
  — règles : `supabase/AGENTS.md`.
- `scripts/` build de l'extension, empreinte (`build-id.mjs`), générateurs
  `gen-*`, ~100 selftests ; `android/`, `ios/` natifs Capacitor ; `docs/`
  conceptions et audits ; `build/` et `dist/` gitignorés.

Flux d'un dépôt : l'app crée les jobs par RPC (`spend_coins_and_publish` :
quotas, gardes, tout-ou-rien) → l'extension les prend (`get-pending-jobs`) →
exécute dans sa fenêtre de travail invisible → rend le verdict
(`update-job-status`) → `handler-watch` (cron */3) relance ou classe ce qui
fige. eBay relié par l'API : `ebay-api-worker` (cron */2), sans extension.
Tables clés : `cross_post_jobs` (⛔ pas de `updated_at` ; tout l'état fin
dans `platform_fields`), `inventaire` (les fiches), `profiles`,
`vinted_sync_runs` (relevés de TOUTES les plateformes). Tables, colonnes
piégeuses, `verify_jwt` de chaque fonction, crons et triggers :
`docs/agents/architecture.md`.

### 2.6 Secrets — où ils sont, jamais ce qu'ils valent

Aucune valeur ne doit apparaître dans un fichier, un commit, un rapport, un
log. Seulement les emplacements :

- `.env` racine (gitignoré) : URL + clé de service Supabase (admin local).
  La clé **anon** (publique) est en dur dans `src/lib/supabase.js` et
  `chrome-extension/config.js`.
- Secrets des fonctions edge (`npx supabase secrets list` → NOMS seulement) :
  Supabase, `CRON_SECRET`, IA, Stripe, Resend, eBay, Apple, Google.
  Vault Postgres : `service_role_key`.
- Le secret de cron est dans la commande de chaque `cron.job` ; ⚠️ il est
  aussi EN CLAIR dans l'historique du dépôt (`CLAUDE.md`, `_shared/payment-notify.ts`,
  ~14 migrations) : ne jamais le recopier ; rotation = chantier dédié
  (`docs/ROTATION_CRON_SECRET.md`), tout d'un coup, jamais en passant.
- `android/local.properties` (keystore Android), `apple-key.p8` (racine,
  gitignoré), `C:\Users\nicol\.capgo` (Capgo), variables Vercel du projet
  `fill-sell`, groupes chiffrés Codemagic.
- Prototype cloud : `secrets.env` et `sessions-sauvegarde.json` — jamais affichés.

---

## 3. Commandes et déploiement, pas à pas

Environnement : Windows 11, Git Bash et PowerShell. Node (pas de Python).
Pas de base locale : `supabase` CLI s'utilise en lecture et pour déployer
des fonctions (projet `tojihnuawsoohlolangc`).

### 3.1 App web et mobile

- Web : `npm run build` (`vite build` ; `prebuild` vérifie que les
  permissions du manifest de l'extension sont alignées sur la page légale).
  Le build échoue si `EXTENSION_LAST_COMMIT` est en retard sur le dernier
  commit de `chrome-extension/`. Le déploiement web = **le push sur `main`**
  (Vercel, projet `fill-sell`, domaine `fillsell.app`).
- Lint : `npm run lint`. Selftests : `npm run selftest:<sujet>` (~80 branchés ;
  les lancer quand on touche leur sujet, `selftest:publication-moteur` pour le
  stepper, `selftest:imports-epingles` pour les fonctions).
- Captures d'écran sans session : `scripts/apercu/` (vite + playwright).
- **OTA Capgo** (aucun script npm, geste manuel) :
  1. lire le canal : `npx @capgo/cli channel list` (numéro servi sur `production`) ;
  2. monter `"version"` dans `package.json` au-dessus du canal (le numéro de
     bundle = cette version ; 2.9.28 au 27/09) ;
  3. **commiter** (avant le build : sinon l'empreinte embarquée est `-dirty`
     et désigne le commit précédent) ; aucun fichier non suivi dans l'arbre
     (un seul suffit à faire `-dirty`) ;
  4. `npm run build` ;
  5. `npx @capgo/cli bundle upload --channel production --bundle <version> --path dist` ;
  6. relire le canal. Un numéro consommé ne se réutilise jamais (même si
     l'envoi s'est figé) ; **ne jamais rebuilder un `dist/` déjà empreint**
     pour le renvoyer : nouveau numéro, nouveau commit, nouveau build.
  Une OTA ne change que le JS. Binaires natifs (rares, sur décision) : iOS
  par Codemagic (`codemagic.yaml`), Android : AAB à la main (Gradle).

### 3.2 Extension Chrome (procédure complète : `docs/agents/extension.md`)

- Changer `chrome-extension/` = monter `"version"` du manifest ET recaler
  `EXTENSION_LAST_COMMIT` (`scripts/build-id.mjs`) dans le même lot, sinon
  `npm run build` échoue. ⚠️ Donc **aucun fichier annexe dans
  `chrome-extension/`** (pas même un `.md`) sans ce recalage.
- `npm run build:extension` → `build\extension\` (à charger en non empaqueté,
  une seule extension FillSell active) ; `npm run package:extension` →
  `build\fillsell-extension-<version>-cws.zip` (refuse arbre sale, BUILD_ID
  douteux, version déjà publiée…).
- **Un seul zip par version**, seul dans `build\CWS-<version>-A-TELEVERSER\` ;
  les zips remplacés vont dans `build\anciens-zips\`. Nico téléverse et
  clique « Envoyer pour examen ». Un push ne déploie PAS l'extension.
- **Après acceptation constatée** (`profiles.extension_build`) : version dans
  `ALREADY_PUBLISHED` + `PUBLISHED_BUILD_IDS`, puis `EXTENSION_MIN_BUILD` =
  BUILD_ID du zip — **jamais** `EXTENSION_LAST_COMMIT`.
- **Actuelle : 0.6.75, à téléverser** (contient 0.6.70 → 0.6.74, jamais téléversées) :
  `build\CWS-0.6.75-A-TELEVERSER\fillsell-extension-0.6.75-cws.zip`.

### 3.3 Lire la prod (sans rien écrire)

- SQL en lecture : MCP Supabase `execute_sql` ou
  `npx supabase db query "<select>"` (projet `tojihnuawsoohlolangc`).
- Version d'extension servie :
  ```sql
  select extension_build, extension_version, count(*) from public.profiles
  where extension_build is not null group by 1,2 order by 1 desc limit 10;
  ```
- Fonctions : `npx supabase functions list`. Crons : `select * from cron.job`
  et `cron.job_run_details`. Build web servi : `curl https://fillsell.app/build.json`.

### 3.4 Supabase

Détail complet : `supabase/AGENTS.md`. L'essentiel :

- ⛔ **`supabase db push` est INTERDIT** tant que la baseline n'est pas
  refaite. Historiques divergents : ~29 fichiers locaux non enregistrés côté
  distant, ~35 versions distantes sans fichier local. Un push rejouerait des
  migrations **non idempotentes** : un `cron.schedule('handler-watch-3min')`
  → job planifié **en double** ; un revert de grants → **soldes utilisateurs
  modifiés**. Interdits aussi : `db reset`, `db remote commit`.
- Migrations **appliquées directement en prod, une par une** (c'est normal et
  irréversible), après : lecture du corps réel en prod → fichier
  `AAAAMMJJHHMMSS_nom.sql` idempotent → **rejeu en transaction annulée,
  MONTRÉ** → **GO de Nico qui nomme la migration** → application → relecture
  de l'effet → commit avec « APPLIQUÉE le … (GO …) ».
- Fonctions edge : **le geste, avant ET après tout déploiement** :
  ```
  npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
  ```
  `supabase functions deploy <nom> [--no-verify-jwt]`. La règle n'est pas « la
  fonction est-elle dans la liste ? » mais **« qui l'appelle, et cet appelant
  a-t-il une session Supabase ? »** (tableau dans `supabase/AGENTS.md`).
  Déployer les fonctions concernées dès qu'elles changent.
- Ne jamais écrire un numéro de version de fonction (rapport, commit,
  commentaire) sans l'avoir lu dans `functions list`.
- Imports distants **toujours épinglés** (`npm run selftest:imports-epingles`).

### 3.5 Git

- Code applicatif (React, fonctions edge, extension) : **commit et push
  directement sur `main`** (pas de branche, pas de PR — consigne du 21/07).
  Build/vérifier avant : le push tient lieu de validation.
- ⛔ **UN SEUL PUSH SUR `main` PAR LOT.** « Fichier par fichier » = des
  commits séparés, jamais des déploiements séparés. Un push = un déploiement
  Vercel = tous les chunks renommés. Le 18/09, six pushs en dix minutes ont
  mis la prod à l'écran blanc (onglets ouverts pointant sur des fichiers
  supprimés). Empiler les commits, vérifier, pousser **une fois**.
- Quand l'arbre porte des modifications qui ne sont pas les tiennes : jamais
  `git add <fichier>` en entier (tu embarquerais le chantier d'un autre).
  Commiter seulement tes hunks, puis vérifier que `git status` montre encore
  les siennes.
- Jamais `rm -rf` sur un dossier contenant une jonction Windows (elle est
  traversée : un `node_modules` réel a été effacé ainsi).
- Messages de commit en français : `fix(zone): vX — ce qui change, pour qui,
  la cause mesurée` ; les migrations appliquées le disent (« APPLIQUÉE le …
  (GO Nico) »).

### 3.6 Écran blanc : le build avant le code

Ordre de diagnostic non négociable :
1. **l'empreinte du build** — en bas de la page Réglages, ou
   `curl https://fillsell.app/build.json` : quel commit tourne vraiment
   (côté web, le suffixe `-dirty` est permanent et ne veut rien dire : le
   hash court fait foi ; côté OTA, `-dirty` est significatif) ;
2. **un rechargement forcé** — si l'écran revient, c'était un chunk périmé,
   rien à corriger ;
3. **l'état du déploiement Vercel** (READY ou ERROR) ;
4. **alors seulement**, ouvrir un fichier.

Avec `lazy()` + `<Suspense fallback={null}>`, un 404 de chunk rend le même
écran vide qu'un crash, build vert dans les deux cas. La garde
`vite:preloadError` (`src/main.jsx`) recharge une fois seule : un écran blanc
qui survit à ça, c'est du code.

---

## 4. Règles métier qui ne se négocient pas

### 4.1 Import, publication, republication

- **Import de relevé ≠ publication ≠ republication.** Un import (annonce
  trouvée en ligne par un relevé) crée un job « synthétique » qui n'a jamais
  été déposé par FillSell. Il se reconnaît au `handler_build` contenant
  **`sync-dressing`** (Vinted) ou **`releve-annonces`** (autres plateformes),
  **n'importe où dans la chaîne** (tester avec `LIKE '%…%'`, jamais un égal
  ni un préfixe).
- Une annonce importée est **lecture seule pour la republication** tant
  qu'elle n'a pas été déposée par FillSell (pas de capture → pas de redépôt).
- **Chaque annonce en ligne est importée.** Elle n'est **rattachée** à une
  fiche existante que sur **preuve certaine** : identifiant de l'annonce, lien
  déjà connu, dépôt FillSell. Jamais par le titre seul (le repli par titre a
  croisé des annonces Leboncoin entre deux articles : « doudou » ⊂ « doudous »,
  corrigé 0.6.70/0.6.71 + trigger `cross_post_jobs_lien_jamais_croise`).
- **Des annonces identiques sont de vrais exemplaires** (un vendeur peut avoir
  trois fois le même livre) : ne jamais les fusionner d'office. Le doute
  devient une question « Est-ce le même article ? » posée dans l'app.
- Une annonce n'est **jamais portée par deux articles**.
- Ne **jamais publier** là où une fiche jumelle a déjà une annonce vivante
  (`spend_coins_and_publish` refuse : motif `jumeau_en_ligne`).

### 4.2 Retraits, ventes, disparitions

- **Aucune annonce vivante retirée** sans geste explicite de l'utilisateur ou
  **vente prouvée**. Supprimer une fiche de l'app ≠ retirer l'annonce (la
  personne choisit ; « garder l'annonce en ligne » existe).
- **Jamais « vendue » ni « disparue » sur une seule lecture** : il faut la
  confirmation au cycle suivant (règle Vinted du 09/08, étendue aux 5
  plateformes par la 0.6.72). Un relevé **vide** ou **incomplet** ne prouve
  AUCUNE disparition.
- Détection de vente : délai de grâce de 4 h, identique sur toutes les plateformes.

### 4.3 Gardes et boutiques

- **`boutique_etrangere` est une garde, pas une erreur** : le compte connecté
  dans le navigateur n'est pas celui qui porte l'annonce → on ne touche à
  rien, on le dit.
- **Multi-boutiques Vinted** (plusieurs comptes Vinted pour un même compte
  FillSell, `vinted_account_id`) : rien ne touche une boutique depuis une
  autre (`garde_boutique`).
- **Beebs** : on ne touche jamais à la modération (une annonce Beebs passe par
  une vérification humaine, parfois longue). **Aucun dépôt Beebs n'est jamais
  déclaré « pas en ligne »**, clos ni invité à être republié parce qu'il est
  absent d'un index : il reste « En vérification Beebs » (décision de Nico,
  27/09 ; l'index public ne voit ni les annonces en modération ni les vendues).
- Leboncoin, Beebs et Opla sont **françaises** : indisponibles pour un compte
  Vinted hors de France (chantier zone euro).

### 4.4 `needs_user` et couleurs

- Tout job en `needs_user` porte un **`needs_user_source`** (le motif) ET a
  un **écran dans l'app** qui dit quoi faire. Un `needs_user` muet est un bug
  (trigger `cross_post_jobs_needs_user_motif` depuis le 27/09 ; l'ops-digest
  liste les motifs posés par défaut).
- **Rouge = notre faute** (à corriger dans le code). **Orange = un geste de
  l'utilisateur** (se connecter, autoriser Opla, choisir un rayon, répondre à
  une question). **Blanc = la plateforme** (modération, panne, anti-robot).
  Doctrine « pas-de-rouge » (22/09) : plus aucun job n'est écrit `failed`
  pour une cause qui n'est pas la nôtre → toute requête sur
  `status = 'failed'` seule est aveugle.
- **Un refus de modération Leboncoin est NOTRE faute** : catégorie ou champ
  mal posé.
- **La sonde tranche, jamais le texte** : un message « connecte-toi » ne
  s'affiche que si la session est prouvée absente par la sonde de
  l'extension. Chez Vinted, **403 = anti-robot, pas déconnexion** ; 401 =
  session absente. Chez Opla, un 401 de sonde ne prouve RIEN (deux murs
  distincts : permission « Autoriser » ≠ session fermée ; seule la page tranche).
- Jamais un diagnostic brut à l'écran : il reste en base (`warnings`,
  `last_diagnostic`) et l'app le traduit (`WARN_FAMILLES` / `WARN_INCONNU`
  dans le Stock). Toute nouvelle famille de warning reçoit sa traduction.

### 4.5 Catégories, tailles, champs

- **On ne devine jamais** une catégorie (« rayon ») ou une taille. On
  **traduit** (même valeur dans le vocabulaire de la plateforme), on ne
  **convertit** pas (jamais 38 → M) ; sinon **on pose la question**.
- Le texte du vendeur fait foi ; une liste fermée de la plateforme fait foi
  (valeur hors liste → « champ à compléter », jamais une valeur inventée).
- Un rayon refusé par la vérification ne part pas : « Rayon à choisir ».
- Une valeur « générale » (ex. « Autre ») n'est jamais posée comme sélection
  par défaut.

### 4.6 Façon d'intervenir

- **Ne jamais réparer à la main ce que l'app doit faire seule** : on corrige
  la cause dans le code, on ne fait pas le geste à la place de l'app ou de
  l'utilisateur. Une réparation de données passe par une migration montrée
  et validée (GO), jamais par un UPDATE improvisé.
- **Avant de relancer un job, lire son `platform_fields`** : une garde
  volontaire (retenue, parcage, question en attente, pause anti-robot) ne se
  relance pas.
- **Aucune régression sur les 5 plateformes** : avant de changer un module,
  identifier tout ce qui en dépend (`grep` des imports côté `src/`,
  `chrome-extension/`, `supabase/functions/`).
- Heures **toujours en Europe/Paris** (requêtes : `AT TIME ZONE 'Europe/Paris'`).

### 4.7 Premium, prix d'achat, chiffres

- **Résilié / expiré = plus premium, partout.** Expression canonique,
  identique partout (App.jsx, voice-transcribe, voice-intent,
  generate-listing, deal-analysis, check_inventory_limit…) :
  ```sql
  is_premium = true OR is_pro = true OR is_comped = true
  ```
  `is_premium` / `is_pro` (et `is_business`) = source de vérité, maintenus
  par les 4 flux de paiement (stripe-webhook, apple-iap-webhook,
  validate-apple-receipt, google-play-webhook) ; `is_comped` = offert, posé à
  la main. **Jamais** `is_founder` (prix legacy 9,99 €, affichage seulement)
  ni `apple_original_transaction_id` / `google_purchase_token` : ils
  survivent à la résiliation (« premium fantôme », 25/07). Un statut
  d'abonnement se vérifie à la SOURCE (Stripe, Apple, Google). Un compte
  promu à la main n'a pas d'identifiant Apple tant qu'il ne renouvelle pas.
- **Prix d'achat : VIDE ≠ ZÉRO.** `inventaire.prix_achat` NULL = inconnu →
  exclu de TOUT calcul (marge, bénéfice, total investi, moyenne). `0` =
  article gratuit assumé. Jamais `parseFloat(x) || 0`, `?? 0`, `Number(x ?? 0)`
  sur un prix d'achat. Source unique : `src/utils/comptabilite.js`.
  ⚠️ `isNaN(null) === false`. `prix_achat_inconnu = true` vaut un prix absent.
  Le chiffre d'affaires ne se filtre jamais. Les 346 lignes historiques à 0
  sont ambiguës (non converties) ; les 3 dénominateurs de « marge % » sont une
  dette connue, à ne pas unifier sans décision.
- **Comptes à ne jamais compter comme payants** (préfixes d'email) : `test`,
  `nicotest`, `googlereview`, `nicolas.svobodny+test2`, `4kt629c47h`,
  `5cgv5fg4zv`, `jyv87shnv7`, `rhz66yn247`. Hors décompte aussi : les comptes
  offerts (`is_comped`), les résiliations en cours, les comptes de Nico et
  d'Ornella, et `voirememe` (remise 100 %). Le poste de `nicolas.svobodny`
  tourne en extension non empaquetée : c'est normal.
  Requêtes : CTE `excluded` avec `unnest(ARRAY[...])`.
- **Net encaissé** : Stripe = prix × 0,97 × 0,742 ; stores (Apple/Google) =
  prix ÷ 1,20 × 0,85 × 0,742.

---

## 5. Mails aux utilisateurs

- **Jamais sans l'ordre explicite de Nico.**
- **Une seule porte**, en SQL — jamais une fonction edge (le 23/09, 31
  fonctions `send-<prénom>-<date>` ont été supprimées : destinataire en dur,
  jeton maison, jamais commitées) :
  ```sql
  select public.envoyer_mail_ponctuel(
    p_destinataires := '[{"email":"qui@exemple.fr","user_id":"<uuid ou null>","variables":{"prenom":"Marie"}}]'::jsonb,
    p_sujet         := 'Bonjour {{prenom}}',
    p_html          := '<p>Le texte, en HTML.</p>',
    p_type          := 'un_type_parlant',     -- obligatoire, atterrit dans email_logs
    p_categorie     := 'support',             -- 'support' (réponse) | 'marketing' (campagne)
    p_simulation    := true                   -- true = rien ne part, on lit le verdict
  );
  -- puis TOUT DE SUITE (net._http_response se purge) :
  select status_code, content from net._http_response where id = <id rendu>;
  ```
  Toujours `p_simulation := true` d'abord, lire le verdict, puis `false`, en
  commençant par l'adresse de Nico. `p_destinataires` accepte une liste ;
  `{{cle}}` est remplacé par personne ; l'adresse seule
  (`'["qui@x.fr"]'`) est aussi acceptée.
- Garanties de la porte : clé de service lue dans le vault (jamais écrite),
  `verify_jwt = true` + garde maison (seule la clé de service passe), passage
  par `envoyerEmail()` (`supabase/functions/_shared/desinscription.ts`) :
  désinscription respectée, ligne `email_logs`, échecs dans
  `email_log_echecs`, en-tête List-Unsubscribe One-Click sur tout marketing.
- **Plafond : 2 mails par personne et par 24 h glissantes** pour ce qu'on
  envoie de notre initiative (`marketing`, compté sur toutes les lignes
  `email_logs` de la personne). Quand l'utilisateur écrit, on répond sans
  compter (`support`, jamais plafonné). **Support prioritaire des payants :
  réponse en moins d'une heure.**
- ⛔ **Un type one-shot (un envoi par personne, à vie) entre dans l'index
  `email_logs_one_shot_unique` le jour même**, sinon il repartira en doublon
  (bug du welcome, 03/08). Détail (types récurrents, `email_log_echecs`,
  ops-digest) : `supabase/AGENTS.md`.
- **Ton** : tutoiement, « je », signé **« Nico / FillSell »**, court, humain.
  Pas de cause technique, pas de délai promis, pas de chiffres. Jamais « on
  publie pour toi » (c'est l'extension, sur SON ordinateur, qui exécute).
  Jamais présenter FillSell comme centré sur Vinted (5 plateformes).
- **Jamais de mail tout en images** (Gmail iOS en sombre, images bloquées :
  le mail paraît blanc). Texte HTML réel, images en appoint.
- Fonctions `send-*` en prod au 27/09 : `send-extension-link` et
  `send-bug-report` seulement (`send-batch-notifications` et
  `send-chantier-zip`, citées par `CLAUDE.md`, n'existent plus en prod).

---

## 6. Travailler avec Nico

- **Rapports courts.** Nico ne lit pas les rapports longs : ce qui est fait,
  ce que ça change pour les utilisateurs, ce qui reste, **les décisions à
  prendre** (une par ligne, avec la recommandation). Le contenu des réponses
  va dans un bloc de code (copier-coller facile). Les liens à cliquer
  (vue en direct, etc.) vont en clair, hors bloc, dans le **message final**
  (il ne voit pas les messages intermédiaires, souvent depuis son iPhone).
- **Sur le PC, Nico ne fait QUE zipper et téléverser.** Ne jamais lui
  demander d'inspecter un fichier, une version, une console : livrer un
  fichier prêt, **chemin exact en clair** (ex.
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.75-A-TELEVERSER\fillsell-extension-0.6.75-cws.zip`).
- **Aucun achat** (serveur, IP, abonnement, crédit) sans GO avec le montant.
- **Un GO se lit, il ne se déduit pas** : une migration, un envoi de mail, une
  action en prod attend une phrase qui la nomme.
- **Aucune régression sur les 5 plateformes** : identifier ce qui dépend du
  code touché avant de le changer, et le dire dans le rapport.
- Ne jamais écrire une information non vérifiée (version publiée, numéro de
  fonction, statut d'abonnement) : la lire en base / dans l'outil d'abord.
  Une version d'extension « publiée » se lit dans `profiles.extension_build`,
  pas dans un nom de dossier ni un commentaire.

---

## 7. État au 27/09/2026 (détail : `docs/agents/etat-2026-09-27.md`)

- **Panne du 27/09** : machine de la base figée de 15:34 à 16:07 (redémarrage
  manuel), cause unique non prouvée. Le balayage des doublons, annulé à
  chaque passage depuis le 26/09 au soir (budgets de 20 et 40 s pour une
  limite de 8 s), est **corrigé** (migration 20260927190000 : une fiche par
  appel, chaque appel sous 8 s) et tourne de nouveau depuis 18:50. **Leçon :
  toute RPC appelée par PostgREST tient sous 8 s** (`statement_timeout` du
  rôle `authenticator`) ; un travail long se découpe en appels courts dont
  chacun est enregistré.
- **Audit de la synchronisation** (27/09 soir) : 784 annonces en ligne
  étaient retenues hors du stock en attente d'une réponse. Deux migrations
  ont été appliquées (20260927210000, 211000 : 881 annonces importées). Lot
  « synchronisation parfaite » du même soir (abandon = aucun relevé, relevé
  incomplet repris seul, murs eBay et session Opla nommés, photos complètes,
  verdicts jamais sur relevé partiel) : fichier d'état § 7.6 ; OTA 2.9.30 à
  envoyer, deux migrations en attente de GO.
- **FillSell Cloud** : prototype hors dépôt
  (`C:\Users\nicol\fillsell-cloud-proto\REPRISE.md` fait foi) ; Vinted,
  Leboncoin, Opla validés, Beebs bloqué (DataDome) ; reste la tenue des
  sessions J1-J7 et, avant toute offre, la prise de job atomique.
- **Extension 0.6.75 à téléverser** (BUILD_ID 2026-09-27T20:16:30Z) ; les livres (gel du 28/08, ISBN
  `0000000000000`) se débloquent seuls dès qu'un poste porte ≥ 0.6.70.
- **Chantier Italie** : migration
  `20260925190000_plateformes_francaises_hors_france.sql` écrite, NON
  appliquée, NON commitée — ne pas toucher sans GO.
- Autres décisions en attente : voir le fichier d'état.

---

## 8. Lectures obligatoires selon la tâche

| Avant de… | Lire |
|---|---|
| toucher à quoi que ce soit | ce fichier en entier, puis `docs/agents/pieges.md` (tout ce qui a déjà cassé) |
| écrire une requête, une migration, une fonction | `supabase/AGENTS.md` + `docs/agents/architecture.md` |
| toucher `chrome-extension/` ou livrer un zip | `docs/agents/extension.md` |
| toucher `src/` ou faire une OTA | `src/AGENTS.md` |
| reprendre un chantier en cours | `docs/agents/etat-2026-09-27.md` (puis la prod) |
| lire un mot inconnu (relevé, rattachement, jumeau, garde, mur, parcage, veilleur, stepper, palier…) | `docs/agents/glossaire.md` |

Les notes détaillées de Claude (un fait par fichier, index `MEMORY.md`) :
`C:\Users\nicol\.claude\projects\C--Users-nicol-fill-and-sell\memory\` —
utiles pour l'historique d'un cas, mais la prod fait foi.
Docs de conception : `docs/SYNC_MULTIPLATEFORME_CONCEPTION.md`,
`docs/REPUBLICATION_*.md`, `docs/OPLA_*.md`, `docs/ROTATION_CRON_SECRET.md`.
