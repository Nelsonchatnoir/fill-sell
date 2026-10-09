# Revue C — performance, Core Web Vitals, maintenabilité

Revue de `docs/seo/ARCHITECTURE.md` (site vitrine statique), 09/10/2026, branche
`seo-crosslisting`. Angle : poids, LCP / CLS / INP mobile, temps de build,
format du contenu, dérive entre l'accueil statique et l'ancienne `LandingPage`,
facilité d'ajouter une page, vérifications automatiques, ce qui casse au
prochain changement d'`index.html`.

Méthode : lecture du code (worktree `fill-and-sell-seo`, identique à
`origin/main`), mesures locales en lecture seule (rolldown, react-dom/server,
sharp et js-yaml du `node_modules` du worktree ; scripts jetables dans le
scratchpad de session, rien d'écrit dans le dépôt hors de ce fichier), `dist/`
du dossier principal (build du 09/10 12:46) pour les tailles réelles, docs
Vercel / web.dev lues en ligne, métadonnées Vercel du projet lues par l'API
(aucun appel à fillsell.app, aucun SQL, aucun déploiement).

**Verdict : l'architecture tient, avec corrections.** Le principe (HTML complet
écrit au build, servi en fichier avant le rewrite, coquille SPA à part) est le
bon pour les Core Web Vitals. Un point est bloquant tel qu'écrit (`site/assets/`
est ignoré par git), dix sont importants (le plus coûteux : deux accueils qui
vont dériver ; le plus traître : les liens `page:` vidés en silence par
react-markdown), seize sont mineurs.

---

## 0. Les affirmations factuelles, vérifiées

| Affirmation | Verdict | Preuve |
|---|---|---|
| « Vercel sert un fichier présent sur disque avant les rewrites » | **VRAI** | Doc `vercel.json` § rewrites : « precedence is given to the filesystem prior to rewrites being applied » (https://vercel.com/docs/project-configuration/vercel-json#rewrites). Preuve en prod : `/build.json` et `/blog/<slug>` (fichiers) sont servis malgré `"/((?!api/|assets/).*)" → /index.html` (`vercel.json:59`). |
| « Le point d'entrée JS pèse 674 Ko (220 Ko gzip) » | **VRAI** | `dist/assets/index-Cn-W8bkH.js` : 673 638 o brut, 219 271 o gzip -9, 192 418 o brotli. |
| « `site.<hash>.js` ~5 Ko » | **VRAI sous condition** | Les modules annoncés pèsent ensemble 4,0 Ko minifiés (offreMail 753 o, acquisition 1 705, consentement 438, metaPixel 1 012, analytics 104). Mais importer seulement `supabaseUrl`/`supabaseAnonKey` depuis `src/lib/supabase.js` tire tout supabase-js : **184 133 o min / 47 366 o gzip** (mesuré). Cf. M4. |
| « `app-shell.html` porte `X-Robots-Tag: noindex` » | **TROMPEUR** | Un `headers.source` « matches each incoming pathname » (même doc, § headers) : la règle ne vaut que pour une requête sur `/app-shell.html`, jamais pour `/app`, `/legal`, `/extension` réécrits vers elle. Cf. I7. |
| « Le générateur tourne si `process.env.VERCEL === '1'` » | **VRAI, à journaliser** | `VERCEL=1`, « Available at: Both build and runtime », mais la page conditionne l'exposition des variables système à un réglage du projet (https://vercel.com/docs/environment-variables/system-environment-variables). Cf. M16. |
| Space Grotesk et Plus Jakarta Sans auto-hébergeables | **VRAI** | `google/fonts` : `ofl/spacegrotesk/METADATA.pb` et `ofl/plusjakartasans/METADATA.pb` → `license: "OFL"` ; `OFL.txt` sans « Reserved Font Name ». Seule obligation : livrer la licence avec les fichiers (OFL 1.1, condition 2). |
| « Le natif n'embarque ni les pages vitrine ni leurs images » | **VRAI si** les images restent hors de `public/` **et** si `FILLSELL_SITE=1` n'écrit jamais dans `dist/` | Cf. I5. |
| « images WebP/AVIF, polices dans `site/assets/` » | **FAUX en l'état du dépôt** | `.gitignore:53` `assets/` → `git check-ignore -v site/assets/hero.avif` répond `.gitignore:53:assets/`. Cf. B1. |
| « Un lien vers une page inexistante FAIT ÉCHOUER le build » | **NON GARANTI** | react-markdown 10.1.0 réécrit `page:xxx` en `""` AVANT tout composant (démontré). Cf. I6. |

---

## 1. Bloquant

### B1 — `site/assets/` est ignoré par git : images, polices et OG ne partiraient jamais

- **Preuve** : `.gitignore:53` porte `assets/` (tout dossier de ce nom, à toute
  profondeur). `git check-ignore -v site/assets/hero.avif site/assets/fonts/x.woff2`
  → `.gitignore:53:assets/` pour les deux. `site/content/…`, `site/data/…`,
  `site/js/site.js`, `scripts/site/…` ne sont pas ignorés.
- **Scénario** : l'auteur pose `site/assets/hero.avif`, le build local passe
  (le fichier est sur le disque), `git add site/` ajoute tout SAUF les médias
  sans rien dire, `assertArbrePropre` (`scripts/build-id.mjs:1832`) voit un arbre
  propre (un fichier ignoré n'est pas « sale »). Sur Vercel, le générateur ne
  trouve pas les images : build rouge si le contrôle des dimensions lit le
  fichier, sinon pages servies avec des images 404 (LCP raté, CLS si les
  dimensions manquent).
- **Correction** : nommer le dossier autrement (`site/medias/`, `site/polices/`)
  plutôt qu'une exception `!site/assets/**` (une négation se perd au prochain
  ménage du `.gitignore`). Selftest : `git check-ignore` sur chaque fichier
  source que les gabarits référencent → échec s'il est ignoré.

---

## 2. Importants

### I1 — Deux accueils : l'ancienne `LandingPage` reste visible et va dériver

- **Preuve** : la SPA rend encore l'ancienne page sur tous ces chemins (pas
  seulement « déconnexion, adresse inconnue ») :
  - bouton « ← » de `/login` : `src/App.jsx:7091` `navigate("/")` — le visiteur
    qui clique « Créer un compte » sur l'accueil statique puis revient en arrière
    tombe sur l'ANCIEN accueil ;
  - déconnexion `src/App.jsx:6923`, suppression du compte `src/App.jsx:6948` ;
  - `RequireAuth` (`src/router/AppRouter.jsx:94`) : tout lien vers `/app` d'une
    personne déconnectée ;
  - route `*` (`AppRouter.jsx:156`) : toute adresse inconnue, y compris une URL
    SEO mal tapée ;
  - l'extension : `chrome-extension/config.js:6` `AUTH_URL: "https://fillsell.app/auth"`
    (bouton « Se connecter » du popup, `popup.js:1542`) — `/auth` n'existe pas →
    `*` → `/` → ancien accueil.
