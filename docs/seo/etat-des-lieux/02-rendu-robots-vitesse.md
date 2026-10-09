# 02 — Rendu pour les robots, accès, vitesse : l'état « avant » (09/10/2026)

Chantier SEO/GEO, étapes 3.2 (rendu sans JavaScript), 3.3 (accès des robots) et
scores « avant » de l'étape 7. **Lecture seule** : aucun fichier de code modifié,
aucun déploiement, aucune requête SQL, aucune connexion à fillsell.app. Seuls des
`GET` publics ont été envoyés à `https://fillsell.app` (séquentiels) et des pages de
documentation lues.

- Build servi pendant les mesures : `{"build":"2026-10-09T11:58:40Z+8fa7007"}`
  (`/build.json`, relu à 13:02 UTC) = HEAD du dossier `fill-and-sell-seo`.
- Fenêtre de mesure : 2026-10-09, 12:45 → 13:02 UTC.
- Poste de mesure : Windows 11, curl 8.18.0, Chrome 154 (headless), Lighthouse 13.5.0
  (`npx`), connexion résidentielle en France (point de présence Cloudflare `CDG`).
- Données brutes légères : `docs/seo/mesures/avant/` ; outils pour refaire les
  mêmes mesures : `docs/seo/mesures/outils/` (§ 8).

---

## 0. L'essentiel

1. **Cloudflare bloque les robots d'entraînement IA AVANT Vercel** : `GPTBot`,
   `ClaudeBot`, `CCBot` (et `anthropic-ai`, `Claude-Web`, `Bytespider`, `Amazonbot`,
   `cohere-ai`, `Diffbot`) reçoivent **403 « Your request was blocked. »** sur
   TOUTES les pages et sur `sitemap.xml` — seul `robots.txt` leur répond 200.
   Le `robots.txt` servi, lui, autorise tout le monde : les deux signaux se
   contredisent. Aucun changement de code ne lève ce blocage : c'est un réglage
   du tableau de bord Cloudflare (décision de Nico).
2. **Sans JavaScript, l'accueil est vide** : `/` sert 12 082 octets et **0 mot
   visible** (`<div id="root"></div>`), aucun lien `<a>`, aucun `<h1>`. Avec
   JavaScript : 1 413 mots.
3. **`/legal` et `/extension` sont servies comme l'accueil** : 0 mot, et surtout
   le `<title>`, la description et le **`canonical` de l'accueil**
   (`https://fillsell.app`). Le bon canonical n'arrive qu'après exécution du JS
   (`useSeo`). Google déconseille ce changement de canonical par JS (§ 1.4).
4. **Le blog est bien prérendu** : 6 articles + la liste servis complets à tous les
   robots autorisés (576 à 1 734 mots, title/description/canonical/hreflang/JSON-LD
   propres). C'est le seul morceau du site lisible sans JS.
5. **Aucune vraie 404** : toute adresse inconnue (`/page-qui-n-existe-pas`,
   `/blog/article-inexistant`, `/llms.txt`, `/llms-full.txt`) répond **200** avec la
   coquille de l'accueil. `/llms.txt` et `/llms-full.txt` **n'existent pas** — un
   agent IA qui les demande reçoit du HTML vide.
6. **Langue de l'accueil choisie par `navigator.language`** : rendue avec un
   navigateur en `en-US` (cas d'un robot américain sans `Accept-Language`, comme
   Googlebot), l'accueil s'affiche **en anglais** sous `<html lang="fr">` et un
   `<title>` français. Risque à vérifier dans la Search Console (§ 1.5).
7. **Vitesse mobile faible partout, blog prérendu compris** (Lighthouse local,
   médiane de 3) : performance 53 (accueil), 59 (/blog), 61 (article), 64
   (/extension) ; **LCP 8,6 à 10,0 s**. Sur ordinateur : 89 à 92. Le prérendu du
   blog n'améliore pas le LCP : React efface le HTML prérendu puis le repeint
   après le JavaScript (§ 5.3, § 6.2).
8. **API PageSpeed Insights refusée (429, quota quotidien sans clé épuisé)** :
   scores « avant » faits en **Lighthouse local** ; **données de terrain CrUX non
   obtenues**.

---

## 1. Ce que reçoit un robot sans JavaScript

### 1.1 Méthode

```
curl -sL --compressed -A "<user-agent>" \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
  -H 'Accept-Language: fr-FR,fr;q=0.9' https://fillsell.app<chemin>
```

13 URL × 14 agents = 182 requêtes (12:46–12:48 UTC). « Mots visibles » = texte du
`<body>` hors `<script>`, `<style>`, `<noscript>`, `<template>` et commentaires.
User-agents exacts : `docs/seo/mesures/outils/uas.tsv` (chaînes publiées par chaque
éditeur ; `Applebot-Extended` n'est pas un robot qui visite les pages — Apple : « Applebot-Extended
does not crawl webpages », https://support.apple.com/en-us/119829, lu le 2026-10-09 —
il a été testé pour la forme).

⚠️ **Limite** : les requêtes partent de NOTRE IP, pas de celles des robots. Un **403**
prouve un blocage sur la seule chaîne d'agent. Un **200** ne prouve PAS que le vrai
robot passe : Cloudflare peut traiter différemment un robot « vérifié » (identifié
par ses IP). Seul le tableau de bord Cloudflare (ou les journaux) le dit.

### 1.2 Contenu servi par URL (identique pour les 11 agents autorisés)

Pour chaque URL, les 11 agents qui reçoivent 200 reçoivent **exactement les mêmes
octets** (une seule signature taille + title + canonical + mots par URL) : aucun
rendu dynamique, aucun traitement particulier de Googlebot.

