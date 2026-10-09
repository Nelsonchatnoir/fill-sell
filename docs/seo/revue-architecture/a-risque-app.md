# Revue de l'architecture « site vitrine statique » — angle : NE RIEN CASSER DE L'APP

Revue du 09/10/2026 sur `docs/seo/ARCHITECTURE.md` (branche `seo-crosslisting`,
worktree identique à origin/main `8fa7007`). Lecture seule du code. Aucun appel à
fillsell.app. Une seule lecture de la configuration du projet Vercel (API, lecture
seule) : projet `fill-sell`, framework `vite`, `ssoProtection: all_except_custom_domains`,
aucune règle de routage au niveau du projet (« Project Routes not found »).

## Verdict : TIENT AVEC CORRECTIONS

Le principe tient : la doc Vercel confirme que les fichiers du disque passent avant
les rewrites, et le natif comme l'OTA ne sont pas touchés tant que le générateur ne
tourne pas. Mais l'architecture couple un `vercel.json` **inconditionnel** à un
fichier `app-shell.html` produit **sous condition**. Ce couplage peut casser d'un coup
tous les liens profonds de l'app (B1). Plusieurs chemins d'entrée réels doivent aussi
être spécifiés et testés avant le GO :

- l'ordre des aiguillages en ligne (I1) ;
- les liens d'authentification à fragment `#…` (I2) ;
- les collisions de chemins (I3) ;
- les fichiers absents qui retombent sur du HTML en 200 (I4) ;
- la mesure d'acquisition et les conversions publicitaires (I5, I6) ;
- la vérification réelle sur la prévisualisation (I7) ;
- la lecture de la base pendant le build (I8).

---

## 1. Sémantique Vercel : vérifiée dans la doc officielle actuelle