- **Coût** : `LandingPage.jsx` seule = 118 999 o minifiés / 20 506 o gzip
  (mesuré), plus ses logos (BeebsIcon 50 Ko, OplaIcon 30 Ko, LeboncoinIcon 12 Ko
  de source) et `landing.css`, dans le chunk d'entrée que **chaque** chargement de
  `/app` et `/login` télécharge (`AppRouter.jsx:9`, import statique).
- **Scénario de dérive** : un quota, un prix, une réponse FAQ, une promesse
  (« 45/jour ») change sur l'accueil statique ; personne ne pense à
  `LandingPage.jsx` (159 Ko de JSX) ; la personne qui se déconnecte voit
  l'ancienne promesse.
- **Correction** :
  1. web : la route `/` devient un composant de 5 lignes qui fait
     `location.replace('/' + location.search + location.hash)` (document complet
     → Vercel sert l'accueil statique), sous un drapeau de build
     `__FILLSELL_ACCUEIL_STATIQUE__` posé quand le générateur tourne (en `vite dev`
     ou build local sans site, on garde `LandingPage` en `lazy()`, sinon boucle) ;
     natif inchangé (`/` → `/login`) ;
  2. `vercel.json` : redirection `/auth` → `/login` (l'extension ne change pas
     sans passage au Web Store) ;
  3. une fois l'accueil statique stable : supprimer `LandingPage.jsx`,
     `landing.css`, `GRANTS_FALLBACK` en double. Une seule page d'accueil.

### I2 — Logos de plateformes en base64 : un portage « tel quel » donne un accueil d'1 Mo

- **Preuve** : `src/components/platform-logos/BeebsIcon.jsx` embarque un PNG
  512×512 en `data:` (50 242 caractères), `LeboncoinIcon.jsx` 12 126, `OplaIcon.jsx`
  ~30 Ko ; `LandingPage.jsx` appelle `<PlatformLogo>` 36 fois (Beebs 12,
  Leboncoin 12). Rendu serveur de `LandingPage` (react-dom/server, mesuré) :
  **999 221 o de HTML, 652 640 o gzip, 64 461 o brotli, dont 873 124 o de base64
  (28 copies)**. Sans les base64 : 126 097 o, 15 409 o gzip.
- **Pourquoi gzip n'aide pas** : la fenêtre deflate est de 32 Ko, une copie de
  50 Ko n'est jamais dédupliquée ; brotli la déduplique, mais un robot ou un
  outil qui ne demande que gzip (ou rien) reçoit tout. Chaque copie est aussi
  décodée à part dans le navigateur.
- **Scénario** : « une seule base de code » pousse à réutiliser `PlatformLogo`
  dans les gabarits via `renderToStaticMarkup` (comme react-markdown) ; chaque
  page plateforme / comparatif répète les logos.
- **Correction** : logos en fichiers (SVG pour Vinted/eBay, déjà vectoriels ;
  WebP 64 et 128 px pour Beebs/Leboncoin/Opla/Depop : le PNG Beebs fait
  37 664 o pour un affichage de 9 à 40 px) ou un sprite SVG, servis une fois et
  mis en cache. Règle de build : aucune URI `data:` de plus d'1 Ko dans le HTML
  produit. Bénéfice annexe : les mêmes fichiers allègeraient l'app plus tard.

### I3 — Le vrai poids JS des pages vitrine, ce sont les balises tierces (≈ 280 Ko gzip)

- **Preuve** (mesuré le 09/10) : `gtm.js?id=GTM-TJNKL6T5` 354 714 o brut /
  124 914 o gzip (le conteneur porte aussi GA4 `G-2ZYVK404G9`) ;
  `gtag/js?id=AW-16622098460` (`index.html:160`) 449 907 o / 154 906 o gzip.
  « Mêmes balises dans le `<head>` » = **≈ 280 Ko gzip / 805 Ko brut de JS tiers à
  parser et exécuter sur chaque page vitrine**, plus que l'entrée SPA actuelle
  (219 Ko gzip). `site.js` à 5 Ko ne décrit pas le coût réel ; TBT et INP mobiles
  seront dominés par ces deux scripts (deux bibliothèques gtag chargées).
- **Correction** : mesurer en labo avec et sans balises (cf. § 5) avant de
  promettre un score ; proposer à Nico de faire passer la balise Google Ads par
  GTM (une seule bibliothèque au lieu de deux) ; aucune balise nouvelle sur les
  pages vitrine sans décision. Hors de mon angle mais à transmettre à la revue
  consentement : `gtag/js?id=AW-…` est un traceur publicitaire chargé sans
  consentement, à l'inverse de la doctrine écrite dans
  `src/utils/consentement.js` ; le recopier sur cent pages étend le problème.

### I4 — « Bloc GTM relu dans `index.html` » ne suffit pas : le reste de la tête va dériver

- **Preuve** : la tête d'`index.html` porte, hors du bloc GTM : la balise Google
  Ads (`:160`), Vercel Analytics (`:17`), le `<noscript>` GTM dans le `<body>`
  (`:215`), le correctif iOS `text-size-adjust: 100%` marqué « ⚠️ NE PAS
  RETIRER » (`:185-186`), favicons / manifest / `theme-color`, le JSON-LD
  Organization. Et ses commentaires la décrivent encore comme LA tête de
  l'accueil (`:23-28`, « TITRE : décrire le produit… Cas réel 2026-07-30 »).
- **Scénario** : demain quelqu'un ajoute une balise (Clarity, TikTok revenu avec
  consentement) ou corrige le titre « de l'accueil » dans `index.html` : la
  première manque sur toutes les pages vitrine, le second ne change que la
  coquille de l'app (servie sur `/legal`, `/extension`…), l'accueil réel ne
  bouge pas. Inversement, le correctif iOS oublié dans les gabarits fait
  revenir le wordmark rétréci sur Safari mobile (bug du 03/08).