| URL | HTML (o) | transféré zstd (o) | mots sans JS | mots AVEC JS (fr-FR) | `<title>` servi | `canonical` servi | `X-Robots-Tag` |
|---|---:|---:|---:|---:|---|---|---|
| `/` | 12 082 | 4 668 | **0** | 1 413 | FillSell – Publie et republie sur toutes tes plateformes | `https://fillsell.app` | — |
| `/blog` | 15 749 | 5 844 | 304 | 335 | Le blog des revendeurs — FillSell | `/blog` | — |
| `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` | 27 267 | 9 457 | 1 712 | 1 743 | Selling the same item on Vinted, Leboncoin, eBay and Beebs… — FillSell | soi-même | — |
| `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` | 29 262 | 9 966 | 1 734 | 1 765 | Vendre le même article sur Vinted, Leboncoin, eBay et Beebs… — FillSell | soi-même | — |
| `/blog/cross-listing-vinted-leboncoin` | 29 361 | 9 893 | 1 725 | 1 756 | Cross-listing : vendre sur Vinted et Leboncoin en même temps — FillSell | soi-même | — |
| `/blog/publier-annonce-plusieurs-plateformes` | 26 988 | 9 313 | 1 474 | 1 505 | Publier ses annonces sur plusieurs plateformes en une seule fois — FillSell | soi-même | — |
| `/blog/how-to-calculate-reselling-profits` | 18 856 | 7 304 | 624 | 655 | Reselling Profit: What You Actually Make Per Sale… — FillSell | soi-même | — |
| `/blog/comment-calculer-profits-vinted` | 18 555 | 7 086 | 576 | 607 | Comment calculer vos profits sur Vinted : le guide complet — FillSell | soi-même | — |
| `/legal` | 12 082 | 4 668 | **0** | 5 138 | **celui de l'accueil** | **`https://fillsell.app`** | — |
| `/extension` | 12 082 | 4 668 | **0** | 293 | **celui de l'accueil** | **`https://fillsell.app`** | — |
| `/login` | 12 082 | 4 668 | 0 | 53 | celui de l'accueil | `https://fillsell.app` | `noindex, follow` |
| `/app` | 12 082 | 4 668 | 0 | (sans session : renvoyé vers `/`, 1 413) | celui de l'accueil | `https://fillsell.app` | — (robots.txt `Disallow: /app$`) |
| `/success` | 12 082 | 4 668 | 0 | 60 | celui de l'accueil | `https://fillsell.app` | `noindex, follow` |

Autres relevés sur le HTML servi :

- `<h1>` : absent de `/`, `/legal`, `/extension`, `/login`, `/app`, `/success` ;
  présent et unique sur `/blog` (« Blog FillSell ») et sur chaque article.
- `<meta name="robots">` servi : `index, follow` partout, y compris `/login` et
  `/success` (l'en-tête `X-Robots-Tag: noindex, follow` l'emporte, c'est le plus
  restrictif qui compte).
- JSON-LD servi : `Organization`, `SoftwareApplication`, `WebSite` sur toutes les
  pages (ils sont dans `index.html`) ; `+ Article` sur les 6 articles, `+ FAQPage`
  sur 4 d'entre eux (`sell-same-item…`, `vendre-meme…`, `cross-listing…`,
  `publier-annonce…`). La `FAQPage` de l'accueil
  n'existe qu'après JS (injectée par `LandingPage.jsx`).
- hreflang servi : sur `/`, `/legal`, `/extension`… les trois liens de l'accueil
  `fr`, `en` et `x-default` pointent **tous vers `https://fillsell.app`** ; sur les
  articles, couples FR↔EN réciproques corrects pour
  `vendre-meme…`/`sell-same-item…`, lien vers soi pour les autres.
- **Liens internes** servis : `/` → **0 lien `<a>`** ; `/blog` → 9 balises `<a>`
  (les 6 articles, `/`, `https://fillsell.app`) ; un article → ~10. Un robot sans JS qui arrive par l'accueil ne
  découvre RIEN ; seul le sitemap le mène au blog.
- Temps de réponse (curl, `time_total`) : médiane 0,065 s, de 0,047 à 0,72 s
  (`x-vercel-cache: HIT`, `cf-cache-status: DYNAMIC` sur le HTML).

