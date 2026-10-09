# Audit du contenu existant — fillsell.app (étape 3.1)

- **Date d'observation** : 2026-10-09 (toutes les mesures en prod et les sources externes ci-dessous).
- **Build servi en prod pendant l'audit** : `curl https://fillsell.app/build.json` →
  `{"build":"2026-10-09T11:58:40Z+8fa7007"}`, soit **le même commit que le dossier audité**
  (`C:\Users\nicol\fill-and-sell-seo`, branche `seo-crosslisting`, HEAD `8fa7007`). Code et prod disent la même chose.
- **Périmètre** : `index.html`, `src/pages/LandingPage.jsx` (+ dictionnaire EN), `src/pages/*.jsx` publiques,
  `src/blog/*.md` + frontmatter, `scripts/vite-plugin-prerender-blog.mjs`, `src/lib/seo.js`, `src/router/AppRouter.jsx`,
  `public/` (robots, manifests, images OG), `vercel.json` ; prod lue par `curl` (HTML brut, sans JavaScript) ;
  indexation lue par l'outil WebSearch (index US, pas Google) et par `curl` sur Bing France.
- **Ce qui n'a PAS pu être vérifié** : l'index Google (pas d'accès à la Search Console, l'outil de recherche
  n'est pas Google), le rendu JavaScript tel que Googlebot le voit, les quotas réellement servis
  (`coin_config`, lecture SQL interdite dans ce chantier), le site fillsell.com (connexion refusée / délai dépassé).
- Rien n'a été modifié hors de ce fichier. Aucun commit, aucun déploiement, aucune requête SQL.

---

## 0. L'essentiel en 12 points

1. **L'accueil, `/extension` et `/legal` sont des coquilles vides pour tout robot qui n'exécute pas le JS** :
   le HTML servi est `index.html` à l'identique (empreinte MD5 identique sur `/`, `/extension`, `/legal`,
   une URL inventée et `/llms.txt`), `<div id="root"></div>` vide, **0 mot visible**, canonical = la home.
   Seul le blog est prérendu (HTML complet). Déjà identifié dans `docs/seo/ARCHITECTURE.md` § 1.
2. **Toute URL inconnue répond 200** avec le HTML de la home (soft 404) — y compris `/blog/article-inexistant`
   et `/llms.txt` (un robot IA qui demande `/llms.txt` reçoit la page d'accueil en HTML).
3. **Hreflang de la home faux** : `fr`, `en` et `x-default` pointent tous vers `https://fillsell.app` (dans
   `index.html` ET dans le sitemap), alors que la langue est choisie **côté client** par
   `navigator.language` / `localStorage` (`getInitialLang`, LandingPage.jsx l. 122-126). Google recommande des
   URL distinctes par langue et déconseille d'adapter la langue par réglage du navigateur ; il détermine la langue
   d'après le contenu visible. **Risque fort, non vérifié** : un rendu Googlebot sans préférence française peut
   indexer la version anglaise sous un `<html lang="fr">` et des balises françaises.
4. **Ton incohérent** : marque, app, stores, landing, OG = **tutoiement** ; les 4 articles FR, la liste du blog,
   les encarts CTA du blog, la meta description de l'accueil et celle de `/extension` = **vouvoiement**.
   La règle écrite du projet (AGENTS.md l. 498, mails) est le tutoiement.
5. **Une affirmation centrale est devenue fausse depuis le 08/10 23:40** : « le retrait n'est jamais déclenché sans
   vous / attend ta confirmation — jamais dans ton dos » (landing, 3 articles FR, 1 EN, CGU). Une vente Vinted
   prouvée « sold » est désormais enregistrée **automatiquement** et les retraits des copies prouvées sont armés
   dans la même transaction (rapport `docs/enquetes/ventes-prouvees-0810/RAPPORT.md` § 4 ; rattrapage : 27 retraits
   armés sans clic). L'app elle-même vend « Retrait automatique partout après une vente » (`ConversionModal.jsx` l. 186).
6. **Une autre affirmation des articles est fausse pour eBay** : « les plateformes n'offrent pas d'accès officiel pour
   déposer des annonces à votre place » / « il faut un ordinateur allumé ». FillSell publie sur eBay **par l'API
   officielle, sans Chrome**, pour un compte relié (`supabase/functions/ebay-api-worker`, en-tête : « publier sur eBay
   SANS Chrome », 06/09). C'est un argument différenciant que le site n'exploite nulle part.
7. **Article « profits Vinted » périmé** : « eBay (13 %) » est faux pour un particulier sur eBay.fr depuis le
   01/09/2026 (0 € de frais de vente, source eBay) ; « Depop (10 %) » faux au Royaume-Uni et aux États-Unis depuis 2024 ;
   **son image OG annonce « Vinted · eBay · Depop · Poshmark »** (Depop = bêta fermée, Poshmark = jamais) ; deux
   calculs s'affichent avec des astérisques littéraux (`**293 %**`).
8. **Article EN « reselling profit » hors cible et faux sur un point** : US ($, StockX, Facebook Marketplace),
   frais PayPal comptés EN PLUS des frais eBay (faux depuis les paiements gérés par eBay), Facebook Marketplace à 5 %
   (10 % depuis le 15/04/2024), Depop 10 %. Aucun lien interne sortant.
9. **Cannibalisation nette** entre `cross-listing-vinted-leboncoin` et `vendre-meme-article-…` (même requête
   « vendre sur Vinted et Leboncoin en même temps », même section « double vente », FAQ quasi identiques) ; et
   `publier-annonce-plusieurs-plateformes` est une page produit déguisée qui entrera en concurrence avec les futures
   pages vitrine (« comment ça marche »).
10. **Maillage pauvre** : l'accueil ne lie aucun article ni `/extension` (seulement `/blog` en pied de page, et
    seulement après JS) ; `vendre-meme-article` et `sell-same-item` n'ont **aucun** lien entrant éditorial ; tous les
    CTA du blog mènent à la home (jamais à l'inscription) avec le texte « dictez vos achats », hors sujet.
11. **Marque** : sur Bing France, la requête « fillsell » met fillsell.app en 1re position et le blog en 4e (bon) ;
    l'homonyme « FillSell-Sourcing & Dropshipping » (Shopify) apparaît en 9e. Mais les signaux d'entité sont
    dispersés : profil TikTok déclaré `@fill.sell` qui ne renvoie aucun profil alors que `@fillsell.app` existe ;
    « Fill & Sell » sur l'image OG anglaise ; fiche App Store « FillSell – Reseller App » / « Achat Revente » ;
    un agrégateur tiers (mwm.ai) décrit encore FillSell comme une app « Vinted, eBay, Depop » de saisie vocale.
12. **Stores et manifeste périmés** (hors site, mais sources lues par les IA) : App Store et Google Play annoncent
    **Opla** (sortie le 10/10) ; l'App Store dit « des republications offertes à vie » (50 par mois depuis le 05/10) ;
    `public/manifest.json` décrit FillSell comme « Suivi de profits revente ».

---

## 1. Inventaire des URL publiques

Statut relevé par `curl` le 2026-10-09. « Rendu » = ce que voit un robot sans JavaScript.

| URL | HTTP | Sitemap | Rendu sans JS | Langue | Ton | Verdict (détail § 7) |
|---|---|---|---|---|---|---|
| `/` | 200 | oui (prio 1.0, lastmod figé 2026-07-26) | **vide** (0 mot) | FR (EN au choix, même URL) | tu (corps) / vous (meta desc) | Refaire (rendu) + améliorer |
| `/blog` | 200 | oui | complet (319 mots) | FR | vous | Améliorer |
| `/blog/` | 200 (même page, canonical `/blog`) | non | complet | FR | vous | 308 → `/blog` (optionnel) |
| `/blog/cross-listing-vinted-leboncoin` | 200 | oui | complet (1 829 mots) | FR | vous | Améliorer (pilier « cross-listing ») |
| `/blog/publier-annonce-plusieurs-plateformes` | 200 | oui | complet (1 550) | FR | vous | Fusionner (301) vers la future page produit |
| `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` | 200 | oui | complet (1 807) | FR | vous | Améliorer (recentrer « double vente ») |
| `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` | 200 | oui | complet (1 740) | EN | neutre (you) | Améliorer |
| `/blog/comment-calculer-profits-vinted` | 200 | oui | complet (640) | FR | vous | Refaire (même URL) |
| `/blog/how-to-calculate-reselling-profits` | 200 | oui | complet (654) | EN | neutre | Refaire (jumeau EN du précédent) |
| `/extension` | 200 | **non** | **vide**, canonical = home | FR (EN si préférence) | tu (corps) / vous (meta desc) | Améliorer (head statique + sitemap) |
| `/legal` | 200 | oui (lastmod figé 2026-07-26) | **vide**, canonical = home | FR (`?lang=en`) | vous (+1 paragraphe en tu) | Garder le texte, prérendre le head |
| `/login`, `/success`, `/cancel`, `/reset-password`, `/auth/callback` | 200 | non | vide | — | — | OK : `X-Robots-Tag: noindex` (vercel.json) |
| `/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/barre-progression` | 200 | non | vide, meta `index, follow` dans le HTML brut | — | — | noindex posé en JS seulement → ajouter l'en-tête |
| URL inconnue (ex. `/page-qui-nexiste-pas`, `/blog/article-inexistant`) | **200** | — | HTML de la home | — | — | Vrai 404 |
| `/llms.txt` | **200 (HTML de la home)** | — | — | — | — | À créer (prévu par ARCHITECTURE.md) |
| `/terms`, `/privacy` | 308 → `/legal` | — | — | — | — | OK |
| `http://fillsell.app/` → 308 ; `https://www.fillsell.app/` → 301 vers l'apex | — | — | — | — | — | OK |
| `/fillsell-extension.zip` | 200 (520 Ko) | — | — | — | — | Hors SEO : servi publiquement alors que le Web Store est « la seule voie » (ExtensionPage.jsx) — à trancher par Nico |

`StatsPage.jsx` n'est pas une route publique (écran interne de l'app). Aucune autre page publique n'existe.

