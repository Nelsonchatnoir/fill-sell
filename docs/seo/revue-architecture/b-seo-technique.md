# Revue B — SEO et GEO technique de l'architecture « site vitrine statique »

Revue du 09/10/2026, angle **SEO et GEO technique**. Objet : `docs/seo/ARCHITECTURE.md`
(branche `seo-crosslisting`, HEAD `8fa7007` = `origin/main`).

Méthode : j'ai lu le code cité. Les docs officielles ont été lues le 09/10 : Vercel, Google
Search Central, Bing, OpenAI, Anthropic, Perplexity, Cloudflare, llmstxt.org et IndexNow.
**Je ne me suis pas connecté à fillsell.app.** L'état de la prod vient des relevés de
`docs/seo/mesures/avant/`, faits le 09/10 à 12:47 UTC par `curl` sans JS, depuis une IP
résidentielle en France, avec des agents (UA) usurpés.

---

## Verdict : TIENT AVEC CORRECTIONS

Le principe est le bon : HTML complet écrit au build, une URL par langue, fichier sur disque
prioritaire sur les rewrites, blog gardé aux mêmes URL. La doc Vercel le confirme, et le blog
le prouve déjà en prod (de 1 474 à 1 734 mots lus sans JS, contre **0** pour l'accueil).

Deux points doivent être tranchés **avant** d'écrire le générateur :

1. **B1** — Le `noindex` de la coquille, tel qu'il est écrit, est soit inerte, soit
   destructeur. Et `/extension` et `/legal` restent des coquilles vides.
2. **B2** — Cloudflare renvoie déjà **403** à GPTBot, ClaudeBot, CCBot et d'autres.
   « Robots IA compris » est donc faux tant que la règle Cloudflare ne change pas.
   C'est à Nico de décider.

Viennent ensuite huit corrections importantes :

- l'attrape-tout qui répond 200 à toute URL ;
- le slash final non fixé ;
- des dates qui ne sont pas fiables ;
- le risque de pages-portes ;
- l'entité « FillSell » face à son homonyme ;
- la confiance (E-E-A-T), bridée par des mentions légales incomplètes ;
- deux pièges d'écriture du `robots.txt` ;
- le sitemap, sans garde de non-régression.

---

## 0. Les affirmations factuelles, vérifiées une par une

| # | Affirmation (ARCHITECTURE.md) | Verdict | Preuve |
|---|---|---|---|
| 1 | « Vercel sert un fichier présent sur disque avant les rewrites » (l. 24) | **VRAI** | Doc `vercel.json`, § rewrites : « *The `source` property should NOT be a file because precedence is given to the filesystem prior to rewrites being applied.* » (https://vercel.com/docs/project-configuration/vercel-json#rewrites). En prod : `/blog/<slug>` sert le fichier prérendu malgré le rewrite attrape-tout (`matrice-robots-sans-js.json`, 1 474 à 1 734 mots sans JS). |
| 2 | « Vercel sert `dist/index.html` sur `/` avant tout rewrite » (l. 39) | **VRAI** | Même règle : `/` se résout sur le fichier d'index du dossier. |
| 3 | « `app-shell.html` porte `X-Robots-Tag: noindex` » (l. 49) | **SANS EFFET sur les routes réécrites** | Doc Vercel, § headers : `source` = « *A pattern that matches each incoming pathname* ». Un en-tête posé sur `/app-shell.html` ne touche que la requête DIRECTE à ce fichier, pas `/legal` ni `/auth/confirm` réécrits vers lui (cf. **B1**). La revue C (I7) fait le même constat. |
| 4 | « Un robot sans JS (GPTBot, ClaudeBot, PerplexityBot…) ne voit RIEN de l'accueil » (l. 10) | **Vrai, mais pas pour la raison donnée** | PerplexityBot : 200 et 0 mot (coquille vide). GPTBot et ClaudeBot : **403 Cloudflare** (« *Your request was blocked.* », `sonde-agents-2026-10-09.tsv`). Pour eux, le statique ne changera rien (cf. **B2**). |
| 5 | « `robots.txt` : public ouvert à tous (robots IA compris) » (l. 102) | **FAUX dans les faits** | Le `robots.txt` est servi en 200, mais la périphérie Cloudflare rend 403 sur `/` et `/sitemap.xml` pour 9 agents d'entraînement. Le fichier n'ouvre rien. |
| 6 | Le `robots.txt` servi est celui du dépôt | **VRAI** | `diff` de `public/robots.txt` avec `mesures/avant/robots-2026-10-09.txt`, fins de ligne CRLF retirées : identiques. Le « robots.txt géré » de Cloudflare est donc INACTIF : rien n'est ajouté en tête. |
| 7 | JSON-LD `HowTo` et `FAQPage` retenus (l. 99) | **Valides, sans effet chez Google** | HowTo : plus affiché depuis le 13/09/2023 (https://developers.google.com/search/blog/2023/08/howto-faq-changes). FAQ : retiré de la recherche le **07/05/2026**, doc supprimée le 15/06/2026 (https://developers.google.com/search/updates). |
| 8 | `SoftwareApplication` « sans note » — conforme ? | **Conforme, mais non éligible** | Aucune règle n'est violée. Mais l'extrait « application » de Google exige `aggregateRating` ou `review` (https://developers.google.com/search/docs/appearance/structured-data/software-app). Recopier les notes des stores est interdit : « *Don't aggregate reviews or ratings from other websites.* » (https://developers.google.com/search/docs/appearance/structured-data/review-snippet). Ne rien mettre est donc le bon choix. |
| 9 | `/llms.txt` « utile » | **Google : non** | Changelog du 15/06/2026 : la recherche Google n'utilise pas ces fichiers. Guide IA : « *You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in Google Search* » (https://developers.google.com/search/docs/fundamentals/ai-optimization-guide). `llms-full.txt` ne fait pas partie de la spécification (https://llmstxt.org/). |
| 10 | IndexNow | **Google n'y participe pas** | Registre officiel : bing, yandex, seznam, naver, yep, internetarchive, amazonbot (https://www.indexnow.org/searchengines.json). |
| 11 | Slash final (non traité par l'architecture) | **Doublons par défaut** | Doc Vercel, § trailingSlash, quand il n'est pas défini : « *both /about and /about/ will serve the same content without redirecting. This is not recommended because it could lead to search engines indexing two different pages with duplicate content.* » `vercel.json` ne le définit pas. |

---

## 1. Bloquants

### B1 — BLOQUANT — La coquille : `noindex` inerte ou destructeur, et `/extension` et `/legal` restent vides

**Preuves**

- `ARCHITECTURE.md:49` : « `app-shell.html` porte `X-Robots-Tag: noindex` ». La ligne 21 range
  `/extension` et `/legal` du côté « App (inchangée) ».
- Le générateur copie la coquille « octet pour octet » depuis `index.html`. Elle porte donc :
  - `<meta name="robots" content="index, follow">` (`index.html:43`) ;
  - le canonical de l'accueil (`:44`) ;
  - les hreflang fr, en et x-default vers l'accueil (`:66-68`) ;
  - trois JSON-LD : Organization, SoftwareApplication et WebSite (`:82-157`).
- `useSeo` ne pose `robots` que si on le lui passe (`src/lib/seo.js`). `Legal.jsx:346` et
  `ExtensionPage.jsx:58` ne le passent pas.
- Google, « JavaScript SEO basics » (https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) :
  - « *When Google encounters the `noindex` tag, it may skip rendering and JavaScript execution.* » ;
  - pour une page qu'on veut indexer, aucun `noindex` dans le HTML d'origine ;
  - « *you shouldn't use JavaScript to change the canonical URL to something else* ».
- Mesuré le 09/10 (`matrice-robots-sans-js.json`) : `/extension` et `/legal` = **0 mot**
  sans JS, avec le title et le canonical de l'accueil.
  - `/legal` est pourtant au sitemap.
  - `/extension` est marquée « page à potentiel SEO » dans son propre code (`ExtensionPage.jsx:50-56`).
- `ExtensionPage.jsx:47` et `Legal.jsx` (`langueDeLaPage`) choisissent la langue sur la MÊME
  URL. Google demande « *different URLs for each language version of a page rather than
  using cookies or browser settings* »
  (https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

**Scénarios**

- **(a) Le `noindex` est posé en en-tête `vercel.json` sur `/app-shell.html`.** Il n'agit sur
  AUCUNE URL réécrite. `/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/*` et toute
  URL inconnue restent servies en 200 :
  - avec `index, follow` et le canonical de l'accueil ;
  - avec un hreflang `en → https://fillsell.app` qui CONTREDIT désormais celui de l'accueil
    statique (`en → /en`).

  C'est un faux sentiment de sécurité. La revue A (M7) recommande ce choix : je le conteste
  pour cette raison.
- **(b) Le `noindex` est posé en `<meta>` dans la coquille.** `/legal`, qui est au sitemap, et
  `/extension` sortent de l'index. Google peut ne jamais exécuter le JS, et `useSeo` ne lève
  pas le `noindex` de toute façon.
- **Dans les deux cas, `/extension` reste invisible** pour OAI-SearchBot, Claude-SearchBot et
  PerplexityBot. C'est la page qui répond le mieux à « extension Chrome Vinted Leboncoin ».

**Correction**

1. **Passer `/extension` et `/legal` dans le site vitrine, en statique** : FR à la racine,
   `/en/extension` et `/en/legal`. Les routes SPA restent pour la navigation interne.
   - Garder les ancres `id="mentions"` et `id="confidentialite"` : elles sont visées par les
     mails des fonctions edge (`/legal#mentions`, `/legal?lang=en#confidentialite`).
   - Pour `?lang=en` : un petit script qui envoie vers `/en/legal` en gardant l'ancre, ou une
     redirection. C'est un choix à faire.
2. **Toute page indexable devient alors statique.** La coquille peut porter son `noindex`
   **dans son HTML**, sans risque. En la copiant, le générateur RETIRE le canonical, les
   hreflang, `og:url` et les trois JSON-LD, et remplace `index, follow` par `noindex, follow`.
   - Le garde-fou s'adapte : il exige la racine, le script d'entrée et le meta `noindex`, et
     refuse tout canonical ou hreflang dans la coquille.
   - React n'a besoin d'aucune de ces balises : `useSeo` crée celles qui manquent.
3. **Si Nico refuse de rendre `/extension` et `/legal` statiques** : pas de meta `noindex` dans
   la coquille. Les en-têtes `X-Robots-Tag` vont alors sur les **sources réelles**, route par
   route (§ 6). L'accueil, lui, reste neutre.
4. **Garder et étendre les en-têtes existants** (`vercel.json:41-52`) à `/auth`, `/auth/(.*)`,
   `/desinscription`, `/ebay/retour` et `/demo/(.*)`. Ils sont utiles aux robots qui ne lisent
   que les en-têtes.
5. **Le prouver sur la prévisualisation** : `curl -s <preview>/legal | grep -i 'name="robots"'`
   et `curl -sI <preview>/auth/confirm | grep -i x-robots`.
   - ⚠️ Vercel pose `X-Robots-Tag: noindex` sur TOUTES les prévisualisations
     (https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines).
   - Le vérificateur doit donc lire le HTML et les en-têtes de `vercel.json`, sans conclure
     sur l'en-tête que la plateforme ajoute.

### B2 — BLOQUANT (décision de Nico) — Cloudflare rend 403 aux robots d'entraînement : « robots IA compris » est faux, et le `robots.txt` n'y peut rien

**Preuves**

- `docs/seo/mesures/avant/sonde-agents-2026-10-09.tsv` : 403 « *Your request was blocked.* »
  sur `/` et `/sitemap.xml` pour **GPTBot, ClaudeBot, anthropic-ai, Claude-Web, CCBot,
  Bytespider, Amazonbot, cohere-ai et Diffbot**.
  - Leur `robots.txt` répond 200.
  - Matrice : `bloque_cloudflare: true`, `passe_par_vercel: non`.
  - Passent : OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot,
    Perplexity-User, Googlebot, bingbot, Applebot, DuckAssistBot, MistralAI-User et
    meta-externalagent.
- Cloudflare, « AI bot policies » (https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/) :
  - trois comportements, *Search*, *Agent* et *Training* ;
  - chaque blocage vise les robots vérifiés de la catégorie « *plus unverified bots that fall
    under the same classification* » ;
  - depuis le **15/09/2026**, « *mixed-purpose crawlers that combine Search and Training will
    be blocked under every configuration that blocks AI training* » ;
  - réglage : *Security Settings > Configure AI bot policies*.
- Anthropic : ses robots « *respect anti-circumvention technologies* » et « *we will not
  attempt to bypass CAPTCHAs* » (https://support.claude.com/en/articles/8896518).
- OpenAI : pour la recherche de ChatGPT, autoriser OAI-SearchBot et « *allowing requests from
  our published IP ranges* » (https://developers.openai.com/api/docs/bots).
- `ARCHITECTURE.md:10` cite GPTBot et ClaudeBot parmi les bénéficiaires ; la ligne 102 dit
  « robots IA compris ».

**Limite de la preuve.** La sonde usurpe l'agent depuis une IP résidentielle. La règle
Cloudflare couvre aussi les robots *vérifiés* de la catégorie : le vrai GPTBot est donc très
probablement bloqué. La preuve définitive est dans Cloudflare, *AI Crawl Control*, qui compte
les requêtes autorisées et bloquées par robot.

**Scénarios**

- **L'entraînement reste fermé.** Le statique part. Les robots de recherche le lisent (bien),
  mais FillSell n'entre ni dans les connaissances des modèles d'OpenAI et d'Anthropic, ni
  dans **Common Crawl** (CCBot), qui nourrit de nombreux modèles.
  - Or la désambiguïsation avec fillsell.com repose justement sur ce que les modèles
    « savent ». fillsell.com est antérieur : plateforme de sourcing et dropshipping pour
    Shopify.
  - Sans recherche web, un assistant ne connaîtra pas FillSell, ou le confondra avec l'autre.
- **Effet de bord du 15/09/2026.** Si *Training = Block*, les robots à double usage
  (recherche et entraînement) sont coupés eux aussi. La doc ne les nomme pas. Il faut vérifier
  que Bingbot, Googlebot et Applebot ne sont pas comptés « bloqués » dans *AI Crawl Control*.
- **Un défi Cloudflare** (Bot Fight Mode, « Under Attack », défi géré) retire en silence
  Claude-SearchBot et Claude-User, qui ne contournent pas les défis.

**Correction : décider, puis aligner les trois couches** (Cloudflare, `robots.txt`, texte de
l'architecture).

- **Option A — recommandée pour la GEO.** La vitrine est du contenu public, fait pour être
  repris.
  - Cloudflare *Training* = **Allow**.
  - `robots.txt` à un seul groupe `*` ouvert (§ 6).
- **Option B — l'entraînement reste fermé.** Le dire dans ARCHITECTURE.md et dans le
  `robots.txt` : un groupe qui nomme les agents bloqués, avec `Disallow: /` (§ 6). Le signal
  devient lisible et cohérent avec le 403.
  - Ne pas y mettre `Google-Extended` sans le vouloir : ce jeton règle aussi l'ancrage
    (*grounding*) de Gemini, un canal GEO.
- **Dans les deux cas :**
  - *Search* = Allow et *Agent* = Allow ;
  - Bot Fight Mode sans défi pour les robots vérifiés ;
  - relire *AI Crawl Control* sept jours après la mise en ligne.

---

## 2. Importants

### I1 — IMPORTANT — L'attrape-tout répond 200 : « soft 404 » et URL inventées

**Preuves**

- `vercel.json:58-60` : `/((?!api/|assets/).*)` → coquille.
- `AppRouter.jsx:156` : `*` → `<Navigate to="/">` côté client.
- Google : un 200 dont le contenu est « *an empty page or an error message* » est un soft 404
  (https://developers.google.com/search/docs/crawling-indexing/http-network-errors).
- Remèdes Google pour une SPA : redirection JS vers une URL qui répond 404, ou `noindex`
  (JS SEO basics).

**Scénarios**

- `/plateformes/vintd` (faute de frappe, ancien lien, ou chemin inventé par un assistant :
  `/pricing`, `/tarifs`, `/features`, `/fr`…) répond 200 avec la coquille : canonical de
  l'accueil, `index, follow`.
- React redirige alors vers `/` et peint l'**ancienne** `LandingPage`, pas l'accueil statique.
- Google y voit un soft 404, ou un doublon de l'accueil.
- ChatGPT-User et Perplexity-User (sans JS) reçoivent une page vide en 200, qu'ils peuvent
  citer comme si elle existait.
- Même chose pour `/blog/slug-inconnu` une fois le blog statique.

**Correction (option préférée)**

- Limiter les rewrites aux **routes SPA réelles** et générer un `dist/404.html` : statique,
  FR et EN, avec des liens vers l'accueil, les guides et le blog.
- Pour un site statique, Vercel sert `404.html` « *when a route does not match any other
  static file* » (https://vercel.com/kb/guide/custom-404-page).
- Liste relevée dans le code :

  | Route | Origine |
  |---|---|
  | `/app`, `/login` | app |
  | **`/auth`** | ouverte par l'extension : `chrome-extension/config.js:6` `AUTH_URL`, `popup.js:1542`. Elle ne vit aujourd'hui que par la route `*`. À GARDER. |
  | `/auth/callback`, `/auth/confirm` | authentification |
  | `/success`, `/cancel` | Stripe : `create-checkout-session` (l. 359-360, 433-434, 655-658) |
  | `/reset-password` | `App.jsx:6722` |
  | `/desinscription` | mails |
  | `/ebay/retour` | retour eBay |
  | `/demo/*` | démonstrations |
  | `/legal`, `/extension` | tant qu'elles ne sont pas statiques |

- **Le prouver sur la prévisualisation** : une URL inconnue rend 404, chacune des routes
  ci-dessus rend 200.
- **Avant la bascule** : extraire les URL servies sur 30 jours (journaux Vercel, Search
  Console). Rediriger en 301 celles qui ont du trafic, et les chemins devinables (`/tarifs`,
  `/pricing`, `/a-propos`, `/contact`).
- **Option minimale si Nico refuse** : B1 point 2 (coquille en `noindex` dans son HTML). Les
  URL inconnues restent en 200, mais hors index.
- La revue A (I4) ajoute un point : tout le statique de la vitrine doit vivre sous
  `/assets/…`, exclu du rewrite, pour qu'un fichier absent rende un vrai 404 et jamais la
  coquille. Je m'y range.

### I2 — IMPORTANT — Slash final : `/x` et `/x/` servent la même page

**Preuves**

- Doc Vercel, § trailingSlash (citée en § 0, n° 11).
- `vercel.json` n'a pas de clé `trailingSlash`.
- Aujourd'hui déjà, `/blog/<slug>/` sert le même fichier que `/blog/<slug>`.

**Scénario.** Chaque page vitrine existe deux fois. Un lien externe vers `/plateformes/vinted/`
répartit les signaux. Le canonical limite les dégâts, sans les supprimer.

**Correction**

- Ajouter `"trailingSlash": false`. `/x/` répond alors 308 vers `/x`.
- La revue A (M8) a écarté `trailingSlash: **true**`, à juste titre. `false` n'ajoute aucun
  saut aux retours tiers d'aujourd'hui : aucun ne finit par `/`.
  - Stripe : `https://fillsell.app/success`, `/cancel?session_id=…`.
  - OAuth : `${origin}/auth/callback`.
  - Extension : `https://fillsell.app/app` et `/auth`.
  - eBay : `/ebay/retour`.
- À jouer sur la prévisualisation avec les URL exactes de la matrice des chemins (revue A, § 3).
- Une seule forme d'URL partout : canonical, `og:url`, hreflang, sitemap, `@id` et `url` du
  JSON-LD, liens internes. Pas de slash final, sauf la racine. Garder `https://fillsell.app`,
  sans slash, déjà utilisé partout (`index.html:44`, sitemap).
- `site:verifier` refuse tout `href` interne qui ne tombe pas directement sur un fichier de
  `dist/` : ni redirection, ni rewrite.

### I3 — IMPORTANT — Dates : `lastmod`, `dateModified` et « mis à jour le » doivent être vrais, sinon ils sont ignorés

**Preuves**

- Google, `lastmod` (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) :
  - utilisé seulement s'il est « *consistently and verifiably accurate* » ;
  - il doit refléter une modification importante du contenu principal, des données
    structurées ou des liens ;
  - « *Google ignores `<priority>` and `<changefreq>` values.* »
- Bing (https://blogs.bing.com/webmaster/february-2023/The-Importance-of-Setting-the-lastmod-Tag-in-Your-Sitemap,
  https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search) :
  - `lastmod` est un signal clé, y compris pour le recrawl des fonctions IA ;
  - l'erreur la plus fréquente : la même valeur partout.
- Google, contenu utile, parmi les signaux d'alerte : « *changing the date of pages to make
  them seem fresh when the content has not substantially changed* »
  (https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
- Aujourd'hui :
  - `lastmod` de l'accueil et de `/legal` est figé à `2026-07-26` (`vite-plugin-prerender-blog.mjs:246-247`) ;
  - le JSON-LD Article n'a pas de `dateModified` (`:198-215`).

**Scénarios**

- La date de mise à jour vaut la date du build : chaque push « modifie » toutes les pages, et
  Google cesse de lire `lastmod` pour tout le site.
- Ou la date manuelle est oubliée : une page dont les prix des concurrents ont changé reste
  annoncée vieille.

**Correction**

1. Une **empreinte du contenu principal** : texte rendu du `<main>` plus les données `data/*.yml`
   qu'il utilise. Ni le gabarit ni le pied de page n'y entrent.
2. Un fichier verrou **commité**, `site/dates.lock.json` : `{ id: { empreinte, mis_a_jour } }`.
3. `site:verifier` échoue si l'empreinte change sans nouvelle date, ou si la date change
   sans que l'empreinte change.
4. `npm run site:dater` met le verrou à jour.
5. Sur Vercel, le build échoue si le verrou est périmé. Il n'écrit jamais dans l'arbre : la
   règle de l'arbre propre tient.
6. Une seule valeur partout : texte visible, `dateModified`, `lastmod`.
7. Format ISO 8601 avec fuseau, par exemple `2026-10-09T14:00:00+02:00`.
8. Retirer `changefreq` et `priority`.

### I4 — IMPORTANT — Gabarits en série : risque de pages-portes (« doorways ») et de contenu produit à la chaîne

**Preuves**

- `ARCHITECTURE.md:21` et `:74` : gabarits trajet, plateforme, comparatif, alternative et
  classement, sous `/crosslisting/…`, `/plateformes/…`, `/comparatif/…` et `/alternative/…`.
- Google, règles anti-spam (https://developers.google.com/search/docs/essentials/spam-policies) :
  « *many pages are generated for the primary purpose of manipulating search rankings and not
  helping users* » ; les pages-portes.

**Scénario.** Quatre plateformes donnent jusqu'à 12 « trajets » orientés presque identiques
(Vinted → Leboncoin, Leboncoin → Vinted…), et des pages « alternative à X » au même texte.
- Google les classe en pages-portes, et la confiance de tout le site baisse.
- Les assistants ne citent qu'une page du lot.

**Correction**

- `site:verifier` mesure la similarité entre pages d'un même gabarit (Jaccard sur des
  séquences de 5 mots). Au-delà d'un seuil, par exemple 0,5, le build est rouge.
- Chaque page exige un minimum de faits qui lui sont propres, tirés de `data/*.yml`.
- Trajets **non orientés**, et seulement ceux qui ont une demande réelle.
- **Aucune page** pour une plateforme non ouverte : Depop (Nico seul) et Opla (sortie le
  10/10). La fiche de vérité fait foi.

### I5 — IMPORTANT — L'entité « FillSell » : homonyme fillsell.com et signaux incohérents

**Preuves**

- `index.html:78-104` : Organization avec name, url, logo et `sameAs` vers les stores et
  TikTok.
- Google, noms de site (https://developers.google.com/search/docs/appearance/site-names) :
  - « *our system generally won't use the same site name for two different sites that are
    global in nature* » ;
  - `alternateName`, avec le domaine en minuscules en dernier recours ;
  - les données WebSite « *must be on the home page* » ;
  - pas de nom de site au niveau d'un sous-dossier (`/en/`).
- Google, Organization (https://developers.google.com/search/docs/appearance/structured-data/organization) :
  - à placer sur l'accueil ou sur une page « à propos » ;
  - propriétés recommandées : `legalName`, `address`, `vatID`, `iso6523Code`, `taxID`,
    `foundingDate`, `contactPoint`… ;
  - certaines servent « *behind the scenes to disambiguate your organization* ».
- Fiche de vérité (`03-fiche-de-verite.md`, § 0) :
  - Google Play affiche l'éditeur « NelsonCatStudio » ;
  - l'App Store affiche une personne physique comme vendeur ;
  - le site dit « FillSell » ;
  - `/legal` : auto-entrepreneur, sans dénomination (`Legal.jsx:408-411`).
- Un agrégateur tiers décrit déjà « FillSell – Reseller App » avec Depop et un ancien palier
  gratuit (https://mwm.ai/apps/fillsell/6762152785). C'est une source que les modèles lisent.

**Scénarios**

- Google refuse « FillSell » comme nom de site, à cause de l'homonyme mondial.
- Les modèles fusionnent les deux FillSell. Les `sameAs` pointent vers des fiches de stores
  dont l'éditeur ne s'appelle pas « FillSell », ce qui ne les aide pas à trancher.

**Correction**

- **WebSite**, sur `/` seulement :
  - `name: "FillSell"` ;
  - `alternateName` : ses autres formes, puis `"fillsell.app"` en dernier.
- **Organization**, sur `/` et sur la page « À propos » seulement :
  - `legalName` (la même valeur que sur `/legal`) ;
  - `disambiguatingDescription` (propriété schema.org de `Thing`) : « Application française
    de publication multi-plateformes pour revendeurs de seconde main ; sans lien avec
    FillSell, plateforme de sourcing pour le dropshipping » ;
  - `foundingDate`, `areaServed: "FR"`, `contactPoint` ;
  - en option, `iso6523Code: "0002:<SIREN>"` (code ICD 0002 = SIRENE, à confirmer sur la
    liste ISO 6523). C'est le séparateur le plus fort, mais le SIREN d'un entrepreneur
    individuel révèle son nom : décision de Nico (cf. I6).
- **La même phrase de désambiguïsation en TEXTE visible** sur « À propos » et en pied de page :
  les modèles lisent le texte, pas seulement le JSON-LD.
- **Hors site** :
  - nom de développeur « FillSell » sur Google Play et sur l'App Store ;
  - descriptions des stores alignées sur la fiche de vérité.

### I6 — IMPORTANT — La confiance (E-E-A-T) sans nommer l'équipe : possible, mais pas avec les mentions légales actuelles

Ce point déborde du SEO strict, mais il conditionne la confiance.

**Preuves**

- `Legal.jsx:401-412`. On y trouve :
  - statut auto-entrepreneur et nom commercial ;
  - « Responsable de publication : Le gérant de FillSell » ;
  - un mail.

  On n'y trouve ni nom, ni adresse, ni téléphone, ni numéro d'immatriculation, ni TVA.
- Service-public, mentions obligatoires d'un entrepreneur individuel
  (https://entreprendre.service-public.gouv.fr/vosdroits/F31228) :
  - nom, prénom et adresse, avec la mention « EI » ;
  - numéro d'immatriculation ;
  - mail **et téléphone** ;
  - numéro de TVA ;
  - hébergeur (nom, adresse, téléphone) ;
  - sanction : « *1 an d'emprisonnement et 75 000 € d'amende* ».
- Google, contenu utile :
  - signatures encouragées « *where readers might expect it* » ;
  - « *Fabricating creator profiles… is a form of deception* » ;
  - pour un test : « *the number of products that were tested, what the test results were,
    and how the tests were conducted* ».

**Scénario.** Des pages comparatif et « alternative » publiées par un éditeur anonyme, dont
les mentions légales sont incomplètes. La confiance des évaluateurs et des modèles est faible,
et il y a un risque juridique.

**Correction**

- Compléter `/legal`, après un avis juridique.
- Sur la vitrine, signer « Équipe FillSell », avec un lien vers une page `/a-propos` :
  - qui édite, depuis quand, d'où ;
  - comment on teste ;
  - contact et mentions.
- **Jamais de persona inventé.**
- Sur chaque comparatif :
  - un bloc « méthode » (« relevé le JJ/MM/AAAA sur le site officiel de X », lien vers la
    source, captures datées) ;
  - en tête : « FillSell est notre produit ».
- Les pages « classement » posent des critères explicites. FillSell ne s'y couronne pas sans
  mesure.
- Preuves de première main : vraies captures de l'app, chiffres tirés de la fiche de vérité.

### I7 — IMPORTANT — `robots.txt` : deux pièges d'écriture

**Preuves**

- `ARCHITECTURE.md:102` : « routes privées fermées ».
- Google (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt) :
  - « *Only one group is valid for a particular crawler* » ;
  - « *User agent specific groups and global groups (`*`) are not combined.* »
- Google, « Bloquer l'indexation » (https://developers.google.com/search/docs/crawling-indexing/block-indexing) :
  « *For the noindex rule to be effective, the page or resource must not be blocked by a
  robots.txt file.* »
- `vercel.json:41-52` : `noindex` sur `/login`, `/success`, `/cancel`, `/reset-password` et
  `/auth/callback`.

**Scénarios**

1. On ajoute `User-agent: GPTBot` puis `Allow: /` « pour ouvrir ». GPTBot ignore alors le
   groupe `*`, donc ses `Disallow` (`/app`, `/api/`).
2. On ajoute `Disallow: /login`, `/auth/` ou `/success`. Google ne voit plus le `noindex`, et
   l'URL peut être indexée nue, « *without a snippet* ».

**Correction**

- Un seul groupe `*`. Ou, en option B de B2, un groupe nommé qui contient `Disallow: /` et
  rien d'autre.
- Ne bloquer que ce qui n'a ni contenu ni `noindex` : `/app$`, `/app?`, `/api/`.
- Laisser les pages en `noindex` explorables.
- Garder la borne `$` : Google et Bing la prennent en charge, et le commentaire du fichier
  explique pourquoi elle est là.
- Garder les `Allow` des icônes et la ligne `Sitemap:` absolue.

---

## 3. Mineurs

### M1 — JSON-LD : retirer les attentes inutiles, garder l'entité

**Preuves**

- HowTo : plus affiché depuis le 13/09/2023.
- FAQ : retiré le 07/05/2026.
- Fil d'Ariane : bureau seulement depuis le 22/01/2025 (https://developers.google.com/search/updates).
- `SoftwareApplication` exige une note pour l'extrait.
- Google, fonctions IA : « *There's also no special schema.org structured data that you need
  to add* », et les données structurées doivent correspondre au texte visible
  (https://developers.google.com/search/docs/appearance/ai-features).
- Mesuré : Organization, SoftwareApplication et WebSite sont sur **toutes** les pages, blog
  compris. C'est un héritage d'`index.html`.

**Correction**

- **Garder** :
  - Organization et WebSite sur `/` seulement (et Organization sur « À propos ») ;
  - BreadcrumbList ;
  - Article / BlogPosting, avec `dateModified` et un `author` Organization doté d'une `url` ;
  - SoftwareApplication comme description de l'entité, sur `/` et sur les tarifs.
- **HowTo et FAQPage** : permis s'ils reprennent le texte visible mot pour mot, mais **ni exigés
  par `site:verifier`, ni une raison d'ajouter une FAQ**.
- **Offres** : `priceSpecification` (`UnitPriceSpecification`, `billingDuration: "P1M"`),
  avec `eligibleRegion` = FR.
  - Les prix sont ceux du **web** et égalent les tarifs affichés : le vérificateur compare.
  - Les stores diffèrent : Play Irlande et Italie relevés à 74,99 € (non revérifié), et l'achat
    intégré « Fill & Sell Premium 9,99 € » est encore listé (fiche de vérité, § 10).
- Un seul `@graph` par page, avec des liens `@id`. Garder `#organization` et `#website` à
  l'identique.

### M2 — `llms.txt` et `llms-full.txt` : peu de valeur, à tenir bon marché et propres

**Preuves.** § 0, n° 9. Format llmstxt.org :
- un H1 (seule section obligatoire) ;
- une citation de résumé ;
- des listes sous H2, au format `[nom](url): note` ;
- une section « Optional ».

L'usage visé est la consultation au moment de répondre (*inference*), pas l'entraînement.

**Scénario.** Un `.txt` peut être indexé par Google et doubler les pages. Ou il dérive de la
fiche de vérité.

**Correction**

- Générés depuis le même contenu, avec les URL publiques seulement.
- En-tête `X-Robots-Tag: noindex` (Google accepte cet en-tête pour les ressources non HTML)
  et `Content-Type: text/plain; charset=utf-8`.
- `llms-full.txt` est optionnel, et suit les mêmes règles s'il est gardé.
- Ce n'est pas un indicateur de résultat.

### M3 — IndexNow : notifier après la mise en production, et seulement les URL changées

**Preuves**

- Registre IndexNow (§ 0, n° 10). Doc (https://www.indexnow.org/documentation) :
  - clé en fichier texte UTF-8 à la racine ;
  - 10 000 URL au plus par envoi ;
  - 429 = « *potential Spam* ».
- Cloudflare *Crawler Hints* : inactif tant qu'on ne l'active pas. Il réagit à un cache
  « MISS » ; or le HTML passe probablement sans cache, donc l'effet est incertain
  (https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/).

**Scénario.** Une notification envoyée pendant le build part AVANT la promotion du
déploiement : Bing lit l'ancienne page, ou rien.

**Correction**

- Le build émet `dist/indexnow.json` : les URL dont la date du verrou (I3) a changé dans ce
  commit.
- Un geste après la mise en production le lit en prod et l'envoie. Ce peut être une GitHub
  Action sur `deployment_status` (Production, `success`), ou un script lancé à la main.
- En plus : Bing Webmaster Tools, avec le sitemap soumis.
- Note : amazonbot participe à IndexNow mais reçoit 403 de Cloudflare. C'est sans danger.

### M4 — hreflang : x-default, pages en français seulement, blog anglais

**Preuves.** Google
(https://developers.google.com/search/docs/specialty/international/localized-versions) :
- « *Each language version must list itself as well as all other language versions* » ;
- des liens non réciproques sont ignorés ;
- les URL doivent être absolues ;
- combiner HTML, en-têtes et sitemap : « *there's no benefit in Search* ».

Le blog actuel met x-default sur le français (`vite-plugin-prerender-blog.mjs:120-127`).

**Correction**

1. **Une seule règle x-default pour tout le site**, blog compris. Anglais ou français, au
   choix.
   - Je recommande l'**anglais** : l'extension 0.6.106 gère les Vinted hors de France.
   - Mais c'est la cohérence qui compte.
2. **Pages en français seulement** : aucun hreflang, jamais vers l'accueil `/en`.
   `ARCHITECTURE.md:96` promet « fr/en/x-default » sur chaque page : rendre cette promesse
   conditionnelle.
3. **Blog**. Aujourd'hui, `/blog` (`lang="fr"`) liste les 6 articles, anglais compris.
   - Créer `/en/blog`, qui liste les articles anglais.
   - `/blog` ne liste plus que les articles français.
   - `/blog` et `/en/blog` forment une paire hreflang.
   - Le fil d'Ariane des articles anglais passe par `/en/blog`.
   - Aucune URL d'article ne change.
4. **Hreflang du HTML et du sitemap** : générés par une seule fonction et croisés par le
   vérificateur, ou bien HTML seulement.
5. **Aucune redirection automatique par langue ou par IP** : « *Avoid automatically
   redirecting users from one language version of a site to a different language version* »,
   car Googlebot explore depuis les États-Unis (https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).
   - Aucune lecture de `fs_lang` ni de `navigator.language` pour rediriger sur une page
     statique.
   - Le sélecteur de langue est un lien vers la page équivalente.

### M5 — Cloudflare devant Vercel : masquage des mails et caches

**Masquage des mails.** Cloudflare l'active à l'inscription
(https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/).
- Il remplace les adresses visibles par `[email protected]` et injecte un script.
- Il épargne `<script>` et `<head>` : le JSON-LD est sauf.
- Mais sans JS, `support@fillsell.app` disparaît du pied de page et des pages contact, que
  lisent les robots IA.
- Remède : couper le réglage, ou poser une *Configuration Rule* pour fillsell.app.

**Caches.** Vercel déconseille un proxy devant lui (double cache à purger à chaque
déploiement : https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment).
- Vérifier `cf-cache-status` sur le HTML, `robots.txt`, `sitemap.xml` et `llms.txt`.
- Sinon, purger à chaque mise en production : `vercel.json:29-40` pose `max-age=86400` sur
  `robots.txt` et `sitemap.xml`.

**Images.** `vercel.json:12-15` met `immutable` un an sur png, jpg, svg, ico et webp.
- Les images de la vitrine doivent porter un nom haché (revue C, I7).
- Les favicons font exception, selon la règle d'`index.html:47-59`.

### M6 — Deux accueils

**Preuves**

- `AppRouter.jsx:94` et `:156` naviguent vers `/` dans la SPA.
- `App.jsx:6923`, `:6948` et `:7091` font `navigate("/")`.
- Ces navigations peignent l'**ancienne** `LandingPage` : 1 602 lignes, ses propres
  affirmations, son FAQPage injecté, et la langue lue dans `navigator.language`
  (`LandingPage.jsx:122-126`).

**Effet.** Les visiteurs connectés voient d'autres promesses que les robots. La revue C (I1)
et la revue A (M2) le notent aussi.

**Correction.** Sur le web, aller à `/` par un chargement complet (`window.location.assign('/')`).
Le natif ne change pas.

### M7 — Vérifications sur la prévisualisation

- Vercel pose `noindex` sur toute prévisualisation, et la protection des déploiements peut
  exiger un jeton de contournement.
- Le vérificateur distingue l'en-tête de la plateforme de ceux de `vercel.json`. Sinon, toutes
  les pages paraissent `noindex`, ou le contrôle finit coupé (revue A, I7 ; revue C, I9).

### M8 — Viewport

`index.html:22` contient `maximum-scale=1.0, user-scalable=no`. Les gabarits de la vitrine ne
doivent pas le recopier : c'est un défaut d'accessibilité relevé par Lighthouse.

### M9 — Sitemap : non-régression

**Preuves**

- Le sitemap actuel compte 9 URL, dont `/legal` (`mesures/avant/sitemap-2026-10-09.xml`).
- `ARCHITECTURE.md:113` : « sitemap = pages générées ».

**Scénario.** `/legal` sort du sitemap, ou y reste alors qu'elle sert une coquille au canonical
de l'accueil. Une ancienne URL disparaît sans redirection.

**Correction**

- Garder ces 9 URL comme référence de test. Le build échoue si l'une n'est ni dans le nouveau
  sitemap (200, indexable, canonical sur elle-même), ni redirigée.
- Le sitemap ne contient que des URL en 200, indexables et canoniques sur elles-mêmes.

---

## 4. Ce qui est BON et ne doit pas changer

- **HTML complet au build** pour la vitrine. Le blog en prouve l'effet : de 1 474 à 1 734
  mots lus sans JS, contre 0 sur l'accueil.
- **Une URL par langue** (`/` en français, `/en/` en anglais). Cela corrige le défaut actuel :
  l'accueil et `/extension` changent de langue sur la même URL, ce que Google déconseille.
- **Le blog anglais garde ses URL** (`/blog/<slug>`) : rien n'est cassé, aucune redirection.
  Google ne tire pas la langue de l'URL.
- **Le fichier sur disque passe avant le rewrite** : c'est exact. Le couple `app-shell.html`
  et rewrite modifié est une bonne idée, et le build qui échoue si la coquille manque est le
  bon garde-fou.
- **Génération limitée à Vercel** : le natif ne bouge pas. `capacitor.config.ts` a
  `webDir: 'dist'`, sans `server.url`.
- **Redirection des connectés vers `/app`** : légitime selon Google (« *Redirecting users to an
  internal page once they are logged in* », https://developers.google.com/search/docs/essentials/spam-policies).
  À une condition : ne masquer la page **que** si un jeton est présent. Jamais masquée par
  défaut puis révélée par le JS.
- **Liens `page:<id>`** qui cassent le build, vérification sans JS, pages orphelines, titres et
  H1 uniques.
- **Aucune note ni avis** : conforme aux règles d'extraits d'avis.
- **Des faits avec leurs sources** (`data/*.yml`) : c'est la base de confiance des comparatifs.
- **IndexNow gardé derrière le GO.**
- **Images** AVIF et WebP avec dimensions et `fetchpriority` ; **polices** auto-hébergées.
- **Les `@id` existants** (`#organization`, `#website`, `#app`) : les garder tels quels.

---

## 5. Robots IA : état mesuré et réglage recommandé

| Robot | Rôle (doc de l'éditeur) | Respecte `robots.txt` | Mesuré le 09/10 | Recommandation |
|---|---|---|---|---|
| OAI-SearchBot | Résultats de recherche de ChatGPT | Oui (environ 24 h pour un changement) | 200 | Autoriser, IP publiées non bloquées |
| GPTBot | Entraînement | Oui | **403 Cloudflare** | Décision B2 |
| ChatGPT-User | Action d'un utilisateur | « *may not apply* » | 200 | — |
| ClaudeBot | Entraînement | Oui (accepte `Crawl-delay`) | **403** | Décision B2 |
| Claude-SearchBot | Index de recherche | Oui | 200 | Autoriser ; aucun défi (il ne le contourne pas) |
| Claude-User | Action d'un utilisateur | Oui | 200 | Autoriser |
| PerplexityBot | Index de recherche, pas d'entraînement | Autorisation conseillée | 200 | Autoriser |
| Perplexity-User | Action d'un utilisateur | « *generally ignores* » | 200 | — |
| CCBot (Common Crawl) | Corpus ouvert, nourrit de nombreux modèles | Oui | **403** | Décision B2 |
| Googlebot | Recherche, AI Overviews et AI Mode | Oui | 200 | Contrôle par `nosnippet`, `max-snippet`, `noindex` |
| Google-Extended | Jeton (entraînement et ancrage Gemini), pas un robot | — | Sonde sans valeur | Ne pas le bloquer sans le vouloir |
| bingbot | Bing et Copilot | Oui | 200 | Bing Webmaster Tools et IndexNow |

Sources :
- https://developers.openai.com/api/docs/bots
- https://support.claude.com/en/articles/8896518
- https://docs.perplexity.ai/guides/bots
- https://developers.google.com/search/docs/appearance/ai-features

---

## 6. Esquisses (NON appliquées, à prouver sur la prévisualisation)

**`vercel.json`** — ajouts à la configuration existante. On garde les en-têtes actuels ; une
entrée par chemin, pour éviter les groupes imbriqués.

```json
{
  "trailingSlash": false,
  "headers": [
    { "source": "/app-shell.html", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, follow" }] },
    { "source": "/auth", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, follow" }] },
    { "source": "/auth/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, follow" }] },
    { "source": "/desinscription", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, follow" }] },
    { "source": "/ebay/retour", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, follow" }] },
    { "source": "/demo/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] },
    { "source": "/(llms|llms-full)\\.txt", "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }
  ],
  "rewrites": [
    { "source": "/(app|login|auth|success|cancel|reset-password|desinscription)", "destination": "/app-shell.html" },
    { "source": "/auth/:chemin*", "destination": "/app-shell.html" },
    { "source": "/ebay/retour", "destination": "/app-shell.html" },
    { "source": "/demo/:chemin*", "destination": "/app-shell.html" }
  ]
}
```

Tant que `/legal` et `/extension` ne sont pas statiques, les ajouter à la première ligne des
rewrites. `dist/404.html` est écrit par le générateur.

**`robots.txt` — option A** (entraînement ouvert, recommandée pour la GEO) : le fichier actuel,
sans aucun groupe nommé. Commentaires `$`, `Allow` des icônes et ligne `Sitemap:` gardés.

**`robots.txt` — option B** (entraînement fermé). Ajouter ce groupe **avant** le groupe `*`.
Il nomme exactement ce que Cloudflare bloque déjà :

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: CCBot
User-agent: Bytespider
User-agent: Amazonbot
User-agent: cohere-ai
User-agent: Diffbot
Disallow: /
```

---

## 7. Contrôles à ajouter à `site:verifier`

1. **Chaque URL du sitemap**, sans JS : 200, un H1, un texte au-dessus d'un seuil, pas de
   `noindex`, et un canonical égal à son URL exacte.
2. **Une seule forme d'URL** pour canonical, `og:url`, hreflang, sitemap et `url` du JSON-LD :
   sans slash final, racine sous la forme `https://fillsell.app`.
3. **Hreflang** :
   - réciproques, avec la page elle-même ;
   - une seule règle x-default ;
   - aucune balise sur les pages qui n'existent qu'en français ;
   - HTML et sitemap identiques.
4. **Chaque `href` interne** tombe sur un fichier de `dist/` : ni redirection, ni coquille.
5. **La coquille** contient la racine, le script d'entrée et le meta `noindex` ; ni canonical,
   ni hreflang, ni JSON-LD (si l'option de B1 est retenue).
6. **Les 9 URL actuelles** sont présentes ou redirigées (M9).
7. **Le verrou des dates** est cohérent avec les empreintes (I3).
8. **Pas de quasi-doublons** au sein d'un même gabarit (I4).
9. **JSON-LD** :
   - analysable ;
   - prix = tarifs affichés ;
   - Organization et WebSite sur `/` seulement ;
   - aucun `aggregateRating` ni `review`.
10. **`robots.txt`** : un groupe `*` (ou un groupe nommé limité à `Disallow: /`), aucun
    `Disallow` sur un chemin en `noindex`, une ligne `Sitemap:`.
11. **`llms.txt`** : H1 en première ligne, liens absolus présents au sitemap.
12. **`404.html`** existe, et aucun fichier de la vitrine ne vit hors du préfixe exclu du
    rewrite.
13. **Le viewport** ne contient pas `user-scalable=no`.
14. **En mode prévisualisation**, l'en-tête `noindex` de la plateforme est ignoré.

---

## 8. À vérifier par Nico (tableaux de bord, aucun accès de ma part)

- **Cloudflare** :
  - *Security Settings > Configure AI bot policies* (Search, Agent, Training) ;
  - *AI Crawl Control* : requêtes autorisées et bloquées par robot sur 7 jours, y compris
    Bingbot, Googlebot et Applebot ;
  - Bot Fight Mode ;
  - *Email Address Obfuscation* ;
  - *Crawler Hints* ;
  - règles de cache du HTML.
- **Search Console et Bing Webmaster Tools** :
  - propriétés vérifiées et sitemap soumis ;
  - export des URL indexées ou explorées **avant** la bascule (I1).
- **Play Console et App Store Connect** : nom du développeur, et description alignée sur la
  fiche de vérité (I5).

---

## Sources (lues le 09/10/2026)

**Vercel**
- https://vercel.com/docs/project-configuration/vercel-json (rewrites, headers, trailingSlash, cleanUrls)
- https://vercel.com/kb/guide/custom-404-page
- https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines
- https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment

**Google Search Central**
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/http-network-errors
- https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/specialty/international/localized-versions
- https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- https://developers.google.com/search/docs/appearance/structured-data/software-app
- https://developers.google.com/search/docs/appearance/structured-data/review-snippet
- https://developers.google.com/search/docs/appearance/structured-data/organization
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.google.com/search/updates (FAQ retiré le 07/05/2026, llms.txt le 15/06/2026, fil d'Ariane le 22/01/2025)
- https://developers.google.com/search/blog/2023/08/howto-faq-changes

**Bing**
- https://blogs.bing.com/webmaster/february-2023/The-Importance-of-Setting-the-lastmod-Tag-in-Your-Sitemap
- https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search

**Robots IA**
- OpenAI : https://developers.openai.com/api/docs/bots
- Anthropic : https://support.claude.com/en/articles/8896518
- Perplexity : https://docs.perplexity.ai/guides/bots

**Cloudflare**
- https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/
- https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/
- https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/
- https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/

**Formats et index**
- https://llmstxt.org/
- https://www.indexnow.org/documentation
- https://www.indexnow.org/searchengines.json

**Droit**
- https://entreprendre.service-public.gouv.fr/vosdroits/F31228

**Mesures internes** (relevées par un autre terminal, 09/10 12:47 UTC)
- `docs/seo/mesures/avant/sonde-agents-2026-10-09.tsv`
- `docs/seo/mesures/avant/matrice-robots-sans-js.json`
- `docs/seo/mesures/avant/robots-2026-10-09.txt`
- `docs/seo/mesures/avant/sitemap-2026-10-09.xml`
- `docs/seo/etat-des-lieux/03-fiche-de-verite.md`