Avec JavaScript (Chrome 154 headless, `--dump-dom`, profil neuf par URL,
`docs/seo/mesures/avant/rendu-avec-js-2026-10-09.txt`) : `/legal` prend son titre
« Mentions légales, CGU, CGV et confidentialité — FillSell » et le canonical
`/legal` ; `/extension` prend « Extension Chrome FillSell — publier sur Vinted,
Leboncoin, eBay, Beebs » et le canonical `/extension` ; `/success` passe en
`noindex`. `/login` garde, même après JS, le titre et le canonical de l'accueil
(aucun `useSeo` sur cette route ; l'en-tête `noindex` suffit).

### 1.3 Matrice URL × robot (code HTTP · mots visibles sans JS)

Agents : Chr = Chrome desktop, Gb = Googlebot smartphone, Bing = bingbot,
GPT = GPTBot, OAI-S = OAI-SearchBot, CG-U = ChatGPT-User, CBot = ClaudeBot,
C-S = Claude-SearchBot, C-U = Claude-User, Px = PerplexityBot, Px-U =
Perplexity-User, Apl = Applebot, Apl-X = Applebot-Extended, CC = CCBot.

| URL | Chr | Gb | Bing | **GPT** | OAI-S | CG-U | **CBot** | C-S | C-U | Px | Px-U | Apl | Apl-X | **CC** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |
| `/blog` | 200·304 | 200·304 | 200·304 | **403** | 200·304 | 200·304 | **403** | 200·304 | 200·304 | 200·304 | 200·304 | 200·304 | 200·304 | **403** |
| `/blog/sell-same-item-…` | 200·1712 | 200·1712 | 200·1712 | **403** | 200·1712 | 200·1712 | **403** | 200·1712 | 200·1712 | 200·1712 | 200·1712 | 200·1712 | 200·1712 | **403** |
| `/blog/vendre-meme-article-…` | 200·1734 | 200·1734 | 200·1734 | **403** | 200·1734 | 200·1734 | **403** | 200·1734 | 200·1734 | 200·1734 | 200·1734 | 200·1734 | 200·1734 | **403** |
| `/blog/cross-listing-vinted-leboncoin` | 200·1725 | 200·1725 | 200·1725 | **403** | 200·1725 | 200·1725 | **403** | 200·1725 | 200·1725 | 200·1725 | 200·1725 | 200·1725 | 200·1725 | **403** |
| `/blog/publier-annonce-plusieurs-plateformes` | 200·1474 | 200·1474 | 200·1474 | **403** | 200·1474 | 200·1474 | **403** | 200·1474 | 200·1474 | 200·1474 | 200·1474 | 200·1474 | 200·1474 | **403** |
| `/blog/how-to-calculate-reselling-profits` | 200·624 | 200·624 | 200·624 | **403** | 200·624 | 200·624 | **403** | 200·624 | 200·624 | 200·624 | 200·624 | 200·624 | 200·624 | **403** |
| `/blog/comment-calculer-profits-vinted` | 200·576 | 200·576 | 200·576 | **403** | 200·576 | 200·576 | **403** | 200·576 | 200·576 | 200·576 | 200·576 | 200·576 | 200·576 | **403** |
| `/legal` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |
| `/extension` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |
| `/login` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |
| `/app` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |
| `/success` | 200·0 | 200·0 | 200·0 | **403** | 200·0 | 200·0 | **403** | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | 200·0 | **403** |

Données complètes (title, description, canonical, hreflang, JSON-LD, en-têtes par
cellule) : `docs/seo/mesures/avant/matrice-robots-sans-js.json`.

### 1.4 Pourquoi « 0 mot sans JS » compte, et pour qui

- Les robots des moteurs IA **n'exécutent pas le JavaScript** : « none of the major
  AI crawlers currently render JavaScript » — liste : OAI-SearchBot, ChatGPT-User,
  GPTBot, ClaudeBot, Meta-ExternalAgent, Bytespider, PerplexityBot ; « AppleBot
  renders JavaScript through a browser-based crawler, similar to Googlebot »
  (Vercel, 17/12/2024, https://vercel.com/blog/the-rise-of-the-ai-crawler, lu le
  2026-10-09). Pour eux, l'accueil, `/legal` et `/extension` sont **vides**, et
  `/legal` / `/extension` se déclarent être l'accueil.
- Googlebot exécute le JS, mais Google écrit sur le canonical : « While we don't
  recommend using JavaScript for this, it is possible to inject a rel="canonical"
  link tag with JavaScript » et « make sure that you always set the canonical URL
  to the same value as the original HTML »
  (https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics,
  lu le 2026-10-09). Ici le HTML d'origine de `/legal` et `/extension` porte le
  canonical de l'accueil et le JS en pose un autre : exactement le cas déconseillé.
  Effet réel dans l'index **non vérifiable sans la Search Console** (inspection
  d'URL de `/legal` et `/extension` : « URL canonique choisie par Google »).
- Même page Google : pour éviter les « soft 404 » d'une application monopage, poser
  un `noindex` par JS sur les pages d'erreur ou rediriger vers une URL qui répond
  404. Ici une adresse inconnue reçoit 200 + la coquille, puis le routeur la renvoie
  vers `/` côté client (`<Route path="*" element={<Navigate to="/" />}>`).

### 1.5 Langue de l'accueil : risque d'un accueil anglais pour Googlebot

`LandingPage.jsx` (`getInitialLang`, l. 122-126) choisit la langue par
`localStorage.fs_lang`, sinon `navigator.language` (`fr*` → français, sinon
anglais). Mesuré avec Chrome headless `--lang=en-US`, profil neuf :

| Rendu | `<html lang>` | `<title>` | `<h1>` rendu |
|---|---|---|---|
| `fr-FR` | fr | FillSell – Publie et republie sur toutes tes plateformes | « Tes annonces, publiées partout : Vinted, Leboncoin, eBay et Beebs. » |
| `en-US` | **fr** | **FillSell – Publie et republie sur toutes tes plateformes** | **« Your listings, published everywhere: Vinted, Leboncoin, eBay and Beebs »** |

Google : « the default IP addresses of the Googlebot crawler appear to be based in
the USA » et « the crawler sends HTTP requests without setting `Accept-Language` »
(https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages,
lu le 2026-10-09). La valeur de `navigator.language` dans le rendu de Googlebot
n'est pas documentée : **je ne peux pas affirmer** que Google voit l'accueil en
anglais. À vérifier par Nico : Search Console → Inspection de `https://fillsell.app/`
→ « Tester l'URL en direct » → HTML rendu / capture. Les pages `/legal` et
`/extension` lisent `fs_lang` puis retombent sur le français : pas concernées.

---

## 2. Accès des robots : robots.txt, pare-feu Cloudflare, llms.txt

### 2.1 robots.txt servi

`https://fillsell.app/robots.txt` → 200, `text/plain`, 579 octets,
`Cache-Control: public, max-age=86400`, **identique octet pour octet** au fichier
du dépôt (`public/robots.txt` de HEAD, md5 `8742ec85…` = ETag servi) et **identique
pour tous les agents** (GPTBot, ClaudeBot, Googlebot testés). **Aucun contenu
« géré par Cloudflare »** (pas de bloc « Cloudflare Managed », pas de
`Content-Signal`). Copie : `docs/seo/mesures/avant/robots-2026-10-09.txt`.

```
User-agent: *
Allow: /
Disallow: /app$
Disallow: /app?
Disallow: /api/
Allow: /favicon.ico
Allow: /icon-192x192.png
Allow: /apple-touch-icon.png
Sitemap: https://fillsell.app/sitemap.xml
```

Lecture : **tout robot est autorisé partout** sauf `/app`, `/app?…` et `/api/`.
Aucun robot IA n'est nommé.

### 2.2 Le pare-feu Cloudflare contredit le robots.txt

Sonde élargie (47 jetons d'agent × `/`, `/robots.txt`, `/sitemap.xml`,
13:01 UTC, `docs/seo/mesures/avant/sonde-agents-2026-10-09.tsv`) :

| Bloqués (403 sur `/` et `/sitemap.xml`, 200 sur `/robots.txt`) | Passent (200 partout) |
|---|---|
| `GPTBot`, `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `CCBot`, `Bytespider`, `Amazonbot`, `cohere-ai`, `Diffbot` | `OAI-SearchBot`, `ChatGPT-User` (1.0 et 2.0), `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `meta-externalagent`, `Meta-ExternalFetcher`, `FacebookBot`, `facebookexternalhit`, `Google-Extended`, `GoogleOther`, `Google-CloudVertexBot`, `MistralAI-User`, `DuckAssistBot`, `YouBot`, `PetalBot`, `Applebot`, `Applebot-Extended`, `Timpibot`, `ImagesiftBot`, `omgili`, `AI2Bot`, `Twitterbot`, `LinkedInBot`, `Slackbot`, `Discordbot`, `WhatsApp`, `TelegramBot`, `Googlebot`, `bingbot`, `DuckDuckBot`, `YandexBot`, `Qwantbot`, `SemrushBot`, `AhrefsBot`, `Chrome-Lighthouse`, curl, python-requests |

La réponse de blocage, relevée telle quelle :

```
HTTP/1.1 403 Forbidden
Content-Type: text/plain
Content-Length: 25
Cache-Control: private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0
Expires: Thu, 01 Jan 1970 00:00:01 GMT
Referrer-Policy: same-origin
X-Frame-Options: SAMEORIGIN
Server: cloudflare
CF-RAY: a47d7e162a1beedf-CDG

Your request was blocked.
```

- **Pas d'en-tête `x-vercel-id`** : la requête n'atteint jamais Vercel. Le blocage est
  chez **Cloudflare**, pas dans `vercel.json` ni dans le pare-feu Vercel.
- Pas de `cf-mitigated`, pas de page « Just a moment » (aucun défi JavaScript) :
  c'est un refus net, sur la seule chaîne d'agent (nos requêtes viennent d'une IP
  ordinaire et sont bloquées quand même).
- Le profil (robots d'**entraînement** bloqués ; robots de **recherche** et
  **d'assistant** autorisés ; `robots.txt` laissé passer) correspond au réglage
  Cloudflare « Block AI bots » / « AI bot policies » : « This setting blocks verified
  bots that are classified as crawling for the purpose of AI training » ; catégories
  Search / Agent / Training, chacune « Block on all pages » / « Block on pages with
  ads » / « Allow » ; réglage historique « Deprecating on September 15, 2026 » ;
  emplacement : Security Settings → Configure AI bot policies (ou → Block AI bots)
  (https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/,
  lu le 2026-10-09). **Le réglage exact actif sur la zone n'est pas vérifiable
  d'ici** (aucun accès au compte Cloudflare) : à lire par Nico.

Ce que ça coupe, selon les éditeurs (lus le 2026-10-09) :

| Robot bloqué | Rôle déclaré par l'éditeur | Source |
|---|---|---|
| `GPTBot` | « used to crawl content that may be used in training our generative AI foundation models » | https://developers.openai.com/api/docs/bots |
| `ClaudeBot` | collecte pour l'entraînement ; le bloquer = exclure le site des futurs jeux d'entraînement | https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler |
| `CCBot` | Common Crawl (corpus ouvert repris par de nombreux entraînements) | — (rôle notoire, non relu aujourd'hui) |

Restent ouverts (vérifié sur chaîne d'agent seulement) : `OAI-SearchBot` (« used
to surface websites in ChatGPT's search features »), `ChatGPT-User`,
`Claude-SearchBot` (« Disabling Claude-SearchBot … prevents our system from
indexing your content for search optimization »), `Claude-User`, `PerplexityBot`,
`Perplexity-User`, `Applebot`, `Googlebot`, `bingbot`. Pour ChatGPT, OpenAI
précise : « ChatGPT-User is not used for crawling the web in an automatic
fashion » et « robots.txt rules may not apply ».

**Conséquence pour le chantier** : `ARCHITECTURE.md` § 4 prévoit « robots.txt :
public ouvert à tous (robots IA compris) » — insuffisant : tant que le réglage
Cloudflare reste en place, GPTBot / ClaudeBot / CCBot ne liront rien, quel que
soit le `robots.txt`. **Décision de Nico** : soit autoriser les robots
d'entraînement dans Cloudflare (le contenu de FillSell peut alors entrer dans la
« mémoire » des modèles), soit garder le blocage et l'écrire aussi dans
`robots.txt` (`User-agent: GPTBot` / `Disallow: /`, etc.) pour que les deux signaux
disent la même chose. Dans les deux cas, vérifier dans Cloudflare (AI Crawl
Control / Security Events) ce que reçoivent les VRAIS robots de recherche
(`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`), que notre sonde ne peut pas
imiter.

### 2.3 llms.txt, llms-full.txt et autres fichiers

| Chemin | Code | Type | Octets | Réalité |
|---|---|---|---:|---|
| `/llms.txt` | 200 | `text/html` | 12 082 | **n'existe pas** : coquille de l'accueil (rewrite SPA) |
| `/llms-full.txt` | 200 | `text/html` | 12 082 | idem |
| `/.well-known/llms.txt`, `/ai.txt`, `/humans.txt`, `/.well-known/security.txt` | 200 | `text/html` | 12 082 | idem |
| `/manifest.json` | 200 | `application/json` | 377 | fichier réel |
| `/build.json` | 200 | `application/json` | 40 | fichier réel |

`/llms.txt` est une proposition (Jeremy Howard, 03/09/2024, version 2 modifiée le
10/08/2026 : « a proposed markdown file … that gives LLMs and agents a concise
overview with links to more detailed content », https://llmstxt.org/, lu le
2026-10-09). Le 200 HTML actuel est pire qu'un 404 : un agent qui le demande
reçoit une page sans texte.

---

## 3. sitemap.xml

`https://fillsell.app/sitemap.xml` → 200, `application/xml`,
`Cache-Control: public, max-age=86400`, `last-modified: Fri, 09 Oct 2026 12:39:15 GMT`
(régénéré à chaque build par `prerender-blog`). **10 URL**. Copie :
`docs/seo/mesures/avant/sitemap-2026-10-09.xml`. **403 pour GPTBot, ClaudeBot,
CCBot** (§ 2.2).

| `<loc>` | `<lastmod>` | hreflang (`xhtml:link`) | Remarque |
|---|---|---|---|
| `https://fillsell.app` | 2026-07-26 | fr, en, x-default → **les trois vers `https://fillsell.app`** | date écrite en dur dans le plugin |
| `/legal` | 2026-07-26 | — | date en dur ; canonical servi sans JS = l'accueil |
| `/blog` | 2026-09-05 | — | = date du plus récent article |
| `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` | 2026-09-05 | en, fr, x-default(fr) | couple réciproque correct |
| `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` | 2026-09-05 | fr, en, x-default(fr) | idem |
| `/blog/cross-listing-vinted-leboncoin` | 2026-08-02 | fr (soi) | |
| `/blog/publier-annonce-plusieurs-plateformes` | 2026-07-30 | fr (soi) | |
| `/blog/how-to-calculate-reselling-profits` | 2026-06-20 | en (soi) | |
| `/blog/comment-calculer-profits-vinted` | 2026-06-15 | fr (soi) | |

Constats :

- **`/extension` absente** du sitemap, alors qu'elle est publique, indexable
  (`useSeo` sans `noindex`, titre propre) et n'est liée que depuis UN article
  (`publier-annonce-plusieurs-plateformes`) — ni depuis l'accueil rendu, ni depuis
  le sitemap.
- `lastmod` de l'accueil et de `/legal` figé au 26/07 (en dur dans
  `sitemapXml()`), alors que l'accueil a changé depuis. Google : « Google uses the
  <lastmod> value if it's consistently and verifiably accurate » ; « Google ignores
  <priority> and <changefreq> values »
  (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap,
  lu le 2026-10-09).
- hreflang de l'accueil : `fr` et `en` désignent la MÊME URL, qui sert du français
  ou de l'anglais selon le navigateur (§ 1.5) — il n'existe pas de version anglaise
  adressable. Google recommande « separate locale URL configurations … annotating
  them with rel="alternate" hreflang annotations » (page « locale-adaptive » citée
  § 1.5).
- Pas d'index de sitemaps, pas de sitemap images ; `robots.txt` déclare bien le
  sitemap.

---

## 4. En-têtes, compression, cache, redirections

### 4.1 Chaîne de service

Tout passe par **Cloudflare (proxy) → Vercel** : `Server: cloudflare`, `CF-RAY …-CDG`,
`x-vercel-id: cdg1::…`, `x-vercel-cache: HIT|MISS`, `alt-svc: h3`. HTML :
`cf-cache-status: DYNAMIC` (non mis en cache par Cloudflare, servi par le cache
Vercel). `strict-transport-security: max-age=63072000` (sans `includeSubDomains`
ni `preload`), `x-frame-options: DENY`, `x-content-type-options: nosniff`,
`referrer-policy: strict-origin-when-cross-origin`.

### 4.2 X-Robots-Tag

| Chemin | `X-Robots-Tag` servi | `noindex` après JS |
|---|---|---|
| `/login`, `/success`, `/cancel`, `/reset-password`, `/auth/callback` | `noindex, follow` (vercel.json) | `/success`, `/cancel`, `/reset-password`, `/auth/callback` : oui |
| `/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/barre-progression` | **aucun** | oui (`useSeo({ robots: 'noindex' })`), donc **seulement après JS** |
| `/app` | aucun | non (bloquée par `robots.txt`, donc jamais lue) |
| toutes les autres | aucun | — |

### 4.3 Compression (relevé sur `/` et `/blog/cross-listing-vinted-leboncoin`)

| `Accept-Encoding` envoyé | Encodage reçu | `/` (12 082 o) | article (29 361 o) |
|---|---|---:|---:|
| `gzip` | gzip | 4 513 | 9 421 |
| `br` | br | 4 437 | 9 533 |
| `gzip, deflate, br` (Googlebot, la plupart des robots) | br | 4 437 | 9 533 |
| `gzip, deflate, br, zstd` (Chrome récent, curl) | zstd | 4 668 | 9 893 |
| `identity` | aucun | 12 082 | 29 361 |

Compression en place sur le HTML et les ressources texte. Entrée JS
`/assets/index-B35ibUpH.js` : **673 638 octets** décompressés, 222 080 en br.

### 4.4 Cache

| Ressource | `Cache-Control` servi | Origine |
|---|---|---|
| HTML (toutes routes) | `public, max-age=0, must-revalidate` | défaut Vercel |
| `/assets/*` (JS, CSS hachés) | `public, max-age=14400, must-revalidate` | vercel.json pose 3600 ; **Cloudflare remonte à 4 h** (valeur servie ≠ vercel.json) |
| images `*.png|jpg|svg|ico|webp` | `public, max-age=31536000, immutable` | vercel.json |
| `/sitemap.xml`, `/robots.txt` | `public, max-age=86400` | vercel.json |
| `/build.json` | `no-cache, no-store, must-revalidate` | vercel.json |

Le cache court de `/assets/` est **voulu** (commit 30f7f31 du 11/09 : un 404 de chunk
mis en cache « immutable 1 an » chez Cloudflare) ; Lighthouse ne le chiffre qu'à
~1 Kio d'économie sur l'accueil. Ne pas y toucher pour le SEO.

### 4.5 Redirections et doublons d'URL

| Demande | Réponse |
|---|---|
| `http://fillsell.app/` | 308 → `https://fillsell.app/` |
| `http://www.fillsell.app/` | 308 (`HTTP/1.0`) → `https://www.fillsell.app/` → 301 → `https://fillsell.app/` (**deux sauts**) |
| `https://www.fillsell.app/…` | 301 → même chemin sur l'apex |
| `/terms`, `/privacy` | 308 → `/legal` (vercel.json) |
| `/blog/` , `/blog/cross-listing-vinted-leboncoin/` | **200**, page prérendue (canonical sans slash : le doublon est rattrapé par le canonical) |
| `/legal/`, `/extension/`, `/Blog`, `/index.html` | **200**, coquille de l'accueil (canonical de l'accueil) |
| `/blog/index.html`, `/blog/<slug>/index.html` | 200, page prérendue |
| `/page-qui-n-existe-pas`, `/blog/article-inexistant` | **200** (soft 404), coquille de l'accueil ; renvoi côté client vers `/` ou `/blog` |
| `/_vercel/insights/script.js` | **200 `text/html`** = coquille de l'accueil (Web Analytics non activé, le rewrite SPA répond) → erreur console « Refused to execute script … MIME type ('text/html') » sur chaque page |

`vercel.json` n'a pas de `trailingSlash` : Vercel documente que
`"trailingSlash": false` répond 308 vers l'URL sans slash, et qu'à `undefined` rien
n'est redirigé (https://vercel.com/docs/project-configuration/vercel-json, lu le
2026-10-09).

