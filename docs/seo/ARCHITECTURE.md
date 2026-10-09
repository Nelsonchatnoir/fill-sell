# Site vitrine statique — architecture v2 (chantier SEO/GEO, 09/10/2026)

Branche `seo-crosslisting`, dossier `C:\Users\nicol\fill-and-sell-seo`. Rien n'est
déployé en production sans le GO de Nico. v2 = v1 corrigée par trois revues
adverses (`docs/seo/revue-architecture/a-risque-app.md`, `b-seo-technique.md`,
`c-perf-maintenance.md`) : chaque décision ci-dessous renvoie à son constat.

> **Écarts depuis la revue de la fondation (09/10, `docs/seo/revue-fondation/`)**
> — le code et `site/README.md` font foi : `/assets/site/*` en cache d'UNE heure
> (`must-revalidate`) et non `immutable`, tant que la prévisualisation n'a pas
> prouvé qu'un 404 n'emporte pas l'en-tête ; plus d'`indexnow.json` servi
> (`npm run site:indexnow-liste` compare les sitemaps après la mise en ligne) ;
> similarité = RECOUVREMENT (refus ≥ 40 %, toutes pages d'une langue) et non
> Jaccard < 0,5 par gabarit ; `/legal` au sitemap SANS `lastmod` ; verrou des
> dates refusé dans tout build local, simple avertissement sur Vercel ;
> langues (`site/langues.mjs`) et plateformes (`site/donnees/plateformes.yml`)
> déclarées comme données (§ 2.7 désormais implémenté) ; `build:web` renommé
> `build:vercel`.

## 1. Le problème

- `vercel.json` réécrit TOUT vers `/index.html` : l'accueil est servi vide aux robots
  (0 mot sans JS ; le blog, seul prérendu, en a 1 474 à 1 734).
- L'entrée JS pèse 674 Ko (220 Ko gzip) : à ne pas charger sur les pages vitrine.

## 2. Principe : deux mondes, une base de code

| | Site vitrine | App (inchangée) |
|---|---|---|
| Pages | `/`, `/en`, `/comment-ca-marche`, `/crosslisting/…`, `/plateformes/…`, `/comparatif/…`, `/alternative/…`, `/faq`, `/glossaire`, `/tarifs`, `/blog`, `/blog/<slug>`, `/en/…`, `404.html` | `/app`, `/login`, `/auth`, `/auth/*`, `/success`, `/cancel`, `/reset-password`, `/extension`, `/ebay/retour`, `/desinscription`, `/legal`, `/demo/*` |
| Rendu | HTML COMPLET écrit au build, aucune hydratation | SPA React (coquille + JS) |
| JS | script en ligne vital (aiguillages + captures) + `site.<hash>.js` non vital | entrée Vite |

### 2.1 Interrupteur explicite (revue A, bloquant)

- `vercel.json` : `"buildCommand": "npm run build:vercel"` → `scripts/site/build-vercel.mjs`
  (nommée `build:web` jusqu'à la revue de la fondation du 09/10, renommée pour ne pas
  être prise pour le « build web » des binaires)
  pose `FILLSELL_SITE=1` et lance `npm run build` (le `prebuild` reste joué).
- Une seule fonction `siteActif()` (`scripts/site/actif.mjs`) lue par TOUS les
  plugins : générateur actif ⇔ `prerenderBlog` éteint (jamais les deux, jamais aucun).
- `app-shell.html` est écrit dans TOUS les builds (plugin `appShell`, séparé du
  générateur) : copie octet pour octet de la coquille Vite, échec si
  `<div id="root"></div>` ou `/assets/index-` manque. Si le générateur saute, `/` reste
  la coquille et tout fonctionne comme aujourd'hui.
- Assertion de build : la destination de chaque rewrite de `vercel.json` existe dans
  le dossier de sortie.
- Builds locaux du site : `npm run site:apercu` écrit dans `build/site-apercu/`,
  JAMAIS dans `dist/` (natif, OTA) ; un petit serveur local rejoue `vercel.json`
  (fichiers d'abord, redirections, `trailingSlash`, rewrites, 404).
- Le générateur journalise toujours « site généré : N pages en X ms » ou « NON
  généré : raison » ; il ne lit plus la variable `VERCEL`.

### 2.2 La racine

Dans un build du site : coquille → `app-shell.html`, accueil statique → `index.html`.
Le rewrite de l'app vise `/app-shell.html`. Le disque passe avant les rewrites (doc
Vercel, citée par les revues A, B, C).

### 2.3 Aiguillages de l'accueil — script EN LIGNE dans `<head>`, ordre FIXE (revue A)

Une seule fonction source (`site/js/aiguillage.js`), bundlée et injectée en ligne,
couverte par `selftest:site-aiguillage` :

1. `?code=` ou `?token_hash=` → `location.replace('/auth/confirm' + search)` — AVANT
   toute lecture de session (bug du 16/09 : mauvais compte).
2. fragment `access_token=` / `error_description=` ou `?error_description=` →
   `location.replace('/login' + search + hash)` (supabase-js y consomme le fragment).
3. jeton `sb-<ref>-auth-token` portant un `refresh_token` → `location.replace('/app' +
   search)` ; au plus 2 départs en 20 s (sessionStorage ; s'il lève, on part) ; page
   masquée le temps de partir, démasquée par minuterie de secours (4 s) si on reste ;
   rejoué sur `pageshow` persisté.
4. Sur TOUTES les pages vitrine (pas seulement `/`) : `capterOffre()` et
   `capterSource()` en ligne, depuis les MÊMES modules (`src/lib/offreMail.js`,
   `src/utils/acquisition.js`) — la capture ne dépend pas de `site.js`.

Seules les étapes 1 à 3 sont propres à `/` (comme la route React aujourd'hui).

### 2.4 Balises et mesure (revue A)

- Le `<head>` commun (GTM, gtag `AW-16622098460`, Vercel Insights, noscript GTM) est
  lu dans `index.html` entre des marqueurs `<!-- site:balises:… -->` : le générateur
  échoue si un bloc manque. Rien d'ajouté, rien de retiré (le gtag AW chargé sans
  consentement est SIGNALÉ à Nico, pas modifié).
- `site.js` : `page_view {page:'landing'}` sur `/` (même série qu'aujourd'hui),
  `{page:<id>}` ailleurs ; `cta_click {cta:'signup_<lieu>'|'login'|'extension_webstore',
  page}` via `data-cta`, poussé avec `eventCallback` + `eventTimeout: 800` avant la
  navigation (le clic ne doit pas tuer la requête) ; `change_language`.
- `fs_lang` n'est JAMAIS écrit au chargement : seulement sur un choix explicite ou un
  CTA depuis une page `/en/`.
- Bandeau de consentement : textes dans `src/utils/consentementTextes.js`, importé par
  `BandeauConsentement.jsx` ET `site.js` ; mêmes clés de stockage.
- Quotas : seulement sur les pages qui portent `[data-quota]` (tarifs) ; valeurs lues au
  build (lecture publique de `coin_config`, `AbortSignal.timeout(3000)`, aucun essai,
  repli = `GRANTS_FALLBACK`, source écrite dans le HTML), relues au chargement par un
  `fetch` nu (aucun import de supabase-js) ; `tabular-nums` (pas de CLS).

### 2.5 Routage Vercel (revues A et B)

- Rewrites LIMITÉS aux routes réelles de la SPA (liste fermée
  `scripts/site/routes-app.mjs`, contrôlée par selftest contre les `<Route path>`
  d'`AppRouter.jsx` et contre les URL écrites par les mails, Stripe, eBay et
  l'extension) ; toute autre URL inconnue → `404.html` statique (fin du « soft 404 »).
- Le générateur échoue si une page vitrine tombe sur un chemin réservé à l'app.
- `"trailingSlash": false` (une seule forme d'URL) ; liens internes et canoniques sans
  slash final, vérifiés.
- `X-Robots-Tag: noindex` posé par en-tête sur les routes privées réelles (`/login`,
  `/auth`, `/auth/(.*)`, `/success`, `/cancel`, `/reset-password`, `/desinscription`,
  `/ebay/(.*)`, `/demo/(.*)`) ; la coquille elle-même ne porte aucune meta noindex
  (`/legal` et `/extension` restent indexables).
- Tout le statique de la vitrine vit sous `/assets/site/` avec des noms à empreinte
  (un fichier manquant = vrai 404, jamais la coquille en 200) ; règle de cache
  immutable dédiée (avif, webp, woff2, js, svg).

### 2.6 La SPA (changements minimes)

- `__FILLSELL_SITE__` (define, vrai seulement dans un build du site).
- Route `/` sur le web quand `__FILLSELL_SITE__` : si `RedirectIfLoggedIn` conclut
  « déconnecté » ET qu'aucun jeton `sb-*-auth-token` ne subsiste →
  `location.replace('/' + search + hash)` (accueil statique) ; sinon l'ancienne
  `LandingPage` (aucune boucle possible : on ne recharge `/` que sans jeton).
- Natif et builds hors site : strictement inchangés.

### 2.7 International dès la structure (consigne de Nico, 09/10 : « un jour on ouvrira à l'Europe et au monde »)

- Les langues sont une LISTE déclarée (`site/langues.mjs` : code, préfixe d'URL, code
  hreflang, `og:locale`, libellés de l'interface, format des dates et des prix), pas un
  `if (lang === 'fr')`. Aujourd'hui : `fr` à la racine, `en` sous `/en`. Demain : `/de`,
  `/it`, `/es`, `/nl`, `/pl`… en ajoutant une entrée et un dossier `site/contenu/<code>/`,
  sans toucher au générateur ni aux gabarits.
- Langue ≠ marché : les plateformes et leurs pays sont des DONNÉES
  (`site/donnees/plateformes.yml` : domaines par pays, pays ouverts dans FillSell, date).
  Ouvrir un pays = changer une donnée, et les pages qui en dépendent se mettent à jour.
- Une page existe dans n'importe quel sous-ensemble de langues ; hreflang ne relie que les
  versions qui existent ; `x-default` = la version anglaise quand elle existe (porte
  d'entrée internationale), sinon la version française.
- Les codes hreflang restent des LANGUES (`fr`, `en`) tant qu'il n'y a pas de contenu
  propre à un pays ; `en-GB` / `fr-BE` seulement le jour où le contenu diffère vraiment.
- Slugs neutres, sans « france » dans les URL des pages de fond (`/en/compare/best-crosslisting-apps`),
  pour qu'une page survive à l'ouverture d'un pays ; le périmètre du moment se dit dans le
  TEXTE, daté (« Aujourd'hui, FillSell fonctionne avec Vinted France, Leboncoin, eBay.fr et
  Beebs »), jamais comme une identité (« l'app des revendeurs français »).
- Prix et devises : affichés depuis une donnée (EUR aujourd'hui), jamais écrits dans la prose.

## 3. Arborescence

```
site/
  README.md                         comment ajouter une page
  contenu/fr/*.md, contenu/en/*.md  pages (frontmatter YAML validé + Markdown)
  donnees/*.yml                     faits partagés (plateformes, concurrents + sources datées)
  gabarits/*.mjs                    gabarits HTML
  styles/site.css                   système de design (tout en ligne, ≤ 20 Ko)
  js/site.js, js/aiguillage.js      JS vitrine
  medias/                           sources des images (le dossier « assets/ » est ignoré par git)
  medias/generees/ + manifeste.json sorties WebP/AVIF commitées (npm run site:images)
  polices/                          woff2 + OFL.txt
  dates.lock.json                   verrou des dates de mise à jour
src/blog/*.md                       articles (source unique, partagée avec la SPA)
scripts/site/*.mjs                  générateur, vérificateur, images, serveur d'aperçu
scripts/vite-plugin-site.mjs        branchement Vite
```

## 4. Contenu

- Frontmatter minimal VALIDÉ par schéma (messages en français qui nomment le fichier
  et le champ), YAML en `JSON_SCHEMA` (dates = chaînes). Champs : `id` (commun FR/EN),
  `type`, `slug`, `lang`, `title`, `description`, `h1`, `chapo` (réponse directe),
  `maj` (date), `publie`, `fil` (fil d'Ariane), `og`, `liens` (pages liées), et selon le
  type `faq`, `etapes`, `tableau`, `trajet`, `plateforme`, `concurrent`.
- Liens internes `[texte](page:<id>)` résolus dans le mdast (plugin remark, avant
  rehype) ; id inconnu = build rouge avec le nom du fichier ; la sortie refuse
  `href=""`, `#` seul et tout `page:` restant.
- Blog : `src/blog/*.md`, contrat de frontmatter actuel (une ligne par clé) ; un
  selftest prouve que le lecteur du site et celui de la SPA lisent la même chose.
- Pages futures (FillSell Cloud « sans ordinateur », trajets Depop) : prévues dans la
  structure avec `brouillon: true` — jamais générées, jamais dans le sitemap.

## 5. SEO technique

- Par page : `<title>` et description uniques, UN `<h1>`, canonical absolu sans slash
  final, hreflang fr/en réciproques + `x-default` (règle unique : version anglaise
  quand la paire existe), OG + Twitter (image propre), date de mise à jour visible =
  `dateModified` = `lastmod`.
- Dates honnêtes : empreinte du contenu principal + verrou `site/dates.lock.json` ;
  le vérificateur échoue si le contenu change sans nouvelle date ou l'inverse
  (`npm run site:dater`). Pas de `changefreq` ni `priority`.
- JSON-LD en un `@graph` par page : Organization et WebSite sur `/` (les autres pages
  y renvoient par `@id` : `#organization`, `#website`, `#app` inchangés) ;
  SoftwareApplication sur `/` et `/tarifs` (offres au prix affiché, P1M, EUR) ;
  BreadcrumbList partout sauf `/` ; Article/BlogPosting ; FAQPage et HowTo seulement
  s'ils reprennent le texte visible ; ItemList sur le classement. AUCUNE note ni avis.
- `robots.txt` : un seul groupe `*` (les règles actuelles, `$` compris) + Sitemap.
  Le 403 de Cloudflare aux robots d'IA est une DÉCISION de Nico (tableau de bord).
- `/llms.txt`, `/llms-full.txt` : `text/plain; charset=utf-8`, noindex, générés.
- IndexNow : `dist/indexnow.json` (URL dont la date a changé) + script lancé à la
  main APRÈS le GO.
- Garde de non-régression : les 9 URL du sitemap actuel restent (200, indexables,
  canonical sur elles-mêmes) ou sont redirigées en 301.
- Similarité : dans un même gabarit, Jaccard sur séquences de 5 mots < 0,5, sinon
  build rouge (pas de pages à la chaîne).

## 6. Performance

- Toute la CSS en ligne (≤ 20 Ko), aucun `style=` dans les gabarits.
- Polices auto-hébergées (Space Grotesk latin, OFL), un seul preload, repli métrique.
- Images AVIF/WebP générées en local et commitées, `width`/`height`, `lazy` sous la
  ligne de flottaison, `fetchpriority="high"` sur la seule image principale ; aucune
  URI `data:` de plus d'1 Ko ; logos de plateformes en fichiers.
- Budgets vérifiés au build : HTML ≤ 80 Ko, CSS en ligne ≤ 20 Ko, `site.js` ≤ 6 Ko gzip.
- Viewport : `width=device-width, initial-scale=1` (pas de `user-scalable=no`).

## 7. Vérifications

- Build : structure, budgets, liens, orphelines, hreflang, JSON-LD, chemins réservés,
  similarité, dates, parité des balises.
- Local : `npm run site:verifier` sur `build/site-apercu/` servi sans JS ;
  `selftest:site-*`.
- Prévisualisation (jeton de contournement Vercel) : matrice des chemins (vitrine en
  `/x` et `/x/`, chaque route de l'app reçoit la coquille, 404), Playwright mobile
  (LCP, CLS), bandeau puis consentement. La prévisualisation prouve le ROUTAGE, pas
  les flux d'auth réels : test de fumée en prod juste après le GO, Instant Rollback
  prêt.