---

## 2. Constats transverses

### 2.1 Rendu : trois pages publiques sur quatre sont invisibles sans JavaScript

- `vercel.json` réécrit tout vers `/index.html` ; seul `scripts/vite-plugin-prerender-blog.mjs` écrit du HTML
  complet (blog + `sitemap.xml`).
- HTML brut de `/` : `<title>`, meta, 3 JSON-LD (Organization, SoftwareApplication, WebSite) — **aucun texte, aucun
  lien** (le H1, les 11 H2, la FAQ, les tarifs et le lien `/blog` n'existent qu'après React). Le JSON-LD FAQPage de
  l'accueil est injecté en JS (`LandingPage.jsx` l. 413-427) : invisible sans rendu.
- `/extension` et `/legal` : même coquille, **canonical = `https://fillsell.app`** et titre de la home dans le HTML
  brut. `useSeo` (`src/lib/seo.js`) corrige après rendu ; un robot sans JS (Bing en partie, GPTBot, ClaudeBot,
  PerplexityBot, aperçus de liens) voit une copie de l'accueil.
- La solution est déjà conçue (`docs/seo/ARCHITECTURE.md` : vitrine statique). Ce rapport ajoute : `/extension` et
  `/legal`, classées « App (inchangée) » dans ARCHITECTURE.md, sont **au sitemap** (`/legal`) ou **à potentiel SEO**
  (`/extension`, commentaire l. 51-57 d'ExtensionPage.jsx) ; elles ont besoin au minimum d'un `<head>` prérendu
  (title, description, canonical propres) et idéalement d'un corps statique.

### 2.2 Soft 404 et `/llms.txt`

Toute URL répond 200 avec la home (rewrite global + `<Route path="*">` qui redirige en JS vers `/`). Pour Google :
pages « soft 404 » ou doublons de la home ; pour un robot IA : `/llms.txt` = HTML de l'accueil. Correctif attendu :
fichier statique `404.html` servi avec le statut 404 pour toute route non connue (liste blanche des routes de l'app).

### 2.3 Hreflang de l'accueil — jugement

- Déclaré (index.html l. 63-65 et sitemap) : `fr`, `en`, `x-default` → **la même URL** `https://fillsell.app`.
- Le contenu bascule FR/EN **côté client** (`navigator.language`, puis `localStorage.fs_lang`, bouton FR/EN) ;
  `<html lang="fr">` et `og:locale fr_FR` ne changent jamais ; aucune URL anglaise n'existe.
- Google (« Managing multi-regional and multilingual sites », lu le 2026-10-09) : « Google recommends using different
  URLs for each language version of a page » ; utiliser des URL distinctes « rather than using cookies or browser
  settings to adjust the content language » ; « Google uses the visible content of your page to determine its
  language ». Source : https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Google (« Locale-adaptive pages ») : Googlebot explore par défaut **sans en-tête Accept-Language, depuis des IP qui
  paraissent américaines**. Source : https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages
  (consultée via résultats de recherche le 2026-10-09). La valeur de `navigator.language` dans le moteur de rendu de
  Google n'est documentée nulle part : **hypothèse non vérifiée** qu'elle n'est pas française.
- **Verdict** : l'annotation est inutile (trois langues sur une URL = aucune alternative réelle) et le basculement par
  le navigateur est la configuration que Google déconseille. À court terme : l'accueil s'affiche **toujours en français
  par défaut** (l'anglais seulement sur choix explicite), et l'on retire `en` / `x-default` (ou l'on garde un seul
  `fr` auto-référent) dans `index.html` **et** dans le sitemap. À terme : `/en/` en URL propre avec hreflang
  réciproques (prévu par ARCHITECTURE.md). **À vérifier par Nico** : Search Console → Inspection de l'URL `/` →
  « Afficher la page explorée » → capture et HTML rendu (FR ou EN ?).
- Les paires du blog (`vendre-meme-article` ↔ `sell-same-item`) sont **correctes** : réciproques, `x-default` sur la
  version française, présentes dans le `<head>` et le sitemap. Les deux articles « profits » ne sont pas appariés
  (contenus différents : c'est juste aujourd'hui, à changer s'ils deviennent traductions l'un de l'autre).

### 2.4 Ton : tutoiement ou vouvoiement, page par page

| Surface | Ton | Preuve |
|---|---|---|
| `<title>` de l'accueil | **tu** | « Publie et republie sur toutes **tes** plateformes » |
| meta description de l'accueil | **vous** | « **Publiez** une annonce sur Vinted… » |
| og:description / twitter:description de l'accueil | **tu** | « toutes **tes** plateformes » |
| JSON-LD SoftwareApplication (description) | **vous** | « **Publiez** une annonce… » |
| Corps de l'accueil (FR) | **tu** (100 %) | « Tu synchronises tes comptes… », FAQ « ton forfait » |
| Image OG `og-image-fillsell.png` | **tu** | « Gère ton stock. Suis tes profits. » |
| `/extension` corps | **tu** | « Installe… Épingle… Connecte-toi » |
| `/extension` meta description | **vous** | « **Installez** l'extension Chrome FillSell… » |
| `/extension` og:title | **tu** | « toutes **tes** plateformes » |
| `/blog` (liste) | **vous** | « calculer **vos** marges avec précision » |
| 4 articles FR | **vous** (22 à 60 occurrences de vous/votre/vos par article, 0 tutoiement réel) | « Vous vendez un blouson… » |
| Encart CTA en bas de TOUS les articles | **vous** | « **Calculez vos** marges automatiquement… » |
| 2 articles EN | neutre (you) | — |
| `/legal` | **vous** (126 occurrences) **+ un paragraphe en tu** | l. 709-714 : « après **ton** consentement », « **Tu** peux revenir sur **ton** choix » |
| App (écrans), App Store, Google Play | **tu** | « Tu pilotes tout depuis ton téléphone » (App Store) |
| Règle écrite du projet | **tu** | AGENTS.md l. 498 : « Ton : tutoiement, « je », signé « Nico / FillSell » » (règle des mails) |

**Constat** : la marque parle en « tu » partout sauf le blog et quelques métadonnées. **Décision à prendre par Nico**
(proposition : tutoiement sur tout le marketing, blog compris ; vouvoiement réservé aux textes juridiques, en retirant
le paragraphe en « tu » de `/legal`). La même règle AGENTS.md dit aussi « Jamais « on publie pour toi » (c'est
l'extension, sur SON ordinateur, qui exécute) » : l'accueil titre pourtant « Tu synchronises. **On publie partout.**
On republie tes annonces. » et « FillSell **les publie** sur toutes tes plateformes » — à arbitrer (la règle vise les
mails ; la cohérence voudrait qu'elle vaille aussi pour le site).

### 2.5 Données structurées

Tous les blocs JSON-LD servis s'analysent sans erreur (contrôle `JSON.parse` sur le HTML de prod, 2026-10-09).

| Page | Types (HTML brut) | Remarques |
|---|---|---|
| Toutes (hérité d'index.html) | Organization, SoftwareApplication, WebSite | Organization : `url`, `logo` (192 px), `email`, `sameAs` (App Store, Play, Chrome Web Store, TikTok `@fill.sell`). Manquent : `alternateName`, `disambiguatingDescription`, `foundingDate`, `areaServed`/adresse, Instagram, X (pourtant lié en pied de page). SoftwareApplication : `operatingSystem: "iOS, Android, Web"` (l'extension Chrome n'y est pas), une seule offre à 0 € (les plans à 12,99 / 29,99 / 59,99 € ne sont pas balisés), pas de note (bien : aucune note ne doit être inventée). Répété sur chaque article (sans gravité). |
| `/` | + FAQPage (**injecté en JS seulement**) | construit depuis la FAQ affichée (bonne pratique). |
| Articles | + Article (+ FAQPage pour 4 d'entre eux) | `author` = Organization ; pas de `dateModified` ; `publisher` sans `@id` vers `#organization` ; `image` = l'image OG (bannière promotionnelle). |

À savoir : **Google n'affiche plus du tout les résultats enrichis FAQ depuis le 7 mai 2026** (« The FAQ rich result
feature is no longer shown in Google Search results », entrée du 15/06/2026 ; restriction aux sites gouvernementaux et
de santé depuis 2023). Source : https://developers.google.com/search/docs/appearance/structured-data/faqpage (lue le
2026-10-09). Le balisage FAQPage ne rapporte donc plus rien dans Google ; son intérêt pour les moteurs IA n'est pas
démontré. Le garder n'est pas nuisible ; le multiplier n'apporte rien.

### 2.6 Maillage interne

Liens éditoriaux (hors barre de navigation et liste du blog), relevés dans le HTML prérendu et les `.md` :

| Page cible | Liens entrants éditoriaux | Liens sortants internes |
|---|---|---|
| `/` | tous les articles (logo, « Essayer gratuitement », CTA de fin, liens « Créez votre première annonce ») | `/blog`, `/legal#…`, `/login…` — **après JS seulement** ; aucun article, pas `/extension` |
| `/blog` | pied de page de l'accueil (JS), barre de chaque article | 6 articles |
| `/extension` | **1** : `publier-annonce-plusieurs-plateformes` (+ écran in-app, mail) | aucun (bouton « Retour à l'app » → `/app`, protégé) |
| `/legal` | pied de page de l'accueil (JS) ; **aucun lien depuis le blog** (pas de pied de page) | — |
| `cross-listing-vinted-leboncoin` | 4 : publier, comment-calculer, vendre-meme, sell-same (EN → page FR) | publier (×2), comment-calculer, Chrome Web Store, home |
| `publier-annonce-plusieurs-plateformes` | 4 : cross-listing, comment-calculer, vendre-meme, sell-same | cross-listing, `/extension`, home |
| `comment-calculer-profits-vinted` | 2 : cross-listing, vendre-meme | publier, cross-listing |
| `vendre-meme-article-…` | **0** | cross-listing, comment-calculer, publier, home |
| `sell-same-item-…` (EN) | **0** | cross-listing (FR, non signalé), how-to (EN), publier (FR, signalé « in French »), home |
| `how-to-calculate-reselling-profits` (EN) | 1 : sell-same | **0** |

Le blog n'a **pas de pied de page** : ni mentions légales, ni badges stores, ni liens vers les autres pages publiques.

### 2.7 CTA

| Où | Libellé | Destination |
|---|---|---|
| Accueil : nav, héros, cartes de prix, section sync, CTA final | « Commencer », « Commencer gratuitement », « Passer Premium/Pro/Business », « Synchroniser mes comptes » | `/login?mode=signup` |
| Accueil | « Installer l'extension Chrome » | fiche Chrome Web Store (nouvel onglet) |
| Accueil | badges | App Store, Google Play |
| Blog : barre | « Essayer gratuitement » | `https://fillsell.app` (home ; une personne connectée est renvoyée vers `/app`) |
| Blog : encart de fin (tous les articles) | « Calculez vos marges automatiquement avec FillSell — dictez vos achats, l'app fait le reste. » / « Essayer FillSell gratuitement → » | `https://fillsell.app` |
| Articles (corps) | « Créez votre première annonce sur FillSell » | `https://fillsell.app` |
| `/extension` | « Installer depuis le Chrome Web Store » ; sur téléphone : consigne « ouvre ce lien sur ton ordinateur » | Chrome Web Store |

Faiblesses : le blog ne mène **jamais** à l'inscription (`/login?mode=signup`) ni au Chrome Web Store (sauf un lien dans
`cross-listing`) ; l'encart de fin parle de **marges et de dictée vocale** sur des articles de cross-listing (texte
codé en dur, identique sur les 6 articles, dans `BlogPost.jsx` et dans le prérendu).

### 2.8 Images OG et images d'articles

| Fichier | Utilisé par | Contenu | Problème |
|---|---|---|---|
| `og-image-fillsell.png` | accueil, `/blog`, 4 articles (et **inséré dans le corps** de 4 articles comme illustration) | « Stock. Profit. Tout en 1. », 4 logos, « Publication automatique sur 4 plateformes en 1 clic », « 100 % sécurisé », seul badge App Store | bannière promo, pas une illustration ; « 100 % sécurisé » est une promesse risquée ; pas de badge Google Play ; le `alt` des articles décrit autre chose que l'image |
| `og-image.jpg` | `comment-calculer-profits-vinted` (FR) | **anglais** : « Track your resale profits automatically — Vinted · eBay · **Depop** · **Poshmark** · and more » | **à retirer** : annonce Depop (bêta fermée) et Poshmark (jamais), ancien positionnement |
| `og-image-en.png` | 2 articles EN | « **Fill & Sell** — Speak. AI does the rest. » | ancien nom de marque, ancien positionnement (vocal) |

### 2.9 Sitemap et robots

- `robots.txt` : tout ouvert, `/app$`, `/app?`, `/api/` fermés, sitemap déclaré : correct. Aucun bot IA bloqué.
- `sitemap.xml` (généré au build) : 9 URL ; **`/extension` absente** ; `lastmod` de `/` et `/legal` **codés en dur à
  2026-07-26** (le texte légal a changé le 05/10) ; hreflang de la home faux (§ 2.3) ; `priority`/`changefreq`
  ignorés par Google (sans gravité).

### 2.10 Indexation et requêtes de marque (2026-10-09)

- **Outil WebSearch** (index US, pas Google) : `site:fillsell.app` → **aucune page de fillsell.app** ;
  « fillsell crosslisting » → aucune mention de FillSell ; « "fillsell.app" » → seul l'agrégateur
  https://mwm.ai/apps/fillsell/6762152785 (copie d'une **ancienne** fiche App Store : « AI app for serious resellers
  on Vinted, eBay, Depop », saisie vocale, « free plan: up to 20 items, 5 voice commands per day », version 2.1).
- **Bing France** (`curl`, `cc=FR`, `setlang=fr`) :
  - « fillsell » et « fillsell crosslisting » → 1. `fillsell.app/` (« FillSell – Publie et republie sur toutes tes
    plateformes ») ; 2. Chrome Web Store « FillSell — Cross-post » ; 3. APKPure ; 4.
    `fillsell.app/blog/cross-listing-vinted-leboncoin` ; 5. un reel Instagram ; 7. App Store **AU** « FillSell –
    Reseller App » ; 9. `apps.shopify.com/fillsell` (**l'autre société**) ; 10. TikTok `@fillsell.app`.
  - `site:fillsell.app` → Bing ignore l'opérateur et renvoie des résultats sans rapport (Deezer) : **inconclusif**.
  - Requêtes génériques (« cross-listing vinted leboncoin », « vendre le même article sur vinted et leboncoin ») :
    réponses de Bing incohérentes par `curl` (mots isolés) — **non exploitable**, à mesurer autrement.
- **Google : non vérifiable ici.** À relever par Nico dans la Search Console : rapport « Pages » (indexées / exclues,
  « soft 404 », « page en double sans URL canonique sélectionnée »), et requêtes de marque « fillsell »,
  « fillsell app », « fillsell vinted » dans le rapport « Performances ».

### 2.11 Désambiguïsation de la marque (fillsell.com)

- **fillsell.com** : injoignable depuis ce poste le 2026-10-09 (WebFetch : `ECONNREFUSED`, curl : délai dépassé) —
  son contenu n'a pas pu être lu à la source. Sources tierces : app Shopify « FillSell-Sourcing & Dropshipping »
  (sourcing auprès de fournisseurs en Chine, exécution des commandes de dropshipping ; plusieurs pages de l'App Store
  Shopify disent l'app « non proposée actuellement ») — https://www.growave.io/apps/fillsell-sourcing-dropshipping ,
  https://apps.shopify.com/fillsell?locale=ko (lues via résultats de recherche le 2026-10-09).
- **Ce que le site fait déjà** : JSON-LD Organization avec `url`, `logo`, `email`, `description` (« publication
  multi-plateformes d'annonces de seconde main pour les revendeurs français ») et `sameAs` vers les fiches stores ; le
  commentaire d'index.html l. 74-77 nomme le risque. Ce JSON-LD est dans le HTML brut : bien.
- **Ce qui affaiblit l'entité** :
  - `sameAs` TikTok = `https://www.tiktok.com/@fill.sell` : la page répond mais **sans profil** (aucun `uniqueId`),
    alors que `https://www.tiktok.com/@fillsell.app` renvoie le profil « FillSell » (813 abonnés) et que Bing classe
    une vidéo de `@fillsell.app`. **À confirmer par Nico** (compte renommé ?). Même lien dans le pied de page.
  - Instagram (un reel classé 5e sur Bing) et X (`x.com/fillsellapp`, lié en pied de page) absents de `sameAs`.
  - Variantes de nom : « Fill & Sell » (og-image-en.png), « F&S » (`public/site.webmanifest`, non lié), « FillSell –
    Reseller App » (App Store AU), « FillSell – Achat Revente » (App Store FR), « FillSell — Cross-post » (Chrome Web
    Store), « FillSell » (Play).
  - Description de l'entité incohérente selon la source : « Suivi de profits revente » (`manifest.json`), « outil SaaS
    de suivi d'achat-revente » (CGU 3.1), « reseller app vocale Vinted/eBay/Depop » (agrégateur), « crosslisting
    4 plateformes » (site), « 5 plateformes dont Opla » (stores).
  - Pas de page « À propos » ni d'éditeur nommé (« Responsable de publication : Le gérant de FillSell », `/legal`).

---

## 3. Fiches par page

### 3.1 Accueil `/`

- **Head (HTML brut)** : `<title>` « FillSell – Publie et republie sur toutes tes plateformes » (56 car.) ; meta
  description « Publiez une annonce sur Vinted, Leboncoin, eBay et Beebs en une seule fois. Republication automatique,
  gestion du stock à la voix, analyse photo IA, retrait des annonces en un tap après la vente. » (195 car., **vous**,
  trop longue) ; canonical `https://fillsell.app` ; robots `index, follow` ; hreflang fr/en/x-default → même URL ;
  `viewport` avec `user-scalable=no` (accessibilité).
- **Structure (après JS)** : 1 H1 « Tes annonces, publiées partout : Vinted, Leboncoin, eBay et Beebs. » ; 11 H2,
  tous des slogans (« Ton téléphone pilote. Ton ordinateur exécute. », « Tes annonces qui dorment remontent toutes
  seules. », « Un plan pour chaque volume. »…) ; **aucun H3** (questions de FAQ en `<summary>`, cartes de prix en
  `<div>`). Les mots « cross-listing », « crosslisting », « multi-plateforme », « revendeur » n'apparaissent dans
  **aucun** titre (0 occurrence de « cross-listing » dans LandingPage.jsx).
- **Requête visée apparente** : la marque + « publier sur Vinted, Leboncoin, eBay et Beebs ».
- **Contenu** : clair, concret, honnête sur les limites (ordinateur allumé, « aucun outil ne peut promettre zéro
  risque »). Sections : sync, publication, republication, après la vente, IA, stock/bénéfices, tarifs, FAQ (8 Q).
- **Erreurs et incohérences** :
  - « **Retiré des 4 autres** » au-dessus de **3** plateformes (reste de l'époque Opla) — l. 1155.
  - « Vendu sur Vinted — **21 €** » traduit « Sold on Vinted — **€18** ».
  - « Le retrait attend ta confirmation — jamais dans ton dos. » et FAQ « Tu confirmes, il retire… » : **faux pour une
    vente prouvée depuis le 08/10** (§ 4).
  - Cartes : « {ADS_FREE} annonces publiées / mois » (repli : 5) **et** FAQ : « La publication elle-même est incluse et
    illimitée » — formulation contradictoire pour un visiteur.
  - FAQ « Est-ce risqué ? » : « republication automatique **plafonnée à 45 par jour** » — l'app a cessé d'afficher cette
    cadence le 02/09 (commentaire ConversionModal.jsx l. 238 : « n'est PLUS affichée nulle part ») ; la valeur réelle
    n'a pas pu être lue (`coin_config`). **À vérifier par Nico.**
  - Héros : « Elle remonte en tête des résultats **toutes les 24 h** » ; l'App Store dit « Tu choisis les jours et le
    créneau ». **À vérifier.**
  - Business oublié : version EN « Move to Premium or Pro » (le FR dit « Premium, Pro ou Business ») ; FAQ « Je peux
    annuler ? » et « Lens » ne citent que Premium et Pro.
  - « Lens » n'est jamais présenté avant la question « Lens, c'est illimité ? » (jargon interne).
  - eBay publié par l'API officielle (sans ordinateur) : non mentionné, alors que la FAQ dit « pour que les
    publications partent, oui » (ordinateur allumé).
- **Données structurées** : Organization, SoftwareApplication, WebSite (brut) + FAQPage (JS).
- **Liens** : sortants `/blog`, `/legal#mentions`, `/legal#confidentialite`, `/login…`, stores, Chrome Web Store,
  TikTok, X, mailto ; aucun article ; pas `/extension`.
- **Ton** : tu (corps), vous (meta description, JSON-LD).

### 3.2 Liste du blog `/blog`

- `<title>` « Le blog des revendeurs — FillSell » (33) ; description (184 car., trop longue) ; canonical `/blog` ;
  hreflang `fr` seul ; H1 « **Blog FillSell** » (non descriptif) ; sous-titre « Guides pratiques pour revendre plus
  intelligemment et **calculer vos marges** avec précision » (positionnement « profits » d'avant le cross-listing) ;
  6 cartes en H2, FR et EN mêlées, « Lire l'article → » en français sous les articles anglais ; pas de pied de page,
  pas de catégorie, pas de JSON-LD propre (ni `Blog`, ni `ItemList`, ni `BreadcrumbList`).
- Ton : vous.

### 3.3 `/blog/cross-listing-vinted-leboncoin` (FR, 02/08/2026)

- `<title>` « Cross-listing : vendre sur Vinted et Leboncoin en même temps — FillSell » (71 car. avec le suffixe) ;
  description 234 car. (**trop longue**) ; H1 = titre ; 6 H2 + FAQ (5 H3) ; 1 492 mots hors FAQ.
- **Requête visée** : « cross-listing », « vendre sur Vinted et Leboncoin en même temps », « outil de cross-listing ».
- **Qualité** : le meilleur article du site. Définition, différence cross-listing / republication, double vente,
  « extension ou service distant », grille de 4 questions pour choisir un outil, réponses de FillSell. Honnête,
  différenciant (question des accès aux comptes).
- **Périmé / faux** :
  - « Les plateformes de seconde main n'offrent pas d'accès officiel pour déposer des annonces à votre place » : faux
    pour eBay (API officielle, utilisée par FillSell).
  - « Le retrait n'est jamais déclenché sans vous » (FAQ) / « Pourquoi une confirmation plutôt qu'un retrait d'office ? » :
    faux depuis le 08/10 pour une vente prouvée.
  - « La republication Vinted existe à côté » / « presque toujours Vinted » : l'accueil vend la republication sur
    **Vinted, Leboncoin et Beebs** (automatique sur Vinted seulement).
  - « FillSell fonctionne-t-il ordinateur éteint ? Non » : vrai pour l'extension, faux pour eBay relié par l'API.
- **Données structurées** : Article + FAQPage (5). **Ton** : vous.

### 3.4 `/blog/publier-annonce-plusieurs-plateformes` (FR, 30/07/2026)

- `<title>` « Publier ses annonces sur plusieurs plateformes en une seule fois — FillSell » (75) ; description 155 ;
  7 H2 + 1 H3 + FAQ (6 H3) ; 1 311 mots hors FAQ.
- **Requête visée** : « publier une annonce sur plusieurs plateformes / sites », « multi-diffusion d'annonces ».
- **Nature** : documentation produit (le parcours FillSell étape par étape, ce qui reste à la charge de la personne,
  vérifications anti-robot, délais). Utile et précise, mais c'est une **page produit**, pas un guide neutre.
- **Périmé / à nuancer** :
  - « L'application rédige un brouillon d'annonce **par plateforme** … chacune avec le ton et les champs attendus » :
    depuis le 04/10 le texte publié est **celui de la fiche** sur toutes les plateformes (texte général + cartes qui le
    suivent, sauf retouche ; `src/publication/texteDeLaFiche.js`) ; l'App Store dit « Tu écris le titre, la
    description et l'état une seule fois : ils valent pour toutes les plateformes ».
  - « FillSell ne demande ni ne stocke aucun identifiant de plateforme » : vrai pour les mots de passe ; un compte eBay
    relié par l'API laisse un jeton OAuth côté serveur — formulation à préciser.
  - « Un article marqué vendu peut être retiré des autres plateformes » (sous-entendu : à la main) : incomplet depuis le 08/10.
  - eBay sans ordinateur : absent.
- **Données structurées** : Article + FAQPage (6). **Ton** : vous. **Seul article qui lie `/extension`.**

### 3.5 `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` (FR, 05/09/2026)

- `<title>` 99 car. + suffixe = **110** (tronqué dans tous les moteurs) ; description 190 ; 5 H2 + FAQ (5 H3) ;
  1 425 mots hors FAQ.
- **Requête visée** : « vendre le même article sur plusieurs plateformes », « éviter la double vente »,
  « vendre sur Vinted et Leboncoin en même temps ».
- **Qualité** : très bon guide de méthode (où publier selon l'article, fiche source, codes de chaque site, fenêtre de
  double vente, réservation Leboncoin, registre, routine hebdomadaire). Neutre et utile sans outil.
- **Périmé** : « Rien n'est retiré sans votre confirmation » (section produit et FAQ) ; eBay sans ordinateur absent.
- **Maillage** : **0 lien entrant** éditorial. **Ton** : vous. Traduction EN appariée (hreflang correct).

### 3.6 `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` (EN, 05/09/2026)

- Traduction fidèle du précédent (+ une phrase utile : « Leboncoin and Beebs are French »). `<title>` 101 + suffixe =
  **112** ; description 174 ; og:image = `og-image-en.png` (« Fill & Sell », vocal).
- Liens vers deux articles **français** (`cross-listing` non signalé, `publier` signalé « in French »).
- Mêmes affirmations périmées sur le retrait. **0 lien entrant.** Ton : neutre.

### 3.7 `/blog/comment-calculer-profits-vinted` (FR, 15/06/2026)

- `<title>` « Comment calculer vos profits sur Vinted : le guide complet — FillSell » (69) ; description 151 ;
  6 H2 + 4 H3 ; **553 mots** (le plus mince) ; aucun FAQ ; og:image = `og-image.jpg` (**Depop, Poshmark**, anglais).
- **Requête visée** : « calculer bénéfice / marge Vinted », « profit Vinted ».
- **Faux ou périmé** :
  - « Avantage décisif par rapport à **eBay (13 %)** » : depuis le 01/09/2026, un **particulier de l'EEE ne paie plus de
    frais de vente sur eBay.fr** (jusqu'à 150 annonces gratuites par mois, 0,35 € au-delà ; frais de protection
    acheteurs côté acheteur). Sources : https://pages.ebay.fr/revendre-sur-ebay/ (lue le 2026-10-09) ;
    https://www.justgeek.fr/ebay-supprime-frais-vente-particuliers-157677/ (article du 01/09/2026).
  - « **Depop (10 %)** » : Depop a supprimé ses frais de vente de 10 % au Royaume-Uni puis aux États-Unis en 2024 (frais
    de traitement du paiement restants). Source : https://news.depop.com/depop-removes-selling-fees-in-the-united-states-evolves-fee-structure/
    (via résultats de recherche, 2026-10-09). De plus, citer Depop sur le site est déconseillé tant que l'intégration est
    une bêta fermée.
  - « Vinted ne prélève aucune commission sur le vendeur » : **cohérent** avec des sources tierces de 2026
    (https://margeoapp.com/blog/frais-vinted-2026, résultat de recherche du 2026-10-09) ; page officielle Vinted non lue.
  - « Livraison 2,65 € à 8 € » : **non vérifié**.
  - Rendu cassé : `<code>(23,50 ÷ 8) × 100 = **293 %**</code>` — les astérisques s'affichent tels quels ; tableaux avec
    une ligne d'en-tête vide (`<th></th><th></th>`).
  - Conclusion « FillSell automatise tout : vous dictez vos achats par commande vocale… ROI… en temps réel » :
    ancien positionnement (la dictée existe toujours, mais n'est plus l'argument principal).
- **Ton** : vous.

### 3.8 `/blog/how-to-calculate-reselling-profits` (EN, 20/06/2026)

- `<title>` 70 + suffixe = 81 ; description 180 ; 6 H2 + 5 H3 ; 550 mots ; og:image `og-image-en.png`.
- **Requête visée** : « reselling profit », « how to calculate reselling profit » (marché américain).
- **Hors cible** : dollars, PayPal, StockX, Facebook Marketplace, palettes de liquidation ; aucune des 4 plateformes de
  FillSell hormis eBay et Vinted.
- **Faux** :
  - Exemple eBay : « PayPal fee (2.9% + $0.30) » **en plus** des frais eBay : depuis les paiements gérés par eBay, le
    traitement du paiement est inclus dans les frais sur valeur finale (+ 0,30 $ / 0,40 $ par commande).
    Sources : https://www.ebay.ca/sellercentre/resources/seller-updates/2024-winter/financials ,
    https://channelx.world/2024/02/ebay-com-per-order-fee-rises-to-0-40/ (via résultats de recherche, 2026-10-09).
  - « Facebook Marketplace 5% (shipped) » : 10 % (minimum 0,80 $) depuis le 15/04/2024 (sources tierces :
    https://retailboss.co/facebook-marketplace-fees-double-from-5-to-10-percent , 2026-10-09).
  - « Depop 10% » : supprimé en 2024 (cf. ci-dessus).
  - « eBay ~13.25% » : les sources de 2026 divergent (13,25 % ou 13,6 %) — **non tranché**.
  - Même bug de rendu `**283%**`.
- **0 lien interne sortant**, 1 entrant. Ton : neutre.

### 3.9 `/extension`

- `useSeo` : title « Extension Chrome FillSell — publier sur Vinted, Leboncoin, eBay, Beebs » (70) ; description
  « Installez l'extension… » (169, **vous**) ; og:title « …une annonce, toutes tes plateformes » (**tu**) — **rien de
  tout cela n'est dans le HTML brut** (canonical brut = home). Absente du sitemap.
- Corps (tu) : H1 « Extension Chrome » (non descriptif), bandeau Web Store, « Ce que ça débloque », 3 étapes, avis
  « ancienne version .zip », contact. Sur téléphone : consigne « ouvre ce lien sur ton ordinateur ».
- **Périmé** : « Tes annonces Vinted **remontent toutes seules** dans l'app » — depuis le 05/10, un relevé d'import ne
  part **que** sur « Synchroniser ». Juxtaposition maladroite : « Tes annonces partent sur Vinted, Leboncoin, eBay et
  Beebs… » puis « Rien n'est publié, modifié ni supprimé » (la seconde phrase vise la lecture, pas la publication).
- Requête visée apparente (commentaire du code) : « extension revente vinted », « publier vinted leboncoin
  automatiquement ». Le bouton « Retour à l'app » mène à `/app` (protégé) : pour un visiteur, il renvoie à l'accueil.

### 3.10 `/legal`

- `useSeo` : title « Mentions légales, CGU, CGV et confidentialité — FillSell », description 175 — **absents du HTML
  brut**. H1 « Mentions légales, CGU & CGV », sections H2 via `Section`. Mise à jour affichée : 5 octobre 2026.
- Mentions d'Opla (dates de sortie) et de Depop (permission optionnelle) : **normales** dans un texte juridique.
- **À signaler à Nico (texte juridique, pas une décision SEO)** :
  - CGU 3.1 : « FillSell est un outil SaaS de **suivi d'achat-revente** permettant … gérer leur inventaire, calculer
    leurs marges » — ne décrit plus le service (publication, republication, retrait) ; les IA lisent ce texte.
  - Clause de retrait (l. 813) : « Ce retrait n'est **jamais déclenché sans votre confirmation explicite** » —
    contredite par l'enregistrement automatique des ventes prouvées depuis le 08/10 (§ 4).
  - Liste « Vinted, Leboncoin, eBay, Beebs, Opla » dans la même clause.
  - Un paragraphe (pixel Meta) en tutoiement dans un texte au vouvoiement.

### 3.11 Pages utilitaires

`/login`, `/success`, `/cancel`, `/reset-password`, `/auth/callback` : `X-Robots-Tag: noindex, follow` posé par
`vercel.json` (bien). `/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/barre-progression` : noindex posé
**en JS seulement** — le HTML brut dit `index, follow` avec le canonical de la home ; sans gravité réelle (canonical
home) mais à aligner sur l'en-tête HTTP.

---

## 4. Affirmations fausses ou périmées (récapitulatif)

| # | Où | Affirmation | Réalité | Preuve | Gravité |
|---|---|---|---|---|---|
| 1 | Accueil (section vendu + FAQ), cross-listing, publier, vendre-meme, sell-same, CGU | Le retrait n'est jamais déclenché sans la confirmation de la personne | Depuis le 08/10 23:40, une vente Vinted prouvée « sold » s'enregistre seule et arme les retraits des copies prouvées (déjà vrai pour la détection eBay) ; l'app vend « Retrait automatique partout après une vente » | `docs/enquetes/ventes-prouvees-0810/RAPPORT.md` § 4 ; `ConversionModal.jsx` l. 186 | **Haute** (promesse + CGU) |
| 2 | cross-listing, publier, vendre-meme, sell-same, FAQ accueil | Pas d'accès officiel ; il faut un ordinateur allumé pour publier | eBay : publication et relevé par l'API officielle sans Chrome pour un compte relié | `supabase/functions/ebay-api-worker/index.ts` (en-tête) | Haute (et argument perdu) |
| 3 | comment-calculer | eBay 13 % | eBay.fr : 0 € de frais de vente pour un particulier de l'EEE depuis le 01/09/2026 | pages.ebay.fr/revendre-sur-ebay/ | Haute |
| 4 | comment-calculer, how-to | Depop 10 % | supprimé UK/US en 2024 ; Depop = bêta fermée chez FillSell | news.depop.com | Moyenne |
| 5 | og-image.jpg (comment-calculer) | « Vinted · eBay · Depop · Poshmark · and more » | 4 plateformes : Vinted, Leboncoin, eBay, Beebs | image dans `public/` | **Haute** (annonce Depop) |
| 6 | how-to | PayPal 2,9 % + 0,30 $ sur une vente eBay | inclus dans les frais eBay depuis les paiements gérés | ebay.ca seller centre | Moyenne |
| 7 | how-to | Facebook Marketplace 5 % | 10 % (min. 0,80 $) depuis le 15/04/2024 | retailboss.co | Faible (hors cible) |
| 8 | Accueil | « Retiré des 4 autres » | 3 autres plateformes | LandingPage.jsx l. 1155 | Moyenne (visible) |
| 9 | Accueil EN | « Sold on Vinted — €18 » | FR : 21 € | dictionnaire EN l. 223 | Faible |
| 10 | cross-listing | Republication = « presque toujours Vinted », « La republication Vinted existe à côté » | republication sur Vinted, Leboncoin et Beebs (auto : Vinted) | LandingPage.jsx l. 214 et 1083 | Moyenne |
| 11 | publier | Une version d'annonce par plateforme, ton adapté à chaque site | texte de la fiche partout (cartes qui suivent le texte général, sauf retouche) | `src/publication/texteDeLaFiche.js` (04/10) | Moyenne |
| 12 | `/extension` | « Tes annonces Vinted remontent toutes seules » | relevé d'import seulement sur « Synchroniser » (05/10) | CLAUDE.md « UN RELEVÉ D'IMPORT NE PART QUE SUR SYNCHRONISER » | Moyenne |
| 13 | Encart de fin de tous les articles | « dictez vos achats, l'app fait le reste » (marges) | positionnement actuel : cross-listing ; la dictée existe mais n'est plus l'argument | BlogPost.jsx, prérendu | Moyenne |
| 14 | Accueil FAQ | Republication auto plafonnée à 45/jour | valeur non affichée dans l'app depuis le 02/09 ; valeur réelle non lue | ConversionModal.jsx l. 238 | **À vérifier** |
| 15 | Accueil héros | Remonte « toutes les 24 h » | l'App Store : jours et créneau choisis | fiche App Store | **À vérifier** |
| 16 | Accueil cartes / FAQ | « N annonces publiées / mois » et « publication incluse et illimitée » | les deux sont affichés | LandingPage.jsx | Confusion |
| 17 | `manifest.json` | « Suivi de profits revente » | crosslisting | public/manifest.json | Faible |
| 18 | CGU 3.1 | « outil SaaS de suivi d'achat-revente » | publication / republication / retrait multi-plateformes | Legal.jsx | Moyenne (lu par les IA) |
| 19 | App Store (hors site) | 5 plateformes dont Opla ; « republications offertes à vie » en gratuit | Opla sort le 10/10 ; 50 republications **par mois** depuis le 05/10 | https://apps.apple.com/fr/app/fillsell/id6762152785 (lue le 2026-10-09) | Haute après le 10/10 |
| 20 | Google Play (hors site) | « Relève et publie tes annonces sur Vinted, Leboncoin, eBay, Beebs et Opla » | Opla sort le 10/10 | https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr (lue le 2026-10-09) | Haute après le 10/10 |

Mentions publiques : **Opla** n'apparaît dans aucun texte visible du site hors `/legal` (seulement dans des
commentaires du code de l'accueil) ; **Depop** apparaît dans 2 articles (comparaison de frais) et sur `og-image.jpg` ;
**FillSell Cloud** : rien de visible (drapeau `CLOUD_OFFER_ENABLED = false`).

---

## 5. Cannibalisations

### 5.1 Les trois articles « plusieurs plateformes »

| | cross-listing-vinted-leboncoin | vendre-meme-article-… | publier-annonce-plusieurs-plateformes |
|---|---|---|---|
| Titre | « Cross-listing : vendre sur Vinted et Leboncoin **en même temps** » | « Vendre le même article sur Vinted, Leboncoin, eBay et Beebs **en même temps**, sans le vendre deux fois » | « Publier ses annonces sur plusieurs plateformes en une seule fois » |
| Intention | définir + choisir un outil (commerciale) | méthode, avec ou sans outil (informationnelle) | décrire FillSell (produit) |
| Sections communes | double vente ; « ce que fait FillSell » (ordinateur allumé, retrait en un tap, « une annonce qui disparaît n'est pas toujours une vente ») | double vente (en profondeur) ; « ce que fait FillSell » (mêmes phrases) | « Pourquoi vendre sur plusieurs plateformes en même temps ? » ; « Et après la vente ? » |
| FAQ en double | « Vendre le même article sur plusieurs plateformes est-il autorisé ? » ; « Comment éviter de vendre deux fois ? » ; « Sur combien de plateformes ? » ; « Ordinateur éteint ? » | « Peut-on vendre le même article sur … en même temps ? » ; « Comment FillSell évite-t-il la double vente ? » | « Sur quelles plateformes ? » ; « Faut-il laisser son ordinateur allumé ? » |

- **cross-listing ↔ vendre-meme** : **cannibalisation réelle** sur « vendre sur Vinted et Leboncoin en même temps »
  (mot pour mot dans le titre du premier, présent dans le second) et sur « double vente ». Les deux pages répondent à la
  même question de FAQ presque dans les mêmes mots.
- **publier ↔ les deux autres** : recouvrement partiel (« pourquoi plusieurs plateformes », FAQ produit) ; surtout,
  `publier` sera en concurrence directe avec la future page vitrine « comment ça marche » / pilier crosslisting prévue
  par ARCHITECTURE.md.
- **Partage proposé** :
  - `cross-listing-vinted-leboncoin` = **pilier « cross-listing »** (définition, différence avec la republication,
    risques, choisir un outil). Titre centré sur « cross-listing » (≤ 60 car.), sans « en même temps ».
  - `vendre-meme-article-…` = **« éviter la double vente »** (méthode, réservation, registre, routine). Titre
    ≤ 60 car. centré « double vente ». Section produit réduite à un paragraphe + lien.
  - `publier-annonce-plusieurs-plateformes` = **fondu dans la page produit vitrine** (301).
  - FAQ : chaque question une seule fois sur le site (la page FAQ prévue par ARCHITECTURE.md porte les questions
    produit ; les articles ne gardent que leurs questions propres).

### 5.2 Les deux articles « profits »

`comment-calculer-profits-vinted` (FR, Vinted) et `how-to-calculate-reselling-profits` (EN, US, multi-plateformes) ne
se disputent pas la même requête (langues différentes), mais ils traitent le même sujet sans être appariés. Les refaire
**comme une paire FR/EN** (même plan, frais européens, `translation:` réciproque).

### 5.3 Accueil ↔ `/extension` ↔ `publier`

Les trois promettent « une annonce publiée sur Vinted, Leboncoin, eBay et Beebs » ; l'accueil n'est pas lisible sans
JS, `/extension` non plus : aujourd'hui, pour un robot sans JS, **`publier-annonce-plusieurs-plateformes` est la seule
page qui décrit le produit**. Ce n'est pas une cannibalisation au sens strict, mais la home ne peut pas se positionner
sur sa propre requête tant qu'elle est vide.

---

## 6. Ce qui est bon, faible, manquant

**Bon**
- Blog prérendu proprement (HTML complet, head propre par article, canonical absolu, hreflang réciproques pour la paire,
  sitemap généré depuis les `.md`, échec du build sur incohérence).
- Trois guides FR solides, longs (1 300-1 500 mots hors FAQ), honnêtes, différenciants (accès aux comptes, ordinateur
  allumé, « aucun outil ne peut promettre zéro risque »), structurés en H2 questions.
- Accueil : H1 unique et explicite, FAQ construite depuis le texte affiché, quotas lus en base (pas de chiffres figés),
  aucune note inventée, témoignages fictifs retirés.
- `robots.txt` correct (aucun robot IA bloqué, piège du préfixe `/app` documenté) ; redirections www/http propres.
- Marque n° 1 sur Bing France pour « fillsell ».

**Faible**
- Accueil, `/extension`, `/legal` vides sans JS ; soft 404 ; hreflang de la home.
- Ton incohérent (tu / vous) ; titres d'articles trop longs (3 sur 6 > 80 car. avec suffixe) ; descriptions > 160 car.
  sur 4 pages.
- Images OG périmées (Depop/Poshmark, « Fill & Sell ») ; bannière promo réutilisée comme illustration d'article.
- CTA du blog hors sujet (marges, voix) et toujours vers la home ; pas de pied de page sur le blog.
- Aucun auteur, aucune date de mise à jour, aucune page « À propos » (E-E-A-T faible) ; éditeur non nommé.
- Deux articles sans aucun lien entrant ; un article sans lien sortant.
- H2 de l'accueil sans aucun terme de recherche.

**Manquant** (constat de contenu ; le choix des sujets revient à l'étape mots-clés)
- Aucune page sur la **republication** (fonction centrale, vendue sur l'accueil) : « republier / remonter une annonce
  Vinted », risques, cadence.
- Aucune page sur l'**import / synchronisation** du dressing et des annonces existantes.
- Aucune page par **plateforme** (Leboncoin, eBay, Beebs, Vinted) ni par **trajet** (Vinted → Leboncoin, Vinted → eBay,
  Vinted → Beebs).
- Aucune page **tarifs** indexable (les prix n'existent qu'en JS), aucune page **FAQ**, aucune page **sécurité /
  risques de compte**, aucune page **à propos**.
- Aucun **comparatif / alternative** (le comparatif FR de Margeo, mis à jour le 05/10/2026, cite Vendoo, List
  Perfectly, Nifty, Flyp, Crosslist Magic, SellerAider… et **pas FillSell** —
  https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026 , lu le 2026-10-09).
- Aucune version **anglaise** de l'accueil à une URL propre.
- `/llms.txt` absent.

---

## 7. Décision par URL

| URL | Décision | Ce qu'il faut faire | Redirection |
|---|---|---|---|
| `/` | **Refaire le rendu, améliorer le contenu** | HTML statique (ARCHITECTURE.md) ; FR par défaut sans dépendre du navigateur ; hreflang `en`/`x-default` retirés (index.html + sitemap) jusqu'à `/en/` ; meta description au tutoiement ≤ 155 car. ; H2 porteurs de requêtes ; corriger « 4 autres », « €18 », clause retrait, Business oublié, « Lens » expliqué, contradiction « N publiées / illimitée » ; « 45/jour » et « 24 h » vérifiés ; mention eBay par l'API ; liens vers les guides et `/extension` | — |
| `/blog` | **Améliorer** | H1 descriptif ; sous-titre hors « marges » ; libellés EN pour les articles EN ou liste séparée ; pied de page ; JSON-LD `Blog`/`ItemList` | `/blog/` → `/blog` (308, optionnel) |
| `/blog/cross-listing-vinted-leboncoin` | **Améliorer** (pilier « cross-listing ») | titre ≤ 60 centré « cross-listing » ; description ≤ 160 ; corriger accès officiel (eBay), retrait automatique, republication 3 plateformes ; retirer les FAQ en double ; CTA vers l'inscription | URL gardée |
| `/blog/publier-annonce-plusieurs-plateformes` | **Fusionner** dans la future page produit (« comment ça marche » / « publier sur plusieurs plateformes ») | reprendre son contenu (parcours, ce qui reste à faire, vérifications, délais) dans la page vitrine, à jour (texte de la fiche, eBay API, retrait auto) ; d'ici là, corriger les faits | **301** `/blog/publier-annonce-plusieurs-plateformes` → URL de la page produit, posée **le jour où celle-ci est en ligne** ; mettre à jour les 4 liens internes qui y pointent |
| `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` | **Améliorer** (recentrer « double vente ») | titre ≤ 60 ; section produit raccourcie et corrigée ; liens entrants depuis l'accueil, le pilier et les pages plateformes | URL gardée (changer le slug coûterait la paire hreflang pour un gain faible) |
| `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` | **Améliorer** | mêmes corrections ; titre ≤ 60 ; image OG sans « Fill & Sell » ; liens vers les futures pages EN | URL gardée |
| `/blog/comment-calculer-profits-vinted` | **Refaire** (même URL) | frais 2026 (Vinted, eBay.fr 0 € particulier, Leboncoin, Beebs) avec sources datées ; retirer Depop ; corriger le rendu `**…**` et les tableaux ; nouvelle image OG ; CTA à jour | URL gardée |
| `/blog/how-to-calculate-reselling-profits` | **Refaire** en jumeau EN du précédent (€, plateformes européennes, `translation:` réciproque) | corriger PayPal/eBay, FB, Depop ou supprimer ces lignes ; liens internes | URL gardée ; **à défaut de réécriture : `noindex`** (pas de 301 vers un sujet différent) |
| `/extension` | **Améliorer** | `<head>` prérendu (title, description au tu, canonical `/extension`) + corps statique ; ajout au sitemap ; H1 descriptif ; corriger « remontent toutes seules » et la juxtaposition « partent / rien n'est publié » ; lien depuis l'accueil | — (si une page vitrine « extension Chrome » est créée ailleurs : `/extension` reste l'URL des mails, la page vitrine pointe dessus ou inversement — à trancher avec l'architecture, jamais deux pages pour la même requête) |
| `/legal` | **Garder** (texte juridique : décision Nico) | `<head>` prérendu (canonical `/legal` dans le HTML brut) ; `lastmod` réel ; signaler CGU 3.1, clause de retrait, ton mixte | — |
| Pages utilitaires (`/auth/confirm`, `/desinscription`, `/ebay/retour`, `/demo/*`) | **Garder** | ajouter `X-Robots-Tag: noindex` dans vercel.json | — |
| URL inconnues | **Corriger** | statut 404 réel | — |
| `/llms.txt` | **Créer** | (prévu par ARCHITECTURE.md) | — |
| Images `og-image.jpg`, `og-image-en.png` | **Remplacer** | plus de Depop/Poshmark, plus de « Fill & Sell » | — |
| `public/manifest.json` | **Améliorer** | description « crosslisting » | — |

---

## 8. À trancher ou vérifier par Nico

1. **Ton du site** : tutoiement partout (blog compris) ? (proposition : oui ; juridique au vouvoiement).
2. **« On publie partout »** sur l'accueil contre la règle « Jamais « on publie pour toi » » d'AGENTS.md : la règle vaut-elle
   pour le site ?
3. **Retrait automatique** : quelle formulation publique depuis les ventes prouvées automatiques (08/10) ? Et la clause
   de retrait des CGU (l. 813) : à réécrire (décision juridique).
4. **Cadence affichée** « 45 par jour » et « toutes les 24 h » : valeurs réelles ? les afficher ou non (l'app a cessé de
   l'afficher le 02/09) ?
5. **eBay par l'API sans ordinateur** : peut-on le dire publiquement (ouvert à tous les comptes reliés) ?
6. **Search Console** : rendu de `/` (FR ou EN ?), pages indexées / soft 404, requêtes de marque.
7. **TikTok** : `@fill.sell` (déclaré) ou `@fillsell.app` (actif) ? Instagram et X à ajouter à `sameAs` ?
8. **Fiches stores** (hors site) : retirer Opla après le 10/10 (App Store, Play), corriger « republications offertes à
   vie », unifier le nom (« FillSell – Reseller App » en AU).
9. **CGU 3.1** : description du service à mettre à jour.
10. **Page « À propos »** : accepter un éditeur nommé (E-E-A-T, désambiguïsation) ?

## 9. Hors périmètre, signalé en passant

- `index.html` charge **GTM et la balise Google Ads `AW-16622098460` sans condition**, avant le bandeau de consentement ;
  la page légale ne décrit comme traceur publicitaire que le pixel Meta « chargé uniquement après ton consentement ».
  Un mode de consentement peut être réglé dans le conteneur GTM : **non vérifié**. À faire relire.
- `/fillsell-extension.zip` est servi publiquement (520 Ko) alors que le site dit que le Web Store est la seule voie.
- `public/site.webmanifest` (non lié) référence `/android-chrome-192x192.png`, absent de `public/`.

---

## Sources externes (toutes consultées le 2026-10-09)

- Google — Managing multi-regional and multilingual sites : https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Google — Localized versions (hreflang) : https://developers.google.com/search/docs/specialty/international/localized-versions
- Google — Locale-adaptive pages : https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages (via résultats de recherche)
- Google — FAQPage (résultats enrichis FAQ arrêtés le 07/05/2026) : https://developers.google.com/search/docs/appearance/structured-data/faqpage
- eBay France — Revendre sur eBay (frais particuliers) : https://pages.ebay.fr/revendre-sur-ebay/
- JustGeek — « eBay supprime les frais de vente pour les particuliers » (01/09/2026) : https://www.justgeek.fr/ebay-supprime-frais-vente-particuliers-157677/
- Depop — suppression des frais de vente aux États-Unis (2024) : https://news.depop.com/depop-removes-selling-fees-in-the-united-states-evolves-fee-structure/ (via résultats de recherche)
- FashionUnited — Depop supprime les frais de vente au Royaume-Uni (2024) : https://fashionunited.uk/news/business/depop-removes-selling-fees-in-uk/2024032174732 (via résultats de recherche)
- eBay Canada Seller Centre — frais par commande (2024) : https://www.ebay.ca/sellercentre/resources/seller-updates/2024-winter/financials (via résultats de recherche)
- ChannelX — frais par commande eBay.com à 0,40 $ : https://channelx.world/2024/02/ebay-com-per-order-fee-rises-to-0-40/ (via résultats de recherche)
- RetailBoss — Facebook Marketplace 5 % → 10 % : https://retailboss.co/facebook-marketplace-fees-double-from-5-to-10-percent (via résultats de recherche)
- Margeo — frais Vinted 2026 : https://margeoapp.com/blog/frais-vinted-2026 (via résultats de recherche) ; comparatif crosslisting France 2026 (sans FillSell) : https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026
- App Store FR — fiche FillSell : https://apps.apple.com/fr/app/fillsell/id6762152785
- Google Play — fiche FillSell : https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr
- Agrégateur mwm.ai (ancienne fiche App Store) : https://mwm.ai/apps/fillsell/6762152785
- Homonyme « FillSell-Sourcing & Dropshipping » : https://www.growave.io/apps/fillsell-sourcing-dropshipping , https://apps.shopify.com/fillsell?locale=ko (via résultats de recherche)
- TikTok : https://www.tiktok.com/@fill.sell (aucun profil renvoyé) ; https://www.tiktok.com/@fillsell.app (profil « FillSell », 813 abonnés)
- Bing France (`curl`, requêtes « fillsell », « fillsell crosslisting », `site:fillsell.app`) : https://www.bing.com/search?q=fillsell&setlang=fr&cc=FR
- fillsell.com : **non joignable** depuis ce poste (WebFetch `ECONNREFUSED`, curl délai dépassé).