---

## 5. Scores « avant » (étape 7)

### 5.1 Méthode qui a servi

- **API PageSpeed Insights** (`…/runPagespeed?url=…&strategy=mobile|desktop&category=…`)
  : **HTTP 429** à 12:49 et à 13:00 UTC — « Quota exceeded for quota metric
  'Queries' and limit 'Queries per day' … for consumer 'project_number:583797351490' »
  (quota partagé des appels sans clé). Aucune clé `PSI` dans l'environnement.
- **Méthode utilisée : Lighthouse 13.5.0 en local** (`npx lighthouse@13.5.0`),
  Chrome 154 headless, throttling **simulé** (mobile : Moto G Power émulé, 4G lente ;
  desktop : `--preset=desktop`), **3 passages séquentiels** par page et par appareil,
  12:51–12:58 UTC, indice de performance du poste (`benchmarkIndex`) ≈ 2 720.
  Valeurs retenues = **médianes**. Synthèses légères (une par passage + médianes) :
  `docs/seo/mesures/avant/lighthouse-*.json` ; rapports bruts (~1 Mo chacun) hors
  dépôt.
- ⚠️ Lighthouse local ≠ PageSpeed Insights (machine, réseau, région) : comparer
  l'« après » **avec la même méthode, sur le même poste**. Les scores mobiles de
  l'accueil varient fortement d'un passage à l'autre (58 / 43 / 53 ; un essai
  préalable hors série a donné 42).