- **Correction** : une source unique pour la tête commune —
  `site/partials/tete-commune.html` injecté dans `index.html` par un petit plugin
  Vite (`transformIndexHtml`) ET inclus par les gabarits ; test de parité : tout
  `<script src>` externe et tout `link rel=icon|manifest|preconnect` de
  `dist/app-shell.html` est présent sur chaque page vitrine, ou figure dans une
  liste « app seulement » écrite. Retirer d'`index.html` les balises propres à
  l'accueil (canonical, `og:url`, hreflang vers la racine) et réécrire ses
  commentaires : « coquille de l'app ; l'accueil = `site/content/fr/accueil.md` ».

### I5 — `FILLSELL_SITE=1` écrit l'accueil statique dans `dist/`, le dossier du natif et de l'OTA

- **Preuve** : § 2.1 de l'architecture (`FILLSELL_SITE === '1'` pour les
  vérifications locales, même `dist/`) ; `capacitor.config.ts:6` `webDir: 'dist'` ;
  CLAUDE.md : l'OTA part du dossier principal (`npx @capgo/cli bundle upload`
  après `npm run build`) ; `src/main.jsx:29` `notifyAppReady()` est la première
  instruction de l'entrée SPA, absente d'une page statique.
- **Scénario** : vérification locale `FILLSELL_SITE=1 npm run build`, la
  variable reste dans le terminal (PowerShell `$env:`), OTA envoyée ensuite :
  le natif démarre sur l'accueil statique, le script en ligne voit le jeton et
  part vers `/app`, Capacitor resert `index.html` (l'accueil), garde anti-boucle,
  pas de `notifyAppReady` → retour arrière Capgo au bout de 10 s, après un
  lancement raté chez chaque utilisateur. Variante locale : `vite preview`
  retombe sur `dist/index.html` pour `/app` → l'accueil s'affiche à la place de
  l'app, la vérification locale ment.
- **Correction** : un build local du site n'écrit **jamais** dans `dist/` : sortie
  `build/site-apercu/` (déjà ignoré par `build/`), script `npm run site:apercu`
  avec un petit serveur qui rejoue `vercel.json` (fichier d'abord, puis
  `app-shell.html`). Garde côté natif : les chemins OTA / binaires refusent un
  `dist/` qui contient `app-shell.html` ou dont l'`index.html` n'a pas
  `<div id="root"></div>`.

### I6 — Les liens `page:<id>` sont vidés par react-markdown avant d'arriver au code

- **Preuve** : `node_modules/react-markdown/lib/index.js:124`
  `const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i` et
  `defaultUrlTransform` (`:421-444`) rend `''` pour tout autre protocole.
  Démonstration (react-markdown 10.1.0, `renderToStaticMarkup`) :
  `[le comparatif](page:comparatif-vendoo)` → `<a href="">le comparatif</a>`, et
  un `components.a` reçoit `href: ""` — pour une page existante comme pour une
  inexistante.
- **Scénario** : la résolution est écrite dans `components.a` (le geste le plus
  naturel) : tous les liens internes pointent sur la page elle-même, aucun ne
  fait échouer le build, et un contrôle « liens internes valides » qui accepte
  `href=""` (lien vers soi) passe au vert. Maillage interne nul, sans alerte.
- **Correction** : résoudre dans un plugin remark (nœuds `link` du mdast, avant
  rehype et avant `urlTransform`), lever une erreur nommant le fichier pour un
  id inconnu ; le contrôle de sortie refuse `href=""`, `href="#"` et toute chaîne
  `page:` restante. Les gabarits (menu, pied, hubs) passent par le même
  résolveur d'id, jamais par un chemin écrit à la main.

### I7 — En-têtes de cache : `avif`/`woff2` oubliés, `immutable` sur des noms non hachés, `noindex` de la coquille sans effet

- **Preuve** : `vercel.json:12` `/(.*)\.(png|jpg|jpeg|svg|ico|webp)` →
  `max-age=31536000, immutable` sur des noms NON hachés ; `avif` et `woff2`
  absents (défaut Vercel : revalidation à chaque vue) ; `/assets/(.*)` →
  `max-age=3600, must-revalidate` (`:18`) ; `X-Robots-Tag` appliqué au chemin
  entrant (doc ci-dessus), pas à la destination d'un rewrite. Cloudflare devant
  (CLAUDE.md, incident du 01/10) garde ce que Vercel lui dit de garder.
- **Scénarios** : une image vitrine retouchée en gardant son nom reste
  l'ancienne un an chez les visiteurs revenus ; la police préchargée est
  revalidée (304) à chaque page ; les versions AVIF et WebP d'une même image
  n'ont pas la même durée de cache.
- **Correction** : tout fichier du site (polices, images, `site.js`) nommé par
  son empreinte, sous un seul préfixe (ex. `/s/`), une seule règle
  `"/s/(.*)"` → `public, max-age=31536000, immutable` ; jamais de remplacement à
  nom constant. Pour la coquille : si l'intention est « routes de l'app hors
  index », la poser sur les sources réelles (`/app`, `/login`… existent déjà
  pour certaines), pas sur `/app-shell.html` ; `/legal` et `/extension`
  restent à trancher (indexables ou non) par la revue SEO.

### I8 — Format du contenu : deux dialectes de frontmatter, et des pièges YAML silencieux

- **Preuve** :
  - le blog garde son parseur maison (`src/blog/frontmatter.js` : ligne à ligne,
    une valeur multi-lignes est TRONQUÉE) côté SPA (`posts.js`), alors que le
    site lira du YAML : deux lecteurs pour les mêmes `src/blog/*.md` (« source
    unique partagée avec la SPA »). Aujourd'hui les 6 articles donnent le même
    résultat avec les deux (mesuré) ; le premier `faq:` écrit en liste YAML sera
    lu par l'un et broyé par l'autre (`{"faq":"","- q":"…","a":"…"}`, mesuré) ;
  - pièges js-yaml mesurés : `titre: Cross-listing : vendre…` (deux-points
    français non cité) → erreur (bruyant, bien) ; `description: Le n°1 #revente`
    → **`"Le n°1"` en silence** (commentaire) ; `mis_a_jour: 2026-10-09` → objet
    `Date` (un gabarit naïf écrit « Fri Oct 09 2026 02:00:00 GMT+0200 » dans la
    page et le JSON-LD) ; une réponse FAQ contenant « : » dans une liste YAML →
    erreur ;
  - `js-yaml` n'est pas déclaré : le 4.1.1 hissé vient d'eslint ;
    `gray-matter` est déclaré, inutilisé, et embarque js-yaml 3.15.
- **Correction** : frontmatter minimal (id, titre, description, gabarit,
  `mis_a_jour` en chaîne), validé par un schéma écrit dans le générateur
  (champ manquant, type, longueur de titre et de description) avec un message
  français qui nomme le fichier et le champ ; `yaml.load(…, { schema: JSON_SCHEMA })`
  pour que les dates restent des chaînes ; FAQ et étapes HowTo dans le CORPS
  Markdown (`## Questions fréquentes` / `### La question`), pas en YAML — plus
  simple pour un humain comme pour Codex ; un seul lecteur de frontmatter pour
  le blog et le site, ou au minimum le selftest « les deux lecteurs donnent le
  même résultat sur `src/blog/*.md` » ; `js-yaml` épinglé en devDependency
  (doctrine « versions épinglées » du dépôt), `gray-matter` retiré.

### I9 — Les vérifications prévues n'ont ni budget de poids ni mesure CWV, et la prévisualisation est fermée aux outils

- **Preuve** : § 5 de l'architecture (contenu, liens, JSON-LD, sitemap ;
  aucun seuil de poids, de LCP ou de CLS) ; projet Vercel `fill-sell`
  (`get_project`) : `ssoProtection.deploymentType = "all_except_custom_domains"`
  → toute URL de prévisualisation exige une session Vercel. Ni un script, ni
  PageSpeed Insights, ni le test des résultats enrichis n'y entrent sans le
  jeton « Protection Bypass for Automation » (en-tête
  `x-vercel-protection-bypass`). Le dépôt n'a pas de CI (`.github/workflows`
  absent) : 230 selftests lancés à la main.
