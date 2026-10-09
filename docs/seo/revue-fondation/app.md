# Revue de la fondation du site vitrine — angle « ne rien casser de l'app ni du natif » (09/10/2026)

Relecture du worktree `C:\Users\nicol\fill-and-sell-seo` (branche `seo-crosslisting`,
HEAD 8fa7007, arbre non commité), sans correctif : tout ce qui suit est relu et
rejoué, rien n'est modifié hors de ce rapport.

## Verdict

**Aucune régression de l'app ni du natif trouvée dans le code livré.** Le natif et
l'OTA sortent une coquille identique à aujourd'hui (plus un `app-shell.html`
inerte), toutes les URL écrites par les mails, Stripe, eBay, l'OAuth et
l'extension reçoivent la coquille avec leur query, les aiguillages de « / » font
ce qui est annoncé, et aucune boucle n'a pu être provoquée (30 scénarios
navigateur, dont jeton mort, réseau coupé, stockage qui lève).

**Trois points IMPORTANTS à régler avant la fusion sur `main`** : ils ne cassent
rien le jour J, mais transforment des gestes courants des AUTRES terminaux en
déploiement web bloqué ou en lien profond en 404 :

1. modifier `src/pages/Legal.jsx` ou un article `src/blog` sans `npm run site:dater`
   fait échouer le build Vercel, alors que `npm run build` local reste vert ;
2. une route ajoutée à `AppRouter.jsx` (ou une URL neuve dans un mail) sans
   `vercel.json` répond 404 en prod ; seul un selftest MANUEL le voit ;