- **Données de terrain CrUX : non obtenues** (PSI en 429 ; l'API CrUX exige une
  clé ; la page publique treo.sh ne se lit qu'avec JavaScript). Le site a
  probablement trop peu de trafic Chrome pour en avoir — **non vérifié**.

### 5.2 Résultats (médianes de 3 passages)

| Page | Appareil | Perf | Access. | Bonnes pr. | SEO | FCP | **LCP** | TBT | CLS | Speed Index | TTI | Poids | Req. | Perf par passage |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/` | mobile | **53** | 90 | 92 | 100 | 3,3 s | **9,8 s** | 611 ms | 0,008 | 3,3 s | 9,9 s | 1 296 Kio | 36 | 58 / 43 / 53 |
| `/` | desktop | 89 | 90 | 96 | 100 | 0,8 s | 2,1 s | 60 ms | 0,002 | 0,9 s | 2,1 s | 1 296 Kio | 36 | 88 / 89 / 90 |
| `/blog` | mobile | **59** | 90 | 96 | 100 | 3,6 s | **9,1 s** | 340 ms | 0 | 3,6 s | 9,1 s | 1 084 Kio | 24 | 61 / 59 / 51 |
| `/blog` | desktop | 91 | 90 | 96 | 100 | 0,9 s | 1,8 s | 0 ms | 0 | 0,9 s | 1,8 s | 932 Kio | 23 | 91 / 93 / 90 |
| `/blog/cross-listing-vinted-leboncoin` | mobile | **61** | 91 | 96 | 100 | 3,7 s | **10,0 s** | 300 ms | 0 | 3,7 s | 10,0 s | 1 370 Kio | 25 | 59 / 61 / 63 |
| `/blog/cross-listing-vinted-leboncoin` | desktop | 90 | 91 | 96 | 100 | 0,9 s | 1,9 s | 0 ms | 0 | 0,9 s | 1,9 s | 1 370 Kio | 25 | 89 / 90 / 93 |
| `/extension` | mobile | **64** | 90 | 96 | 100 | 3,4 s | **8,6 s** | 233 ms | 0 | 3,4 s | 8,6 s | 1 042 Kio | 24 | 64 / 63 / 64 |
| `/extension` | desktop | 92 | 90 | 96 | 100 | 0,9 s | 1,7 s | 3 ms | 0,004 | 0,9 s | 1,7 s | 890 Kio | 23 | 92 / 92 / 92 |

Temps de réponse serveur observé (audit `server-response-time`) : 30 à 46 ms.
Seuils Google pour un « bon » LCP : ≤ 2,5 s — **aucune page n'y est sur mobile**.

⚠️ Le **SEO 100** de Lighthouse est calculé sur la page **rendue avec JS** : il ne
voit ni l'accueil vide, ni le canonical de l'accueil servi sur `/extension`, ni le
blocage Cloudflare. Il ne mesure pas ce que voit un robot IA.

### 5.3 Ce qui pèse (diagnostics Lighthouse, mobile)

- **Élément LCP** : `/` → le `<h1>` « Tes annonces, publiées partout… » (rendu par
  React) ; `/extension` → le bandeau « 📱 Tu es sur ton téléphone… » ; `/blog` → la
  description d'une carte ; article → le 1er paragraphe de `.blog-content`.
- **Le prérendu du blog ne raccourcit pas le LCP** : sur l'article, LCP **observé**
  (sans bridage) 575 ms alors que l'événement `load` tombe à 461 ms et le premier
  rendu à 257 ms ; même constat sur `/blog` (LCP 527 ms > `load` 421 ms). Le plus
  grand élément est donc peint APRÈS l'exécution du JS — cohérent avec le code :
  `ReactDOM.createRoot(...).render()` (`src/main.jsx`) vide `#root` au premier
  rendu, `<Suspense fallback={null}>` laisse la page vide le temps du chunk
  `BlogPost`, puis React repeint le même article. En simulation 4G lente, ce repeint
  coûte ~9-10 s.
- **JavaScript tiers** : `googletagmanager.com` = **603 Kio** transférés sur l'accueil
  et l'article (451 Kio sur `/extension`) : `gtm.js` (GTM-TJNKL6T5), `gtag/js` AW-…
  **chargé deux fois** (balise directe dans `index.html` + via GTM, ~150 Kio chacun)
  et `gtag/js` G-2ZYVK404G9 (~176 Kio). Plus que le JS de FillSell (218 Kio br pour
  l'entrée). Exécution : ~1,6 s de CPU pour ces scripts sur l'accueil mobile
  (passage d'essai de 12:51).
- **JS inutilisé** : ~368 Kio estimés sur l'accueil (passage d'essai ; dont 96 Kio
  de l'entrée `index-*.js`, 43 % inutilisés).
- **Ressources bloquant le rendu** : la feuille Google Fonts (~790 ms estimés à
  chaque page) + `index-*.css` (~170 ms) + `blog-*.css` (~480 ms sur l'article).
- **Images** (accueil, passage d'essai) : ~137 Kio d'économie estimée, images sans
  `width`/`height`.
- **Accessibilité 90-91** partout : contrastes insuffisants (boutons, sous-titres de
  sections, pied de page) et `<meta name="viewport" … maximum-scale=1.0,
  user-scalable=no>` (zoom interdit — réglage voulu pour l'app, hérité par toutes
  les pages publiques).
- **Bonnes pratiques 92-96** : erreur console due à `/_vercel/insights/script.js`
  servi en `text/html` (§ 4.5) sur toutes les pages ; cartes de sources (`valid-source-maps`)
  absentes ; images basse résolution sur l'accueil (`image-size-responsive`).

---

## 6. Le prérendu existant et `vercel.json` : couverture, limites, conséquences

### 6.1 Ce qu'il couvre

`scripts/vite-plugin-prerender-blog.mjs` (05/09, passé en `writeBundle` le 18/09) :
après le bundle, il relit `dist/index.html` et écrit, pour chaque `src/blog/*.md`,
`dist/blog/<slug>/index.html` (+ `dist/blog/index.html` pour la liste) : `<head>`
réécrit (lang, title, description, og/twitter, canonical, hreflang, JSON-LD
`Article` + `FAQPage` si `faq`) et le contenu de `#root` rendu par
`react-markdown` (`renderToStaticMarkup`) avec les mêmes classes que `BlogPost.jsx`.
Il génère aussi `dist/sitemap.xml`. Toute balise attendue absente fait échouer le
build. Vercel sert ces fichiers avant le rewrite : « precedence is given to the
filesystem prior to rewrites being applied »
(https://vercel.com/docs/project-configuration/vercel-json, lu le 2026-10-09) —
**prouvé en production** par la matrice (§ 1.3).

### 6.2 Ses limites

1. **Ne couvre que `/blog` et `/blog/<slug>`** (7 pages : la liste + 6 articles). `/`, `/legal`, `/extension`
   restent la coquille vide, avec le `<head>` de l'accueil.
2. **Le HTML prérendu est jeté au montage** (`createRoot`, pas `hydrateRoot`) : pas
   de gain de LCP (§ 5.3), page brièvement vide entre l'effacement et le chunk.
3. **Chaque page prérendue charge toute l'app** : entrée de 674 Ko (218 Kio br),
   GTM/gtag (~600 Kio), Google Fonts bloquant, viewport sans zoom.
4. **Sitemap couplé au blog** : si le plugin « saute » (filet `existsSync`), le
   sitemap n'est pas régénéré ; dates de `/` et `/legal` écrites en dur ; `/extension`
   oubliée ; hreflang de l'accueil vers une seule URL.
5. **Aucune 404** : `/blog/<slug inconnu>` → 200 coquille, puis `<Navigate to="/blog">`
   côté client.
6. Mineur : la liste `/blog` écrit « Lire l'article → » sous les articles anglais ;
   pas de hreflang sur `/blog`. Le plugin tourne aussi dans les builds natifs/OTA
   (les pages du blog voyagent dans le bundle Capacitor, sans effet).

### 6.3 `vercel.json` aujourd'hui

- Un seul rewrite : `/((?!api/|assets/).*)` → `/index.html` — attrape **tout**, y
  compris `/llms.txt`, `/_vercel/insights/script.js` et toute faute de frappe.
- En-têtes : sécurité partout ; `X-Robots-Tag: noindex, follow` sur 5 chemins
  seulement ; cache images 1 an, `/assets` 1 h (4 h servis), sitemap/robots 24 h.
- Redirections : `/terms`, `/privacy` → `/legal`. Pas de `trailingSlash`.

### 6.4 Ce que cela implique pour servir du HTML complet sur toutes les pages publiques sans toucher à l'app

1. **Tout fichier `dist/<chemin>/index.html` gagne sur le rewrite** (documenté et
   prouvé) : `/legal`, `/extension`, les futures pages vitrine et `/llms.txt` peuvent
   être servis statiques **sans modifier le rewrite**, comme le blog.
2. **`/` est le seul cas dur.** `dist/index.html` joue trois rôles : l'accueil `/`,
   la coquille servie par le rewrite à `/app`, `/login`, `/auth/*`, `/success`,
   `/cancel`, `/reset-password`, `/extension`, `/ebay/retour`, `/desinscription`…,
   et l'entrée native Capacitor (`webDir: 'dist'`) + les bundles OTA. Écrire
   l'accueil dans `dist/index.html` enverrait le HTML de l'accueil à toutes les
   routes de l'app et au natif. Il faut donc une **coquille séparée** (ex.
   `app-shell.html`) visée par le rewrite, **générée seulement pour Vercel** — c'est
   le schéma de `ARCHITECTURE.md` § 2.2 et § 2.4, cohérent avec ces mesures. À
   reprendre côté accueil statique, sinon régression : la déviation `?code=` /
   `?token_hash=` → `/auth/confirm`, le renvoi d'une personne connectée vers `/app`,
   `capterOffre()` (`?offre=`), `capterSource()`, le bandeau de consentement (déjà
   listés dans `ARCHITECTURE.md` § 2.3).
3. **`/legal` et `/extension` ne doivent pas rester des coquilles.**
   `ARCHITECTURE.md` les classe côté « App (SPA, coquille vide) » : elles garderaient
   0 mot et le canonical de l'accueil pour tout robot sans JS. Elles sont publiques et
   indexables (et `/extension` est une page d'intention directe : « extension Chrome
   Vinted Leboncoin eBay Beebs »). Minimum : un HTML prérendu avec leur propre `<head>`
   (title, description, canonical) et leur texte, à la manière du blog ; la SPA
   reprend la main ensuite. `/extension` doit aussi entrer au sitemap.
4. **Ne pas effacer le HTML statique au chargement** si l'on veut gagner du LCP :
   pages vitrine sans l'entrée de l'app (petit `site.js`, comme prévu), ou, pour les
   pages qui gardent la SPA, `hydrateRoot` avec un balisage strictement identique
   (difficile avec `lazy()` + `Suspense fallback={null}`) — sinon le LCP reste lié
   au JS, comme aujourd'hui sur le blog.
5. **Rendre de vraies 404** : remplacer le rewrite « attrape-tout » par la **liste
   des routes de l'app** (`AppRouter.jsx`) : `/login`, `/app`, `/success`, `/cancel`,
   `/reset-password`, `/auth/callback`, `/auth/confirm`, `/desinscription`,
   `/ebay/retour`, `/demo/barre-progression`, plus `/legal`, `/extension`,
   `/blog/:slug` tant qu'ils ne sont pas statiques ; le reste tombe sur un `404.html`
   statique. À auditer AVANT : tous les liens sortants des mails, de Stripe, d'eBay,
   de Supabase (redirections d'auth) et des campagnes doivent viser une route de la
   liste (les paramètres `?…` ne comptent pas pour un rewrite). Le natif n'est pas
   concerné (`vercel.json` ne s'applique qu'au web).
6. **Poser `X-Robots-Tag: noindex`** sur la coquille de l'app (et donc sur
   `/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/*`, qui n'ont
   aujourd'hui qu'un `noindex` posé par JS) — sans le poser sur les pages statiques.
7. **Hors code** : le blocage Cloudflare (§ 2.2) et la vérification du rendu de
   Googlebot (§ 1.5) ne dépendent pas du dépôt — à faire par Nico.
8. Optionnel, à trancher : `"trailingSlash": false` (une seule forme d'URL par page,
   308) ; activer Vercel Web Analytics ou retirer la balise `/_vercel/insights/script.js`
   (erreur console sur chaque page).

---

## 7. Constats classés

| # | Constat | Gravité SEO/GEO | Qui |
|---|---|---|---|
| 1 | GPTBot, ClaudeBot, CCBot (+6) bloqués en 403 par Cloudflare ; robots.txt dit l'inverse | **Haute** (GEO : absent de la mémoire des modèles OpenAI/Anthropic/Common Crawl) | **Nico** (Cloudflare) |
| 2 | Accueil : 0 mot, 0 lien, 0 `<h1>` sans JS | **Haute** (tout robot IA ; Bing/Google dépendent du rendu) | code (vitrine statique) |
| 3 | `/legal`, `/extension` : 0 mot + title/description/canonical de l'accueil sans JS | **Haute** | code |
| 4 | Soft 404 partout ; `/llms.txt`, `/llms-full.txt` = 200 HTML vide | Moyenne | code (`vercel.json` + fichiers) |
| 5 | LCP mobile 8,6-10 s sur les 4 pages, blog prérendu compris ; GTM/gtag ~600 Kio (AW chargé deux fois) | Moyenne (Core Web Vitals) | code + **Nico** pour les balises marketing |
| 6 | Accueil en anglais si `navigator.language` ≠ fr, sous `lang="fr"` | Moyenne, **à vérifier** | **Nico** (Search Console) puis code |
| 7 | Sitemap : `/extension` absente, `lastmod` figés, hreflang accueil sur une seule URL | Moyenne | code |
| 8 | `noindex` seulement par JS sur 4 routes utilitaires | Faible | code (`vercel.json`) |
| 9 | Doublons `/x/` et `/x` (200 les deux), `http://www` en deux sauts | Faible | code / Vercel |
| 10 | `/_vercel/insights/script.js` servi en HTML → erreur console | Faible | **Nico** (activer) ou code (retirer) |
| 11 | Accessibilité 90 : contrastes + zoom interdit | Faible pour le SEO | code (vitrine) |

---

## 8. Refaire les mêmes mesures « après »

Depuis Git Bash, à la racine `C:\Users\nicol\fill-and-sell-seo`. Remplacer l'origine
par l'URL d'un aperçu Vercel pour tester avant la mise en ligne (un aperçu protégé
par l'authentification Vercel répondra 401 : le dire, ne pas contourner).
`T` = un dossier temporaire hors dépôt.

```bash
T="$LOCALAPPDATA/Temp/seo-apres"; O=https://fillsell.app   # ou l'URL d'aperçu

# 1. Matrice URL × robot sans JS (182 GET) + analyse
bash docs/seo/mesures/outils/matrice-robots.sh "$T/matrice" "$O"
node docs/seo/mesures/outils/analyse-matrice.mjs "$T/matrice"
#    (ajouter les nouvelles pages publiques dans docs/seo/mesures/outils/urls.txt)

# 2. Qui est bloqué (47 agents x /, /robots.txt, /sitemap.xml)
mkdir -p docs/seo/mesures/apres
bash docs/seo/mesures/outils/sonde-agents.sh "$O" > docs/seo/mesures/apres/sonde-agents-$(date +%F).tsv

# 3. Rendu AVEC JS (Chrome headless, profil jetable), en français puis en anglais US
bash docs/seo/mesures/outils/rendu-js.sh "$T/rendu" "$O" fr-FR
bash docs/seo/mesures/outils/rendu-js.sh "$T/rendu" "$O" en-US

# 4. robots.txt, llms.txt, sitemap, 404
curl -s "$O/robots.txt"
for p in llms.txt llms-full.txt page-qui-n-existe-pas blog/article-inexistant; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" "$O/$p"; done
curl -s "$O/sitemap.xml"

# 5. En-têtes, compression, redirections
for u in / /blog/cross-listing-vinted-leboncoin /legal /extension /login /app /auth/confirm /desinscription; do
  echo "== $u"; curl -s -o /dev/null -D - "$O$u" | grep -iE '^(HTTP/|x-robots-tag|cache-control|content-encoding|x-vercel-cache|cf-cache-status)'; done
for e in gzip br "gzip, deflate, br" "gzip, deflate, br, zstd" identity; do
  curl -s -o /dev/null -H "Accept-Encoding: $e" -w "$e -> %{size_download}\n" "$O/"; done
for u in http://fillsell.app/ http://www.fillsell.app/ https://www.fillsell.app/ "$O/blog/" "$O/legal/" "$O/terms"; do
  echo "== $u"; curl -s -o /dev/null -D - "$u" | grep -iE '^(HTTP/|location)'; done
curl -s -o /dev/null -D - "$O/_vercel/insights/script.js" | grep -i content-type

# 6a. Scores — PageSpeed Insights (serveurs Google + CrUX), si une clé existe ou si le quota sans clé est revenu
PSI_KEY=... bash docs/seo/mesures/outils/psi.sh docs/seo/mesures/apres "$O"

# 6b. Scores — Lighthouse local, MÊME méthode que l'« avant » (3 passages, séquentiel, ~8 min)
bash docs/seo/mesures/outils/lighthouse-lot.sh "$T/lh" "$O"
node docs/seo/mesures/outils/lighthouse-synthese.mjs "$T/lh" docs/seo/mesures/apres
```

Comparer à l'« avant » : `docs/seo/mesures/avant/lighthouse-synthese-medianes.json`,
`matrice-robots-sans-js.json`, `sonde-agents-2026-10-09.tsv`,
`rendu-avec-js-2026-10-09.txt`, `robots-2026-10-09.txt`, `sitemap-2026-10-09.xml`.
Pour le Lighthouse local : même poste (indice ≈ 2 720), aucune autre charge lourde
pendant la série, médiane de 3.

---

## 9. Sources externes (toutes lues le 2026-10-09)

- Google, JavaScript SEO basics — https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google, Locale-adaptive pages — https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages
- Google, Build and submit a sitemap — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Cloudflare, Block AI bots / AI bot policies — https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/
- Vercel, The rise of the AI crawler (17/12/2024) — https://vercel.com/blog/the-rise-of-the-ai-crawler
- Vercel, vercel.json (rewrites, trailingSlash) — https://vercel.com/docs/project-configuration/vercel-json
- OpenAI, Overview of OpenAI crawlers — https://developers.openai.com/api/docs/bots
- Anthropic, Does Anthropic crawl data from the web… — https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Apple, About Applebot — https://support.apple.com/en-us/119829
- llms.txt — https://llmstxt.org/
- Mesures sur https://fillsell.app : 2026-10-09 12:45–13:02 UTC (curl, Chrome 154, Lighthouse 13.5.0), décrites ci-dessus.