- **Scénario** : « testés sur la prévisualisation » se termine sur la page de
  connexion Vercel ; les régressions de poids (I2, M4) passent parce que rien ne
  les mesure.
- **Correction** : trois niveaux (détail au § 5) — contrôles **dans le build**
  (le générateur échoue : rien n'est déployé), `selftest:site-*` locaux, et une
  passe Playwright sur la prévisualisation avec le jeton de contournement (à
  générer par Nico, gardé hors du dépôt).

### I10 — Un fichier statique masque une route de l'app, sans erreur

- **Preuve** : la priorité au disque (doc citée) vaut pour TOUT chemin ;
  l'app sert `/extension` (cible du mail `URL_EXTENSION`,
  `supabase/functions/_shared/emails-fillsell.ts:57`), `/legal` (mentions de
  chaque mail, `_shared/email-template.ts:40-46`), `/login`, `/success`,
  `/cancel` (Stripe, `create-checkout-session/index.ts:359-360`),
  `/ebay/retour`, `/desinscription`, `/auth/*`, `/demo/*`.
- **Scénario** : une page SEO naturelle « L'extension Chrome FillSell » prend
  l'id `extension` → `dist/extension/index.html` → le lien du mail
  `send-extension-link` ouvre la page marketing au lieu de la page
  d'installation ; même chose pour `legal` ou `tarifs` si un jour `/tarifs`
  devient une route de l'app.