3. `/assets/site/*` en `immutable` 1 an : un 404 pris par Cloudflare au
   déploiement y resterait un an (même classe que l'incident du 01/10).

## Ce qui a été rejoué

Sorties dans `build/revue-app/` (ignoré par git), jamais `build/site-apercu`
(partagé avec d'autres agents) ni `dist/`. Scripts de preuve hors du dépôt
(scratchpad de la session) : serveur d'aperçu sur les ports 4391 (site) et
4392 (build non site), matrice Playwright.

| Preuve | Commande | Résultat |
|---|---|---|
| Build non site | `FILLSELL_BUILD_ESSAI=1 npx vite build --outDir build/revue-app/natif` | `[app-shell] app-shell.html écrit (12719 o)`, `[prerender-blog] 6 article(s)`, `cmp index.html app-shell.html` → IDENTIQUES, `<div id="root"></div>` 1 fois, entrée `/assets/index-DMCMaAqh.js`, ni `assets/site`, ni `404.html`, ni `llms.txt` |
| Code `AccueilWeb` absent du natif | `grep -c 'auth-token$/' …/assets/index-*.js` | natif 0, site 1 (le `define` `__FILLSELL_SITE__=false` élimine la branche) |
| Build site | `FILLSELL_SITE=1 FILLSELL_BUILD_ESSAI=1 npx vite build --outDir build/revue-app/site` | « site généré : 15 pages en 1047 ms », « 321 liens internes contrôlés … 0 erreur(s), 10 avertissement(s) » |
| Coquille du site = coquille du natif | `diff` des deux `app-shell.html`, noms à empreinte masqués | identiques hors empreintes |
| Garde dist/ | `FILLSELL_SITE=1 FILLSELL_BUILD_ESSAI=1 npx vite build` | « ⛔ [site] FILLSELL_SITE=1 vers dist/ hors de Vercel : REFUSÉ », `dist/` jamais créé |
| Selftests | `npm run selftest:site-{aiguillage,routes-app,balises,blog-lecteurs,consentement}` | 39 / 116 / 82 / 106 / 18 vérifications, 0 échec |
| Bandeau React identique | `selftest:site-consentement` (rendu `renderToStaticMarkup` de HEAD contre l'actuel) | égalité octet pour octet ; textes de `consentementTextes.js` relus mot pour mot contre le JSX de HEAD |
| Lint | `npx eslint` sur les fichiers touchés | 0 erreur, 1 avertissement préexistant (`isNative`, AppRouter:145) |
| Natif | `capacitor.config.ts` (`webDir: 'dist'`, pas de `server.url`), `codemagic.yaml` (`npm run build`), `scripts/binaires-2.9.62.mjs` (`npm run build`), procédure OTA (`docs/agents/pieges.md`) | aucun chemin natif ou OTA n'allume `FILLSELL_SITE` ; OAuth natif par `app.fillsell.app://callback`, aucun lien universel |

### Matrice des chemins (serveur d'aperçu qui rejoue `vercel.json`)

| Chemin | Réponse |
|---|---|
| `/`, `/?code=x`, `/en`, `/index.html` | 200, accueil statique (`/?code=` part en JS, ci-dessous) |
| `/app`, `/app?tab=stock`, `/app/x`, `/extension`, `/extension?src=mail`, `/legal`, `/legal?lang=en` | 200, coquille, sans X-Robots-Tag |
| `/login`, `/login?mode=signup&offre=FILLSELL50`, `/auth`, `/auth/callback?code=abc`, `/auth/confirm?code=x`, `/auth/confirm?token_hash=t&type=signup`, `/success?session_id=cs_1`, `/cancel?session_id=cs_1`, `/reset-password?code=x`, `/ebay/retour?etat=ok`, `/desinscription?t=abc` | 200, coquille, `noindex, follow` |
| `/demo/barre-progression` | 200, coquille, `noindex, nofollow` |
| `/blog`, `/en/blog`, `/blog/cross-listing-vinted-leboncoin` | 200, pages statiques |
| `/blog/slug-inconnu` | 200, coquille (cf. constat 4) |
| `/app/`, `/extension/`, `/auth/`, `/blog/` | 308 vers le chemin sans slash |
| `/terms`, `/privacy` | 308 → `/legal` |
| `/nimporte`, `/stock`, `/pricing`, `/r/abc`, `/landing`, `/extension-guide` | 404, `404.html` |
| `/assets/site/inexistant.js` | 404 **avec `public, max-age=31536000, immutable`** (constat 3) |
| `/assets/inexistant.js` | 404 avec `public, max-age=3600, must-revalidate` (comme aujourd'hui) |
| `/build.json` | 200, `no-cache, no-store, must-revalidate` |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/manifest.json`, `/site.webmanifest`, `/fillsell-extension.zip`, `/favicon.ico` | 200 |

URL écrites dans le code, relevées à nouveau indépendamment
(`supabase/functions`, `chrome-extension`, `src`, `scripts/emails`) : `/`,
`/app`, `/login(?offre=)`, `/auth`, `/auth/callback`, `/auth/confirm`,
`/success`, `/cancel(?session_id=)`, `/reset-password`, `/extension`,
`/ebay/retour`, `/desinscription(?t=)`, `/legal(#…, ?lang=en#…)`, `/email/*`
(fichiers de `public/`). Toutes servies. Le retour du portail Stripe
(`stripe-portal`, `return_url` = `https://fillsell.app`) passe par l'accueil
statique puis `/app` (scénario 08).

### Matrice navigateur (Chrome via Playwright, tiers coupés, Supabase SIMULÉ — aucun appel réel)

Faux jeton `sb-tojihnuawsoohlolangc-auth-token` posé avant le premier script.
« docs » = suite des chargements du cadre principal.

| # | Scénario | Suite | Arrivée |
|---|---|---|---|
| 01 | `/` sans jeton | `/` | accueil statique, page visible |
| 02 | `/?code=abc` sans jeton | `/` → `/auth/confirm?code=abc` | AuthConfirm |
| 03 | `/?code=abc` + jeton valide | `/` → `/auth/confirm?code=abc` | « Un compte est déjà ouvert ici » (la confirmation passe AVANT la session) |
| 04 | `/?token_hash=th&type=signup` | → `/auth/confirm?token_hash=…` | AuthConfirm |
| 05 | `/#access_token=x&…&type=recovery` | → `/login#access_token=…` | fragment conservé |
| 06 | `/#error=…&error_description=…` | → `/login#error=…` | fragment conservé |
| 07 | `/?error_description=x` | → `/login?error=…` | — |
| 08 | `/?utm_source=tiktok` + jeton valide | → `/app?utm_source=tiktok` | app montée |
| 09 | `/` + jeton périmé, refresh refusé (400) | `/` → `/app` → `/` | accueil STATIQUE, jeton purgé, 3 chargements, aucune boucle |
| 10 | `/` + jeton périmé, réseau coupé | `/` → `/app` | reste sur `/app` (supabase-js réessaie), aucune boucle en 10 s |
| 11 | `/` + jeton SANS refresh_token | `/` | accueil statique (reste) |
| 12 | `/` avec `localStorage` qui lève | `/` | accueil statique visible (mieux qu'aujourd'hui, cf. plus bas) |
| 13-14 | `/?code=`, `/app` avec `localStorage` qui lève | → `/auth/confirm`, → `/` | coquille vide + erreur « Accès refusé » — **IDENTIQUE au build non site** (préexistant) |
| 15-16 | jeton périmé + `sessionStorage` qui lève | `/` → `/app` | coquille vide — **IDENTIQUE au build non site** (préexistant) ; aucune boucle même sans le garde des 2 départs |
| 17 | `/auth` sans jeton | `/auth` → `/` (SPA) → `/` (rechargé) | accueil statique |
| 18 | `/app?tab=stock` sans jeton | → `/` → `/` (rechargé) | accueil statique |
| 19 | `/login?mode=signup&offre=FILLSELL50` | `/login` | formulaire, `fs_offre_mail` posé |
| 20 | `/login` + jeton valide | → `/app` | app |
| 21 | `/auth/confirm?code=x` | `/auth/confirm` | « Ton compte est confirmé » (rendu simulé) |
| 22 | `/nimporte-quoi` | — | 404 statique « Page introuvable » |
| 23 | `/?offre=FILLSELL50` | `/` | `fs_offre_mail` posé par le script EN LIGNE |
| 24-28 | `/extension`, `/legal`, `/desinscription?t=abc`, `/ebay/retour?etat=ok`, `/success?session_id=cs_x` | — | chaque page de l'app rendue sur son chemin, query intacte |
| 29 | `/blog/slug-inconnu` | → `/blog` (SPA) | ANCIENNE liste React « Blog FillSell » (constat 4) |
| 30 | `/` → `/login` → jeton posé → retour arrière | `/` → `/login` → `/` → `/app` | app (rejeu au retour) |

Témoin : les scénarios 09, 10, 12-16 rejoués sur le build NON site (port 4392,
comportement de HEAD) donnent les mêmes coquilles vides pour 12-16 ; le site
statique répare 12 (l'accueil s'affiche même quand le stockage est interdit).

Invariant anti-boucle vérifié dans le code : `AccueilWeb` ne recharge « / »
que SANS aucune clé `sb-…-auth-token` (`AppRouter.jsx:91-109`), et
l'aiguillage ne part vers `/app` qu'AVEC un `refresh_token`
(`site/js/aiguillage.js`, `lireJeton`) ; aucun chemin ne recharge « / » quand
l'aiguillage partirait vers `/app`. Le jeton présent sans refresh_token (11)
et le jeton gardé après une coupure réseau (10) laissent l'ancienne
`LandingPage` en filet, sans rechargement.

## Constats

### 1. IMPORTANT — modifier `Legal.jsx` ou un article du blog bloque le déploiement web, et seul Vercel le voit

- **Preuve.** `scripts/site/routes-app.mjs:45` met `/legal` au verrou des dates
  avec l'empreinte du FICHIER `src/pages/Legal.jsx` ; `build-site.mjs:334-351`
  lève « DATES PÉRIMÉES » si elle change, et le générateur ne tourne QUE dans
  le build Vercel. Un commentaire ajouté suffit :

  ```
  verrou /legal       : bf0850cb280b5938a76e
  Legal.jsx actuel    : bf0850cb280b5938a76e
  Legal.jsx + 1 comm. : 2eaf10afeac99f152c95
  ```

  Fréquence réelle : `git log --since=2026-09-01 -- src/pages/Legal.jsx` →
  **22 commits**, dont 0.6.105 (08/10) et 0.6.106 (09/10), écrits par d'autres
  terminaux (permissions de l'extension dans la politique de confidentialité).
  Même mécanisme pour `src/blog/*.md` (empreinte du rendu). `npm run build`
  (non site, celui que les autres terminaux lancent) ne passe pas par le
  générateur : vert en local, ERROR sur Vercel, et la règle « le push tient
  lieu de validation » laisse la prod sur l'ancien déploiement sans que
  personne ne le voie — correctif urgent de l'app compris.
- **Correction proposée.** (a) `/legal` : ne jamais faire échouer le build
  pour un fichier de l'app — retirer son `lastmod` (Google l'accepte absent)
  ou le dater par `git log -1 -- src/pages/Legal.jsx` quand git répond, sans
  verrou ; (b) blog et `site/contenu` : rejouer le contrôle du verrou dans
  TOUS les builds (plugin `appShell`, qui tourne déjà partout, ou `prebuild`)
  pour que l'échec arrive en local AVANT le push ; (c) une ligne dans
  `CLAUDE.md` et `AGENTS.md` (« toucher `src/blog` = `npm run site:dater` »).

### 2. IMPORTANT — la liste fermée des routes n'est gardée que par un selftest manuel

- **Preuve.** Avant, `/((?!api/|assets/).*)` → `/index.html` couvrait toute
  route future ; désormais un chemin hors de `vercel.json` répond 404
  (`/stock`, `/pricing`, `/r/abc` → 404 ci-dessus). La seule vérification
  « AppRouter + URL du code ⊂ vercel.json » est `selftest:site-routes-app`
  (`package.json:21`), lancé à la main ; `vite-plugin-app-shell.mjs` ne
  vérifie que l'EXISTENCE des destinations, pas la couverture des routes.
  Rythme réel des ajouts : `/ebay/retour` (05/09), `/desinscription` (13/09),
  `/auth/confirm` (16/09), `/demo/barre-progression` (01/10) — quatre en
  cinq semaines, chacune ouverte par un lien PROFOND (mail, eBay, Supabase)
  qui tomberait en 404 ; la navigation interne de la SPA, elle, marcherait,
  donc rien ne se verrait en test.
- **Correction proposée.** Brancher la même vérification que le selftest dans
  le plugin `appShell` (tous les builds : natif, OTA, Vercel) : routes de
  `AppRouter.jsx` et URL `https://fillsell.app/…` de `src/`,
  `supabase/functions/`, `chrome-extension/` couvertes par `ROUTES_APP`, et
  `ROUTES_APP` ≡ rewrites de `vercel.json` — sinon le build refuse en nommant
  la route. Plus la règle dans `CLAUDE.md`/`AGENTS.md` (le commentaire de
  `routes-app.mjs` ne sera lu par aucun autre terminal).

### 3. IMPORTANT — `immutable` d'un an sur `/assets/site/*`, 404 compris

- **Preuve.** `vercel.json:25-29`. Le serveur d'aperçu, qui rejoue
  `vercel.json`, rend `/assets/site/inexistant.js` → 404 avec
  `public, max-age=31536000, immutable`. Sur Vercel, l'incident du 01/10 le
  laisse attendre : Cloudflare a gardé le 404 de l'entrée « une heure »
  (`CLAUDE.md`, section écran blanc), soit exactement le `max-age=3600` de la
  règle `/assets/(.*)` — l'en-tête de `vercel.json` accompagnait donc le 404.
  Ici, un 404 pris pendant une bascule (deux déploiements rapprochés, comme le
  01/10) serait gardé par le point de présence Cloudflare jusqu'au prochain
  changement d'empreinte du fichier, au plus un an : `site.js` (bandeau de
  consentement, menu, mesures), la police, les images. L'app n'est pas
  touchée (l'aiguillage est en ligne, les morceaux de l'app gardent 1 h).
- **Correction proposée.** Prouver sur la prévisualisation (`curl -sI` d'un
  `/assets/site/absent.js`, avec et sans `Origin`) AVANT la mise en ligne ; si
  l'en-tête suit le 404 : `public, max-age=3600, must-revalidate` comme l'app,
  ou une règle de cache Cloudflare « statut 404 → pas de cache » sur
  `/assets/*` (geste de Nico, côté Cloudflare).

### 4. MINEUR — un slug de blog inconnu ramène l'ANCIEN blog React

- **Preuve.** Scénario 29 : `/blog/slug-inconnu` → coquille (200) → `BlogPost`
  → navigation SPA vers `/blog` → `BlogList` React (h1 « Blog FillSell »), dont
  les liens restent dans la SPA (ancien gabarit des articles). Soft 404 en 200
  pour Google, et un second blog qui dérivera du statique. Voulu par
  l'architecture (`/blog/(.*)` gardé), mais l'effet n'était pas décrit.
- **Correction proposée.** `BlogPost` sur un slug inconnu :
  `location.replace('/blog')` sous `__FILLSELL_SITE__` (comme `AccueilWeb`),
  ou retirer `/blog/(.*)` des rewrites une fois le site en ligne (404.html).

### 5. MINEUR — couplages du build Vercel à des fichiers de l'app, lus par motif

- **Preuve.** Le build Vercel échoue (fort, jamais en silence) si :
  `const GRANTS_FALLBACK = { … };` change de forme dans
  `src/pages/LandingPage.jsx` (`scripts/site/lib/quotas.mjs:40-46` ; 18 commits
  de LandingPage depuis le 01/09, et l'accueil porte `{{quota:REPUB_FREE}}`) ;
  `export const supabaseUrl/supabaseAnonKey = '…'` change dans
  `src/lib/supabase.js` (`quotas.mjs:23-24`) ; un marqueur
  `site:balises:*` ou l'un des trois JSON-LD disparaît d'`index.html` ;
  un fichier `.html` apparaît dans `public/` (vérification Search Console, par
  exemple) : « page HTML sans marqueur fillsell-page »
  (`verify-site.mjs:159`). Comme au constat 1, `npm run build` local ne le
  voit pas.
- **Correction proposée.** Même remède qu'au 1 (b) : un contrôle léger dans
  tous les builds ; pour `public/*.html`, une liste d'exceptions nommée.

### 6. MINEUR — `/app-shell.html` est servi et indexable

- **Preuve.** `curl /app-shell.html` → 200, sans `noindex`, canonical
  `https://fillsell.app`. Le canonical limite le risque. La crainte du compte
  rendu (« un X-Robots-Tag désindexerait /legal ») ne tient pas dans le
  modèle que le serveur d'aperçu applique lui-même : les en-têtes suivent le
  chemin DEMANDÉ, pas la destination du rewrite.
- **Correction proposée.** `{"source": "/app-shell.html", "headers":
  [{"key": "X-Robots-Tag", "value": "noindex"}]}`, prouvé sur la
  prévisualisation avec `/legal` (qui doit rester sans en-tête).

### 7. MINEUR — nom de script `build:web` ambigu pour le natif

- **Preuve.** La procédure des binaires parle de « build web, cap sync »
  (`scripts/binaires-2.9.62.mjs:32`) et lance `npm run build`. Un agent qui
  lirait `build:web` comme « le build web du natif » serait arrêté par la garde
  dist/ (prouvée ci-dessus) : aucun dégât, mais un refus incompris.
- **Correction proposée.** Renommer en `build:vercel` (et dans
  `vercel.json` `buildCommand`).

### 8. MINEUR — l'accueil statique de démonstration n'a ni tarifs ni les ancres de l'ancienne landing

- **Preuve.** `grep '€' build/revue-app/site/index.html` → rien ; ancres
  présentes : `#navigation`, `#contenu` et quatre sections. L'ancienne landing
  avait `#tarifs`, `#faq`, `#comment`. Aucun lien du code ne vise ces ancres
  (relu), mais Stripe exige des prix visibles sur le site du compte, et des
  liens de campagne `/#tarifs` peuvent exister hors du dépôt.
- **Correction proposée.** À reprendre dans le vrai contenu avant la mise en
  ligne (déjà annoncé comme brouillon).

## Préexistant, hors périmètre (constaté, non introduit)

- Quand `localStorage` ou `sessionStorage` lève (Chrome « bloquer tous les
  cookies »), l'app plante en coquille vide sur `/app`, `/auth/confirm`,
  `/login` : même résultat sur le build non site (scénarios 12-16 du témoin).
  Le site statique améliore « / ».
- `/auth` (bouton « Se connecter » du popup de l'extension) finit sur l'accueil
  marketing et non sur `/login`, comme avec l'ancienne landing (décision de Nico
  déjà signalée).

## À prouver sur la prévisualisation Vercel (le serveur local ne le peut pas)

- en-têtes sur un 404 de `/assets/site/*` (constat 3) ;
- `404.html` servi avec des `rewrites` présents ;
- casse : le serveur d'aperçu apparie les `source` en tenant compte de la
  casse (`/LOGIN` → 404 en local) ; Vercel (path-to-regexp) ne le fait
  probablement pas — non vérifié, à relire, sans effet sur les URL écrites par
  le code ;
- `vercel.json` est RÉÉCRIT par la plateforme avant le build (`build-id.mjs`,
  `RECRITS_PAR_VERCEL`) : `verifierDestinationsRewrites` et le vérificateur
  lisent cette version ; si elle n'a plus de clé `rewrites`, leur contrôle
  passe à vide. Relire le journal du build de la prévisualisation.
- `VERCEL` posé pendant le build : probable (sinon la garde d'arbre propre
  aurait refusé tous les builds depuis le 01/10 sur « M vercel.json ») ; s'il
  manquait, la garde du plugin ferait échouer le build — bruyant, pas
  silencieux.