| Affirmation | Verdict | Preuve |
|---|---|---|
| Un fichier présent sur disque est servi avant tout rewrite | **VRAI, écrit** : « The `source` property should **NOT** be a file because precedence is given to the filesystem prior to rewrites being applied. » | https://vercel.com/docs/project-configuration/vercel-json#rewrites |
| Les `rewrites` consultent le disque d'abord | **VRAI** : « Use `rewrites` instead, which checks the filesystem by default. » | même page, § `routes` (champ `handle`) |
| L'URL et la query restent intactes après un rewrite (l'app garde `?code=`, `?session_id=`, `?etat=`…) | **VRAI** : « A rewrite routes a request to a different destination without changing the URL in the browser. » ; `source` = « each incoming pathname (excluding querystring) » | https://vercel.com/docs/routing/rewrites ; vercel-json#rewrites |
| Slash final (`trailingSlash` absent, comme aujourd'hui) | « When `trailingSlash: undefined`, visiting a path with or without a trailing slash will not redirect. … both `/about` and `/about/` will serve the same content » (la doc ajoute « not recommended … duplicate content ») | vercel-json#trailingslash |
| `/x` sans slash servi par `x/index.html` | **NON ÉCRIT en toutes lettres** dans les pages lues, seulement impliqué par la phrase ci-dessus. **Aucune preuve servie dans le dépôt** : le prérendu du blog (7fa49c3) a été vérifié « sur la sortie du build », pas sur la réponse HTTP. Aujourd'hui, `/` aboutit à `index.html` par le disque OU par le rewrite : la prod actuelle ne prouve donc rien de la priorité du disque sur `/`. | à mesurer (§ 4, T1–T3) |
| `cleanUrls` | défaut `false` ; à `true`, « do not include the file extension in the source or destination path » : la destination `/app-shell.html` deviendrait fausse | vercel-json#cleanurls |
| Les en-têtes (`headers`) | se rattachent au chemin DEMANDÉ (« A pattern that matches each incoming pathname ») : une règle sur `/app-shell.html` ne couvre pas `/legal` servi par le rewrite. C'est une **déduction**, à confirmer par `curl -I` (T8). | vercel-json#headers |
| `VERCEL=1` au build | « Available at: Both build and runtime » ; « An indicator to show that system environment variables have been exposed » ; dépend de la case « Enable access to System Environment Variables ». Présent aussi en prévisualisation (`VERCEL_ENV=preview`). **Absent** en `vercel deploy --prebuilt` : « System Environment Variables will be missing at build time » | https://vercel.com/docs/environment-variables/system-environment-variables ; https://vercel.com/docs/cli/deploy#prebuilt |
| `buildCommand` dans `vercel.json` | « override the Build Command in the Project Settings dashboard, and the `build` script from the `package.json` file for a given deployment » | vercel-json#buildcommand |

`VERCEL=1` est présent aujourd'hui au build, mais seulement par preuve indirecte :
`scripts/build-id.mjs:1800-1810` ne tolère le `M vercel.json` réécrit par Vercel
(relevé sur `dpl_ZMoeanE5` le 01/10) que si `process.env.VERCEL` existe ; sans lui,
`assertArbrePropre` refuserait le build. C'est une protection par effet de bord,
pas par conception.

---

## 2. Problèmes, du plus grave au moins grave

### B1 — BLOQUANT — Le rewrite vise un fichier que seul un build « interrupteur » produit

- **Preuve.** Architecture § 2.1 : le générateur ne tourne que si
  `process.env.VERCEL === '1'` ; § 2.2.3 : `vercel.json` réécrit vers
  `/app-shell.html`, sans condition. Le garde-fou (§ 2.2) n'existe que **quand le
  générateur tourne**. Aujourd'hui, `vercel.json:58-60` vise `/index.html`, qui
  existe dans tous les builds.
- **Scénario.** Un build Vercel ne pose pas `VERCEL` : déploiement
  `vercel deploy --prebuilt` après un `vercel build` local (chemin de secours
  documenté ; variables système absentes, citation ci-dessus ; arbre local propre
  donc `assertArbrePropre` passe), case « System Environment Variables » décochée,
  ou commande de build changée. Le générateur saute **en silence**,
  `dist/app-shell.html` n'existe pas, le déploiement passe READY. Ensuite, tout
  lien profond rend 404 :
  - `/app` au rechargement ;
  - `/login` ;
  - `/auth/callback` (Google, Apple) ;
  - `/auth/confirm` ;
  - `/reset-password` ;
  - `/success` et `/cancel` (Stripe) ;
  - `/desinscription` (obligation légale) ;
  - `/extension` (lien du mail) ;
  - `/ebay/retour` ;
  - le rechargement automatique du `build.json` (App.jsx:2736 → `location.reload()` sur `/app`).

  Seul `/` marche encore.
- **Correction.**
  1. Écrire `dist/app-shell.html` dans **tous** les builds : un petit plugin
     `writeBundle` toujours actif, séparé du générateur. Il copie la coquille et
     échoue si elle ne contient pas `<div id="root"></div>` ni
     `/assets/index-`. Les ~9 Ko sont sans effet sur le natif : Capacitor charge
     `index.html`. Si le générateur saute, on retombe exactement sur la prod
     d'aujourd'hui, au lieu d'un 404 général.
  2. Ajouter une assertion de build : la `destination` du rewrite lue dans
     `vercel.json` existe dans `dist/`.
  3. Rendre l'interrupteur **explicite et versionné** :
     `"buildCommand": "npm run build:web"` dans `vercel.json` (même fichier, même
     commit que le rewrite, et passage obligé par `npm run build` pour garder le
     hook `prebuild`), avec `build:web` qui pose `FILLSELL_SITE=1`. Le générateur ne
     lit plus `VERCEL`.

### I1 — IMPORTANT — L'ordre des aiguillages en ligne n'est pas écrit ; mal ordonné, il rouvre le bug du 16/09 (« connecté au mauvais compte »)

- **Preuve.** `src/router/AppRouter.jsx:63-72` : la confirmation (`?code=` /
  `?token_hash=`) est traitée **avant** toute lecture de session
  (`AppRouter.jsx:38-50` et `src/pages/AuthConfirm.jsx:20-27` expliquent pourquoi).
  Architecture § 2.3 : deux lignes séparées, sans ordre, et le départ vers `/app`
  emporte `search`.
- **Scénario.** Le script teste le jeton d'abord. Lien de confirmation ouvert
  depuis l'app native ou un autre navigateur (pas de `code_verifier`), dans un
  navigateur déjà connecté à un autre compte. Le script part vers `/app?code=…`,
  supabase-js ignore le code (`_isPKCECallback` exige le verifier), la session de
  l'autre compte reste : la personne travaille dans le mauvais compte, sans un mot.
- **Correction.** Le texte doit fixer l'ordre :
  1. `code` / `token_hash` → `/auth/confirm` ;
  2. fragment ou erreur d'auth → voir I2 ;
  3. seulement ensuite, le jeton → `/app`.

  Le script d'aiguillage doit être une seule fonction source, injectée en ligne au
  build, couverte par un selftest qui joue les cas de la matrice § 3. Cas
  obligatoire : `/?code=x` avec un jeton en localStorage doit arriver sur
  `/auth/confirm?code=x`.

### I2 — IMPORTANT — Les liens d'auth à fragment (`#access_token=…`, `#error_description=…`) posés sur `/` ne sont plus traités

- **Preuve.** Aujourd'hui, `/` charge supabase-js
  (`src/lib/supabase.js:11-13`, `detectSessionInUrl` par défaut). auth-js 2.101.1
  lit le fragment (`node_modules/@supabase/auth-js/dist/main/lib/helpers.js:87-106`)
  et traite le flux implicite à l'initialisation
  (`GoTrueClient.js:270-273`). L'accueil statique ne charge pas supabase-js, et
  `location.replace('/app' + search)` **jette le fragment**. Les liens implicites
  sont ceux que produit un envoi hors client PKCE : « Send magic link » ou
  « Invite » ou « Reset password » depuis le tableau de bord Supabase, ou un
  `generateLink` administrateur, tous vers SITE_URL = `/`.
- **Scénario.** Le support envoie un lien magique depuis le tableau de bord. Sans
  session, la personne voit la page marketing, déconnectée. Avec la session d'un
  autre compte sur l'appareil, elle part sur `/app` dans cet autre compte.
- **Correction.** Dans l'aiguillage en ligne, avant le test du jeton : si
  `location.hash` porte `access_token=` ou `error_description=`, ou si `search`
  porte `error_description=`, faire `location.replace('/login' + search + hash)`.
  Sur `/login`, `RedirectIfLoggedIn` attend l'initialisation de supabase-js, qui
  consomme le fragment : c'est exactement ce que fait `/` aujourd'hui.

### I3 — IMPORTANT — Aucun garde contre une page vitrine qui masquerait une route de l'app

- **Preuve.** Le disque passe avant le rewrite (§ 1). Les routes de l'app sont
  dans `src/router/AppRouter.jsx:118-156`. Les URL suivantes sont écrites en dur
  hors du dépôt web :
  - `send-extension-link` → `/extension` ;
  - `URL_DESINSCRIPTION` (`supabase/functions/_shared/desinscription.ts:79`) ;
  - `success_url` / `cancel_url` (`supabase/functions/create-checkout-session/index.ts:359-360, 433-434, 655-658`) ;
  - `APP_ORIGIN/ebay/retour` (`_shared/ebay-oauth.ts:80`) ;
  - `https://fillsell.app/auth` et `/app` (`chrome-extension/config.js:6`, `chrome-extension/popup.js:20`).
- **Scénario.** Une page de contenu reçoit l'id `extension` ou `legal`, ou un
  dossier d'images `dist/login/…` est créé. Le fichier statique remplace la page
  React pour toujours, même pour le lien du mail ou le retour d'un service tiers,
  et sans aucune erreur de build.
- **Correction.** Une liste FERMÉE des préfixes de l'app : `app`, `login`, `auth`,
  `success`, `cancel`, `reset-password`, `extension`, `ebay`, `desinscription`,
  `legal`, `demo`, `app-shell.html`, `build.json`, `fillsell-extension.zip`,
  `assets/index-*`. Elle doit être partagée avec un selftest qui la compare aux
  `<Route path>` d'AppRouter. Le générateur et `site:verifier` échouent sur tout
  fichier ou dossier de `dist/` qui la recoupe (`blog` reste autorisé, c'est voulu).

### I4 — IMPORTANT — Un fichier vitrine absent hors `/assets/` est servi en HTML 200 (la coquille), et Cloudflare peut le garder

- **Preuve.** `vercel.json:59` n'exclut que `api/` et `assets/`. Il y a un
  précédent dans le dépôt : `scripts/vite-plugin-zip-extension.mjs:13-19` (zip
  servi en HTML 200 le 12/07). Incident CDN du 01/10 : 404 gardé une heure
  (`docs/agents/pieges.md:14-21`). L'architecture ne dit pas où vivent
  `site.<hash>.js`, les images, `llms.txt`.
- **Scénario.**
  - `/site.<hash>.js` demandé par une page restée ouverte, ou pendant un
    déploiement : il reçoit la coquille HTML en 200. Avec
    `X-Content-Type-Options: nosniff` (`vercel.json:7`), le script est refusé en
    silence : plus de bandeau de consentement, de mesure ni de menu. Cloudflare
    met en cache par extension un « .js » qui est du HTML.
  - Une image absente donne aussi du HTML en 200.
  - `sitemap.xml` ou `llms.txt` non générés : les robots reçoivent la coquille.
- **Correction.**
  1. Tout le statique de la vitrine sous `/assets/site/…`, déjà exclu du rewrite :
     un fichier manquant donne un vrai 404.
  2. Le CSS de la vitrine entièrement en ligne, ou au minimum tout ce qu'il faut
     pour une page lisible : un 404 sur la feuille ne doit pas défigurer
     l'accueil pour tout le monde pendant une heure.
  3. Aucun `import()` dynamique dans `site.js`.
  4. Ajouter au § écran blanc de CLAUDE.md la variante « vitrine » du contrôle
     `Origin`, sur `assets/site-*.js`.

### I5 — IMPORTANT — La première source d'acquisition et l'offre `?offre=` dépendent de `site.js` exécuté avant le clic

- **Preuve.** Aujourd'hui, `capterSource()` et `capterOffre()` tournent au
  chargement du module ou au premier rendu, sur toute route
  (`AppRouter.jsx:27, 109`). La source est un premier contact **immuable**
  (`src/utils/acquisition.js:59-61` et le trigger `profiles_acquisition_immuable`)
  et le referrer interne est jeté (`acquisition.js:41-52`). Sur la vitrine, la
  capture passe par `site.js`, chargé après l'analyse de la page.
- **Scénario.** Visiteur TikTok ou Google sur mobile lent : l'accueil statique
  s'affiche tout de suite (CSS en ligne) et il touche « Commencer » avant que
  `site.js` ait tourné. `/login` charge la SPA : `utm_*` / `fbclid` sont restés
  sur `/`, le referrer est fillsell.app (ignoré). `fs_acq` vaut « direct »
  **pour toujours**. On perd aussi `?offre=`. C'est la mesure même du chantier SEO
  qui en souffre.
- **Correction.** Mettre la capture `fs_acq` et `fs_offre_mail` dans le script en
  ligne du `<head>` (~30 lignes, mêmes clés et mêmes règles que les modules), ou
  la faire générer depuis ces modules au build pour garder une seule source.
  Filet supplémentaire : quand l'URL n'a aucun paramètre, `capterSource` peut
  lire les `utm_*` du referrer de **même origine**. `Referrer-Policy:
  strict-origin-when-cross-origin` (`vercel.json:8`) transmet l'URL complète en
  même origine.

### I6 — IMPORTANT — Balises publicitaires : le gtag Google Ads n'est pas listé, et `cta_click` part au moment où la page meurt

- **Preuve.** `index.html:159-166` contient un gtag `AW-16622098460` distinct de
  GTM (`index.html:4-10`). Le tableau § 2.3 ne cite que « GTM, Vercel
  Analytics ». `LandingPage.jsx:21-25` : `page_view`, `cta_click` et
  `change_language` sont la source des conversions TikTok et Google Ads.
  Aujourd'hui, `goSpa` (`LandingPage.jsx:476-500`) intercepte le clic et reste
  dans la page, donc les balises ont le temps de partir. Sur la vitrine, le CTA
  est un vrai lien qui recharge la page.
- **Scénario.** Avec l'accueil statique en ligne, les conversions « signup_* »
  chutent sans qu'aucun code ne soit en erreur : les requêtes des balises sont
  annulées par la navigation, et le `gclid` n'est plus relevé sur `/` si le bloc
  AW manque. Les campagnes perdent leur signal d'optimisation. Côté GTM, les
  pages vues changent de nature : rechargement complet `/` puis `/login`, au lieu
  d'un seul chargement.
- **Correction.**
  1. Reprendre `index.html` **tel quel** du `<head>` à `</head>` (GTM, gtag AW,
     Vercel Analytics, `noscript`). Le générateur échoue si l'un de ces trois
     blocs manque.
  2. Sur les CTA, faire `dataLayer.push({event, …, eventCallback, eventTimeout: 800})`
     puis naviguer, avec `preventDefault` sur le clic simple seulement, comme
     `goSpa`.
  3. Comparer en GTM Preview les déclenchements avant et après, et prévenir de la
     rupture de série dans les tableaux de bord.

### I7 — IMPORTANT — « Testé sur la prévisualisation » ne prouve pas ce qu'on croit

- **Preuve.**
  - Projet Vercel : `ssoProtection: all_except_custom_domains`. Les URL de
    prévisualisation sont derrière l'authentification Vercel.
  - Les fonctions edge n'autorisent que `https://fillsell.app`
    (`ALLOWED_ORIGINS`, par exemple
    `supabase/functions/create-checkout-session/index.ts:17`) : depuis un
    `*.vercel.app`, paiement, connexion d'extension, etc. échouent en CORS.
  - La liste d'URL de redirection autorisées de Supabase Auth n'a pas été
    vérifiée ici.
  - Surtout, un repli sur la coquille rend **aussi** 200.
- **Scénario.** `site:verifier` demande une page sans slash final. La résolution
  du dossier échoue et la coquille revient en 200 : le contrôle passe si on ne
  regarde que le code HTTP. Autre cas : il reçoit la page de connexion Vercel et
  la prend pour du contenu. Les parcours `/success` ou `/auth/callback` ne sont
  pas réellement joués.
- **Correction.**
  1. Chaque page porte un marqueur (`<meta name="fillsell-page" content="<id>">`).
     Le contrôle exige ce marqueur et l'ABSENCE de `<div id="root"></div>`, pour
     `/x` et pour `/x/`. Chaque route de l'app exige la coquille (`id="root"` et
     `/assets/index-`).
  2. Requêtes avec l'en-tête `x-vercel-protection-bypass` (secret
     `VERCEL_AUTOMATION_BYPASS_SECRET`) ; échec sur tout code autre que 200 ou
     404 attendu.
  3. Écrire noir sur blanc que la prévisualisation prouve le **routage**, pas les
     **flux** (OAuth, Stripe, confirmation). Prévoir le test de fumée en prod
     juste après le GO (matrice § 3) et le **retour arrière immédiat**
     (Instant Rollback) : un déploiement Vercel porte ensemble son `vercel.json`
     et son `dist`, donc le retour est cohérent.