- **Correction** : liste des chemins réservés à l'app, lue par le générateur
  (échec si une page la touche) et contrôlée par un selftest contre les
  `<Route path>` d'`AppRouter.jsx`.

---

## 3. Mineurs

- **M1 — Polices.** Auto-hébergement : bon (supprime la feuille bloquante
  tierce `index.html:75-76` et deux origines ; web.dev : « a self-hosted font
  should deliver better performance as it eliminates a third-party connection
  setup », https://web.dev/articles/font-best-practices). Fichiers réels
  (servis par Google le 09/10) : Space Grotesk latin = **un** woff2 variable
  300-700 de 22 288 o ; Plus Jakarta Sans italique 800/900 latin 12 596 o. La
  plage `latin` couvre œ, €, « », U+202F. À faire : livrer les `OFL.txt` ; un
  seul `preload` (Space Grotesk latin) ; wordmark en SVG pour retirer Jakarta
  des pages vitrine ; repli métrique (`size-adjust`, `ascent-override`, calculés
  une fois, écrits en dur) pour limiter le décalage du H1 à 38 px
  (`LandingPage.jsx:557`, `clamp(38px,5.2vw,64px)`). Inventaire d'abord :
  `blog.css:70,109,143,157` demande Jakarta ROMAIN 700/800 pour les titres du
  blog alors qu'`index.html` ne charge que l'italique 800/900 — le nouveau
  gabarit doit trancher (les titres de blog sont l'élément LCP probable).
- **M2 — CSS en ligne, entièrement.** « CSS critique en ligne » suppose un
  outil d'extraction (beasties/critters, absents du dépôt) et un second fichier
  chargé après coup (source de décalage). `landing.css` 10 646 o + `base.css`
  2 734 o + `blog.css` 7 765 o ≈ 21 Ko brut, ~5 Ko brotli : tout mettre en ligne
  tant que la feuille reste sous ~20 Ko brut, aucun fichier CSS externe. Pas
  d'attributs `style=` dans les gabarits (le rendu de `LandingPage` en porte
  685, 71 116 o).
- **M3 — Bandeau de consentement.** `position: fixed` en bas
  (`BandeauConsentement.jsx`) : pas de CLS (web.dev : « the cookie notice
  shouldn't cause content shifts when it loads ») ; mais il peut devenir
  l'élément LCP sur mobile (« this can happen—particularly on mobile devices »,
  https://web.dev/articles/cookie-notice-best-practices) et, injecté par
  `site.js` différé, il fixerait le LCP à son heure d'apparition. Mesurer avec
  un stockage vide ; jamais de `padding-bottom` ajouté au `body` pour lui ; ses
  textes dans un module partagé (`src/utils/consentementTextes.js`) importé par
  le composant React ET par `site.js`, pas recopiés.
- **M4 — `site.js` : budget et graphe d'imports.** Mesuré : importer seulement
  les constantes de `src/lib/supabase.js` tire supabase-js (184 Ko min / 47 Ko
  gzip, le `createClient` du module est un effet de bord que le bundler garde).
  Sortir les constantes dans `src/lib/supabaseConfig.js` (sans effet de bord),
  lecture de `coin_config` par `fetch` nu ; selftest de la liste blanche des
  modules importés par `site.js` (aucun `node_modules`, aucun `@capacitor/*`) ;
  budget 10 Ko min / 4 Ko gzip vérifié au build.
- **M5 — Quotas relus au chargement.** Un aller-retour Supabase par vue (avec
  en-tête `apikey` : requête préalable CORS en plus) sur toutes les pages ; un
  chiffre qui change de largeur décale la carte si elle est visible. Ne relire
  que sur les pages qui portent `[data-quota]`, `font-variant-numeric:
  tabular-nums` et largeur réservée en `ch` ; repli partagé avec l'app (pas un
  second `GRANTS_FALLBACK`, `LandingPage.jsx:100`) ; lecture du build bornée à
  3 s et journalisée (« quotas : base » / « quotas : repli »).
- **M6 — Animations et masquage.** Les animations de `landing.css` sont
  surtout `transform`/`opacity` (bien) ; `fsPulse` (box-shadow), `fsShimmer`
  (background-position), `fsSweep`/`fsWipe` (clip-path) repeignent à chaque
  image : à éviter au-dessus de la ligne de flottaison. Révélation au
  défilement : n'armer (opacité 0) que DANS `site.js`, jamais par une règle CSS
  par défaut — si `site.js` prend un 404 au déploiement (incident Cloudflare du
  01/10), le contenu doit rester visible ; le héros n'est jamais armé (il porte
  le LCP). « Page masquée le temps de partir » : démasquer si la garde
  anti-boucle empêche le départ, et rejouer la décision sur `pageshow`
  (`persisted`, retour par le cache avant/arrière).
- **M7 — Images.** Gains AVIF mesurés (sharp 0.34.5, déjà en devDependency) :
  image type OG 60 140 → 24 834 o, casquette 10 198 → 5 942 o, short 37 462 →
  30 887 o ; coût d'encodage 85 ms à 2,1 s par image et par largeur (effort 4 à
  7). Ne jamais encoder au build Vercel (build actuel ≈ 12 s, cf. M8) :
  `npm run site:images` local, sorties commitées + un manifeste JSON
  (largeur, hauteur, empreinte) que les gabarits lisent — `width`/`height` ne
  s'écrivent jamais à la main. AVIF seulement là où il gagne ≥ 20 %.
- **M8 — Cadence de déploiement.** 11 déploiements de production en ~24 h le
  08-09/10 (`list_deployments`), la plupart des commits `docs` ; le dernier :
  12,3 s de `buildingAt` à `ready`. Chaque déploiement renomme l'entrée SPA
  (l'identifiant de build vit dans le chunk `App`, l'entrée référence son
  empreinte) — une correction de texte SEO redéploie donc l'app, avec les
  risques connus (18/09, 01/10). Budget du générateur : ≤ 5 s, chronométré dans
  le journal. Un `ignoreCommand` « docs seulement » serait tentant mais
  risqué : l'exemple officiel compare `HEAD^` (le dernier commit d'un lot
  seulement, https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel)
  — hors de ce chantier.
- **M9 — Deux moteurs de blog et deux sitemaps.** `prerenderBlog()` reste pour
  les builds non Vercel, le générateur fait l'autre : deux rendus d'article,
  deux JSON-LD Article, deux sitemaps à tenir. Le natif n'a pas besoin des pages
  de blog : retirer `prerenderBlog` quand le site est en ligne (le `dist/` natif
  perd `blog/*` — inoffensif, à écrire).
- **M10 — Barre oblique finale.** `trailingSlash` non défini : `/x` et `/x/`
  servent la même page (« not recommended because it could lead to search
  engines indexing two different pages with duplicate content », doc
  `vercel.json`). Poser `"trailingSlash": false` et le vérifier sur les routes
  de l'app.
- **M11 — Viewport.** `index.html:22` `maximum-scale=1.0, user-scalable=no` :
  ne pas le recopier dans les gabarits (audit d'accessibilité Lighthouse
  `meta-viewport`) ; c'est un choix de l'app, pas du site.
- **M12 — Un saut de plus pour les connectés.** `URL_APP = "https://fillsell.app"`
  (`_shared/emails-fillsell.ts:56`, 74 occurrences de l'origine nue dans
  `supabase/functions/`), retour du portail Stripe (`stripe-portal/index.ts:77`),
  `start_url: "/"` (`public/manifest.json:5`) : la personne connectée charge
  l'accueil statique puis repart vers `/app`. Coût faible (HTML de CDN), à
  mesurer ; plus tard, `URL_APP` et `start_url` vers `/app` quand `/app`
  déconnecté renverra vers l'accueil statique (I1).
- **M13 — Documentation pour un autre terminal ou Codex.** `AGENTS.md` fait
  **32 753 octets** commités (`git cat-file -s HEAD:AGENTS.md`) pour une limite
  de lecture de ~32 768 : aucune règle du site n'y tient. Écrire
  `docs/agents/site-vitrine.md` + `site/README.md`, une ligne de renvoi qui en
  remplace une autre dans `AGENTS.md`/`CLAUDE.md`. Le chantier vit dans un
  worktree alors que CLAUDE.md impose un seul dossier de travail et interdit
  l'OTA depuis un worktree : fusionner, puis éditer le site depuis le dossier
  principal.