### I8 — IMPORTANT — La lecture de `coin_config` pendant le build peut bloquer TOUS les déploiements pendant un incident de base

- **Preuve.** Architecture § 2.3 : jetons « remplis au BUILD (lecture publique de
  `coin_config`, repli = `GRANTS_FALLBACK`) ». Rien n'est dit sur un délai. La base
  a saturé deux fois le 04/10 (CLAUDE.md, incident CPU 99 %).
- **Scénario.** La base ne répond plus et un correctif urgent de l'app est
  poussé. Le `fetch` du build attend sans fin (pas d'`AbortSignal`) : le build
  Vercel reste pendu jusqu'à sa limite et le correctif ne sort pas, au pire
  moment.
- **Correction.** `AbortSignal.timeout(5000)`, aucune nouvelle tentative, repli
  journalisé, **jamais** d'échec du build sur cette lecture. Écrire dans le HTML
  la source des chiffres (« base » ou « repli ») pour le diagnostic.

### M1 — MINEUR — Le garde « une fois par 30 s » protège d'une boucle qui n'existe pas aujourd'hui, et peut masquer un départ légitime

- **Preuve.** Aucune boucle possible dans le code actuel. Seuls des
  `location.replace` / `href` peuvent recharger, et aucun ne vise `/`
  (`App.jsx:609, 3038` : Stripe). `RequireAuth` renvoie par `<Navigate>` côté
  client (`AppRouter.jsx:94`), sans recharger. La déconnexion fait
  `navigate("/")` côté client (`App.jsx:6923, 6948`). Avec un jeton mort,
  supabase-js efface la session sur un refus définitif ; sur une coupure réseau,
  il la garde mais `getSession` rend `null` (`GoTrueClient.js:3864+`,
  `isAuthRetryableFetchError` → `_removeSession`). Dans les deux cas : un seul aller
  `/` → `/app` → landing SPA, puis arrêt.
- **Scénarios où le garde coûte.**
  - Retour du portail Stripe (`stripe-portal/index.ts:77-86` →
    `return_url = window.location.origin`, `SousPageAbonnement.jsx:95`) en moins
    de 30 s.
  - Relance de la PWA (`public/manifest.json:5`, `start_url: "/"`).
  - Clic sur le logo depuis une page vitrine juste après l'arrivée.

  Dans ces trois cas, la personne connectée reste sur la page marketing. Si le
  garde oublie de rendre la page visible, elle voit une page vide. Autre cas :
  retour arrière (bfcache) sur un `/` affiché avant la connexion, où le script ne
  se rejoue pas.
- **Correction.**
  1. Compter les départs (au plus 2 en 20 s) plutôt qu'un seul par 30 s.
  2. Rendre la page visible quand on ne part pas, et sur une minuterie de
     secours (~4 s).
  3. Rejouer le test du jeton sur `pageshow` quand `persisted` est vrai.
  4. Afficher « Ouvrir l'app » dans l'en-tête de la vitrine quand un jeton existe.
  5. Si `sessionStorage` lève une exception, partir quand même (aucune boucle
     possible aujourd'hui).
  6. Écrire l'**invariant** : aucune route SPA ne recharge `/` de force tant
     qu'un jeton peut subsister ; c'est ce qui rend l'absence de boucle vraie.

### M2 — MINEUR — L'ancienne LandingPage React reste servie sur trois chemins fréquents

- **Preuve.**
  - La déconnexion fait `navigate("/")` (`App.jsx:6923`).
  - Le bouton « Se connecter » du popup de l'extension ouvre
    `https://fillsell.app/auth` (`chrome-extension/config.js:6`,
    `popup.js:1541-1543`). `/auth` n'est pas une route : SPA, puis `*`, puis
    `Navigate "/"` (`AppRouter.jsx:156`), puis l'ancienne landing.
  - Toute URL inconnue suit le même chemin.
- **Scénario.** Deux accueils différents (textes, quotas, mise en page). La
  personne qui installe l'extension atterrit sur l'ancien, et pas sur le
  formulaire de connexion qu'elle venait chercher. Les extensions déjà
  installées ne peuvent pas être corrigées.
- **Correction.**
  1. Dans `vercel.json`, `redirects` : `{ "source": "/auth", "destination": "/login", "permanent": false }`.
     Correction serveur, valable pour toutes les extensions déjà installées.
  2. Sur le web, après `signOut({scope:'local'})`, faire
     `window.location.assign('/')` : le jeton est parti, donc pas de boucle.
  3. Garder la LandingPage SPA comme filet tant que M1-6 tient.

### M3 — MINEUR — `fs_lang` : une copie fidèle de la landing ferait passer l'app en français pour les visiteurs anglophones

- **Preuve.** La landing écrit `fs_lang` au montage
  (`LandingPage.jsx:399`), avec une langue issue du navigateur
  (`LandingPage.jsx:122-126`). L'app lit `fs_lang`
  (`App.jsx:589`, `AuthConfirm.jsx:45`). Le nouveau `/` est en français seulement.
- **Scénario.** `site.js` reproduit l'écriture au chargement avec la langue de la
  page : tout navigateur anglais qui passe par `/` obtient `fs_lang='fr'`, et son
  app passe en français.
- **Correction.** Ne jamais écrire `fs_lang` au chargement. L'écrire seulement
  sur un choix explicite, ou sur un clic CTA depuis une page `/en/…`.

### M4 — MINEUR — Une OTA ou un binaire bâti sur un `dist/` « vitrine » démarrerait sur la page marketing

- **Preuve.**
  - OTA : `npm run build` puis `bundle upload --path dist`
    (`docs/agents/pieges.md:28`).
  - Binaire Android : `scripts/binaires-2.9.62.mjs:233-236` ne vérifie que
    `build.json`.
  - Natif : `capacitor.config.ts:6` (`webDir: 'dist'`), acquittement Capgo dans
    `src/main.jsx:29`, `appReadyTimeout` 10 s (`capacitor.config.ts:105`).
  - `FILLSELL_SITE=1` est prévu pour les vérifications locales.
- **Scénario.** Une vérification locale avec `FILLSELL_SITE=1` (ou une variable
  restée dans la session) suivie d'un envoi OTA : l'app native ouvre l'accueil
  statique, `notifyAppReady` n'est jamais appelé, Capgo revient en arrière après
  10 s. Pour un nouvel inscrit (`autoUpdate: 'atInstall'`), le premier lancement
  est raté.
- **Correction.**
  1. Les builds `FILLSELL_SITE` locaux écrivent dans `dist-site/`, jamais dans
     `dist/`.
  2. Le contrôle de livraison (OTA et `binaires-*`) échoue si
     `dist/index.html` ne contient pas `<div id="root"></div>` et
     `/assets/index-`.
  3. `npm run preview` ne lit pas `vercel.json` : il servirait l'accueil statique
     sur `/app`. Fournir un petit serveur local qui applique le rewrite.

### M5 — MINEUR — Effets du générateur hors de `dist/`

- **Preuve.**
  - `vite.config.js:48` importe tous les plugins au chargement de la config.
  - `prerenderBlog` charge ses dépendances lourdes à l'intérieur du hook
    (`scripts/vite-plugin-prerender-blog.mjs:279-282`), c'est le bon modèle.
  - `assertArbrePropre` (`scripts/build-id.mjs:1830+`) refuse un arbre sale.
- **Scénario.**
  - Un encodeur d'images natif (sharp, AVIF) importé en tête de
    `vite-plugin-site.mjs` se charge aussi pour les builds natifs, OTA et dev, et
    les fait tomber si le module natif manque.
  - Un cache d'images écrit dans le dépôt rend l'arbre sale : l'OTA suivante est
    refusée (« BUILD REFUSÉ »).
  - Un `buildCommand` qui n'appelle pas `npm run build` saute le hook `prebuild`
    (`check-legal-permissions`).
- **Correction.** Imports dynamiques dans la branche active seulement. Écritures
  limitées à `dist/` ou à un dossier ignoré (`node_modules/.cache/site`).
  `build:web` passe par `npm run build`.

### M6 — MINEUR — Exclusion mutuelle `prerenderBlog` / générateur : deux prédicats égalent un risque de « les deux » ou « aucun »

- **Preuve.** Les deux hooks sont en `writeBundle` avec l'ordre `post`
  (`prerender-blog.mjs:262-263`). `prerenderBlog` lit `dist/index.html` comme
  gabarit (`:266, :284`).
- **Scénario.**
  - « Les deux » : le blog est prérendu sur le gabarit de l'accueil statique,
    sans entrée SPA, ou le build échoue sur `setTag`.
  - « Aucun » : pas de `sitemap.xml`, et `/sitemap.xml` sert la coquille en
    HTML 200 (I4).
- **Correction.** Une seule fonction exportée `siteActif()`, appelée par les deux
  plugins. `site:verifier` exige `sitemap.xml` en XML.

### M7 — MINEUR — Le `noindex` de la coquille doit rester un en-tête sur `/app-shell.html`, jamais une balise dans la coquille

- **Preuve.** La coquille sert aussi `/legal` (dans le sitemap) et `/extension`.
  `useSeo` ne pose `robots` que sur demande (`src/lib/seo.js:82`).
- **Scénario.** Un `<meta name="robots" content="noindex">` ajouté à
  `app-shell.html` désindexe `/legal` et `/extension`.
- **Correction.** Garder la copie octet pour octet. Le `noindex` passe par un
  en-tête `vercel.json` sur `source: "/app-shell.html"`, en plus des règles
  existantes (`vercel.json:41-52`). Y ajouter `/auth/confirm`, `/desinscription`,
  `/ebay/retour`, `/demo/(.*)`.

### M8 — MINEUR — `cleanUrls` et `trailingSlash` : ne pas y toucher « pour le SEO » sans revoir l'app

- **Preuve.** § 1.
- **Scénario.**
  - `cleanUrls: true` : la destination `/app-shell.html` n'est plus conforme à
    la doc, et les liens profonds risquent de tomber.
  - `trailingSlash: true` : redirection 308 de `/app`, `/login`,
    `/auth/callback?code=…`, des retours Stripe et eBay, et de l'URL du popup de
    l'extension ; un saut de plus sur chaque retour tiers.
- **Correction.** Laisser les deux absents. Écrire tous les liens internes et
  canoniques sans slash final, et les contrôler dans `site:verifier`.

### M9 — MINEUR — PWA

- **Preuve.** `public/manifest.json:5` et `public/site.webmanifest:4` :
  `start_url: "/"`.
- **Scénario.** Chaque lancement de la PWA passe par l'accueil statique puis
  `/app`, ce qui ajoute un saut et dépend du garde (M1). Changer `start_url` sans
  `id` change l'identité de l'application installée : l'`id` vaut par défaut le
  `start_url`, d'où des doublons d'installation.
- **Correction.** Garder `/` ; si un jour on passe à `/app`, ajouter
  `"id": "/"` dans le même commit.

### M10 — MINEUR — Exigences Google OAuth sur la page d'accueil

- **Preuve.** La page d'accueil doit « Include a link to your privacy policy »,
  « Fully describe your apps functionality », et être « Visible to users without
  requiring them to log-in »
  (https://support.google.com/cloud/answer/13807376). Aujourd'hui, le pied de page
  porte `/legal#confidentialite` (`LandingPage.jsx:1585`).
- **Scénario.** Le nouvel accueil perd ce lien ou la description des données
  demandées : avertissement lors de la vérification de la marque OAuth (190 + 110
  comptes entrent par Google et Apple, `AuthConfirm.jsx:34-36`).
- **Correction.** Contrôle dans `site:verifier` : `/` contient un lien vers
  `/legal#confidentialite`, identique à celui de l'écran de consentement.

---

## 3. Matrice des chemins d'entrée réels (à jouer en test de fumée)

« Aujourd'hui » décrit `vercel.json:59` et AppRouter, « Après » l'architecture
corrigée.

| # | Entrée réelle (source) | Aujourd'hui | Après | Égal ? |
|---|---|---|---|---|
| 1 | `/?code=…` : confirmation retombée sur SITE_URL (`AppRouter.jsx:38-50`) | SPA → `/auth/confirm` | en ligne → `/auth/confirm` (I1 : AVANT le jeton) | oui si I1 |
| 2 | `/?token_hash=…&type=…` (gabarit TokenHash, `AuthConfirm.jsx:55-70`) | idem | idem | oui si I1 |
| 3 | `/?error=…&error_description=…#error=…` (lien expiré) | supabase-js 2.101.1 rend l'erreur et **garde** la session (« Don't remove existing session on URL login failure », `GoTrueClient.js:295-297`), puis `/app` si connecté, sinon landing | (I2) → `/login` : `/app` si connecté, sinon formulaire | oui, et mieux |
| 4 | `/#access_token=…` (lien du tableau de bord Supabase) | session posée → `/app` | **perdu** sans I2 | NON → I2 |
| 5 | `/reset-password?code=` (`App.jsx:6722`) | rewrite → SPA | rewrite → coquille | oui |
| 6 | `/auth/callback?code=` (OAuth web, `App.jsx:6443`) | idem | idem | oui (sauf B1) |
| 7 | `/auth/confirm?…` (`App.jsx:6736`) | idem | idem | oui (sauf B1) |
| 8 | `/success`, `/cancel?session_id=` (Stripe) | idem | idem | oui (sauf B1) |
| 9 | retour du portail Stripe = origine nue (`stripe-portal/index.ts:77-86`) | `/` → RedirectIfLoggedIn → `/app` | statique → `/app` | oui, avec un saut ; voir M1 |
| 10 | `/ebay/retour?etat=` (`_shared/ebay-oauth.ts:80`) | rewrite | rewrite | oui (sauf B1) |
| 11 | `/desinscription?t=` (mail ; le One-Click vise email-tunnel) | rewrite | rewrite | oui (sauf B1, I3) |
| 12 | `/extension` (mail send-extension-link) | rewrite | rewrite | oui (sauf B1, I3) |
| 13 | popup de l'extension → `/auth` (`config.js:6`) | SPA `*` → `/` | SPA `*` → ancienne landing | oui ; M2 propose `/auth` → `/login` |
| 14 | popup de l'extension → `/app` (`popup.js:20`) | rewrite | rewrite | oui |
| 15 | content script `fillsell-auth.js` sur `https://fillsell.app/*` | lit `sb-*-auth-token` | idem sur les pages vitrine (inoffensif) | oui |
| 16 | mails → `https://fillsell.app` (`email-tunnel/index.ts:283, 320`) | landing ou `/app` | statique ou `/app` | oui |
| 17 | `/login?offre=FILLSELL50` (`offreMail.js:2`) | SPA | SPA | oui ; `/?offre=` voir I5 |
| 18 | connecté qui tape fillsell.app | SPA, toile vide le temps de lire la session, puis `/app` | page masquée → `replace('/app'+search)` | oui |
| 19 | jeton mort (refus définitif ou réseau coupé) | landing | `/` → `/app` → `<Navigate "/">` côté client → ancienne landing ; **pas de boucle** | oui, avec un saut |
| 20 | déconnexion (`App.jsx:6923`) | landing SPA | ancienne landing SPA (M2) | oui |
| 21 | localStorage interdit (« bloquer tous les cookies ») | la landing SPA plante (`LandingPage.jsx:123`, sans `try`) | statique affiché si le script est sous `try` | mieux |
| 22 | PWA `start_url: "/"` | `/` → `/app` | statique → `/app` | oui ; voir M1, M9 |
| 23 | natif Capacitor (`webDir: dist`) | coquille | coquille (générateur éteint) ; voir M4 | oui |
| 24 | OTA Capgo (`npm run build` local) | coquille | coquille ; voir M4 | oui |
| 25 | `build.json` périmé → `location.reload()` sur `/app` (`App.jsx:2736-2748`) | rewrite | rewrite vers la coquille | oui (sauf B1) |
| 26 | `vite:preloadError` → recharge l'URL SPA (`main.jsx:71-84`) | rewrite | rewrite | oui (sauf B1) |
| 27 | URL inconnue | coquille → SPA `*` → `/` | idem (soft-404 en 200) | oui |
| 28 | `/index.html` demandé tel quel | coquille → `*` → `/` | accueil statique (même canonique) | sans gravité |
| 29 | robots | `Disallow: /app$`, `/app?`, `/api/` (`public/robots.txt:8-10`) | règles générées : garder les `$` | oui si gardés |

**Ce qui lit `index.html` explicitement :**

1. `vercel.json:59` (destination du rewrite) ;
2. `scripts/vite-plugin-prerender-blog.mjs:266, 284` (gabarit ; éteint quand la vitrine tourne, cf. M6) ;
3. Capacitor : `cap sync` copie `dist/` et charge `index.html` (non-Vercel seulement) ;
4. le serveur de dev Vite (racine du dépôt, inchangée).

Rien d'autre dans `src/`, `scripts/`, `chrome-extension/`, `supabase/functions/`
ni `serveur-cloud/`. Il n'y a pas de service worker : aucun cache de coquille à
invalider.

## 4. Tests à exiger avant le GO

1. **T1–T3, sur la prévisualisation avec l'en-tête de contournement.**
   - `/`, `/comment-ca-marche`, `/comment-ca-marche/`, `/blog/<slug>`,
     `/en/…` : marqueur `fillsell-page`, et pas de `id="root"`.
   - `/app`, `/login`, `/auth/callback`, `/auth/confirm`, `/success`, `/cancel`,
     `/reset-password`, `/extension`, `/ebay/retour`, `/desinscription`,
     `/legal`, `/demo/barre-progression`, `/auth` : la coquille.
   - `/assets/site/absent.js` : 404. `/sitemap.xml` : du XML. `/build.json` : du
     JSON.
2. **T4** — Selftest de l'aiguillage en ligne (environnement DOM simulé), cas
   1–4, 18, 19, 21 de la matrice, plus le stockage qui lève une exception et le
   garde (M1). Le cas `/?code=x` + jeton doit arriver sur `/auth/confirm`.
3. **T5** — Build sans `FILLSELL_SITE` et sans `VERCEL` : `dist/index.html` est
   la coquille, `dist/app-shell.html` existe (B1), aucun fichier vitrine.
4. **T6** — Build avec `buildCommand` : toute collision de la liste fermée (I3)
   fait échouer le build.
5. **T7** — Lecture de `coin_config` coupée (URL invalide) : le build finit en
   moins de 10 s sur le repli (I8).
6. **T8** — `curl -I` : `X-Robots-Tag` présent sur `/app-shell.html` et sur
   `/login`, absent sur `/legal` et `/` (M7, confirme la déduction du § 1).
7. **T9** — Test de fumée en prod juste après le GO, retour arrière prêt :
   - OAuth Google ;
   - confirmation par lien ouvert dans un autre navigateur ;
   - paiement test jusqu'à `/success` ;
   - retour eBay ;
   - désinscription ;
   - popup de l'extension « Se connecter » ;
   - visiteur connecté sur `/`.
8. **T10** — GTM Preview : `cta_click`, `page_view` et la balise AW se
   déclenchent sur la vitrine comme avant (I6).

## 5. Ce qui est BON et ne doit pas changer

- **Le principe** : le disque prime sur le rewrite (doc citée § 1), et le rewrite
  est renommé vers une coquille. En cas d'échec de la résolution sur `/`, on
  retombe sur la coquille, donc sur l'app d'aujourd'hui : un mode d'échec doux.
- **Aiguillages en ligne dans le `<head>`, pas dans `site.js`** : ils survivent à
  un 404 du CDN sur `site.js` (incident du 01/10). `location.replace` ne laisse
  aucune entrée d'historique, donc aucun rebond par le retour arrière.
- **Copie octet pour octet de la coquille**, avec échec si `<div id="root"></div>`
  ou l'entrée manque. `useSeo` mute les balises existantes de la coquille
  (`src/lib/seo.js:46-62`) : ne pas « nettoyer » la coquille.
- **Natif et OTA intouchés** tant que le générateur est éteint (`dist/index.html`
  reste la coquille ; `isNative` → `/login`, `AppRouter.jsx:118-119`).
- **La SPA garde `/` avec `RedirectIfLoggedIn` et `cibleConfirmation`**, et
  `RequireAuth` renvoie par `<Navigate>` côté client : c'est ce qui rend toute
  boucle impossible aujourd'hui.
- **Mêmes modules et mêmes clés** (`offreMail`, `acquisition`, `consentement`,
  `metaPixel`) plutôt qu'une réécriture, et un bandeau aux mêmes textes. La
  révocation depuis `/legal` reste valable partout.
- **`build.json` (no-store) et la garde `vite:preloadError` inchangés.**
  L'exclusion de `api/` et `assets/` du rewrite est gardée. La règle robots
  `Disallow: /app$` avec son `$` (`public/robots.txt:4-9`) est gardée.
- **Le build échoue sur un lien interne mort** ; « jamais de saut silencieux »
  doit s'étendre au cas B1.
- **Retour arrière** : un déploiement Vercel porte ensemble son `vercel.json` et
  son `dist`, donc l'Instant Rollback est cohérent. Rien côté base, natif ou
  extension n'a besoin d'évoluer en même temps.

## 6. Hors de cet angle (à transmettre)

La coquille copiée garde le canonique `https://fillsell.app`, l'`og:url` et les
JSON-LD Organization, SoftwareApplication et WebSite (`index.html:44, 82-157`).
Les routes SPA publiques (`/legal`, `/extension`) se déclarent donc comme l'accueil
tant que le JS n'a pas tourné, et le `SoftwareApplication` de la coquille (une
offre à 0 €) coexiste avec celui de la vitrine (quatre offres), sous le même `@id`
`https://fillsell.app/#app`.

Le retrait du canonique et des JSON-LD de la coquille est **sans risque pour
l'app** : `useSeo` recrée les balises absentes (`seo.js:49-54`). C'est à trancher
par la revue SEO.