- **M14 — Les selftests du dépôt ne voient pas le site.**
  `scripts/depop-partout-selftest.mjs:31` ne lit que `src`,
  `supabase/functions`, `chrome-extension` (et des objets JS, pas du YAML) : une
  liste de plateformes dans `site/data/*.yml` échappe à la règle « toute liste
  nomme Depop ou dit pourquoi ». Étendre aux fichiers du site.
- **M15 — Prix en dur.** Les prix vivent déjà dans `LandingPage.jsx`,
  `ConversionModal.jsx`, `PlanDetailsModal.jsx`, `businessOffer.js`,
  `translations.js`, `iap.js`, `SousPageAbonnement.jsx`, `App.jsx` ; le site
  ajoute `site/data` et le JSON-LD `offers`. Selftest de cohérence.
- **M16 — Le saut silencieux du générateur.** Journaliser « site généré :
  N pages en X ms » ou « site NON généré : raison » ; relire une fois un journal
  de build Vercel pour confirmer `VERCEL=1` ; jamais de saut sans ligne au
  journal (même doctrine que le filet de `prerender-blog`).

---

## 4. Ce qui est bon et ne doit pas changer

- **Le principe statique.** HTML complet, aucune hydratation : le LCP mobile
  devient le premier rendu du H1 (CSS en ligne, rien de bloquant), le TBT
  propre au site tend vers zéro. Les pages de blog cessent de charger l'entrée
  de 674 Ko et le chunk `BlogPost` de 157 Ko.
- **La coquille à part** (`app-shell.html`) et un seul rewrite modifié : le
  minimum de changement dans `vercel.json`, sur un comportement documenté.
- **Le build qui échoue fort** si la coquille n'est pas écrite ou incomplète
  (même doctrine que `setTag` de `prerender-blog`) ; garder `writeBundle` +
  `order: 'post'` (leçon du 18/09 : jamais `closeBundle`).
- **Le natif à l'écart** (génération seulement sur Vercel) — à condition d'I5.
- **Polices auto-hébergées** (licence vérifiée, une origine tierce bloquante en
  moins, RGPD en prime).
- **Réutiliser les modules sources** (`offreMail`, `acquisition`,
  `consentement`, `metaPixel`) plutôt que les recopier : ils sont minuscules
  (mesuré) — en surveillant leurs imports (M4).
- **Les ids de page** pour les liens internes (un renommage de chemin ne casse
  aucun lien) — à condition de les résoudre dans le mdast (I6).
- **react-markdown + remark-gfm au build**, déjà éprouvés par le prérendu du
  blog.
- **`<picture>`, `width`/`height`, `loading="lazy"`, `fetchpriority="high"`** sur
  la seule image principale.
- **Les scripts vitaux EN LIGNE** (redirections `?code=` / connecté) et `site.js`
  non vital : un 404 sur `site.js` au déploiement ne casse ni la confirmation
  d'inscription ni l'entrée dans l'app.

---

## 5. Budgets et vérifications à prévoir

### 5.1 Budgets (le générateur échoue au-delà)

| Élément | Budget | Référence mesurée |
|---|---|---|
| HTML d'une page (brut) | ≤ 80 Ko | `LandingPage` rendue telle quelle : 999 Ko ; sans base64 : 126 Ko |
| URI `data:` dans le HTML | ≤ 1 Ko chacune | BeebsIcon : 50 Ko |
| Attributs `style=` | 0 dans les gabarits (tolérance 5) | `LandingPage` : 685 |
| CSS en ligne | ≤ 20 Ko brut | landing + base + blog : 21 Ko |
| `site.js` | ≤ 10 Ko min / 4 Ko gzip | modules annoncés : 4,0 Ko min |
| Polices | ≤ 2 fichiers, ≤ 40 Ko, 1 `preload` | 22,3 + 12,6 Ko |
| Image LCP (mobile) | ≤ 60 Ko | — |
| JS tiers | mesuré à part, aucun ajout sans décision | GTM + gtag AW : ≈ 280 Ko gzip |
| Générateur | ≤ 5 s | build Vercel actuel ≈ 12 s |
| Labo mobile (Playwright, 412×915, CPU ×4) | LCP ≤ 2,0 s, CLS ≤ 0,05 | — |

### 5.2 Où chaque vérification tourne

**Dans le build** (générateur ; échec = rien n'est déployé) :
coquille complète ; un H1, titre et description uniques ; aucun `href=""`,
`#` ou `page:` restant, tout lien interne résolu vers une page générée ou une
route de l'app ; aucune page sur un chemin réservé à l'app (I10) ; tout fichier
référencé (police, image, `site.js`) présent dans `dist/` ; budgets du § 5.1 ;
chaque `<img>` avec `width`/`height` (du manifeste), `alt`, `loading="lazy"`
hors de la première, au plus un `fetchpriority="high"` ; parité de la tête
commune avec `app-shell.html` (I4) ; correctif `text-size-adjust` présent ;
aucune référence à l'entrée SPA (`/assets/index-*.js`) dans une page vitrine ;
une ligne de journal « N pages, X ms ».

**Selftests locaux** (`selftest:site-*`, sans réseau, dans la convention des
230 existants) : schéma du frontmatter ; accord des deux lecteurs sur
`src/blog/*.md` ; `git check-ignore` sur tous les fichiers source du site (B1) ;
liste blanche des imports de `site.js` (M4) ; cohérence des prix (M15) ;
`depop-partout` étendu (M14) ; routes d'`AppRouter.jsx` ↔ chemins réservés ↔
`vercel.json` ; `mis_a_jour` ≥ date du dernier commit du fichier (un `lastmod`
oublié se voit avant le push — sur Vercel, l'historique git n'est pas une source
fiable de date).

**Sur la prévisualisation** (jeton `x-vercel-protection-bypass`, hors dépôt) :
Playwright mobile sur l'accueil et une page par gabarit, stockage vide (bandeau
visible) puis consentement répondu : LCP, CLS, élément LCP nommé, TBT avec et
sans balises tierces ; parcours de l'app (`/login`, `/app`,
`/auth/confirm?code=x`, `/extension`, `/success`, `/cancel`,
`/reset-password`, `/legal`, `/auth` → `/login`) ; chaque page récupérée sans JS.

**Sur le terrain** : la bibliothèque `web-vitals` (quelques Ko) dans `site.js`,
envoyée au `dataLayer` (`web_vitals`, page, valeur) — les pages vitrine auront
peu de trafic au début et CrUX les rangerait avec l'app connectée, bien plus
lourde.

---

## 6. Ajouter une page — le geste cible (autre terminal, Codex)

1. Écrire `site/content/fr/<id>.md` (frontmatter minimal, FAQ dans le corps) ;
   la version `en/` est facultative (une page FR seule doit être permise, avec
   hreflang `fr` + `x-default`).
2. `npm run site:apercu` : build dans `build/site-apercu/` (jamais `dist/`, pas
   d'exigence d'arbre propre, comme `build:essai`), serveur local qui rejoue
   `vercel.json`, adresse affichée.
3. `npm run selftest:site` (rapide, hors ligne).
4. Commit (`git add` des fichiers nommés, cf. B1), push avec le lot — un seul
   push par lot : la page part avec un redéploiement complet de l'app.
5. Après le déploiement : `build.json`, puis la page récupérée sans JS.

Ce geste est écrit dans `docs/agents/site-vitrine.md` et `site/README.md`
(M13), avec les pièges : guillemets autour d'une valeur YAML qui contient
« : » ou « # », dates en chaîne, jamais de logo en base64, jamais un id qui
touche une route de l'app.

---

## 7. Ce qui casse au prochain changement d'`index.html`

| Changement dans `index.html` | Effet si rien n'est prévu | Garde proposée |
|---|---|---|
| Nouvelle balise (Clarity, pixel, nouvel id GTM) | Absente des pages vitrine | Tête commune unique + test de parité (I4) |
| Balise Google Ads modifiée ou retirée | Idem, dans l'autre sens | Idem |
| Polices Google changées (graisse, famille) | App et vitrine divergent ; la vitrine ne suit pas | Une seule déclaration `@font-face` partagée (M1) |
| Titre / description / canonical retouchés « pour l'accueil » | Ne touchent que la coquille de l'app | Retirer ces balises de la coquille, réécrire les commentaires (I4) |
| Correctif iOS `text-size-adjust` retouché | Dérive entre app et vitrine | Dans la tête commune |
| `<div id="root"></div>` modifié (attribut ajouté) | La garde de la coquille échoue — c'est voulu, build rouge | Existante (§ 2.2) |
| Favicons, manifest, `theme-color` | Dérive | Tête commune |

---

## Annexe — mesures et sources

- Tailles du `dist/` principal (build `2026-10-09T10:46:19Z+b118d07-dirty`,
  dossier local, non servi) : entrée 673 638 / 219 271 gzip / 192 418 brotli ;
  `index-I1deIUxm.css` 6 353 o ; `App-BoGuN0tn.js` 2 913 486 o ; seul `App-*`
  contient l'identifiant de build.
- Rendu de `LandingPage` par react-dom/server dans un `MemoryRouter`
  (rolldown, sans réseau) : chiffres d'I2 et M2.
- `site.js` simulé : chiffres de M4.
- react-markdown 10.1.0 : démonstration d'I6.
- js-yaml 4.1.1 : cas d'I8.
- sharp 0.34.5 : chiffres de M7 (poste de Nico, effort 4 et 7).
- Polices et balises tierces : téléchargées le 09/10 depuis
  fonts.googleapis.com / fonts.gstatic.com / googletagmanager.com.
- Vercel (API, lecture) : projet `fill-sell`, `ssoProtection
  all_except_custom_domains`, 11 déploiements de production listés,
  `dpl_C3GgSA14…` 12,3 s.
- Docs : https://vercel.com/docs/project-configuration/vercel-json ·
  https://vercel.com/docs/routing/rewrites ·
  https://vercel.com/docs/caching/cdn-cache ·
  https://vercel.com/docs/environment-variables/system-environment-variables ·
  https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel ·
  https://web.dev/articles/font-best-practices ·
  https://web.dev/articles/cookie-notice-best-practices ·
  https://github.com/google/fonts/tree/main/ofl/spacegrotesk ·
  https://github.com/google/fonts/tree/main/ofl/plusjakartasans
